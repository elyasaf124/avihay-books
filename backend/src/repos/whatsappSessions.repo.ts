import { pool } from "../db/pool.js";
import type { WhatsappSession, WhatsappSessionStatus } from "@avihay-books/shared";

/** מאתר את שיחת הוואטסאפ האחרונה של מספר טלפון (אחת לכל מספר בפועל). */
export async function findSessionByPhone(phone: string): Promise<WhatsappSession | null> {
  const { rows } = await pool.query<WhatsappSession>(
    `SELECT * FROM whatsapp_sessions WHERE phone_number = $1 ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  return rows[0] ?? null;
}

export async function createSession(
  phone: string,
  profileName: string | null,
): Promise<WhatsappSession> {
  const { rows } = await pool.query<WhatsappSession>(
    `INSERT INTO whatsapp_sessions (phone_number, profile_name, status, current_node, context, last_inbound_at, updated_at)
     VALUES ($1, $2, 'active', 'new', '{}'::jsonb, now(), now())
     RETURNING *`,
    [phone, profileName],
  );
  return rows[0]!;
}

export interface SessionPatch {
  status?: WhatsappSessionStatus;
  current_node?: string;
  context?: Record<string, unknown>;
  bot_paused_until?: Date | null;
  profile_name?: string | null;
  book_id?: string | null;
  order_id?: string | null;
  touchInbound?: boolean;
}

/** עדכון חלקי של רשומת השיחה. שדות שלא הועברו נשארים כפי שהם. */
export async function updateSession(id: string, patch: SessionPatch): Promise<WhatsappSession> {
  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [];
  let i = 1;

  if (patch.status !== undefined) {
    sets.push(`status = $${i++}`);
    params.push(patch.status);
  }
  if (patch.current_node !== undefined) {
    sets.push(`current_node = $${i++}`);
    params.push(patch.current_node);
  }
  if (patch.context !== undefined) {
    sets.push(`context = $${i++}::jsonb`);
    params.push(JSON.stringify(patch.context));
  }
  if (patch.bot_paused_until !== undefined) {
    sets.push(`bot_paused_until = $${i++}`);
    params.push(patch.bot_paused_until);
  }
  if (patch.profile_name !== undefined) {
    sets.push(`profile_name = $${i++}`);
    params.push(patch.profile_name);
  }
  if (patch.book_id !== undefined) {
    sets.push(`book_id = $${i++}`);
    params.push(patch.book_id);
  }
  if (patch.order_id !== undefined) {
    sets.push(`order_id = $${i++}`);
    params.push(patch.order_id);
  }
  if (patch.touchInbound) {
    sets.push("last_inbound_at = now()");
  }

  params.push(id);
  const { rows } = await pool.query<WhatsappSession>(
    `UPDATE whatsapp_sessions SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    params,
  );
  return rows[0]!;
}
