import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const { currentUser, supportTickets, getUserById, replyToTicket } = useApp();
  const ticket = supportTickets.find((t) => t.id === ticketId);

  const scrollRef = useRef<ScrollView>(null);
  const [reply, setReply] = useState('');
  // Admin picks a status here; it is applied ONLY together with the reply,
  // via the combined "send + update status" action. Never a silent change.
  const [pendingStatus, setPendingStatus] = useState<SupportTicketStatus | null>(
    null
  );
  // True only while the reply TextInput holds focus — so the keyboard
  // listener below scrolls the compose area up only when the user is
  // actually writing, never on an unrelated keyboard event.
  const replyFocusedRef = useRef(false);
  // Real measured header height → the correct keyboardVerticalOffset for the
  // KeyboardAvoidingView (which starts BELOW the header), instead of a guess.
  const [headerHeight, setHeaderHeight] = useState(0);

  const scrollComposeIntoView = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  // iOS: scrollToEnd fired from onFocus runs BEFORE the keyboard finishes
  // opening, so the available height hasn't shrunk yet and the compose stays
  // hidden. Re-run the scroll on keyboardDidShow (fires after the height has
  // actually changed) while the reply field is focused. Works the same for
  // admin / worker / contractor — the compose block is identical for all.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (replyFocusedRef.current) {
        // one more frame so the ScrollView has re-laid-out at the new height
        requestAnimationFrame(scrollComposeIntoView);
      }
    });
    return () => sub.remove();
  }, []);

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

  // A status change is queued only if the admin picked one that differs from
  // the ticket's current status.
  const wantsStatusChange =
    isAdmin && !!pendingStatus && pendingStatus !== ticket.status;

  const handleSend = () => {
    if (!currentUser) return;
    const text = reply.trim();
    if (!text) {
      Alert.alert(
        'שגיאה',
        wantsStatusChange
          ? 'כדי לשנות את סטטוס הפנייה יש להוסיף תגובה למשתמש.'
          : 'יש לכתוב תגובה לפני שליחה'
      );
      return;
    }
    replyToTicket(
      ticket.id,
      currentUser.id,
      currentUser.role as 'admin' | 'worker' | 'contractor',
      text,
      wantsStatusChange ? pendingStatus! : undefined
    );
    setReply('');
    setPendingStatus(null);
    Keyboard.dismiss();
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true })
    );
  };

  const togglePendingStatus = (raw: SupportTicketStatus) => {
    if (!isAdmin) return;
    setPendingStatus((prev) => (prev === raw ? null : raw));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View
        style={styles.headerBar}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">פרטי פנייה</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        // The KAV starts BELOW the header, so its offset from the top of the
        // screen is the notch inset + the real (measured) header height.
        keyboardVerticalOffset={insets.top + (headerHeight || 56)}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === 'ios' ? 'interactive' : 'on-drag'
          }
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
                  {!!m.statusChange && (
                    <View style={styles.statusChangePill}>
                      <Ionicons
                        name="swap-horizontal"
                        size={12}
                        color={Colors.secondary}
                      />
                      <Text style={styles.statusChangePillText}>
                        עודכן סטטוס ל: {supportTicketDisplay(m.statusChange).label}
                      </Text>
                    </View>
                  )}
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

          {/* Status — admin only. Picking a status here does NOT change it on
              its own; it is applied together with the reply below. */}
          {isAdmin && (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>שינוי סטטוס</Text>
              </View>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((opt) => {
                  const isCurrent =
                    supportTicketDisplay(ticket.status).state ===
                    supportTicketDisplay(opt.raw).state;
                  const isPending =
                    !!pendingStatus &&
                    supportTicketDisplay(pendingStatus).state ===
                      supportTicketDisplay(opt.raw).state;
                  return (
                    <TouchableOpacity
                      key={opt.raw}
                      onPress={() => togglePendingStatus(opt.raw)}
                      style={[
                        styles.statusOpt,
                        isCurrent && styles.statusOptCurrent,
                        isPending && styles.statusOptActive,
                      ]}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.statusOptText,
                          (isCurrent || isPending) && styles.statusOptTextActive,
                        ]}
                      >
                        {opt.label}
                        {isCurrent ? ' (נוכחי)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {wantsStatusChange && (
                <Text style={styles.statusHint}>
                  השינוי יבוצע יחד עם שליחת התגובה. חובה להוסיף תגובה למשתמש.
                </Text>
              )}
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
              onFocus={() => {
                replyFocusedRef.current = true;
                // Fallback for when the keyboard is ALREADY open (re-focus /
                // switching from another field) so keyboardDidShow won't fire
                // again — a short delay lets layout settle first.
                setTimeout(scrollComposeIntoView, 150);
              }}
              onBlur={() => {
                replyFocusedRef.current = false;
              }}
            />
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSend}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={18} color={Colors.white} />
              <Text style={styles.submitText}>
                {wantsStatusChange ? 'שלח תגובה ועדכן סטטוס' : 'שלח תגובה'}
              </Text>
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
  // flexGrow keeps short threads filling the viewport (stable layout for
  // scrollToEnd); paddingBottom is a small margin so the "שלח תגובה" button
  // clears the keyboard edge once scrolled — NOT a large fixed gap.
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    flexGrow: 1,
  },

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
  statusChangePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    backgroundColor: '#DBEAFE',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  statusChangePillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.secondary,
    writingDirection: 'rtl',
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
  statusOptCurrent: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  statusOptText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  statusOptTextActive: { color: Colors.white },
  statusHint: {
    fontSize: FontSize.xs,
    color: Colors.warning,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 8,
  },

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
