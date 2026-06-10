import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { FlowNode } from "@avihay-books/shared";
import { useBotConfig, useSaveBotConfig } from "../../api/botConfig";
import { ConfirmDialog } from "../ConfirmDialog";
import { he } from "../../i18n/he";
import { theme } from "../../theme";
import { CenterState, genId, LabeledInput, SaveBar } from "./BotFormControls";
import { FlowNodeEditor } from "./FlowNodeEditor";
import { prepareFlowForSave, sanitizeAllCustomFlows, sanitizeSingleNode } from "./flowSanitize";

const TYPE_LABELS: Record<FlowNode["type"], string> = {
  text: he.bot.stepTypeText,
  buttons: he.bot.stepTypeButtons,
  link: he.bot.stepTypeLink,
  document: he.bot.stepTypeDocument,
};

export function FlowEditor({ flowId }: { flowId: string }): JSX.Element {
  const router = useRouter();
  const configQuery = useBotConfig();
  const saveMutation = useSaveBotConfig();

  const [name, setName] = useState("");
  const [nodes, setNodes] = useState<Record<string, FlowNode>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [entryId, setEntryId] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!configQuery.data || loaded) return;
    const flow = configQuery.data.custom_flows[flowId];
    if (!flow) return;
    const menuItem = configQuery.data.menu_items.find((m) => m.flow_id === flowId);
    setName(menuItem?.title ?? flow.name);
    setNodes(flow.nodes);
    setOrder(Object.keys(flow.nodes));
    setEntryId(flow.entry_node_id);
    setLoaded(true);
  }, [configQuery.data, loaded, flowId]);

  const onSave = async (): Promise<void> => {
    if (!configQuery.data) return;
    setEditingId(null);
    const title = (name.trim() || he.bot.newFlowName).slice(0, 24);
    const flow = prepareFlowForSave({ name: title, nodes, entry_node_id: entryId }, order);
    const custom_flows = sanitizeAllCustomFlows({
      ...configQuery.data.custom_flows,
      [flowId]: flow,
    });
    const menu_items = configQuery.data.menu_items.map((m) =>
      m.flow_id === flowId ? { ...m, title } : m,
    );
    try {
      const saved = await saveMutation.mutateAsync({
        ...configQuery.data,
        menu_items,
        custom_flows,
      });
      const savedFlow = saved.custom_flows[flowId];
      if (savedFlow) {
        const menuItem = saved.menu_items.find((m) => m.flow_id === flowId);
        setName(menuItem?.title ?? savedFlow.name);
        setNodes(savedFlow.nodes);
        setEntryId(savedFlow.entry_node_id);
        setOrder(Object.keys(savedFlow.nodes));
      }
      router.back();
    } catch {
      Alert.alert(he.generic.errorTitle, he.bot.saveFailed);
    }
  };

  const addStep = (): void => {
    const id = genId("node");
    const node: FlowNode = { id, type: "text", text: "", after: "end_loop" };
    setNodes((prev) => {
      const next = { ...prev, [id]: node };
      const lastId = order[order.length - 1];
      if (lastId && next[lastId] && next[lastId].type !== "buttons" && next[lastId].after !== "handover") {
        next[lastId] = { ...next[lastId], after: "next", next_node_id: id };
      }
      return next;
    });
    setOrder((prev) => [...prev, id]);
    if (order.length === 0) setEntryId(id);
    setEditingId(id);
  };

  const saveNode = (node: FlowNode): void => {
    setNodes((prev) => {
      const cleaned = sanitizeSingleNode(node, prev);
      return { ...prev, [cleaned.id]: cleaned };
    });
    setEditingId(null);
  };

  const confirmDeleteStep = (): void => {
    if (!deleteId) return;
    setNodes((prev) => {
      const next = { ...prev };
      delete next[deleteId];
      return next;
    });
    setOrder((prev) => {
      const next = prev.filter((id) => id !== deleteId);
      if (deleteId === entryId) setEntryId(next[0] ?? "");
      return next;
    });
    setDeleteId(null);
  };

  const flowMissing = configQuery.data != null && !configQuery.data.custom_flows[flowId];

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <CenterState
        loading={configQuery.isLoading || (!loaded && !flowMissing)}
        error={configQuery.isError || flowMissing}
        onRetry={() => void configQuery.refetch()}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <LabeledInput label={he.bot.fieldFlowName} value={name} onChangeText={setName} maxLength={100} />

          <Text style={styles.sectionTitle}>{he.bot.flowStepsTitle}</Text>
          {order.length === 0 ? (
            <Text style={styles.empty}>{he.bot.flowEmptySteps}</Text>
          ) : (
            order.map((id, index) => {
              const node = nodes[id];
              if (!node) return null;
              const isEntry = id === entryId;
              return (
                <View key={id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <Text style={styles.cardIndex}>#{index + 1}</Text>
                      <Text style={styles.cardType}>{TYPE_LABELS[node.type]}</Text>
                      {isEntry ? <Text style={styles.entryBadge}>{he.bot.entryBadge}</Text> : null}
                    </View>
                    <Pressable onPress={() => setDeleteId(id)} hitSlop={6}>
                      <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                    </Pressable>
                  </View>

                  <Text style={styles.cardText} numberOfLines={2}>
                    {node.text.trim() || "—"}
                  </Text>

                  {node.type === "buttons" && (node.buttons?.length ?? 0) > 0 ? (
                    <View style={styles.buttonsPreview}>
                      {node.buttons!.map((b) => (
                        <Text key={b.id} style={styles.buttonChip}>{b.title || "…"}</Text>
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.cardActions}>
                    <Pressable style={styles.cardAction} onPress={() => setEditingId(id)}>
                      <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
                      <Text style={styles.cardActionText}>{he.generic.edit}</Text>
                    </Pressable>
                    {!isEntry ? (
                      <Pressable style={styles.cardAction} onPress={() => setEntryId(id)}>
                        <Ionicons name="flag-outline" size={18} color={theme.colors.primary} />
                        <Text style={styles.cardActionText}>{he.bot.setEntry}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}

          <Pressable style={styles.addBtn} onPress={addStep}>
            <Ionicons name="add-circle-outline" size={20} color={theme.colors.onPrimary} />
            <Text style={styles.addBtnText}>{he.bot.addStep}</Text>
          </Pressable>
        </ScrollView>

        <SaveBar onSave={() => void onSave()} saving={saveMutation.isPending} />
      </CenterState>

      {editingId != null && nodes[editingId] ? (
        <FlowNodeEditor
          key={editingId}
          node={nodes[editingId]}
          allNodes={order.map((id) => nodes[id]).filter((n): n is FlowNode => n != null)}
          onSave={saveNode}
          onClose={() => setEditingId(null)}
        />
      ) : null}

      <ConfirmDialog
        visible={deleteId != null}
        title={he.bot.deleteStepConfirmTitle}
        message={he.bot.deleteStepConfirmMessage}
        confirmLabel={he.generic.delete}
        destructive
        onConfirm={confirmDeleteStep}
        onCancel={() => setDeleteId(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.md },
  sectionTitle: { ...theme.typography.headlineSm, color: theme.colors.primary, textAlign: "right", marginBottom: theme.spacing.sm },
  empty: { ...theme.typography.bodyMd, color: theme.colors.onSurfaceVariant, textAlign: "center", paddingVertical: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  cardIndex: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onSurfaceVariant },
  cardType: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    backgroundColor: theme.colors.primaryContainer + "22",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
  },
  entryBadge: {
    ...theme.typography.caption,
    color: theme.colors.onSecondaryContainer,
    backgroundColor: theme.colors.secondaryContainer,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
  },
  cardText: { ...theme.typography.bodyMd, color: theme.colors.onSurface, textAlign: "right" },
  buttonsPreview: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
  buttonChip: {
    ...theme.typography.caption,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surfaceContainerHigh,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
  },
  cardActions: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.xs },
  cardAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardActionText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.primary },
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
  addBtnText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onPrimary, fontSize: 14 },
});
