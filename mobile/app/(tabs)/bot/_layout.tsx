import { Stack } from "expo-router";
import { theme } from "../../../src/theme";
import { he } from "../../../src/i18n/he";

export default function BotLayout(): JSX.Element {
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
        headerBackTitle: he.bot.hubTitle,
      }}
    >
      <Stack.Screen name="index" options={{ title: he.bot.hubTitle }} />
      <Stack.Screen name="store-info" options={{ title: he.bot.storeInfoTitle }} />
      <Stack.Screen name="menu" options={{ title: he.bot.menuTitle }} />
      <Stack.Screen name="texts" options={{ title: he.bot.textsTitle }} />
      <Stack.Screen name="flows" options={{ title: he.bot.flowsTitle }} />
      <Stack.Screen name="flow/[flowId]" options={{ title: he.bot.flowEditorTitle }} />
    </Stack>
  );
}
