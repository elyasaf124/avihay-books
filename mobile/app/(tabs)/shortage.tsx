import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
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
  const [moveTarget, setMoveTarget] = useState<ShortageListItem | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<ShortageListItem | null>(null);
  const [removeShortageTarget, setRemoveShortageTarget] = useState<ShortageListItem | null>(
    null,
  );

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
    if (!supplierId) return items;
    return items.filter((i) => i.supplier_id === supplierId);
  }, [items, supplierId]);

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
          {supplierId ? (
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
            onChange={setSupplierId}
            fieldLabel={he.shortage.filterBySupplier}
            emptySelectionLabel={he.shortage.filterAll}
            searchPlaceholder={he.picker.searchInList}
            clearSelectionLabel={he.shortage.filterAll}
            emptyListMessage={he.picker.noMatches}
          />
        ) : null}

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
                  name={supplierId ? "filter-outline" : "checkmark-done-circle-outline"}
                  size={36}
                  color={theme.colors.primary}
                />
                <Text style={styles.emptyText}>
                  {supplierId ? he.shortage.emptyFiltered : he.shortage.empty}
                </Text>
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
        message={he.shortage.confirmResolveMessage}
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
                "{{title}}",
                removeShortageTarget.book_title,
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
