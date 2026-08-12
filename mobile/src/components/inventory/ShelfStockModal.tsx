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
import { theme } from "../../theme";
import { he } from "../../i18n/he";

const MIN = 0;
const MAX = 999;

interface Props {
  visible: boolean;
  bookTitle: string;
  cellName: string;
  initialShelfStock: number;
  submitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSubmit: (shelfStock: number) => void;
}

/**
 * מודאל לעריכת מלאי מדף — מספר השדרות בארון (ממלא ממחסן / חוסרים).
 */
export function ShelfStockModal({
  visible,
  bookTitle,
  cellName,
  initialShelfStock,
  submitting,
  errorMessage,
  onCancel,
  onSubmit,
}: Props): JSX.Element {
  const [quantity, setQuantity] = useState(initialShelfStock);

  useEffect(() => {
    if (visible) setQuantity(Math.max(MIN, Math.min(MAX, initialShelfStock)));
  }, [visible, initialShelfStock]);

  const dec = () => setQuantity((q) => Math.max(MIN, q - 1));
  const inc = () => setQuantity((q) => Math.min(MAX, q + 1));

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
          <Text style={styles.title}>{he.addRemove.shelfStockModalTitle}</Text>

          <Field label={he.addRemove.fieldTitle} value={bookTitle} />
          <Field label={he.unit.cellLabel} value={cellName} />

          <Text style={styles.hint}>{he.addRemove.shelfStockHint}</Text>

          <View style={styles.stepper}>
            <Text style={styles.stepperLabel}>{he.addRemove.shelfStockLabel}</Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={dec}
                disabled={quantity <= MIN || submitting}
                style={({ pressed }) => [
                  styles.stepBtn,
                  (quantity <= MIN || submitting) && styles.stepBtnDisabled,
                  pressed && quantity > MIN && !submitting && styles.stepBtnPressed,
                ]}
              >
                <Ionicons name="remove" size={20} color={theme.colors.onPrimary} />
              </Pressable>
              <Text style={styles.stepValue}>{quantity}</Text>
              <Pressable
                onPress={inc}
                disabled={quantity >= MAX || submitting}
                style={({ pressed }) => [
                  styles.stepBtn,
                  (quantity >= MAX || submitting) && styles.stepBtnDisabled,
                  pressed && quantity < MAX && !submitting && styles.stepBtnPressed,
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
              style={[styles.actionBtn, styles.submitBtn, submitting && styles.disabled]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.submitText}>{he.generic.save}</Text>
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
    maxWidth: 420,
    alignSelf: "center",
    flexShrink: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadow.modal,
  },
  title: {
    ...theme.typography.headlineMd,
    color: theme.colors.primary,
    textAlign: "left",
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
