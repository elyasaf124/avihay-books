import { pool } from "../db/pool.js";
import type {
  ChatConversation,
  ChatMessageView,
  WhatsappMessage,
} from "@avihay-books/shared";

export interface LogMessageInput {
  phone_number: string;
  direction: "in" | "out";
  wa_message_id?: string | null;
  msg_type?: string;
  body?: string | null;
  payload?: unknown;
  is_echo?: boolean;
}

/** רושם הודעה נכנסת/יוצאת ללוג `whatsapp_messages` (ביקורת + זיהוי מענה אנושי). */
export async function logWhatsappMessage(input: LogMessageInput): Promise<WhatsappMessage> {
  const { rows } = await pool.query<WhatsappMessage>(
    `INSERT INTO whatsapp_messages (phone_number, direction, wa_message_id, msg_type, body, payload, is_echo)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '{}'::jsonb), $7)
     RETURNING *`,
    [
      input.phone_number,
      input.direction,
      input.wa_message_id ?? null,
      input.msg_type ?? "text",
      input.body ?? null,
      input.payload != null ? JSON.stringify(input.payload) : null,
      input.is_echo ?? false,
    ],
  );
  return rows[0]!;
}

/**
 * רשימת השיחות לתיבת הצ'אט באפליקציה — שורה אחת לכל מספר טלפון עם ההודעה האחרונה,
 * שם פרופיל/סטטוס מהשיחה האחרונה, וספירת הודעות נכנסות שטרם נקראו על-ידי העובד.
 */
export async function listConversations(): Promise<ChatConversation[]> {
  const { rows } = await pool.query<ChatConversation>(
    `WITH last_msg AS (
       SELECT DISTINCT ON (phone_number)
         phone_number, body, msg_type, direction, created_at
       FROM whatsapp_messages
       ORDER BY phone_number, created_at DESC
     ),
     sess AS (
       SELECT DISTINCT ON (phone_number)
         phone_number, profile_name, status, bot_paused_until, staff_last_read_at
       FROM whatsapp_sessions
       ORDER BY phone_number, created_at DESC
     ),
     unread AS (
       SELECT m.phone_number, COUNT(*)::int AS cnt
       FROM whatsapp_messages m
       LEFT JOIN sess s ON s.phone_number = m.phone_number
       WHERE m.direction = 'in'
         AND (s.staff_last_read_at IS NULL OR m.created_at > s.staff_last_read_at)
       GROUP BY m.phone_number
     )
     SELECT
       lm.phone_number,
       s.profile_name,
       s.status,
       (s.bot_paused_until IS NOT NULL AND s.bot_paused_until > now()) AS bot_paused,
       lm.body            AS last_message_body,
       lm.msg_type        AS last_message_type,
       lm.direction       AS last_message_direction,
       lm.created_at      AS last_message_at,
       COALESCE(u.cnt, 0) AS unread_count
     FROM last_msg lm
     LEFT JOIN sess s   ON s.phone_number = lm.phone_number
     LEFT JOIN unread u ON u.phone_number = lm.phone_number
     ORDER BY lm.created_at DESC`,
  );
  return rows;
}

/** היסטוריית הודעות של שיחה אחת (חדש→ישן), עם דפדוף לפי `before` (created_at). */
export async function getMessages(
  phone: string,
  limit = 50,
  before?: string | null,
): Promise<ChatMessageView[]> {
  const { rows } = await pool.query<ChatMessageView>(
    `SELECT id, direction, msg_type, body, is_echo, created_at
     FROM whatsapp_messages
     WHERE phone_number = $1
       AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
     ORDER BY created_at DESC
     LIMIT $3`,
    [phone, before ?? null, limit],
  );
  return rows;
}

/** ספירת ההודעות הנכנסות שטרם נקראו בכל השיחות — לתג שעל טאב הצ'אט. */
export async function countUnreadChat(): Promise<number> {
  const { rows } = await pool.query<{ cnt: number }>(
    `WITH sess AS (
       SELECT DISTINCT ON (phone_number) phone_number, staff_last_read_at
       FROM whatsapp_sessions
       ORDER BY phone_number, created_at DESC
     )
     SELECT COUNT(*)::int AS cnt
     FROM whatsapp_messages m
     LEFT JOIN sess s ON s.phone_number = m.phone_number
     WHERE m.direction = 'in'
       AND (s.staff_last_read_at IS NULL OR m.created_at > s.staff_last_read_at)`,
  );
  return rows[0]?.cnt ?? 0;
}

/** סימון כל ההודעות בשיחה כנקראו (מעדכן את כל רשומות השיחה של המספר). */
export async function markConversationRead(phone: string): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_sessions SET staff_last_read_at = now() WHERE phone_number = $1`,
    [phone],
  );
}
