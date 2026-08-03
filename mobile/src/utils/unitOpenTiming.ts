/**
 * טיימר דיבאג לזרימת פתיחת ארון: לחיצה בדף הבית → תצוגה מוכנה.
 * לוגים בקונסול עם prefix `[UnitOpen #N]`.
 */

type UnitOpenSession = {
  id: number;
  unitId: string;
  t0: number;
  last: number;
};

let sessionSeq = 0;
let session: UnitOpenSession | null = null;

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function startUnitOpenTiming(unitId: string, source: string): void {
  sessionSeq += 1;
  const t = nowMs();
  session = { id: sessionSeq, unitId, t0: t, last: t };
  console.log(`[UnitOpen #${session.id}] START source=${source} unit=${unitId}`);
}

export function markUnitOpen(
  stage: string,
  detail?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!session) return;
  const t = nowMs();
  const total = t - session.t0;
  const delta = t - session.last;
  session.last = t;
  const extra =
    detail && Object.keys(detail).length > 0
      ? ` ${JSON.stringify(detail)}`
      : "";
  console.log(
    `[UnitOpen #${session.id}] +${total.toFixed(0)}ms (Δ${delta.toFixed(0)}ms) ${stage}${extra}`,
  );
}

/** מסמן שלב רק אם הסשן הפעיל שייך לאותו unitId. */
export function markUnitOpenFor(
  unitId: string | null | undefined,
  stage: string,
  detail?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!unitId || !session || session.unitId !== unitId) return;
  markUnitOpen(stage, detail);
}

export function activeUnitOpenSessionId(): number | null {
  return session?.id ?? null;
}
