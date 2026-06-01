import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Supplier } from "@avihay-books/shared";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

export interface UnitFilterState {
  supplierIds: string[];
  topics: string[];
  priceMin: number | null;
  priceMax: number | null;
}

export const emptyFilters: UnitFilterState = {
  supplierIds: [],
  topics: [],
  priceMin: null,
  priceMax: null,
};

/** ממלא שדות חסרים — למקרה של state ישן אחרי hot reload או spread חלקי. */
export function normalizeUnitFilterState(
  filters: Partial<UnitFilterState> | UnitFilterState,
): UnitFilterState {
  return {
    supplierIds: filters.supplierIds ?? emptyFilters.supplierIds,
    topics: filters.topics ?? emptyFilters.topics,
    priceMin: filters.priceMin ?? emptyFilters.priceMin,
    priceMax: filters.priceMax ?? emptyFilters.priceMax,
  };
}

/** גובה קבוע לאזור הרשימה — הגלילה הכללית של המודל מטפלת ביתר. */
const LIST_VIEWPORT_HEIGHT = 160;
/** אזור מעל הגיליון — לחיצה סוגרת את המודל */
const DISMISS_STRIP_HEIGHT = 72;

interface Props {
  filters: UnitFilterState;
  suppliers: Supplier[];
  /** נושאים זמינים לסינון */
  topics?: string[];
  onChange: (next: UnitFilterState) => void;
  /** דף ראשי — ללא padding אופקי על שורת הסינון */
  embedded?: boolean;
  /** הודעה כשאין נושאים ברשימה (ברירת מחדל: ארון בודד) */
  noTopicsLabel?: string;
}

export function UnitFilterBar({
  filters,
  suppliers,
  topics = [],
  onChange,
  embedded = false,
  noTopicsLabel = he.unit.filterNoTopics,
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);

  const activeCount =
    filters.supplierIds.length +
    filters.topics.length +
    (filters.priceMin !== null || filters.priceMax !== null ? 1 : 0);

  const summaryText = useMemo(() => {
    if (activeCount === 0) return he.unit.filterBarPlaceholder;
    const supplierPart =
      filters.supplierIds.length === 0
        ? null
        : suppliers
            .filter((s) => filters.supplierIds.includes(s.id))
            .map((s) => s.name)
            .join(", ");
    const topicPart =
      filters.topics.length === 0 ? null : filters.topics.join(", ");
    const pricePart =
      filters.priceMin !== null || filters.priceMax !== null
        ? `${he.unit.pricePrefix}${filters.priceMin ?? 0}–${he.unit.pricePrefix}${filters.priceMax ?? "∞"}`
        : null;
    return [supplierPart, topicPart, pricePart].filter(Boolean).join("  ·  ");
  }, [filters, suppliers, activeCount]);

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded]}>
      <Pressable style={styles.bar} onPress={() => setOpen(true)}>
        <Ionicons
          name="options-outline"
          size={18}
          color={theme.colors.primary}
          style={styles.icon}
        />
        <Text style={styles.summary} numberOfLines={1}>
          {summaryText}
        </Text>
        {activeCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeCount}</Text>
          </View>
        ) : null}
      </Pressable>

      <FilterSheet
        visible={open}
        onClose={() => setOpen(false)}
        filters={filters}
        suppliers={suppliers}
        topics={topics}
        onChange={onChange}
        noTopicsLabel={noTopicsLabel}
      />
    </View>
  );
}

interface SheetProps extends Props {
  visible: boolean;
  onClose: () => void;
}

function FilterSheet({
  visible,
  onClose,
  filters,
  suppliers,
  topics = [],
  onChange,
  noTopicsLabel = he.unit.filterNoTopics,
}: SheetProps): JSX.Element {
  const keyboardHeight = useKeyboardHeight();
  const [draft, setDraft] = useState<UnitFilterState>(filters);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [topicQuery, setTopicQuery] = useState("");

  useEffect(() => {
    if (!visible) return;
    setDraft(normalizeUnitFilterState(filters));
    setSupplierQuery("");
    setTopicQuery("");
  }, [visible, filters]);

  const toggle = (id: string) => {
    setDraft((d) => ({
      ...d,
      supplierIds: d.supplierIds.includes(id)
        ? d.supplierIds.filter((s) => s !== id)
        : [...d.supplierIds, id],
    }));
  };

  const toggleTopic = (topic: string) => {
    setDraft((d) => ({
      ...d,
      topics: d.topics.includes(topic)
        ? d.topics.filter((t) => t !== topic)
        : [...d.topics, topic],
    }));
  };

  const setPrice = (key: "priceMin" | "priceMax", raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    setDraft((d) => ({
      ...d,
      [key]: cleaned.length === 0 ? null : Number(cleaned),
    }));
  };

  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.name.toLowerCase().includes(q));
  }, [suppliers, supplierQuery]);

  const filteredTopics = useMemo(() => {
    const q = topicQuery.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.toLowerCase().includes(q));
  }, [topics, topicQuery]);

  const apply = () => {
    onChange(draft);
    onClose();
  };
  const reset = () => {
    setDraft(emptyFilters);
    onChange(emptyFilters);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <View style={styles.backdrop}>
          <Pressable
            style={styles.dismissStrip}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={he.generic.cancel}
          />
          <SafeAreaView style={styles.sheetSafe} edges={["top"]}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHandle} />

              <Text style={styles.sheetTitle}>{he.unit.filterTitle}</Text>

              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={[
                  styles.sheetScrollContent,
                  keyboardHeight > 0 && { paddingBottom: theme.spacing.sm },
                ]}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                <Text style={styles.sectionTitle}>{he.unit.filterSuppliers}</Text>
                <View style={styles.supplierSearchRow}>
                  <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
                  <TextInput
                    value={supplierQuery}
                    onChangeText={setSupplierQuery}
                    placeholder={he.picker.searchInList}
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    style={styles.supplierSearchInput}
                    textAlign="left"
                  />
                </View>
                <View style={styles.supplierListViewport}>
                  <ScrollView
                    style={styles.supplierList}
                    contentContainerStyle={styles.supplierListContent}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                  >
                    {filteredSuppliers.length === 0 ? (
                      <Text style={styles.supplierEmpty}>{he.picker.noMatches}</Text>
                    ) : (
                      filteredSuppliers.map((s, index) => {
                        const active = draft.supplierIds.includes(s.id);
                        return (
                          <View key={s.id}>
                            {index > 0 ? <View style={styles.supplierSep} /> : null}
                            <Pressable
                              onPress={() => toggle(s.id)}
                              style={[styles.supplierRow, active && styles.supplierRowActive]}
                            >
                              <View style={styles.supplierRowMain}>
                                <View
                                  style={[styles.supplierDot, { backgroundColor: s.color_hex ?? theme.colors.outline }]}
                                />
                                <Text style={[styles.supplierRowName, active && styles.supplierRowNameActive]}>
                                  {s.name}
                                </Text>
                              </View>
                              <Ionicons
                                name={active ? "checkbox" : "square-outline"}
                                size={22}
                                color={active ? theme.colors.primary : theme.colors.outlineVariant}
                              />
                            </Pressable>
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                </View>

                <Text style={[styles.sectionTitle, { marginTop: theme.spacing.lg }]}>
                  {he.unit.filterTopics}
                </Text>
                <View style={styles.supplierSearchRow}>
                  <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
                  <TextInput
                    value={topicQuery}
                    onChangeText={setTopicQuery}
                    placeholder={he.picker.searchInList}
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    style={styles.supplierSearchInput}
                    textAlign="left"
                  />
                </View>
                <View style={styles.supplierListViewport}>
                  <ScrollView
                    style={styles.supplierList}
                    contentContainerStyle={styles.supplierListContent}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                  >
                    {filteredTopics.length === 0 ? (
                      <Text style={styles.supplierEmpty}>{noTopicsLabel}</Text>
                    ) : (
                      filteredTopics.map((topic, index) => {
                        const active = draft.topics.includes(topic);
                        return (
                          <View key={topic}>
                            {index > 0 ? <View style={styles.supplierSep} /> : null}
                            <Pressable
                              onPress={() => toggleTopic(topic)}
                              style={[styles.supplierRow, active && styles.supplierRowActive]}
                            >
                              <View style={styles.supplierRowMain}>
                                <Text style={[styles.supplierRowName, active && styles.supplierRowNameActive]}>
                                  {topic}
                                </Text>
                              </View>
                              <Ionicons
                                name={active ? "checkbox" : "square-outline"}
                                size={22}
                                color={active ? theme.colors.primary : theme.colors.outlineVariant}
                              />
                            </Pressable>
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                </View>

                <Text style={[styles.sectionTitle, { marginTop: theme.spacing.lg }]}>
                  {he.unit.filterPriceRange}
                </Text>
                <View style={styles.priceRow}>
                  <View style={styles.priceInputBlock}>
                    <Text style={styles.priceLabel}>מ־{he.unit.pricePrefix}</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={draft.priceMin?.toString() ?? ""}
                      onChangeText={(t) => setPrice("priceMin", t)}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={theme.colors.onSurfaceVariant}
                    />
                  </View>
                  <View style={styles.priceInputBlock}>
                    <Text style={styles.priceLabel}>עד {he.unit.pricePrefix}</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={draft.priceMax?.toString() ?? ""}
                      onChangeText={(t) => setPrice("priceMax", t)}
                      keyboardType="numeric"
                      placeholder="∞"
                      placeholderTextColor={theme.colors.onSurfaceVariant}
                    />
                  </View>
                </View>
              </ScrollView>

              <View style={[styles.actions, { paddingBottom: keyboardHeight }]}>
                <Pressable style={styles.resetBtn} onPress={reset}>
                  <Text style={styles.resetBtnText}>{he.unit.filterReset}</Text>
                </Pressable>
                <Pressable style={styles.applyBtn} onPress={apply}>
                  <Text style={styles.applyBtnText}>{he.generic.confirm}</Text>
                </Pressable>
              </View>
            </Pressable>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: theme.spacing.marginMobile },
  wrapEmbedded: { paddingHorizontal: 0 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  icon: { marginLeft: 0 },
  summary: {
    flex: 1,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  badge: {
    backgroundColor: theme.colors.primary,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: theme.colors.onPrimary, fontWeight: "700", fontSize: 12 },
  modalRoot: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 28, 48, 0.45)",
    justifyContent: "flex-start",
  },
  dismissStrip: {
    height: DISMISS_STRIP_HEIGHT,
    flexShrink: 0,
    width: "100%",
  },
  sheetSafe: {
    flex: 1,
    width: "100%",
    flexShrink: 1,
  },
  sheet: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    ...theme.shadow.modal,
  },
  sheetScroll: {
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  sheetScrollContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.outlineVariant,
    marginBottom: theme.spacing.sm,
  },
  sheetTitle: {
    ...theme.typography.headlineSm,
    color: theme.colors.primary,
    textAlign: "left",
  },
  sectionTitle: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  supplierSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLow,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  supplierSearchInput: {
    flex: 1,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    paddingVertical: 4,
    minHeight: 36,
  },
  supplierListViewport: {
    height: LIST_VIEWPORT_HEIGHT,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceContainerLowest,
    overflow: "hidden",
  },
  supplierList: {
    flex: 1,
  },
  supplierListContent: {
    flexGrow: 1,
  },
  supplierSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.outlineVariant,
  },
  supplierRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  supplierRowActive: {
    backgroundColor: theme.colors.secondaryContainer,
  },
  supplierRowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  supplierDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  supplierRowName: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: "left",
  },
  supplierRowNameActive: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.semibold,
  },
  supplierEmpty: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    paddingVertical: theme.spacing.lg,
  },
  priceRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  priceInputBlock: {
    flex: 1,
    gap: 4,
  },
  priceLabel: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  priceInput: {
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    textAlign: "left",
    color: theme.colors.onSurface,
    fontFamily: theme.fontFamily.regular,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    flexShrink: 0,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    alignItems: "center",
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  resetBtnText: {
    color: theme.colors.onSurface,
    fontWeight: "600",
    fontSize: theme.typography.bodyMd.fontSize,
  },
  applyBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    backgroundColor: theme.colors.primary,
  },
  applyBtnText: {
    color: theme.colors.onPrimary,
    fontWeight: "700",
    fontSize: theme.typography.bodyMd.fontSize,
  },
});
