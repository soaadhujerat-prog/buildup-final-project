import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import { supportTicketDisplay, formatDateTime } from '../utils/helpers';
import { SupportTicket } from '../types';

interface Props {
  registrationId: string;
  /** Log out and return to the login / welcome screen. */
  onBackToWelcome: () => void;
  /** From the confined rejected-registration session (read RLS-scoped from the
   *  applicant's own `registrations` row). Preferred over getRegistration(). */
  rejectionReason?: string;
  processedAt?: string;
  /** The applicant's own registration-support tickets (migration 052). When
   *  provided together with the callbacks below, the support UX is shown. */
  tickets?: SupportTicket[];
  onOpenNewTicket?: () => void;
  onOpenTicket?: (ticketId: string) => void;
  onOpenAllTickets?: () => void;
}

const RegistrationRejectedScreen: React.FC<Props> = ({
  registrationId,
  onBackToWelcome,
  rejectionReason,
  processedAt,
  tickets,
  onOpenNewTicket,
  onOpenTicket,
  onOpenAllTickets,
}) => {
  const insets = useSafeAreaInsets();
  const { getRegistration } = useApp();
  const reg = getRegistration(registrationId);

  const reasonText =
    rejectionReason?.trim() ||
    reg?.rejectionReason?.trim() ||
    'הסיבה לא צוינה.';
  const decidedAt = processedAt ?? reg?.processedAt;

  const supportEnabled = !!onOpenNewTicket;

  // Newest-updated first; prefer a still-open ticket for the highlight card.
  const myTickets = useMemo(() => {
    const list = tickets ?? [];
    return [...list].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [tickets]);

  const highlightTicket = useMemo(() => {
    const openOne = myTickets.find(
      (t) => supportTicketDisplay(t.status).state !== 'done'
    );
    return openOne ?? myTickets[0];
  }, [myTickets]);

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
          <Ionicons name="close-circle-outline" size={56} color={Colors.danger} />
        </View>

        <Text style={styles.title}>הרישום נדחה</Text>
        <Text style={styles.subtitle}>
          לאחר בדיקת הבקשה שלך, מנהל המערכת החליט לדחות את הרישום.
        </Text>

        <View style={styles.reasonBox}>
          <View style={styles.reasonHeader}>
            <Text style={styles.reasonTitle}>סיבת הדחייה</Text>
          </View>
          <Text style={styles.reasonText}>{reasonText}</Text>

          {!!decidedAt && (
            <Text style={styles.reasonMeta}>
              נדחה ב-
              <Text style={{ writingDirection: 'ltr' }}>
                {new Date(decidedAt).toLocaleString('he-IL')}
              </Text>
            </Text>
          )}
        </View>

        {supportEnabled ? (
          highlightTicket ? (
            <View style={styles.ticketCard}>
              <View style={styles.ticketHead}>
                <StatusBadge
                  label={supportTicketDisplay(highlightTicket.status).label}
                  tone={supportTicketDisplay(highlightTicket.status).tone}
                  small
                />
                {highlightTicket.isClosed && (
                  <StatusBadge label="סגורה" tone="neutral" small />
                )}
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
                  <Text style={styles.replyPillText}>
                    התקבלה תגובה מהתמיכה
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.cta}
                onPress={() => onOpenTicket?.(highlightTicket.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.ctaText}>צפה בפנייה</Text>
              </TouchableOpacity>

              {myTickets.length > 1 && onOpenAllTickets && (
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
                  אם לדעתך מדובר בטעות או שברצונך לקבל מידע נוסף, ניתן לפתוח
                  פנייה לצוות התמיכה. הפנייה תיפתח מול מנהל המערכת ותוכל לעקוב
                  אחר התשובות כאן.
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
          )
        ) : (
          <View style={styles.infoBox}>
            <Ionicons
              name="information-circle"
              size={20}
              color={Colors.secondary}
            />
            <Text style={styles.infoText}>
              אם לדעתך מדובר בטעות, יש להתחבר מחדש כדי לפנות לצוות התמיכה.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={onBackToWelcome}
          activeOpacity={0.85}
        >
          <Text style={styles.logoutBtnText}>חזרה למסך הבית</Text>
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
    backgroundColor: '#FEF2F2',
    borderColor: Colors.danger,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: 6,
  },
  reasonHeader: { width: '100%', alignItems: 'flex-end' },
  reasonTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.danger,
    writingDirection: 'rtl',
  },
  reasonText: {
    fontSize: FontSize.md,
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
    lineHeight: 22,
  },
  reasonMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  ticketCard: {
    backgroundColor: Colors.white,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: 8,
    ...Shadow.medium,
  },
  ticketHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  ticketCardTitle: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
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
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  replyPillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.secondary,
    writingDirection: 'rtl',
  },
  linkBtn: { alignItems: 'center', paddingVertical: 4 },
  linkBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  secondaryCta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  secondaryCtaText: {
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

  logoutBtn: {
    marginTop: Spacing.md,
    borderRadius: Radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  logoutBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default RegistrationRejectedScreen;
