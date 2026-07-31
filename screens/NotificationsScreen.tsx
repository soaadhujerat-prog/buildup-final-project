import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { AppNotification, NotificationType } from '../types';

interface Props {
  onBack: () => void;
  onNavigate: (type: NotificationType, relatedId?: string) => void;
}

const iconForType = (
  t: NotificationType
): { name: keyof typeof Ionicons.glyphMap; tint: string; bg: string } => {
  switch (t) {
    case 'job_application':
    case 'job_request':
      return { name: 'person-add-outline', tint: Colors.info, bg: '#DBEAFE' };
    case 'application_accepted':
    case 'invitation_accepted':
    case 'job_accepted':
    case 'registration_approved':
    case 'account_unblocked':
      return {
        name: 'checkmark-circle-outline',
        tint: Colors.success,
        bg: '#DCFCE7',
      };
    case 'application_rejected':
    case 'invitation_declined':
    case 'job_rejected':
    case 'registration_rejected':
    case 'account_blocked':
      return {
        name: 'close-circle-outline',
        tint: Colors.danger,
        bg: '#FEE2E2',
      };
    case 'invitation_received':
      return {
        name: 'paper-plane-outline',
        tint: Colors.primary,
        bg: Colors.primaryFaint,
      };
    case 'new_message':
      return {
        name: 'chatbubble-outline',
        tint: Colors.secondary,
        bg: '#DBEAFE',
      };
    case 'review':
      return { name: 'star-outline', tint: Colors.warning, bg: '#FEF3C7' };
    case 'support_response':
    case 'new_support_ticket':
      return {
        name: 'help-buoy-outline',
        tint: Colors.info,
        bg: '#DBEAFE',
      };
    case 'new_pending_registration':
      return {
        name: 'document-text-outline',
        tint: Colors.warning,
        bg: '#FEF3C7',
      };
    default:
      return {
        name: 'notifications-outline',
        tint: Colors.textSecondary,
        bg: Colors.gray100,
      };
  }
};

const NotificationsScreen: React.FC<Props> = ({ onBack, onNavigate }) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useApp();

  const myNotifications = useMemo(() => {
    if (!currentUser) return [];
    return notifications
      .filter((n) => n.userId === currentUser.id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [notifications, currentUser]);

  const unreadCount = myNotifications.filter((n) => !n.isRead).length;

  const handleTap = (n: AppNotification) => {
    if (!n.isRead) markNotificationRead(n.id);
    onNavigate(n.type, n.relatedId);
  };

  const handleMarkAll = () => {
    if (currentUser) markAllNotificationsRead(currentUser.id);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>התראות</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={handleMarkAll}
            style={styles.markAllBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.markAllText}>סמן הכל</Text>
          </TouchableOpacity>
        )}
      </View>

      {myNotifications.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="notifications-outline"
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>אין התראות</Text>
          <Text style={styles.emptySub}>
            התראות חדשות יופיעו כאן ברגע שיהיו עדכונים.
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={myNotifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingTop: Spacing.md }}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          renderItem={({ item }) => {
            const { name, tint, bg } = iconForType(item.type);
            return (
              <TouchableOpacity
                style={[styles.row, !item.isRead && styles.rowUnread]}
                onPress={() => handleTap(item)}
                activeOpacity={0.85}
              >
                <View style={[styles.icon, { backgroundColor: bg }]}>
                  <Ionicons name={name} size={20} color={tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    {!item.isRead && <View style={styles.unreadDot} />}
                    <Text style={styles.title} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </View>
                  <Text style={styles.body} numberOfLines={2}>
                    {item.body}
                  </Text>
                  <Text style={styles.time}>
                    {new Date(item.createdAt).toLocaleString('he-IL', {
                      day: 'numeric',
                      month: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-back"
                  size={16}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headerBar: {
    position: 'relative',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    position: 'absolute',
    right: Spacing.lg,
    top: Spacing.md,
    padding: 4,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  markAllBtn: {
    position: 'absolute',
    left: Spacing.lg,
    top: Spacing.md + 2,
    padding: 4,
  },
  markAllText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  results: {
    flex: 1,
  },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.md,
    gap: Spacing.md,
    ...Shadow.small,
  },
  rowUnread: { backgroundColor: Colors.primaryFaint },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
    flexShrink: 1,
  },
  body: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
    lineHeight: 18,
  },
  time: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'ltr',
    marginTop: 4,
  },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: 8,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
    marginTop: 8,
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
});

export default NotificationsScreen;
