import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow , FilterChip as FC } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import { Customer, CustomerStatus, Worker, Contractor } from '../types';

interface Props {
  onBack: () => void;
  initialStatus?: 'all' | CustomerStatus;
  onOpenUser: (userId: string) => void;
}

type RoleFilter = 'all' | 'worker' | 'contractor';

const UserManagementScreen: React.FC<Props> = ({
  onBack,
  initialStatus = 'all',
  onOpenUser,
}) => {
  const insets = useSafeAreaInsets();
  const { workers, contractors } = useApp();

  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CustomerStatus>(
    initialStatus
  );
  const [search, setSearch] = useState('');

  const all: Customer[] = useMemo(
    () => [...workers, ...contractors],
    [workers, contractors]
  );

  const filtered = useMemo(() => {
    return all.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const fields = [
          u.fullName,
          u.idNumber,
          u.phone,
          u.email,
          u.role === 'contractor'
            ? (u as Contractor).companyName
            : (u as Worker).profession,
        ]
          .join(' ')
          .toLowerCase();
        if (!fields.includes(q)) return false;
      }
      return true;
    });
  }, [all, roleFilter, statusFilter, search]);

  const counts = {
    all: all.length,
    approved: all.filter((u) => u.status === 'approved').length,
    blocked: all.filter((u) => u.status === 'blocked').length,
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">ניהול משתמשים</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חפש לפי שם, ת.ז, חברה, מקצוע..."
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label={`הכל (${counts.all})`}
          active={statusFilter === 'all'}
          onPress={() => setStatusFilter('all')}
        />
        <Chip
          label={`פעילים (${counts.approved})`}
          active={statusFilter === 'approved'}
          tone="success"
          onPress={() => setStatusFilter('approved')}
        />
        <Chip
          label={`חסומים (${counts.blocked})`}
          active={statusFilter === 'blocked'}
          tone="danger"
          onPress={() => setStatusFilter('blocked')}
        />
      </ScrollView>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.chipRow, { paddingTop: 0, paddingBottom: Spacing.md }]}
      >
        <Chip
          label="כל התפקידים"
          active={roleFilter === 'all'}
          onPress={() => setRoleFilter('all')}
        />
        <Chip
          label="עובדים"
          active={roleFilter === 'worker'}
          onPress={() => setRoleFilter('worker')}
        />
        <Chip
          label="קבלנים"
          active={roleFilter === 'contractor'}
          onPress={() => setRoleFilter('contractor')}
        />
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="search-outline"
            size={56}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>לא נמצאו משתמשים</Text>
          <Text style={styles.emptySub}>נסה לשנות את הסינון או החיפוש</Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <UserRow user={item} onPress={() => onOpenUser(item.id)} />
          )}
        />
      )}
    </View>
  );
};

const Chip: React.FC<{
  label: string;
  active: boolean;
  tone?: 'success' | 'danger';
  onPress: () => void;
}> = ({ label, active, tone, onPress }) => {
  const activeBg =
    tone === 'success'
      ? Colors.success
      : tone === 'danger'
      ? Colors.danger
      : Colors.primary;
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        active && { backgroundColor: activeBg, borderColor: activeBg },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const UserRow: React.FC<{ user: Customer; onPress: () => void }> = ({
  user,
  onPress,
}) => {
  const isWorker = user.role === 'worker';
  const subtitle = isWorker
    ? `${(user as Worker).profession} · ${(user as Worker).city}`
    : `${(user as Contractor).companyName} · ${(user as Contractor).city}`;

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
          size={20}
          color={isWorker ? Colors.primary : Colors.secondary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.topline}>
          <StatusBadge
            label={
              user.status === 'approved'
                ? 'פעיל'
                : user.status === 'blocked'
                ? 'חסום'
                : user.status
            }
            tone={
              user.status === 'approved'
                ? 'success'
                : user.status === 'blocked'
                ? 'danger'
                : 'warning'
            }
            small
          />
          <Text style={styles.name}>{user.fullName}</Text>
        </View>
        <Text style={styles.sub}>{subtitle}</Text>
        <Text style={styles.meta}>
          ת.ז{' '}
          <Text style={{ writingDirection: 'ltr' }}>
            {user.idNumber} · {user.phone}
          </Text>
        </Text>
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

  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    paddingVertical: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  chipRow: {
    flexDirection: 'row-reverse',
    // Lets the row fill the ScrollView's width when the chips don't need
    // to scroll, so the (already flex-start / right-anchored) row-reverse
    // order sits flush against the right edge instead of the default
    // ScrollView left-anchoring of short content.
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
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
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topline: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  sub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  meta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
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
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

export default UserManagementScreen;
