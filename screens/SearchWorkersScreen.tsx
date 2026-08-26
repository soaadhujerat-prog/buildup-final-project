import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { Worker } from '../types';
import FilterBottomSheet, {
  WorkerFilters,
  DEFAULT_WORKER_FILTERS,
  filterWorkers,
  isFiltersActive,
} from '../components/FilterBottomSheet';
import SortBottomSheet, { SortOption, sortWorkers } from '../components/SortBottomSheet';

interface Props {
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
}

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

const SearchWorkersScreen: React.FC<Props> = ({ onBack, onOpenWorkerProfile }) => {
  const insets = useSafeAreaInsets();
  const { workers } = useApp();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<WorkerFilters>(DEFAULT_WORKER_FILTERS);
  const [sort, setSort] = useState<SortOption>('recommended');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [sortSheetVisible, setSortSheetVisible] = useState(false);

  const approvedWorkers = useMemo(
    () => workers.filter((w) => w.status === 'approved'),
    [workers]
  );

  const allSkills = useMemo(() => {
    const set = new Set<string>();
    approvedWorkers.forEach((w) => w.skills.forEach((s) => set.add(s)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [approvedWorkers]);

  const filtered = useMemo(
    () => filterWorkers(approvedWorkers, search, filters),
    [approvedWorkers, search, filters]
  );
  const results = useMemo(() => sortWorkers(filtered, sort), [filtered, sort]);

  const filtersActive = isFiltersActive(filters);

  const clearEverything = () => {
    setFilters(DEFAULT_WORKER_FILTERS);
    setSearch('');
  };

  const chips: Chip[] = useMemo(() => {
    const list: Chip[] = [];

    if (filters.profession) {
      list.push({
        key: 'profession',
        label: filters.profession,
        onRemove: () =>
          setFilters((f) => ({ ...f, professionCategory: '', profession: '' })),
      });
    } else if (filters.professionCategory) {
      list.push({
        key: 'professionCategory',
        label: filters.professionCategory,
        onRemove: () => setFilters((f) => ({ ...f, professionCategory: '' })),
      });
    }

    if (filters.city) {
      list.push({
        key: 'city',
        label: filters.city,
        onRemove: () => setFilters((f) => ({ ...f, city: '' })),
      });
    }

    if (filters.availableOnly) {
      list.push({
        key: 'available',
        label: 'זמין מיד',
        onRemove: () => setFilters((f) => ({ ...f, availableOnly: false })),
      });
    }

    if (filters.minExperience > 0) {
      list.push({
        key: 'experience',
        label: `${filters.minExperience}+ שנים`,
        onRemove: () => setFilters((f) => ({ ...f, minExperience: 0 })),
      });
    }

    filters.skills.forEach((skill) => {
      list.push({
        key: `skill-${skill}`,
        label: skill,
        onRemove: () => setFilters((f) => ({ ...f, skills: f.skills.filter((s) => s !== skill) })),
      });
    });

    if (filters.minRate.trim() || filters.maxRate.trim()) {
      let label: string;
      if (filters.minRate.trim() && filters.maxRate.trim()) {
        label = `${filters.minRate}-${filters.maxRate}₪`;
      } else if (filters.minRate.trim()) {
        label = `מ-${filters.minRate}₪`;
      } else {
        label = `עד ${filters.maxRate}₪`;
      }
      list.push({
        key: 'rate',
        label,
        onRemove: () => setFilters((f) => ({ ...f, minRate: '', maxRate: '' })),
      });
    }

    return list;
  }, [filters]);

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
        <Text style={styles.headerTitle}>חיפוש עובדים</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חפש לפי שם, מקצוע או מיומנות..."
          placeholderTextColor={Colors.textMuted}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearch('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="נקה חיפוש"
          >
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, filtersActive && styles.actionBtnActive]}
          onPress={() => setFilterSheetVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={filtersActive ? Colors.white : Colors.text}
          />
          <Text style={[styles.actionBtnText, filtersActive && styles.actionBtnTextActive]}>
            סינון
          </Text>
          {filtersActive && (
            <View style={styles.actionBadge}>
              <Text style={styles.actionBadgeText}>{chips.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => setSortSheetVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="swap-vertical-outline" size={18} color={Colors.text} />
          <Text style={styles.actionBtnText}>מיון</Text>
        </TouchableOpacity>
      </View>

      {chips.length > 0 && (
        <View style={styles.chipsWrap}>
          {chips.map((chip) => (
            <TouchableOpacity
              key={chip.key}
              style={styles.activeChip}
              onPress={chip.onRemove}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={14} color={Colors.primaryDark} />
              <Text style={styles.activeChipText}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.resultsHeader}>
        <View style={styles.resultsHeaderTextRow}>
          <Text style={styles.resultsCount}>{results.length} עובדים</Text>
          {filtersActive && <Text style={styles.filteredLabel}>מסוננים</Text>}
        </View>
      </View>

      {results.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>לא נמצאו עובדים מתאימים</Text>
          <Text style={styles.emptySub}>נסה לשנות או להסיר חלק מהפילטרים.</Text>
          {(filtersActive || search.trim().length > 0) && (
            <TouchableOpacity
              onPress={clearEverything}
              style={styles.emptyCta}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyCtaText}>נקה סינון</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={results}
          keyExtractor={(w) => w.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <WorkerCard worker={item} onPress={() => onOpenWorkerProfile(item.id)} />
          )}
        />
      )}

      <FilterBottomSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        workers={approvedWorkers}
        searchQuery={search}
        filters={filters}
        onApply={setFilters}
        allSkills={allSkills}
      />

      <SortBottomSheet
        visible={sortSheetVisible}
        onClose={() => setSortSheetVisible(false)}
        value={sort}
        onChange={setSort}
      />
    </View>
  );
};

const WorkerCard: React.FC<{
  worker: Worker;
  onPress: () => void;
}> = ({ worker, onPress }) => (
  <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
    <View style={styles.cardHead}>
      <View style={styles.avatar}>
        <Ionicons name="hammer" size={22} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          {worker.isAvailable && (
            <View style={styles.availDot}>
              <View style={styles.availDotInner} />
            </View>
          )}
          <Text style={styles.name}>{worker.fullName}</Text>
        </View>
        <Text style={styles.profession}>
          {worker.profession} · {worker.experienceYears} שנים
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.metaText}>{worker.city}</Text>
          </View>
        </View>
      </View>
      <View style={styles.rateBox}>
        <Text style={styles.rateValue}>{worker.dailyRate}₪</Text>
        <Text style={styles.rateLabel}>ליום</Text>
      </View>
    </View>

    {worker.skills.length > 0 && (
      <View style={styles.skillsRow}>
        {worker.skills.slice(0, 3).map((s) => (
          <View key={s} style={styles.skill}>
            <Text style={styles.skillText}>{s}</Text>
          </View>
        ))}
        {worker.skills.length > 3 && (
          <View style={styles.skill}>
            <Text style={styles.skillText}>+{worker.skills.length - 3}</Text>
          </View>
        )}
      </View>
    )}
  </TouchableOpacity>
);

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

  actionRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: 12,
  },
  actionBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  actionBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  actionBtnTextActive: { color: Colors.white },
  actionBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
  },

  chipsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  activeChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryFaint,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  activeChipText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primaryDark,
    writingDirection: 'rtl',
  },

  resultsHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  resultsHeaderTextRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  resultsCount: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  filteredLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    writingDirection: 'rtl',
  },

  results: {
    flex: 1,
  },

  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 0,
    paddingBottom: 40,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 8,
    ...Shadow.medium,
  },
  cardHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  availDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  availDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  profession: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.sm,
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
  },

  rateBox: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.primaryFaint,
    borderRadius: Radius.sm,
  },
  rateValue: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
  },
  rateLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600' },

  skillsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  skill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.sm,
  },
  skillText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
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
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  emptyCta: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  emptyCtaText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
});

export default SearchWorkersScreen;
