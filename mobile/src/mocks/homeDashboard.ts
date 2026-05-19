import type {
  Book,
  StoreMap,
  StoreMapBook,
  StoreMapCell,
  StoreMapShelf,
  StoreMapUnit,
  Supplier,
} from "@avihay-books/shared";

/** Dummy UUIDs ל־demo בלבד */
const uid = (n: number) => `10000000-0000-4000-a000-${String(n).padStart(12, "0")}`;

export const mockSuppliers: Supplier[] = [
  {
    id: uid(501),
    name: "כתר ספרים",
    color_hex: "#1e3a8a",
    email: "orders@keter.example",
    last_order_date: null,
    created_at: "2025-06-01T10:00:00.000Z",
  },
  {
    id: uid(502),
    name: "כנרת זמורה",
    color_hex: "#006a61",
    email: "orders@kineret.example",
    last_order_date: null,
    created_at: "2025-06-01T10:00:00.000Z",
  },
  {
    id: uid(503),
    name: "ידיעות ספרים",
    color_hex: "#653400",
    email: "orders@yedioth.example",
    last_order_date: null,
    created_at: "2025-06-01T10:00:00.000Z",
  },
  {
    id: uid(504),
    name: "אהבת ספר",
    color_hex: "#ba1a1a",
    email: "orders@ahava.example",
    last_order_date: null,
    created_at: "2025-06-01T10:00:00.000Z",
  },
];

const supplierById = new Map(mockSuppliers.map((s) => [s.id, s]));

interface MockBookSpec {
  title: string;
  author: string;
  supplier: number;
  price: string;
  stock: number;
  isNew?: boolean;
  topic: string;
  qtyInCell?: number;
}

interface MockCellSpec {
  name: string;
  capacity: number;
  books: MockBookSpec[];
}

interface MockShelfSpec {
  label: string | null;
  cells: MockCellSpec[];
}

interface MockUnitSpec {
  unitIdx: number;
  shelves?: MockShelfSpec[];
  /** עבור ה־`אי`: שתי קבוצות מדפים, אחת לכל צד. */
  sides?: { label: "צד א׳" | "צד ב׳"; shelves: MockShelfSpec[] }[];
}

/** קטלוג ספרים מעובש לצורך חיפוש + מיקום ב־cells. */
const catalog: Record<string, MockBookSpec> = {
  b1: {
    title: "מסע אל קצה הלילה",
    author: "הנרי מילר",
    supplier: 501,
    price: "59.90",
    stock: 8,
    topic: "ספרות מתורגמת",
  },
  b2: {
    title: "הסיפור של הבת שלי",
    author: "אמנדה סדר",
    supplier: 501,
    price: "89.00",
    stock: 3,
    isNew: true,
    topic: "הורות וחינוך",
  },
  b3: {
    title: "קיצור תולדות האנושות",
    author: "יובל הררי",
    supplier: 502,
    price: "98.00",
    stock: 24,
    topic: "היסטוריה",
  },
  b4: {
    title: "מפת חום",
    author: "אטלס ארצות החום",
    supplier: 503,
    price: "45.50",
    stock: 5,
    topic: "מפות",
  },
  b5: {
    title: "לומד לבד מתמטיקה לכיתות א׳–ב׳",
    author: "מערכת \"בין המצבים\"",
    supplier: 504,
    price: "64.90",
    stock: 15,
    topic: "ילדים",
  },
  b6: {
    title: "פלאי הכימיה",
    author: "דניאל קרמן",
    supplier: 503,
    price: "72.00",
    stock: 9,
    topic: "מדע פופולרי",
  },
  b7: {
    title: "הקול של ההר",
    author: "יאסונרי קוובטה",
    supplier: 502,
    price: "82.00",
    stock: 11,
    topic: "פרוזה יפנית",
  },
  b8: {
    title: "מהפכה של רגע",
    author: "אסף ענברי",
    supplier: 502,
    price: "78.00",
    stock: 6,
    topic: "מסות",
  },
  b9: {
    title: "הבית בארץ ניצנים",
    author: "מירה מגן",
    supplier: 501,
    price: "69.00",
    stock: 4,
    isNew: true,
    topic: "ספרות עברית",
  },
  b10: {
    title: "ילד שמח, ילד עצוב",
    author: "דנה אטם",
    supplier: 504,
    price: "55.00",
    stock: 7,
    topic: "ילדים",
  },
  b11: {
    title: "אגדות החצר העברית",
    author: "נחום סוקולוב",
    supplier: 503,
    price: "49.00",
    stock: 12,
    topic: "פולקלור",
  },
  b12: {
    title: "מטבחי האימפריה",
    author: "ענת לוין",
    supplier: 501,
    price: "118.00",
    stock: 2,
    topic: "בישול",
  },
};

const unitSpecs: MockUnitSpec[] = [
  {
    unitIdx: 1,
    shelves: [
      {
        label: "מדף 1",
        cells: [
          { name: "12", capacity: 8, books: [catalog.b1!, catalog.b8!] },
          { name: "13", capacity: 8, books: [catalog.b5!, catalog.b10!] },
          { name: "14", capacity: 6, books: [catalog.b12!, catalog.b4!, catalog.b11!] },
        ],
      },
      {
        label: "מדף 2",
        cells: [
          { name: "21", capacity: 10, books: [catalog.b3!, catalog.b6!, catalog.b7!] },
          { name: "22", capacity: 8, books: [catalog.b11!, catalog.b4!, catalog.b1!] },
        ],
      },
    ],
  },
  {
    unitIdx: 2,
    shelves: [
      {
        label: "מדף 1",
        cells: [
          { name: "30", capacity: 10, books: [catalog.b5!, catalog.b10!] },
          { name: "31", capacity: 8, books: [catalog.b8!, catalog.b7!, catalog.b3!] },
        ],
      },
      {
        label: "מדף 2",
        cells: [
          { name: "32", capacity: 8, books: [catalog.b7!, catalog.b11!] },
          { name: "33", capacity: 6, books: [catalog.b6!, catalog.b1!, catalog.b4!] },
        ],
      },
    ],
  },
  {
    unitIdx: 3,
    shelves: [
      {
        label: "מדף 1",
        cells: [
          { name: "40", capacity: 8, books: [catalog.b1!, catalog.b7!, catalog.b10!] },
          { name: "41", capacity: 6, books: [catalog.b6!, catalog.b5!, catalog.b12!] },
        ],
      },
      {
        label: "מדף 2",
        cells: [{ name: "42", capacity: 10, books: [catalog.b3!, catalog.b8!] }],
      },
    ],
  },
  {
    unitIdx: 4,
    sides: [
      {
        label: "צד א׳",
        shelves: [
          {
            label: "ספרים חדשים",
            cells: [
              { name: "60", capacity: 6, books: [catalog.b5!] },
              { name: "61", capacity: 4, books: [catalog.b10!, catalog.b4!, catalog.b11!] },
            ],
          },
        ],
      },
      {
        label: "צד ב׳",
        shelves: [
          {
            label: "מועדפים",
            cells: [
              { name: "65", capacity: 6, books: [catalog.b3!, catalog.b7!, catalog.b1!] },
              { name: "66", capacity: 4, books: [catalog.b12!, catalog.b6!, catalog.b8!] },
            ],
          },
        ],
      },
    ],
  },
  {
    unitIdx: 5,
    shelves: [
      {
        label: "משטח תצוגה",
        cells: [
          { name: "תצוגה 1", capacity: 6, books: [catalog.b2!] },
          { name: "תצוגה 2", capacity: 6, books: [catalog.b9!] },
        ],
      },
    ],
  },
];

let bookSeq = 100;
const bookIdByCatalog = new Map<string, string>();
function bookId(spec: MockBookSpec): string {
  const key = `${spec.title}::${spec.author}`;
  let id = bookIdByCatalog.get(key);
  if (!id) {
    id = uid(bookSeq++);
    bookIdByCatalog.set(key, id);
  }
  return id;
}

let cellSeq = 200;
let shelfSeq = 300;
let sideSeq = 400;
let locSeq = 700;

function buildBook(spec: MockBookSpec, position: number): StoreMapBook {
  const supplier = supplierById.get(uid(spec.supplier))!;
  return {
    location_id: uid(locSeq++),
    book_id: bookId(spec),
    title: spec.title,
    author: spec.author,
    supplier_id: supplier.id,
    supplier_color: supplier.color_hex,
    position_in_cell: position,
    quantity_in_cell: spec.qtyInCell ?? 1,
    is_new: spec.isNew ?? false,
    price: spec.price,
    is_pending_shortage: false,
  };
}

function buildShelf(s: MockShelfSpec, shelfNumber: number): StoreMapShelf {
  const cells: StoreMapCell[] = s.cells.map((c, ci) => ({
    id: uid(cellSeq++),
    cell_number: ci + 1,
    cell_name: c.name,
    capacity: c.capacity,
    books: c.books.map((b, bi) => buildBook(b, bi + 1)),
  }));
  return {
    id: uid(shelfSeq++),
    shelf_number: shelfNumber,
    label: s.label,
    cells,
  };
}

function buildUnit(spec: MockUnitSpec): StoreMapUnit {
  const base = {
    id: uid(spec.unitIdx),
    name:
      spec.unitIdx === 1
        ? "ארון חזית"
        : spec.unitIdx === 2
          ? "ארון שמאל"
          : spec.unitIdx === 3
            ? "ארון ימין"
            : spec.unitIdx === 4
              ? "האי"
              : "ארון תצוגה",
    store_position:
      spec.unitIdx === 1
        ? ("front" as const)
        : spec.unitIdx === 2
          ? ("left" as const)
          : spec.unitIdx === 3
            ? ("right" as const)
            : spec.unitIdx === 4
              ? ("island" as const)
              : ("display" as const),
    has_sides: spec.unitIdx === 4,
    is_display_unit: spec.unitIdx === 5,
    display_order: spec.unitIdx,
    sides:
      spec.sides?.map((s, idx) => ({
        id: uid(sideSeq++),
        side_label: s.label,
        side_order: (idx + 1) as 1 | 2,
        shelves: s.shelves.map((sh, shIdx) => buildShelf(sh, shIdx + 1)),
      })) ?? [],
    shelves: spec.shelves?.map((sh, shIdx) => buildShelf(sh, shIdx + 1)) ?? [],
  } satisfies StoreMapUnit;
  return base;
}

export const mockStoreMap: StoreMap = {
  units: unitSpecs.map(buildUnit),
};

const iso = "2025-06-01T10:00:00.000Z";

function distinctBooks(): Book[] {
  const seen = new Map<string, Book>();
  for (const spec of Object.values(catalog)) {
    const id = bookId(spec);
    if (seen.has(id)) continue;
    seen.set(id, {
      id,
      title: spec.title,
      author: spec.author,
      supplier_id: uid(spec.supplier),
      price: spec.price,
      stock_quantity: spec.stock,
      reorder_threshold: 2,
      is_new: spec.isNew ?? false,
      added_at: iso,
      topic: spec.topic,
      is_active: true,
      created_at: iso,
      copy_placement_notes: [],
    });
  }
  return Array.from(seen.values());
}

export const mockCatalogBooks: Book[] = distinctBooks();

/**
 * Stats קצרים שאינם בחוזה ה־API של שלב 1. נגזרים מנתוני המפה כשיש,
 * ונפילה לערכי דמה תואמי הייצוג מ־Stitch.
 */
export interface HomeStats {
  totalStock: string;
  stockDeltaLabel: string;
  openOrders: string;
  ordersSubLabel: string;
  shortages: string;
  shortageSubLabel: string;
}

export const mockHomeStats: HomeStats = {
  totalStock: "12,408",
  stockDeltaLabel: "+342 השבוע",
  openOrders: "84",
  ordersSubLabel: "2 עוכבו למשלוח",
  shortages: "12",
  shortageSubLabel: "דורש טיפול מיידי",
};

function sumFloorCopiesInUnit(u: StoreMapUnit): number {
  let n = 0;
  const addShelves = (shelves: StoreMapShelf[]): void => {
    for (const shelf of shelves) {
      for (const cell of shelf.cells) {
        for (const b of cell.books) n += b.quantity_in_cell;
      }
    }
  };
  addShelves(u.shelves);
  for (const side of u.sides) addShelves(side.shelves);
  return n;
}

/** סה״כ עותקים במדף ממפת החנות — סכום `quantity_in_cell` מכל תא וצד ארון. */
export function sumFloorCopiesFromMap(map: StoreMap | undefined): number | null {
  if (!map || map.units.length === 0) return null;
  const total = map.units.reduce((sum, u) => sum + sumFloorCopiesInUnit(u), 0);
  if (total === 0) return null;
  return total;
}

export interface DerivedHomeFloorStock {
  totalStockFormatted: string;
  usedRealFloorTotal: boolean;
}

/** מחשבה מוכנה לכרטיס «מלאי כולל» — ערכי תצוגה או דמה מה־`mockHomeStats`. */
export function deriveHomeFloorStock(map: StoreMap | undefined): DerivedHomeFloorStock {
  const summed = sumFloorCopiesFromMap(map);
  if (summed === null) {
    return {
      totalStockFormatted: mockHomeStats.totalStock,
      usedRealFloorTotal: false,
    };
  }
  return {
    totalStockFormatted: summed.toLocaleString("he-IL"),
    usedRealFloorTotal: true,
  };
}
