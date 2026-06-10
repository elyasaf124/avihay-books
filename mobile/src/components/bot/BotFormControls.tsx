import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type KeyboardTypeOptions,
  type ScrollViewProps,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

/** מזהה ייחודי קצר לשימוש בזרימות/כפתורים/פריטים שנוצרים באפליקציה. */
export function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  multiline,
  keyboardType,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
}): JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.onSurfaceVariant}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
        textAlign="left"
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** בורר ערך מתוך אפשרויות (chips) — לסוג צעד / פעולת כפתור / יעד וכו'. */
export function ChipSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}): JSX.Element {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(opt.value)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** סרגל שמירה תחתון משותף לכל מסכי העריכה. */
export function SaveBar({
  onSave,
  saving,
  disabled,
  label,
}: {
  onSave: () => void;
  saving?: boolean;
  disabled?: boolean;
  label?: string;
}): JSX.Element {
  return (
    <View style={styles.saveBar}>
      <Pressable
        style={[styles.saveBtn, (saving || disabled) && styles.saveBtnDisabled]}
        onPress={onSave}
        disabled={saving || disabled}
      >
        {saving ? (
          <ActivityIndicator color={theme.colors.onPrimary} />
        ) : (
          <Text style={styles.saveBtnText}>{label ?? he.generic.save}</Text>
        )}
      </Pressable>
    </View>
  );
}

export function CenterState({
  loading,
  error,
  onRetry,
  children,
}: {
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  children?: ReactNode;
}): JSX.Element {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.centerText}>{he.bot.loading}</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{he.bot.loadError}</Text>
        {onRetry ? (
          <Pressable style={styles.retryBtn} onPress={onRetry}>
            <Text style={styles.retryText}>{he.home.retry}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return <>{children}</>;
}

/** ScrollView עם padding תחתון דינמי — מונע מהמקלדת לכסות שדות בטפסי בוט. */
export function BotKeyboardScrollView({
  children,
  contentStyle,
  ...props
}: ScrollViewProps & {
  contentStyle?: StyleProp<ViewStyle>;
}): JSX.Element {
  const keyboardHeight = useKeyboardHeight();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        contentStyle,
        { paddingBottom: keyboardHeight + theme.spacing.xl },
      ]}
      {...props}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: { gap: theme.spacing.xs, marginBottom: theme.spacing.md },
  label: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    letterSpacing: 0,
    textAlign: "left",
  },
  input: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 44,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: "top" },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surfaceContainerLowest,
  },
  chipActive: {
    backgroundColor: theme.colors.primaryContainer,
    borderColor: theme.colors.primary,
  },
  chipText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onSurface, textAlign: "left" },
  chipTextActive: { color: theme.colors.onPrimary },
  saveBar: {
    padding: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.outlineVariant,
    backgroundColor: theme.colors.surface,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.onPrimary, fontSize: 15, textAlign: "left" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, gap: theme.spacing.sm },
  centerText: { ...theme.typography.bodyMd, color: theme.colors.onSurfaceVariant, textAlign: "left" },
  errorText: { ...theme.typography.bodyMd, color: theme.colors.error, textAlign: "center" },
  retryBtn: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.primaryContainer,
    borderRadius: theme.radius.md,
  },
  retryText: { ...theme.typography.labelMd, letterSpacing: 0, color: theme.colors.primary, textAlign: "left" },
});
