import { Ionicons } from "@expo/vector-icons";
import type { Supplier } from "@avihay-books/shared";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { he } from "../../i18n/he";
import { theme } from "../../theme";

/** צבעים מוגדרים מראש — בהשראת seed + גוונים נוספים לספקים חדשים. */
export const SUPPLIER_COLOR_PALETTE = [
  "#1e3a8a",
  "#006a61",
  "#653400",
  "#ba1a1a",
  "#5b21b6",
  "#0f766e",
  "#b45309",
  "#be123c",
  "#1d4ed8",
  "#047857",
] as const;

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => {
    return s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
  }, template);
}

export interface SupplierFormModalProps {
  visible: boolean;
  supplier: Supplier | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; email: string; color_hex: string }) => void;
}

export function SupplierFormModal({
  visible,
  supplier,
  submitting,
  onClose,
  onSubmit,
}: SupplierFormModalProps): JSX.Element {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [colorHex, setColorHex] = useState<string>(SUPPLIER_COLOR_PALETTE[0]);
  const [customHex, setCustomHex] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(supplier?.name ?? "");
    setEmail(supplier?.email ?? "");
    const initial = supplier?.color_hex ?? SUPPLIER_COLOR_PALETTE[0];
    const inPalette = SUPPLIER_COLOR_PALETTE.includes(initial as (typeof SUPPLIER_COLOR_PALETTE)[number]);
    if (inPalette) {
      setColorHex(initial);
      setUseCustom(false);
      setCustomHex("");
    } else {
      setUseCustom(true);
      setCustomHex(initial);
      setColorHex(initial);
    }
    setError(null);
  }, [visible, supplier]);

  const resolvedColor = useCustom ? customHex.trim() : colorHex;

  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setError(he.suppliers.validationName);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError(he.suppliers.validationEmail);
      return;
    }
    if (!HEX_COLOR_RE.test(resolvedColor)) {
      setError(he.suppliers.validationColor);
      return;
    }
    setError(null);
    onSubmit({ name: trimmedName, email: trimmedEmail, color_hex: resolvedColor.toLowerCase() });
  }, [name, email, resolvedColor, onSubmit]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
              <Ionicons name="close" size={24} color={theme.colors.onSurface} />
            </Pressable>
            <Text style={styles.headerTitle}>
              {supplier ? he.suppliers.editTitle : he.suppliers.newTitle}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>{he.suppliers.fieldName}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={he.suppliers.fieldName}
              autoCapitalize="words"
              textAlign="left"
            />

            <Text style={styles.label}>{he.suppliers.fieldEmail}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="orders@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="left"
            />

            <Text style={styles.label}>{he.suppliers.fieldColor}</Text>
            <View style={styles.palette}>
              {SUPPLIER_COLOR_PALETTE.map((c) => {
                const selected = !useCustom && colorHex === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      setUseCustom(false);
                      setColorHex(c);
                      setCustomHex("");
                    }}
                    style={[
                      styles.swatch,
                      { backgroundColor: c },
                      selected && styles.swatchSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    {selected ? (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => setUseCustom(true)}
              style={[styles.customToggle, useCustom && styles.customToggleActive]}
            >
              <Text style={styles.customToggleText}>{he.suppliers.colorCustom}</Text>
            </Pressable>
            {useCustom ? (
              <TextInput
                style={styles.input}
                value={customHex}
                onChangeText={setCustomHex}
                placeholder="#1e3a8a"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={7}
                textAlign="left"
              />
            ) : null}

            <View style={styles.previewRow}>
              <View style={[styles.previewSwatch, { backgroundColor: resolvedColor || theme.colors.outline }]} />
              <Text style={styles.previewText} numberOfLines={1}>
                {name.trim() || he.suppliers.fieldName}
              </Text>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.submitText}>{he.generic.save}</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export { interpolate };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.surface },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.marginMobile,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.outlineVariant,
  },
  headerTitle: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: { width: 24 },
  form: {
    padding: theme.spacing.marginMobile,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  label: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    marginTop: theme.spacing.sm,
    textAlign: "left",
  },
  input: {
    ...theme.typography.bodyMd,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLowest,
    color: theme.colors.onSurface,
  },
  palette: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchSelected: {
    borderColor: theme.colors.onSurface,
  },
  customToggle: {
    alignSelf: "flex-start",
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    marginTop: theme.spacing.xs,
  },
  customToggleActive: {
    backgroundColor: theme.colors.primaryContainer,
  },
  customToggleText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    fontSize: 13,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.md,
  },
  previewSwatch: {
    width: 20,
    height: 20,
    borderRadius: theme.radius.full,
  },
  previewText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    flex: 1,
    textAlign: "left",
  },
  errorText: {
    ...theme.typography.bodyMd,
    fontSize: 13,
    color: theme.colors.error,
    textAlign: "left",
    marginTop: theme.spacing.xs,
  },
  submitBtn: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
    fontSize: 15,
  },
});
