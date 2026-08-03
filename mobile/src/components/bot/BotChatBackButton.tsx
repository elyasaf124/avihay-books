import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { he } from "../../i18n/he";
import { theme } from "../../theme";

/** קיצור דרך ממסכי ניהול הבוט חזרה לרשימת הצ'אט. */
export function BotChatBackButton(): JSX.Element {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push("/chat")}
      hitSlop={8}
      accessibilityLabel={he.bot.backToChat}
      style={styles.btn}
    >
      <Ionicons name="chatbubbles-outline" size={24} color={theme.colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginHorizontal: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
});
