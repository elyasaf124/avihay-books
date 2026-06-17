/**
 * תיבת הצ'אט של העובד באפליקציה — קריאת שיחות/היסטוריה, שליחת מענה אנושי
 * דרך WhatsApp Cloud API, סימון נקרא, ושידור real-time ב-SSE.
 */
import { Router } from "express";
import { asyncHandler, HttpError } from "../middleware/errorHandler.js";
import {
  countUnreadChat,
  deleteConversationByPhone,
  getMessages,
  listConversations,
  markConversationRead,
} from "../repos/whatsappMessages.repo.js";
import { findSessionByPhone } from "../repos/whatsappSessions.repo.js";
import { sendText } from "../services/whatsapp/client.js";
import { endHumanHandover, handleStaffEcho } from "../services/whatsapp/engine.js";
import { isWhatsappConfigured } from "../services/whatsapp/config.js";
import { isActiveHumanHandover } from "../services/whatsapp/handoverPush.js";
import { broadcast, subscribe } from "../services/chatBus.js";
import type { ChatMessageView } from "@avihay-books/shared";

export const chatRouter = Router();

/** חלון 24 השעות של Meta לשליחת טקסט חופשי (service window). */
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

chatRouter.get(
  "/conversations",
  asyncHandler(async (_req, res) => {
    res.json(await listConversations());
  }),
);

chatRouter.get(
  "/unread-count",
  asyncHandler(async (_req, res) => {
    res.json({ count: await countUnreadChat() });
  }),
);

chatRouter.get(
  "/stream",
  asyncHandler(async (_req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.write(": connected\n\n");

    subscribe(res);

    const keepAlive = setInterval(() => {
      res.write(": ping\n\n");
    }, 25_000);
    res.on("close", () => clearInterval(keepAlive));
  }),
);

chatRouter.get(
  "/:phone/messages",
  asyncHandler(async (req, res) => {
    const phone = req.params.phone!;
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? "50"), 10) || 50, 100);
    const before = typeof req.query.before === "string" ? req.query.before : null;
    res.json(await getMessages(phone, limit, before));
  }),
);

chatRouter.post(
  "/:phone/read",
  asyncHandler(async (req, res) => {
    const phone = req.params.phone!;
    await markConversationRead(phone);
    broadcast({ type: "conversation_update", phone });
    res.status(204).end();
  }),
);

chatRouter.post(
  "/:phone/send",
  asyncHandler(async (req, res) => {
    const phone = req.params.phone!;
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (text.length === 0) {
      throw new HttpError(400, "text is required");
    }
    if (!isWhatsappConfigured()) {
      throw new HttpError(503, "whatsapp_not_configured");
    }

    // חלון 24 שעות: מחוץ לחלון Meta דוחה טקסט חופשי — חוסמים עם שגיאה ברורה.
    const session = await findSessionByPhone(phone);
    const lastInbound = session?.last_inbound_at ? new Date(session.last_inbound_at).getTime() : 0;
    if (!lastInbound || Date.now() - lastInbound > SERVICE_WINDOW_MS) {
      throw new HttpError(409, "outside_service_window");
    }

    await sendText(phone, text);
    // השהיית הבוט: מענה אנושי תופס פיקוד (כמו echo מאפליקציית WhatsApp Business).
    await handleStaffEcho(phone);

    broadcast({ type: "message", phone });

    const latest = await getMessages(phone, 1);
    const message: ChatMessageView = latest[0] ?? {
      id: "pending",
      direction: "out",
      msg_type: "text",
      body: text,
      is_echo: false,
      created_at: new Date().toISOString(),
    };
    res.status(201).json({ ok: true, message });
  }),
);

chatRouter.post(
  "/:phone/end-handover",
  asyncHandler(async (req, res) => {
    const phone = req.params.phone!;
    if (!isWhatsappConfigured()) {
      throw new HttpError(503, "whatsapp_not_configured");
    }

    const session = await findSessionByPhone(phone);
    if (!session || !isActiveHumanHandover(session)) {
      throw new HttpError(409, "not_in_handover");
    }

    await endHumanHandover(phone, session, "staff");
    broadcast({ type: "conversation_update", phone });
    broadcast({ type: "message", phone });
    res.status(204).end();
  }),
);

chatRouter.delete(
  "/:phone",
  asyncHandler(async (req, res) => {
    const phone = req.params.phone!;
    await deleteConversationByPhone(phone);
    broadcast({ type: "conversation_update", phone });
    res.status(204).end();
  }),
);
