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

export function CellCard({
  cell,
  books,
  shortagedIds,
  onBookPress,
  onBookLongPress,
}: Props): JSX.Element {
  const occupied = books.reduce((sum, b) => sum + b.quantity_in_cell, 0);

  const spineRows = books.flatMap((b) => {
    const qty = Math.max(0, Math.floor(Number(b.quantity_in_cell)));
    if (qty <= 0) return [];
    return Array.from({ length: qty }, (_, i) => (
      <BookSpine
        key={`${b.location_id}-${i}`}
        book={{ ...b, quantity_in_cell: 1 }}
        dimmed={shortagedIds.has(b.location_id) || Boolean(b.is_pending_shortage)}
        onPress={() => onBookPress(b)}
        onLongPress={() => onBookLongPress(b)}
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
