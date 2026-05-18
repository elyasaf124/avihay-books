import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderListItem, OrderType, OrdersBySupplierGroup } from "@avihay-books/shared";
import { orderDisplayLineKey } from "../../api/orders";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

interface Props {
  group: OrdersBySupplierGroup;
  orderType: OrderType;
  onExportPdf: (group: OrdersBySupplierGroup) => void;
  onSendEmail: (group: OrdersBySupplierGroup) => void;
  onRemoveOrderLine: (order: OrderListItem) => void;
  removingOrderLineKey: string | null;
}

/**
 * כרטיס לקבוצת הזמנות לפי ספק:
 * - כותרת עם שם הספק וצבע הזיהוי.
 * - רשימת השורות (ספר + כמות + סטטוס) או פרטי לקוח עבור `customer`/`whatsapp`.
 * - שתי פעולות: ייצוא `PDF` ושליחה במייל.
 */
export function SupplierOrderCard({
  group,
  orderType,
  onExportPdf,
  onSendEmail,
  onRemoveOrderLine,
  removingOrderLineKey,
}: Props): JSX.Element {
  const totalUnits = group.orders.reduce((s, o) => s + o.quantity, 0);
  const isInventory = orderType === "inventory";

  return (
    <View style={[styles.card, theme.shadow.floating]}>
      <View style={styles.header}>
        <View style={styles.headerLeading}>
          <View style={[styles.accent, { backgroundColor: group.supplier_color }]} />
          <View style={styles.headerText}>
            <Text style={styles.supplier} numberOfLines={1}>
              {group.supplier_name}
            </Text>
            <Text style={styles.subline} numberOfLines={1}>
              {group.orders.length} כותרים · {totalUnits} עותקים
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.list}>
        {group.orders.map((o) => (
          <OrderLine
            key={orderDisplayLineKey(o)}
            order={o}
            showCustomer={!isInventory}
            removing={removingOrderLineKey === orderDisplayLineKey(o)}
            onRemove={() => onRemoveOrderLine(o)}
          />
        ))}
      </View>

      {isInventory ? (
        <View style={styles.actions}>
          <Pressable
            onPress={() => onSendEmail(group)}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.secondaryBtn,
              pressed && styles.actionPressed,
            ]}
          >
            <Ionicons name="mail-outline" size={16} color={theme.colors.onSurface} />
            <Text style={styles.secondaryText}>{he.orders.sendEmail}</Text>
          </Pressable>
          <Pressable
            onPress={() => onExportPdf(group)}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.primaryBtn,
              pressed && styles.actionPressed,
            ]}
          >
            <Ionicons name="document-text-outline" size={16} color={theme.colors.onPrimary} />
            <Text style={styles.primaryText}>{he.orders.exportPdf}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function OrderLine({
  order,
  showCustomer,
  removing,
  onRemove,
}: {
  order: OrderListItem;
  showCustomer: boolean;
  removing: boolean;
  onRemove: () => void;
}): JSX.Element {
  return (
    <View style={styles.lineRow}>
      <View style={styles.lineLeft}>
        <Text style={styles.lineTitle} numberOfLines={1}>
          {order.book_title}
        </Text>
        <Text style={styles.lineMeta} numberOfLines={1}>
          {order.book_author}
          {showCustomer && order.customer_name ? ` · ${order.customer_name}` : ""}
        </Text>
        {showCustomer && order.customer_phone ? (
          <Text style={styles.lineMeta} numberOfLines={1}>
            {he.orders.phone}: {order.customer_phone}
          </Text>
        ) : null}
      </View>
      <View style={styles.lineRight}>
        <Text style={styles.qty}>
          ×{order.quantity}
        </Text>
        <Text style={styles.statusText}>
          {he.orders.statusLabels[order.status]}
        </Text>
      </View>
      {removing ? (
        <ActivityIndicator style={styles.lineDismissWrap} color={theme.colors.primary} />
      ) : (
        <Pressable
          onPress={onRemove}
          style={({ pressed }) => [
            styles.lineDismissBtn,
            pressed && styles.lineDismissPressed,
          ]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={he.orders.removeLineA11y}
        >
          <Ionicons name="close-circle-outline" size={22} color={theme.colors.error} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerLeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
  },
  accent: { width: 12, height: 36, borderRadius: 6 },
  headerText: { flex: 1, gap: 2 },
  supplier: {
    ...theme.typography.headlineMd,
    color: theme.colors.primary,
    textAlign: "left",
  },
  subline: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  list: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  lineLeft: { flex: 1, gap: 1 },
  lineTitle: {
    ...theme.typography.bodyLg,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  lineMeta: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  lineRight: { alignItems: "flex-start", gap: 2 },
  qty: {
    ...theme.typography.headlineSm,
    color: theme.colors.primary,
  },
  statusText: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
  },
  lineDismissWrap: {
    paddingHorizontal: theme.spacing.xs,
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  lineDismissBtn: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  lineDismissPressed: { opacity: 0.72 },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.radius.lg,
  },
  actionPressed: { opacity: 0.85 },
  primaryBtn: { backgroundColor: theme.colors.primary },
  secondaryBtn: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  primaryText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
    fontSize: 13,
    letterSpacing: 0,
  },
  secondaryText: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    fontSize: 13,
    letterSpacing: 0,
  },
});
