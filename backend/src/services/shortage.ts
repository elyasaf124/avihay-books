import { HttpError } from "../middleware/errorHandler.js";
import { pool } from "../db/pool.js";
import { findBookById } from "../repos/books.repo.js";
import { appendToPendingInventoryOrder } from "../repos/orders.repo.js";
import {
  findShortageById,
  updateShortagesWhereBookAndStatus,
} from "../repos/shortageList.repo.js";
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

/**
 * השלמת חוסר = מילוי מהמחסן חזרה למדף/תצוגה:
 * 1. מאתר את קבוצת הספר+תא של `shortageId` ובוחר עד `quantity` רשומות ישנות ביותר.
 * 2. דורש `unplaced >= quantity` (`stock - on_shelf`).
 * 3. מעלה `quantity_in_cell` לפי `location_id` של כל רשומה (בלי לשנות מלאי כולל).
 * 4. מסמן את הרשומות כ־`completed`.
 */
export async function completeShortage(
  shortageId: string,
  quantity = 1,
): Promise<ShortageItem> {
  if (!Number.isFinite(quantity) || quantity < 1 || !Number.isInteger(quantity)) {
    throw new HttpError(400, "invalid_quantity");
  }

  const { rows } = await pool.query<{
    seed_ok: boolean;
    book_ok: boolean;
    target_count: number;
    unplaced: number;
    location_missing: boolean;
    shortage: ShortageItem | null;
  }>(
    `WITH seed AS (
       SELECT sl.book_id, bl.cell_id
         FROM shortage_list sl
         LEFT JOIN book_locations bl ON bl.id = sl.location_id
        WHERE sl.id = $1::uuid
     ),
     targets AS (
       SELECT sl.*
         FROM shortage_list sl
         LEFT JOIN book_locations bl ON bl.id = sl.location_id
         JOIN seed s ON s.book_id = sl.book_id
          AND bl.cell_id IS NOT DISTINCT FROM s.cell_id
        WHERE sl.status = 'shortage'
        ORDER BY sl.added_at ASC
        LIMIT $2::int
     ),
     stock AS (
       SELECT b.id AS book_id,
              b.stock_quantity,
              COALESCE(SUM(bl.quantity_in_cell), 0)::int AS on_shelf
         FROM seed s
         JOIN books b ON b.id = s.book_id
         LEFT JOIN book_locations bl ON bl.book_id = b.id
        GROUP BY b.id, b.stock_quantity
     ),
     guard AS (
       SELECT
         EXISTS (SELECT 1 FROM seed) AS seed_ok,
         EXISTS (SELECT 1 FROM stock) AS book_ok,
         (SELECT COUNT(*)::int FROM targets) AS target_count,
         COALESCE(
           (SELECT s.stock_quantity - s.on_shelf FROM stock s),
           0
         ) AS unplaced,
         EXISTS (
           SELECT 1 FROM targets t
            WHERE t.location_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM book_locations bl WHERE bl.id = t.location_id
              )
         ) AS location_missing
     ),
     loc_counts AS (
       SELECT t.location_id, COUNT(*)::int AS cnt
         FROM targets t
         CROSS JOIN guard g
        WHERE t.location_id IS NOT NULL
          AND g.seed_ok
          AND g.book_ok
          AND NOT g.location_missing
          AND g.target_count = $2::int
          AND g.unplaced >= $2::int
        GROUP BY t.location_id
     ),
     loc_upd AS (
       UPDATE book_locations bl
          SET quantity_in_cell = bl.quantity_in_cell + lc.cnt
         FROM loc_counts lc
        WHERE bl.id = lc.location_id
       RETURNING bl.id
     ),
     done AS (
       UPDATE shortage_list sl
          SET status = 'completed',
              resolved_at = now()
         FROM targets t, guard g
        WHERE sl.id = t.id
          AND g.seed_ok
          AND g.book_ok
          AND NOT g.location_missing
          AND g.target_count = $2::int
          AND g.unplaced >= $2::int
          AND (
            NOT EXISTS (SELECT 1 FROM targets x WHERE x.location_id IS NOT NULL)
            OR EXISTS (SELECT 1 FROM loc_upd)
          )
       RETURNING sl.*
     )
     SELECT
       g.seed_ok,
       g.book_ok,
       g.target_count,
       g.unplaced,
       g.location_missing,
       (
         SELECT to_jsonb(d)
           FROM (SELECT * FROM done ORDER BY added_at DESC LIMIT 1) d
       ) AS shortage
       FROM guard g`,
    [shortageId, quantity],
  );

  const row = rows[0];
  if (!row) throw new HttpError(500, "shortage_update_failed");
  if (!row.seed_ok) throw new HttpError(404, "shortage_not_found");
  if (!row.book_ok) throw new HttpError(404, "book_not_found");
  if (row.target_count === 0) {
    const existing = await findShortageById(shortageId);
    if (!existing) throw new HttpError(404, "shortage_not_found");
    if (existing.status === "completed") return existing;
    throw new HttpError(404, "shortage_not_found");
  }
  if (row.target_count < quantity) throw new HttpError(400, "invalid_quantity");
  if (row.location_missing) throw new HttpError(404, "location_not_found");
  if (row.unplaced < quantity) throw new HttpError(400, "no_stock");
  if (!row.shortage) throw new HttpError(500, "shortage_update_failed");
  return row.shortage;
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
loc_upd AS (
  UPDATE book_locations bl
     SET quantity_in_cell = GREATEST(bl.quantity_in_cell - $3::int, 0)
    FROM guard g
   WHERE bl.id = $2::uuid
     AND g.location_status = 'ok'
     AND EXISTS (SELECT 1 FROM upd)
  RETURNING bl.id
),
ins AS (
  INSERT INTO shortage_list (book_id, status, location_id)
  SELECT
    $1::uuid,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM orders o
         WHERE o.book_id = $1::uuid
           AND o.status IN ('pending', 'sent')
      ) THEN 'order_pending'::shortage_status
      ELSE 'shortage'::shortage_status
    END,
    $2::uuid
  FROM upd
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
 * מפחיתים `stock_quantity` ואת `quantity_in_cell` במיקום (עותק אחד פחות על המדף),
 * ויוצרים רשומת חוסר עם `location_id` (רשומה לכל מכירה — כדי ש«חזרה למדף» תשחזר עותק בודד).
 * אם לספר כבר יש הזמנה פתוחה — הסטטוס נשמר כ־`order_pending` (לא מופיע ברשימת חוסרים).
 * הטשטוש במפה: שדרת־חוסר אחת כל עוד יש חוסר פתוח למיקום; עותקים שנותרו נשארים רגילים.
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

  return row.shortage;
}

export interface EnsureShortageForEmptyCellInput {
  bookId: string;
  locationId: string;
}

/**
 * כשכמות בתא יורדת ל־0 (למשל קאונטר בדף הסרה/עדכון) — יוצרים חוסר עם `location_id`
 * בלי להפחית מלאי שוב. אם כבר יש חוסר פתוח למיקום — no-op.
 */
export async function ensureShortageForEmptyCell(
  input: EnsureShortageForEmptyCellInput,
): Promise<ShortageItem | null> {
  const { rows } = await pool.query<ShortageItem>(
    `INSERT INTO shortage_list (book_id, status, location_id)
     SELECT
       $1::uuid,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM orders o
            WHERE o.book_id = $1::uuid
              AND o.status IN ('pending', 'sent')
         ) THEN 'order_pending'::shortage_status
         ELSE 'shortage'::shortage_status
       END,
       $2::uuid
     WHERE EXISTS (
       SELECT 1 FROM book_locations bl
        WHERE bl.id = $2::uuid AND bl.book_id = $1::uuid
     )
       AND NOT EXISTS (
         SELECT 1 FROM shortage_list sl
          WHERE sl.location_id = $2::uuid
            AND sl.status <> 'completed'
       )
     RETURNING *`,
    [input.bookId, input.locationId],
  );
  return rows[0] ?? null;
}

/**
 * כשהקאונטר מחזיר כמות לתא ריק — מוחקים חוסרים פתוחים למיקום בלי להחזיר מלאי
 * (המלאי כבר עודכן בנפרד ב־`PATCH` של המיקום/הספר).
 */
export async function clearShortageForRestockedCell(locationId: string): Promise<number> {
  const r = await pool.query(
    `DELETE FROM shortage_list
      WHERE location_id = $1::uuid
        AND status <> 'completed'`,
    [locationId],
  );
  return r.rowCount ?? 0;
}

/**
 * אחרי ירידת מלאי כולל: אם אין עותקים במחסן (unplaced = 0) ויש חוסר `shortage`
 * לתא ריק — מעבירים להזמנת מלאי (פעם אחת מספיקה לכל חוסרי הספר).
 */
export async function maybePromoteEmptyCellShortagesToOrder(bookId: string): Promise<void> {
  const { rows: stockRows } = await pool.query<{
    stock_quantity: number;
    on_shelf: string;
  }>(
    `SELECT b.stock_quantity,
            COALESCE(SUM(bl.quantity_in_cell), 0)::text AS on_shelf
       FROM books b
       LEFT JOIN book_locations bl ON bl.book_id = b.id
      WHERE b.id = $1::uuid
      GROUP BY b.id, b.stock_quantity`,
    [bookId],
  );
  const stockRow = stockRows[0];
  if (!stockRow) return;

  const onShelf = Number(stockRow.on_shelf);
  const unplaced = Math.max(0, Number(stockRow.stock_quantity) - onShelf);
  if (unplaced > 0) return;

  const { rows: shortageRows } = await pool.query<{ id: string }>(
    `SELECT sl.id
       FROM shortage_list sl
       JOIN book_locations bl ON bl.id = sl.location_id
      WHERE sl.book_id = $1::uuid
        AND sl.status = 'shortage'
        AND bl.quantity_in_cell = 0
      ORDER BY sl.added_at ASC
      LIMIT 1`,
    [bookId],
  );
  const shortageId = shortageRows[0]?.id;
  if (!shortageId) return;

  await moveShortageToOrder({ shortageId });
}
