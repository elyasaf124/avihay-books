import { loadBackendEnv } from "../config/loadEnv.js";
import { normalizePostgresConnectionString, postgresSslForUrl } from "@avihay-books/shared";
import { Pool, type PoolClient } from "pg";
import { logger } from "../utils/logger.js";
import { recordDbConnect, recordDbQuery } from "../utils/perfContext.js";

loadBackendEnv();

const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) {
  throw new Error("DATABASE_URL is not set. Create backend/.env from backend/.env.example.");
}

const databaseUrl = normalizePostgresConnectionString(rawDatabaseUrl);
const ssl = postgresSslForUrl(databaseUrl);

/**
 * `idleTimeoutMillis` של 30 שניות סגר חיבורים בין פרצי פעילות, וכל חיבור חדש
 * שילם TCP + TLS + SCRAM מחדש (נמדד: 412ms מהארץ ל-`eu-central-1`).
 * 10 דקות שומרות את החיבור חי בין ביקורים של אותו משתמש, ו-`keepAlive` מונע
 * מ-NAT/load balancer להפיל חיבור שקט באמצע.
 */
export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 600_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
  connectionTimeoutMillis: 15_000,
  ...(ssl ? { ssl } : {}),
});

pool.on("error", (err) => {
  console.error("[pg pool] unexpected error on idle client", err);
});

/**
 * מדידת ביצועים
 * ==============
 * כל query נמדד ונצבר ל־`RequestPerf` של הבקשה הנוכחית, כדי שנוכל להפריד
 * בין זמן ה־SQL עצמו (מילישניות בודדות) לבין ה־RTT לשרת ה־DB, שהוא הגורם
 * הדומינטי כשה־API וה־Postgres לא באותו אזור.
 */

const SLOW_QUERY_MS = Number.parseInt(process.env.SLOW_QUERY_LOG_MS ?? "150", 10);
const DB_TIMING_ENABLED = process.env.DB_TIMING_LOG !== "false";

/** מספר החיבורים הפיזיים שנפתחו מאז עליית התהליך — קפיצה כאן = churn של TLS handshakes. */
let physicalConnections = 0;

pool.on("connect", () => {
  physicalConnections += 1;
  if (DB_TIMING_ENABLED) {
    logger.info(
      { physicalConnections, idle: pool.idleCount, total: pool.totalCount },
      "[pg pool] new physical connection",
    );
  }
});

export function poolStats(): {
  physicalConnections: number;
  idle: number;
  total: number;
  waiting: number;
} {
  return {
    physicalConnections,
    idle: pool.idleCount,
    total: pool.totalCount,
    waiting: pool.waitingCount,
  };
}

/** תיוג קצר של ה־query ללוג — שורה אחת, בלי מרווחים כפולים. */
function queryLabel(arg: unknown): string {
  const text =
    typeof arg === "string"
      ? arg
      : typeof arg === "object" && arg !== null && "text" in arg
        ? String((arg as { text?: unknown }).text ?? "")
        : "";
  return text.replace(/\s+/g, " ").trim().slice(0, 70);
}

type PoolQuery = typeof pool.query;
type PoolConnect = typeof pool.connect;

const rawQuery = pool.query.bind(pool) as PoolQuery;
const rawConnect = pool.connect.bind(pool) as PoolConnect;

pool.query = function timedQuery(this: unknown, ...args: unknown[]) {
  // צורת ה־callback של pg — מעבירים כמו שהיא, בלי מדידה.
  if (typeof args[args.length - 1] === "function") {
    return (rawQuery as (...a: unknown[]) => unknown)(...args);
  }
  const label = queryLabel(args[0]);
  const startedAt = process.hrtime.bigint();
  const result = (rawQuery as (...a: unknown[]) => Promise<unknown>)(...args);
  const finish = (): void => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    recordDbQuery(ms, label);
    if (DB_TIMING_ENABLED && ms >= SLOW_QUERY_MS) {
      logger.warn({ ms: Math.round(ms), sql: label }, "[pg] slow query");
    }
  };
  return result.then(
    (value) => {
      finish();
      return value;
    },
    (err: unknown) => {
      finish();
      throw err;
    },
  );
} as PoolQuery;

pool.connect = function timedConnect(this: unknown, ...args: unknown[]) {
  if (typeof args[0] === "function") {
    return (rawConnect as (...a: unknown[]) => unknown)(...args);
  }
  const startedAt = process.hrtime.bigint();
  return (rawConnect as () => Promise<PoolClient>)().then((client) => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    recordDbConnect(ms);
    if (DB_TIMING_ENABLED && ms >= SLOW_QUERY_MS) {
      logger.warn({ ms: Math.round(ms), ...poolStats() }, "[pg] slow pool.connect");
    }
    return client;
  });
} as PoolConnect;
