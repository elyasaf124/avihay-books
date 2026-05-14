import { pool } from "../db/pool.js";
import { supplierInputSchema, type SupplierInput } from "./schemas.js";
import type { Supplier } from "@avihay-books/shared";

export async function upsertSupplier(input: SupplierInput): Promise<Supplier> {
  const v = supplierInputSchema.parse(input);
  const sql = `
    INSERT INTO suppliers (id, name, color_hex, email, last_order_date)
    VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          color_hex = EXCLUDED.color_hex,
          email = EXCLUDED.email,
          last_order_date = EXCLUDED.last_order_date
    RETURNING *`;
  const { rows } = await pool.query<Supplier>(sql, [
    v.id ?? null,
    v.name,
    v.color_hex,
    v.email,
    v.last_order_date ?? null,
  ]);
  return rows[0]!;
}

export async function findSupplierById(id: string): Promise<Supplier | null> {
  const { rows } = await pool.query<Supplier>("SELECT * FROM suppliers WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function findAllSuppliers(): Promise<Supplier[]> {
  const { rows } = await pool.query<Supplier>("SELECT * FROM suppliers ORDER BY name");
  return rows;
}

export async function updateSupplierLastOrderDate(id: string, when: string): Promise<void> {
  await pool.query("UPDATE suppliers SET last_order_date = $2 WHERE id = $1", [id, when]);
}
