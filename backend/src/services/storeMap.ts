import { pool } from "../db/pool.js";
import type {
  StoreMap,
  StoreMapBook,
  StoreMapCell,
  StoreMapShelf,
  StoreMapSide,
  StoreMapUnit,
  StorePosition,
  SideLabel,
} from "@avihay-books/shared";

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
  author: string;
  supplier_id: string;
  is_new: boolean;
  supplier_color: string;
  price: string;
  is_pending_shortage: boolean;
}

export async function getStoreMap(): Promise<StoreMap> {
  const [unitsRes, sidesRes, shelvesRes, cellsRes, locsRes] = await Promise.all([
    pool.query<UnitRow>("SELECT * FROM shelving_units ORDER BY display_order, name"),
    pool.query<SideRow>("SELECT * FROM unit_sides ORDER BY unit_id, side_order"),
    pool.query<ShelfRow>("SELECT * FROM shelves ORDER BY shelf_number"),
    pool.query<CellRow>("SELECT * FROM cells ORDER BY shelf_id, cell_number"),
    pool.query<LocationRow>(
      `SELECT bl.id, bl.cell_id, bl.book_id, bl.position_in_cell, bl.quantity_in_cell,
              b.title, b.author, b.supplier_id, b.is_new, b.price::text AS price,
              s.color_hex AS supplier_color,
              EXISTS (
                SELECT 1
                  FROM shortage_list sl
                 WHERE sl.location_id = bl.id
                   AND sl.status <> 'completed'
              ) AS is_pending_shortage
         FROM book_locations bl
         JOIN books     b ON b.id = bl.book_id
         JOIN suppliers s ON s.id = b.supplier_id
        WHERE b.is_active = TRUE
        ORDER BY bl.position_in_cell`,
    ),
  ]);

  const booksByCell = new Map<string, StoreMapBook[]>();
  for (const l of locsRes.rows) {
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
      is_pending_shortage: Boolean(l.is_pending_shortage),
    });
    booksByCell.set(l.cell_id, arr);
  }

  const cellsByShelf = new Map<string, StoreMapCell[]>();
  for (const c of cellsRes.rows) {
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
  for (const s of shelvesRes.rows) {
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
  for (const sd of sidesRes.rows) {
    const arr = sidesByUnit.get(sd.unit_id) ?? [];
    arr.push({
      id: sd.id,
      side_label: sd.side_label,
      side_order: sd.side_order,
      shelves: shelvesBySide.get(sd.id) ?? [],
    });
    sidesByUnit.set(sd.unit_id, arr);
  }

  const units: StoreMapUnit[] = unitsRes.rows.map((u) => ({
    id: u.id,
    name: u.name,
    store_position: u.store_position,
    has_sides: u.has_sides,
    is_display_unit: u.is_display_unit,
    display_order: u.display_order,
    sides: sidesByUnit.get(u.id) ?? [],
    shelves: shelvesByUnit.get(u.id) ?? [],
  }));

  return { units };
}
