import type { StoreMapBook, StoreMapShelf } from "@avihay-books/shared";

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
): StacksSetItem[] {
  const items: StacksSetItem[] = [];
  for (const shelf of shelves) {
    for (const cell of shelf.cells) {
      const books = cellBooks.get(cell.id) ?? cell.books;
      for (const b of books) {
        const qty = Math.max(0, Math.floor(Number(b.quantity_in_cell)));
        for (let i = 0; i < qty; i++) {
          items.push({
            ...b,
            quantity_in_cell: 1,
            cell_id: cell.id,
            cell_name: cell.cell_name,
            copy_index: i,
          });
        }
      }
    }
  }
  return items.sort((a, b) =>
    a.title.localeCompare(b.title, "he") ||
    a.cell_name.localeCompare(b.cell_name, "he") ||
    a.location_id.localeCompare(b.location_id) ||
    a.copy_index - b.copy_index,
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
  return Array.from(byBook.values()).sort((a, b) =>
    a.representative.title.localeCompare(b.representative.title, "he"),
  );
}
