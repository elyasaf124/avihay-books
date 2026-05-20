import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Supplier } from "@avihay-books/shared";
import axios from "axios";
import { api } from "./client";
import { STORE_MAP_KEY } from "./storeMap";

export const SUPPLIERS_KEY = ["suppliers"] as const;

export function useSuppliers() {
  return useQuery<Supplier[]>({
    queryKey: SUPPLIERS_KEY,
    queryFn: async () => {
      const { data } = await api.get<Supplier[]>("/suppliers");
      return data;
    },
    staleTime: 60_000,
    retry: 0,
  });
}

export interface UpsertSupplierPayload {
  id?: string;
  name: string;
  color_hex: string;
  email: string;
}

function invalidateSupplierViews(client: ReturnType<typeof useQueryClient>): void {
  void client.invalidateQueries({ queryKey: SUPPLIERS_KEY });
  void client.invalidateQueries({ queryKey: ["books", "inventory"] });
  void client.invalidateQueries({ queryKey: STORE_MAP_KEY });
  void client.invalidateQueries({ queryKey: ["orders"] });
}

export function useUpsertSupplier() {
  const client = useQueryClient();
  return useMutation<Supplier, Error, UpsertSupplierPayload>({
    mutationFn: async (payload) => {
      if (payload.id) {
        const { data } = await api.patch<Supplier>(`/suppliers/${payload.id}`, {
          name: payload.name,
          color_hex: payload.color_hex,
          email: payload.email,
        });
        return data;
      }
      const { data } = await api.post<Supplier>("/suppliers", {
        name: payload.name,
        color_hex: payload.color_hex,
        email: payload.email,
      });
      return data;
    },
    onSuccess: () => invalidateSupplierViews(client),
  });
}

export function useDeleteSupplier() {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await api.delete(`/suppliers/${id}`);
    },
    onSuccess: () => invalidateSupplierViews(client),
  });
}

export function isSupplierHasDependenciesError(
  err: unknown,
): err is { response: { status: 409; data: { error: string; details: { book_count: number; order_count: number } } } } {
  return (
    axios.isAxiosError(err) &&
    err.response?.status === 409 &&
    typeof err.response.data === "object" &&
    err.response.data !== null &&
    "error" in err.response.data &&
    (err.response.data as { error: string }).error === "supplier_has_dependencies"
  );
}
