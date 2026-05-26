import { useMemo, useState } from "react";

import {

  ActivityIndicator,

  Alert,

  FlatList,

  I18nManager,

  Pressable,

  RefreshControl,

  StyleSheet,

  Text,

  View,

} from "react-native";

import { Stack, useRouter } from "expo-router";

import { Ionicons } from "@expo/vector-icons";

import type { OrderListItem } from "@avihay-books/shared";

import {

  filterCompletedOrders,

  orderDisplayLineKey,

  useOrdersGroupedByCustomer,

  useOrdersList,

  useRemoveHistoryOrderLine,

} from "../../src/api/orders";

import { ConfirmDialog } from "../../src/components/ConfirmDialog";

import {

  CustomerOrderCard,

  customerGroupListKey,

} from "../../src/components/orders/CustomerOrderCard";

import { he } from "../../src/i18n/he";

import { mockOrderList } from "../../src/mocks/shortageOrders";

import { theme } from "../../src/theme";



const styles = StyleSheet.create({

  screen: { flex: 1, backgroundColor: theme.colors.background },

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

  headerBackBtn: {

    alignItems: "center",

    justifyContent: "center",

    paddingVertical: 6,

    paddingHorizontal: theme.spacing.sm,

    marginStart: theme.spacing.xs,

  },

  headerBackBtnPressed: { opacity: 0.72 },

});



export default function CustomerOrdersHistoryScreen(): JSX.Element {

  const router = useRouter();

  const customerQuery = useOrdersList("customer");

  const removeHistoryMutation = useRemoveHistoryOrderLine();

  const [removeTarget, setRemoveTarget] = useState<OrderListItem | null>(null);

  const isOffline = customerQuery.isError;



  const customerItems = useMemo(() => {

    const items = customerQuery.data;

    if (items && items.length > 0) return items;

    if (isOffline) return mockOrderList.filter((o) => o.order_type === "customer");

    return items ?? [];

  }, [customerQuery.data, isOffline]);



  const historyItems = useMemo(

    () => filterCompletedOrders(customerItems),

    [customerItems],

  );



  const historyGroups = useOrdersGroupedByCustomer(historyItems, "customer");



  const isLoading = customerQuery.isLoading;

  const refreshing = customerQuery.isFetching && !isLoading;



  const askRemoveFromHistory = (order: OrderListItem) => {

    if (isOffline) {

      Alert.alert(he.orders.removeBlockedOffline);

      return;

    }

    setRemoveTarget(order);

  };



  const confirmRemoveFromHistory = async () => {

    if (!removeTarget || removeHistoryMutation.isPending) return;

    try {

      await removeHistoryMutation.mutateAsync(removeTarget);

      setRemoveTarget(null);

    } catch {

      Alert.alert(he.orders.confirmHistoryRemoveTitle, he.orders.removeFailed);

    }

  };



  const removingLineKey =

    removeHistoryMutation.isPending && removeTarget

      ? orderDisplayLineKey(removeTarget)

      : null;



  return (

    <>

      <Stack.Screen

        options={{

          title: he.orders.customerHistoryTitle,

          headerBackVisible: false,

          headerLeft: () => (

            <Pressable

              onPress={() => router.replace("/orders")}

              style={({ pressed }) => [

                styles.headerBackBtn,

                pressed && styles.headerBackBtnPressed,

              ]}

              accessibilityRole="button"

              accessibilityLabel={he.orders.customerHistoryBack}

            >

              <Ionicons

                name={I18nManager.isRTL ? "chevron-forward" : "chevron-back"}

                size={24}

                color={theme.colors.primary}

              />

            </Pressable>

          ),

        }}

      />



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



        {isLoading ? (

          <View style={styles.loadingBox}>

            <ActivityIndicator color={theme.colors.primary} />

            <Text style={styles.loadingText}>{he.orders.loading}</Text>

          </View>

        ) : (

          <FlatList

            data={historyGroups}

            keyExtractor={customerGroupListKey}

            contentContainerStyle={styles.list}

            ItemSeparatorComponent={() => <View style={styles.sep} />}

            refreshControl={

              <RefreshControl

                refreshing={refreshing}

                onRefresh={() => void customerQuery.refetch()}

                tintColor={theme.colors.primary}

              />

            }

            ListEmptyComponent={

              <View style={styles.empty}>

                <Ionicons name="time-outline" size={36} color={theme.colors.primary} />

                <Text style={styles.emptyText}>{he.orders.customerHistoryEmpty}</Text>

              </View>

            }

            renderItem={({ item }) => (

              <CustomerOrderCard

                group={item}

                variant="history"

                onRemoveOrderLine={isOffline ? undefined : askRemoveFromHistory}

                removingOrderLineKey={removingLineKey}

              />

            )}

          />

        )}

      </View>



      <ConfirmDialog

        visible={removeTarget !== null}

        title={he.orders.confirmHistoryRemoveTitle}

        message={

          removeTarget

            ? he.orders.confirmHistoryRemoveMessage.replace("{{title}}", removeTarget.book_title)

            : ""

        }

        confirmLabel={he.orders.confirmHistoryRemoveConfirm}

        cancelLabel={he.generic.cancel}

        destructive

        onCancel={() => setRemoveTarget(null)}

        onConfirm={() => void confirmRemoveFromHistory()}

      />

    </>

  );

}

