/**
 * חד-פעמי: לכל `book_locations` עם `quantity_in_cell = 0` בלי חוסר פתוח —
 * יוצרים רשומת `shortage_list` עם אותו `location_id` (לטשטוש על המדף).
 *
 * Usage:
 *   npx tsx scripts/backfillZeroQtyShortages.ts
 *   npx tsx scripts/backfillZeroQtyShortages.ts --dry-run
 */
import "../backend/src/config/loadEnv.js";
import { createHash } from "node:crypto";
import { pool } from "../backend/src/db/pool.js";

function deterministicUuid(label: string, seq: string): string {
  const h = createHash("sha256").update(`${label}:${seq}`).digest();
  const b = Uint8Array.from(h.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const candidates = await pool.query<{ id: string; book_id: string }>(`
    SELECT bl.id, bl.book_id
      FROM book_locations bl
     WHERE bl.quantity_in_cell = 0
       AND NOT EXISTS (
         SELECT 1
           FROM shortage_list sl
          WHERE sl.location_id = bl.id
            AND sl.status <> 'completed'
       )
     ORDER BY bl.id
  `);

  console.log(
    dryRun
      ? `[dry-run] would create ${candidates.rowCount ?? 0} shortage row(s)`
      : `creating shortage for ${candidates.rowCount ?? 0} zero-qty location(s)`,
  );

  if (dryRun) {
    for (const row of candidates.rows.slice(0, 20)) {
      console.log("  ", row.id, row.book_id);
    }
    if ((candidates.rowCount ?? 0) > 20) console.log("  …");
    await pool.end();
    return;
  }

  let created = 0;
  for (const row of candidates.rows) {
    const id = deterministicUuid("shortage", row.id);
    const r = await pool.query(
      `INSERT INTO shortage_list (id, book_id, status, location_id)
       VALUES ($1, $2, 'shortage', $3)
       ON CONFLICT (id) DO UPDATE SET
         book_id = EXCLUDED.book_id,
         status = 'shortage',
         location_id = COALESCE(EXCLUDED.location_id, shortage_list.location_id),
         resolved_at = NULL
       RETURNING id`,
      [id, row.book_id, row.id],
    );
    if ((r.rowCount ?? 0) > 0) created += 1;
  }

  console.log(`done: ${created} shortage row(s) upserted`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
