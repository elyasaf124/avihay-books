import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BotConfigData, CustomFlow, MenuItemConfig } from "@avihay-books/shared";
import { useBotConfig, useSaveBotConfig } from "../../api/botConfig";
import { ConfirmDialog } from "../ConfirmDialog";
import { he } from "../../i18n/he";
import { theme } from "../../theme";
import { CenterState, genId, SaveBar } from "./BotFormControls";
import { sanitizeAllCustomFlows } from "./flowSanitize";

const MAX_ITEMS = 10;

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? "");
}

function reindex(items: MenuItemConfig[]): MenuItemConfig[] {
  return items.map((it, i) => ({ ...it, order: i }));
}

/** מנקה ומחבר זרימות לפני שליחה לשרת — מונע שגיאות 400 על צעדים לא מקושרים. */
function withSanitizedFlows(config: BotConfigData): BotConfigData {
  return { ...config, custom_flows: sanitizeAllCustomFlows(config.custom_flows) };
}

export function MenuItemsManager(): JSX.Element {
  const router = useRouter();
  const configQuery = useBotConfig();
  const saveMutation = useSaveBotConfig();
  const [draft, setDraft] = useState<BotConfigData | null>(null);
  const [editTarget, setEditTarget] = useState<MenuItemConfig | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MenuItemConfig | null>(null);

  useEffect(() => {
    if (configQuery.data && !draft) {
      const sorted = [...configQuery.data.menu_items].sort((a, b) => a.order - b.order);
      setDraft({ ...configQuery.data, menu_items: reindex(sorted) });
    }
  }, [configQuery.data, draft]);

  const items = draft?.menu_items ?? [];

  const updateItems = (next: MenuItemConfig[]): void =>
    setDraft((prev) => (prev ? { ...prev, menu_items: reindex(next) } : prev));

  const toggle = (id: string, value: boolean): void => {
    const next = items.map((it) => (it.id === id ? { ...it, enabled: value } : it));
    if (!next.some((it) => it.enabled)) {
      Alert.alert(he.bot.needOneEnabled);
      return;
    }
    updateItems(next);
  };

  const move = (index: number, dir: -1 | 1): void => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    updateItems(next);
  };

  const openEdit = (item: MenuItemConfig): void => {
    setEditTarget(item);
    setEditTitle(item.title);
    setEditDesc(item.description);
  };

  const applyEdit = (): void => {
    if (!editTarget) return;
    updateItems(
      items.map((it) =>
        it.id === editTarget.id ? { ...it, title: editTitle.trim(), description: editDesc.trim() } : it,
      ),
    );
    setEditTarget(null);
  };

  const persist = async (next: BotConfigData): Promise<BotConfigData | null> => {
    try {
      const saved = await saveMutation.mutateAsync(withSanitizedFlows(next));
      setDraft({ ...saved, menu_items: reindex([...saved.menu_items].sort((a, b) => a.order - b.order)) });
      return saved;
    } catch {
      Alert.alert(he.generic.errorTitle, he.bot.saveFailed);
      return null;
    }
  };

  const addCustom = async (): Promise<void> => {
    if (!draft) return;
    if (items.length >= MAX_ITEMS) {
      Alert.alert(he.bot.maxItemsReached);
      return;
    }
    const flowId = genId("flow");
    const nodeId = genId("node");
    const flow: CustomFlow = {
      name: he.bot.newFlowName,
      entry_node_id: nodeId,
      nodes: { [nodeId]: { id: nodeId, type: "text", text: "", after: "end_loop" } },
    };
    const item: MenuItemConfig = {
      id: genId("custom"),
      title: he.bot.newFlowTitle,
      description: "",
      type: "custom",
      flow_id: flowId,
      enabled: true,
      order: items.length,
    };
    const next: BotConfigData = {
      ...draft,
      menu_items: reindex([...items, item]),
      custom_flows: { ...draft.custom_flows, [flowId]: flow },
    };
    const saved = await persist(next);
    if (saved) router.push(`/bot/flow/${flowId}` as never);
  };

  const confirmDelete = async (): Promise<void> => {
    if (!draft || !deleteTarget) return;
    const flows = { ...draft.custom_flows };
    if (deleteTarget.flow_id) delete flows[deleteTarget.flow_id];
    const next: BotConfigData = {
      ...draft,
      menu_items: reindex(items.filter((it) => it.id !== deleteTarget.id)),
      custom_flows: flows,
    };
    setDeleteTarget(null);
    await persist(next);
  };

  const onSave = async (): Promise<void> => {
    if (!draft) return;
    const saved = await persist(draft);
    if (saved) Alert.alert(he.bot.saved);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <CenterState
        loading={configQuery.isLoading || !draft}
        error={configQuery.isError}
        onRetry={() => void configQuery.refetch()}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>{he.bot.menuHint}</Text>
          {items.map((item, index) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.reorder}>
                <Pressable onPress={() => move(index, -1)} disabled={index === 0} style={styles.arrowBtn}>
                  <Ionicons name="chevron-up" size={18} color={index === 0 ? theme.colors.outlineVariant : theme.colors.primary} />
                </Pressable>
                <Pressable onPress={() => move(index, 1)} disabled={index === items.length - 1} style={styles.arrowBtn}>
                  <Ionicons name="chevron-down" size={18} color={index === items.length - 1 ? theme.colors.outlineVariant : theme.colors.primary} />
                </Pressable>
              </View>

              <Pressable style={styles.rowMain} onPress={() => openEdit(item)}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowBadge}>
                  {item.type === "custom" ? he.bot.menuItemCustom : he.bot.menuItemBuiltin}
                </Text>
              </Pressable>

              <View style={styles.rowActions}>
                {item.type === "custom" ? (
                  <>
                    <Pressable
                      onPress={() => item.flow_id && router.push(`/bot/flow/${item.flow_id}` as never)}
                      style={styles.actionBtn}
                      accessibilityLabel={he.bot.editFlow}
                    >
                      <Ionicons name="git-branch-outline" size={20} color={theme.colors.primary} />
                    </Pressable>
                    <Pressable
                      onPress={() => setDeleteTarget(item)}
                      style={styles.actionBtn}
                      accessibilityLabel={he.generic.delete}
                    >
                      <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                    </Pressable>
                  </>
                ) : null}
                <Switch
                  value={item.enabled}
                  onValueChange={(v) => toggle(item.id, v)}
                  trackColor={{ true: theme.colors.primary }}
                />
              </View>
            </View>
          ))}

          <Pressable
            style={[styles.addBtn, items.length >= MAX_ITEMS && styles.addBtnDisabled]}
            onPress={() => void addCustom()}
            disabled={items.length >= MAX_ITEMS || saveMutation.isPending}
          >
            <Ionicons name="add-circle-outline" size={20} color={theme.colors.onPrimary} />
            <Text style={styles.addBtnText}>{he.bot.addCustomItem}</Text>
          </Pressable>
        </ScrollView>

        <SaveBar onSave={() => void onSave()} saving={saveMutation.isPending} />
      </CenterState>

      <Modal visible={editTarget != null} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditTarget(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{he.bot.editItem}</Text>
            <Text style={styles.modalLabel}>{he.bot.fieldItemTitle}</Text>
            <TextInput style={styles.modalInput} value={editTitle} onChangeText={setEditTitle} maxLength={24} textAlign="right" />
            <Text style={styles.modalLabel}>{he.bot.fieldItemDescription}</Text>
            <TextInput style={styles.modalInput} value={editDesc} onChangeText={setEditDesc} maxLength={72} textAlign="right" />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setEditTarget(null)}>
                <Text style={styles.modalCancelText}>{he.generic.cancel}</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalConfirm]} onPress={applyEdit}>
                <Text style={styles.modalConfirmText}>{he.generic.save}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={deleteTarget != null}
        title={he.bot.deleteItemConfirmTitle}
        message={deleteTarget ? interpolate(he.bot.deleteItemConfirmMessage, { name: deleteTarget.title }) : undefined}
        confirmLabel={he.generic.delete}
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.md, gap: theme.spacing.sm },
  hint: { ...theme.typography.caption, color: theme.colors.onSurfaceVariant, textAlign: "right", marginBottom: theme.spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.sm,
  },
  reorder: { gap: 2 },
  arrowBtn: { padding: 2 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { ...theme.typography.bodyLg, color: theme.colors.onSurface, textAlign: "right" },
  rowBadge: { ...theme.typography.caption, color: theme.colors.onSurfaceVariant, textAlign: "right" },
  rowActions: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  actionBtn: { padding: theme.spacing.xs },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onPrimary, fontSize: 14 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 28, 48, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadow.modal,
  },
  modalTitle: { ...theme.typography.headlineSm, color: theme.colors.onSurface, textAlign: "right" },
  modalLabel: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onSurfaceVariant, textAlign: "right" },
  modalInput: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  modalActions: { flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  modalBtn: { flex: 1, paddingVertical: theme.spacing.md, borderRadius: theme.radius.md, alignItems: "center" },
  modalCancel: { backgroundColor: theme.colors.surfaceContainerLow, borderWidth: 1, borderColor: theme.colors.outlineVariant },
  modalConfirm: { backgroundColor: theme.colors.primary },
  modalCancelText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onSurface, fontSize: 14 },
  modalConfirmText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onPrimary, fontSize: 14 },
});
