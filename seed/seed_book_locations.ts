import { pool } from "../backend/src/db/pool.js";
import { upsertBookLocation } from "../backend/src/repos/bookLocations.repo.js";
import { bookLocations, books } from "./fixtures.js";

export async function seed(): Promise<void> {
  await pool.query("DELETE FROM book_locations");
  // Invariant from the brief: SUM(quantity_in_cell) across all rows for a
  // given book must equal books.stock_quantity. Verify against fixtures here.
  const totals = new Map<string, number>();
  for (const bl of bookLocations) {
    totals.set(bl.book_id, (totals.get(bl.book_id) ?? 0) + bl.quantity_in_cell);
  }
  for (const b of books) {
    const sum = totals.get(b.id!) ?? 0;
    if (sum !== b.stock_quantity) {
      throw new Error(
        `[seed] book_locations invariant failed for "${b.title}": sum=${sum}, stock=${b.stock_quantity}`,
      );
    }
  }
  for (const bl of bookLocations) await upsertBookLocation(bl);
  console.log(`[seed] book_locations: ${bookLocations.length}`);
}
