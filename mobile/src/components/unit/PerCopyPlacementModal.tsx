import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { StoreMap } from "@avihay-books/shared";
import { he } from "../../i18n/he";
import { theme } from "../../theme";
import {
  cellRefToSummary,
  filterCellRefsForPlacement,
  findCellsMatchingName,
  findStoreMapCellById,
  resolvePositionForPlacement,
  type CellRef,
} from "../../utils/storeMapCells";
import { MoveBookModal, type MapPlacementSubmitTarget } from "./MoveBookModal";

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => {
    return s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }, template);
}

interface Props {
  visible: boolean;
  storeMap: StoreMap | null;
  /** כמה רשומות למקם (`quantity_in_cell: 1` לכל סלוט) */
  slotCount: number;
  preview: { title: string; author: string; supplier_color?: string };
  /** התאמה למדיניות `is_new` — רק תאי ארון התצוגה או בלי התצוגה */
  previewIsNew?: boolean;
  submitting: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (rows: MapPlacementSubmitTarget[]) => void | Promise<void>;
}

export function PerCopyPlacementModal({
  visible,
  storeMap,
  slotCount,
  preview,
  previewIsNew = false,
  submitting,
  errorMessage,
  onClose,
  onSubmit,
}: Props): JSX.Element {
  const shelfWord = he.unit.shelfLabel;
  const cellWord = he.unit.cellLabel;

  type RowState = {
    nameDraft: string;
    placement: MapPlacementSubmitTarget | null;
    lookupError: string | null;
  };

  const [rows, setRows] = useState<RowState[]>(() =>
    Array.from({ length: Math.max(0, slotCount) }, (): RowState => ({
      nameDraft: "",
      placement: null,
      lookupError: null,
    })),
  );

  const [ambiguousChoices, setAmbiguousChoices] = useState<{ rowIdx: number; choices: CellRef[] } | null>(
    null,
  );
  /** שורת בחירת היררכיה מלאה */
  const [detailRowIdx, setDetailRowIdx] = useState<number | null>(null);
  /** מאותו תא לכל העותקים */
  const [bulkHierarchyOpen, setBulkHierarchyOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setRows(
      Array.from({ length: Math.max(0, slotCount) }, (): RowState => ({
        nameDraft: "",
        placement: null,
        lookupError: null,
      })),
    );
    setAmbiguousChoices(null);
    setDetailRowIdx(null);
    setBulkHierarchyOpen(false);
  }, [visible, slotCount]);

  /** מאותחל אחרי שקט בהקלדה — בלי כפתור «החל» */
  const lookupDebounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return () => {
      for (const t of Object.values(lookupDebounceRef.current)) {
        clearTimeout(t);
      }
    };
  }, []);

  const filledPlacements = useMemo(
    () => rows.map((r) => r.placement).filter((p): p is MapPlacementSubmitTarget => p != null),
    [rows],
  );

  const applyCellToRow = useCallback(
    (rowIdx: number, cr: CellRef) => {
      const summaryLabel = cellRefToSummary(cr, cellWord);
      const mapCell = findStoreMapCellById(storeMap, cr.cellId);
      const positionInCell = resolvePositionForPlacement(mapCell, 1);
      setRows((prev) => {
        const next = [...prev];
        const cur = next[rowIdx]!;
        next[rowIdx] = {
          ...cur,
          nameDraft: cr.cell_name,
          placement: {
            cellId: cr.cellId,
            positionInCell,
            quantityInCell: 1,
            summaryLabel,
          },
          lookupError: null,
        };
        return next;
      });
    },
    [cellWord, storeMap],
  );

  const lookupNameAtRow = useCallback(
    (rowIdx: number, draftOverride?: string) => {
      const raw = (draftOverride ?? rows[rowIdx]?.nameDraft ?? "").trim();
      if (!raw) {
        setAmbiguousChoices(null);
        setRows((prev) => {
          const next = [...prev];
          next[rowIdx] = { ...next[rowIdx]!, placement: null, lookupError: null };
          return next;
        });
        return;
      }
      const rawHits = findCellsMatchingName(storeMap, raw, shelfWord);
      const hits = filterCellRefsForPlacement(rawHits, storeMap, previewIsNew);
      if (hits.length === 0) {
        setAmbiguousChoices(null);
        setRows((prev) => {
          const next = [...prev];
          next[rowIdx] = {
            ...next[rowIdx]!,
            placement: null,
            lookupError: he.addRemove.cellNameNotFound,
          };
          return next;
        });
        return;
      }
      if (hits.length === 1) {
        setAmbiguousChoices(null);
        applyCellToRow(rowIdx, hits[0]!);
        return;
      }
      setAmbiguousChoices({ rowIdx, choices: hits });
      setRows((prev) => {
        const next = [...prev];
        next[rowIdx] = {
          ...next[rowIdx]!,
          placement: null,
          lookupError: he.addRemove.cellNameAmbiguous,
        };
        return next;
      });
    },
    [rows, storeMap, shelfWord, applyCellToRow, previewIsNew],
  );

  const canSubmitInner = !submitting && slotCount > 0;

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />

            <View style={styles.headerRow}>
              <Text style={styles.title} numberOfLines={2}>
                {he.addRemove.perCopyModalTitle}
              </Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.onSurface} />
              </Pressable>
            </View>

            <View style={styles.bookCard}>
              <View
                style={[styles.bookDot, { backgroundColor: preview.supplier_color ?? theme.colors.outline }]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.bookTitle} numberOfLines={1}>
                  {preview.title}
                </Text>
                <Text style={styles.bookAuthor} numberOfLines={1}>
                  {preview.author}
                </Text>
                <Text style={styles.slotsSubtitle}>
                  {interpolate(he.addRemove.perCopySlotCountHint, { n: String(slotCount) })}
                </Text>
                <Text style={styles.slotsOptionalHint}>{he.addRemove.perCopyRowsOptionalHint}</Text>
              </View>
            </View>

            <Pressable
              style={[styles.bulkShortcut, submitting && styles.bulkShortcutDisabled]}
              disabled={submitting}
              onPress={() => setBulkHierarchyOpen(true)}
            >
              <Ionicons name="copy-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.bulkShortcutText}>{he.addRemove.sameCellForAllCopies}</Text>
            </Pressable>

            <Text style={styles.cellTypeHint}>{he.addRemove.cellNameSearchDebouncedHint}</Text>

            <ScrollView contentContainerStyle={styles.rowsScroll}>
              {rows.map((row, idx) => (
                <View key={`slot-${slotCount}-${idx}`} style={styles.rowBlock}>
                  <Text style={styles.rowHeading}>
                    {interpolate(he.addRemove.perCopyRowTitle, { n: String(idx + 1) })}
                  </Text>
                  <Text style={styles.rowHint}>{he.addRemove.perCopyRowHint}</Text>
                  <View style={styles.nameRowSingle}>
                    <TextInput
                      style={styles.nameInputFull}
                      value={row.nameDraft}
                      editable={!submitting}
                      onChangeText={(t) => {
                        setRows((prev) => {
                          const next = [...prev];
                          next[idx] = {
                            ...next[idx]!,
                            nameDraft: t,
                            lookupError: null,
                            placement: row.placement,
                          };
                          return next;
                        });
                        const prevT = lookupDebounceRef.current[idx];
                        if (prevT) clearTimeout(prevT);
                        lookupDebounceRef.current[idx] = setTimeout(() => {
                          lookupNameAtRow(idx, t);
                          delete lookupDebounceRef.current[idx];
                        }, 420);
                      }}
                      placeholder={he.addRemove.cellNameSearchPlaceholder}
                      placeholderTextColor={theme.colors.onSurfaceVariant}
                      textAlign="right"
                    />
                  </View>

                  {ambiguousChoices?.rowIdx === idx ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.ambRow}>
                      {ambiguousChoices.choices.map((c) => (
                        <Pressable
                          key={`${c.cellId}-${idx}`}
                          style={styles.ambigChip}
                          onPress={() => {
                            applyCellToRow(idx, c);
                            setAmbiguousChoices(null);
                          }}
                        >
                          <Text style={styles.ambigChipText} numberOfLines={3}>
                            {cellRefToSummary(c, cellWord)}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}

                  {row.lookupError ? <Text style={styles.rowErr}>{row.lookupError}</Text> : null}
                  {row.placement ? (
                    <Text style={styles.rowOk} numberOfLines={3}>
                      {row.placement.summaryLabel}
                    </Text>
                  ) : null}

                  <Pressable
                    style={styles.treeLink}
                    disabled={submitting}
                    onPress={() => setDetailRowIdx(idx)}
                  >
                    <Ionicons name="layers-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.treeLinkText}>{he.addRemove.pickFullHierarchyLink}</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            {errorMessage ? <Text style={styles.sheetError}>{errorMessage}</Text> : null}

            <Pressable
              style={[styles.submitBtn, !canSubmitInner && styles.submitBtnDisabled]}
              disabled={!canSubmitInner}
              onPress={() => {
                void onSubmit(filledPlacements);
              }}
            >
              <Text style={styles.submitBtnText}>{he.addRemove.perCopySubmit}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <MoveBookModal
        key="per-copy-bulk-hierarchy"
        visible={bulkHierarchyOpen}
        book={null}
        placePreview={{
          title: he.addRemove.sameCellBulkTitle,
          author: preview.title,
          supplier_color: preview.supplier_color,
          defaultQuantity: 1,
          defaultPosition: 1,
          lockQuantity: true,
        }}
        storeMap={storeMap}
        submitting={false}
        errorMessage={null}
        placePreviewIsNew={previewIsNew}
        onClose={() => setBulkHierarchyOpen(false)}
        onSubmit={(target) => {
          const mapCell = findStoreMapCellById(storeMap, target.cellId);
          const pos = resolvePositionForPlacement(mapCell, target.positionInCell);
          const locked: MapPlacementSubmitTarget = {
            ...target,
            quantityInCell: 1,
            positionInCell: pos,
          };
          setRows((prev) => prev.map((r): RowState => ({
            ...r,
            placement: locked,
            nameDraft: "",
            lookupError: null,
          })));
          setBulkHierarchyOpen(false);
        }}
      />

      <MoveBookModal
        key={`row-${detailRowIdx}`}
        visible={detailRowIdx !== null}
        book={null}
        placePreview={
          detailRowIdx !== null
            ? {
                title: interpolate(he.addRemove.perCopyRowTitle, {
                  n: String(detailRowIdx + 1),
                }),
                author: `${preview.author} · ${preview.title}`,
                supplier_color: preview.supplier_color,
                defaultQuantity: 1,
                defaultPosition: 1,
                lockQuantity: true,
              }
            : undefined
        }
        storeMap={storeMap}
        submitting={false}
        errorMessage={null}
        placePreviewIsNew={previewIsNew}
        onClose={() => setDetailRowIdx(null)}
        onSubmit={(target) => {
          if (detailRowIdx === null) return;
          const rowI = detailRowIdx;
          const mapCell = findStoreMapCellById(storeMap, target.cellId);
          const pos = resolvePositionForPlacement(mapCell, target.positionInCell);
          setRows((prev) => {
            const next = [...prev];
            next[rowI] = {
              ...next[rowI]!,
              placement: { ...target, quantityInCell: 1, positionInCell: pos },
              lookupError: null,
            };
            return next;
          });
          setDetailRowIdx(null);
        }}
      />
    </>
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
    maxHeight: "92%",
    ...theme.shadow.modal,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.outlineVariant,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  title: {
    ...theme.typography.headlineSm,
    color: theme.colors.primary,
    flex: 1,
    textAlign: "right",
    writingDirection: "rtl",
  },
  bookCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  bookDot: { width: 12, height: 36, borderRadius: 3 },
  bookTitle: {
    ...theme.typography.bodyLg,
    fontWeight: "700",
    color: theme.colors.onSurface,
    textAlign: "right",
  },
  bookAuthor: { ...theme.typography.caption, color: theme.colors.onSurfaceVariant, textAlign: "right" },
  slotsSubtitle: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    marginTop: 6,
    textAlign: "right",
  },
  slotsOptionalHint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
    textAlign: "right",
    writingDirection: "rtl",
  },
  bulkShortcut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  bulkShortcutDisabled: { opacity: 0.45 },
  bulkShortcutText: { ...theme.typography.labelMd, color: theme.colors.primary },
  cellTypeHint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: theme.spacing.sm,
    lineHeight: 20,
  },
  rowsScroll: { gap: theme.spacing.md, paddingBottom: theme.spacing.md },
  rowBlock: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  rowHeading: { ...theme.typography.labelMd, color: theme.colors.primary, textAlign: "right" },
  rowHint: { ...theme.typography.caption, color: theme.colors.onSurfaceVariant, textAlign: "right" },
  nameRowSingle: { width: "100%" },
  nameInputFull: {
    width: "100%",
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surface,
  },
  ambRow: { maxHeight: 88, flexGrow: 0, marginTop: theme.spacing.xs },
  ambigChip: {
    maxWidth: 280,
    marginEnd: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  ambigChipText: {
    ...theme.typography.caption,
    textAlign: "right",
    color: theme.colors.onSurface,
  },
  rowErr: { ...theme.typography.caption, color: theme.colors.error, textAlign: "right" },
  rowOk: { ...theme.typography.caption, color: theme.colors.onSurface, textAlign: "right" },
  treeLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    alignSelf: "flex-start",
  },
  treeLinkText: { ...theme.typography.labelMd, color: theme.colors.primary },
  sheetError: {
    ...theme.typography.caption,
    color: theme.colors.onErrorContainer,
    backgroundColor: theme.colors.errorContainer,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    textAlign: "right",
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: {
    color: theme.colors.onPrimary,
    fontWeight: "700",
    fontSize: theme.typography.bodyLg.fontSize,
    fontFamily: theme.fontFamily.bold,
  },
});
