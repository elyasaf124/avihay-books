import { pool } from "../db/pool.js";
import type {
  StoreMap,
  StoreMapBook,
  StoreMapCell,
  StoreMapFilteredCopyCounts,
  StoreMapShelf,
  StoreMapSide,
  StoreMapSummary,
  StoreMapUnit,
  StoreMapUnitSummary,
  StorePosition,
  SideLabel,
} from "@avihay-books/shared";
import {
  getCachedStoreMap,
  getCachedStoreMapSummary,
  getCachedStoreMapUnit,
  setCachedStoreMap,
  setCachedStoreMapSummary,
  setCachedStoreMapUnit,
} from "./storeMapCache.js";

interface UnitRow {
  id: string;
  name: string;
  store_position: StorePosition;
  has_sides: boolean;
  is_display_unit: boolean;
  display_order: number;
}
interface SideRow {
  id: string;
  unit_id: string;
  side_label: SideLabel;
  side_order: number;
}
interface ShelfRow {
  id: string;
  unit_id: string | null;
  side_id: string | null;
  shelf_number: number;
  label: string | null;
}
interface CellRow {
  id: string;
  shelf_id: string;
  cell_number: number;
  cell_name: string;
  capacity: number;
}
interface LocationRow {
  id: string;
  cell_id: string;
  book_id: string;
  position_in_cell: number;
  quantity_in_cell: number;
  title: string;
  author: string | null;
  supplier_id: string;
  is_new: boolean;
  supplier_color: string;
  price: string | null;
  topic: string;
  is_pending_shortage: boolean;
}

const LOCATIONS_SELECT = `
  SELECT bl.id, bl.cell_id, bl.book_id, bl.position_in_cell, bl.quantity_in_cell,
         b.title, b.author, b.supplier_id, b.is_new, b.price::text AS price,
         b.topic,
         s.color_hex AS supplier_color,
         (sl_open.location_id IS NOT NULL) AS is_pending_shortage
    FROM book_locations bl
    JOIN books     b ON b.id = bl.book_id
    JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN (
      SELECT DISTINCT location_id
        FROM shortage_list
       WHERE status <> 'completed'
         AND location_id IS NOT NULL
    ) sl_open ON sl_open.location_id = bl.id
   WHERE b.is_active = TRUE
`;

function buildStoreMapFromRows(
  units: UnitRow[],
  sides: SideRow[],
  shelves: ShelfRow[],
  cells: CellRow[],
  locs: LocationRow[],
): StoreMap {
  const booksByCell = new Map<string, StoreMapBook[]>();
  for (const l of locs) {
    const arr = booksByCell.get(l.cell_id) ?? [];
    arr.push({
      location_id: l.id,
      book_id: l.book_id,
      title: l.title,
      author: l.author,
      supplier_id: l.supplier_id,
      supplier_color: l.supplier_color,
      position_in_cell: l.position_in_cell,
      quantity_in_cell: l.quantity_in_cell,
      is_new: l.is_new,
      price: l.price,
      topic: l.topic ?? "",
      is_pending_shortage: Boolean(l.is_pending_shortage),
    });
    booksByCell.set(l.cell_id, arr);
  }

  const cellsByShelf = new Map<string, StoreMapCell[]>();
  for (const c of cells) {
    const arr = cellsByShelf.get(c.shelf_id) ?? [];
    arr.push({
      id: c.id,
      cell_number: c.cell_number,
      cell_name: c.cell_name,
      capacity: c.capacity,
      books: booksByCell.get(c.id) ?? [],
    });
    cellsByShelf.set(c.shelf_id, arr);
  }

  const shelvesByUnit = new Map<string, StoreMapShelf[]>();
  const shelvesBySide = new Map<string, StoreMapShelf[]>();
  for (const s of shelves) {
    const node: StoreMapShelf = {
      id: s.id,
      shelf_number: s.shelf_number,
      label: s.label,
      cells: cellsByShelf.get(s.id) ?? [],
    };
    if (s.unit_id) {
      const arr = shelvesByUnit.get(s.unit_id) ?? [];
      arr.push(node);
      shelvesByUnit.set(s.unit_id, arr);
    } else if (s.side_id) {
      const arr = shelvesBySide.get(s.side_id) ?? [];
      arr.push(node);
      shelvesBySide.set(s.side_id, arr);
    }
  }

  const sidesByUnit = new Map<string, StoreMapSide[]>();
  for (const sd of sides) {
    const arr = sidesByUnit.get(sd.unit_id) ?? [];
    arr.push({
      id: sd.id,
      side_label: sd.side_label,
      side_order: sd.side_order,
      shelves: shelvesBySide.get(sd.id) ?? [],
    });
    sidesByUnit.set(sd.unit_id, arr);
  }

  return {
    units: units.map((u) => ({
      id: u.id,
      name: u.name,
      store_position: u.store_position,
      has_sides: u.has_sides,
      is_display_unit: u.is_display_unit,
      display_order: u.display_order,
      sides: sidesByUnit.get(u.id) ?? [],
      shelves: shelvesByUnit.get(u.id) ?? [],
    })),
  };
}

async function loadFullStoreMap(): Promise<StoreMap> {
  /** bundle אחד — חוסך כמה חיבורי pool מקבילים ל־Neon (כל אחד עם RTT משלו). */
  const { rows } = await pool.query<{
    units: UnitRow[];
    sides: SideRow[];
    shelves: ShelfRow[];
    cells: CellRow[];
    locs: LocationRow[];
  }>(
    `WITH
       u AS (
         SELECT id, name, store_position, has_sides, is_display_unit, display_order
           FROM shelving_units
       ),
       sd AS (
         SELECT id, unit_id, side_label, side_order FROM unit_sides
       ),
       sh AS (
         SELECT id, unit_id, side_id, shelf_number, label FROM shelves
       ),
       c AS (
         SELECT id, shelf_id, cell_number, cell_name, capacity FROM cells
       ),
       loc AS (
         ${LOCATIONS_SELECT}
       )
     SELECT
       COALESCE(
         (SELECT jsonb_agg(to_jsonb(u.*) ORDER BY u.display_order, u.name) FROM u),
         '[]'::jsonb
       ) AS units,
       COALESCE(
         (SELECT jsonb_agg(to_jsonb(sd.*) ORDER BY sd.unit_id, sd.side_order) FROM sd),
         '[]'::jsonb
       ) AS sides,
       COALESCE(
         (SELECT jsonb_agg(to_jsonb(sh.*) ORDER BY sh.shelf_number) FROM sh),
         '[]'::jsonb
       ) AS shelves,
       COALESCE(
         (SELECT jsonb_agg(to_jsonb(c.*) ORDER BY c.shelf_id, c.cell_number) FROM c),
         '[]'::jsonb
       ) AS cells,
       COALESCE(
         (SELECT jsonb_agg(to_jsonb(loc.*) ORDER BY loc.position_in_cell) FROM loc),
         '[]'::jsonb
       ) AS locs`,
  );

  const bundle = rows[0];
  return buildStoreMapFromRows(
    bundle?.units ?? [],
    bundle?.sides ?? [],
    bundle?.shelves ?? [],
    bundle?.cells ?? [],
    bundle?.locs ?? [],
  );
}

export async function getStoreMap(): Promise<StoreMap> {
  const cached = getCachedStoreMap();
  if (cached) return cached;
  const map = await loadFullStoreMap();
  setCachedStoreMap(map);
  return map;
}

export async function getStoreMapSummary(): Promise<StoreMapSummary> {
  const cached = getCachedStoreMapSummary();
  if (cached) return cached;

  const [unitsRes, topicsRes] = await Promise.all([
    pool.query<StoreMapUnitSummary & { store_position: StorePosition }>(
      `WITH unit_shelves AS (
         SELECT su.id AS unit_id, sh.id AS shelf_id
           FROM shelving_units su
           JOIN shelves sh ON sh.unit_id = su.id
         UNION
         SELECT su.id AS unit_id, sh.id AS shelf_id
           FROM shelving_units su
           JOIN unit_sides us ON us.unit_id = su.id
           JOIN shelves sh ON sh.side_id = us.id
       ),
       unit_cells AS (
         SELECT ush.unit_id, c.id AS cell_id
           FROM unit_shelves ush
           JOIN cells c ON c.shelf_id = ush.shelf_id
       ),
       unit_books AS (
         SELECT uc.unit_id,
                bl.book_id,
                bl.quantity_in_cell,
                b.is_new
           FROM unit_cells uc
           JOIN book_locations bl ON bl.cell_id = uc.cell_id
           JOIN books b ON b.id = bl.book_id AND b.is_active = TRUE
       )
       SELECT
         su.id,
         su.name,
         su.store_position,
         su.has_sides,
         su.is_display_unit,
         su.display_order,
         (SELECT COUNT(*)::int FROM unit_shelves ush WHERE ush.unit_id = su.id) AS shelf_count,
         (SELECT COUNT(*)::int FROM unit_cells uc WHERE uc.unit_id = su.id) AS cell_count,
         COALESCE((SELECT SUM(ub.quantity_in_cell)::int FROM unit_books ub WHERE ub.unit_id = su.id), 0) AS total_copies,
         COALESCE((SELECT COUNT(*)::int FROM unit_books ub WHERE ub.unit_id = su.id AND ub.is_new = TRUE), 0) AS new_count,
         COALESCE((SELECT COUNT(DISTINCT ub.book_id)::int FROM unit_books ub WHERE ub.unit_id = su.id), 0) AS unique_titles
       FROM shelving_units su
       ORDER BY su.display_order, su.name`,
    ),
    pool.query<{ topic: string }>(
      `SELECT DISTINCT NULLIF(TRIM(topic), '') AS topic
         FROM books
        WHERE is_active = TRUE
          AND NULLIF(TRIM(topic), '') IS NOT NULL
        ORDER BY 1`,
    ),
  ]);

  const summary: StoreMapSummary = {
    units: unitsRes.rows.map((u) => ({
      id: u.id,
      name: u.name,
      store_position: u.store_position,
      has_sides: u.has_sides,
      is_display_unit: u.is_display_unit,
      display_order: u.display_order,
      shelf_count: Number(u.shelf_count) || 0,
      cell_count: Number(u.cell_count) || 0,
      total_copies: Number(u.total_copies) || 0,
      new_count: Number(u.new_count) || 0,
      unique_titles: Number(u.unique_titles) || 0,
    })),
    topics: topicsRes.rows
      .map((r) => r.topic)
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .sort((a, b) => a.localeCompare(b, "he")),
  };
  setCachedStoreMapSummary(summary);
  return summary;
}

interface UnitBundleRow {
  unit: UnitRow | null;
  sides: SideRow[];
  shelves: ShelfRow[];
  cells: CellRow[];
  locs: LocationRow[];
}

/**
 * טוען יחידה ב־round-trip אחד ל־DB (במקום 3 סיבובים תלויים זה בזה).
 * קריטי כש־Postgres מרוחק (Neon) — ה־RTT שולט, לא זמן ה־SQL.
 */
export async function getStoreMapUnit(unitId: string): Promise<StoreMapUnit | null> {
  const cached = getCachedStoreMapUnit(unitId);
  if (cached) return cached;

  const fullCached = getCachedStoreMap();
  if (fullCached) {
    const fromFull = fullCached.units.find((u) => u.id === unitId) ?? null;
    if (fromFull) {
      setCachedStoreMapUnit(unitId, fromFull);
      return fromFull;
    }
  }

  const { rows } = await pool.query<UnitBundleRow>(
    `WITH
       u AS (
         SELECT id, name, store_position, has_sides, is_display_unit, display_order
           FROM shelving_units
          WHERE id = $1
       ),
       sd AS (
         SELECT id, unit_id, side_label, side_order
           FROM unit_sides
          WHERE unit_id = $1
       ),
       sh AS (
         SELECT id, unit_id, side_id, shelf_number, label
           FROM shelves
          WHERE unit_id = $1
             OR side_id IN (SELECT id FROM sd)
       ),
       c AS (
         SELECT id, shelf_id, cell_number, cell_name, capacity
           FROM cells
          WHERE shelf_id IN (SELECT id FROM sh)
       ),
       loc AS (
         SELECT bl.id, bl.cell_id, bl.book_id, bl.position_in_cell, bl.quantity_in_cell,
                b.title, b.author, b.supplier_id, b.is_new, b.price::text AS price,
                b.topic,
                s.color_hex AS supplier_color,
                (sl_open.location_id IS NOT NULL) AS is_pending_shortage
           FROM book_locations bl
           JOIN books     b ON b.id = bl.book_id
           JOIN suppliers s ON s.id = b.supplier_id
           LEFT JOIN (
             SELECT DISTINCT location_id
               FROM shortage_list
              WHERE status <> 'completed'
                AND location_id IS NOT NULL
           ) sl_open ON sl_open.location_id = bl.id
          WHERE b.is_active = TRUE
            AND bl.cell_id IN (SELECT id FROM c)
       )
     SELECT
       (SELECT to_jsonb(u.*) FROM u) AS unit,
       COALESCE(
         (SELECT jsonb_agg(to_jsonb(sd.*) ORDER BY sd.side_order) FROM sd),
         '[]'::jsonb
       ) AS sides,
       COALESCE(
         (SELECT jsonb_agg(to_jsonb(sh.*) ORDER BY sh.shelf_number) FROM sh),
         '[]'::jsonb
       ) AS shelves,
       COALESCE(
         (SELECT jsonb_agg(to_jsonb(c.*) ORDER BY c.shelf_id, c.cell_number) FROM c),
         '[]'::jsonb
       ) AS cells,
       COALESCE(
         (SELECT jsonb_agg(to_jsonb(loc.*) ORDER BY loc.position_in_cell) FROM loc),
         '[]'::jsonb
       ) AS locs`,
    [unitId],
  );

  const bundle = rows[0];
  if (!bundle?.unit) return null;

  const map = buildStoreMapFromRows(
    [bundle.unit],
    bundle.sides ?? [],
    bundle.shelves ?? [],
    bundle.cells ?? [],
    bundle.locs ?? [],
  );
  const result = map.units[0] ?? null;
  if (result) setCachedStoreMapUnit(unitId, result);
  return result;
}

export interface CopyCountFilters {
  supplierIds?: string[];
  topics?: string[];
  priceMin?: number | null;
  priceMax?: number | null;
}

export async function getFilteredCopyCounts(
  filters: CopyCountFilters,
): Promise<StoreMapFilteredCopyCounts> {
  const conditions: string[] = ["b.is_active = TRUE"];
  const params: unknown[] = [];
  let i = 1;

  if (filters.supplierIds && filters.supplierIds.length > 0) {
    conditions.push(`b.supplier_id = ANY($${i++}::uuid[])`);
    params.push(filters.supplierIds);
  }
  if (filters.topics && filters.topics.length > 0) {
    conditions.push(`NULLIF(TRIM(b.topic), '') = ANY($${i++}::text[])`);
    params.push(filters.topics);
  }
  if (filters.priceMin != null && !Number.isNaN(filters.priceMin)) {
    conditions.push(`b.price IS NOT NULL AND b.price >= $${i++}`);
    params.push(filters.priceMin);
  }
  if (filters.priceMax != null && !Number.isNaN(filters.priceMax)) {
    conditions.push(`b.price IS NOT NULL AND b.price <= $${i++}`);
    params.push(filters.priceMax);
  }

  const { rows } = await pool.query<{ id: string; filtered_copies: string }>(
    `SELECT su.id,
            COALESCE(SUM(matched.quantity_in_cell), 0)::text AS filtered_copies
       FROM shelving_units su
       LEFT JOIN (
         SELECT COALESCE(sh.unit_id, us.unit_id) AS unit_id,
                bl.quantity_in_cell
           FROM book_locations bl
           JOIN books b ON b.id = bl.book_id
           JOIN cells c ON c.id = bl.cell_id
           JOIN shelves sh ON sh.id = c.shelf_id
           LEFT JOIN unit_sides us ON us.id = sh.side_id
          WHERE ${conditions.join(" AND ")}
       ) matched ON matched.unit_id = su.id
      GROUP BY su.id, su.display_order, su.name
      ORDER BY su.display_order, su.name`,
    params,
  );

  return {
    units: rows.map((r) => ({
      id: r.id,
      filtered_copies: Number.parseInt(r.filtered_copies, 10) || 0,
    })),
  };
}
