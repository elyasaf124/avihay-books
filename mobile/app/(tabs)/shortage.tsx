import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useSuppliersWithFallback } from "../../src/api/unit";
import { mockShortageList } from "../../src/mocks/shortageOrders";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import {
  SearchablePickerField,
  suppliersToPickerItems,
} from "../../src/components/pickers/SearchablePicker";
import { ShortageRow } from "../../src/components/shortage/ShortageRow";
import { MoveToOrderModal } from "../../src/components/shortage/MoveToOrderModal";

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
        author: row.book_author,
      });
    }
  }
  return [...byBookId.values()].sort((a, b) => a.title.localeCompare(b.title, "he"));
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

export default function ShortageScreen(): JSX.Element {
  const shortageQuery = useShortageList();
  const moveMutation = useMoveShortageToOrder();
  const resolveMutation = useUpdateShortageStatus();
  const deleteShortageMutation = useDeleteShortage();
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
  const [resolveTarget, setResolveTarget] = useState<ShortageListItem | null>(null);
  const [removeShortageTarget, setRemoveShortageTarget] = useState<ShortageListItem | null>(
    null,
  );

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
    return rows;
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

  const confirmResolveShortage = useCallback(async () => {
    if (!resolveTarget || resolveMutation.isPending) return;
    try {
      await resolveMutation.mutateAsync({
        shortageId: resolveTarget.id,
        status: "completed",
      });
      setResolveTarget(null);
    } catch {
      Alert.alert(
        he.shortage.confirmResolveTitle,
        isOffline ? he.shortage.resolveOffline : he.shortage.resolveFailed,
      );
    }
  }, [resolveTarget, resolveMutation, isOffline]);

  const requestRemoveShortage = useCallback(
    (_picked: ShortageListItem) => {
      if (isOffline) {
        Alert.alert(he.shortage.removeShortageOffline);
        return;
      }
      setRemoveShortageTarget(_picked);
    },
    [isOffline],
  );

  const confirmRemoveShortage = useCallback(async () => {
    if (!removeShortageTarget || deleteShortageMutation.isPending) return;
    try {
      await deleteShortageMutation.mutateAsync(removeShortageTarget.id);
      setRemoveShortageTarget(null);
    } catch {
      Alert.alert(he.shortage.confirmRemoveShortageTitle, he.shortage.removeShortageFailed);
    }
  }, [removeShortageTarget, deleteShortageMutation]);

  const refreshing = shortageQuery.isFetching && !shortageQuery.isLoading;
  const isInitialLoading = shortageQuery.isLoading;

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
            <Text style={styles.summaryValue}>{items.length}</Text>
          </View>
          {supplierId || selectedBookId ? (
            <View style={styles.summarySide}>
              <Text style={styles.summaryLabel}>{he.shortage.counts.filtered}</Text>
              <Text style={styles.summaryValue}>{filtered.length}</Text>
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
                  resolveMutation.isPending && resolveTarget?.id === item.id
                }
                busyRemoving={
                  deleteShortageMutation.isPending && removeShortageTarget?.id === item.id
                }
                onMoveToOrder={(picked) => setMoveTarget(picked)}
                onComplete={(picked) => setResolveTarget(picked)}
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

      <ConfirmDialog
        visible={resolveTarget !== null}
        title={he.shortage.confirmResolveTitle}
        message={
          resolveTarget
            ? `${shortageItemLabel(resolveTarget)}\n\n${he.shortage.confirmResolveMessage}`
            : undefined
        }
        confirmLabel={he.shortage.confirmResolveOk}
        destructive={false}
        onCancel={() => setResolveTarget(null)}
        onConfirm={() => void confirmResolveShortage()}
      />

      <ConfirmDialog
        visible={removeShortageTarget !== null}
        title={he.shortage.confirmRemoveShortageTitle}
        message={
          removeShortageTarget
            ? he.shortage.confirmRemoveShortageMessage.replace(
                "{{item}}",
                shortageItemLabel(removeShortageTarget),
              )
            : undefined
        }
        confirmLabel={he.shortage.confirmRemoveShortageOk}
        destructive
        onCancel={() => setRemoveShortageTarget(null)}
        onConfirm={() => void confirmRemoveShortage()}
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
