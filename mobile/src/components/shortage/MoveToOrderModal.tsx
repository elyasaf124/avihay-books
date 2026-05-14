import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ShortageListItem } from "@avihay-books/shared";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

interface Props {
  visible: boolean;
  item: ShortageListItem | null;
  /** סך יחידות בכל שורות `pending` של הזמנת מלאי לאותו ספר וספק — ההוספה תאוחד בשורת `pending` */
  existingPendingQuantity?: number;
  /** יש הזמנת מלאי `sent`, בלי שורת `pending` — נוצרת שורת `pending` חדשה */
  onlySentInventoryLine?: boolean;
  submitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSubmit: (quantity: number) => void;
}

const MIN = 1;
const MAX = 999;

/**
 * מודאל קצר ליצירת הזמנת מלאי מתוך רשומת חוסר.
 * הכמות מאותחלת מ־`reorder_threshold` של הספר, ניתן להעלות/להוריד.
 *
 * הקומפוננטה צריכה להיטען מחדש עבור כל פתיחה (`key={item.id}` מההורה) כדי
 * שה־`useState` יחזיר את ערך ברירת המחדל המעודכן.
 */
export function MoveToOrderModal({
  visible,
  item,
  existingPendingQuantity = 0,
  onlySentInventoryLine = false,
  submitting,
  errorMessage,
  onCancel,
  onSubmit,
}: Props): JSX.Element {
  const alreadyInPendingOrder = existingPendingQuantity > 0;
  const recommended = alreadyInPendingOrder
    ? MIN
    : Math.max(item?.book_reorder_threshold ?? 1, MIN);
  const [quantity, setQuantity] = useState<number>(recommended);

  if (!item) return <></>;

  const dec = () => setQuantity((q) => Math.max(MIN, q - 1));
  const inc = () => setQuantity((q) => Math.min(MAX, q + 1));

  const qtyLabel = alreadyInPendingOrder
    ? he.shortage.moveModal.quantityExtraLabel
    : he.shortage.moveModal.quantityLabel;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={submitting ? undefined : onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{he.shortage.moveModal.title}</Text>
            <View style={[styles.accent, { backgroundColor: item.supplier_color }]} />
          </View>

          <Field label={he.shortage.moveModal.bookLabel} value={item.book_title} />
          <Field label={he.shortage.moveModal.supplierLabel} value={item.supplier_name} />
          <Field
            label={he.shortage.moveModal.currentStockLabel}
            value={`${item.book_stock_quantity}`}
          />

          {alreadyInPendingOrder ? (
            <View style={styles.noticeRow}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={theme.colors.primary}
              />
              <View style={styles.noticeTextWrap}>
                <Text style={styles.noticeTitle}>
                  {he.shortage.moveModal.alreadyInOrderBanner.replace(
                    "{{qty}}",
                    String(existingPendingQuantity),
                  )}
                </Text>
                <Text style={styles.noticeHint}>{he.shortage.moveModal.alreadyInOrderHint}</Text>
              </View>
            </View>
          ) : null}

          {!alreadyInPendingOrder && onlySentInventoryLine ? (
            <View style={styles.noticeRow}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={theme.colors.primary}
              />
              <View style={styles.noticeTextWrap}>
                <Text style={styles.noticeHint}>{he.shortage.moveModal.sentLineOnlyHint}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.stepper}>
            <Text style={styles.stepperLabel}>{qtyLabel}</Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={dec}
                style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
              >
                <Ionicons name="remove" size={20} color={theme.colors.onPrimary} />
              </Pressable>
              <Text style={styles.stepValue}>{quantity}</Text>
              <Pressable
                onPress={inc}
                style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
              >
                <Ionicons name="add" size={20} color={theme.colors.onPrimary} />
              </Pressable>
            </View>
          </View>

          {errorMessage ? (
            <View style={styles.errorRow}>
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color={theme.colors.onErrorContainer}
              />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              disabled={submitting}
              onPress={onCancel}
              style={[styles.actionBtn, styles.cancelBtn, submitting && styles.disabled]}
            >
              <Text style={styles.cancelText}>{he.generic.cancel}</Text>
            </Pressable>
            <Pressable
              disabled={submitting}
              onPress={() => onSubmit(quantity)}
              style={[styles.actionBtn, styles.submitBtn, submitting && styles.disabled]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.submitText}>
                  {alreadyInPendingOrder ? he.shortage.moveModal.submitAdd : he.shortage.moveModal.submit}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
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
  accent: { width: 14, height: 14, borderRadius: 7 },
  title: {
    ...theme.typography.headlineMd,
    color: theme.colors.primary,
    textAlign: "right",
    writingDirection: "rtl",
    flex: 1,
  },
  field: { gap: 2 },
  fieldLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "right",
    writingDirection: "rtl",
  },
  fieldValue: {
    ...theme.typography.bodyLg,
    color: theme.colors.onSurface,
    textAlign: "right",
    writingDirection: "rtl",
  },
  noticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  noticeTextWrap: { flex: 1, gap: 4 },
  noticeTitle: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "right",
    writingDirection: "rtl",
  },
  noticeHint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "right",
    writingDirection: "rtl",
  },
  stepper: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  stepperLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "right",
    writingDirection: "rtl",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnPressed: { opacity: 0.85 },
  stepValue: {
    ...theme.typography.display,
    fontSize: 28,
    lineHeight: 32,
    color: theme.colors.primary,
    minWidth: 64,
    textAlign: "center",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.errorContainer,
  },
  errorText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onErrorContainer,
    flex: 1,
    textAlign: "right",
    writingDirection: "rtl",
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  submitBtn: { backgroundColor: theme.colors.primary },
  disabled: { opacity: 0.5 },
  cancelText: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    fontSize: 14,
    letterSpacing: 0,
  },
  submitText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
    fontSize: 14,
    letterSpacing: 0,
  },
});
