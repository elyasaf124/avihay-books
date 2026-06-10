import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

interface HubCard {
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
}

const CARDS: HubCard[] = [
  { route: "/bot/store-info", icon: "storefront-outline", title: he.bot.cardStoreInfoTitle, desc: he.bot.cardStoreInfoDesc },
  { route: "/bot/menu", icon: "list-outline", title: he.bot.cardMenuTitle, desc: he.bot.cardMenuDesc },
  { route: "/bot/texts", icon: "chatbox-ellipses-outline", title: he.bot.cardTextsTitle, desc: he.bot.cardTextsDesc },
  { route: "/bot/flows", icon: "git-branch-outline", title: he.bot.cardFlowsTitle, desc: he.bot.cardFlowsDesc },
];

export function BotSettingsScreen(): JSX.Element {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>{he.bot.hubSubtitle}</Text>
        {CARDS.map((card) => (
          <Pressable
            key={card.route}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => router.push(card.route as never)}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={card.icon} size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDesc}>{card.desc}</Text>
            </View>
            <Ionicons name="chevron-back" size={20} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.md, gap: theme.spacing.sm },
  subtitle: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "right",
    marginBottom: theme.spacing.xs,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.md,
  },
  cardPressed: { opacity: 0.75 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primaryContainer + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { ...theme.typography.headlineSm, color: theme.colors.onSurface, textAlign: "right" },
  cardDesc: { ...theme.typography.bodyMd, fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: "right" },
});
