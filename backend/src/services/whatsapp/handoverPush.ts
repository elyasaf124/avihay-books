import { upsertNotification } from "../../repos/notifications.repo.js";
import { sendChatPush } from "../push.js";
import type { WhatsappSession } from "@avihay-books/shared";

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

/** האם השיחה במצב מענה אנושי פעיל (הבוט מושהה). */
export function isActiveHumanHandover(session: WhatsappSession | null | undefined): boolean {
  if (!session || session.status !== "human_handover") return false;
  if (!session.bot_paused_until) return false;
  return new Date(session.bot_paused_until).getTime() > Date.now();
}

/** יוצר התראה במסך ההתראות + Push לטלפון (אירוע handover / הזמנה / תמיכה). */
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
