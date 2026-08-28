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
import WorkerAvatar from '../components/WorkerAvatar';
import {
  invitationTimeline,
  INVITATION_STATUS_LABEL,
  INVITATION_STATUS_TONE,
} from '../utils/helpers';
import { Contractor, InvitationStatus, Invitation, Worker } from '../types';

interface Props {
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
  onOpenJobDetails: (jobId: string) => void;
}

type Filter = 'all' | InvitationStatus;

const SentInvitationsScreen: React.FC<Props> = ({
  onBack,
  onOpenWorkerProfile,
  onOpenJobDetails,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser, invitations, jobs, getUserById, cancelInvitation } =
    useApp();
  const me = currentUser as Contractor | undefined;

  const handleCancel = (inv: Invitation) => {
    Alert.alert('לבטל את ההזמנה?', 'העובד לא יוכל יותר לאשר את ההזמנה הזו.', [
      { text: 'חזור', style: 'cancel' },
      {
        text: 'ביטול הזמנה',
        style: 'destructive',
        onPress: () => cancelInvitation(inv.id),
      },
    ]);
  };

  const [filter, setFilter] = useState<Filter>('all');

  const myInvitations = useMemo(
    () => invitations.filter((i) => i.contractorId === me?.id),
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>הזמנות שנשלחו</Text>
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
          label={`ממתין (${counts.pending})`}
          active={filter === 'pending'}
          tone="warning"
          onPress={() => setFilter('pending')}
        />
        <Chip
          label={`התקבל (${counts.accepted})`}
          active={filter === 'accepted'}
          tone="success"
          onPress={() => setFilter('accepted')}
        />
        <Chip
          label={`נדחה (${counts.declined})`}
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
            name="paper-plane-outline"
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {counts.all === 0 ? 'עדיין לא שלחת הזמנות' : 'אין הזמנות בסינון זה'}
          </Text>
          <Text style={styles.emptySub}>
            {counts.all === 0
              ? 'הזמנות נוצרות מחיפוש עובדים או התאמה חכמה.'
              : 'נסה סינון אחר'}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => {
            const worker = getUserById(item.workerId) as Worker | undefined;
            const job = jobs.find((j) => j.id === item.jobId);
            return (
              <InvitationRow
                inv={item}
                worker={worker}
                workerName={worker?.fullName ?? 'עובד לא ידוע'}
                workerMeta={
                  worker
                    ? `${worker.profession} · ${worker.city}`
                    : ''
                }
                jobTitle={job?.title ?? '—'}
                onPressWorker={() => worker && onOpenWorkerProfile(worker.id)}
                onPressJob={() => job && onOpenJobDetails(job.id)}
                onCancel={() => handleCancel(item)}
              />
            );
          }}
        />
      )}
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

const InvitationRow: React.FC<{
  inv: Invitation;
  worker: Worker | undefined;
  workerName: string;
  workerMeta: string;
  jobTitle: string;
  onPressWorker: () => void;
  onPressJob: () => void;
  onCancel: () => void;
}> = ({
  inv,
  worker,
  workerName,
  workerMeta,
  jobTitle,
  onPressWorker,
  onPressJob,
  onCancel,
}) => {
  const tone = INVITATION_STATUS_TONE[inv.status];
  const label = INVITATION_STATUS_LABEL[inv.status];
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHead}
        onPress={onPressWorker}
        activeOpacity={0.85}
      >
        {worker ? (
          <WorkerAvatar worker={worker} size={44} />
        ) : (
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={18} color={Colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.headlineRow}>
            <StatusBadge label={label} tone={tone} small />
            <Text style={styles.workerName}>{workerName}</Text>
          </View>
          <Text style={styles.workerMeta}>{workerMeta}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.jobLink}
        onPress={onPressJob}
        activeOpacity={0.85}
      >
        <Ionicons name="chevron-back" size={14} color={Colors.primary} />
        <Text style={styles.jobLinkText} numberOfLines={1}>
          על המשרה: {jobTitle}
        </Text>
        <Ionicons
          name="briefcase-outline"
          size={14}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>

      {inv.message && (
        <Text style={styles.message} numberOfLines={2}>
          {inv.message}
        </Text>
      )}

      <View style={styles.timeline}>
        {invitationTimeline(inv, 'contractor').map((line) => (
          <Text key={line} style={styles.sentAt}>
            {line}
          </Text>
        ))}
      </View>

      {inv.responseMessage ? (
        <View style={styles.responseNote}>
          <Text style={styles.responseNoteLabel}>הודעת העובד</Text>
          <Text style={styles.responseNoteText}>{inv.responseMessage}</Text>
        </View>
      ) : null}

      {inv.status === 'pending' && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onCancel}
          activeOpacity={0.85}
        >
          <Ionicons
            name="close-circle-outline"
            size={16}
            color={Colors.danger}
          />
          <Text style={styles.cancelText}>ביטול הזמנה</Text>
        </TouchableOpacity>
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

  chipRow: {
    flexDirection: 'row-reverse',
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
    gap: Spacing.md,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headlineRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  workerName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  workerMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },

  jobLink: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gray50,
    padding: 8,
    borderRadius: Radius.sm,
  },
  jobLinkText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
    writingDirection: 'rtl',
    textAlign: 'right',
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
  cancelBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    backgroundColor: Colors.white,
  },
  cancelText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.danger,
    writingDirection: 'rtl',
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

export default SentInvitationsScreen;
