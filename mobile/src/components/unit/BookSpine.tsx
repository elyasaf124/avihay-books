import { useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pressable, ScrollView } from "react-native-gesture-handler";
import type { StoreMapBook } from "@avihay-books/shared";
import { theme } from "../../theme";

interface Props {
  book: StoreMapBook;
  /** הספר סומן כחוסר אופטימי וצריך להופיע מעומעם. */
  dimmed?: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

const SCROLL_OVERFLOW_THRESHOLD = 2;

/**
 * "שדרת ספר" — מלבן צבעוני בצבע הספק, אנכי, עם הטיית הכותרת.
 * הצבע בא ישירות מטבלת `suppliers.color_hex` של אותו ספר.
 */
export function BookSpine({ book, dimmed, onPress, onLongPress }: Props): JSX.Element {
  const accent = book.supplier_color;
  const suppressNextPressRef = useRef(false);
  const [textLineWidth, setTextLineWidth] = useState(0);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  const scrollEnabled = textLineWidth > viewport.h + SCROLL_OVERFLOW_THRESHOLD;

  const handlePress = useCallback(() => {
    if (suppressNextPressRef.current) {
      suppressNextPressRef.current = false;
      return;
    }
    onPress();
  }, [onPress]);

  const handleScrollBeginDrag = useCallback(() => {
    suppressNextPressRef.current = true;
  }, []);

  return (
    <Pressable
      onPress={handlePress}
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
      <View
        style={styles.titleSlot}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setViewport({ w: width, h: height });
        }}
      >
        {viewport.w > 0 && viewport.h > 0 ? (
          <ScrollView
            horizontal
            style={[
              styles.titleScroll,
              { width: viewport.h, height: viewport.w },
            ]}
            contentContainerStyle={[
              styles.titleScrollContent,
              !scrollEnabled && { minWidth: viewport.h },
            ]}
            scrollEnabled={scrollEnabled}
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            directionalLockEnabled
            onScrollBeginDrag={handleScrollBeginDrag}
          >
            <Text
              style={styles.title}
              numberOfLines={1}
              allowFontScaling={false}
              onTextLayout={(e) => {
                const w = e.nativeEvent.lines[0]?.width ?? 0;
                if (w > 0) {
                  setTextLineWidth(w);
                }
              }}
            >
              {book.title}
            </Text>
          </ScrollView>
        ) : null}
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
    width: "100%",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * ScrollView אופקי שמסובב -90° — כך רוחב הטקסט (שורה אחת) לא נחתך
   * על ידי רוחב השדרה (28px), והגלילה האופקית = גלילה לאורך השדרה.
   */
  titleScroll: {
    transform: [{ rotate: "-90deg" }],
  },
  titleScrollContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
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
