import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StoreMapBook, StoreMapCell } from "@avihay-books/shared";
import { theme } from "../../theme";
import { he } from "../../i18n/he";
import { BookSpine } from "./BookSpine";
import { resolveGhostSpineSlots, spineDisplayCounts } from "../../utils/spineShortageSlots";

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => {
    return s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }, template);
}

export type BookSpinePressHandler = (book: StoreMapBook, spineSlot: number) => void;

interface Props {
  cell: StoreMapCell;
  books: StoreMapBook[];
  /** מזהי `location_id` (לא `book_id`) — עותקים שונים של אותו ספר נבדלים. */
  shortagedIds: Set<string>;
  /** אינדקסי שדרה שנלחצו לחוסר — כדי לטשטש את העותק שנבחר ולא תמיד את האחרון. */
  ghostSlotsByLocation: ReadonlyMap<string, readonly number[]>;
  onBookPress: BookSpinePressHandler;
  onBookLongPress: (book: StoreMapBook) => void;
}

function CellCardImpl({
  cell,
  books,
  shortagedIds,
  ghostSlotsByLocation,
  onBookPress,
  onBookLongPress,
}: Props): JSX.Element {
  const occupied = books.reduce((sum, b) => sum + spineDisplayCounts(b).total, 0);

  const spineRows = books.flatMap((b) => {
    const { ghosts: shortageCount, total: totalSlots } = spineDisplayCounts(b);
    const ghostSlots = resolveGhostSpineSlots(
      totalSlots,
      shortageCount,
      ghostSlotsByLocation.get(b.location_id),
    );
    const spines: JSX.Element[] = [];
    for (let slot = 0; slot < totalSlots; slot += 1) {
      const dimmed = ghostSlots.has(slot);
      spines.push(
        <BookSpine
          key={`${b.location_id}-slot-${slot}`}
          book={{
            ...b,
            quantity_in_cell: dimmed ? 0 : 1,
            is_pending_shortage: dimmed,
            pending_shortage_count: dimmed ? shortageCount : 0,
          }}
          dimmed={dimmed}
          onPress={(book) => onBookPress(book, slot)}
          onLongPress={onBookLongPress}
        />,
      );
    }
    return spines;
  });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>
          {he.unit.cellLabel} {cell.cell_name}
        </Text>
        <Text style={styles.copiesHint}>
          {interpolate(he.unit.cellCopiesInCell, { n: String(occupied) })}
        </Text>
      </View>

      <View style={styles.shelfLine} />

      <View style={styles.booksRow}>
        {books.length === 0 || spineRows.length === 0 ? (
          <Text style={styles.empty}>{he.unit.emptyCell}</Text>
        ) : (
          spineRows
        )}
      </View>
    </View>
  );
}

/**
 * רענון של `store-map` (או patch של חוסר ב־cache) בונה מחדש את מערכי הספרים
 * של *כל* התאים, גם כשרק ספר אחד השתנה. השוואה לפי זהות מערך הייתה מרנדרת
 * מחדש את כל הארון — מאות שדרות. לכן משווים לפי השדות שמשפיעים על התצוגה,
 * כולל חברות ב־`shortagedIds` של הספרים של התא הזה בלבד.
 */
function areCellPropsEqual(prev: Props, next: Props): boolean {
  if (prev.onBookPress !== next.onBookPress) return false;
  if (prev.onBookLongPress !== next.onBookLongPress) return false;
  if (prev.ghostSlotsByLocation !== next.ghostSlotsByLocation) return false;
  if (
    prev.cell.id !== next.cell.id ||
    prev.cell.cell_name !== next.cell.cell_name ||
    prev.cell.capacity !== next.cell.capacity
  ) {
    return false;
  }

  const a = prev.books;
  const b = next.books;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.location_id !== y.location_id ||
      x.title !== y.title ||
      x.supplier_color !== y.supplier_color ||
      x.quantity_in_cell !== y.quantity_in_cell ||
      (x.shelf_stock ?? 0) !== (y.shelf_stock ?? 0) ||
      x.is_new !== y.is_new ||
      x.is_pending_shortage !== y.is_pending_shortage ||
      (x.pending_shortage_count ?? 0) !== (y.pending_shortage_count ?? 0)
    ) {
      return false;
    }
    if (prev.shortagedIds.has(x.location_id) !== next.shortagedIds.has(y.location_id)) {
      return false;
    }
  }
  return true;
}

export const CellCard = memo(CellCardImpl, areCellPropsEqual);

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    minWidth: 160,
    gap: theme.spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    letterSpacing: 0.3,
  },
  copiesHint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
  },
  /**
   * קו ה־«מדף» שעליו שדרות הספרים יושבות — כדי לדמות מדפדף אמיתי.
   */
  shelfLine: {
    height: 2,
    backgroundColor: theme.colors.primaryFixedDim,
    marginTop: theme.spacing.xs,
    marginBottom: 0,
    borderRadius: 1,
  },
  booksRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    minHeight: 92,
  },
  empty: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    flex: 1,
    textAlign: "center",
  },
});
