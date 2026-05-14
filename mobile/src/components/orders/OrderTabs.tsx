import { Pressable, StyleSheet, Text, View } from "react-native";
import type { OrderType } from "@avihay-books/shared";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

interface Props {
  active: OrderType;
  counts: Record<OrderType, number>;
  onChange: (type: OrderType) => void;
}

const ORDER: OrderType[] = ["inventory", "customer", "whatsapp"];

/**
 * סרגל לשוניות אופקי (`segmented control`) למסך ההזמנות.
 * מציג את המונה לכל לשונית.
 */
export function OrderTabs({ active, counts, onChange }: Props): JSX.Element {
  return (
    <View style={styles.wrap}>
      {ORDER.map((t) => {
        const isActive = t === active;
        const label = he.orders.tabs[t];
        const count = counts[t];
        return (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(t)}
            style={({ pressed }) => [
              styles.cell,
              isActive && styles.cellActive,
              pressed && styles.cellPressed,
            ]}
          >
            <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
              {label}
            </Text>
            <View style={[styles.count, isActive && styles.countActive]}>
              <Text style={[styles.countText, isActive && styles.countTextActive]}>
                {count}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.full,
    padding: 4,
    gap: 4,
  },
  cell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.full,
  },
  cellActive: { backgroundColor: theme.colors.primary },
  cellPressed: { opacity: 0.85 },
  label: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    fontSize: 12,
    letterSpacing: 0,
  },
  labelActive: { color: theme.colors.onPrimary },
  count: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
  },
  countActive: { backgroundColor: theme.colors.onPrimary },
  countText: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
    fontSize: 11,
  },
  countTextActive: { color: theme.colors.primary },
});
