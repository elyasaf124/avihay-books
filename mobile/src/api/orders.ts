import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OrderListItem,
  OrderRow,
  OrderStatus,
  OrderType,
  OrdersBySupplierGroup,
} from "@avihay-books/shared";
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

/** מפתח יציב לספר בשורת הזמנה (קטלוג או ידני). */
export function orderBookLineKey(o: Pick<OrderListItem, "book_id" | "manual_book_title">): string {
  if (o.book_id) return o.book_id;
  return `m:${o.manual_book_title ?? ""}`;
}

/** מפתח ספק+ספר להזמנות מלאי. */
export function inventorySupplierBookKey(
  o: Pick<OrderListItem, "supplier_id" | "book_id" | "manual_book_title">,
): string {
  return `${o.supplier_id}\u0000${orderBookLineKey(o)}`;
}

/** סך כמויות בסיס של הזמנות מלאי (ללא ביקוש לקוח/וואטסאפ) לפי ספק+ספר. */
export function summedInventoryBaseQtyBySupplierBook(
  inventoryOrders: OrderListItem[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of inventoryOrders) {
    if (o.order_type !== "inventory") continue;
    const k = inventorySupplierBookKey(o);
    m.set(k, (m.get(k) ?? 0) + o.quantity);
  }
  return m;
}

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
        ? `${item.supplier_id}\u0000${orderBookLineKey(item)}`
        : `${item.supplier_id}\u0000${orderBookLineKey(item)}\u0000${item.customer_name ?? ""}\u0000${item.customer_phone ?? ""}`;
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

/** סך כמויות מהזמנות לקוח + וואטסאפ לפי צמד `supplier_id` + `book_id` (לבסיס מאותו מפתח איחוד כמו במלאי). */
export function summedCustomerAndWhatsappQtyByBookSupplier(orders: OrderListItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of orders) {
    if (o.order_type !== "customer" && o.order_type !== "whatsapp") continue;
    const k = `${o.supplier_id}\u0000${orderBookLineKey(o)}`;
    m.set(k, (m.get(k) ?? 0) + o.quantity);
  }
  return m;
}

/** לתצוגת לשונית מלאי: מוסיף לכמויות בשורות מלאי את סך ההזמנות מלקוח / וואטסאפ לאותו ספר וספק,
 *  ומוסיף שורות «וירטואליות» לספרים שיש להם ביקוש לקוח/וואטסאפ בלי שורת מלאי (למשל אחרי החלפת ספר בעריכה). */
export function augmentInventoryGroupsWithCustomerWhatsappTotals(
  groups: OrdersBySupplierGroup[],
  extraQtyBySupplierBook: Map<string, number>,
  customerWhatsappOrders: OrderListItem[],
): OrdersBySupplierGroup[] {
  const matchedExtraKeys = new Set<string>();

  const augmented = groups.map((g) => ({
    ...g,
    orders: g.orders.map((o) => {
      const k = `${o.supplier_id}\u0000${orderBookLineKey(o)}`;
      const extra = extraQtyBySupplierBook.get(k) ?? 0;
      if (extra > 0) matchedExtraKeys.add(k);
      if (extra === 0) return o;
      return { ...o, quantity: o.quantity + extra };
    }),
  }));

  const metaBySupplierBook = new Map<string, OrderListItem>();
  for (const o of customerWhatsappOrders) {
    if (o.order_type !== "customer" && o.order_type !== "whatsapp") continue;
    const k = `${o.supplier_id}\u0000${orderBookLineKey(o)}`;
    if (!metaBySupplierBook.has(k)) metaBySupplierBook.set(k, o);
  }

  const groupBySupplier = new Map(
    augmented.map((g) => [g.supplier_id, { ...g, orders: [...g.orders] }]),
  );

  for (const [k, extraQty] of extraQtyBySupplierBook) {
    if (extraQty <= 0 || matchedExtraKeys.has(k)) continue;
    const meta = metaBySupplierBook.get(k);
    if (!meta) continue;

    const syntheticLine: OrderListItem = {
      ...meta,
      order_type: "inventory",
      quantity: extraQty,
      customer_name: null,
      customer_phone: null,
    };

    const existing = groupBySupplier.get(meta.supplier_id);
    if (existing) {
      existing.orders.push(syntheticLine);
    } else {
      groupBySupplier.set(meta.supplier_id, {
        supplier_id: meta.supplier_id,
        supplier_name: meta.supplier_name,
        supplier_color: meta.supplier_color,
        supplier_email: meta.supplier_email,
        orders: [syntheticLine],
      });
    }
  }

  return Array.from(groupBySupplier.values()).sort((a, b) =>
    a.supplier_name.localeCompare(b.supplier_name, "he"),
  );
}

/** מפתח יציב לשורה כפי שמוצגת אחרי איחוד כפילויות (למחיקה מרוכזת בשרת). */
export function orderDisplayLineKey(order: OrderListItem): string {
  return `${orderBookLineKey(order)}\u0000${order.supplier_id}\u0000${order.order_type}\u0000${order.customer_name ?? ""}\u0000${order.customer_phone ?? ""}`;
}

/** גוף `POST /orders/remove-line`. */
export function removeOrderLineBodyFromDisplayRow(order: OrderListItem): {
  book_id: string | null;
  manual_book_title: string | null;
  supplier_id: string;
  order_type: OrderType;
  customer_name: string | null;
  customer_phone: string | null;
} {
  return {
    book_id: order.book_id,
    manual_book_title: order.manual_book_title,
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

/** גוף `POST /orders` — הזמנת לקוח / וואטסאפ, מהקטלוג או לפי כותרת ידנית. */
export interface CreateCustomerOrderBody {
  supplier_id: string;
  order_type: "customer" | "whatsapp";
  quantity: number;
  customer_name: string;
  customer_phone: string;
  status?: "pending";
  book_id?: string | null;
  manual_book_title?: string | null;
  manual_book_author?: string | null;
}

export function useCreateCustomerOrder() {
  const client = useQueryClient();
  return useMutation<OrderRow, Error, CreateCustomerOrderBody>({
    mutationFn: async (body) => {
      const { data } = await api.post<OrderRow>("/orders", {
        ...body,
        status: body.status ?? "pending",
      });
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ORDERS_KEY_PREFIX_REMOVE });
    },
  });
}

function normalizeCustomerPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** מפתח יציב לחבילת הזמנת לקוח (שם + טלפון מנורמלים). */
export function customerOrderBundleKey(
  o: Pick<OrderListItem, "customer_name" | "customer_phone">,
): string {
  return `${(o.customer_name ?? "").trim()}\u0000${normalizeCustomerPhone(o.customer_phone ?? "")}`;
}

/** מפתח יציב לשורת ספר בחבילת לקוח (ספק + ספר קטלוג/ידני). */
export function customerOrderLineKey(o: {
  supplier_id: string;
  book_id: string | null;
  manual_book_title?: string | null;
}): string {
  const bookPart = o.book_id ?? `m:${(o.manual_book_title ?? "").trim()}`;
  return `${o.supplier_id}\u0000${bookPart}`;
}

/** שורת ספר לשמירה / סנכרון חבילת לקוח. */
export interface CustomerOrderLineInput {
  supplier_id: string;
  book_id: string | null;
  manual_book_title: string | null;
  manual_book_author: string | null;
  quantity: number;
}

export function buildCreateCustomerOrderBody(
  line: CustomerOrderLineInput,
  customer: { name: string; phone: string },
  orderType: "customer" | "whatsapp" = "customer",
): CreateCustomerOrderBody {
  if (line.book_id) {
    return {
      supplier_id: line.supplier_id,
      order_type: orderType,
      quantity: line.quantity,
      customer_name: customer.name,
      customer_phone: customer.phone,
      book_id: line.book_id,
    };
  }
  return {
    supplier_id: line.supplier_id,
    order_type: orderType,
    quantity: line.quantity,
    customer_name: customer.name,
    customer_phone: customer.phone,
    book_id: null,
    manual_book_title: line.manual_book_title,
    manual_book_author: line.manual_book_author,
  };
}

function customerLinesEquivalent(
  orig: OrderListItem,
  next: CustomerOrderLineInput,
  origTotalQty: number,
): boolean {
  if (orig.supplier_id !== next.supplier_id) return false;
  if (origTotalQty !== next.quantity) return false;
  if (orig.book_id) return orig.book_id === next.book_id;
  const origTitle = (orig.manual_book_title ?? "").trim();
  const nextTitle = (next.manual_book_title ?? "").trim();
  const origAuthor = (orig.manual_book_author ?? "").trim();
  const nextAuthor = (next.manual_book_author ?? "").trim();
  return origTitle === nextTitle && origAuthor === nextAuthor;
}

async function postCreateCustomerOrder(body: CreateCustomerOrderBody): Promise<OrderRow> {
  const { data } = await api.post<OrderRow>("/orders", { ...body, status: "pending" });
  return data;
}

async function postRemoveOrderLine(order: OrderListItem): Promise<void> {
  await api.post("/orders/remove-line", removeOrderLineBodyFromDisplayRow(order));
}

/** יוצר חבילת הזמנות לקוח / וואטסאפ חדשה (שורה לכל ספר). */
export async function createCustomerOrderBundle(
  lines: CustomerOrderLineInput[],
  customer: { name: string; phone: string },
  orderType: "customer" | "whatsapp" = "customer",
): Promise<void> {
  await Promise.all(
    lines.map((line) =>
      postCreateCustomerOrder(buildCreateCustomerOrderBody(line, customer, orderType)),
    ),
  );
}

/** מסנכרן חבילת לקוח / וואטסאפ קיימת עם רשימת ספרים חדשה (remove-line + create). */
export async function syncCustomerOrderBundle(params: {
  original: OrderListItem[];
  next: CustomerOrderLineInput[];
  customer: { name: string; phone: string };
  originalCustomer: { name: string; phone: string };
  orderType?: "customer" | "whatsapp";
}): Promise<void> {
  const orderType = params.orderType ?? "customer";
  const customerChanged =
    params.originalCustomer.name.trim() !== params.customer.name.trim() ||
    normalizeCustomerPhone(params.originalCustomer.phone) !==
      normalizeCustomerPhone(params.customer.phone);

  if (customerChanged) {
    const removedKeys = new Set<string>();
    for (const row of params.original) {
      const k = customerOrderLineKey(row);
      if (removedKeys.has(k)) continue;
      removedKeys.add(k);
      await postRemoveOrderLine(row);
    }
    await createCustomerOrderBundle(params.next, params.customer, orderType);
    return;
  }

  const origByKey = new Map<string, OrderListItem>();
  for (const row of params.original) {
    const k = customerOrderLineKey(row);
    if (!origByKey.has(k)) origByKey.set(k, row);
  }

  const nextKeys = new Set<string>();
  for (const line of params.next) {
    const k = customerOrderLineKey(line);
    nextKeys.add(k);
    const orig = origByKey.get(k);
    if (!orig) {
      await postCreateCustomerOrder(buildCreateCustomerOrderBody(line, params.customer, orderType));
      continue;
    }
    const origTotalQty = params.original
      .filter((r) => customerOrderLineKey(r) === k)
      .reduce((s, r) => s + r.quantity, 0);
    if (customerLinesEquivalent(orig, line, origTotalQty)) continue;
    await postRemoveOrderLine(orig);
    await postCreateCustomerOrder(buildCreateCustomerOrderBody(line, params.customer, orderType));
  }

  for (const [k, orig] of origByKey) {
    if (!nextKeys.has(k)) await postRemoveOrderLine(orig);
  }
}

export function useSyncCustomerOrderBundle() {
  const client = useQueryClient();
  return useMutation<
    void,
    Error,
    {
      original: OrderListItem[];
      next: CustomerOrderLineInput[];
      customer: { name: string; phone: string };
      originalCustomer: { name: string; phone: string };
      orderType?: "customer" | "whatsapp";
    }
  >({
    mutationFn: syncCustomerOrderBundle,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ORDERS_KEY_PREFIX_REMOVE });
    },
  });
}

export function useCreateCustomerOrderBundle() {
  const client = useQueryClient();
  return useMutation<
    void,
    Error,
    { lines: CustomerOrderLineInput[]; customer: { name: string; phone: string }; orderType?: "customer" | "whatsapp" }
  >({
    mutationFn: async ({ lines, customer, orderType = "customer" }) =>
      createCustomerOrderBundle(lines, customer, orderType),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ORDERS_KEY_PREFIX_REMOVE });
    },
  });
}

function findInventoryRowsForBookSupplier(
  rawInventory: OrderListItem[],
  line: Pick<OrderListItem, "supplier_id" | "book_id" | "manual_book_title" | "book_title">,
): OrderListItem[] {
  return rawInventory.filter((o) => {
    if (o.order_type !== "inventory") return false;
    if (o.supplier_id !== line.supplier_id) return false;
    if (o.customer_name != null || o.customer_phone != null) return false;
    if (line.book_id) return o.book_id === line.book_id;
    const lineTitle = (line.manual_book_title ?? line.book_title ?? "").trim();
    return !o.book_id && (o.manual_book_title ?? "").trim() === lineTitle;
  });
}

function inventoryCreateBodyFromLine(
  line: OrderListItem,
  quantity: number,
  status: OrderStatus = "pending",
): {
  supplier_id: string;
  order_type: "inventory";
  quantity: number;
  status: OrderStatus;
  book_id?: string;
  manual_book_title?: string | null;
  manual_book_author?: string | null;
} {
  if (line.book_id) {
    return {
      book_id: line.book_id,
      supplier_id: line.supplier_id,
      order_type: "inventory",
      quantity,
      status,
    };
  }
  const manualTitle = (line.manual_book_title ?? line.book_title ?? "").trim();
  const manualAuthor = (line.manual_book_author ?? line.book_author ?? "").trim();
  return {
    supplier_id: line.supplier_id,
    order_type: "inventory",
    quantity,
    status,
    manual_book_title: manualTitle || null,
    manual_book_author: manualAuthor || null,
  };
}

/** מעדכן כמות בסיס של הזמנת מלאi (מאחד שורות כפולות ושומר סטטוס). */
export async function updateInventoryOrderBaseQuantity(
  rawInventory: OrderListItem[],
  line: OrderListItem,
  newBaseQty: number,
): Promise<void> {
  if (!line.book_id && !(line.manual_book_title?.trim() || line.book_title?.trim())) {
    throw new Error("inventory_requires_book");
  }
  if (!Number.isFinite(newBaseQty) || newBaseQty < 1) throw new Error("invalid_quantity");

  const matching = findInventoryRowsForBookSupplier(rawInventory, line);

  if (matching.length === 0) {
    await api.post<OrderRow>("/orders", inventoryCreateBodyFromLine(line, newBaseQty));
    return;
  }

  const currentBase = matching.reduce((s, o) => s + o.quantity, 0);
  if (currentBase === newBaseQty) return;

  const status = matching.reduce((best, o) =>
    STATUS_RANK[o.status] <= STATUS_RANK[best.status] ? o : best,
  ).status;

  await postRemoveOrderLine({
    ...matching[0]!,
    order_type: "inventory",
    customer_name: null,
    customer_phone: null,
  });

  await api.post<OrderRow>("/orders", inventoryCreateBodyFromLine(line, newBaseQty, status));
}

export function useUpdateInventoryOrderQuantity() {
  const client = useQueryClient();
  return useMutation<
    void,
    Error,
    { rawInventory: OrderListItem[]; line: OrderListItem; newBaseQty: number }
  >({
    mutationFn: ({ rawInventory, line, newBaseQty }) =>
      updateInventoryOrderBaseQuantity(rawInventory, line, newBaseQty),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ORDERS_KEY_PREFIX_REMOVE });
    },
  });
}
