import { pool } from "../db/pool.js";
import { HttpError } from "../middleware/errorHandler.js";
import { bookLocationInputSchema, type BookLocationInput } from "./schemas.js";
import type { BookLocation, BookLocationExpanded } from "@avihay-books/shared";

/** מוודא שספר והתא קיימים — אין הגבלת `is_new` / ארון תצוגה (חופש מיקום מלא). */
async function assertValidBookCellPlacement(bookId: string, cellId: string): Promise<void> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM books WHERE id = $1)
            AND EXISTS(SELECT 1 FROM cells WHERE id = $2) AS ok`,
    [bookId, cellId],
  );
  if (!rows[0]?.ok) {
    throw new HttpError(404, "book_or_cell_not_found", { book_id: bookId, cell_id: cellId });
  }
}

function isCellPositionDuplicateKey(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505" &&
    "constraint" in err &&
    (err as { constraint?: string }).constraint === "book_locations_cell_id_position_in_cell_key"
  );
}

function shelfStockForInsert(v: BookLocationInput): number {
  return v.shelf_stock ?? v.quantity_in_cell;
}

/**
 * הוספת שורת מיקום לתא `{ cell_id, position_in_cell }`: אם המשבצת פנויה — INSERT;
 * אם אותו ספר כבר שם — מיזוג כמות (`quantity_in_cell`); אחרת משבצת תפוסה.
 * במיזוג לא דורסים `shelf_stock`.
 */
async function insertOrMergeBookLocationAtSlot(v: BookLocationInput): Promise<BookLocation> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const occ = await client.query<BookLocation>(
      `SELECT * FROM book_locations
       WHERE cell_id = $1 AND position_in_cell = $2
       FOR UPDATE`,
      [v.cell_id, v.position_in_cell],
    );
    const occupying = occ.rows[0];

    if (occupying) {
      if (occupying.book_id !== v.book_id) {
        await client.query("ROLLBACK");
        throw new HttpError(409, "book_location_slot_occupied", {
          cell_id: v.cell_id,
          position_in_cell: v.position_in_cell,
          existing_book_id: occupying.book_id,
        });
      }

      await assertValidBookCellPlacement(v.book_id, v.cell_id);

      const { rows } = await client.query<BookLocation>(
        `UPDATE book_locations
         SET quantity_in_cell = quantity_in_cell + $1
         WHERE id = $2
         RETURNING *`,
        [v.quantity_in_cell, occupying.id],
      );
      await client.query("COMMIT");
      return rows[0]!;
    }

    await assertValidBookCellPlacement(v.book_id, v.cell_id);
    const shelfStock = shelfStockForInsert(v);

    if (v.id) {
      const { rows } = await client.query<BookLocation>(
        `INSERT INTO book_locations (id, book_id, cell_id, position_in_cell, quantity_in_cell, shelf_stock)
         VALUES ($1::uuid, $2, $3, $4, $5, $6)
         RETURNING *`,
        [v.id, v.book_id, v.cell_id, v.position_in_cell, v.quantity_in_cell, shelfStock],
      );
      await client.query("COMMIT");
      return rows[0]!;
    }

    const { rows } = await client.query<BookLocation>(
      `INSERT INTO book_locations (book_id, cell_id, position_in_cell, quantity_in_cell, shelf_stock)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [v.book_id, v.cell_id, v.position_in_cell, v.quantity_in_cell, shelfStock],
    );
    await client.query("COMMIT");
    return rows[0]!;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      /* best-effort */
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Moving a row into `(cell_id, position_in_cell)` that another row already occupies
 * violates `UNIQUE (cell_id, position_in_cell)` even with `ON CONFLICT (id)`, because
 * the conflicting row has a different `id`. Swap slots with the occupying row in one
 * UPDATE; the unique constraint is deferrable (see migration 014) so the swap commits.
 */
async function moveExistingBookLocation(
  v: BookLocationInput & { id: string },
): Promise<BookLocation | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const curRes = await client.query<BookLocation>(
      "SELECT * FROM book_locations WHERE id = $1 FOR UPDATE",
      [v.id],
    );
    const current = curRes.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return null;
    }

    const sameSlot =
      current.cell_id === v.cell_id && current.position_in_cell === v.position_in_cell;

    if (sameSlot) {
      await assertValidBookCellPlacement(v.book_id, v.cell_id);
      const shelfStock = v.shelf_stock ?? current.shelf_stock;
      const { rows } = await client.query<BookLocation>(
        `UPDATE book_locations
         SET book_id = $1, quantity_in_cell = $2, shelf_stock = $3
         WHERE id = $4
         RETURNING *`,
        [v.book_id, v.quantity_in_cell, shelfStock, v.id],
      );
      await client.query("COMMIT");
      return rows[0]!;
    }

    const blockerRes = await client.query<BookLocation>(
      `SELECT * FROM book_locations
       WHERE cell_id = $1 AND position_in_cell = $2 AND id <> $3
       FOR UPDATE`,
      [v.cell_id, v.position_in_cell, v.id],
    );
    const blocker = blockerRes.rows[0];

    if (blocker) {
      await assertValidBookCellPlacement(v.book_id, v.cell_id);
      await assertValidBookCellPlacement(blocker.book_id, current.cell_id);
      await client.query(
        "SET CONSTRAINTS book_locations_cell_id_position_in_cell_key DEFERRED",
      );
      const shelfStock = v.shelf_stock ?? current.shelf_stock;
      const swapRes = await client.query<BookLocation>(
        `UPDATE book_locations SET
           cell_id = CASE id WHEN $1::uuid THEN $3::uuid WHEN $2::uuid THEN $5::uuid END,
           position_in_cell = CASE id WHEN $1::uuid THEN $4::int WHEN $2::uuid THEN $6::int END,
           book_id = CASE WHEN id = $1::uuid THEN $7::uuid ELSE book_id END,
           quantity_in_cell = CASE WHEN id = $1::uuid THEN $8::int ELSE quantity_in_cell END,
           shelf_stock = CASE WHEN id = $1::uuid THEN $9::int ELSE shelf_stock END
         WHERE id IN ($1::uuid, $2::uuid)
         RETURNING *`,
        [
          v.id,
          blocker.id,
          v.cell_id,
          v.position_in_cell,
          current.cell_id,
          current.position_in_cell,
          v.book_id,
          v.quantity_in_cell,
          shelfStock,
        ],
      );
      await client.query("COMMIT");
      return swapRes.rows.find((r) => r.id === v.id)!;
    }

    await assertValidBookCellPlacement(v.book_id, v.cell_id);
    const shelfStock = v.shelf_stock ?? current.shelf_stock;

    const { rows: movedRows } = await client.query<BookLocation>(
      `UPDATE book_locations
       SET book_id = $1, cell_id = $2, position_in_cell = $3, quantity_in_cell = $4, shelf_stock = $5
       WHERE id = $6
       RETURNING *`,
      [v.book_id, v.cell_id, v.position_in_cell, v.quantity_in_cell, shelfStock, v.id],
    );

    await client.query("COMMIT");
    return movedRows[0]!;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      /* best-effort */
    });
    throw err;
  } finally {
    client.release();
  }
}

export async function upsertBookLocation(input: BookLocationInput): Promise<BookLocation> {
  const v = bookLocationInputSchema.parse(input);

  if (v.id) {
    const relocated = await moveExistingBookLocation(v as BookLocationInput & { id: string });
    if (relocated) return relocated;
  }

  try {
    return await insertOrMergeBookLocationAtSlot(v);
  } catch (err) {
    if (isCellPositionDuplicateKey(err)) {
      return await insertOrMergeBookLocationAtSlot(v);
    }
    throw err;
  }
}

export async function findBookLocationsByBook(bookId: string): Promise<BookLocation[]> {
  const { rows } = await pool.query<BookLocation>(
    "SELECT * FROM book_locations WHERE book_id = $1 ORDER BY id",
    [bookId],
  );
  return rows;
}

export async function findBookLocationsExpandedByBook(bookId: string): Promise<BookLocationExpanded[]> {
  const { rows } = await pool.query<BookLocationExpanded>(
    `SELECT bl.id, bl.book_id, bl.cell_id, bl.position_in_cell, bl.quantity_in_cell, bl.shelf_stock, c.cell_name
     FROM book_locations bl
     JOIN cells c ON c.id = bl.cell_id
     WHERE bl.book_id = $1
     ORDER BY bl.position_in_cell, bl.id`,
    [bookId],
  );
  return rows;
}

/** מיקומים מורחבים לקבוצת ספרים — שאילתה אחת במקום N+1. */
export async function findBookLocationsExpandedByBookIds(
  bookIds: string[],
): Promise<Map<string, BookLocationExpanded[]>> {
  const byBook = new Map<string, BookLocationExpanded[]>();
  for (const id of bookIds) byBook.set(id, []);
  if (bookIds.length === 0) return byBook;

  const { rows } = await pool.query<BookLocationExpanded>(
    `SELECT bl.id, bl.book_id, bl.cell_id, bl.position_in_cell, bl.quantity_in_cell, bl.shelf_stock, c.cell_name
     FROM book_locations bl
     JOIN cells c ON c.id = bl.cell_id
     WHERE bl.book_id = ANY($1::uuid[])
     ORDER BY bl.book_id, bl.position_in_cell, bl.id`,
    [bookIds],
  );
  for (const row of rows) {
    const arr = byBook.get(row.book_id) ?? [];
    arr.push(row);
    byBook.set(row.book_id, arr);
  }
  return byBook;
}

/**
 * הסרת מיקום מהמפה:
 * - אם יש מלאי בתא (`quantity_in_cell > 0`) — רק מוחקים את השורה; המלאי הכללי
 *   נשאר כמלאי מחסן לא ממוקם. חוסרים פתוחים מקבלים `location_id = NULL` (FK).
 * - אם התא ריק / חוסר (`quantity_in_cell <= 0`) — מוחקים גם רשומות `shortage`
 *   למיקום (בלי להחזיר מלאי), כדי שהבועה והחוסר ייעלמו מהרשימה.
 */
export async function deleteBookLocation(id: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<BookLocation>(
      "SELECT * FROM book_locations WHERE id = $1 FOR UPDATE",
      [id],
    );
    const loc = rows[0];
    if (!loc) {
      await client.query("COMMIT");
      return;
    }
    if (loc.quantity_in_cell <= 0) {
      await client.query(
        `DELETE FROM shortage_list
          WHERE location_id = $1::uuid
            AND status = 'shortage'`,
        [id],
      );
    }
    await client.query("DELETE FROM book_locations WHERE id = $1", [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      /* best-effort */
    });
    throw err;
  } finally {
    client.release();
  }
}

export async function findBookLocationById(id: string): Promise<BookLocation | null> {
  const { rows } = await pool.query<BookLocation>(
    "SELECT * FROM book_locations WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}
