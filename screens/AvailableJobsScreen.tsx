import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { useApp } from '../context/AppContext';
import JobCard from '../components/JobCard';
import { isOpenForApplications } from '../services/jobStatusService';
import JobFilterBottomSheet, {
  JobFilters,
  DEFAULT_JOB_FILTERS,
  filterJobs,
  isJobFiltersActive,
} from '../components/JobFilterBottomSheet';
import JobSortBottomSheet, {
  JobSortOption,
  sortJobs,
  getJobSortLabel,
} from '../components/JobSortBottomSheet';
import { Contractor, Worker } from '../types';
import { useRememberedScroll } from '../utils/scrollMemory';

interface Props {
  onBack: () => void;
  onOpenJobDetails: (jobId: string) => void;
  onOpenFavoriteContractors?: () => void;
}

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
  variant?: 'sort';
}

const AvailableJobsScreen: React.FC<Props> = ({
  onBack,
  onOpenJobDetails,
  onOpenFavoriteContractors,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    jobs,
    jobsLoading,
    getUserById,
    getFavoriteContractorIds,
    jobSearchState,
    updateJobSearchState,
  } = useApp();
  const me = currentUser as Worker | undefined;
  const workerId = me?.role === 'worker' ? me.id : null;

  // Search/filter/sort live in AppContext (jobSearchState), not local
  // useState — this screen unmounts whenever a drilldown (e.g. JobDetails)
  // is pushed on top of it, so local state would reset on every "back".
  // Opening state is still filter-free the first time: no profession/city
  // preselected from the worker's own profile, no chip active until the
  // worker actually picks one (see DEFAULT_JOB_SEARCH_STATE).
  const { query: search, filters, sort } = jobSearchState;
  const setSearch = (query: string) => updateJobSearchState({ query });
  const setFilters = (update: JobFilters | ((prev: JobFilters) => JobFilters)) => {
    const next = typeof update === 'function' ? update(filters) : update;
    updateJobSearchState({ filters: next });
  };
  const setSort = (next: JobSortOption) => updateJobSearchState({ sort: next });

  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [sortSheetVisible, setSortSheetVisible] = useState(false);

  // Preserve scroll position across "list → JobDetails → back" (this screen
  // fully unmounts while a drilldown route is on top).
  const listRef = useRef<FlatList>(null);
  const { onScroll, scrollEventThrottle, restoreOnce } = useRememberedScroll(
    'worker/available-jobs'
  );

  const favoriteContractorIds = useMemo(
    () => (workerId ? getFavoriteContractorIds(workerId) : []),
    [workerId, getFavoriteContractorIds]
  );

  // Base pool = registration status source of truth (acceptingApplications),
  // never job.status — those are two separate concepts (jobStatusService).
  const openJobs = useMemo(() => jobs.filter(isOpenForApplications), [jobs]);

  const contractorLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    openJobs.forEach((j) => {
      if (map[j.contractorId] !== undefined) return;
      const c = getUserById(j.contractorId) as Contractor | undefined;
      map[j.contractorId] = c?.companyName ?? c?.fullName ?? '';
    });
    return map;
  }, [openJobs, getUserById]);

  const filtered = useMemo(
    () => filterJobs(openJobs, search, filters, contractorLabelById),
    [openJobs, search, filters, contractorLabelById]
  );
  const filteredWithFavContractors = useMemo(
    () =>
      filters.favoriteContractorsOnly
        ? filtered.filter((j) => favoriteContractorIds.includes(j.contractorId))
        : filtered,
    [filtered, filters.favoriteContractorsOnly, favoriteContractorIds]
  );
  const results = useMemo(
    () => sortJobs(filteredWithFavContractors, sort),
    [filteredWithFavContractors, sort]
  );

  const filtersActive = isJobFiltersActive(filters);

  const clearEverything = () => {
    setFilters(DEFAULT_JOB_FILTERS);
    setSearch('');
  };

  const chips: Chip[] = useMemo(() => {
    const list: Chip[] = [];

    if (filters.favoriteContractorsOnly) {
      list.push({
        key: 'favoriteContractors',
        label: 'קבלנים מועדפים',
        onRemove: () => setFilters((f) => ({ ...f, favoriteContractorsOnly: false })),
      });
    }

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

    if (filters.urgentOnly) {
      list.push({
        key: 'urgent',
        label: 'דחוף',
        onRemove: () => setFilters((f) => ({ ...f, urgentOnly: false })),
      });
    }

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

  const sortLabel = getJobSortLabel(sort);
  const activeChips: Chip[] = useMemo(() => {
    if (!sortLabel) return chips;
    return [
      ...chips,
      {
        key: 'sort',
        label: `מיון: ${sortLabel}`,
        onRemove: () => setSort('default'),
        variant: 'sort' as const,
      },
    ];
  }, [chips, sortLabel]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerArea}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">חיפוש עבודות</Text>
        <Text style={styles.headerSubtitle}>מצא את המשרה שמתאימה לך</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חפש לפי כותרת, מקצוע, חברה או מיקום..."
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

        {onOpenFavoriteContractors && (
          <TouchableOpacity
            style={styles.favoritesShortcut}
            onPress={onOpenFavoriteContractors}
            activeOpacity={0.85}
            accessibilityLabel="קבלנים מועדפים"
          >
            <Ionicons name="heart-outline" size={20} color={Colors.text} />
          </TouchableOpacity>
        )}
      </View>

      {activeChips.length > 0 && (
        <View style={styles.chipsWrap}>
          {activeChips.map((chip) => (
            <TouchableOpacity
              key={chip.key}
              style={[styles.activeChip, chip.variant === 'sort' && styles.sortChip]}
              onPress={chip.onRemove}
              activeOpacity={0.8}
            >
              <Ionicons
                name="close"
                size={14}
                color={chip.variant === 'sort' ? Colors.secondary : Colors.primaryDark}
              />
              <Text
                style={[styles.activeChipText, chip.variant === 'sort' && styles.sortChipText]}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsSentence}>
          {'מצאנו עבורך '}
          <Text style={styles.resultsSentenceStrong}>{`${results.length} משרות`}</Text>
          {' שמתאימות לחיפוש שלך'}
        </Text>
      </View>

      {results.length === 0 && jobsLoading && jobs.length === 0 ? (
        <View style={styles.emptyWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.emptySub}>טוען משרות…</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>לא מצאנו משרות שמתאימות לחיפוש</Text>
          <Text style={styles.emptySub}>טיפ: נסה לשנות או לנקות חלק מהסינונים.</Text>
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
          ref={listRef}
          style={styles.results}
          data={results}
          keyExtractor={(j) => j.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScroll}
          scrollEventThrottle={scrollEventThrottle}
          onContentSizeChange={() =>
            restoreOnce((y) => listRef.current?.scrollToOffset({ offset: y, animated: false }))
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <JobCard
              job={item}
              contractorName={contractorLabelById[item.contractorId] || '—'}
              onPress={() => onOpenJobDetails(item.id)}
            />
          )}
        />
      )}

      <JobFilterBottomSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        jobs={openJobs}
        searchQuery={search}
        filters={filters}
        onApply={setFilters}
        contractorLabelById={contractorLabelById}
        favoriteContractorIds={favoriteContractorIds}
      />

      <JobSortBottomSheet
        visible={sortSheetVisible}
        onClose={() => setSortSheetVisible(false)}
        value={sort}
        onChange={setSort}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.screenTint },

  headerArea: {
    position: 'relative',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
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
  headerSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 3,
  },

  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
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
  favoritesShortcut: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
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
  sortChip: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  sortChipText: { color: Colors.secondary },

  resultsHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  resultsSentence: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.md + 6,
  },
  resultsSentenceStrong: {
    fontWeight: '800',
    color: Colors.text,
  },

  results: { flex: 1 },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 0,
    paddingBottom: 40,
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
    textAlign: 'center',
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

export default AvailableJobsScreen;
