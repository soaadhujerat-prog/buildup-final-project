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
import { getOtherParticipantId } from '../services/conversationService';
import { formatConversationTime } from '../utils/helpers';
import { Conversation, Worker } from '../types';

interface Props {
  onBack: () => void;
  onOpenConversation: (conversationId: string) => void;
}

const MessagesScreen: React.FC<Props> = ({ onBack, onOpenConversation }) => {
  const insets = useSafeAreaInsets();
  const { currentUser, conversations, getUserById } = useApp();

  // A conversation is "mine" whenever I'm one of its two participantIds —
  // no more guessing from message contents. Sorted newest-first so sending a
  // message bumps that conversation straight to the top.
  const myConversations: Conversation[] = useMemo(() => {
    if (!currentUser) return [];
    return conversations
      .filter((c) => c.participantIds.includes(currentUser.id))
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
  }, [conversations, currentUser]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>הודעות</Text>
      </View>

      {myConversations.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="chatbubbles-outline"
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>אין שיחות</Text>
          <Text style={styles.emptySub}>
            הודעות יתחילו להופיע כאן כשתחל בתקשורת עם משתמשים.
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={myConversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingTop: Spacing.md }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            // Resolve the *other* party relative to whoever is logged in —
            // never a fixed field, so this is correct for both sides.
            const otherId = currentUser
              ? getOtherParticipantId(item, currentUser.id)
              : undefined;
            const other = otherId ? getUserById(otherId) : undefined;
            const otherIsContractor = other?.role === 'contractor';
            const otherProfession =
              other?.role === 'worker' ? (other as Worker).profession : undefined;

            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => onOpenConversation(item.id)}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.avatar,
                    otherIsContractor
                      ? { backgroundColor: '#DBEAFE' }
                      : { backgroundColor: Colors.primaryFaint },
                  ]}
                >
                  <Ionicons
                    name={otherIsContractor ? 'business' : 'hammer'}
                    size={22}
                    color={
                      otherIsContractor ? Colors.secondary : Colors.primary
                    }
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <View style={styles.headRow}>
                    <Text style={styles.timeText}>
                      {formatConversationTime(item.lastMessageAt)}
                    </Text>
                    <Text style={styles.name} numberOfLines={1}>
                      {other?.fullName ?? 'משתמש'}
                    </Text>
                  </View>
                  {otherProfession && (
                    <Text style={styles.profession} numberOfLines={1}>
                      {otherProfession}
                    </Text>
                  )}
                  <Text style={styles.lastMsg} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                </View>

                {item.unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unreadCount}</Text>
                  </View>
                )}
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

  results: {
    flex: 1,
  },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
    flex: 1,
    textAlign: 'right',
  },
  timeText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'ltr',
  },
  profession: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'right',
    marginTop: 2,
  },
  lastMsg: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'right',
    marginTop: 2,
  },

  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: '800',
  },

  sep: {
    height: 1,
    backgroundColor: Colors.border,
    marginRight: Spacing.lg + 48 + Spacing.md,
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

export default MessagesScreen;
