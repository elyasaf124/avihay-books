import type { BookLocationExpanded } from "@avihay-books/shared";
import { pool } from "../db/pool.js";
import { HttpError } from "../middleware/errorHandler.js";

export interface SetLocationShelfStockResult extends BookLocationExpanded {
  pending_shortage_count: number;
}

/**
 * מסנכרן את תצוגת המיקום ליעד `shelf_stock`:
 * 1. ממלא חוסרים פתוחים ממחסן (כמה שניתן) — מספר השדרות לא משתנה.
 * 2. אם צריך יותר שדרות — ממחסן ואז ghost חוסר (בלי להפחית מלאי).
 * 3. אם צריך פחות — מוחק חוסרים ואז מחזיר עותקים פיזיים למחסן (`stock` לא משתנה).
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

    const stockRes = await client.query<{ stock_quantity: number; on_shelf: number }>(
      `SELECT b.stock_quantity,
              COALESCE((
                SELECT SUM(bl.quantity_in_cell)::int
                  FROM book_locations bl
                 WHERE bl.book_id = b.id
              ), 0) AS on_shelf
         FROM books b
        WHERE b.id = $1::uuid
        FOR UPDATE`,
      [loc.book_id],
    );
    const stockRow = stockRes.rows[0];
    if (!stockRow) {
      await client.query("ROLLBACK");
      throw new HttpError(404, "book_not_found");
    }

    let quantityInCell = loc.quantity_in_cell;
    let unplaced = Math.max(0, stockRow.stock_quantity - stockRow.on_shelf);

    const pendingRes = await client.query<{ id: string }>(
      `SELECT id
         FROM shortage_list
        WHERE location_id = $1::uuid
          AND status <> 'completed'
        ORDER BY added_at ASC
        FOR UPDATE`,
      [locationId],
    );
    let pendingCount = pendingRes.rows.length;

    // שלב 0: מילוי חוסרים ממחסן
    const fillCount = Math.min(pendingCount, unplaced);
    if (fillCount > 0) {
      const toFill = pendingRes.rows.slice(0, fillCount).map((r) => r.id);
      await client.query(
        `UPDATE book_locations
            SET quantity_in_cell = quantity_in_cell + $2::int
          WHERE id = $1::uuid`,
        [locationId, fillCount],
      );
      await client.query(
        `UPDATE shortage_list
            SET status = 'completed',
                resolved_at = now()
          WHERE id = ANY($1::uuid[])`,
        [toFill],
      );
      quantityInCell += fillCount;
      unplaced -= fillCount;
      pendingCount -= fillCount;
    }

    let spines = quantityInCell + pendingCount;

    if (spines < target) {
      const need = target - spines;
      const fromWarehouse = Math.min(need, unplaced);
      if (fromWarehouse > 0) {
        await client.query(
          `UPDATE book_locations
              SET quantity_in_cell = quantity_in_cell + $2::int
            WHERE id = $1::uuid`,
          [locationId, fromWarehouse],
        );
        quantityInCell += fromWarehouse;
      }

      const ghostCount = need - fromWarehouse;
      if (ghostCount > 0) {
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
        pendingCount += ghostCount;
      }
      spines = quantityInCell + pendingCount;
    } else if (spines > target) {
      let excess = spines - target;

      const deleteCount = Math.min(excess, pendingCount);
      if (deleteCount > 0) {
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
        pendingCount -= deleteCount;
        excess -= deleteCount;
      }

      if (excess > 0) {
        const reduceQty = Math.min(excess, quantityInCell);
        if (reduceQty > 0) {
          await client.query(
            `UPDATE book_locations
                SET quantity_in_cell = GREATEST(quantity_in_cell - $2::int, 0)
              WHERE id = $1::uuid`,
            [locationId, reduceQty],
          );
          quantityInCell -= reduceQty;
        }
      }
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
