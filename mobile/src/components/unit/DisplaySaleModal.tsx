import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import type { Book } from "@avihay-books/shared";
import { api } from "../../api/client";
import { useAddShortage } from "../../api/unit";
import { he } from "../../i18n/he";
import { theme } from "../../theme";
import type { DisplayBookAggregate } from "../../utils/displayBookAggregate";

interface Props {
  visible: boolean;
  aggregate: DisplayBookAggregate | null;
  onClose: () => void;
  onDone: () => void;
}

export function DisplaySaleModal({
  visible,
  aggregate,
  onClose,
  onDone,
}: Props): JSX.Element {
  const [soldDraft, setSoldDraft] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const bookId = aggregate?.book_id ?? null;

  const bookQuery = useQuery<Book>({
    queryKey: ["book", bookId, "display-sale"],
    queryFn: async () => {
      const { data } = await api.get<Book>(`/books/${bookId!}`);
      return data;
    },
    enabled: visible && !!bookId,
    staleTime: 0,
  });

  const addShortage = useAddShortage();

  useEffect(() => {
    if (!visible) return;
    setSoldDraft("1");
    setError(null);
  }, [visible, aggregate?.book_id]);

  const busy = addShortage.isPending || bookQuery.isFetching;

  const stock = bookQuery.data?.stock_quantity ?? null;
  const displayQty = aggregate?.totalQuantity ?? 0;

  const submit = useCallback(async () => {
    if (!aggregate || stock === null) return;
    const sold = Math.max(0, Math.floor(Number.parseInt(soldDraft, 10) || 0));
    if (sold < 1) {
      setError(he.unit.displaySale.soldMin);
      return;
    }
    if (sold > displayQty) {
      setError(he.unit.displaySale.soldExceedsDisplay);
      return;
    }
    if (sold > stock) {
      setError(he.unit.displaySale.soldExceedsStock);
      return;
    }

    setError(null);
    const spots = [...aggregate.spots]
      .filter((s) => s.quantity_in_cell > 0)
      .sort((a, b) => a.location_id.localeCompare(b.location_id));
    let remaining = sold;
    const plan: { locationId: string; take: number }[] = [];
    for (const s of spots) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, s.quantity_in_cell);
      if (take <= 0) continue;
      remaining -= take;
      plan.push({ locationId: s.location_id, take });
    }
    if (remaining > 0) {
      setError(he.unit.displaySale.soldExceedsDisplay);
      return;
    }

    try {
      /**
       * אותו מסלול כמו מכירה מהמדף: `POST /shortage` מפחית מלאי + כמות בתא
       * ויוצר רשומת חוסר (עותק אחד לכל קריאה — כדי שביטול/השלמה ישחזרו עותק בודד).
       * לא מוחקים `book_locations` — אחרת הספר נעלם בלי אפשרות השלמה.
       */
      for (const { locationId, take } of plan) {
        for (let i = 0; i < take; i += 1) {
          await addShortage.mutateAsync({
            bookId: aggregate.book_id,
            soldQuantity: 1,
            locationId,
          });
        }
      }
      onDone();
      onClose();
    } catch {
      setError(he.unit.displaySale.failed);
    }
  }, [
    aggregate,
    soldDraft,
    stock,
    displayQty,
    addShortage,
    onClose,
    onDone,
  ]);

  const title = aggregate?.representative.title ?? "";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.headerTitle} numberOfLines={2}>
                {he.unit.displaySale.title}
              </Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.onSurface} />
              </Pressable>
            </View>

            <Text style={styles.bookLine} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.meta}>
              {he.unit.displaySale.displayQty}: {displayQty} · {he.unit.displaySale.stock}:{" "}
              {stock ?? he.home.loading}
            </Text>

            <Text style={styles.label}>{he.unit.displaySale.soldLabel}</Text>
            <TextInput
              style={styles.input}
              value={soldDraft}
              onChangeText={(t) => {
                setSoldDraft(t.replace(/[^0-9]/g, ""));
                setError(null);
              }}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              textAlign="left"
            />
            <Text style={styles.hint}>{he.unit.displaySale.hint}</Text>

            {error ? <Text style={styles.err}>{error}</Text> : null}

            <Pressable
              style={[styles.primaryBtn, (!aggregate || busy || stock === null) && styles.disabled]}
              disabled={!aggregate || busy || stock === null}
              onPress={() => void submit()}
            >
              {busy ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>{he.unit.displaySale.submit}</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 28, 48, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.outlineVariant,
    marginBottom: theme.spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  headerTitle: {
    ...theme.typography.headlineSm,
    color: theme.colors.primary,
    flex: 1,
    textAlign: "left",
  },
  bookLine: {
    ...theme.typography.bodyLg,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  meta: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  label: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    textAlign: "left",
    marginTop: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 18,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  err: {
    ...theme.typography.bodyMd,
    color: theme.colors.error,
    textAlign: "left",
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    marginTop: theme.spacing.md,
  },
  primaryBtnText: {
    color: theme.colors.onPrimary,
    fontWeight: "700",
    fontSize: theme.typography.bodyLg.fontSize,
  },
  disabled: { opacity: 0.5 },
});
