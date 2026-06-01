import type { BookWithLocations } from "@avihay-books/shared";
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

export interface SearchableBookPickerFieldProps {
  books: readonly BookWithLocations[];
  valueId: string | null;
  onChange: (id: string | null) => void;
  searchPlaceholder: string;
  emptyListMessage: string;
  /** טקסט בשדה כשאין בחירה */
  emptySelectionLabel: string;
  /** שורת «הצג הכול» בראש הדרופדאון */
  clearSelectionLabel?: string;
  compact?: boolean;
}

/**
 * בחירת ספר בסגנון `SearchablePickerField`: שדה סגור + מודאל עם חיפוש, backdrop ו-X לסגירה.
 */
export function SearchableBookPickerField({
  books,
  valueId,
  onChange,
  emptySelectionLabel,
  searchPlaceholder,
  clearSelectionLabel,
  emptyListMessage,
  compact,
}: SearchableBookPickerFieldProps): JSX.Element {
  const anchorRef = useRef<View>(null);
  const { height: windowH } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [query, setQuery] = useState("");
  const [panelH, setPanelH] = useState(0);

  const picked = books.find((b) => b.id === valueId);
  const closedDisplay = picked?.title ?? "";

  const filteredBooks = useMemo(() => {
    const q = query.trim().normalize("NFKC").toLocaleLowerCase("und");
    if (!q) return [...books];
    return books.filter(
      (b) =>
        b.title.normalize("NFKC").toLocaleLowerCase("und").includes(q) ||
        b.author.normalize("NFKC").toLocaleLowerCase("und").includes(q),
    );
  }, [books, query]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setAnchor(null);
    setQuery("");
  }, []);

  const openMenu = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setQuery("");
      setMenuOpen(true);
    });
  };

  const gap = theme.spacing.xs;
  const TOP_MARGIN = 12;
  const dropdownTopRaw = anchor !== null ? anchor.y + anchor.height + gap : 0;
  const bottomLimit = keyboardHeight > 0 ? windowH - keyboardHeight - gap : windowH - 24;
  const headerReserve = 56 + (clearSelectionLabel ? 48 : 0);
  const availableRegion = bottomLimit - TOP_MARGIN;

  const listMaxHeight =
    anchor === null
      ? 200
      : Math.max(120, Math.min(280, availableRegion - headerReserve));

  const panelTop =
    anchor === null ? 0 : Math.max(TOP_MARGIN, Math.min(dropdownTopRaw, bottomLimit - panelH));

  return (
    <View style={[styles.fieldWrap, compact && styles.fieldWrapCompact]}>
      <View ref={anchorRef} collapsable={false} style={{ flexShrink: 1 }}>
        <Pressable
          onPress={openMenu}
          style={({ pressed }) => [
            styles.trigger,
            compact && styles.triggerCompact,
            pressed && styles.triggerPressed,
          ]}
        >
          <View style={styles.triggerInner}>
            <Ionicons name="search-outline" size={18} color={theme.colors.onSurfaceVariant} />
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
                !picked ? styles.triggerInputMuted : undefined,
              ]}
            />
          </View>
          <Ionicons name="chevron-down" size={20} color={theme.colors.primary} />
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
                accessibilityLabel={searchPlaceholder}
                placeholder={searchPlaceholder}
                placeholderTextColor={theme.colors.onSurfaceVariant}
                value={query}
                onChangeText={setQuery}
                style={styles.dropdownSearchInput}
                textAlign="left"
                autoFocus
              />
              <Pressable hitSlop={10} onPress={closeMenu} accessibilityRole="button">
                <Ionicons name="close-outline" size={22} color={theme.colors.onSurfaceVariant} />
              </Pressable>
            </View>

            {clearSelectionLabel ? (
              <Pressable
                style={[styles.clearRow, valueId === null && styles.optionRowSelected]}
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
                data={filteredBooks}
                keyExtractor={(book) => book.id}
                style={styles.dropdownList}
                contentContainerStyle={styles.dropdownListContent}
                nestedScrollEnabled
                ItemSeparatorComponent={() => <View style={styles.listSep} />}
                renderItem={({ item: book }) => {
                  const active = book.id === valueId;
                  return (
                    <Pressable
                      style={[styles.optionRow, active && styles.optionRowSelected]}
                      onPress={() => {
                        onChange(book.id);
                        closeMenu();
                      }}
                    >
                      <View style={styles.optionMain}>
                        <Text
                          style={[styles.optionTitle, active && styles.optionTitleSelected]}
                          numberOfLines={2}
                        >
                          {book.title}
                        </Text>
                        <Text style={styles.optionAuthor} numberOfLines={1}>
                          {book.author}
                        </Text>
                      </View>
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
    zIndex: 1,
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
  triggerPressed: { opacity: 0.92 },
  triggerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 0,
  },
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
  dropdownList: { flex: 1 },
  dropdownListContent: { flexGrow: 1 },
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
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionTitle: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  optionTitleSelected: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    fontFamily: theme.fontFamily.semibold,
  },
  optionAuthor: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
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
