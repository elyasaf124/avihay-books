import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { OrderListItem, OrdersByCustomerGroup } from "@avihay-books/shared";
import { customerOrderBundleKey, orderDisplayLineKey, whatsappOrderGroupKey } from "../../api/orders";
import { theme } from "../../theme";
import { he } from "../../i18n/he";
import { buildWhatsappOrderMetaRows } from "../../utils/whatsappOrderDisplay";

interface Props {
  group: OrdersByCustomerGroup;
  variant?: "active" | "history";
  /** בלשונית לקוחות: משאית לתצוגה בלבד כשההזמנה `sent` (מסומנת מהמלאi). */
  showOrderedIndicator?: boolean;
  /** בלשונית וואטסאפ: הצגת כתובת, הערות, סוג הזמנה ומשלוח. */
  showWhatsappDetails?: boolean;
  onRemoveOrderLine?: (order: OrderListItem) => void;
  onFinishOrderLine?: (order: OrderListItem) => void;
  onEditOrderLine?: (order: OrderListItem) => void;
  /** שליחת עדכון יזום ללקוח בוואטסאפ (לשונית וואטסאפ/לקוח). */
  onNotifyCustomer?: (group: OrdersByCustomerGroup) => void;
  removingOrderLineKey?: string | null;
  finishingOrderLineKey?: string | null;
}

/**
 * כרטיס לקבוצת הזמנות לפי לקוח (שם + טלפון):
 * - כותרת עם שם הלקוח ומספר טלפון.
 * - רשימת הספרים עם ספק לכל שורה.
 */
export function CustomerOrderCard({
  group,
  variant = "active",
  showOrderedIndicator = false,
  showWhatsappDetails = false,
  onRemoveOrderLine,
  onFinishOrderLine,
  onEditOrderLine,
  onNotifyCustomer,
  removingOrderLineKey = null,
  finishingOrderLineKey = null,
}: Props): JSX.Element {
  const isHistory = variant === "history";
  const totalUnits = group.orders.reduce((s, o) => s + o.quantity, 0);
  const whatsappMetaRows =
    showWhatsappDetails && group.orders[0]
      ? buildWhatsappOrderMetaRows(group.orders[0])
      : [];

  return (
    <View style={[styles.card, theme.shadow.floating]}>
      <View style={styles.header}>
        <View style={styles.headerLeading}>
          <View style={[styles.accent, { backgroundColor: theme.colors.primary }]} />
          <View style={styles.headerText}>
            <Text style={styles.customerName} numberOfLines={1}>
              {group.customer_name || he.orders.customer}
            </Text>
            {group.customer_phone ? (
              <Text style={styles.phone} numberOfLines={1}>
                {he.orders.phone}: {group.customer_phone}
              </Text>
            ) : null}
            <Text style={styles.subline} numberOfLines={1}>
              {he.orders.customerGroupSubline
                .replace("{{titles}}", String(group.orders.length))
                .replace("{{units}}", String(totalUnits))}
            </Text>
          </View>
        </View>
        {!isHistory && onNotifyCustomer && group.customer_phone ? (
          <Pressable
            onPress={() => onNotifyCustomer(group)}
            style={({ pressed }) => [styles.notifyBtn, pressed && styles.lineActionPressed]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={he.orders.notifyCustomerButtonA11y}
          >
            <Ionicons name="logo-whatsapp" size={16} color={theme.colors.onPrimaryContainer} />
            <Text style={styles.notifyBtnText} numberOfLines={1}>
              {he.orders.notifyCustomerButton}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {whatsappMetaRows.length > 0 ? (
        <View style={styles.orderMeta}>
          {whatsappMetaRows.map((row) => (
            <View key={row.label} style={styles.orderMetaRow}>
              <Text style={styles.orderMetaLabel}>{row.label}</Text>
              <Text style={styles.orderMetaValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.list}>
        {group.orders.map((o) => {
          const lineKey = orderDisplayLineKey(o);
          const supplierLabel =
            o.supplier_id != null && o.supplier_name
              ? o.supplier_name
              : he.orders.unassignedSupplierGroup;
          const isOrdered = o.status === "sent";
          const isCompleted = o.status === "completed";
          return (
            <View key={lineKey} style={styles.lineRow}>
              <View style={styles.lineLeft}>
                <View style={styles.titleRow}>
                  {!isHistory && showOrderedIndicator && isOrdered && !isCompleted ? (
                    <View
                      style={styles.truckIndicator}
                      accessibilityLabel={he.orders.orderOrderedIndicatorA11y}
                      importantForAccessibility="yes"
                    >
                      <MaterialCommunityIcons
                        name="truck"
                        size={22}
                        color={theme.colors.primary}
                      />
                    </View>
                  ) : isCompleted ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={theme.colors.secondary}
                      accessibilityLabel={he.orders.orderCompletedA11y}
                    />
                  ) : null}
                  <Text style={styles.lineTitle} numberOfLines={1}>
                    {o.book_title}
                  </Text>
                </View>
                <Text style={styles.lineMeta} numberOfLines={1}>
                  {(o.book_author?.trim() ? o.book_author : he.orders.authorNotSpecified) +
                    ` · ${he.orders.customerOrderSupplier}: ${supplierLabel}`}
                </Text>
              </View>
              <View style={styles.lineRight}>
                <Text style={styles.qty}>×{o.quantity}</Text>
                {!isHistory ? (
                  <Text style={styles.statusText}>
                    {he.orders.statusLabels[o.status]}
                  </Text>
                ) : null}
              </View>
              {!isHistory ? (
                finishingOrderLineKey === lineKey ? (
                  <ActivityIndicator style={styles.lineActionWrap} color={theme.colors.primary} />
                ) : removingOrderLineKey === lineKey ? (
                  <ActivityIndicator style={styles.lineActionWrap} color={theme.colors.primary} />
                ) : (
                  <View style={styles.lineActions}>
                    {onEditOrderLine && !isCompleted ? (
                      <Pressable
                        onPress={() => onEditOrderLine(o)}
                        style={({ pressed }) => [
                          styles.lineActionBtn,
                          pressed && styles.lineActionPressed,
                        ]}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={he.orders.customerOrderEditLineA11y}
                      >
                        <Ionicons name="pencil-outline" size={20} color={theme.colors.primary} />
                      </Pressable>
                    ) : null}
                    {isCompleted && onFinishOrderLine ? (
                      <Pressable
                        onPress={() => onFinishOrderLine(o)}
                        style={({ pressed }) => [
                          styles.finishOrderBtn,
                          pressed && styles.lineActionPressed,
                        ]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={he.orders.finishOrderButtonA11y}
                      >
                        <Text style={styles.finishOrderBtnText} numberOfLines={1}>
                          {he.orders.finishOrderButton}
                        </Text>
                      </Pressable>
                    ) : null}
                    {onRemoveOrderLine && !isCompleted ? (
                      <Pressable
                        onPress={() => onRemoveOrderLine(o)}
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
                    ) : null}
                  </View>
                )
              ) : onRemoveOrderLine ? (
                removingOrderLineKey === lineKey ? (
                  <ActivityIndicator style={styles.lineActionWrap} color={theme.colors.primary} />
                ) : (
                  <Pressable
                    onPress={() => onRemoveOrderLine(o)}
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
                )
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** מפתח יציב ל־FlatList — שם + טלפון מנורמלים. */
export function customerGroupListKey(group: OrdersByCustomerGroup): string {
  return customerOrderBundleKey(group);
}

/** מפתח יציב ל־FlatList בלשונית וואטסאפ — לפי `order_group_id` או שם+טלפון. */
export function whatsappGroupListKey(group: OrdersByCustomerGroup): string {
  const first = group.orders[0];
  if (first) return whatsappOrderGroupKey(first);
  return customerOrderBundleKey(group);
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
  customerName: {
    ...theme.typography.headlineMd,
    color: theme.colors.primary,
    textAlign: "left",
  },
  phone: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  subline: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  orderMeta: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  orderMetaRow: {
    gap: 2,
  },
  orderMetaLabel: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  orderMetaValue: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  lineTitle: {
    ...theme.typography.bodyLg,
    color: theme.colors.onSurface,
    textAlign: "left",
    flex: 1,
  },
  lineMeta: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  lineRight: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  truckIndicator: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    alignItems: "center",
    justifyContent: "center",
  },
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
  finishOrderBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryContainer,
    maxWidth: 120,
  },
  finishOrderBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimaryContainer,
    fontSize: 11,
  },
  notifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryContainer,
  },
  notifyBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimaryContainer,
    fontSize: 11,
  },
});
