import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import ChatAvatar from './ChatAvatar';
import { Colors, Spacing, FontSize } from '../theme/colors';
import {
  chatPartyName,
  chatPartySubtitle,
  formatConversationTimestamp,
} from '../utils/helpers';
import type { Admin, Contractor, Worker } from '../types';

const AVATAR_SIZE = 52;

interface Props {
  /** The other participant, resolved relative to the logged-in user. */
  otherUser: Worker | Contractor | Admin | undefined;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  onPress: () => void;
}

/** One row in the conversations inbox — identical for the worker and the
 *  contractor side. Three clear columns (RTL): avatar on the right, the
 *  name / subtitle / preview block in the middle, and the timestamp +
 *  unread badge on the left. Every column has its own space and gap, so a
 *  name and a time can never collide ("משה לוי10:32"). */
const ConversationListItem: React.FC<Props> = ({
  otherUser,
  lastMessage,
  lastMessageAt,
  unreadCount,
  onPress,
}) => {
  const name = chatPartyName(otherUser);
  const subtitle = chatPartySubtitle(otherUser);
  const hasUnread = unreadCount > 0;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <ChatAvatar user={otherUser} size={AVATAR_SIZE} />

      <View style={styles.center}>
        <Text
          style={[styles.name, hasUnread && styles.nameUnread]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        <Text
          style={[styles.preview, hasUnread && styles.previewUnread]}
          numberOfLines={2}
        >
          {lastMessage || 'אין הודעות עדיין'}
        </Text>
      </View>

      <View style={styles.meta}>
        <Text style={styles.time}>
          {formatConversationTimestamp(lastMessageAt)}
        </Text>
        {hasUnread && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },

  center: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  nameUnread: {
    fontWeight: '800',
  },
  subtitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 1,
  },
  preview: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
    marginTop: 3,
  },
  previewUnread: {
    color: Colors.text,
  },

  meta: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  time: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
});

export default ConversationListItem;
