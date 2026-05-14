import { pool } from "../db/pool.js";
import { unitSideInputSchema, type UnitSideInput } from "./schemas.js";
import type { UnitSide } from "@avihay-books/shared";

export async function upsertUnitSide(input: UnitSideInput): Promise<UnitSide> {
  const v = unitSideInputSchema.parse(input);
  const sql = `
    INSERT INTO unit_sides (id, unit_id, side_label, side_order)
    VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET
      unit_id = EXCLUDED.unit_id,
      side_label = EXCLUDED.side_label,
      side_order = EXCLUDED.side_order
    RETURNING *`;
  const { rows } = await pool.query<UnitSide>(sql, [
    v.id ?? null,
    v.unit_id,
    v.side_label,
    v.side_order,
  ]);
  return rows[0]!;
}

export async function findUnitSidesByUnit(unitId: string): Promise<UnitSide[]> {
  const { rows } = await pool.query<UnitSide>(
    "SELECT * FROM unit_sides WHERE unit_id = $1 ORDER BY side_order",
    [unitId],
  );
  return rows;
}

export async function findAllUnitSides(): Promise<UnitSide[]> {
  const { rows } = await pool.query<UnitSide>(
    "SELECT * FROM unit_sides ORDER BY unit_id, side_order",
  );
  return rows;
}
