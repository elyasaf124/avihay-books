import "../backend/src/config/loadEnv.js";
import { pool } from "../backend/src/db/pool.js";

async function main() {
  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM books) AS books,
      (SELECT COUNT(*)::int FROM book_locations) AS locations,
      (SELECT COUNT(*)::int FROM shortage_list WHERE status = 'shortage') AS shortages,
      (SELECT COUNT(*)::int FROM orders WHERE order_type = 'inventory') AS inventory_orders,
      (SELECT COUNT(*)::int FROM suppliers) AS suppliers,
      (SELECT COUNT(*)::int FROM books WHERE author IS NULL) AS null_author,
      (SELECT COUNT(*)::int FROM books WHERE price IS NULL) AS null_price,
      (SELECT COUNT(*)::int FROM books WHERE title = '???') AS qqq
  `);
  console.log("counts", counts.rows[0]);

  const units = await pool.query(`
    SELECT name, store_position::text AS pos, display_order
    FROM shelving_units
    ORDER BY display_order
  `);
  console.log("units", units.rows);

  const brochure = await pool.query(`
    SELECT c.cell_name, s.shelf_number
    FROM cells c
    JOIN shelves s ON s.id = c.shelf_id
    JOIN shelving_units u ON u.id = s.unit_id
    WHERE u.store_position = 'brochure'
    ORDER BY s.shelf_number
  `);
  console.log("brochure cells", brochure.rows);

  const stockMismatch = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM books b
    WHERE b.stock_quantity < COALESCE(
      (SELECT SUM(bl.quantity_in_cell) FROM book_locations bl WHERE bl.book_id = b.id),
      0
    )
  `);
  console.log("stock_lt_on_shelf", stockMismatch.rows[0]);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
