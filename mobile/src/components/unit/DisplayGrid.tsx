import { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../theme";
import { he } from "../../i18n/he";
import type {
  DisplayBookAggregate,
  StacksSetItem,
} from "../../utils/displayBookAggregate";

interface DisplayItem {
  key: string;
  aggregate: DisplayBookAggregate;
  cellSummary: string;
}

export type DisplayGridVariant = "display" | "stacks";

interface Props {
  aggregates?: DisplayBookAggregate[];
  setItems?: StacksSetItem[];
  shortagedIds: Set<string>;
  onAggregatePress?: (aggregate: DisplayBookAggregate) => void;
  onAggregateLongPress?: (aggregate: DisplayBookAggregate) => void;
  onSetPress?: (item: StacksSetItem) => void;
  onSetLongPress?: (item: StacksSetItem) => void;
  variant?: DisplayGridVariant;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => {
    return s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }, template);
}

function cellSummaryForAggregate(agg: DisplayBookAggregate): string {
  const names = [...new Set(agg.spots.map((s) => s.cell_name))];
  if (names.length === 0) return "";
  if (names.length === 1) {
    return interpolate(he.unit.displayGridOneCell, { cell: names[0]! });
  }
  return interpolate(he.unit.displayGridManyCells, { n: String(names.length) });
}

function aggregateHasShortage(agg: DisplayBookAggregate, shortagedIds: Set<string>): boolean {
  return agg.spots.some((s) => shortagedIds.has(s.location_id) || s.is_pending_shortage);
}

function setHasShortage(item: StacksSetItem, shortagedIds: Set<string>): boolean {
  return shortagedIds.has(item.location_id) || Boolean(item.is_pending_shortage);
}

export function DisplayGrid({
  aggregates = [],
  setItems = [],
  shortagedIds,
  onAggregatePress,
  onAggregateLongPress,
  onSetPress,
  onSetLongPress,
  variant = "display",
}: Props): JSX.Element {
  const displayItems = useMemo((): DisplayItem[] => {
    return aggregates.map((aggregate) => ({
      key: aggregate.book_id,
      aggregate,
      cellSummary: cellSummaryForAggregate(aggregate),
    }));
  }, [aggregates]);

  const sectionTitle =
    variant === "stacks" ? he.unit.stacksGridTitle : he.unit.displayGridTitle;

  const copiesLabel = he.unit.displayGridCopies;

  if (variant === "stacks") {
    return (
      <View style={styles.wrap}>
        <Text style={styles.sectionHint}>{sectionTitle}</Text>
        <FlatList
          data={setItems}
          keyExtractor={(item) => `${item.location_id}-${item.copy_index}`}
          numColumns={2}
          columnWrapperStyle={styles.columnWrap}
          scrollEnabled={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.empty}>{he.unit.emptyCell}</Text>}
          renderItem={({ item }) => {
            const shorted = setHasShortage(item, shortagedIds);
            return (
              <Pressable
                onPress={() => onSetPress?.(item)}
                onLongPress={() => onSetLongPress?.(item)}
                delayLongPress={350}
                style={[styles.setCard, shorted && styles.cardShortage]}
              >
                <View style={[styles.stackAccent, { backgroundColor: item.supplier_color }]} />
                <View style={styles.setCardBody}>
                  <Text style={styles.setTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.setAuthor} numberOfLines={1}>
                    {item.author}
                  </Text>
                  {item.is_new ? (
                    <View style={styles.setNewBadge}>
                      <Text style={styles.newBadgeText}>חדש</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionHint}>{sectionTitle}</Text>
      <FlatList
        data={displayItems}
        keyExtractor={(it) => it.key}
        numColumns={2}
        columnWrapperStyle={styles.columnWrap}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>{he.unit.emptyCell}</Text>}
        renderItem={({ item }) => {
          const agg = item.aggregate;
          const b = agg.representative;
          const shorted = aggregateHasShortage(agg, shortagedIds);
          return (
            <Pressable
              onPress={() => onAggregatePress?.(agg)}
              onLongPress={() => onAggregateLongPress?.(agg)}
              delayLongPress={350}
              style={[styles.card, shorted && styles.cardShortage]}
            >
              <View style={[styles.stackAccent, { backgroundColor: b.supplier_color }]} />
              <View style={styles.cardBody}>
                <View style={styles.fakeStack}>
                  <View style={[styles.stackLayer, styles.stackBack]} />
                  <View style={[styles.stackLayer, styles.stackMid]} />
                  <View style={[styles.stackLayer, styles.stackFront]}>
                    <Text style={styles.title} numberOfLines={2}>
                      {b.title}
                    </Text>
                    <Text style={styles.author} numberOfLines={1}>
                      {b.author}
                    </Text>
                    <View style={styles.qtyRow}>
                      <Text style={styles.qtyPill}>
                        {interpolate(copiesLabel, { n: String(agg.totalQuantity) })}
                      </Text>
                      {b.is_new ? (
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>חדש</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
                <Text style={styles.cellMeta} numberOfLines={2}>
                  {item.cellSummary}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  sectionHint: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    paddingHorizontal: theme.spacing.xs,
  },
  listContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  columnWrap: {
    gap: theme.spacing.sm,
    justifyContent: "space-between",
  },
  empty: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    paddingVertical: theme.spacing.lg,
  },
  card: {
    flex: 1,
    maxWidth: "48%",
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    overflow: "hidden",
    ...theme.shadow.floating,
  },
  setCard: {
    flex: 1,
    maxWidth: "48%",
    aspectRatio: 1,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    overflow: "hidden",
    ...theme.shadow.floating,
  },
  cardShortage: { opacity: 0.45 },
  stackAccent: { height: 4, width: "100%" },
  cardBody: {
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  setCardBody: {
    flex: 1,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
    justifyContent: "center",
    alignItems: "center",
  },
  setTitle: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    textAlign: "center",
  },
  setAuthor: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    marginTop: 4,
  },
  setNewBadge: {
    backgroundColor: theme.colors.tertiaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    marginTop: 4,
  },
  fakeStack: {
    minHeight: 88,
    position: "relative",
    marginTop: theme.spacing.xs,
  },
  stackLayer: {
    position: "absolute",
    start: 0,
    end: 0,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  stackBack: {
    top: 0,
    height: 72,
    backgroundColor: theme.colors.surfaceContainerHigh,
    transform: [{ translateY: -6 }, { scaleX: 0.92 }],
    alignSelf: "center",
    width: "92%",
  },
  stackMid: {
    top: 4,
    height: 72,
    backgroundColor: theme.colors.surfaceContainer,
    transform: [{ scaleX: 0.96 }],
    alignSelf: "center",
    width: "96%",
  },
  stackFront: {
    top: 10,
    minHeight: 84,
    backgroundColor: theme.colors.surfaceContainerLowest,
    padding: theme.spacing.sm,
    justifyContent: "center",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    flexWrap: "wrap",
  },
  qtyPill: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.onPrimaryContainer,
    backgroundColor: theme.colors.primaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    overflow: "hidden",
  },
  title: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  author: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    marginTop: 4,
  },
  newBadge: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.tertiaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    marginTop: 4,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.onTertiaryContainer,
  },
  cellMeta: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    textAlign: "left",
    marginTop: 4,
  },
});
