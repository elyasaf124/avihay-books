import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SideLabel } from "@avihay-books/shared";
import { theme } from "../../theme";

interface Option {
  id: string;
  label: SideLabel;
}

interface Props {
  options: Option[];
  activeId: string;
  onChange: (id: string) => void;
}

export function SideToggle({ options, activeId, onChange }: Props): JSX.Element {
  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const active = opt.id === activeId;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={[styles.pill, active && styles.pillActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: theme.colors.surfaceContainer,
    borderRadius: theme.radius.full,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    alignSelf: "stretch",
  },
  pill: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: {
    backgroundColor: theme.colors.primaryContainer,
  },
  label: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  labelActive: {
    color: theme.colors.onPrimaryContainer,
  },
});
