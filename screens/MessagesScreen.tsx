import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, FontSize } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { getOtherParticipantId } from '../services/conversationService';
import EmptyState from '../components/EmptyState';
import ConversationListItem from '../components/ConversationListItem';
import { Conversation } from '../types';

interface Props {
  onBack: () => void;
  onOpenConversation: (conversationId: string) => void;
}

const AVATAR_SIZE = 52;

const MessagesScreen: React.FC<Props> = ({ onBack, onOpenConversation }) => {
  const insets = useSafeAreaInsets();
  const { currentUser, conversations, getUserById } = useApp();

  // A conversation is "mine" whenever I'm one of its two participantIds.
  // Ordered by the real last-message time (lastMessageAt DESC), the same
  // source-of-truth field the rest of the app uses — so sending a message
  // bumps that thread straight to the top. Sorting a copy, never mutating
  // the context array.
  const myConversations: Conversation[] = useMemo(() => {
    if (!currentUser) return [];
    return conversations
      .filter((c) => c.participantIds.includes(currentUser.id))
      .slice()
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
  }, [conversations, currentUser]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">
          הודעות
        </Text>
      </View>

      {myConversations.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="אין שיחות עדיין"
          description="השיחות שלך עם קבלנים ועובדים יופיעו כאן."
        />
      ) : (
        <FlatList
          style={styles.list}
          data={myConversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingVertical: Spacing.sm }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            // Resolve the *other* party relative to whoever is logged in —
            // never a fixed field, so this is correct for both sides.
            const otherId = currentUser
              ? getOtherParticipantId(item, currentUser.id)
              : undefined;
            const other = otherId ? getUserById(otherId) : undefined;

            return (
              <ConversationListItem
                otherUser={other}
                lastMessage={item.lastMessage}
                lastMessageAt={item.lastMessageAt}
                unreadCount={item.unreadCount}
                onPress={() => onOpenConversation(item.id)}
              />
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

  list: {
    flex: 1,
  },
  sep: {
    height: 1,
    backgroundColor: Colors.border,
    marginRight: Spacing.lg + AVATAR_SIZE + Spacing.md,
  },
});

export default MessagesScreen;
