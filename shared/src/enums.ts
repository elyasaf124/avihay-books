export const ORDER_TYPES = ["inventory", "customer", "whatsapp"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = ["pending", "sent", "completed"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SHORTAGE_STATUSES = ["shortage", "order_pending", "completed"] as const;
export type ShortageStatus = (typeof SHORTAGE_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "low_stock",
  "remove_from_display",
  "supplier_reorder_reminder",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const WHATSAPP_INTENTS = ["stock_check", "price_check", "place_order"] as const;
export type WhatsappIntent = (typeof WHATSAPP_INTENTS)[number];

export const STORE_POSITIONS = ["front", "left", "right", "island", "display"] as const;
export type StorePosition = (typeof STORE_POSITIONS)[number];

export const SIDE_LABELS = ["צד א׳", "צד ב׳"] as const;
export type SideLabel = (typeof SIDE_LABELS)[number];
