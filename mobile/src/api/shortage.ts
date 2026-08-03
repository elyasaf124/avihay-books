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

export function useDeleteShortage() {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (shortageId) => {
      await api.delete(`/shortage/${shortageId}`);
    },
    onSuccess: (_void, shortageId) => {
      client.setQueryData<ShortageListItem[]>(SHORTAGE_KEY, (old) =>
        old ? old.filter((row) => row.id !== shortageId) : old,
      );
      invalidateShortageSideEffects(client);
    },
  });
}

/** ביטול חוסר במדף לפי `location_id` — מוחק מרשימת החוסרים בלי שינוי מלאי. */
export function useCancelShelfShortage() {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (locationId) => {
      await api.delete(`/shortage/by-location/${locationId}`);
    },
    onSuccess: (_void, locationId) => {
      client.setQueryData<ShortageListItem[]>(SHORTAGE_KEY, (old) =>
        old ? old.filter((row) => row.location_id !== locationId) : old,
      );
      patchStoreMapLocationShortage(client, locationId, false);
      void client.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
    },
  });
}

export interface UpdateShortageStatusPayload {
  shortageId: string;
  status: ShortageStatus;
}

export function useUpdateShortageStatus() {
  const client = useQueryClient();
  return useMutation<ShortageItem, Error, UpdateShortageStatusPayload>({
    mutationFn: async ({ shortageId, status }) => {
      const { data } = await api.patch<ShortageItem>(`/shortage/${shortageId}/status`, {
        status,
      });
      return data;
    },
    onSuccess: () => {
      invalidateShortageSideEffects(client);
    },
  });
}
