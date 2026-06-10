import { Stack } from "expo-router";
import { wa } from "../../../src/components/chat/waTheme";

export default function ChatStackLayout(): JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: wa.header },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "700",
          color: "#FFFFFF",
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: wa.wallpaper },
      }}
    />
  );
}
