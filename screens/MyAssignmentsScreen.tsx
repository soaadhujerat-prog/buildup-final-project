import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Colors,
  Spacing,
  Radius,
  FontSize,
  Shadow,
  FilterChip as FC,
} from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import ResponseDialog from '../components/ResponseDialog';
import { callPhone } from '../utils/contact';
import {
  formatDateTime,
  assignmentStaffedLine,
  assignmentCompletedLine,
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUS_TONE,
} from '../utils/helpers';
import { assignmentErrorText } from '../services/assignmentsService';
import { Assignment, Contractor, JobPost, Worker } from '../types';
import { jobProfessions } from '../utils/normalize';

interface Props {
  onBack: () => void;
  onOpenJobDetails: (jobId: string) => void;
  onOpenChat: (contractorId: string) => void;
}

interface AssignmentRow {
  job: JobPost;
  assignment: Assignment;
}

// active → "פעיל", completed → "העבודה הסתיימה", cancelled → "השיבוץ בוטל".
// A finished job must never read like the contractor cancelled the worker.
const STATUS_LABEL = ASSIGNMENT_STATUS_LABEL;
const STATUS_TONE = ASSIGNMENT_STATUS_TONE;

// The worker-side filter maps 1:1 onto Assignment.status — never inferred from
// job status, and it never creates a new status.
type AssignmentFilter = 'all' | Assignment['status'];

const FILTER_TABS: { key: AssignmentFilter; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'active', label: 'פעילים' },
  { key: 'completed', label: 'העבודה הסתיימה' },
  { key: 'cancelled', label: 'השיבוץ בוטל' },
];

const EMPTY_FOR_FILTER: Record<AssignmentFilter, string> = {
  all: 'אין לך עדיין שיבוצים',
  active: 'אין לך שיבוצים פעילים כרגע',
  completed: 'עדיין לא סיימת עבודה במשרה כלשהי',
  cancelled: 'אין שיבוצים שבוטלו',
};

const MyAssignmentsScreen: React.FC<Props> = ({
  onBack,
  onOpenJobDetails,
  onOpenChat,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    getJobById,
    getAssignmentsForWorker,
    getUserById,
    cancelAssignment,
  } = useApp();
  const me = currentUser as Worker | undefined;

  const [filter, setFilter] = useState<AssignmentFilter>('all');
  const [cancelTarget, setCancelTarget] = useState<AssignmentRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // The filter row is laid out RTL (row-reverse), so "הכל" is the right-most
  // chip. A horizontal ScrollView still opens anchored at its left edge, which
  // would hide "הכל" whenever the chips overflow — so we anchor the initial
  // scroll to the right edge once. No data / order is touched.
  const chipScrollRef = useRef<ScrollView>(null);
  const chipAnchored = useRef(false);

  const submitCancel = async (message: string) => {
    if (!cancelTarget || cancelling) return;
    const id = cancelTarget.assignment.id;
    setCancelTarget(null);
    setCancelling(true);
    try {
      await cancelAssignment(id, 'worker', message || undefined);
    } catch (e) {
      Alert.alert('ביטול השיבוץ נכשל', assignmentErrorText(e));
    } finally {
      setCancelling(false);
    }
  };

  // Real staffing data only — never re-derive from application/invitation
  // counts. An Assignment exists here exactly because a contractor accepted
  // this worker's application, or the worker accepted a contractor's
  // invitation (see AppContext.respondToApplication/respondToInvitation).
  const assignments = useMemo<AssignmentRow[]>(() => {
    if (!me) return [];
    return getAssignmentsForWorker(me.id)
      .map((assignment) => {
        const job = getJobById(assignment.jobId);
        return job ? { job, assignment } : null;
      })
      .filter((x): x is AssignmentRow => !!x)
      .sort(
        (a, b) =>
          new Date(b.assignment.createdAt).getTime() -
          new Date(a.assignment.createdAt).getTime()
      );
  }, [me, getAssignmentsForWorker, getJobById]);

  const counts = useMemo(
    () => ({
      all: assignments.length,
      active: assignments.filter((a) => a.assignment.status === 'active').length,
      completed: assignments.filter((a) => a.assignment.status === 'completed')
        .length,
      cancelled: assignments.filter((a) => a.assignment.status === 'cancelled')
        .length,
    }),
    [assignments]
  );

  const filtered = useMemo(
    () =>
      filter === 'all'
        ? assignments
        : assignments.filter((a) => a.assignment.status === filter),
    [assignments, filter]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">השיבוצים שלי</Text>
      </View>

      <ScrollView
        ref={chipScrollRef}
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        onContentSizeChange={() => {
          if (chipAnchored.current) return;
          chipAnchored.current = true;
          // row-reverse content → the right edge is where "הכל" sits.
          chipScrollRef.current?.scrollToEnd({ animated: false });
        }}
      >
        {FILTER_TABS.map((tab) => (
          <Chip
            key={tab.key}
            label={`${tab.label} (${counts[tab.key]})`}
            active={filter === tab.key}
            tone={
              tab.key === 'active'
                ? 'success'
                : tab.key === 'completed'
                ? 'info'
                : tab.key === 'cancelled'
                ? 'neutral'
                : undefined
            }
            onPress={() => setFilter(tab.key)}
          />
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="briefcase-outline"
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>{EMPTY_FOR_FILTER[filter]}</Text>
          <Text style={styles.emptySub}>
            {counts.all === 0
              ? 'שיבוץ נוצר כאשר קבלן מאשר בקשה שהגשת, או כשאתה מאשר הזמנה שקיבלת.'
              : 'החלף סינון כדי לראות שיבוצים אחרים.'}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={filtered}
          keyExtractor={(a) => a.assignment.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => {
            const contractor = getUserById(item.job.contractorId) as
              | Contractor
              | undefined;
            const sourceLabel =
              item.assignment.source === 'application'
                ? 'בקשה שאושרה'
                : 'הזמנה שאישרת';
            return (
              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.rowMain}
                  activeOpacity={0.85}
                  onPress={() => onOpenJobDetails(item.job.id)}
                >
                  <View style={styles.iconCircle}>
                    <Ionicons
                      name="briefcase"
                      size={22}
                      color={Colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <StatusBadge
                        label={STATUS_LABEL[item.assignment.status]}
                        tone={STATUS_TONE[item.assignment.status]}
                        small
                      />
                      <Text style={styles.title} numberOfLines={1}>
                        {item.job.title}
                      </Text>
                      {contractor?.status === 'blocked' && (
                        <StatusBadge label="חשבון הקבלן חסום" tone="danger" small />
                      )}
                    </View>
                    <Text style={styles.sub} numberOfLines={1}>
                      {jobProfessions(item.job).join(', ')} · {item.job.city}
                    </Text>
                    <View style={styles.metaRow}>
                      {contractor && (
                        <View style={styles.metaItem}>
                          <Ionicons
                            name="business-outline"
                            size={14}
                            color={Colors.textMuted}
                          />
                          <Text style={styles.metaText} numberOfLines={1}>
                            {contractor.companyName ?? contractor.fullName}
                          </Text>
                        </View>
                      )}
                      <View style={styles.metaItem}>
                        <Ionicons
                          name="link-outline"
                          size={14}
                          color={Colors.textMuted}
                        />
                        <Text style={styles.metaText}>{sourceLabel}</Text>
                      </View>
                    </View>
                    <Text style={styles.stampText}>
                      {assignmentStaffedLine(item.assignment)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>

                {item.assignment.status === 'completed' && (
                  <View style={styles.completedInfo}>
                    <Text style={styles.completedInfoMeta}>
                      {assignmentCompletedLine(item.assignment) ??
                        'העבודה הסתיימה'}
                    </Text>
                    <Text style={styles.completedInfoMeta}>
                      השיבוץ נשמר בהיסטוריית העבודות שלך.
                    </Text>
                  </View>
                )}

                {item.assignment.status === 'cancelled' && (
                  <View style={styles.cancelInfo}>
                    <Text style={styles.cancelInfoMeta}>
                      בוטל על ידי{' '}
                      {item.assignment.cancelledBy === 'worker'
                        ? 'העובד'
                        : 'הקבלן'}
                      {item.assignment.cancelledAt
                        ? ` ב־${formatDateTime(item.assignment.cancelledAt)}`
                        : ''}
                    </Text>
                    {item.assignment.cancellationMessage ? (
                      <Text style={styles.cancelInfoMessage}>
                        “{item.assignment.cancellationMessage}”
                      </Text>
                    ) : null}
                  </View>
                )}

                {contractor && (
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() =>
                        onOpenChat(contractor.id)
                      }
                      activeOpacity={0.85}
                      accessibilityLabel="שלח הודעה לקבלן"
                    >
                      <Ionicons
                        name="chatbubble-outline"
                        size={16}
                        color={Colors.primary}
                      />
                      <Text style={styles.actionBtnText}>שלח הודעה</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => callPhone(contractor.phone)}
                      activeOpacity={0.85}
                      accessibilityLabel="התקשר לקבלן"
                    >
                      <Ionicons
                        name="call-outline"
                        size={16}
                        color={Colors.primary}
                      />
                      <Text style={styles.actionBtnText}>התקשר</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {item.assignment.status === 'active' && (
                  <TouchableOpacity
                    style={styles.giveUpBtn}
                    onPress={() => !cancelling && setCancelTarget(item)}
                    disabled={cancelling}
                    activeOpacity={0.85}
                    accessibilityLabel="ויתור על השיבוץ"
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={16}
                      color={Colors.danger}
                    />
                    <Text style={styles.giveUpBtnText}>ויתור על השיבוץ</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      <ResponseDialog
        visible={!!cancelTarget}
        title="לוותר על השיבוץ?"
        message="הקבלן יקבל עדכון שאינך יכול להשתתף במשרה."
        inputLabel="הודעה לקבלן (אופציונלי)"
        inputPlaceholder="למשל: לצערי לא אוכל להגיע בתאריך שנקבע."
        confirmLabel="ויתור על השיבוץ"
        destructive
        onConfirm={submitCancel}
        onClose={() => setCancelTarget(null)}
      />
    </View>
  );
};

const Chip: React.FC<{
  label: string;
  active: boolean;
  tone?: 'success' | 'info' | 'neutral';
  onPress: () => void;
}> = ({ label, active, tone, onPress }) => {
  const activeBg =
    tone === 'success'
      ? Colors.success
      : tone === 'info'
      ? Colors.info
      : tone === 'neutral'
      ? Colors.textSecondary
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  filterScroll: { flexGrow: 0, flexShrink: 0 },
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

  results: {
    flex: 1,
  },

  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 40,
  },

  row: {
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.md,
    ...Shadow.medium,
  },
  rowMain: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cardActions: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  stampText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 4,
  },
  completedInfo: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: 3,
  },
  completedInfoMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.xs + 6,
  },
  cancelInfo: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: 3,
  },
  cancelInfoMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.xs + 6,
  },
  cancelInfoMessage: {
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    fontStyle: 'italic',
    lineHeight: FontSize.sm + 5,
  },
  giveUpBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    backgroundColor: Colors.white,
  },
  giveUpBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.danger,
    writingDirection: 'rtl',
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
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
    flexShrink: 1,
  },
  sub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row-reverse',
    gap: 12,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
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
    textAlign: 'center',
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
});

export default MyAssignmentsScreen;
