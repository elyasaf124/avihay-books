import { Ionicons } from "@expo/vector-icons";
import type { Supplier } from "@avihay-books/shared";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import {
  isSupplierHasDependenciesError,
  useDeleteSupplier,
  useSuppliers,
  useUpsertSupplier,
} from "../../src/api/suppliers";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import {
  interpolate,
  SupplierFormModal,
} from "../../src/components/suppliers/SupplierFormModal";
import { he } from "../../src/i18n/he";
import { theme } from "../../src/theme";

export default function SuppliersScreen(): JSX.Element {
  const suppliersQuery = useSuppliers();
  const upsertMutation = useUpsertSupplier();
  const deleteMutation = useDeleteSupplier();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const suppliers = suppliersQuery.data ?? [];

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((supplier: Supplier) => {
    setEditTarget(supplier);
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    if (upsertMutation.isPending) return;
    setFormOpen(false);
    setEditTarget(null);
  }, [upsertMutation.isPending]);

  const handleSubmit = useCallback(
    async (payload: { name: string; email: string; color_hex: string }) => {
      try {
        await upsertMutation.mutateAsync({
          id: editTarget?.id,
          ...payload,
        });
        setFormOpen(false);
        setEditTarget(null);
      } catch {
        Alert.alert(he.generic.errorTitle, he.suppliers.saveFailed);
      }
    },
    [editTarget, upsertMutation],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      if (isSupplierHasDependenciesError(err)) {
        const { book_count, order_count } = err.response.data.details;
        Alert.alert(
          he.suppliers.deleteBlockedTitle,
          interpolate(he.suppliers.deleteBlockedMessage, {
            name: deleteTarget.name,
            books: String(book_count),
            orders: String(order_count),
          }),
        );
      } else {
        Alert.alert(he.generic.errorTitle, he.suppliers.deleteFailed);
      }
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMutation]);

  const renderItem = useCallback(
    ({ item }: { item: Supplier }) => (
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
          onPress={() => openEdit(item)}
        >
          <View style={[styles.dot, { backgroundColor: item.color_hex }]} />
          <View style={styles.rowText}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.rowEmail} numberOfLines={1}>
              {item.email}
            </Text>
          </View>
          <Ionicons name="chevron-back" size={18} color={theme.colors.onSurfaceVariant} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.deleteBtn, pressed && styles.rowPressed]}
          onPress={() => setDeleteTarget(item)}
          accessibilityLabel={he.generic.delete}
        >
          <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
        </Pressable>
      </View>
    ),
    [openEdit],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: he.suppliers.title,
          headerBackTitle: he.tabs.addRemove,
        }}
      />

      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <View style={styles.toolbar}>
          <Pressable style={styles.addBtn} onPress={openCreate}>
            <Ionicons name="add-circle-outline" size={20} color={theme.colors.onPrimary} />
            <Text style={styles.addBtnText}>{he.suppliers.addNew}</Text>
          </Pressable>
        </View>

        {suppliersQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.hint}>{he.suppliers.loading}</Text>
          </View>
        ) : suppliersQuery.isError ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={40} color={theme.colors.error} />
            <Text style={styles.errorHint}>{he.suppliers.loadError}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void suppliersQuery.refetch()}>
              <Text style={styles.retryText}>{he.home.retry}</Text>
            </Pressable>
          </View>
        ) : suppliers.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="people-outline" size={40} color={theme.colors.onSurfaceVariant} />
            <Text style={styles.hint}>{he.suppliers.empty}</Text>
            <Pressable style={styles.addBtnSecondary} onPress={openCreate}>
              <Text style={styles.addBtnSecondaryText}>{he.suppliers.addNew}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={suppliers}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={suppliersQuery.isFetching && !suppliersQuery.isLoading}
                onRefresh={() => void suppliersQuery.refetch()}
                tintColor={theme.colors.primary}
              />
            }
          />
        )}
      </SafeAreaView>

      <SupplierFormModal
        visible={formOpen}
        supplier={editTarget}
        submitting={upsertMutation.isPending}
        onClose={closeForm}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        visible={deleteTarget != null}
        title={he.suppliers.deleteConfirmTitle}
        message={
          deleteTarget
            ? interpolate(he.suppliers.deleteConfirmMessage, { name: deleteTarget.name })
            : undefined
        }
        confirmLabel={he.generic.delete}
        destructive
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => {
          if (!deleteMutation.isPending) setDeleteTarget(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  toolbar: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingVertical: theme.spacing.sm,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  addBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
    fontSize: 14,
  },
  addBtnSecondary: {
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  addBtnSecondaryText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
  },
  list: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    overflow: "hidden",
    marginBottom: theme.spacing.sm,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  rowPressed: { opacity: 0.75 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: theme.radius.full,
  },
  rowText: { flex: 1, gap: 2 },
  rowName: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  rowEmail: {
    ...theme.typography.bodyMd,
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  deleteBtn: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    borderStartWidth: StyleSheet.hairlineWidth,
    borderStartColor: theme.colors.outlineVariant,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  hint: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
  },
  errorHint: {
    ...theme.typography.bodyMd,
    color: theme.colors.error,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.primaryContainer,
    borderRadius: theme.radius.md,
  },
  retryText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
  },
});
