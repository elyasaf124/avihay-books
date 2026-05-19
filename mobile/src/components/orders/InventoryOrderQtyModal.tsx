import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderListItem } from "@avihay-books/shared";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

interface Props {
  visible: boolean;
  order: OrderListItem | null;
  inventoryQuantity: number;
  customerQuantity: number;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (inventoryQuantity: number) => void;
}

const MIN = 0;
const MAX = 999;

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v),
    template,
  );
}

export function InventoryOrderQtyModal({
  visible,
  order,
  inventoryQuantity,
  customerQuantity,
  submitting,
  onCancel,
  onSubmit,
}: Props): JSX.Element {
  const [quantity, setQuantity] = useState(inventoryQuantity);

  useEffect(() => {
    if (visible) setQuantity(inventoryQuantity);
  }, [visible, inventoryQuantity]);

  if (!order) return <></>;

  const dec = () => setQuantity((q) => Math.max(MIN, q - 1));
  const inc = () => setQuantity((q) => Math.min(MAX, q + 1));
  const totalExport = quantity + customerQuantity;
  const canSubmit = quantity >= 1 && !submitting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={submitting ? undefined : onCancel}
          accessibilityRole="button"
          accessibilityLabel={he.generic.cancel}
        />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{he.orders.inventoryOrderEditQtyTitle}</Text>
            <View style={[styles.accent, { backgroundColor: order.supplier_color }]} />
          </View>

          <Field label={he.orders.bookColumn} value={order.book_title} />
          <Field
            label={he.addRemove.fieldAuthor}
            value={order.book_author?.trim() ? order.book_author : he.orders.authorNotSpecified}
          />

          <View style={styles.qtySection}>
            <Text style={styles.qtySectionTitle}>{he.orders.inventoryOrderEditQtyBreakdown}</Text>

            <View style={styles.qtyRow}>
              <Text style={styles.qtyRowLabel}>{he.orders.inventoryOrderEditQtyCustomerLabel}</Text>
              <Text style={styles.qtyRowValueReadonly}>×{customerQuantity}</Text>
            </View>

            <View style={styles.qtyRowEditable}>
              <Text style={styles.qtyRowLabel}>{he.orders.inventoryOrderEditQtyLabel}</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  onPress={dec}
                  disabled={submitting}
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
                >
                  <Ionicons name="remove" size={18} color={theme.colors.onPrimary} />
                </Pressable>
                <Text style={styles.stepValue}>{quantity}</Text>
                <Pressable
                  onPress={inc}
                  disabled={submitting}
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
                >
                  <Ionicons name="add" size={18} color={theme.colors.onPrimary} />
                </Pressable>
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{he.orders.inventoryOrderEditQtyTotalLabel}</Text>
              <Text style={styles.totalValue}>
                {interpolate(he.orders.inventoryOrderEditQtyTotal, { n: String(totalExport) })}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              disabled={submitting}
              onPress={onCancel}
              style={[styles.actionBtn, styles.cancelBtn, submitting && styles.disabled]}
            >
              <Text style={styles.cancelText}>{he.generic.cancel}</Text>
            </Pressable>
            <Pressable
              disabled={!canSubmit}
              onPress={() => onSubmit(quantity)}
              style={[styles.actionBtn, styles.submitBtn, !canSubmit && styles.disabled]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.submitText}>{he.orders.inventoryOrderEditQtySubmit}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 28, 48, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    zIndex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadow.modal,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  title: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: "left",
  },
  accent: { width: 10, height: 28, borderRadius: 4 },
  field: { gap: 2 },
  fieldLabel: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  fieldValue: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  qtySection: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  qtySectionTitle: {
    ...theme.typography.labelMd,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
    textAlign: "left",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  qtyRowEditable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  qtyRowLabel: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: "left",
  },
  qtyRowValueReadonly: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurfaceVariant,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnPressed: { opacity: 0.85 },
  stepValue: {
    ...theme.typography.headlineSm,
    color: theme.colors.primary,
    minWidth: 36,
    textAlign: "center",
  },
  totalRow: {
    marginTop: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.outlineVariant,
    gap: 2,
  },
  totalLabel: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  totalValue: {
    ...theme.typography.bodyMd,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  submitBtn: { backgroundColor: theme.colors.primary },
  disabled: { opacity: 0.6 },
  cancelText: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
  },
  submitText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
  },
});
