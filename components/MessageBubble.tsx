import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message } from '../types';
import { Colors, Spacing, FontSize } from '../theme/colors';
import { formatMessageTime } from '../utils/helpers';

interface MessageBubbleProps {
  message: Message;
  /** True when the current user sent this message. Drives which side the
   *  bubble sits on and its colour — never re-derives sender/receiver. */
  isMine: boolean;
}

/** One chat message, presentation only. Shared by the worker and contractor
 *  chat screens so both sides render messages identically.
 *
 *  mine  → BuildUp brown background, white text, pinned to the right.
 *  other → white card, dark text, pinned to the left.
 *
 *  The screen is not force-RTL (I18nManager.isRTL === false), so plain
 *  `row` + flex-end/flex-start map directly to visual right/left. Text wraps
 *  naturally; the bubble is capped at 78% of the row so long Hebrew messages
 *  never run off-screen on either iOS or Android. */
const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isMine }) => (
  <View style={[styles.row, isMine ? styles.rowMine : styles.rowOther]}>
    <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
      <Text style={[styles.text, isMine ? styles.textMine : styles.textOther]}>
        {message.content}
      </Text>
      <Text style={[styles.time, isMine ? styles.timeMine : styles.timeOther]}>
        {formatMessageTime(message.timestamp)}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 3,
    paddingHorizontal: Spacing.xs,
  },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },

  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleMine: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  text: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  textMine: { color: Colors.white },
  textOther: { color: Colors.text },

  time: {
    fontSize: 10,
    marginTop: 3,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  timeMine: { color: 'rgba(255,255,255,0.85)' },
  timeOther: { color: Colors.textMuted },
});

export default MessageBubble;
