/**
 * חד-פעמי: יוצר תא «תצוגה חלון» בארון התצוגה ומעביר אליו את 17 הספרים
 * שנבלעו לתא «תצוגה» בייבוא האקסל (התנגשות cell_number=1).
 *
 * Usage:
 *   npx tsx scripts/fixDisplayWindowCell.ts
 *   npx tsx scripts/fixDisplayWindowCell.ts --dry-run
 */
import "../backend/src/config/loadEnv.js";
import { createHash } from "node:crypto";
import { pool } from "../backend/src/db/pool.js";

/** כותרות מאקסל (עמודת שם תא = תצוגה חלון) — תואמות ל-DB אחרי הייבוא. */
const WINDOW_TITLES = [
  "אהלי הלכה חלק ב': מועדים",
  "בנפש השבת: קובץ דברי תורה לפרשות השבוע ולמועדים (גדול)",
  "בנפש התורה: שיעורים בספר אורות התורה (סט ב' כרכים, מהדורה חדשה, גדול)",
  "בנפש התשובה: שיעורים בספר אורות התשובה (סט ב' כרכים, מהדורה חדשה, גדול)",
  "בנפש התשובה: שיעורים בספר אורות התשובה (סט ב' כרכים, מהדורה חדשה, כיס)",
  "הגדולה והגבורה: גבורתם של תלמידי חכמים בדורות הגאולה",
  "העמק דבר (גדול)",
  "ואת צנועים חכמה: שיחות בנושא צניעות",
  'חומש רש"ר הירש (סט ה\' כרכים)',
  "מחזור כוונת הלב (סט ה' כרכים, גדול)",
  "מסילת ישרים לחיילים (סט ו' כרכים)",
  "מקראות גדולות תורה: המאור (גדול)",
  "מקראות גדולות תורה: יפה עיניים (סט)",
  'מקראות גדולות: עוז והדר (סט מ"ח חוברות, גדול)',
  'מקראות גדולות: עוז והדר (סט מ"ח חוברות, קטן)',
  "קדשנו בתורתך: שמירת הטהרה מתוך גבורתה של תורה",
  // באקסל: «שניים מקרא אחד תרגום…»; ב-DB אחרי ייבוא:
  "שניים מקרא ואחד תרגום (סט ב' כרכים גדול)",
] as const;

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

  const display = await pool.query<{
    cell_id: string;
    shelf_id: string;
    cell_name: string;
  }>(`
    SELECT c.id AS cell_id, c.shelf_id, c.cell_name
      FROM cells c
      JOIN shelves s ON s.id = c.shelf_id
      JOIN shelving_units u ON u.id = s.unit_id
     WHERE u.store_position = 'display'
     ORDER BY c.cell_number
  `);

  const tatzuga = display.rows.find((r) => r.cell_name === "תצוגה");
  if (!tatzuga) {
    throw new Error('לא נמצא תא «תצוגה» בארון התצוגה');
  }

  let windowCell = display.rows.find((r) => r.cell_name === "תצוגה חלון");
  const newCellId = deterministicUuid("cell", "display-window");

  if (!windowCell) {
    console.log(
      dryRun
        ? `[dry-run] would create cell «תצוגה חלון» on shelf ${tatzuga.shelf_id}`
        : `creating cell «תצוגה חלון» on shelf ${tatzuga.shelf_id}`,
    );
    if (!dryRun) {
      await pool.query(
        `INSERT INTO cells (id, shelf_id, cell_number, cell_name, capacity)
         VALUES ($1, $2, 2, 'תצוגה חלון', 200)
         ON CONFLICT (cell_name) DO NOTHING`,
        [newCellId, tatzuga.shelf_id],
      );
      const created = await pool.query<{ id: string }>(
        `SELECT id FROM cells WHERE cell_name = 'תצוגה חלון'`,
      );
      windowCell = {
        cell_id: created.rows[0]!.id,
        shelf_id: tatzuga.shelf_id,
        cell_name: "תצוגה חלון",
      };
    } else {
      windowCell = {
        cell_id: newCellId,
        shelf_id: tatzuga.shelf_id,
        cell_name: "תצוגה חלון",
      };
    }
  } else {
    console.log(`cell «תצוגה חלון» already exists: ${windowCell.cell_id}`);
  }

  const locs = await pool.query<{ id: string; title: string }>(
    `
    SELECT bl.id, b.title
      FROM book_locations bl
      JOIN books b ON b.id = bl.book_id
     WHERE bl.cell_id = $1
       AND b.title = ANY($2::text[])
     ORDER BY b.title
    `,
    [tatzuga.cell_id, [...WINDOW_TITLES]],
  );

  console.log(
    dryRun
      ? `[dry-run] would move ${locs.rowCount ?? 0} location(s) → תצוגה חלון`
      : `moving ${locs.rowCount ?? 0} location(s) → תצוגה חלון`,
  );
  for (const row of locs.rows) {
    console.log("  ", row.title);
  }

  const found = new Set(locs.rows.map((r) => r.title));
  const missing = WINDOW_TITLES.filter((t) => !found.has(t));
  if (missing.length > 0) {
    console.warn("titles not found under תצוגה:");
    for (const t of missing) console.warn("  ", t);
  }

  if (!dryRun && (locs.rowCount ?? 0) > 0) {
    await pool.query(
      `UPDATE book_locations SET cell_id = $1 WHERE id = ANY($2::uuid[])`,
      [windowCell.cell_id, locs.rows.map((r) => r.id)],
    );
  }

  const counts = await pool.query<{ cell_name: string; n: string }>(`
    SELECT c.cell_name, COUNT(bl.id)::text AS n
      FROM cells c
      LEFT JOIN book_locations bl ON bl.cell_id = c.id
      JOIN shelves s ON s.id = c.shelf_id
      JOIN shelving_units u ON u.id = s.unit_id
     WHERE u.store_position = 'display'
     GROUP BY c.cell_name
     ORDER BY c.cell_name
  `);
  console.log("display cell counts:");
  for (const row of counts.rows) {
    console.log(`  ${row.cell_name}: ${row.n}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
