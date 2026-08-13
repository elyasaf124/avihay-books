import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  Book,
  BookWithLocations,
  Cell,
  StoreMap,
  StoreMapBook,
  StoreMapFilteredCopyCounts,
  StoreMapShelf,
  StoreMapSummary,
  StoreMapUnit,
  StoreMapUnitSummary,
} from "@avihay-books/shared";
import axios from "axios";
import { api } from "./client";
import type { UnitFilterState } from "../components/unit/UnitFilterBar";
import { normalizeUnitFilterState } from "../components/unit/UnitFilterBar";
import { isUnitFilterActive } from "../utils/unitFilters";
import { markUnitOpenFor } from "../utils/unitOpenTiming";
import { spineDisplayCounts } from "../utils/spineShortageSlots";
import { compareHebrew } from "../utils/hebrewSort";

/** מפתח מלא + prefix ל-invalidation של כל וריאנטי store-map. */
export const STORE_MAP_KEY = ["store-map"] as const;
export const STORE_MAP_SUMMARY_KEY = ["store-map", "summary"] as const;
export const storeMapUnitKey = (unitId: string) => ["store-map", "unit", unitId] as const;
const BOOKS_SEARCH_KEY = (q: string, supplierId: string) =>
  ["books", "search", q, supplierId || "all", "locations"] as const;

function isNotFoundError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

function shouldRetryQuery(failureCount: number, err: unknown): boolean {
  if (isNotFoundError(err)) return false;
  return failureCount < 2;
}

function summarizeUnitFromMap(u: StoreMapUnit): StoreMapUnitSummary {
  const shelves = u.has_sides ? u.sides.flatMap((s) => s.shelves) : u.shelves;
  let cellCount = 0;
  let totalCopies = 0;
  let newCount = 0;
  const titles = new Set<string>();
  for (const shelf of shelves) {
    cellCount += shelf.cells.length;
    for (const cell of shelf.cells) {
      for (const b of cell.books) {
        titles.add(b.book_id);
        totalCopies += b.quantity_in_cell;
        if (b.is_new) newCount += 1;
      }
    }
  }
  return {
    id: u.id,
    name: u.name,
    store_position: u.store_position,
    has_sides: u.has_sides,
    is_display_unit: u.is_display_unit,
    display_order: u.display_order,
    shelf_count: shelves.length,
    cell_count: cellCount,
    total_copies: totalCopies,
    new_count: newCount,
    unique_titles: titles.size,
  };
}

/** בונה סיכום ממפה מלאה — תאימות לאחור כש־`/store-map/summary` עדיין לא בשרת. */
export function storeMapToSummary(map: StoreMap): StoreMapSummary {
  const topics = new Set<string>();
  for (const u of map.units) {
    const shelves = u.has_sides ? u.sides.flatMap((s) => s.shelves) : u.shelves;
    for (const shelf of shelves) {
      for (const cell of shelf.cells) {
        for (const b of cell.books) {
          const t = (b.topic ?? "").trim();
          if (t) topics.add(t);
        }
      }
    }
  }
  return {
    units: map.units.map(summarizeUnitFromMap).sort((a, b) => a.display_order - b.display_order),
    topics: [...topics].sort(compareHebrew),
  };
}

async function fetchFullStoreMap(): Promise<StoreMap> {
  const { data } = await api.get<StoreMap>("/store-map");
  return data;
}

/** גודל המידע שהתקבל בפועל + הפירוק שהשרת דיווח ב־`Server-Timing`. */
function responseSizeDetail(data: unknown, headers: unknown): Record<string, string | number> {
  const detail: Record<string, string | number> = {};
  try {
    detail.decodedKb = Math.round(JSON.stringify(data).length / 1024);
  } catch {
    detail.decodedKb = -1;
  }
  const bag = headers as { [k: string]: unknown } | undefined;
  const serverTiming = bag?.["server-timing"] ?? bag?.["Server-Timing"];
  if (typeof serverTiming === "string") detail.serverTiming = serverTiming;
  const encoding = bag?.["content-encoding"];
  if (typeof encoding === "string") detail.encoding = encoding;
  return detail;
}

/** מונה עותקים לרינדור — זהה לחישוב ב־`CellCard`, כדי לדעת כמה שדרות ייווצרו. */
function countSpinesInShelves(shelves: StoreMapShelf[] | undefined): number {
  let total = 0;
  for (const shelf of shelves ?? []) {
    for (const cell of shelf.cells) {
      for (const b of cell.books) {
        const { total: spines } = spineDisplayCounts(b);
        total += spines;
      }
    }
  }
  return total;
}

export function countUnitSpines(unit: StoreMapUnit | null | undefined): number {
  if (!unit) return 0;
  return unit.has_sides
    ? unit.sides.reduce((sum, side) => sum + countSpinesInShelves(side.shelves), 0)
    : countSpinesInShelves(unit.shelves);
}

/** שליפת יחידה בודדת — גם ל־`useStoreMapUnit` וגם ל־prefetch בלחיצה על ארון. */
export async function fetchStoreMapUnit(unitId: string): Promise<StoreMapUnit> {
  markUnitOpenFor(unitId, "fetch_start");
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const response = await api.get<StoreMapUnit>(`/store-map/units/${unitId}`);
    const data = response.data;
    const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    markUnitOpenFor(unitId, "fetch_end", {
      path: "unit",
      ms: Math.round(ms),
      shelves: data.shelves?.length ?? 0,
      sides: data.sides?.length ?? 0,
      spines: countUnitSpines(data),
      ...responseSizeDetail(data, response.headers),
    });
    return data;
  } catch (err) {
    if (!isNotFoundError(err)) {
      markUnitOpenFor(unitId, "fetch_error", { kind: "unit" });
      throw err;
    }
    /** שרת ישן / יחידה חסרה ב-endpoint — מחפשים במפה המלאה. */
    markUnitOpenFor(unitId, "fetch_fallback_full_map");
    const map = await fetchFullStoreMap();
    const unit = map.units.find((u) => u.id === unitId);
    if (!unit) {
      markUnitOpenFor(unitId, "fetch_error", { kind: "not_found" });
      throw err;
    }
    const ms = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    markUnitOpenFor(unitId, "fetch_end", {
      path: "full_map_fallback",
      ms: Math.round(ms),
      shelves: unit.shelves?.length ?? 0,
      sides: unit.sides?.length ?? 0,
      spines: countUnitSpines(unit),
    });
    return unit;
  }
}

function mapUnitShelves(
  shelves: StoreMapShelf[],
  mapper: (book: StoreMapBook) => StoreMapBook,
): StoreMapShelf[] {
  return shelves.map((shelf) => ({
    ...shelf,
    cells: shelf.cells.map((cell) => ({
      ...cell,
      books: cell.books.map(mapper),
    })),
  }));
}

function shortageCountOf(book: StoreMapBook): number {
  if (typeof book.pending_shortage_count === "number") {
    return Math.max(0, book.pending_shortage_count);
  }
  return book.is_pending_shortage ? 1 : 0;
}

function patchUnitLocationShortage(
  unit: StoreMapUnit,
  locationId: string,
  isPendingShortage: boolean,
  quantityInCell?: number,
): StoreMapUnit {
  const mapper = (book: StoreMapBook): StoreMapBook => {
    if (book.location_id !== locationId) return book;
    const prevCount = shortageCountOf(book);
    /** ביטול עותק אחד מהמדף: מורידים 1; אם עדיין יש חוסר — לפחות 1. */
    const nextCount = isPendingShortage ? Math.max(1, prevCount - 1) : 0;
    return {
      ...book,
      is_pending_shortage: nextCount > 0,
      pending_shortage_count: nextCount,
      ...(quantityInCell !== undefined ? { quantity_in_cell: quantityInCell } : {}),
    };
  };
  return {
    ...unit,
    shelves: mapUnitShelves(unit.shelves, mapper),
    sides: unit.sides.map((side) => ({
      ...side,
      shelves: mapUnitShelves(side.shelves, mapper),
    })),
  };
}

/**
 * מעדכן `is_pending_shortage` (+ אופציונלי `quantity_in_cell`) ב־cache של יחידות / מפה.
 * מסמן את ה־summary כ־stale בלי לכפות רענון מיידי של שאילתות לא־פעילות.
 */
export function patchStoreMapLocationShortage(
  client: QueryClient,
  locationId: string,
  isPendingShortage: boolean,
  quantityInCell?: number,
): void {
  client.setQueriesData<StoreMapUnit>({ queryKey: ["store-map", "unit"] }, (old) => {
    if (!old) return old;
    return patchUnitLocationShortage(old, locationId, isPendingShortage, quantityInCell);
  });
  client.setQueryData<StoreMap>(STORE_MAP_KEY, (old) => {
    if (!old) return old;
    return {
      ...old,
      units: old.units.map((u) =>
        patchUnitLocationShortage(u, locationId, isPendingShortage, quantityInCell),
      ),
    };
  });
  void client.invalidateQueries({
    queryKey: STORE_MAP_SUMMARY_KEY,
    refetchType: "none",
  });
}

/** מוריד/מעלה `quantity_in_cell` ב־cache ומעדכן דגל חוסר — לאופטימיות לפני תשובת שרת. */
export function adjustStoreMapLocationShortage(
  client: QueryClient,
  locationId: string,
  quantityDelta: number,
  _isPendingShortage: boolean,
): void {
  const apply = (unit: StoreMapUnit): StoreMapUnit => {
    const mapper = (book: StoreMapBook): StoreMapBook => {
      if (book.location_id !== locationId) return book;
      const nextQty = Math.max(0, book.quantity_in_cell + quantityDelta);
      const { total: shelfTarget } = spineDisplayCounts(book);
      const nextCount = Math.max(0, shelfTarget - nextQty);
      return {
        ...book,
        quantity_in_cell: nextQty,
        pending_shortage_count: nextCount,
        is_pending_shortage: nextCount > 0,
      };
    };
    return {
      ...unit,
      shelves: mapUnitShelves(unit.shelves, mapper),
      sides: unit.sides.map((side) => ({
        ...side,
        shelves: mapUnitShelves(side.shelves, mapper),
      })),
    };
  };
  client.setQueriesData<StoreMapUnit>({ queryKey: ["store-map", "unit"] }, (old) => {
    if (!old) return old;
    return apply(old);
  });
  client.setQueryData<StoreMap>(STORE_MAP_KEY, (old) => {
    if (!old) return old;
    return { ...old, units: old.units.map(apply) };
  });
  void client.invalidateQueries({
    queryKey: STORE_MAP_SUMMARY_KEY,
    refetchType: "none",
  });
}

/** מסמן store-map כ־stale; מרענן רק שאילתות פעילות (בלי `type: "all"`). */
export function softInvalidateStoreMap(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
}

export interface EnsureCellPayload {
  shelfId: string;
  cellName: string;
  cellNumber?: number;
  capacity?: number;
}

/** יוצר תא במדף אם חסר (תאים ריקים שלא נוצרו בייבוא), או מחזיר קיים. */
export function useEnsureCell() {
  const client = useQueryClient();
  return useMutation<Cell, Error, EnsureCellPayload>({
    mutationFn: async ({ shelfId, cellName, cellNumber, capacity }) => {
      const { data } = await api.post<Cell>(`/shelving-units/shelves/${shelfId}/cells`, {
        cell_name: cellName,
        ...(cellNumber != null ? { cell_number: cellNumber } : {}),
        ...(capacity != null ? { capacity } : {}),
      });
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
      void client.invalidateQueries({ queryKey: STORE_MAP_SUMMARY_KEY });
      void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
    },
  });
}

export function useStoreMap(options?: { enabled?: boolean }) {
  return useQuery<StoreMap>({
    queryKey: STORE_MAP_KEY,
    queryFn: fetchFullStoreMap,
    staleTime: 30_000,
    retry: 2,
    enabled: options?.enabled !== false,
  });
}

export function useStoreMapSummary() {
  return useQuery<StoreMapSummary>({
    queryKey: STORE_MAP_SUMMARY_KEY,
    queryFn: async () => {
      try {
        const { data } = await api.get<StoreMapSummary>("/store-map/summary");
        return data;
      } catch (err) {
        if (!isNotFoundError(err)) throw err;
        /** שרת ישן בלי summary — גוזרים ממפה מלאה. */
        return storeMapToSummary(await fetchFullStoreMap());
      }
    },
    staleTime: 60_000,
    retry: shouldRetryQuery,
  });
}

export function useStoreMapUnit(unitId: string | null | undefined) {
  return useQuery<StoreMapUnit>({
    queryKey: storeMapUnitKey(unitId ?? ""),
    queryFn: () => fetchStoreMapUnit(unitId!),
    enabled: !!unitId,
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });
}

function copyCountsKey(filters: UnitFilterState) {
  const f = normalizeUnitFilterState(filters);
  return [
    "store-map",
    "copy-counts",
    f.supplierIds.slice().sort().join(","),
    f.topics.slice().sort().join(","),
    f.priceMin ?? "",
    f.priceMax ?? "",
  ] as const;
}

function sumFilteredCopiesClient(map: StoreMap, filters: UnitFilterState): StoreMapFilteredCopyCounts {
  const f = normalizeUnitFilterState(filters);
  return {
    units: map.units.map((u) => {
      const shelves = u.has_sides ? u.sides.flatMap((s) => s.shelves) : u.shelves;
      let filtered_copies = 0;
      for (const shelf of shelves) {
        for (const cell of shelf.cells) {
          for (const b of cell.books) {
            if (f.supplierIds.length > 0 && !f.supplierIds.includes(b.supplier_id)) continue;
            const topic = (b.topic ?? "").trim();
            if (f.topics.length > 0 && !f.topics.includes(topic)) continue;
            if (b.price == null || b.price === "") {
              if (f.priceMin !== null || f.priceMax !== null) continue;
            } else {
              const price = Number(b.price);
              if (f.priceMin !== null && !Number.isNaN(price) && price < f.priceMin) continue;
              if (f.priceMax !== null && !Number.isNaN(price) && price > f.priceMax) continue;
            }
            filtered_copies += b.quantity_in_cell;
          }
        }
      }
      return { id: u.id, filtered_copies };
    }),
  };
}

export function useFilteredCopyCounts(filters: UnitFilterState) {
  const active = isUnitFilterActive(filters);
  const f = normalizeUnitFilterState(filters);

  return useQuery<StoreMapFilteredCopyCounts>({
    queryKey: copyCountsKey(filters),
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (f.supplierIds.length > 0) params.supplier_ids = f.supplierIds.join(",");
      if (f.topics.length > 0) params.topics = f.topics.join(",");
      if (f.priceMin != null) params.price_min = String(f.priceMin);
      if (f.priceMax != null) params.price_max = String(f.priceMax);
      try {
        const { data } = await api.get<StoreMapFilteredCopyCounts>("/store-map/copy-counts", {
          params,
        });
        return data;
      } catch (err) {
        if (!isNotFoundError(err)) throw err;
        return sumFilteredCopiesClient(await fetchFullStoreMap(), filters);
      }
    },
    enabled: active,
    staleTime: 30_000,
    retry: shouldRetryQuery,
  });
}

export interface UseSearchBooksOptions {
  /** כשמוגדר — החיפוש מצומצם לספרים של הספק (`GET /books?q=&supplier_id=`). */
  supplierId?: string | null;
  /** ברירת מחדל: `true`. העבירו `false` כדי לא לפנות לשרת (למשל כשהמסך לא מציג חיפוש). */
  enabled?: boolean;
}

export function useSearchBooks(query: string, options?: UseSearchBooksOptions) {
  const trimmed = query.trim();
  const supplierKey = options?.supplierId?.trim() ?? "";
  const supplierParam = options?.supplierId?.trim() || undefined;
  const extraEnabled = options?.enabled !== false;

  return useQuery<BookWithLocations[]>({
    queryKey: BOOKS_SEARCH_KEY(trimmed, supplierKey),
    queryFn: async () => {
      const params: Record<string, string> = { q: trimmed, expand: "locations" };
      if (supplierParam) params.supplier_id = supplierParam;
      const { data } = await api.get<BookWithLocations[]>("/books", { params });
      return data;
    },
    enabled: extraEnabled && trimmed.length > 0,
    staleTime: 10_000,
    retry: 0,
  });
}
