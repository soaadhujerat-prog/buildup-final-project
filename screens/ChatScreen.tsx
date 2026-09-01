import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { getOtherParticipantId } from '../services/conversationService';
import { formatChatDateSeparator } from '../utils/helpers';
import ChatHeader from '../components/ChatHeader';
import MessageBubble from '../components/MessageBubble';
import ChatDateSeparator from '../components/ChatDateSeparator';

interface Props {
  conversationId: string;
  onBack: () => void;
}

const sameCalendarDay = (a: string, b: string): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString();

const ChatScreen: React.FC<Props> = ({ conversationId, onBack }) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    conversations,
    getUserById,
    sendMessage,
    hydrateConversationMessages,
    setActiveConversation,
  } = useApp();
  const scrollRef = useRef<ScrollView>(null);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  // Oldest → newest, always. Sorted on a COPY so the context's message
  // array is never reordered or mutated.
  const orderedMessages = useMemo(
    () =>
      [...(conversation?.messages ?? [])].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ),
    [conversation?.messages]
  );

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);

  // Load this thread's persisted history from the backend on open / id change,
  // and tell AppContext this thread is active (marks it read now + treats
  // realtime messages that land while it's on screen as already read). On
  // leave, clear the active thread. No-op on the mock path.
  useEffect(() => {
    void hydrateConversationMessages(conversationId);
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, hydrateConversationMessages, setActiveConversation]);

  // Jump to the newest message on open and whenever a message is added.
  useEffect(() => {
    const t = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      80
    );
    return () => clearTimeout(t);
  }, [orderedMessages.length]);

  if (!conversation || !currentUser) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>השיחה לא נמצאה</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const otherId = getOtherParticipantId(conversation, currentUser.id);
  const other = otherId ? getUserById(otherId) : undefined;

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(false);
    try {
      await sendMessage(conversationId, currentUser.id, text);
      setDraft('');
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ChatHeader otherUser={other} topInset={insets.top} onBack={onBack} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messagesContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: false })
        }
      >
        {orderedMessages.length === 0 && (
          <View style={styles.emptyChat}>
            <Ionicons
              name="chatbubbles-outline"
              size={48}
              color={Colors.textMuted}
            />
            <Text style={styles.emptyChatText}>עדיין אין הודעות בשיחה</Text>
            <Text style={styles.emptyChatSub}>
              כתוב הודעה כדי להתחיל את השיחה
            </Text>
          </View>
        )}

        {orderedMessages.map((m, idx) => {
          const prev = orderedMessages[idx - 1];
          const showDate = !prev || !sameCalendarDay(prev.timestamp, m.timestamp);
          return (
            <View key={m.id}>
              {showDate && (
                <ChatDateSeparator label={formatChatDateSeparator(m.timestamp)} />
              )}
              <MessageBubble
                message={m}
                isMine={m.senderId === currentUser.id}
              />
            </View>
          );
        })}
      </ScrollView>

      {sendError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={Colors.danger} />
          <Text style={styles.errorBannerText}>
            שליחת ההודעה נכשלה. נסה שוב.
          </Text>
        </View>
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={[styles.sendBtn, sending && { opacity: 0.6 }]}
          onPress={handleSend}
          activeOpacity={0.85}
          disabled={!draft.trim() || sending}
          accessibilityLabel="שלח הודעה"
        >
          <Ionicons
            name="send"
            size={18}
            color={draft.trim() && !sending ? Colors.white : Colors.textMuted}
          />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="כתוב הודעה..."
          placeholderTextColor={Colors.textMuted}
          multiline
        />
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  messagesContainer: {
    padding: Spacing.lg,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 8,
  },
  emptyChatText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  emptyChatSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    writingDirection: 'rtl',
  },
  errorBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    backgroundColor: '#FEF2F2',
  },
  errorBannerText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    writingDirection: 'rtl',
  },

  inputBar: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notFound: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 60,
  },
  backLink: { alignItems: 'center', marginTop: 12 },
  backLinkText: { color: Colors.primary, fontWeight: '700' },
});

export default ChatScreen;
