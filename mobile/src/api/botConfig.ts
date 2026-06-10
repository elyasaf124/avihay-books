import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BotConfigData } from "@avihay-books/shared";
import { api } from "./client";

export const BOT_CONFIG_KEY = ["bot-config"] as const;

/** הקונפיג המלא של הבוט (תפריט, תוכן חנות, זרימות וטקסטים). */
export function useBotConfig() {
  return useQuery<BotConfigData>({
    queryKey: BOT_CONFIG_KEY,
    queryFn: async () => {
      const { data } = await api.get<BotConfigData>("/bot-config");
      return data;
    },
    staleTime: 30_000,
    retry: 1,
  });
}

/** שמירת הקונפיג המלא; מעדכן את ה-cache עם הצורה הממוזגת שחזרה מהשרת. */
export function useSaveBotConfig() {
  const queryClient = useQueryClient();
  return useMutation<BotConfigData, unknown, BotConfigData>({
    mutationFn: async (config) => {
      const { data } = await api.put<BotConfigData>("/bot-config", config);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(BOT_CONFIG_KEY, data);
    },
  });
}
