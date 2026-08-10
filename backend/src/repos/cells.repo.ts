import { pool } from "../db/pool.js";
import { cellInputSchema, type CellInput } from "./schemas.js";
import type { Cell } from "@avihay-books/shared";
import { HttpError } from "../middleware/errorHandler.js";

const DEFAULT_CELL_CAPACITY = 24;
const DISPLAY_OR_STACKS_CAPACITY = 200;

export async function upsertCell(input: CellInput): Promise<Cell> {
  const v = cellInputSchema.parse(input);
  const sql = `
    INSERT INTO cells (id, shelf_id, cell_number, cell_name, capacity)
    VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET
      shelf_id = EXCLUDED.shelf_id,
      cell_number = EXCLUDED.cell_number,
      cell_name = EXCLUDED.cell_name,
      capacity = EXCLUDED.capacity
    RETURNING *`;
  const { rows } = await pool.query<Cell>(sql, [
    v.id ?? null,
    v.shelf_id,
    v.cell_number,
    v.cell_name,
    v.capacity,
  ]);
  return rows[0]!;
}

export async function findCellsByShelf(shelfId: string): Promise<Cell[]> {
  const { rows } = await pool.query<Cell>(
    "SELECT * FROM cells WHERE shelf_id = $1 ORDER BY cell_number",
    [shelfId],
  );
  return rows;
}

export async function findCellByName(cellName: string): Promise<Cell | null> {
  const { rows } = await pool.query<Cell>("SELECT * FROM cells WHERE cell_name = $1", [cellName]);
  return rows[0] ?? null;
}

export async function findCellByShelfAndNumber(
  shelfId: string,
  cellNumber: number,
): Promise<Cell | null> {
  const { rows } = await pool.query<Cell>(
    "SELECT * FROM cells WHERE shelf_id = $1 AND cell_number = $2",
    [shelfId, cellNumber],
  );
  return rows[0] ?? null;
}

async function nextCellNumberOnShelf(shelfId: string): Promise<number> {
  const { rows } = await pool.query<{ max: number | null }>(
    "SELECT MAX(cell_number) AS max FROM cells WHERE shelf_id = $1",
    [shelfId],
  );
  return (rows[0]?.max ?? 0) + 1;
}

async function defaultCapacityForShelf(shelfId: string): Promise<number> {
  const { rows } = await pool.query<{ store_position: string }>(
    `SELECT su.store_position::text AS store_position
     FROM shelves sh
     LEFT JOIN unit_sides us ON us.id = sh.side_id
     INNER JOIN shelving_units su ON su.id = COALESCE(sh.unit_id, us.unit_id)
     WHERE sh.id = $1`,
    [shelfId],
  );
  const pos = rows[0]?.store_position;
  if (pos === "display" || pos === "stacks") return DISPLAY_OR_STACKS_CAPACITY;
  return DEFAULT_CELL_CAPACITY;
}

async function storePositionForShelf(shelfId: string): Promise<string | null> {
  const { rows } = await pool.query<{ store_position: string }>(
    `SELECT su.store_position::text AS store_position
     FROM shelves sh
     LEFT JOIN unit_sides us ON us.id = sh.side_id
     INNER JOIN shelving_units su ON su.id = COALESCE(sh.unit_id, us.unit_id)
     WHERE sh.id = $1`,
    [shelfId],
  );
  return rows[0]?.store_position ?? null;
}

async function assertShelfExists(shelfId: string): Promise<void> {
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM shelves WHERE id = $1", [
    shelfId,
  ]);
  if (!rows[0]) throw new HttpError(404, "shelf_not_found", { shelf_id: shelfId });
}

function parsePositiveIntName(raw: string): number | null {
  const asNum = Number.parseInt(raw, 10);
  if (!Number.isFinite(asNum) || asNum < 1) return null;
  if (String(asNum) !== raw) return null;
  return asNum;
}

/** שם תא פנוי גלובלית — `cell_name` הוא UNIQUE בכל החנות. */
async function allocateUniqueCellName(
  preferred: string,
  shelfId: string,
  cellNumber: number,
): Promise<string> {
  const existing = await findCellByName(preferred);
  if (!existing) return preferred;

  const pos = await storePositionForShelf(shelfId);
  if (pos === "display") {
    const displayName = `תצוגה ${cellNumber}`;
    if (displayName.length <= 20 && !(await findCellByName(displayName))) return displayName;
  }
  if (pos === "stacks") {
    const stacksName = cellNumber === 1 ? "סטים" : `סטים ${cellNumber}`;
    if (stacksName.length <= 20 && !(await findCellByName(stacksName))) return stacksName;
  }

  const { rows } = await pool.query<{ max: number | null }>(
    `SELECT MAX(cell_name::int) AS max
     FROM cells
     WHERE cell_name ~ '^[0-9]+$'`,
  );
  let candidate = (rows[0]?.max ?? 0) + 1;
  for (let i = 0; i < 50; i += 1) {
    const name = String(candidate);
    if (name.length > 20) break;
    if (!(await findCellByName(name))) return name;
    candidate += 1;
  }

  const fallback = `${cellNumber}-${shelfId.slice(0, 6)}`;
  if (fallback.length <= 20 && !(await findCellByName(fallback))) return fallback;
  throw new HttpError(409, "cannot_allocate_cell_name", {
    preferred,
    shelf_id: shelfId,
    cell_number: cellNumber,
  });
}

/**
 * מוצא תא קיים לפי שם / משבצת במדף, או יוצר אותו (כמו `ensureCell` בייבוא Excel).
 * מאפשר למקם ספר בתא שלא נוצר במיגרציה כי היה ריק.
 *
 * כשהקלט מספרי (למשל «2») — מתייחסים אליו קודם כ־`cell_number` במדף שנבחר.
 * אם השם הגלובלי תפוס בארון אחר, ממשיכים ליצור משבצת במדף עם שם ייחודי חדש.
 */
export async function ensureCellOnShelf(input: {
  shelf_id: string;
  cell_name: string;
  cell_number?: number;
  capacity?: number;
}): Promise<Cell> {
  const shelfId = input.shelf_id;
  const rawName = input.cell_name.trim();
  if (!rawName || rawName.length > 20) {
    throw new HttpError(400, "invalid_cell_name", { cell_name: input.cell_name });
  }

  await assertShelfExists(shelfId);

  const byName = await findCellByName(rawName);
  if (byName && byName.shelf_id === shelfId) return byName;

  const numericFromName = parsePositiveIntName(rawName);
  let cellNumber = input.cell_number ?? numericFromName ?? null;

  if (cellNumber != null) {
    const slot = await findCellByShelfAndNumber(shelfId, cellNumber);
    if (slot) return slot;
  } else {
    cellNumber = await nextCellNumberOnShelf(shelfId);
  }

  /**
   * שם גלובלי תפוס במדף אחר:
   * - אם ביקשו משבצת מספרית במדף הזה — מקצים שם חדש ויוצרים כאן
   * - אחרת (שם טקסטואלי ייחודי שכבר קיים) — קונפליקט
   */
  let cellName = rawName;
  if (byName && byName.shelf_id !== shelfId) {
    if (input.cell_number != null || numericFromName != null) {
      cellName = await allocateUniqueCellName(rawName, shelfId, cellNumber);
    } else {
      throw new HttpError(409, "cell_name_exists_on_other_shelf", {
        cell_name: rawName,
        existing_shelf_id: byName.shelf_id,
        requested_shelf_id: shelfId,
      });
    }
  } else if (!byName) {
    cellName = rawName;
  }

  const capacity = input.capacity ?? (await defaultCapacityForShelf(shelfId));

  try {
    return await upsertCell({
      shelf_id: shelfId,
      cell_number: cellNumber,
      cell_name: cellName,
      capacity,
    });
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err ? (err as { code?: string }).code : "";
    if (code === "23505") {
      const again = await findCellByName(cellName);
      if (again && again.shelf_id === shelfId) return again;
      const bySlot = await findCellByShelfAndNumber(shelfId, cellNumber);
      if (bySlot) return bySlot;
      if (again && again.shelf_id !== shelfId) {
        const retryName = await allocateUniqueCellName(cellName, shelfId, cellNumber);
        return await upsertCell({
          shelf_id: shelfId,
          cell_number: cellNumber,
          cell_name: retryName,
          capacity,
        });
      }
    }
    throw err;
  }
}
