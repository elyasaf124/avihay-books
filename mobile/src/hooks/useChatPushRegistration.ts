import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useRouter } from "expo-router";
import { AxiosError } from "axios";
import { api } from "../api/client";
import { he } from "../i18n/he";
import { ensureNotificationPermission } from "../utils/notificationPermissions";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

interface ChatNotificationData {
  kind?: string;
  phone?: string;
}

function logPushRegister(message: string, extra?: Record<string, unknown>): void {
  console.warn(`[push-register] ${message}`, extra ?? "");
}

/**
 * רושם את טוקן ה-Expo Push של המכשיר בשרת (`/devices/register`) ומאזין להקשה
 * על התראת צ'אט כדי לנווט ישירות לשיחה. פעיל רק ב-production build (לא `__DEV__`, לא Expo Go).
 */
export function useChatPushRegistration(): void {
  const router = useRouter();
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (__DEV__ || Platform.OS === "web" || isExpoGo) return;

    let cancelled = false;
    let sub: { remove: () => void } | undefined;

    const register = async (): Promise<void> => {
      const Notifications = await import("expo-notifications");
      if (cancelled) return;

      const granted = await ensureNotificationPermission(Notifications);
      if (!granted) {
        logPushRegister("notification permission not granted — enable in device settings");
        return;
      }
      if (cancelled) return;

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

      if (!projectId) {
        logPushRegister("missing EAS projectId in app config — cannot get Expo push token");
        return;
      }

      try {
        const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
        const token = tokenResp.data;
        if (!token || cancelled) return;

        if (token === lastTokenRef.current) return;
        lastTokenRef.current = token;

        await api.post("/devices/register", { expo_token: token, platform: Platform.OS });
        logPushRegister("registered with server", { tokenPrefix: token.slice(0, 28) });
      } catch (err) {
        if (err instanceof AxiosError) {
          const code = (err.response?.data as { error?: string } | undefined)?.error;
          logPushRegister("server registration failed", {
            status: err.response?.status,
            error: code ?? err.message,
          });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        logPushRegister("getExpoPushTokenAsync failed — rebuild with google-services.json + prebuild", {
          error: message,
        });
      }
    };

    void (async () => {
      await register();

      sub = (await import("expo-notifications")).addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data as ChatNotificationData;
          if (data?.kind === "chat" && data.phone) {
            router.push(`/chat/${encodeURIComponent(data.phone)}`);
          }
        },
      );
    })();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void register();
    });

    return () => {
      cancelled = true;
      sub?.remove();
      appStateSub.remove();
    };
  }, [router]);
}
