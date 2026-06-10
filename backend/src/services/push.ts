/**
 * שליחת התראות Push דרך שירות Expo Push (https://exp.host) — חינמי, ללא מפתח שרת.
 * נשלח לכל מכשירי העובדים הרשומים ב-`push_tokens`. נתוני `data.phone` מאפשרים
 * deep-link לשיחה כשהעובד מקיש על ההתראה.
 */
import { logger } from "../utils/logger.js";
import { deletePushToken, listPushTokens } from "../repos/pushTokens.repo.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
}

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/** שולח התראה לכל המכשירים הרשומים. שקט ביחס לשגיאות (לא חוסם את ה-webhook). */
export async function sendChatPush(args: {
  title: string;
  body: string;
  phone: string;
}): Promise<void> {
  const tokens = await listPushTokens();
  if (tokens.length === 0) return;

  const messages: PushMessage[] = tokens.map((to) => ({
    to,
    title: args.title,
    body: args.body,
    data: { kind: "chat", phone: args.phone },
    sound: "default",
    priority: "high",
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: ExpoTicket[] };
    if (!res.ok) {
      logger.warn({ status: res.status, json }, "[push] expo push send failed");
      return;
    }
    await pruneInvalidTokens(tokens, json.data ?? []);
  } catch (err) {
    logger.warn({ err }, "[push] expo push send error");
  }
}

/** מסיר טוקנים שהוחזרו כ-DeviceNotRegistered כדי לא לשלוח אליהם שוב. */
async function pruneInvalidTokens(tokens: string[], tickets: ExpoTicket[]): Promise<void> {
  await Promise.all(
    tickets.map(async (ticket, i) => {
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        const token = tokens[i];
        if (token) await deletePushToken(token).catch(() => undefined);
      }
    }),
  );
}
