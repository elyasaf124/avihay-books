import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  BookLocation,
  ShortageItem,
  StoreMap,
  StoreMapUnit,
} from "@avihay-books/shared";
import { useMemo } from "react";
import { api } from "./client";
import { NOTIFICATIONS_LIST_KEY, NOTIFICATIONS_UNREAD_KEY } from "./notifications";
import { DASHBOARD_STATS_KEY } from "./dashboard";
import {
  patchStoreMapLocationShortage,
  softInvalidateStoreMap,
} from "./storeMap";
import { mockSuppliers } from "../mocks/homeDashboard";
import { useSuppliers } from "./suppliers";

export { STORE_MAP_KEY } from "./storeMap";
export { useSuppliers } from "./suppliers";

/** מחזיר רשימת ספקים — מה־API אם זמין, אחרת מה־mock. */
export function useSuppliersWithFallback() {
  const q = useSuppliers();
  if (q.isSuccess && q.data.length > 0) return q.data;
  return mockSuppliers;
}

/**
 * מחלץ יחידה אחת מהמפה שהמסך מעביר (בדרך כלל `useStoreMap().data` או `mock` כשאין שרת).
 * עדיף לא לקרוא מ־`queryClient.getQueryData` כאן — כדי שהרינדור יישאר מסונכרן עם ה־`useQuery` האב.
 */
export function useUnitFromMap(
  unitId: string | undefined,
  storeMap: StoreMap | null | undefined,
): { unit: StoreMapUnit | null; storeMap: StoreMap | null } {
  const map = storeMap ?? null;
  return useMemo(() => {
    if (!map || !unitId) return { unit: null, storeMap: map };
    const unit = map.units.find((u) => u.id === unitId) ?? null;
    return { unit, storeMap: map };
  }, [map, unitId]);
}

export interface AddShortagePayload {
  bookId: string;
  /** כמה עותקים ירדו מהמלאי הכללי (מכירה מהמדף). ברירת מחדל ‎1. */
  soldQuantity?: number;
  /** מזהה `book_locations` — נשמר בשרת על רשומת החוסר לטשטוש במפת החנות. */
  locationId?: string;
}

export function useAddShortage() {
  const client = useQueryClient();
  return useMutation<ShortageItem, Error, AddShortagePayload>({
    mutationFn: async ({ bookId, soldQuantity = 1, locationId }) => {
      const { data } = await api.post<ShortageItem>("/shortage", {
        book_id: bookId,
        sold_quantity: soldQuantity,
        ...(locationId ? { location_id: locationId } : {}),
      });
      return data;
    },
    onSuccess: (_data, vars) => {
      if (vars.locationId) {
        patchStoreMapLocationShortage(client, vars.locationId, true);
      } else {
        softInvalidateStoreMap(client);
      }
      void client.invalidateQueries({ queryKey: ["shortage"] });
      void client.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
      void client.refetchQueries({ queryKey: NOTIFICATIONS_LIST_KEY });
      void client.refetchQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
    },
  });
}

export interface MoveBookPayload {
  locationId: string;
  bookId: string;
  cellId: string;
  positionInCell: number;
  quantityInCell: number;
}

export function useMoveBook() {
  const client = useQueryClient();
  return useMutation<BookLocation, Error, MoveBookPayload>({
    mutationFn: async ({ locationId, bookId, cellId, positionInCell, quantityInCell }) => {
      const { data } = await api.patch<BookLocation>(`/book-locations/${locationId}`, {
        book_id: bookId,
        cell_id: cellId,
        position_in_cell: positionInCell,
        quantity_in_cell: quantityInCell,
      });
      return data;
    },
    onSuccess: () => {
      softInvalidateStoreMap(client);
      void client.invalidateQueries({ queryKey: ["books", "inventory"] });
    },
  });
}
