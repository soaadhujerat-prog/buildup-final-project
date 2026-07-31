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

import { Colors, Spacing, Radius, FontSize, Shadow, FilterChip as FC } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import {
  Application,
  ApplicationStatus,
  Contractor,
  Worker,
} from '../types';

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
  const { currentUser, applications, jobs, getUserById } = useApp();
  const me = currentUser as Worker | undefined;

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
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>הבקשות שלי</Text>
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
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="paper-plane-outline"
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {counts.all === 0
              ? 'עדיין לא הגשת מועמדות'
              : 'אין בקשות בסינון זה'}
          </Text>
          <Text style={styles.emptySub}>
            {counts.all === 0
              ? 'גלה משרות מתאימות במסך חיפוש העבודות.'
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
            const job = jobs.find((j) => j.id === item.jobId);
            const contractor = job
              ? (getUserById(job.contractorId) as Contractor | undefined)
              : undefined;
            return (
              <ApplicationRow
                app={item}
                jobTitle={job?.title ?? '—'}
                jobCity={job?.city ?? ''}
                jobDailyRate={job?.dailyRate ?? 0}
                contractorName={
                  contractor?.companyName ?? contractor?.fullName ?? ''
                }
                onPress={() => job && onOpenJobDetails(job.id)}
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
  jobDailyRate: number;
  contractorName: string;
  onPress: () => void;
}> = ({
  app,
  jobTitle,
  jobCity,
  jobDailyRate,
  contractorName,
  onPress,
}) => {
  const displayLabel =
    app.status === 'pending'
      ? 'ממתין'
      : app.status === 'accepted'
      ? 'אושר'
      : app.status === 'rejected'
      ? 'נדחה'
      : 'בוטל';
  const displayTone =
    app.status === 'pending'
      ? 'warning'
      : app.status === 'accepted'
      ? 'success'
      : 'danger';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardHead}>
        <StatusBadge label={displayLabel} tone={displayTone as any} small />
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
          <Text style={styles.metaText}>{jobDailyRate}₪/יום</Text>
        </View>
      </View>

      <Text style={styles.appliedAt}>
        הגשת בקשה: {new Date(app.appliedAt).toLocaleDateString('he-IL')}
        {app.respondedAt &&
          ` · נענתה: ${new Date(app.respondedAt).toLocaleDateString('he-IL')}`}
      </Text>

      {app.contractorResponse && (
        <Text style={styles.response} numberOfLines={2}>
          הקבלן השיב: {app.contractorResponse}
        </Text>
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
  appliedAt: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  response: {
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.gray50,
    padding: 8,
    borderRadius: Radius.sm,
    textAlign: 'right',
    writingDirection: 'rtl',
    fontStyle: 'italic',
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
