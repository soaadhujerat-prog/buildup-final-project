import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StaffingProgress from '../components/StaffingProgress';
import StatusBadge from '../components/StatusBadge';
import WorkerAvatar from '../components/WorkerAvatar';
import ResponseDialog from '../components/ResponseDialog';
import { callPhone } from '../utils/contact';
import {
  assignmentStaffedLine,
  assignmentCompletedLine,
  assignmentCancelLine,
} from '../utils/helpers';
import { getEffectiveJobAssignments } from '../services/assignmentService';
import { assignmentErrorText } from '../services/assignmentsService';
import { Worker, Assignment } from '../types';

interface Props {
  jobId: string;
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
  onOpenChat: (workerId: string) => void;
  onOpenSearchWorkers: () => void;
  onOpenSmartMatch: () => void;
}

interface WorkerRow {
  assignment: Assignment;
  worker: Worker;
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
  const {
    getJobById,
    getUserById,
    assignments,
    getStaffingProgress,
    cancelAssignment,
    completeAssignment,
  } = useApp();

  const job = getJobById(jobId);
  const progress = getStaffingProgress(jobId);

  // One effective row per unique worker (never the raw collection) so a
  // re-hired worker can't appear in two sections at once.
  const rows = useMemo<WorkerRow[]>(() => {
    return getEffectiveJobAssignments(assignments, jobId)
      .map((assignment) => ({
        assignment,
        worker: getUserById(assignment.workerId) as Worker | undefined,
      }))
      .filter((x): x is WorkerRow => !!x.worker);
  }, [assignments, jobId, getUserById]);

  const activeRows = useMemo(
    () =>
      rows
        .filter((r) => r.assignment.status === 'active')
        .sort(
          (a, b) =>
            new Date(a.assignment.createdAt).getTime() -
            new Date(b.assignment.createdAt).getTime()
        ),
    [rows]
  );

  const completedRows = useMemo(
    () =>
      rows
        .filter((r) => r.assignment.status === 'completed')
        .sort(
          (a, b) =>
            new Date(b.assignment.completedAt ?? b.assignment.updatedAt).getTime() -
            new Date(a.assignment.completedAt ?? a.assignment.updatedAt).getTime()
        ),
    [rows]
  );

  const cancelledRows = useMemo(
    () =>
      rows
        .filter((r) => r.assignment.status === 'cancelled')
        .sort(
          (a, b) =>
            new Date(b.assignment.cancelledAt ?? b.assignment.updatedAt).getTime() -
            new Date(a.assignment.cancelledAt ?? a.assignment.updatedAt).getTime()
        ),
    [rows]
  );

  const [cancelTarget, setCancelTarget] = useState<WorkerRow | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const submitCancel = async (message: string) => {
    if (!cancelTarget || actionBusy) return;
    const id = cancelTarget.assignment.id;
    setCancelTarget(null);
    setActionBusy(true);
    try {
      await cancelAssignment(id, 'contractor', message || undefined);
    } catch (e) {
      Alert.alert('ביטול השיבוץ נכשל', assignmentErrorText(e));
    } finally {
      setActionBusy(false);
    }
  };

  const confirmComplete = (row: WorkerRow) => {
    Alert.alert(
      'סיום עבודה',
      `האם לסמן ש-${row.worker.fullName} סיים את עבודתו במשרה?\nהשיבוץ יישמר בהיסטוריה ולא יתפנה מקום לעובד חדש.`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'סיום עבודה',
          onPress: async () => {
            if (actionBusy) return;
            setActionBusy(true);
            try {
              await completeAssignment(row.assignment.id);
            } catch (e) {
              Alert.alert('סיום העבודה נכשל', assignmentErrorText(e));
            } finally {
              setActionBusy(false);
            }
          },
        },
      ]
    );
  };

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

  const nothingYet =
    activeRows.length === 0 &&
    completedRows.length === 0 &&
    cancelledRows.length === 0;

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
        <Text style={styles.headerTitle} pointerEvents="none">
          ניהול שיבוצים
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
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

        {nothingYet ? (
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
        ) : (
          <>
            {/* Section 1 — currently working */}
            <SectionHeader
              title="עובדים משובצים כרגע"
              count={activeRows.length}
            />
            {activeRows.length === 0 ? (
              <Text style={styles.sectionEmpty}>
                אין כרגע עובדים פעילים במשרה.
              </Text>
            ) : (
              activeRows.map((row) => (
                <ActiveWorkerCard
                  key={row.assignment.id}
                  row={row}
                  onPressProfile={() => onOpenWorkerProfile(row.worker.id)}
                  onPressMessage={() => onOpenChat(row.worker.id)}
                  onPressCall={() => callPhone(row.worker.phone)}
                  onComplete={() => !actionBusy && confirmComplete(row)}
                  onCancel={() => !actionBusy && setCancelTarget(row)}
                />
              ))
            )}

            {/* Section 2 — finished their part */}
            {completedRows.length > 0 && (
              <>
                <SectionHeader
                  title="עובדים שסיימו את עבודתם"
                  count={completedRows.length}
                />
                {completedRows.map((row) => (
                  <HistoryWorkerCard
                    key={row.assignment.id}
                    row={row}
                    badgeLabel="העבודה הסתיימה"
                    badgeTone="info"
                    onPressProfile={() => onOpenWorkerProfile(row.worker.id)}
                    onPressMessage={() => onOpenChat(row.worker.id)}
                    onPressCall={() => callPhone(row.worker.phone)}
                  />
                ))}
              </>
            )}

            {/* Section 3 — cancelled staffing */}
            {cancelledRows.length > 0 && (
              <>
                <SectionHeader
                  title="שיבוצים שבוטלו"
                  count={cancelledRows.length}
                />
                {cancelledRows.map((row) => (
                  <HistoryWorkerCard
                    key={row.assignment.id}
                    row={row}
                    badgeLabel="השיבוץ בוטל"
                    badgeTone="neutral"
                    onPressProfile={() => onOpenWorkerProfile(row.worker.id)}
                    onPressMessage={() => onOpenChat(row.worker.id)}
                    onPressCall={() => callPhone(row.worker.phone)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <ResponseDialog
        visible={!!cancelTarget}
        title={`לבטל את השיבוץ של ${cancelTarget?.worker.fullName ?? ''}?`}
        message="העובד יוסר מהשיבוץ למשרה והמערכת תעדכן את מספר המקומות הפנויים."
        inputLabel="הודעה לעובד (אופציונלי)"
        inputPlaceholder="למשל: חל שינוי בצורכי הפרויקט ולכן השיבוץ בוטל."
        confirmLabel="ביטול שיבוץ"
        destructive
        onConfirm={submitCancel}
        onClose={() => setCancelTarget(null)}
      />
    </View>
  );
};

const SectionHeader: React.FC<{ title: string; count: number }> = ({
  title,
  count,
}) => (
  <View style={styles.sectionHeader}>
    <View style={styles.sectionCountPill}>
      <Text style={styles.sectionCountText}>{count}</Text>
    </View>
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

const ContactRow: React.FC<{
  worker: Worker;
  onPressMessage: () => void;
  onPressCall: () => void;
}> = ({ worker, onPressMessage, onPressCall }) => (
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
);

const ActiveWorkerCard: React.FC<{
  row: WorkerRow;
  onPressProfile: () => void;
  onPressMessage: () => void;
  onPressCall: () => void;
  onComplete: () => void;
  onCancel: () => void;
}> = ({
  row,
  onPressProfile,
  onPressMessage,
  onPressCall,
  onComplete,
  onCancel,
}) => (
  <View style={styles.card}>
    <TouchableOpacity
      style={styles.cardHead}
      onPress={onPressProfile}
      activeOpacity={0.85}
    >
      <WorkerAvatar worker={row.worker} size={44} />
      <View style={{ flex: 1 }}>
        <View style={styles.cardTopline}>
          {row.worker.status === 'blocked' ? (
            <StatusBadge label="חשבון חסום" tone="danger" small />
          ) : (
            <View style={styles.statusDot} />
          )}
          <Text style={styles.workerName}>{row.worker.fullName}</Text>
        </View>
        <Text style={styles.workerMeta} numberOfLines={1}>
          {row.worker.profession} · {row.worker.experienceYears} שנים ·{' '}
          {row.worker.city}
        </Text>
        <Text style={styles.stampText}>
          {assignmentStaffedLine(row.assignment)}
        </Text>
      </View>
      <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
    </TouchableOpacity>

    <ContactRow
      worker={row.worker}
      onPressMessage={onPressMessage}
      onPressCall={onPressCall}
    />

    <View style={styles.cardActions}>
      <TouchableOpacity
        style={styles.completeBtn}
        onPress={onComplete}
        activeOpacity={0.85}
        accessibilityLabel={`סיום העבודה של ${row.worker.fullName}`}
      >
        <Ionicons
          name="checkmark-done-outline"
          size={16}
          color={Colors.success}
        />
        <Text style={styles.completeBtnText}>סיום עבודה</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={onCancel}
        activeOpacity={0.85}
        accessibilityLabel={`ביטול השיבוץ של ${row.worker.fullName}`}
      >
        <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
        <Text style={styles.cancelBtnText}>ביטול שיבוץ</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const HistoryWorkerCard: React.FC<{
  row: WorkerRow;
  badgeLabel: string;
  badgeTone: 'info' | 'neutral';
  onPressProfile: () => void;
  onPressMessage: () => void;
  onPressCall: () => void;
}> = ({
  row,
  badgeLabel,
  badgeTone,
  onPressProfile,
  onPressMessage,
  onPressCall,
}) => {
  const completedLine = assignmentCompletedLine(row.assignment);
  const cancelLine =
    row.assignment.status === 'cancelled'
      ? assignmentCancelLine(row.assignment)
      : null;
  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHead}
        onPress={onPressProfile}
        activeOpacity={0.85}
      >
        <WorkerAvatar worker={row.worker} size={44} />
        <View style={{ flex: 1 }}>
          <View style={styles.cardTopline}>
            <StatusBadge label={badgeLabel} tone={badgeTone} small />
            <Text style={styles.workerName}>{row.worker.fullName}</Text>
            {row.worker.status === 'blocked' && (
              <StatusBadge label="חשבון חסום" tone="danger" small />
            )}
          </View>
          <Text style={styles.stampText}>
            {assignmentStaffedLine(row.assignment)}
          </Text>
          {completedLine && (
            <Text style={styles.stampText}>{completedLine}</Text>
          )}
          {cancelLine && <Text style={styles.stampText}>{cancelLine}</Text>}
          {row.assignment.status === 'cancelled' &&
          row.assignment.cancellationMessage ? (
            <Text style={styles.historyMessage}>
              “{row.assignment.cancellationMessage}”
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      <ContactRow
        worker={row.worker}
        onPressMessage={onPressMessage}
        onPressCall={onPressCall}
      />
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

  notFound: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 60,
  },
  backLink: { alignItems: 'center', marginTop: 12 },
  backLinkText: { color: Colors.primary, fontWeight: '700' },

  list: { padding: Spacing.lg, paddingBottom: 60, gap: Spacing.sm },

  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
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

  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.lg,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sectionCountPill: {
    minWidth: 22,
    paddingHorizontal: 6,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCountText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.primary,
  },
  sectionEmpty: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingVertical: 4,
  },

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
  stampText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
    textAlign: 'right',
    marginTop: 2,
  },
  historyMessage: {
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    fontStyle: 'italic',
    lineHeight: FontSize.sm + 5,
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
  completeBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.success,
    backgroundColor: Colors.white,
  },
  completeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.success,
    writingDirection: 'rtl',
  },
  cancelBtn: {
    flex: 1,
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
  cancelBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.danger,
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
