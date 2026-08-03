import { HttpError } from "../middleware/errorHandler.js";
import { pool } from "../db/pool.js";
import { findBookById } from "../repos/books.repo.js";
import { notifyLowStockAfterBookChange } from "./notifications.js";
import { appendToPendingInventoryOrder } from "../repos/orders.repo.js";
import {
  findShortageById,
  updateShortageStatus,
  updateShortagesWhereBookAndStatus,
} from "../repos/shortageList.repo.js";
import { logger } from "../utils/logger.js";
import type { Book, OrderRow, OrderType, ShortageItem } from "@avihay-books/shared";

interface MoveToOrderInput {
  shortageId: string;
  quantity?: number;
  orderType?: OrderType;
}

export interface MoveToOrderResult {
  shortage: ShortageItem;
  order: OrderRow;
}

/**
 * הופך חוסרים להזמנה (`inventory` כברירת מחדל):
 * 1. מאתר את רשומת החוסר ואת הספר המקושר.
 * 2. יוצר/מוסיף לשורת `orders` בספק של הספר.
 * 3. מסמן את **כל** רשומות `shortage` לאותו `book_id` כ־`order_pending`
 *    (מתאים לכפילויות בלי אילוץ ייחודי בטבלה).
 */
export async function moveShortageToOrder(input: MoveToOrderInput): Promise<MoveToOrderResult> {
  const shortage = await findShortageById(input.shortageId);
  if (!shortage) throw new HttpError(404, "shortage_not_found");

  const book = await findBookById(shortage.book_id);
  if (!book) throw new HttpError(404, "book_not_found");

  const fallbackQuantity = Math.max(book.reorder_threshold, 1);
  const quantity = input.quantity ?? fallbackQuantity;
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new HttpError(400, "invalid_quantity");
  }

  const order = await appendToPendingInventoryOrder({
    book_id: book.id,
    supplier_id: book.supplier_id,
    order_type: input.orderType ?? "inventory",
    quantity,
    status: "pending",
  });

  const updatedRows = await updateShortagesWhereBookAndStatus(book.id, "shortage", "order_pending");
  if (updatedRows.length === 0) throw new HttpError(500, "shortage_update_failed");

  const updated =
    updatedRows.find((r) => r.id === shortage.id) ?? updatedRows[0]!;
  return { shortage: updated, order };
}

/** סימון חוסר כהושלם — רק כשיש מלאי כללי לספר (מילוי מהמחסן). */
export async function completeShortage(shortageId: string): Promise<ShortageItem> {
  const shortage = await findShortageById(shortageId);
  if (!shortage) throw new HttpError(404, "shortage_not_found");

  const book = await findBookById(shortage.book_id);
  if (!book) throw new HttpError(404, "book_not_found");
  if (book.stock_quantity <= 0) throw new HttpError(400, "no_stock");

  const row = await updateShortageStatus(shortageId, "completed");
  if (!row) throw new HttpError(404, "shortage_not_found");
  return row;
}

export interface CreateShortageAfterShelfSaleInput {
  bookId: string;
  /** כמה עותקים נספרו במכירה / יציאה מהחנות (ירידת מלאי כללי). */
  soldQuantity: number;
  /** מיקום בשדרת המדף — נשמר לטשטוש ב־`/store-map`; השורה ב־`book_locations` לא נמחקת. */
  locationId?: string | null;
}

/**
 * אימות + הפחתת מלאי + יצירת החוסר בהצהרה אחת.
 *
 * הגרסה הקודמת עשתה 7 round trips סדרתיים (`BEGIN`, `SELECT ... FOR UPDATE`,
 * בדיקת מיקום, `UPDATE`, `INSERT`, `COMMIT`, ואז `findBookById`). כשה־API וה־DB
 * לא באותו אזור זה ~150ms כפול 8 רק בשביל לחיצה אחת על ספר.
 *
 * `guard` מחשב את תוצאות האימות, וה־`UPDATE`/`INSERT` מותנים בו — כך שכשהאימות
 * נכשל שום דבר לא נכתב, בלי צורך בטרנזקציה מפורשת (הצהרה בודדת היא אטומית).
 * אין `FOR UPDATE` כי `UPDATE` ממילא נועל את השורה ומחשב מחדש את הביטוי
 * מול הגרסה המעודכנת בהרצות מקבילות.
 */
const CREATE_SHELF_SHORTAGE_SQL = `
WITH before AS (
  SELECT * FROM books WHERE id = $1::uuid
),
loc AS (
  SELECT id, book_id FROM book_locations WHERE id = $2::uuid
),
guard AS (
  SELECT
    EXISTS (SELECT 1 FROM before) AS book_ok,
    CASE
      WHEN $2::uuid IS NULL THEN 'skipped'
      WHEN NOT EXISTS (SELECT 1 FROM loc) THEN 'missing'
      WHEN (SELECT book_id FROM loc) <> $1::uuid THEN 'mismatch'
      ELSE 'ok'
    END AS location_status
),
upd AS (
  UPDATE books b
     SET stock_quantity = GREATEST(b.stock_quantity - $3::int, 0)
    FROM guard g
   WHERE b.id = $1::uuid
     AND g.book_ok
     AND g.location_status IN ('ok', 'skipped')
  RETURNING b.*
),
ins AS (
  INSERT INTO shortage_list (book_id, status, location_id)
  SELECT $1::uuid, 'shortage', $2::uuid FROM upd
  RETURNING *
)
SELECT
  (SELECT g.book_ok FROM guard g)         AS book_ok,
  (SELECT g.location_status FROM guard g) AS location_status,
  (SELECT to_jsonb(b.*) FROM before b)    AS book_before,
  (SELECT to_jsonb(u.*) FROM upd u)       AS book_after,
  (SELECT to_jsonb(i.*) FROM ins i)       AS shortage
`;

interface ShelfShortageRow {
  book_ok: boolean;
  location_status: "ok" | "missing" | "mismatch" | "skipped";
  book_before: Book | null;
  book_after: Book | null;
  shortage: ShortageItem | null;
}

/**
 * חוסר אחרי מכירה מהמדף:
 * מפחיתים `stock_quantity`, יוצרים רשומת חוסר עם `location_id` (לא נוגעים ב־`book_locations`).
 * הטשטוש במפה נסמך על `/store-map` + `shortage_list` פעיל.
 */
export async function createShortageAfterShelfSale(
  input: CreateShortageAfterShelfSaleInput,
): Promise<ShortageItem> {
  const sold = input.soldQuantity;
  if (!Number.isFinite(sold) || sold < 1 || sold > 9999 || !Number.isInteger(sold)) {
    throw new HttpError(400, "invalid_quantity");
  }

  const { rows } = await pool.query<ShelfShortageRow>(CREATE_SHELF_SHORTAGE_SQL, [
    input.bookId,
    input.locationId ?? null,
    sold,
  ]);
  const row = rows[0];
  if (!row) throw new HttpError(500, "shortage_insert_failed");

  if (!row.book_ok) throw new HttpError(404, "book_not_found");
  if (row.location_status === "missing") throw new HttpError(404, "location_not_found");
  if (row.location_status === "mismatch") throw new HttpError(400, "location_book_mismatch");
  if (!row.book_after) throw new HttpError(500, "book_update_failed");
  if (!row.shortage) throw new HttpError(500, "shortage_insert_failed");

  /**
   * בדיקת התראת מלאי נמוך היא round trip נוסף שהמשתמש לא מחכה לו —
   * מוציאים אותה מהמסלול של התשובה.
   */
  const { book_before: bookBefore, book_after: bookAfter } = row;
  if (bookBefore) {
    setImmediate(() => {
      void notifyLowStockAfterBookChange(bookBefore, bookAfter).catch((err: unknown) => {
        logger.error({ err, bookId: bookAfter.id }, "low stock notification failed");
      });
    });
  }

  return row.shortage;
}
