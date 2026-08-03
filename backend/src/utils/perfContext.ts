import { AsyncLocalStorage } from "node:async_hooks";

/**
 * צובר זמני DB לכל בקשה, כדי להפריד את זמן ה־SQL מזמן ה־RTT ומזמן ה־app.
 * נקרא דרך `AsyncLocalStorage` כך שאין צורך להעביר context ידנית לכל repo.
 */
export interface RequestPerf {
  dbMs: number;
  dbQueries: number;
  /** זמן שהמתנו ל־`pool.connect()` — קופץ כשה־pool נאלץ לפתוח חיבור TLS חדש. */
  dbConnectMs: number;
  dbConnects: number;
  /** ה־query האיטי ביותר בבקשה, לזיהוי מהיר של האשם. */
  slowestMs: number;
  slowestLabel: string;
}

const store = new AsyncLocalStorage<RequestPerf>();

export function runWithRequestPerf<T>(fn: (perf: RequestPerf) => T): T {
  const perf: RequestPerf = {
    dbMs: 0,
    dbQueries: 0,
    dbConnectMs: 0,
    dbConnects: 0,
    slowestMs: 0,
    slowestLabel: "",
  };
  return store.run(perf, () => fn(perf));
}

export function currentRequestPerf(): RequestPerf | undefined {
  return store.getStore();
}

export function recordDbQuery(ms: number, label: string): void {
  const perf = store.getStore();
  if (!perf) return;
  perf.dbMs += ms;
  perf.dbQueries += 1;
  if (ms > perf.slowestMs) {
    perf.slowestMs = ms;
    perf.slowestLabel = label;
  }
}

export function recordDbConnect(ms: number): void {
  const perf = store.getStore();
  if (!perf) return;
  perf.dbConnectMs += ms;
  perf.dbConnects += 1;
}
