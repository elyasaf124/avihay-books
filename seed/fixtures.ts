/**
 * Single source of truth for mock-data seed values. Every seed_*.ts file
 * imports from here so all foreign-key relationships stay consistent.
 */
import { createHash } from "node:crypto";
import type {
  BookInput,
  BookLocationInput,
  CellInput,
  NotificationInput,
  OrderInput,
  ShelfInput,
  ShelvingUnitInput,
  ShortageInput,
  SupplierInput,
  UnitSideInput,
} from "../backend/src/repos/schemas.js";

/** RFC-9562-valid random UUID deterministic from `(label, seq)` → always passes Zod `.uuid()` */
export function deterministicUuid(label: string, seq: number): string {
  const h = createHash("sha256").update(`${label}:${seq}`).digest();
  const b = Uint8Array.from(h.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const id = (s: string): string => s;

// Stable UUIDs — must match rows already upserted on first failed seed run
export const SUP_KETER = id("a1111111-1111-1111-1111-111111111111");
export const SUP_DVIR = id("a2222222-2222-2222-2222-222222222222");
export const SUP_KINNERET = id("a3333333-3333-3333-3333-333333333333");
export const SUP_YEDIOT = id("a4444444-4444-4444-4444-444444444444");

export const UNIT_FRONT = id("b1111111-1111-1111-1111-111111111111");
export const UNIT_LEFT = id("b2222222-2222-2222-2222-222222222222");
export const UNIT_RIGHT = id("b3333333-3333-3333-3333-333333333333");
export const UNIT_ISLAND = id("b4444444-4444-4444-4444-444444444444");
export const UNIT_STACKS = id("b6666666-6666-6666-6666-666666666666");
export const UNIT_DISPLAY = id("b5555555-5555-5555-5555-555555555555");

export const SIDE_A = id("c1111111-1111-1111-1111-111111111111");
export const SIDE_B = id("c2222222-2222-2222-2222-222222222222");

export const suppliers: SupplierInput[] = [
  {
    id: SUP_KETER,
    name: "כתר",
    color_hex: "#5d4037",
    email: "orders@keter-books.example",
    last_order_date: "2026-04-10T09:00:00Z",
  },
  {
    id: SUP_DVIR,
    name: "דביר",
    color_hex: "#735c00",
    email: "orders@dvir.example",
    last_order_date: "2026-04-20T09:00:00Z",
  },
  {
    id: SUP_KINNERET,
    name: "כנרת זמורה",
    color_hex: "#432b27",
    email: "orders@kinneret-zb.example",
    last_order_date: "2026-03-25T09:00:00Z",
  },
  {
    id: SUP_YEDIOT,
    name: "ידיעות ספרים",
    color_hex: "#8a4f3d",
    email: "orders@ybooks.example",
    last_order_date: "2026-05-01T09:00:00Z",
  },
];

export const shelvingUnits: ShelvingUnitInput[] = [
  {
    id: UNIT_FRONT,
    name: "ארון חזית",
    store_position: "front",
    has_sides: false,
    is_display_unit: false,
    display_order: 1,
  },
  {
    id: UNIT_LEFT,
    name: "ארון שמאל",
    store_position: "left",
    has_sides: false,
    is_display_unit: false,
    display_order: 2,
  },
  {
    id: UNIT_RIGHT,
    name: "ארון ימין",
    store_position: "right",
    has_sides: false,
    is_display_unit: false,
    display_order: 3,
  },
  {
    id: UNIT_STACKS,
    name: "סטנד",
    store_position: "stacks",
    has_sides: false,
    is_display_unit: true,
    display_order: 4,
  },
  {
    id: UNIT_ISLAND,
    name: "האי",
    store_position: "island",
    has_sides: true,
    is_display_unit: false,
    display_order: 5,
  },
  {
    id: UNIT_DISPLAY,
    name: "ארון תצוגה",
    store_position: "display",
    has_sides: false,
    is_display_unit: true,
    display_order: 6,
  },
];

export const unitSides: UnitSideInput[] = [
  { id: SIDE_A, unit_id: UNIT_ISLAND, side_label: "צד א׳", side_order: 1 },
  { id: SIDE_B, unit_id: UNIT_ISLAND, side_label: "צד ב׳", side_order: 2 },
];

const bookSeedRows: Array<Omit<BookInput, "is_new" | "is_active" | "topic"> & {
  topic: string;
  isNew?: boolean;
}> = [
  { title: "מסע לאיתקה", author: "אסיה כהן", supplier_id: SUP_KETER, price: 89, stock_quantity: 12, reorder_threshold: 3, topic: "פרוזה" },
  { title: "הצל הארוך", author: "דניאל לוין", supplier_id: SUP_KETER, price: 78, stock_quantity: 7, reorder_threshold: 2, topic: "פרוזה" },
  { title: "סיפורי הלילה", author: "רוני אלון", supplier_id: SUP_KETER, price: 65, stock_quantity: 9, reorder_threshold: 3, topic: "פרוזה" },
  { title: "בין שתי גדות", author: "תמר ברק", supplier_id: SUP_KETER, price: 92, stock_quantity: 4, reorder_threshold: 4, topic: "פרוזה" },
  { title: "אבני דרך", author: "אלי פרץ", supplier_id: SUP_KETER, price: 84, stock_quantity: 11, reorder_threshold: 3, topic: "ביוגרפיה", isNew: true },
  { title: "צבעי הזמן", author: "ליאת מזרחי", supplier_id: SUP_KETER, price: 72, stock_quantity: 6, reorder_threshold: 2, topic: "שירה" },
  { title: "ההר השני", author: "דוד אייזן", supplier_id: SUP_DVIR, price: 95, stock_quantity: 14, reorder_threshold: 4, topic: "פרוזה" },
  { title: "מעבר לאופק", author: "נעמה רוזן", supplier_id: SUP_DVIR, price: 88, stock_quantity: 8, reorder_threshold: 3, topic: "פרוזה" },
  { title: "מורה דרך", author: "יואב הראל", supplier_id: SUP_DVIR, price: 110, stock_quantity: 5, reorder_threshold: 2, topic: "עיון" },
  { title: "אגדות הים", author: "מיכל גלעד", supplier_id: SUP_DVIR, price: 68, stock_quantity: 10, reorder_threshold: 3, topic: "ילדים" },
  { title: "מתכוני סבתא", author: "אסתר לוי", supplier_id: SUP_DVIR, price: 79, stock_quantity: 6, reorder_threshold: 3, topic: "בישול", isNew: true },
  { title: "מילים בלילה", author: "עומר פלד", supplier_id: SUP_DVIR, price: 64, stock_quantity: 9, reorder_threshold: 3, topic: "שירה" },
  { title: "חוטים של זהב", author: "שרה אבן", supplier_id: SUP_DVIR, price: 96, stock_quantity: 3, reorder_threshold: 3, topic: "פרוזה" },
  { title: "נשמה של נייר", author: "אורי דגן", supplier_id: SUP_KINNERET, price: 82, stock_quantity: 8, reorder_threshold: 3, topic: "פרוזה" },
  { title: "הספרייה החשאית", author: "מיה כהן", supplier_id: SUP_KINNERET, price: 99, stock_quantity: 5, reorder_threshold: 2, topic: "פרוזה", isNew: true },
  { title: "בוקר של שלווה", author: "אלון בר", supplier_id: SUP_KINNERET, price: 74, stock_quantity: 11, reorder_threshold: 3, topic: "שירה" },
  { title: "מהלכים של פיל", author: "תמר נמרי", supplier_id: SUP_KINNERET, price: 70, stock_quantity: 13, reorder_threshold: 4, topic: "ילדים" },
  { title: "מגדל הזיכרון", author: "יונתן שטרן", supplier_id: SUP_KINNERET, price: 105, stock_quantity: 4, reorder_threshold: 2, topic: "עיון" },
  { title: "צללי הגשם", author: "רותם אביב", supplier_id: SUP_KINNERET, price: 86, stock_quantity: 6, reorder_threshold: 3, topic: "פרוזה" },
  { title: "כוכבים עפים", author: "עידן יחזקאל", supplier_id: SUP_KINNERET, price: 67, stock_quantity: 9, reorder_threshold: 3, topic: "ילדים" },
  { title: "מסעות בלילה", author: "גלית פינטו", supplier_id: SUP_YEDIOT, price: 93, stock_quantity: 7, reorder_threshold: 3, topic: "פרוזה" },
  { title: "תפילת הבוקר", author: "אבי שלום", supplier_id: SUP_YEDIOT, price: 60, stock_quantity: 15, reorder_threshold: 4, topic: "יהדות" },
  { title: "מילון הלב", author: "נטע אריה", supplier_id: SUP_YEDIOT, price: 88, stock_quantity: 6, reorder_threshold: 3, topic: "שירה" },
  { title: "סיפורה של עיר", author: "אלעד תורן", supplier_id: SUP_YEDIOT, price: 101, stock_quantity: 4, reorder_threshold: 2, topic: "היסטוריה" },
  { title: "ערב בקיבוץ", author: "רחל לב", supplier_id: SUP_YEDIOT, price: 76, stock_quantity: 10, reorder_threshold: 3, topic: "פרוזה" },
  { title: "עיתוי מושלם", author: "דורון פז", supplier_id: SUP_YEDIOT, price: 82, stock_quantity: 6, reorder_threshold: 3, topic: "עיון", isNew: true },
  { title: "שיר של ילדות", author: "אלון נחום", supplier_id: SUP_YEDIOT, price: 71, stock_quantity: 12, reorder_threshold: 4, topic: "ילדים" },
  { title: "מתחת לעננים", author: "תהילה ארז", supplier_id: SUP_YEDIOT, price: 90, stock_quantity: 5, reorder_threshold: 3, topic: "פרוזה" },
  { title: "ימי תהילה", author: "חיים גלזר", supplier_id: SUP_KETER, price: 87, stock_quantity: 8, reorder_threshold: 3, topic: "פרוזה" },
  { title: "מעבר לזמן", author: "מאי שטרית", supplier_id: SUP_DVIR, price: 94, stock_quantity: 5, reorder_threshold: 3, topic: "פרוזה" },
  { title: "שיחות על אהבה", author: "דנה גורן", supplier_id: SUP_KINNERET, price: 80, stock_quantity: 9, reorder_threshold: 3, topic: "עיון" },
  { title: "עורבים בשמי כרך", author: "יואל אבני", supplier_id: SUP_YEDIOT, price: 102, stock_quantity: 3, reorder_threshold: 2, topic: "פרוזה" },
];

export const books: BookInput[] = bookSeedRows.map((b, idx) => ({
  id: deterministicUuid("book", idx + 1),
  title: b.title,
  author: b.author,
  supplier_id: b.supplier_id,
  price: b.price,
  stock_quantity: b.stock_quantity,
  reorder_threshold: b.reorder_threshold,
  is_new: b.isNew ?? false,
  added_at: b.isNew ? "2026-04-25T09:00:00Z" : "2025-12-01T09:00:00Z",
  topic: b.topic,
  is_active: true,
}));

interface ShelfPlan {
  containerId: string;
  containerKind: "unit" | "side";
  count: number;
}

const shelfPlans: ShelfPlan[] = [
  { containerId: UNIT_FRONT, containerKind: "unit", count: 5 },
  { containerId: UNIT_LEFT, containerKind: "unit", count: 4 },
  { containerId: UNIT_RIGHT, containerKind: "unit", count: 4 },
  { containerId: SIDE_A, containerKind: "side", count: 3 },
  { containerId: SIDE_B, containerKind: "side", count: 3 },
  { containerId: UNIT_STACKS, containerKind: "unit", count: 1 },
  { containerId: UNIT_DISPLAY, containerKind: "unit", count: 1 },
];

export const shelves: (ShelfInput & { _key: string })[] = [];
let shelfCtr = 0;
for (const plan of shelfPlans) {
  for (let n = 1; n <= plan.count; n++) {
    shelfCtr++;
    shelves.push({
      id: deterministicUuid("shelf", shelfCtr),
      unit_id: plan.containerKind === "unit" ? plan.containerId : null,
      side_id: plan.containerKind === "side" ? plan.containerId : null,
      shelf_number: n,
      label:
        plan.containerId === UNIT_DISPLAY
          ? "משטח תצוגה"
          : plan.containerId === UNIT_STACKS
            ? "משטח סטנד"
            : `מדף ${n}`,
      _key: `${plan.containerKind}:${plan.containerId}:${n}`,
    });
  }
}

const cellsPerShelf = 4;
export const cells: CellInput[] = [];
let cellNameCounter = 1;
let cellCtr = 0;
for (const shelf of shelves) {
  const isDisplayShelf = shelf.unit_id === UNIT_DISPLAY;
  const isStacksShelf = shelf.unit_id === UNIT_STACKS;
  const isFlatShelf = isDisplayShelf || isStacksShelf;
  const nCells = isFlatShelf ? 8 : cellsPerShelf;
  for (let n = 1; n <= nCells; n++) {
    cellCtr++;
    const cellName = isDisplayShelf
      ? `תצוגה ${n}`
      : isStacksShelf
        ? `סטנד ${n}`
        : String(cellNameCounter);
    if (!isFlatShelf) cellNameCounter++;
    cells.push({
      id: deterministicUuid("cell", cellCtr),
      shelf_id: shelf.id!,
      cell_number: n,
      cell_name: cellName,
      capacity: 6,
    });
  }
}

/** עותק פיזי בודד מהמלאי — כמה שדרות בתא משמען כמה שורות עם `quantity_in_cell: 1`. */
const flattenedCopies = books.flatMap((b) =>
  Array.from({ length: b.stock_quantity }, () => ({ book_id: b.id! })),
);
const deterministicMix = flattenedCopies
  .map((row, seq) => ({
    ...row,
    sortKey: deterministicUuid("stockCopyIx", seq),
  }))
  .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

const displayShelfIds = new Set(
  shelves.filter((s) => s.unit_id === UNIT_DISPLAY).map((s) => s.id!),
);
const displayCells = cells.filter((c) => displayShelfIds.has(c.shelf_id));
const regularCells = cells.filter((c) => !displayShelfIds.has(c.shelf_id));

const newBookIdSet = new Set(books.filter((b) => b.is_new).map((b) => b.id!));
const newCopies = deterministicMix.filter((row) => newBookIdSet.has(row.book_id));
const regularCopies = deterministicMix.filter((row) => !newBookIdSet.has(row.book_id));

export const bookLocations: BookLocationInput[] = [];
let locCtr = 0;

/** מפזר עותקים ברוטציה על התאים; לכל תא מונה `position_in_cell` עולה — בלי לנסות לשים שני ספרים שונים באותה משבצת. */
function appendPlacements(
  copies: Array<{ book_id: string }>,
  cellPool: CellInput[],
): void {
  if (cellPool.length === 0) throw new Error("bookLocations: empty cell pool");
  const nextPosByCell = new Map<string, number>(
    cellPool.map((c) => [c.id!, 1]),
  );
  const n = cellPool.length;
  for (let i = 0; i < copies.length; i++) {
    const cell = cellPool[i % n]!;
    const cellId = cell.id!;
    const pos = nextPosByCell.get(cellId)!;
    nextPosByCell.set(cellId, pos + 1);
    const row = copies[i]!;
    locCtr++;
    bookLocations.push({
      id: deterministicUuid("loc", locCtr),
      book_id: row.book_id,
      cell_id: cellId,
      position_in_cell: pos,
      quantity_in_cell: 1,
    });
  }
}

appendPlacements(regularCopies, regularCells);
appendPlacements(newCopies, displayCells);

export const orders: OrderInput[] = [
  {
    id: deterministicUuid("order", 1),
    book_id: books[3]!.id!,
    supplier_id: books[3]!.supplier_id,
    order_type: "inventory",
    quantity: 6,
    status: "sent",
  },
  {
    id: deterministicUuid("order", 2),
    book_id: books[8]!.id!,
    supplier_id: books[8]!.supplier_id,
    order_type: "inventory",
    quantity: 4,
    status: "pending",
  },
  {
    id: deterministicUuid("order", 3),
    book_id: books[12]!.id!,
    supplier_id: books[12]!.supplier_id,
    order_type: "inventory",
    quantity: 5,
    status: "pending",
  },
  {
    id: deterministicUuid("order", 4),
    book_id: books[14]!.id!,
    supplier_id: books[14]!.supplier_id,
    order_type: "customer",
    quantity: 1,
    customer_name: "אבישי כהן",
    customer_phone: "050-1234567",
    status: "pending",
  },
  {
    id: deterministicUuid("order", 5),
    book_id: books[23]!.id!,
    supplier_id: books[23]!.supplier_id,
    order_type: "customer",
    quantity: 2,
    customer_name: "מיכל ברקת",
    customer_phone: "054-7891234",
    status: "sent",
  },
  {
    id: deterministicUuid("order", 6),
    book_id: books[10]!.id!,
    supplier_id: books[10]!.supplier_id,
    order_type: "whatsapp",
    quantity: 1,
    customer_name: "ליאת ברנע",
    customer_phone: "052-7654321",
    status: "pending",
  },
  {
    id: deterministicUuid("order", 7),
    book_id: books[18]!.id!,
    supplier_id: books[18]!.supplier_id,
    order_type: "whatsapp",
    quantity: 1,
    customer_name: "יואב לוי",
    customer_phone: "053-9988776",
    status: "pending",
  },
];

export const shortages: ShortageInput[] = [
  { id: deterministicUuid("shortage", 1), book_id: books[3]!.id!, status: "order_pending" },
  { id: deterministicUuid("shortage", 2), book_id: books[12]!.id!, status: "shortage" },
  { id: deterministicUuid("shortage", 3), book_id: books[10]!.id!, status: "shortage" },
  { id: deterministicUuid("shortage", 4), book_id: books[23]!.id!, status: "shortage" },
  { id: deterministicUuid("shortage", 5), book_id: books[17]!.id!, status: "shortage" },
  { id: deterministicUuid("shortage", 6), book_id: books[31]!.id!, status: "shortage" },
];

export const notifications: NotificationInput[] = [
  {
    id: deterministicUuid("notif", 1),
    type: "low_stock",
    book_id: books[3]!.id!,
    message: `מלאי נמוך: "${books[3]!.title}" — נשארו ${books[3]!.stock_quantity} עותקים`,
    is_read: false,
  },
  {
    id: deterministicUuid("notif", 2),
    type: "remove_from_display",
    book_id: books[4]!.id!,
    message: `הסר מחזית: "${books[4]!.title}" כבר חודש בארון התצוגה`,
    is_read: false,
  },
  {
    id: deterministicUuid("notif", 3),
    type: "supplier_reorder_reminder",
    supplier_id: SUP_KINNERET,
    message: "הספק כנרת זמורה לא הוזמן ממנו זה שבועיים",
    is_read: false,
  },
];
