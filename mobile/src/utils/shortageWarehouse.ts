import type { ShortageListItem } from "@avihay-books/shared";

/** עותקים במחסן = מלאי כולל פחות מה שכבר על המדפים (כמו בשרת). */
export function bookWarehouseQty(
  item: Pick<ShortageListItem, "book_unplaced_quantity">,
): number {
  const n = item.book_unplaced_quantity;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/**
 * כמה עותקים חסרים בקבוצה (ספר+תא) להצגה ב־UI.
 * כשיש נתוני מדף — `shelf_stock_in_cell - quantity_in_cell` (כמו במפת היחידה);
 * אחרת סופרים `missing_count` מרשומות החוסר.
 */
export function shortageGroupMissingCopies(
  item: Pick<ShortageListItem, "missing_count" | "shelf_stock_in_cell" | "quantity_in_cell">,
): number {
  const shelf = item.shelf_stock_in_cell;
  const qty = item.quantity_in_cell;
  if (typeof shelf === "number" && typeof qty === "number") {
    const gap = Math.max(0, Math.trunc(shelf) - Math.trunc(qty));
    if (gap > 0) return gap;
  }
  const raw = item.missing_count;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }
  return 1;
}

/** כמה עותקים אפשר להשלים מהמחסן לקבוצת חוסר אחת. */
export function maxShortageCompleteQty(item: ShortageListItem): number {
  const missing = shortageGroupMissingCopies(item);
  return Math.min(missing, bookWarehouseQty(item));
}
