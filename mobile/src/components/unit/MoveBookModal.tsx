import { useCallback, useEffect, useMemo, useState } from "react";
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
  StoreMap,
  StoreMapBook,
  StoreMapCell,
  StoreMapShelf,
  StoreMapUnit,
} from "@avihay-books/shared";
import { theme } from "../../theme";
import { he } from "../../i18n/he";
import {
  cellIdsEqual,
  cellRefToSummary,
  filterCellRefsForPlacement,
  findCellsMatchingName,
  findStoreMapCellById,
  resolvePositionForPlacement,
  type CellRef,
} from "../../utils/storeMapCells";

export type MapPlacementSubmitTarget = {
  cellId: string;
  positionInCell: number;
  quantityInCell: number;
  /** תווית להצגה אחרי בחירה (ארון · מדף · תא) */
  summaryLabel: string;
};

interface Props {
  visible: boolean;
  /** ספר מהמפה — מצב «העבר מיקום» */
  book: StoreMapBook | null;
  /** ספר חדש / בלי רשומת מפה — מצב «בחר תא ראשון» */
  placePreview?:
    | {
        title: string;
        author: string;
        supplier_color?: string;
        defaultQuantity?: number;
        defaultPosition?: number;
        /** כאשר `true` — כמות בתא תמיד ‎1 (מיקום לעותק יחיד) */
        lockQuantity?: boolean;
      }
    | undefined;
  storeMap: StoreMap | null;
  submitting?: boolean;
  errorMessage?: string | null;
  modalTitle?: string;
  /** עם `book` — נועל כמות ל־`1` (העברת עותק בודד מתוך רשומת מיקום) */
  lockQuantityForMove?: boolean;
  /** מסך העברה מרשימת המלאי — מיקום נוכחי + בורר עותקים + העברה מרוכזת */
  moveContextBanner?: {
    currentLocationText: string;
    slotPicker?: {
      labels: string[];
      activeMask: boolean[];
      onSelect: (index: number) => void;
    };
    /** לכל תא שיש בו יותר מעותק אחד — תמיד גלוי גם כשעוברים לעותק מתא אחר */
    bulkMoves?: { id: string; label: string; onPress: () => void }[];
  };
  /** כשאין `book`: האם הספר החדש מסומן `is_new` (מגביל לתאי ארון התצוגה). */
  placePreviewIsNew?: boolean;
  onClose: () => void;
  onSubmit: (target: MapPlacementSubmitTarget) => void | Promise<void>;
}

interface UnitOpt {
  id: string;
  name: string;
  hasSides: boolean;
}
interface SideOpt {
  id: string;
  label: string;
}
interface ShelfOpt {
  id: string;
  label: string;
}
interface CellOpt {
  id: string;
  name: string;
}

export function MoveBookModal({
  visible,
  book,
  placePreview,
  storeMap,
  submitting,
  errorMessage,
  modalTitle,
  lockQuantityForMove = false,
  moveContextBanner,
  placePreviewIsNew = false,
  onClose,
  onSubmit,
}: Props): JSX.Element {
  const treatAsNewBook = book != null ? book.is_new : Boolean(placePreviewIsNew);

  const filteredStoreUnits = useMemo(() => {
    const all = storeMap?.units ?? [];
    if (treatAsNewBook) return all.filter((u) => u.store_position === "display");
    return all.filter((u) => u.store_position !== "display");
  }, [storeMap, treatAsNewBook]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [sideId, setSideId] = useState<string | null>(null);
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [cellId, setCellId] = useState<string | null>(null);
  const initialPosition =
    book != null ? String(book.position_in_cell) : String(placePreview?.defaultPosition ?? 1);
  const initialQuantity =
    book != null
      ? String(book.quantity_in_cell)
      : String(placePreview?.defaultQuantity ?? 1);
  const [position, setPosition] = useState<string>(initialPosition);
  const [quantity, setQuantity] = useState<string>(initialQuantity);

  const shelfWordLabel = he.unit.shelfLabel;
  const cellWordLabel = he.unit.cellLabel;

  const lockQuantity =
    (book === null && placePreview?.lockQuantity === true) || lockQuantityForMove;

  type TabPick = "quick" | "tree";
  const [pickTab, setPickTab] = useState<TabPick>("quick");
  const [quickQuery, setQuickQuery] = useState("");
  const [quickCandidates, setQuickCandidates] = useState<CellRef[]>([]);
  const [quickError, setQuickError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPickTab("quick");
    setQuickQuery("");
    setQuickCandidates([]);
    setQuickError(null);
  }, [visible, book?.location_id]);

  useEffect(() => {
    if (!visible) return;
    setPosition(
      book != null
        ? String(book.position_in_cell)
        : String(placePreview?.defaultPosition ?? 1),
    );
    const q =
      lockQuantityForMove && book != null
        ? "1"
        : book != null
          ? String(book.quantity_in_cell)
          : String(placePreview?.defaultQuantity ?? 1);
    setQuantity(q);
  }, [
    visible,
    book?.location_id,
    book?.position_in_cell,
    book?.quantity_in_cell,
    lockQuantityForMove,
    placePreview?.defaultPosition,
    placePreview?.defaultQuantity,
  ]);

  const applyCellRef = useCallback((cr: CellRef) => {
    setUnitId(cr.unitId);
    setSideId(cr.sideId);
    setShelfId(cr.shelfId);
    setCellId(cr.cellId);
  }, []);

  const applyQuickQuery = useCallback(
    (raw: string) => {
      const query = raw.trim();
      if (!query) {
        setQuickCandidates([]);
        setQuickError(null);
        return;
      }
      let hits = findCellsMatchingName(storeMap, query, shelfWordLabel);
      hits = filterCellRefsForPlacement(hits, storeMap, treatAsNewBook);
      if (hits.length === 0) {
        setQuickCandidates([]);
        setQuickError(he.addRemove.cellNameNotFound);
        setCellId(null);
        return;
      }
      if (hits.length === 1) {
        applyCellRef(hits[0]!);
        setQuickCandidates([]);
        setQuickError(null);
        return;
      }
      setQuickCandidates(hits);
      setQuickError(he.addRemove.cellNameAmbiguous);
      setCellId(null);
    },
    [applyCellRef, storeMap, shelfWordLabel, treatAsNewBook],
  );

  useEffect(() => {
    if (!visible) return;
    if (unitId != null && !filteredStoreUnits.some((u) => u.id === unitId)) {
      setUnitId(filteredStoreUnits[0]?.id ?? null);
      setSideId(null);
      setShelfId(null);
      setCellId(null);
    }
  }, [visible, filteredStoreUnits, unitId]);

  useEffect(() => {
    if (!visible || !treatAsNewBook || filteredStoreUnits.length !== 1) return;
    const onlyId = filteredStoreUnits[0]!.id;
    if (unitId !== onlyId) {
      setUnitId(onlyId);
      setSideId(null);
      setShelfId(null);
      setCellId(null);
    }
  }, [visible, treatAsNewBook, filteredStoreUnits, unitId]);

  /** עיכוב קצר כדי שהקלדת «49» לא תריץ חיפוש על «4». */
  useEffect(() => {
    if (!visible || pickTab !== "quick") return;
    const trimmed = quickQuery.trim();
    if (trimmed.length === 0) {
      setQuickCandidates([]);
      setQuickError(null);
      return;
    }
    const id = setTimeout(() => {
      applyQuickQuery(quickQuery);
    }, 420);
    return () => clearTimeout(id);
  }, [quickQuery, visible, pickTab, applyQuickQuery]);

  const units: UnitOpt[] = useMemo(
    () =>
      filteredStoreUnits.map((u) => ({
        id: u.id,
        name: u.name,
        hasSides: u.has_sides,
      })),
    [filteredStoreUnits],
  );

  const selectedUnit: StoreMapUnit | undefined = useMemo(
    () => storeMap?.units.find((u) => u.id === unitId),
    [storeMap, unitId],
  );

  const sides: SideOpt[] = useMemo(
    () => selectedUnit?.sides.map((s) => ({ id: s.id, label: s.side_label })) ?? [],
    [selectedUnit],
  );

  const shelves: StoreMapShelf[] = useMemo(() => {
    if (!selectedUnit) return [];
    if (selectedUnit.has_sides) {
      const side = selectedUnit.sides.find((s) => s.id === sideId);
      return side?.shelves ?? [];
    }
    return selectedUnit.shelves;
  }, [selectedUnit, sideId]);

  const shelfOptions: ShelfOpt[] = useMemo(
    () =>
      shelves.map((sh) => ({
        id: sh.id,
        label: sh.label ?? `${he.unit.shelfLabel} ${sh.shelf_number}`,
      })),
    [shelves],
  );

  const cells: StoreMapCell[] = useMemo(
    () => shelves.find((sh) => sh.id === shelfId)?.cells ?? [],
    [shelves, shelfId],
  );

  const cellOptions: CellOpt[] = useMemo(
    () =>
      cells.map((c) => ({
        id: c.id,
        name: c.cell_name,
      })),
    [cells],
  );

  const selectedCell =
    cellId == null ? undefined : cellOptions.find((c) => cellIdsEqual(c.id, cellId));

  const placementResolution = useMemo(() => {
    const prefPos = Math.max(1, Math.floor(Number(position) || 1));
    if (book != null || !cellId || !storeMap)
      return { prefPos, resolvedPlace: prefPos };
    const mapCell = findStoreMapCellById(storeMap, cellId);
    return {
      prefPos,
      resolvedPlace: resolvePositionForPlacement(mapCell, prefPos),
    };
  }, [book, cellId, storeMap, position]);

  const canSubmit =
    !!cellId &&
    !!Number(position) &&
    (lockQuantity || !!Number(quantity)) &&
    !submitting &&
    !!selectedUnit;

  const quickResolvedSummary = useMemo(() => {
    if (pickTab !== "quick" || !cellId || !selectedUnit || !selectedCell || !shelfId) return null;
    if (quickCandidates.length > 0) return null;
    if (quickError) return null;
    const shelfLbl = shelfOptions.find((s) => s.id === shelfId)?.label ?? "";
    const sideLbl = selectedUnit.has_sides
      ? sides.find((s) => s.id === sideId)?.label
      : undefined;
    const parts = [
      selectedUnit.name,
      sideLbl,
      shelfLbl,
      `${cellWordLabel} ${selectedCell.name}`,
    ].filter((p): p is string => Boolean(p?.trim()));
    return parts.join(" · ");
  }, [
    pickTab,
    cellId,
    selectedUnit,
    selectedCell,
    shelfId,
    shelfOptions,
    sides,
    sideId,
    quickCandidates.length,
    quickError,
    cellWordLabel,
  ]);

  const headerTitle =
    modalTitle ??
    (book ? he.unit.move.title : placePreview ? he.addRemove.placeBookOnMapTitle : he.unit.move.title);

  const submit = () => {
    if (!cellId || !selectedUnit) return;
    const shelfLbl = shelfOptions.find((s) => s.id === shelfId)?.label ?? "";
    const cellLbl = selectedCell?.name ?? "";
    const sideLbl = selectedUnit.has_sides
      ? sides.find((s) => s.id === sideId)?.label
      : undefined;
    const summaryParts = [
      selectedUnit.name,
      sideLbl,
      shelfLbl,
      cellLbl ? `${cellWordLabel} ${cellLbl}` : "",
    ].filter((p): p is string => Boolean(p?.trim()));
    const summaryLabel = summaryParts.join(" · ");

    const qtyNum = lockQuantity
      ? 1
      : Math.max(1, Math.floor(Number(quantity) || 1));

    const { prefPos, resolvedPlace } = placementResolution;
    let posInCell = book == null && cellId && storeMap ? resolvedPlace : prefPos;

    void onSubmit({
      cellId,
      positionInCell: posInCell,
      quantityInCell: qtyNum,
      summaryLabel,
    });
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
                {headerTitle}
              </Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.onSurface} />
              </Pressable>
            </View>

            {book ? (
              <View style={styles.bookCard}>
                <View style={[styles.bookDot, { backgroundColor: book.supplier_color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bookTitle} numberOfLines={1}>
                    {book.title}
                  </Text>
                  <Text style={styles.bookAuthor} numberOfLines={1}>
                    {book.author}
                  </Text>
                </View>
              </View>
            ) : placePreview ? (
              <View style={styles.bookCard}>
                <View
                  style={[
                    styles.bookDot,
                    { backgroundColor: placePreview.supplier_color ?? theme.colors.outline },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bookTitle} numberOfLines={1}>
                    {placePreview.title}
                  </Text>
                  <Text style={styles.bookAuthor} numberOfLines={1}>
                    {placePreview.author}
                  </Text>
                </View>
              </View>
            ) : null}

            {moveContextBanner ? (
              <View style={styles.moveContextBanner}>
                {moveContextBanner.bulkMoves && moveContextBanner.bulkMoves.length > 0 ? (
                  <View style={styles.bulkMovesBlock}>
                    {moveContextBanner.bulkMoves.map((b) => (
                      <Pressable
                        key={b.id}
                        style={styles.bulkLink}
                        onPress={b.onPress}
                        disabled={submitting}
                      >
                        <Ionicons name="layers-outline" size={18} color={theme.colors.primary} />
                        <Text style={styles.bulkLinkText} numberOfLines={3}>
                          {b.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.moveContextCurrent} numberOfLines={4}>
                  {moveContextBanner.currentLocationText}
                </Text>
                {moveContextBanner.slotPicker && moveContextBanner.slotPicker.labels.length > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.slotChipRow}
                  >
                    {moveContextBanner.slotPicker.labels.map((label, i) => {
                      const mask = moveContextBanner.slotPicker!.activeMask;
                      const active = Boolean(mask[i]);
                      return (
                        <Pressable
                          key={`slot-${i}`}
                          onPress={() => moveContextBanner.slotPicker!.onSelect(i)}
                          style={[styles.slotChip, active && styles.slotChipActive]}
                        >
                          <Text style={[styles.slotChipText, active && styles.slotChipTextActive]}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>
            ) : null}

            <ScrollView contentContainerStyle={{ gap: theme.spacing.md }}>
              <View style={styles.tabRow}>
                <Pressable
                  onPress={() => setPickTab("quick")}
                  style={[styles.tabChip, pickTab === "quick" && styles.tabChipActive]}
                >
                  <Text style={[styles.tabChipText, pickTab === "quick" && styles.tabChipTextActive]}>
                    {he.addRemove.placementTabByName}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPickTab("tree")}
                  style={[styles.tabChip, pickTab === "tree" && styles.tabChipActive]}
                >
                  <Text style={[styles.tabChipText, pickTab === "tree" && styles.tabChipTextActive]}>
                    {he.addRemove.placementTabTree}
                  </Text>
                </Pressable>
              </View>

              {treatAsNewBook ? (
                <Text style={styles.placementPolicyHint}>{he.addRemove.placementNewBooksOnlyHint}</Text>
              ) : book != null && !book.is_new ? (
                <Text style={styles.placementPolicyHint}>{he.addRemove.placementRegularBooksHint}</Text>
              ) : null}

              {pickTab === "quick" ? (
                <View style={{ gap: theme.spacing.sm }}>
                  <Text style={styles.numericLabel}>{he.addRemove.cellNameSearchLabel}</Text>
                  <TextInput
                    style={styles.quickLookupInputFull}
                    value={quickQuery}
                    onChangeText={(t) => {
                      setQuickQuery(t);
                      setQuickError(null);
                    }}
                    placeholder={he.addRemove.cellNameSearchPlaceholder}
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                  />
                  <Text style={styles.quickDebouncedHint}>{he.addRemove.cellNameSearchDebouncedHint}</Text>
                  {quickError ? (
                    quickCandidates.length === 0 ? (
                      <Text style={styles.error}>{quickError}</Text>
                    ) : (
                      <Text style={styles.warn}>{quickError}</Text>
                    )
                  ) : null}

                  {quickCandidates.length > 1 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={pickerStyles.row}
                    >
                      {quickCandidates.map((c) => (
                        <Pressable
                          key={c.cellId}
                          onPress={() => {
                            applyCellRef(c);
                            setQuickCandidates([]);
                            setQuickError(null);
                          }}
                          style={pickerStyles.chip}
                        >
                          <Text style={pickerStyles.label} numberOfLines={4}>
                            {cellRefToSummary(c, cellWordLabel)}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}

                  {quickResolvedSummary ? (
                    <Text style={styles.resolvedPath} numberOfLines={4}>
                      {quickResolvedSummary}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {pickTab === "tree" ? (
                <>
                  <SectionPicker
                    label={he.unit.move.targetUnit}
                    value={unitId}
                    options={units.map((u) => ({ id: u.id, label: u.name }))}
                    onChange={(id) => {
                      setUnitId(id);
                      setSideId(null);
                      setShelfId(null);
                      setCellId(null);
                      setQuickCandidates([]);
                      setQuickError(null);
                    }}
                  />

                  {selectedUnit?.has_sides ? (
                    <SectionPicker
                      label={he.unit.move.targetSide}
                      value={sideId}
                      options={sides}
                      onChange={(id) => {
                        setSideId(id);
                        setShelfId(null);
                        setCellId(null);
                        setQuickCandidates([]);
                        setQuickError(null);
                      }}
                    />
                  ) : null}

                  {selectedUnit ? (
                    <SectionPicker
                      label={he.unit.move.targetShelf}
                      value={shelfId}
                      options={shelfOptions}
                      onChange={(id) => {
                        setShelfId(id);
                        setCellId(null);
                        setQuickCandidates([]);
                        setQuickError(null);
                      }}
                      disabled={selectedUnit.has_sides && !sideId}
                    />
                  ) : null}

                  {shelfId ? (
                    <SectionPicker
                      label={he.unit.move.targetCell}
                      value={cellId}
                      options={cellOptions.map((c) => ({
                        id: c.id,
                        label: `${cellWordLabel} ${c.name}`,
                      }))}
                      onChange={(id) => {
                        setCellId(id);
                        setQuickCandidates([]);
                        setQuickError(null);
                      }}
                    />
                  ) : null}
                </>
              ) : null}

              <View style={styles.numericRow}>
                <View style={styles.numericBlock}>
                  <Text style={styles.numericLabel}>{he.unit.move.positionInCell}</Text>
                  <TextInput
                    style={styles.numericInput}
                    value={position}
                    onChangeText={(t) => setPosition(t.replace(/[^0-9]/g, ""))}
                    keyboardType="numeric"
                    placeholder="1"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                  />
                </View>
                {!lockQuantity ? (
                  <View style={styles.numericBlock}>
                    <Text style={styles.numericLabel}>{he.unit.move.quantityInCell}</Text>
                    <TextInput
                      style={styles.numericInput}
                      value={quantity}
                      onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ""))}
                      keyboardType="numeric"
                      placeholder="1"
                      placeholderTextColor={theme.colors.onSurfaceVariant}
                    />
                  </View>
                ) : (
                  <View style={styles.numericBlock}>
                    <Text style={styles.numericLabel}>{he.unit.move.quantityInCell}</Text>
                    <Text style={[styles.numericInput, styles.numericDisabled]}>{quantity}</Text>
                  </View>
                )}
              </View>

              {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            </ScrollView>

            <Pressable
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={submit}
              disabled={!canSubmit}
            >
              <Text style={styles.submitBtnText}>{he.unit.move.submit}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface PickerOpt {
  id: string;
  label: string;
}
interface PickerProps {
  label: string;
  value: string | null;
  options: PickerOpt[];
  onChange: (id: string) => void;
  disabled?: boolean;
}

function SectionPicker({ label, value, options, onChange, disabled }: PickerProps): JSX.Element {
  return (
    <View style={{ opacity: disabled ? 0.5 : 1 }}>
      <Text style={styles.numericLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={pickerStyles.row}
      >
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <Pressable
              key={opt.id}
              onPress={() => !disabled && onChange(opt.id)}
              style={[pickerStyles.chip, active && pickerStyles.chipActive]}
            >
              <Text style={[pickerStyles.label, active && pickerStyles.labelActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    paddingHorizontal: 2,
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  label: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
  },
  labelActive: {
    color: theme.colors.onPrimary,
    fontWeight: "700",
  },
});

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
    gap: theme.spacing.md,
    maxHeight: "90%",
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
  },
  title: {
    ...theme.typography.headlineSm,
    color: theme.colors.primary,
    flex: 1,
    textAlign: "left",
  },
  bookCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  bookDot: { width: 12, height: 36, borderRadius: 3 },
  bookTitle: {
    ...theme.typography.bodyLg,
    color: theme.colors.onSurface,
    fontWeight: "700",
    textAlign: "left",
  },
  bookAuthor: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  moveContextBanner: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.secondaryContainer,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  moveContextCurrent: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSecondaryContainer,
    textAlign: "left",
    lineHeight: 22,
  },
  slotChipRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    flexGrow: 0,
  },
  slotChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surface,
  },
  slotChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  slotChipText: { ...theme.typography.labelMd, color: theme.colors.onSurface },
  slotChipTextActive: { color: theme.colors.onPrimary, fontWeight: "700" },
  bulkMovesBlock: { gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  bulkLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    alignSelf: "stretch",
    paddingVertical: theme.spacing.xs,
  },
  bulkLinkText: {
    flex: 1,
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    textAlign: "left",
  },
  quickLookupInputFull: {
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
  quickDebouncedHint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  tabRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    flexWrap: "wrap",
  },
  placementPolicyHint: {
    ...theme.typography.caption,
    color: theme.colors.tertiary,
    textAlign: "left",
    backgroundColor: theme.colors.tertiaryContainer,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  tabChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  tabChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  tabChipText: { ...theme.typography.labelMd, color: theme.colors.onSurface },
  tabChipTextActive: { color: theme.colors.onPrimary, fontWeight: "700" },
  resolvedPath: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
    lineHeight: 22,
    backgroundColor: theme.colors.primaryContainer,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  numericDisabled: {
    opacity: 0.85,
    textAlignVertical: "center",
  },
  numericRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  numericBlock: { flex: 1, gap: 4 },
  numericLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  numericInput: {
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
  warn: {
    ...theme.typography.caption,
    color: theme.colors.onTertiaryContainer,
    backgroundColor: theme.colors.tertiaryFixed,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    textAlign: "left",
  },
  error: {
    ...theme.typography.caption,
    color: theme.colors.onErrorContainer,
    backgroundColor: theme.colors.errorContainer,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    textAlign: "left",
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    color: theme.colors.onPrimary,
    fontWeight: "700",
    fontSize: theme.typography.bodyLg.fontSize,
    fontFamily: theme.fontFamily.bold,
  },
});
