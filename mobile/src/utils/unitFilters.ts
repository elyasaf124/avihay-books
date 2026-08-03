import type { StoreMap, StoreMapBook, StoreMapShelf, StoreMapUnit } from "@avihay-books/shared";
import type { UnitFilterState } from "../components/unit/UnitFilterBar";
import { normalizeUnitFilterState } from "../components/unit/UnitFilterBar";
import { compareHebrew } from "./hebrewSort";

/**
 * מסנן מוכן־מראש. סינון ארון גדול קורא לפרדיקט מאות פעמים, ולכן כל העבודה
 * שלא תלויה בספר (נרמול המצב, בניית `Set`) נעשית פעם אחת בלבד.
 */
export interface CompiledUnitFilter {
  (b: StoreMapBook): boolean;
}

export function compileUnitFilter(filters: UnitFilterState): CompiledUnitFilter {
  const f = normalizeUnitFilterState(filters);
  const supplierIds = f.supplierIds.length > 0 ? new Set(f.supplierIds) : null;
  const topics = f.topics.length > 0 ? new Set(f.topics) : null;
  const { priceMin, priceMax } = f;
  const hasPriceFilter = priceMin !== null || priceMax !== null;

  if (supplierIds == null && topics == null && !hasPriceFilter) {
    return () => true;
  }

  return (b: StoreMapBook): boolean => {
    if (supplierIds != null && !supplierIds.has(b.supplier_id)) return false;
    if (topics != null && !topics.has((b.topic ?? "").trim())) return false;
    if (b.price == null || b.price === "") {
      if (hasPriceFilter) return false;
    } else {
      const price = Number(b.price);
      if (priceMin !== null && !Number.isNaN(price) && price < priceMin) return false;
      if (priceMax !== null && !Number.isNaN(price) && price > priceMax) return false;
    }
    return true;
  };
}


export function isUnitFilterActive(filters: UnitFilterState): boolean {
  const f = normalizeUnitFilterState(filters);
  return (
    f.supplierIds.length > 0 ||
    f.topics.length > 0 ||
    f.priceMin !== null ||
    f.priceMax !== null
  );
}

/**
 * חיפוש כותרת מוכן־מראש: `normalize`/`toLocaleLowerCase` על שאילתת החיפוש
 * מחושבים פעם אחת, ולא מחדש עבור כל ספר.
 */
export function compileBookTitleSearch(query: string): (b: StoreMapBook) => boolean {
  const titleQ = query.trim();
  if (titleQ.length === 0) return () => true;
  const q = titleQ.normalize("NFKC").toLocaleLowerCase("und");
  return (b: StoreMapBook) => b.title.normalize("NFKC").toLocaleLowerCase("und").includes(q);
}


function collectTopicsFromShelves(shelves: StoreMapShelf[], seen: Set<string>): void {
  for (const shelf of shelves) {
    for (const cell of shelf.cells) {
      for (const b of cell.books) {
        const topic = (b.topic ?? "").trim();
        if (topic) seen.add(topic);
      }
    }
  }
}

export function collectTopicsFromUnit(u: StoreMapUnit): string[] {
  const seen = new Set<string>();
  collectTopicsFromShelves(u.shelves, seen);
  for (const side of u.sides) collectTopicsFromShelves(side.shelves, seen);
  return [...seen].sort(compareHebrew);
}

export function collectTopicsFromMap(map: StoreMap): string[] {
  const seen = new Set<string>();
  for (const u of map.units) {
    collectTopicsFromShelves(u.shelves, seen);
    for (const side of u.sides) collectTopicsFromShelves(side.shelves, seen);
  }
  return [...seen].sort(compareHebrew);
}

function sumFilteredCopiesInShelves(
  shelves: StoreMapShelf[],
  passes: CompiledUnitFilter,
): number {
  let n = 0;
  for (const shelf of shelves) {
    for (const cell of shelf.cells) {
      for (const b of cell.books) {
        if (passes(b)) n += b.quantity_in_cell;
      }
    }
  }
  return n;
}

export function sumFilteredCopiesInUnit(u: StoreMapUnit, filters: UnitFilterState): number {
  const passes = compileUnitFilter(filters);
  let n = sumFilteredCopiesInShelves(u.shelves, passes);
  for (const side of u.sides) {
    n += sumFilteredCopiesInShelves(side.shelves, passes);
  }
  return n;
}

export function sumFilteredCopiesFromMap(map: StoreMap | undefined, filters: UnitFilterState): number {
  if (!map || map.units.length === 0) return 0;
  const passes = compileUnitFilter(filters);
  let total = 0;
  for (const u of map.units) {
    total += sumFilteredCopiesInShelves(u.shelves, passes);
    for (const side of u.sides) total += sumFilteredCopiesInShelves(side.shelves, passes);
  }
  return total;
}
