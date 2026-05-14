import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { StoreMapBook, StoreMapShelf } from "@avihay-books/shared";
import { theme } from "../../../src/theme";
import { he } from "../../../src/i18n/he";
import { useStoreMap } from "../../../src/api/storeMap";
import {
  useAddShortage,
  useMoveBook,
  useSuppliersWithFallback,
  useUnitFromMap,
} from "../../../src/api/unit";
import { mockStoreMap } from "../../../src/mocks/homeDashboard";
import { ConfirmDialog } from "../../../src/components/ConfirmDialog";
import { BookDetailModal } from "../../../src/components/BookDetailModal";
import { SideToggle } from "../../../src/components/unit/SideToggle";
import { DisplayGrid } from "../../../src/components/unit/DisplayGrid";
import { DisplaySaleModal } from "../../../src/components/unit/DisplaySaleModal";
import { ShelfRow } from "../../../src/components/unit/ShelfRow";
import {
  UnitFilterBar,
  emptyFilters,
  type UnitFilterState,
} from "../../../src/components/unit/UnitFilterBar";
import { MoveBookModal } from "../../../src/components/unit/MoveBookModal";
import {
  aggregateDisplayBooksFromShelves,
  type DisplayBookAggregate,
} from "../../../src/utils/displayBookAggregate";

export default function UnitScreen(): JSX.Element {
  const router = useRouter();
  const { unitId } = useLocalSearchParams<{ unitId: string }>();
  const unitIdStr = typeof unitId === "string" ? unitId : null;

  const storeMapQuery = useStoreMap();
  const isOffline = storeMapQuery.isError;
  const effectiveMap =
    storeMapQuery.data != null && !storeMapQuery.isError ? storeMapQuery.data : mockStoreMap;

  const { unit } = useUnitFromMap(unitIdStr ?? undefined, effectiveMap);

  const suppliers = useSuppliersWithFallback();

  const [activeSideId, setActiveSideId] = useState<string | null>(null);
  const [filters, setFilters] = useState<UnitFilterState>(emptyFilters);

  const [confirmFor, setConfirmFor] = useState<StoreMapBook | null>(null);
  const [detailsFor, setDetailsFor] = useState<StoreMapBook | null>(null);
  const [moveFor, setMoveFor] = useState<StoreMapBook | null>(null);
  const [saleFor, setSaleFor] = useState<DisplayBookAggregate | null>(null);

  /** מיקומים (`location_id`) שסומנו אופטימית כחוסר — פר־עותק, לא לפי `book_id`. */
  const [optimisticShortage, setOptimisticShortage] = useState<Set<string>>(new Set());

  const [moveError, setMoveError] = useState<string | null>(null);

  const addShortage = useAddShortage();
  const moveBook = useMoveBook();

  const sideOptions = useMemo(
    () => unit?.sides.map((s) => ({ id: s.id, label: s.side_label })) ?? [],
    [unit],
  );

  const effectiveSideId = activeSideId ?? sideOptions[0]?.id ?? null;

  const shelves: StoreMapShelf[] = useMemo(() => {
    if (!unit) return [];
    if (unit.has_sides) {
      const side = unit.sides.find((s) => s.id === effectiveSideId) ?? unit.sides[0];
      return side?.shelves ?? [];
    }
    return unit.shelves;
  }, [unit, effectiveSideId]);

  /** אחרי השלמת חוסר ממסך אחר / רענון `store-map`: מנקים טשטוש אופטימי אם השרת כבר לא מדווח על חוסר למיקום זה. */
  useEffect(() => {
    setOptimisticShortage((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const shelf of shelves) {
        for (const cell of shelf.cells) {
          for (const b of cell.books) {
            if (next.has(b.location_id) && !b.is_pending_shortage) next.delete(b.location_id);
          }
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [shelves]);

  const passesFilter = useCallback(
    (b: StoreMapBook) => {
      if (filters.supplierIds.length > 0 && !filters.supplierIds.includes(b.supplier_id))
        return false;
      const price = Number(b.price);
      if (filters.priceMin !== null && !Number.isNaN(price) && price < filters.priceMin)
        return false;
      if (filters.priceMax !== null && !Number.isNaN(price) && price > filters.priceMax)
        return false;
      return true;
    },
    [filters],
  );

  /** ספרים פר־תא לאחר סינון; שומר על מבנה גם כשהתוצאה ריקה. */
  const filteredCellBooks = useMemo(() => {
    const map = new Map<string, StoreMapBook[]>();
    for (const shelf of shelves) {
      for (const cell of shelf.cells) {
        map.set(cell.id, cell.books.filter(passesFilter));
      }
    }
    return map;
  }, [shelves, passesFilter]);

  const allCellBooksMap = useMemo(() => {
    const map = new Map<string, StoreMapBook[]>();
    for (const shelf of shelves) {
      for (const cell of shelf.cells) {
        map.set(cell.id, cell.books);
      }
    }
    return map;
  }, [shelves]);

  const displayAggregatesAll = useMemo(
    () => aggregateDisplayBooksFromShelves(shelves, allCellBooksMap),
    [shelves, allCellBooksMap],
  );
  const displayAggregatesFiltered = useMemo(
    () => aggregateDisplayBooksFromShelves(shelves, filteredCellBooks),
    [shelves, filteredCellBooks],
  );

  const totalBooks = useMemo(() => {
    if (unit?.store_position === "display") {
      return displayAggregatesAll.length;
    }
    let count = 0;
    for (const shelf of shelves) for (const cell of shelf.cells) count += cell.books.length;
    return count;
  }, [unit?.store_position, displayAggregatesAll, shelves]);

  const matchedBookCount = useMemo(() => {
    if (unit?.store_position === "display") {
      return displayAggregatesFiltered.length;
    }
    let n = 0;
    for (const arr of filteredCellBooks.values()) n += arr.length;
    return n;
  }, [unit?.store_position, displayAggregatesFiltered, filteredCellBooks]);

  const filtersActive =
    filters.supplierIds.length > 0 || filters.priceMin !== null || filters.priceMax !== null;

  const onConfirmShortage = useCallback(async () => {
    if (!confirmFor) return;
    const book = confirmFor;
    setOptimisticShortage((prev) => new Set(prev).add(book.location_id));
    setConfirmFor(null);
    try {
      await addShortage.mutateAsync({
        bookId: book.book_id,
        soldQuantity: 1,
        locationId: book.location_id,
      });
    } catch {
      // נשארים אופטימיים בתצוגה זו — בייצור אמיתי נציג טוסט שכשל.
    }
  }, [confirmFor, addShortage]);

  const closeMove = () => {
    setMoveFor(null);
    setMoveError(null);
  };

  const onSubmitMove = useCallback(
    async ({
      cellId,
      positionInCell,
      quantityInCell,
    }: {
      cellId: string;
      positionInCell: number;
      quantityInCell: number;
      summaryLabel: string;
    }) => {
      if (!moveFor) return;
      setMoveError(null);
      try {
        await moveBook.mutateAsync({
          locationId: moveFor.location_id,
          bookId: moveFor.book_id,
          cellId,
          positionInCell,
          quantityInCell,
        });
        closeMove();
      } catch {
        setMoveError(isOffline ? he.unit.move.offline : he.unit.move.failed);
      }
    },
    [moveFor, moveBook, isOffline],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: unit?.name ?? he.unit.notFoundTitle,
          headerBackTitle: he.unit.backToStoreMap,
        }}
      />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={storeMapQuery.isFetching}
            onRefresh={() => void storeMapQuery.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      >
        {isOffline ? (
          <View style={styles.offlineBanner}>
            <Ionicons
              name="cloud-offline-outline"
              size={16}
              color={theme.colors.onErrorContainer}
            />
            <Text style={styles.offlineText}>{he.home.offlineBanner}</Text>
          </View>
        ) : null}

        {!unit ? (
          <View style={styles.notFoundCard}>
            <Ionicons name="warning-outline" size={32} color={theme.colors.primary} />
            <Text style={styles.notFoundTitle}>{he.unit.notFoundTitle}</Text>
            <Text style={styles.notFoundDescription}>{he.unit.notFoundDescription}</Text>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>{he.unit.backToStoreMap}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <View style={styles.summaryBlock}>
                <Text style={styles.summaryLabel}>{he.unit.bookCountLabel}</Text>
                <Text style={styles.summaryValue}>
                  {filtersActive ? `${matchedBookCount} / ${totalBooks}` : totalBooks}
                </Text>
              </View>
              {unit.is_display_unit ? (
                <View style={styles.displayBadge}>
                  <Ionicons
                    name="star-outline"
                    size={14}
                    color={theme.colors.onSecondaryFixed}
                  />
                  <Text style={styles.displayBadgeText}>תצוגה</Text>
                </View>
              ) : null}
            </View>

            {unit.has_sides ? (
              <View style={styles.sideToggleWrap}>
                <SideToggle
                  options={sideOptions}
                  activeId={effectiveSideId ?? ""}
                  onChange={setActiveSideId}
                />
              </View>
            ) : null}

            <UnitFilterBar
              filters={filters}
              suppliers={suppliers}
              onChange={setFilters}
            />

            {shelves.length === 0 ? (
              <View style={styles.emptyShelvesCard}>
                <Ionicons name="cube-outline" size={28} color={theme.colors.onSurfaceVariant} />
                <Text style={styles.emptyShelvesText}>{he.unit.emptyShelves}</Text>
              </View>
            ) : matchedBookCount === 0 && filtersActive ? (
              <View style={styles.emptyShelvesCard}>
                <Ionicons name="filter-outline" size={28} color={theme.colors.primary} />
                <Text style={styles.emptyShelvesText}>{he.unit.filterNoMatch}</Text>
              </View>
            ) : unit.store_position === "display" ? (
              <View style={styles.shelvesCol}>
                <DisplayGrid
                  aggregates={displayAggregatesFiltered}
                  shortagedIds={optimisticShortage}
                  onBookPress={(agg) => setSaleFor(agg)}
                  onBookLongPress={(agg) => setDetailsFor(agg.representative)}
                />
              </View>
            ) : (
              <View style={styles.shelvesCol}>
                {shelves.map((shelf) => (
                  <ShelfRow
                    key={shelf.id}
                    shelf={shelf}
                    cellBooks={filteredCellBooks}
                    shortagedIds={optimisticShortage}
                    onBookPress={(b) => setConfirmFor(b)}
                    onBookLongPress={(b) => setDetailsFor(b)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirmFor !== null}
        title={he.unit.confirmShortageTitle}
        message={
          confirmFor
            ? he.unit.confirmShortageMessage.replace("{{title}}", confirmFor.title)
            : ""
        }
        confirmLabel={he.unit.actions.addToShortage}
        destructive
        onCancel={() => setConfirmFor(null)}
        onConfirm={() => void onConfirmShortage()}
      />

      <BookDetailModal
        storeMapBook={detailsFor}
        visible={detailsFor !== null}
        onClose={() => setDetailsFor(null)}
        displayOnDisplayTotal={
          unit?.store_position === "display" && detailsFor
            ? displayAggregatesAll.find((a) => a.book_id === detailsFor.book_id)?.totalQuantity ??
              null
            : null
        }
        onRecordDisplaySale={
          unit?.store_position === "display"
            ? () => {
                const id = detailsFor?.book_id;
                const agg = id ? displayAggregatesAll.find((a) => a.book_id === id) ?? null : null;
                setDetailsFor(null);
                if (agg) setSaleFor(agg);
              }
            : undefined
        }
        onAddShortage={
          detailsFor
            ? () => {
                const target = detailsFor;
                setDetailsFor(null);
                setConfirmFor(target);
              }
            : undefined
        }
        onMove={
          detailsFor
            ? () => {
                const agg = displayAggregatesAll.find((a) => a.book_id === detailsFor.book_id);
                const target = agg?.spots[0] ?? detailsFor;
                setDetailsFor(null);
                setMoveFor(target);
              }
            : undefined
        }
        busy={addShortage.isPending}
      />

      <DisplaySaleModal
        visible={saleFor !== null}
        aggregate={saleFor}
        onClose={() => setSaleFor(null)}
        onDone={() => void storeMapQuery.refetch()}
      />

      <MoveBookModal
        key={moveFor?.location_id ?? "move-none"}
        visible={moveFor !== null}
        book={moveFor}
        storeMap={effectiveMap}
        submitting={moveBook.isPending}
        errorMessage={moveError}
        onClose={closeMove}
        onSubmit={onSubmitMove}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  offlineBanner: {
    marginHorizontal: theme.spacing.marginMobile,
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
    textAlign: "right",
    writingDirection: "rtl",
  },
  summaryRow: {
    paddingHorizontal: theme.spacing.marginMobile,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryBlock: { gap: 2 },
  summaryLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "right",
    writingDirection: "rtl",
  },
  summaryValue: {
    ...theme.typography.headlineMd,
    color: theme.colors.primary,
    textAlign: "right",
    writingDirection: "rtl",
  },
  displayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.secondaryFixed,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  displayBadgeText: {
    ...theme.typography.labelMd,
    color: theme.colors.onSecondaryFixed,
    fontSize: 11,
  },
  sideToggleWrap: { paddingHorizontal: theme.spacing.marginMobile },
  shelvesCol: {
    paddingHorizontal: theme.spacing.marginMobile,
    gap: theme.spacing.lg,
  },
  emptyShelvesCard: {
    marginHorizontal: theme.spacing.marginMobile,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLowest,
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  emptyShelvesText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    writingDirection: "rtl",
  },
  notFoundCard: {
    marginHorizontal: theme.spacing.marginMobile,
    padding: theme.spacing.xl,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    gap: theme.spacing.md,
    alignItems: "center",
    ...theme.shadow.floating,
  },
  notFoundTitle: {
    ...theme.typography.headlineMd,
    color: theme.colors.primary,
    textAlign: "center",
    writingDirection: "rtl",
  },
  notFoundDescription: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    writingDirection: "rtl",
    lineHeight: 22,
  },
  backBtn: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.primaryContainer,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  backBtnText: {
    color: theme.colors.onPrimary,
    fontWeight: "700",
    fontSize: theme.typography.bodyLg.fontSize,
    fontFamily: theme.fontFamily.bold,
  },
});
