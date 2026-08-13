import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  OrderListItem,
  OrderRow,
  OrderStatus,
  OrderType,
  OrdersByCustomerGroup,
  OrdersBySupplierGroup,
} from "@avihay-books/shared";
import { useMemo } from "react";
import { api } from "./client";
import { DASHBOARD_STATS_KEY } from "./dashboard";
import { compareHebrew, sortByHebrewKeys } from "../utils/hebrewSort";

const STATUS_RANK: Record<OrderStatus, number> = {
  pending: 0,
  sent: 1,
  completed: 2,
  archived: 3,
};

function pickMergedStatus(a: OrderStatus, b: OrderStatus): OrderStatus {
  return STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
}

const ORDERS_LIST_KEY = (type: OrderType) => ["orders", "list", type] as const;
const ORDER_LIST_TYPES: OrderType[] = ["inventory", "customer", "whatsapp"];

type OrdersCacheSnapshot = Partial<Record<OrderType, OrderListItem[] | undefined>>;

const pendingQtyByLine = new Map<string, number>();
const pendingQtyByType = new Map<OrderType, number>();

function trackPendingQty(lineKey: string, type: OrderType): void {
  pendingQtyByLine.set(lineKey, (pendingQtyByLine.get(lineKey) ?? 0) + 1);
  pendingQtyByType.set(type, (pendingQtyByType.get(type) ?? 0) + 1);
}

function releasePendingQty(lineKey: string, type: OrderType): { line: number; type: number } {
  const nextLine = (pendingQtyByLine.get(lineKey) ?? 0) - 1;
  if (nextLine <= 0) pendingQtyByLine.delete(lineKey);
  else pendingQtyByLine.set(lineKey, nextLine);

  const nextType = (pendingQtyByType.get(type) ?? 0) - 1;
  if (nextType <= 0) pendingQtyByType.delete(type);
  else pendingQtyByType.set(type, nextType);

  return { line: Math.max(0, nextLine), type: Math.max(0, nextType) };
}

async function cancelOrderListQueries(
  client: QueryClient,
  types: readonly OrderType[] = ORDER_LIST_TYPES,
): Promise<void> {
  await Promise.all(types.map((type) => client.cancelQueries({ queryKey: ORDERS_LIST_KEY(type) })));
}

function snapshotOrderLists(
  client: QueryClient,
  types: readonly OrderType[] = ORDER_LIST_TYPES,
): OrdersCacheSnapshot {
  const snap: OrdersCacheSnapshot = {};
  for (const type of types) {
    snap[type] = client.getQueryData<OrderListItem[]>(ORDERS_LIST_KEY(type));
  }
  return snap;
}

function restoreOrderLists(client: QueryClient, snap: OrdersCacheSnapshot | undefined): void {
  if (!snap) return;
  for (const type of ORDER_LIST_TYPES) {
    const data = snap[type];
    if (data !== undefined) {
      client.setQueryData(ORDERS_LIST_KEY(type), data);
    }
  }
}

function patchOrderList(
  client: QueryClient,
  type: OrderType,
  updater: (list: OrderListItem[]) => OrderListItem[],
): void {
  client.setQueryData<OrderListItem[]>(ORDERS_LIST_KEY(type), (prev) =>
    prev ? updater(prev) : prev,
  );
}

function invalidateOrderLists(
  client: QueryClient,
  types: readonly OrderType[],
  opts?: { dashboard?: boolean },
): void {
  for (const type of types) {
    void client.invalidateQueries({ queryKey: ORDERS_LIST_KEY(type) });
  }
  if (opts?.dashboard) {
    void client.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
  }
}

/** מחליף כמות בשורות תואמות; מאחד כפילויות; אופציונלי יוצר שורה אם חסרה. */
function applyOptimisticLineQuantity(
  list: OrderListItem[] | undefined,
  match: (o: OrderListItem) => boolean,
  newQty: number,
  createLine?: OrderListItem,
): OrderListItem[] | undefined {
  if (!list) return createLine ? [{ ...createLine, quantity: newQty }] : list;
  let assigned = false;
  const next: OrderListItem[] = [];
  for (const o of list) {
    if (!match(o)) {
      next.push(o);
      continue;
    }
    if (!assigned) {
      next.push({ ...o, quantity: newQty });
      assigned = true;
    }
  }
  if (!assigned && createLine) {
    next.push({ ...createLine, quantity: newQty });
  }
  return next;
}

function applyOptimisticLineStatus(
  list: OrderListItem[] | undefined,
  match: (o: OrderListItem) => boolean,
  status: Extract<OrderStatus, "pending" | "sent">,
): OrderListItem[] | undefined {
  if (!list) return list;
  return list.map((o) =>
    match(o) && (o.status === "pending" || o.status === "sent") ? { ...o, status } : o,
  );
}

function removeMatchingLines(
  list: OrderListItem[] | undefined,
  match: (o: OrderListItem) => boolean,
): OrderListItem[] | undefined {
  if (!list) return list;
  return list.filter((o) => !match(o));
}

const UNASSIGNED_GROUP_KEY = "__unassigned__";
const NEUTRAL_SUPPLIER_LABEL = "—";

/** מפתח יציב לקיבוץ לפי ספק (כולל שורות ללא ספק). */
export function supplierGroupKey(supplierId: string | null): string {
  return supplierId ?? UNASSIGNED_GROUP_KEY;
}

/** מפתח יציב לצמד ספק+ספר (ספק ריק → מחרוזת ריקה). */
export function supplierBookKey(
  supplierId: string | null,
  bookKey: string,
): string {
  return `${supplierId ?? ""}\u0000${bookKey}`;
}

/** מפתח יציב לספר בשורת הזמנה (קטלוג או ידני). */
export function orderBookLineKey(o: Pick<OrderListItem, "book_id" | "manual_book_title">): string {
  if (o.book_id) return o.book_id;
  return `m:${o.manual_book_title ?? ""}`;
}

/** מפתח ספק+ספר להזמנות מלאי. */
export function inventorySupplierBookKey(
  o: Pick<OrderListItem, "supplier_id" | "book_id" | "manual_book_title">,
): string {
  return supplierBookKey(o.supplier_id, orderBookLineKey(o));
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

function orderDisplayTitle(
  o: Pick<OrderListItem, "book_title" | "manual_book_title">,
): string {
  return (o.manual_book_title ?? o.book_title ?? "").trim();
}

/** מיון שורות הזמנה לפי כותרת הספר (א-ב עברי). */
export function sortOrderLinesByHebrewTitle(orders: OrderListItem[]): OrderListItem[] {
  return sortByHebrewKeys(orders, (o) => [orderDisplayTitle(o)]);
}

/** מאחד שורות עם אותו `book_id` לשורת תצוגה אחת (כמות מצטברת). ללקוחות נשמרת הפרדה לפי פרטי לקוח. */
export function mergeOrderLinesForDisplay(
  orders: OrderListItem[],
  orderType: OrderType,
): OrderListItem[] {
  if (orders.length <= 1) return sortOrderLinesByHebrewTitle(orders);
  const sorted = [...orders].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const map = new Map<string, OrderListItem>();
  for (const item of sorted) {
    const dedupeKey =
      orderType === "inventory"
        ? supplierBookKey(item.supplier_id, orderBookLineKey(item))
        : `${supplierBookKey(item.supplier_id, orderBookLineKey(item))}\u0000${item.customer_name ?? ""}\u0000${item.customer_phone ?? ""}`;
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
  return sortOrderLinesByHebrewTitle(Array.from(map.values()));
}

/** הופך מערך הזמנות לקבוצות מאוחדות לפי לקוח (שם + טלפון מנורמל). */
export function useOrdersGroupedByCustomer(
  items: OrderListItem[],
  orderType: OrderType,
): OrdersByCustomerGroup[] {
  return useMemo(() => {
    const map = new Map<string, OrdersByCustomerGroup>();
    for (const item of items) {
      const key = customerOrderBundleKey(item);
      const existing = map.get(key);
      if (existing) {
        existing.orders.push(item);
      } else {
        map.set(key, {
          customer_name: (item.customer_name ?? "").trim(),
          customer_phone: (item.customer_phone ?? "").trim(),
          orders: [item],
        });
      }
    }
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        orders: mergeOrderLinesForDisplay(g.orders, orderType),
      }))
      .sort((a, b) => {
        const aLatest = Math.max(...a.orders.map((o) => new Date(o.created_at).getTime()));
        const bLatest = Math.max(...b.orders.map((o) => new Date(o.created_at).getTime()));
        return bLatest - aLatest;
      });
  }, [items, orderType]);
}

function normalizeOrderSearchText(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("und");
}

function orderBookTitleForSearch(o: Pick<OrderListItem, "book_title" | "manual_book_title">): string {
  return orderDisplayTitle(o);
}

/** מסנן קבוצות הזמנות לפי שם לקוח או כותרת ספר (חיפוש מקומי). */
export function filterCustomerOrderGroupsBySearch(
  groups: OrdersByCustomerGroup[],
  query: string,
): OrdersByCustomerGroup[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return groups;

  const normalizedQuery = normalizeOrderSearchText(trimmed);
  const matches = (text: string) => normalizeOrderSearchText(text).includes(normalizedQuery);

  return groups
    .map((group) => {
      if (matches(group.customer_name)) return group;
      const filteredOrders = group.orders.filter((o) => matches(orderBookTitleForSearch(o)));
      if (filteredOrders.length === 0) return null;
      return { ...group, orders: filteredOrders };
    })
    .filter((g): g is OrdersByCustomerGroup => g !== null);
}

/** הופך מערך הזמנות לקבוצות מאוחדות לפי ספק (לתצוגה ולייצוא PDF). */
export function useOrdersGroupedBySupplier(
  items: OrderListItem[],
  orderType: OrderType,
): OrdersBySupplierGroup[] {
  return useMemo(() => {
    const map = new Map<string, OrdersBySupplierGroup>();
    for (const item of items) {
      const key = supplierGroupKey(item.supplier_id);
      const existing = map.get(key);
      if (existing) {
        existing.orders.push(item);
      } else {
        map.set(key, {
          supplier_id: item.supplier_id,
          supplier_name: item.supplier_id ? item.supplier_name : NEUTRAL_SUPPLIER_LABEL,
          supplier_color: item.supplier_color || "#9E9E9E",
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
      .sort((a, b) => {
        if (a.supplier_id === null && b.supplier_id !== null) return 1;
        if (a.supplier_id !== null && b.supplier_id === null) return -1;
        return compareHebrew(a.supplier_name, b.supplier_name);
      });
  }, [items, orderType]);
}

/** הזמנה פתוחה לצורך מלאי / ביקוש — רק ממתין או הוזמן. */
export function isOpenOrder(o: Pick<OrderListItem, "status">): boolean {
  return o.status === "pending" || o.status === "sent";
}

export function isArchivedOrder(o: Pick<OrderListItem, "status">): boolean {
  return o.status === "archived";
}

/** מופיע בהיסטוריית הזמנות לקוחות (הושלם או הושלם ואז «השלם הזמנה»). */
export function isHistoryOrder(o: Pick<OrderListItem, "status">): boolean {
  return o.status === "completed" || o.status === "archived";
}

export function filterCompletedOrders(orders: OrderListItem[]): OrderListItem[] {
  return orders.filter(isHistoryOrder);
}

/** רשימת לקוחות / וואטסאפ פעילה — ללא שורות ש«הושלמו» מהרשימה. */
export function filterActiveDemandOrders(orders: OrderListItem[]): OrderListItem[] {
  return orders.filter((o) => !isArchivedOrder(o));
}

export function summedCustomerAndWhatsappQtyByBookSupplier(orders: OrderListItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of orders) {
    if (o.order_type !== "customer" && o.order_type !== "whatsapp") continue;
    if (!isOpenOrder(o)) continue;
    const k = supplierBookKey(o.supplier_id, orderBookLineKey(o));
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
      const k = supplierBookKey(o.supplier_id, orderBookLineKey(o));
      const extra = extraQtyBySupplierBook.get(k) ?? 0;
      if (extra > 0) matchedExtraKeys.add(k);
      if (extra === 0) return o;
      return { ...o, quantity: o.quantity + extra };
    }),
  }));

  const metaBySupplierBook = new Map<string, OrderListItem>();
  for (const o of customerWhatsappOrders) {
    if (o.order_type !== "customer" && o.order_type !== "whatsapp") continue;
    if (!isOpenOrder(o)) continue;
    const k = supplierBookKey(o.supplier_id, orderBookLineKey(o));
    if (!metaBySupplierBook.has(k)) metaBySupplierBook.set(k, o);
  }

  const groupBySupplier = new Map(
    augmented.map((g) => [supplierGroupKey(g.supplier_id), { ...g, orders: [...g.orders] }]),
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

    const existing = groupBySupplier.get(supplierGroupKey(meta.supplier_id));
    if (existing) {
      existing.orders.push(syntheticLine);
    } else {
      groupBySupplier.set(supplierGroupKey(meta.supplier_id), {
        supplier_id: meta.supplier_id,
        supplier_name: meta.supplier_id ? meta.supplier_name : NEUTRAL_SUPPLIER_LABEL,
        supplier_color: meta.supplier_color || "#9E9E9E",
        supplier_email: meta.supplier_email,
        orders: [syntheticLine],
      });
    }
  }

  return Array.from(groupBySupplier.values())
    .map((g) => ({
      ...g,
      orders: sortOrderLinesByHebrewTitle(g.orders),
    }))
    .sort((a, b) => {
      if (a.supplier_id === null && b.supplier_id !== null) return 1;
      if (a.supplier_id !== null && b.supplier_id === null) return -1;
      return compareHebrew(a.supplier_name, b.supplier_name);
    });
}

/** מפתח יציב לשורה כפי שמוצגת אחרי איחוד כפילויות (למחיקה מרוכזת בשרת). */
export function orderDisplayLineKey(order: OrderListItem): string {
  return `${orderBookLineKey(order)}\u0000${order.supplier_id ?? ""}\u0000${order.order_type}\u0000${order.customer_name ?? ""}\u0000${order.customer_phone ?? ""}`;
}

/** גוף `POST /orders/remove-line`. */
export function removeOrderLineBodyFromDisplayRow(order: OrderListItem): {
  book_id: string | null;
  manual_book_title: string | null;
  supplier_id: string | null;
  order_type: OrderType;
  customer_name: string | null;
  customer_phone: string | null;
} {
  const bookId = order.book_id ?? null;
  const manualTitle =
    bookId != null
      ? null
      : (order.manual_book_title ?? order.book_title ?? "").trim() || null;
  return {
    book_id: bookId,
    manual_book_title: manualTitle,
    supplier_id: order.supplier_id,
    order_type: order.order_type,
    customer_name: order.customer_name?.trim() ?? null,
    customer_phone: order.customer_phone?.trim() ?? null,
  };
}

interface RemoveOrderLineResponse {
  deleted: number;
}

export interface RemoveDisplayOrderLineParams {
  order: OrderListItem;
  tab: OrderType;
  rawInventory: OrderListItem[];
  customerItems: OrderListItem[];
  whatsappItems: OrderListItem[];
}

function invalidateOrdersCaches(client: QueryClient): void {
  invalidateOrderLists(client, ORDER_LIST_TYPES, { dashboard: true });
}

async function postRemoveOrderLine(order: OrderListItem): Promise<void> {
  await api.post("/orders/remove-line", removeOrderLineBodyFromDisplayRow(order));
}

async function postArchiveOrderLine(order: OrderListItem): Promise<void> {
  await api.post("/orders/archive-line", removeOrderLineBodyFromDisplayRow(order));
}

async function postSetOrderLineQuantity(order: OrderListItem, quantity: number): Promise<void> {
  const bookId = order.book_id ?? null;
  await api.post("/orders/set-line-quantity", {
    ...removeOrderLineBodyFromDisplayRow(order),
    quantity,
    manual_book_author: bookId
      ? null
      : (order.manual_book_author ?? order.book_author ?? "").trim() || null,
  });
}

export async function archiveDisplayOrderLine(order: OrderListItem): Promise<void> {
  await postArchiveOrderLine(order);
}

export function useArchiveOrderLine() {
  const client = useQueryClient();
  return useMutation<void, Error, OrderListItem, { snapshot: OrdersCacheSnapshot }>({
    mutationFn: archiveDisplayOrderLine,
    onMutate: async (order) => {
      const types: OrderType[] = [order.order_type];
      await cancelOrderListQueries(client, types);
      const snapshot = snapshotOrderLists(client, types);
      const lineKey = orderDisplayLineKey(order);
      patchOrderList(client, order.order_type, (list) =>
        list.map((o) =>
          orderDisplayLineKey(o) === lineKey && o.status === "completed"
            ? { ...o, status: "archived" }
            : o,
        ),
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      restoreOrderLists(client, ctx?.snapshot);
    },
    onSettled: (_res, _err, order) => {
      invalidateOrderLists(client, [order.order_type], { dashboard: true });
    },
  });
}

async function postSetOrderLineStatus(
  order: OrderListItem,
  status: Extract<OrderStatus, "pending" | "sent">,
): Promise<void> {
  await api.post("/orders/set-line-status", {
    ...removeOrderLineBodyFromDisplayRow(order),
    status,
  });
}

function orderUpsertBodyFromRow(
  row: OrderListItem,
  status: Extract<OrderStatus, "pending" | "sent">,
) {
  const bookId = row.book_id ?? null;
  const manualTitle =
    bookId != null ? null : (row.manual_book_title ?? row.book_title ?? "").trim() || null;
  const manualAuthor =
    bookId != null ? null : (row.manual_book_author ?? row.book_author ?? "").trim() || null;
  return {
    book_id: bookId,
    supplier_id: row.supplier_id,
    order_type: row.order_type,
    quantity: row.quantity,
    customer_name: row.customer_name?.trim() ?? null,
    customer_phone: row.customer_phone?.trim() ?? null,
    manual_book_title: manualTitle,
    manual_book_author: manualAuthor,
    status,
  };
}

export interface ToggleCustomerOrderParams {
  order: OrderListItem;
  rawOrders: OrderListItem[];
}

export async function toggleCustomerOrderOrderedStatus({
  order,
  rawOrders,
}: ToggleCustomerOrderParams): Promise<void> {
  const nextStatus: Extract<OrderStatus, "pending" | "sent"> =
    order.status === "sent" ? "pending" : "sent";
  const lineKey = orderDisplayLineKey(order);
  const matching = rawOrders.filter((o) => orderDisplayLineKey(o) === lineKey);

  if (matching.length === 0) {
    await postSetOrderLineStatus(order, nextStatus);
    return;
  }

  for (const row of matching) {
    await api.patch(`/orders/${row.id}`, orderUpsertBodyFromRow(row, nextStatus));
  }
}

export function useToggleCustomerOrderOrderedStatus() {
  const client = useQueryClient();
  return useMutation<void, Error, ToggleCustomerOrderParams, { snapshot: OrdersCacheSnapshot }>({
    mutationFn: toggleCustomerOrderOrderedStatus,
    onMutate: async ({ order }) => {
      const types: OrderType[] = [order.order_type];
      await cancelOrderListQueries(client, types);
      const snapshot = snapshotOrderLists(client, types);
      const nextStatus: Extract<OrderStatus, "pending" | "sent"> =
        order.status === "sent" ? "pending" : "sent";
      const lineKey = orderDisplayLineKey(order);
      patchOrderList(client, order.order_type, (list) =>
        applyOptimisticLineStatus(list, (o) => orderDisplayLineKey(o) === lineKey, nextStatus) ??
        list,
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      restoreOrderLists(client, ctx?.snapshot);
    },
    onSettled: (_res, _err, { order }) => {
      invalidateOrderLists(client, [order.order_type], { dashboard: true });
    },
  });
}

export function isSupplierGroupFullyOrdered(orders: OrderListItem[]): boolean {
  const open = orders.filter(isOpenOrder);
  return open.length > 0 && open.every((o) => o.status === "sent");
}

export function supplierGroupHasOpenOrders(orders: OrderListItem[]): boolean {
  return orders.some(isOpenOrder);
}

export async function toggleInventorySupplierOrderedStatus(
  group: OrdersBySupplierGroup,
): Promise<void> {
  const open = group.orders.filter(isOpenOrder);
  const allSent = open.length > 0 && open.every((o) => o.status === "sent");
  await api.post("/orders/set-supplier-status", {
    supplier_id: group.supplier_id,
    status: allSent ? "pending" : "sent",
  });
}

export function useToggleInventorySupplierOrderedStatus() {
  const client = useQueryClient();
  return useMutation<void, Error, OrdersBySupplierGroup, { snapshot: OrdersCacheSnapshot }>({
    mutationFn: toggleInventorySupplierOrderedStatus,
    onMutate: async (group) => {
      await cancelOrderListQueries(client);
      const snapshot = snapshotOrderLists(client);
      const open = group.orders.filter(isOpenOrder);
      const allSent = open.length > 0 && open.every((o) => o.status === "sent");
      const nextStatus: Extract<OrderStatus, "pending" | "sent"> = allSent ? "pending" : "sent";
      const supplierId = group.supplier_id;
      for (const type of ORDER_LIST_TYPES) {
        patchOrderList(client, type, (list) =>
          applyOptimisticLineStatus(
            list,
            (o) => (o.supplier_id ?? null) === (supplierId ?? null),
            nextStatus,
          ) ?? list,
        );
      }
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      restoreOrderLists(client, ctx?.snapshot);
    },
    onSettled: () => {
      invalidateOrdersCaches(client);
    },
  });
}

export interface ToggleInventoryLineParams {
  order: OrderListItem;
  rawInventory: OrderListItem[];
  rawCustomer: OrderListItem[];
  rawWhatsapp: OrderListItem[];
}

/** מסמן/מבטל «הוזמן» לשורת ספר בכרטיסיית ספק — כולל ביקוש לקוח/וואטסאפ לאותו ספר. */
export async function toggleInventoryLineOrderedStatus({
  order,
  rawInventory,
  rawCustomer,
  rawWhatsapp,
}: ToggleInventoryLineParams): Promise<void> {
  const nextStatus: Extract<OrderStatus, "pending" | "sent"> =
    order.status === "sent" ? "pending" : "sent";
  const bookKey = orderBookLineKey(order);
  const supplierId = order.supplier_id;

  const matching = [...rawInventory, ...rawCustomer, ...rawWhatsapp].filter(
    (o) =>
      isOpenOrder(o) &&
      o.supplier_id === supplierId &&
      orderBookLineKey(o) === bookKey,
  );

  if (matching.length === 0) {
    await postSetOrderLineStatus(order, nextStatus);
    return;
  }

  const uniqueRows: OrderListItem[] = [];
  const updatedKeys = new Set<string>();
  for (const row of matching) {
    const key = orderDisplayLineKey(row);
    if (updatedKeys.has(key)) continue;
    updatedKeys.add(key);
    uniqueRows.push(row);
  }
  await Promise.all(uniqueRows.map((row) => postSetOrderLineStatus(row, nextStatus)));
}

export function useToggleInventoryLineOrderedStatus() {
  const client = useQueryClient();
  return useMutation<void, Error, ToggleInventoryLineParams, { snapshot: OrdersCacheSnapshot }>({
    mutationFn: toggleInventoryLineOrderedStatus,
    onMutate: async ({ order }) => {
      await cancelOrderListQueries(client);
      const snapshot = snapshotOrderLists(client);
      const nextStatus: Extract<OrderStatus, "pending" | "sent"> =
        order.status === "sent" ? "pending" : "sent";
      const bookKey = orderBookLineKey(order);
      const supplierId = order.supplier_id;
      const match = (o: OrderListItem) =>
        isOpenOrder(o) && o.supplier_id === supplierId && orderBookLineKey(o) === bookKey;
      for (const type of ORDER_LIST_TYPES) {
        patchOrderList(client, type, (list) => applyOptimisticLineStatus(list, match, nextStatus) ?? list);
      }
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      restoreOrderLists(client, ctx?.snapshot);
    },
    onSettled: () => {
      invalidateOrdersCaches(client);
    },
  });
}

/**
 * מוחק שורת תצוגה — בלשונית מלאי גם שורות «וירטואליות» / ביקוש לקוח שמוזג לתצוגה.
 */
export async function removeDisplayOrderLine(params: RemoveDisplayOrderLineParams): Promise<void> {
  const { order, tab, rawInventory, customerItems, whatsappItems } = params;

  if (tab === "customer" || tab === "whatsapp") {
    if (order.status === "completed" || order.status === "archived") {
      return;
    }
    await postRemoveOrderLine(order);
    return;
  }

  const supplierBookKey = inventorySupplierBookKey(order);
  let removedAny = false;

  const inventoryMatches = findInventoryRowsForBookSupplier(rawInventory, order);
  if (inventoryMatches.length > 0) {
    await postRemoveOrderLine({
      ...inventoryMatches[0]!,
      order_type: "inventory",
      customer_name: null,
      customer_phone: null,
    });
    removedAny = true;
  }

  const removedDemandKeys = new Set<string>();
  for (const row of [...customerItems, ...whatsappItems]) {
    if (inventorySupplierBookKey(row) !== supplierBookKey) continue;
    const lineKey = orderDisplayLineKey(row);
    if (removedDemandKeys.has(lineKey)) continue;
    removedDemandKeys.add(lineKey);
    await postRemoveOrderLine(row);
    removedAny = true;
  }

  if (!removedAny) {
    await postRemoveOrderLine({
      ...order,
      order_type: "inventory",
      customer_name: null,
      customer_phone: null,
    });
  }
}

export function useRemoveOrderLine() {
  const client = useQueryClient();
  return useMutation<
    RemoveOrderLineResponse,
    Error,
    RemoveDisplayOrderLineParams,
    { snapshot: OrdersCacheSnapshot; types: OrderType[] }
  >({
    mutationFn: async (params) => {
      await removeDisplayOrderLine(params);
      return { deleted: 1 };
    },
    onMutate: async ({ order, tab }) => {
      const types: OrderType[] =
        tab === "inventory" ? [...ORDER_LIST_TYPES] : [tab];
      await cancelOrderListQueries(client, types);
      const snapshot = snapshotOrderLists(client, types);
      if (tab === "customer" || tab === "whatsapp") {
        const lineKey = orderDisplayLineKey(order);
        patchOrderList(client, tab, (list) =>
          removeMatchingLines(list, (o) => orderDisplayLineKey(o) === lineKey) ?? list,
        );
      } else {
        const bookSupplier = inventorySupplierBookKey(order);
        patchOrderList(
          client,
          "inventory",
          (list) =>
            removeMatchingLines(list, (o) => inventorySupplierBookKey(o) === bookSupplier) ?? list,
        );
        patchOrderList(
          client,
          "customer",
          (list) =>
            removeMatchingLines(list, (o) => inventorySupplierBookKey(o) === bookSupplier) ?? list,
        );
        patchOrderList(
          client,
          "whatsapp",
          (list) =>
            removeMatchingLines(list, (o) => inventorySupplierBookKey(o) === bookSupplier) ?? list,
        );
      }
      return { snapshot, types };
    },
    onError: (_err, _vars, ctx) => {
      restoreOrderLists(client, ctx?.snapshot);
    },
    onSettled: (_res, _err, _vars, ctx) => {
      invalidateOrderLists(client, ctx?.types ?? ORDER_LIST_TYPES, { dashboard: true });
    },
  });
}

/** מחיקה מהיסטוריה — תמיד מוחק מ-DB (גם `archived`). */
export function useRemoveHistoryOrderLine() {
  const client = useQueryClient();
  return useMutation<void, Error, OrderListItem, { snapshot: OrdersCacheSnapshot }>({
    mutationFn: postRemoveOrderLine,
    onMutate: async (order) => {
      const types: OrderType[] = [order.order_type];
      await cancelOrderListQueries(client, types);
      const snapshot = snapshotOrderLists(client, types);
      const lineKey = orderDisplayLineKey(order);
      patchOrderList(client, order.order_type, (list) =>
        removeMatchingLines(list, (o) => orderDisplayLineKey(o) === lineKey) ?? list,
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      restoreOrderLists(client, ctx?.snapshot);
    },
    onSettled: (_res, _err, order) => {
      invalidateOrderLists(client, [order.order_type], { dashboard: true });
    },
  });
}

/** גוף `POST /orders` — הזמנת לקוח / וואטסאפ, מהקטלוג או לפי כותרת ידנית. */
export interface CreateCustomerOrderBody {
  supplier_id: string | null;
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
    onSuccess: (_data, body) => {
      invalidateOrderLists(client, [body.order_type], { dashboard: true });
    },
  });
}

/** שליחת עדכון יזום ללקוח בוואטסאפ (Template מאושר). דורש בוט וואטסאפ מוגדר בשרת. */
export interface NotifyCustomerParams {
  orderId: string;
  template?: "order_ready";
}

export function useNotifyCustomer() {
  return useMutation<void, Error, NotifyCustomerParams>({
    mutationFn: async ({ orderId, template }) => {
      await api.post(`/orders/${orderId}/notify-customer`, {
        template: template ?? "order_ready",
      });
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

/** מפתח קיבוץ להזמנות וואטסאפ — לפי `order_group_id` אם קיים, אחרת שם+טלפון. */
export function whatsappOrderGroupKey(
  o: Pick<OrderListItem, "customer_name" | "customer_phone" | "order_group_id">,
): string {
  if (o.order_group_id) return `wg:${o.order_group_id}`;
  return `wb:${customerOrderBundleKey(o)}`;
}

/** הופך מערך הזמנות וואטסאפ לקבוצות לפי `order_group_id` (או שם+טלפון כ-fallback). */
export function useOrdersGroupedForWhatsapp(items: OrderListItem[]): OrdersByCustomerGroup[] {
  return useMemo(() => {
    const map = new Map<string, OrdersByCustomerGroup>();
    for (const item of items) {
      const key = whatsappOrderGroupKey(item);
      const existing = map.get(key);
      if (existing) {
        existing.orders.push(item);
      } else {
        map.set(key, {
          customer_name: (item.customer_name ?? "").trim(),
          customer_phone: (item.customer_phone ?? "").trim(),
          orders: [item],
        });
      }
    }
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        orders: mergeOrderLinesForDisplay(g.orders, "whatsapp"),
      }))
      .sort((a, b) => {
        const aLatest = Math.max(...a.orders.map((o) => new Date(o.created_at).getTime()));
        const bLatest = Math.max(...b.orders.map((o) => new Date(o.created_at).getTime()));
        return bLatest - aLatest;
      });
  }, [items]);
}

/** מפתח יציב לשורת ספר בחבילת לקוח (ספק + ספר קטלוג/ידני). */
export function customerOrderLineKey(o: {
  supplier_id: string | null;
  book_id: string | null;
  manual_book_title?: string | null;
}): string {
  const bookPart = o.book_id ?? `m:${(o.manual_book_title ?? "").trim()}`;
  return `${o.supplier_id ?? ""}\u0000${bookPart}`;
}

/** שורת ספר לשמירה / סנכרון חבילת לקוח. */
export interface CustomerOrderLineInput {
  supplier_id: string | null;
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

function customerLineSameBookAndSupplier(
  orig: OrderListItem,
  next: CustomerOrderLineInput,
): boolean {
  if (orig.supplier_id !== next.supplier_id) return false;
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
    if (customerLineSameBookAndSupplier(orig, line) && origTotalQty !== line.quantity) {
      await postSetOrderLineQuantity(orig, line.quantity);
      continue;
    }
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
    onSuccess: (_data, vars) => {
      invalidateOrderLists(client, [vars.orderType ?? "customer"], { dashboard: true });
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
    onSuccess: (_data, vars) => {
      invalidateOrderLists(client, [vars.orderType ?? "customer"], { dashboard: true });
    },
  });
}

function findInventoryRowsForBookSupplier(
  rawInventory: OrderListItem[],
  line: Pick<OrderListItem, "supplier_id" | "book_id" | "manual_book_title" | "book_title">,
): OrderListItem[] {
  return rawInventory.filter((o) => {
    if (o.order_type !== "inventory") return false;
    if ((o.supplier_id ?? null) !== (line.supplier_id ?? null)) return false;
    if (o.customer_name != null || o.customer_phone != null) return false;
    if (line.book_id) return o.book_id === line.book_id;
    const lineTitle = (line.manual_book_title ?? line.book_title ?? "").trim();
    return !o.book_id && (o.manual_book_title ?? "").trim() === lineTitle;
  });
}

/** מעדכן כמות בסיס של הזמנת מלאי בקריאה אחת (מאחד כפילויות / יוצר אם חסר). */
export async function updateInventoryOrderBaseQuantity(
  line: OrderListItem,
  newBaseQty: number,
): Promise<void> {
  if (!line.book_id && !(line.manual_book_title?.trim() || line.book_title?.trim())) {
    throw new Error("inventory_requires_book");
  }
  if (!Number.isFinite(newBaseQty) || newBaseQty < 1) throw new Error("invalid_quantity");

  await postSetOrderLineQuantity(
    {
      ...line,
      order_type: "inventory",
      customer_name: null,
      customer_phone: null,
    },
    newBaseQty,
  );
}

type QtyMutationCtx = { snapshot: OrdersCacheSnapshot; lineKey: string };

export function useUpdateInventoryOrderQuantity() {
  const client = useQueryClient();
  return useMutation<void, Error, { line: OrderListItem; newBaseQty: number }, QtyMutationCtx>({
    mutationFn: ({ line, newBaseQty }) => updateInventoryOrderBaseQuantity(line, newBaseQty),
    onMutate: async ({ line, newBaseQty }) => {
      const lineKey = orderDisplayLineKey({
        ...line,
        order_type: "inventory",
        customer_name: null,
        customer_phone: null,
      });
      trackPendingQty(lineKey, "inventory");
      await cancelOrderListQueries(client, ["inventory"]);
      const snapshot = snapshotOrderLists(client, ["inventory"]);
      const createLine: OrderListItem = {
        ...line,
        order_type: "inventory",
        quantity: newBaseQty,
        customer_name: null,
        customer_phone: null,
      };
      patchOrderList(client, "inventory", (list) => {
        const next = applyOptimisticLineQuantity(
          list,
          (o) => findInventoryRowsForBookSupplier([o], line).length > 0,
          newBaseQty,
          createLine,
        );
        return next ?? list;
      });
      return { snapshot, lineKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx && (pendingQtyByType.get("inventory") ?? 0) <= 1) {
        restoreOrderLists(client, ctx.snapshot);
        return;
      }
      invalidateOrderLists(client, ["inventory"]);
    },
    onSettled: (_res, err, _vars, ctx) => {
      const remaining = ctx ? releasePendingQty(ctx.lineKey, "inventory") : { line: 0, type: 0 };
      if (remaining.type <= 0 && !err) {
        invalidateOrderLists(client, ["inventory"], { dashboard: true });
      }
    },
  });
}

/** מעדכן כמות בשורת הזמנת לקוח / וואטסאפ. */
export async function updateDemandOrderLineQuantity(
  line: OrderListItem,
  newQty: number,
): Promise<void> {
  if (line.order_type !== "customer" && line.order_type !== "whatsapp") {
    throw new Error("invalid_order_type");
  }
  if (!Number.isFinite(newQty) || newQty < 1) throw new Error("invalid_quantity");
  if (line.quantity === newQty) return;

  await postSetOrderLineQuantity(line, newQty);
}

export function useUpdateDemandOrderQuantity() {
  const client = useQueryClient();
  return useMutation<void, Error, { line: OrderListItem; newQty: number }, QtyMutationCtx>({
    mutationFn: ({ line, newQty }) => updateDemandOrderLineQuantity(line, newQty),
    onMutate: async ({ line, newQty }) => {
      const lineKey = orderDisplayLineKey(line);
      trackPendingQty(lineKey, line.order_type);
      await cancelOrderListQueries(client, [line.order_type]);
      const snapshot = snapshotOrderLists(client, [line.order_type]);
      patchOrderList(client, line.order_type, (list) => {
        const next = applyOptimisticLineQuantity(
          list,
          (o) => orderDisplayLineKey(o) === lineKey,
          newQty,
        );
        return next ?? list;
      });
      return { snapshot, lineKey };
    },
    onError: (_err, vars, ctx) => {
      if (ctx && (pendingQtyByType.get(vars.line.order_type) ?? 0) <= 1) {
        restoreOrderLists(client, ctx.snapshot);
        return;
      }
      invalidateOrderLists(client, [vars.line.order_type]);
    },
    onSettled: (_res, err, vars, ctx) => {
      const remaining = ctx
        ? releasePendingQty(ctx.lineKey, vars.line.order_type)
        : { line: 0, type: 0 };
      if (remaining.type <= 0 && !err) {
        invalidateOrderLists(client, [vars.line.order_type]);
      }
    },
  });
}

export interface CreateInventoryOrderInput {
  book_id: string;
  supplier_id: string | null;
  quantity: number;
}

export async function createInventoryOrder(input: CreateInventoryOrderInput): Promise<OrderRow> {
  const { data } = await api.post<OrderRow>("/orders", {
    book_id: input.book_id,
    supplier_id: input.supplier_id,
    order_type: "inventory",
    quantity: input.quantity,
    status: "pending",
  });
  return data;
}

export function useCreateInventoryOrder() {
  const client = useQueryClient();
  return useMutation<OrderRow, Error, CreateInventoryOrderInput>({
    mutationFn: createInventoryOrder,
    onSuccess: () => {
      invalidateOrderLists(client, ["inventory"], { dashboard: true });
    },
  });
}
