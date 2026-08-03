import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useUnreadNotificationCount } from "../api/notifications";
import { he } from "../i18n/he";
import { ensureNotificationPermission } from "../utils/notificationPermissions";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Remote push registration was removed from Expo Go (SDK 53+). Static imports of
 * `expo-notifications` run native auto-registration at load time and crash in Go;
 * we only dynamic-import the module in dev builds / standalone.
 */
export function useUnreadPushNotifier(): { unreadCount: number } {
  const query = useUnreadNotificationCount({ pollMs: 60_000 });
  const lastSeenRef = useRef<number | null>(null);
  const permissionGrantedRef = useRef<boolean>(false);
  const notificationsModRef = useRef<typeof import("expo-notifications") | null>(null);

  useEffect(() => {
    if (Platform.OS === "web" || isExpoGo) return;

    let cancelled = false;
    void (async () => {
      const Notifications = await import("expo-notifications");
      if (cancelled) return;
      notificationsModRef.current = Notifications;
      configureForegroundHandler(Notifications);
      const granted = await ensureNotificationPermission(Notifications);
      permissionGrantedRef.current = granted;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || isExpoGo) return;

    const current = query.data;
    if (current === undefined) return;
    const previous = lastSeenRef.current;
    lastSeenRef.current = current;

    if (previous === null) return;
    if (current <= previous) return;
    if (!permissionGrantedRef.current) return;

    const newCount = current - previous;
    const run = async (): Promise<void> => {
      const Notifications = notificationsModRef.current ?? (await import("expo-notifications"));
      notificationsModRef.current = Notifications;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: he.notifications.pushTitle,
          body: he.notifications.pushBody.replace("{{count}}", String(newCount)),
          sound: false,
        },
        trigger: null,
      }).catch(() => undefined);
    };
    void run();
  }, [query.data]);

  return { unreadCount: query.data ?? 0 };
}

let foregroundConfigured = false;
function configureForegroundHandler(Notifications: typeof import("expo-notifications")): void {
  if (foregroundConfigured) return;
  foregroundConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}
