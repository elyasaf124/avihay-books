import { pool } from "../db/pool.js";
import { bookInputSchema, type BookInput } from "./schemas.js";
import type { Book } from "@avihay-books/shared";

export async function upsertBook(input: BookInput): Promise<Book> {
  const v = bookInputSchema.parse(input);
  const sql = `
    INSERT INTO books (
      id, title, author, supplier_id, price, stock_quantity, reorder_threshold,
      is_new, added_at, topic, is_active, copy_placement_notes
    )
    VALUES (
      COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7,
      $8, COALESCE($9::timestamptz, now()), $10, $11, COALESCE($12::jsonb, '[]'::jsonb)
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      author = EXCLUDED.author,
      supplier_id = EXCLUDED.supplier_id,
      price = EXCLUDED.price,
      stock_quantity = EXCLUDED.stock_quantity,
      reorder_threshold = EXCLUDED.reorder_threshold,
      is_new = EXCLUDED.is_new,
      added_at = EXCLUDED.added_at,
      topic = EXCLUDED.topic,
      is_active = EXCLUDED.is_active,
      copy_placement_notes = EXCLUDED.copy_placement_notes
    RETURNING *`;
  const notesJson = JSON.stringify(v.copy_placement_notes ?? []);
  const { rows } = await pool.query<Book>(sql, [
    v.id ?? null,
    v.title,
    v.author,
    v.supplier_id,
    v.price,
    v.stock_quantity,
    v.reorder_threshold,
    v.is_new,
    v.added_at ?? null,
    v.topic,
    v.is_active,
    notesJson,
  ]);
  return rows[0]!;
}

export async function findBookById(id: string): Promise<Book | null> {
  const { rows } = await pool.query<Book>("SELECT * FROM books WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function findAllBooks(
  opts: { onlyActive?: boolean; supplierId?: string } = {},
): Promise<Book[]> {
  const parts: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (opts.onlyActive) {
    parts.push("is_active = TRUE");
  }
  if (opts.supplierId) {
    parts.push(`supplier_id = $${i++}`);
    params.push(opts.supplierId);
  }
  const where = parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "";
  const { rows } = await pool.query<Book>(`SELECT * FROM books ${where} ORDER BY title`, params);
  return rows;
}

export async function searchBooks(query: string): Promise<Book[]> {
  const pattern = `%${query}%`;
  const { rows } = await pool.query<Book>(
    `SELECT * FROM books
      WHERE is_active = TRUE
        AND (title ILIKE $1 OR author ILIKE $1 OR topic ILIKE $1)
      ORDER BY title
      LIMIT 50`,
    [pattern],
  );
  return rows;
}

export async function softDeleteBook(id: string): Promise<void> {
  await pool.query("UPDATE books SET is_active = FALSE WHERE id = $1", [id]);
}

export async function adjustBookStock(id: string, delta: number): Promise<Book> {
  const { rows } = await pool.query<Book>(
    `UPDATE books SET stock_quantity = GREATEST(stock_quantity + $2, 0) WHERE id = $1 RETURNING *`,
    [id, delta],
  );
  return rows[0]!;
}
