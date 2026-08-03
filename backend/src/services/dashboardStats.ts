import type { DashboardStats } from "@avihay-books/shared";
import { pool } from "../db/pool.js";

/**
 * מוני דשבורד בית — אותה לוגיקת איחוד שורות כמו `mergeOrderLinesForDisplay` במובייל:
 * inventory לפי ספק+ספר; customer/whatsapp לפי ספק+ספר+לקוח; status מאוחד = min rank.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const [ordersRes, shortageRes] = await Promise.all([
    pool.query<{ pending: string; sent: string }>(
      `WITH keyed AS (
         SELECT
           order_type,
           COALESCE(supplier_id::text, '') AS sid,
           CASE
             WHEN book_id IS NOT NULL THEN book_id::text
             ELSE 'm:' || COALESCE(manual_book_title, '')
           END AS book_key,
           CASE WHEN order_type = 'inventory' THEN '' ELSE COALESCE(customer_name, '') END AS cname,
           CASE WHEN order_type = 'inventory' THEN '' ELSE COALESCE(customer_phone, '') END AS cphone,
           CASE status
             WHEN 'pending' THEN 0
             WHEN 'sent' THEN 1
             WHEN 'completed' THEN 2
             ELSE 3
           END AS status_rank
         FROM orders
       ),
       merged AS (
         SELECT order_type, sid, book_key, cname, cphone, MIN(status_rank) AS status_rank
           FROM keyed
          GROUP BY order_type, sid, book_key, cname, cphone
       )
       SELECT
         COUNT(*) FILTER (WHERE status_rank = 0)::text AS pending,
         COUNT(*) FILTER (WHERE status_rank = 1)::text AS sent
         FROM merged
        WHERE status_rank IN (0, 1)`,
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM shortage_list WHERE status = 'shortage'`,
    ),
  ]);

  const pending = Number.parseInt(ordersRes.rows[0]?.pending ?? "0", 10) || 0;
  const sent = Number.parseInt(ordersRes.rows[0]?.sent ?? "0", 10) || 0;
  const shortageCount = Number.parseInt(shortageRes.rows[0]?.count ?? "0", 10) || 0;

  return {
    openOrders: {
      totalOpen: pending + sent,
      pending,
      sent,
    },
    shortageCount,
  };
}
