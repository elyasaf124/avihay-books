import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { isFlatSurfacePosition, type StoreMapBook, type StoreMapShelf } from "@avihay-books/shared";
import { theme } from "../../../src/theme";
import { he } from "../../../src/i18n/he";
import { useStoreMap, useStoreMapUnit } from "../../../src/api/storeMap";
import {
  useAddShortage,
  useMoveBook,
  useSuppliersWithFallback,
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
import {
  isUnitFilterActive,
  compileUnitFilter,
  compileBookTitleSearch,
  collectTopicsFromUnit,
} from "../../../src/utils/unitFilters";
import {
  aggregateDisplayBooksFromShelves,
  expandStacksFromShelves,
  type DisplayBookAggregate,
  type StacksSetItem,
} from "../../../src/utils/displayBookAggregate";
import { markUnitOpenFor } from "../../../src/utils/unitOpenTiming";
import { resetSpineCounters, spineCounters } from "../../../src/utils/spineRenderCounter";
import { startBookTapTiming } from "../../../src/utils/bookTapTiming";
import { startJsBlockHeartbeat } from "../../../src/utils/renderPhaseProbe";

function isLocationShortaged(book: StoreMapBook, shortagedIds: Set<string>): boolean {
  return shortagedIds.has(book.location_id) || Boolean(book.is_pending_shortage);
}

/** זהות יציבה — מונע רינדור מחדש של ה־`FlatList` כשאין מדפים להציג. */
const NO_SHELVES: StoreMapShelf[] = [];
/** זהויות יציבות ליחידות שאינן תצוגה/ערימות, כדי שלא לחשב צבירות מיותרות. */
const NO_AGGREGATES: DisplayBookAggregate[] = [];
const NO_STACKS_SETS: StacksSetItem[] = [];

function shelfKeyExtractor(shelf: StoreMapShelf): string {
  return shelf.id;
}

function ShelfSeparator(): JSX.Element {
  return <View style={styles.shelfSeparator} />;
}

function resolveParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].length > 0) {
    return value[0];
  }
  return null;
}

export default function UnitScreen(): JSX.Element {
  const router = useRouter();
  const { unitId } = useLocalSearchParams<{ unitId: string | string[] }>();
  const unitIdStr = resolveParam(unitId);

  const unitQuery = useStoreMapUnit(unitIdStr);
  const isOffline = unitQuery.isError;
  const isLoadingUnit =
    !!unitIdStr && (unitQuery.isPending || (unitQuery.isFetching && unitQuery.data == null));
  const mockUnit = useMemo(
    () => mockStoreMap.units.find((u) => u.id === unitIdStr) ?? null,
    [unitIdStr],
  );
  const unit =
    unitQuery.data != null && !unitQuery.isError
      ? unitQuery.data
      : isOffline
        ? mockUnit
        : null;

  const suppliers = useSuppliersWithFallback();
  const { filters, setFilters } = useStoreMapFilters();

  const [activeSideId, setActiveSideId] = useState<string | null>(null);
  const [bookTitleSearch, setBookTitleSearch] = useState("");

  const [detailsFor, setDetailsFor] = useState<StoreMapBook | null>(null);
  const [moveFor, setMoveFor] = useState<StoreMapBook | null>(null);
  const placementMapQuery = useStoreMap({ enabled: moveFor != null });
  const effectiveMap =
    placementMapQuery.data != null && !placementMapQuery.isError
      ? placementMapQuery.data
      : placementMapQuery.isError
        ? mockStoreMap
        : null;
  const [saleFor, setSaleFor] = useState<DisplayBookAggregate | null>(null);
  const [undoShortageTargets, setUndoShortageTargets] = useState<StoreMapBook[]>([]);

  /** מיקומים (`location_id`) שסומנו אופטימית כחוסר — פר־עותק, לא לפי `book_id`. */
  const [optimisticShortage, setOptimisticShortage] = useState<Set<string>>(new Set());
  const pendingUndoLocationsRef = useRef<Set<string>>(new Set());
  const openTimingReadyLoggedRef = useRef(false);
  const openTimingPaintLoggedRef = useRef(false);

  const [moveError, setMoveError] = useState<string | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  useEffect(() => {
    startJsBlockHeartbeat();
    openTimingReadyLoggedRef.current = false;
    openTimingPaintLoggedRef.current = false;
    resetSpineCounters();
    markUnitOpenFor(unitIdStr, "unit_screen_mount", {
      hasCachedData: unitQuery.data != null,
      isPending: unitQuery.isPending,
      isFetching: unitQuery.isFetching,
    });
    // רק במעבר בין יחידות / mount ראשוני
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timing probe on unitId change
  }, [unitIdStr]);

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

  const filtersActive =
    isUnitFilterActive(filters) || bookTitleSearch.trim().length > 0;

  /**
   * הפרדיקט נבנה פעם אחת לכל שינוי סינון, ולא מחדש עבור כל ספר: ארון גדול מגיע
   * ל־500+ ספרים, ונרמול המצב + `normalize`/`toLocaleLowerCase` של השאילתה בכל
   * קריאה היו הופכים סינון פשוט לעבודה של שנייה וחצי.
   */
  const passesFilter = useMemo(() => {
    const passesUnit = compileUnitFilter(filters);
    const passesTitle = compileBookTitleSearch(bookTitleSearch);
    return (b: StoreMapBook) => passesUnit(b) && passesTitle(b);
  }, [filters, bookTitleSearch]);

  const allCellBooksMap = useMemo(() => {
    const map = new Map<string, StoreMapBook[]>();
    for (const shelf of shelves) {
      for (const cell of shelf.cells) {
        map.set(cell.id, cell.books);
      }
    }
    return map;
  }, [shelves]);

  /**
   * ספרים פר־תא לאחר סינון; שומר על מבנה גם כשהתוצאה ריקה.
   * בלי סינון פעיל זו בדיוק אותה מפה — מחזירים אותה זהות כדי לא לשכפל
   * מאות מערכים בכל רינדור, ולא לשבור את ה־`memo` של התאים.
   */
  const filteredCellBooks = useMemo(() => {
    if (!filtersActive) return allCellBooksMap;
    const map = new Map<string, StoreMapBook[]>();
    for (const shelf of shelves) {
      for (const cell of shelf.cells) {
        map.set(cell.id, cell.books.filter(passesFilter));
      }
    }
    return map;
  }, [filtersActive, allCellBooksMap, shelves, passesFilter]);

  const isStacksUnit = unit?.store_position === "stacks";
  const isDisplayUnit = unit?.store_position === "display";
  const isFlatSurface = unit != null && isFlatSurfacePosition(unit.store_position);

  /**
   * הצבירות של תצוגה/ערימות מחושבות רק ליחידות שמציגות אותן. בארון מדפים רגיל
   * הן נזרקו לפח, אבל המיון העברי שבתוכן לקח ~10 שניות לכל אחת מארבע —
   * זה היה עיקר ההמתנה במסך הארון.
   */
  const displayAggregatesAll = useMemo(
    () =>
      isDisplayUnit ? aggregateDisplayBooksFromShelves(shelves, allCellBooksMap) : NO_AGGREGATES,
    [isDisplayUnit, shelves, allCellBooksMap],
  );
  /** בלי סינון פעיל הצבירה זהה לזו של כל הספרים — אין טעם למיין שוב. */
  const displayAggregatesFiltered = useMemo(
    () =>
      !isDisplayUnit
        ? NO_AGGREGATES
        : !filtersActive
          ? displayAggregatesAll
          : aggregateDisplayBooksFromShelves(shelves, filteredCellBooks),
    [isDisplayUnit, filtersActive, displayAggregatesAll, shelves, filteredCellBooks],
  );

  const stacksSetsAll = useMemo(
    () =>
      isStacksUnit
        ? expandStacksFromShelves(shelves, allCellBooksMap, optimisticShortage)
        : NO_STACKS_SETS,
    [isStacksUnit, shelves, allCellBooksMap, optimisticShortage],
  );
  const stacksSetsFiltered = useMemo(
    () =>
      !isStacksUnit
        ? NO_STACKS_SETS
        : !filtersActive
          ? stacksSetsAll
          : expandStacksFromShelves(shelves, filteredCellBooks, optimisticShortage),
    [isStacksUnit, filtersActive, stacksSetsAll, shelves, filteredCellBooks, optimisticShortage],
  );

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

  useEffect(() => {
    if (!unitIdStr || isLoadingUnit || !unit || openTimingReadyLoggedRef.current) return;
    openTimingReadyLoggedRef.current = true;
    const sampleTitles: string[] = [];
    for (const shelf of shelves) {
      for (const cell of shelf.cells) {
        for (const book of cell.books) {
          if (sampleTitles.length >= 3) break;
          if (book.title) sampleTitles.push(book.title);
        }
        if (sampleTitles.length >= 3) break;
      }
      if (sampleTitles.length >= 3) break;
    }
    markUnitOpenFor(unitIdStr, "unit_data_ready", {
      name: unit.name,
      shelves: shelves.length,
      books: totalBooks,
      fromCache: !unitQuery.isFetching,
      sampleTitles: sampleTitles.join(" | "),
    });

    const handle = InteractionManager.runAfterInteractions(() => {
      if (openTimingPaintLoggedRef.current) return;
      openTimingPaintLoggedRef.current = true;
      markUnitOpenFor(unitIdStr, "ui_painted_ready", {
        shelves: shelves.length,
        books: totalBooks,
        ...spineCounters(),
      });
    });
    return () => handle.cancel();
  }, [
    unitIdStr,
    isLoadingUnit,
    unit,
    shelves,
    totalBooks,
    unitQuery.isFetching,
  ]);

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
      const timer = startBookTapTiming("undo_shortage", targets[0]!.location_id);
      setUndoShortageTargets([]);

      for (const book of targets) {
        pendingUndoLocationsRef.current.add(book.location_id);
        removeOptimisticShortage(book.location_id);
      }
      timer.mark("optimistic_state_cleared", { targets: targets.length });

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
          void unitQuery.refetch();
          return;
        }
      }

      timer.mark("server_ack", { deleted: deletedCount });

      if (deletedCount === 0) {
        const awaitingAdd = targets.some((b) =>
          pendingUndoLocationsRef.current.has(b.location_id),
        );
        if (!awaitingAdd) {
          Alert.alert(he.generic.errorTitle, he.unit.undoShortageNotFound);
          void unitQuery.refetch();
        }
      }
    },
    [cancelShelfShortage, removeOptimisticShortage, clearShortageVisual, unitQuery],
  );

  const addBookToShortage = useCallback(
    async (book: StoreMapBook) => {
      const timer = startBookTapTiming("mark_shortage", book.location_id);
      if (isLocationShortaged(book, optimisticShortage)) {
        setUndoShortageTargets([book]);
        timer.mark("opened_undo_dialog");
        return;
      }
      setOptimisticShortage((prev) => new Set(prev).add(book.location_id));
      timer.mark("optimistic_state_set");
      try {
        await addShortage.mutateAsync({
          bookId: book.book_id,
          soldQuantity: 1,
          locationId: book.location_id,
        });
        timer.mark("server_ack");
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
        timer.mark("failed");
      }
    },
    [optimisticShortage, addShortage, cancelShelfShortage, clearShortageVisual],
  );

  /**
   * ארון גדול מרנדר מאות שדרות, ולכן הפרופס שיורדים אליהן חייבים להיות יציבים —
   * אחרת `React.memo` של `CellCard`/`BookSpine` לא חוסם כלום. `addBookToShortage`
   * מקבל זהות חדשה בכל לחיצה (הוא תלוי ב־`optimisticShortage`), ולכן קוראים לו
   * דרך ref במקום להעביר אותו ישירות.
   */
  const bookActionsRef = useRef({ press: addBookToShortage });
  useEffect(() => {
    bookActionsRef.current.press = addBookToShortage;
  }, [addBookToShortage]);

  const onBookPress = useCallback((book: StoreMapBook) => {
    void bookActionsRef.current.press(book);
  }, []);

  const onBookLongPress = useCallback((book: StoreMapBook) => {
    setDetailsFor(book);
  }, []);

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

  const renderShelf = useCallback(
    ({ item }: ListRenderItemInfo<StoreMapShelf>) => (
      <View style={styles.shelfItem}>
        <ShelfRow
          shelf={item}
          cellBooks={filteredCellBooks}
          shortagedIds={optimisticShortage}
          onBookPress={onBookPress}
          onBookLongPress={onBookLongPress}
        />
      </View>
    ),
    [filteredCellBooks, optimisticShortage, onBookPress, onBookLongPress],
  );

  /**
   * גוף שאינו רשימת מדפים: מצבי ריק, או משטח שטוח (תצוגה/סטים).
   * `null` פירושו שהמדפים מרונדרים כפריטי ה־`FlatList` (עם וירטואליזציה).
   * סדר התנאים זהה למקור — מצבי ריק לפני בדיקת משטח שטוח.
   */
  const unitBody =
    !unit || isLoadingUnit ? null : shelves.length === 0 ? (
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
    ) : null;

  const showShelfList = unit != null && !isLoadingUnit && unitBody === null;

  const listHeader = (
    <View style={styles.headerCol}>
      {isOffline ? (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.onErrorContainer} />
          <Text style={styles.offlineText}>{he.home.offlineBanner}</Text>
        </View>
      ) : null}

      {isLoadingUnit ? (
        <View style={styles.notFoundCard}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.notFoundDescription}>{he.unit.loadingMap}</Text>
        </View>
      ) : !unit ? (
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

          {unitBody}
        </>
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: unit?.name ?? (isLoadingUnit ? he.unit.loadingMap : he.unit.notFoundTitle),
          headerBackTitle: he.unit.backToStoreMap,
        }}
      />

      {/*
        המדפים מרונדרים כפריטי `FlatList` ולא ב־`shelves.map` בתוך `ScrollView`:
        ארון גדול מגיע ל־625 שדרות, וללא וירטואליזציה כולן נטענות בצביעה אחת.
        `removeClippedSubviews` נשאר כבוי בכוונה — הוא גורם לתאים ריקים ב־Android
        כשיש רשימות אופקיות מקוננות, וה־windowing לבד נותן את עיקר השיפור.
      */}
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={showShelfList ? shelves : NO_SHELVES}
        keyExtractor={shelfKeyExtractor}
        renderItem={renderShelf}
        ItemSeparatorComponent={ShelfSeparator}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={showShelfList ? styles.headerSpacing : undefined}
        extraData={optimisticShortage}
        initialNumToRender={2}
        maxToRenderPerBatch={1}
        windowSize={3}
        updateCellsBatchingPeriod={50}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={() => {
              setManualRefreshing(true);
              void unitQuery.refetch().finally(() => setManualRefreshing(false));
            }}
            tintColor={theme.colors.primary}
          />
        }
      />

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
        onDone={() => void unitQuery.refetch()}
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
  },
  /** מחזיק את המרווחים שהיו ב־`gap` של ה־`ScrollView` לפני המעבר ל־`FlatList`. */
  headerCol: {
    gap: theme.spacing.md,
  },
  headerSpacing: {
    marginBottom: theme.spacing.md,
  },
  shelfItem: {
    paddingHorizontal: theme.spacing.marginMobile,
  },
  shelfSeparator: {
    height: theme.spacing.lg,
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
