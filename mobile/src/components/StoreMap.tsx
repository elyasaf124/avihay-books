import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import type { StoreMap as StoreMapData, StoreMapUnit } from "@avihay-books/shared";
import { theme } from "../theme";
import { he } from "../i18n/he";

/**
 * `dir="ltr"` כנכס `HTML` ב־`React Native Web` שומר על גיאוגרפיית החנות (ימין/שמאל
 * פיזיים) גם כשהמסמך כולו `dir="rtl"`. בנייטיב הסגנון `direction: "ltr"` בשם הסגנון
 * `ltrGeo` כבר מטפל באותו רעיון, ולכן הספרד הזה לא־עוקץ שם.
 */
const webDirLtr: Record<string, unknown> =
  Platform.OS === "web" ? { dir: "ltr" } : {};

interface Props {
  data: StoreMapData;
  onUnitPress: (unit: StoreMapUnit) => void;
}

const VB_W = 360;
const VB_H = 396;

interface Rect2 {
  x: number;
  y: number;
  w: number;
  h: number;
}

const layout: Record<"front" | "left" | "right" | "island" | "display", Rect2> = {
  front: { x: 16, y: 12, w: VB_W - 32, h: 78 },
  left: { x: 16, y: 98, w: 72, h: VB_H - 110 },
  right: { x: VB_W - 88, y: 98, w: 72, h: VB_H - 110 },
  /** משטח תצוגה — מעל האי */
  display: { x: 104, y: 164, w: VB_W - 208, h: 30 },
  island: { x: 104, y: 198, w: VB_W - 208, h: 128 },
};

function bookCount(u: StoreMapUnit): number {
  let count = 0;
  for (const sh of u.shelves) for (const c of sh.cells) count += c.books.length;
  for (const sd of u.sides) for (const sh of sd.shelves) for (const c of sh.cells) count += c.books.length;
  return count;
}

function newBookCount(u: StoreMapUnit): number {
  let n = 0;
  for (const sh of u.shelves)
    for (const c of sh.cells) for (const b of c.books) if (b.is_new) n += 1;
  for (const sd of u.sides)
    for (const sh of sd.shelves)
      for (const c of sh.cells)
        for (const b of c.books)
          if (b.is_new) n += 1;
  return n;
}

export function StoreMap({ data, onUnitPress }: Props): JSX.Element {
  const byPos = new Map<string, StoreMapUnit>(data.units.map((u) => [u.store_position, u]));
  const front = byPos.get("front");
  const left = byPos.get("left");
  const right = byPos.get("right");
  const island = byPos.get("island");
  const display = byPos.get("display");

  return (
    <View style={styles.ltrGeo} {...webDirLtr}>
      <View style={styles.wrap}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Defs>
          <LinearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.colors.primaryContainer} stopOpacity="1" />
            <Stop offset="1" stopColor={theme.colors.primary} stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="islandWood" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={theme.colors.tertiaryContainer} />
            <Stop offset="1" stopColor={theme.colors.tertiary} />
          </LinearGradient>
          <LinearGradient id="displayGold" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#fff8e5" />
            <Stop offset="0.5" stopColor="#e8c96a" />
            <Stop offset="1" stopColor="#c9a44a" />
          </LinearGradient>
        </Defs>

        <Rect
          x={4}
          y={4}
          width={VB_W - 8}
          height={VB_H - 8}
          rx={8}
          fill={theme.colors.surfaceContainerLow}
          stroke={theme.colors.outlineVariant}
        />

        {[
          { pos: "front" as const, unit: front, fill: "url(#wood)" },
          { pos: "left" as const, unit: left, fill: "url(#wood)" },
          { pos: "right" as const, unit: right, fill: "url(#wood)" },
        ].map(({ pos, unit, fill }) => {
          const r = layout[pos];
          return (
            <Rect
              key={pos}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx={6}
              fill={unit ? fill : theme.colors.surfaceContainer}
              stroke={theme.colors.outline}
              strokeWidth={1.5}
            />
          );
        })}

        {island && (
          <>
            <Rect
              x={layout.island.x}
              y={layout.island.y}
              width={layout.island.w}
              height={layout.island.h}
              rx={6}
              fill="url(#islandWood)"
              stroke={theme.colors.outline}
              strokeWidth={1.5}
            />
            <Rect
              x={layout.island.x + layout.island.w / 2 - 0.5}
              y={layout.island.y + 8}
              width={1}
              height={layout.island.h - 16}
              fill={theme.colors.secondaryFixed}
            />
            <SvgText
              x={layout.island.x + (layout.island.w * 3) / 4}
              y={layout.island.y + layout.island.h / 2 + 4}
              fontSize="14"
              fontWeight="700"
              fill={theme.colors.secondaryFixed}
              textAnchor="middle"
            >
              {he.home.sideA}
            </SvgText>
            <SvgText
              x={layout.island.x + layout.island.w / 4}
              y={layout.island.y + layout.island.h / 2 + 4}
              fontSize="14"
              fontWeight="700"
              fill={theme.colors.secondaryFixed}
              textAnchor="middle"
            >
              {he.home.sideB}
            </SvgText>
          </>
        )}

        {display && (
          <Rect
            x={layout.display.x}
            y={layout.display.y}
            width={layout.display.w}
            height={layout.display.h}
            rx={5}
            fill="url(#displayGold)"
            stroke={theme.colors.outline}
            strokeWidth={1.5}
          />
        )}
      </Svg>

      {(["front", "left", "right", "display", "island"] as const).map((pos) => {
        const unit = byPos.get(pos);
        if (!unit) return null;
        const r = layout[pos];
        const showNewHint = pos === "display" && newBookCount(unit) > 0;
        return (
          <Pressable
            key={pos}
            onPress={() => onUnitPress(unit)}
            style={({ pressed }) => [
              styles.overlay,
              {
                left: `${(r.x / VB_W) * 100}%`,
                top: `${(r.y / VB_H) * 100}%`,
                width: `${(r.w / VB_W) * 100}%`,
                height: `${(r.h / VB_H) * 100}%`,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={styles.labelBox} pointerEvents="none">
              <Text style={styles.unitName}>{unit.name}</Text>
              <Text style={styles.unitMeta}>
                {bookCount(unit)} ספרים
                {showNewHint ? ` · ${he.home.displayHint}` : ""}
              </Text>
            </View>
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** תוכנית קומה לא מתהפכת עם RTL גלובלי — שמאל/ימין גיאוגרפיים נשארים עקביים. */
  ltrGeo: {
    direction: "ltr",
    alignSelf: "stretch",
  },
  wrap: {
    aspectRatio: VB_W / VB_H,
    width: "100%",
    position: "relative",
  },
  overlay: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  labelBox: {
    backgroundColor: `${theme.colors.surfaceContainerLowest}E6`,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  unitName: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  unitMeta: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
    textAlign: "center",
  },
});
