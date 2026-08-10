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

export type ShortageQuantityMode = "complete" | "remove";

interface Props {
  visible: boolean;
  mode: ShortageQuantityMode;
  item: ShortageListItem | null;
  submitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSubmit: (quantity: number) => void;
}

/**
 * מודאל בחירת כמות להשלמה / הסרה של קבוצת חוסרים (ספר + תא).
 * ברירת מחדל = כל העותקים החסרים בקבוצה (`missing_count`).
 */
export function ShortageQuantityModal({
  visible,
  mode,
  item,
  submitting,
  errorMessage,
  onCancel,
  onSubmit,
}: Props): JSX.Element {
  const max = Math.max(item?.missing_count ?? 1, 1);
  const [quantity, setQuantity] = useState<number>(max);

  if (!item) return <></>;

  const dec = () => setQuantity((q) => Math.max(1, q - 1));
  const inc = () => setQuantity((q) => Math.min(max, q + 1));

  const copy = mode === "complete" ? he.shortage.qtyModal.complete : he.shortage.qtyModal.remove;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={submitting ? undefined : onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{copy.title}</Text>
            <View style={[styles.accent, { backgroundColor: item.supplier_color }]} />
          </View>

          <Field label={he.shortage.moveModal.bookLabel} value={item.book_title} />
          {item.cell_name ? (
            <Field label={he.unit.cellLabel} value={item.cell_name} />
          ) : null}
          <Field
            label={he.shortage.qtyModal.missingLabel}
            value={String(item.missing_count)}
          />

          <Text style={styles.hint}>{copy.hint}</Text>

          <View style={styles.stepper}>
            <Text style={styles.stepperLabel}>{copy.quantityLabel}</Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={dec}
                disabled={quantity <= 1 || submitting}
                style={({ pressed }) => [
                  styles.stepBtn,
                  (quantity <= 1 || submitting) && styles.stepBtnDisabled,
                  pressed && quantity > 1 && !submitting && styles.stepBtnPressed,
                ]}
              >
                <Ionicons name="remove" size={20} color={theme.colors.onPrimary} />
              </Pressable>
              <Text style={styles.stepValue}>{quantity}</Text>
              <Pressable
                onPress={inc}
                disabled={quantity >= max || submitting}
                style={({ pressed }) => [
                  styles.stepBtn,
                  (quantity >= max || submitting) && styles.stepBtnDisabled,
                  pressed && quantity < max && !submitting && styles.stepBtnPressed,
                ]}
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
              style={[
                styles.actionBtn,
                mode === "remove" ? styles.destructiveBtn : styles.submitBtn,
                submitting && styles.disabled,
              ]}
            >
              {submitting ? (
                <ActivityIndicator
                  color={
                    mode === "remove" ? theme.colors.onErrorContainer : theme.colors.onPrimary
                  }
                />
              ) : (
                <Text
                  style={mode === "remove" ? styles.destructiveText : styles.submitText}
                >
                  {copy.submit}
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
    textAlign: "left",
    flex: 1,
  },
  field: { gap: 2 },
  fieldLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  fieldValue: {
    ...theme.typography.bodyLg,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  stepper: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  stepperLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
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
  stepBtnDisabled: { opacity: 0.4 },
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
    textAlign: "left",
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
  destructiveBtn: { backgroundColor: theme.colors.errorContainer },
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
  destructiveText: {
    ...theme.typography.labelMd,
    color: theme.colors.onErrorContainer,
    fontSize: 14,
    letterSpacing: 0,
  },
});
