import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { OrderListItem, OrderType, OrdersBySupplierGroup } from "@avihay-books/shared";
import {
  isSupplierGroupFullyOrdered,
  orderDisplayLineKey,
  supplierGroupHasOpenOrders,
  supplierGroupKey,
} from "../../api/orders";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

interface Props {
  group: OrdersBySupplierGroup;
  orderType: OrderType;
  onExportPdf: (group: OrdersBySupplierGroup) => void;
  onSendEmail: (group: OrdersBySupplierGroup) => void;
  onRemoveOrderLine: (order: OrderListItem) => void;
  onEditOrderLine?: (order: OrderListItem) => void;
  onToggleSupplierOrdered?: (group: OrdersBySupplierGroup) => void;
  removingOrderLineKey: string | null;
  updatingOrderLineKey: string | null;
  togglingSupplierKey?: string | null;
}

/**
 * כרטיס לקבוצת הזמנות לפי ספק:
 * - כותרת עם שם הספק וצבע הזיהוי.
 * - רשימת השורות (ספר + כמות + סטטוס) או פרטי לקוח עבור `customer`/`whatsapp`.
 * - במלאi: ייצוא `PDF` ושליחה במייל; בלקוח / וואטסאפ: הסרת שורה.
 */
export function SupplierOrderCard({
  group,
  orderType,
  onExportPdf,
  onSendEmail,
  onRemoveOrderLine,
  onEditOrderLine,
  onToggleSupplierOrdered,
  removingOrderLineKey,
  updatingOrderLineKey,
  togglingSupplierKey,
}: Props): JSX.Element {
  const totalUnits = group.orders.reduce((s, o) => s + o.quantity, 0);
  const isInventory = orderType === "inventory";
  const canExport = group.supplier_id != null;
  const groupKey = supplierGroupKey(group.supplier_id);
  const isOrdered = isSupplierGroupFullyOrdered(group.orders);
  const hasOpenOrders = supplierGroupHasOpenOrders(group.orders);
  const isTogglingSupplier = togglingSupplierKey === groupKey;

  return (
    <View style={[styles.card, theme.shadow.floating]}>
      <View style={styles.header}>
        <View style={styles.headerLeading}>
          <View style={[styles.accent, { backgroundColor: group.supplier_color }]} />
          <View style={styles.headerText}>
            <View style={styles.supplierRow}>
              <Text style={styles.supplier} numberOfLines={1}>
                {group.supplier_name}
              </Text>
              {isInventory && onToggleSupplierOrdered && hasOpenOrders ? (
                isTogglingSupplier ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : isOrdered ? (
                  <Pressable
                    onPress={() => onToggleSupplierOrdered(group)}
                    style={({ pressed }) => [
                      styles.truckBtn,
                      pressed && styles.lineActionPressed,
                    ]}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={he.orders.orderUnmarkSupplierOrderedA11y}
                  >
                    <MaterialCommunityIcons
                      name="truck"
                      size={22}
                      color={theme.colors.primary}
                    />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => onToggleSupplierOrdered(group)}
                    style={({ pressed }) => [
                      styles.markOrderedBtn,
                      pressed && styles.lineActionPressed,
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={he.orders.orderMarkSupplierOrderedA11y}
                  >
                    <Text style={styles.markOrderedText}>{he.orders.markOrderedButton}</Text>
                  </Pressable>
                )
              ) : null}
            </View>
            <Text style={styles.subline} numberOfLines={1}>
              {group.orders.length} כותרים · {totalUnits} עותקים
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.list}>
        {group.orders.map((o) => {
          const lineKey = orderDisplayLineKey(o);
          return (
            <OrderLine
              key={lineKey}
              order={o}
              showCustomer={!isInventory}
              showEdit={onEditOrderLine != null}
              busy={removingOrderLineKey === lineKey || updatingOrderLineKey === lineKey}
              onRemove={() => onRemoveOrderLine(o)}
              onEdit={onEditOrderLine ? () => onEditOrderLine(o) : undefined}
            />
          );
        })}
      </View>

      {isInventory && canExport ? (
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
  showEdit,
  busy,
  onRemove,
  onEdit,
}: {
  order: OrderListItem;
  showCustomer: boolean;
  showEdit: boolean;
  busy: boolean;
  onRemove: () => void;
  onEdit?: () => void;
}): JSX.Element {
  return (
    <View style={styles.lineRow}>
      <View style={styles.lineLeft}>
        <Text style={styles.lineTitle} numberOfLines={1}>
          {order.book_title}
        </Text>
        <Text style={styles.lineMeta} numberOfLines={1}>
          {(order.book_author?.trim() ? order.book_author : he.orders.authorNotSpecified) +
            (showCustomer && order.customer_name ? ` · ${order.customer_name}` : "")}
        </Text>
        {showCustomer && order.customer_phone ? (
          <Text style={styles.lineMeta} numberOfLines={1}>
            {he.orders.phone}: {order.customer_phone}
          </Text>
        ) : null}
      </View>
      <View style={styles.lineRight}>
        <Text style={styles.qty}>×{order.quantity}</Text>
        <Text style={styles.statusText}>
          {he.orders.statusLabels[order.status]}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator style={styles.lineActionWrap} color={theme.colors.primary} />
      ) : (
        <View style={styles.lineActions}>
          {showEdit && onEdit ? (
            <Pressable
              onPress={onEdit}
              style={({ pressed }) => [
                styles.lineActionBtn,
                pressed && styles.lineActionPressed,
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={he.orders.editLineA11y}
            >
              <Ionicons name="pencil-outline" size={20} color={theme.colors.primary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onRemove}
            style={({ pressed }) => [
              styles.lineActionBtn,
              pressed && styles.lineActionPressed,
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={he.orders.removeLineA11y}
          >
            <Ionicons name="close-circle-outline" size={22} color={theme.colors.error} />
          </Pressable>
        </View>
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
  supplierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    flex: 1,
  },
  supplier: {
    ...theme.typography.headlineMd,
    color: theme.colors.primary,
    textAlign: "left",
    flex: 1,
  },
  truckBtn: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  markOrderedBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  markOrderedText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    fontSize: 12,
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
  lineActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  lineActionWrap: {
    paddingHorizontal: theme.spacing.xs,
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  lineActionBtn: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  lineActionPressed: { opacity: 0.72 },
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
