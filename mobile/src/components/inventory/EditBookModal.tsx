import type { BookWithLocations, Supplier } from "@avihay-books/shared";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { he } from "../../i18n/he";
import { theme } from "../../theme";

export interface EditBookSubmitPayload {
  title: string;
  author: string;
  supplier_id: string;
  price: number;
  reorder_threshold: number;
  topic: string;
  is_new: boolean;
}

export interface EditBookModalProps {
  visible: boolean;
  book: BookWithLocations | null;
  suppliers: Supplier[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (patch: EditBookSubmitPayload) => void;
}

interface EditBookFormState {
  title: string;
  author: string;
  supplier_id: string;
  price: string;
  reorder_threshold: string;
  topic: string;
  is_new: boolean;
}

function LabeledInput({
  label,
  value,
  onChangeText,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
}): JSX.Element {
  return (
    <View style={styles.inputBlock}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.textInput}
        value={value}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        textAlign="left"
      />
    </View>
  );
}

export function EditBookModal({
  visible,
  book,
  suppliers,
  submitting,
  onClose,
  onSubmit,
}: EditBookModalProps): JSX.Element {
  const keyboardHeight = useKeyboardHeight();
  const fallbackSupplier = suppliers[0]?.id ?? "";
  const [form, setForm] = useState<EditBookFormState>({
    title: "",
    author: "",
    supplier_id: fallbackSupplier,
    price: "",
    reorder_threshold: "2",
    topic: "",
    is_new: false,
  });

  useEffect(() => {
    if (!visible || !book) return;
    setForm({
      title: book.title,
      author: book.author,
      supplier_id: book.supplier_id,
      price: String(book.price),
      reorder_threshold: String(book.reorder_threshold),
      topic: book.topic,
      is_new: book.is_new,
    });
  }, [visible, book]);

  const handleIsNewChange = (nextIsNew: boolean) => {
    if (nextIsNew && book && book.locations.length > 0) {
      Alert.alert(he.generic.errorTitle, he.addRemove.toggleIsNewHasLocationsHint);
    }
    setForm((s) => ({ ...s, is_new: nextIsNew }));
  };

  const handleSubmit = () => {
    const priceNum = Number(String(form.price).replace(",", "."));
    const reorderNum = Number.parseInt(form.reorder_threshold, 10);
    const titleClean = form.title.trim();
    const authorClean = form.author.trim();
    const topicClean = form.topic.trim();

    if (
      !titleClean ||
      !authorClean ||
      !form.supplier_id ||
      Number.isNaN(priceNum) ||
      Number.isNaN(reorderNum) ||
      priceNum < 0 ||
      reorderNum < 0
    ) {
      return;
    }

    onSubmit({
      title: titleClean,
      author: authorClean,
      supplier_id: form.supplier_id,
      price: priceNum,
      reorder_threshold: reorderNum,
      topic: topicClean,
      is_new: form.is_new,
    });
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView
            style={styles.sheetScroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator
          >
            <Text style={styles.sheetTitle}>{he.addRemove.editBookModalTitle}</Text>

            <LabeledInput
              label={he.addRemove.fieldTitle}
              value={form.title}
              onChangeText={(title) => setForm((s) => ({ ...s, title }))}
            />
            <LabeledInput
              label={he.addRemove.fieldAuthor}
              value={form.author}
              onChangeText={(author) => setForm((s) => ({ ...s, author }))}
            />

            <Text style={styles.inputLabel}>{he.addRemove.fieldSupplier}</Text>
            <View style={styles.supMiniList}>
              {suppliers.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => setForm((f) => ({ ...f, supplier_id: s.id }))}
                  style={[
                    styles.chip,
                    styles.supChip,
                    form.supplier_id === s.id && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      form.supplier_id === s.id && styles.chipTextActive,
                    ]}
                  >
                    {s.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <LabeledInput
              label={he.addRemove.fieldPrice}
              value={form.price}
              keyboardType="decimal-pad"
              onChangeText={(price) => setForm((s) => ({ ...s, price }))}
            />
            <LabeledInput
              label={he.addRemove.fieldReorderThreshold}
              value={form.reorder_threshold}
              keyboardType="number-pad"
              onChangeText={(reorder_threshold) =>
                setForm((s) => ({ ...s, reorder_threshold }))
              }
            />
            <LabeledInput
              label={he.addRemove.fieldTopic}
              value={form.topic}
              onChangeText={(topic) => setForm((s) => ({ ...s, topic }))}
            />

            <View style={styles.switchRow}>
              <Text style={styles.inputLabel}>{he.addRemove.bookIsNewToggle}</Text>
              <Switch
                accessibilityLabel={he.addRemove.bookIsNewToggle}
                value={form.is_new}
                disabled={submitting}
                onValueChange={handleIsNewChange}
              />
            </View>
          </ScrollView>

          <View style={[styles.modalActions, { paddingBottom: keyboardHeight }]}>
            <Pressable onPress={onClose} style={[styles.modalBtn, styles.modalBtnGhost]}>
              <Text>{he.generic.cancel}</Text>
            </Pressable>
            <Pressable
              disabled={submitting}
              onPress={handleSubmit}
              style={[styles.modalBtn, styles.modalBtnPrimary]}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.modalBtnPrimaryText}>{he.addRemove.saveChanges}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(11,28,48,0.45)",
    padding: theme.spacing.lg,
  },
  sheet: {
    flexDirection: "column",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    ...theme.shadow.modal,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    marginHorizontal: theme.spacing.sm,
    alignSelf: "center",
    width: "100%",
  },
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  scroll: { gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  sheetTitle: {
    ...theme.typography.headlineSm,
    textAlign: "left",
    color: theme.colors.onSurface,
    marginBottom: theme.spacing.sm,
  },
  inputBlock: { marginTop: theme.spacing.xs },
  inputLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    marginBottom: theme.spacing.xs,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLow,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
  },
  supMiniList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.sm,
  },
  chip: {
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.outline,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    alignSelf: "flex-start",
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryContainer,
  },
  chipText: { ...theme.typography.labelMd, color: theme.colors.onSurface },
  chipTextActive: { color: theme.colors.onPrimaryContainer },
  supChip: { marginBottom: theme.spacing.sm },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  modalActions: {
    flexDirection: "row",
    flexShrink: 0,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  modalBtnGhost: {
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  modalBtnPrimary: { backgroundColor: theme.colors.primary },
  modalBtnPrimaryText: { ...theme.typography.labelMd, color: theme.colors.onPrimary },
});
