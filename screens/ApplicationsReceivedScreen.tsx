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
import { Application, ApplicationStatus, Worker, Contractor } from '../types';

interface Props {
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
  onOpenJobDetails: (jobId: string) => void;
  initialFilter?: 'all' | ApplicationStatus;
}

type Filter = 'all' | ApplicationStatus;

const ApplicationsReceivedScreen: React.FC<Props> = ({
  onBack,
  onOpenWorkerProfile,
  onOpenJobDetails,
  initialFilter = 'all',
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    applications,
    jobs,
    getUserById,
    respondToApplication,
  } = useApp();
  const me = currentUser as Contractor | undefined;

  const [filter, setFilter] = useState<Filter>(initialFilter);

  // SOURCE: applications joined to my jobs
  const myJobIds = useMemo(
    () => jobs.filter((j) => j.contractorId === me?.id).map((j) => j.id),
    [jobs, me]
  );

  const myApplications = useMemo(
    () => applications.filter((a) => myJobIds.includes(a.jobId)),
    [applications, myJobIds]
  );

  const filtered = useMemo(() => {
    const base =
      filter === 'all'
        ? myApplications
        : myApplications.filter((a) => a.status === filter);
    return [...base].sort(
      (a, b) =>
        new Date(b.appliedAt).getTime() -
        new Date(a.appliedAt).getTime()
    );
  }, [myApplications, filter]);

  const counts = {
    all: myApplications.length,
    pending: myApplications.filter((a) => a.status === 'pending').length,
    accepted: myApplications.filter((a) => a.status === 'accepted').length,
    rejected: myApplications.filter((a) => a.status === 'rejected').length,
  };

  const handleAccept = (app: Application) => {
    const w = getUserById(app.workerId);
    Alert.alert('אישור מועמד', `לאשר את ${w?.fullName ?? 'המועמד'}?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'אשר',
        onPress: () => respondToApplication(app.id, true),
      },
    ]);
  };
  const handleReject = (app: Application) => {
    const w = getUserById(app.workerId);
    Alert.alert('דחיית מועמד', `לדחות את ${w?.fullName ?? 'המועמד'}?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'דחה',
        style: 'destructive',
        onPress: () => respondToApplication(app.id, false),
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>בקשות שהתקבלו</Text>
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
          label={`אושר (${counts.accepted})`}
          active={filter === 'accepted'}
          tone="success"
          onPress={() => setFilter('accepted')}
        />
        <Chip
          label={`נדחה (${counts.rejected})`}
          active={filter === 'rejected'}
          tone="danger"
          onPress={() => setFilter('rejected')}
        />
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="people-outline"
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {counts.all === 0
              ? 'עדיין אין בקשות'
              : 'אין בקשות בסינון זה'}
          </Text>
          <Text style={styles.emptySub}>
            {counts.all === 0
              ? 'כשתפרסם משרות, מועמדויות יופיעו כאן.'
              : 'נסה סינון אחר'}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={filtered}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => {
            const worker = getUserById(item.workerId) as Worker | undefined;
            const job = jobs.find((j) => j.id === item.jobId);
            return (
              <ApplicationRow
                app={item}
                workerName={worker?.fullName ?? 'עובד לא ידוע'}
                workerProfession={worker?.profession ?? ''}
                workerExperience={worker?.experienceYears ?? 0}
                workerCity={worker?.city ?? ''}
                workerRating={worker?.rating}
                jobTitle={job?.title ?? '—'}
                onPressWorker={() =>
                  worker && onOpenWorkerProfile(worker.id)
                }
                onPressJob={() => job && onOpenJobDetails(job.id)}
                onAccept={() => handleAccept(item)}
                onReject={() => handleReject(item)}
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

const ApplicationRow: React.FC<{
  app: Application;
  workerName: string;
  workerProfession: string;
  workerExperience: number;
  workerCity: string;
  workerRating?: number;
  jobTitle: string;
  onPressWorker: () => void;
  onPressJob: () => void;
  onAccept: () => void;
  onReject: () => void;
}> = ({
  app,
  workerName,
  workerProfession,
  workerExperience,
  workerCity,
  workerRating,
  jobTitle,
  onPressWorker,
  onPressJob,
  onAccept,
  onReject,
}) => {
  const tone =
    app.status === 'pending'
      ? 'warning'
      : app.status === 'accepted'
      ? 'success'
      : 'danger';
  const label =
    app.status === 'pending'
      ? 'ממתין'
      : app.status === 'accepted'
      ? 'אושר'
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
          <Text style={styles.workerMeta}>
            {workerProfession} · {workerExperience} שנות ניסיון · {workerCity}
          </Text>
          {workerRating !== undefined && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={Colors.warning} />
              <Text style={styles.ratingText}>
                {workerRating.toFixed(1)}
              </Text>
            </View>
          )}
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

      {app.message && (
        <Text style={styles.message} numberOfLines={2}>
          {app.message}
        </Text>
      )}

      <Text style={styles.appliedAt}>
        הוגש:{' '}
        <Text style={{ writingDirection: 'ltr' }}>
          {new Date(app.appliedAt).toLocaleDateString('he-IL')}
        </Text>
      </Text>

      {app.status === 'pending' && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={onReject}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={18} color={Colors.danger} />
            <Text style={styles.rejectText}>דחה</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={onAccept}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={18} color={Colors.white} />
            <Text style={styles.acceptText}>אשר</Text>
          </TouchableOpacity>
        </View>
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
  ratingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '700',
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
  appliedAt: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
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
  acceptText: { color: Colors.white, fontSize: FontSize.md, fontWeight: '700' },
  rejectBtn: {
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
  rejectText: {
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

export default ApplicationsReceivedScreen;
