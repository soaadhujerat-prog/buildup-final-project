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

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { getOtherParticipantId } from '../services/conversationService';

interface Props {
  conversationId: string;
  onBack: () => void;
}

const ChatScreen: React.FC<Props> = ({ conversationId, onBack }) => {
  const insets = useSafeAreaInsets();
  const { currentUser, conversations, getUserById, sendMessage } = useApp();
  const scrollRef = useRef<ScrollView>(null);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [conversation?.messages.length]);

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
  const otherIsContractor = other?.role === 'contractor';

  const handleSend = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(false);
    try {
      sendMessage(conversationId, currentUser.id, text);
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
      <View style={[styles.headerBar, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {other?.fullName ?? 'משתמש'}
          </Text>
          {other?.role === 'worker' && (
            <Text style={styles.headerSub} numberOfLines={1}>
              {other.profession}
            </Text>
          )}
        </View>
        <View
          style={[
            styles.headerAvatar,
            otherIsContractor
              ? { backgroundColor: '#DBEAFE' }
              : { backgroundColor: Colors.primaryFaint },
          ]}
        >
          <Ionicons
            name={otherIsContractor ? 'business' : 'hammer'}
            size={20}
            color={otherIsContractor ? Colors.secondary : Colors.primary}
          />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.messagesContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {conversation.messages.length === 0 && (
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
        {conversation.messages.map((m, idx) => {
          // For demo, treat the participant as the "other" and any message
          // sender that's not the current user as theirs.
          const isMine = m.senderId === currentUser.id;
          const showDate =
            idx === 0 ||
            new Date(conversation.messages[idx - 1].timestamp).toDateString() !==
              new Date(m.timestamp).toDateString();
          return (
            <View key={m.id}>
              {showDate && (
                <View style={styles.dateBadge}>
                  <Text style={styles.dateText}>
                    {new Date(m.timestamp).toLocaleDateString('he-IL')}
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.bubbleRow,
                  isMine ? styles.bubbleRowMine : styles.bubbleRowOther,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    isMine ? styles.bubbleMine : styles.bubbleOther,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      isMine && styles.bubbleTextMine,
                    ]}
                  >
                    {m.content}
                  </Text>
                  <Text
                    style={[
                      styles.bubbleTime,
                      isMine && styles.bubbleTimeMine,
                    ]}
                  >
                    {new Date(m.timestamp).toLocaleTimeString('he-IL', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
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

  headerBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, alignItems: 'flex-end' },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  messagesContainer: {
    padding: Spacing.lg,
    gap: 8,
  },
  emptyChat: {
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
  dateBadge: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
    marginVertical: 8,
  },
  dateText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },

  bubbleRow: { flexDirection: 'row-reverse' },
  bubbleRowMine: { justifyContent: 'flex-start' },
  bubbleRowOther: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    ...Shadow.small,
  },
  bubbleMine: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  bubbleTextMine: { color: Colors.white },
  bubbleTime: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'left',
    marginTop: 2,
  },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.85)' },

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
