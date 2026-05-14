import "dotenv/config";
import { postgresSslForUrl } from "@avihay-books/shared";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Create backend/.env from backend/.env.example.");
}

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
