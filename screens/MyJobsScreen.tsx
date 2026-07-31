import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow , FilterChip as FC } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import { Contractor, JobPost } from '../types';

interface Props {
  onBack: () => void;
  onOpenJobDetails: (jobId: string) => void;
  onOpenPostJob: () => void;
}

type Filter = 'all' | 'open' | 'closed';

const MyJobsScreen: React.FC<Props> = ({
  onBack,
  onOpenJobDetails,
  onOpenPostJob,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser, jobs, getApplicationsForJob } = useApp();
  const me = currentUser as Contractor | undefined;

  const [filter, setFilter] = useState<Filter>('all');

  const myJobs = useMemo(
    () => jobs.filter((j) => j.contractorId === me?.id),
    [jobs, me]
  );

  const filtered = useMemo(() => {
    let base: JobPost[];
    if (filter === 'all') base = myJobs;
    else if (filter === 'open')
      base = myJobs.filter((j) => j.acceptingApplications);
    else base = myJobs.filter((j) => !j.acceptingApplications);
    return [...base].sort(
      (a, b) =>
        new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
    );
  }, [myJobs, filter]);

  const counts = {
    all: myJobs.length,
    open: myJobs.filter((j) => j.acceptingApplications).length,
    closed: myJobs.filter((j) => !j.acceptingApplications).length,
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>המשרות שלי</Text>
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
          label={`פתוחות להרשמה (${counts.open})`}
          active={filter === 'open'}
          tone="success"
          onPress={() => setFilter('open')}
        />
        <Chip
          label={`סגורות להרשמה (${counts.closed})`}
          active={filter === 'closed'}
          tone="info"
          onPress={() => setFilter('closed')}
        />
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="briefcase-outline"
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {filter === 'all'
              ? 'עדיין לא פרסמת משרות'
              : 'אין משרות בסינון זה'}
          </Text>
          <Text style={styles.emptySub}>
            {filter === 'all'
              ? 'התחל בפרסום המשרה הראשונה שלך'
              : 'נסה סינון אחר'}
          </Text>
          {filter === 'all' && (
            <TouchableOpacity
              style={styles.emptyCta}
              onPress={onOpenPostJob}
              activeOpacity={0.85}
            >
              <Ionicons
                name="add-circle"
                size={20}
                color={Colors.white}
              />
              <Text style={styles.emptyCtaText}>פרסם משרה</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={filtered}
          keyExtractor={(j) => j.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <JobRow
              job={item}
              applicationsCount={getApplicationsForJob(item.id).length}
              onPress={() => onOpenJobDetails(item.id)}
            />
          )}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={onOpenPostJob}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color={Colors.white} />
        <Text style={styles.fabText}>פרסם משרה</Text>
      </TouchableOpacity>
    </View>
  );
};

const Chip: React.FC<{
  label: string;
  active: boolean;
  tone?: 'success' | 'warning' | 'info';
  onPress: () => void;
}> = ({ label, active, tone, onPress }) => {
  const activeBg =
    tone === 'success'
      ? Colors.success
      : tone === 'warning'
      ? Colors.warning
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

const JobRow: React.FC<{
  job: JobPost;
  applicationsCount: number;
  onPress: () => void;
}> = ({ job, applicationsCount, onPress }) => {
  const isOpen = job.acceptingApplications;
  const tone = isOpen ? 'success' : 'info';
  const label = isOpen ? 'פתוחה להרשמה' : 'סגורה להרשמה';

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.iconCircle}>
        <Ionicons name="briefcase" size={22} color={Colors.secondary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <StatusBadge label={label} tone={tone} small />
          <Text style={styles.title} numberOfLines={1}>
            {job.title}
          </Text>
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {job.profession} · {job.city}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons
              name="people-outline"
              size={14}
              color={Colors.textMuted}
            />
            <Text style={styles.metaText}>{applicationsCount} מועמדים</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={Colors.textMuted}
            />
            <Text style={[styles.metaText, { writingDirection: 'ltr' }]}>
              {new Date(job.postedAt).toLocaleDateString('he-IL')}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
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
    paddingBottom: 100,
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
    backgroundColor: '#DBEAFE',
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
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  emptyCta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: Radius.full,
    marginTop: Spacing.lg,
    ...Shadow.medium,
  },
  emptyCtaText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
    writingDirection: 'rtl',
  },

  fab: {
    position: 'absolute',
    left: Spacing.lg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: Radius.full,
    ...Shadow.large,
  },
  fabText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
    writingDirection: 'rtl',
  },
});

export default MyJobsScreen;
