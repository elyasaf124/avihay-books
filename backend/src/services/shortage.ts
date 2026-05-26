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
import type { OrderRow, OrderType, ShortageItem } from "@avihay-books/shared";

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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lockedBook = await client.query<{ id: string }>(
      "SELECT id FROM books WHERE id = $1 FOR UPDATE",
      [input.bookId],
    );
    if ((lockedBook.rowCount ?? 0) < 1) {
      throw new HttpError(404, "book_not_found");
    }

    if (input.locationId) {
      const chk = await client.query<{ book_id: string }>(
        "SELECT book_id FROM book_locations WHERE id = $1",
        [input.locationId],
      );
      const loc = chk.rows[0];
      if (!loc) throw new HttpError(404, "location_not_found");
      if (loc.book_id !== input.bookId) throw new HttpError(400, "location_book_mismatch");
    }

    const stockRes = await client.query(
      `UPDATE books SET stock_quantity = GREATEST(stock_quantity - $2, 0) WHERE id = $1`,
      [input.bookId, sold],
    );
    if ((stockRes.rowCount ?? 0) < 1) {
      throw new HttpError(500, "book_update_failed");
    }

    const shortageRes = await client.query<ShortageItem>(
      `INSERT INTO shortage_list (book_id, status, location_id)
       VALUES ($1, 'shortage', $2)
       RETURNING *`,
      [input.bookId, input.locationId ?? null],
    );
    const shortage = shortageRes.rows[0];
    if (!shortage) throw new HttpError(500, "shortage_insert_failed");

    await client.query("COMMIT");

    const updatedBook = await findBookById(input.bookId);
    if (updatedBook) {
      await notifyLowStockAfterBookChange(
        { ...updatedBook, stock_quantity: updatedBook.stock_quantity + sold },
        updatedBook,
      );
    }

    return shortage;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      /* best-effort */
    });
    throw err;
  } finally {
    client.release();
  }
}
