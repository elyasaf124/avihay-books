/**
 * מספר השדרות בארון נגזר מ-`shelf_stock` בלבד:
 * פיזיים = `quantity_in_cell`, חוסרים = השאר עד היעד.
 * אם `shelf_stock` חסר (cache ישן) — נספר qty + חוסרים כפי שהיה.
 */
export function spineDisplayCounts(book: {
  quantity_in_cell: number;
  shelf_stock?: number;
  pending_shortage_count?: number;
  is_pending_shortage?: boolean;
}): { physical: number; ghosts: number; total: number } {
  const physical = Math.max(0, Math.floor(Number(book.quantity_in_cell)));
  const pendingRaw = book.pending_shortage_count;
  const pending =
    pendingRaw != null && Number.isFinite(Number(pendingRaw))
      ? Math.max(0, Math.floor(Number(pendingRaw)))
      : book.is_pending_shortage
        ? 1
        : 0;
  const shelfRaw = book.shelf_stock;
  const shelf =
    shelfRaw != null && Number.isFinite(Number(shelfRaw))
      ? Math.max(0, Math.floor(Number(shelfRaw)))
      : null;
  /**
   * יעד השדרות = המקסימום בין מלאי-מדף, פיזיים, ופיזיים+חוסרים.
   * אם `shelf_stock` נשאר מאחורי `quantity_in_cell` (מיזוג עותקים בלי עדכון יעד),
   * סימון חוסר עדיין חייב להשאיר שדרה מטושטשת ולא להעלים עותק.
   */
  const total = Math.max(physical, shelf ?? 0, physical + pending);
  return { physical, total, ghosts: total - physical };
}

/**
 * בוחר אילו סלוטי שדרה (0..total-1) יוצגו כחוסר.
 * מעדיף אינדקסים שנבחרו בלחיצה; משלים מהסוף אם חסר.
 */
export function resolveGhostSpineSlots(
  totalSlots: number,
  shortageCount: number,
  preferredSlots?: readonly number[] | null,
): Set<number> {
  const ghosts = new Set<number>();
  if (totalSlots <= 0 || shortageCount <= 0) return ghosts;

  if (preferredSlots) {
    for (const idx of preferredSlots) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= totalSlots) continue;
      ghosts.add(idx);
      if (ghosts.size >= shortageCount) return ghosts;
    }
  }

  for (let i = totalSlots - 1; i >= 0 && ghosts.size < shortageCount; i -= 1) {
    ghosts.add(i);
  }
  return ghosts;
}

export function addPreferredGhostSlot(
  prev: ReadonlyMap<string, readonly number[]>,
  locationId: string,
  slot: number,
): Map<string, number[]> {
  const next = new Map<string, number[]>();
  for (const [k, v] of prev) next.set(k, [...v]);
  const cur = next.get(locationId) ?? [];
  if (!cur.includes(slot)) {
    next.set(locationId, [...cur, slot]);
  }
  return next;
}

export function removePreferredGhostSlot(
  prev: ReadonlyMap<string, readonly number[]>,
  locationId: string,
  slot?: number,
): Map<string, number[]> {
  const next = new Map<string, number[]>();
  for (const [k, v] of prev) next.set(k, [...v]);
  const cur = next.get(locationId);
  if (!cur || cur.length === 0) return next;
  if (slot === undefined) {
    cur.pop();
  } else {
    const idx = cur.lastIndexOf(slot);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.pop();
  }
  if (cur.length === 0) next.delete(locationId);
  else next.set(locationId, cur);
  return next;
}

/** מתיישר מול ספירת החוסרים מהשרת אחרי refetch. */
export function reconcilePreferredGhostSlots(
  prev: ReadonlyMap<string, readonly number[]>,
  locationShortageCounts: ReadonlyMap<string, number>,
): Map<string, number[]> {
  const next = new Map<string, number[]>();
  for (const [locationId, slots] of prev) {
    const count = locationShortageCounts.get(locationId) ?? 0;
    if (count <= 0) continue;
    next.set(locationId, slots.slice(0, count));
  }
  return next;
}
