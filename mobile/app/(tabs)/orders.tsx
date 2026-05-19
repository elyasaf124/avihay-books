import { useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderListItem, OrderType } from "@avihay-books/shared";
import { theme } from "../../src/theme";
import { he } from "../../src/i18n/he";
import {
  augmentInventoryGroupsWithCustomerWhatsappTotals,
  mergeOrderLinesForDisplay,
  orderDisplayLineKey,
  summedCustomerAndWhatsappQtyByBookSupplier,
  useOrdersGroupedBySupplier,
  useOrdersList,
  useRemoveOrderLine,
} from "../../src/api/orders";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { CustomerDemandOrderModal } from "../../src/components/orders/CustomerDemandOrderModal";
import { mockOrderList } from "../../src/mocks/shortageOrders";
import { OrderTabs } from "../../src/components/orders/OrderTabs";
import { SupplierOrderCard } from "../../src/components/orders/SupplierOrderCard";
import {
  emailSupplierOrders,
  exportSupplierOrdersToPdf,
} from "../../src/utils/ordersExport";

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  headerTitleBar: {
    height: 44,
  },
  headerTitleRightSlot: {
    position: "absolute",
    /** קצה ימין פיזי — מתאים ל־`RTL` עם כותרת «הזמנות» */
    right: theme.spacing.marginMobile,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    maxWidth: "52%",
    zIndex: 1,
  },
  headerTitleRightText: {
    ...theme.typography.headlineSm,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.primary,
    textAlign: "right",
  },
  headerOrderBtnSlot: {
    position: "absolute",
    /** שמאל פיזי + ריווח קל שלא יידבק לשולי המסך */
    left: theme.spacing.marginMobile + theme.spacing.sm,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 2,
  },
  headerOrderBtn: {
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  headerOrderBtnPressed: { opacity: 0.88, backgroundColor: theme.colors.surfaceContainerLow },
  headerOrderBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    letterSpacing: 0,
  },
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
  },
});

function OrdersTabHeaderTitle({ onCustomerOrder }: { onCustomerOrder: () => void }): JSX.Element {
  const { width } = useWindowDimensions();
  return (
    <View style={[styles.headerTitleBar, { width }]} pointerEvents="box-none">
      <View style={styles.headerOrderBtnSlot} pointerEvents="box-none">
        <Pressable
          onPress={onCustomerOrder}
          style={({ pressed }) => [styles.headerOrderBtn, pressed && styles.headerOrderBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={he.orders.customerOrderHeaderButtonA11y}
        >
          <Text style={styles.headerOrderBtnText}>{he.orders.customerOrderHeaderButton}</Text>
        </Pressable>
      </View>
      <View style={styles.headerTitleRightSlot} pointerEvents="none">
        <Text style={styles.headerTitleRightText} numberOfLines={1}>
          {he.tabs.orders}
        </Text>
      </View>
    </View>
  );
}

export default function OrdersScreen(): JSX.Element {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<OrderType>("inventory");
  const [removeOrderTarget, setRemoveOrderTarget] = useState<OrderListItem | null>(null);
  const [customerOrderOpen, setCustomerOrderOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => null,
      headerRight: () => null,
      headerTitle: () => <OrdersTabHeaderTitle onCustomerOrder={() => setCustomerOrderOpen(true)} />,
      /** מאפשר למדור הכותרת להימתח על כל רוחב המסך כדי ש־`left` על הכפתור יהיה מול השוליים */
      headerTitleContainerStyle: { position: "absolute", left: 0, right: 0 },
    });
  }, [navigation]);

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

  const baseGroups = useOrdersGroupedBySupplier(activeItems, activeTab);

  const extraCustomerWhatsappByBookSupplier = useMemo(
    () => summedCustomerAndWhatsappQtyByBookSupplier([...customerItems, ...whatsappItems]),
    [customerItems, whatsappItems],
  );

  const groups = useMemo(() => {
    if (activeTab !== "inventory") return baseGroups;
    return augmentInventoryGroupsWithCustomerWhatsappTotals(
      baseGroups,
      extraCustomerWhatsappByBookSupplier,
    );
  }, [activeTab, baseGroups, extraCustomerWhatsappByBookSupplier]);

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
      <CustomerDemandOrderModal
        visible={customerOrderOpen}
        onClose={() => setCustomerOrderOpen(false)}
        isOffline={isOffline}
        onCreated={() => setActiveTab("customer")}
      />
    </View>
  );
}
