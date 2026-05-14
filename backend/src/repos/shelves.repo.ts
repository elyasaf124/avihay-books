import { pool } from "../db/pool.js";
import { shelfInputSchema, type ShelfInput } from "./schemas.js";
import type { Shelf } from "@avihay-books/shared";

export async function upsertShelf(input: ShelfInput): Promise<Shelf> {
  const v = shelfInputSchema.parse(input);
  const sql = `
    INSERT INTO shelves (id, unit_id, side_id, shelf_number, label)
    VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET
      unit_id = EXCLUDED.unit_id,
      side_id = EXCLUDED.side_id,
      shelf_number = EXCLUDED.shelf_number,
      label = EXCLUDED.label
    RETURNING *`;
  const { rows } = await pool.query<Shelf>(sql, [
    v.id ?? null,
    v.unit_id ?? null,
    v.side_id ?? null,
    v.shelf_number,
    v.label ?? null,
  ]);
  return rows[0]!;
}

export async function findShelvesByUnit(unitId: string): Promise<Shelf[]> {
  const { rows } = await pool.query<Shelf>(
    "SELECT * FROM shelves WHERE unit_id = $1 ORDER BY shelf_number",
    [unitId],
  );
  return rows;
}

export async function findShelvesBySide(sideId: string): Promise<Shelf[]> {
  const { rows } = await pool.query<Shelf>(
    "SELECT * FROM shelves WHERE side_id = $1 ORDER BY shelf_number",
    [sideId],
  );
  return rows;
}
