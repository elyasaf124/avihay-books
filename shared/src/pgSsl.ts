/**
 * `Neon`, `Supabase`, `RDS` דורשים לרוב חיבור `TLS`; בפיתוח מקומי בדרך כלל לא.
 */
export function postgresSslForUrl(databaseUrl: string): false | { rejectUnauthorized: false } {
  if (process.env.DATABASE_SSL === "false") return false;

  const m = /@([^/?:]+)/.exec(databaseUrl);
  const host = m?.[1] ?? "";

  const isLocalHost =
    host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");

  return isLocalHost ? false : { rejectUnauthorized: false };
}
