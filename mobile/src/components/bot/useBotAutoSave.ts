import { useCallback, useEffect, useRef } from "react";
import { Alert } from "react-native";
import type { BotConfigData } from "@avihay-books/shared";
import { useSaveBotConfig } from "../../api/botConfig";
import { he } from "../../i18n/he";
import { sanitizeAllCustomFlows } from "./flowSanitize";

/** שמירה אוטומטית לשרת אחרי שינוי — עם debounce ודילוג על טעינה ראשונית. */
export function useBotAutoSave(
  config: BotConfigData | null,
  ready: boolean,
  delayMs = 700,
): { saving: boolean } {
  const saveMutation = useSaveBotConfig();
  const hydratedRef = useRef(false);
  const lastSavedRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const mutateRef = useRef(saveMutation.mutateAsync);
  mutateRef.current = saveMutation.mutateAsync;

  useEffect(() => {
    if (!ready || !config) return;

    const toSend: BotConfigData = {
      ...config,
      custom_flows: sanitizeAllCustomFlows(config.custom_flows),
    };
    const snapshot = JSON.stringify(toSend);

    if (!hydratedRef.current) {
      hydratedRef.current = true;
      lastSavedRef.current = snapshot;
      return;
    }

    if (snapshot === lastSavedRef.current || savingRef.current) return;

    const t = setTimeout(() => {
      if (snapshot === lastSavedRef.current || savingRef.current) return;
      savingRef.current = true;
      void mutateRef
        .current(toSend)
        .then(() => {
          lastSavedRef.current = snapshot;
        })
        .catch(() => Alert.alert(he.generic.errorTitle, he.bot.saveFailed))
        .finally(() => {
          savingRef.current = false;
        });
    }, delayMs);

    return () => clearTimeout(t);
  }, [config, ready, delayMs]);

  const syncSaved = useCallback((config: BotConfigData) => {
    const toSend: BotConfigData = {
      ...config,
      custom_flows: sanitizeAllCustomFlows(config.custom_flows),
    };
    lastSavedRef.current = JSON.stringify(toSend);
  }, []);

  return { saving: saveMutation.isPending, syncSaved };
}
