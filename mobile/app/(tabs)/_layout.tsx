import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, type ViewStyle } from "react-native";
import { StitchTabBar } from "../../src/components/StitchTabBar";
import { StoreMapFilterProvider } from "../../src/context/StoreMapFilterContext";
import { theme } from "../../src/theme";
import { he } from "../../src/i18n/he";
import { useUnreadPushNotifier } from "../../src/hooks/useUnreadPushNotifier";

const tabHeaderStyle: ViewStyle = {
  backgroundColor: theme.colors.surface,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: theme.colors.outlineVariant,
};

export default function TabsLayout(): JSX.Element {
  const { unreadCount } = useUnreadPushNotifier();
  return (
    <StoreMapFilterProvider>
    <Tabs
      tabBar={(props) => <StitchTabBar {...props} />}
      screenOptions={{
        headerStyle: tabHeaderStyle,
        headerTintColor: theme.colors.primary,
        headerTitleStyle: {
          fontWeight: "700",
          color: theme.colors.primary,
          fontFamily: theme.fontFamily.bold,
        },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: he.tabs.home,
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "home" : "home-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: he.tabs.inventory,
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "library" : "library-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="shortage"
        options={{
          title: he.shortage.title,
          tabBarLabel: he.tabs.shortage,
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "warning" : "warning-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: he.tabs.orders,
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "cart" : "cart-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="add-remove"
        options={{
          title: he.tabs.addRemove,
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? "add-circle" : "add-circle-outline"}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: he.tabs.notifications,
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons
              name={focused ? "notifications" : "notifications-outline"}
              color={color}
              size={size}
            />
          ),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tabs.Screen name="customer-orders-history" options={{ href: null }} />
    </Tabs>
    </StoreMapFilterProvider>
  );
}
