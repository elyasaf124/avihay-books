import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { theme } from "../../theme";
import { he } from "../../i18n/he";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
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
  const keyboardHeight = useKeyboardHeight();
  const { height: windowH } = useWindowDimensions();
  const inputRefs = useRef<Map<string, TextInput>>(new Map());
  const focusedInputKeyRef = useRef<string | null>(null);
  const [modalShift, setModalShift] = useState(0);
  const [qtyByKey, setQtyByKey] = useState<Record<string, string>>({});
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
    const next: Record<string, string> = {};
    for (const line of previewQuery.data.lines) {
      next[intakeLineKey(line)] = String(line.ordered_qty);
    }
    setQtyByKey(next);
    setFormError(null);
  }, [previewQuery.data]);

  const ensureInputVisible = useCallback(
    (key: string) => {
      if (keyboardHeight <= 0) return;
      const node = inputRefs.current.get(key);
      if (!node) return;
      node.measureInWindow((_x, y, _w, height) => {
        const keyboardTop = windowH - keyboardHeight;
        const margin = theme.spacing.lg;
        const overflow = y + height - (keyboardTop - margin);
        const baseShift = theme.spacing.xl;
        setModalShift(overflow > 0 ? overflow : baseShift);
      });
    },
    [keyboardHeight, windowH],
  );

  const onModalInputFocus = useCallback(
    (key: string) => {
      focusedInputKeyRef.current = key;
      ensureInputVisible(key);
    },
    [ensureInputVisible],
  );

  useEffect(() => {
    if (keyboardHeight <= 0 || !focusedInputKeyRef.current) return undefined;
    const key = focusedInputKeyRef.current;
    const t = setTimeout(() => ensureInputVisible(key), 60);
    return () => clearTimeout(t);
  }, [keyboardHeight, ensureInputVisible]);

  useEffect(() => {
    if (!visible) {
      focusedInputKeyRef.current = null;
      setModalShift(0);
      setFormError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (keyboardHeight <= 0) setModalShift(0);
  }, [keyboardHeight]);

  const save = () => {
    if (!target || !previewQuery.data) return;
    const lines: IntakeSubmitLine[] = [];
    for (const line of previewQuery.data.lines) {
      const raw = (qtyByKey[intakeLineKey(line)] ?? "").trim();
      const received = Number(raw);
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.modalCard, modalShift > 0 && { transform: [{ translateY: -modalShift }] }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.title}>{he.orders.receiveOrderTitle}</Text>
            {previewQuery.isLoading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : previewQuery.isError ? (
              <Text style={styles.error}>{he.orders.receiveFailed}</Text>
            ) : lines.length === 0 ? (
              <Text style={styles.meta}>{he.orders.receiveEmpty}</Text>
            ) : (
              <ScrollView
                style={{ maxHeight: Math.min(420, windowH * 0.5) }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                automaticallyAdjustKeyboardInsets={false}
              >
                {lines.map((line) => (
                  <IntakeLineFields
                    key={intakeLineKey(line)}
                    line={line}
                    value={qtyByKey[intakeLineKey(line)] ?? ""}
                    onChange={(text) => {
                      const key = intakeLineKey(line);
                      setQtyByKey((prev) => ({ ...prev, [key]: text }));
                    }}
                    inputRef={(node) => {
                      const key = intakeLineKey(line);
                      if (node) inputRefs.current.set(key, node);
                      else inputRefs.current.delete(key);
                    }}
                    onFocus={() => onModalInputFocus(intakeLineKey(line))}
                  />
                ))}
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
          </Pressable>
        </Pressable>
      </View>
    </Modal>
  );
}

function IntakeLineFields({
  line,
  value,
  onChange,
  inputRef,
  onFocus,
}: {
  line: IntakePreviewLine;
  value: string;
  onChange: (text: string) => void;
  inputRef: (node: TextInput | null) => void;
  onFocus: () => void;
}): JSX.Element {
  return (
    <View style={styles.line}>
      <Text style={styles.bookTitle}>{line.book_title}</Text>
      {line.book_author ? <Text style={styles.meta}>{line.book_author}</Text> : null}
      <Text style={styles.meta}>
        {he.orders.receiveOrderedQty.replace("{{n}}", String(line.ordered_qty))}
      </Text>
      <Text style={styles.fieldLabel}>{he.orders.receiveArrivedLabel}</Text>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        textAlign="right"
        onFocus={onFocus}
      />
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
  modalRoot: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 28, 48, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
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
    marginTop: theme.spacing.xs,
  },
  input: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
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
