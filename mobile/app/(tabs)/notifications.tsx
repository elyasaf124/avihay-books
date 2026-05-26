import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NotificationListItem } from "@avihay-books/shared";
import { theme } from "../../src/theme";
import { he } from "../../src/i18n/he";
import {
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useRunNotificationChecks,
} from "../../src/api/notifications";
import { mockNotifications } from "../../src/mocks/notifications";
import { NotificationRow } from "../../src/components/notifications/NotificationRow";

interface Section {
  key: "unread" | "read";
  title: string;
  data: NotificationListItem[];
}

function cloneMockNotifications(): NotificationListItem[] {
  return mockNotifications.map((n) => ({ ...n }));
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), template);
}

export default function NotificationsScreen(): JSX.Element {
  const listQuery = useNotifications();
  useFocusEffect(
    useCallback(() => {
      void listQuery.refetch();
    }, [listQuery.refetch]),
  );
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const deleteNotif = useDeleteNotification();
  const runChecks = useRunNotificationChecks();

  /** עותק מקומי של `mock` לסימון כנקרא כשלא מציגים נתונים מהשרת */
  const [mockItems, setMockItems] = useState<NotificationListItem[]>(cloneMockNotifications);

  const isOffline = listQuery.isError;
  /**
   * `isFetched` עדיף על `isSuccess` לכפתור «בדוק התראות»: אחרי fetch שחזר רשימה ריקה או אחרי ריענון,
   * חלק מגרסאות/מצבי TanStack משאירים את הכפתור מנוטרל אם נשענים רק על `isSuccess`.
   */
  const hasServerNotifications = listQuery.isFetched && !isOffline;

  /** נתוני שרת אם יש; אחרת `mock` עם עדכונים מקומיים */
  const notifications: NotificationListItem[] = useMemo(() => {
    if (hasServerNotifications) return listQuery.data!;
    return mockItems;
  }, [hasServerNotifications, listQuery.data, mockItems]);

  const sections: Section[] = useMemo(() => {
    const unread = notifications.filter((n) => !n.is_read);
    const read = notifications.filter((n) => n.is_read);
    const out: Section[] = [];
    if (unread.length > 0)
      out.push({ key: "unread", title: he.notifications.groups.unread, data: unread });
    if (read.length > 0) out.push({ key: "read", title: he.notifications.groups.read, data: read });
    return out;
  }, [notifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

  const onMarkRead = useCallback(
    (id: string) => {
      if (hasServerNotifications) markRead.mutate(id);
      else setMockItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    },
    [markRead, hasServerNotifications],
  );

  const onMarkAllRead = useCallback(() => {
    if (unreadCount === 0) return;
    if (hasServerNotifications) markAll.mutate();
    else setMockItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [markAll, hasServerNotifications, unreadCount]);

  const onDelete = useCallback(
    (id: string) => {
      if (hasServerNotifications) deleteNotif.mutate(id);
      else setMockItems((prev) => prev.filter((n) => n.id !== id));
    },
    [deleteNotif, hasServerNotifications],
  );

  const onRunChecks = useCallback(() => {
    if (!hasServerNotifications || runChecks.isPending) return;
    runChecks.mutate(undefined, {
      onError: (err: Error) => {
        Alert.alert(he.generic.errorTitle, err.message || String(err));
      },
    });
  }, [runChecks, hasServerNotifications]);

  const lastRun = runChecks.isSuccess ? runChecks.data : undefined;
  const totalCreatedLastRun =
    lastRun == null
      ? 0
      : lastRun.low_stock_created +
        lastRun.remove_from_display_created +
        lastRun.supplier_reorder_reminder_created +
        lastRun.orders_without_supplier_created;

  const refreshing = listQuery.isFetching && !listQuery.isLoading;
  const isInitialLoading = listQuery.isLoading && !isOffline;

  return (
    <View style={styles.screen}>
      {isOffline ? (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.onErrorContainer} />
          <Text style={styles.offlineText}>{he.notifications.offlineBanner}</Text>
        </View>
      ) : null}

      <View style={styles.summary}>
        <View style={styles.summaryLeading}>
          <Text style={styles.summaryLabel}>{he.notifications.unread}</Text>
          <Text style={styles.summaryValue}>{unreadCount}</Text>
        </View>
        <View style={styles.summaryActions}>
          <Pressable
            onPress={onRunChecks}
            disabled={!hasServerNotifications || runChecks.isPending}
            style={({ pressed }) => [
              styles.secondaryBtn,
              (!hasServerNotifications || runChecks.isPending) && styles.btnDisabled,
              pressed && styles.btnPressed,
            ]}
          >
            <Ionicons name="search" size={16} color={theme.colors.primary} />
            <Text style={styles.secondaryBtnText}>{he.notifications.runChecks}</Text>
          </Pressable>
          <Pressable
            onPress={onMarkAllRead}
            disabled={unreadCount === 0 || (hasServerNotifications && markAll.isPending)}
            style={({ pressed }) => [
              styles.primaryBtn,
              (unreadCount === 0 || (hasServerNotifications && markAll.isPending)) &&
                styles.btnDisabled,
              pressed && styles.btnPressed,
            ]}
          >
            <Ionicons name="checkmark-done" size={16} color={theme.colors.onPrimary} />
            <Text style={styles.primaryBtnText}>{he.notifications.markAllRead}</Text>
          </Pressable>
        </View>
      </View>

      {hasServerNotifications && lastRun != null ? (
        <View style={styles.checkRunSummary}>
          <Text style={styles.checkRunSummaryText}>
            {totalCreatedLastRun > 0
              ? interpolate(he.notifications.summaryRefreshed, {
                  count: String(totalCreatedLastRun),
                })
              : he.notifications.summaryNothingNew}
          </Text>
          <Text style={styles.checkRunSummaryDetail}>
            {interpolate(he.notifications.checkSummaryRemoveDisplay, {
              after: lastRun.remove_from_display_after ?? "—",
              candidates: String(lastRun.remove_from_display_candidate_count ?? 0),
              created: String(lastRun.remove_from_display_created ?? 0),
            })}
          </Text>
          {(lastRun.remove_from_display_candidate_count ?? 0) > 0 &&
          (lastRun.remove_from_display_created ?? 0) === 0 ? (
            <Text style={styles.checkRunSummaryHint}>{he.notifications.checkSummaryRemoveDisplayDedup}</Text>
          ) : null}
        </View>
      ) : null}

      {notifications.length > 0 ? (
        <View style={styles.swipeHintBar}>
          <Ionicons name="hand-left-outline" size={14} color={theme.colors.onSurfaceVariant} />
          <Text style={styles.swipeHintText}>{he.notifications.swipeHint}</Text>
        </View>
      ) : null}

      {isInitialLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loadingText}>{he.notifications.loading}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>
              {section.title} · {section.data.length}
            </Text>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSep} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void listQuery.refetch()}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={36} color={theme.colors.primary} />
              <Text style={styles.emptyText}>{he.notifications.empty}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <NotificationRow
              notification={item}
              onMarkRead={onMarkRead}
              onDelete={onDelete}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  offlineBanner: {
    marginHorizontal: theme.spacing.marginMobile,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.errorContainer,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  offlineText: {
    ...theme.typography.labelMd,
    color: theme.colors.onErrorContainer,
    flex: 1,
    textAlign: "left",
  },
  summary: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: theme.spacing.sm,
  },
  summaryLeading: { gap: 2 },
  summaryLabel: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  summaryValue: {
    ...theme.typography.display,
    fontSize: 32,
    lineHeight: 36,
    color: theme.colors.primary,
    textAlign: "left",
  },
  summaryActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-start",
    flexWrap: "wrap",
  },
  checkRunSummary: {
    marginHorizontal: theme.spacing.marginMobile,
    marginTop: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
    gap: theme.spacing.xs,
  },
  checkRunSummaryText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurface,
    textAlign: "left",
  },
  checkRunSummaryDetail: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  checkRunSummaryHint: {
    ...theme.typography.caption,
    color: theme.colors.primary,
    textAlign: "left",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
  },
  primaryBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimary,
    fontSize: 12,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  secondaryBtnText: {
    ...theme.typography.labelMd,
    color: theme.colors.primary,
    fontSize: 12,
  },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.8 },
  swipeHintBar: {
    marginHorizontal: theme.spacing.marginMobile,
    paddingVertical: theme.spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  swipeHintText: {
    ...theme.typography.caption,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
  },
  list: {
    paddingHorizontal: theme.spacing.marginMobile,
    paddingBottom: theme.spacing.xl,
  },
  sep: { height: theme.spacing.sm },
  sectionSep: { height: theme.spacing.md },
  sectionHeader: {
    ...theme.typography.labelMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "left",
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  loadingText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
  },
  empty: {
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceContainerLowest,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.outlineVariant,
  },
  emptyText: {
    ...theme.typography.bodyMd,
    color: theme.colors.onSurfaceVariant,
    textAlign: "center",
  },
});
