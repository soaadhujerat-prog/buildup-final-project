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

import {
  Colors,
  Spacing,
  Radius,
  FontSize,
  Shadow,
  FilterChip as FC,
} from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import {
  CITIES_ISRAEL,
  PROFESSION_CATEGORIES,
} from '../data/mockData';
import { Contractor, JobPost, Worker } from '../types';

interface Props {
  onBack: () => void;
  onOpenJobDetails: (jobId: string) => void;
}

const AvailableJobsScreen: React.FC<Props> = ({
  onBack,
  onOpenJobDetails,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser, jobs, getUserById } = useApp();
  const me = currentUser as Worker | undefined;

  const [search, setSearch] = useState('');
  const [profCategory, setProfCategory] = useState(
    me?.professionCategory ?? 'כל המקצועות'
  );
  const [city, setCity] = useState('כל הערים');
  const [urgentOnly, setUrgentOnly] = useState(false);

  const hasActiveFilters =
    profCategory !== 'כל המקצועות' ||
    city !== 'כל הערים' ||
    urgentOnly ||
    search.trim().length > 0;

  const clearFilters = () => {
    setProfCategory('כל המקצועות');
    setCity('כל הערים');
    setUrgentOnly(false);
    setSearch('');
  };

  const filtered = useMemo(() => {
    return jobs
      .filter((j) => j.status === 'open')
      .filter((j) => {
        if (
          profCategory !== 'כל המקצועות' &&
          j.professionCategory !== profCategory
        )
          return false;
        if (city !== 'כל הערים' && j.city !== city) return false;
        if (urgentOnly && !j.urgent) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const fields = [
            j.title,
            j.description,
            j.profession,
            j.city,
            j.requiredCertifications.join(' '),
          ]
            .join(' ')
            .toLowerCase();
          if (!fields.includes(q)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
      );
  }, [jobs, profCategory, city, urgentOnly, search]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>חיפוש עבודות</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="חפש לפי כותרת, מקצוע, מיקום..."
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {PROFESSION_CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={c}
            active={c === profCategory}
            onPress={() => setProfCategory(c)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.chipRow, { paddingTop: 0 }]}
      >
        {CITIES_ISRAEL.map((c) => (
          <Chip
            key={c}
            label={c}
            active={c === city}
            onPress={() => setCity(c)}
          />
        ))}
      </ScrollView>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={styles.toggleChip}
          onPress={() => setUrgentOnly(!urgentOnly)}
          activeOpacity={0.85}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={urgentOnly ? 'checkbox' : 'square-outline'}
            size={18}
            color={urgentOnly ? Colors.danger : Colors.textMuted}
          />
          <Text
            style={[
              styles.toggleText,
              urgentOnly && { color: Colors.danger },
            ]}
          >
            רק משרות דחופות
          </Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
          {hasActiveFilters && (
            <TouchableOpacity
              onPress={clearFilters}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.clearFiltersText}>נקה סינון</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.resultCount}>{filtered.length} משרות</Text>
        </View>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="search-outline"
            size={56}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>לא נמצאו משרות</Text>
          <Text style={styles.emptySub}>נסה להרחיב את הסינון</Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={filtered}
          keyExtractor={(j) => j.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => (
            <View style={{ height: Spacing.sm }} />
          )}
          renderItem={({ item }) => {
            const contractor = getUserById(item.contractorId) as
              | Contractor
              | undefined;
            return (
              <JobCard
                job={item}
                contractorName={
                  contractor?.companyName ?? contractor?.fullName ?? '—'
                }
                onPress={() => onOpenJobDetails(item.id)}
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

const JobCard: React.FC<{
  job: JobPost;
  contractorName: string;
  onPress: () => void;
}> = ({ job, contractorName, onPress }) => (
  <TouchableOpacity
    style={styles.card}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <View style={styles.cardHead}>
      {job.urgent && <StatusBadge label="דחוף" tone="danger" small />}
      <Text style={styles.title} numberOfLines={1}>
        {job.title}
      </Text>
    </View>

    <Text style={styles.contractor} numberOfLines={1}>
      <Ionicons name="business-outline" size={12} color={Colors.textMuted} />{' '}
      {contractorName}
    </Text>

    <Text style={styles.desc} numberOfLines={2}>
      {job.description}
    </Text>

    <View style={styles.metaRow}>
      <View style={styles.metaItem}>
        <Ionicons
          name="briefcase-outline"
          size={14}
          color={Colors.textSecondary}
        />
        <Text style={styles.metaText}>{job.profession}</Text>
      </View>
      <View style={styles.metaItem}>
        <Ionicons
          name="location-outline"
          size={14}
          color={Colors.textSecondary}
        />
        <Text style={styles.metaText}>{job.city}</Text>
      </View>
      <View style={styles.metaItem}>
        <Ionicons
          name="time-outline"
          size={14}
          color={Colors.textSecondary}
        />
        <Text style={styles.metaText}>{job.duration}</Text>
      </View>
    </View>

    <View style={styles.cardFooter}>
      <Text style={styles.posted}>
        פורסם {new Date(job.postedAt).toLocaleDateString('he-IL')}
      </Text>
      <View style={styles.rateBox}>
        <Text style={styles.rateValue}>{job.dailyRate}₪</Text>
        <Text style={styles.rateLabel}>ליום</Text>
      </View>
    </View>
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

  chipRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: 8,
  },
  chip: {
    height: FC.height,
    paddingHorizontal: FC.paddingHorizontal,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: FC.borderRadius,
    borderWidth: FC.borderWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  chipTextActive: { color: Colors.white },

  toggleRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  toggleChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  toggleText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
    writingDirection: 'rtl',
  },
  resultCount: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  clearFiltersText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

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
  desc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: 4,
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
  cardFooter: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  posted: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  rateBox: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: Colors.primaryFaint,
    borderRadius: Radius.sm,
  },
  rateValue: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
  },
  rateLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
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

export default AvailableJobsScreen;
