import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import WorkerAvatar from '../components/WorkerAvatar';
import { formatDate } from '../utils/helpers';
import { getRegistrationStatus } from '../services/jobStatusService';
import { getEffectiveJobAssignments } from '../services/assignmentService';
import { Contractor, JobPost, Worker } from '../types';
import { workerPrimaryProfession } from '../utils/normalize';

type TeamStatus = 'active' | 'completed';
interface TeamMember {
  worker: Worker;
  status: TeamStatus;
}

const TEAM_BADGE: Record<TeamStatus, { label: string; tone: 'success' | 'info' }> = {
  active: { label: 'עובד כרגע', tone: 'success' },
  completed: { label: 'סיים את עבודתו', tone: 'info' },
};

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
  const {
    getUserById,
    jobs,
    jobsLoading,
    jobsError,
    refreshJobs,
    assignments,
    workers,
    getStaffingProgress,
  } = useApp();

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

      {myJobs.length === 0 && jobsLoading && jobs.length === 0 ? (
        <View style={styles.emptyWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.emptySub}>טוען משרות…</Text>
        </View>
      ) : jobsError && jobs.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="cloud-offline-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>לא הצלחנו לטעון משרות</Text>
          <Text style={styles.emptySub}>בדוק/י את חיבור האינטרנט ונסה/י שוב.</Text>
          <TouchableOpacity onPress={() => refreshJobs()} style={styles.backLink} activeOpacity={0.85}>
            <Text style={styles.backLinkText}>נסה שוב</Text>
          </TouchableOpacity>
        </View>
      ) : myJobs.length === 0 ? (
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
            // The job TEAM = effective/latest assignment per unique worker,
            // keeping active + completed (a worker who finished was still on
            // the team). Only a worker whose effective assignment is
            // 'cancelled' drops off. Never the raw records — no double count.
            const team: TeamMember[] = getEffectiveJobAssignments(
              assignments,
              job.id
            )
              .filter(
                (a) => a.status === 'active' || a.status === 'completed'
              )
              .map((a) => ({
                worker: workers.find((x) => x.id === a.workerId),
                status: a.status as TeamStatus,
              }))
              .filter((m): m is TeamMember => !!m.worker);
            return (
              <JobCard
                key={job.id}
                job={job}
                progress={getStaffingProgress(job.id)}
                team={team}
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
  team: TeamMember[];
  onOpenUser: (userId: string) => void;
}> = ({ job, progress, team, onOpenUser }) => {
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

      {/* Job team — Assignment records only. Keeps completed workers (they
          were part of the team); a cancelled staffing is dropped. */}
      {team.length > 0 ? (
        <View style={styles.assignedWrap}>
          {team.map(({ worker: w, status }) => (
            <TouchableOpacity
              key={w.id}
              style={styles.workerRow}
              activeOpacity={0.85}
              onPress={() => onOpenUser(w.id)}
            >
              <WorkerAvatar worker={w} size={36} />
              <View style={{ flex: 1 }}>
                <View style={styles.workerTopline}>
                  <StatusBadge
                    label={TEAM_BADGE[status].label}
                    tone={TEAM_BADGE[status].tone}
                    small
                  />
                  <Text style={styles.workerName}>{w.fullName}</Text>
                </View>
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
  workerTopline: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
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
