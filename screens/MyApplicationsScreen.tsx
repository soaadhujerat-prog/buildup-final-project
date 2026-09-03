import React, { useMemo, useRef, useState } from 'react';
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

import { Colors, Spacing, Radius, FontSize, Shadow, FilterChip as FC } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import { getWorkerJobAssignment } from '../services/assignmentService';
import {
  formatJobRateCompact,
  applicationTimeline,
  assignmentCancelLine,
  currentStaffedState,
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_TONE,
} from '../utils/helpers';
import {
  Application,
  ApplicationStatus,
  Assignment,
  Contractor,
  Worker,
} from '../types';
import { useRememberedScroll } from '../utils/scrollMemory';

interface Props {
  onBack: () => void;
  onOpenJobDetails: (jobId: string) => void;
  initialFilter?: 'all' | ApplicationStatus;
}

type Filter = 'all' | ApplicationStatus;

const MyApplicationsScreen: React.FC<Props> = ({
  onBack,
  onOpenJobDetails,
  initialFilter = 'all',
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    applications,
    applicationsLoading,
    getJobById,
    assignments,
    getUserById,
    withdrawApplication,
  } = useApp();
  const me = currentUser as Worker | undefined;

  const listRef = useRef<FlatList>(null);
  const { onScroll, scrollEventThrottle, restoreOnce } = useRememberedScroll(
    'worker/my-applications'
  );

  const handleWithdraw = (app: Application) => {
    Alert.alert(
      'לבטל את הבקשה?',
      'הבקשה שלך למשרה תבוטל. כל עוד ההרשמה פתוחה, תוכל להגיש בקשה חדשה בהמשך.',
      [
        { text: 'חזור', style: 'cancel' },
        {
          text: 'ביטול הבקשה',
          style: 'destructive',
          onPress: async () => {
            try {
              await withdrawApplication(app.id);
            } catch {
              Alert.alert(
                'ביטול הבקשה נכשל',
                'אירעה שגיאה. בדוק/י את החיבור לאינטרנט ונסה/י שוב.'
              );
            }
          },
        },
      ]
    );
  };

  const [filter, setFilter] = useState<Filter>(initialFilter);

  // SOURCE: applications.filter(workerId === me.id)
  const myApplications = useMemo(
    () => applications.filter((a) => a.workerId === me?.id),
    [applications, me]
  );

  const filtered = useMemo(() => {
    let base: Application[];
    if (filter === 'all') {
      base = myApplications;
    } else {
      base = myApplications.filter((a) => a.status === filter);
    }
    return [...base].sort(
      (a, b) =>
        new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
    );
  }, [myApplications, filter]);

  const counts = {
    all: myApplications.length,
    pending: myApplications.filter((a) => a.status === 'pending').length,
    accepted: myApplications.filter((a) => a.status === 'accepted').length,
    rejected: myApplications.filter((a) => a.status === 'rejected').length,
    withdrawn: myApplications.filter((a) => a.status === 'withdrawn').length,
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">הבקשות שלי</Text>
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
          label={`אושרו (${counts.accepted})`}
          active={filter === 'accepted'}
          tone="success"
          onPress={() => setFilter('accepted')}
        />
        <Chip
          label={`נדחו (${counts.rejected})`}
          active={filter === 'rejected'}
          tone="danger"
          onPress={() => setFilter('rejected')}
        />
        <Chip
          label={`בוטלו (${counts.withdrawn})`}
          active={filter === 'withdrawn'}
          onPress={() => setFilter('withdrawn')}
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
            {applicationsLoading && counts.all === 0
              ? 'טוען מועמדויות…'
              : counts.all === 0
              ? 'עדיין לא הגשת מועמדות'
              : 'אין בקשות בסינון זה'}
          </Text>
          <Text style={styles.emptySub}>
            {applicationsLoading && counts.all === 0
              ? ''
              : counts.all === 0
              ? 'גלה משרות מתאימות במסך חיפוש העבודות.'
              : 'נסה סינון אחר'}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.results}
          data={filtered}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          onScroll={onScroll}
          scrollEventThrottle={scrollEventThrottle}
          onContentSizeChange={() =>
            restoreOnce((y) => listRef.current?.scrollToOffset({ offset: y, animated: false }))
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => {
            // getJobById also resolves jobs the worker is tied to that have
            // since filled / closed (via AppContext's relatedJobs cache), so an
            // accepted request keeps its title / company / city / rate.
            const job = getJobById(item.jobId);
            const contractor = job
              ? (getUserById(job.contractorId) as Contractor | undefined)
              : undefined;
            return (
              <ApplicationRow
                app={item}
                jobTitle={job?.title ?? '—'}
                jobCity={job?.city ?? ''}
                jobRateLabel={job ? formatJobRateCompact(job) : ''}
                contractorName={
                  contractor?.companyName ?? contractor?.fullName ?? ''
                }
                assignment={getWorkerJobAssignment(
                  assignments,
                  item.jobId,
                  item.workerId
                )}
                onPress={() => job && onOpenJobDetails(job.id)}
                onWithdraw={() => handleWithdraw(item)}
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
  tone?: 'success' | 'warning' | 'danger' | 'info';
  onPress: () => void;
}> = ({ label, active, tone, onPress }) => {
  const activeBg =
    tone === 'success'
      ? Colors.success
      : tone === 'warning'
      ? Colors.warning
      : tone === 'danger'
      ? Colors.danger
      : tone === 'info'
      ? Colors.info
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
  jobTitle: string;
  jobCity: string;
  jobRateLabel: string;
  contractorName: string;
  assignment: Assignment | undefined;
  onPress: () => void;
  onWithdraw: () => void;
}> = ({
  app,
  jobTitle,
  jobCity,
  jobRateLabel,
  contractorName,
  assignment,
  onPress,
  onWithdraw,
}) => {
  const { label, tone } = currentStaffedState(
    {
      label: APPLICATION_STATUS_LABEL[app.status],
      tone: APPLICATION_STATUS_TONE[app.status],
    },
    app.status,
    assignment
  );
  const cancelLine =
    app.status === 'accepted' && assignment?.status === 'cancelled'
      ? assignmentCancelLine(assignment)
      : null;
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardHead}>
        <StatusBadge label={label} tone={tone} small />
        <Text style={styles.title} numberOfLines={1}>
          {jobTitle}
        </Text>
      </View>

      {contractorName ? (
        <Text style={styles.contractor} numberOfLines={1}>
          <Ionicons
            name="business-outline"
            size={12}
            color={Colors.textMuted}
          />{' '}
          {contractorName}
        </Text>
      ) : null}

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

      <View style={styles.timeline}>
        {applicationTimeline(app).map((line) => (
          <Text key={line} style={styles.appliedAt}>
            {line}
          </Text>
        ))}
        {cancelLine && <Text style={styles.appliedAt}>{cancelLine}</Text>}
      </View>

      {app.contractorResponse && (
        <View style={styles.response}>
          <Text style={styles.responseLabel}>הודעת הקבלן</Text>
          <Text style={styles.responseText}>{app.contractorResponse}</Text>
        </View>
      )}

      {app.status === 'accepted' &&
      assignment?.status === 'cancelled' &&
      assignment.cancellationMessage ? (
        <View style={styles.response}>
          <Text style={styles.responseLabel}>
            {assignment.cancelledBy === 'worker'
              ? 'ההודעה ששלחת'
              : 'הודעת הקבלן על הביטול'}
          </Text>
          <Text style={styles.responseText}>
            {assignment.cancellationMessage}
          </Text>
        </View>
      ) : null}

      {app.status === 'pending' && (
        <TouchableOpacity
          style={styles.withdrawBtn}
          onPress={onWithdraw}
          activeOpacity={0.85}
        >
          <Ionicons
            name="close-circle-outline"
            size={16}
            color={Colors.danger}
          />
          <Text style={styles.withdrawText}>ביטול הבקשה</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
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
    gap: 6,
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
  contractor: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metaRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
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
  timeline: {
    width: '100%',
    gap: 2,
  },
  appliedAt: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.xs + 7,
    flexShrink: 1,
  },
  withdrawBtn: {
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
  withdrawText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.danger,
    writingDirection: 'rtl',
  },
  response: {
    backgroundColor: Colors.primaryFaint,
    padding: 8,
    borderRadius: Radius.sm,
    gap: 2,
  },
  responseLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  responseText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.sm + 5,
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

export default MyApplicationsScreen;
