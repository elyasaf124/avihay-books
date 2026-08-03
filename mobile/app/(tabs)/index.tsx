import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { Book } from "@avihay-books/shared";
import { StoreMap, storeMapSummaryToDisplayUnits } from "../../src/components/StoreMap";
import { SearchBar } from "../../src/components/SearchBar";
import { BookDetailModal } from "../../src/components/BookDetailModal";
import { UnitFilterBar } from "../../src/components/unit/UnitFilterBar";
import {
  fetchStoreMapUnit,
  storeMapUnitKey,
  useFilteredCopyCounts,
  useSearchBooks,
  useStoreMapSummary,
} from "../../src/api/storeMap";
import { useDashboardStats } from "../../src/api/dashboard";
import { classifyStoreMapFailure } from "../../src/api/apiDiagnostics";
import { apiPublicBaseHost } from "../../src/api/client";
import { useSuppliersWithFallback } from "../../src/api/unit";
import { useStoreMapFilters } from "../../src/context/StoreMapFilterContext";
import { isUnitFilterActive } from "../../src/utils/unitFilters";
import {
  deriveHomeFloorStockFromSummary,
  mockCatalogBooks,
  mockHomeStats,
  mockStoreMapSummary,
} from "../../src/mocks/homeDashboard";
import { theme } from "../../src/theme";
import { he } from "../../src/i18n/he";

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function ordersDashboardSubtitle(pending: number, sent: number): string {
  if (pending === 0 && sent === 0) return he.home.statsOrdersSubtitleNonePending;
  const parts: string[] = [];
  if (pending > 0) parts.push(he.home.statsOrdersPendingSegment.replace("{{n}}", String(pending)));
  if (sent > 0) parts.push(he.home.statsOrdersSentSegment.replace("{{n}}", String(sent)));
  return parts.join(" · ");
}

export default function HomeScreen(): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const { filters, setFilters } = useStoreMapFilters();
  const suppliers = useSuppliersWithFallback();

  const openUnit = (unitId: string) => {
    void queryClient.prefetchQuery({
      queryKey: storeMapUnitKey(unitId),
      queryFn: () => fetchStoreMapUnit(unitId),
      staleTime: 30_000,
    });
    router.push(`/unit/${unitId}`);
  };

  const summaryQuery = useStoreMapSummary();
  const dashboardQuery = useDashboardStats();
  const filteredCountsQuery = useFilteredCopyCounts(filters);
  const trimmed = query.trim();
  const searchQuery = useSearchBooks(trimmed);

  const isOffline = summaryQuery.isError;
  const failureKind = summaryQuery.isError ? classifyStoreMapFailure(summaryQuery.error) : null;
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
  const summaryData =
    summaryQuery.data != null && !summaryQuery.isError
      ? summaryQuery.data
      : mockStoreMapSummary();
  const floorStock = deriveHomeFloorStockFromSummary(
    summaryQuery.data != null && !summaryQuery.isError ? summaryQuery.data : undefined,
  );
  const mapTopics = summaryData.topics;
  const filterActive = isUnitFilterActive(filters);
  const filteredCopiesByUnitId = useMemo(() => {
    if (!filterActive || !filteredCountsQuery.data) return null;
    const out: Record<string, number> = {};
    for (const row of filteredCountsQuery.data.units) {
      out[row.id] = row.filtered_copies;
    }
    return out;
  }, [filterActive, filteredCountsQuery.data]);
  const filteredFloorCopies = useMemo(() => {
    if (!filterActive || !filteredCopiesByUnitId) return null;
    return Object.values(filteredCopiesByUnitId).reduce((s, n) => s + n, 0);
  }, [filterActive, filteredCopiesByUnitId]);
  const displayUnits = useMemo(
    () => storeMapSummaryToDisplayUnits(summaryData.units),
    [summaryData.units],
  );

  const stats = useMemo(() => {
    const openOrdersFormatted = dashboardQuery.isFetched
      ? (dashboardQuery.data?.openOrders.totalOpen ?? 0).toLocaleString("he-IL")
      : he.home.statsValuePlaceholder;
    const ordersSubLabelEffective = dashboardQuery.isFetched
      ? ordersDashboardSubtitle(
          dashboardQuery.data?.openOrders.pending ?? 0,
          dashboardQuery.data?.openOrders.sent ?? 0,
        )
      : he.home.loading;

    const shortageCountFormatted =
      dashboardQuery.isFetched && dashboardQuery.data
        ? dashboardQuery.data.shortageCount.toLocaleString("he-IL")
        : mockHomeStats.shortages;

    const storeMapPendingFirstFetch =
      summaryQuery.isLoading && !summaryQuery.isFetched && summaryQuery.data == null;
    const filteredPending =
      filterActive && filteredCountsQuery.isLoading && filteredCopiesByUnitId == null;

    const totalStockFormatted =
      filterActive
        ? storeMapPendingFirstFetch || filteredPending
          ? he.home.statsValuePlaceholder
          : (filteredFloorCopies ?? 0).toLocaleString("he-IL")
        : storeMapPendingFirstFetch
          ? he.home.statsValuePlaceholder
          : floorStock.totalStockFormatted;

    const stockDeltaLabel = filterActive
      ? storeMapPendingFirstFetch || filteredPending
        ? he.home.loading
        : he.home.statsFilteredSubtitle
      : storeMapPendingFirstFetch
        ? he.home.loading
        : floorStock.usedRealFloorTotal
          ? he.home.statsFloorStockSubtitle
          : he.home.statsDemoDataSubtitle;

    return {
      totalStock: totalStockFormatted,
      stockDeltaLabel,
      openOrders: openOrdersFormatted,
      ordersSubLabel: ordersSubLabelEffective,
      shortages: shortageCountFormatted,
      shortageSubLabel: mockHomeStats.shortageSubLabel,
    };
  }, [
    dashboardQuery.data,
    dashboardQuery.isFetched,
    filteredCopiesByUnitId,
    filteredCountsQuery.isLoading,
    filteredFloorCopies,
    floorStock.totalStockFormatted,
    floorStock.usedRealFloorTotal,
    filterActive,
    summaryQuery.data,
    summaryQuery.isFetched,
    summaryQuery.isLoading,
  ]);

  const localMockHits = useMemo(() => {
    if (trimmed.length === 0) return [];
    const q = normalize(trimmed);
    return mockCatalogBooks.filter(
      (b) =>
        normalize(b.title).includes(q) ||
        normalize(b.author ?? "").includes(q) ||
        normalize(b.topic).includes(q),
    );
  }, [trimmed]);

  const searchOffline = searchQuery.isError;
  const searchHits = searchOffline ? localMockHits : (searchQuery.data ?? []);
  const searchLoading = trimmed.length > 0 && searchQuery.isLoading && !searchQuery.data;

  const refreshing =
    (summaryQuery.isFetching && !summaryQuery.isLoading) ||
    (dashboardQuery.isFetching && !dashboardQuery.isLoading) ||
    (filteredCountsQuery.isFetching && !filteredCountsQuery.isLoading);
  const onRefresh = (): void => {
    void summaryQuery.refetch();
    void dashboardQuery.refetch();
    if (filterActive) void filteredCountsQuery.refetch();
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

      {suppliers.length > 0 ? (
        <UnitFilterBar
          filters={filters}
          suppliers={suppliers}
          topics={mapTopics}
          onChange={setFilters}
          embedded
          noTopicsLabel={he.home.filterNoTopics}
        />
      ) : null}

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
        {summaryQuery.isLoading ? (
          <View style={styles.mapLoading}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.mapLoadingCaption}>{he.home.loading}</Text>
          </View>
        ) : (
          <>
            <StoreMap
              units={displayUnits}
              filteredCopiesByUnitId={filteredCopiesByUnitId}
              onUnitPress={(unit) => openUnit(unit.id)}
            />
            <Text style={styles.hint}>{he.home.tapToOpen}</Text>
          </>
        )}
      </View>

      <View style={styles.statsColumn}>
        <Pressable
          onPress={() => router.push("/inventory")}
          style={({ pressed }) => [
            styles.statCard,
            styles.statShadow,
            pressed && styles.statCardPressed,
          ]}
        >
          <View style={styles.statHeading}>
            <Text style={styles.statCardTitle}>{he.home.statsTotalTitle}</Text>
            <Ionicons name="layers-outline" size={22} color={theme.colors.secondary} />
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.onSurfaceVariant}
            />
          </View>
          <Text style={styles.statValue}>{stats.totalStock}</Text>
          <Text style={styles.statSub}>{stats.stockDeltaLabel}</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/orders")}
          style={({ pressed }) => [
            styles.statCard,
            styles.statShadow,
            pressed && styles.statCardPressed,
          ]}
        >
          <View style={styles.statHeading}>
            <Text style={styles.statCardTitle}>{he.home.statsOrdersTitle}</Text>
            <Ionicons name="receipt-outline" size={22} color={theme.colors.primary} />
            <Ionicons
              name="chevron-forward"
              size={18}
              color={theme.colors.onSurfaceVariant}
            />
          </View>
          <Text style={styles.statValue}>{stats.openOrders}</Text>
          {/* <Text style={styles.statSub}>{stats.ordersSubLabel}</Text> */}
        </Pressable>

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
