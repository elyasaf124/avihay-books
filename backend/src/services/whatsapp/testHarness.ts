/**
 * Test harness for WhatsApp bot integration tests.
 * Simulates inbound messages without Meta API quota; uses real DB for session/order verification.
 */
import type { Book, WhatsappSession } from "@avihay-books/shared";
import { pool } from "../../db/pool.js";
import { handleIncomingMessage, handleStaffEcho } from "./engine.js";
import {
  clearOutboundRecords,
  getOutboundRecords,
  type OutboundRecord,
} from "./outboundCapture.js";

let phoneCounter = 0;

export function uniqueTestPhone(): string {
  phoneCounter += 1;
  return `9725999${String(phoneCounter).padStart(4, "0")}`;
}

/** Israeli-style customer phone for order flows (unique per test run). */
export function uniqueCustomerPhone(): string {
  phoneCounter += 1;
  return `050${String(phoneCounter).padStart(7, "0")}`;
}

export function setupWhatsappTestEnv(): void {
  process.env.WHATSAPP_TEST_MOCK = "true";
  process.env.WHATSAPP_ENABLED = "true";
  process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "test-phone-id";
  process.env.WHATSAPP_WABA_ID = process.env.WHATSAPP_WABA_ID ?? "test-waba-id";
  process.env.WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? "test-token";
  process.env.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? "test-secret";
  process.env.WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "test-verify";
  process.env.WHATSAPP_GRAPH_VERSION = "v21.0";
  process.env.WHATSAPP_HANDOVER_TIMEOUT_MIN = "180";
}

export async function cleanupTestPhone(phone: string, customerPhone?: string): Promise<void> {
  await pool.query(`DELETE FROM whatsapp_messages WHERE phone_number = $1`, [phone]);
  await pool.query(`DELETE FROM whatsapp_sessions WHERE phone_number = $1`, [phone]);
  if (customerPhone) {
    await cleanupWhatsappOrdersByCustomerPhone(customerPhone);
  }
}

export async function resetPhone(phone: string): Promise<void> {
  await cleanupTestPhone(phone);
  clearOutboundRecords();
}

export async function sendInbound(
  phone: string,
  inbound: { text?: string; replyId?: string; msgType?: string },
  profileName: string | null = "Test User",
): Promise<OutboundRecord[]> {
  const before = getOutboundRecords().length;
  await handleIncomingMessage({
    from: phone,
    profileName,
    inbound: { text: inbound.text, replyId: inbound.replyId, msgType: inbound.msgType },
  });
  return getOutboundRecords().slice(before);
}

export async function getSession(phone: string): Promise<WhatsappSession | null> {
  const { rows } = await pool.query<WhatsappSession>(
    `SELECT * FROM whatsapp_sessions WHERE phone_number = $1 ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  return rows[0] ?? null;
}

export async function getInStockBook(): Promise<Book | null> {
  const { rows } = await pool.query<Book>(
    `SELECT * FROM books WHERE is_active = TRUE AND stock_quantity > 0 ORDER BY title LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function getOutOfStockBook(): Promise<Book | null> {
  const { rows } = await pool.query<Book>(
    `SELECT * FROM books WHERE is_active = TRUE AND stock_quantity <= 0 ORDER BY title LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function countWhatsappOrders(customerPhone: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM orders WHERE customer_phone = $1 AND order_type = 'whatsapp'`,
    [customerPhone],
  );
  return Number.parseInt(rows[0]?.n ?? "0", 10);
}

export async function cleanupWhatsappOrdersByCustomerPhone(customerPhone: string): Promise<void> {
  await pool.query(`DELETE FROM orders WHERE customer_phone = $1 AND order_type = 'whatsapp'`, [
    customerPhone,
  ]);
}

export async function countMessages(phone: string): Promise<{ in: number; out: number }> {
  const { rows } = await pool.query<{ direction: string; n: string }>(
    `SELECT direction, COUNT(*)::text AS n FROM whatsapp_messages WHERE phone_number = $1 GROUP BY direction`,
    [phone],
  );
  const counts = { in: 0, out: 0 };
  for (const r of rows) {
    if (r.direction === "in") counts.in = Number.parseInt(r.n, 10);
    if (r.direction === "out") counts.out = Number.parseInt(r.n, 10);
  }
  return counts;
}

export async function countNotificationsLike(pattern: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM notifications WHERE message ILIKE $1`,
    [`%${pattern}%`],
  );
  return Number.parseInt(rows[0]?.n ?? "0", 10);
}

export async function expireHandover(phone: string): Promise<void> {
  await pool.query(
    `UPDATE whatsapp_sessions SET bot_paused_until = now() - interval '1 minute' WHERE phone_number = $1`,
    [phone],
  );
}

export function setHumanHoursIncludingNow(): void {
  // Wide window: withinHumanHours uses h >= start && h < end
  process.env.WHATSAPP_HUMAN_HOURS = "0-24";
}

export function setHumanHoursExcludingNow(): void {
  const h = new Date().getHours();
  const start = (h + 10) % 24;
  const end = start === 23 ? 24 : (start + 1) % 24 || 24;
  process.env.WHATSAPP_HUMAN_HOURS = `${start}-${end}`;
}

export async function goToMainMenu(phone: string): Promise<void> {
  await sendInbound(phone, { text: "תפריט" });
}

export async function selectMenu(phone: string, menuId: string): Promise<OutboundRecord[]> {
  return sendInbound(phone, { replyId: menuId });
}

export async function staffEcho(phone: string): Promise<void> {
  await handleStaffEcho(phone);
}

export function assertSomeBodyContains(records: OutboundRecord[], substr: string): void {
  const found = records.some((r) => r.body.includes(substr));
  if (!found) {
    throw new Error(`Expected outbound containing "${substr}", got: ${records.map((r) => r.body).join(" | ")}`);
  }
}

export function assertLastMsgType(records: OutboundRecord[], msgType: string): void {
  const last = records[records.length - 1];
  if (!last || last.msgType !== msgType) {
    throw new Error(`Expected last msgType "${msgType}", got "${last?.msgType}"`);
  }
}

export async function dbAvailable(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
