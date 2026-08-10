import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ShortageListItem, Supplier } from "@avihay-books/shared";
import { theme } from "../../src/theme";
import { he } from "../../src/i18n/he";
import {
  useDeleteShortage,
  useMoveShortageToOrder,
  useShortageList,
  useUpdateShortageStatus,
} from "../../src/api/shortage";
import { usePatchBook } from "../../src/api/inventory";
import { useSuppliersWithFallback } from "../../src/api/unit";
import { useQueryClient } from "@tanstack/react-query";
import { mockShortageList } from "../../src/mocks/shortageOrders";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import {
  SearchablePickerField,
  suppliersToPickerItems,
} from "../../src/components/pickers/SearchablePicker";
import { ShortageRow } from "../../src/components/shortage/ShortageRow";
import { MoveToOrderModal } from "../../src/components/shortage/MoveToOrderModal";
import { ShortageQuantityModal } from "../../src/components/shortage/ShortageQuantityModal";
import { sortByHebrewKeys } from "../../src/utils/hebrewSort";

const BOOK_DROPDOWN_SUGGESTION_CAP = 50;
const BOOK_FILTER_BLUR_CLOSE_MS = Platform.OS === "ios" ? 140 : 230;

interface ShortageBookOption {
  id: string;
  title: string;
  author: string;
}

function booksFromShortageItems(rows: ShortageListItem[]): ShortageBookOption[] {
  const byBookId = new Map<string, ShortageBookOption>();
  for (const row of rows) {
    if (!byBookId.has(row.book_id)) {
      byBookId.set(row.book_id, {
        id: row.book_id,
        title: row.book_title,
        author: row.book_author ?? "",
      });
    }
  }
  return sortByHebrewKeys([...byBookId.values()], (opt) => [opt.title]);
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => {
    return s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }, template);
}

function shortageItemLabel(item: ShortageListItem): string {
  if (item.cell_name) {
    return interpolate(he.shortage.itemLabelWithCell, {
      title: item.book_title,
      cell: item.cell_name,
    });
  }
  return interpolate(he.shortage.itemLabel, { title: item.book_title });
}

function isNoStockError(err: unknown): boolean {
  return (
    axios.isAxiosError(err) &&
    typeof err.response?.data === "object" &&
    err.response.data !== null &&
    "error" in err.response.data &&
    (err.response.data as { error: string }).error === "no_stock"
  );
}

export default function ShortageScreen(): JSX.Element {
  const queryClient = useQueryClient();
  const shortageQuery = useShortageList();
  const moveMutation = useMoveShortageToOrder();
  const resolveMutation = useUpdateShortageStatus();
  const deleteShortageMutation = useDeleteShortage();
  const patchBook = usePatchBook();
  const suppliers = useSuppliersWithFallback();

  const isOffline = shortageQuery.isError;
  const items: ShortageListItem[] = useMemo(() => {
    const raw: ShortageListItem[] =
      shortageQuery.data && shortageQuery.data.length > 0
        ? shortageQuery.data
        : isOffline
          ? mockShortageList
          : (shortageQuery.data ?? []);
    /** רק `shortage`: אחרי «העבר להזמנה» הסטטוס `order_pending` ולא ברשימה זו */
    return raw.filter((row) => row.status === "shortage");
  }, [shortageQuery.data, isOffline]);

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [bookTitleFilter, setBookTitleFilter] = useState("");
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [bookSearchFocused, setBookSearchFocused] = useState(false);
  const [bookSuggestionsPanelPinned, setBookSuggestionsPanelPinned] = useState(false);
  const blurBookFilterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [moveTarget, setMoveTarget] = useState<ShortageListItem | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  /** השלמה עם בחירת כמות — רק כש־`missing_count > 1`. */
  const [resolveQtyTarget, setResolveQtyTarget] = useState<ShortageListItem | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  /** השלמה לעותק בודד — דיאלוג אישור כמו קודם. */
  const [resolveConfirmTarget, setResolveConfirmTarget] = useState<ShortageListItem | null>(
    null,
  );
  const [removeQtyTarget, setRemoveQtyTarget] = useState<ShortageListItem | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeConfirmTarget, setRemoveConfirmTarget] = useState<ShortageListItem | null>(
    null,
  );
  /** טיוטת מחיר לפי `book_id` — כמה שורות חוסר יכולות לשתף אותו ספר. */
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [busyPriceBookId, setBusyPriceBookId] = useState<string | null>(null);
  const [busyStockBookId, setBusyStockBookId] = useState<string | null>(null);

  const bookTitleFilterTrimmed = bookTitleFilter.trim();

  /** ספרים להצגה בדרופדאון — רק כאלה שיש להם חוסר פתוח (מסונן לפי ספק אם נבחר). */
  const searchableShortageBooks = useMemo(() => {
    const scope = supplierId ? items.filter((i) => i.supplier_id === supplierId) : items;
    return booksFromShortageItems(scope);
  }, [items, supplierId]);

  const filteredSearchBooks = useMemo(() => {
    if (!bookTitleFilterTrimmed) return searchableShortageBooks;
    const q = bookTitleFilterTrimmed.normalize("NFKC").toLocaleLowerCase("und");
    return searchableShortageBooks.filter((b) =>
      b.title.normalize("NFKC").toLocaleLowerCase("und").includes(q),
    );
  }, [searchableShortageBooks, bookTitleFilterTrimmed]);

  const dropdownSuggestionBooks = useMemo(
    () => filteredSearchBooks.slice(0, BOOK_DROPDOWN_SUGGESTION_CAP),
    [filteredSearchBooks],
  );
  const dropdownSuggestionTruncated =
    dropdownSuggestionBooks.length < filteredSearchBooks.length;

  /** מציגים רק ספקים שיש להם לפחות חוסר אחד ברשימה. */
  const visibleSuppliers: Supplier[] = useMemo(() => {
    const present = new Set(items.map((i) => i.supplier_id));
    return suppliers.filter((s) => present.has(s.id));
  }, [items, suppliers]);

  const supplierPickerItems = useMemo(
    () => suppliersToPickerItems(visibleSuppliers),
    [visibleSuppliers],
  );

  const filtered = useMemo(() => {
    let rows = items;
    if (supplierId) rows = rows.filter((i) => i.supplier_id === supplierId);
    if (selectedBookId) rows = rows.filter((i) => i.book_id === selectedBookId);
    /** קיבוץ לפי ספק (א-ב) ובתוך כל ספק מיון כותרות א-ב. */
    return sortByHebrewKeys(rows, (row) => [row.supplier_name, row.book_title]);
  }, [items, supplierId, selectedBookId]);

  const hasActiveBookFilter = selectedBookId !== null || bookTitleFilterTrimmed.length > 0;

  const clearBookFilterBlurTimer = useCallback(() => {
    if (blurBookFilterTimerRef.current !== null) {
      clearTimeout(blurBookFilterTimerRef.current);
      blurBookFilterTimerRef.current = null;
    }
  }, []);

  const onBookSearchFocus = useCallback(() => {
    clearBookFilterBlurTimer();
    setBookSearchFocused(true);
  }, [clearBookFilterBlurTimer]);

  const onBookSearchBlur = useCallback(() => {
    blurBookFilterTimerRef.current = setTimeout(() => {
      setBookSearchFocused(false);
      blurBookFilterTimerRef.current = null;
    }, BOOK_FILTER_BLUR_CLOSE_MS);
  }, []);

  const toggleBookSuggestionsPanel = useCallback(() => {
    clearBookFilterBlurTimer();
    setBookSuggestionsPanelPinned((p) => !p);
  }, [clearBookFilterBlurTimer]);

  const clearBookSearchFilter = useCallback(() => {
    clearBookFilterBlurTimer();
    setBookTitleFilter("");
    setSelectedBookId(null);
    setBookSearchFocused(false);
    setBookSuggestionsPanelPinned(false);
    Keyboard.dismiss();
  }, [clearBookFilterBlurTimer]);

  const onPickBookFromDropdown = useCallback(
    (book: ShortageBookOption) => {
      clearBookFilterBlurTimer();
      setBookTitleFilter(book.title);
      setSelectedBookId(book.id);
      setBookSearchFocused(false);
      setBookSuggestionsPanelPinned(false);
      Keyboard.dismiss();
    },
    [clearBookFilterBlurTimer],
  );

  const onSupplierChange = useCallback(
    (id: string | null) => {
      setSupplierId(id);
      clearBookSearchFilter();
    },
    [clearBookSearchFilter],
  );

  useEffect(() => () => clearBookFilterBlurTimer(), [clearBookFilterBlurTimer]);

  const showBookDropdown =
    (bookSuggestionsPanelPinned || bookSearchFocused) &&
    (searchableShortageBooks.length > 0 || bookTitleFilterTrimmed.length > 0);

  const closeMove = useCallback(() => {
    setMoveTarget(null);
    setMoveError(null);
  }, []);

  const submitMove = useCallback(
    async (quantity: number) => {
      if (!moveTarget) return;
      setMoveError(null);
      try {
        await moveMutation.mutateAsync({
          shortageId: moveTarget.id,
          quantity,
          orderType: "inventory",
        });
        closeMove();
      } catch {
        setMoveError(isOffline ? he.shortage.moveModal.offline : he.shortage.moveModal.failed);
      }
    },
    [moveTarget, moveMutation, isOffline, closeMove],
  );

  const runResolveShortage = useCallback(
    async (item: ShortageListItem, quantity: number, mode: "qty" | "confirm") => {
      if (resolveMutation.isPending) return;
      if (item.book_stock_quantity <= 0) {
        if (mode === "qty") setResolveError(he.shortage.resolveNoStock);
        else {
          Alert.alert(he.shortage.confirmResolveTitle, he.shortage.resolveNoStock);
          setResolveConfirmTarget(null);
        }
        return;
      }
      setResolveError(null);
      try {
        await resolveMutation.mutateAsync({
          shortageId: item.id,
          status: "completed",
          quantity,
        });
        setResolveQtyTarget(null);
        setResolveConfirmTarget(null);
      } catch (err) {
        const msg = isNoStockError(err)
          ? he.shortage.resolveNoStock
          : isOffline
            ? he.shortage.resolveOffline
            : he.shortage.resolveFailed;
        if (mode === "qty") setResolveError(msg);
        else {
          Alert.alert(he.shortage.confirmResolveTitle, msg);
        }
      }
    },
    [resolveMutation, isOffline],
  );

  const requestResolveShortage = useCallback((picked: ShortageListItem) => {
    if (picked.book_stock_quantity <= 0) {
      Alert.alert(he.shortage.confirmResolveTitle, he.shortage.resolveNoStock);
      return;
    }
    if ((picked.missing_count ?? 1) > 1) {
      setResolveError(null);
      setResolveQtyTarget(picked);
      return;
    }
    setResolveConfirmTarget(picked);
  }, []);

  const requestRemoveShortage = useCallback(
    (picked: ShortageListItem) => {
      if (isOffline) {
        Alert.alert(he.shortage.removeShortageOffline);
        return;
      }
      if ((picked.missing_count ?? 1) > 1) {
        setRemoveError(null);
        setRemoveQtyTarget(picked);
        return;
      }
      setRemoveConfirmTarget(picked);
    },
    [isOffline],
  );

  const runRemoveShortage = useCallback(
    async (item: ShortageListItem, quantity: number, mode: "qty" | "confirm") => {
      if (deleteShortageMutation.isPending) return;
      setRemoveError(null);
      try {
        await deleteShortageMutation.mutateAsync({
          shortageId: item.id,
          quantity,
        });
        setRemoveQtyTarget(null);
        setRemoveConfirmTarget(null);
      } catch {
        if (mode === "qty") setRemoveError(he.shortage.removeShortageFailed);
        else {
          Alert.alert(he.shortage.confirmRemoveShortageTitle, he.shortage.removeShortageFailed);
        }
      }
    },
    [deleteShortageMutation],
  );

  const onPriceDraftChange = useCallback((bookId: string, value: string) => {
    setPriceDraft((prev) => ({ ...prev, [bookId]: value }));
  }, []);

  const applyPrice = useCallback(
    async (item: ShortageListItem) => {
      if (busyPriceBookId) return;
      const raw =
        priceDraft[item.book_id] !== undefined
          ? priceDraft[item.book_id].trim()
          : (item.book_price ?? "").trim();
      const priceNum = raw === "" ? null : Number(raw.replace(",", "."));
      if (priceNum !== null && (Number.isNaN(priceNum) || priceNum < 0)) return;
      try {
        setBusyPriceBookId(item.book_id);
        const updated = await patchBook.mutateAsync({
          id: item.book_id,
          patch: { price: priceNum },
        });
        setPriceDraft((prev) => ({
          ...prev,
          [item.book_id]: updated.price == null ? "" : String(updated.price),
        }));
        void queryClient.invalidateQueries({ queryKey: ["shortage"] });
      } catch {
        Alert.alert(he.generic.errorTitle, he.shortage.priceAdjustFailed);
      } finally {
        setBusyPriceBookId(null);
      }
    },
    [busyPriceBookId, priceDraft, patchBook, queryClient],
  );

  const applyStock = useCallback(
    async (item: ShortageListItem, nextQty: number) => {
      if (busyStockBookId) return;
      if (!Number.isInteger(nextQty) || nextQty < 0 || nextQty > 999) return;
      if (nextQty === item.book_stock_quantity) return;
      if (isOffline) {
        Alert.alert(he.generic.errorTitle, he.shortage.stockAdjustOffline);
        return;
      }
      try {
        setBusyStockBookId(item.book_id);
        await patchBook.mutateAsync({
          id: item.book_id,
          patch: { stock_quantity: nextQty },
        });
        void queryClient.invalidateQueries({ queryKey: ["shortage"] });
      } catch {
        Alert.alert(he.generic.errorTitle, he.shortage.stockAdjustFailed);
      } finally {
        setBusyStockBookId(null);
      }
    },
    [busyStockBookId, isOffline, patchBook, queryClient],
  );

  const refreshing = shortageQuery.isFetching && !shortageQuery.isLoading;
  const isInitialLoading = shortageQuery.isLoading;

  const totalMissingCopies = useMemo(
    () => items.reduce((sum, row) => sum + Math.max(row.missing_count, 1), 0),
    [items],
  );
  const filteredMissingCopies = useMemo(
    () => filtered.reduce((sum, row) => sum + Math.max(row.missing_count, 1), 0),
    [filtered],
  );

  const emptyMessage = useMemo(() => {
    if (selectedBookId) return he.shortage.emptyBookFiltered;
    if (supplierId) return he.shortage.emptyFiltered;
    return he.shortage.empty;
  }, [selectedBookId, supplierId]);

  return (
    <>
      <View style={styles.screen}>
        {isOffline ? (
          <View style={styles.offlineBanner}>
            <Ionicons
              name="cloud-offline-outline"
              size={16}
              color={theme.colors.onErrorContainer}
            />
            <Text style={styles.offlineText}>{he.shortage.offlineBanner}</Text>
          </View>
        ) : null}

        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryLabel}>{he.shortage.counts.total}</Text>
            <Text style={styles.summaryValue}>{totalMissingCopies}</Text>
          </View>
          {supplierId || selectedBookId ? (
            <View style={styles.summarySide}>
              <Text style={styles.summaryLabel}>{he.shortage.counts.filtered}</Text>
              <Text style={styles.summaryValue}>{filteredMissingCopies}</Text>
            </View>
          ) : null}
        </View>

        {supplierPickerItems.length > 0 ? (
          <SearchablePickerField
            items={supplierPickerItems}
            valueId={supplierId}
            onChange={onSupplierChange}
            fieldLabel={he.shortage.filterBySupplier}
            emptySelectionLabel={he.shortage.filterAll}
            searchPlaceholder={he.picker.searchInList}
            clearSelectionLabel={he.shortage.filterAll}
            emptyListMessage={he.picker.noMatches}
          />
        ) : null}

        <View style={styles.bookSearchDock}>
          <View style={styles.bookFilterRow}>
            <Ionicons name="search-outline" size={20} color={theme.colors.onSurfaceVariant} />
            <TextInput
              style={styles.bookFilterInput}
              value={bookTitleFilter}
              onChangeText={(text) => {
                setBookTitleFilter(text);
                if (selectedBookId) setSelectedBookId(null);
              }}
              placeholder={he.shortage.bookSearchPlaceholder}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              returnKeyType="search"
              textAlign="left"
              onFocus={onBookSearchFocus}
              onBlur={onBookSearchBlur}
            />
            {hasActiveBookFilter ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={he.shortage.bookSearchClearA11y}
                onPress={clearBookSearchFilter}
                hitSlop={10}
                style={styles.bookFilterClearBtn}
              >
                <Ionicons name="close-circle" size={22} color={theme.colors.onSurfaceVariant} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                bookSuggestionsPanelPinned
                  ? he.shortage.bookDropdownHide
                  : he.shortage.bookDropdownShow
              }
              onPress={toggleBookSuggestionsPanel}
              hitSlop={10}
              style={styles.bookFilterChevronBtn}
            >
              <Ionicons
                name={bookSuggestionsPanelPinned ? "chevron-up-outline" : "chevron-down-outline"}
                size={22}
                color={theme.colors.primary}
              />
            </Pressable>
          </View>

          {showBookDropdown ? (
            <View style={styles.bookDropdownOuter}>
              {filteredSearchBooks.length === 0 ? (
                <Text style={styles.bookDropdownEmptyText}>
                  {he.shortage.bookDropdownNoMatches}
                </Text>
              ) : (
                <>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    style={styles.bookDropdownScroll}
                  >
                    {dropdownSuggestionBooks.map((book) => (
                      <Pressable
                        key={book.id}
                        onPressIn={() => clearBookFilterBlurTimer()}
                        onPress={() => onPickBookFromDropdown(book)}
                        style={({ pressed }) => [
                          styles.bookDropdownRow,
                          book.id === selectedBookId && styles.bookDropdownRowSelected,
                          pressed && styles.bookDropdownRowPressed,
                        ]}
                      >
                        <Text style={styles.bookDropdownTitle} numberOfLines={2}>
                          {book.title}
                        </Text>
                        <Text style={styles.bookDropdownAuthor} numberOfLines={1}>
                          {book.author}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {dropdownSuggestionTruncated ? (
                    <Text style={styles.bookDropdownTruncHint}>
                      {interpolate(he.shortage.bookDropdownTruncated, {
                        shown: String(dropdownSuggestionBooks.length),
                        total: String(filteredSearchBooks.length),
                      })}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </View>

        {isInitialLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.loadingText}>{he.shortage.loading}</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void shortageQuery.refetch()}
                tintColor={theme.colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons
                  name={
                    supplierId || selectedBookId
                      ? "filter-outline"
                      : "checkmark-done-circle-outline"
                  }
                  size={36}
                  color={theme.colors.primary}
                />
                <Text style={styles.emptyText}>{emptyMessage}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <ShortageRow
                item={item}
                busyMoving={moveMutation.isPending && moveTarget?.id === item.id}
                busyCompleting={
                  resolveMutation.isPending &&
                  (resolveQtyTarget?.id === item.id || resolveConfirmTarget?.id === item.id)
                }
                busyRemoving={
                  deleteShortageMutation.isPending &&
                  (removeQtyTarget?.id === item.id || removeConfirmTarget?.id === item.id)
                }
                busyPrice={busyPriceBookId === item.book_id}
                busyStock={busyStockBookId === item.book_id}
                priceDraft={
                  priceDraft[item.book_id] !== undefined
                    ? priceDraft[item.book_id]
                    : (item.book_price ?? "")
                }
                onPriceDraftChange={onPriceDraftChange}
                onApplyPrice={(picked) => void applyPrice(picked)}
                onStockChange={(picked, nextQty) => void applyStock(picked, nextQty)}
                onMoveToOrder={(picked) => setMoveTarget(picked)}
                onComplete={requestResolveShortage}
                onRemove={requestRemoveShortage}
              />
            )}
          />
        )}
      </View>

      <MoveToOrderModal
        key={moveTarget?.id ?? "move-none"}
        visible={moveTarget !== null}
        item={moveTarget}
        submitting={moveMutation.isPending}
        errorMessage={moveError}
        onCancel={closeMove}
        onSubmit={(q) => void submitMove(q)}
      />

      <ShortageQuantityModal
        key={
          resolveQtyTarget
            ? `resolve-${resolveQtyTarget.id}-${resolveQtyTarget.missing_count}`
            : "resolve-none"
        }
        visible={resolveQtyTarget !== null}
        mode="complete"
        item={resolveQtyTarget}
        submitting={resolveMutation.isPending}
        errorMessage={resolveError}
        onCancel={() => {
          setResolveQtyTarget(null);
          setResolveError(null);
        }}
        onSubmit={(q) => {
          if (resolveQtyTarget) void runResolveShortage(resolveQtyTarget, q, "qty");
        }}
      />

      <ConfirmDialog
        visible={resolveConfirmTarget !== null}
        title={he.shortage.confirmResolveTitle}
        message={
          resolveConfirmTarget
            ? `${shortageItemLabel(resolveConfirmTarget)}\n\n${he.shortage.confirmResolveMessage}`
            : undefined
        }
        confirmLabel={he.shortage.confirmResolveOk}
        destructive={false}
        onCancel={() => setResolveConfirmTarget(null)}
        onConfirm={() => {
          if (resolveConfirmTarget) void runResolveShortage(resolveConfirmTarget, 1, "confirm");
        }}
      />

      <ShortageQuantityModal
        key={
          removeQtyTarget
            ? `remove-${removeQtyTarget.id}-${removeQtyTarget.missing_count}`
            : "remove-none"
        }
        visible={removeQtyTarget !== null}
        mode="remove"
        item={removeQtyTarget}
        submitting={deleteShortageMutation.isPending}
        errorMessage={removeError}
        onCancel={() => {
          setRemoveQtyTarget(null);
          setRemoveError(null);
        }}
        onSubmit={(q) => {
          if (removeQtyTarget) void runRemoveShortage(removeQtyTarget, q, "qty");
        }}
      />

      <ConfirmDialog
        visible={removeConfirmTarget !== null}
        title={he.shortage.confirmRemoveShortageTitle}
        message={
          removeConfirmTarget
            ? he.shortage.confirmRemoveShortageMessage.replace(
                "{{item}}",
                shortageItemLabel(removeConfirmTarget),
              )
            : undefined
        }
        confirmLabel={he.shortage.confirmRemoveShortageOk}
        destructive
        onCancel={() => setRemoveConfirmTarget(null)}
        onConfirm={() => {
          if (removeConfirmTarget) void runRemoveShortage(removeConfirmTarget, 1, "confirm");
        }}
      />
    </>
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
  summary: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingTop: theme.spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  summarySide: { alignItems: "flex-start" },
  summaryLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  summaryValue: {
    ...theme.typography.display,
    fontSize: 32,
    lineHeight: 36,
    color: theme.colors.primary,
    textAlign: "left",
  },
  bookSearchDock: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingBottom: theme.spacing.sm,
    zIndex: 2,
  },
  bookFilterRow: {
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
  bookFilterInput: {
    flex: 1,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    paddingVertical: 0,
    minHeight: 24,
    textAlign: "left",
  },
  bookFilterClearBtn: {
    paddingHorizontal: theme.spacing.xs,
    justifyContent: "center",
  },
  bookFilterChevronBtn: {
    paddingHorizontal: theme.spacing.xs,
    justifyContent: "center",
  },
  bookDropdownOuter: {
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  bookDropdownScroll: { maxHeight: 196 },
  bookDropdownRow: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  bookDropdownRowSelected: { backgroundColor: theme.colors.secondaryContainer },
  bookDropdownRowPressed: { backgroundColor: theme.colors.surfaceContainerHighest },
  bookDropdownTitle: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  bookDropdownAuthor: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    marginTop: 2,
  },
  bookDropdownTruncHint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  bookDropdownEmptyText: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },
  list: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  sep: { height: theme.spacing.md },
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
});
