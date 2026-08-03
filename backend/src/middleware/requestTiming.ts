import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";
import { poolStats, pool } from "../db/pool.js";
import { runWithRequestPerf, type RequestPerf } from "../utils/perfContext.js";

/** נתיבים שלא מעניין אותנו לתעד — health checks של Render כל כמה שניות. */
const SKIP_PATHS = new Set(["/api/v1/health"]);

function buildServerTiming(perf: RequestPerf, totalMs: number): string {
  const appMs = Math.max(totalMs - perf.dbMs - perf.dbConnectMs, 0);
  const parts = [
    `db;dur=${perf.dbMs.toFixed(1)}`,
    `dbconnect;dur=${perf.dbConnectMs.toFixed(1)}`,
    `app;dur=${appMs.toFixed(1)}`,
    `total;dur=${totalMs.toFixed(1)}`,
  ];
  return parts.join(", ");
}

/**
 * מודד כל בקשה ומדפיס `durationMs`, זמן DB, מספר queries וגודל התשובה על החוט.
 * בנוסף מחזיר header `Server-Timing` כדי שהקליינט יראה את הפירוק בלי לגשת ללוגים.
 *
 * חייב לרוץ *לפני* `compression`, כדי שמניית ה־bytes תראה את מה שיצא בפועל לרשת
 * (compression עוטף את `res.write`/`res.end` שלנו ומעביר אלינו את הבייטים הדחוסים).
 */
export function requestTiming(req: Request, res: Response, next: NextFunction): void {
  if (SKIP_PATHS.has(req.path)) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();
  const elapsedMs = (): number => Number(process.hrtime.bigint() - startedAt) / 1e6;

  runWithRequestPerf((perf) => {
    let wireBytes = 0;

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    res.write = function countedWrite(chunk: unknown, ...rest: unknown[]) {
      if (chunk != null) wireBytes += Buffer.byteLength(chunk as string | Buffer);
      return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
    } as typeof res.write;

    res.end = function countedEnd(chunk: unknown, ...rest: unknown[]) {
      if (chunk != null && typeof chunk !== "function") {
        wireBytes += Buffer.byteLength(chunk as string | Buffer);
      }
      return (originalEnd as (...a: unknown[]) => Response)(chunk, ...rest);
    } as typeof res.end;

    /**
     * `writeHead` הוא הצוואר היחיד שדרכו ה־headers נשלחים, ולכן זה המקום להוסיף
     * את `Server-Timing`. אי אפשר לעשות זאת ב־`res.end` — `compression` עוטף את
     * `write`/`end` *אחרינו*, וכשה־`end` שלנו מגיע לתורו ה־headers כבר נשלחו.
     */
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = function timedWriteHead(...args: unknown[]) {
      if (!res.headersSent) {
        res.setHeader("Server-Timing", buildServerTiming(perf, elapsedMs()));
      }
      return (originalWriteHead as (...a: unknown[]) => Response)(...args);
    } as typeof res.writeHead;

    res.on("finish", () => {
      const totalMs = elapsedMs();
      logger.info(
        {
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          totalMs: Math.round(totalMs),
          dbMs: Math.round(perf.dbMs),
          dbQueries: perf.dbQueries,
          dbConnectMs: Math.round(perf.dbConnectMs),
          slowestMs: Math.round(perf.slowestMs),
          slowestSql: perf.slowestLabel || undefined,
          wireBytes,
          encoding: res.getHeader("content-encoding") ?? "identity",
          poolWaiting: poolStats().waiting,
        },
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(totalMs)}ms`,
      );
    });

    next();
  });
}

/** מדפיס פעם אחת בעלייה לאיזה host מתחברים — קריטי לאימות pooled vs direct ואזור. */
export function logDatabaseTarget(): void {
  const raw = process.env.DATABASE_URL ?? "";
  let host = "unknown";
  try {
    host = new URL(raw).host;
  } catch {
    host = "unparsable";
  }
  logger.info(
    {
      host,
      pooled: host.includes("-pooler"),
      poolMax: (pool as unknown as { options?: { max?: number } }).options?.max,
    },
    "[db] connection target",
  );
}
