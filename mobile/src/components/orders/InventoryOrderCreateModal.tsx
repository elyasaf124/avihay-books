import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Book, OrderListItem } from "@avihay-books/shared";
import {
  inventorySupplierBookKey,
  summedInventoryBaseQtyBySupplierBook,
  useCreateInventoryOrder,
} from "../../api/orders";
import { useSearchBooks } from "../../api/storeMap";
import { useSuppliersWithFallback } from "../../api/unit";
import { he } from "../../i18n/he";
import { theme } from "../../theme";

const QTY_MIN = 1;
const QTY_MAX = 999;

export interface InventoryOrderCreateModalProps {
  visible: boolean;
  onClose: () => void;
  isOffline: boolean;
  rawInventoryItems: OrderListItem[];
  onCreated?: () => void;
}

export function InventoryOrderCreateModal({
  visible,
  onClose,
  isOffline,
  rawInventoryItems,
  onCreated,
}: InventoryOrderCreateModalProps): JSX.Element {
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [bookQuery, setBookQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [quantity, setQuantity] = useState(QTY_MIN);

  const suppliers = useSuppliersWithFallback();
  const createOrder = useCreateInventoryOrder();

  const trimmedQuery = bookQuery.trim();
  const searchQuery = useSearchBooks(trimmedQuery, {
    supplierId,
    enabled: visible && !selectedBook,
  });

  const pendingInventoryItems = useMemo(
    () =>
      rawInventoryItems.filter(
        (o) => o.status === "pending" && o.customer_name == null && o.customer_phone == null,
      ),
    [rawInventoryItems],
  );

  const pendingQtyByKey = useMemo(
    () => summedInventoryBaseQtyBySupplierBook(pendingInventoryItems),
    [pendingInventoryItems],
  );

  const resetForm = useCallback(() => {
    setSupplierId(null);
    setSupplierPickerOpen(false);
    setBookQuery("");
    setSelectedBook(null);
    setQuantity(QTY_MIN);
  }, []);

  useEffect(() => {
    if (!visible) resetForm();
  }, [visible, resetForm]);

  const selectedSupplierName =
    supplierId != null
      ? (suppliers.find((s) => s.id === supplierId)?.name ?? he.orders.customerOrderNoSupplier)
      : he.orders.customerOrderNoSupplier;

  const selectedSupplierColor =
    supplierId != null
      ? (suppliers.find((s) => s.id === supplierId)?.color_hex ?? theme.colors.outlineVariant)
      : theme.colors.outlineVariant;

  const effectiveSupplierId = supplierId ?? selectedBook?.supplier_id ?? null;

  const existingPendingQty = useMemo(() => {
    if (!selectedBook) return 0;
    const key = inventorySupplierBookKey({
      supplier_id: effectiveSupplierId,
      book_id: selectedBook.id,
      manual_book_title: null,
    });
    return pendingQtyByKey.get(key) ?? 0;
  }, [selectedBook, effectiveSupplierId, pendingQtyByKey]);

  const selectBook = (book: Book) => {
    setSelectedBook(book);
    setBookQuery("");
    if (!supplierId) setSupplierId(book.supplier_id || null);
    setQuantity(Math.max(book.reorder_threshold ?? 1, QTY_MIN));
  };

  const clearBook = () => {
    setSelectedBook(null);
    setBookQuery("");
    setQuantity(QTY_MIN);
  };

  const dec = () => setQuantity((q) => Math.max(QTY_MIN, q - 1));
  const inc = () => setQuantity((q) => Math.min(QTY_MAX, q + 1));

  const handleSubmit = async () => {
    if (isOffline) {
      Alert.alert(he.orders.customerOrderOfflineTitle, he.orders.customerOrderOfflineMessage);
      return;
    }
    if (!selectedBook) {
      Alert.alert(he.generic.errorTitle, he.orders.customerOrderValidationBook);
      return;
    }
    if (createOrder.isPending) return;

    try {
      await createOrder.mutateAsync({
        book_id: selectedBook.id,
        supplier_id: effectiveSupplierId,
        quantity,
      });
      Alert.alert(he.orders.customerOrderSuccessTitle, he.orders.inventoryOrderSuccess);
      onCreated?.();
      onClose();
    } catch {
      Alert.alert(he.generic.errorTitle, he.orders.inventoryOrderFailed);
    }
  };

  const isPending = createOrder.isPending;
  const canSubmit = selectedBook != null && !isPending;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flex}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{he.orders.inventoryOrderModalTitle}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={he.generic.cancel}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={26} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {isOffline ? (
              <View style={styles.offlineBanner}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={16}
                  color={theme.colors.onErrorContainer}
                />
                <Text style={styles.offlineText}>{he.orders.customerOrderOfflineBanner}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>{he.orders.customerOrderSupplier}</Text>
            <Pressable
              onPress={() => setSupplierPickerOpen(true)}
              style={({ pressed }) => [styles.editableRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={he.orders.customerOrderPickSupplier}
            >
              <View style={[styles.swatch, { backgroundColor: selectedSupplierColor }]} />
              <Text style={styles.editableRowValue} numberOfLines={1}>
                {selectedSupplierName}
              </Text>
              <Ionicons name="chevron-down" size={18} color={theme.colors.onSurfaceVariant} />
            </Pressable>
            <Text style={styles.hint}>{he.orders.customerOrderSupplierRowHint}</Text>

            <Text style={styles.label}>{he.orders.customerOrderBookSearchLabel}</Text>
            {selectedBook ? (
              <View style={styles.selectedBookCard}>
                <View style={styles.selectedBookMain}>
                  <Text style={styles.selectedBookTitle}>{selectedBook.title}</Text>
                  <Text style={styles.selectedBookAuthor}>{selectedBook.author}</Text>
                  <Text style={styles.selectedBookMeta}>
                    {he.orders.customerOrderCatalogSupplier.replace(
                      "{{name}}",
                      suppliers.find((s) => s.id === selectedBook.supplier_id)?.name ??
                        he.orders.customerOrderNoSupplier,
                    )}
                  </Text>
                </View>
                <Pressable
                  onPress={clearBook}
                  style={({ pressed }) => [styles.changeBookBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={he.orders.customerOrderChangeBook}
                >
                  <Text style={styles.changeBookText}>{he.orders.customerOrderChangeBook}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.searchInput}
                  value={bookQuery}
                  onChangeText={setBookQuery}
                  placeholder={he.orders.customerOrderBookSearchPlaceholder}
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {trimmedQuery.length > 0 ? (
                  <View style={styles.resultsBox}>
                    {searchQuery.isLoading ? (
                      <View style={styles.resultsLoading}>
                        <ActivityIndicator color={theme.colors.primary} />
                        <Text style={styles.resultsEmpty}>{he.orders.customerOrderSearchLoading}</Text>
                      </View>
                    ) : searchQuery.isError ? (
                      <Text style={styles.resultsEmpty}>{he.orders.customerOrderSearchError}</Text>
                    ) : (searchQuery.data?.length ?? 0) === 0 ? (
                      <Text style={styles.resultsEmpty}>
                        {supplierId
                          ? he.orders.customerOrderSearchEmptyForSupplier
                          : he.orders.customerOrderSearchEmpty}
                      </Text>
                    ) : (
                      searchQuery.data!.map((book) => (
                        <Pressable
                          key={book.id}
                          onPress={() => selectBook(book)}
                          style={({ pressed }) => [
                            styles.resultRow,
                            pressed && styles.resultRowPressed,
                          ]}
                        >
                          <Text style={styles.resultTitle} numberOfLines={2}>
                            {book.title}
                          </Text>
                          <Text style={styles.resultAuthor} numberOfLines={1}>
                            {book.author}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}
              </>
            )}

            {existingPendingQty > 0 ? (
              <View style={styles.noticeRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={theme.colors.primary}
                />
                <View style={styles.noticeTextWrap}>
                  <Text style={styles.noticeTitle}>
                    {he.orders.inventoryOrderAlreadyInOrderBanner.replace(
                      "{{qty}}",
                      String(existingPendingQty),
                    )}
                  </Text>
                  <Text style={styles.noticeHint}>
                    {he.orders.inventoryOrderAlreadyInOrderHint}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.stepper}>
              <Text style={styles.stepperLabel}>{he.orders.quantity}</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  onPress={dec}
                  disabled={isPending}
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
                >
                  <Ionicons name="remove" size={20} color={theme.colors.onPrimary} />
                </Pressable>
                <Text style={styles.stepValue}>{quantity}</Text>
                <Pressable
                  onPress={inc}
                  disabled={isPending}
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
                >
                  <Ionicons name="add" size={20} color={theme.colors.onPrimary} />
                </Pressable>
              </View>
            </View>

            <Pressable
              disabled={!canSubmit}
              onPress={() => void handleSubmit()}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.pressed,
                !canSubmit && styles.submitDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={he.orders.inventoryOrderSubmit}
            >
              {isPending ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.submitText}>{he.orders.inventoryOrderSubmit}</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={supplierPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSupplierPickerOpen(false)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setSupplierPickerOpen(false)}>
          <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>{he.orders.customerOrderSupplierPickerTitle}</Text>
            <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => {
                  setSupplierId(null);
                  setSupplierPickerOpen(false);
                }}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.resultRowPressed]}
              >
                <View
                  style={[styles.pickerSwatch, { backgroundColor: theme.colors.outlineVariant }]}
                />
                <Text style={styles.pickerRowText} numberOfLines={1}>
                  {he.orders.customerOrderNoSupplier}
                </Text>
                {supplierId == null ? (
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                ) : null}
              </Pressable>
              {suppliers.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setSupplierId(s.id);
                    setSupplierPickerOpen(false);
                  }}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.resultRowPressed]}
                >
                  <View style={[styles.pickerSwatch, { backgroundColor: s.color_hex }]} />
                  <Text style={styles.pickerRowText} numberOfLines={1}>
                    {s.name}
                  </Text>
                  {supplierId === s.id ? (
                    <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.surface },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.marginMobile,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  headerTitle: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    flex: 1,
    marginEnd: theme.spacing.sm,
    textAlign: "left",
  },
  closeBtn: { padding: theme.spacing.xs },
  pressed: { opacity: 0.85 },
  scrollContent: {
    padding: theme.spacing.marginMobile,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.errorContainer,
  },
  offlineText: {
    ...theme.typography.labelMd,
    color: theme.colors.onErrorContainer,
    flex: 1,
    textAlign: "left",
  },
  label: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    marginTop: theme.spacing.xs,
  },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  editableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  editableRowValue: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: "left",
  },
  searchInput: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "right",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  resultsBox: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    overflow: "hidden",
    maxHeight: 220,
  },
  resultsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  },
  resultsEmpty: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    padding: theme.spacing.md,
    textAlign: "left",
  },
  resultRow: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  resultRowPressed: { backgroundColor: theme.colors.surfaceContainerLow },
  resultTitle: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  resultAuthor: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  selectedBookCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  selectedBookMain: { gap: 2 },
  selectedBookTitle: {
    ...theme.typography.bodyLg,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  selectedBookAuthor: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  selectedBookMeta: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  changeBookBtn: { alignSelf: "flex-start" },
  changeBookText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
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
    textAlign: "left",
  },
  noticeHint: {
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
  stepBtnPressed: { opacity: 0.85 },
  stepValue: {
    ...theme.typography.display,
    fontSize: 28,
    lineHeight: 32,
    color: theme.colors.primary,
    minWidth: 64,
    textAlign: "center",
  },
  submitBtn: {
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitDisabled: { opacity: 0.5 },
  submitText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 28, 48, 0.45)",
    justifyContent: "flex-end",
  },
  pickerCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.marginMobile,
    paddingBottom: theme.spacing.xl,
    maxHeight: "70%",
  },
  pickerTitle: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    textAlign: "left",
    marginBottom: theme.spacing.sm,
  },
  pickerScroll: { maxHeight: 360 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  pickerSwatch: { width: 14, height: 14, borderRadius: 7 },
  pickerRowText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: "left",
  },
});
