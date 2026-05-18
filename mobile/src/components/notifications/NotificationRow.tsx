import { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Swipeable from "react-native-gesture-handler/Swipeable";
import type { NotificationListItem, NotificationType } from "@avihay-books/shared";
import { theme } from "../../theme";
import { he } from "../../i18n/he";

interface Props {
  notification: NotificationListItem;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}

const TYPE_TO_ICON: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  low_stock: "alert-circle",
  remove_from_display: "eye-off",
  supplier_reorder_reminder: "time",
};

/**
 * שורה בודדת ב־`Notifications screen`:
 * - אייקון לפי סוג ההתראה (`low_stock` / `remove_from_display` / `supplier_reorder_reminder`).
 * - הודעה + מטא־דאטה של ספר/ספק.
 * - נקודת «טרם נקרא» אדומה כאשר `is_read = false`.
 * - `Swipeable`: החלקה שמאלה חושפת «סמן כנקרא» כשהתראה טרם נקראה; החלקה ימינה
 *   חושפת «מחק» בכל מצב. הקשה על התראה שלא נקראה מסמנת כנקראה.
 */
export function NotificationRow({ notification, onMarkRead, onDelete }: Props): JSX.Element {
  const swipeableRef = useRef<Swipeable | null>(null);
  const isUnread = !notification.is_read;

  const accentColor = notification.supplier_color ?? typeAccent(notification.type);

  const handleMarkRead = (): void => {
    if (!isUnread) return;
    swipeableRef.current?.close();
    onMarkRead(notification.id);
  };

  const handleDelete = (): void => {
    swipeableRef.current?.close();
    onDelete(notification.id);
  };

  const renderLeftActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    drag: Animated.AnimatedInterpolation<number>,
  ): JSX.Element => {
    const translate = drag.interpolate({
      inputRange: [0, 120],
      outputRange: [-60, 0],
      extrapolate: "clamp",
    });
    return (
      <Animated.View
        style={[styles.swipeActionDelete, styles.swipeActionDeleteFromLeft, { transform: [{ translateX: translate }] }]}
      >
        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [styles.swipeDeleteInner, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={he.notifications.deleteOne}
        >
          <Ionicons name="trash-outline" size={22} color={theme.colors.onErrorContainer} />
          <Text style={styles.swipeActionDeleteText}>{he.notifications.deleteOne}</Text>
        </Pressable>
      </Animated.View>
    );
  };

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    drag: Animated.AnimatedInterpolation<number>,
  ): JSX.Element | null => {
    if (!isUnread) return null;
    const translate = drag.interpolate({
      inputRange: [-120, 0],
      outputRange: [0, 60],
      extrapolate: "clamp",
    });
    return (
      <Animated.View style={[styles.swipeAction, { transform: [{ translateX: translate }] }]}>
        <Ionicons name="checkmark-done" size={22} color={theme.colors.onPrimary} />
        <Text style={styles.swipeActionText}>{he.notifications.markRead}</Text>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={(direction) => {
        if (direction === "right" && isUnread) handleMarkRead();
      }}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
      leftThreshold={48}
      rightThreshold={48}
    >
      <Pressable
        onPress={handleMarkRead}
        style={({ pressed }) => [
          styles.row,
          isUnread ? styles.rowUnread : styles.rowRead,
          pressed && styles.rowPressed,
        ]}
      >
        <View style={[styles.accent, { backgroundColor: accentColor }]} />

        <View style={[styles.iconWrap, { backgroundColor: tintFor(notification.type) }]}>
          <Ionicons
            name={TYPE_TO_ICON[notification.type]}
            size={20}
            color={typeAccent(notification.type)}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.headerRow}>
            <Text style={styles.typeLabel} numberOfLines={1}>
              {he.notifications.types[notification.type]}
            </Text>
            <Text style={styles.timeLabel} numberOfLines={1}>
              {formatRelativeTime(notification.created_at)}
            </Text>
            {isUnread ? <View style={styles.unreadDot} /> : null}
          </View>

          <Text style={[styles.message, isUnread ? styles.messageBold : null]} numberOfLines={3}>
            {notification.message}
          </Text>

          {renderMeta(notification)}
        </View>
      </Pressable>
    </Swipeable>
  );
}

function renderMeta(n: NotificationListItem): JSX.Element | null {
  const parts: string[] = [];
  if (n.book_author) parts.push(n.book_author);
  if (n.supplier_name && !n.book_author) parts.push(n.supplier_name);
  if (typeof n.book_stock_quantity === "number" && typeof n.book_reorder_threshold === "number") {
    parts.push(`מלאי ${n.book_stock_quantity}/${n.book_reorder_threshold}`);
  }
  if (parts.length === 0) return null;
  return (
    <Text style={styles.meta} numberOfLines={1}>
      {parts.join(" · ")}
    </Text>
  );
}

function formatRelativeTime(iso: string): string {
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return "";
  const deltaMin = Math.max(0, Math.round((Date.now() - created) / 60_000));
  if (deltaMin < 1) return he.notifications.relativeTime.now;
  if (deltaMin < 60)
    return he.notifications.relativeTime.minutes.replace("{{n}}", String(deltaMin));
  const hours = Math.round(deltaMin / 60);
  if (hours < 24) return he.notifications.relativeTime.hours.replace("{{n}}", String(hours));
  const days = Math.round(hours / 24);
  return he.notifications.relativeTime.days.replace("{{n}}", String(days));
}

function typeAccent(type: NotificationType): string {
  switch (type) {
    case "low_stock":
      return theme.colors.error;
    case "remove_from_display":
      return theme.colors.tertiaryContainer;
    case "supplier_reorder_reminder":
      return theme.colors.primary;
  }
}

function tintFor(type: NotificationType): string {
  switch (type) {
    case "low_stock":
      return theme.colors.errorContainer;
    case "remove_from_display":
      return theme.colors.tertiaryFixed;
    case "supplier_reorder_reminder":
      return theme.colors.primaryFixed;
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    overflow: "hidden",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
    alignItems: "flex-start",
  },
  rowUnread: { backgroundColor: theme.colors.surface, ...theme.shadow.inset },
  rowRead: { backgroundColor: theme.colors.surfaceContainerLow, opacity: 0.85 },
  rowPressed: { opacity: 0.85 },
  accent: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: 4,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: 4 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  typeLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    textAlign: "left",
    flexShrink: 1,
  },
  timeLabel: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    flex: 1,
    textAlign: "left",
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.error,
  },
  message: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  messageBold: { ...theme.typography.bodyLg, color: theme.colors.onSurface },
  meta: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  swipeAction: {
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    borderTopLeftRadius: theme.radius.xl,
    borderBottomLeftRadius: theme.radius.xl,
    flexDirection: "row",
    gap: theme.spacing.xs,
  },
  swipeActionText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
  },
  swipeActionDelete: {
    backgroundColor: theme.colors.errorContainer,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    flexDirection: "row",
  },
  swipeActionDeleteFromLeft: {
    borderTopRightRadius: theme.radius.xl,
    borderBottomRightRadius: theme.radius.xl,
  },
  swipeDeleteInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  swipeActionDeleteText: {
    ...theme.typography.labelMd,
    color: theme.colors.onErrorContainer,
  },
});
