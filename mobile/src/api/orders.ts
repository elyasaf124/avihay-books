import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderListItem, OrderStatus, OrderType, OrdersBySupplierGroup } from "@avihay-books/shared";
import { useMemo } from "react";
import { api } from "./client";

const STATUS_RANK: Record<OrderStatus, number> = {
  pending: 0,
  sent: 1,
  completed: 2,
};

function pickMergedStatus(a: OrderStatus, b: OrderStatus): OrderStatus {
  return STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
}

const ORDERS_LIST_KEY = (type: OrderType) => ["orders", "list", type] as const;

export function useOrdersList(type: OrderType) {
  return useQuery<OrderListItem[]>({
    queryKey: ORDERS_LIST_KEY(type),
    queryFn: async () => {
      const { data } = await api.get<OrderListItem[]>("/orders", { params: { type } });
      return data;
    },
    staleTime: 15_000,
    retry: 0,
  });
}

/** מאחד שורות עם אותו `book_id` לשורת תצוגה אחת (כמות מצטברת). ללקוחות נשמרת הפרדה לפי פרטי לקוח. */
export function mergeOrderLinesForDisplay(
  orders: OrderListItem[],
  orderType: OrderType,
): OrderListItem[] {
  if (orders.length <= 1) return orders;
  const sorted = [...orders].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const map = new Map<string, OrderListItem>();
  for (const item of sorted) {
    const dedupeKey =
      orderType === "inventory"
        ? `${item.supplier_id}\u0000${item.book_id}`
        : `${item.supplier_id}\u0000${item.book_id}\u0000${item.customer_name ?? ""}\u0000${item.customer_phone ?? ""}`;
    const prev = map.get(dedupeKey);
    if (!prev) {
      map.set(dedupeKey, { ...item });
    } else {
      map.set(dedupeKey, {
        ...prev,
        quantity: prev.quantity + item.quantity,
        status: pickMergedStatus(prev.status, item.status),
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** הופך מערך הזמנות לקבוצות מאוחדות לפי ספק (לתצוגה ולייצוא PDF). */
export function useOrdersGroupedBySupplier(
  items: OrderListItem[],
  orderType: OrderType,
): OrdersBySupplierGroup[] {
  return useMemo(() => {
    const map = new Map<string, OrdersBySupplierGroup>();
    for (const item of items) {
      const existing = map.get(item.supplier_id);
      if (existing) {
        existing.orders.push(item);
      } else {
        map.set(item.supplier_id, {
          supplier_id: item.supplier_id,
          supplier_name: item.supplier_name,
          supplier_color: item.supplier_color,
          supplier_email: item.supplier_email,
          orders: [item],
        });
      }
    }
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        orders: mergeOrderLinesForDisplay(g.orders, orderType),
      }))
      .sort((a, b) => a.supplier_name.localeCompare(b.supplier_name, "he"));
  }, [items, orderType]);
}

/** מפתח יציב לשורה כפי שמוצגת אחרי איחוד כפילויות (למחיקה מרוכזת בשרת). */
export function orderDisplayLineKey(order: OrderListItem): string {
  return `${order.book_id}\u0000${order.supplier_id}\u0000${order.order_type}\u0000${order.customer_name ?? ""}\u0000${order.customer_phone ?? ""}`;
}

/** גוף `POST /orders/remove-line`. */
export function removeOrderLineBodyFromDisplayRow(order: OrderListItem): {
  book_id: string;
  supplier_id: string;
  order_type: OrderType;
  customer_name: string | null;
  customer_phone: string | null;
} {
  return {
    book_id: order.book_id,
    supplier_id: order.supplier_id,
    order_type: order.order_type,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
  };
}

interface RemoveOrderLineResponse {
  deleted: number;
}

const ORDERS_KEY_PREFIX_REMOVE = ["orders"] as const;

export function useRemoveOrderLine() {
  const client = useQueryClient();
  return useMutation<RemoveOrderLineResponse, Error, OrderListItem>({
    mutationFn: async (order) => {
      const { data } = await api.post<RemoveOrderLineResponse>(
        "/orders/remove-line",
        removeOrderLineBodyFromDisplayRow(order),
      );
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ORDERS_KEY_PREFIX_REMOVE });
    },
  });
}
