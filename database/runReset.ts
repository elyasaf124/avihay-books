import "dotenv/config";
import { postgresSslForUrl } from "@avihay-books/shared";
import { Pool } from "pg";

/**
 * Hard reset: drops every user table and enum in the `public` schema, then
 * the migrations_history. Subsequent `npm run db:migrate` rebuilds everything.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

  const ssl = postgresSslForUrl(databaseUrl);
  const pool = new Pool({
    connectionString: databaseUrl,
    ...(ssl ? { ssl } : {}),
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tables = (
      await client.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      )
    ).rows.map((r) => r.tablename);

    if (tables.length > 0) {
      const list = tables.map((t) => `"${t}"`).join(", ");
      await client.query(`DROP TABLE IF EXISTS ${list} CASCADE`);
      console.log(`[reset] dropped ${tables.length} table(s): ${tables.join(", ")}`);
    } else {
      console.log("[reset] no tables to drop");
    }

    const types = (
      await client.query<{ typname: string }>(
        `SELECT t.typname
           FROM pg_type t
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'public' AND t.typtype = 'e'`,
      )
    ).rows.map((r) => r.typname);

    for (const typ of types) {
      await client.query(`DROP TYPE IF EXISTS "${typ}" CASCADE`);
    }
    if (types.length > 0) {
      console.log(`[reset] dropped ${types.length} enum type(s): ${types.join(", ")}`);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
