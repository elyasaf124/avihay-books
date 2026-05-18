import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";
import type { PickerListItem } from "./SearchablePicker";

const DEFAULT_LIST_VIEWPORT = 220;

function interpolateCount(template: string, count: number): string {
  return template.replace(/\{\{count\}\}/g, String(count));
}

export interface InlineSearchablePickListProps {
  items: readonly PickerListItem[];
  /** ריק = אין סינון (מציגים את «הכול»). */
  valueIds: string[];
  onChange: (ids: string[]) => void;
  fieldLabel?: string;
  allOptionLabel: string;
  /** תבנית עם `{{count}}` כשנבחרו יותר מספק אחד (לתצוגה בסגירה). */
  selectedManyLabelTemplate: string;
  searchPlaceholder: string;
  emptyListMessage: string;
  confirmLabel: string;
  cancelLabel: string;
  listViewportHeight?: number;
}

/**
 * שדה סגור + לחיצה פותחת חיפוש, בחירה מרובת־מתאימה ורשימה נגללת; `אישור` מיישם, `ביטול` מבטל.
 */
export function InlineSearchablePickList({
  items,
  valueIds,
  onChange,
  fieldLabel,
  allOptionLabel,
  selectedManyLabelTemplate,
  searchPlaceholder,
  emptyListMessage,
  confirmLabel,
  cancelLabel,
  listViewportHeight = DEFAULT_LIST_VIEWPORT,
}: InlineSearchablePickListProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [draftIds, setDraftIds] = useState<string[]>([]);

  const closedSummary = useMemo(() => {
    if (valueIds.length === 0) return allOptionLabel;
    if (valueIds.length === 1) {
      return items.find((i) => i.id === valueIds[0])?.label ?? allOptionLabel;
    }
    return interpolateCount(selectedManyLabelTemplate, valueIds.length);
  }, [valueIds, items, allOptionLabel, selectedManyLabelTemplate]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...items];
    return items.filter((it) => it.label.toLowerCase().includes(q));
  }, [items, query]);

  const openPanel = () => {
    setDraftIds([...valueIds]);
    setQuery("");
    setExpanded(true);
  };

  const cancelPanel = () => {
    setQuery("");
    setExpanded(false);
  };

  const confirmPanel = () => {
    onChange([...draftIds]);
    setQuery("");
    setExpanded(false);
  };

  const toggleDraft = (id: string) => {
    setDraftIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllDraft = () => setDraftIds([]);

  const allChosen = draftIds.length === 0;

  return (
    <View style={styles.wrap}>
      {fieldLabel ? (
        <Text style={styles.fieldLabel} numberOfLines={1}>
          {fieldLabel}
        </Text>
      ) : null}

      {!expanded ? (
        <Pressable
          accessibilityRole="button"
          onPress={openPanel}
          style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        >
          <Text style={styles.triggerText} numberOfLines={1}>
            {closedSummary}
          </Text>
          <Ionicons name="chevron-down" size={20} color={theme.colors.primary} />
        </Pressable>
      ) : (
        <View style={styles.expanded}>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              style={styles.searchInput}
              textAlign="left"
              autoFocus
            />
            {query.length > 0 ? (
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                onPress={() => setQuery("")}
              >
                <Ionicons name="close-circle" size={22} color={theme.colors.onSurfaceVariant} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={selectAllDraft}
            style={[styles.allRow, allChosen && styles.rowSelected]}
          >
            <Text style={[styles.rowLabel, allChosen && styles.rowLabelSelected]}>
              {allOptionLabel}
            </Text>
            {allChosen ? (
              <Ionicons name="checkbox" size={22} color={theme.colors.primary} />
            ) : (
              <Ionicons name="square-outline" size={22} color={theme.colors.outlineVariant} />
            )}
          </Pressable>

          <View style={[styles.listViewport, { height: listViewportHeight }]}>
            <FlatList
              data={filteredItems}
              keyExtractor={(it) => it.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              ListEmptyComponent={<Text style={styles.empty}>{emptyListMessage}</Text>}
              renderItem={({ item }) => {
                const active = draftIds.includes(item.id);
                return (
                  <Pressable
                    onPress={() => toggleDraft(item.id)}
                    style={[styles.row, active && styles.rowSelected]}
                  >
                    <View style={styles.rowMain}>
                      {item.accentColor ? (
                        <View style={[styles.accent, { backgroundColor: item.accentColor }]} />
                      ) : null}
                      <Text
                        style={[styles.rowLabel, active && styles.rowLabelSelected]}
                        numberOfLines={2}
                      >
                        {item.label}
                      </Text>
                    </View>
                    <Ionicons
                      name={active ? "checkbox" : "square-outline"}
                      size={22}
                      color={active ? theme.colors.primary : theme.colors.outlineVariant}
                    />
                  </Pressable>
                );
              }}
            />
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={cancelPanel}
              style={({ pressed }) => [styles.btnGhost, pressed && styles.btnPressed]}
            >
              <Text style={styles.btnGhostText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={confirmPanel}
              style={({ pressed }) => [styles.btnPrimary, pressed && styles.btnPressed]}
            >
              <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  fieldLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    minHeight: 42,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  triggerPressed: { opacity: 0.92 },
  triggerText: {
    flex: 1,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  expanded: {
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    paddingVertical: 4,
    minHeight: 36,
  },
  allRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLowest,
    gap: theme.spacing.sm,
  },
  rowSelected: {
    backgroundColor: theme.colors.secondaryContainer,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  accent: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  rowLabel: {
    flex: 1,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  rowLabelSelected: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.semibold,
  },
  listViewport: {
    flexShrink: 0,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLowest,
    overflow: "hidden",
  },
  list: { flex: 1 },
  listContent: { flexGrow: 1 },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.outlineVariant,
  },
  empty: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  btnGhost: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    alignItems: "center",
    backgroundColor: theme.colors.surface,
  },
  btnGhostText: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    fontFamily: theme.fontFamily.semibold,
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    backgroundColor: theme.colors.primary,
  },
  btnPrimaryText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
    fontFamily: theme.fontFamily.semibold,
  },
  btnPressed: { opacity: 0.88 },
});
