import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from './StatusBadge';
import {
  formatDateTime,
  assignmentStaffedLine,
  sharedWorkCountLabel,
} from '../utils/helpers';
import { getSharedWorkHistory } from '../services/assignmentService';
import { Assignment } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  workerId: string;
  contractorId: string;
  onOpenJob?: (jobId: string) => void;
}

/** One shared "history of jobs this worker and contractor did together"
 *  sheet — opened from WorkerProfile (contractor viewing worker) and from
 *  JobDetails (worker viewing contractor). Everything shown is derived from
 *  real Assignment records; cancelled staffing is listed apart and never
 *  counted as a shared job. */
const SharedWorkHistorySheet: React.FC<Props> = ({
  visible,
  onClose,
  workerId,
  contractorId,
  onOpenJob,
}) => {
  const insets = useSafeAreaInsets();
  const { assignments, getJobById } = useApp();

  const history = useMemo(
    () => getSharedWorkHistory(assignments, workerId, contractorId),
    [assignments, workerId, contractorId]
  );

  const renderEntry = (assignment: Assignment) => {
    const job = getJobById(assignment.jobId);
    const isActive = assignment.status === 'active';
    const isCompleted = assignment.status === 'completed';
    const badge = isActive
      ? { label: 'עובדים יחד כעת', tone: 'success' as const }
      : isCompleted
      ? { label: 'העבודה הסתיימה', tone: 'info' as const }
      : { label: 'השיבוץ בוטל', tone: 'neutral' as const };

    return (
      <TouchableOpacity
        key={assignment.id}
        style={styles.entry}
        activeOpacity={onOpenJob && job ? 0.85 : 1}
        onPress={() => onOpenJob && job && onOpenJob(job.id)}
      >
        <View style={styles.entryTop}>
          <StatusBadge label={badge.label} tone={badge.tone} small />
          <Text style={styles.entryTitle} numberOfLines={1}>
            {job?.title ?? 'משרה שאינה זמינה עוד'}
          </Text>
        </View>
        {job && (
          <Text style={styles.entryMeta}>
            {[job.profession, job.professionCategory, job.city]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
        <Text style={styles.entryStamp}>{assignmentStaffedLine(assignment)}</Text>
        {isCompleted && assignment.completedAt && (
          <Text style={styles.entryStamp}>
            תאריך סיום: {formatDateTime(assignment.completedAt)}
          </Text>
        )}
        {assignment.status === 'cancelled' && assignment.cancelledAt && (
          <Text style={styles.entryStamp}>
            בוטל ב־{formatDateTime(assignment.cancelledAt)}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose} accessible={false}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback accessible={false}>
            <View
              style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}
            >
              <View style={styles.handle} />
              <View style={styles.headerRow}>
                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.title}>היסטוריית עבודות משותפות</Text>
              </View>
              <Text style={styles.summary}>
                {sharedWorkCountLabel(history.count)}
              </Text>

              <ScrollView
                style={{ maxHeight: 420 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: Spacing.sm, paddingTop: Spacing.sm }}
              >
                {history.count === 0 && history.cancelled.length === 0 && (
                  <Text style={styles.empty}>
                    עדיין אין עבודות משותפות להצגה.
                  </Text>
                )}

                {history.current.map(renderEntry)}
                {history.completed.map(renderEntry)}

                {history.cancelled.length > 0 && (
                  <>
                    <Text style={styles.groupLabel}>שיבוצים שבוטלו</Text>
                    {history.cancelled.map(renderEntry)}
                  </>
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    ...Shadow.medium,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray200,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  summary: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'right',
    marginTop: 4,
  },
  empty: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'right',
    paddingVertical: Spacing.md,
  },
  groupLabel: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'right',
    marginTop: Spacing.sm,
  },
  entry: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 4,
  },
  entryTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  entryTitle: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  entryMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  entryStamp: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
});

export default SharedWorkHistorySheet;
