import type { ShortageListItem } from "@avihay-books/shared";

/** עותקים במחסן = מלאי כולל פחות מה שכבר על המדפים (כמו בשרת). */
export function bookWarehouseQty(
  item: Pick<ShortageListItem, "book_unplaced_quantity">,
): number {
  const n = item.book_unplaced_quantity;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/** כמה עותקים אפשר להשלים מהמחסן לקבוצת חוסר אחת. */
export function maxShortageCompleteQty(item: ShortageListItem): number {
  const missing = Math.max(item.missing_count ?? 1, 1);
  return Math.min(missing, bookWarehouseQty(item));
}
