/**
 * טיימר דיבאג ללחיצה על ספר (סימון חוסר / החזרה).
 * מודד שלושה דברים בנפרד: כמה זמן עד שהמצב האופטימי נקבע (`state_set`),
 * כמה זמן לקח לשרת (`server_ack`), וכמה זמן עד שהעץ סיים להתרנדר (`repaint`).
 */

import { spineCounters } from "./spineRenderCounter";

type TapDetail = Record<string, string | number | boolean | null | undefined>;

let tapSeq = 0;

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export interface BookTapTimer {
  mark: (stage: string, detail?: TapDetail) => void;
}

export function startBookTapTiming(action: string, locationId: string): BookTapTimer {
  tapSeq += 1;
  const id = tapSeq;
  const t0 = nowMs();
  let last = t0;
  console.log(`[BookTap #${id}] START action=${action} location=${locationId}`);

  return {
    mark: (stage, detail) => {
      const t = nowMs();
      const total = t - t0;
      const delta = t - last;
      last = t;
      const payload = { ...spineCounters(), ...detail };
      console.log(
        `[BookTap #${id}] +${total.toFixed(0)}ms (Δ${delta.toFixed(0)}ms) ${stage} ${JSON.stringify(payload)}`,
      );
    },
  };
}
