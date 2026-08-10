import { pool } from "../db/pool.js";
import { shortageInputSchema, type ShortageInput } from "./schemas.js";
import type { ShortageItem, ShortageListItem, ShortageStatus } from "@avihay-books/shared";

export async function upsertShortage(input: ShortageInput): Promise<ShortageItem> {
  const v = shortageInputSchema.parse(input);
  const sql = `
    INSERT INTO shortage_list (id, book_id, added_at, status, resolved_at, location_id)
    VALUES (COALESCE($1, gen_random_uuid()), $2, COALESCE($3::timestamptz, now()), $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      book_id = EXCLUDED.book_id,
      added_at = EXCLUDED.added_at,
      status = EXCLUDED.status,
      resolved_at = EXCLUDED.resolved_at,
      location_id = COALESCE(EXCLUDED.location_id, shortage_list.location_id)
    RETURNING *`;
  const { rows } = await pool.query<ShortageItem>(sql, [
    v.id ?? null,
    v.book_id,
    v.added_at ?? null,
    v.status,
    v.resolved_at ?? null,
    v.location_id ?? null,
  ]);
  return rows[0]!;
}

export async function findAllShortages(): Promise<ShortageItem[]> {
  const { rows } = await pool.query<ShortageItem>(
    "SELECT * FROM shortage_list ORDER BY added_at DESC",
  );
  return rows;
}

export async function findShortageById(id: string): Promise<ShortageItem | null> {
  const { rows } = await pool.query<ShortageItem>("SELECT * FROM shortage_list WHERE id = $1", [
    id,
  ]);
  return rows[0] ?? null;
}

export async function deleteShortageById(id: string): Promise<boolean> {
  const r = await pool.query("DELETE FROM shortage_list WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * ביטול חוסר במדף לפי מיקום («חזרה למדף»):
 * מוחק רשומת חוסר אחת (האחרונה), מחזיר עותק אחד ל־`quantity_in_cell` ו־1 ל־`stock_quantity`.
 * אם נמכרו כמה עותקים מאותו מיקום — כל ביטול מחזיר עותק בודד.
 */
export async function deleteActiveShortageByLocationId(locationId: string): Promise<{
  deleted: boolean;
  stillPending: boolean;
  quantityInCell: number;
} | null> {
  const { rows } = await pool.query<{
    location_id: string;
    quantity_in_cell: number;
    still_pending: boolean;
  }>(
    `WITH del AS (
       DELETE FROM shortage_list
        WHERE id = (
          SELECT id
            FROM shortage_list
           WHERE location_id = $1::uuid
             AND status = 'shortage'
           ORDER BY added_at DESC
           LIMIT 1
        )
       RETURNING book_id
     ),
     restored_loc AS (
       UPDATE book_locations bl
          SET quantity_in_cell = bl.quantity_in_cell + 1
         WHERE bl.id = $1::uuid
           AND EXISTS (SELECT 1 FROM del)
       RETURNING bl.id, bl.quantity_in_cell
     ),
     restored_book AS (
       UPDATE books b
          SET stock_quantity = b.stock_quantity + 1
         FROM del d
        WHERE b.id = d.book_id
       RETURNING b.id
     )
     SELECT
       rl.id AS location_id,
       rl.quantity_in_cell,
       EXISTS (
         SELECT 1
           FROM shortage_list sl
          WHERE sl.location_id = $1::uuid
            AND sl.status <> 'completed'
       ) AS still_pending
       FROM restored_loc rl`,
    [locationId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    deleted: true,
    stillPending: Boolean(row.still_pending),
    quantityInCell: row.quantity_in_cell,
  };
}

/**
 * רשימת חוסרים משולבת עם פרטי ספר וספק — הבסיס למסך `app/shortage.tsx`.
 * מקובץ לפי `book_id` + `cell_id` (תאים שונים = כרטיסים נפרדים).
 * רק מצב `shortage`: פריט שהועבר להזמנה (`order_pending`) או נסגר (`completed`)
 * לא מוצגים כאן (מעקב ההזמנה במסך הזמנות).
 * גם ספר עם הזמנה פתוחה (`pending`/`sent`) מוסתר — גם אם הסטטוס עדיין `shortage`.
 */
export async function findAllShortagesExpanded(): Promise<ShortageListItem[]> {
  const { rows } = await pool.query<ShortageListItem>(
    `WITH open_rows AS (
       SELECT sl.id,
              sl.book_id,
              sl.location_id,
              sl.added_at,
              sl.status,
              sl.resolved_at,
              bl.cell_id,
              c.cell_name
         FROM shortage_list sl
         LEFT JOIN book_locations bl ON bl.id = sl.location_id
         LEFT JOIN cells c ON c.id = bl.cell_id
        WHERE sl.status = 'shortage'
          AND NOT EXISTS (
            SELECT 1 FROM orders o
             WHERE o.book_id = sl.book_id
               AND o.status IN ('pending', 'sent')
          )
     ),
     ranked AS (
       SELECT o.*,
              COUNT(*) OVER (PARTITION BY o.book_id, o.cell_id) AS missing_count,
              ROW_NUMBER() OVER (
                PARTITION BY o.book_id, o.cell_id
                ORDER BY o.added_at DESC
              ) AS rn
         FROM open_rows o
     )
     SELECT r.id,
            r.book_id,
            r.location_id,
            r.cell_id,
            r.cell_name,
            r.missing_count::int AS missing_count,
            r.added_at,
            r.status,
            r.resolved_at,
            b.title          AS book_title,
            b.author         AS book_author,
            b.stock_quantity AS book_stock_quantity,
            b.reorder_threshold AS book_reorder_threshold,
            b.price::text    AS book_price,
            s.id             AS supplier_id,
            s.name           AS supplier_name,
            s.color_hex      AS supplier_color,
            s.email          AS supplier_email
       FROM ranked r
       JOIN books     b ON b.id = r.book_id
       JOIN suppliers s ON s.id = b.supplier_id
      WHERE r.rn = 1
      ORDER BY r.added_at DESC`,
  );
  return rows;
}

/**
 * מוחק עד `quantity` רשומות חוסר פתוחות באותה קבוצה (ספר + תא) כמו `id`.
 * בלי החזרת מלאי — כמו מחיקה ממסך החוסרים.
 */
export async function deleteShortagesInGroupById(
  id: string,
  quantity: number,
): Promise<{ deletedCount: number }> {
  const { rows } = await pool.query<{ deleted_count: number }>(
    `WITH seed AS (
       SELECT sl.book_id, bl.cell_id
         FROM shortage_list sl
         LEFT JOIN book_locations bl ON bl.id = sl.location_id
        WHERE sl.id = $1::uuid
     ),
     targets AS (
       SELECT sl.id
         FROM shortage_list sl
         LEFT JOIN book_locations bl ON bl.id = sl.location_id
         JOIN seed s ON s.book_id = sl.book_id
          AND bl.cell_id IS NOT DISTINCT FROM s.cell_id
        WHERE sl.status = 'shortage'
        ORDER BY sl.added_at ASC
        LIMIT $2::int
     ),
     del AS (
       DELETE FROM shortage_list sl
        WHERE sl.id IN (SELECT t.id FROM targets t)
       RETURNING sl.id
     )
     SELECT COUNT(*)::int AS deleted_count FROM del`,
    [id, quantity],
  );
  return { deletedCount: rows[0]?.deleted_count ?? 0 };
}

export async function updateShortageStatus(
  id: string,
  status: ShortageStatus,
): Promise<ShortageItem | null> {
  const resolvedExpr =
    status === "completed" ? "now()" : status === "shortage" ? "NULL" : "resolved_at";
  const { rows } = await pool.query<ShortageItem>(
    `UPDATE shortage_list
        SET status = $2,
            resolved_at = ${resolvedExpr}
      WHERE id = $1
      RETURNING *`,
    [id, status],
  );
  return rows[0] ?? null;
}

/** מעבר להזמנה: כל הרשומות ב־`shortage` לאותו ספר מסומנות יחד (אין השלמה חלקית של כפילויות). */
export async function updateShortagesWhereBookAndStatus(
  bookId: string,
  fromStatus: ShortageStatus,
  toStatus: ShortageStatus,
): Promise<ShortageItem[]> {
  const resolvedExpr =
    toStatus === "completed" ? "now()" : toStatus === "shortage" ? "NULL" : "resolved_at";
  const { rows } = await pool.query<ShortageItem>(
    `UPDATE shortage_list
        SET status = $3,
            resolved_at = ${resolvedExpr}
      WHERE book_id = $1 AND status = $2
      RETURNING *`,
    [bookId, fromStatus, toStatus],
  );
  return rows;
}

/** אחרי יצירת הזמנה פתוחה — מסתיר את החוסרים של הספר מרשימת החוסרים. */
export async function markBookShortagesAsOrderPending(bookId: string): Promise<ShortageItem[]> {
  return updateShortagesWhereBookAndStatus(bookId, "shortage", "order_pending");
}

/**
 * אחרי מחיקת הזמנה — מחזיר חוסרים ל־`shortage` רק אם לא נותרו הזמנות פתוחות לספר.
 * שומר על טשטוש מדף (`order_pending` נשאר כשיש עדיין הזמנה פתוחה אחרת).
 */
export async function restoreBookShortagesIfNoOpenOrders(bookId: string): Promise<ShortageItem[]> {
  const { rows } = await pool.query<ShortageItem>(
    `UPDATE shortage_list
        SET status = 'shortage',
            resolved_at = NULL
      WHERE book_id = $1
        AND status = 'order_pending'
        AND NOT EXISTS (
          SELECT 1 FROM orders o
           WHERE o.book_id = $1
             AND o.status IN ('pending', 'sent')
        )
      RETURNING *`,
    [bookId],
  );
  return rows;
}
