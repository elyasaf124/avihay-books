import { useEffect } from "react";
import * as Updates from "expo-updates";

export function useOtaUpdates(): void {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    let cancelled = false;

    async function checkForUpdate(): Promise<void> {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (cancelled || !update.isAvailable) return;

        const fetched = await Updates.fetchUpdateAsync();
        if (!cancelled && fetched.isNew) {
          await Updates.reloadAsync();
        }
      } catch {
        // Update checks must never block the app from opening.
      }
    }

    void checkForUpdate();

    return () => {
      cancelled = true;
    };
  }, []);
}
