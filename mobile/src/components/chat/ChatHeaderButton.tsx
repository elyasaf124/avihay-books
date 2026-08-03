import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useChatUnreadCount } from "../../api/chat";
import { he } from "../../i18n/he";
import { theme } from "../../theme";

/** כפתור צ'אט בכותרת — מעבר לרשימת שיחות (מחוץ לסרגל הטאבים). */
export function ChatHeaderButton(): JSX.Element {
  const router = useRouter();
  const unread = useChatUnreadCount({ pollMs: 30_000 }).data ?? 0;

  return (
    <Pressable
      onPress={() => router.push("/chat")}
      hitSlop={8}
      accessibilityLabel={he.tabs.chat}
      style={styles.btn}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="chatbubbles-outline" size={24} color={theme.colors.primary} />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginHorizontal: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  iconWrap: { position: "relative" },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.colors.error,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: theme.colors.surface,
  },
  badgeText: {
    color: theme.colors.onError,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
  },
});
