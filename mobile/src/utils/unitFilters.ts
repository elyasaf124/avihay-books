import type { StoreMap, StoreMapBook, StoreMapShelf, StoreMapUnit } from "@avihay-books/shared";
import type { UnitFilterState } from "../components/unit/UnitFilterBar";
import { normalizeUnitFilterState } from "../components/unit/UnitFilterBar";

export function passesUnitFilter(b: StoreMapBook, filters: UnitFilterState): boolean {
  const f = normalizeUnitFilterState(filters);
  if (f.supplierIds.length > 0 && !f.supplierIds.includes(b.supplier_id)) {
    return false;
  }
  const bookTopic = (b.topic ?? "").trim();
  if (f.topics.length > 0 && !f.topics.includes(bookTopic)) {
    return false;
  }
  if (b.price == null || b.price === "") {
    if (f.priceMin !== null || f.priceMax !== null) return false;
  } else {
    const price = Number(b.price);
    if (f.priceMin !== null && !Number.isNaN(price) && price < f.priceMin) {
      return false;
    }
    if (f.priceMax !== null && !Number.isNaN(price) && price > f.priceMax) {
      return false;
    }
  }
  return true;
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

export function passesBookTitleSearch(b: StoreMapBook, query: string): boolean {
  const titleQ = query.trim();
  if (titleQ.length === 0) return true;
  const q = titleQ.normalize("NFKC").toLocaleLowerCase("und");
  return b.title.normalize("NFKC").toLocaleLowerCase("und").includes(q);
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
  return [...seen].sort((a, b) => a.localeCompare(b, "he"));
}

export function collectTopicsFromMap(map: StoreMap): string[] {
  const seen = new Set<string>();
  for (const u of map.units) {
    collectTopicsFromShelves(u.shelves, seen);
    for (const side of u.sides) collectTopicsFromShelves(side.shelves, seen);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, "he"));
}

function sumFilteredCopiesInShelves(
  shelves: StoreMapShelf[],
  filters: UnitFilterState,
): number {
  let n = 0;
  for (const shelf of shelves) {
    for (const cell of shelf.cells) {
      for (const b of cell.books) {
        if (passesUnitFilter(b, filters)) n += b.quantity_in_cell;
      }
    }
  }
  return n;
}

export function sumFilteredCopiesInUnit(u: StoreMapUnit, filters: UnitFilterState): number {
  let n = sumFilteredCopiesInShelves(u.shelves, filters);
  for (const side of u.sides) {
    n += sumFilteredCopiesInShelves(side.shelves, filters);
  }
  return n;
}

export function sumFilteredCopiesFromMap(map: StoreMap | undefined, filters: UnitFilterState): number {
  if (!map || map.units.length === 0) return 0;
  return map.units.reduce((sum, u) => sum + sumFilteredCopiesInUnit(u, filters), 0);
}
