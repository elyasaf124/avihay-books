import { pool } from "../db/pool.js";
import { orderInputSchema, type OrderInput } from "./schemas.js";
import type {
  DeliveryMethod,
  FulfillmentType,
  OrderListItem,
  OrderRow,
  OrderStatus,
  OrderType,
} from "@avihay-books/shared";
import type { PoolClient } from "pg";

/** קלט יצירת הזמנת וואטסאפ מקובצת (ענף 2 בבוט): פרטי לקוח/מימוש + שורות ספרים. */
export interface WhatsappOrderGroupInput {
  customer_name: string;
  customer_phone: string;
  fulfillment_type: FulfillmentType;
  delivery_method?: DeliveryMethod | null;
  delivery_fee?: number | null;
  address?: string | null;
  notes?: string | null;
  lines: { title: string; author?: string | null; quantity: number }[];
}

/**
 * יוצר שורת `orders` אחת לכל ספר, כולן עם אותו `order_group_id`, `order_type='whatsapp'`.
 * הספרים נשמרים ככותרת ידנית (`manual_book_title`) — קליטה חופשית מהשיחה, ללא קטלוג.
 */
export async function createWhatsappOrderGroup(
  input: WhatsappOrderGroupInput,
): Promise<{ groupId: string; orders: OrderRow[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: idRows } = await client.query<{ id: string }>(
      "SELECT gen_random_uuid() AS id",
    );
    const groupId = idRows[0]!.id;
    const created: OrderRow[] = [];
    for (const line of input.lines) {
      const title = line.title.trim();
      if (title.length === 0) continue;
      const { rows } = await client.query<OrderRow>(
        `INSERT INTO orders (
           book_id, supplier_id, order_type, quantity,
           customer_name, customer_phone, manual_book_title, manual_book_author, status,
           fulfillment_type, delivery_method, delivery_fee, address, notes, order_group_id
         )
         VALUES (NULL, NULL, 'whatsapp', $1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          Math.max(1, Math.trunc(line.quantity)),
          input.customer_name,
          input.customer_phone,
          title,
          line.author?.trim() ? line.author.trim() : null,
          input.fulfillment_type,
          input.delivery_method ?? null,
          input.delivery_fee ?? null,
          input.address ?? null,
          input.notes ?? null,
          groupId,
        ],
      );
      created.push(rows[0]!);
    }
    await client.query("COMMIT");
    return { groupId, orders: created };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** הזמנה בודדת משולבת עם פרטי הספר — לשליחת עדכון ללקוח (template). */
export async function findOrderExpandedById(id: string): Promise<OrderListItem | null> {
  const { rows } = await pool.query<OrderListItem>(
    `SELECT o.id, o.book_id, o.supplier_id, o.order_type, o.quantity,
            o.customer_name, o.customer_phone, o.manual_book_title, o.manual_book_author,
            o.status, o.created_at,
            o.fulfillment_type, o.delivery_method, o.delivery_fee::text AS delivery_fee,
            o.address, o.notes, o.order_group_id,
            COALESCE(b.title, o.manual_book_title, '') AS book_title,
            COALESCE(b.author, o.manual_book_author, '') AS book_author,
            CASE WHEN o.book_id IS NULL THEN '—' ELSE b.price::text END AS book_price,
            b.supplier_id AS catalog_supplier_id,
            COALESCE(s.name, '')        AS supplier_name,
            COALESCE(s.color_hex, '')   AS supplier_color,
            COALESCE(s.email, '')       AS supplier_email
       FROM orders o
       LEFT JOIN books b ON b.id = o.book_id
       LEFT JOIN suppliers s ON s.id = o.supplier_id
      WHERE o.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

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
    v.supplier_id ?? null,
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
  supplier_id: string | null;
  order_type: OrderType;
  customer_name: string | null;
  customer_phone: string | null;
  manual_book_title: string | null;
}

/** מוחק את כל השורות התואמות לשורת תצוגה אחת (לאחר איחוד כפילויות בלקוח). */
export async function deleteOrdersMatchingLine(match: OrdersLineMatch): Promise<number> {
  const customerName = match.customer_name?.trim() ?? null;
  const customerPhone = match.customer_phone?.trim() ?? null;
  const manualTitle = match.manual_book_title?.trim() ?? null;
  const result = await pool.query(
    `DELETE FROM orders
      WHERE book_id IS NOT DISTINCT FROM $1
        AND supplier_id IS NOT DISTINCT FROM $2
        AND order_type = $3
        AND TRIM(COALESCE(customer_name, '')) IS NOT DISTINCT FROM TRIM(COALESCE($4::text, ''))
        AND TRIM(COALESCE(customer_phone, '')) IS NOT DISTINCT FROM TRIM(COALESCE($5::text, ''))
        AND TRIM(COALESCE(manual_book_title, '')) IS NOT DISTINCT FROM TRIM(COALESCE($6::text, ''))`,
    [
      match.book_id,
      match.supplier_id,
      match.order_type,
      customerName,
      customerPhone,
      manualTitle,
    ],
  );
  return result.rowCount ?? 0;
}

/** מעביר שורות שהושלמו לארכיון (הסרה מרשימה פעילה, שמירה בהיסטוריה). */
export async function archiveOrdersMatchingLine(match: OrdersLineMatch): Promise<number> {
  const customerName = match.customer_name?.trim() ?? null;
  const customerPhone = match.customer_phone?.trim() ?? null;
  const manualTitle = match.manual_book_title?.trim() ?? null;
  const result = await pool.query(
    `UPDATE orders SET status = 'archived'
      WHERE book_id IS NOT DISTINCT FROM $1
        AND supplier_id IS NOT DISTINCT FROM $2
        AND order_type = $3
        AND TRIM(COALESCE(customer_name, '')) IS NOT DISTINCT FROM TRIM(COALESCE($4::text, ''))
        AND TRIM(COALESCE(customer_phone, '')) IS NOT DISTINCT FROM TRIM(COALESCE($5::text, ''))
        AND TRIM(COALESCE(manual_book_title, '')) IS NOT DISTINCT FROM TRIM(COALESCE($6::text, ''))
        AND status = 'completed'`,
    [
      match.book_id,
      match.supplier_id,
      match.order_type,
      customerName,
      customerPhone,
      manualTitle,
    ],
  );
  return result.rowCount ?? 0;
}

/** מעדכן סטטוס לכל השורות התואמות לשורת תצוגה אחת (לאחר איחוד כפילויות בלקוח). */
export async function updateOrdersMatchingLineStatus(
  match: OrdersLineMatch,
  status: Extract<OrderStatus, "pending" | "sent">,
): Promise<number> {
  const customerName = match.customer_name?.trim() ?? null;
  const customerPhone = match.customer_phone?.trim() ?? null;
  const manualTitle = match.manual_book_title?.trim() ?? null;
  const result = await pool.query(
    `UPDATE orders SET status = $7
      WHERE book_id IS NOT DISTINCT FROM $1
        AND supplier_id IS NOT DISTINCT FROM $2
        AND order_type = $3
        AND TRIM(COALESCE(customer_name, '')) IS NOT DISTINCT FROM TRIM(COALESCE($4::text, ''))
        AND TRIM(COALESCE(customer_phone, '')) IS NOT DISTINCT FROM TRIM(COALESCE($5::text, ''))
        AND TRIM(COALESCE(manual_book_title, '')) IS NOT DISTINCT FROM TRIM(COALESCE($6::text, ''))
        AND status NOT IN ('completed', 'archived')`,
    [
      match.book_id,
      match.supplier_id,
      match.order_type,
      customerName,
      customerPhone,
      manualTitle,
      status,
    ],
  );
  return result.rowCount ?? 0;
}

/** מעדכן סטטוס לכל הזמנות פתוחות של ספק (מלאi + לקוח + וואטסאפ). */
export async function updateOrdersBySupplierStatus(
  supplierId: string | null,
  status: Extract<OrderStatus, "pending" | "sent">,
): Promise<number> {
  const result = await pool.query(
    `UPDATE orders SET status = $2
      WHERE supplier_id IS NOT DISTINCT FROM $1
        AND order_type IN ('inventory', 'customer', 'whatsapp')
        AND status NOT IN ('completed', 'archived')`,
    [supplierId, status],
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
            o.fulfillment_type, o.delivery_method, o.delivery_fee::text AS delivery_fee,
            o.address, o.notes, o.order_group_id,
            COALESCE(b.title, o.manual_book_title, '') AS book_title,
            COALESCE(b.author, o.manual_book_author, '') AS book_author,
            CASE WHEN o.book_id IS NULL THEN '—' ELSE b.price::text END AS book_price,
            b.supplier_id AS catalog_supplier_id,
            COALESCE(s.name, '')        AS supplier_name,
            COALESCE(s.color_hex, '')   AS supplier_color,
            COALESCE(s.email, '')       AS supplier_email
       FROM orders o
       LEFT JOIN books b ON b.id = o.book_id
       LEFT JOIN suppliers s ON s.id = o.supplier_id
       ${where}
       ORDER BY o.created_at DESC`,
    params,
  );
  return rows;
}

type Queryable = Pick<PoolClient, "query">;

/** הזמנות פתוחות לספר, ממוינות לפי עדיפות מימוש (לקוח → וואטסאפ → מלאi). */
export async function findOpenOrdersForBook(
  bookId: string,
  client: Queryable = pool,
): Promise<OrderRow[]> {
  const { rows } = await client.query<OrderRow>(
    `SELECT * FROM orders
     WHERE book_id = $1 AND status IN ('pending', 'sent')
     ORDER BY
       CASE order_type
         WHEN 'customer' THEN 0
         WHEN 'whatsapp' THEN 1
         ELSE 2
       END,
       created_at ASC`,
    [bookId],
  );
  return rows;
}

export async function completeOrder(id: string, client: Queryable = pool): Promise<void> {
  await client.query(`UPDATE orders SET status = 'completed' WHERE id = $1`, [id]);
}

export async function updateOrderQuantity(
  id: string,
  quantity: number,
  client: Queryable = pool,
): Promise<void> {
  await client.query(`UPDATE orders SET quantity = $1 WHERE id = $2`, [quantity, id]);
}

/** מפחית כמות ומאפס סימון «הוזמן» — לשימוש בריקונסיליאציית מלאi חלקית. */
export async function updateOrderQuantityAndResetPending(
  id: string,
  quantity: number,
  client: Queryable = pool,
): Promise<void> {
  await client.query(`UPDATE orders SET quantity = $1, status = 'pending' WHERE id = $2`, [
    quantity,
    id,
  ]);
}

export async function deleteOrderById(id: string, client: Queryable = pool): Promise<void> {
  await client.query(`DELETE FROM orders WHERE id = $1`, [id]);
}
