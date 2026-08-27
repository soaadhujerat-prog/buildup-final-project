import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StaffingProgress from '../components/StaffingProgress';
import WorkerAvatar from '../components/WorkerAvatar';
import { callPhone } from '../utils/contact';
import { Worker, Assignment } from '../types';

interface Props {
  jobId: string;
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
  onOpenChat: (workerId: string) => void;
  onOpenSearchWorkers: () => void;
  onOpenSmartMatch: () => void;
}

const JobStaffingScreen: React.FC<Props> = ({
  jobId,
  onBack,
  onOpenWorkerProfile,
  onOpenChat,
  onOpenSearchWorkers,
  onOpenSmartMatch,
}) => {
  const insets = useSafeAreaInsets();
  const { getJobById, getUserById, getAssignmentsForJob, getStaffingProgress } =
    useApp();

  const job = getJobById(jobId);
  const progress = getStaffingProgress(jobId);

  const staffedWorkers = useMemo(() => {
    const activeAssignments = getAssignmentsForJob(jobId).filter(
      (a) => a.status === 'active'
    );
    return activeAssignments
      .map((a) => ({
        assignment: a,
        worker: getUserById(a.workerId) as Worker | undefined,
      }))
      .filter((x): x is { assignment: Assignment; worker: Worker } => !!x.worker);
  }, [jobId, getAssignmentsForJob, getUserById]);

  if (!job) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>המשרה לא נמצאה</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ניהול שיבוצים</Text>
      </View>

      <FlatList
        data={staffedWorkers}
        keyExtractor={(x) => x.assignment.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.summaryCard}>
            <Text style={styles.jobTitle}>{job.title}</Text>
            <View style={styles.jobMetaRow}>
              <Ionicons
                name="location-outline"
                size={14}
                color={Colors.textSecondary}
              />
              <Text style={styles.jobMetaText}>
                {job.city} · {job.address}
              </Text>
            </View>
            <View style={styles.progressWrap}>
              <StaffingProgress progress={progress} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={56} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>עדיין לא שובצו עובדים</Text>
            <Text style={styles.emptySub}>
              עובדים יופיעו כאן אחרי שתאשר מועמדות שהוגשה, או שעובד יאשר הזמנה
              שקיבל ממך.
            </Text>
            <View style={styles.emptyActions}>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={onOpenSearchWorkers}
                activeOpacity={0.85}
              >
                <Ionicons name="search" size={16} color={Colors.white} />
                <Text style={styles.emptyActionText}>חפש עובדים</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.emptyActionBtn, styles.emptyActionBtnSecondary]}
                onPress={onOpenSmartMatch}
                activeOpacity={0.85}
              >
                <Ionicons name="sparkles" size={16} color={Colors.primary} />
                <Text
                  style={[styles.emptyActionText, styles.emptyActionTextSecondary]}
                >
                  התאמה חכמה
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <WorkerAssignmentCard
            worker={item.worker}
            onPressProfile={() => onOpenWorkerProfile(item.worker.id)}
            onPressMessage={() =>
              onOpenChat(item.worker.id)
            }
            onPressCall={() => callPhone(item.worker.phone)}
          />
        )}
      />
    </View>
  );
};

const WorkerAssignmentCard: React.FC<{
  worker: Worker;
  onPressProfile: () => void;
  onPressMessage: () => void;
  onPressCall: () => void;
}> = ({ worker, onPressProfile, onPressMessage, onPressCall }) => (
  <View style={styles.card}>
    <TouchableOpacity
      style={styles.cardHead}
      onPress={onPressProfile}
      activeOpacity={0.85}
    >
      <WorkerAvatar worker={worker} size={44} />
      <View style={{ flex: 1 }}>
        <View style={styles.cardTopline}>
          <View style={styles.statusDot} />
          <Text style={styles.workerName}>{worker.fullName}</Text>
        </View>
        <Text style={styles.workerMeta} numberOfLines={1}>
          {worker.profession} · {worker.experienceYears} שנים · {worker.city}
        </Text>
      </View>
      <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
    </TouchableOpacity>

    <View style={styles.cardActions}>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={onPressMessage}
        activeOpacity={0.85}
        accessibilityLabel={`שלח הודעה ל${worker.fullName}`}
      >
        <Ionicons name="chatbubble-outline" size={16} color={Colors.primary} />
        <Text style={styles.actionBtnText}>שלח הודעה</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={onPressCall}
        activeOpacity={0.85}
        accessibilityLabel={`התקשר ל${worker.fullName}`}
      >
        <Ionicons name="call-outline" size={16} color={Colors.primary} />
        <Text style={styles.actionBtnText}>התקשר</Text>
      </TouchableOpacity>
    </View>
  </View>
);

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

  list: { padding: Spacing.lg, paddingBottom: 60 },

  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: 10,
    ...Shadow.medium,
  },
  jobTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  jobMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  jobMetaText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  progressWrap: { marginTop: 4 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 10,
    ...Shadow.small,
  },
  cardHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cardTopline: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  workerName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  workerMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  actionBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
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
    lineHeight: 20,
    paddingHorizontal: Spacing.lg,
  },
  emptyActions: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: Spacing.md,
  },
  emptyActionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  emptyActionBtnSecondary: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  emptyActionText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.white,
    writingDirection: 'rtl',
  },
  emptyActionTextSecondary: { color: Colors.primary },
});

export default JobStaffingScreen;
