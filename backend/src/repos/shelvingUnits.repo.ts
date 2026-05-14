import { pool } from "../db/pool.js";
import { shelvingUnitInputSchema, type ShelvingUnitInput } from "./schemas.js";
import type { ShelvingUnit } from "@avihay-books/shared";

export async function upsertShelvingUnit(input: ShelvingUnitInput): Promise<ShelvingUnit> {
  const v = shelvingUnitInputSchema.parse(input);
  const sql = `
    INSERT INTO shelving_units (id, name, store_position, has_sides, is_display_unit, display_order)
    VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      store_position = EXCLUDED.store_position,
      has_sides = EXCLUDED.has_sides,
      is_display_unit = EXCLUDED.is_display_unit,
      display_order = EXCLUDED.display_order
    RETURNING *`;
  const { rows } = await pool.query<ShelvingUnit>(sql, [
    v.id ?? null,
    v.name,
    v.store_position,
    v.has_sides,
    v.is_display_unit,
    v.display_order,
  ]);
  return rows[0]!;
}

export async function findShelvingUnitById(id: string): Promise<ShelvingUnit | null> {
  const { rows } = await pool.query<ShelvingUnit>(
    "SELECT * FROM shelving_units WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function findAllShelvingUnits(): Promise<ShelvingUnit[]> {
  const { rows } = await pool.query<ShelvingUnit>(
    "SELECT * FROM shelving_units ORDER BY display_order, name",
  );
  return rows;
}
