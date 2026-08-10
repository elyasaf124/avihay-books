import { Ionicons } from "@expo/vector-icons";
import type { Book, BookLocation, BookWithLocations, Supplier } from "@avihay-books/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import {
  useAdjustInventoryStock,
  useCreateBook,
  useCreateBookLocation,
  useDeleteBookLocation,
  useInventoryBooksBySupplier,
  usePatchBook,
  usePatchBookLocation,
} from "../../src/api/inventory";
import { api } from "../../src/api/client";
import { useSearchBooks, useStoreMap, useStoreMapSummary } from "../../src/api/storeMap";
import { useMoveBook, useSuppliersWithFallback } from "../../src/api/unit";
import {
  SearchablePickerField,
  suppliersToPickerItems,
} from "../../src/components/pickers/SearchablePicker";
import { SearchableBookPickerField } from "../../src/components/pickers/SearchableBookPickerField";
import { SearchableFreeTextField } from "../../src/components/pickers/SearchableFreeTextField";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { EditBookModal } from "../../src/components/inventory/EditBookModal";
import type { MapPlacementSubmitTarget } from "../../src/components/unit/MoveBookModal";
import {
  InventoryMoveBookModal,
  type InventoryMoveItem,
} from "../../src/components/unit/InventoryMoveBookModal";
import { PerCopyPlacementModal } from "../../src/components/unit/PerCopyPlacementModal";
import { useKeyboardHeight } from "../../src/hooks/useKeyboardHeight";
import { he } from "../../src/i18n/he";
import { findFirstDisplayCellId, findStoreMapCellById, resolvePositionForPlacement } from "../../src/utils/storeMapCells";
import { theme } from "../../src/theme";

/** ייחוס יציב למקרה של `data === undefined` — אסור להשתמש ב־`[]` inlined (מתחלף כל רינדר). */
const NO_BOOKS: BookWithLocations[] = [];
const NO_TOPICS: string[] = [];

const GLOBAL_BOOK_DROPDOWN_CAP = 50;
const GLOBAL_BOOK_FILTER_BLUR_MS = Platform.OS === "ios" ? 140 : 230;

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => {
    return s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }, template);
}

function unplacedQuantity(book: BookWithLocations): number {
  const onShelf = book.locations.reduce((s, l) => s + l.quantity_in_cell, 0);
  return Math.max(0, book.stock_quantity - onShelf);
}

/** שמות תאים ייחודיים לתצוגה ברשימת חיפוש. */
function formatBookCellNames(locations: readonly { cell_name: string }[]): string {
  const names = [...new Set(locations.map((l) => l.cell_name).filter(Boolean))];
  return names.length > 0 ? names.join(" · ") : "—";
}

/** פירוק למשבצות שורות להעברה — תא אחד או כל המלאי.
 * גם מיקום עם `quantity_in_cell === 0` (חוסר על המדף) מקבל משבצת אחת,
 * כדי לאפשר «שנה מיקום» בלי מלאי פיזי — החוסר נשאר על אותו `location_id`. */
function expandInventoryMoveSlots(
  book: BookWithLocations,
  locId: string | null,
): { loc: BookWithLocations["locations"][number]; copyIndex: number }[] {
  const locs = locId === null ? book.locations : book.locations.filter((l) => l.id === locId);
  const out: { loc: BookWithLocations["locations"][number]; copyIndex: number }[] = [];
  for (const loc of locs) {
    const copies = Math.max(loc.quantity_in_cell, 1);
    for (let i = 0; i < copies; i++) {
      out.push({ loc, copyIndex: i });
    }
  }
  return out;
}

export default function AddRemoveScreen(): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const suppliers = useSuppliersWithFallback();
  const supplierPickerItems = useMemo(() => suppliersToPickerItems(suppliers), [suppliers]);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [globalBookSearch, setGlobalBookSearch] = useState("");
  const [globalBookSearchFocused, setGlobalBookSearchFocused] = useState(false);
  const [globalBookSuggestionsPinned, setGlobalBookSuggestionsPinned] = useState(false);
  const globalBookBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipClearOnSupplierChangeRef = useRef(false);
  const [scrollBooksListToBookId, setScrollBooksListToBookId] = useState<string | null>(null);
  const booksFlatListRef = useRef<FlatList<BookWithLocations> | null>(null);
  const [newBookOpen, setNewBookOpen] = useState(false);
  /** מזהה מיקום לעדכון משולב, או `null` לעדכון מלאי מחסן בלבד. */
  const [locationByBook, setLocationByBook] = useState<Record<string, string | null>>({});
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  /** טקסט בשדה «כמה להוסיף למלאי» לפי `book.id`. */
  const [stockBulkDraft, setStockBulkDraft] = useState<Record<string, string>>({});

  const booksQuery = useInventoryBooksBySupplier(supplierId);
  const storeMapQuery = useStoreMap();
  const storeMapSummaryQuery = useStoreMapSummary();
  const topicSuggestions = storeMapSummaryQuery.data?.topics ?? NO_TOPICS;
  const patchBook = usePatchBook();
  const patchLoc = usePatchBookLocation();
  const adjustInventoryStock = useAdjustInventoryStock();
  const createBook = useCreateBook();
  const createBookLocation = useCreateBookLocation();
  const deleteBookLocation = useDeleteBookLocation();
  const moveBook = useMoveBook();
  const booksData = booksQuery.data;
  const books = booksData ?? NO_BOOKS;
  const globalBookSearchTrimmed = globalBookSearch.trim();
  const globalBookSearchQuery = useSearchBooks(globalBookSearchTrimmed);
  const globalSearchBooks = globalBookSearchQuery.data ?? [];
  const globalSearchSuggestions = useMemo(
    () => globalSearchBooks.slice(0, GLOBAL_BOOK_DROPDOWN_CAP),
    [globalSearchBooks],
  );
  const globalSearchTruncated = globalSearchSuggestions.length < globalSearchBooks.length;
  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suppliers) map.set(s.id, s.name);
    return map;
  }, [suppliers]);
  const hasActiveGlobalBookSearch =
    selectedBookId !== null || globalBookSearchTrimmed.length > 0;
  const showGlobalBookDropdown =
    (globalBookSuggestionsPinned || globalBookSearchFocused) &&
    globalBookSearchTrimmed.length > 0;
  const filteredBooks = useMemo(() => {
    if (!selectedBookId) return books;
    return books.filter((b) => b.id === selectedBookId);
  }, [books, selectedBookId]);

  const keyboardHeight = useKeyboardHeight();
  const { height: windowH } = useWindowDimensions();

  /** מעקב אחר היסט הגלילה הנוכחי של רשימת הספרים — לחישוב גלילה יחסית. */
  const booksScrollOffsetRef = useRef(0);
  /** רפרנסים לאינפוטים בכרטיסים, לפי `${bookId}:price|stock` — למדידת מיקום מול המקלדת. */
  const inputRefs = useRef<Map<string, TextInput>>(new Map());
  /** האינפוט שבפוקוס כעת — נמדד מחדש כשהמקלדת נפתחת (Android: אחרי ה-focus). */
  const focusedInputKeyRef = useRef<string | null>(null);

  /** גולל את רשימת הספרים כך שהאינפוט הממוקד יישב מעל המקלדת. */
  const ensureInputVisible = useCallback(
    (key: string) => {
      if (keyboardHeight <= 0) return;
      const node = inputRefs.current.get(key);
      if (!node) return;
      node.measureInWindow((_x, y, _w, height) => {
        const keyboardTop = windowH - keyboardHeight;
        const margin = theme.spacing.lg;
        const overflow = y + height - (keyboardTop - margin);
        if (overflow > 0) {
          booksFlatListRef.current?.scrollToOffset({
            offset: Math.max(0, booksScrollOffsetRef.current + overflow),
            animated: true,
          });
        }
      });
    },
    [keyboardHeight, windowH],
  );

  const onInputFocus = useCallback(
    (key: string) => {
      focusedInputKeyRef.current = key;
      ensureInputVisible(key);
    },
    [ensureInputVisible],
  );

  useEffect(() => {
    if (keyboardHeight <= 0 || !focusedInputKeyRef.current) return undefined;
    const key = focusedInputKeyRef.current;
    const t = setTimeout(() => ensureInputVisible(key), 60);
    return () => clearTimeout(t);
  }, [keyboardHeight, ensureInputVisible]);

  const isOffline = booksQuery.isError;

  const onBookPickerChange = useCallback((bookId: string | null) => {
    setSelectedBookId(bookId);
    if (bookId) setScrollBooksListToBookId(bookId);
  }, []);

  const clearGlobalBookBlurTimer = useCallback(() => {
    if (globalBookBlurTimerRef.current !== null) {
      clearTimeout(globalBookBlurTimerRef.current);
      globalBookBlurTimerRef.current = null;
    }
  }, []);

  const onGlobalBookSearchFocus = useCallback(() => {
    clearGlobalBookBlurTimer();
    setGlobalBookSearchFocused(true);
  }, [clearGlobalBookBlurTimer]);

  const onGlobalBookSearchBlur = useCallback(() => {
    globalBookBlurTimerRef.current = setTimeout(() => {
      setGlobalBookSearchFocused(false);
      globalBookBlurTimerRef.current = null;
    }, GLOBAL_BOOK_FILTER_BLUR_MS);
  }, []);

  const toggleGlobalBookSuggestions = useCallback(() => {
    clearGlobalBookBlurTimer();
    setGlobalBookSuggestionsPinned((p) => !p);
  }, [clearGlobalBookBlurTimer]);

  const clearGlobalBookSearch = useCallback(() => {
    clearGlobalBookBlurTimer();
    setGlobalBookSearch("");
    setSelectedBookId(null);
    setGlobalBookSearchFocused(false);
    setGlobalBookSuggestionsPinned(false);
    Keyboard.dismiss();
  }, [clearGlobalBookBlurTimer]);

  const onPickGlobalBook = useCallback(
    (book: Book) => {
      clearGlobalBookBlurTimer();
      skipClearOnSupplierChangeRef.current = true;
      setGlobalBookSearch(book.title);
      setSupplierId(book.supplier_id);
      setSelectedBookId(book.id);
      setScrollBooksListToBookId(book.id);
      setGlobalBookSearchFocused(false);
      setGlobalBookSuggestionsPinned(false);
      Keyboard.dismiss();
    },
    [clearGlobalBookBlurTimer],
  );

  const onSupplierChange = useCallback((id: string | null) => {
    setSupplierId(id);
  }, []);

  useEffect(() => () => clearGlobalBookBlurTimer(), [clearGlobalBookBlurTimer]);

  useEffect(() => {
    if (skipClearOnSupplierChangeRef.current) {
      skipClearOnSupplierChangeRef.current = false;
      return;
    }
    setSelectedBookId(null);
    setStockBulkDraft({});
    setScrollBooksListToBookId(null);
    setGlobalBookSearch("");
  }, [supplierId]);

  useEffect(() => {
    if (scrollBooksListToBookId === null) return undefined;
    const id = scrollBooksListToBookId;
    const idx = filteredBooks.findIndex((b) => b.id === id);
    if (idx >= 0) {
      let cancelled = false;
      const tf = requestAnimationFrame(() => {
        if (cancelled) return;
        try {
          booksFlatListRef.current?.scrollToIndex({
            index: idx,
            viewPosition: 0.06,
            animated: true,
          });
        } catch {
          //
        }
        setScrollBooksListToBookId(null);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(tf);
      };
    }
    const tmo = setTimeout(() => setScrollBooksListToBookId(null), 600);
    return () => clearTimeout(tmo);
  }, [filteredBooks, scrollBooksListToBookId]);
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
      setStockBulkDraft((p) => (Object.keys(p).length ? {} : p));
      return;
    }
    /** בעת טעינה אין להחזיק `booksQuery.data`; אחרת כל פריים מאלץ את `setState`. */
    if (booksData === undefined) return;

    if (booksData.length === 0) {
      setLocationByBook((p) => (Object.keys(p).length === 0 ? p : {}));
      setPriceDraft((p) => (Object.keys(p).length === 0 ? p : {}));
      setStockBulkDraft((p) => (Object.keys(p).length === 0 ? p : {}));
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
    setStockBulkDraft((prev) => {
      let changed = false;
      const merged: Record<string, string> = {};
      for (const id of validIds) {
        if (prev[id] !== undefined) merged[id] = prev[id];
      }
      if (Object.keys(prev).length !== Object.keys(merged).length) changed = true;
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
  const [removeLocationTarget, setRemoveLocationTarget] = useState<{
    bookId: string;
    loc: BookWithLocations["locations"][number];
  } | null>(null);
  const [editBook, setEditBook] = useState<BookWithLocations | null>(null);

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

  const [inventoryMoveBook, setInventoryMoveBook] = useState<BookWithLocations | null>(null);
  const [inventoryMoveSlots, setInventoryMoveSlots] = useState<
    { loc: BookWithLocations["locations"][number]; copyIndex: number }[]
  >([]);
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
      stockBulkDraft,
      locationByBook,
      createLocPending: createBookLocation.isPending,
      movePending: moveBook.isPending,
      patchBookPending: patchBook.isPending,
      placementReady: placementStoreMap != null,
      storeMapUpdatedAt: storeMapQuery.dataUpdatedAt,
      selectedBookId,
    }),
    [
      booksQuery.dataUpdatedAt,
      busyBookId,
      priceDraft,
      stockBulkDraft,
      locationByBook,
      createBookLocation.isPending,
      moveBook.isPending,
      patchBook.isPending,
      placementStoreMap,
      storeMapQuery.dataUpdatedAt,
      selectedBookId,
    ],
  );

  const applyStockDelta = useCallback(
    (book: BookWithLocations, delta: number) => {
      if (!supplierId) return;
      const selId = locationByBook[book.id] ?? null;
      const cachedList = queryClient.getQueryData<BookWithLocations[]>([
        "books",
        "inventory",
        supplierId,
      ]);
      const cachedBook = cachedList?.find((b) => b.id === book.id) ?? book;
      const selectedLoc =
        selId === null ? null : cachedBook.locations.find((loc) => loc.id === selId) ?? null;

      if (delta < 0 && cachedBook.stock_quantity <= 0) return;
      if (delta < 0 && selectedLoc && selectedLoc.quantity_in_cell <= 0) return;
      if (delta < 0 && selId === null && unplacedQuantity(cachedBook) <= 0) return;

      adjustInventoryStock.mutate(
        {
          supplierId,
          bookId: book.id,
          delta,
          locationId: selId,
        },
        {
          onError: () => Alert.alert(he.generic.errorTitle, he.addRemove.stockAdjustFailed),
        },
      );
    },
    [supplierId, locationByBook, adjustInventoryStock, queryClient],
  );

  /** הוספת מלאי מהשדה «כמה להוסיף»: מחרוזת מספר שלם חיובי. */
  const applyStockBulkAdd = useCallback(
    (book: BookWithLocations) => {
      if (!supplierId) return;
      const raw = stockBulkDraft[book.id]?.trim() ?? "";
      const addQty = Number.parseInt(raw, 10);
      if (!Number.isFinite(addQty) || addQty <= 0) return;
      applyStockDelta(book, addQty);
      setStockBulkDraft((p) => {
        const { [book.id]: _, ...rest } = p;
        return rest;
      });
    },
    [supplierId, stockBulkDraft, applyStockDelta],
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

  const applyToggleIsNew = useCallback(
    async (book: BookWithLocations, nextIsNew: boolean) => {
      if (nextIsNew && book.locations.length > 0) {
        Alert.alert(he.generic.errorTitle, he.addRemove.toggleIsNewHasLocationsHint);
      }
      try {
        setBusyBookId(book.id);
        await patchBook.mutateAsync({ id: book.id, patch: { is_new: nextIsNew } });
      } catch {
        Alert.alert(he.generic.errorTitle, he.addRemove.toggleIsNewFailed);
      } finally {
        setBusyBookId(null);
      }
    },
    [patchBook],
  );

  const closeInventoryMove = useCallback(() => {
    setInventoryMoveBook(null);
    setInventoryMoveSlots([]);
    setInventoryMapError(null);
  }, []);

  const confirmRemoveLocation = useCallback(async () => {
    if (!removeLocationTarget) return;
    const { bookId, loc } = removeLocationTarget;
    try {
      setBusyBookId(bookId);
      await deleteBookLocation.mutateAsync({ id: loc.id });
      setLocationByBook((prev) => {
        if (prev[bookId] !== loc.id) return prev;
        return { ...prev, [bookId]: null };
      });
      setRemoveLocationTarget(null);
    } catch {
      Alert.alert(he.generic.errorTitle, he.addRemove.removeLocationFailed);
    } finally {
      setBusyBookId(null);
    }
  }, [deleteBookLocation, removeLocationTarget]);

  const onSubmitInventoryMoveAll = useCallback(
    async (moves: InventoryMoveItem[]) => {
      if (!inventoryMoveBook || moves.length === 0) return;
      setInventoryMapError(null);
      const qtyRemaining = new Map<string, number>();
      for (const m of moves) {
        if (!qtyRemaining.has(m.sourceLocation.id)) {
          qtyRemaining.set(m.sourceLocation.id, m.sourceLocation.quantity_in_cell);
        }
      }

      try {
        for (const move of moves) {
          const locId = move.sourceLocation.id;
          const remaining = qtyRemaining.get(locId) ?? move.sourceLocation.quantity_in_cell;

          if (move.splitOffSingle) {
            let created: BookLocation | null = null;
            try {
              created = await createBookLocation.mutateAsync({
                book_id: move.bookId,
                cell_id: move.target.cellId,
                position_in_cell: move.target.positionInCell,
                quantity_in_cell: 1,
              });
              const nextQty = remaining - 1;
              qtyRemaining.set(locId, nextQty);
              if (nextQty <= 0) {
                await api.delete(`/book-locations/${locId}`);
              } else {
                await patchLoc.mutateAsync({
                  location: {
                    ...move.sourceLocation,
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
              locationId: locId,
              bookId: move.bookId,
              cellId: move.target.cellId,
              positionInCell: move.target.positionInCell,
              quantityInCell: move.target.quantityInCell,
            });
            qtyRemaining.set(locId, 0);
          }
        }
        closeInventoryMove();
      } catch {
        setInventoryMapError(he.addRemove.mapMoveFailed);
      }
    },
    [closeInventoryMove, createBookLocation, inventoryMoveBook, moveBook, patchLoc],
  );

  const openInventoryMoveSession = useCallback(
    (pickBook: BookWithLocations, locId: string | null) => {
      const slots = expandInventoryMoveSlots(pickBook, locId);
      if (slots.length === 0) return;
      setInventoryMapError(null);
      setInventoryMoveBook(pickBook);
      setInventoryMoveSlots(slots);
    },
    [],
  );

  const headerButtons = (
    <View style={styles.topBar}>
      <View style={styles.topBarActions}>
        <Pressable
          style={[styles.headerBtn, styles.secondaryHeaderBtn, styles.topBarActionBtn]}
          onPress={() => router.push("/suppliers")}
        >
          <Ionicons name="people-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.secondaryHeaderBtnText} numberOfLines={1}>
            {he.suppliers.manageButton}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.headerBtn, styles.secondaryHeaderBtn, styles.topBarActionBtn]}
          onPress={() => {
            setNewBookPerCopyResult(null);
            setNewBookPcCtx(null);
            setNewBookOpen(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.secondaryHeaderBtnText} numberOfLines={1}>
            {he.addRemove.addNewBook}
          </Text>
        </Pressable>
      </View>
      <View style={styles.globalBookSearchDock}>
        <View style={styles.globalBookFilterRow}>
          <Ionicons name="search-outline" size={20} color={theme.colors.onSurfaceVariant} />
          <TextInput
            style={styles.globalBookFilterInput}
            value={globalBookSearch}
            onChangeText={(text) => {
              setGlobalBookSearch(text);
              if (selectedBookId) setSelectedBookId(null);
            }}
            placeholder={he.addRemove.globalBookSearchPlaceholder}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            accessibilityLabel={he.addRemove.globalBookSearchAccessibility}
            returnKeyType="search"
            textAlign="left"
            autoCorrect={false}
            onFocus={onGlobalBookSearchFocus}
            onBlur={onGlobalBookSearchBlur}
          />
          {hasActiveGlobalBookSearch ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={he.addRemove.bookSearchClearA11y}
              onPress={clearGlobalBookSearch}
              hitSlop={10}
              style={styles.globalBookFilterClearBtn}
            >
              <Ionicons name="close-circle" size={22} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              globalBookSuggestionsPinned
                ? he.addRemove.bookDropdownHide
                : he.addRemove.bookDropdownShow
            }
            onPress={toggleGlobalBookSuggestions}
            hitSlop={10}
            style={styles.globalBookFilterChevronBtn}
          >
            <Ionicons
              name={globalBookSuggestionsPinned ? "chevron-up-outline" : "chevron-down-outline"}
              size={22}
              color={theme.colors.primary}
            />
          </Pressable>
        </View>

        {showGlobalBookDropdown ? (
          <View style={styles.globalBookDropdownOuter}>
            {globalBookSearchQuery.isFetching && globalSearchBooks.length === 0 ? (
              <View style={styles.globalBookDropdownLoading}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.globalBookDropdownLoadingText}>
                  {he.addRemove.globalBookSearchLoading}
                </Text>
              </View>
            ) : globalBookSearchQuery.isError ? (
              <Text style={styles.globalBookDropdownEmptyText}>
                {he.addRemove.globalBookSearchOffline}
              </Text>
            ) : globalSearchSuggestions.length === 0 ? (
              <Text style={styles.globalBookDropdownEmptyText}>
                {he.addRemove.bookDropdownNoMatches}
              </Text>
            ) : (
              <>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  style={styles.globalBookDropdownScroll}
                >
                  {globalSearchSuggestions.map((book) => (
                    <Pressable
                      key={book.id}
                      onPressIn={() => clearGlobalBookBlurTimer()}
                      onPress={() => onPickGlobalBook(book)}
                      style={({ pressed }) => [
                        styles.globalBookDropdownRow,
                        book.id === selectedBookId && styles.globalBookDropdownRowSelected,
                        pressed && styles.globalBookDropdownRowPressed,
                      ]}
                    >
                      <View style={styles.globalBookDropdownRowInner}>
                        <View style={styles.globalBookDropdownTextCol}>
                          <Text style={styles.globalBookDropdownTitle} numberOfLines={2}>
                            {book.title}
                          </Text>
                          <Text style={styles.globalBookDropdownMeta} numberOfLines={1}>
                            {book.author || he.orders.authorNotSpecified}
                            {" · "}
                            {supplierNameById.get(book.supplier_id) ?? he.addRemove.chooseSupplier}
                          </Text>
                        </View>
                        <View style={styles.globalBookDropdownStats}>
                          <Text style={styles.globalBookDropdownStock}>
                            {book.price != null && book.price !== ""
                              ? `${he.unit.pricePrefix}${book.price}`
                              : "—"}
                          </Text>
                          <Text style={styles.globalBookDropdownStock}>
                            {`${he.shortage.stockShort} ${book.stock_quantity}`}
                          </Text>
                          <Text style={styles.globalBookDropdownCell} numberOfLines={1}>
                            {`${he.unit.cellLabel} ${formatBookCellNames(book.locations)}`}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
                {globalSearchTruncated ? (
                  <Text style={styles.globalBookDropdownTruncated}>
                    {interpolate(he.addRemove.bookDropdownTruncated, {
                      shown: String(globalSearchSuggestions.length),
                      total: String(globalSearchBooks.length),
                    })}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </View>
      <View style={styles.supplierFieldShell}>
        <SearchablePickerField
          compact
          items={supplierPickerItems}
          valueId={supplierId}
          onChange={onSupplierChange}
          emptySelectionLabel={he.addRemove.chooseSupplier}
          searchPlaceholder={he.picker.searchInList}
          emptyListMessage={he.picker.noMatches}
        />
      </View>
    </View>
  );

  return (
    <>
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={{ flex: 1 }}>
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
            <View style={styles.inventoryWithSearch}>
              <View style={styles.inventorySearchDock}>
                {mapPlacementGuardMessage ? (
                  <View style={styles.mapGuardBanner}>
                    <Ionicons name="map-outline" size={18} color={theme.colors.onPrimaryContainer} />
                    <Text style={styles.mapGuardText}>{mapPlacementGuardMessage}</Text>
                  </View>
                ) : null}
                <SearchableBookPickerField
                  compact
                  books={books}
                  valueId={selectedBookId}
                  onChange={onBookPickerChange}
                  emptySelectionLabel={he.addRemove.bookTitleSearchPlaceholder}
                  searchPlaceholder={he.addRemove.bookTitleSearchPlaceholder}
                  clearSelectionLabel={he.addRemove.bookSearchShowAll}
                  emptyListMessage={he.addRemove.bookDropdownNoMatches}
                />
              </View>
              <FlatList
                ref={booksFlatListRef}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets={false}
                contentInsetAdjustmentBehavior="automatic"
                onScroll={(e) => {
                  booksScrollOffsetRef.current = e.nativeEvent.contentOffset.y;
                }}
                scrollEventThrottle={16}
                style={styles.inventoryBooksFlatList}
                data={filteredBooks}
                extraData={listExtraData}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                  selectedBookId ? (
                    <View style={styles.bookSearchEmptyBox}>
                      <Text style={styles.hintText}>{he.addRemove.bookSearchEmpty}</Text>
                    </View>
                  ) : null
                }
                  onScrollToIndexFailed={(info) => {
                    const list = booksFlatListRef.current;
                    if (!list) return;
                    setTimeout(() => {
                      try {
                        list.scrollToOffset({
                          offset: Math.max(0, Math.floor(info.averageItemLength * info.index)),
                          animated: true,
                        });
                      } catch {
                        //
                      }
                    }, 280);
                  }}
                  contentContainerStyle={[
                    styles.inventoryBooksListContent,
                    { paddingBottom: keyboardHeight + theme.spacing.xl },
                  ]}
                  ItemSeparatorComponent={() => <View style={styles.sep} />}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                  renderItem={({ item: book }) => {
                  const locId = locationByBook[book.id] ?? null;
                  const selectedLoc =
                    locId === null ? null : book.locations.find((loc) => loc.id === locId) ?? null;
                  const warehouseQty = unplacedQuantity(book);
                  const scopedQty = locId === null ? warehouseQty : selectedLoc?.quantity_in_cell ?? 0;
                  const minusDisabled =
                    locId === null
                      ? warehouseQty <= 0
                      : selectedLoc === null || selectedLoc.quantity_in_cell <= 0;

                  const stockBulkDraftRaw = stockBulkDraft[book.id]?.trim() ?? "";
                  const stockBulkParsed = Number.parseInt(stockBulkDraftRaw, 10);
                  const stockBulkAdditionValid =
                    Number.isFinite(stockBulkParsed) && stockBulkParsed > 0;
                  const stockBulkPreviewTotal =
                    stockBulkAdditionValid ? book.stock_quantity + stockBulkParsed : null;

                  return (
                    <View style={styles.rowCard}>
                      <View style={styles.rowMain}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.bookTitle}>{book.title}</Text>
                          <Text style={styles.bookAuthor}>{book.author}</Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={he.addRemove.editBookA11y}
                          hitSlop={8}
                          onPress={() => setEditBook(book)}
                          style={styles.trashHit}
                        >
                          <Ionicons name="pencil-outline" size={20} color={theme.colors.primary} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          hitSlop={8}
                          onPress={() => setDeactivateBook(book)}
                          style={styles.trashHit}
                        >
                          <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                        </Pressable>
                      </View>

                      <View style={styles.switchRow}>
                        <Text style={styles.inputLabel}>{he.addRemove.bookIsNewToggle}</Text>
                        <Switch
                          accessibilityLabel={he.addRemove.bookIsNewToggle}
                          value={book.is_new}
                          disabled={busyBookId === book.id || patchBook.isPending}
                          onValueChange={(next) => void applyToggleIsNew(book, next)}
                        />
                      </View>

                      <View style={styles.totalStockRow}>
                        <Text style={styles.dimLabel}>{he.addRemove.totalStockLabel}</Text>
                        <Text style={styles.totalStockQty}>{book.stock_quantity}</Text>
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
                            {interpolate(he.addRemove.locationChipWarehouse, {
                              qty: String(warehouseQty),
                            })}
                          </Text>
                        </Pressable>
                        {book.locations.map((loc) => (
                          <View
                            key={loc.id}
                            style={[styles.locationChip, loc.id === locId && styles.chipActive]}
                          >
                            <Pressable
                              onPress={() =>
                                setLocationByBook((prev) => ({
                                  ...prev,
                                  [book.id]: loc.id,
                                }))
                              }
                              style={styles.chipSelectHit}
                            >
                              <Text
                                style={[styles.chipText, loc.id === locId && styles.chipTextActive]}
                              >
                                {loc.quantity_in_cell <= 0
                                  ? interpolate(he.addRemove.locationChipCellShortage, {
                                      name: loc.cell_name,
                                    })
                                  : interpolate(he.addRemove.locationChipCell, {
                                      name: loc.cell_name,
                                      qty: String(loc.quantity_in_cell),
                                    })}
                              </Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={interpolate(he.addRemove.removeLocationChipA11y, {
                                name: loc.cell_name,
                              })}
                              hitSlop={8}
                              disabled={
                                busyBookId !== null ||
                                deleteBookLocation.isPending ||
                                placementStoreMap == null
                              }
                              onPress={() => setRemoveLocationTarget({ bookId: book.id, loc })}
                              style={styles.chipRemoveHit}
                            >
                              <Ionicons
                                name="close-circle"
                                size={18}
                                color={
                                  loc.id === locId
                                    ? theme.colors.onPrimaryContainer
                                    : theme.colors.onSurfaceVariant
                                }
                              />
                            </Pressable>
                          </View>
                        ))}
                      </ScrollView>

                      <Text style={[styles.dimLabel, styles.mapHintBelowChips]}>{he.addRemove.mapPlacementHint}</Text>
                      <View style={styles.mapActionRow}>
                        {book.stock_quantity > 0 && warehouseQty > 0 ? (
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
                            if (book.locations.length > 0) {
                              openInventoryMoveSession(book, locId);
                              return;
                            }
                            // אין מיקומים במפה — אותו זרימת «הוסף למפה» לפי עותקים לא ממוקמים
                            if (book.stock_quantity > 0 && warehouseQty > 0) {
                              setInventoryMapError(null);
                              setExistingPerCopyModalError(null);
                              setExistingPerCopyBook(book);
                            }
                          }}
                        >
                          <Ionicons name="shuffle-outline" size={18} color={theme.colors.primary} />
                          <Text style={styles.mapActionBtnText}>{he.addRemove.changeMapLocation}</Text>
                        </Pressable>
                      </View>

                      <View style={styles.stockRow}>
                        <Text style={styles.dimLabel}>{he.addRemove.tableHeaderStock}</Text>
                        <View style={styles.stepper}>
                          <Pressable
                            accessibilityRole="button"
                            disabled={minusDisabled}
                            onPress={() => void applyStockDelta(book, -1)}
                            style={[styles.stepBtn, minusDisabled && styles.stepBtnDisabled]}
                          >
                            <Ionicons name="remove" size={22} color={theme.colors.onSurface} />
                          </Pressable>
                          <Text style={styles.qty}>{scopedQty}</Text>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => void applyStockDelta(book, 1)}
                            style={styles.stepBtn}
                          >
                            <Ionicons name="add" size={22} color={theme.colors.onSurface} />
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.stockBulkBlock}>
                        <Text style={styles.dimLabel}>{he.addRemove.stockBulkAddLabel}</Text>
                        <View style={styles.stockBulkRow}>
                          <TextInput
                            ref={(node) => {
                              const key = `${book.id}:stock`;
                              if (node) inputRefs.current.set(key, node);
                              else inputRefs.current.delete(key);
                            }}
                            value={stockBulkDraft[book.id] ?? ""}
                            onChangeText={(t) =>
                              setStockBulkDraft((p) => ({
                                ...p,
                                [book.id]: t.replace(/\D/g, ""),
                              }))
                            }
                            onFocus={() => onInputFocus(`${book.id}:stock`)}
                            keyboardType="number-pad"
                            placeholder={he.addRemove.stockBulkAddPlaceholder}
                            placeholderTextColor={theme.colors.onSurfaceVariant}
                            style={styles.stockBulkInput}
                            textAlign="left"
                            accessibilityLabel={he.addRemove.stockBulkAddAccessibility}
                          />
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => applyStockBulkAdd(book)}
                            disabled={!stockBulkAdditionValid}
                            style={[
                              styles.stockBulkApplyBtn,
                              !stockBulkAdditionValid && styles.stockBulkApplyBtnDisabled,
                            ]}
                          >
                            <Text
                              style={[
                                styles.stockBulkApplyBtnText,
                                !stockBulkAdditionValid && styles.stockBulkApplyBtnTextDisabled,
                              ]}
                            >
                              {he.addRemove.stockBulkAddCta}
                            </Text>
                          </Pressable>
                        </View>
                        {stockBulkPreviewTotal !== null ? (
                          <Text style={styles.stockBulkPreview}>
                            {interpolate(he.addRemove.stockBulkPreviewTotal, {
                              total: String(stockBulkPreviewTotal),
                            })}
                          </Text>
                        ) : null}
                      </View>

                      <Text style={styles.dimLabel}>{he.addRemove.tableHeaderPrice}</Text>
                      <View style={styles.priceRow}>
                        <TextInput
                          ref={(node) => {
                            const key = `${book.id}:price`;
                            if (node) inputRefs.current.set(key, node);
                            else inputRefs.current.delete(key);
                          }}
                          value={priceDraft[book.id] ?? String(book.price)}
                          onChangeText={(t) => setPriceDraft((p) => ({ ...p, [book.id]: t }))}
                          onFocus={() => onInputFocus(`${book.id}:price`)}
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
            </View>
          )}
        </View>
      </SafeAreaView>

      <NewBookModal
        visible={newBookOpen}
        suppliers={suppliers}
        topicSuggestions={topicSuggestions}
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

      <InventoryMoveBookModal
        visible={inventoryMoveBook !== null}
        book={inventoryMoveBook}
        slots={inventoryMoveSlots}
        storeMap={placementStoreMap}
        supplierColor={
          inventoryMoveBook
            ? suppliers.find((s) => s.id === inventoryMoveBook.supplier_id)?.color_hex
            : undefined
        }
        submitting={
          moveBook.isPending || createBookLocation.isPending || patchLoc.isPending
        }
        errorMessage={inventoryMapError}
        onClose={closeInventoryMove}
        onSubmitAll={onSubmitInventoryMoveAll}
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

      <ConfirmDialog
        visible={removeLocationTarget !== null}
        title={he.addRemove.confirmRemoveLocationTitle}
        destructive
        message={
          removeLocationTarget
            ? removeLocationTarget.loc.quantity_in_cell > 0
              ? interpolate(he.addRemove.confirmRemoveLocationToWarehouse, {
                  cell: removeLocationTarget.loc.cell_name,
                  qty: String(removeLocationTarget.loc.quantity_in_cell),
                })
              : interpolate(he.addRemove.confirmRemoveLocationClear, {
                  cell: removeLocationTarget.loc.cell_name,
                })
            : undefined
        }
        cancelLabel={he.generic.cancel}
        confirmLabel={he.addRemove.removeLocationConfirm}
        onCancel={() => setRemoveLocationTarget(null)}
        onConfirm={() => {
          void confirmRemoveLocation();
        }}
      />

      <EditBookModal
        visible={editBook !== null}
        book={editBook}
        suppliers={suppliers}
        topicSuggestions={topicSuggestions}
        submitting={patchBook.isPending && editBook !== null && busyBookId === editBook.id}
        onClose={() => setEditBook(null)}
        onSubmit={async (patch) => {
          if (!editBook) return;
          try {
            setBusyBookId(editBook.id);
            const updated = await patchBook.mutateAsync({
              id: editBook.id,
              patch: patch as unknown as Record<string, unknown>,
            });
            setPriceDraft((p) => ({ ...p, [editBook.id]: String(updated.price) }));
            setEditBook(null);
          } catch {
            Alert.alert(he.generic.errorTitle, he.addRemove.editBookFailed);
          } finally {
            setBusyBookId(null);
          }
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
  reorder_threshold: string;
  topic: string;
  is_new: boolean;
  display_quantity: string;
}

function NewBookModal({
  visible,
  suppliers,
  topicSuggestions,
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
  topicSuggestions: readonly string[];
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
    reorder_threshold: number;
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
    reorder_threshold: "2",
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
      reorder_threshold: "2",
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable style={styles.sheetBackdrop} onPress={onClose}>
          <Pressable style={styles.newBookSheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets={true}
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={styles.nbScroll}
            >
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
              <LabeledInput
                label={he.addRemove.fieldReorderThreshold}
                value={form.reorder_threshold}
                keyboardType="number-pad"
                onChangeText={(reorder_threshold) =>
                  setForm((s) => ({ ...s, reorder_threshold }))
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

              <SearchableFreeTextField
                compact
                fieldLabel={he.addRemove.fieldTopic}
                value={form.topic}
                onChangeText={(topic) => setForm((s) => ({ ...s, topic }))}
                suggestions={topicSuggestions}
                placeholder={he.addRemove.fieldTopicPlaceholder}
                emptyListMessage={he.addRemove.fieldTopicNoMatches}
                disabled={submitting}
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
                    const reorderNum = Number.parseInt(form.reorder_threshold, 10);
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
                      Number.isNaN(reorderNum) ||
                      stockNum < 0 ||
                      reorderNum < 0
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
                      reorder_threshold: reorderNum,
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
      </KeyboardAvoidingView>
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
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  supplierFieldShell: { width: "100%" },
  globalBookSearchDock: {
    width: "100%",
    zIndex: 3,
  },
  globalBookFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  globalBookFilterInput: {
    flex: 1,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    paddingVertical: 0,
    minHeight: 24,
    textAlign: "left",
  },
  globalBookFilterClearBtn: {
    paddingHorizontal: theme.spacing.xs,
    justifyContent: "center",
  },
  globalBookFilterChevronBtn: {
    paddingHorizontal: theme.spacing.xs,
    justifyContent: "center",
  },
  globalBookDropdownOuter: {
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  globalBookDropdownScroll: { maxHeight: 196 },
  globalBookDropdownLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  globalBookDropdownLoadingText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  globalBookDropdownEmptyText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  globalBookDropdownRow: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  globalBookDropdownRowSelected: { backgroundColor: theme.colors.secondaryContainer },
  globalBookDropdownRowPressed: { backgroundColor: theme.colors.surfaceContainerHighest },
  globalBookDropdownRowInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  globalBookDropdownTextCol: {
    flex: 1,
    minWidth: 0,
  },
  globalBookDropdownStats: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 2,
  },
  globalBookDropdownTitle: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  globalBookDropdownMeta: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    marginTop: 2,
  },
  globalBookDropdownStock: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  globalBookDropdownCell: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    maxWidth: 120,
    textAlign: "right",
  },
  globalBookDropdownTruncated: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.outlineVariant,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing.sm,
  },
  topBarActionBtn: {
    flex: 1,
    justifyContent: "center",
  },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
  },
  secondaryHeaderBtn: {
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  secondaryHeaderBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    textAlign: "left",
    flexShrink: 1,
  },
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
  inventoryWithSearch: { flex: 1 },
  inventorySearchDock: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  inventoryBooksFlatList: { flex: 1 },
  inventoryBooksListContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    flexGrow: 1,
  },
  bookSearchEmptyBox: {
    alignItems: "center",
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
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
  locationChip: {
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    paddingVertical: theme.spacing.xs,
    paddingStart: theme.spacing.md,
    paddingEnd: theme.spacing.xs,
    marginEnd: theme.spacing.sm,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chipSelectHit: { flexShrink: 1 },
  chipRemoveHit: { padding: 2 },
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
  totalStockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  totalStockQty: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    textAlign: "center",
    minWidth: 36,
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
  stockBulkBlock: { marginTop: theme.spacing.sm, gap: theme.spacing.xs },
  stockBulkRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm },
  stockBulkInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingVertical: Platform.OS === "ios" ? theme.spacing.sm : theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLow,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
  },
  stockBulkApplyBtn: {
    flexShrink: 0,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  stockBulkApplyBtnDisabled: {
    opacity: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerHigh,
  },
  stockBulkApplyBtnText: { ...theme.typography.labelMd, color: theme.colors.onPrimary },
  stockBulkApplyBtnTextDisabled: { color: theme.colors.onSurfaceVariant },
  stockBulkPreview: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    textAlign: "left",
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
