import { useEffect } from "react";
import { I18nManager, Platform } from "react-native";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import {
  Heebo_400Regular,
  Heebo_600SemiBold,
  Heebo_700Bold,
  useFonts,
} from "@expo-google-fonts/heebo";
import { ForceUpdateGate } from "../src/components/ForceUpdateGate";
import { useOtaUpdates } from "../src/hooks/useOtaUpdates";
import { theme } from "../src/theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

if (!I18nManager.isRTL) {
  try {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(true);
  } catch {
    // no-op on web
  }
}

/**
 * `React Native Web` לא מסתמך על `I18nManager.forceRTL` — הוא קורא את כיוון המסמך
 * מתוך `<html dir>`. בלי הקצאה מפורשת, מיכלי `flexDirection: "row"` נשארים `LTR`
 * בעוד `textAlign: "right"` כן מיושר — פער שגורם לדפים להיראות לא־מיושרים בדפדפן.
 */
if (Platform.OS === "web" && typeof document !== "undefined") {
  document.documentElement.setAttribute("dir", "rtl");
  document.documentElement.setAttribute("lang", "he");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout(): JSX.Element {
  useOtaUpdates();

  const [fontsLoaded, fontError] = useFonts({
    "Heebo-Regular": Heebo_400Regular,
    "Heebo-SemiBold": Heebo_600SemiBold,
    "Heebo-Bold": Heebo_700Bold,
  });

  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready && Platform.OS !== "web") return <></>;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ForceUpdateGate>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: theme.colors.surface },
                headerTintColor: theme.colors.primary,
                headerTitleStyle: {
                  fontWeight: "700",
                  color: theme.colors.primary,
                  fontFamily: theme.fontFamily.bold,
                },
                contentStyle: { backgroundColor: theme.colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
          </ForceUpdateGate>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
