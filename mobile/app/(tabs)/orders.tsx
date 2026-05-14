import { useMemo, useState } from "react";
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
import type { OrderListItem, OrderType, OrdersBySupplierGroup } from "@avihay-books/shared";
import { theme } from "../../src/theme";
import { he } from "../../src/i18n/he";
import {
  mergeOrderLinesForDisplay,
  orderDisplayLineKey,
  useOrdersGroupedBySupplier,
  useOrdersList,
  useRemoveOrderLine,
} from "../../src/api/orders";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { mockOrderList } from "../../src/mocks/shortageOrders";
import { OrderTabs } from "../../src/components/orders/OrderTabs";
import { SupplierOrderCard } from "../../src/components/orders/SupplierOrderCard";
import {
  emailSupplierOrders,
  exportSupplierOrdersToPdf,
} from "../../src/utils/ordersExport";

export default function OrdersScreen(): JSX.Element {
  const [activeTab, setActiveTab] = useState<OrderType>("inventory");
  const [removeOrderTarget, setRemoveOrderTarget] = useState<OrderListItem | null>(null);

  const removeLineMutation = useRemoveOrderLine();

  const inventoryQuery = useOrdersList("inventory");
  const customerQuery = useOrdersList("customer");
  const whatsappQuery = useOrdersList("whatsapp");

  const activeQuery =
    activeTab === "inventory"
      ? inventoryQuery
      : activeTab === "customer"
        ? customerQuery
        : whatsappQuery;

  const isOffline =
    inventoryQuery.isError && customerQuery.isError && whatsappQuery.isError;

  const dataForType = (type: OrderType, items: OrderListItem[] | undefined): OrderListItem[] => {
    if (items && items.length > 0) return items;
    if (isOffline) return mockOrderList.filter((o) => o.order_type === type);
    return items ?? [];
  };

  const inventoryItems = dataForType("inventory", inventoryQuery.data);
  const customerItems = dataForType("customer", customerQuery.data);
  const whatsappItems = dataForType("whatsapp", whatsappQuery.data);

  const activeItems =
    activeTab === "inventory"
      ? inventoryItems
      : activeTab === "customer"
        ? customerItems
        : whatsappItems;

  const groups: OrdersBySupplierGroup[] = useOrdersGroupedBySupplier(activeItems, activeTab);

  const counts: Record<OrderType, number> = useMemo(
    () => ({
      inventory: mergeOrderLinesForDisplay(inventoryItems, "inventory").length,
      customer: mergeOrderLinesForDisplay(customerItems, "customer").length,
      whatsapp: mergeOrderLinesForDisplay(whatsappItems, "whatsapp").length,
    }),
    [inventoryItems, customerItems, whatsappItems],
  );

  const isLoading = activeQuery.isLoading;
  const refreshing = activeQuery.isFetching && !isLoading;

  const askRemoveOrderLine = (order: OrderListItem) => {
    if (isOffline) {
      Alert.alert(he.orders.removeBlockedOffline);
      return;
    }
    setRemoveOrderTarget(order);
  };

  const removingLineKey =
    removeLineMutation.isPending && removeOrderTarget
      ? orderDisplayLineKey(removeOrderTarget)
      : null;

  const confirmRemoveOrderLine = async () => {
    if (!removeOrderTarget || removeLineMutation.isPending) return;
    try {
      await removeLineMutation.mutateAsync(removeOrderTarget);
      setRemoveOrderTarget(null);
    } catch {
      Alert.alert(he.orders.confirmRemoveTitle, he.orders.removeFailed);
    }
  };

  return (
    <View style={styles.screen}>
      {isOffline ? (
        <View style={styles.offlineBanner}>
          <Ionicons
            name="cloud-offline-outline"
            size={16}
            color={theme.colors.onErrorContainer}
          />
          <Text style={styles.offlineText}>{he.orders.offlineBanner}</Text>
        </View>
      ) : null}

      <View style={styles.tabsWrap}>
        <OrderTabs active={activeTab} counts={counts} onChange={setActiveTab} />
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingText}>{he.orders.loading}</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.supplier_id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void inventoryQuery.refetch();
                void customerQuery.refetch();
                void whatsappQuery.refetch();
              }}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cart-outline" size={36} color={theme.colors.primary} />
              <Text style={styles.emptyText}>{he.orders.emptyTab}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <SupplierOrderCard
              group={item}
              orderType={activeTab}
              onExportPdf={(g) => void exportSupplierOrdersToPdf(g)}
              onSendEmail={(g) => void emailSupplierOrders(g)}
              onRemoveOrderLine={askRemoveOrderLine}
              removingOrderLineKey={removingLineKey}
            />
          )}
        />
      )}
      <ConfirmDialog
        visible={removeOrderTarget !== null}
        title={he.orders.confirmRemoveTitle}
        message={
          removeOrderTarget
            ? he.orders.confirmRemoveMessage.replace("{{title}}", removeOrderTarget.book_title)
            : ""
        }
        confirmLabel={he.orders.confirmRemoveConfirm}
        cancelLabel={he.generic.cancel}
        destructive
        onCancel={() => setRemoveOrderTarget(null)}
        onConfirm={() => void confirmRemoveOrderLine()}
      />
    </View>
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
    textAlign: "right",
    writingDirection: "rtl",
  },
  tabsWrap: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  list: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingBottom: theme.spacing.xl,
  },
  sep: { height: theme.spacing.md },
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
    writingDirection: "rtl",
  },
});
