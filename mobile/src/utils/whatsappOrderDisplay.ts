import type { OrderListItem } from "@avihay-books/shared";
import { he } from "../i18n/he";

export interface WhatsappOrderMetaRow {
  label: string;
  value: string;
}

/** שורות מטא-דאטה להצגה בכרטיס הזמנת וואטסאפ (משורת הזמנה ראשונה בקבוצה). */
export function buildWhatsappOrderMetaRows(
  order: Pick<
    OrderListItem,
    "fulfillment_type" | "delivery_method" | "delivery_fee" | "address" | "notes"
  >,
): WhatsappOrderMetaRow[] {
  const rows: WhatsappOrderMetaRow[] = [];

  if (order.fulfillment_type) {
    rows.push({
      label: he.orders.whatsappFulfillmentType,
      value:
        order.fulfillment_type === "delivery"
          ? he.orders.whatsappFulfillmentDelivery
          : he.orders.whatsappFulfillmentPickup,
    });
  }

  if (order.fulfillment_type === "delivery" && order.address?.trim()) {
    rows.push({
      label: he.orders.whatsappAddress,
      value: order.address.trim(),
    });
  }

  if (order.fulfillment_type === "delivery" && order.delivery_method) {
    const methodLabel =
      order.delivery_method === "home"
        ? he.orders.whatsappDeliveryHome
        : he.orders.whatsappDeliveryPickupPoint;
    const fee = order.delivery_fee?.trim();
    const feeSuffix = fee && fee !== "0" && fee !== "0.00" ? ` (₪${fee})` : "";
    rows.push({
      label: he.orders.whatsappDeliveryMethod,
      value: `${methodLabel}${feeSuffix}`,
    });
  }

  if (order.notes?.trim()) {
    rows.push({
      label: he.orders.whatsappNotes,
      value: order.notes.trim(),
    });
  }

  return rows;
}
