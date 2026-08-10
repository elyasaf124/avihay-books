import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
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
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { theme } from "../../theme";
import { he } from "../../i18n/he";
import {
  autoPickCellIdOnShelf,
  cellIdsEqual,
  cellRefToSummary,
  findCellNameByLocationId,
  findCellsMatchingName,
  findStoreMapCellById,
  resolvePositionForPlacement,
  shouldAutoPickCellOnShelf,
  unitCollapsesCellChoice,
  type CellRef,
} from "../../utils/storeMapCells";
import { useEnsureCell } from "../../api/storeMap";

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => {
    return s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }, template);
}

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
  /** כשאין `book`: האם הספר מסומן `is_new` (לתצוגה בלבד; לא מגביל יעדים). */
  placePreviewIsNew?: boolean;
  /** פתיחה ממסך ארון — מתחילים עם הארון (והמדף הראשון) מסומנים. */
  preferredUnitId?: string | null;
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
  placePreviewIsNew: _placePreviewIsNew = false,
  preferredUnitId = null,
  onClose,
  onSubmit,
}: Props): JSX.Element {
  const keyboardHeight = useKeyboardHeight();
  const ensureCell = useEnsureCell();
  /** העברת ספר קיים — ממשק מצומצם: מיקום נוכחי + שם תא יעד. */
  const isSimpleMove = book != null;
  const currentCellName = useMemo(
    () =>
      book != null ? findCellNameByLocationId(storeMap, book.location_id) : null,
    [book, storeMap],
  );

  const filteredStoreUnits = useMemo(() => storeMap?.units ?? [], [storeMap]);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [sideId, setSideId] = useState<string | null>(null);
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [cellId, setCellId] = useState<string | null>(null);
  /** שם תא ליצירה כשחסר במפה (לא נוצר בייבוא כי היה ריק). */
  const [newCellName, setNewCellName] = useState("");
  const [createCellError, setCreateCellError] = useState<string | null>(null);
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
    setNewCellName("");
    setCreateCellError(null);
    setCellId(null);

    const preferred =
      preferredUnitId && filteredStoreUnits.some((u) => u.id === preferredUnitId)
        ? preferredUnitId
        : filteredStoreUnits.length === 1
          ? filteredStoreUnits[0]!.id
          : null;
    setUnitId(preferred);
    setSideId(null);
    setShelfId(null);
  }, [visible, book?.location_id, preferredUnitId, filteredStoreUnits]);

  /** כשארון נבחר — מדף ראשון אוטומטית (במיוחד ארון תצוגה עם מדף יחיד). */
  useEffect(() => {
    if (!visible || !unitId || !storeMap) return;
    const unit = storeMap.units.find((u) => u.id === unitId);
    if (!unit) return;
    if (unit.has_sides) {
      if (!sideId && unit.sides.length === 1) {
        setSideId(unit.sides[0]!.id);
      }
      return;
    }
    if (!shelfId && unit.shelves.length > 0) {
      setShelfId(unit.shelves[0]!.id);
    }
  }, [visible, unitId, sideId, shelfId, storeMap]);

  useEffect(() => {
    if (!visible || !sideId || !storeMap || !unitId) return;
    const unit = storeMap.units.find((u) => u.id === unitId);
    const side = unit?.sides.find((s) => s.id === sideId);
    if (!shelfId && side && side.shelves.length > 0) {
      setShelfId(side.shelves[0]!.id);
    }
  }, [visible, unitId, sideId, shelfId, storeMap]);

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
    setNewCellName("");
    setCreateCellError(null);
  }, []);

  const applyQuickQuery = useCallback(
    (raw: string) => {
      const query = raw.trim();
      if (!query) {
        setQuickCandidates([]);
        setQuickError(null);
        return;
      }
      const hits = findCellsMatchingName(storeMap, query, shelfWordLabel);

      /** בארון פתוח — מעדיפים תאים באותו ארון; אחרת יוצרים במדף הנוכחי במקום לקפוץ לארון אחר. */
      const scopeUnitId = preferredUnitId ?? unitId;
      const scoped = scopeUnitId ? hits.filter((h) => h.unitId === scopeUnitId) : hits;

      if (scoped.length === 1) {
        applyCellRef(scoped[0]!);
        setQuickCandidates([]);
        setQuickError(null);
        setNewCellName("");
        return;
      }
      if (scoped.length > 1) {
        setQuickCandidates(scoped);
        setQuickError(he.addRemove.cellNameAmbiguous);
        setCellId(null);
        return;
      }

      /** העברה פשוטה — רק תאים קיימים; בלי יצירת תא חדש. */
      if (isSimpleMove) {
        if (hits.length === 0) {
          setQuickCandidates([]);
          setQuickError(he.addRemove.cellNameNotFound);
          setCellId(null);
          setNewCellName("");
          return;
        }
        if (hits.length === 1) {
          applyCellRef(hits[0]!);
          setQuickCandidates([]);
          setQuickError(null);
          setNewCellName("");
          return;
        }
        setQuickCandidates(hits);
        setQuickError(he.addRemove.cellNameAmbiguous);
        setCellId(null);
        return;
      }

      /** אין תא בשם הזה בארון הנוכחי — ניצור במדף שנבחר (גם אם השם קיים בארון אחר). */
      if (shelfId) {
        setQuickCandidates([]);
        setQuickError(null);
        setCellId(null);
        setNewCellName(query);
        setCreateCellError(null);
        return;
      }

      if (hits.length === 0) {
        setQuickCandidates([]);
        setQuickError(he.addRemove.cellNameNotFound);
        setCellId(null);
        setNewCellName(query);
        return;
      }
      if (hits.length === 1) {
        applyCellRef(hits[0]!);
        setQuickCandidates([]);
        setQuickError(null);
        setNewCellName("");
        return;
      }
      setQuickCandidates(hits);
      setQuickError(he.addRemove.cellNameAmbiguous);
      setCellId(null);
    },
    [
      applyCellRef,
      storeMap,
      shelfWordLabel,
      preferredUnitId,
      unitId,
      shelfId,
      isSimpleMove,
    ],
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

  /** תא יחיד / ארון תצוגה — בוחרים אוטומטית, בלי שלב תא. */
  useEffect(() => {
    if (!visible || !shelfId || !selectedUnit) return;
    const activeShelf = shelves.find((sh) => sh.id === shelfId);
    if (!shouldAutoPickCellOnShelf(selectedUnit, activeShelf)) return;
    const onlyId = autoPickCellIdOnShelf(selectedUnit, activeShelf);
    if (!onlyId || cellId === onlyId) return;
    setCellId(onlyId);
    setNewCellName("");
    setCreateCellError(null);
    setQuickCandidates([]);
    setQuickError(null);
  }, [visible, shelfId, shelves, selectedUnit, cellId]);

  const selectedCell =
    cellId == null ? undefined : cellOptions.find((c) => cellIdsEqual(c.id, cellId));

  const trimmedNewCellName = newCellName.trim();
  const creatingNewCell = trimmedNewCellName.length > 0 && cellId == null;

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

  const canSubmit = isSimpleMove
    ? !!cellId &&
      !!shelfId &&
      !submitting &&
      !!selectedUnit &&
      (pickTab === "tree" || quickCandidates.length === 0)
    : (!!cellId || (creatingNewCell && !!shelfId)) &&
      !!Number(position) &&
      (lockQuantity || !!Number(quantity)) &&
      !submitting &&
      !ensureCell.isPending &&
      !!selectedUnit;

  const quickResolvedSummary = useMemo(() => {
    if (pickTab !== "quick" || !cellId || !selectedCell) return null;
    if (quickCandidates.length > 0) return null;
    if (quickError) return null;
    if (isSimpleMove) return selectedCell.name;
    if (!selectedUnit || !shelfId) return null;
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
    isSimpleMove,
  ]);

  const headerTitle =
    modalTitle ??
    (book ? he.unit.move.title : placePreview ? he.addRemove.placeBookOnMapTitle : he.unit.move.title);

  const submit = () => {
    if (!selectedUnit || !shelfId) return;

    const finish = (resolvedCellId: string, cellLbl: string) => {
      const summaryLabel = isSimpleMove
        ? cellLbl
        : (() => {
            const shelfLbl = shelfOptions.find((s) => s.id === shelfId)?.label ?? "";
            const sideLbl = selectedUnit.has_sides
              ? sides.find((s) => s.id === sideId)?.label
              : undefined;
            const summaryParts = [
              selectedUnit.name,
              sideLbl,
              shelfLbl,
              cellLbl ? `${cellWordLabel} ${cellLbl}` : "",
            ].filter((p): p is string => Boolean(p?.trim()));
            return summaryParts.join(" · ");
          })();

      const qtyNum =
        isSimpleMove || lockQuantity
          ? 1
          : Math.max(1, Math.floor(Number(quantity) || 1));

      const { prefPos, resolvedPlace } = placementResolution;
      const mapCell = findStoreMapCellById(storeMap, resolvedCellId);
      const posInCell = isSimpleMove
        ? resolvePositionForPlacement(mapCell, 1)
        : book == null && resolvedCellId && storeMap && cellId
          ? resolvedPlace
          : prefPos;

      void onSubmit({
        cellId: resolvedCellId,
        positionInCell: posInCell,
        quantityInCell: qtyNum,
        summaryLabel,
      });
    };

    if (cellId) {
      finish(cellId, selectedCell?.name ?? "");
      return;
    }

    if (!creatingNewCell) return;

    const existingOnShelf = cellOptions.find(
      (c) => c.name.trim().toLowerCase() === trimmedNewCellName.toLowerCase(),
    );
    if (existingOnShelf) {
      setCellId(existingOnShelf.id);
      setNewCellName("");
      finish(existingOnShelf.id, existingOnShelf.name);
      return;
    }

    setCreateCellError(null);
    void ensureCell
      .mutateAsync({ shelfId, cellName: trimmedNewCellName })
      .then((cell) => {
        setCellId(cell.id);
        setNewCellName("");
        setQuickError(null);
        finish(cell.id, cell.cell_name);
      })
      .catch((err: unknown) => {
        const apiErr =
          typeof err === "object" &&
          err &&
          "response" in err &&
          typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error ===
            "string"
            ? (err as { response: { data: { error: string } } }).response.data.error
            : null;
        if (apiErr === "cell_name_exists_on_other_shelf") {
          setCreateCellError(he.addRemove.createNewCellNameTaken);
        } else {
          setCreateCellError(he.addRemove.createNewCellFailed);
        }
      });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
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

            {isSimpleMove && currentCellName ? (
              <View style={styles.moveContextBanner}>
                <Text style={styles.moveContextCurrent} numberOfLines={1}>
                  {interpolate(he.addRemove.inventoryMoveRowCurrent, {
                    cell: currentCellName,
                  })}
                </Text>
              </View>
            ) : null}

            {moveContextBanner && !isSimpleMove ? (
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

            <ScrollView style={styles.sheetScroll} contentContainerStyle={{ gap: theme.spacing.md }}>
              <>
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

                  {isSimpleMove ? (
                    <Text style={styles.numericLabel}>{he.addRemove.inventoryMoveRowTarget}</Text>
                  ) : null}

                  {pickTab === "quick" ? (
                    <View style={{ gap: theme.spacing.sm }}>
                      {!isSimpleMove ? (
                        <Text style={styles.numericLabel}>{he.addRemove.cellNameSearchLabel}</Text>
                      ) : null}
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
                      {!isSimpleMove ? (
                        <Text style={styles.quickDebouncedHint}>
                          {he.addRemove.cellNameSearchDebouncedHint}
                        </Text>
                      ) : null}
                      {quickError ? (
                        quickCandidates.length === 0 ? (
                          <View style={{ gap: theme.spacing.xs }}>
                            <Text style={styles.error}>{quickError}</Text>
                            {!isSimpleMove && trimmedNewCellName.length > 0 && shelfId ? (
                              <Text style={styles.quickDebouncedHint}>
                                {he.addRemove.createNewCellReadyHint}
                              </Text>
                            ) : !isSimpleMove && trimmedNewCellName.length > 0 ? (
                              <Pressable
                                onPress={() => {
                                  setPickTab("tree");
                                  setQuickError(null);
                                }}
                              >
                                <Text style={styles.createCellLink}>
                                  {he.addRemove.cellNameNotFoundCreateHint}
                                </Text>
                              </Pressable>
                            ) : null}
                          </View>
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
                                if (isSimpleMove) setQuickQuery(c.cell_name);
                              }}
                              style={pickerStyles.chip}
                            >
                              <Text style={pickerStyles.label} numberOfLines={4}>
                                {isSimpleMove
                                  ? `${c.unitName} · ${c.cell_name}`
                                  : cellRefToSummary(c, cellWordLabel)}
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

                      {!isSimpleMove && creatingNewCell && shelfId && !quickError ? (
                        <Text style={styles.warn}>
                          {interpolate(he.addRemove.createNewCellWillCreate, {
                            cell: trimmedNewCellName,
                          })}
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
                          setNewCellName("");
                          setCreateCellError(null);
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
                            setNewCellName("");
                            setCreateCellError(null);
                            setQuickCandidates([]);
                            setQuickError(null);
                          }}
                        />
                      ) : null}

                      {selectedUnit &&
                      !(
                        shelfOptions.length <= 1 &&
                        (unitCollapsesCellChoice(selectedUnit) ||
                          shouldAutoPickCellOnShelf(
                            selectedUnit,
                            shelves.find((sh) => sh.id === shelfId) ?? shelves[0],
                          ))
                      ) ? (
                        <SectionPicker
                          label={he.unit.move.targetShelf}
                          value={shelfId}
                          options={shelfOptions}
                          onChange={(id) => {
                            setShelfId(id);
                            setCellId(null);
                            setCreateCellError(null);
                            setQuickCandidates([]);
                            setQuickError(null);
                          }}
                          disabled={selectedUnit.has_sides && !sideId}
                        />
                      ) : null}

                      {shelfId &&
                      !shouldAutoPickCellOnShelf(
                        selectedUnit,
                        shelves.find((sh) => sh.id === shelfId),
                      ) &&
                      cellOptions.length > 1 ? (
                        <SectionPicker
                          label={he.unit.move.targetCell}
                          value={cellId}
                          options={cellOptions.map((c) => ({
                            id: c.id,
                            label: `${cellWordLabel} ${c.name}`,
                          }))}
                          onChange={(id) => {
                            setCellId(id);
                            setNewCellName("");
                            setCreateCellError(null);
                            setQuickCandidates([]);
                            setQuickError(null);
                          }}
                        />
                      ) : null}

                      {shelfId &&
                      !isSimpleMove &&
                      !shouldAutoPickCellOnShelf(
                        selectedUnit,
                        shelves.find((sh) => sh.id === shelfId),
                      ) ? (
                        <View style={{ gap: theme.spacing.xs }}>
                          <Text style={styles.numericLabel}>{he.addRemove.cellNameSearchLabel}</Text>
                          <TextInput
                            style={styles.quickLookupInputFull}
                            value={cellId ? (selectedCell?.name ?? "") : newCellName}
                            onChangeText={(t) => {
                              const match = cellOptions.find(
                                (c) => c.name.trim().toLowerCase() === t.trim().toLowerCase(),
                              );
                              if (match) {
                                setCellId(match.id);
                                setNewCellName("");
                              } else {
                                setCellId(null);
                                setNewCellName(t);
                              }
                              setCreateCellError(null);
                            }}
                            placeholder={he.addRemove.cellNameSearchPlaceholder}
                            placeholderTextColor={theme.colors.onSurfaceVariant}
                          />
                          {creatingNewCell ? (
                            <Text style={styles.quickDebouncedHint}>
                              {interpolate(he.addRemove.createNewCellWillCreate, {
                                cell: trimmedNewCellName,
                              })}
                            </Text>
                          ) : null}
                          {createCellError ? <Text style={styles.error}>{createCellError}</Text> : null}
                        </View>
                      ) : null}
                    </>
                  ) : null}

                  {!isSimpleMove ? (
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
                  ) : null}
              </>

              {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
              {createCellError && pickTab === "quick" && !isSimpleMove ? (
                <Text style={styles.error}>{createCellError}</Text>
              ) : null}
            </ScrollView>

            <Pressable
              style={[
                styles.submitBtn,
                !canSubmit && styles.submitBtnDisabled,
                { marginBottom: keyboardHeight },
              ]}
              onPress={submit}
              disabled={!canSubmit}
            >
              <Text style={styles.submitBtnText}>{he.unit.move.submit}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
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
    flex: 1,
    flexDirection: "column",
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
    maxHeight: "90%",
    ...theme.shadow.modal,
  },
  sheetScroll: {
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
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
    color: theme.colors.onPrimaryContainer,
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
  createCellLink: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    textAlign: "left",
    textDecorationLine: "underline",
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
