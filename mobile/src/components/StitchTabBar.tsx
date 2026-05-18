import type { BottomTabBarProps, BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import type { Route } from "@react-navigation/native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

/**
 * נכס `dir` ל־`View` תקף ב־`React Native Web` בלבד; טיפוסי `@types/react-native`
 * לא חושפים אותו, ולכן ההעברה נעשית דרך אובייקט מוטה־טיפוס שמועבר ב־`spread`.
 * `dir="ltr"` שומר על סדר טאבים `LTR` גם כשהמסמך כולו `dir="rtl"` בדפדפן.
 */
const webDirLtr: Record<string, unknown> =
  Platform.OS === "web" ? { dir: "ltr" } : {};

/** סרגל טאבים בסגנון ייצוג `Stitch`: גלולה כחולה בפריט הפעיל, סדר ויזואלי `LTR` כמו תגית `dir=ltr` ב־HTML. */
export function StitchTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps): JSX.Element {
  const padBottom = Math.max(insets.bottom, 10);

  const visibleRoutes = state.routes.filter(
    (route) => !isTabHidden(route.name, descriptors[route.key]?.options),
  );

  return (
    <View style={[styles.shell, { paddingBottom: padBottom, paddingTop: 10 }]}>
      <View style={styles.track} accessibilityRole="tablist" {...webDirLtr}>
        {visibleRoutes.map((route) => {
          const index = state.routes.findIndex((r) => r.key === route.key);
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const activeColor = theme.colors.onPrimaryContainer;
          const inactiveColor = theme.colors.onSurfaceVariant;
          const color = focused ? activeColor : inactiveColor;

          const label = resolveTabLabel(route, options);

          const onPress = (): void => {
            const e = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !e.defaultPrevented) {
              (navigation.navigate as (scene: string) => void)(route.name);
            }
          };

          const onLongPress = (): void => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          const tabKey = route.key;

          const badge = options.tabBarBadge;
          const badgeText = formatBadge(badge);

          return (
            <Pressable
              key={tabKey}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.cell,
                focused && styles.cellActive,
                pressed && styles.cellPressed,
              ]}
            >
              <View style={styles.iconWrap}>
                {options.tabBarIcon?.({ focused, color, size: focused ? 24 : 22 })}
                {badgeText ? (
                  <View style={styles.badge} accessibilityLabel={`${label}: ${badgeText}`}>
                    <Text style={styles.badgeText} numberOfLines={1}>
                      {badgeText}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * מסכים מוסתרים: `expo-router` לא תמיד מעביר את `href: null` אל `options` בסרגל מותאם.
 * מסלול `unit` הוא מסך מלא שמגיעים אליו רק ממפת החנות — לא כטאב בסרגל התחתון.
 */
function isTabHidden(routeName: string, options?: BottomTabNavigationOptions): boolean {
  if (routeName === "unit") return true;
  return (options as { href?: null } | undefined)?.href === null;
}

function resolveTabLabel(route: Route<string>, options: BottomTabNavigationOptions): string {
  const lb = options.tabBarLabel;
  if (typeof lb === "string") return lb;
  if (typeof options.title === "string") return options.title;
  return route.name;
}

/** המרת `tabBarBadge` (מספר/מחרוזת/`undefined`) למחרוזת קצרה לתצוגה (`99+`). */
function formatBadge(badge: BottomTabNavigationOptions["tabBarBadge"]): string | null {
  if (badge === undefined || badge === null) return null;
  if (typeof badge === "number") {
    if (badge <= 0) return null;
    return badge > 99 ? "99+" : String(badge);
  }
  const text = String(badge).trim();
  return text.length === 0 ? null : text;
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.outlineVariant,
    shadowColor: "#213145",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 10,
    elevation: 14,
  },
  /** פריסה קבועה שמקרבת את הסדר החזותי לשמאל־ימין כמו בתגית `dir=ltr` בייצוג. */
  track: {
    flexDirection: "row",
    direction: "ltr",
    justifyContent: "space-between",
    alignItems: "stretch",
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.xs,
    minHeight: 48,
  },
  cell: {
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.full,
    minWidth: 52,
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -6,
    /** ה־`badge` יושב על הקצה השמאלי־עליון של האייקון גם ב־`RTL`,
     * כי `dir=ltr` נקבע ב־`track`. */
    left: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: theme.colors.error,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: theme.colors.surfaceContainerLowest,
  },
  badgeText: {
    color: theme.colors.onError,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
    textAlign: "center",
  },
  cellActive: {
    backgroundColor: theme.colors.primaryContainer,
  },
  cellPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  label: {
    fontWeight: "600",
    fontSize: 11,
    textAlign: "center",
  },
});
