import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { AxiosError } from "axios";
import type {
  ChatConversation,
  ChatMessageView,
  ChatSendResult,
} from "@avihay-books/shared";
import { api } from "./client";

export const CHAT_CONVERSATIONS_KEY = ["chat", "conversations"] as const;
export const CHAT_UNREAD_KEY = ["chat", "unread-count"] as const;
export const chatMessagesKey = (phone: string) => ["chat", "messages", phone] as const;

/** קוד שגיאה עסקי מהשרת (מחוץ לחלון 24 שעות / וואטסאפ לא מוגדר). */
export function chatSendErrorCode(err: unknown): string | null {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { error?: string } | undefined;
    return data?.error ?? null;
  }
  return null;
}

function refetchChatLists(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.refetchQueries({ queryKey: CHAT_CONVERSATIONS_KEY }),
    client.refetchQueries({ queryKey: CHAT_UNREAD_KEY }),
  ]);
}

/** רשימת השיחות בתיבת הצ'אט. `refetchInterval` הוא גיבוי ל-SSE. */
export function useConversations() {
  return useQuery<ChatConversation[]>({
    queryKey: CHAT_CONVERSATIONS_KEY,
    queryFn: async () => {
      const { data } = await api.get<ChatConversation[]>("/chat/conversations");
      return data;
    },
    staleTime: 0,
    retry: 0,
    refetchInterval: 20_000,
  });
}

interface UnreadCountResponse {
  count: number;
}

/** מונה ההודעות שטרם נקראו — לתג על טאב הצ'אט. */
export function useChatUnreadCount(opts: { pollMs?: number } = {}) {
  return useQuery<number>({
    queryKey: CHAT_UNREAD_KEY,
    queryFn: async () => {
      const { data } = await api.get<UnreadCountResponse>("/chat/unread-count");
      return data.count;
    },
    staleTime: 5_000,
    refetchInterval: opts.pollMs ?? 30_000,
    refetchIntervalInBackground: false,
    retry: 0,
  });
}

/** היסטוריית ההודעות של שיחה (חדש→ישן — מתאים ל-FlatList inverted). */
export function useMessages(phone: string) {
  return useQuery<ChatMessageView[]>({
    queryKey: chatMessagesKey(phone),
    queryFn: async () => {
      const { data } = await api.get<ChatMessageView[]>(
        `/chat/${encodeURIComponent(phone)}/messages`,
      );
      return data;
    },
    enabled: phone.length > 0,
    staleTime: 0,
    retry: 0,
  });
}

/** שליחת מענה אנושי ללקוח דרך WhatsApp Cloud API. */
export function useSendMessage(phone: string) {
  const client = useQueryClient();
  return useMutation<ChatSendResult, AxiosError, string>({
    mutationFn: async (text: string) => {
      const { data } = await api.post<ChatSendResult>(
        `/chat/${encodeURIComponent(phone)}/send`,
        { text },
      );
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        client.refetchQueries({ queryKey: chatMessagesKey(phone) }),
        refetchChatLists(client),
      ]);
    },
  });
}

/** סימון שיחה כנקראה. */
export function useMarkChatRead() {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (phone: string) => {
      await api.post(`/chat/${encodeURIComponent(phone)}/read`);
    },
    onSuccess: async () => {
      await refetchChatLists(client);
    },
  });
}
