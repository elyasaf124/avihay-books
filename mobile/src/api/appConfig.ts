import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface AppConfig {
  minAppVersion: string;
  latestAppVersion: string;
  updateUrl: string | null;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  featureFlags: Record<string, boolean>;
}

export const APP_CONFIG_KEY = ["app-config"] as const;

export function useAppConfig() {
  return useQuery<AppConfig>({
    queryKey: APP_CONFIG_KEY,
    queryFn: async () => {
      const { data } = await api.get<AppConfig>("/app-config");
      return data;
    },
    staleTime: 60_000,
    retry: 1,
  });
}
