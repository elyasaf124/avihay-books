import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { isFlatSurfacePosition, type StoreMapBook, type StoreMapShelf } from "@avihay-books/shared";
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
import { useCancelShelfShortage } from "../../../src/api/shortage";
import { ConfirmDialog } from "../../../src/components/ConfirmDialog";
import { BookDetailModal } from "../../../src/components/BookDetailModal";
import { SearchBar } from "../../../src/components/SearchBar";
import { SideToggle } from "../../../src/components/unit/SideToggle";
import { DisplayGrid } from "../../../src/components/unit/DisplayGrid";
import { DisplaySaleModal } from "../../../src/components/unit/DisplaySaleModal";
import { ShelfRow } from "../../../src/components/unit/ShelfRow";
import { UnitFilterBar } from "../../../src/components/unit/UnitFilterBar";
import { MoveBookModal } from "../../../src/components/unit/MoveBookModal";
import { useStoreMapFilters } from "../../../src/context/StoreMapFilterContext";
import { isUnitFilterActive, passesUnitFilter, passesBookTitleSearch, collectTopicsFromUnit } from "../../../src/utils/unitFilters";
import {
  aggregateDisplayBooksFromShelves,
  expandStacksFromShelves,
  type DisplayBookAggregate,
} from "../../../src/utils/displayBookAggregate";

function isLocationShortaged(book: StoreMapBook, shortagedIds: Set<string>): boolean {
  return shortagedIds.has(book.location_id) || Boolean(book.is_pending_shortage);
}

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
  const { filters, setFilters } = useStoreMapFilters();

  const [activeSideId, setActiveSideId] = useState<string | null>(null);
  const [bookTitleSearch, setBookTitleSearch] = useState("");

  const [detailsFor, setDetailsFor] = useState<StoreMapBook | null>(null);
  const [moveFor, setMoveFor] = useState<StoreMapBook | null>(null);
  const [saleFor, setSaleFor] = useState<DisplayBookAggregate | null>(null);
  const [undoShortageTargets, setUndoShortageTargets] = useState<StoreMapBook[]>([]);

  /** מיקומים (`location_id`) שסומנו אופטימית כחוסר — פר־עותק, לא לפי `book_id`. */
  const [optimisticShortage, setOptimisticShortage] = useState<Set<string>>(new Set());
  const pendingUndoLocationsRef = useRef<Set<string>>(new Set());

  const [moveError, setMoveError] = useState<string | null>(null);

  const addShortage = useAddShortage();
  const cancelShelfShortage = useCancelShelfShortage();
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

  const unitTopics = useMemo(() => (unit ? collectTopicsFromUnit(unit) : []), [unit]);

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
    (b: StoreMapBook) =>
      passesUnitFilter(b, filters) && passesBookTitleSearch(b, bookTitleSearch),
    [filters, bookTitleSearch],
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

  const stacksSetsAll = useMemo(
    () => expandStacksFromShelves(shelves, allCellBooksMap),
    [shelves, allCellBooksMap],
  );
  const stacksSetsFiltered = useMemo(
    () => expandStacksFromShelves(shelves, filteredCellBooks),
    [shelves, filteredCellBooks],
  );

  const isStacksUnit = unit?.store_position === "stacks";
  const isDisplayUnit = unit?.store_position === "display";
  const isFlatSurface = unit != null && isFlatSurfacePosition(unit.store_position);

  const totalBooks = useMemo(() => {
    if (isStacksUnit) {
      return stacksSetsAll.length;
    }
    if (isDisplayUnit) {
      return displayAggregatesAll.length;
    }
    let count = 0;
    for (const shelf of shelves) for (const cell of shelf.cells) count += cell.books.length;
    return count;
  }, [isStacksUnit, isDisplayUnit, stacksSetsAll, displayAggregatesAll, shelves]);

  const matchedBookCount = useMemo(() => {
    if (isStacksUnit) {
      return stacksSetsFiltered.length;
    }
    if (isDisplayUnit) {
      return displayAggregatesFiltered.length;
    }
    let n = 0;
    for (const arr of filteredCellBooks.values()) n += arr.length;
    return n;
  }, [isStacksUnit, isDisplayUnit, stacksSetsFiltered, displayAggregatesFiltered, filteredCellBooks]);

  const filtersActive =
    isUnitFilterActive(filters) || bookTitleSearch.trim().length > 0;

  const removeOptimisticShortage = useCallback((locationId: string) => {
    setOptimisticShortage((prev) => {
      if (!prev.has(locationId)) return prev;
      const next = new Set(prev);
      next.delete(locationId);
      return next;
    });
  }, []);

  const clearShortageVisual = useCallback(
    (locationId: string) => {
      removeOptimisticShortage(locationId);
      pendingUndoLocationsRef.current.delete(locationId);
    },
    [removeOptimisticShortage],
  );

  const runUndoShortage = useCallback(
    async (targets: StoreMapBook[]) => {
      if (targets.length === 0) return;
      setUndoShortageTargets([]);

      for (const book of targets) {
        pendingUndoLocationsRef.current.add(book.location_id);
        removeOptimisticShortage(book.location_id);
      }

      let deletedCount = 0;
      for (const book of targets) {
        try {
          await cancelShelfShortage.mutateAsync(book.location_id);
          clearShortageVisual(book.location_id);
          deletedCount += 1;
        } catch (err: unknown) {
          const status =
            typeof err === "object" && err !== null && "response" in err
              ? (err as { response?: { status?: number } }).response?.status
              : undefined;
          if (status === 404 && pendingUndoLocationsRef.current.has(book.location_id)) {
            continue;
          }
          const message =
            status === 404
              ? he.unit.undoShortageNotFound
              : status === undefined
                ? he.unit.undoShortageOffline
                : he.unit.undoShortageFailed;
          Alert.alert(he.generic.errorTitle, message);
          void storeMapQuery.refetch();
          return;
        }
      }

      if (deletedCount === 0) {
        const awaitingAdd = targets.some((b) =>
          pendingUndoLocationsRef.current.has(b.location_id),
        );
        if (!awaitingAdd) {
          Alert.alert(he.generic.errorTitle, he.unit.undoShortageNotFound);
          void storeMapQuery.refetch();
        }
      }
    },
    [cancelShelfShortage, removeOptimisticShortage, clearShortageVisual, storeMapQuery],
  );

  const addBookToShortage = useCallback(
    async (book: StoreMapBook) => {
      if (isLocationShortaged(book, optimisticShortage)) {
        setUndoShortageTargets([book]);
        return;
      }
      setOptimisticShortage((prev) => new Set(prev).add(book.location_id));
      try {
        await addShortage.mutateAsync({
          bookId: book.book_id,
          soldQuantity: 1,
          locationId: book.location_id,
        });
        if (pendingUndoLocationsRef.current.has(book.location_id)) {
          try {
            await cancelShelfShortage.mutateAsync(book.location_id);
          } catch {
            Alert.alert(he.generic.errorTitle, he.unit.undoShortageFailed);
          }
          clearShortageVisual(book.location_id);
        }
      } catch {
        clearShortageVisual(book.location_id);
      }
    },
    [optimisticShortage, addShortage, cancelShelfShortage, clearShortageVisual],
  );

  const onDisplayBookPress = useCallback(
    (agg: DisplayBookAggregate) => {
      const shortedSpots = agg.spots.filter((s) => isLocationShortaged(s, optimisticShortage));
      if (shortedSpots.length > 0) {
        setUndoShortageTargets(shortedSpots);
        return;
      }
      setSaleFor(agg);
    },
    [optimisticShortage],
  );

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
                    name={unit.store_position === "stacks" ? "layers-outline" : "star-outline"}
                    size={14}
                    color={theme.colors.onSecondaryFixed}
                  />
                  <Text style={styles.displayBadgeText}>
                    {unit.store_position === "stacks" ? he.units.stacks : he.inventory.displayShelf}
                  </Text>
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

            <View style={styles.searchWrap}>
              <SearchBar
                value={bookTitleSearch}
                onChange={setBookTitleSearch}
                placeholder={he.unit.bookTitleSearchPlaceholder}
              />
            </View>

            <UnitFilterBar
              filters={filters}
              suppliers={suppliers}
              topics={unitTopics}
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
            ) : isFlatSurface ? (
              <View style={styles.shelvesCol}>
                {isStacksUnit ? (
                  <DisplayGrid
                    variant="stacks"
                    setItems={stacksSetsFiltered}
                    shortagedIds={optimisticShortage}
                    onSetPress={(item) => void addBookToShortage(item)}
                    onSetLongPress={(item) => setDetailsFor(item)}
                  />
                ) : (
                  <DisplayGrid
                    variant="display"
                    aggregates={displayAggregatesFiltered}
                    shortagedIds={optimisticShortage}
                    onAggregatePress={onDisplayBookPress}
                    onAggregateLongPress={(agg) => setDetailsFor(agg.representative)}
                  />
                )}
              </View>
            ) : (
              <View style={styles.shelvesCol}>
                {shelves.map((shelf) => (
                  <ShelfRow
                    key={shelf.id}
                    shelf={shelf}
                    cellBooks={filteredCellBooks}
                    shortagedIds={optimisticShortage}
                    onBookPress={(b) => void addBookToShortage(b)}
                    onBookLongPress={(b) => setDetailsFor(b)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={undoShortageTargets.length > 0}
        title={he.unit.confirmUndoShortageTitle}
        message={
          undoShortageTargets[0]
            ? he.unit.confirmUndoShortageMessage.replace(
                "{{title}}",
                undoShortageTargets[0].title,
              )
            : ""
        }
        confirmLabel={he.unit.confirmUndoShortageOk}
        onCancel={() => setUndoShortageTargets([])}
        onConfirm={() => void runUndoShortage(undoShortageTargets)}
      />

      <BookDetailModal
        storeMapBook={detailsFor}
        visible={detailsFor !== null}
        onClose={() => setDetailsFor(null)}
        displayOnDisplayTotal={
          detailsFor
            ? isDisplayUnit
              ? displayAggregatesAll.find((a) => a.book_id === detailsFor.book_id)
                  ?.totalQuantity ?? null
              : isStacksUnit
                ? stacksSetsAll.filter((s) => s.book_id === detailsFor.book_id).length
                : null
            : null
        }
        onRecordDisplaySale={
          isDisplayUnit
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
                void addBookToShortage(target);
              }
            : undefined
        }
        onMove={
          detailsFor
            ? () => {
                const target = isDisplayUnit
                  ? displayAggregatesAll.find((a) => a.book_id === detailsFor.book_id)
                      ?.spots[0] ?? detailsFor
                  : detailsFor;
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
    textAlign: "left",
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
    textAlign: "left",
  },
  summaryValue: {
    ...theme.typography.headlineMd,
    color: theme.colors.primary,
    textAlign: "left",
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
  searchWrap: { paddingHorizontal: theme.spacing.marginMobile },
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
  },
  notFoundDescription: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
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
