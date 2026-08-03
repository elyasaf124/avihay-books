import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  type KeyboardTypeOptions,
  type ScrollViewProps,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { useKeyboardHeight } from "../../hooks/useKeyboardHeight";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

type BotScrollContextValue = {
  registerInput: (key: string, node: TextInput | null) => void;
  onInputFocus: (key: string) => void;
};

export const BotScrollContext = createContext<BotScrollContextValue | null>(null);

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
  const inputKey = useId();
  const botScroll = useContext(BotScrollContext);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={(node) => botScroll?.registerInput(inputKey, node)}
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.onSurfaceVariant}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
        textAlign="right"
        onFocus={() => botScroll?.onInputFocus(inputKey)}
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
  style,
  ...props
}: ScrollViewProps & {
  contentStyle?: StyleProp<ViewStyle>;
}): JSX.Element {
  const keyboardHeight = useKeyboardHeight();
  const { height: windowH } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const inputRefs = useRef<Map<string, TextInput>>(new Map());
  const focusedInputKeyRef = useRef<string | null>(null);

  const registerInput = useCallback((key: string, node: TextInput | null) => {
    if (node) inputRefs.current.set(key, node);
    else inputRefs.current.delete(key);
  }, []);

  /** גולל את הטופס כך שהאינפוט הממוקד יישב מעל המקלדת — כמו ב-add-remove. */
  const ensureInputVisible = useCallback(
    (key: string) => {
      if (keyboardHeight <= 0) return;
      const node = inputRefs.current.get(key);
      if (!node) return;
      node.measureInWindow((_x, y, _w, height) => {
        const keyboardTop = windowH - keyboardHeight;
        const margin = theme.spacing.lg;
        const overflow = y + height - (keyboardTop - margin);
        if (overflow > 0) {
          scrollRef.current?.scrollTo({
            y: Math.max(0, scrollOffsetRef.current + overflow),
            animated: true,
          });
        }
      });
    },
    [keyboardHeight, windowH],
  );

  const onInputFocus = useCallback(
    (key: string) => {
      focusedInputKeyRef.current = key;
      ensureInputVisible(key);
    },
    [ensureInputVisible],
  );

  useEffect(() => {
    if (keyboardHeight <= 0 || !focusedInputKeyRef.current) return undefined;
    const key = focusedInputKeyRef.current;
    const t = setTimeout(() => ensureInputVisible(key), 60);
    return () => clearTimeout(t);
  }, [keyboardHeight, ensureInputVisible]);

  return (
    <BotScrollContext.Provider value={{ registerInput, onInputFocus }}>
      <ScrollView
        ref={scrollRef}
        style={[styles.keyboardScroll, style]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        contentContainerStyle={[
          contentStyle,
          { paddingBottom: keyboardHeight + theme.spacing.xl },
        ]}
        {...props}
      >
        {children}
      </ScrollView>
    </BotScrollContext.Provider>
  );
}

const styles = StyleSheet.create({
  keyboardScroll: { flex: 1 },
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
