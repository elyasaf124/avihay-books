import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBotConfig } from "../../api/botConfig";
import { he } from "../../i18n/he";
import { theme } from "../../theme";
import { CenterState } from "./BotFormControls";

/** רשימת הענפים המותאמים שנבנו על-ידי העובד; פתיחה מובילה לעורך הזרימה. */
export function CustomFlowsList(): JSX.Element {
  const router = useRouter();
  const configQuery = useBotConfig();
  const customItems = (configQuery.data?.menu_items ?? []).filter(
    (m) => m.type === "custom" && m.flow_id,
  );

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <CenterState
        loading={configQuery.isLoading}
        error={configQuery.isError}
        onRetry={() => void configQuery.refetch()}
      >
        {customItems.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="git-branch-outline" size={40} color={theme.colors.onSurfaceVariant} />
            <Text style={styles.emptyText}>{he.bot.flowsEmpty}</Text>
            <Text style={styles.emptyHint}>{he.bot.flowsEmptyHint}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {customItems.map((item) => {
              const flow = configQuery.data?.custom_flows[item.flow_id!];
              const stepCount = flow ? Object.keys(flow.nodes).length : 0;
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() => router.push(`/bot/flow/${item.flow_id}` as never)}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.rowMeta}>{`${flow?.name ?? ""} · ${stepCount}`}</Text>
                  </View>
                  <Ionicons name="chevron-back" size={20} color={theme.colors.onSurfaceVariant} />
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </CenterState>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.md, gap: theme.spacing.sm },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, gap: theme.spacing.sm },
  emptyText: { ...theme.typography.bodyLg, color: theme.colors.onSurface, textAlign: "center" },
  emptyHint: { ...theme.typography.bodyMd, color: theme.colors.onSurfaceVariant, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.md,
  },
  rowPressed: { opacity: 0.75 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...theme.typography.bodyLg, color: theme.colors.onSurface, textAlign: "right" },
  rowMeta: { ...theme.typography.caption, color: theme.colors.onSurfaceVariant, textAlign: "right" },
});
