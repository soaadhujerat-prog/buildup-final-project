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
import {
  ContractorRegistrationData,
  RegistrationRecord,
  WorkerRegistrationData,
} from '../types';

interface Props {
  onBack: () => void;
  onOpenRegistration: (registrationId: string) => void;
}

type Filter = 'all' | 'worker' | 'contractor';

const PendingRegistrationsScreen: React.FC<Props> = ({
  onBack,
  onOpenRegistration,
}) => {
  const insets = useSafeAreaInsets();
  const { registrations } = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const pending = useMemo(
    () => registrations.filter((r) => r.status === 'pending'),
    [registrations]
  );
  const filtered = useMemo(
    () => (filter === 'all' ? pending : pending.filter((r) => r.role === filter)),
    [pending, filter]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>בקשות רישום ממתינות</Text>
      </View>

      <View style={styles.filterRow}>
        <FilterChip
          label={`הכל (${pending.length})`}
          active={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <FilterChip
          label={`עובדים (${pending.filter((r) => r.role === 'worker').length})`}
          active={filter === 'worker'}
          onPress={() => setFilter('worker')}
        />
        <FilterChip
          label={`קבלנים (${pending.filter((r) => r.role === 'contractor').length})`}
          active={filter === 'contractor'}
          onPress={() => setFilter('contractor')}
        />
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="checkmark-circle-outline"
            size={64}
            color={Colors.success}
          />
          <Text style={styles.emptyTitle}>אין בקשות ממתינות</Text>
          <Text style={styles.emptySub}>
            כל הבקשות בתור עברו טיפול. כל בקשה חדשה תופיע כאן אוטומטית.
          </Text>
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

  const subtitle = isWorker
    ? `${(data as WorkerRegistrationData).profession} · ${(data as WorkerRegistrationData).experienceYears} שנות ניסיון`
    : `${(data as ContractorRegistrationData).companyName} · רישום ${(data as ContractorRegistrationData).contractorRegistrationNumber}`;

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: isWorker ? Colors.primaryFaint : '#DBEAFE',
          },
        ]}
      >
        <Ionicons
          name={isWorker ? 'hammer' : 'business'}
          size={22}
          color={isWorker ? Colors.primary : Colors.secondary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTopline}>
          <StatusBadge label={isWorker ? 'עובד' : 'קבלן'} tone="info" small />
          <Text style={styles.rowName}>{data.fullName}</Text>
        </View>
        <Text style={styles.rowSub}>{subtitle}</Text>
        <Text style={styles.rowMeta}>
          הוגש: {new Date(record.submittedAt).toLocaleDateString('he-IL')} · ת.ז {data.idNumber}
        </Text>
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
    borderColor: Colors.border,
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
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
