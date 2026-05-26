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

/** ביטול חוסר במדף לפי מיקום — בלי שינוי מלאי (מחיקת רשומה בלבד). */
export async function deleteActiveShortageByLocationId(locationId: string): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM shortage_list WHERE location_id = $1 AND status = 'shortage'`,
    [locationId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * רשימת חוסרים משולבת עם פרטי ספר וספק — הבסיס למסך `app/shortage.tsx`.
 * רק מצב `shortage`: פריט שהועבר להזמנה (`order_pending`) או נסגר (`completed`)
 * לא מוצגים כאן (מעקב ההזמנה במסך הזמנות).
 */
export async function findAllShortagesExpanded(): Promise<ShortageListItem[]> {
  const { rows } = await pool.query<ShortageListItem>(
    `SELECT sl.id, sl.book_id, sl.location_id, sl.added_at, sl.status, sl.resolved_at,
            c.cell_name      AS cell_name,
            b.title          AS book_title,
            b.author         AS book_author,
            b.stock_quantity AS book_stock_quantity,
            b.reorder_threshold AS book_reorder_threshold,
            b.price::text    AS book_price,
            s.id             AS supplier_id,
            s.name           AS supplier_name,
            s.color_hex      AS supplier_color,
            s.email          AS supplier_email
       FROM shortage_list sl
       JOIN books     b ON b.id = sl.book_id
       JOIN suppliers s ON s.id = b.supplier_id
       LEFT JOIN book_locations bl ON bl.id = sl.location_id
       LEFT JOIN cells c ON c.id = bl.cell_id
      WHERE sl.status = 'shortage'
      ORDER BY sl.added_at DESC`,
  );
  return rows;
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
