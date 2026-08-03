import { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { StoreMapUnitSummary, StorePosition } from "@avihay-books/shared";
import { theme } from "../../src/theme";
import { he } from "../../src/i18n/he";
import {
  fetchStoreMapUnit,
  storeMapUnitKey,
  useStoreMapSummary,
} from "../../src/api/storeMap";
import { mockStoreMapSummary } from "../../src/mocks/homeDashboard";
import { markUnitOpen, startUnitOpenTiming } from "../../src/utils/unitOpenTiming";

/** מסך מלאי: רשימת כל ארונות החנות עם סיכום מדפים/תאים/כותרים והקשר ל־`unit/[unitId]`. */

const POSITION_LABEL: Record<StorePosition, string> = {
  front: he.units.front,
  left: he.units.left,
  right: he.units.right,
  island: he.units.island,
  display: he.units.display,
  stacks: he.units.stacks,
  pocket: he.units.pocket,
  brochure: he.units.brochure,
};

interface UnitCardModel {
  unit: StoreMapUnitSummary;
  shelfCount: number;
  cellCount: number;
  uniqueTitles: number;
}

export default function InventoryScreen(): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useStoreMapSummary();

  const openUnit = (unitId: string) => {
    startUnitOpenTiming(unitId, "inventory");
    const cached = queryClient.getQueryData(storeMapUnitKey(unitId));
    markUnitOpen("tap", { cacheHit: cached != null });
    void queryClient.prefetchQuery({
      queryKey: storeMapUnitKey(unitId),
      queryFn: () => fetchStoreMapUnit(unitId),
      staleTime: 30_000,
    });
    markUnitOpen("prefetch_scheduled");
    router.push(`/unit/${unitId}`);
    markUnitOpen("nav_push");
  };

  const isOffline = query.isError;
  const rawSummary =
    query.data != null && !query.isError ? query.data : mockStoreMapSummary();

  const unitsSorted: UnitCardModel[] = useMemo(() => {
    const list = [...rawSummary.units].sort((a, b) => a.display_order - b.display_order);
    return list.map((unit) => ({
      unit,
      shelfCount: unit.shelf_count,
      cellCount: unit.cell_count,
      uniqueTitles: unit.unique_titles,
    }));
  }, [rawSummary]);

  const totals = useMemo(() => {
    let shelves = 0;
    let cells = 0;
    let titles = 0;
    for (const u of unitsSorted) {
      shelves += u.shelfCount;
      cells += u.cellCount;
      titles += u.uniqueTitles;
    }
    return { units: unitsSorted.length, shelves, cells, titles };
  }, [unitsSorted]);

  const refreshing = query.isFetching && !query.isLoading;

  return (
    <View style={styles.screen}>
      {isOffline ? (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.onErrorContainer} />
          <Text style={styles.offlineText}>{he.inventory.offlineBanner}</Text>
        </View>
      ) : null}

      <View style={styles.header}>
        <Text style={styles.title}>{he.inventory.title}</Text>
        <Text style={styles.subtitle}>{he.inventory.subtitle}</Text>
        <View style={styles.totalsRow}>
          <TotalPill
            icon="library-outline"
            label={he.tabs.inventory}
            value={String(totals.units)}
          />
          <TotalPill
            icon="albums-outline"
            label={he.inventory.shelvesCount}
            value={String(totals.shelves)}
          />
          <TotalPill
            icon="grid-outline"
            label={he.inventory.cellsCount}
            value={String(totals.cells)}
          />
        </View>
      </View>

      {query.isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingText}>{he.inventory.loading}</Text>
        </View>
      ) : (
        <FlatList
          data={unitsSorted}
          keyExtractor={(item) => item.unit.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void query.refetch()}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="archive-outline" size={36} color={theme.colors.primary} />
              <Text style={styles.emptyText}>{he.inventory.empty}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openUnit(item.unit.id)}
              style={({ pressed }) => [
                styles.card,
                theme.shadow.floating,
                pressed && styles.cardPressed,
              ]}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardTitleBlock}>
                  <Text style={styles.unitName} numberOfLines={1}>
                    {item.unit.name}
                  </Text>
                  <Text style={styles.positionLabel} numberOfLines={1}>
                    {POSITION_LABEL[item.unit.store_position]}
                  </Text>
                </View>
                {item.unit.is_display_unit ? (
                  <View style={styles.displayBadge}>
                    <Ionicons
                      name={item.unit.store_position === "stacks" ? "layers" : "star"}
                      size={12}
                      color={theme.colors.onTertiaryContainer}
                    />
                    <Text style={styles.displayBadgeText}>
                      {item.unit.store_position === "stacks"
                        ? he.inventory.stacksShelf
                        : he.inventory.displayShelf}
                    </Text>
                  </View>
                ) : null}
              </View>

              {item.unit.has_sides ? (
                <Text style={styles.hint} numberOfLines={1}>
                  {he.inventory.islandHint}
                </Text>
              ) : null}

              <View style={styles.statsRow}>
                <MiniStat label={he.inventory.shelvesCount} value={String(item.shelfCount)} />
                <View style={styles.statsDivider} />
                <MiniStat label={he.inventory.cellsCount} value={String(item.cellCount)} />
                <View style={styles.statsDivider} />
                <MiniStat label={he.inventory.titlesCount} value={String(item.uniqueTitles)} />
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.openCta}>{he.inventory.openUnit}</Text>
                <Ionicons name="chevron-back" size={18} color={theme.colors.primary} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function TotalPill({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}): JSX.Element {
  return (
    <View style={styles.pill}>
      <Ionicons name={icon} size={14} color={theme.colors.primary} />
      <Text style={styles.pillValue}>{value}</Text>
      <Text style={styles.pillLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  offlineBanner: {
    marginHorizontal: theme.spacing.marginMobile,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.errorContainer,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  offlineText: {
    ...theme.typography.labelMd,
    color: theme.colors.onErrorContainer,
    flex: 1,
    textAlign: "left",
  },
  header: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  title: {
    ...theme.typography.headlineMd,
    color: theme.colors.primary,
    textAlign: "left",
  },
  subtitle: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  totalsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.surfaceContainerLow,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  pillValue: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    fontSize: 13,
  },
  pillLabel: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    maxWidth: 72,
    textAlign: "left",
  },
  list: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingBottom: theme.spacing.xl,
  },
  sep: { height: theme.spacing.md },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  loadingText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
  },
  empty: {
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  emptyText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    gap: theme.spacing.sm,
  },
  cardPressed: { opacity: 0.9 },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  cardTitleBlock: { flex: 1, gap: 2 },
  unitName: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  positionLabel: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    textAlign: "left",
  },
  displayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.tertiaryContainer,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  displayBadgeText: {
    ...theme.typography.labelMd,
    fontSize: 10,
    color: theme.colors.onTertiaryContainer,
    letterSpacing: 0,
  },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  statsDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.colors.outlineVariant,
  },
  miniStat: { alignItems: "flex-end", minWidth: 56 },
  miniStatValue: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
  },
  miniStatLabel: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  openCta: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    fontSize: 13,
  },
});
