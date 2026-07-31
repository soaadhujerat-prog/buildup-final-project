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
import { Contractor, JobPost, Worker } from '../types';

interface Props {
  onBack: () => void;
  onOpenJobDetails: (jobId: string) => void;
}

interface AssignmentRow {
  job: JobPost;
  source: 'application' | 'invitation' | 'both';
  assignedAt: string;
}

const MyAssignmentsScreen: React.FC<Props> = ({ onBack, onOpenJobDetails }) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    jobs,
    applications,
    invitations,
    getUserById,
  } = useApp();
  const me = currentUser as Worker | undefined;

  // Real-source assignments:
  //  - accepted application by this worker, OR
  //  - accepted invitation to this worker.
  // Deduped by jobId; if assigned via both, source = 'both'.
  const assignments = useMemo<AssignmentRow[]>(() => {
    if (!me) return [];
    const map = new Map<string, AssignmentRow>();

    applications.forEach((a) => {
      if (a.workerId !== me.id || a.status !== 'accepted') return;
      const job = jobs.find((j) => j.id === a.jobId);
      if (!job) return;
      const at = a.respondedAt ?? a.appliedAt;
      map.set(job.id, { job, source: 'application', assignedAt: at });
    });

    invitations.forEach((i) => {
      if (i.workerId !== me.id || i.status !== 'accepted') return;
      const job = jobs.find((j) => j.id === i.jobId);
      if (!job) return;
      const at = i.respondedAt ?? i.sentAt;
      const existing = map.get(job.id);
      if (existing) {
        map.set(job.id, {
          ...existing,
          source: 'both',
          assignedAt:
            new Date(at).getTime() > new Date(existing.assignedAt).getTime()
              ? at
              : existing.assignedAt,
        });
      } else {
        map.set(job.id, { job, source: 'invitation', assignedAt: at });
      }
    });

    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
    );
  }, [me, applications, invitations, jobs]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
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
          keyExtractor={(a) => a.job.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => {
            const contractor = getUserById(item.job.contractorId) as
              | Contractor
              | undefined;
            const sourceLabel =
              item.source === 'both'
                ? 'בקשה + הזמנה'
                : item.source === 'application'
                ? 'בקשה שאושרה'
                : 'הזמנה שאישרת';
            return (
              <TouchableOpacity
                style={styles.row}
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
                    <StatusBadge label="פעיל" tone="success" small />
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.md,
    ...Shadow.medium,
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
