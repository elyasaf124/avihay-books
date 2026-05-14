import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationListItem } from "@avihay-books/shared";
import { api } from "./client";

export const NOTIFICATIONS_LIST_KEY = ["notifications", "list"] as const;
export const NOTIFICATIONS_UNREAD_KEY = ["notifications", "unread-count"] as const;

/** רשימת ההתראות המלאה — מסך ההתראות, כולל `book`/`supplier` משולבים. */
export function useNotifications() {
  return useQuery<NotificationListItem[]>({
    queryKey: NOTIFICATIONS_LIST_KEY,
    queryFn: async () => {
      const { data } = await api.get<NotificationListItem[]>("/notifications");
      return data;
    },
    staleTime: 15_000,
    retry: 0,
  });
}

interface UnreadCountResponse {
  count: number;
}

/**
 * מונה ההתראות שטרם נקראו — משמש לתג שמופיע על האייקון בסרגל הטאבים
 * וגם להחלטה האם לשלוח `local push` (ב־`useUnreadPushNotifier`).
 */
export function useUnreadNotificationCount(opts: { pollMs?: number } = {}) {
  return useQuery<number>({
    queryKey: NOTIFICATIONS_UNREAD_KEY,
    queryFn: async () => {
      const { data } = await api.get<UnreadCountResponse>("/notifications/unread-count");
      return data.count;
    },
    staleTime: 5_000,
    refetchInterval: opts.pollMs ?? 60_000,
    refetchIntervalInBackground: false,
    retry: 0,
  });
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await api.post(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_KEY });
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
    },
  });
}

interface MarkAllResponse {
  updated: number;
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  return useMutation<MarkAllResponse, Error, void>({
    mutationFn: async () => {
      const { data } = await api.post<MarkAllResponse>("/notifications/mark-all-read");
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_KEY });
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
    },
  });
}

export function useDeleteNotification() {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await api.delete(`/notifications/${id}`);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_KEY });
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
    },
  });
}

export interface NotificationCheckSummary {
  low_stock_created: number;
  remove_from_display_created: number;
  supplier_reorder_reminder_created: number;
  ran_at: string;
}

/**
 * הפעלת ה־`cron` בצד השרת לפי דרישה. שימושי כאשר המשתמש לוחץ «בדוק התראות»
 * במסך ההתראות, או כאשר רוצים לרענן ידנית.
 */
export function useRunNotificationChecks() {
  const client = useQueryClient();
  return useMutation<NotificationCheckSummary, Error, void>({
    mutationFn: async () => {
      const { data } = await api.post<NotificationCheckSummary>("/notifications/run-checks");
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_KEY });
      void client.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
    },
  });
}
