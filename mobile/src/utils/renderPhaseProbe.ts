/**
 * בדיקת ביצועים: heartbeat שמזהה חסימה של ה־JS thread, ומדידת שלבים בתוך render.
 * כבוי כברירת מחדל — מפעילים עם `EXPO_PUBLIC_PERF_PROBE=1` ב־`.env.development`,
 * כי ה־heartbeat עצמו מעיר את ה־JS thread כל 100ms.
 */
const enabled = __DEV__ && process.env.EXPO_PUBLIC_PERF_PROBE === "1";

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

let heartbeat: ReturnType<typeof setInterval> | null = null;
let lastBeat = 0;

/** מדפיס כל פעם שה־event loop נחסם ליותר מ־`thresholdMs`. */
export function startJsBlockHeartbeat(thresholdMs = 250, intervalMs = 100): void {
  if (!enabled || heartbeat != null) return;
  lastBeat = now();
  heartbeat = setInterval(() => {
    const t = now();
    const gap = t - lastBeat;
    lastBeat = t;
    if (gap > thresholdMs) {
      console.log(`[JsBlock] event loop blocked ${Math.round(gap)}ms`);
    }
  }, intervalMs);
}

export function stopJsBlockHeartbeat(): void {
  if (heartbeat != null) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

/** מודד קטע בתוך render ומדפיס אם הוא ארוך מ־`minMs`. */
export function timePhase<T>(label: string, fn: () => T, minMs = 30): T {
  if (!enabled) return fn();
  const t0 = now();
  const result = fn();
  const ms = now() - t0;
  if (ms >= minMs) console.log(`[Phase] ${label} ${Math.round(ms)}ms`);
  return result;
}

let renderSeq = 0;

/** מדפיס את משך גוף ה־render של רכיב (נקרא בתחילת ה־render, מחזיר סוגר). */
export function beginRender(label: string): () => void {
  if (!enabled) return () => undefined;
  const seq = ++renderSeq;
  const t0 = now();
  return () => {
    const ms = now() - t0;
    if (ms >= 30) console.log(`[Render #${seq}] ${label} body ${Math.round(ms)}ms`);
  };
}
