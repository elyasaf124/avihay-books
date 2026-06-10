import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import type { ChatConversation } from "@avihay-books/shared";
import { he } from "../../../src/i18n/he";
import { useConversations } from "../../../src/api/chat";
import { useChatStream } from "../../../src/hooks/useChatStream";
import { ConversationRow } from "../../../src/components/chat/ConversationRow";
import { wa } from "../../../src/components/chat/waTheme";

export default function ChatListScreen(): JSX.Element {
  const router = useRouter();
  const conversationsQuery = useConversations();
  useChatStream();

  const [search, setSearch] = useState("");

  useFocusEffect(
    useCallback(() => {
      void conversationsQuery.refetch();
    }, [conversationsQuery.refetch]),
  );

  const conversations = conversationsQuery.data ?? [];
  const isOffline = conversationsQuery.isError;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length === 0) return conversations;
    return conversations.filter((c) => {
      const name = (c.profile_name ?? "").toLowerCase();
      return name.includes(q) || c.phone_number.toLowerCase().includes(q);
    });
  }, [conversations, search]);

  const openChat = useCallback(
    (phone: string) => {
      router.push(`/chat/${encodeURIComponent(phone)}`);
    },
    [router],
  );

  const isLoading = conversationsQuery.isLoading;
  const refreshing = conversationsQuery.isFetching && !isLoading;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: he.chat.listTitle,
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/bot")}
              hitSlop={8}
              accessibilityLabel={he.bot.manageButton}
              style={styles.headerBtn}
            >
              <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
            </Pressable>
          ),
        }}
      />

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={wa.inkSecondary} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={he.chat.searchPlaceholder}
          placeholderTextColor={wa.inkSecondary}
          textAlign="left"
        />
      </View>

      {isOffline ? (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color="#7A1B1B" />
          <Text style={styles.offlineText}>{he.chat.offlineBanner}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={wa.header} />
          <Text style={styles.loadingText}>{he.chat.loading}</Text>
        </View>
      ) : (
        <FlatList<ChatConversation>
          data={filtered}
          keyExtractor={(item) => item.phone_number}
          renderItem={({ item }) => <ConversationRow conversation={item} onPress={openChat} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void conversationsQuery.refetch()}
              tintColor={wa.header}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={wa.header} />
              <Text style={styles.emptyTitle}>{he.chat.empty}</Text>
              <Text style={styles.emptyHint}>{he.chat.emptyHint}</Text>
            </View>
          }
          contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: wa.listBg },
  headerBtn: { paddingHorizontal: 8 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: wa.inputBarBg,
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: wa.inkPrimary,
    fontSize: 15,
    paddingVertical: 0,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFDAD6",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  offlineText: { flex: 1, color: "#7A1B1B", fontSize: 13, textAlign: "left" },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  loadingText: { color: wa.inkSecondary, fontSize: 14, textAlign: "left" },
  emptyContainer: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
  },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: wa.inkPrimary, textAlign: "left" },
  emptyHint: { fontSize: 14, color: wa.inkSecondary, textAlign: "center" },
});
