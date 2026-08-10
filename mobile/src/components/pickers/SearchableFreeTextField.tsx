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
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { theme } from "../../theme";

type AnchorRect = { x: number; y: number; width: number; height: number };

export interface SearchableFreeTextFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  suggestions: readonly string[];
  placeholder: string;
  emptyListMessage: string;
  fieldLabel?: string;
  disabled?: boolean;
  /** עיצוב צפוף בלי padding אופקי — מתאים לטפסים בתוך מודל */
  compact?: boolean;
  maxLength?: number;
}

/**
 * Combobox לטקסט חופשי: בחירה מהצעות קיימות או הקלדה ידנית.
 * שדה סגור מציג את הערך; בפתיחה — קלט + רשימת הצעות מסוננות בדרופדאון מעוגן.
 */
export function SearchableFreeTextField({
  value,
  onChangeText,
  suggestions,
  fieldLabel,
  placeholder,
  emptyListMessage,
  disabled,
  compact,
  maxLength = 100,
}: SearchableFreeTextFieldProps): JSX.Element {
  const anchorRef = useRef<View>(null);
  const { height: windowH } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [panelH, setPanelH] = useState(0);

  const filteredSuggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [...suggestions];
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [suggestions, value]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setAnchor(null);
  }, []);

  const openMenu = () => {
    if (disabled) return;
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setMenuOpen(true);
    });
  };

  const gap = theme.spacing.xs;
  const TOP_MARGIN = 12;
  const dropdownTopRaw = anchor !== null ? anchor.y + anchor.height + gap : 0;
  const bottomLimit = keyboardHeight > 0 ? windowH - keyboardHeight - gap : windowH - 24;
  const headerReserve = 56;
  const availableRegion = bottomLimit - TOP_MARGIN;

  const listMaxHeight =
    anchor === null
      ? 200
      : Math.max(120, Math.min(280, availableRegion - headerReserve));

  const panelTop =
    anchor === null ? 0 : Math.max(TOP_MARGIN, Math.min(dropdownTopRaw, bottomLimit - panelH));

  const hasValue = value.trim().length > 0;

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
          <TextInput
            editable={false}
            pointerEvents="none"
            caretHidden
            scrollEnabled={false}
            selectTextOnFocus={false}
            value={value}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.onSurfaceVariant}
            style={[styles.triggerInput, !hasValue && styles.triggerInputMuted]}
          />
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
            onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
            style={[
              styles.dropdownPanel,
              {
                position: "absolute",
                width: anchor.width,
                left: anchor.x,
                top: panelTop,
              },
            ]}
          >
            <View style={[styles.dropdownSearchRow, compact && styles.dropdownSearchRowCompact]}>
              <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
              <TextInput
                accessibilityLabel={placeholder}
                placeholder={placeholder}
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={value}
                onChangeText={onChangeText}
                maxLength={maxLength}
                style={styles.dropdownSearchInput}
                textAlign="left"
                autoFocus
              />
              <Pressable hitSlop={10} onPress={closeMenu} accessibilityRole="button">
                <Ionicons name="close-outline" size={22} color={theme.colors.onSurfaceVariant} />
              </Pressable>
            </View>

            <View style={[styles.dropdownListViewport, { height: listMaxHeight }]}>
              <FlatList
                keyboardShouldPersistTaps="handled"
                data={filteredSuggestions}
                keyExtractor={(item) => item}
                style={styles.dropdownList}
                contentContainerStyle={styles.dropdownListContent}
                nestedScrollEnabled
                ItemSeparatorComponent={() => <View style={styles.listSep} />}
                renderItem={({ item }) => {
                  const active = item === value.trim();
                  return (
                    <Pressable
                      style={[styles.optionRow, active && styles.optionRowSelected]}
                      onPress={() => {
                        onChangeText(item);
                        closeMenu();
                      }}
                    >
                      <Text
                        style={[styles.optionText, active && styles.optionTextSelected]}
                        numberOfLines={2}
                      >
                        {item}
                      </Text>
                      <Ionicons
                        name={active ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={active ? theme.colors.primary : theme.colors.outlineVariant}
                      />
                    </Pressable>
                  );
                }}
                ListEmptyComponent={<Text style={styles.emptyList}>{emptyListMessage}</Text>}
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
    marginTop: theme.spacing.xs,
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
