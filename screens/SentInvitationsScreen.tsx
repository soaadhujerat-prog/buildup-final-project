import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow , FilterChip as FC } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
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
  const { currentUser, invitations, jobs, getUserById } = useApp();
  const me = currentUser as Contractor | undefined;

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
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
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
                workerName={worker?.fullName ?? 'עובד לא ידוע'}
                workerMeta={
                  worker
                    ? `${worker.profession} · ${worker.city}`
                    : ''
                }
                jobTitle={job?.title ?? '—'}
                onPressWorker={() => worker && onOpenWorkerProfile(worker.id)}
                onPressJob={() => job && onOpenJobDetails(job.id)}
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
  workerName: string;
  workerMeta: string;
  jobTitle: string;
  onPressWorker: () => void;
  onPressJob: () => void;
}> = ({ inv, workerName, workerMeta, jobTitle, onPressWorker, onPressJob }) => {
  const tone =
    inv.status === 'pending'
      ? 'warning'
      : inv.status === 'accepted'
      ? 'success'
      : 'danger';
  const label =
    inv.status === 'pending'
      ? 'ממתין'
      : inv.status === 'accepted'
      ? 'התקבל'
      : 'נדחה';
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHead}
        onPress={onPressWorker}
        activeOpacity={0.85}
      >
        <View style={styles.avatarCircle}>
          <Ionicons name="hammer" size={20} color={Colors.primary} />
        </View>
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

      <Text style={styles.sentAt}>
        נשלח:{' '}
        <Text style={{ writingDirection: 'ltr' }}>
          {new Date(inv.sentAt).toLocaleDateString('he-IL')}
        </Text>
        {inv.respondedAt && (
          <>
            {' · נענה: '}
            <Text style={{ writingDirection: 'ltr' }}>
              {new Date(inv.respondedAt).toLocaleDateString('he-IL')}
            </Text>
          </>
        )}
      </Text>
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
    borderColor: Colors.border,
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
  sentAt: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
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
