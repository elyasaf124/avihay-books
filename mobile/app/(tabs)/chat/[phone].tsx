import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ChatMessageView } from "@avihay-books/shared";
import { he } from "../../../src/i18n/he";
import {
  chatSendErrorCode,
  useConversations,
  useMarkChatRead,
  useMessages,
  useSendMessage,
} from "../../../src/api/chat";
import { useChatStream } from "../../../src/hooks/useChatStream";
import { useKeyboardFrame } from "../../../src/hooks/useKeyboardHeight";
import { MessageBubble } from "../../../src/components/chat/MessageBubble";
import { wa, avatarColor, avatarInitial } from "../../../src/components/chat/waTheme";

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

const ANDROID_KEYBOARD_CLEARANCE = 12;

export default function ConversationScreen(): JSX.Element {
  const params = useLocalSearchParams<{ phone: string }>();
  const phone = typeof params.phone === "string" ? params.phone : "";
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight, screenY: keyboardScreenY } = useKeyboardFrame();
  const { height: windowH } = useWindowDimensions();

  useChatStream();
  const messagesQuery = useMessages(phone);
  const sendMutation = useSendMessage(phone);
  const markRead = useMarkChatRead();
  const conversationsQuery = useConversations();

  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  const conversation = useMemo(
    () => conversationsQuery.data?.find((c) => c.phone_number === phone),
    [conversationsQuery.data, phone],
  );
  const profileName = conversation?.profile_name ?? null;
  const displayName = (profileName ?? "").trim() || phone;

  const keyboardVerticalOffset = Platform.OS === "ios" ? insets.top + 44 : 0;
  const inputPaddingBottom = Math.max(insets.bottom, 8);
  const inputBarRef = useRef<View>(null);
  const androidKeyboardMarginRef = useRef(0);
  const [androidKeyboardMargin, setAndroidKeyboardMargin] = useState(0);

  useEffect(() => {
    if (keyboardScreenY == null) {
      androidKeyboardMarginRef.current = 0;
      setAndroidKeyboardMargin(0);
      return;
    }
    if (Platform.OS !== "android") return;

    const apply = (): void => {
      if (androidKeyboardMarginRef.current > 0) return;
      inputBarRef.current?.measureInWindow((_x, y, _w, height) => {
        if (androidKeyboardMarginRef.current > 0) return;
        const barBottomWindow = y + height;
        const needed = Math.max(
          0,
          barBottomWindow - keyboardScreenY + ANDROID_KEYBOARD_CLEARANCE,
        );
        if (needed <= 0) return;
        androidKeyboardMarginRef.current = needed;
        setAndroidKeyboardMargin(needed);
      });
    };

    apply();
    const t = setTimeout(apply, 60);
    return () => clearTimeout(t);
  }, [keyboardScreenY]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[chat-keyboard] layout", {
      platform: Platform.OS,
      windowH,
      keyboardHeight,
      insetsTop: insets.top,
      insetsBottom: insets.bottom,
      keyboardVerticalOffset,
      inputPaddingBottom,
      kavBehavior: Platform.OS === "ios" ? "padding" : undefined,
      keyboardScreenY,
      androidKeyboardMargin,
    });
  }, [
    windowH,
    keyboardHeight,
    insets.top,
    insets.bottom,
    keyboardVerticalOffset,
    inputPaddingBottom,
    keyboardScreenY,
    androidKeyboardMargin,
  ]);

  // חלון 24 שעות: מאתרים את ההודעה הנכנסת האחרונה (הרשימה ממוינת חדש→ישן).
  const outsideWindow = useMemo(() => {
    const lastInbound = messages.find((m) => m.direction === "in");
    if (!lastInbound) return true;
    return Date.now() - new Date(lastInbound.created_at).getTime() > SERVICE_WINDOW_MS;
  }, [messages]);

  useFocusEffect(
    useCallback(() => {
      if (phone) markRead.mutate(phone);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phone]),
  );

  // סימון נקרא גם כשמגיעות הודעות חדשות בזמן צפייה.
  useEffect(() => {
    if (phone && messages.length > 0) markRead.mutate(phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const canSend = draft.trim().length > 0 && !outsideWindow && !sendMutation.isPending;

  const handleSend = async (): Promise<void> => {
    const text = draft.trim();
    if (text.length === 0 || sendMutation.isPending) return;
    setSendError(null);
    try {
      await sendMutation.mutateAsync(text);
      setDraft("");
    } catch (err) {
      const code = chatSendErrorCode(err);
      if (code === "outside_service_window") setSendError(he.chat.sendErrorWindow);
      else if (code === "whatsapp_not_configured") setSendError(he.chat.sendErrorNotConfigured);
      else setSendError(he.chat.sendErrorGeneric);
    }
  };

  const isLoading = messagesQuery.isLoading;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <View style={[styles.headerAvatar, { backgroundColor: avatarColor(phone) }]}>
                <Text style={styles.headerAvatarText}>
                  {avatarInitial(profileName, phone)}
                </Text>
              </View>
              <View style={styles.headerTexts}>
                <Text style={styles.headerName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.headerStatus} numberOfLines={1}>
                  {conversation?.bot_paused ? he.chat.humanActive : he.chat.botActive}
                </Text>
              </View>
            </View>
          ),
        }}
      />

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={wa.header} />
          <Text style={styles.loadingText}>{he.chat.loadingMessages}</Text>
        </View>
      ) : (
        <FlatList<ChatMessageView>
          data={messages}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.listContent}
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyText}>{he.chat.emptyMessages}</Text>
            </View>
          }
        />
      )}

      {outsideWindow ? (
        <View style={styles.windowBanner}>
          <Ionicons name="time-outline" size={16} color={wa.warningInk} />
          <Text style={styles.windowText}>{he.chat.outsideWindowBody}</Text>
        </View>
      ) : sendError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#7A1B1B" />
          <Text style={styles.errorText}>{sendError}</Text>
        </View>
      ) : null}

      <View
        ref={inputBarRef}
        style={[
          styles.inputBar,
          { paddingBottom: inputPaddingBottom, marginBottom: androidKeyboardMargin },
        ]}
        onLayout={() => {
          if (!__DEV__) return;
          inputBarRef.current?.measureInWindow((x, y, width, height) => {
            const barBottomWindow = y + height;
            const contentBottomWindow = barBottomWindow - inputPaddingBottom;
            console.log("[chat-keyboard] inputBar onLayout", {
              x,
              y,
              width,
              height,
              paddingBottom: inputPaddingBottom,
              marginBottom: androidKeyboardMarginRef.current,
              contentBottomWindow,
              keyboardScreenY,
              gapToKeyboard:
                keyboardScreenY != null ? keyboardScreenY - contentBottomWindow : null,
              distanceFromWindowBottom: windowH - barBottomWindow,
            });
          });
        }}
      >
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={he.chat.inputPlaceholder}
            placeholderTextColor={wa.inkSecondary}
            multiline
            editable={!outsideWindow}
            textAlign="left"
            onFocus={() => {
              if (__DEV__) console.log("[chat-keyboard] input focused");
            }}
          />
        </View>
        <Pressable
          onPress={() => void handleSend()}
          disabled={!canSend}
          style={[styles.sendBtn, { backgroundColor: canSend ? wa.sendButton : wa.sendButtonDisabled }]}
          accessibilityRole="button"
          accessibilityLabel={he.chat.send}
        >
          {sendMutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons name="send" size={20} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: wa.wallpaper },
  headerTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  headerTexts: { justifyContent: "center" },
  headerName: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", textAlign: "left" },
  headerStatus: { color: "#D8F3E9", fontSize: 11, textAlign: "left" },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  loadingText: { color: wa.inkSecondary, fontSize: 14, textAlign: "left" },
  listContent: { paddingVertical: 10 },
  emptyMessages: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ scaleY: -1 }],
    paddingVertical: 40,
  },
  emptyText: {
    backgroundColor: "#FFF6D8",
    color: wa.warningInk,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  windowBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: wa.warningBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  windowText: { flex: 1, color: wa.warningInk, fontSize: 13, textAlign: "left" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFDAD6",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorText: { flex: 1, color: "#7A1B1B", fontSize: 13, textAlign: "left" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: wa.inputBarBg,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: wa.inputBg,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 4,
    minHeight: 44,
    justifyContent: "center",
  },
  input: {
    fontSize: 15,
    color: wa.inkPrimary,
    maxHeight: 120,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
});
