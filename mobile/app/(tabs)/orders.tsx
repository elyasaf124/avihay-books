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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { OrderListItem, OrderType, OrdersBySupplierGroup } from "@avihay-books/shared";
import { theme } from "../../src/theme";
import { he } from "../../src/i18n/he";
import {
  augmentInventoryGroupsWithCustomerWhatsappTotals,
  customerOrderBundleKey,
  inventorySupplierBookKey,
  isOpenOrder,
  mergeOrderLinesForDisplay,
  orderDisplayLineKey,
  supplierGroupKey,
  summedCustomerAndWhatsappQtyByBookSupplier,
  summedInventoryBaseQtyBySupplierBook,
  useOrdersGroupedByCustomer,
  useOrdersGroupedBySupplier,
  filterActiveDemandOrders,
  isArchivedOrder,
  useArchiveOrderLine,
  useOrdersList,
  useRemoveOrderLine,
  useToggleInventorySupplierOrderedStatus,
  useUpdateInventoryOrderQuantity,
} from "../../src/api/orders";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { CustomerDemandOrderModal } from "../../src/components/orders/CustomerDemandOrderModal";
import { CustomerOrderCard, customerGroupListKey } from "../../src/components/orders/CustomerOrderCard";
import { InventoryOrderCreateModal } from "../../src/components/orders/InventoryOrderCreateModal";
import { InventoryOrderQtyModal } from "../../src/components/orders/InventoryOrderQtyModal";
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
    left: theme.spacing.marginMobile,
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
    textAlign: "left",
  },
  headerOrderBtnSlot: {
    position: "absolute",
    /** שמאל פיזי + ריווח קל שלא יידבק לשולי המסך */
    right: theme.spacing.marginMobile + theme.spacing.sm,
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
  historyHeader: {
    marginBottom: theme.spacing.md,
  },
  historyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  historyBtnPressed: { opacity: 0.88, backgroundColor: theme.colors.surfaceContainerLow },
  historyBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
  },
});

function OrdersTabHeaderTitle({
  activeTab,
  onPress,
}: {
  activeTab: OrderType;
  onPress: () => void;
}): JSX.Element {
  const { width } = useWindowDimensions();

  if (activeTab === "whatsapp") {
    return (
      <View style={[styles.headerTitleBar, { width }]} pointerEvents="box-none">
        <View style={styles.headerTitleRightSlot} pointerEvents="none">
          <Text style={styles.headerTitleRightText} numberOfLines={1}>
            {he.tabs.orders}
          </Text>
        </View>
      </View>
    );
  }

  const isInventory = activeTab === "inventory";
  const buttonLabel = isInventory
    ? he.orders.inventoryOrderHeaderButton
    : he.orders.customerOrderHeaderButton;
  const buttonA11y = isInventory
    ? he.orders.inventoryOrderHeaderButtonA11y
    : he.orders.customerOrderHeaderButtonA11y;

  return (
    <View style={[styles.headerTitleBar, { width }]} pointerEvents="box-none">
      <View style={styles.headerOrderBtnSlot} pointerEvents="box-none">
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.headerOrderBtn, pressed && styles.headerOrderBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={buttonA11y}
        >
          <Text style={styles.headerOrderBtnText}>{buttonLabel}</Text>
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<OrderType>("inventory");
  const [removeOrderTarget, setRemoveOrderTarget] = useState<OrderListItem | null>(null);
  const [finishOrderTarget, setFinishOrderTarget] = useState<OrderListItem | null>(null);
  const [toggleSupplierTarget, setToggleSupplierTarget] = useState<OrdersBySupplierGroup | null>(
    null,
  );
  const [customerOrderOpen, setCustomerOrderOpen] = useState(false);
  const [inventoryOrderOpen, setInventoryOrderOpen] = useState(false);
  const [editDemandBundle, setEditDemandBundle] = useState<{
    orderType: "customer" | "whatsapp";
    items: OrderListItem[];
  } | null>(null);
  const [editInventoryTarget, setEditInventoryTarget] = useState<OrderListItem | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => null,
      headerRight: () => null,
      headerTitle: () => (
        <OrdersTabHeaderTitle
          activeTab={activeTab}
          onPress={() => {
            if (activeTab === "inventory") {
              setInventoryOrderOpen(true);
            } else if (activeTab === "customer") {
              setCustomerOrderOpen(true);
            }
          }}
        />
      ),
      /** מאפשר למדור הכותרת להימתח על כל רוחב המסך כדי ש־`left` על הכפתור יהיה מול השוליים */
      headerTitleContainerStyle: { position: "absolute", left: 0, right: 0 },
    });
  }, [navigation, activeTab]);

  const removeLineMutation = useRemoveOrderLine();
  const archiveLineMutation = useArchiveOrderLine();
  const toggleSupplierMutation = useToggleInventorySupplierOrderedStatus();
  const updateInventoryQtyMutation = useUpdateInventoryOrderQuantity();

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
  const rawInventoryItems = inventoryQuery.data ?? [];

  const inventoryBaseQtyByKey = useMemo(
    () => summedInventoryBaseQtyBySupplierBook(rawInventoryItems),
    [rawInventoryItems],
  );


  const customerItemsActive = useMemo(
    () => filterActiveDemandOrders(customerItems),
    [customerItems],
  );
  const whatsappItemsActive = useMemo(
    () => filterActiveDemandOrders(whatsappItems),
    [whatsappItems],
  );

  const inventorySupplierGroups = useOrdersGroupedBySupplier(inventoryItems, "inventory");
  const customerGroups = useOrdersGroupedByCustomer(customerItemsActive, "customer");
  const whatsappGroups = useOrdersGroupedByCustomer(whatsappItemsActive, "whatsapp");

  const extraCustomerWhatsappByBookSupplier = useMemo(
    () =>
      summedCustomerAndWhatsappQtyByBookSupplier(
        [...customerItems, ...whatsappItems].filter(isOpenOrder),
      ),
    [customerItems, whatsappItems],
  );

  const inventoryGroups = useMemo(() => {
    const openDemandItems = [...customerItems, ...whatsappItems].filter(isOpenOrder);
    const augmented = augmentInventoryGroupsWithCustomerWhatsappTotals(
      inventorySupplierGroups,
      extraCustomerWhatsappByBookSupplier,
      openDemandItems,
    );
    return augmented.map((g) =>
      g.supplier_id === null
        ? { ...g, supplier_name: he.orders.unassignedSupplierGroup }
        : g,
    );
  }, [
    inventorySupplierGroups,
    extraCustomerWhatsappByBookSupplier,
    customerItems,
    whatsappItems,
  ]);

  const demandGroups =
    activeTab === "customer" ? customerGroups : whatsappGroups;

  const counts: Record<OrderType, number> = useMemo(
    () => ({
      inventory: mergeOrderLinesForDisplay(inventoryItems, "inventory").length,
      customer: mergeOrderLinesForDisplay(customerItemsActive, "customer").length,
      whatsapp: mergeOrderLinesForDisplay(whatsappItemsActive, "whatsapp").length,
    }),
    [inventoryItems, customerItemsActive, whatsappItemsActive],
  );

  const isLoading = activeQuery.isLoading;
  const refreshing = activeQuery.isFetching && !isLoading;

  const askRemoveOrderLine = (order: OrderListItem) => {
    if (isOffline) {
      Alert.alert(he.orders.removeBlockedOffline);
      return;
    }
    if (order.status === "completed" || order.status === "archived") return;
    setRemoveOrderTarget(order);
  };

  const askFinishOrderLine = (order: OrderListItem) => {
    if (isOffline) {
      Alert.alert(he.orders.removeBlockedOffline);
      return;
    }
    if (order.status !== "completed") return;
    setFinishOrderTarget(order);
  };

  const toggleSupplierOrderedStatus = async (group: OrdersBySupplierGroup) => {
    if (isOffline) {
      Alert.alert(he.orders.toggleOrderedBlockedOffline);
      return;
    }
    if (toggleSupplierMutation.isPending) return;
    setToggleSupplierTarget(group);
    try {
      await toggleSupplierMutation.mutateAsync(group);
    } catch {
      Alert.alert(he.generic.errorTitle, he.orders.toggleOrderedFailed);
    } finally {
      setToggleSupplierTarget(null);
    }
  };

  const removingLineKey =
    removeLineMutation.isPending && removeOrderTarget
      ? orderDisplayLineKey(removeOrderTarget)
      : null;

  const finishingLineKey =
    archiveLineMutation.isPending && finishOrderTarget
      ? orderDisplayLineKey(finishOrderTarget)
      : null;

  const confirmFinishOrderLine = async () => {
    if (!finishOrderTarget || archiveLineMutation.isPending) return;
    try {
      await archiveLineMutation.mutateAsync(finishOrderTarget);
      setFinishOrderTarget(null);
    } catch {
      Alert.alert(he.generic.errorTitle, he.orders.finishOrderFailed);
    }
  };

  const confirmRemoveOrderLine = async () => {
    if (!removeOrderTarget || removeLineMutation.isPending) return;
    try {
      await removeLineMutation.mutateAsync({
        order: removeOrderTarget,
        tab: activeTab,
        rawInventory: rawInventoryItems,
        customerItems,
        whatsappItems,
      });
      setRemoveOrderTarget(null);
    } catch {
      Alert.alert(he.orders.confirmRemoveTitle, he.orders.removeFailed);
    }
  };

  const openEditDemandBundle = (line: OrderListItem, orderType: "customer" | "whatsapp") => {
    if (isOffline) {
      Alert.alert(he.orders.removeBlockedOffline);
      return;
    }
    const key = customerOrderBundleKey(line);
    const source = orderType === "customer" ? customerQuery.data : whatsappQuery.data;
    const bundle = (source ?? []).filter(
      (o) => customerOrderBundleKey(o) === key && !isArchivedOrder(o),
    );
    if (bundle.length === 0) return;
    setEditDemandBundle({ orderType, items: bundle });
  };

  const openEditOrderLine = (line: OrderListItem) => {
    if (isOffline) {
      Alert.alert(he.orders.removeBlockedOffline);
      return;
    }
    if (activeTab === "inventory") {
      setEditInventoryTarget(line);
      return;
    }
    if (activeTab === "customer") {
      openEditDemandBundle(line, "customer");
      return;
    }
    if (activeTab === "whatsapp") {
      openEditDemandBundle(line, "whatsapp");
    }
  };

  const confirmUpdateInventoryQty = async (line: OrderListItem, newBaseQty: number) => {
    if (updateInventoryQtyMutation.isPending) return;
    try {
      await updateInventoryQtyMutation.mutateAsync({
        rawInventory: rawInventoryItems,
        line,
        newBaseQty,
      });
      setEditInventoryTarget(null);
      Alert.alert(he.orders.customerOrderSuccessTitle, he.orders.inventoryOrderEditQtySuccess);
    } catch {
      Alert.alert(he.generic.errorTitle, he.orders.inventoryOrderEditQtyFailed);
    }
  };

  const editInventoryBaseQty = editInventoryTarget
    ? (inventoryBaseQtyByKey.get(inventorySupplierBookKey(editInventoryTarget)) ?? 0)
    : 0;
  const editInventoryExtraQty = editInventoryTarget
    ? (extraCustomerWhatsappByBookSupplier.get(inventorySupplierBookKey(editInventoryTarget)) ?? 0)
    : 0;

  const updatingOrderLineKey =
    updateInventoryQtyMutation.isPending && editInventoryTarget
      ? orderDisplayLineKey(editInventoryTarget)
      : null;

  const togglingSupplierKey =
    toggleSupplierMutation.isPending && toggleSupplierTarget
      ? supplierGroupKey(toggleSupplierTarget.supplier_id)
      : null;

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
      ) : activeTab === "inventory" ? (
        <FlatList
          data={inventoryGroups}
          keyExtractor={(g) => g.supplier_id ?? "__unassigned__"}
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
              orderType="inventory"
              onExportPdf={(g) => void exportSupplierOrdersToPdf(g)}
              onSendEmail={(g) => void emailSupplierOrders(g)}
              onRemoveOrderLine={askRemoveOrderLine}
              onEditOrderLine={isOffline ? undefined : openEditOrderLine}
              onToggleSupplierOrdered={isOffline ? undefined : toggleSupplierOrderedStatus}
              removingOrderLineKey={removingLineKey}
              updatingOrderLineKey={updatingOrderLineKey}
              togglingSupplierKey={togglingSupplierKey}
            />
          )}
        />
      ) : (
        <FlatList
          data={demandGroups}
          keyExtractor={customerGroupListKey}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListHeaderComponent={
            activeTab === "customer" ? (
              <View style={styles.historyHeader}>
                <Pressable
                  onPress={() => router.push("/customer-orders-history")}
                  style={({ pressed }) => [
                    styles.historyBtn,
                    pressed && styles.historyBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={he.orders.customerHistoryButtonA11y}
                >
                  <Ionicons name="time-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.historyBtnText}>{he.orders.customerHistoryButton}</Text>
                </Pressable>
              </View>
            ) : null
          }
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
            <CustomerOrderCard
              group={item}
              showOrderedIndicator={activeTab === "customer"}
              onRemoveOrderLine={isOffline ? undefined : askRemoveOrderLine}
              onFinishOrderLine={isOffline ? undefined : askFinishOrderLine}
              onEditOrderLine={isOffline ? undefined : openEditOrderLine}
              removingOrderLineKey={removingLineKey}
              finishingOrderLineKey={finishingLineKey}
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
      <ConfirmDialog
        visible={finishOrderTarget !== null}
        title={he.orders.confirmFinishOrderTitle}
        message={
          finishOrderTarget
            ? he.orders.confirmFinishOrderMessage.replace(
                "{{title}}",
                finishOrderTarget.book_title,
              )
            : ""
        }
        confirmLabel={he.orders.confirmFinishOrderConfirm}
        cancelLabel={he.generic.cancel}
        onCancel={() => setFinishOrderTarget(null)}
        onConfirm={() => void confirmFinishOrderLine()}
      />
      <CustomerDemandOrderModal
        visible={customerOrderOpen}
        onClose={() => setCustomerOrderOpen(false)}
        isOffline={isOffline}
        onCreated={() => setActiveTab("customer")}
      />
      <InventoryOrderCreateModal
        visible={inventoryOrderOpen}
        onClose={() => setInventoryOrderOpen(false)}
        isOffline={isOffline}
        rawInventoryItems={rawInventoryItems}
        onCreated={() => setActiveTab("inventory")}
      />
      <CustomerDemandOrderModal
        visible={editDemandBundle !== null}
        onClose={() => setEditDemandBundle(null)}
        isOffline={isOffline}
        mode="edit"
        demandOrderType={editDemandBundle?.orderType ?? "customer"}
        initialBundle={editDemandBundle?.items}
        onUpdated={() => setActiveTab(editDemandBundle?.orderType ?? "customer")}
      />
      <InventoryOrderQtyModal
        key={
          editInventoryTarget
            ? `${inventorySupplierBookKey(editInventoryTarget)}-${editInventoryBaseQty}`
            : "closed"
        }
        visible={editInventoryTarget !== null}
        order={editInventoryTarget}
        inventoryQuantity={editInventoryBaseQty}
        customerQuantity={editInventoryExtraQty}
        submitting={updateInventoryQtyMutation.isPending}
        onCancel={() => setEditInventoryTarget(null)}
        onSubmit={(qty) => {
          if (editInventoryTarget) {
            void confirmUpdateInventoryQty(editInventoryTarget, qty);
          }
        }}
      />
    </View>
  );
}
