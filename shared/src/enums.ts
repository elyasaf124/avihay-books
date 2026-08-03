export const ORDER_TYPES = ["inventory", "customer", "whatsapp"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = ["pending", "sent", "completed", "archived"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SHORTAGE_STATUSES = ["shortage", "order_pending", "completed"] as const;
export type ShortageStatus = (typeof SHORTAGE_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "low_stock",
  "remove_from_display",
  "supplier_reorder_reminder",
  "orders_without_supplier",
  "whatsapp_human_handover",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const WHATSAPP_INTENTS = ["stock_check", "price_check", "place_order"] as const;
export type WhatsappIntent = (typeof WHATSAPP_INTENTS)[number];

export const WHATSAPP_SESSION_STATUSES = ["active", "human_handover", "closed"] as const;
export type WhatsappSessionStatus = (typeof WHATSAPP_SESSION_STATUSES)[number];

export const FULFILLMENT_TYPES = ["pickup", "delivery"] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const DELIVERY_METHODS = ["home", "pickup_point"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const STORE_POSITIONS = [
  "front",
  "left",
  "right",
  "island",
  "display",
  "stacks",
  "pocket",
  "brochure",
] as const;
export type StorePosition = (typeof STORE_POSITIONS)[number];

/** יחידות עם UI ערימות (לא מדפים/תאים במסך) */
export const FLAT_SURFACE_POSITIONS = ["display", "stacks"] as const;
export type FlatSurfacePosition = (typeof FLAT_SURFACE_POSITIONS)[number];

export function isFlatSurfacePosition(p: StorePosition): p is FlatSurfacePosition {
  return (FLAT_SURFACE_POSITIONS as readonly string[]).includes(p);
}

export const SIDE_LABELS = ["צד ימין", "צד שמאל"] as const;
export type SideLabel = (typeof SIDE_LABELS)[number];
