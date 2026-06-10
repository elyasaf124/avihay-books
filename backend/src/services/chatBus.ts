/**
 * אפיק SSE פשוט בזיכרון לשידור אירועי צ'אט ללקוחות מחוברים (האפליקציה).
 * משמש לעדכון real-time של רשימת השיחות ומסך השיחה כשמגיעה/נשלחת הודעה.
 *
 * אין persistence: אם אין מנויים, האירוע פשוט נזרק. האפליקציה ממילא מסתנכרנת
 * מחדש מה-REST כשהיא נפתחת, וה-Push מכסה מצב אפליקציה סגורה.
 */
import type { Response } from "express";
import { logger } from "../utils/logger.js";

export type ChatEvent =
  | { type: "message"; phone: string }
  | { type: "conversation_update"; phone: string };

const clients = new Set<Response>();

/** מוסיף תגובת SSE פתוחה לרשימת המנויים, ומסיר אותה כשהחיבור נסגר. */
export function subscribe(res: Response): void {
  clients.add(res);
  res.on("close", () => {
    clients.delete(res);
  });
}

/** משדר אירוע לכל המנויים המחוברים. */
export function broadcast(event: ChatEvent): void {
  if (clients.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch (err) {
      logger.warn({ err }, "[chatBus] failed writing to client");
      clients.delete(res);
    }
  }
}

/** מספר המנויים הפעילים (לאבחון). */
export function subscriberCount(): number {
  return clients.size;
}
