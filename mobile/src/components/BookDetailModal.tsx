import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { Book, BookLocationPath, StoreMapBook } from "@avihay-books/shared";
import axios from "axios";
import { api } from "../api/client";
import { useSuppliersWithFallback } from "../api/unit";
import { theme } from "../theme";
import { he } from "../i18n/he";
import { mockCatalogBooks } from "../mocks/homeDashboard";

interface Props {
  /** ספר ב־`Book` המלא (ידוע ב־flow של חיפוש). */
  book?: Book | null;
  /** ספר במבנה מקוצר מתוך מפת החנות (long-press בארון). */
  storeMapBook?: StoreMapBook | null;
  visible: boolean;
  onClose: () => void;
  onAddShortage?: () => void;
  onMove?: () => void;
  /** סה״כ עותקים בארון התצוגה (מסך יחידת תצוגה בלבד). */
  displayOnDisplayTotal?: number | null;
  /** פותח רישום מכירה מהתצוגה (מסך יחידת תצוגה). */
  onRecordDisplaySale?: () => void;
  /** הפעולות במצב טעינה כעת. */
  busy?: boolean;
}

/**
 * מודאל פרטי ספר — תומך גם ב־`Book` המלא וגם ב־`StoreMapBook` (long-press).
 * כאשר ניתן רק `StoreMapBook` אנו מנסים לשלוף את ה־`Book` מה־API לפי `book_id`;
 * אם השרת לא זמין נופלים לקטלוג ה־mock.
 */
export function BookDetailModal({
  book,
  storeMapBook,
  visible,
  onClose,
  onAddShortage,
  onMove,
  displayOnDisplayTotal,
  onRecordDisplaySale,
  busy,
}: Props): JSX.Element {
  const bookId = book?.id ?? storeMapBook?.book_id ?? null;

  const pathsQuery = useQuery<BookLocationPath[]>({
    queryKey: ["book-location", bookId],
    queryFn: async () => {
      const { data } = await api.get<{ paths: BookLocationPath[] }>(
        `/books/${bookId}/location`,
      );
      return data.paths;
    },
    enabled: visible && !!bookId,
    staleTime: 30_000,
    retry: 0,
  });
  const paths = pathsQuery.data ?? [];

  /**
   * משלים פרטי `Book` אם הוחזק רק `StoreMapBook`. עם שגיאת רשת — נופל ל־mock catalog.
   */
  const fullBookQuery = useQuery<Book | null>({
    queryKey: ["book", bookId],
    queryFn: async () => {
      try {
        const { data } = await api.get<Book>(`/books/${bookId}`);
        return data;
      } catch (err) {
        if (axios.isAxiosError(err)) {
          return mockCatalogBooks.find((b) => b.id === bookId) ?? null;
        }
        throw err;
      }
    },
    enabled: visible && !!bookId && !book && !!storeMapBook,
    staleTime: 60_000,
    retry: 0,
  });
  const fetchedBook = fullBookQuery.data ?? null;
  const suppliers = useSuppliersWithFallback();

  const display = useMemo(() => {
    const b = book ?? fetchedBook;
    const supplierId = b?.supplier_id ?? storeMapBook?.supplier_id ?? null;
    const supplier = supplierId ? suppliers.find((s) => s.id === supplierId) : undefined;
    return {
      title: b?.title ?? storeMapBook?.title ?? "",
      author: b?.author ?? storeMapBook?.author ?? "",
      topic: b?.topic ?? "",
      supplierName: supplier?.name ?? "",
      price: b?.price ?? storeMapBook?.price ?? null,
      stock: b?.stock_quantity ?? null,
      isNew: (b?.is_new ?? storeMapBook?.is_new) === true,
      supplierColor:
        storeMapBook?.supplier_color ?? supplier?.color_hex ?? null,
    };
  }, [book, fetchedBook, storeMapBook, suppliers]);

  if (!bookId) return <></>;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              {display.supplierColor ? (
                <View
                  style={[styles.colorBar, { backgroundColor: display.supplierColor }]}
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{display.title}</Text>
                <Text style={styles.author}>{display.author}</Text>
              </View>
              {display.isNew ? (
                <View style={styles.newPill}>
                  <Text style={styles.newPillText}>חדש</Text>
                </View>
              ) : null}
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            {display.supplierName ? (
              <Field label={he.bookDetail.supplier} value={display.supplierName} />
            ) : null}
            {display.topic ? (
              <Field label={he.bookDetail.topic} value={display.topic} />
            ) : null}
            {display.price !== null ? (
              <Field label={he.bookDetail.price} value={`₪ ${display.price}`} />
            ) : null}
            {display.stock !== null ? (
              <Field label={he.bookDetail.stock} value={`${display.stock}`} />
            ) : null}
            {displayOnDisplayTotal != null && displayOnDisplayTotal > 0 ? (
              <Field
                label={he.bookDetail.onDisplayQty}
                value={`${displayOnDisplayTotal}`}
              />
            ) : null}

            {paths.length > 0 && (
              <View style={styles.locationBlock}>
                <Text style={styles.label}>{he.bookDetail.locationFull}</Text>
                {paths.map((p, index) => (
                  <Text key={`${p.cell_name}-${p.shelf_number}-${index}`} style={styles.value}>
                    {p.full_path}
                  </Text>
                ))}
                <Text style={[styles.label, { marginTop: theme.spacing.sm }]}>
                  {he.bookDetail.locationShort}
                </Text>
                <Text style={styles.shortPath}>{paths[0]!.short_path}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.actionsCol}>
            {onRecordDisplaySale ? (
              <Pressable
                onPress={onRecordDisplaySale}
                disabled={busy}
                style={[styles.actionBtn, styles.primarySaleBtn, busy && styles.actionDisabled]}
              >
                <Ionicons
                  name="cart-outline"
                  size={18}
                  color={theme.colors.onPrimary}
                />
                <Text style={styles.primarySaleBtnText}>{he.bookDetail.recordDisplaySale}</Text>
              </Pressable>
            ) : null}
            {onAddShortage ? (
              <Pressable
                onPress={onAddShortage}
                disabled={busy}
                style={[styles.actionBtn, styles.warnBtn, busy && styles.actionDisabled]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={theme.colors.onTertiaryContainer}
                />
                <Text style={styles.warnBtnText}>{he.bookDetail.addToShortage}</Text>
              </Pressable>
            ) : null}
            {onMove ? (
              <Pressable
                onPress={onMove}
                disabled={busy}
                style={[styles.actionBtn, styles.secondaryBtn, busy && styles.actionDisabled]}
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={18}
                  color={theme.colors.onSurface}
                />
                <Text style={styles.secondaryBtnText}>{he.bookDetail.moveLocation}</Text>
              </Pressable>
            ) : null}

            <Pressable style={[styles.actionBtn, styles.closeBtn]} onPress={onClose}>
              <Text style={styles.closeBtnText}>{he.bookDetail.close}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <View style={{ marginTop: theme.spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 28, 48, 0.45)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    maxHeight: "85%",
    overflow: "hidden",
    ...theme.shadow.modal,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    alignItems: "center",
  },
  colorBar: { width: 6, height: 48, borderRadius: 3 },
  title: {
    ...theme.typography.headlineMd,
    color: theme.colors.primary,
    textAlign: "left",
  },
  author: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  newPill: {
    backgroundColor: theme.colors.secondaryFixed,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  newPillText: {
    color: theme.colors.onSecondaryFixed,
    fontWeight: "700",
    fontSize: 11,
  },
  label: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  value: {
    ...theme.typography.bodyLg,
    color: theme.colors.onSurface,
    textAlign: "left",
    marginTop: 2,
  },
  shortPath: {
    ...theme.typography.headlineSm,
    color: theme.colors.secondary,
    textAlign: "left",
    marginTop: 4,
  },
  locationBlock: {
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineVariant,
  },
  actionsCol: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
  },
  actionDisabled: { opacity: 0.5 },
  warnBtn: {
    backgroundColor: theme.colors.tertiaryFixed,
  },
  warnBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.onTertiaryContainer,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  secondaryBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  primarySaleBtn: {
    backgroundColor: theme.colors.primary,
  },
  primarySaleBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  closeBtn: {
    backgroundColor: theme.colors.primary,
  },
  closeBtnText: {
    color: theme.colors.onPrimary,
    fontWeight: "700",
    fontSize: theme.typography.bodyLg.fontSize,
    fontFamily: theme.fontFamily.bold,
  },
});
