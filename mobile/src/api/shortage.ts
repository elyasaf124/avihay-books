import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OrderRow,
  OrderType,
  ShortageItem,
  ShortageListItem,
  ShortageStatus,
} from "@avihay-books/shared";
import { api } from "./client";
import { DASHBOARD_STATS_KEY } from "./dashboard";
import {
  patchStoreMapLocationShortage,
  softInvalidateStoreMap,
} from "./storeMap";

const SHORTAGE_KEY = ["shortage", "list"] as const;
const ORDERS_KEY_PREFIX = ["orders"] as const;

function invalidateShortageSideEffects(
  client: ReturnType<typeof useQueryClient>,
  opts?: { orders?: boolean },
): void {
  void client.invalidateQueries({ queryKey: SHORTAGE_KEY });
  void client.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
  softInvalidateStoreMap(client);
  if (opts?.orders) {
    void client.invalidateQueries({ queryKey: ORDERS_KEY_PREFIX });
  }
}

/** אחרי שינוי חוסר במדף — סנכרון מוחלט של יחידות פעילות מול השרת. */
function refetchActiveStoreMapUnits(client: ReturnType<typeof useQueryClient>): void {
  void client.invalidateQueries({
    queryKey: ["store-map", "unit"],
    refetchType: "active",
  });
}

export function useShortageList() {
  return useQuery<ShortageListItem[]>({
    queryKey: SHORTAGE_KEY,
    queryFn: async () => {
      const { data } = await api.get<ShortageListItem[]>("/shortage");
      return data;
    },
    staleTime: 15_000,
    retry: 0,
  });
}

export interface MoveToOrderPayload {
  shortageId: string;
  quantity?: number;
  orderType?: OrderType;
}

interface MoveToOrderResponse {
  shortage: ShortageItem;
  order: OrderRow;
}

export function useMoveShortageToOrder() {
  const client = useQueryClient();
  return useMutation<MoveToOrderResponse, Error, MoveToOrderPayload>({
    mutationFn: async ({ shortageId, quantity, orderType }) => {
      const { data } = await api.post<MoveToOrderResponse>(
        `/shortage/${shortageId}/move-to-order`,
        {
          quantity,
          order_type: orderType,
        },
      );
      return data;
    },
    onSuccess: (data) => {
      /** הסרה מידית מתצוגת החוסרים (כל רשומה באותו `book_id` יורד מהרשימה אחרי איחוד בשרת) */
      client.setQueryData<ShortageListItem[]>(SHORTAGE_KEY, (old) =>
        old ? old.filter((row) => row.book_id !== data.shortage.book_id) : old,
      );
      invalidateShortageSideEffects(client, { orders: true });
    },
  });
}

export interface DeleteShortagePayload {
  shortageId: string;
  /** כמה רשומות למחוק בקבוצת ספר+תא (ברירת מחדל 1). */
  quantity?: number;
}

export function useDeleteShortage() {
  const client = useQueryClient();
  return useMutation<void, Error, DeleteShortagePayload>({
    mutationFn: async ({ shortageId, quantity = 1 }) => {
      await api.delete(`/shortage/${shortageId}`, { data: { quantity } });
    },
    onSuccess: () => {
      invalidateShortageSideEffects(client);
    },
  });
}

/**
 * ביטול חוסר במדף לפי `location_id`.
 * בלי onMutate של delta — רק ערכים מוחלטים מהשרת + refetch, כדי לא ליצור עותק עודף/מטושטש.
 */
export function useCancelShelfShortage() {
  const client = useQueryClient();
  return useMutation<
    { still_pending: boolean; quantity_in_cell: number },
    Error,
    string
  >({
    mutationFn: async (locationId) => {
      const { data } = await api.delete<{
        still_pending: boolean;
        quantity_in_cell: number;
      }>(`/shortage/by-location/${locationId}`);
      return data;
    },
    onSuccess: (data, locationId) => {
      client.setQueryData<ShortageListItem[]>(SHORTAGE_KEY, (old) => {
        if (!old) return old;
        const idx = old.findIndex((row) => row.location_id === locationId);
        if (idx < 0) return old;
        const row = old[idx]!;
        if ((row.missing_count ?? 1) <= 1) {
          return [...old.slice(0, idx), ...old.slice(idx + 1)];
        }
        const next = [...old];
        next[idx] = { ...row, missing_count: row.missing_count - 1 };
        return next;
      });
      const qty = Number(data?.quantity_in_cell);
      if (Number.isFinite(qty)) {
        patchStoreMapLocationShortage(
          client,
          locationId,
          Boolean(data.still_pending),
          qty,
        );
      }
      refetchActiveStoreMapUnits(client);
      void client.invalidateQueries({ queryKey: SHORTAGE_KEY });
      void client.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
    },
  });
}

export interface UpdateShortageStatusPayload {
  shortageId: string;
  status: ShortageStatus;
  /** בהשלמה — כמה עותקים בקבוצת ספר+תא (ברירת מחדל 1). */
  quantity?: number;
}

export function useUpdateShortageStatus() {
  const client = useQueryClient();
  return useMutation<ShortageItem, Error, UpdateShortageStatusPayload>({
    mutationFn: async ({ shortageId, status, quantity }) => {
      const { data } = await api.patch<ShortageItem>(`/shortage/${shortageId}/status`, {
        status,
        ...(status === "completed" && quantity != null ? { quantity } : {}),
      });
      return data;
    },
    onSuccess: (_data, vars) => {
      invalidateShortageSideEffects(client);
      /** השלמה מחזירה עותק לתא — חובה לרענן יחידות פעילות (לא רק soft). */
      if (vars.status === "completed") {
        refetchActiveStoreMapUnits(client);
      }
    },
  });
}
