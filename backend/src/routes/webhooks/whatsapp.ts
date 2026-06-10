/**
 * Webhook של WhatsApp Cloud API.
 *   GET  — אימות מנוי (`hub.verify_token`).
 *   POST — קליטת הודעות נכנסות + מענה אנושי (smb_message_echoes), עם אימות חתימת
 *          `X-Hub-Signature-256` מול `WHATSAPP_APP_SECRET`.
 *
 * הראוטר רשום *לפני* `apiKeyAuth` (מטא לא שולח `x-api-key`); ההגנה היא חתימת הבקשה.
 */
import { Router, type Request } from "express";
import crypto from "node:crypto";
import { logger } from "../../utils/logger.js";
import { getWhatsappConfig } from "../../services/whatsapp/config.js";
import { handleIncomingMessage, handleStaffEcho } from "../../services/whatsapp/engine.js";
import { logWhatsappMessage } from "../../repos/whatsappMessages.repo.js";
import { upsertNotification } from "../../repos/notifications.repo.js";
import { broadcast } from "../../services/chatBus.js";
import { sendChatPush } from "../../services/push.js";

export const whatsappWebhookRouter = Router();

whatsappWebhookRouter.get("/", (req, res) => {
  const cfg = getWhatsappConfig();
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === cfg.verifyToken) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }
  res.sendStatus(403);
});

function verifySignature(req: Request): boolean {
  const cfg = getWhatsappConfig();
  if (!cfg.appSecret) return true; // dev / not configured
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!raw) return false;
  const header = req.header("x-hub-signature-256") ?? "";
  const expected =
    "sha256=" + crypto.createHmac("sha256", cfg.appSecret).update(raw).digest("hex");
  try {
    return (
      header.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected))
    );
  } catch {
    return false;
  }
}

interface WaTextMessage {
  from: string;
  id?: string;
  type: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  button?: { payload?: string; text?: string };
}

interface WaValue {
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: WaTextMessage[];
  message_echoes?: { from?: string; to?: string; id?: string; type?: string }[];
  smb_message_echoes?: { from?: string; to?: string; id?: string; type?: string }[];
  statuses?: unknown[];
  phone_number?: string;
  event?: string;
  disconnection_info?: { reason?: string; initiated_by?: string };
  history?: unknown[];
  state_sync?: unknown[];
}

interface WaChange {
  field?: string;
  value?: WaValue;
}

interface WaBody {
  object?: string;
  entry?: { id?: string; changes?: WaChange[] }[];
}

function parseInbound(msg: WaTextMessage): { replyId?: string; text?: string; msgType?: string } {
  if (msg.type === "interactive" && msg.interactive) {
    const reply = msg.interactive.button_reply ?? msg.interactive.list_reply;
    return { replyId: reply?.id, text: reply?.title, msgType: "interactive" };
  }
  if (msg.type === "button" && msg.button) {
    return { replyId: msg.button.payload, text: msg.button.text, msgType: "button" };
  }
  if (msg.type === "text") {
    return { text: msg.text?.body ?? "", msgType: "text" };
  }
  return { text: "", msgType: msg.type };
}

async function handleAccountUpdate(value: WaValue, wabaId?: string): Promise<void> {
  const event = value.event;
  if (!event) return;
  logger.info({ event, wabaId, value }, "[whatsapp] account_update webhook");

  if (event === "PARTNER_REMOVED" || event === "ACCOUNT_OFFBOARDED") {
    const reason = value.disconnection_info?.reason ?? event;
    const initiatedBy = value.disconnection_info?.initiated_by ?? "unknown";
    await upsertNotification({
      type: "whatsapp_human_handover",
      message: `ניתוק Coexistence מ-WhatsApp (${reason}, ${initiatedBy}). יש לחבר מחדש דרך /api/v1/whatsapp-onboard`,
      is_read: false,
    });
  } else if (event === "ACCOUNT_RECONNECTED") {
    logger.info({ wabaId }, "[whatsapp] coexistence account reconnected");
  }
}

async function processBody(body: WaBody): Promise<void> {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const field = change.field ?? "messages";
      const value = change.value ?? {};

      if (field === "account_update") {
        await handleAccountUpdate(value, entry.id);
        continue;
      }

      if (field === "history") {
        const chunks = value.history ?? [];
        logger.info(
          { wabaId: entry.id, chunks: chunks.length },
          "[whatsapp] history sync webhook (logged only)",
        );
        continue;
      }

      if (field === "smb_app_state_sync") {
        const contacts = value.state_sync ?? [];
        logger.info(
          { wabaId: entry.id, contacts: contacts.length },
          "[whatsapp] smb_app_state_sync webhook (logged only)",
        );
        continue;
      }

      const profileName = value.contacts?.[0]?.profile?.name ?? null;

      // מענה אנושי ידני מאפליקציית WhatsApp Business (Coexistence)
      const echoes = [
        ...(value.smb_message_echoes ?? []),
        ...(value.message_echoes ?? []),
      ];
      for (const echo of echoes) {
        const customer = echo.to;
        if (!customer) continue;
        await logWhatsappMessage({
          phone_number: customer,
          direction: "out",
          wa_message_id: echo.id ?? null,
          msg_type: echo.type ?? "text",
          is_echo: true,
          payload: echo,
        });
        await handleStaffEcho(customer);
        broadcast({ type: "message", phone: customer });
      }

      // הודעות נכנסות מלקוחות
      for (const msg of value.messages ?? []) {
        if (!msg.from) continue;
        const inbound = parseInbound(msg);
        await logWhatsappMessage({
          phone_number: msg.from,
          direction: "in",
          wa_message_id: msg.id ?? null,
          msg_type: msg.type,
          body: inbound.text ?? inbound.replyId ?? null,
          payload: msg,
        });
        await handleIncomingMessage({ from: msg.from, profileName, inbound });

        // עדכון real-time לתיבת הצ'אט + התראת Push למכשירי העובדים.
        broadcast({ type: "message", phone: msg.from });
        const preview = (inbound.text ?? inbound.replyId ?? "📎").slice(0, 120);
        await sendChatPush({
          title: profileName ?? msg.from,
          body: preview,
          phone: msg.from,
        }).catch((err: unknown) => {
          logger.warn({ err }, "[whatsapp] chat push failed");
        });
      }
    }
  }
}

whatsappWebhookRouter.post("/", (req, res) => {
  logger.info({ body: req.body }, "[whatsapp] webhook POST received");
  if (!verifySignature(req)) {
    logger.warn("[whatsapp] invalid webhook signature");
    res.sendStatus(403);
    return;
  }
  res.sendStatus(200);
  processBody((req.body ?? {}) as WaBody).catch((err: unknown) => {
    logger.error({ err }, "[whatsapp] webhook processing failed");
  });
});
