import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import {
  supportTicketDisplay,
  supportTicketReceivedLine,
  supportSenderLabel,
  formatDateTime,
} from '../utils/helpers';
import {
  Customer,
  Worker,
  Contractor,
  SupportTicketStatus,
  SupportTicketMessage,
} from '../types';

interface Props {
  ticketId: string;
  onBack: () => void;
  /** Admin-only: open the requester's user card. Absent for non-admin. */
  onOpenUser?: (userId: string) => void;
}

const SupportTicketDetailsScreen: React.FC<Props> = ({
  ticketId,
  onBack,
  onOpenUser,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser, supportTickets, getUserById, replyToTicket, setTicketStatus } =
    useApp();
  const ticket = supportTickets.find((t) => t.id === ticketId);

  const scrollRef = useRef<ScrollView>(null);
  const [reply, setReply] = useState('');

  // One chronological thread: the original ticket text first, then every
  // reply that was appended after it (admin or requester). Nothing is ever
  // overwritten — each turn is its own entry.
  const thread = useMemo<SupportTicketMessage[]>(() => {
    if (!ticket) return [];
    const original: SupportTicketMessage = {
      id: `${ticket.id}-original`,
      ticketId: ticket.id,
      senderId: ticket.userId,
      senderRole: ticket.userRole,
      message: ticket.description,
      createdAt: ticket.createdAt,
    };
    return [original, ...(ticket.messages ?? [])];
  }, [ticket]);

  if (!ticket) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>פנייה לא נמצאה</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isAdmin = currentUser?.role === 'admin';
  const filer = getUserById(ticket.userId) as Customer | undefined;
  const canOpenUser = isAdmin && !!filer && !!onOpenUser;

  // Admin's status-setter offers the 3 user-visible states; each maps to a
  // canonical raw status to persist. 'closed' stays valid in the model (old
  // records keep it) but is folded into "טופל" and never newly set here.
  const STATUS_OPTIONS: { raw: SupportTicketStatus; label: string }[] = [
    { raw: 'open', label: supportTicketDisplay('open').label },
    { raw: 'in_progress', label: supportTicketDisplay('in_progress').label },
    { raw: 'resolved', label: supportTicketDisplay('resolved').label },
  ];
  const typeLabel =
    ticket.type === 'complaint'
      ? 'תלונה'
      : ticket.type === 'claim'
      ? 'תביעה'
      : ticket.type === 'question'
      ? 'שאלה'
      : 'תקלה טכנית';

  const hasAdminReply = (ticket.messages ?? []).some(
    (m) => m.senderRole === 'admin'
  );

  const handleSend = () => {
    const text = reply.trim();
    if (!text) {
      Alert.alert('שגיאה', 'יש לכתוב תגובה לפני שליחה');
      return;
    }
    if (!currentUser) return;
    replyToTicket(
      ticket.id,
      currentUser.id,
      currentUser.role as 'admin' | 'worker' | 'contractor',
      text
    );
    setReply('');
    Keyboard.dismiss();
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true })
    );
  };

  const handleStatus = (raw: SupportTicketStatus) => {
    if (!isAdmin || raw === ticket.status) return;
    setTicketStatus(ticket.id, currentUser?.id ?? 'adm1', raw);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">פרטי פנייה</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{
            padding: Spacing.lg,
            paddingBottom: 40,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Ticket header */}
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <StatusBadge
                label={supportTicketDisplay(ticket.status).label}
                tone={supportTicketDisplay(ticket.status).tone}
                small
              />
              <Text style={styles.heroSubject}>{ticket.subject}</Text>
            </View>
            <View style={styles.heroMeta}>
              <Text style={styles.metaItem}>סוג: {typeLabel}</Text>
            </View>
            <Text style={styles.receivedLine}>
              {supportTicketReceivedLine(ticket.createdAt)}
            </Text>
          </View>

          {/* Requester info — admin only */}
          {isAdmin && filer && (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>הפונה</Text>
              </View>
              <View style={styles.fRow}>
                <Text style={styles.fValue}>{filer.fullName}</Text>
                <Text style={styles.fLabel}>שם</Text>
              </View>
              <View style={styles.fRow}>
                <Text style={styles.fValue}>
                  {ticket.userRole === 'worker' ? 'עובד' : 'קבלן'}
                </Text>
                <Text style={styles.fLabel}>תפקיד</Text>
              </View>
              {filer.role === 'worker' && (
                <View style={styles.fRow}>
                  <Text style={styles.fValue}>
                    {(filer as Worker).profession}
                  </Text>
                  <Text style={styles.fLabel}>מקצוע</Text>
                </View>
              )}
              {filer.role === 'contractor' && (
                <View style={styles.fRow}>
                  <Text style={styles.fValue}>
                    {(filer as Contractor).companyName}
                  </Text>
                  <Text style={styles.fLabel}>חברה</Text>
                </View>
              )}
              <View style={styles.fRow}>
                <Text
                  style={[
                    styles.fValue,
                    { fontFamily: 'monospace', writingDirection: 'ltr' },
                  ]}
                >
                  {filer.idNumber}
                </Text>
                <Text style={styles.fLabel}>ת.ז</Text>
              </View>
              <View style={styles.fRow}>
                <Text style={[styles.fValue, { writingDirection: 'ltr' }]}>
                  {filer.phone}
                </Text>
                <Text style={styles.fLabel}>טלפון</Text>
              </View>
              {canOpenUser && (
                <TouchableOpacity
                  style={styles.userLinkBtn}
                  onPress={() => onOpenUser!(filer.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="person-circle-outline"
                    size={18}
                    color={Colors.primary}
                  />
                  <Text style={styles.userLinkText}>צפה בפרטי המשתמש</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Conversation thread */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>שיחת הפנייה</Text>
            </View>
            {thread.map((m, idx) => {
              const mine = currentUser?.id === m.senderId;
              const fromAdmin = m.senderRole === 'admin';
              return (
                <View
                  key={m.id}
                  style={[
                    styles.bubble,
                    fromAdmin ? styles.bubbleAdmin : styles.bubbleUser,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                    idx === 0 && styles.bubbleOriginal,
                  ]}
                >
                  <View style={styles.bubbleHead}>
                    <Text
                      style={[
                        styles.bubbleSender,
                        fromAdmin && { color: Colors.success },
                      ]}
                    >
                      {supportSenderLabel(m.senderRole)}
                      {idx === 0 ? ' · הפנייה המקורית' : ''}
                    </Text>
                  </View>
                  <Text style={styles.bubbleBody}>{m.message}</Text>
                  <Text style={styles.bubbleTime}>
                    {formatDateTime(m.createdAt)}
                  </Text>
                </View>
              );
            })}

            {!hasAdminReply && !isAdmin && (
              <View style={styles.waitingBox}>
                <Ionicons
                  name="hourglass-outline"
                  size={18}
                  color={Colors.warning}
                />
                <Text style={styles.waitingText}>
                  הפנייה ממתינה לטיפול מנהל המערכת. אפשר להוסיף פרטים למטה.
                </Text>
              </View>
            )}
          </View>

          {/* Status — admin only, a separate action from replying */}
          {isAdmin && (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>סטטוס הפנייה</Text>
              </View>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((opt) => {
                  const active =
                    supportTicketDisplay(ticket.status).state ===
                    supportTicketDisplay(opt.raw).state;
                  return (
                    <TouchableOpacity
                      key={opt.raw}
                      onPress={() => handleStatus(opt.raw)}
                      style={[
                        styles.statusOpt,
                        active && styles.statusOptActive,
                      ]}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.statusOptText,
                          active && styles.statusOptTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Compose — both admin and requester can append to the thread */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                {isAdmin ? 'הוסף תגובה' : 'השב לפנייה'}
              </Text>
            </View>
            <TextInput
              style={styles.textarea}
              value={reply}
              onChangeText={setReply}
              placeholder={
                isAdmin ? 'הקלד תגובה לפונה...' : 'הקלד את התגובה שלך...'
              }
              placeholderTextColor={Colors.textMuted}
              multiline
              onFocus={() =>
                requestAnimationFrame(() =>
                  scrollRef.current?.scrollToEnd({ animated: true })
                )
              }
            />
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSend}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={18} color={Colors.white} />
              <Text style={styles.submitText}>שלח תגובה</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

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

  notFound: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 60,
  },
  backLink: { alignItems: 'center', marginTop: 12 },
  backLinkText: { color: Colors.primary, fontWeight: '700' },

  heroCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: 8,
    ...Shadow.medium,
  },
  heroTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  heroSubject: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  heroMeta: {
    flexDirection: 'row-reverse',
    gap: 4,
  },
  metaItem: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
  },
  receivedLine: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  section: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  sectionHead: { width: '100%', alignItems: 'flex-end', marginBottom: 8 },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  fRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
    gap: 6,
    paddingVertical: 6,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    flexShrink: 0,
  },
  fValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  userLinkBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  userLinkText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  bubble: {
    maxWidth: '92%',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: 4,
  },
  bubbleAdmin: { backgroundColor: '#F0FDF4', borderColor: Colors.success, borderWidth: 1 },
  bubbleUser: { backgroundColor: Colors.gray50, borderColor: Colors.border, borderWidth: 1 },
  bubbleMine: { alignSelf: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start' },
  bubbleOriginal: { maxWidth: '100%', alignSelf: 'stretch' },
  bubbleHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  bubbleSender: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  bubbleBody: {
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
  },
  bubbleTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'ltr',
  },

  textarea: {
    minHeight: 110,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },

  statusRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusOpt: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.textMuted,
    backgroundColor: Colors.white,
  },
  statusOptActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  statusOptText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  statusOptTextActive: { color: Colors.white },

  submitBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.full,
    ...Shadow.medium,
  },
  submitText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  waitingBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: 4,
  },
  waitingText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
});

export default SupportTicketDetailsScreen;
