import { pool } from "../db/pool.js";
import { HttpError } from "../middleware/errorHandler.js";
import { bookLocationInputSchema, type BookLocationInput } from "./schemas.js";
import type { BookLocation, BookLocationExpanded } from "@avihay-books/shared";

/**
 * `display` — רק ספרים חדשים; `stacks` (סטנד) — כל ספר;
 * ארונות רגילים — רק ספרים שאינם חדשים.
 */
async function assertValidBookCellPlacement(bookId: string, cellId: string): Promise<void> {
  const { rows } = await pool.query<{ is_new: boolean; store_position: string }>(
    `SELECT b.is_new, pos.store_position::text AS store_position
     FROM books b
     INNER JOIN (
       SELECT su.store_position
       FROM cells c
       INNER JOIN shelves s ON s.id = c.shelf_id
       LEFT JOIN unit_sides us ON us.id = s.side_id
       INNER JOIN shelving_units su ON su.id = COALESCE(s.unit_id, us.unit_id)
       WHERE c.id = $2
     ) pos ON TRUE
     WHERE b.id = $1`,
    [bookId, cellId],
  );
  const row = rows[0];
  if (!row) {
    throw new HttpError(404, "book_or_cell_not_found", { book_id: bookId, cell_id: cellId });
  }
  const pos = row.store_position;
  if (row.is_new && pos !== "display") {
    throw new HttpError(422, "new_book_must_be_in_display", {
      book_id: bookId,
      cell_id: cellId,
    });
  }
  if (!row.is_new && pos === "display") {
    throw new HttpError(422, "only_new_books_in_display", {
      book_id: bookId,
      cell_id: cellId,
    });
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

/**
 * הוספת שורת מיקום לתא `{ cell_id, position_in_cell }`: אם המשבצת פנויה — INSERT;
 * אם אותו ספר כבר שם — מיזוג כמות (`quantity_in_cell`); אחרת משבצת תפוסה.
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

    if (v.id) {
      const { rows } = await client.query<BookLocation>(
        `INSERT INTO book_locations (id, book_id, cell_id, position_in_cell, quantity_in_cell)
         VALUES ($1::uuid, $2, $3, $4, $5)
         RETURNING *`,
        [v.id, v.book_id, v.cell_id, v.position_in_cell, v.quantity_in_cell],
      );
      await client.query("COMMIT");
      return rows[0]!;
    }

    const { rows } = await client.query<BookLocation>(
      `INSERT INTO book_locations (book_id, cell_id, position_in_cell, quantity_in_cell)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [v.book_id, v.cell_id, v.position_in_cell, v.quantity_in_cell],
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
      const { rows } = await client.query<BookLocation>(
        `UPDATE book_locations
         SET book_id = $1, quantity_in_cell = $2
         WHERE id = $3
         RETURNING *`,
        [v.book_id, v.quantity_in_cell, v.id],
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
      const swapRes = await client.query<BookLocation>(
        `UPDATE book_locations SET
           cell_id = CASE id WHEN $1::uuid THEN $3::uuid WHEN $2::uuid THEN $5::uuid END,
           position_in_cell = CASE id WHEN $1::uuid THEN $4::int WHEN $2::uuid THEN $6::int END,
           book_id = CASE WHEN id = $1::uuid THEN $7::uuid ELSE book_id END,
           quantity_in_cell = CASE WHEN id = $1::uuid THEN $8::int ELSE quantity_in_cell END
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
        ],
      );
      await client.query("COMMIT");
      return swapRes.rows.find((r) => r.id === v.id)!;
    }

    await assertValidBookCellPlacement(v.book_id, v.cell_id);

    const { rows: movedRows } = await client.query<BookLocation>(
      `UPDATE book_locations
       SET book_id = $1, cell_id = $2, position_in_cell = $3, quantity_in_cell = $4
       WHERE id = $5
       RETURNING *`,
      [v.book_id, v.cell_id, v.position_in_cell, v.quantity_in_cell, v.id],
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
    `SELECT bl.id, bl.book_id, bl.cell_id, bl.position_in_cell, bl.quantity_in_cell, c.cell_name
     FROM book_locations bl
     JOIN cells c ON c.id = bl.cell_id
     WHERE bl.book_id = $1
     ORDER BY bl.position_in_cell, bl.id`,
    [bookId],
  );
  return rows;
}

export async function deleteBookLocation(id: string): Promise<void> {
  await pool.query("DELETE FROM book_locations WHERE id = $1", [id]);
}

export async function findBookLocationById(id: string): Promise<BookLocation | null> {
  const { rows } = await pool.query<BookLocation>(
    "SELECT * FROM book_locations WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}
