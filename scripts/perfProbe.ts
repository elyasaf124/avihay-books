/**
 * מודד ביצועים של מסך הארון בשתי שכבות בנפרד, כדי להפריד בין RTT, SQL ו־app:
 *
 *  1. HTTP  — מכה ב־endpoints של ה־API N פעמים ומדפיס TTFB / total / bytes / Server-Timing.
 *  2. DB    — מודד `SELECT 1` (RTT טהור), `pool.connect()` (עלות חיבור חדש)
 *             ואת `getStoreMapUnit()` האמיתי עם ניקוי cache לפני כל הרצה.
 *
 * Usage:
 *   npx tsx scripts/perfProbe.ts --base=https://avihay-books-api.onrender.com --key=<APP_API_KEY>
 *   npx tsx scripts/perfProbe.ts --db-only
 *   npx tsx scripts/perfProbe.ts --http-only --runs=10
 *
 * ה־base וה־key נלקחים גם מ־env: `PERF_API_BASE_URL` / `PERF_API_KEY` (או `APP_API_KEY`).
 */
import "../backend/src/config/loadEnv.js";

interface Sample {
  ttfbMs: number;
  totalMs: number;
  bytes: number;
  status: number;
  serverTiming?: string;
  encoding?: string;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

const HAS_FLAG = (name: string): boolean => process.argv.includes(`--${name}`);

const RUNS = Number.parseInt(arg("runs") ?? "5", 10);
const BASE_URL = (
  arg("base") ??
  process.env.PERF_API_BASE_URL ??
  "https://avihay-books-api.onrender.com"
).replace(/\/+$/, "");
const API_KEY = arg("key") ?? process.env.PERF_API_KEY ?? process.env.APP_API_KEY ?? "";

function ms(from: bigint): number {
  return Number(process.hrtime.bigint() - from) / 1e6;
}

function stats(values: number[]): string {
  if (values.length === 0) return "n/a";
  const sorted = [...values].sort((a, b) => a - b);
  const p = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return `min=${sorted[0]!.toFixed(0)} p50=${p(0.5).toFixed(0)} max=${sorted[sorted.length - 1]!.toFixed(0)}`;
}

async function probeHttp(path: string): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const startedAt = process.hrtime.bigint();
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: API_KEY ? { "x-api-key": API_KEY } : {},
      });
      const ttfbMs = ms(startedAt);
      const body = await res.arrayBuffer();
      samples.push({
        ttfbMs,
        totalMs: ms(startedAt),
        bytes: body.byteLength,
        status: res.status,
        serverTiming: res.headers.get("server-timing") ?? undefined,
        encoding: res.headers.get("content-encoding") ?? "identity",
      });
    } catch (err) {
      console.log(`    run ${i + 1}: FAILED ${(err as Error).message}`);
    }
  }
  return samples;
}

function reportHttp(label: string, samples: Sample[]): void {
  if (samples.length === 0) {
    console.log(`  ${label}: no successful samples`);
    return;
  }
  const first = samples[0]!;
  console.log(`  ${label}`);
  console.log(`    status=${first.status} encoding=${first.encoding} bytes=${first.bytes}`);
  console.log(`    ttfb  ${stats(samples.map((s) => s.ttfbMs))} ms`);
  console.log(`    total ${stats(samples.map((s) => s.totalMs))} ms`);
  for (const s of samples) {
    if (s.serverTiming) {
      console.log(`    Server-Timing: ${s.serverTiming}`);
      break;
    }
  }
}

async function runHttpProbe(): Promise<void> {
  console.log(`\n=== HTTP probe (${RUNS} runs) — ${BASE_URL} ===`);
  if (!API_KEY) {
    console.log("  ⚠ no API key given (--key / PERF_API_KEY / APP_API_KEY) — protected routes will 401");
  }

  reportHttp("GET /api/v1/health", await probeHttp("/api/v1/health"));
  reportHttp("GET /api/v1/store-map/summary", await probeHttp("/api/v1/store-map/summary"));

  const unitId = arg("unit");
  if (unitId) {
    reportHttp(`GET /api/v1/store-map/units/${unitId}`, await probeHttp(`/api/v1/store-map/units/${unitId}`));
    return;
  }

  // בלי --unit: שולפים את רשימת הארונות מה־summary וממדדים את כולם.
  try {
    const res = await fetch(`${BASE_URL}/api/v1/store-map/summary`, {
      headers: API_KEY ? { "x-api-key": API_KEY } : {},
    });
    if (!res.ok) {
      console.log(`  (skipping per-unit probe — summary returned ${res.status})`);
      return;
    }
    const summary = (await res.json()) as { units: { id: string; name: string }[] };
    for (const unit of summary.units) {
      reportHttp(
        `GET /store-map/units/:id  [${unit.name}]`,
        await probeHttp(`/api/v1/store-map/units/${unit.id}`),
      );
    }
  } catch (err) {
    console.log(`  (skipping per-unit probe — ${(err as Error).message})`);
  }
}

async function runDbProbe(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("\n=== DB probe skipped — DATABASE_URL not set ===");
    return;
  }

  const { pool } = await import("../backend/src/db/pool.js");
  const { getStoreMapUnit } = await import("../backend/src/services/storeMap.js");
  const { invalidateStoreMapCache } = await import("../backend/src/services/storeMapCache.js");

  let host = "unknown";
  try {
    host = new URL(process.env.DATABASE_URL).host;
  } catch {
    /* ignore */
  }
  console.log(`\n=== DB probe (${RUNS} runs) — ${host} (pooled=${host.includes("-pooler")}) ===`);

  // חיבור ראשון — כולל TCP + TLS + SCRAM. זה המחיר שמשולם בכל reconnect.
  const coldStart = process.hrtime.bigint();
  const cold = await pool.connect();
  const coldMs = ms(coldStart);
  cold.release();
  console.log(`  cold pool.connect(): ${coldMs.toFixed(0)} ms`);

  const warmConnect: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const t = process.hrtime.bigint();
    const client = await pool.connect();
    warmConnect.push(ms(t));
    client.release();
  }
  console.log(`  warm pool.connect(): ${stats(warmConnect)} ms`);

  // `SELECT 1` = RTT טהור, בלי שום עבודת SQL.
  const rtt: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const t = process.hrtime.bigint();
    await pool.query("SELECT 1");
    rtt.push(ms(t));
  }
  console.log(`  SELECT 1 (pure RTT): ${stats(rtt)} ms`);

  const units = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM shelving_units ORDER BY display_order",
  );

  for (const unit of units.rows) {
    const durations: number[] = [];
    let spines = 0;
    for (let i = 0; i < RUNS; i += 1) {
      invalidateStoreMapCache();
      const t = process.hrtime.bigint();
      const result = await getStoreMapUnit(unit.id);
      durations.push(ms(t));
      if (i === 0 && result) {
        const shelves = result.has_sides ? result.sides.flatMap((s) => s.shelves) : result.shelves;
        for (const shelf of shelves) {
          for (const cell of shelf.cells) {
            for (const b of cell.books) {
              const qty = Math.max(0, Math.floor(Number(b.quantity_in_cell)));
              const shortageCount = Math.max(
                0,
                Math.floor(
                  Number(b.pending_shortage_count ?? (b.is_pending_shortage ? 1 : 0)),
                ),
              );
              spines += qty + shortageCount;
            }
          }
        }
      }
    }
    console.log(`  getStoreMapUnit [${unit.name}] spines=${spines}: ${stats(durations)} ms`);
  }

  await pool.end();
}

async function main(): Promise<void> {
  const dbOnly = HAS_FLAG("db-only");
  const httpOnly = HAS_FLAG("http-only");

  if (!dbOnly) await runHttpProbe();
  if (!httpOnly) await runDbProbe();
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
