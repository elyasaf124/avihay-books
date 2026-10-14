import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { theme } from "../../theme";
import { he } from "../../i18n/he";
import {
  fetchIntakePreview,
  intakeLineKey,
  type IntakePreviewLine,
  type IntakeScope,
  type IntakeSubmitLine,
} from "../../api/orders";

export type ReceiveOrderTarget = {
  supplierId: string | null;
  lineOnly: boolean;
  bookId: string | null;
  manualTitle: string | null;
};

interface Props {
  target: ReceiveOrderTarget | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (scope: IntakeScope, lines: IntakeSubmitLine[]) => void;
}

/** מספר/שם התא בלי קידומת «תא» — הקידומת מגיעה מהמחרוזת בתרגום. */
function cellLabelForDisplay(cellName: string): string {
  return cellName.trim().replace(/^תא\s+/, "");
}

function scopeFromTarget(target: ReceiveOrderTarget): IntakeScope {
  return {
    supplier_id: target.supplierId,
    line_only: target.lineOnly,
    book_id: target.lineOnly ? target.bookId : null,
    manual_book_title: target.lineOnly ? target.manualTitle : null,
  };
}

export function ReceiveOrderModal({
  target,
  submitting,
  onClose,
  onSubmit,
}: Props): JSX.Element {
  const visible = target !== null;
  const { height: windowH } = useWindowDimensions();
  const [qtyByKey, setQtyByKey] = useState<Record<string, number>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: [
      "orders",
      "intake-preview",
      target?.supplierId ?? null,
      target?.lineOnly ?? false,
      target?.bookId ?? null,
      target?.manualTitle ?? null,
    ],
    queryFn: () => fetchIntakePreview(scopeFromTarget(target!)),
    enabled: visible,
  });

  useEffect(() => {
    if (!previewQuery.data) return;
    const next: Record<string, number> = {};
    for (const line of previewQuery.data.lines) {
      next[intakeLineKey(line)] = line.ordered_qty;
    }
    setQtyByKey(next);
    setFormError(null);
  }, [previewQuery.data]);

  useEffect(() => {
    if (!visible) setFormError(null);
  }, [visible]);

  const save = () => {
    if (!target || !previewQuery.data) return;
    const lines: IntakeSubmitLine[] = [];
    for (const line of previewQuery.data.lines) {
      const received = qtyByKey[intakeLineKey(line)] ?? line.ordered_qty;
      if (!Number.isInteger(received) || received < 0 || received > line.ordered_qty) {
        setFormError(he.orders.receiveInvalidQty);
        return;
      }
      lines.push({
        book_id: line.book_id,
        manual_book_title: line.manual_book_title,
        received_qty: received,
      });
    }
    if (lines.length === 0) {
      setFormError(he.orders.receiveEmpty);
      return;
    }
    setFormError(null);
    onSubmit(scopeFromTarget(target), lines);
  };

  const lines = previewQuery.data?.lines ?? [];
  const listMaxHeight = Math.min(420, Math.round(windowH * 0.55));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <View style={[styles.modalCard, { maxHeight: Math.round(windowH * 0.85) }]}>
          <Text style={styles.title}>{he.orders.receiveOrderTitle}</Text>
          {previewQuery.isLoading ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : previewQuery.isError ? (
            <Text style={styles.error}>{he.orders.receiveFailed}</Text>
          ) : lines.length === 0 ? (
            <Text style={styles.meta}>{he.orders.receiveEmpty}</Text>
          ) : (
            <ScrollView
              style={{ maxHeight: listMaxHeight }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {lines.map((line) => {
                const key = intakeLineKey(line);
                return (
                  <IntakeLineFields
                    key={key}
                    line={line}
                    value={qtyByKey[key] ?? line.ordered_qty}
                    disabled={submitting}
                    onChange={(next) => {
                      setQtyByKey((prev) => ({ ...prev, [key]: next }));
                    }}
                  />
                );
              })}
            </ScrollView>
          )}
          {formError ? <Text style={styles.error}>{formError}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.cancelBtn]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.cancelText}>{he.generic.cancel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.saveBtn, submitting && styles.btnDisabled]}
              onPress={save}
              disabled={submitting || previewQuery.isLoading || lines.length === 0}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.saveText}>{he.orders.receiveSave}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function IntakeLineFields({
  line,
  value,
  disabled,
  onChange,
}: {
  line: IntakePreviewLine;
  value: number;
  disabled: boolean;
  onChange: (next: number) => void;
}): JSX.Element {
  const canDec = !disabled && value > 0;
  const canInc = !disabled && value < line.ordered_qty;

  return (
    <View style={styles.line}>
      <Text style={styles.bookTitle}>{line.book_title}</Text>
      {line.book_author ? <Text style={styles.meta}>{line.book_author}</Text> : null}
      <Text style={styles.meta}>
        {he.orders.receiveOrderedQty.replace("{{n}}", String(line.ordered_qty))}
      </Text>
      <View style={styles.stepperRow}>
        <Text style={styles.fieldLabel}>{he.orders.receiveArrivedLabel}</Text>
        <View style={[styles.track, disabled && styles.trackDisabled]}>
          <Pressable
            onPress={() => {
              if (canDec) onChange(value - 1);
            }}
            disabled={!canDec}
            style={({ pressed }) => [
              styles.stepBtn,
              !canDec && styles.stepBtnDisabled,
              pressed && canDec && styles.stepBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={he.orders.qtyStepperDecreaseA11y}
          >
            <Ionicons
              name="remove"
              size={18}
              color={canDec ? theme.colors.primary : theme.colors.outline}
            />
          </Pressable>
          <Text style={styles.stepValue}>{value}</Text>
          <Pressable
            onPress={() => {
              if (canInc) onChange(value + 1);
            }}
            disabled={!canInc}
            style={({ pressed }) => [
              styles.stepBtn,
              !canInc && styles.stepBtnDisabled,
              pressed && canInc && styles.stepBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={he.orders.qtyStepperIncreaseA11y}
          >
            <Ionicons
              name="add"
              size={18}
              color={canInc ? theme.colors.primary : theme.colors.outline}
            />
          </Pressable>
        </View>
      </View>
      <Text style={styles.fieldLabel}>{he.orders.receiveCellsLabel}</Text>
      {line.cells.length === 0 ? (
        <Text style={styles.meta}>{he.orders.receiveNoCells}</Text>
      ) : (
        line.cells.map((cell) => (
          <Text key={cell.cell_id} style={styles.cellLine}>
            {he.orders.receiveCellLine
              .replace("{{cell}}", cellLabelForDisplay(cell.cell_name))
              .replace("{{n}}", String(cell.missing_count))}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11, 28, 48, 0.45)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    flexShrink: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadow.modal,
  },
  title: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  line: {
    gap: 4,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  bookTitle: {
    ...theme.typography.bodyLg,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  meta: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  fieldLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  track: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.full,
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 2,
  },
  trackDisabled: { opacity: 0.55 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: { opacity: 0.45 },
  stepBtnPressed: { backgroundColor: theme.colors.surfaceContainerHigh },
  stepValue: {
    ...theme.typography.headlineSm,
    color: theme.colors.primary,
    minWidth: 36,
    textAlign: "center",
    paddingHorizontal: theme.spacing.xs,
  },
  cellLine: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  error: {
    ...theme.typography.caption,
    color: theme.colors.error,
    textAlign: "left",
  },
  actions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  btn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  cancelBtn: { backgroundColor: theme.colors.surfaceContainerHigh },
  saveBtn: { backgroundColor: theme.colors.primary },
  btnDisabled: { opacity: 0.5 },
  cancelText: { ...theme.typography.labelMd, color: theme.colors.onSurface },
  saveText: { ...theme.typography.labelMd, color: theme.colors.onPrimary },
});
