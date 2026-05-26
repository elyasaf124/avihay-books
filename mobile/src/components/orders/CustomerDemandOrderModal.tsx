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
  customerOrderLineKey,
  type CustomerOrderLineInput,
  useCreateCustomerOrderBundle,
  useSyncCustomerOrderBundle,
} from "../../api/orders";
import { useSearchBooks } from "../../api/storeMap";
import { useSuppliersWithFallback } from "../../api/unit";
import { he } from "../../i18n/he";
import { theme } from "../../theme";

type BookSourceMode = "catalog" | "manual";

interface DraftBookLine {
  localId: string;
  sourceMode: BookSourceMode;
  supplierId: string | null;
  selectedBook: Book | null;
  manualTitle: string;
  manualAuthor: string;
  quantity: string;
}

let draftLineCounter = 0;
function nextLocalId(): string {
  draftLineCounter += 1;
  return `draft-${draftLineCounter}-${Date.now()}`;
}

const DRAFT_QTY_MIN = 1;
const DRAFT_QTY_MAX = 999;

function stubBookFromOrderItem(item: OrderListItem): Book {
  return {
    id: item.book_id!,
    title: item.book_title,
    author: item.book_author,
    supplier_id: item.catalog_supplier_id ?? item.supplier_id ?? "",
    price: item.book_price,
    stock_quantity: 0,
    reorder_threshold: 0,
    is_new: false,
    added_at: item.created_at,
    topic: "",
    is_active: true,
    created_at: item.created_at,
    copy_placement_notes: [],
  };
}

function bundleToBookLines(bundle: OrderListItem[]): DraftBookLine[] {
  const map = new Map<string, DraftBookLine>();
  for (const item of bundle) {
    const key = customerOrderLineKey(item);
    const existing = map.get(key);
    if (existing) {
      const prev = parseInt(existing.quantity.replace(/[^\d]/g, ""), 10) || 0;
      existing.quantity = String(prev + item.quantity);
      continue;
    }
    map.set(key, {
      localId: nextLocalId(),
      sourceMode: item.book_id ? "catalog" : "manual",
      supplierId: item.supplier_id,
      selectedBook: item.book_id ? stubBookFromOrderItem(item) : null,
      manualTitle: item.manual_book_title ?? "",
      manualAuthor: item.manual_book_author ?? "",
      quantity: String(item.quantity),
    });
  }
  return Array.from(map.values());
}

function draftToLineInput(line: DraftBookLine): CustomerOrderLineInput | null {
  const qty = parseInt(line.quantity.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(qty) || qty < 1) return null;
  if (line.sourceMode === "catalog" && line.selectedBook) {
    return {
      supplier_id: line.supplierId,
      book_id: line.selectedBook.id,
      manual_book_title: null,
      manual_book_author: null,
      quantity: qty,
    };
  }
  if (line.sourceMode === "manual" && line.manualTitle.trim()) {
    return {
      supplier_id: line.supplierId,
      book_id: null,
      manual_book_title: line.manualTitle.trim(),
      manual_book_author: line.manualAuthor.trim() ? line.manualAuthor.trim() : null,
      quantity: qty,
    };
  }
  return null;
}

function draftLineKey(line: DraftBookLine): string | null {
  if (line.sourceMode === "catalog" && line.selectedBook) {
    return customerOrderLineKey({
      supplier_id: line.supplierId,
      book_id: line.selectedBook.id,
      manual_book_title: null,
    });
  }
  if (line.sourceMode === "manual" && line.manualTitle.trim()) {
    return customerOrderLineKey({
      supplier_id: line.supplierId,
      book_id: null,
      manual_book_title: line.manualTitle.trim(),
    });
  }
  return null;
}

function lineDisplayTitle(line: DraftBookLine): string {
  if (line.sourceMode === "catalog" && line.selectedBook) return line.selectedBook.title;
  return line.manualTitle.trim();
}

function lineDisplayAuthor(line: DraftBookLine): string {
  if (line.sourceMode === "catalog" && line.selectedBook) return line.selectedBook.author;
  return line.manualAuthor.trim();
}

function catalogSupplierMeta(
  book: Book | null,
  suppliers: { id: string; name: string; color_hex: string }[],
): { name: string; color: string } | null {
  if (!book) return null;
  const supplier = suppliers.find((s) => s.id === book.supplier_id);
  if (!supplier) return null;
  return { name: supplier.name, color: supplier.color_hex };
}

interface EditableBookLineCardProps {
  line: DraftBookLine;
  supplierName: string;
  supplierColor: string;
  searchOpen: boolean;
  searchQuery: string;
  searchResults: Book[];
  searchLoading: boolean;
  searchError: boolean;
  lockQuantity?: boolean;
  onUpdate: (patch: Partial<DraftBookLine>) => void;
  onRemove: () => void;
  onOpenSupplierPicker: () => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onSearchQueryChange: (q: string) => void;
  onSelectBook: (book: Book) => void;
  suppliers: { id: string; name: string; color_hex: string }[];
}

function EditableBookLineCard({
  line,
  supplierName,
  supplierColor,
  searchOpen,
  searchQuery,
  searchResults,
  searchLoading,
  searchError,
  onUpdate,
  onRemove,
  onOpenSupplierPicker,
  onOpenSearch,
  onCloseSearch,
  onSearchQueryChange,
  onSelectBook,
  suppliers,
  lockQuantity = false,
}: EditableBookLineCardProps): JSX.Element {
  const isCatalog = line.sourceMode === "catalog";

  return (
    <View style={styles.infoCard}>
      <View style={styles.bookCardHeader}>
        <View style={styles.modeRowCompact}>
          <Pressable
            onPress={() =>
              onUpdate({
                sourceMode: "catalog",
                manualTitle: "",
                manualAuthor: "",
                selectedBook: line.selectedBook,
              })
            }
            style={[styles.modeChip, isCatalog && styles.modeChipActive]}
          >
            <Text style={[styles.modeChipText, isCatalog && styles.modeChipTextActive]}>
              {he.orders.customerOrderModeCatalog}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              onUpdate({
                sourceMode: "manual",
                selectedBook: null,
                manualTitle: line.selectedBook?.title ?? line.manualTitle,
                manualAuthor: line.selectedBook?.author ?? line.manualAuthor,
              })
            }
            style={[styles.modeChip, !isCatalog && styles.modeChipActive]}
          >
            <Text style={[styles.modeChipText, !isCatalog && styles.modeChipTextActive]}>
              {he.orders.customerOrderModeManual}
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={he.orders.customerOrderRemoveBookA11y}
          style={({ pressed }) => [styles.bookCardRemove, pressed && styles.pressed]}
        >
          <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
        </Pressable>
      </View>

      <Pressable
        onPress={onOpenSupplierPicker}
        style={({ pressed }) => [styles.editableRow, styles.editableRowPressable, pressed && styles.editableRowPressed]}
        accessibilityRole="button"
        accessibilityLabel={he.orders.customerOrderPickSupplier}
      >
        <Text style={styles.editableRowLabel}>{he.orders.customerOrderSupplier}</Text>
        <View style={styles.editableRowValueWrap}>
          <View style={[styles.supplierSwatch, { backgroundColor: supplierColor }]} />
          <Text style={styles.editableRowValue} numberOfLines={1}>
            {supplierName || he.orders.customerOrderNoSupplier}
          </Text>
          <Ionicons name="chevron-down-outline" size={18} color={theme.colors.primary} />
        </View>
      </Pressable>

      {isCatalog ? (
        <>
          {searchOpen ? (
            <View style={styles.editableRowStack}>
              <View style={styles.searchWrapCompact}>
                <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={onSearchQueryChange}
                  placeholder={he.orders.customerOrderBookSearchPlaceholder}
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  autoFocus
                  textAlign="left"
                  autoCorrect={false}
                />
                <Pressable onPress={onCloseSearch} hitSlop={8}>
                  <Ionicons name="close" size={20} color={theme.colors.onSurfaceVariant} />
                </Pressable>
              </View>
              {searchLoading ? (
                <ActivityIndicator color={theme.colors.primary} style={styles.inlineLoader} />
              ) : searchError ? (
                <Text style={styles.inlineError}>{he.orders.customerOrderSearchError}</Text>
              ) : searchQuery.trim().length > 0 && searchResults.length === 0 ? (
                <Text style={styles.inlineError}>
                  {line.supplierId
                    ? he.orders.customerOrderSearchEmptyForSupplier
                    : he.orders.customerOrderSearchEmpty}
                </Text>
              ) : (
                searchResults.slice(0, 5).map((book) => (
                  <Pressable
                    key={book.id}
                    onPress={() => onSelectBook(book)}
                    style={({ pressed }) => [styles.searchResultRow, pressed && styles.editableRowPressed]}
                  >
                    <Text style={styles.searchResultTitle} numberOfLines={2}>
                      {book.title}
                    </Text>
                    <Text style={styles.searchResultAuthor} numberOfLines={1}>
                      {book.author}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          ) : (
            <Pressable
              onPress={onOpenSearch}
              style={({ pressed }) => [
                styles.editableRow,
                styles.editableRowPressable,
                pressed && styles.editableRowPressed,
              ]}
            >
              <Text style={styles.editableRowLabel}>{he.orders.customerOrderBookSearchLabel}</Text>
              <Text
                style={[
                  styles.editableRowValue,
                  !line.selectedBook && styles.editableRowPlaceholder,
                ]}
                numberOfLines={2}
              >
                {line.selectedBook?.title ?? he.orders.customerOrderBookSearchPlaceholder}
              </Text>
            </Pressable>
          )}
          {line.selectedBook ? (
            <>
              <View style={styles.editableRow}>
                <Text style={styles.editableRowLabel}>{he.addRemove.fieldAuthor}</Text>
                <Text style={styles.editableRowValueStatic} numberOfLines={1}>
                  {line.selectedBook.author}
                </Text>
              </View>
              {(() => {
                const catalogSupplier = catalogSupplierMeta(line.selectedBook, suppliers);
                return catalogSupplier ? (
                  <View style={styles.editableRow}>
                    <Text style={styles.editableRowLabel}>{he.orders.customerOrderSupplier}</Text>
                    <View style={styles.catalogSupplierRow}>
                      <View
                        style={[
                          styles.supplierSwatch,
                          { backgroundColor: catalogSupplier.color },
                        ]}
                      />
                      <Text style={styles.editableRowValueStatic} numberOfLines={1}>
                        {he.orders.customerOrderCatalogSupplier.replace(
                          "{{name}}",
                          catalogSupplier.name,
                        )}
                      </Text>
                    </View>
                  </View>
                ) : null;
              })()}
            </>
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.editableRowStack}>
            <Text style={styles.editableRowLabel}>{he.orders.customerOrderManualTitleLabel}</Text>
            <TextInput
              style={styles.editableInput}
              value={line.manualTitle}
              onChangeText={(t) => onUpdate({ manualTitle: t })}
              placeholder={he.orders.customerOrderManualTitlePlaceholder}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              textAlign="left"
            />
          </View>
          <View style={styles.editableRowStack}>
            <Text style={styles.editableRowLabel}>{he.orders.customerOrderManualAuthorLabel}</Text>
            <TextInput
              style={styles.editableInput}
              value={line.manualAuthor}
              onChangeText={(t) => onUpdate({ manualAuthor: t })}
              placeholder={he.orders.customerOrderManualAuthorPlaceholder}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              textAlign="left"
            />
          </View>
        </>
      )}

      <View style={styles.editableRowStack}>
        <Text style={styles.editableRowLabel}>{he.orders.quantity}</Text>
        {lockQuantity ? (
          <Text style={styles.qtyReadonly}>
            ×{line.quantity.replace(/[^\d]/g, "") || "1"}
          </Text>
        ) : (
          <TextInput
            style={styles.editableInput}
            value={line.quantity}
            onChangeText={(t) => onUpdate({ quantity: t })}
            keyboardType="number-pad"
            placeholder="1"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            textAlign="left"
          />
        )}
      </View>
    </View>
  );
}

interface CustomerDetailsCardProps {
  name: string;
  phone: string;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
}

function CustomerDetailsCard({
  name,
  phone,
  onNameChange,
  onPhoneChange,
}: CustomerDetailsCardProps): JSX.Element {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoCardTitle}>{he.orders.customerOrderCustomerSection}</Text>
      <View style={styles.editableRowStack}>
        <Text style={styles.editableRowLabel}>{he.orders.customerOrderCustomerName}</Text>
        <TextInput
          style={styles.editableInput}
          value={name}
          onChangeText={onNameChange}
          placeholder={he.orders.customerOrderCustomerNamePlaceholder}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          textAlign="left"
          autoComplete="name"
        />
      </View>
      <View style={styles.editableRowStack}>
        <Text style={styles.editableRowLabel}>{he.orders.customerOrderCustomerPhone}</Text>
        <TextInput
          style={styles.editableInput}
          value={phone}
          onChangeText={onPhoneChange}
          keyboardType="phone-pad"
          placeholder={he.orders.customerOrderCustomerPhonePlaceholder}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          textAlign="left"
          autoComplete="tel"
        />
      </View>
    </View>
  );
}

export interface CustomerDemandOrderModalProps {
  visible: boolean;
  onClose: () => void;
  isOffline: boolean;
  onCreated?: () => void;
  onUpdated?: () => void;
  mode?: "create" | "edit";
  /** סוג ההזמנה לחבילת לקוח / וואטסאפ */
  demandOrderType?: "customer" | "whatsapp";
  /** שורות גולמיות (לא מאוחדות) לעריכת חבילת לקוח */
  initialBundle?: OrderListItem[];
}

export function CustomerDemandOrderModal({
  visible,
  onClose,
  isOffline,
  onCreated,
  onUpdated,
  mode = "create",
  demandOrderType = "customer",
  initialBundle,
}: CustomerDemandOrderModalProps): JSX.Element {
  const isEdit = mode === "edit";

  const [bookLines, setBookLines] = useState<DraftBookLine[]>([]);
  const [originalBundle, setOriginalBundle] = useState<OrderListItem[]>([]);
  const [originalCustomer, setOriginalCustomer] = useState({ name: "", phone: "" });

  const [sourceMode, setSourceMode] = useState<BookSourceMode>("catalog");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [bookQuery, setBookQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualAuthor, setManualAuthor] = useState("");
  const [draftQuantity, setDraftQuantity] = useState(DRAFT_QTY_MIN);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [supplierPickerLineId, setSupplierPickerLineId] = useState<string | null>(null);
  const [bookSearchLineId, setBookSearchLineId] = useState<string | null>(null);
  const [lineBookQuery, setLineBookQuery] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const suppliers = useSuppliersWithFallback();
  const trimmedQuery = bookQuery.trim();
  const searchQuery = useSearchBooks(trimmedQuery, {
    supplierId,
    enabled: !isEdit && sourceMode === "catalog",
  });
  const lineSearchSupplierId = useMemo(() => {
    if (!bookSearchLineId) return null;
    return bookLines.find((l) => l.localId === bookSearchLineId)?.supplierId ?? null;
  }, [bookSearchLineId, bookLines]);
  const lineSearchQuery = useSearchBooks(lineBookQuery.trim(), {
    supplierId: lineSearchSupplierId,
    enabled: bookSearchLineId != null,
  });
  const syncBundle = useSyncCustomerOrderBundle();
  const createBundle = useCreateCustomerOrderBundle();

  const resetDraftFields = useCallback(() => {
    setSourceMode("catalog");
    setSupplierId(null);
    setSupplierPickerOpen(false);
    setSupplierPickerLineId(null);
    setBookSearchLineId(null);
    setLineBookQuery("");
    setBookQuery("");
    setSelectedBook(null);
    setManualTitle("");
    setManualAuthor("");
    setDraftQuantity(DRAFT_QTY_MIN);
  }, []);

  const resetAll = useCallback(() => {
    setBookLines([]);
    setOriginalBundle([]);
    setOriginalCustomer({ name: "", phone: "" });
    setCustomerName("");
    setCustomerPhone("");
    resetDraftFields();
  }, [resetDraftFields]);

  useEffect(() => {
    if (!visible) {
      resetAll();
      return;
    }
    if (isEdit && initialBundle && initialBundle.length > 0) {
      const first = initialBundle[0]!;
      const name = (first.customer_name ?? "").trim();
      const phone = (first.customer_phone ?? "").trim();
      setCustomerName(name);
      setCustomerPhone(phone);
      setOriginalCustomer({ name, phone });
      setOriginalBundle(initialBundle);
      setBookLines(bundleToBookLines(initialBundle));
      resetDraftFields();
    } else if (!isEdit) {
      resetAll();
    }
  }, [visible, isEdit, initialBundle, resetAll, resetDraftFields]);

  const selectedSupplierName = useMemo(() => {
    if (!supplierId) return "";
    return suppliers.find((s) => s.id === supplierId)?.name ?? "";
  }, [supplierId, suppliers]);

  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) m.set(s.id, s.name);
    return m;
  }, [suppliers]);

  const searchResults = searchQuery.data ?? [];
  const showResultList = sourceMode === "catalog" && !selectedBook && trimmedQuery.length > 0;

  const validateCustomer = useCallback((): string | null => {
    if (customerName.trim().length < 1) return he.orders.customerOrderValidationName;
    const digits = customerPhone.replace(/\D/g, "");
    if (digits.length < 7) return he.orders.customerOrderValidationPhone;
    return null;
  }, [customerName, customerPhone]);

  const validateDraft = useCallback((): string | null => {
    if (sourceMode === "catalog" && !selectedBook) return he.orders.customerOrderValidationBook;
    if (sourceMode === "manual" && manualTitle.trim().length < 1) {
      return he.orders.customerOrderValidationManualTitle;
    }
    if (draftQuantity < DRAFT_QTY_MIN) return he.orders.customerOrderValidationQty;
    return null;
  }, [sourceMode, selectedBook, manualTitle, draftQuantity]);

  const addDraftToList = useCallback(() => {
    const err = validateDraft();
    if (err) {
      Alert.alert(he.generic.errorTitle, err);
      return;
    }
    const draft: DraftBookLine = {
      localId: nextLocalId(),
      sourceMode,
      supplierId,
      selectedBook: sourceMode === "catalog" ? selectedBook : null,
      manualTitle,
      manualAuthor,
      quantity: String(draftQuantity),
    };
    const key = draftLineKey(draft);
    if (key && bookLines.some((l) => draftLineKey(l) === key)) {
      Alert.alert(he.generic.errorTitle, he.orders.customerOrderValidationDuplicateBook);
      return;
    }
    setBookLines((prev) => [...prev, draft]);
    resetDraftFields();
  }, [
    validateDraft,
    sourceMode,
    supplierId,
    selectedBook,
    manualTitle,
    manualAuthor,
    draftQuantity,
    bookLines,
    resetDraftFields,
  ]);

  const removeFromList = useCallback((localId: string) => {
    setBookLines((prev) => prev.filter((l) => l.localId !== localId));
  }, []);

  const updateBookLine = useCallback((localId: string, patch: Partial<DraftBookLine>) => {
    setBookLines((prev) =>
      prev.map((l) => (l.localId === localId ? { ...l, ...patch } : l)),
    );
  }, []);

  const addEmptyBookLine = useCallback(() => {
    setBookLines((prev) => [
      ...prev,
      {
        localId: nextLocalId(),
        sourceMode: "catalog" as const,
        supplierId: null,
        selectedBook: null,
        manualTitle: "",
        manualAuthor: "",
        quantity: "1",
      },
    ]);
  }, []);

  const supplierPickerVisible = supplierPickerOpen || supplierPickerLineId != null;
  const activePickerSupplierId = supplierPickerLineId
    ? bookLines.find((l) => l.localId === supplierPickerLineId)?.supplierId ?? null
    : supplierId;

  const submit = useCallback(async () => {
    if (isOffline) {
      Alert.alert(he.orders.customerOrderOfflineTitle, he.orders.customerOrderOfflineMessage);
      return;
    }
    const customerErr = validateCustomer();
    if (customerErr) {
      Alert.alert(he.generic.errorTitle, customerErr);
      return;
    }
    if (bookLines.length < 1) {
      Alert.alert(he.generic.errorTitle, he.orders.customerOrderValidationAtLeastOneBook);
      return;
    }
    const lineInputs: CustomerOrderLineInput[] = [];
    const seenKeys = new Set<string>();
    for (const line of bookLines) {
      const input = draftToLineInput(line);
      if (!input) {
        Alert.alert(he.generic.errorTitle, he.orders.customerOrderValidationBook);
        return;
      }
      const key = draftLineKey(line);
      if (key && seenKeys.has(key)) {
        Alert.alert(he.generic.errorTitle, he.orders.customerOrderValidationDuplicateBook);
        return;
      }
      if (key) seenKeys.add(key);
      lineInputs.push(input);
    }
    const customer = { name: customerName.trim(), phone: customerPhone.trim() };
    setSubmitting(true);
    try {
      if (isEdit) {
        await syncBundle.mutateAsync({
          original: originalBundle,
          next: lineInputs,
          customer,
          originalCustomer,
          orderType: demandOrderType,
        });
        Alert.alert(he.orders.customerOrderSuccessTitle, he.orders.customerOrderEditSuccessMessage);
        onUpdated?.();
      } else {
        await createBundle.mutateAsync({ lines: lineInputs, customer, orderType: demandOrderType });
        Alert.alert(he.orders.customerOrderSuccessTitle, he.orders.customerOrderSuccessMessage);
        onCreated?.();
      }
      onClose();
    } catch {
      Alert.alert(
        he.generic.errorTitle,
        isEdit ? he.orders.customerOrderEditFailed : he.orders.customerOrderFailed,
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    isOffline,
    validateCustomer,
    bookLines,
    customerName,
    customerPhone,
    isEdit,
    syncBundle,
    createBundle,
    originalBundle,
    originalCustomer,
    demandOrderType,
    onUpdated,
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

  const headerTitle = isEdit
    ? demandOrderType === "whatsapp"
      ? he.orders.whatsappOrderEditModalTitle
      : he.orders.customerOrderEditModalTitle
    : he.orders.customerOrderModalTitle;
  const submitLabel = isEdit ? he.orders.customerOrderEditSubmit : he.orders.customerOrderSubmit;
  const isPending = submitting || syncBundle.isPending || createBundle.isPending;

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
            <Text style={styles.headerTitle}>{headerTitle}</Text>
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

            {isEdit ? (
              <>
                <CustomerDetailsCard
                  name={customerName}
                  phone={customerPhone}
                  onNameChange={setCustomerName}
                  onPhoneChange={setCustomerPhone}
                />

                <Text style={styles.sectionHeading}>{he.orders.customerOrderBooksSection}</Text>
                <Text style={styles.sectionHint}>{he.orders.customerOrderEditBookHint}</Text>

                {bookLines.map((line) => {
                  const supplier = suppliers.find((s) => s.id === line.supplierId);
                  return (
                    <EditableBookLineCard
                      key={line.localId}
                      line={line}
                      supplierName={supplier?.name ?? ""}
                      supplierColor={supplier?.color_hex ?? theme.colors.outlineVariant}
                      searchOpen={bookSearchLineId === line.localId}
                      searchQuery={bookSearchLineId === line.localId ? lineBookQuery : ""}
                      searchResults={
                        bookSearchLineId === line.localId ? (lineSearchQuery.data ?? []) : []
                      }
                      searchLoading={
                        bookSearchLineId === line.localId && lineSearchQuery.isFetching
                      }
                      searchError={bookSearchLineId === line.localId && lineSearchQuery.isError}
                      onUpdate={(patch) => updateBookLine(line.localId, patch)}
                      onRemove={() => removeFromList(line.localId)}
                      onOpenSupplierPicker={() => {
                        setBookSearchLineId(null);
                        setLineBookQuery("");
                        setSupplierPickerLineId(line.localId);
                      }}
                      onOpenSearch={() => {
                        setSupplierPickerLineId(null);
                        setBookSearchLineId(line.localId);
                        setLineBookQuery("");
                      }}
                      onCloseSearch={() => {
                        setBookSearchLineId(null);
                        setLineBookQuery("");
                      }}
                      onSearchQueryChange={setLineBookQuery}
                      onSelectBook={(book) => {
                        updateBookLine(line.localId, {
                          selectedBook: book,
                          supplierId: book.supplier_id,
                        });
                        setBookSearchLineId(null);
                        setLineBookQuery("");
                      }}
                      suppliers={suppliers}
                    />
                  );
                })}

                <Pressable
                  onPress={addEmptyBookLine}
                  style={({ pressed }) => [styles.addBookCardBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={he.orders.customerOrderAddBookCard}
                >
                  <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
                  <Text style={styles.addBookCardBtnText}>{he.orders.customerOrderAddBookCard}</Text>
                </Pressable>

                <Pressable
                  onPress={() => void submit()}
                  disabled={isPending}
                  style={({ pressed }) => [
                    styles.submitBtn,
                    pressed && styles.pressed,
                    isPending && styles.submitDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={submitLabel}
                >
                  {isPending ? (
                    <ActivityIndicator color={theme.colors.onPrimary} />
                  ) : (
                    <Text style={styles.submitText}>{submitLabel}</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
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

            {bookLines.length > 0 ? (
              <>
                <Text style={[styles.label, styles.sectionLabel]}>
                  {he.orders.customerOrderBooksSection}
                </Text>
                <View style={styles.bookLinesBox}>
                  {bookLines.map((line) => (
                    <View key={line.localId} style={styles.bookLineCard}>
                      <View style={styles.bookLineBody}>
                        <Text style={styles.bookLineTitle} numberOfLines={2}>
                          {lineDisplayTitle(line)}
                        </Text>
                        <Text style={styles.bookLineMeta} numberOfLines={1}>
                          {he.addRemove.fieldAuthor}: {lineDisplayAuthor(line) || he.orders.authorNotSpecified}
                        </Text>
                        <Text style={styles.bookLineMeta} numberOfLines={1}>
                          {he.orders.customerOrderSupplier}:{" "}
                          {line.supplierId
                            ? (supplierNameById.get(line.supplierId) ?? line.supplierId)
                            : he.orders.customerOrderNoSupplier}
                        </Text>
                        <Text style={styles.bookLineQty}>
                          {he.orders.quantity}: ×{line.quantity.replace(/[^\d]/g, "") || "1"}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => removeFromList(line.localId)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={he.orders.customerOrderRemoveBookA11y}
                        style={({ pressed }) => [styles.removeLineBtn, pressed && styles.pressed]}
                      >
                        <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={[styles.label, styles.sectionLabel]}>
              {he.orders.customerOrderAddBookSection}
            </Text>

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
                {selectedSupplierName || he.orders.customerOrderNoSupplier}
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
                    {(() => {
                      const catalogSupplier = catalogSupplierMeta(selectedBook, suppliers);
                      return catalogSupplier ? (
                        <View style={styles.catalogSupplierRow}>
                          <View
                            style={[
                              styles.supplierSwatch,
                              { backgroundColor: catalogSupplier.color },
                            ]}
                          />
                          <Text style={styles.selectedMeta}>
                            {he.orders.customerOrderCatalogSupplier.replace(
                              "{{name}}",
                              catalogSupplier.name,
                            )}
                          </Text>
                        </View>
                      ) : null;
                    })()}
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

            <View style={styles.stepper}>
              <Text style={styles.label}>{he.orders.quantity}</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  onPress={() =>
                    setDraftQuantity((q) => Math.max(DRAFT_QTY_MIN, q - 1))
                  }
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={he.orders.quantity}
                >
                  <Ionicons name="remove" size={20} color={theme.colors.onPrimary} />
                </Pressable>
                <Text style={styles.stepValue}>{draftQuantity}</Text>
                <Pressable
                  onPress={() =>
                    setDraftQuantity((q) => Math.min(DRAFT_QTY_MAX, q + 1))
                  }
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={he.orders.quantity}
                >
                  <Ionicons name="add" size={20} color={theme.colors.onPrimary} />
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={addDraftToList}
              style={({ pressed }) => [styles.addBookBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={he.orders.customerOrderAddBook}
            >
              <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.addBookBtnText}>{he.orders.customerOrderAddBook}</Text>
            </Pressable>

            <Text style={styles.hint}>{he.orders.customerOrderFormHint}</Text>

            <Pressable
              onPress={() => void submit()}
              disabled={isPending}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.pressed,
                isPending && styles.submitDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={submitLabel}
            >
              {isPending ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.submitText}>{submitLabel}</Text>
              )}
            </Pressable>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={supplierPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSupplierPickerOpen(false);
          setSupplierPickerLineId(null);
        }}
      >
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => {
            setSupplierPickerOpen(false);
            setSupplierPickerLineId(null);
          }}
        >
          <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>{he.orders.customerOrderSupplierPickerTitle}</Text>
            <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => {
                  if (supplierPickerLineId) {
                    updateBookLine(supplierPickerLineId, { supplierId: null });
                    setSupplierPickerLineId(null);
                  } else {
                    setSupplierId(null);
                    setSupplierPickerOpen(false);
                  }
                }}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.resultRowPressed]}
              >
                <View
                  style={[
                    styles.pickerSwatch,
                    { backgroundColor: theme.colors.outlineVariant },
                  ]}
                />
                <Text style={styles.pickerRowText} numberOfLines={1}>
                  {he.orders.customerOrderNoSupplier}
                </Text>
                {activePickerSupplierId == null ? (
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
                ) : null}
              </Pressable>
              {suppliers.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    if (supplierPickerLineId) {
                      updateBookLine(supplierPickerLineId, { supplierId: s.id });
                      setSupplierPickerLineId(null);
                    } else {
                      setSupplierId(s.id);
                      setSupplierPickerOpen(false);
                    }
                  }}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.resultRowPressed]}
                >
                  <View style={[styles.pickerSwatch, { backgroundColor: s.color_hex }]} />
                  <Text style={styles.pickerRowText} numberOfLines={1}>
                    {s.name}
                  </Text>
                  {activePickerSupplierId === s.id ? (
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
  sectionLabel: { marginTop: theme.spacing.md },
  sectionHeading: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    marginTop: theme.spacing.lg,
    textAlign: "left",
  },
  sectionHint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    marginBottom: theme.spacing.xs,
  },
  infoCard: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    gap: theme.spacing.sm,
  },
  infoCardTitle: {
    ...theme.typography.labelMd,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.primary,
    textAlign: "left",
  },
  bookCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  bookCardRemove: { padding: theme.spacing.xs },
  modeRowCompact: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    flex: 1,
  },
  modeChip: {
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surface,
  },
  modeChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceContainerHigh,
  },
  modeChipText: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
  },
  modeChipTextActive: {
    color: theme.colors.primary,
  },
  editableRow: {
    gap: 4,
    paddingVertical: theme.spacing.xs,
  },
  editableRowStack: {
    gap: 4,
  },
  editableRowPressable: {
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.xs,
    marginHorizontal: -theme.spacing.xs,
  },
  editableRowPressed: {
    backgroundColor: theme.colors.surfaceContainerHigh,
  },
  editableRowLabel: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  editableRowValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  editableRowValue: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: "left",
  },
  editableRowValueStatic: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  editableRowPlaceholder: {
    color: theme.colors.onSurfaceVariant,
  },
  editableInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.onSurface,
    fontSize: theme.typography.bodyMd.fontSize,
  },
  qtyReadonly: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  supplierSwatch: { width: 10, height: 22, borderRadius: 4 },
  searchWrapCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  searchResultRow: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radius.md,
  },
  searchResultTitle: {
    ...theme.typography.bodyMd,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  searchResultAuthor: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  inlineLoader: { marginVertical: theme.spacing.sm },
  inlineError: {
    ...theme.typography.caption,
    color: theme.colors.error,
    textAlign: "left",
    paddingVertical: theme.spacing.xs,
  },
  addBookCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  addBookCardBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
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
  bookLinesBox: {
    gap: theme.spacing.sm,
  },
  bookLineCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  bookLineBody: { flex: 1, gap: 2 },
  bookLineTitle: {
    ...theme.typography.bodyLg,
    fontFamily: theme.fontFamily.semibold,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  bookLineMeta: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  bookLineQty: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    marginTop: theme.spacing.xs,
    textAlign: "left",
  },
  removeLineBtn: {
    padding: theme.spacing.xs,
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
  catalogSupplierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
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
  stepper: {
    gap: theme.spacing.xs,
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
  addBookBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  addBookBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
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
