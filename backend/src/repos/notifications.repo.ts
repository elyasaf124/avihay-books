import { pool } from "../db/pool.js";
import { notificationInputSchema, type NotificationInput } from "./schemas.js";
import type { AppNotification, NotificationListItem, NotificationType } from "@avihay-books/shared";

export async function upsertNotification(input: NotificationInput): Promise<AppNotification> {
  const v = notificationInputSchema.parse(input);
  const sql = `
    INSERT INTO notifications (id, type, book_id, supplier_id, message, is_read)
    VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      type = EXCLUDED.type,
      book_id = EXCLUDED.book_id,
      supplier_id = EXCLUDED.supplier_id,
      message = EXCLUDED.message,
      is_read = EXCLUDED.is_read
    RETURNING *`;
  const { rows } = await pool.query<AppNotification>(sql, [
    v.id ?? null,
    v.type,
    v.book_id ?? null,
    v.supplier_id ?? null,
    v.message,
    v.is_read,
  ]);
  return rows[0]!;
}

export async function findAllNotifications(): Promise<AppNotification[]> {
  const { rows } = await pool.query<AppNotification>(
    "SELECT * FROM notifications ORDER BY created_at DESC",
  );
  return rows;
}

/**
 * רשימת התראות משולבת עם פרטי הספר והספק — הבסיס למסך `notifications.tsx`.
 * שדות `book_*`/`supplier_*` יחזרו `null` כאשר ההתראה לא קושרה לאותו `entity`,
 * וזה גם המצב כאשר רשומת הספר/הספק נמחקה (אנו עושים `LEFT JOIN`).
 */
export async function findAllNotificationsExpanded(): Promise<NotificationListItem[]> {
  const { rows } = await pool.query<NotificationListItem>(
    `SELECT n.id, n.type, n.book_id, n.supplier_id, n.message, n.is_read, n.created_at,
            b.title             AS book_title,
            b.author            AS book_author,
            b.stock_quantity    AS book_stock_quantity,
            b.reorder_threshold AS book_reorder_threshold,
            COALESCE(s.name, sb.name)            AS supplier_name,
            COALESCE(s.color_hex, sb.color_hex)  AS supplier_color
       FROM notifications n
       LEFT JOIN books     b  ON b.id  = n.book_id
       LEFT JOIN suppliers s  ON s.id  = n.supplier_id
       LEFT JOIN suppliers sb ON sb.id = b.supplier_id
      ORDER BY n.is_read ASC, n.created_at DESC`,
  );
  return rows;
}

export async function findUnreadNotificationCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM notifications WHERE is_read = FALSE",
  );
  return Number.parseInt(rows[0]!.count, 10);
}

export async function markNotificationRead(id: string): Promise<void> {
  await pool.query("UPDATE notifications SET is_read = TRUE WHERE id = $1", [id]);
}

export async function markAllNotificationsRead(): Promise<number> {
  const { rowCount } = await pool.query(
    "UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE",
  );
  return rowCount ?? 0;
}

export async function deleteNotification(id: string): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM notifications WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}

interface OpenNotificationFilter {
  type: NotificationType;
  book_id?: string | null;
  supplier_id?: string | null;
}

/**
 * בדיקת `dedup`: האם קיימת כבר התראה «פתוחה» (לא נקראה) באותו טיפוס וקישור.
 * שימוש: לפני יצירת התראה חדשה במחזור ה־`cron`, כדי לא להציף את המסך.
 */
export async function existsOpenNotification(filter: OpenNotificationFilter): Promise<boolean> {
  const conditions: string[] = ["type = $1", "is_read = FALSE"];
  const params: unknown[] = [filter.type];
  if (filter.book_id !== undefined) {
    if (filter.book_id === null) conditions.push("book_id IS NULL");
    else {
      params.push(filter.book_id);
      conditions.push(`book_id = $${params.length}`);
    }
  }
  if (filter.supplier_id !== undefined) {
    if (filter.supplier_id === null) conditions.push("supplier_id IS NULL");
    else {
      params.push(filter.supplier_id);
      conditions.push(`supplier_id = $${params.length}`);
    }
  }
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM notifications WHERE ${conditions.join(" AND ")}) AS exists`,
    params,
  );
  return rows[0]?.exists ?? false;
}
