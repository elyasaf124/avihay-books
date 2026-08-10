import type {
  StoreMap,
  StoreMapCell,
  StoreMapShelf,
  StoreMapSide,
  StoreMapUnit,
} from "@avihay-books/shared";

/** השוואת `UUID` מתוך JSON / השרת — לעיתים שונות ברישיות. */
export function cellIdsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** מאתר תא בתוך `StoreMap` לפי `cell_id` — לקביעת מיקום ריק לפני `POST`. */
export function findStoreMapCellById(
  storeMap: StoreMap | null,
  cellId: string,
): StoreMapCell | null {
  if (!storeMap) return null;
  for (const u of storeMap.units) {
    const shelves: StoreMapShelf[] = u.has_sides ? u.sides.flatMap((s) => s.shelves) : u.shelves;
    for (const shelf of shelves) {
      const cell = shelf.cells.find((c) => cellIdsEqual(c.id, cellId));
      if (cell) return cell;
    }
  }
  return null;
}

/**
 * בוחר מספר משבצת בתא שהיא פנויה מהמפת עזר של השרת: קודמת ל־`preferred` אם אפשר,
 * ואם תפוס — המספר הגבוה הבא הזמין (ללא מגבלה לפי ‎capacity — ההחלטה בעיקר בשטח).
 */
export function resolvePositionForPlacement(
  cell: StoreMapCell | null | undefined,
  preferred: number,
): number {
  const used = new Set((cell?.books ?? []).map((b) => b.position_in_cell));
  let p = Math.max(1, Math.floor(preferred));
  if (!cell) return p;
  while (used.has(p)) p += 1;
  return p;
}

/** ייחוס לתא בודד מתוך `StoreMap` — לחיפוש לפי `cell_name` ולסנכרון בורר היררכי */
export interface CellRef {
  cellId: string;
  /** `cell.cell_name` — המזהים המקוצר בשטח (למשל ‎«58‎») */
  cell_name: string;
  cell_number: number;
  unitId: string;
  unitName: string;
  sideId: string | null;
  sideLabel: string | null;
  shelfId: string;
  shelfLabel: string;
  shelf_number: number;
}

function shelfDisplayLabel(sh: StoreMapShelf, shelfWord: string): string {
  return sh.label ?? `${shelfWord} ${sh.shelf_number}`;
}

function flattenUnitShelves(
  unit: StoreMapUnit,
  sideOrNull: StoreMapSide | null,
  shelfWord: string,
): CellRef[] {
  const shelves: StoreMapShelf[] =
    sideOrNull !== null ? sideOrNull.shelves : unit.has_sides ? [] : unit.shelves;

  const out: CellRef[] = [];
  const unitName = unit.name;
  const sideId = sideOrNull?.id ?? null;
  const sideLabel = sideOrNull?.side_label ?? null;

  for (const sh of shelves) {
    const shelfLbl = shelfDisplayLabel(sh, shelfWord);
    for (const cell of sh.cells as StoreMapCell[]) {
      out.push({
        cellId: cell.id,
        cell_name: cell.cell_name,
        cell_number: cell.cell_number,
        unitId: unit.id,
        unitName,
        sideId,
        sideLabel,
        shelfId: sh.id,
        shelfLabel: shelfLbl,
        shelf_number: sh.shelf_number,
      });
    }
  }
  return out;
}

/** בעבר סינן לפי `is_new`/תצוגה — כעת חופש מיקום מלא (מוחזר כמות־שהוא לתאימות קוראים). */
export function filterCellRefsForPlacement(
  refs: CellRef[],
  _storeMap: StoreMap | null,
  _treatAsNewBook: boolean,
): CellRef[] {
  return refs;
}

/** כל התאים בכל הארונות (למהירות חיפוש לפי שם תא). */
export function listAllCells(storeMap: StoreMap | null, shelfWord: string): CellRef[] {
  if (!storeMap) return [];
  const acc: CellRef[] = [];
  for (const u of storeMap.units) {
    if (u.has_sides) {
      for (const side of u.sides) acc.push(...flattenUnitShelves(u, side, shelfWord));
    } else {
      acc.push(...flattenUnitShelves(u, null, shelfWord));
    }
  }
  return acc;
}

function normalizeCellQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

/** אם המחרוזת מספרית — גם בהתאמה ‎058 ↔ 58‎ */
export function normalizedNumericKey(s: string): string | null {
  const n = Number.parseInt(String(s).trim(), 10);
  return Number.isFinite(n) ? String(n) : null;
}

/** התאמת `cell_name` (כולל מספר עם אפשרות לריפוד מאפס).
 * לשאילתות לא־מספריות: גם התאמת חלקית לשם תא / שם ארון
 * (למשל «חוברת» או «סטנד» → תאי סטנד חוברות). */
export function findCellsMatchingName(
  storeMap: StoreMap | null,
  raw: string,
  shelfWord: string,
): CellRef[] {
  const q = normalizeCellQuery(raw);
  if (!q) return [];

  const all = listAllCells(storeMap, shelfWord);
  const qNum = normalizedNumericKey(q);
  /** שאילתה שהיא רק ספרות — נשארים בהתאמה מדויקת למספר תא. */
  const numericOnly = qNum !== null && /^\d+$/.test(q.trim());

  const exact = all.filter((c) => {
    const nm = normalizeCellQuery(c.cell_name);
    if (nm === q) return true;
    if (qNum !== null && normalizedNumericKey(c.cell_name) === qNum) return true;
    return false;
  });
  if (exact.length > 0 || numericOnly) return exact;

  return all.filter((c) => {
    const nm = normalizeCellQuery(c.cell_name);
    const un = normalizeCellQuery(c.unitName);
    return nm.includes(q) || un.includes(q);
  });
}

/**
 * ארון תצוגה — במפה יכולים להיות כמה שמות תא היסטוריים («תצוגה» / «תצוגה חלון»)
 * שמייצגים אותו יעד בפועל; ב־UI בוחרים אוטומטית בלי להציג רשימה.
 */
export function unitCollapsesCellChoice(
  unit: Pick<StoreMapUnit, "store_position"> | null | undefined,
): boolean {
  return unit?.store_position === "display";
}

/** תא מועדף על מדף כשיש כמה שמות זהים־בפועל (מעדיף «תצוגה» בלי «חלון»). */
export function pickPreferredCellOnShelf(shelf: StoreMapShelf): StoreMapCell | null {
  const list = shelf.cells;
  if (list.length === 0) return null;
  if (list.length === 1) return list[0]!;
  const exact = list.find((c) => c.cell_name.trim() === "תצוגה");
  if (exact) return exact;
  const noWindow = list.find((c) => !c.cell_name.includes("חלון"));
  if (noWindow) return noWindow;
  return [...list].sort((a, b) => a.cell_number - b.cell_number)[0] ?? null;
}

/** האם לבחור תא אוטומטית (תא יחיד, או ארון תצוגה עם שמות כפולים). */
export function shouldAutoPickCellOnShelf(
  unit: Pick<StoreMapUnit, "store_position"> | null | undefined,
  shelf: StoreMapShelf | null | undefined,
): boolean {
  if (!shelf || shelf.cells.length === 0) return false;
  return shelf.cells.length === 1 || unitCollapsesCellChoice(unit);
}

export function autoPickCellIdOnShelf(
  unit: Pick<StoreMapUnit, "store_position"> | null | undefined,
  shelf: StoreMapShelf | null | undefined,
): string | null {
  if (!shelf || !shouldAutoPickCellOnShelf(unit, shelf)) return null;
  if (shelf.cells.length === 1) return shelf.cells[0]!.id;
  return pickPreferredCellOnShelf(shelf)?.id ?? null;
}

/** תא מועדף ביחידת `display` — למיקום אצווה בספר חדש. */
export function findFirstDisplayCellId(storeMap: StoreMap | null): string | null {
  const u = storeMap?.units.find((x) => x.store_position === "display");
  if (!u) return null;
  const shList = u.has_sides ? u.sides.flatMap((s) => s.shelves) : u.shelves;
  const shelf = shList[0];
  if (!shelf) return null;
  return autoPickCellIdOnShelf(u, shelf) ?? pickPreferredCellOnShelf(shelf)?.id ?? null;
}

/** תווית ארון › צד › מדף › תא */
export function cellRefToSummary(cr: CellRef, cellWord: string): string {
  const parts = [
    cr.unitName,
    cr.sideLabel ?? undefined,
    cr.shelfLabel,
    `${cellWord} ${cr.cell_name}`,
  ].filter((p): p is string => Boolean(p?.trim()));
  return parts.join(" · ");
}

/** שם תא לפי `location_id` של רשומת `book_locations` במפה. */
export function findCellNameByLocationId(
  storeMap: StoreMap | null,
  locationId: string,
): string | null {
  if (!storeMap || !locationId) return null;
  const needle = locationId.trim().toLowerCase();
  for (const u of storeMap.units) {
    const shelves: StoreMapShelf[] = u.has_sides
      ? u.sides.flatMap((s) => s.shelves)
      : u.shelves;
    for (const sh of shelves) {
      for (const cell of sh.cells) {
        if (cell.books.some((b) => b.location_id.trim().toLowerCase() === needle)) {
          return cell.cell_name;
        }
      }
    }
  }
  return null;
}
