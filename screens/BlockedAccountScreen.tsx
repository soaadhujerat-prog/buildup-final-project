import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import { supportTicketDisplay, formatDateTime } from '../utils/helpers';

interface Props {
  /** Reason the admin recorded when blocking, if any. */
  blockedReason?: string;
  /** Log out and return to the login / welcome screen. */
  onBackToWelcome: () => void;
  /** Open the existing "new support ticket" flow (subject pre-filled). */
  onOpenNewTicket: () => void;
  /** Open one existing ticket in the shared SupportTicketDetails screen. */
  onOpenTicket: (ticketId: string) => void;
  /** Open the shared support-tickets list (already scoped to this user). */
  onOpenAllTickets: () => void;
}

// Shown instead of a raw / empty reason so the user always sees a clear,
// respectful explanation — never a technical note or a blank box.
const FALLBACK_REASON =
  'החשבון נחסם על ידי מנהל המערכת. ניתן לפנות לתמיכה לקבלת מידע נוסף.';

const BlockedAccountScreen: React.FC<Props> = ({
  blockedReason,
  onBackToWelcome,
  onOpenNewTicket,
  onOpenTicket,
  onOpenAllTickets,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser, supportTickets } = useApp();

  const reasonText = blockedReason?.trim()
    ? blockedReason.trim()
    : FALLBACK_REASON;

  // This user's own tickets only, most-recently-updated first. Sorted with a
  // copied array + comparator — never array.reverse().
  const myTickets = useMemo(() => {
    if (!currentUser) return [];
    return [...supportTickets]
      .filter((t) => t.userId === currentUser.id)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }, [supportTickets, currentUser]);

  // Prefer a still-open ticket; otherwise fall back to the most recent one so
  // the user can always find their way back into an existing conversation.
  const highlightTicket = useMemo(() => {
    const openOne = myTickets.find(
      (t) => supportTicketDisplay(t.status).state !== 'done'
    );
    return openOne ?? myTickets[0];
  }, [myTickets]);

  // "A reply from support is waiting" — inferred ONLY from real data: the last
  // message in the thread was written by the admin. No invented unread state.
  const supportReplied = useMemo(() => {
    if (!highlightTicket) return false;
    const msgs = highlightTicket.messages ?? [];
    const last = msgs.length > 0 ? msgs[msgs.length - 1] : undefined;
    return last?.senderRole === 'admin';
  }, [highlightTicket]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="ban-outline" size={56} color={Colors.danger} />
        </View>

        <Text style={styles.title}>החשבון שלך חסום</Text>
        <Text style={styles.subtitle}>
          הגישה לחשבון נחסמה על ידי מנהל המערכת.{'\n'}
          לא ניתן להשתמש באפליקציה עד להסרת החסימה.
        </Text>

        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>סיבת החסימה</Text>
          <Text style={styles.reasonText}>{reasonText}</Text>
        </View>

        {highlightTicket ? (
          <View style={styles.ticketCard}>
            <View style={styles.ticketHead}>
              <StatusBadge
                label={supportTicketDisplay(highlightTicket.status).label}
                tone={supportTicketDisplay(highlightTicket.status).tone}
                small
              />
              <Text style={styles.ticketCardTitle}>פנייה לתמיכה</Text>
            </View>

            <Text style={styles.ticketSubject} numberOfLines={2}>
              {highlightTicket.subject}
            </Text>
            <Text style={styles.ticketMeta}>
              עודכן לאחרונה: {formatDateTime(highlightTicket.updatedAt)}
            </Text>

            {supportReplied && (
              <View style={styles.replyPill}>
                <Ionicons
                  name="mail-unread-outline"
                  size={14}
                  color={Colors.secondary}
                />
                <Text style={styles.replyPillText}>התקבלה תגובה מהתמיכה</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.cta}
              onPress={() => onOpenTicket(highlightTicket.id)}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaText}>צפה בפנייה</Text>
            </TouchableOpacity>

            {myTickets.length > 1 && (
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={onOpenAllTickets}
                activeOpacity={0.7}
              >
                <Text style={styles.linkBtnText}>
                  לכל הפניות שלי ({myTickets.length})
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.secondaryCta}
              onPress={onOpenNewTicket}
              activeOpacity={0.85}
            >
              <Ionicons
                name="add-circle-outline"
                size={20}
                color={Colors.primary}
              />
              <Text style={styles.secondaryCtaText}>פתיחת פנייה נוספת</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.infoBox}>
              <Ionicons
                name="information-circle"
                size={20}
                color={Colors.secondary}
              />
              <Text style={styles.infoText}>
                אם לדעתך החשבון נחסם בטעות או שברצונך לקבל מידע נוסף, ניתן לפנות
                לצוות התמיכה. הפנייה תיפתח מול מנהל המערכת ותוכל לעקוב אחר
                התשובות כאן.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.cta}
              onPress={onOpenNewTicket}
              activeOpacity={0.85}
            >
              <Ionicons
                name="help-buoy-outline"
                size={20}
                color={Colors.white}
              />
              <Text style={styles.ctaText}>פנה לתמיכה</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.exitBtn}
          onPress={onBackToWelcome}
          activeOpacity={0.7}
        >
          <Text style={styles.exitBtnText}>חזרה למסך ההתחברות</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scroll: { paddingHorizontal: Spacing.xxl, paddingBottom: 40 },

  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#FEE2E2',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },

  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },

  reasonBox: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderColor: Colors.danger,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: 4,
  },
  reasonLabel: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  reasonText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },

  ticketCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
    ...Shadow.small,
  },
  ticketHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  ticketCardTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  ticketSubject: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  ticketMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  replyPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    backgroundColor: '#DBEAFE',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  replyPillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.secondary,
    writingDirection: 'rtl',
  },
  linkBtn: {
    alignSelf: 'center',
    paddingVertical: 6,
  },
  linkBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  infoBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: '#EFF6FF',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  infoText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.secondary,
    lineHeight: 20,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  secondaryCta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 14,
  },
  secondaryCtaText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  cta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    ...Shadow.medium,
  },
  ctaText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  exitBtn: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: Spacing.md,
  },
  exitBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default BlockedAccountScreen;
