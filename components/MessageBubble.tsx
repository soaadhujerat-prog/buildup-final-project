import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message } from '../types';
import { Colors, Spacing, Radius, FontSize } from '../theme/colors';

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isMine }) => {
  return (
    <View style={[styles.wrapper, isMine ? styles.wrapperMine : styles.wrapperTheirs]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.content, isMine ? styles.contentMine : styles.contentTheirs]}>
          {message.content}
        </Text>

        <View style={[styles.meta, isMine ? styles.metaMine : styles.metaTheirs]}>
          {isMine && (
            <Ionicons
              name={message.isRead ? 'checkmark-done' : 'checkmark'}
              size={12}
              color={message.isRead ? '#93C5FD' : 'rgba(255,255,255,0.7)'}
            />
          )}

          <Text style={[styles.time, isMine ? styles.timeMine : styles.timeTheirs]}>
            {message.timestamp}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    paddingHorizontal: Spacing.lg,
    marginVertical: 4,
  },

  wrapperMine: {
    alignItems: 'flex-end',
  },

  wrapperTheirs: {
    alignItems: 'flex-start',
  },

  bubble: {
    maxWidth: '78%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
  },

  bubbleMine: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 6,
  },

  bubbleTheirs: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },

  content: {
    fontSize: FontSize.md,
    lineHeight: 24,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  contentMine: {
    color: Colors.white,
  },

  contentTheirs: {
    color: Colors.text,
  },

  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },

  metaMine: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },

  metaTheirs: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
  },

  time: {
    fontSize: FontSize.xs,
  },

  timeMine: {
    color: 'rgba(255,255,255,0.78)',
  },

  timeTheirs: {
    color: Colors.textMuted,
  },
});

export default MessageBubble;