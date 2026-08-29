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
import WorkerAvatar from '../components/WorkerAvatar';
import { formatDate } from '../utils/helpers';
import { getRegistrationStatus } from '../services/jobStatusService';
import { Contractor, JobPost, Worker } from '../types';
import { workerPrimaryProfession } from '../utils/normalize';

interface Props {
  contractorId: string;
  onBack: () => void;
  onOpenUser: (userId: string) => void;
}

/** Admin-only, READ-ONLY drilldown: every job a contractor posted, plus the
 *  workers actually staffed on each (from Assignment records — never
 *  applications / invitations). No contractor controls, no Smart Match,
 *  no candidate accept/reject — just "what jobs exist" and "who is on them". */
const AdminContractorJobsScreen: React.FC<Props> = ({
  contractorId,
  onBack,
  onOpenUser,
}) => {
  const insets = useSafeAreaInsets();
  const { getUserById, jobs, assignments, workers, getStaffingProgress } =
    useApp();

  const contractor = getUserById(contractorId) as Contractor | undefined;

  const myJobs = useMemo(
    () =>
      [...jobs]
        .filter((j) => j.contractorId === contractorId)
        .sort(
          (a, b) =>
            new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
        ),
    [jobs, contractorId]
  );

  if (!contractor || contractor.role !== 'contractor') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>קבלן לא נמצא</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none" numberOfLines={1}>
          כל המשרות של {contractor.companyName}
        </Text>
      </View>

      {myJobs.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="briefcase-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>אין משרות</Text>
          <Text style={styles.emptySub}>
            הקבלן עדיין לא פרסם משרות במערכת.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {myJobs.map((job) => {
            // Assigned workers = ACTIVE Assignment records only, de-duped by
            // workerId so the same person can never be counted twice.
            const seen = new Set<string>();
            const assignedWorkers: Worker[] = [];
            assignments
              .filter((a) => a.jobId === job.id && a.status === 'active')
              .forEach((a) => {
                if (seen.has(a.workerId)) return;
                seen.add(a.workerId);
                const w = workers.find((x) => x.id === a.workerId);
                if (w) assignedWorkers.push(w);
              });
            return (
              <JobCard
                key={job.id}
                job={job}
                progress={getStaffingProgress(job.id)}
                assignedWorkers={assignedWorkers}
                onOpenUser={onOpenUser}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const JobCard: React.FC<{
  job: JobPost;
  progress: { filled: number; needed: number; label: string };
  assignedWorkers: Worker[];
  onOpenUser: (userId: string) => void;
}> = ({ job, progress, assignedWorkers, onOpenUser }) => {
  const reg = getRegistrationStatus(job);
  return (
    <View style={styles.card}>
      <View style={styles.cardTopline}>
        <StatusBadge label={reg.label} tone={reg.tone} small />
        <Text style={styles.cardTitle} numberOfLines={2}>
          {job.title}
        </Text>
      </View>
      <Text style={styles.cardMeta}>
        {job.professionCategory} · {job.profession}
      </Text>
      <Text style={styles.cardMeta}>{job.city}</Text>
      <Text style={styles.cardMeta}>
        פורסם ב־
        <Text style={{ writingDirection: 'ltr' }}>
          {formatDate(job.postedAt)}
        </Text>
      </Text>
      <View style={styles.capacityRow}>
        <Ionicons name="people-outline" size={16} color={Colors.secondary} />
        <Text style={styles.capacityText}>
          {progress.filled} מתוך {progress.needed} שובצו · {progress.label}
        </Text>
      </View>

      {/* Actual assigned workers — Assignment records only */}
      {assignedWorkers.length > 0 ? (
        <View style={styles.assignedWrap}>
          {assignedWorkers.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={styles.workerRow}
              activeOpacity={0.85}
              onPress={() => onOpenUser(w.id)}
            >
              <WorkerAvatar worker={w} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.workerName}>{w.fullName}</Text>
                <Text style={styles.workerSub}>
                  {workerPrimaryProfession(w)}
                </Text>
              </View>
              <Ionicons
                name="chevron-back"
                size={16}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={styles.noWorkers}>טרם שובצו עובדים למשרה זו</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headerBar: {
    position: 'relative',
    paddingHorizontal: Spacing.xxl + Spacing.md,
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
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 4,
    ...Shadow.small,
  },
  cardTopline: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  cardTitle: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  capacityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  capacityText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.secondary,
    writingDirection: 'rtl',
  },

  assignedWrap: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: 8,
    gap: Spacing.sm,
  },
  workerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  workerName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  workerSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  noWorkers: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 8,
    fontStyle: 'italic',
  },
});

export default AdminContractorJobsScreen;
