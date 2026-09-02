import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import EmptyState from '../components/EmptyState';
import SmartMatchJobSummary from '../components/SmartMatchJobSummary';
import SmartMatchJobPicker from '../components/SmartMatchJobPicker';
import SmartMatchWorkerCard from '../components/SmartMatchWorkerCard';
import RtlScrollRow from '../components/RtlScrollRow';
import { getSmartMatches } from '../services/smartMatchService';
import {
  getWorkerContractorRelationship,
  WorkerContractorRelationship,
} from '../services/assignmentService';
import { isOpenForApplications } from '../services/jobStatusService';
import { sendInvitationErrorText } from '../services/invitationsService';
import { Contractor, JobPost, SmartMatchResult, Worker } from '../types';

interface Props {
  initialJobId?: string;
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
  onOpenJobDetails: (jobId: string) => void;
  onOpenSearchWorkers?: () => void;
}

type SmartSort = 'best' | 'distance' | 'compensation';

interface Filters {
  available: boolean;
  worked: boolean;
  strong: boolean;
}

interface Row {
  result: SmartMatchResult;
  worker: Worker;
  relationship: WorkerContractorRelationship;
}

const SmartMatchScreen: React.FC<Props> = ({
  initialJobId,
  onBack,
  onOpenWorkerProfile,
  onOpenJobDetails,
  onOpenSearchWorkers,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    jobs,
    workers,
    invitations,
    assignments,
    sendInvitation,
    getStaffingProgress,
  } = useApp();
  const me =
    currentUser?.role === 'contractor' ? (currentUser as Contractor) : undefined;

  // Jobs the contractor can actually staff right now — same "open to
  // registration" source of truth every other screen uses.
  const myOpenJobs = useMemo(
    () => jobs.filter((j) => j.contractorId === me?.id && isOpenForApplications(j)),
    [jobs, me]
  );
  // All the contractor's jobs — so a deep link to a job that is momentarily
  // closed still resolves.
  const myJobs = useMemo(
    () => jobs.filter((j) => j.contractorId === me?.id),
    [jobs, me]
  );

  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    initialJobId ?? null
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle'
  );
  const [results, setResults] = useState<SmartMatchResult[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [sort, setSort] = useState<SmartSort>('best');
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    available: false,
    worked: false,
    strong: false,
  });

  const selectedJob = useMemo<JobPost | undefined>(
    () => myJobs.find((j) => j.id === selectedJobId),
    [myJobs, selectedJobId]
  );

  // The sort/filter row is an RTL horizontal scroller — the shared
  // `RtlScrollRow` primitive keeps the first chip ("ההתאמה הגבוהה ביותר")
  // flush at the right edge with no initial scroll, on both platforms.

  // ---- run the match (local now, Supabase Edge Function later) ----
  useEffect(() => {
    if (!selectedJob) {
      setStatus('idle');
      setResults([]);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    getSmartMatches({ jobId: selectedJob.id })
      .then((r) => {
        if (!cancelled) {
          setResults(r);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId, reloadKey]);

  // ---- live invitation / assignment state for this job ----
  const invitedWorkerIds = useMemo(() => {
    if (!selectedJobId) return new Set<string>();
    return new Set(
      invitations
        .filter(
          (i) =>
            i.jobId === selectedJobId &&
            (i.status === 'pending' || i.status === 'accepted')
        )
        .map((i) => i.workerId)
    );
  }, [invitations, selectedJobId]);

  const assignedWorkerIds = useMemo(() => {
    if (!selectedJobId) return new Set<string>();
    return new Set(
      assignments
        .filter((a) => a.jobId === selectedJobId && a.status === 'active')
        .map((a) => a.workerId)
    );
  }, [assignments, selectedJobId]);

  // ---- rows = result + worker + relationship ----
  const rows = useMemo<Row[]>(() => {
    if (!selectedJob || !me) return [];
    const out: Row[] = [];
    results.forEach((result) => {
      const worker = workers.find((w) => w.id === result.workerId);
      if (!worker) {
        // Defensive only. After the server-side eligibility fix (Smart Match
        // candidates must be is_available=true, which the contractor can always
        // resolve via the normal worker-discovery RLS path) every returned
        // candidate should be joinable here. A miss now means a transient race
        // (pool still hydrating / worker flipped availability mid-session) — skip
        // the row rather than fabricate a Worker or render fallback data.
        if (__DEV__) {
          // opaque ids only — no PII
          console.warn(
            '[SmartMatch] unresolved candidate, skipping row:',
            result.workerId
          );
        }
        return;
      }
      out.push({
        result,
        worker,
        relationship: getWorkerContractorRelationship(
          assignments,
          worker.id,
          me.id
        ),
      });
    });
    return out;
  }, [results, workers, assignments, selectedJob, me]);

  const canSortDistance = rows.some((r) => r.result.distanceKm != null);
  const canSortCompensation = rows.some(
    (r) => r.result.compensationStatus !== 'unknown'
  );
  const filtersActive = filters.available || filters.worked || filters.strong;

  const visible = useMemo<Row[]>(() => {
    let list = rows;
    if (filters.available) list = list.filter((r) => r.worker.isAvailable);
    if (filters.worked) list = list.filter((r) => r.relationship !== 'never');
    if (filters.strong) list = list.filter((r) => r.result.matchPercent >= 75);

    const sorted = [...list];
    if (sort === 'distance' && canSortDistance) {
      sorted.sort(
        (a, b) =>
          (a.result.distanceKm ?? Number.POSITIVE_INFINITY) -
          (b.result.distanceKm ?? Number.POSITIVE_INFINITY)
      );
    } else if (sort === 'compensation' && canSortCompensation) {
      const rank: Record<string, number> = {
        within_budget: 0,
        slightly_above: 1,
        above_budget: 2,
        unknown: 3,
      };
      sorted.sort(
        (a, b) =>
          rank[a.result.compensationStatus] - rank[b.result.compensationStatus] ||
          b.result.matchPercent - a.result.matchPercent
      );
    }
    // 'best' — the service already ranked by matchPercent; keep that order.
    return sorted;
  }, [rows, filters, sort, canSortDistance, canSortCompensation]);

  const staffingLabel = useMemo(() => {
    if (!selectedJob) return undefined;
    const p = getStaffingProgress(selectedJob.id);
    return `${p.filled} מתוך ${p.needed} שובצו`;
  }, [selectedJob, getStaffingProgress]);

  // ---- actions ----
  const handleInvite = async (workerId: string, workerName: string) => {
    if (!selectedJob || !me || invitingId) return;
    setInvitingId(workerId);
    try {
      const res = await sendInvitation(selectedJob.id, me.id, workerId);
      if (!res.ok) {
        Alert.alert('לא ניתן להזמין', sendInvitationErrorText(res.reason ?? 'error'));
        return;
      }
      Alert.alert('הזמנה נשלחה', `ההזמנה נשלחה ל-${workerName}.`);
    } finally {
      setInvitingId(null);
    }
  };

  const resultsSubtitle =
    sort === 'distance'
      ? 'מסודרים לפי קרבה למיקום העבודה'
      : sort === 'compensation'
      ? 'מסודרים לפי התאמה לתקציב'
      : 'מסודרים לפי רמת ההתאמה';

  // -------------------------------------------------------------------------

  const Header = (
    <View style={styles.headerBar}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="חזרה"
      >
        <Ionicons name="chevron-forward" size={26} color={Colors.text} />
      </TouchableOpacity>
      <View style={styles.headerCenter} pointerEvents="none">
        <View style={styles.headerTitleRow}>
          <Ionicons name="sparkles" size={16} color={Colors.primary} />
          <Text style={styles.headerTitle}>התאמה חכמה</Text>
        </View>
      </View>
    </View>
  );

  const Subtitle = (
    <Text style={styles.subtitle}>
      המערכת מנתחת את דרישות המשרה ונתוני העובדים כדי להציג את ההתאמות המתאימות
      ביותר.
    </Text>
  );

  const JobSelector = (
    <TouchableOpacity
      style={styles.selector}
      onPress={() => setPickerOpen(true)}
      activeOpacity={0.85}
    >
      <Ionicons name="briefcase-outline" size={18} color={Colors.primary} />
      <Text style={styles.selectorText} numberOfLines={1}>
        {selectedJob ? selectedJob.title : 'בחר משרה'}
      </Text>
      <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
    </TouchableOpacity>
  );

  // ---- no contractor session (defensive) ----
  if (!me) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {Header}
        <EmptyState icon="lock-closed-outline" title="הרכיב זמין לקבלנים בלבד" />
      </View>
    );
  }

  // ---- state A: nothing selected ----
  if (!selectedJob) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {Header}
        <ScrollView
          contentContainerStyle={styles.scrollBody}
          showsVerticalScrollIndicator={false}
        >
          {Subtitle}
          {myOpenJobs.length > 0 && JobSelector}
          {myOpenJobs.length === 0 ? (
            <EmptyState
              icon="briefcase-outline"
              title="אין משרות פתוחות"
              description="פרסם משרה חדשה כדי להפעיל התאמה חכמה."
            />
          ) : (
            <EmptyState
              icon="sparkles-outline"
              title="בחר משרה כדי להתחיל התאמה חכמה"
              description="נדרג עבורך את העובדים המתאימים ביותר לדרישות המשרה."
              actionLabel="בחר משרה"
              onAction={() => setPickerOpen(true)}
            />
          )}
        </ScrollView>

        <SmartMatchJobPicker
          visible={pickerOpen}
          jobs={myOpenJobs}
          selectedJobId={selectedJobId}
          onSelect={setSelectedJobId}
          onClose={() => setPickerOpen(false)}
        />
      </View>
    );
  }

  // ---- states B–E: a job is selected ----
  const ListHeader = (
    <View style={styles.listHeader}>
      {Subtitle}
      {JobSelector}
      <SmartMatchJobSummary
        job={selectedJob}
        staffingLabel={staffingLabel}
        onPressDetails={() => onOpenJobDetails(selectedJob.id)}
      />

      {status === 'loading' && (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>מנתחים את ההתאמות למשרה...</Text>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <View style={styles.skeletonRow}>
                <View style={styles.skeletonAvatar} />
                <View style={styles.skeletonLines}>
                  <View style={[styles.skeletonLine, { width: '55%' }]} />
                  <View style={[styles.skeletonLine, { width: '40%' }]} />
                </View>
                <View style={styles.skeletonScore} />
              </View>
            </View>
          ))}
        </View>
      )}

      {status === 'error' && (
        <View style={styles.errorBlock}>
          <Ionicons name="cloud-offline-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.errorText}>
            לא הצלחנו לטעון את ההתאמות. נסה שוב.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => setReloadKey((k) => k + 1)}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={16} color={Colors.white} />
            <Text style={styles.retryText}>נסה שוב</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'ready' && (
        <>
          <RtlScrollRow contentContainerStyle={styles.controlRow}>
            <SortChip
              label="ההתאמה הגבוהה ביותר"
              active={sort === 'best'}
              onPress={() => setSort('best')}
            />
            {canSortDistance && (
              <SortChip
                label="הקרובים ביותר למשרה"
                active={sort === 'distance'}
                onPress={() => setSort('distance')}
              />
            )}
            {canSortCompensation && (
              <SortChip
                label="המתאימים ביותר לתקציב"
                active={sort === 'compensation'}
                onPress={() => setSort('compensation')}
              />
            )}

            <View style={styles.controlDivider} />

            <ToggleChip
              label="זמינים עכשיו"
              active={filters.available}
              onPress={() =>
                setFilters((f) => ({ ...f, available: !f.available }))
              }
            />
            <ToggleChip
              label="עבדנו יחד"
              active={filters.worked}
              onPress={() => setFilters((f) => ({ ...f, worked: !f.worked }))}
            />
            <ToggleChip
              label="התאמה 75%+"
              active={filters.strong}
              onPress={() => setFilters((f) => ({ ...f, strong: !f.strong }))}
            />
          </RtlScrollRow>

          <View style={styles.resultsHead}>
            <Text style={styles.resultsTitle}>
              {visible.length === 1
                ? 'מצאנו עובד אחד שמתאים למשרה'
                : `מצאנו ${visible.length} עובדים שמתאימים למשרה`}
            </Text>
            {visible.length > 0 && (
              <Text style={styles.resultsSub}>{resultsSubtitle}</Text>
            )}
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {Header}
      <FlatList
        data={status === 'ready' ? visible : []}
        keyExtractor={(r) => r.worker.id}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          status === 'ready' ? (
            filtersActive ? (
              <EmptyState
                icon="filter-outline"
                title="אין עובדים שמתאימים לסינון שבחרת"
                description="נסה להסיר חלק מהסינונים כדי לראות עוד התאמות."
                actionLabel="נקה סינון"
                onAction={() =>
                  setFilters({ available: false, worked: false, strong: false })
                }
              />
            ) : (
              <EmptyState
                icon="people-outline"
                title="לא נמצאו כרגע עובדים שמתאימים לדרישות המשרה"
                description="אפשר לחפש עובדים ידנית ולהזמין אותם למשרה."
                actionLabel={onOpenSearchWorkers ? 'חפש עובדים' : undefined}
                onAction={onOpenSearchWorkers}
              />
            )
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <SmartMatchWorkerCard
              worker={item.worker}
              result={item.result}
              relationship={item.relationship}
              jobCity={selectedJob.city}
              invited={invitedWorkerIds.has(item.worker.id)}
              assigned={assignedWorkerIds.has(item.worker.id)}
              onPressProfile={() => onOpenWorkerProfile(item.worker.id)}
              onInvite={() =>
                handleInvite(item.worker.id, item.worker.fullName)
              }
            />
          </View>
        )}
      />

      <SmartMatchJobPicker
        visible={pickerOpen}
        jobs={myOpenJobs}
        selectedJobId={selectedJobId}
        onSelect={setSelectedJobId}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
};

// ---------- small controls ----------

const SortChip: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => (
  <TouchableOpacity
    style={[styles.chip, active && styles.chipActive]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={[styles.chipText, active && styles.chipTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const ToggleChip: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => (
  <TouchableOpacity
    style={[styles.chip, active && styles.chipActive]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Ionicons
      name={active ? 'checkmark-circle' : 'add-circle-outline'}
      size={14}
      color={active ? Colors.white : Colors.textSecondary}
    />
    <Text style={[styles.chipText, active && styles.chipTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

// ---------- styles ----------

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
  backBtn: { position: 'absolute', right: Spacing.lg, top: Spacing.sm, padding: 6 },
  headerCenter: { alignItems: 'center', justifyContent: 'center' },
  headerTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },

  scrollBody: {
    flexGrow: 1,
    padding: Spacing.lg,
    paddingBottom: 60,
    gap: Spacing.sm,
  },
  listHeader: { gap: Spacing.sm, marginBottom: Spacing.sm },

  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  selector: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    ...Shadow.small,
  },
  selectorText: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  controlRow: {
    gap: 8,
    paddingVertical: 2,
  },
  controlDivider: {
    width: 1,
    height: 22,
    backgroundColor: Colors.border,
    marginHorizontal: 2,
  },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  chipTextActive: { color: Colors.white },

  resultsHead: { marginTop: Spacing.xs, gap: 2, alignItems: 'flex-end' },
  resultsTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  resultsSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  cardWrap: { marginTop: Spacing.sm },

  loadingBlock: { gap: Spacing.sm, paddingTop: Spacing.md, alignItems: 'stretch' },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  skeletonCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    ...Shadow.small,
  },
  skeletonRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: Spacing.sm },
  skeletonAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gray100,
  },
  skeletonLines: { flex: 1, gap: 8 },
  skeletonLine: { height: 10, borderRadius: 5, backgroundColor: Colors.gray100 },
  skeletonScore: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.gray100,
  },

  errorBlock: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  retryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.full,
  },
  retryText: { color: Colors.white, fontWeight: '800', fontSize: FontSize.sm },
});

export default SmartMatchScreen;
