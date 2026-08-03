import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StoreMapBook, StoreMapCell } from "@avihay-books/shared";
import { theme } from "../../theme";
import { he } from "../../i18n/he";
import { BookSpine } from "./BookSpine";

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => {
    return s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }, template);
}

interface Props {
  cell: StoreMapCell;
  books: StoreMapBook[];
  /** מזהי `location_id` (לא `book_id`) — עותקים שונים של אותו ספר נבדלים. */
  shortagedIds: Set<string>;
  onBookPress: (book: StoreMapBook) => void;
  onBookLongPress: (book: StoreMapBook) => void;
}

function CellCardImpl({
  cell,
  books,
  shortagedIds,
  onBookPress,
  onBookLongPress,
}: Props): JSX.Element {
  const occupied = books.reduce((sum, b) => sum + b.quantity_in_cell, 0);

  const spineRows = books.flatMap((b) => {
    const qty = Math.max(0, Math.floor(Number(b.quantity_in_cell)));
    const isShortaged =
      shortagedIds.has(b.location_id) || Boolean(b.is_pending_shortage);
    // מיקום חסר (qty 0 + shortage) — שדרה אחת מטושטשת במקום להסתיר לגמרי.
    const spineCount = qty > 0 ? qty : isShortaged ? 1 : 0;
    if (spineCount <= 0) return [];
    return Array.from({ length: spineCount }, (_, i) => (
      <BookSpine
        key={`${b.location_id}-${i}`}
        book={b}
        dimmed={isShortaged}
        onPress={onBookPress}
        onLongPress={onBookLongPress}
      />
    ));
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
      x.is_new !== y.is_new ||
      x.is_pending_shortage !== y.is_pending_shortage
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
    minWidth: 180,
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
