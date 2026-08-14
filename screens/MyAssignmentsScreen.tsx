import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import { callPhone } from '../utils/contact';
import { Assignment, Contractor, JobPost, Worker } from '../types';

interface Props {
  onBack: () => void;
  onOpenJobDetails: (jobId: string) => void;
  onOpenChat: (contractorId: string) => void;
}

interface AssignmentRow {
  job: JobPost;
  assignment: Assignment;
}

const STATUS_LABEL: Record<Assignment['status'], string> = {
  active: 'פעיל',
  completed: 'הושלם',
  cancelled: 'בוטל',
};
const STATUS_TONE: Record<Assignment['status'], 'success' | 'info' | 'danger'> = {
  active: 'success',
  completed: 'info',
  cancelled: 'danger',
};

const MyAssignmentsScreen: React.FC<Props> = ({
  onBack,
  onOpenJobDetails,
  onOpenChat,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser, getJobById, getAssignmentsForWorker, getUserById } =
    useApp();
  const me = currentUser as Worker | undefined;

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>השיבוצים שלי</Text>
      </View>

      {assignments.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="briefcase-outline"
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>אין לך עדיין שיבוצים פעילים</Text>
          <Text style={styles.emptySub}>
            שיבוץ נוצר כאשר קבלן מאשר בקשה שהגשת, או כשאתה מאשר הזמנה שקיבלת.
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={assignments}
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
                    </View>
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.job.profession} · {item.job.city}
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
                  </View>
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>

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
              </View>
            );
          }}
        />
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
