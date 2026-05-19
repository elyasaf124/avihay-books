import { loadBackendEnv } from "../config/loadEnv.js";
import { normalizePostgresConnectionString, postgresSslForUrl } from "@avihay-books/shared";
import { Pool } from "pg";

loadBackendEnv();

const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) {
  throw new Error("DATABASE_URL is not set. Create backend/.env from backend/.env.example.");
}

const databaseUrl = normalizePostgresConnectionString(rawDatabaseUrl);
const ssl = postgresSslForUrl(databaseUrl);

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  ...(ssl ? { ssl } : {}),
});

pool.on("error", (err) => {
  console.error("[pg pool] unexpected error on idle client", err);
});
