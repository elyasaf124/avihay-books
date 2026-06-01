import { pool } from "../db/pool.js";
import type { WhatsappMessage } from "@avihay-books/shared";

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
