import { Stack } from "expo-router";
import { theme } from "../../../src/theme";

export default function UnitStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.primary,
        headerTitleStyle: {
          fontWeight: "700",
          color: theme.colors.primary,
          fontFamily: theme.fontFamily.bold,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    />
  );
}
