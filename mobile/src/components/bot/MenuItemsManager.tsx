import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  MAX_MENU_ITEMS_ENABLED,
  MAX_MENU_ITEMS_TOTAL,
  type BotConfigData,
  type CustomFlow,
  type MenuItemConfig,
} from "@avihay-books/shared";
import { useBotConfig, useSaveBotConfig } from "../../api/botConfig";
import { ConfirmDialog } from "../ConfirmDialog";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { he } from "../../i18n/he";
import { theme } from "../../theme";
import { BotKeyboardScrollView, CenterState, genId } from "./BotFormControls";
import { sanitizeAllCustomFlows } from "./flowSanitize";
import { useBotAutoSave } from "./useBotAutoSave";

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
  const keyboardHeight = useKeyboardHeight();
  const [draft, setDraft] = useState<BotConfigData | null>(null);
  const [editTarget, setEditTarget] = useState<MenuItemConfig | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MenuItemConfig | null>(null);

  useEffect(() => {
    if (configQuery.data && !draft) {
      const sorted = [...configQuery.data.menu_items].sort((a, b) => a.order - b.order);
      setDraft({ ...configQuery.data, menu_items: reindex(sorted) });
    }
  }, [configQuery.data, draft]);

  const items = draft?.menu_items ?? [];
  const enabledCount = items.filter((it) => it.enabled).length;

  const { syncSaved } = useBotAutoSave(draft, draft != null);

  const updateItems = (next: MenuItemConfig[]): void =>
    setDraft((prev) => (prev ? { ...prev, menu_items: reindex(next) } : prev));

  const toggle = (id: string, value: boolean): void => {
    if (value && enabledCount >= MAX_MENU_ITEMS_ENABLED) {
      Alert.alert(he.bot.maxEnabledReached);
      return;
    }
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
      const synced = { ...saved, menu_items: reindex([...saved.menu_items].sort((a, b) => a.order - b.order)) };
      setDraft(synced);
      syncSaved(synced);
      return saved;
    } catch {
      Alert.alert(he.generic.errorTitle, he.bot.saveFailed);
      return null;
    }
  };

  const openCreate = (): void => {
    if (items.length >= MAX_MENU_ITEMS_TOTAL) {
      Alert.alert(he.bot.maxTotalReached);
      return;
    }
    if (enabledCount >= MAX_MENU_ITEMS_ENABLED) {
      Alert.alert(he.bot.maxEnabledReached);
      return;
    }
    setCreateTitle(he.bot.newFlowTitle);
    setCreating(true);
  };

  const confirmCreate = async (): Promise<void> => {
    if (!draft) return;
    const title = (createTitle.trim() || he.bot.newFlowTitle).slice(0, 24);
    const flowId = genId("flow");
    const nodeId = genId("node");
    const flow: CustomFlow = {
      name: title,
      entry_node_id: nodeId,
      nodes: { [nodeId]: { id: nodeId, type: "text", text: "", after: "end_loop" } },
    };
    const item: MenuItemConfig = {
      id: genId("custom"),
      title,
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
    setCreating(false);
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

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <CenterState
        loading={configQuery.isLoading || !draft}
        error={configQuery.isError}
        onRetry={() => void configQuery.refetch()}
      >
        <BotKeyboardScrollView contentStyle={styles.content}>
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

              <View style={styles.rowBody}>
                <Pressable style={styles.rowMain} onPress={() => openEdit(item)}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.rowBadge}>
                    {item.type === "custom" ? he.bot.menuItemCustom : he.bot.menuItemBuiltin}
                  </Text>
                </Pressable>

                <View style={styles.rowFooter}>
                  {item.type === "custom" ? (
                    <View style={styles.customActions}>
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
                    </View>
                  ) : null}
                  <View style={styles.footerSpacer} />
                  <Switch
                    value={item.enabled}
                    onValueChange={(v) => toggle(item.id, v)}
                    trackColor={{ true: theme.colors.primary }}
                    style={styles.switch}
                  />
                </View>
              </View>
            </View>
          ))}

          <Pressable
            style={[
              styles.addBtn,
              (items.length >= MAX_MENU_ITEMS_TOTAL || enabledCount >= MAX_MENU_ITEMS_ENABLED) &&
                styles.addBtnDisabled,
            ]}
            onPress={openCreate}
            disabled={
              items.length >= MAX_MENU_ITEMS_TOTAL ||
              enabledCount >= MAX_MENU_ITEMS_ENABLED ||
              saveMutation.isPending
            }
          >
            <Ionicons name="add-circle-outline" size={20} color={theme.colors.onPrimary} />
            <Text style={styles.addBtnText}>{he.bot.addCustomItem}</Text>
          </Pressable>
        </BotKeyboardScrollView>
      </CenterState>

      <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalRoot}
        >
          <Pressable style={styles.backdrop} onPress={() => setCreating(false)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: keyboardHeight }}
              >
                <Text style={styles.modalTitle}>{he.bot.createFlowTitle}</Text>
                <Text style={styles.modalLabel}>{he.bot.fieldItemTitle}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={createTitle}
                  onChangeText={setCreateTitle}
                  maxLength={24}
                  textAlign="left"
                  autoFocus
                />
                <View style={styles.modalActions}>
                  <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setCreating(false)}>
                    <Text style={styles.modalCancelText}>{he.generic.cancel}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, styles.modalConfirm]}
                    onPress={() => void confirmCreate()}
                    disabled={saveMutation.isPending}
                  >
                    <Text style={styles.modalConfirmText}>{he.generic.save}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editTarget != null} transparent animationType="fade" onRequestClose={() => setEditTarget(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalRoot}
        >
          <Pressable style={styles.backdrop} onPress={() => setEditTarget(null)}>
            <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: keyboardHeight }}
              >
                <Text style={styles.modalTitle}>{he.bot.editItem}</Text>
                <Text style={styles.modalLabel}>{he.bot.fieldItemTitle}</Text>
                <TextInput style={styles.modalInput} value={editTitle} onChangeText={setEditTitle} maxLength={24} textAlign="left" />
                <Text style={styles.modalLabel}>{he.bot.fieldItemDescription}</Text>
                <TextInput style={styles.modalInput} value={editDesc} onChangeText={setEditDesc} maxLength={72} textAlign="left" />
                <View style={styles.modalActions}>
                  <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setEditTarget(null)}>
                    <Text style={styles.modalCancelText}>{he.generic.cancel}</Text>
                  </Pressable>
                  <Pressable style={[styles.modalBtn, styles.modalConfirm]} onPress={applyEdit}>
                    <Text style={styles.modalConfirmText}>{he.generic.save}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
  hint: { ...theme.typography.caption, color: theme.colors.onSurfaceVariant, textAlign: "left", marginBottom: theme.spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.sm,
  },
  reorder: { gap: 2, justifyContent: "center" },
  arrowBtn: { padding: 2 },
  rowBody: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
  rowMain: { gap: 2 },
  rowTitle: { ...theme.typography.bodyLg, color: theme.colors.onSurface, textAlign: "left" },
  rowBadge: { ...theme.typography.caption, color: theme.colors.onSurfaceVariant, textAlign: "left" },
  rowFooter: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
  },
  footerSpacer: { flex: 1, minWidth: theme.spacing.sm },
  customActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    flexShrink: 0,
  },
  actionBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceContainerLow,
  },
  switch: { flexShrink: 0, transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] },
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
  addBtnText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onPrimary, fontSize: 14, textAlign: "left" },
  modalRoot: { flex: 1 },
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
  modalTitle: { ...theme.typography.headlineSm, color: theme.colors.onSurface, textAlign: "left" },
  modalLabel: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onSurfaceVariant, textAlign: "left" },
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
  modalCancelText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onSurface, fontSize: 14, textAlign: "left" },
  modalConfirmText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onPrimary, fontSize: 14, textAlign: "left" },
});
