import type { StoreMapBook, StoreMapShelf } from "@avihay-books/shared";
import { sortByHebrewKeys } from "./hebrewSort";
import { resolveGhostSpineSlots, spineDisplayCounts } from "./spineShortageSlots";

/** מיקום בתצוגה — כולל `cell_id` / `cell_name` ל־`PATCH` ולתצוגה (לא חלק מ־`StoreMapBook`). */
export interface DisplayLocationSpot extends StoreMapBook {
  cell_id: string;
  cell_name: string;
}

export interface DisplayBookAggregate {
  book_id: string;
  representative: StoreMapBook;
  spots: DisplayLocationSpot[];
  totalQuantity: number;
}

/** סט בודד בארון הסטים — ריבוע אחד בגריד, עם מפתח ייחודי לרינדור. */
export interface StacksSetItem extends DisplayLocationSpot {
  /** אינדקס בתוך אותו `location_id` כש־`quantity_in_cell` > 1. */
  copy_index: number;
}

export function expandStacksFromShelves(
  shelves: StoreMapShelf[],
  cellBooks: Map<string, StoreMapBook[]>,
  _shortagedIds?: Set<string>,
  ghostSlotsByLocation?: ReadonlyMap<string, readonly number[]>,
): StacksSetItem[] {
  const items: StacksSetItem[] = [];
  for (const shelf of shelves) {
    for (const cell of shelf.cells) {
      const books = cellBooks.get(cell.id) ?? cell.books;
      for (const b of books) {
        const { ghosts: shortageCount, total: totalSlots } = spineDisplayCounts(b);
        const ghostSlots = resolveGhostSpineSlots(
          totalSlots,
          shortageCount,
          ghostSlotsByLocation?.get(b.location_id),
        );
        for (let slot = 0; slot < totalSlots; slot++) {
          const dimmed = ghostSlots.has(slot);
          items.push({
            ...b,
            quantity_in_cell: dimmed ? 0 : 1,
            is_pending_shortage: dimmed,
            pending_shortage_count: dimmed ? shortageCount : 0,
            cell_id: cell.id,
            cell_name: cell.cell_name,
            copy_index: slot,
          });
        }
      }
    }
  }
  /** `location_id` הוא `uuid` ו־`copy_index` מספר — שוברי שוויון זולים ללא `collator`. */
  return sortByHebrewKeys(items, (item) => [item.title, item.cell_name], (a, b) =>
    a.location_id < b.location_id ? -1 : a.location_id > b.location_id ? 1 : a.copy_index - b.copy_index,
  );
}

export function aggregateDisplayBooksFromShelves(
  shelves: StoreMapShelf[],
  cellBooks: Map<string, StoreMapBook[]>,
): DisplayBookAggregate[] {
  const byBook = new Map<string, DisplayBookAggregate>();
  for (const shelf of shelves) {
    for (const cell of shelf.cells) {
      const books = cellBooks.get(cell.id) ?? cell.books;
      for (const b of books) {
        const spot: DisplayLocationSpot = { ...b, cell_id: cell.id, cell_name: cell.cell_name };
        const q = b.quantity_in_cell;
        const prev = byBook.get(b.book_id);
        if (!prev) {
          byBook.set(b.book_id, {
            book_id: b.book_id,
            representative: b,
            spots: [spot],
            totalQuantity: q,
          });
        } else {
          prev.spots.push(spot);
          prev.totalQuantity += q;
        }
      }
    }
  }
  return sortByHebrewKeys(Array.from(byBook.values()), (agg) => [agg.representative.title]);
}
