const PG_SSL_QUERY_PARAMS = ["sslmode", "uselibpqcompat"] as const;

/**
 * Strips `sslmode` / `uselibpqcompat` from the URL so `pg` does not emit SSL-mode
 * deprecation warnings; TLS is configured via `postgresSslForUrl` instead.
 */
export function normalizePostgresConnectionString(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    let changed = false;
    for (const key of PG_SSL_QUERY_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? url.toString() : databaseUrl;
  } catch {
    return databaseUrl;
  }
}

/**
 * `Neon`, `Supabase`, `RDS` דורשים לרוב חיבור `TLS`; בפיתוח מקומי בדרך כלל לא.
 */
export function postgresSslForUrl(databaseUrl: string): false | { rejectUnauthorized: false } {
  if (process.env.DATABASE_SSL === "false") return false;

  // Parse the URL instead of splitting at `@`: a password may legally contain
  // an encoded `@` (or even a raw one in existing local env files).
  let host = "";
  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    // Unknown/malformed URLs default to TLS below.
  }

  const isLocalHost =
    host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");

  return isLocalHost ? false : { rejectUnauthorized: false };
}
