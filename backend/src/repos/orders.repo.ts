import { pool } from "../db/pool.js";
import { orderInputSchema, type OrderInput } from "./schemas.js";
import type { OrderListItem, OrderRow, OrderType } from "@avihay-books/shared";

/**
 * מזמיני מלאי (`inventory`) ללא לקוח: מאחדים לשורת `pending` קיימת (כולל ניקוי כפילויות ישנות),
 * במקום ליצור שורה נפרדת לכל העברה מרשימת החוסרים.
 */
export async function appendToPendingInventoryOrder(input: OrderInput): Promise<OrderRow> {
  const v = orderInputSchema.parse(input);
  if (v.order_type !== "inventory") {
    return upsertOrder(input);
  }

  const manualTitle =
    v.book_id != null ? null : v.manual_book_title?.trim() ? v.manual_book_title.trim() : null;

  const { rows: candidates } = v.book_id
    ? await pool.query<OrderRow>(
        `SELECT * FROM orders
         WHERE book_id = $1 AND supplier_id = $2 AND order_type = 'inventory'
           AND customer_name IS NULL AND customer_phone IS NULL
           AND status = 'pending'
         ORDER BY created_at ASC`,
        [v.book_id, v.supplier_id],
      )
    : await pool.query<OrderRow>(
        `SELECT * FROM orders
         WHERE book_id IS NULL AND supplier_id = $1 AND order_type = 'inventory'
           AND customer_name IS NULL AND customer_phone IS NULL
           AND manual_book_title IS NOT DISTINCT FROM $2
           AND status = 'pending'
         ORDER BY created_at ASC`,
        [v.supplier_id, manualTitle],
      );

  if (candidates.length === 0) {
    return upsertOrder(input);
  }

  const keep = candidates[0]!;
  const sumExisting = candidates.reduce((s, c) => s + c.quantity, 0);
  const totalQty = sumExisting + v.quantity;

  const duplicateIds = candidates.slice(1).map((c) => c.id);
  if (duplicateIds.length > 0) {
    await pool.query(`DELETE FROM orders WHERE id = ANY($1::uuid[])`, [duplicateIds]);
  }

  const { rows } = await pool.query<OrderRow>(
    `UPDATE orders SET quantity = $1 WHERE id = $2 RETURNING *`,
    [totalQty, keep.id],
  );
  return rows[0]!;
}

export async function upsertOrder(input: OrderInput): Promise<OrderRow> {
  const v = orderInputSchema.parse(input);
  const bookId = v.book_id ?? null;
  const manualTitle =
    bookId != null ? null : (v.manual_book_title?.trim() ? v.manual_book_title.trim() : null);
  const manualAuthor =
    bookId != null ? null : (v.manual_book_author?.trim() ? v.manual_book_author.trim() : null);
  const sql = `
    INSERT INTO orders (
      id, book_id, supplier_id, order_type, quantity,
      customer_name, customer_phone, manual_book_title, manual_book_author, status
    )
    VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET
      book_id = EXCLUDED.book_id,
      supplier_id = EXCLUDED.supplier_id,
      order_type = EXCLUDED.order_type,
      quantity = EXCLUDED.quantity,
      customer_name = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      manual_book_title = EXCLUDED.manual_book_title,
      manual_book_author = EXCLUDED.manual_book_author,
      status = EXCLUDED.status
    RETURNING *`;
  const { rows } = await pool.query<OrderRow>(sql, [
    v.id ?? null,
    bookId,
    v.supplier_id,
    v.order_type,
    v.quantity,
    v.customer_name ?? null,
    v.customer_phone ?? null,
    manualTitle,
    manualAuthor,
    v.status,
  ]);
  return rows[0]!;
}

export async function findAllOrders(filter: { type?: OrderType } = {}): Promise<OrderRow[]> {
  if (filter.type) {
    const { rows } = await pool.query<OrderRow>(
      "SELECT * FROM orders WHERE order_type = $1 ORDER BY created_at DESC",
      [filter.type],
    );
    return rows;
  }
  const { rows } = await pool.query<OrderRow>("SELECT * FROM orders ORDER BY created_at DESC");
  return rows;
}

/**
 * הזמנות משולבות עם פרטי ספר וספק — הבסיס למסך `orders.tsx`.
 * תמיכה בסינון לפי `order_type` כדי להזין את שלוש לשוניות ההזמנות.
 */
export interface OrdersLineMatch {
  book_id: string | null;
  supplier_id: string;
  order_type: OrderType;
  customer_name: string | null;
  customer_phone: string | null;
  manual_book_title: string | null;
}

/** מוחק את כל השורות התואמות לשורת תצוגה אחת (לאחר איחוד כפילויות בלקוח). */
export async function deleteOrdersMatchingLine(match: OrdersLineMatch): Promise<number> {
  const result = await pool.query(
    `DELETE FROM orders
      WHERE book_id IS NOT DISTINCT FROM $1
        AND supplier_id = $2
        AND order_type = $3
        AND customer_name IS NOT DISTINCT FROM $4
        AND customer_phone IS NOT DISTINCT FROM $5
        AND manual_book_title IS NOT DISTINCT FROM $6`,
    [
      match.book_id,
      match.supplier_id,
      match.order_type,
      match.customer_name,
      match.customer_phone,
      match.manual_book_title,
    ],
  );
  return result.rowCount ?? 0;
}

export async function findAllOrdersExpanded(
  filter: { type?: OrderType } = {},
): Promise<OrderListItem[]> {
  const params: unknown[] = [];
  let where = "";
  if (filter.type) {
    params.push(filter.type);
    where = "WHERE o.order_type = $1";
  }
  const { rows } = await pool.query<OrderListItem>(
    `SELECT o.id, o.book_id, o.supplier_id, o.order_type, o.quantity,
            o.customer_name, o.customer_phone, o.manual_book_title, o.manual_book_author,
            o.status, o.created_at,
            COALESCE(b.title, o.manual_book_title, '') AS book_title,
            COALESCE(b.author, o.manual_book_author, '') AS book_author,
            CASE WHEN o.book_id IS NULL THEN '—' ELSE b.price::text END AS book_price,
            s.name        AS supplier_name,
            s.color_hex   AS supplier_color,
            s.email       AS supplier_email
       FROM orders o
       LEFT JOIN books b ON b.id = o.book_id
       JOIN suppliers s ON s.id = o.supplier_id
       ${where}
       ORDER BY o.created_at DESC`,
    params,
  );
  return rows;
}
