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
import type { Book } from "@avihay-books/shared";
import { useCreateCustomerOrder } from "../../api/orders";
import { useSearchBooks } from "../../api/storeMap";
import { useSuppliersWithFallback } from "../../api/unit";
import { he } from "../../i18n/he";
import { theme } from "../../theme";

type BookSourceMode = "catalog" | "manual";

export interface CustomerDemandOrderModalProps {
  visible: boolean;
  onClose: () => void;
  /** כשכל ממשקי ההזמנות במצב נתוני דמה — לא שולחים לשרת. */
  isOffline: boolean;
  /** לאחר יצירה מוצלחת (למשל מעבר ללשונית לקוחות). */
  onCreated?: () => void;
}

export function CustomerDemandOrderModal({
  visible,
  onClose,
  isOffline,
  onCreated,
}: CustomerDemandOrderModalProps): JSX.Element {
  const [sourceMode, setSourceMode] = useState<BookSourceMode>("catalog");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [bookQuery, setBookQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualAuthor, setManualAuthor] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const suppliers = useSuppliersWithFallback();
  const trimmedQuery = bookQuery.trim();
  const searchQuery = useSearchBooks(trimmedQuery, {
    supplierId,
    enabled: sourceMode === "catalog",
  });

  const createOrder = useCreateCustomerOrder();

  useEffect(() => {
    if (!visible) {
      setSourceMode("catalog");
      setSupplierId(null);
      setSupplierPickerOpen(false);
      setBookQuery("");
      setSelectedBook(null);
      setManualTitle("");
      setManualAuthor("");
      setQuantity("1");
      setCustomerName("");
      setCustomerPhone("");
    }
  }, [visible]);

  const selectedSupplierName = useMemo(() => {
    if (!supplierId) return "";
    return suppliers.find((s) => s.id === supplierId)?.name ?? "";
  }, [supplierId, suppliers]);

  const searchResults = searchQuery.data ?? [];
  const showResultList = sourceMode === "catalog" && !selectedBook && trimmedQuery.length > 0;

  const validate = useCallback((): string | null => {
    if (!supplierId) return he.orders.customerOrderValidationSupplier;
    if (sourceMode === "catalog" && !selectedBook) return he.orders.customerOrderValidationBook;
    if (sourceMode === "manual" && manualTitle.trim().length < 1) {
      return he.orders.customerOrderValidationManualTitle;
    }
    const q = parseInt(quantity.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(q) || q < 1) return he.orders.customerOrderValidationQty;
    if (customerName.trim().length < 1) return he.orders.customerOrderValidationName;
    const digits = customerPhone.replace(/\D/g, "");
    if (digits.length < 7) return he.orders.customerOrderValidationPhone;
    return null;
  }, [
    supplierId,
    sourceMode,
    selectedBook,
    manualTitle,
    quantity,
    customerName,
    customerPhone,
  ]);

  const submit = useCallback(async () => {
    if (isOffline) {
      Alert.alert(he.orders.customerOrderOfflineTitle, he.orders.customerOrderOfflineMessage);
      return;
    }
    const err = validate();
    if (err) {
      Alert.alert(he.generic.errorTitle, err);
      return;
    }
    const qty = parseInt(quantity.replace(/[^\d]/g, ""), 10);
    const sid = supplierId!;
    try {
      if (sourceMode === "catalog") {
        await createOrder.mutateAsync({
          supplier_id: sid,
          order_type: "customer",
          quantity: qty,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          book_id: selectedBook!.id,
        });
      } else {
        await createOrder.mutateAsync({
          supplier_id: sid,
          order_type: "customer",
          quantity: qty,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          book_id: null,
          manual_book_title: manualTitle.trim(),
          manual_book_author: manualAuthor.trim() ? manualAuthor.trim() : null,
        });
      }
      Alert.alert(he.orders.customerOrderSuccessTitle, he.orders.customerOrderSuccessMessage);
      onCreated?.();
      onClose();
    } catch {
      Alert.alert(he.generic.errorTitle, he.orders.customerOrderFailed);
    }
  }, [
    isOffline,
    validate,
    sourceMode,
    supplierId,
    selectedBook,
    quantity,
    customerName,
    customerPhone,
    manualTitle,
    manualAuthor,
    createOrder,
    onCreated,
    onClose,
  ]);

  const openCatalog = () => {
    setSourceMode("catalog");
    setManualTitle("");
    setManualAuthor("");
  };

  const openManual = () => {
    setSourceMode("manual");
    setSelectedBook(null);
    setBookQuery("");
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{he.orders.customerOrderModalTitle}</Text>
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

            <View style={styles.modeRow}>
              <Pressable
                onPress={openCatalog}
                style={({ pressed }) => [
                  styles.modeBtn,
                  sourceMode === "catalog" && styles.modeBtnActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: sourceMode === "catalog" }}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    sourceMode === "catalog" && styles.modeBtnTextActive,
                  ]}
                >
                  {he.orders.customerOrderModeCatalog}
                </Text>
              </Pressable>
              <Pressable
                onPress={openManual}
                style={({ pressed }) => [
                  styles.modeBtn,
                  sourceMode === "manual" && styles.modeBtnActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: sourceMode === "manual" }}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    sourceMode === "manual" && styles.modeBtnTextActive,
                  ]}
                >
                  {he.orders.customerOrderModeManual}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.label}>{he.orders.customerOrderSupplier}</Text>
            <Pressable
              onPress={() => setSupplierPickerOpen(true)}
              style={({ pressed }) => [styles.supplierRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={he.orders.customerOrderPickSupplier}
            >
              <Text
                style={[
                  styles.supplierRowText,
                  !supplierId && styles.supplierRowPlaceholder,
                ]}
                numberOfLines={1}
              >
                {selectedSupplierName || he.orders.customerOrderPickSupplier}
              </Text>
              <Ionicons name="chevron-down-outline" size={20} color={theme.colors.primary} />
            </Pressable>
            <Text style={styles.microHint}>{he.orders.customerOrderSupplierRowHint}</Text>

            {sourceMode === "catalog" ? (
              <>
                <Text style={styles.label}>{he.orders.customerOrderBookSearchLabel}</Text>
                {selectedBook ? (
                  <View style={styles.selectedCard}>
                    <Text style={styles.selectedTitle} numberOfLines={3}>
                      {selectedBook.title}
                    </Text>
                    <Text style={styles.selectedMeta}>
                      {he.addRemove.fieldAuthor}: {selectedBook.author}
                    </Text>
                    <Text style={styles.selectedMeta}>
                      {he.orders.customerOrderListPrice}: {he.orders.pricePrefix}
                      {selectedBook.price}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setSelectedBook(null);
                        setBookQuery("");
                      }}
                      style={styles.changeBookBtn}
                      accessibilityRole="button"
                      accessibilityLabel={he.orders.customerOrderChangeBook}
                    >
                      <Text style={styles.changeBookText}>{he.orders.customerOrderChangeBook}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <View style={styles.searchWrap}>
                      <Ionicons name="search-outline" size={20} color={theme.colors.onSurfaceVariant} />
                      <TextInput
                        style={styles.searchInput}
                        value={bookQuery}
                        onChangeText={setBookQuery}
                        placeholder={he.orders.customerOrderBookSearchPlaceholder}
                        placeholderTextColor={theme.colors.onSurfaceVariant}
                        returnKeyType="search"
                        textAlign="left"
                        autoCorrect={false}
                      />
                    </View>
                    {showResultList ? (
                      <View style={styles.resultsBox}>
                        {searchQuery.isFetching ? (
                          <View style={styles.resultsLoading}>
                            <ActivityIndicator color={theme.colors.primary} />
                            <Text style={styles.resultsLoadingText}>
                              {he.orders.customerOrderSearchLoading}
                            </Text>
                          </View>
                        ) : searchQuery.isError ? (
                          <Text style={styles.resultsEmpty}>{he.orders.customerOrderSearchError}</Text>
                        ) : searchResults.length === 0 ? (
                          <Text style={styles.resultsEmpty}>
                            {supplierId
                              ? he.orders.customerOrderSearchEmptyForSupplier
                              : he.orders.customerOrderSearchEmpty}
                          </Text>
                        ) : (
                          <ScrollView
                            nestedScrollEnabled
                            keyboardShouldPersistTaps="handled"
                            style={styles.resultsScroll}
                          >
                            {searchResults.map((item) => (
                              <Pressable
                                key={item.id}
                                onPress={() => {
                                  setSelectedBook(item);
                                  setSupplierId(item.supplier_id);
                                  setBookQuery("");
                                }}
                                style={({ pressed }) => [
                                  styles.resultRow,
                                  pressed && styles.resultRowPressed,
                                ]}
                              >
                                <Text style={styles.resultTitle} numberOfLines={2}>
                                  {item.title}
                                </Text>
                                <Text style={styles.resultAuthor} numberOfLines={1}>
                                  {item.author}
                                </Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        )}
                      </View>
                    ) : null}
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={styles.label}>{he.orders.customerOrderManualTitleLabel}</Text>
                <TextInput
                  style={styles.field}
                  value={manualTitle}
                  onChangeText={setManualTitle}
                  placeholder={he.orders.customerOrderManualTitlePlaceholder}
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  textAlign="left"
                />
                <Text style={styles.label}>{he.orders.customerOrderManualAuthorLabel}</Text>
                <TextInput
                  style={styles.field}
                  value={manualAuthor}
                  onChangeText={setManualAuthor}
                  placeholder={he.orders.customerOrderManualAuthorPlaceholder}
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  textAlign="left"
                />
              </>
            )}

            <Text style={styles.label}>{he.orders.quantity}</Text>
            <TextInput
              style={styles.field}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              textAlign="left"
            />

            <Text style={styles.label}>{he.orders.customerOrderCustomerName}</Text>
            <TextInput
              style={styles.field}
              value={customerName}
              onChangeText={setCustomerName}
              placeholder={he.orders.customerOrderCustomerNamePlaceholder}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              textAlign="left"
              autoComplete="name"
            />

            <Text style={styles.label}>{he.orders.customerOrderCustomerPhone}</Text>
            <TextInput
              style={styles.field}
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType="phone-pad"
              placeholder={he.orders.customerOrderCustomerPhonePlaceholder}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              textAlign="left"
              autoComplete="tel"
            />

            <Text style={styles.hint}>{he.orders.customerOrderFormHint}</Text>

            <Pressable
              onPress={() => void submit()}
              disabled={createOrder.isPending}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.pressed,
                createOrder.isPending && styles.submitDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={he.orders.customerOrderSubmit}
            >
              {createOrder.isPending ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.submitText}>{he.orders.customerOrderSubmit}</Text>
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
    backgroundColor: theme.colors.errorContainer,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  offlineText: {
    ...theme.typography.labelMd,
    color: theme.colors.onErrorContainer,
    flex: 1,
    textAlign: "left",
  },
  modeRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    alignItems: "center",
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  modeBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceContainerHigh,
  },
  modeBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
  },
  modeBtnTextActive: {
    color: theme.colors.primary,
  },
  label: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.sm,
    textAlign: "left",
  },
  microHint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  supplierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  supplierRowText: {
    flex: 1,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  supplierRowPlaceholder: {
    color: theme.colors.onSurfaceVariant,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 28, 48, 0.45)",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  pickerCard: {
    maxHeight: "70%",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.md,
  },
  pickerTitle: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    marginBottom: theme.spacing.sm,
    textAlign: "left",
  },
  pickerScroll: { maxHeight: 360 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  pickerSwatch: { width: 10, height: 28, borderRadius: 4 },
  pickerRowText: {
    flex: 1,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.onSurface,
    fontSize: theme.typography.bodyMd.fontSize,
    paddingVertical: 4,
  },
  resultsBox: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  resultsScroll: { maxHeight: 220 },
  resultsLoading: {
    padding: theme.spacing.lg,
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  resultsLoadingText: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
  },
  resultsEmpty: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    padding: theme.spacing.md,
    textAlign: "left",
  },
  resultRow: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  resultRowPressed: { backgroundColor: theme.colors.surfaceContainerLow },
  resultTitle: {
    ...theme.typography.bodyLg,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  resultAuthor: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  selectedCard: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    gap: theme.spacing.xs,
  },
  selectedTitle: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  selectedMeta: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  changeBookBtn: { alignSelf: "flex-start", marginTop: theme.spacing.sm },
  changeBookText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
  },
  field: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.onSurface,
    fontSize: theme.typography.bodyMd.fontSize,
  },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.sm,
    textAlign: "left",
  },
  submitBtn: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.full,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.6 },
  submitText: {
    ...theme.typography.bodyLg,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.onPrimary,
  },
});
