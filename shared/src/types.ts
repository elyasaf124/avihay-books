import type {
  DeliveryMethod,
  FulfillmentType,
  NotificationType,
  OrderStatus,
  OrderType,
  ShortageStatus,
  SideLabel,
  StorePosition,
  WhatsappSessionStatus,
} from "./enums.js";

export type UUID = string;
export type ISOTimestamp = string;

export interface Supplier {
  id: UUID;
  name: string;
  color_hex: string;
  email: string | null;
  last_order_date: ISOTimestamp | null;
  created_at: ISOTimestamp;
}

export interface Book {
  id: UUID;
  title: string;
  author: string | null;
  supplier_id: UUID;
  price: string | null;
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
  supplier_id: UUID | null;
  order_type: OrderType;
  quantity: number;
  customer_name: string | null;
  customer_phone: string | null;
  /** כותרת חופשית כש־`book_id` ריק (הזמנה מחוץ לקטלוג). */
  manual_book_title: string | null;
  manual_book_author: string | null;
  status: OrderStatus;
  created_at: ISOTimestamp;
  /** שדות זרימת בוט הוואטסאפ (אופציונליים — קיימים בהזמנות `whatsapp`). */
  fulfillment_type?: FulfillmentType | null;
  delivery_method?: DeliveryMethod | null;
  delivery_fee?: string | null;
  address?: string | null;
  notes?: string | null;
  order_group_id?: UUID | null;
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
  author: string | null;
  supplier_id: UUID;
  supplier_color: string;
  position_in_cell: number;
  quantity_in_cell: number;
  is_new: boolean;
  /** מחיר כפי שמוחזר מ־`books.price` (טקסט מ־`numeric` של PG). */
  price: string | null;
  /** נושא הספר מ־`books.topic`. */
  topic: string;
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
  /** שם התא בשטח (למשל «5») — לא הנתיב המלא; null אם אין `location_id`. */
  cell_name: string | null;
  added_at: ISOTimestamp;
  status: ShortageStatus;
  resolved_at: ISOTimestamp | null;
  book_title: string;
  book_author: string | null;
  book_stock_quantity: number;
  book_reorder_threshold: number;
  book_price: string | null;
  supplier_id: UUID;
  supplier_name: string;
  supplier_color: string;
  supplier_email: string | null;
}

// ---------- Composed: orders list (Phase 3) ----------

/** רשומת הזמנה משולבת עם פרטי הספר והספק. */
export interface OrderListItem {
  id: UUID;
  book_id: UUID | null;
  supplier_id: UUID | null;
  order_type: OrderType;
  quantity: number;
  customer_name: string | null;
  customer_phone: string | null;
  manual_book_title: string | null;
  manual_book_author: string | null;
  status: OrderStatus;
  created_at: ISOTimestamp;
  book_title: string;
  book_author: string | null;
  book_price: string | null;
  /** ספק הספר בקטלוג (`books.supplier_id`) — לתצוגה גם כש־`supplier_id` בהזמנה ריק. */
  catalog_supplier_id: UUID | null;
  supplier_name: string;
  supplier_color: string;
  supplier_email: string | null;
  /** שדות זרימת בוט הוואטסאפ (אופציונליים — קיימים בהזמנות `whatsapp`). */
  fulfillment_type?: FulfillmentType | null;
  delivery_method?: DeliveryMethod | null;
  delivery_fee?: string | null;
  address?: string | null;
  notes?: string | null;
  order_group_id?: UUID | null;
}

/** רשומת שיחת בוט וואטסאפ (`whatsapp_sessions`). */
export interface WhatsappSession {
  id: UUID;
  phone_number: string;
  status: WhatsappSessionStatus;
  current_node: string;
  context: Record<string, unknown>;
  profile_name: string | null;
  book_id: UUID | null;
  order_id: UUID | null;
  bot_paused_until: ISOTimestamp | null;
  last_inbound_at: ISOTimestamp | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

/** לוג הודעת וואטסאפ נכנסת/יוצאת (`whatsapp_messages`). */
export interface WhatsappMessage {
  id: UUID;
  phone_number: string;
  direction: "in" | "out";
  wa_message_id: string | null;
  msg_type: string;
  body: string | null;
  payload: Record<string, unknown>;
  is_echo: boolean;
  created_at: ISOTimestamp;
}

/** שיחה אחת בתיבת הצ'אט באפליקציה — שורה ברשימת השיחות (מקובצת לפי מספר טלפון). */
export interface ChatConversation {
  phone_number: string;
  profile_name: string | null;
  status: WhatsappSessionStatus | null;
  /** האם הבוט מושהה כרגע (מענה אנושי פעיל). */
  bot_paused: boolean;
  last_message_body: string | null;
  last_message_type: string;
  last_message_direction: "in" | "out" | null;
  last_message_at: ISOTimestamp | null;
  unread_count: number;
}

/** הודעה בודדת לתצוגה במסך השיחה. */
export interface ChatMessageView {
  id: UUID;
  direction: "in" | "out";
  msg_type: string;
  body: string | null;
  is_echo: boolean;
  created_at: ISOTimestamp;
}

/** תוצאת שליחת הודעת עובד מתוך האפליקציה. */
export interface ChatSendResult {
  ok: boolean;
  message: ChatMessageView;
}

/** קבוצת הזמנות לפי ספק לצורך ייצוא PDF / שליחה במייל. */
export interface OrdersBySupplierGroup {
  supplier_id: UUID | null;
  supplier_name: string;
  supplier_color: string;
  supplier_email: string | null;
  orders: OrderListItem[];
}

/** קבוצת הזמנות לפי לקוח (שם + טלפון) לתצוגה בלשוניות לקוח / וואטסאפ. */
export interface OrdersByCustomerGroup {
  customer_name: string;
  customer_phone: string;
  orders: OrderListItem[];
}
