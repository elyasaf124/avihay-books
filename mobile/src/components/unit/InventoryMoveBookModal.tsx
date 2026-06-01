import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { Ionicons } from "@expo/vector-icons";
import type { BookLocationExpanded, BookWithLocations, StoreMap } from "@avihay-books/shared";
import { he } from "../../i18n/he";
import { theme } from "../../theme";
import {
  cellIdsEqual,
  cellRefToSummary,
  filterCellRefsForPlacement,
  findCellsMatchingName,
  findStoreMapCellById,
  listAllCells,
  resolvePositionForPlacement,
  type CellRef,
} from "../../utils/storeMapCells";
import { MoveBookModal, type MapPlacementSubmitTarget } from "./MoveBookModal";

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => {
    return s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }, template);
}

export type InventoryMoveSlot = {
  loc: BookLocationExpanded;
  copyIndex: number;
};

export type InventoryMoveItem = {
  bookId: string;
  sourceLocation: BookLocationExpanded;
  splitOffSingle: boolean;
  target: MapPlacementSubmitTarget;
};

interface Props {
  visible: boolean;
  book: BookWithLocations | null;
  slots: InventoryMoveSlot[];
  storeMap: StoreMap | null;
  supplierColor?: string;
  submitting?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmitAll: (moves: InventoryMoveItem[]) => void | Promise<void>;
}

type RowState = {
  nameDraft: string;
  placement: MapPlacementSubmitTarget | null;
  lookupError: string | null;
};

type BulkState = {
  enabled: boolean;
  nameDraft: string;
  placement: MapPlacementSubmitTarget | null;
  lookupError: string | null;
};

function findCellRefById(
  storeMap: StoreMap | null,
  cellId: string,
  shelfWord: string,
): CellRef | null {
  return listAllCells(storeMap, shelfWord).find((c) => cellIdsEqual(c.cellId, cellId)) ?? null;
}

function currentLocationLabel(
  storeMap: StoreMap | null,
  loc: BookLocationExpanded,
  shelfWord: string,
  cellWord: string,
): string {
  const cr = findCellRefById(storeMap, loc.cell_id, shelfWord);
  if (cr) return cellRefToSummary(cr, cellWord);
  return `${cellWord} ${loc.cell_name}`;
}

export function InventoryMoveBookModal({
  visible,
  book,
  slots,
  storeMap,
  supplierColor,
  submitting = false,
  errorMessage,
  onClose,
  onSubmitAll,
}: Props): JSX.Element {
  const shelfWord = he.unit.shelfLabel;
  const cellWord = he.unit.cellLabel;
  const treatAsNewBook = book?.is_new ?? false;

  const [rows, setRows] = useState<RowState[]>([]);
  const [bulk, setBulk] = useState<BulkState>({
    enabled: false,
    nameDraft: "",
    placement: null,
    lookupError: null,
  });
  const [ambiguousChoices, setAmbiguousChoices] = useState<
    { kind: "row" | "bulk"; rowIdx: number; choices: CellRef[] } | null
  >(null);
  const [detailRowIdx, setDetailRowIdx] = useState<number | null>(null);
  const [bulkHierarchyOpen, setBulkHierarchyOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const lookupDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return () => {
      for (const t of Object.values(lookupDebounceRef.current)) {
        clearTimeout(t);
      }
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setRows(
      slots.map((): RowState => ({
        nameDraft: "",
        placement: null,
        lookupError: null,
      })),
    );
    setBulk({ enabled: false, nameDraft: "", placement: null, lookupError: null });
    setAmbiguousChoices(null);
    setDetailRowIdx(null);
    setBulkHierarchyOpen(false);
    setLocalError(null);
  }, [visible, slots]);

  const applyCellToRow = useCallback(
    (rowIdx: number, cr: CellRef) => {
      const summaryLabel = cellRefToSummary(cr, cellWord);
      const mapCell = findStoreMapCellById(storeMap, cr.cellId);
      const positionInCell = resolvePositionForPlacement(mapCell, 1);
      setRows((prev) => {
        const next = [...prev];
        next[rowIdx] = {
          ...next[rowIdx]!,
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

  const applyCellToBulk = useCallback(
    (cr: CellRef) => {
      const summaryLabel = cellRefToSummary(cr, cellWord);
      const mapCell = findStoreMapCellById(storeMap, cr.cellId);
      const positionInCell = resolvePositionForPlacement(mapCell, 1);
      setBulk((prev) => ({
        ...prev,
        nameDraft: cr.cell_name,
        placement: {
          cellId: cr.cellId,
          positionInCell,
          quantityInCell: 1,
          summaryLabel,
        },
        lookupError: null,
      }));
    },
    [cellWord, storeMap],
  );

  const lookupNameAtRow = useCallback(
    (rowIdx: number, draftOverride?: string) => {
      const raw = (draftOverride ?? rows[rowIdx]?.nameDraft ?? "").trim();
      if (!raw) {
        if (ambiguousChoices?.kind === "row" && ambiguousChoices.rowIdx === rowIdx) {
          setAmbiguousChoices(null);
        }
        setRows((prev) => {
          const next = [...prev];
          next[rowIdx] = { ...next[rowIdx]!, placement: null, lookupError: null };
          return next;
        });
        return;
      }
      const rawHits = findCellsMatchingName(storeMap, raw, shelfWord);
      const hits = filterCellRefsForPlacement(rawHits, storeMap, treatAsNewBook);
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
      setAmbiguousChoices({ kind: "row", rowIdx, choices: hits });
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
    [rows, storeMap, shelfWord, applyCellToRow, treatAsNewBook, ambiguousChoices],
  );

  const lookupBulkName = useCallback(
    (draftOverride?: string) => {
      const raw = (draftOverride ?? bulk.nameDraft ?? "").trim();
      if (!raw) {
        if (ambiguousChoices?.kind === "bulk") setAmbiguousChoices(null);
        setBulk((prev) => ({ ...prev, placement: null, lookupError: null }));
        return;
      }
      const rawHits = findCellsMatchingName(storeMap, raw, shelfWord);
      const hits = filterCellRefsForPlacement(rawHits, storeMap, treatAsNewBook);
      if (hits.length === 0) {
        setAmbiguousChoices(null);
        setBulk((prev) => ({ ...prev, placement: null, lookupError: he.addRemove.cellNameNotFound }));
        return;
      }
      if (hits.length === 1) {
        setAmbiguousChoices(null);
        applyCellToBulk(hits[0]!);
        return;
      }
      setAmbiguousChoices({ kind: "bulk", rowIdx: -1, choices: hits });
      setBulk((prev) => ({ ...prev, placement: null, lookupError: he.addRemove.cellNameAmbiguous }));
    },
    [bulk.nameDraft, storeMap, shelfWord, applyCellToBulk, treatAsNewBook, ambiguousChoices],
  );

  const scheduleLookup = useCallback(
    (key: string, fn: () => void) => {
      const prev = lookupDebounceRef.current[key];
      if (prev) clearTimeout(prev);
      lookupDebounceRef.current[key] = setTimeout(() => {
        fn();
        delete lookupDebounceRef.current[key];
      }, 420);
    },
    [],
  );

  const filledRowCount = useMemo(
    () => rows.filter((r) => r.placement != null).length,
    [rows],
  );

  const buildMoves = useCallback((): InventoryMoveItem[] | null => {
    if (!book) return null;

    if (bulk.enabled) {
      if (!bulk.placement) return null;
      const locGroups = new Map<string, { loc: BookLocationExpanded; slotCount: number }>();
      for (const slot of slots) {
        const g = locGroups.get(slot.loc.id);
        if (g) g.slotCount += 1;
        else locGroups.set(slot.loc.id, { loc: slot.loc, slotCount: 1 });
      }
      return [...locGroups.values()].map((g) => ({
        bookId: book.id,
        sourceLocation: g.loc,
        splitOffSingle: false,
        target: {
          ...bulk.placement!,
          quantityInCell: g.slotCount,
        },
      }));
    }

    const moves: InventoryMoveItem[] = [];
    for (let i = 0; i < slots.length; i++) {
      const placement = rows[i]?.placement;
      if (!placement) continue;
      const slot = slots[i]!;
      moves.push({
        bookId: book.id,
        sourceLocation: slot.loc,
        splitOffSingle: slot.loc.quantity_in_cell > 1,
        target: { ...placement, quantityInCell: 1 },
      });
    }
    return moves.length > 0 ? moves : null;
  }, [book, bulk, rows, slots]);

  const submitCount = useMemo(() => {
    if (bulk.enabled) return slots.length;
    return filledRowCount;
  }, [bulk.enabled, filledRowCount, slots.length]);

  const canSubmit =
    !submitting &&
    slots.length > 0 &&
    (bulk.enabled ? bulk.placement != null : filledRowCount > 0);

  const handleSubmit = () => {
    setLocalError(null);
    const moves = buildMoves();
    if (!moves || moves.length === 0) {
      setLocalError(he.addRemove.inventoryMoveNothingFilled);
      return;
    }
    void onSubmitAll(moves);
  };

  const showBulkSection = slots.length > 1;

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <Pressable style={styles.backdrop} onPress={onClose}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHandle} />

              <View style={styles.headerRow}>
                <Text style={styles.title} numberOfLines={2}>
                  {he.unit.move.title}
                </Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <Ionicons name="close" size={22} color={theme.colors.onSurface} />
                </Pressable>
              </View>

              {book ? (
                <View style={styles.bookCard}>
                  <View
                    style={[
                      styles.bookDot,
                      { backgroundColor: supplierColor ?? theme.colors.outline },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bookTitle} numberOfLines={1}>
                      {book.title}
                    </Text>
                    <Text style={styles.bookAuthor} numberOfLines={1}>
                      {book.author}
                    </Text>
                  </View>
                </View>
              ) : null}

              {treatAsNewBook ? (
                <Text style={styles.placementPolicyHint}>{he.addRemove.placementNewBooksOnlyHint}</Text>
              ) : book != null && !book.is_new ? (
                <Text style={styles.placementPolicyHint}>{he.addRemove.placementRegularBooksHint}</Text>
              ) : null}

              <Text style={styles.cellTypeHint}>{he.addRemove.cellNameSearchDebouncedHint}</Text>

              <ScrollView contentContainerStyle={styles.rowsScroll}>
                {showBulkSection ? (
                  <View style={[styles.bulkBlock, bulk.enabled && styles.bulkBlockActive]}>
                    <Pressable
                      style={styles.bulkCheckboxRow}
                      onPress={() =>
                        setBulk((prev) => ({
                          ...prev,
                          enabled: !prev.enabled,
                          lookupError: null,
                        }))
                      }
                      disabled={submitting}
                    >
                      <Ionicons
                        name={bulk.enabled ? "checkbox" : "square-outline"}
                        size={22}
                        color={bulk.enabled ? theme.colors.onPrimary : theme.colors.primary}
                      />
                      <Text
                        style={[
                          styles.bulkCheckboxLabel,
                          bulk.enabled && styles.bulkCheckboxLabelActive,
                        ]}
                      >
                        {interpolate(he.addRemove.inventoryMoveBulkCheckbox, {
                          n: String(slots.length),
                        })}
                      </Text>
                    </Pressable>

                    {bulk.enabled ? (
                      <View style={styles.bulkFields}>
                        <Text style={[styles.fieldLabel, styles.bulkFieldLabelActive]}>
                          {he.addRemove.inventoryMoveRowTarget}
                        </Text>
                        <TextInput
                          style={styles.nameInputFull}
                          value={bulk.nameDraft}
                          editable={!submitting}
                          onChangeText={(t) => {
                            setBulk((prev) => ({
                              ...prev,
                              nameDraft: t,
                              lookupError: null,
                            }));
                            scheduleLookup("bulk", () => lookupBulkName(t));
                          }}
                          placeholder={he.addRemove.cellNameSearchPlaceholder}
                          placeholderTextColor={theme.colors.onSurfaceVariant}
                          textAlign="left"
                        />
                        {ambiguousChoices?.kind === "bulk" ? (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.ambRow}
                          >
                            {ambiguousChoices.choices.map((c) => (
                              <Pressable
                                key={c.cellId}
                                style={styles.ambigChip}
                                onPress={() => {
                                  applyCellToBulk(c);
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
                        {bulk.lookupError ? (
                          <Text style={styles.rowErr}>{bulk.lookupError}</Text>
                        ) : null}
                        {bulk.placement ? (
                          <Text style={[styles.rowOk, styles.bulkRowOkActive]} numberOfLines={3}>
                            {bulk.placement.summaryLabel}
                          </Text>
                        ) : null}
                        <Pressable
                          style={styles.treeLink}
                          disabled={submitting}
                          onPress={() => setBulkHierarchyOpen(true)}
                        >
                          <Ionicons
                            name="layers-outline"
                            size={18}
                            color={theme.colors.onPrimary}
                          />
                          <Text style={[styles.treeLinkText, styles.bulkTreeLinkTextActive]}>
                            {he.addRemove.pickFullHierarchyLink}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {rows.map((row, idx) => {
                  const slot = slots[idx];
                  if (!slot) return null;
                  const path = currentLocationLabel(storeMap, slot.loc, shelfWord, cellWord);
                  const rowDisabled = bulk.enabled || submitting;
                  return (
                    <View
                      key={`move-slot-${slot.loc.id}-${slot.copyIndex}`}
                      style={[styles.rowBlock, rowDisabled && styles.rowBlockDisabled]}
                    >
                      <Text style={styles.rowHeading}>
                        {interpolate(he.addRemove.perCopyRowTitle, { n: String(idx + 1) })}
                      </Text>
                      <Text style={styles.rowCurrent} numberOfLines={3}>
                        {interpolate(he.addRemove.inventoryMoveRowCurrent, {
                          path,
                          pos: String(slot.loc.position_in_cell),
                        })}
                      </Text>
                      <Text style={styles.rowCurrent}>
                        {interpolate(he.addRemove.inventoryMoveRowCellName, {
                          cell: slot.loc.cell_name,
                        })}
                      </Text>
                      <Text style={styles.fieldLabel}>{he.addRemove.inventoryMoveRowTarget}</Text>
                      <TextInput
                        style={styles.nameInputFull}
                        value={row.nameDraft}
                        editable={!rowDisabled}
                        onChangeText={(t) => {
                          setRows((prev) => {
                            const next = [...prev];
                            next[idx] = {
                              ...next[idx]!,
                              nameDraft: t,
                              lookupError: null,
                            };
                            return next;
                          });
                          scheduleLookup(`row-${idx}`, () => lookupNameAtRow(idx, t));
                        }}
                        placeholder={he.addRemove.cellNameSearchPlaceholder}
                        placeholderTextColor={theme.colors.onSurfaceVariant}
                        textAlign="left"
                      />
                      {ambiguousChoices?.kind === "row" && ambiguousChoices.rowIdx === idx ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.ambRow}
                        >
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
                        disabled={rowDisabled}
                        onPress={() => setDetailRowIdx(idx)}
                      >
                        <Ionicons name="layers-outline" size={18} color={theme.colors.primary} />
                        <Text style={styles.treeLinkText}>{he.addRemove.pickFullHierarchyLink}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>

              {localError ? <Text style={styles.sheetError}>{localError}</Text> : null}
              {errorMessage ? <Text style={styles.sheetError}>{errorMessage}</Text> : null}

              <Pressable
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                disabled={!canSubmit}
                onPress={handleSubmit}
              >
                <Text style={styles.submitBtnText}>
                  {submitCount > 1
                    ? interpolate(he.addRemove.inventoryMoveSubmitAll, { n: String(submitCount) })
                    : he.unit.move.submit}
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <MoveBookModal
        key="inventory-move-bulk-hierarchy"
        visible={bulkHierarchyOpen}
        book={null}
        placePreview={{
          title: he.addRemove.sameCellBulkTitle,
          author: book?.title ?? "",
          supplier_color: supplierColor,
          defaultQuantity: 1,
          defaultPosition: 1,
          lockQuantity: true,
        }}
        storeMap={storeMap}
        submitting={false}
        errorMessage={null}
        placePreviewIsNew={treatAsNewBook}
        onClose={() => setBulkHierarchyOpen(false)}
        onSubmit={(target) => {
          const mapCell = findStoreMapCellById(storeMap, target.cellId);
          const pos = resolvePositionForPlacement(mapCell, target.positionInCell);
          setBulk((prev) => ({
            ...prev,
            placement: { ...target, quantityInCell: 1, positionInCell: pos },
            nameDraft: "",
            lookupError: null,
          }));
          setBulkHierarchyOpen(false);
        }}
      />

      <MoveBookModal
        key={`inventory-move-row-${detailRowIdx}`}
        visible={detailRowIdx !== null}
        book={null}
        placePreview={
          detailRowIdx !== null
            ? {
                title: interpolate(he.addRemove.perCopyRowTitle, {
                  n: String(detailRowIdx + 1),
                }),
                author: book ? `${book.author} · ${book.title}` : "",
                supplier_color: supplierColor,
                defaultQuantity: 1,
                defaultPosition: 1,
                lockQuantity: true,
              }
            : undefined
        }
        storeMap={storeMap}
        submitting={false}
        errorMessage={null}
        placePreviewIsNew={treatAsNewBook}
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
    textAlign: "left",
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
    textAlign: "left",
  },
  bookAuthor: { ...theme.typography.caption, color: theme.colors.onSurfaceVariant, textAlign: "left" },
  placementPolicyHint: {
    ...theme.typography.caption,
    color: theme.colors.onTertiaryContainer,
    textAlign: "left",
    backgroundColor: theme.colors.tertiaryContainer,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  cellTypeHint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    lineHeight: 20,
  },
  rowsScroll: { gap: theme.spacing.md, paddingBottom: theme.spacing.md },
  bulkBlock: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  bulkBlockActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryContainer,
  },
  bulkCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  bulkCheckboxLabel: {
    flex: 1,
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  bulkCheckboxLabelActive: {
    color: theme.colors.onPrimary,
  },
  bulkFieldLabelActive: {
    color: theme.colors.onPrimary,
  },
  bulkRowOkActive: {
    color: theme.colors.onPrimary,
  },
  bulkTreeLinkTextActive: {
    color: theme.colors.onPrimary,
  },
  bulkFields: { gap: theme.spacing.xs },
  rowBlock: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  rowBlockDisabled: { opacity: 0.45 },
  rowHeading: { ...theme.typography.labelMd, color: theme.colors.primary, textAlign: "left" },
  rowCurrent: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    lineHeight: 20,
  },
  fieldLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    marginTop: theme.spacing.xs,
  },
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
    textAlign: "left",
    color: theme.colors.onSurface,
  },
  rowErr: { ...theme.typography.caption, color: theme.colors.error, textAlign: "left" },
  rowOk: { ...theme.typography.caption, color: theme.colors.onSurface, textAlign: "left" },
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
    textAlign: "left",
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
