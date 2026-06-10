import type { ReactNode } from "react";
import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { useAppConfig } from "../api/appConfig";
import { SplashLoadingView } from "./SplashLoadingView";

interface AppBootstrapProps {
  fontsReady: boolean;
  children: ReactNode;
}

/**
 * Keeps the native splash visible until fonts and remote app-config are ready,
 * so users see the branded splash instead of a spinner during startup.
 */
export function AppBootstrap({ fontsReady, children }: AppBootstrapProps): JSX.Element | null {
  const config = useAppConfig();
  /** In dev, don't block the UI on `/app-config` — `ForceUpdateGate` handles it with the same splash. */
  const appReady = fontsReady && (__DEV__ || !config.isLoading);

  useEffect(() => {
    if (appReady) void SplashScreen.hideAsync().catch(() => undefined);
  }, [appReady]);

  if (!appReady) {
    return <SplashLoadingView />;
  }

  return <>{children}</>;
}
