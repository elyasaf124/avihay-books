import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ChatConversation } from "@avihay-books/shared";
import { he } from "../../i18n/he";
import { wa, avatarColor, avatarInitial } from "./waTheme";
import { formatListTime, messagePreview } from "./chatFormat";

interface Props {
  conversation: ChatConversation;
  onPress: (phone: string) => void;
  onLongPress?: (phone: string) => void;
}

function ConversationRowBase({ conversation, onPress, onLongPress }: Props): JSX.Element {
  const {
    phone_number,
    profile_name,
    last_message_body,
    last_message_type,
    last_message_direction,
    last_message_at,
    unread_count,
    bot_paused,
  } = conversation;

  const title = (profile_name ?? "").trim() || phone_number;
  const hasUnread = unread_count > 0;
  const preview = messagePreview(last_message_type, last_message_body);
  const isOutgoing = last_message_direction === "out";

  return (
    <Pressable
      onPress={() => onPress(phone_number)}
      onLongPress={() => onLongPress?.(phone_number)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={onLongPress ? he.chat.deleteConfirmTitle : undefined}
    >
      <View style={[styles.avatar, { backgroundColor: avatarColor(phone_number) }]}>
        <Text style={styles.avatarText}>{avatarInitial(profile_name, phone_number)}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.time, hasUnread && styles.timeUnread]}>
            {formatListTime(last_message_at)}
          </Text>
        </View>

        <View style={styles.bottomLine}>
          <View style={styles.previewWrap}>
            {isOutgoing ? (
              <Ionicons
                name="checkmark-done"
                size={15}
                color={wa.link}
                style={styles.previewTick}
              />
            ) : null}
            <Text style={styles.preview} numberOfLines={1}>
              {preview}
            </Text>
          </View>

          <View style={styles.trailing}>
            {bot_paused ? (
              <View style={styles.humanTag}>
                <Ionicons name="person" size={10} color={wa.header} />
                <Text style={styles.humanTagText}>{he.chat.humanActive}</Text>
              </View>
            ) : null}
            {hasUnread ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread_count > 99 ? "99+" : unread_count}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export const ConversationRow = memo(ConversationRowBase);

const AVATAR = 52;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 14,
    backgroundColor: wa.listBg,
  },
  pressed: { backgroundColor: "#F5F6F6" },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
  body: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: wa.divider,
    paddingBottom: 10,
    gap: 4,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: wa.inkPrimary,
    textAlign: "left",
  },
  time: {
    fontSize: 12,
    color: wa.timestamp,
  },
  timeUnread: {
    color: wa.unreadBadge,
    fontWeight: "700",
  },
  bottomLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  previewWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewTick: { marginTop: 1 },
  preview: {
    flex: 1,
    fontSize: 14,
    color: wa.inkSecondary,
    textAlign: "left",
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  humanTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#E7F8F0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  humanTagText: {
    fontSize: 10,
    color: wa.header,
    fontWeight: "600",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: wa.unreadBadge,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: wa.unreadText,
    fontSize: 12,
    fontWeight: "700",
  },
});
