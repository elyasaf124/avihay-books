/**
 * מונה דיבאג לעלות הרינדור של שדרות הספרים (`BookSpine`).
 * זה המספר שמסביר את זמן הצביעה של ארון — כל שדרה היא כמה views נייטיביים.
 * מאופס בכל פתיחת ארון, ונקרא ב־`ui_painted_ready`.
 */

let renders = 0;
let mounts = 0;

export function countSpineRender(): void {
  renders += 1;
}

export function countSpineMount(): void {
  mounts += 1;
}

export function resetSpineCounters(): void {
  renders = 0;
  mounts = 0;
}

export function spineCounters(): { spineRenders: number; spineMounts: number } {
  return { spineRenders: renders, spineMounts: mounts };
}
