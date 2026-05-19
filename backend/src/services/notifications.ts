import cron, { type ScheduledTask } from "node-cron";
import { pool } from "../db/pool.js";
import { existsOpenNotification, upsertNotification } from "../repos/notifications.repo.js";
import { logger } from "../utils/logger.js";
import type { AppNotification } from "@avihay-books/shared";

/**
 * שירות התראות (`Phase 5`):
 * מריץ שלוש בדיקות תקופתיות שיוצרות התראות חדשות ב־`notifications`:
 *
 *   1. `low_stock`              — מלאי נמוך מתחת לסף הזמנה (`stock_quantity <= reorder_threshold`).
 *   2. `remove_from_display`    — ספר חדש (`is_new = TRUE`) שעבר את חלון הזמן מאז `added_at`
 *      (ברירת מחדל חודש; ניתן לעקוף עם `REMOVE_FROM_DISPLAY_AFTER`, למשל `1 minute` לבדיקות).
 *   3. `supplier_reorder_reminder` — לא הוזמן מספק זה כבר שבועיים (`last_order_date < now() - 14d`).
 *
 * כל בדיקה לפני יצירת התראה בודקת שאין כבר התראה «פתוחה» מאותו טיפוס וקישור,
 * כדי לא להציף את המסך באותה הודעה כל מחזור (`existsOpenNotification`).
 */

interface LowStockRow {
  book_id: string;
  title: string;
  stock_quantity: number;
  reorder_threshold: number;
}

interface RemoveFromDisplayRow {
  book_id: string;
  title: string;
}

interface SupplierReorderRow {
  supplier_id: string;
  name: string;
  last_order_date: string | null;
}

export interface NotificationCheckSummary {
  low_stock_created: number;
  remove_from_display_created: number;
  /** כמה ספרים עמדו בתנאי הגיל (`is_new`, `added_at`, מחוץ לדה־דופ לרישומים חדשים) */
  remove_from_display_candidate_count: number;
  /** ערך ה־Postgres `interval` שבו השתמש השרת (מ־`REMOVE_FROM_DISPLAY_AFTER` או ברירת מחדל) */
  remove_from_display_after: string;
  supplier_reorder_reminder_created: number;
  ran_at: string;
}

const DEFAULT_REMOVE_FROM_DISPLAY_AFTER = "1 month";

function removeFromDisplayAfterInterval(): string {
  const raw = process.env.REMOVE_FROM_DISPLAY_AFTER?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_REMOVE_FROM_DISPLAY_AFTER;
}

async function findLowStockCandidates(): Promise<LowStockRow[]> {
  const { rows } = await pool.query<LowStockRow>(
    `SELECT id AS book_id, title, stock_quantity, reorder_threshold
       FROM books
      WHERE is_active = TRUE
        AND stock_quantity <= reorder_threshold`,
  );
  return rows;
}

async function findRemoveFromDisplayCandidates(): Promise<RemoveFromDisplayRow[]> {
  const after = removeFromDisplayAfterInterval();
  const { rows } = await pool.query<RemoveFromDisplayRow>(
    `SELECT id AS book_id, title
       FROM books
      WHERE is_active = TRUE
        AND is_new = TRUE
        AND added_at < now() - $1::interval`,
    [after],
  );
  return rows;
}

async function findSupplierReorderCandidates(): Promise<SupplierReorderRow[]> {
  const { rows } = await pool.query<SupplierReorderRow>(
    `SELECT id AS supplier_id, name, last_order_date::text AS last_order_date
       FROM suppliers
      WHERE last_order_date IS NULL
         OR last_order_date < now() - INTERVAL '14 days'`,
  );
  return rows;
}

export async function runLowStockJob(): Promise<AppNotification[]> {
  const created: AppNotification[] = [];
  for (const row of await findLowStockCandidates()) {
    const already = await existsOpenNotification({ type: "low_stock", book_id: row.book_id });
    if (already) continue;
    const message =
      `מלאי נמוך: "${row.title}" — נשארו ${row.stock_quantity} עותקים ` +
      `(סף הזמנה: ${row.reorder_threshold})`;
    created.push(
      await upsertNotification({
        type: "low_stock",
        book_id: row.book_id,
        message,
        is_read: false,
      }),
    );
  }
  return created;
}

export async function runRemoveFromDisplayJob(): Promise<{
  created: AppNotification[];
  candidateCount: number;
}> {
  const candidates = await findRemoveFromDisplayCandidates();
  const created: AppNotification[] = [];
  for (const row of candidates) {
    const already = await existsOpenNotification({
      type: "remove_from_display",
      book_id: row.book_id,
    });
    if (already) continue;
    const message = `הסר מחזית: "${row.title}" כבר חודש בארון התצוגה`;
    created.push(
      await upsertNotification({
        type: "remove_from_display",
        book_id: row.book_id,
        message,
        is_read: false,
      }),
    );
  }
  return { created, candidateCount: candidates.length };
}

export async function runSupplierReorderReminderJob(): Promise<AppNotification[]> {
  const created: AppNotification[] = [];
  for (const row of await findSupplierReorderCandidates()) {
    const already = await existsOpenNotification({
      type: "supplier_reorder_reminder",
      supplier_id: row.supplier_id,
    });
    if (already) continue;
    const message = row.last_order_date
      ? `תזכורת: לא הוזמן מהספק "${row.name}" כבר שבועיים`
      : `תזכורת: טרם הוזמן מהספק "${row.name}"`;
    created.push(
      await upsertNotification({
        type: "supplier_reorder_reminder",
        supplier_id: row.supplier_id,
        message,
        is_read: false,
      }),
    );
  }
  return created;
}

/** מריץ את שלוש הבדיקות ברצף ומחזיר סיכום של כמה התראות נוצרו לכל סוג. */
export async function runAllNotificationChecks(): Promise<NotificationCheckSummary> {
  const after = removeFromDisplayAfterInterval();
  const [lowStock, removeFromDisplay, supplierReorder] = await Promise.all([
    runLowStockJob(),
    runRemoveFromDisplayJob(),
    runSupplierReorderReminderJob(),
  ]);
  return {
    low_stock_created: lowStock.length,
    remove_from_display_created: removeFromDisplay.created.length,
    remove_from_display_candidate_count: removeFromDisplay.candidateCount,
    remove_from_display_after: after,
    supplier_reorder_reminder_created: supplierReorder.length,
    ran_at: new Date().toISOString(),
  };
}

/**
 * תזמון `cron` לבדיקות. ברירת המחדל: שלוש פעמים ביום (08:00, 13:00, 18:00).
 * ניתן לכבות ב־`.env` עם `DISABLE_NOTIFICATION_CRON=1` (שימושי בפיתוח/בדיקות).
 */
const DEFAULT_CRON = "0 8,13,18 * * *";

let scheduled: ScheduledTask | null = null;

export function startNotificationCrons(): void {
  if (process.env.DISABLE_NOTIFICATION_CRON === "1") {
    logger.info("notifications cron disabled via DISABLE_NOTIFICATION_CRON=1");
    return;
  }
  if (scheduled) return;

  const expression = process.env.NOTIFICATION_CRON ?? DEFAULT_CRON;
  if (!cron.validate(expression)) {
    logger.warn({ expression }, "invalid NOTIFICATION_CRON expression, falling back to default");
  }
  const safeExpression = cron.validate(expression) ? expression : DEFAULT_CRON;

  scheduled = cron.schedule(safeExpression, () => {
    runAllNotificationChecks().catch((err: unknown) => {
      logger.error({ err }, "notifications cron tick failed");
    });
  });

  logger.info({ expression: safeExpression }, "notifications cron scheduled");

  if (process.env.RUN_NOTIFICATION_CHECKS_ON_BOOT === "1") {
    runAllNotificationChecks().catch((err: unknown) => {
      logger.error({ err }, "notifications boot check failed");
    });
  }
}

export function stopNotificationCrons(): void {
  scheduled?.stop();
  scheduled = null;
}
