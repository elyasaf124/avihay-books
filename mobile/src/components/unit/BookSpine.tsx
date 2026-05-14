import { Pressable, StyleSheet, Text, View } from "react-native";
import type { StoreMapBook } from "@avihay-books/shared";
import { theme } from "../../theme";

interface Props {
  book: StoreMapBook;
  /** הספר סומן כחוסר אופטימי וצריך להופיע מעומעם. */
  dimmed?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

/**
 * "שדרת ספר" — מלבן צבעוני בצבע הספק, אנכי, עם הטיית הכותרת.
 * הצבע בא ישירות מטבלת `suppliers.color_hex` של אותו ספר.
 */
export function BookSpine({ book, dimmed, onPress, onLongPress }: Props): JSX.Element {
  const accent = book.supplier_color;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.spine,
        { backgroundColor: accent },
        dimmed && styles.dimmed,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={book.title}
    >
      <View style={styles.titleSlot}>
        <Text
          style={styles.title}
          numberOfLines={3}
          ellipsizeMode="tail"
          allowFontScaling={false}
        >
          {book.title}
        </Text>
      </View>
      {book.is_new ? (
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>חדש</Text>
        </View>
      ) : null}
      {book.quantity_in_cell > 1 ? (
        <View style={styles.qtyDot}>
          <Text style={styles.qtyDotText}>{book.quantity_in_cell}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  spine: {
    width: 28,
    height: 90,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  titleSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  /** מוטה 90° כדי לדמות שדרת ספר אנכית. */
  title: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    transform: [{ rotate: "-90deg" }],
    width: 84,
    fontFamily: theme.fontFamily.semibold,
  },
  newBadge: {
    position: "absolute",
    top: 4,
    start: 2,
    backgroundColor: theme.colors.secondaryFixed,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: theme.radius.full,
  },
  newBadgeText: {
    color: theme.colors.onSecondaryFixed,
    fontSize: 8,
    fontWeight: "700",
  },
  qtyDot: {
    position: "absolute",
    bottom: 4,
    end: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: theme.colors.surfaceContainerLowest,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyDotText: {
    color: theme.colors.onSurface,
    fontSize: 9,
    fontWeight: "700",
  },
  dimmed: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
