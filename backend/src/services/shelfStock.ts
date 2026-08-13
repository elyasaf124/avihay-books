import type { BookLocationExpanded } from "@avihay-books/shared";
import { pool } from "../db/pool.js";
import { HttpError } from "../middleware/errorHandler.js";

export interface SetLocationShelfStockResult extends BookLocationExpanded {
  pending_shortage_count: number;
}

/**
 * מסנכרן את תצוגת המיקום ליעד `shelf_stock` באמצעות חוסרים בלבד:
 * - הגדלה → INSERT שדרות חוסר (בלי מילוי ממחסן, בלי לגעת ב-quantity/stock).
 * - הקטנה → DELETE חוסרים עודפים בלבד; אסור לרדת מתחת ל-`quantity_in_cell`.
 *
 * אחרי הפעולה: `quantity_in_cell + pending_shortage_count === shelf_stock`.
 */
export async function setLocationShelfStock(
  locationId: string,
  target: number,
): Promise<SetLocationShelfStockResult> {
  if (!Number.isFinite(target) || !Number.isInteger(target) || target < 0 || target > 9999) {
    throw new HttpError(400, "invalid_shelf_stock");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const locRes = await client.query<{
      id: string;
      book_id: string;
      cell_id: string;
      position_in_cell: number;
      quantity_in_cell: number;
      shelf_stock: number;
      cell_name: string;
    }>(
      `SELECT bl.id, bl.book_id, bl.cell_id, bl.position_in_cell, bl.quantity_in_cell,
              bl.shelf_stock, c.cell_name
         FROM book_locations bl
         JOIN cells c ON c.id = bl.cell_id
        WHERE bl.id = $1::uuid
        FOR UPDATE OF bl`,
      [locationId],
    );
    const loc = locRes.rows[0];
    if (!loc) {
      await client.query("ROLLBACK");
      throw new HttpError(404, "location_not_found");
    }

    if (target < loc.quantity_in_cell) {
      await client.query("ROLLBACK");
      throw new HttpError(400, "shelf_stock_below_physical", {
        quantity_in_cell: loc.quantity_in_cell,
      });
    }

    const pendingRes = await client.query<{ id: string }>(
      `SELECT id
         FROM shortage_list
        WHERE location_id = $1::uuid
          AND status <> 'completed'
        ORDER BY added_at ASC
        FOR UPDATE`,
      [locationId],
    );
    const pendingCount = pendingRes.rows.length;
    const spines = loc.quantity_in_cell + pendingCount;

    if (target > spines) {
      const ghostCount = target - spines;
      await client.query(
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
         FROM generate_series(1, $3::int)`,
        [loc.book_id, locationId, ghostCount],
      );
    } else if (target < spines) {
      const deleteCount = spines - target;
      await client.query(
        `DELETE FROM shortage_list
          WHERE id IN (
            SELECT id FROM shortage_list
             WHERE location_id = $1::uuid
               AND status <> 'completed'
             ORDER BY added_at DESC
             LIMIT $2::int
          )`,
        [locationId, deleteCount],
      );
    }

    await client.query(
      `UPDATE book_locations
          SET shelf_stock = $2::int
        WHERE id = $1::uuid`,
      [locationId, target],
    );

    const finalRes = await client.query<SetLocationShelfStockResult>(
      `SELECT bl.id, bl.book_id, bl.cell_id, bl.position_in_cell, bl.quantity_in_cell,
              bl.shelf_stock, c.cell_name,
              COALESCE((
                SELECT COUNT(*)::int FROM shortage_list sl
                 WHERE sl.location_id = bl.id AND sl.status <> 'completed'
              ), 0) AS pending_shortage_count
         FROM book_locations bl
         JOIN cells c ON c.id = bl.cell_id
        WHERE bl.id = $1::uuid`,
      [locationId],
    );
    const finalRow = finalRes.rows[0];
    if (!finalRow) {
      await client.query("ROLLBACK");
      throw new HttpError(500, "shelf_stock_sync_failed");
    }

    if (finalRow.quantity_in_cell + finalRow.pending_shortage_count !== finalRow.shelf_stock) {
      await client.query("ROLLBACK");
      throw new HttpError(500, "shelf_stock_invariant_broken", {
        quantity_in_cell: finalRow.quantity_in_cell,
        pending_shortage_count: finalRow.pending_shortage_count,
        shelf_stock: finalRow.shelf_stock,
      });
    }

    await client.query("COMMIT");
    return finalRow;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      /* best-effort */
    });
    throw err;
  } finally {
    client.release();
  }
}
