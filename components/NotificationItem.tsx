import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Notification } from '../types';
import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import {
  getNotificationIcon,
  getTimeAgo,
} from '../utils/helpers';

interface NotificationItemProps {
  notification: Notification;
  onPress?: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  job_request: Colors.primary,
  job_accepted: Colors.success,
  job_rejected: Colors.danger,
  new_message: Colors.info,
  review: Colors.warning,
  system: Colors.secondary,
};

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onPress,
}) => {
  const iconName = getNotificationIcon(notification.type);
  const iconColor = TYPE_COLORS[notification.type] || Colors.secondary;

  return (
    <TouchableOpacity
      style={[styles.container, !notification.isRead && styles.unread]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.row}>
        <View style={[styles.iconContainer, { backgroundColor: iconColor + '18' }]}>
          <Ionicons name={iconName as any} size={22} color={iconColor} />
        </View>

        <View style={styles.content}>
          <Text
            style={[styles.title, !notification.isRead && styles.titleBold]}
            numberOfLines={1}
          >
            {notification.title}
          </Text>

          <Text style={styles.body} numberOfLines={2}>
            {notification.body}
          </Text>

          <Text style={styles.time}>{getTimeAgo(notification.createdAt)}</Text>
        </View>

        {!notification.isRead && <View style={styles.unreadDot} />}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },

  unread: {
    backgroundColor: Colors.primaryFaint,
  },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },

  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  content: {
    flex: 1,
    alignItems: 'flex-end',
  },

  title: {
    width: '100%',
    fontSize: FontSize.md,
    color: Colors.text,
    marginBottom: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  titleBold: {
    fontWeight: '700',
  },

  body: {
    width: '100%',
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 21,
    marginBottom: 6,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  time: {
    width: '100%',
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    marginTop: 8,
    flexShrink: 0,
  },
});

export default NotificationItem;