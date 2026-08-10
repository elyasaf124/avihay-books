import { upsertNotification } from "../../repos/notifications.repo.js";
import { getBotConfig } from "../../repos/botConfig.repo.js";
import { sendChatPush } from "../push.js";
import type { WhatsappSession } from "@avihay-books/shared";
import { sendText } from "./client.js";
import { generateFreeChatSummary } from "./summarizer.js";

interface ChatPushArgs {
  title: string;
  body: string;
  phone: string;
}

const testPushLog: ChatPushArgs[] = [];

/** לבדיקות בלבד — רושם קריאות Push במקום שליחה ל-Expo. */
export function resetTestPushLog(): void {
  testPushLog.length = 0;
}

export function getTestPushLog(): readonly ChatPushArgs[] {
  return testPushLog;
}

async function dispatchPush(args: ChatPushArgs): Promise<void> {
  if (process.env.WHATSAPP_TEST_PUSH_SPY === "true") {
    testPushLog.push(args);
    return;
  }
  await sendChatPush(args).catch(() => undefined);
}

/** נרמול מספר לפורמט ספרות בינלאומי (050… → 97250…). */
function normalizeWhatsappDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `972${digits.slice(1)}`;
  return digits;
}

/** האם השיחה במצב מענה אנושי פעיל (הבוט מושהה). */
export function isActiveHumanHandover(session: WhatsappSession | null | undefined): boolean {
  if (!session || session.status !== "human_handover") return false;
  if (!session.bot_paused_until) return false;
  return new Date(session.bot_paused_until).getTime() > Date.now();
}

/** יוצר התראה במסך ההתראות + Push לטלפון + הודעת ווטסאפ למנהל עם סיכום ולינק מהיר. */
export async function notifyWhatsappHumanHandover(args: {
  phone?: string;
  profileName?: string | null;
  message: string;
  pushBody?: string;
}): Promise<void> {
  await upsertNotification({
    type: "whatsapp_human_handover",
    message: args.message,
    is_read: false,
  });

  const body = (args.pushBody ?? args.message).slice(0, 120);
  await dispatchPush({
    title: args.profileName ?? args.phone ?? "נועם הספר",
    body,
    phone: args.phone ?? "",
  });

  // שליחת הודעת ווטסאפ ישירה למספר המנהל (מתוך פרטי החנות בקונפיג הבוט)
  const botConfig = await getBotConfig();
  const adminPhone = normalizeWhatsappDigits(botConfig.store_info.admin_phone ?? "");
  if (adminPhone) {
    const rawPhone = args.phone ?? "";
    const cleanPhone = rawPhone.replace(/\D/g, "");
    const customerName = args.profileName ? args.profileName : (rawPhone || "לקוח");
    const summary = rawPhone ? await generateFreeChatSummary(rawPhone) : "אין פירוט הודעות.";
    const startMsgText = encodeURIComponent(`שלום ${customerName}, בהמשך לפנייתך...`);
    const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${startMsgText}` : "";

    const adminText =
      `🚨 *בקשת מענה אנושי חדשה*\n\n` +
      `👤 *לקוח:* ${customerName}\n` +
      `📱 *טלפון:* +${cleanPhone}\n\n` +
      `📝 *הודעות אחרונות מהלקוח:*\n${summary}\n\n` +
      (waLink ? `🔗 *לחץ לפתיחת צ'אט ישיר בווטסאפ:*\n${waLink}` : "");

    await sendText(adminPhone, adminText).catch(() => undefined);
  }
}

/** Push על הודעה נכנסת בזמן מענה אנושי (לא כניסה ראשונה). */
export async function sendOngoingHandoverPush(args: {
  phone: string;
  profileName: string | null;
  preview: string;
}): Promise<void> {
  await dispatchPush({
    title: args.profileName ?? args.phone,
    body: args.preview.slice(0, 120),
    phone: args.phone,
  });
}
