import { pool } from "../db/pool.js";
import { cellInputSchema, type CellInput } from "./schemas.js";
import type { Cell } from "@avihay-books/shared";

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
