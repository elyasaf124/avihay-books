import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { NotificationListItem } from "@avihay-books/shared";
import { api } from "./client";

export const NOTIFICATIONS_LIST_KEY = ["notifications", "list"] as const;
export const NOTIFICATIONS_UNREAD_KEY = ["notifications", "unread-count"] as const;

function refetchNotificationsQueries(client: QueryClient): Promise<void> {
  return Promise.all([
    client.refetchQueries({ queryKey: NOTIFICATIONS_LIST_KEY }),
    client.refetchQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY }),
  ]).then(() => {
    return undefined;
  });
}

/** רשימת ההתראות המלאה — מסך ההתראות, כולל `book`/`supplier` משולבים. */
export function useNotifications() {
  return useQuery<NotificationListItem[]>({
    queryKey: NOTIFICATIONS_LIST_KEY,
    queryFn: async () => {
      const { data } = await api.get<NotificationListItem[]>("/notifications");
      return data;
    },
    staleTime: 0,
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
    onSuccess: async () => {
      await refetchNotificationsQueries(client);
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
    onSuccess: async () => {
      await refetchNotificationsQueries(client);
    },
  });
}

interface DeleteNotificationContext {
  previousList?: NotificationListItem[];
  previousUnread?: number;
}

export function useDeleteNotification() {
  const client = useQueryClient();
  return useMutation<void, Error, string, DeleteNotificationContext>({
    mutationFn: async (id: string) => {
      await api.delete(`/notifications/${id}`);
    },
    onMutate: async (id) => {
      await Promise.all([
        client.cancelQueries({ queryKey: NOTIFICATIONS_LIST_KEY }),
        client.cancelQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY }),
      ]);

      const previousList = client.getQueryData<NotificationListItem[]>(NOTIFICATIONS_LIST_KEY);
      const previousUnread = client.getQueryData<number>(NOTIFICATIONS_UNREAD_KEY);
      const deleted = previousList?.find((n) => n.id === id);

      client.setQueryData<NotificationListItem[]>(NOTIFICATIONS_LIST_KEY, (prev) =>
        prev?.filter((n) => n.id !== id),
      );

      if (deleted != null && !deleted.is_read && typeof previousUnread === "number") {
        client.setQueryData<number>(NOTIFICATIONS_UNREAD_KEY, Math.max(0, previousUnread - 1));
      }

      return { previousList, previousUnread };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previousList != null) {
        client.setQueryData(NOTIFICATIONS_LIST_KEY, ctx.previousList);
      }
      if (ctx?.previousUnread != null) {
        client.setQueryData(NOTIFICATIONS_UNREAD_KEY, ctx.previousUnread);
      }
    },
    onSettled: () => {
      void refetchNotificationsQueries(client);
    },
  });
}

export interface NotificationCheckSummary {
  low_stock_created: number;
  remove_from_display_created: number;
  remove_from_display_candidate_count: number;
  remove_from_display_after: string;
  supplier_reorder_reminder_created: number;
  orders_without_supplier_created: number;
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
    onSuccess: async () => {
      await refetchNotificationsQueries(client);
    },
  });
}
