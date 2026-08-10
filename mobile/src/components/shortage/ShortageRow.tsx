import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ShortageListItem, ShortageStatus } from "@avihay-books/shared";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

interface Props {
  item: ShortageListItem;
  busyMoving?: boolean;
  busyCompleting?: boolean;
  busyRemoving?: boolean;
  busyPrice?: boolean;
  busyStock?: boolean;
  priceDraft: string;
  onPriceDraftChange: (bookId: string, value: string) => void;
  onApplyPrice: (item: ShortageListItem) => void;
  onStockChange: (item: ShortageListItem, nextQty: number) => void;
  onMoveToOrder: (item: ShortageListItem) => void;
  onComplete: (item: ShortageListItem) => void;
  onRemove: (item: ShortageListItem) => void;
}

/**
 * שורה בודדת ב־`shortage list`: כותר + מחבר, מלאי נוכחי, כמות חידוש מומלצת,
 * מחיר לעריכה, כפתור «העבר להזמנה» ו«השלמת חוסר».
 * הסטטוס משפיע על המראה (`order_pending` מקבל באדג׳ ירוק).
 */
export function ShortageRow({
  item,
  busyMoving,
  busyCompleting,
  busyRemoving,
  busyPrice,
  busyStock,
  priceDraft,
  onPriceDraftChange,
  onApplyPrice,
  onStockChange,
  onMoveToOrder,
  onComplete,
  onRemove,
}: Props): JSX.Element {
  const pendingOrder = item.status === "order_pending";
  const blocked = !!(busyMoving || busyCompleting || busyRemoving || busyPrice || busyStock);
  const stockQty = item.book_stock_quantity;
  const noStock = stockQty <= 0;
  const canDecStock = !blocked && stockQty > 0;
  const canIncStock = !blocked && stockQty < 999;

  return (
    <View style={[styles.row, theme.shadow.inset]}>
      <View style={[styles.supplierBar, { backgroundColor: item.supplier_color }]} />

      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>
            {item.book_title}
          </Text>
          <StatusBadge status={item.status} />
          {busyRemoving ? (
            <View style={styles.dismissShortageBtn}>
              <ActivityIndicator color={theme.colors.primary} size="small" />
            </View>
          ) : (
            <Pressable
              disabled={blocked || pendingOrder}
              onPress={() => onRemove(item)}
              style={({ pressed }) => [
                styles.dismissShortageBtn,
                (blocked || pendingOrder) && styles.dismissShortageMuted,
                pressed && !blocked && !pendingOrder && styles.dismissShortagePressed,
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={he.shortage.removeShortageA11y}
            >
              <Ionicons
                name="close-circle-outline"
                size={20}
                color={
                  blocked || pendingOrder
                    ? theme.colors.onSurfaceVariant
                    : theme.colors.error
                }
              />
            </Pressable>
          )}
        </View>
        <Text style={styles.author} numberOfLines={1}>
          {item.book_author} · {item.supplier_name}
        </Text>
        {item.cell_name ? (
          <Text style={styles.cellName} numberOfLines={1}>
            {he.unit.cellLabel} {item.cell_name}
          </Text>
        ) : null}
        {item.missing_count > 1 ? (
          <Text style={styles.missingCount} numberOfLines={1}>
            {he.shortage.missingCopies.replace("{{count}}", String(item.missing_count))}
          </Text>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{he.shortage.stockShort}</Text>
            <View
              style={[styles.stockStepper, blocked && styles.stockStepperDisabled]}
              accessibilityRole="adjustable"
            >
              <Pressable
                onPress={() => onStockChange(item, stockQty - 1)}
                disabled={!canDecStock}
                style={({ pressed }) => [
                  styles.stockBtn,
                  !canDecStock && styles.stockBtnDisabled,
                  pressed && canDecStock && styles.stockBtnPressed,
                ]}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={he.shortage.stockDecreaseA11y}
              >
                <Ionicons
                  name="remove"
                  size={16}
                  color={canDecStock ? theme.colors.primary : theme.colors.outline}
                />
              </Pressable>
              {busyStock ? (
                <ActivityIndicator
                  color={theme.colors.primary}
                  size="small"
                  style={styles.stockValueBusy}
                />
              ) : (
                <Text
                  style={styles.stockValue}
                  accessibilityLabel={`${he.shortage.stockShort}: ${stockQty}`}
                >
                  {stockQty}
                </Text>
              )}
              <Pressable
                onPress={() => onStockChange(item, stockQty + 1)}
                disabled={!canIncStock}
                style={({ pressed }) => [
                  styles.stockBtn,
                  !canIncStock && styles.stockBtnDisabled,
                  pressed && canIncStock && styles.stockBtnPressed,
                ]}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={he.shortage.stockIncreaseA11y}
              >
                <Ionicons
                  name="add"
                  size={16}
                  color={canIncStock ? theme.colors.primary : theme.colors.outline}
                />
              </Pressable>
            </View>
          </View>
          <View style={styles.statsDivider} />
          <Stat
            label={he.shortage.restock}
            value={String(Math.max(item.book_reorder_threshold, 1))}
            accent
          />
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.priceLabel}>{he.shortage.priceLabel}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.pricePrefix}>{he.unit.pricePrefix}</Text>
            <TextInput
              value={priceDraft}
              onChangeText={(t) => onPriceDraftChange(item.book_id, t)}
              keyboardType="decimal-pad"
              editable={!blocked}
              style={[styles.priceInput, blocked && styles.priceInputMuted]}
              placeholder="—"
              placeholderTextColor={theme.colors.onSurfaceVariant}
              textAlign="left"
            />
            <Pressable
              disabled={blocked}
              onPress={() => onApplyPrice(item)}
              style={({ pressed }) => [
                styles.applyPriceBtn,
                blocked && styles.applyPriceBtnMuted,
                pressed && !blocked && styles.applyPriceBtnPressed,
              ]}
            >
              {busyPrice ? (
                <ActivityIndicator color={theme.colors.primary} size="small" />
              ) : (
                <Text style={[styles.applyPriceText, blocked && styles.applyPriceTextMuted]}>
                  {he.shortage.applyPrice}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            disabled={blocked}
            onPress={() => onComplete(item)}
            style={({ pressed }) => [
              styles.completeBtn,
              (blocked || noStock) && styles.actionBtnMuted,
              noStock && styles.completeBtnNoStock,
              pressed && !blocked && styles.completeBtnPressed,
            ]}
          >
            <Ionicons
              name="checkmark-done-outline"
              size={18}
              color={
                blocked || noStock
                  ? theme.colors.onSurfaceVariant
                  : theme.colors.secondary
              }
            />
            <Text
              style={[
                styles.completeBtnText,
                (blocked || noStock) && styles.completeBtnTextMuted,
              ]}
            >
              {he.shortage.completeBtn}
            </Text>
          </Pressable>

          <Pressable
            disabled={blocked || pendingOrder}
            onPress={() => onMoveToOrder(item)}
            style={({ pressed }) => [
              styles.moveBtn,
              (pendingOrder || blocked) && styles.moveBtnDisabled,
              pressed && !pendingOrder && !blocked && styles.moveBtnPressed,
            ]}
          >
            <Ionicons
              name={pendingOrder ? "checkmark-circle-outline" : "arrow-back-circle-outline"}
              size={18}
              color={
                pendingOrder || blocked ? theme.colors.onSurfaceVariant : theme.colors.onPrimary
              }
            />
            <Text
              style={[
                styles.moveBtnText,
                (pendingOrder || blocked) && styles.moveBtnTextDisabled,
              ]}
            >
              {pendingOrder ? he.shortage.statusBadge.order_pending : he.shortage.moveToOrder}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}): JSX.Element {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: ShortageStatus }): JSX.Element {
  const palette =
    status === "order_pending"
      ? { bg: theme.colors.secondaryFixed, fg: theme.colors.onSecondaryFixed }
      : status === "completed"
        ? { bg: theme.colors.surfaceContainerLow, fg: theme.colors.onSurfaceVariant }
        : { bg: theme.colors.errorContainer, fg: theme.colors.onErrorContainer };
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>
        {he.shortage.statusBadge[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  supplierBar: { width: 6 },
  body: { flex: 1, padding: theme.spacing.md, gap: theme.spacing.sm },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  dismissShortageBtn: {
    padding: 2,
    borderRadius: theme.radius.sm,
  },
  dismissShortagePressed: { opacity: 0.75 },
  dismissShortageMuted: { opacity: 0.45 },
  title: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    textAlign: "left",
    flex: 1,
  },
  author: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  cellName: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    textAlign: "left",
  },
  missingCount: {
    ...theme.typography.labelMd,
    color: theme.colors.error,
    textAlign: "left",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  stat: { gap: 2 },
  stockStepper: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.full,
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 2,
  },
  stockStepperDisabled: { opacity: 0.55 },
  stockBtn: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  stockBtnDisabled: { opacity: 0.45 },
  stockBtnPressed: { backgroundColor: theme.colors.surfaceContainerHigh },
  stockValue: {
    ...theme.typography.headlineSm,
    color: theme.colors.primary,
    minWidth: 28,
    textAlign: "center",
    paddingHorizontal: theme.spacing.xs,
  },
  stockValueBusy: {
    minWidth: 28,
    marginHorizontal: theme.spacing.xs,
  },
  statsDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.outlineVariant,
  },
  priceBlock: { gap: theme.spacing.xs },
  priceLabel: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  pricePrefix: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurface,
  },
  priceInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    borderRadius: theme.radius.md,
    paddingVertical: Platform.OS === "ios" ? theme.spacing.sm : theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLow,
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  priceInputMuted: { opacity: 0.55 },
  applyPriceBtn: {
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.secondaryContainer,
    borderRadius: theme.radius.md,
  },
  applyPriceBtnPressed: { opacity: 0.88 },
  applyPriceBtnMuted: { opacity: 0.45 },
  applyPriceText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
  },
  applyPriceTextMuted: { color: theme.colors.onSurfaceVariant },
  actionsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  completeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm + 2,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
  },
  completeBtnPressed: { opacity: 0.88 },
  actionBtnMuted: { opacity: 0.45 },
  completeBtnNoStock: {
    borderColor: theme.colors.outlineVariant,
  },
  completeBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.secondary,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  completeBtnTextMuted: { color: theme.colors.onSurfaceVariant },
  statLabel: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  statValue: {
    ...theme.typography.headlineSm,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  statValueAccent: { color: theme.colors.primary },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  badgeText: {
    ...theme.typography.labelMd,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  moveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm + 2,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
  },
  moveBtnPressed: { opacity: 0.85 },
  moveBtnDisabled: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  moveBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  moveBtnTextDisabled: { color: theme.colors.onSurfaceVariant },
});
