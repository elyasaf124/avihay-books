import { useContext, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BotTextKey, BotTextOverrides } from "@avihay-books/shared";
import { useBotConfig } from "../../api/botConfig";
import { he } from "../../i18n/he";
import { theme } from "../../theme";
import { BotKeyboardScrollView, BotScrollContext, CenterState } from "./BotFormControls";
import { useBotAutoSave } from "./useBotAutoSave";

function TextOverrideField({
  fieldKey,
  label,
  value,
  onChangeText,
  onReset,
  showDefaultBadge,
}: {
  fieldKey: BotTextKey;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onReset: () => void;
  showDefaultBadge: boolean;
}): JSX.Element {
  const botScroll = useContext(BotScrollContext);

  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.label}>{label}</Text>
        {showDefaultBadge ? (
          <Text style={styles.defaultBadge}>{he.bot.textDefaultLabel}</Text>
        ) : (
          <Pressable onPress={onReset} hitSlop={8}>
            <Ionicons name="refresh-outline" size={16} color={theme.colors.primary} />
          </Pressable>
        )}
      </View>
      <TextInput
        ref={(node) => botScroll?.registerInput(fieldKey, node)}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        multiline
        textAlign="right"
        placeholder={he.bot.textDefaultLabel}
        placeholderTextColor={theme.colors.onSurfaceVariant}
        onFocus={() => botScroll?.onInputFocus(fieldKey)}
      />
    </View>
  );
}

const LABELS: Record<BotTextKey, string> = {
  welcome: "הודעת פתיחה",
  menuButton: "כפתור פתיחת התפריט",
  menuPrompt: "כותרת התפריט",
  closing: "הודעת סיום",
  endLoopPrompt: "שאלת «עוד משהו?»",
  b1AskTitle: "בקשת שם ספר",
  b1ManyMatches: "נמצאו כמה תוצאות",
  b1NoMatch: "לא נמצא ספר",
  b1ImageFallback: "נשלחה תמונה במקום טקסט",
  orderAskType: "סוג הזמנה",
  askName: "בקשת שם",
  askPhone: "בקשת טלפון",
  askAddress: "בקשת כתובת",
  askDeliveryMethod: "סוג משלוח",
  askBookTitle: "שם ספר להזמנה",
  askQuantity: "כמות",
  askMore: "עוד ספרים?",
  askNotesPickup: "הערות (איסוף)",
  askNotesDelivery: "הערות (משלוח)",
  invalidQuantity: "כמות לא תקינה",
  orderDonePickup: "אישור הזמנה (איסוף)",
  orderDoneDelivery: "אישור הזמנה (משלוח)",
  quoteHandover: "הצעת מחיר — העברה לנציג",
  supportPrompt: "פתיחת תמיכה",
  supportAskBook: "ספר לא נמצא בתא",
  supportReportSaved: "אישור דיווח",
  supportPosText: "תקלת תשלום",
  supportHumanInHours: "מעבר לנציג",
  supportOffHours: "מחוץ לשעות מענה",
  supportQuestionSaved: "אישור שמירת שאלה",
  handoverEndHint: "הנחיית כפתור סיום (מענה אנושי)",
  handoverEndHintRepeat: "הנחיית כפתור סיום (חוזר)",
  handoverEndButton: "טקסט כפתור «סיימתי»",
  catalogCaption: "כיתוב קטלוג",
  catalogMissing: "קטלוג לא זמין",
  b3NoOrders: "אין הזמנות פעילות",
  b3MultipleOrders: "מספר הזמנות פעילות",
};

const GROUPS: { title: string; keys: BotTextKey[] }[] = [
  { title: "כללי", keys: ["welcome", "menuButton", "menuPrompt", "closing", "endLoopPrompt"] },
  { title: "בירור מלאי", keys: ["b1AskTitle", "b1ManyMatches", "b1NoMatch", "b1ImageFallback"] },
  {
    title: "הזמנה",
    keys: [
      "orderAskType", "askName", "askPhone", "askAddress", "askDeliveryMethod",
      "askBookTitle", "askQuantity", "askMore", "askNotesPickup", "askNotesDelivery",
      "invalidQuantity", "orderDonePickup", "orderDoneDelivery",
    ],
  },
  { title: "סטטוס וקטלוג", keys: ["b3NoOrders", "b3MultipleOrders", "catalogCaption", "catalogMissing", "quoteHandover"] },
  {
    title: "תמיכה ומענה אנושי",
    keys: [
      "supportPrompt",
      "supportAskBook",
      "supportReportSaved",
      "supportPosText",
      "supportHumanInHours",
      "supportOffHours",
      "supportQuestionSaved",
      "handoverEndHint",
      "handoverEndHintRepeat",
      "handoverEndButton",
    ],
  },
];

export function TextOverridesEditor(): JSX.Element {
  const configQuery = useBotConfig();
  const [draft, setDraft] = useState<BotTextOverrides | null>(null);

  useEffect(() => {
    if (configQuery.data && !draft) setDraft({ ...configQuery.data.text_overrides });
  }, [configQuery.data, draft]);

  const savePayload = useMemo(() => {
    if (!configQuery.data || !draft) return null;
    return { ...configQuery.data, text_overrides: draft };
  }, [configQuery.data, draft]);

  useBotAutoSave(savePayload, savePayload != null);

  const set = (key: BotTextKey, value: string): void =>
    setDraft((prev) => {
      const next = { ...(prev ?? {}) };
      if (value.trim().length === 0) delete next[key];
      else next[key] = value;
      return next;
    });

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <CenterState
        loading={configQuery.isLoading || !draft}
        error={configQuery.isError}
        onRetry={() => void configQuery.refetch()}
      >
        <BotKeyboardScrollView contentStyle={styles.content}>
          <Text style={styles.hint}>{he.bot.textsHint}</Text>
          {GROUPS.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              {group.keys.map((key) => {
                const value = draft?.[key] ?? "";
                return (
                  <TextOverrideField
                    key={key}
                    fieldKey={key}
                    label={LABELS[key]}
                    value={value}
                    onChangeText={(v) => set(key, v)}
                    onReset={() => set(key, "")}
                    showDefaultBadge={value.length === 0}
                  />
                );
              })}
            </View>
          ))}
        </BotKeyboardScrollView>
      </CenterState>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.md },
  hint: { ...theme.typography.caption, color: theme.colors.onSurfaceVariant, textAlign: "left", marginBottom: theme.spacing.sm },
  group: { marginBottom: theme.spacing.lg },
  groupTitle: { ...theme.typography.headlineSm, color: theme.colors.primary, textAlign: "left", marginBottom: theme.spacing.sm },
  field: { gap: theme.spacing.xs, marginBottom: theme.spacing.md },
  fieldHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onSurface, textAlign: "left" },
  defaultBadge: { ...theme.typography.caption, color: theme.colors.onSurfaceVariant },
  input: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 60,
    textAlignVertical: "top",
  },
});
