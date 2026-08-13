import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

const QTY_DEBOUNCE_MS = 280;

interface Props {
  quantity: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}

/**
 * קאונטר כמות לשורת הזמנה — מיועד לשורה נפרדת מתחת לפרטי הספר.
 * מציג שינוי מיד, ושולח לשרת רק אחרי רצף לחיצות (debounce).
 */
export function OrderQtyStepper({
  quantity,
  min = 1,
  max = 999,
  disabled = false,
  onChange,
}: Props): JSX.Element {
  const [draftQty, setDraftQty] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNextRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const displayQty = draftQty ?? quantity;

  useEffect(() => {
    if (draftQty !== null && quantity === draftQty) {
      setDraftQty(null);
    }
  }, [quantity, draftQty]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const pending = pendingNextRef.current;
      if (pending != null) {
        pendingNextRef.current = null;
        onChangeRef.current(pending);
      }
    };
  }, []);

  const emit = (next: number) => {
    setDraftQty(next);
    pendingNextRef.current = next;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingNextRef.current = null;
      onChangeRef.current(next);
    }, QTY_DEBOUNCE_MS);
  };

  const canDec = !disabled && displayQty > min;
  const canInc = !disabled && displayQty < max;

  return (
    <View style={styles.wrap} accessibilityRole="adjustable">
      <Text style={styles.label}>{he.orders.quantity}</Text>
      <View style={[styles.track, disabled && styles.trackDisabled]}>
        <Pressable
          onPress={() => {
            if (canDec) emit(displayQty - 1);
          }}
          disabled={!canDec}
          style={({ pressed }) => [
            styles.btn,
            !canDec && styles.btnDisabled,
            pressed && canDec && styles.btnPressed,
          ]}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={he.orders.qtyStepperDecreaseA11y}
        >
          <Ionicons
            name="remove"
            size={18}
            color={canDec ? theme.colors.primary : theme.colors.outline}
          />
        </Pressable>
        <Text
          style={styles.value}
          accessibilityLabel={`${he.orders.quantity}: ${displayQty}`}
        >
          {displayQty}
        </Text>
        <Pressable
          onPress={() => {
            if (canInc) emit(displayQty + 1);
          }}
          disabled={!canInc}
          style={({ pressed }) => [
            styles.btn,
            !canInc && styles.btnDisabled,
            pressed && canInc && styles.btnPressed,
          ]}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={he.orders.qtyStepperIncreaseA11y}
        >
          <Ionicons
            name="add"
            size={18}
            color={canInc ? theme.colors.primary : theme.colors.outline}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  label: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  track: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.full,
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 2,
  },
  trackDisabled: { opacity: 0.55 },
  btn: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.45 },
  btnPressed: { backgroundColor: theme.colors.surfaceContainerHigh },
  value: {
    ...theme.typography.headlineSm,
    color: theme.colors.primary,
    minWidth: 36,
    textAlign: "center",
    paddingHorizontal: theme.spacing.xs,
  },
});
