import "../backend/src/config/loadEnv.js";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { postgresSslForUrl } from "@avihay-books/shared";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "migrations");

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to backend/.env and fill it in.");
  }

  const ssl = postgresSslForUrl(databaseUrl);
  const pool = new Pool({
    connectionString: databaseUrl,
    ...(ssl ? { ssl } : {}),
  });

  try {
    const pingResult = await pool.query<{ now: string }>("SELECT now()::text AS now");
    console.log(`[db] connected: ${databaseUrl.replace(/:[^:@]+@/, ":***@")} (server time ${pingResult.rows[0]!.now})`);

    await pool.query(
      `CREATE TABLE IF NOT EXISTS migrations_history (
         id          SERIAL PRIMARY KEY,
         filename    TEXT NOT NULL UNIQUE,
         applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );

    const applied = new Set<string>(
      (
        await pool.query<{ filename: string }>("SELECT filename FROM migrations_history ORDER BY id")
      ).rows.map((r) => r.filename),
    );

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("[migrate] no .sql files found in", MIGRATIONS_DIR);
      return;
    }

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip  ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO migrations_history (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`[migrate] apply ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[migrate] FAIL  ${file}`);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`[migrate] done. applied ${appliedCount} new migration(s). total registered: ${files.length}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
