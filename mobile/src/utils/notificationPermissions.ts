import { PermissionsAndroid, Platform } from "react-native";

/** מבקש הרשאת התראות — ב-Android 13+ דרך POST_NOTIFICATIONS, ב-iOS דרך expo-notifications. */
export async function ensureNotificationPermission(
  Notifications: typeof import("expo-notifications"),
): Promise<boolean> {
  if (Platform.OS === "web") return false;

  if (Platform.OS === "android" && Platform.Version >= 33) {
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (!already) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return false;
    }
  }

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
    return (
      ask.granted ||
      ask.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}
