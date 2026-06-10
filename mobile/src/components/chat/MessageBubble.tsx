import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ChatMessageView } from "@avihay-books/shared";
import { wa } from "./waTheme";
import { formatTime, messagePreview } from "./chatFormat";

interface Props {
  message: ChatMessageView;
}

function MessageBubbleBase({ message }: Props): JSX.Element {
  const isOut = message.direction === "out";
  const text = messagePreview(message.msg_type, message.body);

  return (
    <View style={[styles.row, isOut ? styles.rowOut : styles.rowIn]}>
      <View style={[styles.bubble, isOut ? styles.bubbleOut : styles.bubbleIn]}>
        <Text style={styles.text}>{text}</Text>
        <View style={styles.meta}>
          <Text style={styles.time}>{formatTime(message.created_at)}</Text>
          {isOut ? (
            <Ionicons name="checkmark-done" size={14} color={wa.link} style={styles.tick} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleBase);

const styles = StyleSheet.create({
  row: {
    width: "100%",
    paddingHorizontal: 10,
    marginVertical: 2,
    flexDirection: "row",
  },
  rowOut: { justifyContent: "flex-start" },
  rowIn: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 9,
    paddingTop: 6,
    paddingBottom: 5,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleOut: {
    backgroundColor: wa.outBubble,
    borderTopRightRadius: 2,
  },
  bubbleIn: {
    backgroundColor: wa.inBubble,
    borderTopLeftRadius: 2,
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
    color: wa.inkPrimary,
    textAlign: "right",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 3,
    marginTop: 1,
  },
  time: {
    fontSize: 11,
    color: wa.timestamp,
  },
  tick: { marginBottom: 1 },
});
