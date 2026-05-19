import type {
  NotificationType,
  OrderStatus,
  OrderType,
  ShortageStatus,
  SideLabel,
  StorePosition,
} from "./enums.js";

export type UUID = string;
export type ISOTimestamp = string;

export interface Supplier {
  id: UUID;
  name: string;
  color_hex: string;
  email: string;
  last_order_date: ISOTimestamp | null;
  created_at: ISOTimestamp;
}

export interface Book {
  id: UUID;
  title: string;
  author: string;
  supplier_id: UUID;
  price: string;
  stock_quantity: number;
  reorder_threshold: number;
  is_new: boolean;
  added_at: ISOTimestamp;
  topic: string;
  is_active: boolean;
  created_at: ISOTimestamp;
  /** הערות «איפה שמתי בשטח» לכל עותק — `copy_placement_notes[i]` מתאים לעותק מספר ‎i+1. */
  copy_placement_notes: string[];
}

export interface ShelvingUnit {
  id: UUID;
  name: string;
  store_position: StorePosition;
  has_sides: boolean;
  is_display_unit: boolean;
  display_order: number;
}

export interface UnitSide {
  id: UUID;
  unit_id: UUID;
  side_label: SideLabel;
  side_order: number;
}

export interface Shelf {
  id: UUID;
  unit_id: UUID | null;
  side_id: UUID | null;
  shelf_number: number;
  label: string | null;
}

export interface Cell {
  id: UUID;
  shelf_id: UUID;
  cell_number: number;
  cell_name: string;
  capacity: number;
}

export interface BookLocation {
  id: UUID;
  book_id: UUID;
  cell_id: UUID;
  position_in_cell: number;
  quantity_in_cell: number;
}

/** מיקום ספר עם שם תא — לתצוגה במסך עדכון מלאי. */
export interface BookLocationExpanded extends BookLocation {
  cell_name: string;
}

/** ספר עם כל רשומות המיקום (תגובת `GET /books?expand=locations`). */
export interface BookWithLocations extends Book {
  locations: BookLocationExpanded[];
}

export interface ShortageItem {
  id: UUID;
  book_id: UUID;
  /** מיקום בתא שנסמן חסר (לטשטוש במפת החנות). */
  location_id: UUID | null;
  added_at: ISOTimestamp;
  status: ShortageStatus;
  resolved_at: ISOTimestamp | null;
}

export interface OrderRow {
  id: UUID;
  /** `NULL` כשההזמנה לפי כותרת ידנית (בלי רשומת `books`). */
  book_id: UUID | null;
  supplier_id: UUID;
  order_type: OrderType;
  quantity: number;
  customer_name: string | null;
  customer_phone: string | null;
  /** כותרת חופשית כש־`book_id` ריק (הזמנה מחוץ לקטלוג). */
  manual_book_title: string | null;
  manual_book_author: string | null;
  status: OrderStatus;
  created_at: ISOTimestamp;
}

export interface AppNotification {
  id: UUID;
  type: NotificationType;
  book_id: UUID | null;
  supplier_id: UUID | null;
  message: string;
  is_read: boolean;
  created_at: ISOTimestamp;
}

/**
 * התראה משולבת עם פרטי הספר/הספק להצגה במסך `notifications.tsx`.
 * השדות `book_*` ו־`supplier_*` יהיו `null` כאשר ההתראה לא קושרה לאותו `entity`.
 */
export interface NotificationListItem {
  id: UUID;
  type: NotificationType;
  book_id: UUID | null;
  supplier_id: UUID | null;
  message: string;
  is_read: boolean;
  created_at: ISOTimestamp;
  book_title: string | null;
  book_author: string | null;
  book_stock_quantity: number | null;
  book_reorder_threshold: number | null;
  supplier_name: string | null;
  supplier_color: string | null;
}

// ---------- Composed: store-map ----------

export interface StoreMapBook {
  /** ה־ID של רשומת `book_locations` — נדרש לפעולת "העברת ספר". */
  location_id: UUID;
  book_id: UUID;
  title: string;
  author: string;
  supplier_id: UUID;
  supplier_color: string;
  position_in_cell: number;
  quantity_in_cell: number;
  is_new: boolean;
  /** מחיר כפי שמוחזר מ־`books.price` (טקסט מ־`numeric` של PG). */
  price: string;
  /** ספר זה סומן כחוסר במדף — עד עדכון סטטוס החוסר ל־`completed`. */
  is_pending_shortage: boolean;
}

export interface StoreMapCell {
  id: UUID;
  cell_number: number;
  cell_name: string;
  capacity: number;
  books: StoreMapBook[];
}

export interface StoreMapShelf {
  id: UUID;
  shelf_number: number;
  label: string | null;
  cells: StoreMapCell[];
}

export interface StoreMapSide {
  id: UUID;
  side_label: SideLabel;
  side_order: number;
  shelves: StoreMapShelf[];
}

export interface StoreMapUnit {
  id: UUID;
  name: string;
  store_position: StorePosition;
  has_sides: boolean;
  is_display_unit: boolean;
  display_order: number;
  sides: StoreMapSide[];
  shelves: StoreMapShelf[];
}

export interface StoreMap {
  units: StoreMapUnit[];
}

// ---------- Composed: location resolution ----------

export interface BookLocationPath {
  book_id: UUID;
  unit_name: string;
  side_label: SideLabel | null;
  shelf_number: number;
  cell_name: string;
  full_path: string;
  short_path: string;
}

// ---------- Composed: shortage list (Phase 3) ----------

/** רשומת חוסר משולבת עם פרטי הספק והספר, להצגה ב־`shortage` screen. */
export interface ShortageListItem {
  id: UUID;
  book_id: UUID;
  location_id: UUID | null;
  added_at: ISOTimestamp;
  status: ShortageStatus;
  resolved_at: ISOTimestamp | null;
  book_title: string;
  book_author: string;
  book_stock_quantity: number;
  book_reorder_threshold: number;
  book_price: string;
  supplier_id: UUID;
  supplier_name: string;
  supplier_color: string;
  supplier_email: string;
}

// ---------- Composed: orders list (Phase 3) ----------

/** רשומת הזמנה משולבת עם פרטי הספר והספק. */
export interface OrderListItem {
  id: UUID;
  book_id: UUID | null;
  supplier_id: UUID;
  order_type: OrderType;
  quantity: number;
  customer_name: string | null;
  customer_phone: string | null;
  manual_book_title: string | null;
  manual_book_author: string | null;
  status: OrderStatus;
  created_at: ISOTimestamp;
  book_title: string;
  book_author: string;
  book_price: string;
  supplier_name: string;
  supplier_color: string;
  supplier_email: string;
}

/** קבוצת הזמנות לפי ספק לצורך ייצוא PDF / שליחה במייל. */
export interface OrdersBySupplierGroup {
  supplier_id: UUID;
  supplier_name: string;
  supplier_color: string;
  supplier_email: string;
  orders: OrderListItem[];
}
