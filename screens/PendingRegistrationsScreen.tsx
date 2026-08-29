import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow, FilterChip as FC } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import WorkerAvatar from '../components/WorkerAvatar';
import ContractorAvatar from '../components/ContractorAvatar';
import {
  ContractorRegistrationData,
  RegistrationRecord,
  WorkerRegistrationData,
} from '../types';

interface Props {
  onBack: () => void;
  onOpenRegistration: (registrationId: string) => void;
}

// Two independent filter axes that work together (e.g. "נדחו" + "עובדים").
type StatusTab = 'pending' | 'rejected';
type RoleFilter = 'all' | 'worker' | 'contractor';

const PendingRegistrationsScreen: React.FC<Props> = ({
  onBack,
  onOpenRegistration,
}) => {
  const insets = useSafeAreaInsets();
  const { registrations } = useApp();
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  // Live counts from the registration source of truth — one number per
  // (status, role) combination the UI can show.
  const byStatus = useMemo(
    () => ({
      pending: registrations.filter((r) => r.status === 'pending'),
      rejected: registrations.filter((r) => r.status === 'rejected'),
    }),
    [registrations]
  );

  const scoped = byStatus[statusTab];
  const roleCounts = useMemo(
    () => ({
      all: scoped.length,
      worker: scoped.filter((r) => r.role === 'worker').length,
      contractor: scoped.filter((r) => r.role === 'contractor').length,
    }),
    [scoped]
  );

  const filtered = useMemo(
    () =>
      roleFilter === 'all'
        ? scoped
        : scoped.filter((r) => r.role === roleFilter),
    [scoped, roleFilter]
  );

  const emptyCopy =
    statusTab === 'pending'
      ? {
          icon: 'checkmark-circle-outline' as const,
          color: Colors.success,
          title: 'אין בקשות ממתינות',
          sub: 'כל הבקשות בתור עברו טיפול. כל בקשה חדשה תופיע כאן אוטומטית.',
        }
      : {
          icon: 'file-tray-outline' as const,
          color: Colors.textMuted,
          title: 'אין בקשות שנדחו',
          sub: 'בקשות שיידחו יישמרו כאן — הן לא נמחקות מהמערכת.',
        };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>בקשות רישום</Text>
      </View>

      {/* Status axis */}
      <View style={styles.tabRow}>
        <Tab
          label={`ממתינות (${byStatus.pending.length})`}
          active={statusTab === 'pending'}
          onPress={() => setStatusTab('pending')}
        />
        <Tab
          label={`נדחו (${byStatus.rejected.length})`}
          active={statusTab === 'rejected'}
          onPress={() => setStatusTab('rejected')}
        />
      </View>

      {/* Role axis — works together with the status tab above */}
      <View style={styles.filterRow}>
        <FilterChip
          label={`הכל (${roleCounts.all})`}
          active={roleFilter === 'all'}
          onPress={() => setRoleFilter('all')}
        />
        <FilterChip
          label={`עובדים (${roleCounts.worker})`}
          active={roleFilter === 'worker'}
          onPress={() => setRoleFilter('worker')}
        />
        <FilterChip
          label={`קבלנים (${roleCounts.contractor})`}
          active={roleFilter === 'contractor'}
          onPress={() => setRoleFilter('contractor')}
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name={emptyCopy.icon} size={64} color={emptyCopy.color} />
          <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
          <Text style={styles.emptySub}>{emptyCopy.sub}</Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            paddingBottom: 40,
          }}
          renderItem={({ item }) => (
            <RegistrationRow
              record={item}
              onPress={() => onOpenRegistration(item.id)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        />
      )}
    </View>
  );
};

const Tab: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.tab, active && styles.tabActive]}
    activeOpacity={0.85}
  >
    <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.chip, active && styles.chipActive]}
    activeOpacity={0.85}
  >
    <Text style={[styles.chipText, active && styles.chipTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const RegistrationRow: React.FC<{
  record: RegistrationRecord;
  onPress: () => void;
}> = ({ record, onPress }) => {
  const isWorker = record.role === 'worker';
  const data = record.data as WorkerRegistrationData | ContractorRegistrationData;
  const isRejected = record.status === 'rejected';

  const subtitle = isWorker
    ? `${(data as WorkerRegistrationData).profession} · ${(data as WorkerRegistrationData).experienceYears} שנות ניסיון`
    : `${(data as ContractorRegistrationData).companyName} · רישום ${(data as ContractorRegistrationData).contractorRegistrationNumber}`;

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {/* Same avatar source of truth as every other Admin screen: worker →
          photo or deterministic initials; contractor → logo or the fixed
          building mark (never initials). */}
      {isWorker ? (
        <WorkerAvatar
          worker={{ id: record.id, fullName: data.fullName }}
          size={44}
        />
      ) : (
        <ContractorAvatar contractor={null} size={44} />
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.rowTopline}>
          <StatusBadge
            label={isRejected ? 'נדחה' : isWorker ? 'עובד' : 'קבלן'}
            tone={isRejected ? 'danger' : 'info'}
            small
          />
          <Text style={styles.rowName}>{data.fullName}</Text>
        </View>
        <Text style={styles.rowSub}>{subtitle}</Text>
        {isRejected ? (
          <Text style={styles.rowMeta}>
            נדחה:{' '}
            <Text style={{ writingDirection: 'ltr' }}>
              {new Date(record.rejectedAt ?? record.processedAt ?? record.submittedAt).toLocaleDateString('he-IL')}
            </Text>
            {record.rejectionReason ? ` · ${record.rejectionReason}` : ''}
          </Text>
        ) : (
          <Text style={styles.rowMeta}>
            הוגש:{' '}
            <Text style={{ writingDirection: 'ltr' }}>
              {new Date(record.submittedAt).toLocaleDateString('he-IL')}
            </Text>
            {' · ת.ז '}
            <Text style={{ writingDirection: 'ltr' }}>{data.idNumber}</Text>
          </Text>
        )}
      </View>
      <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    position: 'relative',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { position: 'absolute', right: Spacing.lg, top: Spacing.md, padding: 4 },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  tabRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: Colors.adminPrimary,
    borderColor: Colors.adminPrimary,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  tabTextActive: { color: Colors.white },

  filterRow: {
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
  chipActive: {
    backgroundColor: Colors.adminPrimary,
    borderColor: Colors.adminPrimary,
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

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.md,
    ...Shadow.medium,
  },
  rowTopline: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  rowName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  rowSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  rowMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
});

export default PendingRegistrationsScreen;
