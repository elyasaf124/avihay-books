import { Ionicons } from "@expo/vector-icons";
import type { BookLocation, BookWithLocations, StoreMapBook, Supplier } from "@avihay-books/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import {
  useCreateBook,
  useCreateBookLocation,
  useInventoryBooksBySupplier,
  usePatchBook,
  usePatchBookLocation,
} from "../../src/api/inventory";
import { api } from "../../src/api/client";
import { useStoreMap } from "../../src/api/storeMap";
import { useMoveBook, useSuppliersWithFallback } from "../../src/api/unit";
import {
  SearchablePickerField,
  suppliersToPickerItems,
} from "../../src/components/pickers/SearchablePicker";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import {
  MoveBookModal,
  type MapPlacementSubmitTarget,
} from "../../src/components/unit/MoveBookModal";
import { PerCopyPlacementModal } from "../../src/components/unit/PerCopyPlacementModal";
import { he } from "../../src/i18n/he";
import { findFirstDisplayCellId, findStoreMapCellById, resolvePositionForPlacement } from "../../src/utils/storeMapCells";
import { theme } from "../../src/theme";

/** ייחוס יציב למקרה של `data === undefined` — אסור להשתמש ב־`[]` inlined (מתחלף כל רינדר). */
const NO_BOOKS: BookWithLocations[] = [];

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => {
    return s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }, template);
}

function unplacedQuantity(book: BookWithLocations): number {
  const onShelf = book.locations.reduce((s, l) => s + l.quantity_in_cell, 0);
  return Math.max(0, book.stock_quantity - onShelf);
}

function toStoreMapBook(
  book: BookWithLocations,
  loc: BookWithLocations["locations"][number],
  supplierColor: string,
): StoreMapBook {
  return {
    location_id: loc.id,
    book_id: book.id,
    title: book.title,
    author: book.author,
    supplier_id: book.supplier_id,
    supplier_color: supplierColor,
    position_in_cell: loc.position_in_cell,
    quantity_in_cell: loc.quantity_in_cell,
    is_new: book.is_new,
    price: String(book.price),
    is_pending_shortage: false,
  };
}

/** פירוק למשבצות שורות להעברה — תא אחד או כל המלאי */
function expandInventoryMoveSlots(
  book: BookWithLocations,
  locId: string | null,
): { loc: BookWithLocations["locations"][number]; copyIndex: number }[] {
  const locs = locId === null ? book.locations : book.locations.filter((l) => l.id === locId);
  const out: { loc: BookWithLocations["locations"][number]; copyIndex: number }[] = [];
  for (const loc of locs) {
    for (let i = 0; i < loc.quantity_in_cell; i++) {
      out.push({ loc, copyIndex: i });
    }
  }
  return out;
}

export default function AddRemoveScreen(): JSX.Element {
  const suppliers = useSuppliersWithFallback();
  const supplierPickerItems = useMemo(() => suppliersToPickerItems(suppliers), [suppliers]);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [newBookOpen, setNewBookOpen] = useState(false);
  /** מזהה מיקום לעדכון משולב, או `null` לעדכון מלאי כולל בלבד. */
  const [locationByBook, setLocationByBook] = useState<Record<string, string | null>>({});
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});

  const booksQuery = useInventoryBooksBySupplier(supplierId);
  const storeMapQuery = useStoreMap();
  const patchBook = usePatchBook();
  const patchLoc = usePatchBookLocation();
  const createBook = useCreateBook();
  const createBookLocation = useCreateBookLocation();
  const moveBook = useMoveBook();
  const booksData = booksQuery.data;
  const books = booksData ?? NO_BOOKS;
  const isOffline = booksQuery.isError;
  /** מפת ארונות מהשרת — משתמשים ב־`data` שנשמר בקאש גם אם `refetch` אחרון נכשל (בלי לנעול לפי `isError`). */
  const placementStoreMap = storeMapQuery.data ?? null;

  const mapPlacementGuardMessage =
    placementStoreMap != null
      ? null
      : storeMapQuery.isPending
        ? he.addRemove.mapPlacementWaiting
        : storeMapQuery.isError
          ? he.addRemove.mapPlacementServerError
          : he.addRemove.mapPlacementWaiting;
  /** סנכרון בחירת מיקום / טיוטת מחיר לרשימת הספרים — בלי להחזיק `[]` או `{}` מתחדשים שגורמים ללופ. */
  useEffect(() => {
    if (!supplierId) {
      setLocationByBook((p) => (Object.keys(p).length ? {} : p));
      setPriceDraft((p) => (Object.keys(p).length ? {} : p));
      return;
    }
    /** בעת טעינה אין להחזיק `booksQuery.data`; אחרת כל פריים מאלץ את `setState`. */
    if (booksData === undefined) return;

    if (booksData.length === 0) {
      setLocationByBook((p) => (Object.keys(p).length === 0 ? p : {}));
      setPriceDraft((p) => (Object.keys(p).length === 0 ? p : {}));
      return;
    }

    const validIds = new Set(booksData.map((b) => b.id));
    setLocationByBook((prev) => {
      let changed = false;
      const next: Record<string, string | null> = {};
      for (const id of validIds) {
        const pb = prev[id];
        next[id] =
          pb === undefined
            ? (booksData.find((b) => b.id === id)?.locations[0]?.id ?? null)
            : pb;
        if (!(id in prev) || prev[id] !== next[id]) changed = true;
      }
      for (const k of Object.keys(prev)) {
        if (!validIds.has(k)) changed = true;
      }
      return changed ? next : prev;
    });
    setPriceDraft((prev) => {
      let changed = false;
      const merged: Record<string, string> = {};
      for (const b of booksData) {
        merged[b.id] = prev[b.id] ?? String(b.price);
        if (!(b.id in prev)) changed = true;
      }
      for (const k of Object.keys(prev)) {
        if (!validIds.has(k)) changed = true;
      }
      return changed ? merged : prev;
    });
  }, [supplierId, booksData]);

  const refreshing = booksQuery.isFetching && !booksQuery.isLoading;

  const onRefresh = useCallback(() => {
    void booksQuery.refetch();
    void storeMapQuery.refetch();
  }, [booksQuery, storeMapQuery]);

  const [busyBookId, setBusyBookId] = useState<string | null>(null);
  const [deactivateBook, setDeactivateBook] = useState<BookWithLocations | null>(null);

  /** הקשר למודאל פר־עותק בספר חדש (נסגר לאחר שמירת הבחירה) */
  const [newBookPcCtx, setNewBookPcCtx] = useState<{
    title: string;
    author: string;
    supplier_color?: string;
    stockQty: number;
    is_new: boolean;
  } | null>(null);
  /** תוצאת המודאל פר־עותק עד יצירת הספר בשרת */
  const [newBookPerCopyResult, setNewBookPerCopyResult] = useState<MapPlacementSubmitTarget[] | null>(null);
  const newBookPerCopyPlacementRef = useRef<MapPlacementSubmitTarget[] | null>(null);
  useEffect(() => {
    newBookPerCopyPlacementRef.current = newBookPerCopyResult;
  }, [newBookPerCopyResult]);

  /** ספר קיים עם עותקים ללא מיקום במדף — פותחים מודאל פר־עותק לפי `unplacedQuantity` */
  const [existingPerCopyBook, setExistingPerCopyBook] = useState<BookWithLocations | null>(null);
  const [existingPerCopyModalError, setExistingPerCopyModalError] = useState<string | null>(null);

  const [moveMapBook, setMoveMapBook] = useState<StoreMapBook | null>(null);
  const [moveLockQtyOne, setMoveLockQtyOne] = useState(false);
  const [inventoryMoveBook, setInventoryMoveBook] = useState<BookWithLocations | null>(null);
  const [inventoryMoveSlots, setInventoryMoveSlots] = useState<
    { loc: BookWithLocations["locations"][number]; copyIndex: number }[]
  >([]);
  const [inventoryMoveSlotIndex, setInventoryMoveSlotIndex] = useState(0);
  /** מצב «העבר את כל העותקים בתא זה» — מדגיש את כל צ׳יפי העותקים מאותה רשומת מיקום */
  const [inventoryMoveBulkLocId, setInventoryMoveBulkLocId] = useState<string | null>(null);
  const moveSplitContextRef = useRef<{
    bookId: string;
    sourceLocation: BookWithLocations["locations"][number];
    splitOffSingle: boolean;
  } | null>(null);
  const [inventoryMapError, setInventoryMapError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void storeMapQuery.refetch();
    }, [storeMapQuery.refetch]),
  );

  useEffect(() => {
    if (placementStoreMap == null || newBookPerCopyResult == null || newBookPerCopyResult.length === 0)
      return;
    const allValid = newBookPerCopyResult.every(
      (t) => findStoreMapCellById(placementStoreMap, t.cellId) != null,
    );
    if (!allValid) {
      setNewBookPerCopyResult(null);
    }
  }, [placementStoreMap, newBookPerCopyResult]);

  useEffect(() => {
    if (mapPlacementGuardMessage != null && newBookPcCtx != null) {
      setNewBookPcCtx(null);
    }
  }, [mapPlacementGuardMessage, newBookPcCtx]);

  /** `FlatList` מטפל ב־`data` כמו `PureComponent` — חובה לסמן מצב חיצוני שמשפיע על `renderItem`. */
  const listExtraData = useMemo(
    () => ({
      dataUpdatedAt: booksQuery.dataUpdatedAt,
      busyBookId,
      priceDraft,
      locationByBook,
      createLocPending: createBookLocation.isPending,
      movePending: moveBook.isPending,
      placementReady: placementStoreMap != null,
      storeMapUpdatedAt: storeMapQuery.dataUpdatedAt,
    }),
    [
      booksQuery.dataUpdatedAt,
      busyBookId,
      priceDraft,
      locationByBook,
      createBookLocation.isPending,
      moveBook.isPending,
      placementStoreMap,
      storeMapQuery.dataUpdatedAt,
    ],
  );

  const applyStockDelta = useCallback(
    async (book: BookWithLocations, delta: number) => {
      if (busyBookId) return;
      const selId = locationByBook[book.id] ?? null;
      const selectedLoc =
        selId === null ? null : book.locations.find((loc) => loc.id === selId) ?? null;
      const newStock = Math.max(0, book.stock_quantity + delta);
      if (delta < 0 && book.stock_quantity <= 0) return;
      if (delta < 0 && selectedLoc && selectedLoc.quantity_in_cell <= 0) return;

      try {
        setBusyBookId(book.id);
        if (selectedLoc) {
          const newQty = Math.max(0, selectedLoc.quantity_in_cell + delta);
          await patchLoc.mutateAsync({
            location: {
              id: selectedLoc.id,
              book_id: book.id,
              cell_id: selectedLoc.cell_id,
              position_in_cell: selectedLoc.position_in_cell,
              quantity_in_cell: newQty,
            },
          });
        }
        await patchBook.mutateAsync({
          id: book.id,
          patch: {
            stock_quantity: newStock,
          },
        });
      } catch {
        Alert.alert(he.generic.errorTitle, he.addRemove.stockAdjustFailed);
      } finally {
        setBusyBookId(null);
      }
    },
    [busyBookId, locationByBook, patchBook, patchLoc],
  );

  const applyPrice = useCallback(
    async (book: BookWithLocations) => {
      const raw = priceDraft[book.id]?.trim() ?? "";
      const num = Number(raw.replace(",", "."));
      if (Number.isNaN(num) || num < 0) return;
      try {
        setBusyBookId(book.id);
        const updated = await patchBook.mutateAsync({ id: book.id, patch: { price: num } });
        setPriceDraft((p) => ({ ...p, [book.id]: String(updated.price) }));
      } catch {
        Alert.alert(he.generic.errorTitle, he.addRemove.priceAdjustFailed);
      } finally {
        setBusyBookId(null);
      }
    },
    [patchBook, priceDraft],
  );

  const onSubmitInventoryMoveMap = useCallback(
    async (target: MapPlacementSubmitTarget) => {
      if (!moveMapBook) return;
      setInventoryMapError(null);
      const ctx = moveSplitContextRef.current;
      try {
        if (ctx?.splitOffSingle) {
          let created: BookLocation | null = null;
          try {
            created = await createBookLocation.mutateAsync({
              book_id: ctx.bookId,
              cell_id: target.cellId,
              position_in_cell: target.positionInCell,
              quantity_in_cell: 1,
            });
            const nextQty = ctx.sourceLocation.quantity_in_cell - 1;
            if (nextQty <= 0) {
              await api.delete(`/book-locations/${ctx.sourceLocation.id}`);
            } else {
              await patchLoc.mutateAsync({
                location: {
                  ...ctx.sourceLocation,
                  quantity_in_cell: nextQty,
                },
              });
            }
          } catch (err) {
            if (created?.id) {
              try {
                await api.delete(`/book-locations/${created.id}`);
              } catch {
                /* best-effort revert */
              }
            }
            throw err;
          }
        } else {
          await moveBook.mutateAsync({
            locationId: moveMapBook.location_id,
            bookId: moveMapBook.book_id,
            cellId: target.cellId,
            positionInCell: target.positionInCell,
            quantityInCell: target.quantityInCell,
          });
        }
        moveSplitContextRef.current = null;
        setMoveLockQtyOne(false);
        setMoveMapBook(null);
        setInventoryMoveBook(null);
        setInventoryMoveSlots([]);
        setInventoryMoveSlotIndex(0);
        setInventoryMoveBulkLocId(null);
      } catch {
        setInventoryMapError(he.addRemove.mapMoveFailed);
      }
    },
    [createBookLocation, moveBook, moveMapBook, patchLoc],
  );

  const applyInventorySlotAt = useCallback(
    (
      index: number,
      slots: { loc: BookWithLocations["locations"][number]; copyIndex: number }[],
      pickBook: BookWithLocations,
    ) => {
      setInventoryMoveBulkLocId(null);
      const slot = slots[index];
      if (!slot) return;
      const col =
        suppliers.find((s) => s.id === pickBook.supplier_id)?.color_hex ??
        theme.colors.outlineVariant;
      const loc = slot.loc;
      const splitOff = loc.quantity_in_cell > 1;
      moveSplitContextRef.current = {
        bookId: pickBook.id,
        sourceLocation: loc,
        splitOffSingle: splitOff,
      };
      setMoveLockQtyOne(splitOff);
      setMoveMapBook(toStoreMapBook(pickBook, { ...loc, quantity_in_cell: 1 }, col));
      setInventoryMoveSlotIndex(index);
    },
    [suppliers],
  );

  const applyInventoryWholeRow = useCallback(
    (pickBook: BookWithLocations, loc: BookWithLocations["locations"][number]) => {
      const col =
        suppliers.find((s) => s.id === pickBook.supplier_id)?.color_hex ??
        theme.colors.outlineVariant;
      moveSplitContextRef.current = {
        bookId: pickBook.id,
        sourceLocation: loc,
        splitOffSingle: false,
      };
      setMoveLockQtyOne(false);
      setMoveMapBook(toStoreMapBook(pickBook, loc, col));
      setInventoryMoveBulkLocId(loc.id);
    },
    [suppliers],
  );

  const openInventoryMoveSession = useCallback(
    (pickBook: BookWithLocations, locId: string | null) => {
      const slots = expandInventoryMoveSlots(pickBook, locId);
      if (slots.length === 0) return;
      setInventoryMapError(null);
      setInventoryMoveBulkLocId(null);
      setInventoryMoveBook(pickBook);
      setInventoryMoveSlots(slots);
      setInventoryMoveSlotIndex(0);
      applyInventorySlotAt(0, slots, pickBook);
    },
    [applyInventorySlotAt],
  );

  const inventoryMoveContextBanner = useMemo(() => {
    if (!inventoryMoveBook || inventoryMoveSlots.length === 0) return undefined;
    const slot = inventoryMoveSlots[inventoryMoveSlotIndex];
    if (!slot) return undefined;

    const uniqueBulkLocs = new Map<string, BookWithLocations["locations"][number]>();
    for (const s of inventoryMoveSlots) {
      if (s.loc.quantity_in_cell > 1 && !uniqueBulkLocs.has(s.loc.id)) {
        uniqueBulkLocs.set(s.loc.id, s.loc);
      }
    }
    const bulkMoves =
      uniqueBulkLocs.size > 0
        ? [...uniqueBulkLocs.values()].map((loc) => ({
            id: loc.id,
            label: interpolate(he.addRemove.inventoryMoveWholeRowBulk, {
              n: String(loc.quantity_in_cell),
              cell: loc.cell_name,
            }),
            onPress: () => applyInventoryWholeRow(inventoryMoveBook, loc),
          }))
        : undefined;

    const detail = interpolate(he.addRemove.inventoryMoveCopyLine, {
      i: String(slot.copyIndex + 1),
      n: String(slot.loc.quantity_in_cell),
      cell: slot.loc.cell_name,
      pos: String(slot.loc.position_in_cell),
    });
    const currentLocationText = `${he.addRemove.moveCurrentLocationPrefix} ${detail}`;
    const activeMask =
      inventoryMoveBulkLocId !== null
        ? inventoryMoveSlots.map((s) => s.loc.id === inventoryMoveBulkLocId)
        : inventoryMoveSlots.map((_, i) => i === inventoryMoveSlotIndex);
    const slotPicker =
      inventoryMoveSlots.length > 1
        ? {
            labels: inventoryMoveSlots.map((_, i) =>
              interpolate(he.addRemove.inventoryMoveSlotChip, {
                i: String(i + 1),
                n: String(inventoryMoveSlots.length),
              }),
            ),
            activeMask,
            onSelect: (i: number) => {
              applyInventorySlotAt(i, inventoryMoveSlots, inventoryMoveBook);
            },
          }
        : undefined;
    return {
      currentLocationText,
      slotPicker,
      bulkMoves,
    };
  }, [
    inventoryMoveBook,
    inventoryMoveSlots,
    inventoryMoveSlotIndex,
    inventoryMoveBulkLocId,
    applyInventorySlotAt,
    applyInventoryWholeRow,
  ]);

  const headerButtons = (
    <View style={styles.topBar}>
      <View style={styles.supplierFieldShell}>
        <SearchablePickerField
          compact
          items={supplierPickerItems}
          valueId={supplierId}
          onChange={setSupplierId}
          emptySelectionLabel={he.addRemove.chooseSupplier}
          searchPlaceholder={he.picker.searchInList}
          emptyListMessage={he.picker.noMatches}
        />
      </View>
      <Pressable
        style={[styles.headerBtn, styles.secondaryHeaderBtn]}
        onPress={() => {
          setNewBookPerCopyResult(null);
          setNewBookPcCtx(null);
          setNewBookOpen(true);
        }}
      >
        <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.secondaryHeaderBtnText}>{he.addRemove.addNewBook}</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{he.addRemove.title}</Text>
          <Text style={styles.subtitle}>{he.addRemove.subtitle}</Text>
        </View>

        {headerButtons}

        {isOffline ? (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.onErrorContainer} />
            <Text style={styles.offlineText}>{he.addRemove.offlineBanner}</Text>
          </View>
        ) : null}

        {!supplierId ? (
          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={36} color={theme.colors.primary} />
            <Text style={styles.hintText}>{he.addRemove.pickSupplierHint}</Text>
          </View>
        ) : booksQuery.isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.loadingText}>{he.addRemove.loading}</Text>
          </View>
        ) : books.length === 0 ? (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>{he.addRemove.emptyList}</Text>
          </View>
        ) : (
          <FlatList
            data={books}
            extraData={listExtraData}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              mapPlacementGuardMessage ? (
                <View style={styles.mapGuardBanner}>
                  <Ionicons name="map-outline" size={18} color={theme.colors.onPrimaryContainer} />
                  <Text style={styles.mapGuardText}>{mapPlacementGuardMessage}</Text>
                </View>
              ) : null
            }
            contentContainerStyle={styles.listPad}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item: book }) => {
              const locId = locationByBook[book.id] ?? null;
              const selectedLoc =
                locId === null ? null : book.locations.find((loc) => loc.id === locId) ?? null;
              const minusDisabled =
                book.stock_quantity <= 0 ||
                (selectedLoc !== null && selectedLoc.quantity_in_cell <= 0);

              return (
                <View style={styles.rowCard}>
                  <View style={styles.rowMain}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bookTitle}>{book.title}</Text>
                      <Text style={styles.bookAuthor}>{book.author}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => setDeactivateBook(book)}
                      style={styles.trashHit}
                    >
                      <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                    </Pressable>
                  </View>

                  <Text style={styles.sectionLabel}>{he.addRemove.locationLabel}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                    <Pressable
                      onPress={() => setLocationByBook((prev) => ({ ...prev, [book.id]: null }))}
                      style={[
                        styles.chip,
                        locId === null && styles.chipActive,
                      ]}
                    >
                      <Text style={[styles.chipText, locId === null && styles.chipTextActive]}>
                        {he.addRemove.locationChipNone}
                      </Text>
                    </Pressable>
                    {book.locations.map((loc) => (
                      <Pressable
                        key={loc.id}
                        onPress={() =>
                          setLocationByBook((prev) => ({
                            ...prev,
                            [book.id]: loc.id,
                          }))
                        }
                        style={[styles.chip, loc.id === locId && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, loc.id === locId && styles.chipTextActive]}>
                          {interpolate(he.addRemove.locationChipCell, {
                            name: loc.cell_name,
                            qty: String(loc.quantity_in_cell),
                          })}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  <Text style={[styles.dimLabel, styles.mapHintBelowChips]}>{he.addRemove.mapPlacementHint}</Text>
                  <View style={styles.mapActionRow}>
                    {book.stock_quantity > 0 && unplacedQuantity(book) > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        style={[
                          styles.mapActionBtn,
                          (busyBookId !== null ||
                            createBookLocation.isPending ||
                            placementStoreMap == null) &&
                            styles.mapActionBtnDisabled,
                        ]}
                        disabled={
                          busyBookId !== null || createBookLocation.isPending || placementStoreMap == null
                        }
                        onPress={() => {
                          setInventoryMapError(null);
                          setExistingPerCopyModalError(null);
                          setExistingPerCopyBook(book);
                        }}
                      >
                        <Ionicons name="map-outline" size={18} color={theme.colors.primary} />
                        <Text style={styles.mapActionBtnText}>{he.addRemove.addToMap}</Text>
                      </Pressable>
                    ) : null}
                    {book.stock_quantity > 0 && book.locations.length > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        style={[
                          styles.mapActionBtn,
                          (busyBookId !== null ||
                            moveBook.isPending ||
                            createBookLocation.isPending ||
                            patchLoc.isPending ||
                            placementStoreMap == null) && styles.mapActionBtnDisabled,
                        ]}
                        disabled={
                          busyBookId !== null ||
                          moveBook.isPending ||
                          createBookLocation.isPending ||
                          patchLoc.isPending ||
                          placementStoreMap == null
                        }
                        onPress={() => {
                          openInventoryMoveSession(book, locId);
                        }}
                      >
                        <Ionicons name="shuffle-outline" size={18} color={theme.colors.primary} />
                        <Text style={styles.mapActionBtnText}>{he.addRemove.changeMapLocation}</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.stockRow}>
                    <Text style={styles.dimLabel}>{he.addRemove.tableHeaderStock}</Text>
                    <View style={styles.stepper}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={minusDisabled || busyBookId !== null}
                        onPress={() => void applyStockDelta(book, -1)}
                        style={[
                          styles.stepBtn,
                          (minusDisabled || busyBookId !== null) && styles.stepBtnDisabled,
                        ]}
                      >
                        <Ionicons name="remove" size={22} color={theme.colors.onSurface} />
                      </Pressable>
                      <Text style={styles.qty}>{book.stock_quantity}</Text>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busyBookId !== null}
                        onPress={() => void applyStockDelta(book, 1)}
                        style={[styles.stepBtn, busyBookId !== null && styles.stepBtnDisabled]}
                      >
                        <Ionicons name="add" size={22} color={theme.colors.onSurface} />
                      </Pressable>
                    </View>
                  </View>

                  <Text style={styles.dimLabel}>{he.addRemove.tableHeaderPrice}</Text>
                  <View style={styles.priceRow}>
                    <TextInput
                      value={priceDraft[book.id] ?? String(book.price)}
                      onChangeText={(t) => setPriceDraft((p) => ({ ...p, [book.id]: t }))}
                      keyboardType="decimal-pad"
                      style={styles.priceInput}
                    />
                    <Pressable style={styles.applyPriceBtn} onPress={() => void applyPrice(book)}>
                      <Text style={styles.applyPriceText}>{he.addRemove.applyPrice}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        )}
      </SafeAreaView>

      <NewBookModal
        visible={newBookOpen}
        suppliers={suppliers}
        defaultSupplierId={supplierId}
        mapPlacementBlockedMessage={mapPlacementGuardMessage}
        perCopySummaries={
          newBookPerCopyResult && newBookPerCopyResult.length > 0
            ? newBookPerCopyResult.map((r) => r.summaryLabel)
            : null
        }
        onOpenPerCopyPlacement={(ctx) => {
          setInventoryMapError(null);
          setNewBookPcCtx(ctx);
        }}
        onClearPerCopy={() => {
          newBookPerCopyPlacementRef.current = null;
          setNewBookPerCopyResult(null);
        }}
        onClose={() => {
          setNewBookOpen(false);
          newBookPerCopyPlacementRef.current = null;
          setNewBookPerCopyResult(null);
          setNewBookPcCtx(null);
        }}
        onSubmit={async (payload) => {
          const placements = newBookPerCopyPlacementRef.current;
          const displayQty = payload.display_quantity ?? 0;
          const { display_quantity: _dq, ...bookPayload } = payload;
          try {
            const created = await createBook.mutateAsync(bookPayload);
            if (placements && placements.length > 0) {
              for (const t of placements) {
                try {
                  await createBookLocation.mutateAsync({
                    book_id: String(created.id),
                    cell_id: t.cellId,
                    position_in_cell: t.positionInCell,
                    quantity_in_cell: 1,
                  });
                } catch {
                  Alert.alert(he.generic.errorTitle, he.addRemove.mapPlaceFailed);
                  setNewBookOpen(false);
                  newBookPerCopyPlacementRef.current = null;
                  setNewBookPerCopyResult(null);
                  setNewBookPcCtx(null);
                  return;
                }
              }
            } else if (bookPayload.is_new && displayQty > 0) {
              if (!placementStoreMap) {
                Alert.alert(he.generic.errorTitle, he.addRemove.displayCellMissing);
              } else {
                const cellId = findFirstDisplayCellId(placementStoreMap);
                if (!cellId) {
                  Alert.alert(he.generic.errorTitle, he.addRemove.displayCellMissing);
                } else {
                  try {
                    const cell = findStoreMapCellById(placementStoreMap, cellId);
                    const pos = resolvePositionForPlacement(cell, 1);
                    const q = Math.min(displayQty, created.stock_quantity);
                    if (q > 0) {
                      await createBookLocation.mutateAsync({
                        book_id: String(created.id),
                        cell_id: cellId,
                        position_in_cell: pos,
                        quantity_in_cell: q,
                      });
                    }
                  } catch {
                    Alert.alert(he.generic.errorTitle, he.addRemove.mapPlaceFailed);
                  }
                }
              }
            }
            setNewBookOpen(false);
            newBookPerCopyPlacementRef.current = null;
            setNewBookPerCopyResult(null);
            setNewBookPcCtx(null);
          } catch {
            /* שגיאת יצירת ספר — תוצג מתוך ה־mutation */
          }
        }}
        submitting={createBook.isPending || createBookLocation.isPending}
        errorOccurred={createBook.isError}
      />

      <PerCopyPlacementModal
        visible={newBookPcCtx !== null && newBookOpen}
        storeMap={placementStoreMap}
        slotCount={newBookPcCtx?.stockQty ?? 0}
        preview={
          newBookPcCtx
            ? {
                title: newBookPcCtx.title,
                author: newBookPcCtx.author,
                supplier_color: newBookPcCtx.supplier_color,
              }
            : { title: "", author: "" }
        }
        previewIsNew={newBookPcCtx?.is_new ?? false}
        submitting={false}
        errorMessage={null}
        onClose={() => setNewBookPcCtx(null)}
        onSubmit={(rows) => {
          const next = rows.length > 0 ? rows : null;
          newBookPerCopyPlacementRef.current = next;
          setNewBookPerCopyResult(next);
          setNewBookPcCtx(null);
        }}
      />

      <PerCopyPlacementModal
        visible={existingPerCopyBook !== null}
        storeMap={placementStoreMap}
        slotCount={existingPerCopyBook ? unplacedQuantity(existingPerCopyBook) : 0}
        preview={
          existingPerCopyBook
            ? {
                title: existingPerCopyBook.title,
                author: existingPerCopyBook.author,
                supplier_color: suppliers.find((s) => s.id === existingPerCopyBook.supplier_id)
                  ?.color_hex,
              }
            : { title: "", author: "" }
        }
        previewIsNew={existingPerCopyBook?.is_new ?? false}
        submitting={createBookLocation.isPending}
        errorMessage={existingPerCopyModalError}
        onClose={() => {
          setExistingPerCopyBook(null);
          setExistingPerCopyModalError(null);
        }}
        onSubmit={async (rows) => {
          if (!existingPerCopyBook) return;
          setExistingPerCopyModalError(null);
          if (rows.length === 0) {
            setExistingPerCopyBook(null);
            return;
          }
          for (const t of rows) {
            try {
              await createBookLocation.mutateAsync({
                book_id: existingPerCopyBook.id,
                cell_id: t.cellId,
                position_in_cell: t.positionInCell,
                quantity_in_cell: 1,
              });
            } catch {
              setExistingPerCopyModalError(he.addRemove.mapPlaceFailed);
              return;
            }
          }
          setExistingPerCopyBook(null);
        }}
      />

      <MoveBookModal
        key={`mv-${moveMapBook?.location_id ?? "x"}-${inventoryMoveSlotIndex}-${moveLockQtyOne}-${moveMapBook?.quantity_in_cell ?? 0}`}
        visible={moveMapBook !== null}
        book={moveMapBook}
        storeMap={placementStoreMap}
        submitting={
          moveBook.isPending || createBookLocation.isPending || patchLoc.isPending
        }
        lockQuantityForMove={moveLockQtyOne}
        moveContextBanner={inventoryMoveContextBanner}
        errorMessage={inventoryMapError}
        onClose={() => {
          setMoveMapBook(null);
          moveSplitContextRef.current = null;
          setMoveLockQtyOne(false);
          setInventoryMapError(null);
          setInventoryMoveBook(null);
          setInventoryMoveSlots([]);
          setInventoryMoveSlotIndex(0);
          setInventoryMoveBulkLocId(null);
        }}
        onSubmit={onSubmitInventoryMoveMap}
      />

      <ConfirmDialog
        visible={!!deactivateBook}
        title={he.addRemove.confirmDeactivateTitle}
        destructive
        message={
          deactivateBook
            ? interpolate(he.addRemove.confirmDeactivate, { title: deactivateBook.title })
            : undefined
        }
        cancelLabel={he.generic.cancel}
        confirmLabel={he.addRemove.deactivateConfirm}
        onCancel={() => setDeactivateBook(null)}
        onConfirm={() => {
          if (!deactivateBook) return;
          patchBook.mutate(
            { id: deactivateBook.id, patch: { is_active: false } },
            {
              onSuccess: () => setDeactivateBook(null),
            },
          );
        }}
      />
    </>
  );
}

interface NewBookFormState {
  title: string;
  author: string;
  supplier_id: string;
  price: string;
  stock_quantity: string;
  topic: string;
  is_new: boolean;
  display_quantity: string;
}

function NewBookModal({
  visible,
  suppliers,
  defaultSupplierId,
  mapPlacementBlockedMessage,
  perCopySummaries,
  onOpenPerCopyPlacement,
  onClearPerCopy,
  onClose,
  onSubmit,
  submitting,
  errorOccurred,
}: {
  visible: boolean;
  suppliers: Supplier[];
  defaultSupplierId: string | null;
  mapPlacementBlockedMessage: string | null;
  perCopySummaries: string[] | null;
  onOpenPerCopyPlacement: (ctx: {
    title: string;
    author: string;
    supplier_color?: string;
    stockQty: number;
    is_new: boolean;
  }) => void;
  onClearPerCopy: () => void;
  onClose: () => void;
  onSubmit: (p: {
    title: string;
    author: string;
    supplier_id: string;
    price: number;
    stock_quantity: number;
    topic: string;
    is_new: boolean;
    display_quantity?: number;
  }) => Promise<void>;
  submitting: boolean;
  errorOccurred: boolean;
}): JSX.Element {
  const fallbackSupplier = suppliers[0]?.id ?? "";
  const [form, setForm] = useState<NewBookFormState>({
    title: "",
    author: "",
    supplier_id: fallbackSupplier,
    price: "",
    stock_quantity: "0",
    topic: "",
    is_new: false,
    display_quantity: "0",
  });

  useEffect(() => {
    if (!visible) return;
    setForm({
      title: "",
      author: "",
      supplier_id: defaultSupplierId ?? fallbackSupplier,
      price: "",
      stock_quantity: "0",
      topic: "",
      is_new: false,
      display_quantity: "0",
    });
  }, [visible, defaultSupplierId, fallbackSupplier]);

  const supplierItems = suppliers;

  const openPicker = () => {
    if (mapPlacementBlockedMessage) {
      return;
    }
    const stockNum = Number.parseInt(form.stock_quantity, 10);
    const titleClean = form.title.trim();
    const authorClean = form.author.trim();
    if (
      !titleClean ||
      !authorClean ||
      !form.supplier_id ||
      Number.isNaN(stockNum) ||
      stockNum < 1
    ) {
      Alert.alert(he.generic.errorTitle, he.addRemove.mapFillBasicFirst);
      return;
    }
    const sup = suppliers.find((s) => s.id === form.supplier_id);
    onOpenPerCopyPlacement({
      title: titleClean,
      author: authorClean,
      supplier_color: sup?.color_hex,
      stockQty: stockNum,
      is_new: form.is_new,
    });
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.newBookSheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.nbScroll}>
            <Text style={styles.sheetTitle}>{he.addRemove.newBookModalTitle}</Text>
            <LabeledInput
              label={he.addRemove.fieldTitle}
              value={form.title}
              onChangeText={(title) => setForm((s) => ({ ...s, title }))}
            />
            <LabeledInput
              label={he.addRemove.fieldAuthor}
              value={form.author}
              onChangeText={(author) => setForm((s) => ({ ...s, author }))}
            />

            <Text style={styles.inputLabel}>{he.addRemove.fieldSupplier}</Text>
            <View style={styles.supMiniList}>
              {supplierItems.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => setForm((f) => ({ ...f, supplier_id: s.id }))}
                  style={[
                    styles.chip,
                    styles.supChip,
                    form.supplier_id === s.id && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      form.supplier_id === s.id && styles.chipTextActive,
                    ]}
                  >
                    {s.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <LabeledInput
              label={he.addRemove.fieldPrice}
              value={form.price}
              keyboardType="decimal-pad"
              onChangeText={(price) => setForm((s) => ({ ...s, price }))}
            />
            <LabeledInput
              label={he.addRemove.fieldStock}
              value={form.stock_quantity}
              keyboardType="number-pad"
              onChangeText={(stock_quantity) =>
                setForm((s) => ({ ...s, stock_quantity }))
              }
            />

            <Text style={[styles.dimLabel, styles.mapHintNb]}>{he.addRemove.mapPlacementHint}</Text>
            {mapPlacementBlockedMessage ? (
              <View style={styles.nbMapBlockedWrap}>
                <Ionicons name="information-circle-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.nbMapBlockedText}>{mapPlacementBlockedMessage}</Text>
              </View>
            ) : null}
            {perCopySummaries && perCopySummaries.length > 0 ? (
              <View style={styles.perCopyChosenBlock}>
                <Text style={styles.mapChosenLines} numberOfLines={2}>
                  {interpolate(he.addRemove.perCopyChoiceSummaryN, {
                    n: String(perCopySummaries.length),
                  })}
                </Text>
                {perCopySummaries.map((path, idx) => (
                  <Text key={idx} style={styles.perCopySummaryLine} numberOfLines={2}>
                    {interpolate(he.addRemove.chosenMapLocation, { path })}
                  </Text>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void onClearPerCopy()}
                  hitSlop={8}
                  style={styles.mapClearTouchable}
                  disabled={submitting}
                >
                  <Text style={styles.mapClearLink}>{he.addRemove.clearPerCopyChoice}</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={submitting || mapPlacementBlockedMessage != null}
              style={[
                styles.mapChooseBtnWide,
                (submitting || mapPlacementBlockedMessage != null) && styles.mapActionBtnDisabled,
              ]}
              onPress={openPicker}
            >
              <Ionicons name="map-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.mapChooseBtnWideText}>{he.addRemove.openPerCopyPlacement}</Text>
            </Pressable>

            <LabeledInput
              label={he.addRemove.fieldTopic}
              value={form.topic}
              onChangeText={(topic) => setForm((s) => ({ ...s, topic }))}
            />

            <View style={styles.switchRow}>
              <Text style={styles.inputLabel}>{he.addRemove.newBookFlag}</Text>
              <Switch
                accessibilityLabel={he.addRemove.newBookFlag}
                value={form.is_new}
                onValueChange={(is_new) =>
                  setForm((s) => ({ ...s, is_new, display_quantity: is_new ? s.display_quantity : "0" }))
                }
              />
            </View>
            {form.is_new ? (
              <View style={styles.inputBlock}>
                <LabeledInput
                  label={he.addRemove.newBookDisplayQty}
                  value={form.display_quantity}
                  keyboardType="number-pad"
                  onChangeText={(display_quantity) =>
                    setForm((s) => ({ ...s, display_quantity: display_quantity.replace(/[^0-9]/g, "") }))
                  }
                />
                <Text style={[styles.dimLabel, { marginTop: theme.spacing.xs }]}>
                  {he.addRemove.newBookDisplayQtyHint}
                </Text>
              </View>
            ) : null}

            {errorOccurred ? (
              <Text style={styles.inlineError}>{he.addRemove.createFailed}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable onPress={onClose} style={[styles.modalBtn, styles.modalBtnGhost]}>
                <Text>{he.generic.cancel}</Text>
              </Pressable>
              <Pressable
                disabled={submitting}
                onPress={() => {
                  const priceNum = Number(String(form.price).replace(",", "."));
                  const stockNum = Number.parseInt(form.stock_quantity, 10);
                  const titleClean = form.title.trim();
                  const authorClean = form.author.trim();
                  const topicClean = form.topic.trim();
                  const displayRaw = Number.parseInt(form.display_quantity || "0", 10);
                  const displayQty = form.is_new
                    ? Number.isNaN(displayRaw)
                      ? 0
                      : Math.max(0, displayRaw)
                    : 0;
                  if (
                    !titleClean ||
                    !authorClean ||
                    !form.supplier_id ||
                    Number.isNaN(priceNum) ||
                    Number.isNaN(stockNum) ||
                    stockNum < 0
                  ) {
                    return;
                  }
                  if (form.is_new && displayQty > stockNum) {
                    Alert.alert(he.generic.errorTitle, he.addRemove.newBookDisplayQtyInvalid);
                    return;
                  }
                  void onSubmit({
                    title: titleClean,
                    author: authorClean,
                    supplier_id: form.supplier_id,
                    price: priceNum,
                    stock_quantity: stockNum,
                    topic: topicClean,
                    is_new: form.is_new,
                    display_quantity: displayQty,
                  });
                }}
                style={[styles.modalBtn, styles.modalBtnPrimary]}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.colors.onPrimary} />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>{he.addRemove.createBook}</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
}): JSX.Element {
  return (
    <View style={styles.inputBlock}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.textInput}
        value={value}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        textAlign="left"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  titleBlock: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  title: { ...theme.typography.headlineMd, color: theme.colors.onBackground, textAlign: "left" },
  subtitle: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    marginTop: theme.spacing.xs,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  supplierFieldShell: { flex: 1, minWidth: 0, justifyContent: "center" },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
  },
  secondaryHeaderBtn: {
    flexShrink: 0,
    minWidth: "32%",
    maxWidth: 160,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  secondaryHeaderBtnText: { ...theme.typography.labelMd, color: theme.colors.primary, textAlign: "left" },
  offlineBanner: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.errorContainer,
    marginHorizontal: theme.spacing.lg,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
  },
  offlineText: { flex: 1, ...theme.typography.caption, color: theme.colors.onErrorContainer, textAlign: "left" },
  hintBox: {
    alignItems: "center",
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
  },
  hintText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 22,
  },
  loadingBox: { alignItems: "center", paddingTop: theme.spacing.xl },
  loadingText: { marginTop: theme.spacing.sm, color: theme.colors.onSurfaceVariant },
  listPad: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  sep: { height: theme.spacing.md },
  rowCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadow.floating,
  },
  rowMain: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  bookTitle: { ...theme.typography.headlineSm, color: theme.colors.onSurface, textAlign: "left", },
  bookAuthor: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    marginTop: 2,
  },
  trashHit: { padding: theme.spacing.xs },
  sectionLabel: { ...theme.typography.labelMd, color: theme.colors.primary, textAlign: "left" },
  dimLabel: { ...theme.typography.caption, color: theme.colors.onSurfaceVariant, textAlign: "left" },
  chipsRow: { maxHeight: 44, flexGrow: 0 },
  chip: {
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    marginEnd: theme.spacing.sm,
    alignSelf: "flex-start",
  },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryContainer },
  chipText: { ...theme.typography.labelMd, color: theme.colors.onSurface },
  chipTextActive: { color: theme.colors.onPrimaryContainer },
  supChip: { marginBottom: theme.spacing.sm },
  mapHintBelowChips: { marginTop: theme.spacing.sm },
  mapHintNb: { marginTop: theme.spacing.sm },
  nbMapBlockedWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primaryContainer,
  },
  nbMapBlockedText: {
    flex: 1,
    ...theme.typography.caption,
    color: theme.colors.onPrimaryContainer,
    textAlign: "left",
  },
  mapGuardBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.secondaryContainer,
    marginBottom: theme.spacing.md,
  },
  mapGuardText: {
    flex: 1,
    ...theme.typography.caption,
    color: theme.colors.onSecondaryContainer,
    textAlign: "left",
  },
  mapActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  mapActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  mapActionBtnDisabled: { opacity: 0.42 },
  mapActionBtnText: { ...theme.typography.labelMd, color: theme.colors.primary },
  mapChosenWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    flexWrap: "wrap",
    paddingVertical: theme.spacing.xs,
  },
  mapChosenLines: {
    flex: 1,
    minWidth: "55%",
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
    lineHeight: 22,
  },
  perCopyChosenBlock: {
    width: "100%",
    alignItems: "stretch",
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  perCopySummaryLine: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  mapClearTouchable: { paddingVertical: 4 },
  mapClearLink: { ...theme.typography.labelMd, color: theme.colors.primary },
  mapChooseBtnWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  mapChooseBtnWideText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
  },
  stockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.xs,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceContainerLow,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 4,
  },
  stepBtn: {
    width: 40,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: { opacity: 0.35 },
  qty: {
    ...theme.typography.headlineSm,
    minWidth: 36,
    textAlign: "center",
    color: theme.colors.onSurface,
  },
  priceRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  priceInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingVertical: Platform.OS === "ios" ? theme.spacing.sm : theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLow,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  applyPriceBtn: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.secondaryContainer,
    borderRadius: theme.radius.md,
  },
  applyPriceText: { ...theme.typography.labelMd, color: theme.colors.primary },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(11,28,48,0.45)",
    padding: theme.spacing.lg,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    maxHeight: "60%",
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    ...theme.shadow.modal,
  },
  newBookSheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    ...theme.shadow.modal,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    marginHorizontal: theme.spacing.sm,
    alignSelf: "center",
    width: "100%",
  },
  nbScroll: { gap: theme.spacing.sm, paddingBottom: theme.spacing.lg },
  sheetTitle: {
    ...theme.typography.headlineSm,
    textAlign: "left",
    color: theme.colors.onSurface,
    marginBottom: theme.spacing.sm,
  },
  modalActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  modalBtnGhost: {
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  modalBtnPrimary: { backgroundColor: theme.colors.primary },
  modalBtnPrimaryText: { ...theme.typography.labelMd, color: theme.colors.onPrimary },
  inputBlock: { marginTop: theme.spacing.xs },
  inputLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    marginBottom: theme.spacing.xs,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLow,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
  },
  supMiniList: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginVertical: theme.spacing.sm },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  inlineError: {
    ...theme.typography.caption,
    color: theme.colors.error,
    textAlign: "left",
  },
});
