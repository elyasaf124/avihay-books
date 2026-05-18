import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";

/** פריט בחירה גנרי — ספק, קטגוריה וכו׳. */
export interface PickerListItem {
  id: string;
  label: string;
  accentColor?: string;
}

/** ממפה `Supplier[]` ל־`PickerListItem` להצגה ב־`SearchablePickerField`. */
export function suppliersToPickerItems(
  suppliers: readonly { id: string; name: string; color_hex?: string }[],
): PickerListItem[] {
  return suppliers.map((s) => ({
    id: s.id,
    label: s.name,
    accentColor: s.color_hex,
  }));
}

type AnchorRect = { x: number; y: number; width: number; height: number };

export interface SearchablePickerFieldProps {
  items: readonly PickerListItem[];
  valueId: string | null;
  onChange: (id: string | null) => void;
  searchPlaceholder: string;
  emptyListMessage: string;
  fieldLabel?: string;
  /** טקסט בשדה כשאין בחירה (משמש גם כ־`placeholder`) */
  emptySelectionLabel: string;
  /** אם קיימת — שורה ראשונה בדרופדאון מאפשרת `null` (למשל «הכול») */
  clearSelectionLabel?: string;
  disabled?: boolean;
  /** עיצוב צפוף לשורות כמו סרגל הוספה/הסרה */
  compact?: boolean;
}

/**
 * שדה קלט בסגנון `combo-box`: בשיא סגירה נראה כמו `TextInput`; בפתיחה — חיפוש + רשימה
 * מוצגים בדרופדאון מתחת (מודאל שקוף מעוגן למיקום השדה).
 */
export function SearchablePickerField({
  items,
  valueId,
  onChange,
  fieldLabel,
  emptySelectionLabel,
  searchPlaceholder,
  clearSelectionLabel,
  emptyListMessage,
  disabled,
  compact,
}: SearchablePickerFieldProps): JSX.Element {
  const anchorRef = useRef<View>(null);
  const { height: windowH } = useWindowDimensions();

  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [query, setQuery] = useState("");

  const picked = items.find((i) => i.id === valueId);
  const closedDisplay = picked?.label ?? "";

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...items];
    return items.filter((it) => it.label.toLowerCase().includes(q));
  }, [items, query]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setAnchor(null);
    setQuery("");
  }, []);

  const openMenu = () => {
    if (disabled) return;
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setQuery("");
      setMenuOpen(true);
    });
  };

  const gap = theme.spacing.xs;
  const dropdownTop = anchor !== null ? anchor.y + anchor.height + gap : 0;

  /** גובה מרבי לרשימת הפריטים מתחת לשורות החיפוש */
  const listMaxHeight =
    anchor === null
      ? 200
      : Math.min(280, Math.max(140, windowH - dropdownTop - 140));

  return (
    <View style={[styles.fieldWrap, compact && styles.fieldWrapCompact]}>
      {fieldLabel ? (
        <Text style={styles.fieldLabel} numberOfLines={1}>
          {fieldLabel}
        </Text>
      ) : null}

      <View ref={anchorRef} collapsable={false} style={{ flexShrink: 1 }}>
        <Pressable
          disabled={disabled}
          onPress={openMenu}
          style={({ pressed }) => [
            styles.trigger,
            compact && styles.triggerCompact,
            disabled && styles.triggerDisabled,
            pressed && !disabled && styles.triggerPressed,
          ]}
        >
          <View style={styles.triggerInner}>
            {picked?.accentColor ? (
              <View style={[styles.triggerAccent, { backgroundColor: picked.accentColor }]} />
            ) : null}
            <TextInput
              editable={false}
              pointerEvents="none"
              caretHidden
              scrollEnabled={false}
              selectTextOnFocus={false}
              value={closedDisplay}
              placeholder={emptySelectionLabel}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              style={[
                styles.triggerInput,
                !picked || valueId === null ? styles.triggerInputMuted : undefined,
              ]}
            />
          </View>
          <Ionicons
            name="chevron-down"
            size={20}
            color={disabled ? theme.colors.outlineVariant : theme.colors.primary}
          />
        </Pressable>
      </View>

      <Modal
        animationType="fade"
        visible={menuOpen && anchor !== null}
        transparent
        onRequestClose={closeMenu}
      >
        <Pressable accessibilityRole="button" style={styles.menuBackdrop} onPress={closeMenu} />
        {anchor !== null ? (
          <View
            style={[
              styles.dropdownPanel,
              {
                position: "absolute",
                width: anchor.width,
                left: anchor.x,
              },
              { top: dropdownTop },
            ]}
          >
            <View style={[styles.dropdownSearchRow, compact && styles.dropdownSearchRowCompact]}>
              <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
              <TextInput
                accessibilityLabel={searchPlaceholder}
                placeholder={searchPlaceholder}
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={query}
                onChangeText={setQuery}
                style={styles.dropdownSearchInput}
                textAlign="left"
                autoFocus
              />
              <Pressable
                hitSlop={10}
                onPress={closeMenu}
                accessibilityRole="button"
              >
                <Ionicons name="close-outline" size={22} color={theme.colors.onSurfaceVariant} />
              </Pressable>
            </View>

            {clearSelectionLabel ? (
              <Pressable
                style={[
                  styles.clearRow,
                  valueId === null && styles.optionRowSelected,
                ]}
                onPress={() => {
                  onChange(null);
                  closeMenu();
                }}
              >
                <Text
                  style={[styles.optionText, valueId === null && styles.optionTextSelected]}
                  numberOfLines={1}
                >
                  {clearSelectionLabel}
                </Text>
                {valueId === null ? (
                  <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                ) : (
                  <Ionicons name="ellipse-outline" size={22} color={theme.colors.outlineVariant} />
                )}
              </Pressable>
            ) : null}

            <View style={[styles.dropdownListViewport, { height: listMaxHeight }]}>
              <FlatList
                keyboardShouldPersistTaps="handled"
                data={filteredItems}
                keyExtractor={(it) => it.id}
                style={styles.dropdownList}
                contentContainerStyle={styles.dropdownListContent}
                nestedScrollEnabled
                ItemSeparatorComponent={() => <View style={styles.listSep} />}
                renderItem={({ item }) => {
                  const active = item.id === valueId;
                  return (
                    <Pressable
                      style={[styles.optionRow, active && styles.optionRowSelected]}
                      onPress={() => {
                        onChange(item.id);
                        closeMenu();
                      }}
                    >
                      <View style={styles.optionMain}>
                        {item.accentColor ? (
                          <View style={[styles.accent, { backgroundColor: item.accentColor }]} />
                        ) : null}
                        <Text
                          style={[styles.optionText, active && styles.optionTextSelected]}
                          numberOfLines={2}
                        >
                          {item.label}
                        </Text>
                      </View>
                      <Ionicons
                        name={active ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={
                          active ? theme.colors.primary : theme.colors.outlineVariant
                        }
                      />
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.emptyList}>{emptyListMessage}</Text>
                }
              />
            </View>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
    zIndex: 1,
  },
  fieldWrapCompact: {
    paddingHorizontal: 0,
    paddingBottom: theme.spacing.xs,
    marginBottom: 0,
    zIndex: 1,
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
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLow,
    minHeight: 42,
  },
  triggerCompact: {
    paddingVertical: theme.spacing.sm,
    minHeight: 40,
    borderRadius: theme.radius.md,
  },
  triggerDisabled: { opacity: 0.45 },
  triggerPressed: { opacity: 0.92 },
  triggerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  triggerAccent: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  triggerInput: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    margin: 0,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
    minHeight: 22,
    maxHeight: 44,
  },
  triggerInputMuted: {
    color: theme.colors.onSurfaceVariant,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11,28,48,0.38)",
  },
  dropdownPanel: {
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surface,
    ...theme.shadow.modal,
  },
  dropdownSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  dropdownSearchRowCompact: {
    paddingVertical: theme.spacing.xs,
  },
  dropdownSearchInput: {
    flex: 1,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    paddingVertical: 4,
    minHeight: 36,
    maxHeight: 40,
    textAlign: "left",
  },
  clearRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  dropdownListViewport: {
    flexShrink: 0,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
  },
  dropdownList: {
    flex: 1,
  },
  dropdownListContent: {
    flexGrow: 1,
  },
  listSep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.outlineVariant },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
  },
  optionRowSelected: { backgroundColor: theme.colors.secondaryContainer },
  optionMain: {
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
  optionText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: "left",
  },
  optionTextSelected: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.semibold,
  },
  emptyList: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.sm,
  },
});
