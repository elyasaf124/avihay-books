import { FlatList, StyleSheet, Text, View } from "react-native";
import type { StoreMapBook, StoreMapShelf } from "@avihay-books/shared";
import { theme } from "../../theme";
import { he } from "../../i18n/he";
import { CellCard } from "./CellCard";

interface Props {
  shelf: StoreMapShelf;
  /** ספרים מסוננים לכל תא (לפי הסינון הגלובלי במסך). */
  cellBooks: Map<string, StoreMapBook[]>;
  /** `location_id` של עותקים שסומנו כחוסר (אופטימי). */
  shortagedIds: Set<string>;
  onBookPress: (book: StoreMapBook) => void;
  onBookLongPress: (book: StoreMapBook) => void;
}

export function ShelfRow({
  shelf,
  cellBooks,
  shortagedIds,
  onBookPress,
  onBookLongPress,
}: Props): JSX.Element {
  const heading = shelf.label ?? `${he.unit.shelfLabel} ${shelf.shelf_number}`;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{heading}</Text>
      <FlatList
        data={shelf.cells}
        keyExtractor={(c) => c.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) => (
          <CellCard
            cell={item}
            books={cellBooks.get(item.id) ?? item.books}
            shortagedIds={shortagedIds}
            onBookPress={onBookPress}
            onBookLongPress={onBookLongPress}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: theme.spacing.sm,
  },
  heading: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  list: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  gap: { width: theme.spacing.sm },
});
