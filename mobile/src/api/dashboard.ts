import { useQuery } from "@tanstack/react-query";
import type { DashboardStats, OrderListItem, OrderType } from "@avihay-books/shared";
import axios from "axios";
import { api } from "./client";

export const DASHBOARD_STATS_KEY = ["dashboard", "stats"] as const;

function isNotFoundError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

/**
 * Fallback לשרת ישן: סופר שורות `pending`/`sent` ישירות (בלי איחוד תצוגה).
 * מספיק לדשבורד עד ש־`/dashboard/stats` נפרס.
 */
async function fetchDashboardStatsFromLists(): Promise<DashboardStats> {
  const types: OrderType[] = ["inventory", "customer", "whatsapp"];
  const [orderLists, shortageRes] = await Promise.all([
    Promise.all(
      types.map(async (type) => {
        const { data } = await api.get<OrderListItem[]>("/orders", { params: { type } });
        return data;
      }),
    ),
    api.get<unknown[]>("/shortage"),
  ]);

  let pending = 0;
  let sent = 0;
  for (const list of orderLists) {
    for (const o of list) {
      if (o.status === "pending") pending += 1;
      else if (o.status === "sent") sent += 1;
    }
  }

  return {
    openOrders: { totalOpen: pending + sent, pending, sent },
    shortageCount: Array.isArray(shortageRes.data) ? shortageRes.data.length : 0,
  };
}

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: DASHBOARD_STATS_KEY,
    queryFn: async () => {
      try {
        const { data } = await api.get<DashboardStats>("/dashboard/stats");
        return data;
      } catch (err) {
        if (!isNotFoundError(err)) throw err;
        return fetchDashboardStatsFromLists();
      }
    },
    staleTime: 15_000,
    retry: (count, err) => {
      if (axios.isAxiosError(err) && err.response?.status === 404) return false;
      return count < 1;
    },
  });
}
