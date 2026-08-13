import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Book, BookLocation, BookWithLocations, StoreMap } from "@avihay-books/shared";
import axios from "axios";
import { findStoreMapCellById, resolvePositionForPlacement } from "../utils/storeMapCells";
import { api } from "./client";
import { DASHBOARD_STATS_KEY } from "./dashboard";
import { NOTIFICATIONS_LIST_KEY, NOTIFICATIONS_UNREAD_KEY } from "./notifications";
import { adjustStoreMapLocationShortage, STORE_MAP_KEY } from "./storeMap";

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

function invalidateNotifications(client: QueryClient): void {
  void client.refetchQueries({ queryKey: NOTIFICATIONS_LIST_KEY });
  void client.refetchQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
}

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

function applyOptimisticStockDeltaToList(
  list: BookWithLocations[] | undefined,
  bookId: string,
  delta: number,
  locationId: string | null,
): BookWithLocations[] | undefined {
  if (!list) return list;
  return list.map((b) => {
    if (b.id !== bookId) return b;
    const nextLocations =
      locationId != null
        ? b.locations.map((l) =>
            l.id === locationId
              ? { ...l, quantity_in_cell: Math.max(0, l.quantity_in_cell + delta) }
              : l,
          )
        : b.locations;
    // מחסן (`locationId` null): לא לרדת מתחת לסכום העותקים בתאים
    const stockFloor =
      locationId == null
        ? nextLocations.reduce((sum, l) => sum + l.quantity_in_cell, 0)
        : 0;
    const newStock = Math.max(stockFloor, b.stock_quantity + delta);
    return { ...b, stock_quantity: newStock, locations: nextLocations };
  });
}

const bookStockMutationChains = new Map<string, Promise<unknown>>();
/** מספר mutations ממתינות לספר — מונע מ-onSuccess ביניים לדרוס optimistic. */
const pendingStockMutationsByBook = new Map<string, number>();

function trackPendingStockMutation(bookId: string): void {
  pendingStockMutationsByBook.set(bookId, (pendingStockMutationsByBook.get(bookId) ?? 0) + 1);
}

function releasePendingStockMutation(bookId: string): number {
  const pending = pendingStockMutationsByBook.get(bookId) ?? 0;
  const next = pending - 1;
  if (next <= 0) {
    pendingStockMutationsByBook.delete(bookId);
    return 0;
  }
  pendingStockMutationsByBook.set(bookId, next);
  return next;
}
function enqueueBookStockMutation<T>(bookId: string, fn: () => Promise<T>): Promise<T> {
  const prev = bookStockMutationChains.get(bookId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  bookStockMutationChains.set(bookId, next);
  void next.finally(() => {
    if (bookStockMutationChains.get(bookId) === next) {
      bookStockMutationChains.delete(bookId);
    }
  });
  return next;
}

function mergeServerStockIntoList(
  list: BookWithLocations[] | undefined,
  rowBookId: string,
  patchedBook: Book,
  patchedLocation?: BookLocation,
): BookWithLocations[] | undefined {
  if (!list) return list;
  return list.map((b) =>
    b.id !== rowBookId
      ? b
      : ({
          ...b,
          ...patchedBook,
          locations:
            patchedLocation != null
              ? b.locations.map((loc) =>
                  loc.id === patchedLocation.id
                    ? { ...loc, ...patchedLocation, cell_name: loc.cell_name }
                    : loc,
                )
              : b.locations,
        } as BookWithLocations),
  );
}

export interface AdjustInventoryStockArgs {
  supplierId: string;
  bookId: string;
  delta: number;
  locationId: string | null;
}

type AdjustStockMutateCtx = {
  listKey: readonly ["books", "inventory", string];
  previousList: BookWithLocations[] | undefined;
};

/** עדכון מלאי מהיר: תא אם נבחר, ואז ספר — אופטימיסטי לפי דלתא; תור סידורי לשרת; rollback בשגיאה. */
export function useAdjustInventoryStock() {
  const client = useQueryClient();
  return useMutation<
    { book: Book; location?: BookLocation },
    Error,
    AdjustInventoryStockArgs,
    AdjustStockMutateCtx
  >({
    mutationFn: async (vars): Promise<{ book: Book; location?: BookLocation }> =>
      enqueueBookStockMutation(vars.bookId, async () => {
        const { data: currentBook } = await api.get<Book>(`/books/${vars.bookId}`);
        const { data: locations } = await api.get<BookLocation[]>(
          `/book-locations/book/${vars.bookId}`,
        );

        let location: BookLocation | undefined;
        let onShelfSum = locations.reduce((sum, l) => sum + l.quantity_in_cell, 0);

        if (vars.locationId) {
          const loc = locations.find((l) => l.id === vars.locationId);
          if (loc) {
            const newQtyCell = Math.max(0, loc.quantity_in_cell + vars.delta);
            const { data } = await api.patch<BookLocation>(`/book-locations/${loc.id}`, {
              book_id: loc.book_id,
              cell_id: loc.cell_id,
              position_in_cell: loc.position_in_cell,
              quantity_in_cell: newQtyCell,
            });
            location = data;
            onShelfSum = onShelfSum - loc.quantity_in_cell + newQtyCell;
          }
        }

        // מחסן (`locationId` null): לא לרדת מתחת לסכום העותקים בתאים; תא: רצפה 0
        const stockFloor = vars.locationId == null ? onShelfSum : 0;
        const newStock = Math.max(stockFloor, currentBook.stock_quantity + vars.delta);

        const { data: book } = await api.patch<Book>(`/books/${vars.bookId}`, {
          stock_quantity: newStock,
        });
        return { book, location };
      }),
    onMutate: async (vars) => {
      trackPendingStockMutation(vars.bookId);
      const listKey = [...inventoryBooksPrefix, vars.supplierId] as const;
      await client.cancelQueries({ queryKey: listKey });
      const previousList = client.getQueryData<BookWithLocations[]>(listKey);
      client.setQueryData<BookWithLocations[]>(listKey, (prev) =>
        applyOptimisticStockDeltaToList(prev, vars.bookId, vars.delta, vars.locationId),
      );
      if (vars.locationId) {
        adjustStoreMapLocationShortage(client, vars.locationId, vars.delta, false);
      }
      return { listKey, previousList };
    },
    onError: (_e, vars, ctx) => {
      if (vars.locationId) {
        adjustStoreMapLocationShortage(client, vars.locationId, -vars.delta, false);
      }
      if (ctx?.listKey == null) return;
      const { listKey, previousList } = ctx;
      const current = client.getQueryData<BookWithLocations[]>(listKey);
      if (current != null) {
        const rolled = applyOptimisticStockDeltaToList(
          current,
          vars.bookId,
          -vars.delta,
          vars.locationId,
        );
        if (rolled != null) {
          client.setQueryData(listKey, rolled);
          return;
        }
      }
      if (previousList != null) {
        client.setQueryData(listKey, previousList);
        return;
      }
      void client.invalidateQueries({ queryKey: [...listKey] });
    },
    onSuccess: (result, vars, ctx) => {
      if (!ctx?.listKey) return;
      const pending = pendingStockMutationsByBook.get(vars.bookId) ?? 0;
      if (pending <= 1) {
        client.setQueryData<BookWithLocations[]>(ctx.listKey, (prev) =>
          mergeServerStockIntoList(prev, vars.bookId, result.book, result.location),
        );
        invalidateNotifications(client);
        void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
        void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
        void client.invalidateQueries({ queryKey: ["store-map", "unit"] });
        void client.invalidateQueries({ queryKey: ["shortage"] });
      }
    },
    onSettled: (_result, error, vars) => {
      const remaining = releasePendingStockMutation(vars.bookId);
      if (!error && remaining <= 0) {
        void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
        void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
        void client.invalidateQueries({ queryKey: ["store-map", "unit"] });
        if (vars.delta > 0 || vars.locationId != null) {
          void client.refetchQueries({ queryKey: ["orders"] });
          void client.invalidateQueries({ queryKey: ["shortage"] });
        }
      }
    },
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
    onSuccess: (_book, vars) => {
      void client.invalidateQueries({ queryKey: inventoryBooksPrefix });
      invalidateNotifications(client);
      void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
      void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
      if (vars.patch.stock_quantity != null) {
        void client.refetchQueries({ queryKey: ["orders"] });
      }
    },
  });
}

export interface CreateBookPayload {
  title: string;
  author: string;
  supplier_id: string;
  price: number;
  stock_quantity: number;
  reorder_threshold: number;
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
        is_active: true,
        copy_placement_notes: body.copy_placement_notes ?? [],
      });
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: inventoryBooksPrefix });
      invalidateNotifications(client);
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
      void client.invalidateQueries({ queryKey: ["shortage"] });
      void client.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
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

export interface SetShelfStockArgs {
  locationId: string;
  shelfStock: number;
}

export type SetShelfStockResult = BookLocation & {
  cell_name: string;
  pending_shortage_count: number;
};

/** סנכרון מלאי מדף לתצוגת ארון — ממלא ממחסן / יוצר חוסרים / מחזיר למחסן. */
export function useSetShelfStock() {
  const client = useQueryClient();
  return useMutation<SetShelfStockResult, Error, SetShelfStockArgs>({
    mutationFn: async ({ locationId, shelfStock }) => {
      const { data } = await api.patch<SetShelfStockResult>(
        `/book-locations/${locationId}/shelf-stock`,
        { shelf_stock: shelfStock },
      );
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: inventoryBooksPrefix });
      void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
      void client.refetchQueries({ queryKey: STORE_MAP_KEY, type: "all" });
      void client.invalidateQueries({ queryKey: ["shortage"] });
      void client.invalidateQueries({ queryKey: DASHBOARD_STATS_KEY });
    },
  });
}
