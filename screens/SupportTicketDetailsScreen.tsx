import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import { supportTicketDisplay } from '../utils/helpers';
import { Customer, Worker, Contractor, SupportTicketStatus } from '../types';

interface Props {
  ticketId: string;
  onBack: () => void;
}

const SupportTicketDetailsScreen: React.FC<Props> = ({
  ticketId,
  onBack,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser, supportTickets, getUserById, respondToTicket } =
    useApp();
  const ticket = supportTickets.find((t) => t.id === ticketId);

  const [response, setResponse] = useState(ticket?.adminResponse ?? '');
  const [newStatus, setNewStatus] = useState<SupportTicketStatus>(
    ticket?.status ?? 'open'
  );

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

  const handleSubmit = () => {
    if (!response.trim()) {
      Alert.alert('שגיאה', 'יש לכתוב תגובה לפני שליחה');
      return;
    }
    respondToTicket(
      ticket.id,
      currentUser?.id ?? 'adm1',
      response.trim(),
      newStatus
    );
    Alert.alert('נשלח', 'התגובה נשלחה ועודכן הסטטוס.', [
      { text: 'אישור', onPress: onBack },
    ]);
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
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
      <ScrollView
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
            <Text style={styles.metaItem}>·</Text>
            <Text style={styles.metaItem}>
              נפתח:{' '}
              <Text style={{ writingDirection: 'ltr' }}>
                {new Date(ticket.createdAt).toLocaleDateString('he-IL')}
              </Text>
            </Text>
          </View>
        </View>

        {/* Customer info — admin only */}
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
          </View>
        )}

        {/* Original description */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>תיאור הפנייה</Text>
          </View>
          <Text style={styles.bodyText}>{ticket.description}</Text>
        </View>

        {/* Existing admin response */}
        {ticket.adminResponse && !isAdmin && (
          <View style={[styles.section, styles.responseSection]}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: Colors.success }]}>
                תגובת מנהל המערכת
              </Text>
            </View>
            <Text style={styles.bodyText}>{ticket.adminResponse}</Text>
            {ticket.resolvedAt && (
              <Text style={styles.resolvedMeta}>
                נשלח ב-
                <Text style={{ writingDirection: 'ltr' }}>
                  {new Date(ticket.resolvedAt).toLocaleString('he-IL')}
                </Text>
              </Text>
            )}
          </View>
        )}

        {/* Admin compose */}
        {isAdmin && (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>
                  {ticket.adminResponse ? 'עדכן תגובה' : 'כתוב תגובה'}
                </Text>
              </View>
              <TextInput
                style={styles.textarea}
                value={response}
                onChangeText={setResponse}
                placeholder="הקלד את התגובה לפונה..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>שינוי סטטוס</Text>
              </View>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((opt) => {
                  const active =
                    supportTicketDisplay(newStatus).state ===
                    supportTicketDisplay(opt.raw).state;
                  return (
                    <TouchableOpacity
                      key={opt.raw}
                      onPress={() => setNewStatus(opt.raw)}
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

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={18} color={Colors.white} />
              <Text style={styles.submitText}>שלח תגובה</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Customer waiting state */}
        {!isAdmin && !ticket.adminResponse && (
          <View style={styles.waitingBox}>
            <Ionicons
              name="hourglass-outline"
              size={20}
              color={Colors.warning}
            />
            <Text style={styles.waitingText}>
              הפנייה ממתינה לטיפול מנהל המערכת. נחזור אליך בהקדם.
            </Text>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
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

  section: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  responseSection: {
    backgroundColor: '#F0FDF4',
    borderColor: Colors.success,
    borderWidth: 1,
  },
  sectionHead: { width: '100%', alignItems: 'flex-end', marginBottom: 8 },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  bodyText: {
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
  },
  resolvedMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 6,
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
