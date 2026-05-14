import { useQuery } from "@tanstack/react-query";
import type { Book, StoreMap } from "@avihay-books/shared";
import { api } from "./client";

export const STORE_MAP_KEY = ["store-map"] as const;
const BOOKS_SEARCH_KEY = (q: string) => ["books", "search", q] as const;

export function useStoreMap() {
  return useQuery<StoreMap>({
    queryKey: STORE_MAP_KEY,
    queryFn: async () => {
      const { data } = await api.get<StoreMap>("/store-map");
      return data;
    },
    staleTime: 30_000,
    retry: 0,
  });
}

export function useSearchBooks(query: string) {
  return useQuery<Book[]>({
    queryKey: BOOKS_SEARCH_KEY(query),
    queryFn: async () => {
      const { data } = await api.get<Book[]>("/books", { params: { q: query } });
      return data;
    },
    enabled: query.trim().length > 0,
    staleTime: 10_000,
    retry: 0,
  });
}
