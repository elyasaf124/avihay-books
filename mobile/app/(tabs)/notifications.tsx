import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

export default function NotificationsScreen(): JSX.Element {
  const listQuery = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const deleteNotif = useDeleteNotification();
  const runChecks = useRunNotificationChecks();

  /** עותק מקומי של `mock` לסימון כנקרא כשלא מציגים נתונים מהשרת */
  const [mockItems, setMockItems] = useState<NotificationListItem[]>(cloneMockNotifications);

  const isOffline = listQuery.isError;
  const hasServerNotifications = Boolean(listQuery.data && listQuery.data.length > 0 && !isOffline);

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
    runChecks.mutate();
  }, [runChecks, hasServerNotifications]);

  const refreshing = listQuery.isFetching && !listQuery.isLoading;
  const isInitialLoading = listQuery.isLoading && !isOffline;

  const showMockBanner = listQuery.isSuccess && !hasServerNotifications && !isOffline;

  return (
    <View style={styles.screen}>
      {isOffline ? (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.onErrorContainer} />
          <Text style={styles.offlineText}>{he.notifications.offlineBanner}</Text>
        </View>
      ) : null}

      {showMockBanner ? (
        <View style={styles.mockBanner}>
          <Ionicons name="information-circle-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.mockBannerText}>{he.notifications.mockBanner}</Text>
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
  mockBanner: {
    marginHorizontal: theme.spacing.marginMobile,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.primaryFixed,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.primaryFixedDim,
  },
  mockBannerText: {
    ...theme.typography.labelMd,
    color: theme.colors.onPrimaryFixedVariant,
    flex: 1,
    fontSize: 12,
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
