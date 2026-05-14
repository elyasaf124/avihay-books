import { StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { he } from "../i18n/he";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function SearchBar({ value, onChange }: Props): JSX.Element {
  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={he.home.search}
        placeholderTextColor={theme.colors.onSurfaceVariant}
        textAlign="right"
      />
      <Ionicons name="search" size={20} color={theme.colors.onSurfaceVariant} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  input: {
    flex: 1,
    color: theme.colors.onSurface,
    fontSize: theme.typography.bodyMd.fontSize,
    paddingVertical: 4,
    writingDirection: "rtl",
  },
});
