import type { StoreMap, StoreMapSummary, StoreMapUnit } from "@avihay-books/shared";

const TTL_MS = 30_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

let fullMapCache: CacheEntry<StoreMap> | null = null;
let summaryCache: CacheEntry<StoreMapSummary> | null = null;
const unitCache = new Map<string, CacheEntry<StoreMapUnit>>();

function isFresh<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
  return entry != null && Date.now() < entry.expiresAt;
}

function unitContainsLocation(unit: StoreMapUnit, locationId: string): boolean {
  const shelves = unit.has_sides ? unit.sides.flatMap((s) => s.shelves) : unit.shelves;
  for (const shelf of shelves) {
    for (const cell of shelf.cells) {
      for (const book of cell.books) {
        if (book.location_id === locationId) return true;
      }
    }
  }
  return false;
}

export function getCachedStoreMap(): StoreMap | null {
  return isFresh(fullMapCache) ? fullMapCache.value : null;
}

export function setCachedStoreMap(value: StoreMap): void {
  fullMapCache = { value, expiresAt: Date.now() + TTL_MS };
}

export function getCachedStoreMapSummary(): StoreMapSummary | null {
  return isFresh(summaryCache) ? summaryCache.value : null;
}

export function setCachedStoreMapSummary(value: StoreMapSummary): void {
  summaryCache = { value, expiresAt: Date.now() + TTL_MS };
}

export function getCachedStoreMapUnit(unitId: string): StoreMapUnit | null {
  const entry = unitCache.get(unitId);
  return isFresh(entry) ? entry.value : null;
}

export function setCachedStoreMapUnit(unitId: string, value: StoreMapUnit): void {
  unitCache.set(unitId, { value, expiresAt: Date.now() + TTL_MS });
}

/** מנקה את כל מטמוני מפת החנות אחרי שינוי מיקומים / ספרים / חוסרים. */
export function invalidateStoreMapCache(): void {
  fullMapCache = null;
  summaryCache = null;
  unitCache.clear();
}

/**
 * אחרי שינוי חוסר לפי `location_id` — מנקים summary + full map,
 * ומוחקים ממטמון היחידות רק יחידות שמכילות את המיקום (אם ידועות).
 * אם אין התאמה במטמון — מנקים את כל היחידות כמו invalidate מלא.
 */
export function invalidateStoreMapCacheForLocation(locationId: string): void {
  fullMapCache = null;
  summaryCache = null;

  const toDelete: string[] = [];
  for (const [unitId, entry] of unitCache) {
    if (isFresh(entry) && unitContainsLocation(entry.value, locationId)) {
      toDelete.push(unitId);
    } else if (!isFresh(entry)) {
      toDelete.push(unitId);
    }
  }

  if (toDelete.length === 0) {
    unitCache.clear();
    return;
  }

  for (const unitId of toDelete) {
    unitCache.delete(unitId);
  }
}
