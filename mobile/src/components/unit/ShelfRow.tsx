import { memo, useCallback, useMemo } from "react";
import { FlatList, StyleSheet, Text, View, type ListRenderItemInfo } from "react-native";
import type { StoreMapBook, StoreMapCell, StoreMapShelf } from "@avihay-books/shared";
import { theme } from "../../theme";
import { he } from "../../i18n/he";
import { CellCard, type BookSpinePressHandler } from "./CellCard";

interface Props {
  shelf: StoreMapShelf;
  /** ספרים מסוננים לכל תא (לפי הסינון הגלובלי במסך). */
  cellBooks: Map<string, StoreMapBook[]>;
  /** `location_id` של עותקים שסומנו כחוסר (אופטימי). */
  shortagedIds: Set<string>;
  ghostSlotsByLocation: ReadonlyMap<string, readonly number[]>;
  onBookPress: BookSpinePressHandler;
  onBookLongPress: (book: StoreMapBook) => void;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => {
    return s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }, template);
}

function keyExtractor(cell: StoreMapCell): string {
  return cell.id;
}

function CellSeparator(): JSX.Element {
  return <View style={styles.gap} />;
}

function ShelfRowImpl({
  shelf,
  cellBooks,
  shortagedIds,
  ghostSlotsByLocation,
  onBookPress,
  onBookLongPress,
}: Props): JSX.Element {
  const shelfTitle = shelf.label ?? `${he.unit.shelfLabel} ${shelf.shelf_number}`;
  /** תא 1 = שמאלי — מיון עולה + כיוון LTR כדי לא להתהפך תחת RTL גלובלי. */
  const cellsLtr = useMemo(
    () => [...shelf.cells].sort((a, b) => a.cell_number - b.cell_number),
    [shelf.cells],
  );
  const heading = useMemo(
    () =>
      interpolate(he.unit.shelfHeadingWithCells, {
        shelf: shelfTitle,
        n: String(cellsLtr.length),
      }),
    [shelfTitle, cellsLtr.length],
  );
  const canScrollHorizontally = cellsLtr.length > 2;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<StoreMapCell>) => (
      <CellCard
        cell={item}
        books={cellBooks.get(item.id) ?? item.books}
        shortagedIds={shortagedIds}
        ghostSlotsByLocation={ghostSlotsByLocation}
        onBookPress={onBookPress}
        onBookLongPress={onBookLongPress}
      />
    ),
    [cellBooks, shortagedIds, ghostSlotsByLocation, onBookPress, onBookLongPress],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{heading}</Text>
      <View style={styles.ltrRow}>
        <FlatList
          data={cellsLtr}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={canScrollHorizontally}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={CellSeparator}
          renderItem={renderItem}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
        />
      </View>
    </View>
  );
}

export const ShelfRow = memo(ShelfRowImpl);

const styles = StyleSheet.create({
  wrap: {
    gap: theme.spacing.sm,
  },
  heading: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  ltrRow: {
    direction: "ltr",
  },
  list: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  gap: { width: theme.spacing.sm },
});
