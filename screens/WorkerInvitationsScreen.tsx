import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow , FilterChip as FC } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import ResponseDialog from '../components/ResponseDialog';
import ContractorAvatar from '../components/ContractorAvatar';
import { getWorkerJobAssignment } from '../services/assignmentService';
import {
  formatJobRateCompact,
  invitationTimeline,
  assignmentCancelLine,
  currentStaffedState,
  INVITATION_STATUS_TONE,
} from '../utils/helpers';
import {
  Assignment,
  Contractor,
  Invitation,
  InvitationStatus,
  Worker,
} from '../types';

interface Props {
  onBack: () => void;
  onOpenJobDetails: (jobId: string) => void;
}

type Filter = 'all' | InvitationStatus;

const WorkerInvitationsScreen: React.FC<Props> = ({
  onBack,
  onOpenJobDetails,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    invitations,
    jobs,
    assignments,
    getUserById,
    respondToInvitation,
    isJobFullyStaffed,
  } = useApp();
  const me = currentUser as Worker | undefined;

  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<
    { mode: 'accept' | 'decline'; inv: Invitation } | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  // SOURCE: invitations.filter(workerId === me.id)
  const myInvitations = useMemo(
    () => invitations.filter((i) => i.workerId === me?.id),
    [invitations, me]
  );

  const filtered = useMemo(() => {
    const base =
      filter === 'all'
        ? myInvitations
        : myInvitations.filter((i) => i.status === filter);
    return [...base].sort(
      (a, b) =>
        new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    );
  }, [myInvitations, filter]);

  const counts = {
    all: myInvitations.length,
    pending: myInvitations.filter((i) => i.status === 'pending').length,
    accepted: myInvitations.filter((i) => i.status === 'accepted').length,
    declined: myInvitations.filter((i) => i.status === 'declined').length,
    cancelled: myInvitations.filter((i) => i.status === 'cancelled').length,
  };

  const handleAccept = (inv: Invitation) => {
    if (submitting) return;
    if (isJobFullyStaffed(inv.jobId)) {
      Alert.alert('כל המקומות במשרה כבר אוישו.');
      return;
    }
    setDialog({ mode: 'accept', inv });
  };

  const handleDecline = (inv: Invitation) => {
    if (submitting) return;
    setDialog({ mode: 'decline', inv });
  };

  const submitDialog = async (message: string) => {
    if (!dialog || submitting) return;
    const { mode, inv } = dialog;
    setDialog(null);
    setSubmitting(true);
    try {
      const res = await respondToInvitation(
        inv.id,
        mode === 'accept',
        message || undefined
      );
      if (!res.ok) {
        if (mode === 'accept' && res.reason === 'full') {
          Alert.alert('כל המקומות במשרה כבר אוישו.');
        } else {
          Alert.alert(
            mode === 'accept' ? 'אישור ההזמנה נכשל' : 'דחיית ההזמנה נכשלה',
            'ההזמנה אינה זמינה יותר או שאירעה שגיאה. רענן ונסה שוב.'
          );
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">הזמנות מקבלנים</Text>
      </View>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label={`הכל (${counts.all})`}
          active={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Chip
          label={`חדשות (${counts.pending})`}
          active={filter === 'pending'}
          tone="warning"
          onPress={() => setFilter('pending')}
        />
        <Chip
          label={`אישרת (${counts.accepted})`}
          active={filter === 'accepted'}
          tone="success"
          onPress={() => setFilter('accepted')}
        />
        <Chip
          label={`דחית (${counts.declined})`}
          active={filter === 'declined'}
          tone="danger"
          onPress={() => setFilter('declined')}
        />
        <Chip
          label={`בוטלו (${counts.cancelled})`}
          active={filter === 'cancelled'}
          onPress={() => setFilter('cancelled')}
        />
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="mail-outline"
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {counts.all === 0
              ? 'עדיין לא קיבלת הזמנות'
              : 'אין הזמנות בסינון זה'}
          </Text>
          <Text style={styles.emptySub}>
            {counts.all === 0
              ? 'קבלנים יזמינו אותך כאשר ימצאו בך התאמה.'
              : 'נסה סינון אחר'}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => (
            <View style={{ height: Spacing.sm }} />
          )}
          renderItem={({ item }) => {
            const job = jobs.find((j) => j.id === item.jobId);
            const contractor = getUserById(item.contractorId) as
              | Contractor
              | undefined;
            return (
              <InvitationCard
                inv={item}
                jobTitle={job?.title ?? '—'}
                jobCity={job?.city ?? ''}
                jobRateLabel={job ? formatJobRateCompact(job) : ''}
                jobFull={isJobFullyStaffed(item.jobId)}
                contractorName={
                  contractor?.companyName ?? contractor?.fullName ?? ''
                }
                contractorAvatarUrl={contractor?.avatarUrl}
                assignment={
                  me
                    ? getWorkerJobAssignment(assignments, item.jobId, me.id)
                    : undefined
                }
                onPressJob={() => job && onOpenJobDetails(job.id)}
                onAccept={() => handleAccept(item)}
                onDecline={() => handleDecline(item)}
              />
            );
          }}
        />
      )}

      <ResponseDialog
        visible={!!dialog}
        title={
          dialog?.mode === 'accept'
            ? 'לאשר את ההזמנה?'
            : 'לדחות את ההזמנה?'
        }
        message={
          dialog?.mode === 'accept'
            ? 'הקבלן יקבל עדכון שאישרת את ההזמנה ותשובץ למשרה.'
            : 'הקבלן יקבל עדכון שדחית את ההזמנה.'
        }
        inputLabel="הודעה לקבלן (אופציונלי)"
        inputPlaceholder={
          dialog?.mode === 'accept'
            ? 'תודה, אשמח להצטרף. אהיה זמין בתאריך שנקבע.'
            : 'תודה על ההזמנה, אך איני פנוי בתאריך הזה.'
        }
        confirmLabel={
          dialog?.mode === 'accept' ? 'אישור ההזמנה' : 'דחיית ההזמנה'
        }
        destructive={dialog?.mode === 'decline'}
        onConfirm={submitDialog}
        onClose={() => setDialog(null)}
      />
    </View>
  );
};

const Chip: React.FC<{
  label: string;
  active: boolean;
  tone?: 'success' | 'warning' | 'danger';
  onPress: () => void;
}> = ({ label, active, tone, onPress }) => {
  const activeBg =
    tone === 'success'
      ? Colors.success
      : tone === 'warning'
      ? Colors.warning
      : tone === 'danger'
      ? Colors.danger
      : Colors.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: activeBg, borderColor: activeBg },
      ]}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const InvitationCard: React.FC<{
  inv: Invitation;
  jobTitle: string;
  jobCity: string;
  jobRateLabel: string;
  jobFull: boolean;
  contractorName: string;
  contractorAvatarUrl?: string;
  assignment: Assignment | undefined;
  onPressJob: () => void;
  onAccept: () => void;
  onDecline: () => void;
}> = ({
  inv,
  jobTitle,
  jobCity,
  jobRateLabel,
  jobFull,
  contractorName,
  contractorAvatarUrl,
  assignment,
  onPressJob,
  onAccept,
  onDecline,
}) => {
  // Worker-facing wording for the historical decision, then let the current
  // assignment state override it (accepted invitation whose assignment was
  // cancelled reads "בוטל", not "אישרת").
  const baseLabel =
    inv.status === 'pending'
      ? 'חדש'
      : inv.status === 'accepted'
      ? 'אישרת'
      : inv.status === 'declined'
      ? 'דחית'
      : inv.status === 'cancelled'
      ? 'בוטלה'
      : 'פג תוקף';
  const { label, tone } = currentStaffedState(
    { label: baseLabel, tone: INVITATION_STATUS_TONE[inv.status] },
    inv.status,
    assignment
  );
  const cancelLine =
    inv.status === 'accepted' && assignment?.status === 'cancelled'
      ? assignmentCancelLine(assignment)
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <StatusBadge label={label} tone={tone} small />
        <Text style={styles.title} numberOfLines={1}>
          {jobTitle}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.contractorRow}
        onPress={onPressJob}
        activeOpacity={0.85}
      >
        <ContractorAvatar
          contractor={{ avatarUrl: contractorAvatarUrl }}
          size={32}
          style={styles.contractorIcon}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.contractorName}>{contractorName}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons
            name="location-outline"
            size={14}
            color={Colors.textSecondary}
          />
          <Text style={styles.metaText}>{jobCity}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons
            name="cash-outline"
            size={14}
            color={Colors.textSecondary}
          />
          <Text style={styles.metaText}>{jobRateLabel}</Text>
        </View>
      </View>

      {inv.message && (
        <Text style={styles.message}>{inv.message}</Text>
      )}

      <View style={styles.timeline}>
        {invitationTimeline(inv, 'worker').map((line) => (
          <Text key={line} style={styles.sentAt}>
            {line}
          </Text>
        ))}
        {cancelLine && <Text style={styles.sentAt}>{cancelLine}</Text>}
      </View>

      {inv.responseMessage ? (
        <View style={styles.responseNote}>
          <Text style={styles.responseNoteLabel}>ההודעה ששלחת</Text>
          <Text style={styles.responseNoteText}>{inv.responseMessage}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.viewJobBtn}
        onPress={onPressJob}
        activeOpacity={0.85}
      >
        <Ionicons name="chevron-back" size={14} color={Colors.primary} />
        <Text style={styles.viewJobText}>הצג פרטי משרה</Text>
        <Ionicons name="briefcase-outline" size={14} color={Colors.primary} />
      </TouchableOpacity>

      {inv.status === 'pending' && (
        <>
          {jobFull && (
            <Text style={styles.capacityHint}>
              המשרה כבר אוישה במלואה — לא ניתן לאשר את ההזמנה.
            </Text>
          )}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={onDecline}
              activeOpacity={0.85}
            >
              <Ionicons name="close" size={18} color={Colors.danger} />
              <Text style={styles.declineText}>דחה</Text>
            </TouchableOpacity>
            {!jobFull && (
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={onAccept}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark" size={18} color={Colors.white} />
                <Text style={styles.acceptText}>אשר</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
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

  // RTL horizontal filter row: the ScrollView is mirrored (scaleX -1) so
  // scrollX=0 anchors to the FIRST chip painted flush at the right edge
  // ("הכל" visible immediately, no scroll needed); each chip is un-mirrored
  // so its text reads normally. Data order is never reversed.
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: FC.gap,
    alignItems: 'center',
  },
  chip: {
    height: FC.height,
    paddingHorizontal: FC.paddingHorizontal,
    borderRadius: FC.borderRadius,
    borderWidth: FC.borderWidth,
    borderColor: Colors.textMuted,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scaleX: -1 }],
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    lineHeight: FontSize.sm + 4,
  },
  chipTextActive: { color: Colors.white },

  results: {
    flex: 1,
  },

  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
    transform: [{ scaleX: -1 }],
  },

  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 40,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 8,
    ...Shadow.medium,
  },
  cardHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  contractorRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.gray50,
    padding: 8,
    borderRadius: Radius.sm,
  },
  contractorIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractorName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  message: {
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.primaryFaint,
    padding: 8,
    borderRadius: Radius.sm,
    textAlign: 'right',
    writingDirection: 'rtl',
    fontStyle: 'italic',
  },
  timeline: {
    width: '100%',
    gap: 2,
  },
  sentAt: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.xs + 7,
    flexShrink: 1,
  },
  capacityHint: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  responseNote: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.sm,
    padding: 8,
    gap: 2,
  },
  responseNoteLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  responseNoteText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.sm + 5,
  },

  viewJobBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primaryFaint,
  },
  viewJobText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  actionRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 4,
  },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.success,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  acceptText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  declineBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  declineText: {
    color: Colors.danger,
    fontSize: FontSize.md,
    fontWeight: '700',
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
  },
});

export default WorkerInvitationsScreen;
