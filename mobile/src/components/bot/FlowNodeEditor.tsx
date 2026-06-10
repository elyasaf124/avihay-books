import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  FlowButton,
  FlowButtonAction,
  FlowNode,
  FlowNodeType,
} from "@avihay-books/shared";
import { he } from "../../i18n/he";
import { theme } from "../../theme";
import { ChipSelect, genId, LabeledInput } from "./BotFormControls";

const TYPE_OPTIONS: { value: FlowNodeType; label: string }[] = [
  { value: "text", label: he.bot.stepTypeText },
  { value: "buttons", label: he.bot.stepTypeButtons },
  { value: "link", label: he.bot.stepTypeLink },
  { value: "document", label: he.bot.stepTypeDocument },
];

const ACTION_OPTIONS: { value: FlowButtonAction; label: string }[] = [
  { value: "goto", label: he.bot.actionGoto },
  { value: "main_menu", label: he.bot.actionMainMenu },
  { value: "end_loop", label: he.bot.actionEndLoop },
  { value: "handover", label: he.bot.actionHandover },
];

const AFTER_OPTIONS = [
  { value: "next" as const, label: he.bot.afterNext },
  { value: "end_loop" as const, label: he.bot.afterEndLoop },
  { value: "handover" as const, label: he.bot.afterHandover },
];

function nodeLabel(node: FlowNode): string {
  const t = node.text.trim();
  return t.length > 0 ? (t.length > 22 ? t.slice(0, 21) + "…" : t) : `(${he.bot.stepTypeText})`;
}

export function FlowNodeEditor({
  node,
  allNodes,
  onSave,
  onClose,
}: {
  node: FlowNode;
  allNodes: FlowNode[];
  onSave: (node: FlowNode) => void;
  onClose: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState<FlowNode>(() => ({ ...node }));

  const d = draft;
  const targetOptions = allNodes
    .filter((n) => n.id !== d.id)
    .map((n) => ({ value: n.id, label: nodeLabel(n) }));

  const changeType = (type: FlowNodeType): void => {
    setDraft((prev) => {
      if (!prev) return prev;
      if (type === "buttons") {
        return { ...prev, type, buttons: prev.buttons ?? [], after: undefined, next_node_id: undefined };
      }
      return { ...prev, type, buttons: undefined, after: prev.after ?? "end_loop" };
    });
  };

  const setButtons = (buttons: FlowButton[]): void =>
    setDraft((prev) => (prev ? { ...prev, buttons } : prev));

  const addButton = (): void => {
    const buttons = d.buttons ?? [];
    if (buttons.length >= 3) return;
    setButtons([...buttons, { id: genId("btn"), title: "", action: "end_loop" }]);
  };

  const updateButton = (index: number, patch: Partial<FlowButton>): void => {
    const buttons = [...(d.buttons ?? [])];
    buttons[index] = { ...buttons[index]!, ...patch };
    setButtons(buttons);
  };

  const removeButton = (index: number): void =>
    setButtons((d.buttons ?? []).filter((_, i) => i !== index));

  const handleSave = (): void => {
    onSave(d);
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{he.bot.stepEditorTitle}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.colors.onSurface} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <ChipSelect<FlowNodeType>
              label={he.bot.fieldStepType}
              value={d.type}
              options={TYPE_OPTIONS}
              onChange={changeType}
            />

            <LabeledInput
              label={he.bot.fieldStepText}
              value={d.text}
              onChangeText={(v) => setDraft((prev) => (prev ? { ...prev, text: v } : prev))}
              multiline
            />

            {d.type === "link" ? (
              <>
                <LabeledInput label={he.bot.fieldLinkUrl} value={d.link_url ?? ""} onChangeText={(v) => setDraft((p) => (p ? { ...p, link_url: v } : p))} keyboardType="url" />
                <LabeledInput label={he.bot.fieldLinkLabel} value={d.link_label ?? ""} onChangeText={(v) => setDraft((p) => (p ? { ...p, link_label: v } : p))} maxLength={20} />
              </>
            ) : null}

            {d.type === "document" ? (
              <>
                <LabeledInput label={he.bot.fieldDocUrl} value={d.document_url ?? ""} onChangeText={(v) => setDraft((p) => (p ? { ...p, document_url: v } : p))} keyboardType="url" />
                <LabeledInput label={he.bot.fieldDocFilename} value={d.document_filename ?? ""} onChangeText={(v) => setDraft((p) => (p ? { ...p, document_filename: v } : p))} />
              </>
            ) : null}

            {d.type === "buttons" ? (
              <View>
                <Text style={styles.sectionTitle}>{he.bot.buttonsTitle}</Text>
                {(d.buttons ?? []).map((btn, index) => (
                  <View key={btn.id} style={styles.buttonCard}>
                    <View style={styles.buttonCardHeader}>
                      <Text style={styles.buttonCardIndex}>#{index + 1}</Text>
                      <Pressable onPress={() => removeButton(index)} hitSlop={6}>
                        <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                      </Pressable>
                    </View>
                    <LabeledInput label={he.bot.fieldButtonTitle} value={btn.title} onChangeText={(v) => updateButton(index, { title: v })} maxLength={20} />
                    <ChipSelect<FlowButtonAction>
                      label={he.bot.fieldButtonAction}
                      value={btn.action}
                      options={ACTION_OPTIONS}
                      onChange={(v) => updateButton(index, { action: v })}
                    />
                    {btn.action === "goto" ? (
                      <ChipSelect
                        label={he.bot.fieldButtonTarget}
                        value={btn.target_node_id}
                        options={targetOptions}
                        onChange={(v) => updateButton(index, { target_node_id: v })}
                      />
                    ) : null}
                  </View>
                ))}
                {(d.buttons ?? []).length < 3 ? (
                  <Pressable style={styles.addInline} onPress={addButton}>
                    <Ionicons name="add" size={18} color={theme.colors.primary} />
                    <Text style={styles.addInlineText}>{he.bot.addButton}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <>
                <ChipSelect
                  label={he.bot.afterTitle}
                  value={d.after ?? "end_loop"}
                  options={AFTER_OPTIONS}
                  onChange={(v) => setDraft((p) => (p ? { ...p, after: v } : p))}
                />
                {d.after === "next" ? (
                  <ChipSelect
                    label={he.bot.fieldNextStep}
                    value={d.next_node_id}
                    options={targetOptions}
                    onChange={(v) => setDraft((p) => (p ? { ...p, next_node_id: v } : p))}
                  />
                ) : null}
              </>
            )}
          </ScrollView>

          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>{he.generic.save}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11, 28, 48, 0.45)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "92%",
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingBottom: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  headerTitle: { ...theme.typography.headlineSm, color: theme.colors.onSurface },
  body: { padding: theme.spacing.md },
  sectionTitle: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onSurfaceVariant, textAlign: "right", marginBottom: theme.spacing.xs },
  buttonCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  buttonCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: theme.spacing.xs },
  buttonCardIndex: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onSurfaceVariant },
  addInline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: theme.spacing.sm },
  addInlineText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.primary },
  saveBtn: {
    marginHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
  },
  saveBtnText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onPrimary, fontSize: 15 },
});
