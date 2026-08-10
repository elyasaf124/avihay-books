import { pool } from "../db/pool.js";
import type { BookLocationPath, SideLabel } from "@avihay-books/shared";

interface PathRow {
  unit_name: string;
  side_label: SideLabel | null;
  shelf_number: number;
  cell_name: string;
}

function mapPathRows(bookId: string, rows: PathRow[]): BookLocationPath[] {
  return rows.map((r) => ({
    book_id: bookId,
    unit_name: r.unit_name,
    side_label: r.side_label,
    shelf_number: r.shelf_number,
    cell_name: r.cell_name,
    full_path: r.side_label
      ? `${r.unit_name} > ${r.side_label} > מדף ${r.shelf_number} > תא ${r.cell_name}`
      : `${r.unit_name} > מדף ${r.shelf_number} > תא ${r.cell_name}`,
    short_path: `תא ${r.cell_name}`,
  }));
}

/**
 * Resolves the human-readable full path + short path for a book's first
 * (or all) locations. Per the brief:
 *   Full (island):     "{unit_name} > {side_label} > מדף {shelf_number} > תא {cell_name}"
 *   Full (non-island): "{unit_name} > מדף {shelf_number} > תא {cell_name}"
 *   Short:             "תא {cell_name}"
 */
export async function getBookLocationPaths(bookId: string): Promise<BookLocationPath[]> {
  const sql = `
    SELECT
      su.name                        AS unit_name,
      us.side_label                  AS side_label,
      sh.shelf_number                AS shelf_number,
      c.cell_name                    AS cell_name
    FROM book_locations bl
    JOIN cells c           ON c.id  = bl.cell_id
    JOIN shelves sh        ON sh.id = c.shelf_id
    LEFT JOIN unit_sides us ON us.id = sh.side_id
    LEFT JOIN shelving_units su
      ON su.id = COALESCE(sh.unit_id, us.unit_id)
    WHERE bl.book_id = $1
    ORDER BY bl.position_in_cell`;
  const { rows } = await pool.query<PathRow>(sql, [bookId]);
  return mapPathRows(bookId, rows);
}

/** מיקומים פיזיים זמינים ללקוח — רק תאים עם עותקים פיזיים שנותרו. */
export async function getAvailableBookLocationPaths(bookId: string): Promise<BookLocationPath[]> {
  const sql = `
    SELECT
      su.name                        AS unit_name,
      us.side_label                  AS side_label,
      sh.shelf_number                AS shelf_number,
      c.cell_name                    AS cell_name
    FROM book_locations bl
    JOIN cells c           ON c.id  = bl.cell_id
    JOIN shelves sh        ON sh.id = c.shelf_id
    LEFT JOIN unit_sides us ON us.id = sh.side_id
    LEFT JOIN shelving_units su
      ON su.id = COALESCE(sh.unit_id, us.unit_id)
    WHERE bl.book_id = $1
      AND bl.quantity_in_cell > 0
    ORDER BY bl.position_in_cell`;
  const { rows } = await pool.query<PathRow>(sql, [bookId]);
  return mapPathRows(bookId, rows);
}

/**
 * האם הספר זמין לרכישה בחנות — מלאי כללי + עותקים פיזיים על המדף.
 * אם אין מיקום במדף אבל יש מלאי כללי — נחשב זמין (ללא כתובת תא).
 */
export async function isBookAvailableForCustomer(
  bookId: string,
  stockQuantity: number,
): Promise<boolean> {
  if (Number(stockQuantity) <= 0) return false;

  const { rows } = await pool.query<{ shelf_count: string; available_count: string }>(
    `SELECT
       COUNT(*)::text AS shelf_count,
       COUNT(*) FILTER (WHERE bl.quantity_in_cell > 0)::text AS available_count
     FROM book_locations bl
     WHERE bl.book_id = $1`,
    [bookId],
  );
  const shelfCount = Number.parseInt(rows[0]?.shelf_count ?? "0", 10);
  const availableCount = Number.parseInt(rows[0]?.available_count ?? "0", 10);
  if (shelfCount === 0) return true;
  return availableCount > 0;
}
