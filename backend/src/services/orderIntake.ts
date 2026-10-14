import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { HttpError } from "../middleware/errorHandler.js";
import { restoreBookShortagesIfNoOpenOrders } from "../repos/shortageList.repo.js";
import { planIntakeOrder, planShelfFill, type ShelfSlot } from "./orderIntakePlan.js";

export type IntakeCell = {
  cell_id: string;
  cell_name: string;
  missing_count: number;
};

export type IntakePreviewLine = {
  book_id: string | null;
  manual_book_title: string | null;
  book_title: string;
  book_author: string | null;
  ordered_qty: number;
  cells: IntakeCell[];
};

export type IntakePreview = { lines: IntakePreviewLine[] };

export type IntakeLineInput = {
  book_id: string | null;
  manual_book_title: string | null;
  received_qty: number;
};

type Scope = {
  supplierId: string | null;
  lineOnly: boolean;
  bookId: string | null;
  manualTitle: string | null;
};

type RawLine = {
  book_id: string | null;
  manual_book_title: string | null;
  inventory_qty: number;
  demand_qty: number;
  book_title: string;
  book_author: string | null;
};

function lineKey(bookId: string | null, manualTitle: string | null): string {
  if (bookId) return `b:${bookId}`;
  return `m:${(manualTitle ?? "").trim()}`;
}

const LINE_MATCH_SQL = `
    AND (
      $2::boolean = false
      OR (
        o.book_id IS NOT DISTINCT FROM $3::uuid
        AND (
          $3::uuid IS NOT NULL
          OR BTRIM(COALESCE(o.manual_book_title, '')) = BTRIM(COALESCE($4::text, ''))
        )
      )
    )
`;

const LINES_SQL = `
WITH inv AS (
  SELECT
    o.book_id,
    CASE WHEN o.book_id IS NULL THEN NULLIF(BTRIM(o.manual_book_title), '') ELSE NULL END AS manual_book_title,
    (COALESCE(o.book_id::text, '') || E'\\x1f' ||
      COALESCE(CASE WHEN o.book_id IS NULL THEN NULLIF(BTRIM(o.manual_book_title), '') ELSE '' END, '')
    ) AS line_key,
    SUM(o.quantity)::int AS inventory_qty,
    MAX(o.manual_book_author) AS manual_book_author
  FROM orders o
  WHERE o.supplier_id IS NOT DISTINCT FROM $1::uuid
    AND o.order_type = 'inventory'
    AND o.status = 'sent'
    AND o.customer_name IS NULL
    AND o.customer_phone IS NULL
    ${LINE_MATCH_SQL}
  GROUP BY 1, 2, 3
),
demand AS (
  SELECT
    o.book_id,
    CASE WHEN o.book_id IS NULL THEN NULLIF(BTRIM(o.manual_book_title), '') ELSE NULL END AS manual_book_title,
    (COALESCE(o.book_id::text, '') || E'\\x1f' ||
      COALESCE(CASE WHEN o.book_id IS NULL THEN NULLIF(BTRIM(o.manual_book_title), '') ELSE '' END, '')
    ) AS line_key,
    SUM(o.quantity)::int AS demand_qty,
    BOOL_OR(o.status = 'sent') AS any_sent
  FROM orders o
  WHERE o.supplier_id IS NOT DISTINCT FROM $1::uuid
    AND o.order_type IN ('customer', 'whatsapp')
    AND o.status IN ('pending', 'sent')
    AND o.supplier_received_at IS NULL
    ${LINE_MATCH_SQL}
  GROUP BY 1, 2, 3
)
SELECT
  COALESCE(i.book_id, d.book_id) AS book_id,
  COALESCE(i.manual_book_title, d.manual_book_title) AS manual_book_title,
  COALESCE(i.inventory_qty, 0)::int AS inventory_qty,
  COALESCE(d.demand_qty, 0)::int AS demand_qty,
  COALESCE(b.title, COALESCE(i.manual_book_title, d.manual_book_title), '') AS book_title,
  COALESCE(b.author, i.manual_book_author) AS book_author
FROM inv i
FULL OUTER JOIN demand d ON i.line_key = d.line_key
LEFT JOIN books b ON b.id = COALESCE(i.book_id, d.book_id)
WHERE COALESCE(i.inventory_qty, 0) > 0
   OR (COALESCE(d.demand_qty, 0) > 0 AND COALESCE(d.any_sent, false))
ORDER BY book_title
`;

async function loadRawLines(client: PoolClient, scope: Scope): Promise<RawLine[]> {
  const { rows } = await client.query<RawLine>(LINES_SQL, [
    scope.supplierId,
    scope.lineOnly,
    scope.bookId,
    scope.manualTitle,
  ]);
  return rows.map((row) => ({
    ...row,
    inventory_qty: Number(row.inventory_qty),
    demand_qty: Number(row.demand_qty),
  }));
}

async function loadCells(client: PoolClient, bookIds: string[]): Promise<Map<string, IntakeCell[]>> {
  const map = new Map<string, IntakeCell[]>();
  if (bookIds.length === 0) return map;
  const { rows } = await client.query<IntakeCell & { book_id: string }>(
    `SELECT sl.book_id,
            bl.cell_id,
            c.cell_name,
            COUNT(*)::int AS missing_count
       FROM shortage_list sl
       JOIN book_locations bl ON bl.id = sl.location_id
       JOIN cells c ON c.id = bl.cell_id
      WHERE sl.status = 'order_pending'
        AND sl.book_id = ANY($1::uuid[])
      GROUP BY sl.book_id, bl.cell_id, c.cell_name
      ORDER BY c.cell_name`,
    [bookIds],
  );
  for (const row of rows) {
    const list = map.get(row.book_id) ?? [];
    list.push({
      cell_id: row.cell_id,
      cell_name: row.cell_name,
      missing_count: Number(row.missing_count),
    });
    map.set(row.book_id, list);
  }
  return map;
}

function toPreview(lines: RawLine[], cells: Map<string, IntakeCell[]>): IntakePreview {
  return {
    lines: lines.map((line) => ({
      book_id: line.book_id,
      manual_book_title: line.manual_book_title,
      book_title: line.book_title,
      book_author: line.book_author,
      ordered_qty: line.inventory_qty + line.demand_qty,
      cells: line.book_id ? (cells.get(line.book_id) ?? []) : [],
    })),
  };
}

export async function previewOrderIntake(scope: Scope): Promise<IntakePreview> {
  const client = await pool.connect();
  try {
    const lines = await loadRawLines(client, scope);
    const bookIds = lines.flatMap((line) => (line.book_id ? [line.book_id] : []));
    const cells = await loadCells(client, bookIds);
    return toPreview(lines, cells);
  } finally {
    client.release();
  }
}

async function placeOnShelves(client: PoolClient, bookId: string, receivedQty: number): Promise<void> {
  const { rows: shortageRows } = await client.query<{
    id: string;
    location_id: string | null;
    added_at: Date | string;
  }>(
    `SELECT id, location_id, added_at
       FROM shortage_list
      WHERE book_id = $1
        AND status = 'order_pending'
      ORDER BY added_at ASC, id ASC
      FOR UPDATE`,
    [bookId],
  );

  const locationIds = [
    ...new Set(shortageRows.flatMap((row) => (row.location_id ? [row.location_id] : []))),
  ];
  const freshQty = new Map<string, { quantity_in_cell: number; shelf_stock: number }>();
  if (locationIds.length > 0) {
    const { rows } = await client.query<{
      id: string;
      quantity_in_cell: number;
      shelf_stock: number;
    }>(
      `SELECT id, quantity_in_cell, shelf_stock
         FROM book_locations
        WHERE id = ANY($1::uuid[])
        FOR UPDATE`,
      [locationIds],
    );
    for (const row of rows) {
      freshQty.set(row.id, {
        quantity_in_cell: Number(row.quantity_in_cell),
        shelf_stock: Number(row.shelf_stock),
      });
    }
  }

  const slots: ShelfSlot[] = shortageRows.map((row) => {
    const fresh = row.location_id ? freshQty.get(row.location_id) : undefined;
    return {
      shortageId: row.id,
      locationId: fresh ? row.location_id : null,
      addedAt: new Date(row.added_at).toISOString(),
      quantityInCell: fresh?.quantity_in_cell ?? 0,
      shelfStock: fresh?.shelf_stock ?? 0,
    };
  });
  const plan = planShelfFill(slots, receivedQty);

  for (const add of plan.locationAdds) {
    const updated = await client.query(
      `UPDATE book_locations
          SET quantity_in_cell = quantity_in_cell + $2
        WHERE id = $1
          AND quantity_in_cell + $2 <= shelf_stock`,
      [add.locationId, add.add],
    );
    if ((updated.rowCount ?? 0) < 1) throw new HttpError(409, "intake_shelf_conflict");
  }

  if (plan.completedShortageIds.length > 0) {
    await client.query(
      `UPDATE shortage_list
          SET status = 'completed',
              resolved_at = now()
        WHERE id = ANY($1::uuid[])
          AND status = 'order_pending'`,
      [plan.completedShortageIds],
    );
  }
}

async function loadInventoryRows(
  client: PoolClient,
  scope: Scope,
  line: RawLine,
): Promise<{ id: string; manual_book_author: string | null }[]> {
  const { rows } = await client.query<{ id: string; manual_book_author: string | null }>(
    `SELECT id, manual_book_author
       FROM orders
      WHERE supplier_id IS NOT DISTINCT FROM $1::uuid
        AND order_type = 'inventory'
        AND status = 'sent'
        AND customer_name IS NULL
        AND customer_phone IS NULL
        AND book_id IS NOT DISTINCT FROM $2::uuid
        AND (
          $2::uuid IS NOT NULL
          OR BTRIM(COALESCE(manual_book_title, '')) = BTRIM(COALESCE($3::text, ''))
        )
      ORDER BY created_at ASC
      FOR UPDATE`,
    [scope.supplierId, line.book_id, line.manual_book_title],
  );
  return rows;
}

async function markDemandReceived(client: PoolClient, scope: Scope, line: RawLine): Promise<void> {
  await client.query(
    `UPDATE orders
        SET supplier_received_at = now()
      WHERE supplier_id IS NOT DISTINCT FROM $1::uuid
        AND order_type IN ('customer', 'whatsapp')
        AND status IN ('pending', 'sent')
        AND supplier_received_at IS NULL
        AND book_id IS NOT DISTINCT FROM $2::uuid
        AND (
          $2::uuid IS NOT NULL
          OR BTRIM(COALESCE(manual_book_title, '')) = BTRIM(COALESCE($3::text, ''))
        )`,
    [scope.supplierId, line.book_id, line.manual_book_title],
  );
}

async function resetDemandToPending(client: PoolClient, scope: Scope, line: RawLine): Promise<void> {
  await client.query(
    `UPDATE orders
        SET status = 'pending'
      WHERE supplier_id IS NOT DISTINCT FROM $1::uuid
        AND order_type IN ('customer', 'whatsapp')
        AND status = 'sent'
        AND supplier_received_at IS NULL
        AND book_id IS NOT DISTINCT FROM $2::uuid
        AND (
          $2::uuid IS NOT NULL
          OR BTRIM(COALESCE(manual_book_title, '')) = BTRIM(COALESCE($3::text, ''))
        )`,
    [scope.supplierId, line.book_id, line.manual_book_title],
  );
}

async function applyLine(client: PoolClient, scope: Scope, line: RawLine, receivedQty: number): Promise<boolean> {
  const orderedQty = line.inventory_qty + line.demand_qty;
  let orderPlan;
  try {
    orderPlan = planIntakeOrder(orderedQty, receivedQty);
  } catch {
    throw new HttpError(400, "intake_qty_invalid", {
      book_id: line.book_id,
      ordered_qty: orderedQty,
      received_qty: receivedQty,
    });
  }

  if (receivedQty > 0) {
    if (line.book_id) {
      const stock = await client.query(
        `UPDATE books SET stock_quantity = stock_quantity + $2 WHERE id = $1`,
        [line.book_id, receivedQty],
      );
      if ((stock.rowCount ?? 0) < 1) throw new HttpError(404, "book_not_found");
      await placeOnShelves(client, line.book_id, receivedQty);
    }
    await markDemandReceived(client, scope, line);
  }

  const inventoryRows = await loadInventoryRows(client, scope, line);

  if (orderPlan.outcome === "complete") {
    if (inventoryRows.length > 0) {
      await client.query(`UPDATE orders SET status = 'completed' WHERE id = ANY($1::uuid[])`, [
        inventoryRows.map((row) => row.id),
      ]);
    }
    return true;
  }

  if (orderPlan.outcome === "reset_pending") {
    if (inventoryRows.length > 0) {
      await client.query(`UPDATE orders SET status = 'pending' WHERE id = ANY($1::uuid[])`, [
        inventoryRows.map((row) => row.id),
      ]);
    } else {
      await resetDemandToPending(client, scope, line);
    }
    return false;
  }

  const keep = inventoryRows[0];
  if (keep) {
    await client.query(`UPDATE orders SET quantity = $2, status = 'pending' WHERE id = $1`, [
      keep.id,
      orderPlan.quantity,
    ]);
    const extra = inventoryRows.slice(1).map((row) => row.id);
    if (extra.length > 0) {
      await client.query(`DELETE FROM orders WHERE id = ANY($1::uuid[])`, [extra]);
    }
  } else {
    await client.query(
      `INSERT INTO orders (
         book_id, supplier_id, order_type, quantity,
         manual_book_title, manual_book_author, status
       )
       VALUES ($1, $2, 'inventory', $3, $4, $5, 'pending')`,
      [
        line.book_id,
        scope.supplierId,
        orderPlan.quantity,
        line.book_id ? null : line.manual_book_title,
        line.book_id ? null : line.book_author,
      ],
    );
  }
  return false;
}

export async function receiveOrderIntake(scope: Scope, inputs: IntakeLineInput[]): Promise<void> {
  const client = await pool.connect();
  const restoreBookIds: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT id FROM orders
        WHERE supplier_id IS NOT DISTINCT FROM $1::uuid
          AND order_type IN ('inventory', 'customer', 'whatsapp')
          AND status IN ('pending', 'sent')
        FOR UPDATE`,
      [scope.supplierId],
    );

    const lines = await loadRawLines(client, scope);
    if (lines.length === 0) throw new HttpError(404, "intake_nothing_to_receive");

    const byKey = new Map(lines.map((line) => [lineKey(line.book_id, line.manual_book_title), line]));
    if (inputs.length !== lines.length) throw new HttpError(400, "intake_incomplete");

    const seen = new Set<string>();
    for (const input of inputs) {
      const key = lineKey(input.book_id, input.manual_book_title);
      if (seen.has(key) || !byKey.has(key)) throw new HttpError(400, "intake_line_mismatch");
      seen.add(key);
    }

    for (const input of inputs) {
      const line = byKey.get(lineKey(input.book_id, input.manual_book_title))!;
      const completed = await applyLine(client, scope, line, input.received_qty);
      if (completed && line.book_id) restoreBookIds.push(line.book_id);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  for (const bookId of restoreBookIds) {
    await restoreBookShortagesIfNoOpenOrders(bookId).catch(() => {});
  }
}
