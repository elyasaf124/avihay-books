/**
 * עטיפת `WhatsApp Cloud API` (Graph API) לשליחת הודעות יוצאות.
 * כל שליחה נרשמת ללוג `whatsapp_messages` (direction='out').
 */
import { logger } from "../../utils/logger.js";
import { logWhatsappMessage } from "../../repos/whatsappMessages.repo.js";
import { getWhatsappConfig, isWhatsappConfigured } from "./config.js";
import { captureOutbound } from "./outboundCapture.js";

const MAX_BUTTON_TITLE = 20;
const MAX_ROW_TITLE = 24;
const MAX_ROW_DESC = 72;

function clamp(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export interface ReplyButton {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

async function send(payload: Record<string, unknown>, logBody: string, msgType: string): Promise<void> {
  const cfg = getWhatsappConfig();
  const to = String(payload.to ?? "");
  if (!isWhatsappConfigured(cfg)) {
    logger.warn({ to, msgType }, "[whatsapp] not configured — skipping outbound send");
    return;
  }
  const fullPayload = { messaging_product: "whatsapp", ...payload };
  const mockMode = (process.env.WHATSAPP_TEST_MOCK ?? "").toLowerCase() === "true";

  if (mockMode) {
    captureOutbound({ to, msgType, body: logBody, payload: fullPayload });
    await logWhatsappMessage({
      phone_number: to,
      direction: "out",
      wa_message_id: `mock-${Date.now()}`,
      msg_type: msgType,
      body: logBody,
      payload: fullPayload,
    });
    return;
  }

  const url = `https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fullPayload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: unknown;
    };
    if (!res.ok) {
      logger.error({ status: res.status, error: data.error, to }, "[whatsapp] send failed");
    }
    await logWhatsappMessage({
      phone_number: to,
      direction: "out",
      wa_message_id: data.messages?.[0]?.id ?? null,
      msg_type: msgType,
      body: logBody,
      payload: fullPayload,
    });
  } catch (err) {
    logger.error({ err, to }, "[whatsapp] send error");
  }
}

export async function sendText(to: string, body: string): Promise<void> {
  await send({ to, type: "text", text: { body, preview_url: true } }, body, "text");
}

export async function sendReplyButtons(
  to: string,
  body: string,
  buttons: ReplyButton[],
): Promise<void> {
  const action = {
    buttons: buttons.slice(0, 3).map((b) => ({
      type: "reply",
      reply: { id: b.id, title: clamp(b.title, MAX_BUTTON_TITLE) },
    })),
  };
  await send(
    { to, type: "interactive", interactive: { type: "button", body: { text: body }, action } },
    body,
    "interactive.button",
  );
}

export async function sendListMessage(
  to: string,
  body: string,
  buttonLabel: string,
  rows: ListRow[],
  header?: string,
): Promise<void> {
  const interactive: Record<string, unknown> = {
    type: "list",
    body: { text: body },
    action: {
      button: clamp(buttonLabel, MAX_BUTTON_TITLE),
      sections: [
        {
          rows: rows.slice(0, 10).map((r) => ({
            id: r.id,
            title: clamp(r.title, MAX_ROW_TITLE),
            ...(r.description ? { description: clamp(r.description, MAX_ROW_DESC) } : {}),
          })),
        },
      ],
    },
  };
  if (header) interactive.header = { type: "text", text: clamp(header, 60) };
  await send({ to, type: "interactive", interactive }, body, "interactive.list");
}

export async function sendDocument(
  to: string,
  link: string,
  filename: string,
  caption?: string,
): Promise<void> {
  await send(
    { to, type: "document", document: { link, filename, ...(caption ? { caption } : {}) } },
    caption ?? filename,
    "document",
  );
}

export async function sendCtaUrl(
  to: string,
  body: string,
  displayText: string,
  url: string,
): Promise<void> {
  await send(
    {
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: body },
        action: { name: "cta_url", parameters: { display_text: clamp(displayText, MAX_BUTTON_TITLE), url } },
      },
    },
    `${body} (${url})`,
    "interactive.cta_url",
  );
}

export interface TemplateOptions {
  bodyParams?: string[];
  /** פרמטר טקסט לכפתור URL דינמי (sub_type=url, index=0). */
  urlButtonParam?: string;
}

export async function sendTemplate(
  to: string,
  templateName: string,
  langCode: string,
  opts: TemplateOptions = {},
): Promise<void> {
  const components: Record<string, unknown>[] = [];
  if (opts.bodyParams && opts.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: opts.bodyParams.map((text) => ({ type: "text", text })),
    });
  }
  if (opts.urlButtonParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: opts.urlButtonParam }],
    });
  }
  await send(
    {
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: langCode },
        ...(components.length > 0 ? { components } : {}),
      },
    },
    `template:${templateName}`,
    "template",
  );
}
