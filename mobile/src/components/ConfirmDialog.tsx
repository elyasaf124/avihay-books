import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";
import { he } from "../i18n/he";

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  /** טקסט כפתור האישור — ברירת מחדל «אישור». */
  confirmLabel?: string;
  /** טקסט כפתור הביטול — ברירת מחדל «ביטול». */
  cancelLabel?: string;
  /** האם הפעולה הרסנית (מסמן את כפתור האישור באדום). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * דיאלוג אישור משותף לכל פעולה הרסנית או דורשת אישור.
 * דרישת רוחב (cross-cutting) של תוכנית העבודה.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.btn, styles.cancelBtn]}>
              <Text style={styles.cancelText}>{cancelLabel ?? he.generic.cancel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={[styles.btn, destructive ? styles.dangerBtn : styles.confirmBtn]}
            >
              <Text style={destructive ? styles.dangerText : styles.confirmText}>
                {confirmLabel ?? he.generic.confirm}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 28, 48, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadow.modal,
  },
  title: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  message: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  btn: {
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
  confirmBtn: {
    backgroundColor: theme.colors.primaryContainer,
  },
  dangerBtn: {
    backgroundColor: theme.colors.error,
  },
  cancelText: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    fontSize: 14,
    letterSpacing: 0,
  },
  confirmText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
    fontSize: 14,
    letterSpacing: 0,
  },
  dangerText: {
    ...theme.typography.labelMd,
    color: theme.colors.onError,
    fontSize: 14,
    letterSpacing: 0,
  },
});
