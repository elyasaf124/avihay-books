import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Pressable, ScrollView } from "react-native-gesture-handler";
import type { ScrollView as GHScrollView } from "react-native-gesture-handler";
import type { StoreMapBook } from "@avihay-books/shared";
import { theme } from "../../theme";
import { countSpineMount, countSpineRender } from "../../utils/spineRenderCounter";

interface Props {
  book: StoreMapBook;
  /** הספר סומן כחוסר אופטימי וצריך להופיע מעומעם. */
  dimmed?: boolean;
  /**
   * מקבלים את הספר עצמו ולא closure — כך ההורה מעביר פונקציה יציבה אחת
   * לכל השדרות, ו־`React.memo` באמת חוסם רינדור מחדש.
   */
  onPress: (book: StoreMapBook) => void;
  onLongPress: (book: StoreMapBook) => void;
}

const SCROLL_OVERFLOW_THRESHOLD = 2;
/** מידות פנימיות של השדרה לפי הסגנון — קבועות, ולכן אין צורך למדוד ב־`onLayout`. */
const SPINE_INNER_W = 24; // width 28 − paddingHorizontal*2
const SPINE_INNER_H = 128; // height 140 − paddingVertical*2

/**
 * כיוון הקריאה לפי התו החזק הראשון.
 * עברית/ערבית → RTL; לטינית → LTR; ברירת מחדל RTL (אפליקציה בעברית).
 */
function titleStartsRtl(title: string): boolean {
  for (const ch of title) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x0590 && code <= 0x05ff) || (code >= 0x0600 && code <= 0x06ff)) {
      return true;
    }
    if (
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      (code >= 0xc0 && code <= 0x024f)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * כותרת סטטית — `View` + `Text` מסובבים, בלי `ScrollView` נייטיבי
 * ובלי `onLayout`/`onTextLayout`/`requestAnimationFrame`.
 *
 * `numberOfLines={1}` חותך את *סוף* המחרוזת הלוגית, כך שתחילת הקריאה נשמרת
 * גם בעברית וגם בלטינית — בדיוק המצב שאליו ה־`ScrollView` נגלל במנוחה.
 */
function StaticSpineTitle({ title }: { title: string }): JSX.Element {
  return (
    <View style={styles.titleTrackStatic}>
      <Text style={styles.title} numberOfLines={1} allowFontScaling={false}>
        {title}
      </Text>
    </View>
  );
}

/**
 * כותרת גוללת — נטענת רק אחרי מגע ראשון בשדרה.
 * ScrollView אופקי מסובב -90°: שמאל→תחתית, ימין→ראש השדרה.
 * בטקסט RTL תחילת השם בימין — לכן גוללים ל־scrollToEnd כדי שתחילת הקריאה תהיה למעלה.
 * `direction: 'ltr'` שומר על קואורדינטות גלילה צפויות תחת RTL של האפליקציה.
 */
function ScrollableSpineTitle({
  title,
  onDragStart,
}: {
  title: string;
  onDragStart: () => void;
}): JSX.Element {
  const titleScrollRef = useRef<GHScrollView>(null);
  const [textLineWidth, setTextLineWidth] = useState(0);
  const isRtlTitle = titleStartsRtl(title);
  const scrollEnabled = textLineWidth > SPINE_INNER_H + SCROLL_OVERFLOW_THRESHOLD;

  const scrollTitleToStart = useCallback(() => {
    if (isRtlTitle) {
      titleScrollRef.current?.scrollToEnd({ animated: false });
    } else {
      titleScrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    }
  }, [isRtlTitle]);

  return (
    <ScrollView
      ref={titleScrollRef}
      horizontal
      style={styles.titleTrackScroll}
      contentContainerStyle={[
        styles.titleTrackContent,
        !scrollEnabled && styles.titleTrackContentFill,
      ]}
      onContentSizeChange={scrollTitleToStart}
      onLayout={scrollTitleToStart}
      scrollEnabled={scrollEnabled}
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      directionalLockEnabled
      onScrollBeginDrag={onDragStart}
    >
      <Text
        style={styles.title}
        numberOfLines={1}
        allowFontScaling={false}
        onTextLayout={(e) => {
          const w = e.nativeEvent.lines[0]?.width ?? 0;
          if (w > 0) {
            setTextLineWidth((prev) => (prev === w ? prev : w));
            // אחרי מדידת רוחב הטקסט — native לפעמים כבר במיקום הלא נכון.
            if (Platform.OS !== "web") {
              requestAnimationFrame(scrollTitleToStart);
            }
          }
        }}
      >
        {title}
      </Text>
    </ScrollView>
  );
}

/**
 * "שדרת ספר" — מלבן צבעוני בצבע הספק, אנכי, עם הטיית הכותרת.
 * הצבע בא ישירות מטבלת `suppliers.color_hex` של אותו ספר.
 *
 * ארון גדול מרנדר מאות שדרות, ולכן ברירת המחדל היא הגרסה הסטטית.
 * המגע הראשון בשדרה משדרג אותה לגרסה הגוללת (כדי שכותרת ארוכה תישאר קריאה
 * לאורך השדרה), והשדרוג נעשה אחרי שהלחיצה כבר נמסרה — כך שסימון חוסר לא נפגע.
 */
function BookSpineImpl({ book, dimmed, onPress, onLongPress }: Props): JSX.Element {
  countSpineRender();
  useEffect(countSpineMount, []);

  const accent = book.supplier_color;
  const suppressNextPressRef = useRef(false);
  const [scrollableTitle, setScrollableTitle] = useState(false);

  const handlePress = useCallback(() => {
    if (suppressNextPressRef.current) {
      suppressNextPressRef.current = false;
      return;
    }
    setScrollableTitle(true);
    onPress(book);
  }, [book, onPress]);

  const handleLongPress = useCallback(() => {
    setScrollableTitle(true);
    onLongPress(book);
  }, [book, onLongPress]);

  const handleScrollBeginDrag = useCallback(() => {
    suppressNextPressRef.current = true;
  }, []);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
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
        {scrollableTitle ? (
          <ScrollableSpineTitle title={book.title} onDragStart={handleScrollBeginDrag} />
        ) : (
          <StaticSpineTitle title={book.title} />
        )}
      </View>
      {book.is_new ? (
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>חדש</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export const BookSpine = memo(BookSpineImpl);

const styles = StyleSheet.create({
  spine: {
    width: 28,
    height: 140,
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
   * שתי הגרסאות חולקות אותה גאומטריה: תיבה של 128×24 שמסובבת -90°,
   * כך שרוחב הטקסט (שורה אחת) לא נחתך על ידי רוחב השדרה (28px).
   */
  titleTrackStatic: {
    width: SPINE_INNER_H,
    height: SPINE_INNER_W,
    transform: [{ rotate: "-90deg" }],
    direction: "ltr",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  titleTrackScroll: {
    width: SPINE_INNER_H,
    height: SPINE_INNER_W,
    transform: [{ rotate: "-90deg" }],
    direction: "ltr",
  },
  titleTrackContent: {
    alignItems: "center",
    justifyContent: "center",
    direction: "ltr",
  },
  titleTrackContentFill: {
    minWidth: SPINE_INNER_H,
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
  dimmed: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
