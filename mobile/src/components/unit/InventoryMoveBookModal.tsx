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
import type {
  BookLocationExpanded,
  BookWithLocations,
  StoreMap,
  StoreMapShelf,
  StoreMapUnit,
} from "@avihay-books/shared";
import { he } from "../../i18n/he";
import { theme } from "../../theme";
import {
  autoPickCellIdOnShelf,
  findCellsMatchingName,
  findStoreMapCellById,
  listAllCells,
  resolvePositionForPlacement,
  shouldAutoPickCellOnShelf,
  unitCollapsesCellChoice,
  type CellRef,
} from "../../utils/storeMapCells";
import type { MapPlacementSubmitTarget } from "./MoveBookModal";

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

type PickTab = "quick" | "tree";

type TreePickState = {
  pickTab: PickTab;
  unitId: string | null;
  sideId: string | null;
  shelfId: string | null;
};

type RowState = {
  nameDraft: string;
  placement: MapPlacementSubmitTarget | null;
  lookupError: string | null;
} & TreePickState;

type BulkState = {
  enabled: boolean;
  nameDraft: string;
  placement: MapPlacementSubmitTarget | null;
  lookupError: string | null;
} & TreePickState;

const EMPTY_TREE: TreePickState = {
  pickTab: "quick",
  unitId: null,
  sideId: null,
  shelfId: null,
};

function placementFromCellRef(
  cr: CellRef,
  storeMap: StoreMap | null,
): MapPlacementSubmitTarget {
  const mapCell = findStoreMapCellById(storeMap, cr.cellId);
  return {
    cellId: cr.cellId,
    positionInCell: resolvePositionForPlacement(mapCell, 1),
    quantityInCell: 1,
    summaryLabel: `${cr.unitName} · ${cr.cell_name}`,
  };
}

function cellRefForId(storeMap: StoreMap | null, cellId: string, shelfWord: string): CellRef | null {
  return listAllCells(storeMap, shelfWord).find((c) => c.cellId === cellId) ?? null;
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
  const filteredUnits = useMemo(() => storeMap?.units ?? [], [storeMap]);

  const [rows, setRows] = useState<RowState[]>([]);
  const [bulk, setBulk] = useState<BulkState>({
    enabled: false,
    nameDraft: "",
    placement: null,
    lookupError: null,
    ...EMPTY_TREE,
  });
  const [ambiguousChoices, setAmbiguousChoices] = useState<
    { kind: "row" | "bulk"; rowIdx: number; choices: CellRef[] } | null
  >(null);
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
        ...EMPTY_TREE,
      })),
    );
    setBulk({
      enabled: false,
      nameDraft: "",
      placement: null,
      lookupError: null,
      ...EMPTY_TREE,
    });
    setAmbiguousChoices(null);
    setLocalError(null);
  }, [visible, slots]);

  const applyCellToRow = useCallback(
    (rowIdx: number, cr: CellRef) => {
      setRows((prev) => {
        const next = [...prev];
        next[rowIdx] = {
          ...next[rowIdx]!,
          nameDraft: cr.cell_name,
          placement: placementFromCellRef(cr, storeMap),
          lookupError: null,
          unitId: cr.unitId,
          sideId: cr.sideId,
          shelfId: cr.shelfId,
        };
        return next;
      });
    },
    [storeMap],
  );

  const applyCellToBulk = useCallback(
    (cr: CellRef) => {
      setBulk((prev) => ({
        ...prev,
        nameDraft: cr.cell_name,
        placement: placementFromCellRef(cr, storeMap),
        lookupError: null,
        unitId: cr.unitId,
        sideId: cr.sideId,
        shelfId: cr.shelfId,
      }));
    },
    [storeMap],
  );

  const applyTreeCell = useCallback(
    (kind: "row" | "bulk", rowIdx: number, cellId: string) => {
      const cr = cellRefForId(storeMap, cellId, shelfWord);
      if (!cr) return;
      if (kind === "bulk") applyCellToBulk(cr);
      else applyCellToRow(rowIdx, cr);
      setAmbiguousChoices(null);
    },
    [storeMap, shelfWord, applyCellToBulk, applyCellToRow],
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
      const hits = findCellsMatchingName(storeMap, raw, shelfWord);
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
    [rows, storeMap, shelfWord, applyCellToRow, ambiguousChoices],
  );

  const lookupBulkName = useCallback(
    (draftOverride?: string) => {
      const raw = (draftOverride ?? bulk.nameDraft ?? "").trim();
      if (!raw) {
        if (ambiguousChoices?.kind === "bulk") setAmbiguousChoices(null);
        setBulk((prev) => ({ ...prev, placement: null, lookupError: null }));
        return;
      }
      const hits = findCellsMatchingName(storeMap, raw, shelfWord);
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
    [bulk.nameDraft, storeMap, shelfWord, applyCellToBulk, ambiguousChoices],
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
          quantityInCell: g.loc.quantity_in_cell <= 0 ? 0 : g.slotCount,
        },
      }));
    }

    const moves: InventoryMoveItem[] = [];
    for (let i = 0; i < slots.length; i++) {
      const placement = rows[i]?.placement;
      if (!placement) continue;
      const slot = slots[i]!;
      const isEmptyShelfSlot = slot.loc.quantity_in_cell <= 0;
      moves.push({
        bookId: book.id,
        sourceLocation: slot.loc,
        splitOffSingle: slot.loc.quantity_in_cell > 1,
        target: {
          ...placement,
          quantityInCell: isEmptyShelfSlot ? 0 : 1,
        },
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

  const renderAmbiguous = (
    kind: "row" | "bulk",
    rowIdx: number,
    onPick: (cr: CellRef) => void,
  ) => {
    if (ambiguousChoices?.kind !== kind) return null;
    if (kind === "row" && ambiguousChoices.rowIdx !== rowIdx) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.ambRow}>
        {ambiguousChoices.choices.map((c) => (
          <Pressable
            key={`${c.cellId}-${kind}-${rowIdx}`}
            style={styles.ambigChip}
            onPress={() => {
              onPick(c);
              setAmbiguousChoices(null);
            }}
          >
            <Text style={styles.ambigChipText} numberOfLines={2}>
              {c.unitName} · {c.cell_name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  };

  const renderPickTabs = (
    pickTab: PickTab,
    onChange: (tab: PickTab) => void,
    disabled: boolean,
  ) => (
    <View style={styles.tabRow}>
      <Pressable
        disabled={disabled}
        onPress={() => onChange("quick")}
        style={[styles.tabChip, pickTab === "quick" && styles.tabChipActive]}
      >
        <Text style={[styles.tabChipText, pickTab === "quick" && styles.tabChipTextActive]}>
          {he.addRemove.placementTabByName}
        </Text>
      </Pressable>
      <Pressable
        disabled={disabled}
        onPress={() => onChange("tree")}
        style={[styles.tabChip, pickTab === "tree" && styles.tabChipActive]}
      >
        <Text style={[styles.tabChipText, pickTab === "tree" && styles.tabChipTextActive]}>
          {he.addRemove.placementTabTree}
        </Text>
      </Pressable>
    </View>
  );

  const renderTreePicker = (
    kind: "row" | "bulk",
    rowIdx: number,
    tree: TreePickState,
    selectedCellId: string | null,
    disabled: boolean,
    onTreeChange: (patch: Partial<TreePickState>) => void,
  ) => {
    const selectedUnit: StoreMapUnit | undefined = filteredUnits.find((u) => u.id === tree.unitId);
    const sides = selectedUnit?.sides.map((s) => ({ id: s.id, label: s.side_label })) ?? [];
    const shelves: StoreMapShelf[] = (() => {
      if (!selectedUnit) return [];
      if (selectedUnit.has_sides) {
        return selectedUnit.sides.find((s) => s.id === tree.sideId)?.shelves ?? [];
      }
      return selectedUnit.shelves;
    })();
    const activeShelf = shelves.find((sh) => sh.id === tree.shelfId);
    const cells = activeShelf?.cells ?? [];
    /** תא יחיד / ארון תצוגה (שמות כפולים) — בלי בחירת תא. */
    const hideCellPicker =
      shouldAutoPickCellOnShelf(selectedUnit, activeShelf) || cells.length <= 1;
    /** מדף יחיד בארון תצוגה — מספיק ללחוץ על הארון. */
    const hideShelfPicker =
      Boolean(selectedUnit) &&
      shelves.length <= 1 &&
      (unitCollapsesCellChoice(selectedUnit) || hideCellPicker);

    const selectShelf = (shelf: StoreMapShelf) => {
      const autoId = autoPickCellIdOnShelf(selectedUnit, shelf);
      if (autoId) {
        applyTreeCell(kind, rowIdx, autoId);
        return;
      }
      onTreeChange({ shelfId: shelf.id });
    };

    return (
      <View style={styles.treeBlock}>
        <Text style={styles.fieldLabel}>{he.unit.move.targetUnit}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {filteredUnits.map((u) => {
            const active = u.id === tree.unitId;
            return (
              <Pressable
                key={`${kind}-${rowIdx}-unit-${u.id}`}
                disabled={disabled}
                onPress={() => {
                  if (u.has_sides) {
                    onTreeChange({ unitId: u.id, sideId: null, shelfId: null });
                    return;
                  }
                  const firstShelf = u.shelves[0];
                  const autoId = autoPickCellIdOnShelf(u, firstShelf);
                  if (autoId) {
                    applyTreeCell(kind, rowIdx, autoId);
                    return;
                  }
                  onTreeChange({
                    unitId: u.id,
                    sideId: null,
                    shelfId: firstShelf?.id ?? null,
                  });
                }}
                style={[styles.treeChip, active && styles.treeChipActive]}
              >
                <Text style={[styles.treeChipText, active && styles.treeChipTextActive]}>
                  {u.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {selectedUnit?.has_sides ? (
          <>
            <Text style={styles.fieldLabel}>{he.unit.move.targetSide}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {sides.map((s) => {
                const active = s.id === tree.sideId;
                return (
                  <Pressable
                    key={`${kind}-${rowIdx}-side-${s.id}`}
                    disabled={disabled}
                    onPress={() => {
                      const side = selectedUnit.sides.find((x) => x.id === s.id);
                      const firstShelf = side?.shelves[0];
                      const autoId = autoPickCellIdOnShelf(selectedUnit, firstShelf);
                      if (autoId) {
                        applyTreeCell(kind, rowIdx, autoId);
                        return;
                      }
                      onTreeChange({
                        sideId: s.id,
                        shelfId: firstShelf?.id ?? null,
                      });
                    }}
                    style={[styles.treeChip, active && styles.treeChipActive]}
                  >
                    <Text style={[styles.treeChipText, active && styles.treeChipTextActive]}>
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {selectedUnit && !hideShelfPicker ? (
          <>
            <Text style={styles.fieldLabel}>{he.unit.move.targetShelf}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {shelves.map((sh) => {
                const active = sh.id === tree.shelfId;
                return (
                  <Pressable
                    key={`${kind}-${rowIdx}-shelf-${sh.id}`}
                    disabled={disabled || (selectedUnit.has_sides && !tree.sideId)}
                    onPress={() => selectShelf(sh)}
                    style={[styles.treeChip, active && styles.treeChipActive]}
                  >
                    <Text style={[styles.treeChipText, active && styles.treeChipTextActive]}>
                      {sh.label ?? `${shelfWord} ${sh.shelf_number}`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {tree.shelfId && !hideCellPicker ? (
          <>
            <Text style={styles.fieldLabel}>{he.unit.move.targetCell}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {cells.map((c) => {
                const active = c.id === selectedCellId;
                return (
                  <Pressable
                    key={`${kind}-${rowIdx}-cell-${c.id}`}
                    disabled={disabled}
                    onPress={() => applyTreeCell(kind, rowIdx, c.id)}
                    style={[styles.treeChip, active && styles.treeChipActive]}
                  >
                    <Text style={[styles.treeChipText, active && styles.treeChipTextActive]}>
                      {cellWord} {c.cell_name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />

            <View style={styles.headerRow}>
              <Text style={styles.title} numberOfLines={1}>
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
                      {renderPickTabs(bulk.pickTab, (tab) => {
                        setBulk((prev) => ({ ...prev, pickTab: tab, lookupError: null }));
                        setAmbiguousChoices(null);
                      }, submitting)}
                      {bulk.pickTab === "quick" ? (
                        <>
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
                          {renderAmbiguous("bulk", -1, applyCellToBulk)}
                          {bulk.lookupError ? (
                            <Text style={styles.rowErr}>{bulk.lookupError}</Text>
                          ) : null}
                        </>
                      ) : (
                        renderTreePicker(
                          "bulk",
                          -1,
                          bulk,
                          bulk.placement?.cellId ?? null,
                          submitting,
                          (patch) =>
                            setBulk((prev) => ({
                              ...prev,
                              ...patch,
                              placement: patch.shelfId !== undefined || patch.unitId !== undefined
                                ? null
                                : prev.placement,
                              lookupError: null,
                            })),
                        )
                      )}
                      {bulk.placement ? (
                        <Text style={[styles.rowOk, styles.bulkRowOkActive]} numberOfLines={1}>
                          {bulk.placement.summaryLabel}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {rows.map((row, idx) => {
                const slot = slots[idx];
                if (!slot) return null;
                const rowDisabled = bulk.enabled || submitting;
                return (
                  <View
                    key={`move-slot-${slot.loc.id}-${slot.copyIndex}`}
                    style={[styles.rowBlock, rowDisabled && styles.rowBlockDisabled]}
                  >
                    {slots.length > 1 ? (
                      <Text style={styles.rowHeading}>
                        {interpolate(he.addRemove.perCopyRowTitle, { n: String(idx + 1) })}
                      </Text>
                    ) : null}
                    <Text style={styles.rowCurrent} numberOfLines={1}>
                      {interpolate(he.addRemove.inventoryMoveRowCurrent, {
                        cell: slot.loc.cell_name,
                      })}
                    </Text>
                    <Text style={styles.fieldLabel}>{he.addRemove.inventoryMoveRowTarget}</Text>
                    {renderPickTabs(
                      row.pickTab,
                      (tab) => {
                        setRows((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx]!, pickTab: tab, lookupError: null };
                          return next;
                        });
                        setAmbiguousChoices(null);
                      },
                      rowDisabled,
                    )}
                    {row.pickTab === "quick" ? (
                      <>
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
                        {renderAmbiguous("row", idx, (cr) => applyCellToRow(idx, cr))}
                        {row.lookupError ? <Text style={styles.rowErr}>{row.lookupError}</Text> : null}
                      </>
                    ) : (
                      renderTreePicker(
                        "row",
                        idx,
                        row,
                        row.placement?.cellId ?? null,
                        rowDisabled,
                        (patch) =>
                          setRows((prev) => {
                            const next = [...prev];
                            const cur = next[idx]!;
                            next[idx] = {
                              ...cur,
                              ...patch,
                              placement:
                                patch.shelfId !== undefined || patch.unitId !== undefined
                                  ? null
                                  : cur.placement,
                              lookupError: null,
                            };
                            return next;
                          }),
                      )
                    )}
                    {row.placement ? (
                      <Text style={styles.rowOk} numberOfLines={1}>
                        {row.placement.summaryLabel}
                      </Text>
                    ) : null}
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
  bulkFields: { gap: theme.spacing.xs },
  rowBlock: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  rowBlockDisabled: { opacity: 0.45 },
  rowHeading: { ...theme.typography.labelMd, color: theme.colors.primary, textAlign: "left" },
  rowCurrent: {
    ...theme.typography.bodyLg,
    color: theme.colors.onSurface,
    fontWeight: "600",
    textAlign: "left",
    lineHeight: 22,
  },
  fieldLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    marginTop: theme.spacing.xs,
  },
  tabRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    flexWrap: "wrap",
    marginTop: theme.spacing.xs,
  },
  tabChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surface,
  },
  tabChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  tabChipText: { ...theme.typography.labelMd, color: theme.colors.onSurface },
  tabChipTextActive: { color: theme.colors.onPrimary, fontWeight: "700" },
  treeBlock: { gap: theme.spacing.xs },
  chipScroll: { maxHeight: 48, flexGrow: 0 },
  treeChip: {
    marginEnd: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surface,
  },
  treeChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  treeChipText: { ...theme.typography.bodyMd, color: theme.colors.onSurface },
  treeChipTextActive: { color: theme.colors.onPrimary, fontWeight: "700" },
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
  ambRow: { maxHeight: 56, flexGrow: 0, marginTop: theme.spacing.xs },
  ambigChip: {
    marginEnd: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  ambigChipText: {
    ...theme.typography.bodyMd,
    textAlign: "left",
    color: theme.colors.onSurface,
    fontWeight: "600",
  },
  rowErr: { ...theme.typography.caption, color: theme.colors.error, textAlign: "left" },
  rowOk: { ...theme.typography.caption, color: theme.colors.onSurface, textAlign: "left" },
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
