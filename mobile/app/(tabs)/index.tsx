import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { Book } from "@avihay-books/shared";
import { StoreMap } from "../../src/components/StoreMap";
import { SearchBar } from "../../src/components/SearchBar";
import { BookDetailModal } from "../../src/components/BookDetailModal";
import { useSearchBooks, useStoreMap } from "../../src/api/storeMap";
import { classifyStoreMapFailure } from "../../src/api/apiDiagnostics";
import { apiPublicBaseHost } from "../../src/api/client";
import { useShortageList } from "../../src/api/shortage";
import {
  deriveHomeStats,
  mockCatalogBooks,
  mockStoreMap,
} from "../../src/mocks/homeDashboard";
import { theme } from "../../src/theme";
import { he } from "../../src/i18n/he";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export default function HomeScreen(): JSX.Element {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const storeMapQuery = useStoreMap();
  const shortageQuery = useShortageList();
  const trimmed = query.trim();
  const searchQuery = useSearchBooks(trimmed);

  // Prefer real `/store-map` data; fall back to the demo map when the API is unreachable.
  const isOffline = storeMapQuery.isError;
  const failureKind = storeMapQuery.isError ? classifyStoreMapFailure(storeMapQuery.error) : null;
  const offlineBannerText =
    failureKind === "localhost"
      ? he.home.offlineBannerLocalhost
      : failureKind === "auth"
        ? he.home.offlineBannerAuth
        : he.home.offlineBanner;
  const offlineBannerSub =
    failureKind === "notFound"
      ? he.home.offlineDetailNotFound
      : failureKind === "server"
        ? he.home.offlineDetailServer
        : failureKind === "timeout"
          ? he.home.offlineDetailTimeout
          : failureKind === "network"
            ? he.home.offlineDetailNetwork
            : failureKind === "unknown"
              ? he.home.offlineDetailUnknown
              : null;
  const offlineHostShown = apiPublicBaseHost();
  const storeMapData =
    storeMapQuery.data != null && !storeMapQuery.isError ? storeMapQuery.data : mockStoreMap;
  const baseStats = deriveHomeStats(storeMapQuery.data);
  const liveShortageCount = shortageQuery.data?.length;
  const stats =
    typeof liveShortageCount === "number"
      ? { ...baseStats, shortages: liveShortageCount.toLocaleString("he-IL") }
      : baseStats;

  const localMockHits = useMemo(() => {
    if (trimmed.length === 0) return [];
    const q = normalize(trimmed);
    return mockCatalogBooks.filter(
      (b) =>
        normalize(b.title).includes(q) ||
        normalize(b.author).includes(q) ||
        normalize(b.topic).includes(q),
    );
  }, [trimmed]);

  const searchOffline = searchQuery.isError;
  const searchHits = searchOffline ? localMockHits : (searchQuery.data ?? []);
  const searchLoading = trimmed.length > 0 && searchQuery.isLoading && !searchQuery.data;

  const refreshing = storeMapQuery.isFetching && !storeMapQuery.isLoading;
  const onRefresh = (): void => {
    void storeMapQuery.refetch();
    if (trimmed.length > 0) void searchQuery.refetch();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {isOffline ? (
        <View style={styles.offlineBanner}>
          <View style={styles.offlineBannerBody}>
            <Text style={styles.offlineBannerText}>{offlineBannerText}</Text>
            {offlineBannerSub ? (
              <Text style={styles.offlineBannerSub}>{offlineBannerSub}</Text>
            ) : null}
            {offlineHostShown ? (
              <Text style={styles.offlineBannerSub}>
                {he.home.offlineHostLabel}: `{offlineHostShown}`
              </Text>
            ) : null}
          </View>
          <Ionicons name="cloud-offline-outline" size={18} color={theme.colors.onErrorContainer} />
        </View>
      ) : null}

      <SearchBar value={query} onChange={setQuery} />

      {trimmed.length > 0 && (
        <View style={styles.searchResults}>
          {searchLoading ? (
            <View style={styles.loadingRow}>
              <Text style={styles.loadingRowText}>{he.home.loading}</Text>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <>
              {searchOffline ? (
                <Text style={styles.searchOfflineNote}>{he.home.searchOfflineBanner}</Text>
              ) : null}
              <FlatList
                data={searchHits}
                keyExtractor={(b) => b.id}
                scrollEnabled={false}
                ListEmptyComponent={<Text style={styles.emptySearch}>{he.home.searchEmpty}</Text>}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
                renderItem={({ item }) => (
                  <Pressable onPress={() => setSelectedBook(item)} style={styles.searchRow}>
                    <Text style={styles.searchTitle}>{item.title}</Text>
                    <Text style={styles.searchMeta}>
                      {item.author} · ₪ {item.price}
                    </Text>
                  </Pressable>
                )}
              />
            </>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>{he.home.mapSectionTitle}</Text>

      <View style={styles.mapBox}>
        {storeMapQuery.isLoading ? (
          <View style={styles.mapLoading}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.mapLoadingCaption}>{he.home.loading}</Text>
          </View>
        ) : (
          <>
            <StoreMap data={storeMapData} onUnitPress={(unit) => router.push(`/unit/${unit.id}`)} />
            <Text style={styles.hint}>{he.home.tapToOpen}</Text>
          </>
        )}
      </View>

      <View style={styles.statsColumn}>
        <View style={[styles.statCard, styles.statShadow]}>
          <View style={styles.statHeading}>
            <Text style={styles.statCardTitle}>{he.home.statsTotalTitle}</Text>
            <Ionicons name="layers-outline" size={22} color={theme.colors.secondary} />
          </View>
          <Text style={styles.statValue}>{stats.totalStock}</Text>
          <Text style={styles.statSub}>{stats.stockDeltaLabel}</Text>
        </View>

        <View style={[styles.statCard, styles.statShadow]}>
          <View style={styles.statHeading}>
            <Text style={styles.statCardTitle}>{he.home.statsOrdersTitle}</Text>
            <Ionicons name="receipt-outline" size={22} color={theme.colors.primary} />
          </View>
          <Text style={styles.statValue}>{stats.openOrders}</Text>
          <Text style={styles.statSub}>{stats.ordersSubLabel}</Text>
        </View>

        <Pressable
          onPress={() => router.push("/shortage")}
          style={({ pressed }) => [
            styles.statCard,
            styles.statCardDanger,
            styles.statShadow,
            pressed && styles.statCardPressed,
          ]}
        >
          <View style={styles.statHeading}>
            <Text style={styles.statCardTitle}>{he.home.statsShortageTitle}</Text>
            <Ionicons name="warning-outline" size={22} color={theme.colors.error} />
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.onSurfaceVariant}
            />
          </View>
          <Text style={styles.statValue}>{stats.shortages}</Text>
          <Text style={styles.statSub}>{stats.shortageSubLabel}</Text>
        </Pressable>
      </View>

      <BookDetailModal book={selectedBook} visible={selectedBook !== null} onClose={() => setSelectedBook(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.spacing.marginMobile,
    paddingBottom: theme.spacing.xl + theme.spacing.md,
    gap: theme.spacing.lg,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.errorContainer,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.onErrorContainer,
  },
  offlineBannerBody: { flex: 1, gap: theme.spacing.xs },
  offlineBannerText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onErrorContainer,
    textAlign: "left",
  },
  offlineBannerSub: {
    ...theme.typography.caption,
    color: theme.colors.onErrorContainer,
    opacity: 0.92,
    textAlign: "left",
  },
  searchResults: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  searchOfflineNote: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    paddingVertical: theme.spacing.xs,
  },
  emptySearch: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    paddingVertical: theme.spacing.md,
  },
  searchRow: { paddingVertical: theme.spacing.sm },
  searchTitle: {
    ...theme.typography.bodyLg,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  searchMeta: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  sep: { height: 1, backgroundColor: theme.colors.outlineVariant },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  loadingRowText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    flex: 1,
  },
  sectionTitle: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    textAlign: "left",
    marginBottom: theme.spacing.xs,
  },
  mapBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  mapLoading: {
    paddingVertical: theme.spacing.xl,
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  mapLoadingCaption: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
  },
  hint: {
    marginTop: theme.spacing.sm,
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
  },
  statsColumn: {
    gap: theme.spacing.md,
  },
  statCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    gap: theme.spacing.sm,
    alignSelf: "stretch",
  },
  statCardDanger: {
    borderStartWidth: 4,
    borderStartColor: theme.colors.error,
  },
  statCardPressed: { opacity: 0.85 },
  statHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  statCardTitle: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: "left",
  },
  statValue: {
    ...theme.typography.display,
    fontSize: 36,
    lineHeight: 44,
    color: theme.colors.onSurface,
    textAlign: "left",
    marginTop: theme.spacing.xs,
  },
  statSub: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  statShadow: {
    ...theme.shadow.floating,
  },
});
