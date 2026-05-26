import type { OrderStatus, OrderType } from "./enums.js";

export type ReconcileOrderInput = {
  id: string;
  order_type: OrderType;
  quantity: number;
  status: OrderStatus;
  created_at: string;
};

export type ReconcileAction =
  | { action: "complete"; id: string }
  | { action: "reduce"; id: string; newQuantity: number }
  | { action: "delete"; id: string };

const ORDER_TYPE_RANK: Record<OrderType, number> = {
  customer: 0,
  whatsapp: 1,
  inventory: 2,
};

function isOpenOrder(status: OrderStatus): boolean {
  return status === "pending" || status === "sent";
}

function isDemandOrder(type: OrderType): boolean {
  return type === "customer" || type === "whatsapp";
}

/** מיון הזמנות פתוחות לפי עדיפות: לקוח → וואטסאפ → מלאi, ואז לפי תאריך יצירה. */
export function sortOrdersForReconciliation(orders: ReconcileOrderInput[]): ReconcileOrderInput[] {
  return orders
    .filter((o) => isOpenOrder(o.status))
    .sort((a, b) => {
      const rankDiff = ORDER_TYPE_RANK[a.order_type] - ORDER_TYPE_RANK[b.order_type];
      if (rankDiff !== 0) return rankDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}

/**
 * מחלק כמות שהגיעה למחסן בין הזמנות פתוחות לפי סדר עדיפות.
 * לקוח/וואטסאפ מלא → complete; חלקי → reduce.
 * מלאi מלא → delete; חלקי → reduce.
 */
export function allocateArrivedStock(
  orders: ReconcileOrderInput[],
  arrivedQty: number,
): ReconcileAction[] {
  if (arrivedQty <= 0) return [];

  const sorted = sortOrdersForReconciliation(orders);
  let remaining = arrivedQty;
  const actions: ReconcileAction[] = [];

  for (const order of sorted) {
    if (remaining <= 0) break;
    const fill = Math.min(order.quantity, remaining);
    if (fill <= 0) continue;

    if (isDemandOrder(order.order_type)) {
      if (fill >= order.quantity) {
        actions.push({ action: "complete", id: order.id });
      } else {
        actions.push({ action: "reduce", id: order.id, newQuantity: order.quantity - fill });
      }
    } else if (fill >= order.quantity) {
      actions.push({ action: "delete", id: order.id });
    } else {
      actions.push({ action: "reduce", id: order.id, newQuantity: order.quantity - fill });
    }
    remaining -= fill;
  }

  return actions;
}
