import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OrderRow,
  OrderType,
  ShortageItem,
  ShortageListItem,
  ShortageStatus,
} from "@avihay-books/shared";
import { api } from "./client";
import { STORE_MAP_KEY } from "./storeMap";

const SHORTAGE_KEY = ["shortage", "list"] as const;
const ORDERS_KEY_PREFIX = ["orders"] as const;

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
      void client.invalidateQueries({ queryKey: SHORTAGE_KEY });
      void client.invalidateQueries({ queryKey: ORDERS_KEY_PREFIX });
      void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
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
      void client.invalidateQueries({ queryKey: SHORTAGE_KEY });
      void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
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
      void client.invalidateQueries({ queryKey: SHORTAGE_KEY });
      void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
    },
  });
}
