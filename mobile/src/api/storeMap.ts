import { useQuery } from "@tanstack/react-query";
import type { Book, StoreMap } from "@avihay-books/shared";
import { api } from "./client";

export const STORE_MAP_KEY = ["store-map"] as const;
const BOOKS_SEARCH_KEY = (q: string, supplierId: string) =>
  ["books", "search", q, supplierId || "all"] as const;

export function useStoreMap() {
  return useQuery<StoreMap>({
    queryKey: STORE_MAP_KEY,
    queryFn: async () => {
      const { data } = await api.get<StoreMap>("/store-map");
      return data;
    },
    staleTime: 30_000,
    retry: 2,
  });
}

export interface UseSearchBooksOptions {
  /** כשמוגדר — החיפוש מצומצם לספרים של הספק (`GET /books?q=&supplier_id=`). */
  supplierId?: string | null;
  /** ברירת מחדל: `true`. העבירו `false` כדי לא לפנות לשרת (למשל כשהמסך לא מציג חיפוש). */
  enabled?: boolean;
}

export function useSearchBooks(query: string, options?: UseSearchBooksOptions) {
  const trimmed = query.trim();
  const supplierKey = options?.supplierId?.trim() ?? "";
  const supplierParam = options?.supplierId?.trim() || undefined;
  const extraEnabled = options?.enabled !== false;

  return useQuery<Book[]>({
    queryKey: BOOKS_SEARCH_KEY(trimmed, supplierKey),
    queryFn: async () => {
      const params: Record<string, string> = { q: trimmed };
      if (supplierParam) params.supplier_id = supplierParam;
      const { data } = await api.get<Book[]>("/books", { params });
      return data;
    },
    enabled: extraEnabled && trimmed.length > 0,
    staleTime: 10_000,
    retry: 0,
  });
}
