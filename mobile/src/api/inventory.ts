import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Book, BookLocation, BookWithLocations, StoreMap } from "@avihay-books/shared";
import axios from "axios";
import { findStoreMapCellById, resolvePositionForPlacement } from "../utils/storeMapCells";
import { api } from "./client";
import { STORE_MAP_KEY } from "./storeMap";

const BOOK_LOCATION_SLOT_OCCUPIED = "book_location_slot_occupied";

function isSlotOccupied409(data: unknown): data is {
  error: string;
  details: { cell_id?: string; position_in_cell?: number };
} {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    (data as { error: string }).error === BOOK_LOCATION_SLOT_OCCUPIED
  );
}

const inventoryBooksPrefix = ["books", "inventory"] as const;

export function useInventoryBooksBySupplier(supplierId: string | null) {
  return useQuery<BookWithLocations[]>({
    queryKey: [...inventoryBooksPrefix, supplierId],
    queryFn: async () => {
      const { data } = await api.get<BookWithLocations[]>("/books", {
        params: { supplier_id: supplierId!, expand: "locations" },
      });
      return data;
    },
    enabled: !!supplierId,
    staleTime: 10_000,
    retry: 0,
  });
}

interface PatchBookArgs {
  id: string;
  patch: Record<string, unknown>;
}

export function usePatchBook() {
  const client = useQueryClient();
  return useMutation<Book, Error, PatchBookArgs>({
    mutationFn: async ({ id, patch }) => {
      const { data } = await api.patch<Book>(`/books/${id}`, patch);
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: inventoryBooksPrefix });
      void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
      void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
    },
  });
}

export interface CreateBookPayload {
  title: string;
  author: string;
  supplier_id: string;
  price: number;
  stock_quantity: number;
  topic: string;
  is_new: boolean;
  /** הערות «איפה שמתי בשטח» — אורך מומלץ לפי כמות עותקים. */
  copy_placement_notes?: string[];
}

export function useCreateBook() {
  const client = useQueryClient();
  return useMutation<Book, Error, CreateBookPayload>({
    mutationFn: async (body) => {
      const { data } = await api.post<Book>("/books", {
        ...body,
        reorder_threshold: 0,
        is_active: true,
        copy_placement_notes: body.copy_placement_notes ?? [],
      });
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: inventoryBooksPrefix });
      void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
      void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
    },
  });
}

export interface CreateBookLocationPayload {
  book_id: string;
  cell_id: string;
  position_in_cell: number;
  quantity_in_cell: number;
}

export function useCreateBookLocation() {
  const client = useQueryClient();
  return useMutation<BookLocation, Error, CreateBookLocationPayload>({
    mutationFn: async (initial) => {
      let payload = { ...initial };
      const maxAttempts = 20;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const { data } = await api.post<BookLocation>("/book-locations", payload);
          return data;
        } catch (e) {
          if (!axios.isAxiosError(e) || e.response?.status !== 409) throw e;
          const bodyJson = e.response?.data;
          if (!isSlotOccupied409(bodyJson)) throw e;

          await client.refetchQueries({ queryKey: STORE_MAP_KEY });
          const map = client.getQueryData<StoreMap>(STORE_MAP_KEY);
          const cellId = bodyJson.details?.cell_id ?? payload.cell_id;
          const conflictPos = Math.max(
            1,
            Math.floor(
              bodyJson.details?.position_in_cell ?? payload.position_in_cell,
            ),
          );
          const cell = findStoreMapCellById(map ?? null, cellId);
          const resolved = resolvePositionForPlacement(cell, conflictPos);
          const nextPosition = Math.max(resolved, conflictPos + 1);

          payload = {
            ...payload,
            cell_id: cellId,
            position_in_cell: nextPosition,
          };
        }
      }

      throw new Error("book_location_slot_occupied_max_retries");
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: inventoryBooksPrefix });
      void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
      void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
    },
  });
}

export function useDeleteBookLocation() {
  const client = useQueryClient();
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      await api.delete(`/book-locations/${id}`);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: inventoryBooksPrefix });
      void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
      void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
    },
  });
}

export interface PatchBookLocationArgs {
  location: BookLocation;
}

export function usePatchBookLocation() {
  const client = useQueryClient();
  return useMutation<BookLocation, Error, PatchBookLocationArgs>({
    mutationFn: async ({ location }) => {
      const { data } = await api.patch<BookLocation>(`/book-locations/${location.id}`, location);
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: inventoryBooksPrefix });
      void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
      void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
    },
  });
}
