import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { useApp } from '../context/AppContext';
import WorkerCard from '../components/WorkerCard';
import InlineToast from '../components/InlineToast';
import FilterBottomSheet, {
  WorkerFilters,
  DEFAULT_WORKER_FILTERS,
  filterWorkers,
  isFiltersActive,
  workerWithinRadius,
} from '../components/FilterBottomSheet';
import SortBottomSheet, {
  SortOption,
  sortWorkers,
  getSortLabel,
} from '../components/SortBottomSheet';
import { Contractor } from '../types';
import { residenceCityDistanceKm } from '../utils/distance';
import { cityCoords } from '../data/israelCities';

interface Props {
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
  onOpenFavoriteWorkers?: () => void;
}

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
  variant?: 'sort';
}

const SearchWorkersScreen: React.FC<Props> = ({
  onBack,
  onOpenWorkerProfile,
  onOpenFavoriteWorkers,
}) => {
  const insets = useSafeAreaInsets();
  const { workers, currentUser, getFavoriteWorkerIds, toggleFavoriteWorker } = useApp();
  const me = currentUser?.role === 'contractor' ? (currentUser as Contractor) : null;
  const contractorId = me?.id ?? null;
  // Contractor RESIDENCE city (from their real profile) — the fixed endpoint
  // for the "nearby workers" convenience. City-level only; no GPS, no address.
  const contractorCity = me?.city ?? '';

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<WorkerFilters>(DEFAULT_WORKER_FILTERS);
  const [sort, setSort] = useState<SortOption>('default');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 1600);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const favoriteWorkerIds = useMemo(
    () => (contractorId ? getFavoriteWorkerIds(contractorId) : []),
    [contractorId, getFavoriteWorkerIds]
  );

  const approvedWorkers = useMemo(
    () => workers.filter((w) => w.status === 'approved'),
    [workers]
  );

  // Phase 10 — deterministic contractor→worker residence distance over the REAL
  // loaded workers: contractor residence city centroid → worker residence city
  // centroid. No GPS, no address, no job. Recomputes on contractor-city change
  // and on the worker list changing, so a user switch never leaks stale data.
  const hasContractorLocation = useMemo(
    () => !!cityCoords(contractorCity),
    [contractorCity]
  );
  const distanceByWorkerId = useMemo(() => {
    const map: Record<string, number | undefined> = {};
    for (const w of approvedWorkers) {
      map[w.id] = residenceCityDistanceKm(contractorCity, w.city);
    }
    return map;
  }, [approvedWorkers, contractorCity]);

  const allSkills = useMemo(() => {
    const set = new Set<string>();
    approvedWorkers.forEach((w) => w.skills.forEach((s) => set.add(s)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [approvedWorkers]);

  // filterWorkers/sortWorkers stay exactly as before — favoritesOnly is
  // viewer-relative, so it's applied here as a separate step, never inside
  // that shared predicate.
  const filtered = useMemo(
    () => filterWorkers(approvedWorkers, search, filters),
    [approvedWorkers, search, filters]
  );
  const filteredWithFavorites = useMemo(
    () =>
      filters.favoritesOnly
        ? filtered.filter((w) => favoriteWorkerIds.includes(w.id))
        : filtered,
    [filtered, filters.favoritesOnly, favoriteWorkerIds]
  );
  // "מרחק מאזור המגורים" — viewer-relative, applied here (like favoritesOnly),
  // never inside filterWorkers. Unknown-distance workers only survive "כל
  // המרחקים".
  const withinRadius = useMemo(
    () =>
      filters.radiusKm == null
        ? filteredWithFavorites
        : filteredWithFavorites.filter((w) =>
            workerWithinRadius(w.id, filters.radiusKm, distanceByWorkerId)
          ),
    [filteredWithFavorites, filters.radiusKm, distanceByWorkerId]
  );
  const results = useMemo(
    () => sortWorkers(withinRadius, sort, distanceByWorkerId),
    [withinRadius, sort, distanceByWorkerId]
  );

  const filtersActive = isFiltersActive(filters);

  const clearEverything = () => {
    setFilters(DEFAULT_WORKER_FILTERS);
    setSearch('');
  };

  const handleToggleFavorite = (workerId: string) => {
    if (!contractorId) return;
    const wasFavorite = favoriteWorkerIds.includes(workerId);
    toggleFavoriteWorker(contractorId, workerId);
    setToastMessage(wasFavorite ? 'הוסר מהמועדפים' : 'נוסף לעובדים המועדפים');
  };

  const chips: Chip[] = useMemo(() => {
    const list: Chip[] = [];

    if (filters.favoritesOnly) {
      list.push({
        key: 'favorites',
        label: 'מועדפים',
        onRemove: () => setFilters((f) => ({ ...f, favoritesOnly: false })),
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

    if (filters.radiusKm != null) {
      list.push({
        key: 'radius',
        label: `עד ${filters.radiusKm} ק"מ`,
        onRemove: () => setFilters((f) => ({ ...f, radiusKm: null })),
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

  // Sort gets its own chip, kept out of `chips` above so the "סינון" button's
  // badge count still reflects filters only.
  const sortLabel = getSortLabel(sort);
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
        <Text style={styles.headerTitle} pointerEvents="none">חיפוש עובדים</Text>
        <Text style={styles.headerSubtitle}>מצא את העובדים המתאימים לפרויקט שלך</Text>
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

        {onOpenFavoriteWorkers && (
          <TouchableOpacity
            style={styles.favoritesShortcut}
            onPress={onOpenFavoriteWorkers}
            activeOpacity={0.85}
            accessibilityLabel="עובדים מועדפים"
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
          <Text style={styles.resultsSentenceStrong}>{`${results.length} עובדים`}</Text>
          {' שמתאימים לחיפוש שלך'}
        </Text>
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
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <WorkerCard
              worker={item}
              onPress={() => onOpenWorkerProfile(item.id)}
              isFavorite={favoriteWorkerIds.includes(item.id)}
              onToggleFavorite={() => handleToggleFavorite(item.id)}
              distanceKm={distanceByWorkerId[item.id]}
            />
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
        favoriteWorkerIds={favoriteWorkerIds}
        distanceByWorkerId={distanceByWorkerId}
        hasContractorLocation={hasContractorLocation}
      />

      <SortBottomSheet
        visible={sortSheetVisible}
        onClose={() => setSortSheetVisible(false)}
        value={sort}
        onChange={setSort}
      />

      <InlineToast message={toastMessage} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.screenTint },

  // No white box / border here on purpose — the header should read as part
  // of the same flowing background as the rest of the screen, not a
  // separate block sitting on top of it.
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
  // Sort's chip is visually distinct from filter chips (light blue vs the
  // brand's warm/primary tint) so it reads as "how it's ordered" rather
  // than "what it's narrowed by".
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

  results: {
    flex: 1,
  },

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
