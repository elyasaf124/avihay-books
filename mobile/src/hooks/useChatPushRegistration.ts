import { useEffect } from "react";
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useRouter } from "expo-router";
import { api } from "../api/client";
import { he } from "../i18n/he";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

interface ChatNotificationData {
  kind?: string;
  phone?: string;
}

/**
 * רושם את טוקן ה-Expo Push של המכשיר בשרת (`/devices/register`) ומאזין להקשה
 * על התראת צ'אט כדי לנווט ישירות לשיחה. דורש dev/standalone build (לא Expo Go).
 */
export function useChatPushRegistration(): void {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web" || isExpoGo) return;

    let cancelled = false;
    let sub: { remove: () => void } | undefined;

    void (async () => {
      const Notifications = await import("expo-notifications");
      if (cancelled) return;

      const granted = await ensurePermission(Notifications);
      if (!granted || cancelled) return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("chat", {
          name: he.chat.pushChannelName,
          importance: Notifications.AndroidImportance.HIGH,
          sound: "default",
        }).catch(() => undefined);
      }

      const projectId = (
        Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
      )?.eas?.projectId;

      try {
        const tokenResp = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        const token = tokenResp.data;
        if (token && !cancelled) {
          await api
            .post("/devices/register", { expo_token: token, platform: Platform.OS })
            .catch(() => undefined);
        }
      } catch {
        // ללא projectId / בלי בילד מתאים — מדלגים בשקט.
      }

      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as ChatNotificationData;
        if (data?.kind === "chat" && data.phone) {
          router.push(`/chat/${encodeURIComponent(data.phone)}`);
        }
      });
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [router]);
}

async function ensurePermission(
  Notifications: typeof import("expo-notifications"),
): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (
      settings.granted ||
      settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ) {
      return true;
    }
    const ask = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return ask.granted || ask.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}
