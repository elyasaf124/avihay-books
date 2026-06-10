import { useEffect } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import EventSource from "react-native-sse";
import { api, API_BASE_URL } from "../api/client";
import { CHAT_CONVERSATIONS_KEY, CHAT_UNREAD_KEY, chatMessagesKey } from "../api/chat";

interface ChatStreamEvent {
  type: "message" | "conversation_update";
  phone: string;
}

/**
 * מתחבר ל-SSE של השרת לעדכוני צ'אט בזמן אמת. בכל אירוע מבטל את ה-cache הרלוונטי
 * ב-React Query כדי לרענן את רשימת השיחות / מסך השיחה מיד.
 *
 * ב-Web אין תמיכה ב-headers ב-EventSource הנייטיב, לכן מסתמכים שם על polling בלבד.
 */
export function useChatStream(): void {
  const client = useQueryClient();

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!API_BASE_URL) return;

    const apiKey = api.defaults.headers.common["x-api-key"];
    const headers: Record<string, string> = {};
    if (typeof apiKey === "string" && apiKey.length > 0) {
      headers["x-api-key"] = apiKey;
    }

    const es = new EventSource(`${API_BASE_URL}/chat/stream`, {
      headers,
      // השרת שולח keep-alive; אין צורך ב-polling reconnection אגרסיבי.
      pollingInterval: 15_000,
    });

    const onMessage = (event: { data?: string | null }): void => {
      if (!event.data) return;
      let parsed: ChatStreamEvent | null = null;
      try {
        parsed = JSON.parse(event.data) as ChatStreamEvent;
      } catch {
        return;
      }
      if (!parsed?.phone) return;
      void client.invalidateQueries({ queryKey: CHAT_CONVERSATIONS_KEY });
      void client.invalidateQueries({ queryKey: CHAT_UNREAD_KEY });
      void client.invalidateQueries({ queryKey: chatMessagesKey(parsed.phone) });
    };

    es.addEventListener("message", onMessage);

    return () => {
      es.removeAllEventListeners();
      es.close();
    };
  }, [client]);
}
