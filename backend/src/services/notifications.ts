import cron, { type ScheduledTask } from "node-cron";
import { pool } from "../db/pool.js";
import {
  deleteNotificationsOlderThan,
  existsOpenNotification,
  notificationRetentionInterval,
  upsertNotification,
  upsertOpenLowStockNotification,
} from "../repos/notifications.repo.js";
import { logger } from "../utils/logger.js";
import type { AppNotification, Book } from "@avihay-books/shared";

/**
 * שירות התראות (`Phase 5`):
 *
 *   `low_stock` — נוצר **מיידית** כשמלאי יורד לסף (`maybeNotifyLowStockForBook`), וגם ב-cron כגיבוי.
 *   שאר ההתראות — בדיקות תקופתיות שיוצרות רשומות חדשות ב־`notifications`:
 *
 *   1. `low_stock`              — `stock_quantity <= reorder_threshold` (cron כגיבוי).
 *   2. `remove_from_display`    — ספר חדש (`is_new = TRUE`) שעבר את חלון הזמן מאז `added_at`
 *      (ברירת מחדל חודש; ניתן לעקוף עם `REMOVE_FROM_DISPLAY_AFTER`, למשל `1 minute` לבדיקות).
 *   3. `supplier_reorder_reminder` — לא הוזמן מספק זה כבר שבועיים (`last_order_date < now() - 14d`).
 *   4. `orders_without_supplier` — הזמנות `pending` ללא `supplier_id` (יומי ב־08:00).
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
  orders_without_supplier_created: number;
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

function lowStockMessage(row: LowStockRow): string {
  return (
    `מלאי נמוך: "${row.title}" — נשארו ${row.stock_quantity} עותקים ` +
    `(סף הזמנה: ${row.reorder_threshold})`
  );
}

async function createLowStockNotificationIfNeeded(row: LowStockRow): Promise<AppNotification | null> {
  const already = await existsOpenNotification({ type: "low_stock", book_id: row.book_id });
  if (already) return null;
  return upsertOpenLowStockNotification({
    book_id: row.book_id,
    message: lowStockMessage(row),
  });
}

/**
 * התראת מלאi נמוך מיידית — אחרי ירידת מלאi, חציית סף, או הורדת סף הזמנה.
 * לא מופעל בהעלאת מלאi (גם אם עדיין מתחת לסף).
 */
export async function notifyLowStockAfterBookChange(
  before: Book,
  after: Book,
): Promise<AppNotification | null> {
  if (!after.is_active) return null;

  const stock = Number(after.stock_quantity);
  const threshold = Number(after.reorder_threshold);
  if (!Number.isFinite(stock) || !Number.isFinite(threshold)) return null;
  if (stock > threshold) return null;

  const beforeStock = Number(before.stock_quantity);
  const beforeThreshold = Number(before.reorder_threshold);
  const stockDecreased = stock < beforeStock;
  const stockIncreased = stock > beforeStock;
  const thresholdChanged = threshold !== beforeThreshold;
  const crossedIntoLow = beforeStock > beforeThreshold && stock <= threshold;

  if (stockIncreased) return null;
  if (!stockDecreased && !crossedIntoLow && !(thresholdChanged && stock <= threshold)) {
    return null;
  }

  return upsertOpenLowStockNotification({
    book_id: after.id,
    message: lowStockMessage({
      book_id: after.id,
      title: after.title,
      stock_quantity: stock,
      reorder_threshold: threshold,
    }),
  });
}

/** @deprecated Use notifyLowStockAfterBookChange — נשמר לתאימות. */
export async function maybeNotifyLowStockForBook(book: Book): Promise<AppNotification | null> {
  return notifyLowStockAfterBookChange(
    { ...book, stock_quantity: book.stock_quantity + 1 },
    book,
  );
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
    const notification = await createLowStockNotificationIfNeeded(row);
    if (notification) created.push(notification);
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

async function countPendingOrdersWithoutSupplier(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM orders
      WHERE supplier_id IS NULL
        AND status = 'pending'`,
  );
  return Number.parseInt(rows[0]!.count, 10);
}

export async function runOrdersWithoutSupplierJob(): Promise<AppNotification[]> {
  const count = await countPendingOrdersWithoutSupplier();
  if (count === 0) return [];

  const already = await existsOpenNotification({ type: "orders_without_supplier" });
  if (already) return [];

  const message =
    count === 1
      ? "יש הזמנה אחת שלא משויכת לספק — יש לשייך ספק לפני שליחה"
      : `יש ${count} הזמנות שלא משויכות לספק — יש לשייך ספק לפני שליחה`;

  return [
    await upsertNotification({
      type: "orders_without_supplier",
      message,
      is_read: false,
    }),
  ];
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

/** בדיקות תקופתיות (מלאי, חזית, תזכורת ספק) — ללא הזמנות ללא ספק. */
async function runPeriodicNotificationChecks(): Promise<
  Omit<NotificationCheckSummary, "orders_without_supplier_created" | "ran_at">
> {
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
  };
}

/** מריץ את כל הבדיקות (כולל הזמנות ללא ספק) — לשימוש ידני ב־`/run-checks`. */
export async function runAllNotificationChecks(): Promise<NotificationCheckSummary> {
  const [periodic, ordersWithoutSupplier] = await Promise.all([
    runPeriodicNotificationChecks(),
    runOrdersWithoutSupplierJob(),
  ]);
  return {
    ...periodic,
    orders_without_supplier_created: ordersWithoutSupplier.length,
    ran_at: new Date().toISOString(),
  };
}

export interface NotificationRetentionJobResult {
  deleted_count: number;
  retention: string;
  ran_at: string;
}

/** מוחק התראות ישנות מחלון ה-retention (ברירת מחדל: שבועיים). */
export async function runNotificationRetentionJob(): Promise<NotificationRetentionJobResult> {
  const retention = notificationRetentionInterval();
  const deleted_count = await deleteNotificationsOlderThan(retention);
  return { deleted_count, retention, ran_at: new Date().toISOString() };
}

/**
 * תזמון `cron` לבדיקות. ברירת המחדל: שלוש פעמים ביום (08:00, 13:00, 18:00).
 * ניתן לכבות ב־`.env` עם `DISABLE_NOTIFICATION_CRON=1` (שימושי בפיתוח/בדיקות).
 */
const DEFAULT_CRON = "0 8,13,18 * * *";
const DEFAULT_ORDERS_WITHOUT_SUPPLIER_CRON = "0 8 * * *";
const DEFAULT_NOTIFICATION_RETENTION_CRON = "0 3 * * *";

let scheduled: ScheduledTask | null = null;
let ordersWithoutSupplierScheduled: ScheduledTask | null = null;
let retentionScheduled: ScheduledTask | null = null;

export function startNotificationCrons(): void {
  if (process.env.DISABLE_NOTIFICATION_RETENTION_CRON !== "1" && !retentionScheduled) {
    const retentionExpression =
      process.env.NOTIFICATION_RETENTION_CRON ?? DEFAULT_NOTIFICATION_RETENTION_CRON;
    if (!cron.validate(retentionExpression)) {
      logger.warn(
        { expression: retentionExpression },
        "invalid NOTIFICATION_RETENTION_CRON expression, falling back to default",
      );
    }
    const safeRetentionCron = cron.validate(retentionExpression)
      ? retentionExpression
      : DEFAULT_NOTIFICATION_RETENTION_CRON;

    retentionScheduled = cron.schedule(safeRetentionCron, () => {
      runNotificationRetentionJob()
        .then((result) => {
          if (result.deleted_count > 0) {
            logger.info(result, "notification retention job completed");
          }
        })
        .catch((err: unknown) => {
          logger.error({ err }, "notification retention cron tick failed");
        });
    });

    logger.info(
      { expression: safeRetentionCron, retention: notificationRetentionInterval() },
      "notification retention cron scheduled",
    );

    if (process.env.RUN_NOTIFICATION_RETENTION_ON_BOOT === "1") {
      runNotificationRetentionJob().catch((err: unknown) => {
        logger.error({ err }, "notification retention boot job failed");
      });
    }
  } else if (process.env.DISABLE_NOTIFICATION_RETENTION_CRON === "1") {
    logger.info("notification retention cron disabled via DISABLE_NOTIFICATION_RETENTION_CRON=1");
  }

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
    runPeriodicNotificationChecks().catch((err: unknown) => {
      logger.error({ err }, "notifications cron tick failed");
    });
  });

  logger.info({ expression: safeExpression }, "notifications cron scheduled");

  const ordersCronExpression =
    process.env.ORDERS_WITHOUT_SUPPLIER_CRON ?? DEFAULT_ORDERS_WITHOUT_SUPPLIER_CRON;
  if (!cron.validate(ordersCronExpression)) {
    logger.warn(
      { expression: ordersCronExpression },
      "invalid ORDERS_WITHOUT_SUPPLIER_CRON expression, falling back to default",
    );
  }
  const safeOrdersCron = cron.validate(ordersCronExpression)
    ? ordersCronExpression
    : DEFAULT_ORDERS_WITHOUT_SUPPLIER_CRON;

  ordersWithoutSupplierScheduled = cron.schedule(safeOrdersCron, () => {
    runOrdersWithoutSupplierJob().catch((err: unknown) => {
      logger.error({ err }, "orders without supplier cron tick failed");
    });
  });

  logger.info(
    { expression: safeOrdersCron },
    "orders without supplier notification cron scheduled",
  );

  if (process.env.RUN_NOTIFICATION_CHECKS_ON_BOOT === "1") {
    runAllNotificationChecks().catch((err: unknown) => {
      logger.error({ err }, "notifications boot check failed");
    });
  }
}

export function stopNotificationCrons(): void {
  scheduled?.stop();
  scheduled = null;
  ordersWithoutSupplierScheduled?.stop();
  ordersWithoutSupplierScheduled = null;
  retentionScheduled?.stop();
  retentionScheduled = null;
}
