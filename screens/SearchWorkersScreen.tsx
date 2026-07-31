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

import { Colors, Spacing, Radius, FontSize, Shadow, FilterChip as FC } from '../theme/colors';
import { useApp } from '../context/AppContext';
import {
  CITIES_ISRAEL,
  PROFESSION_CATEGORIES,
} from '../data/mockData';
import { Worker } from '../types';

interface Props {
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
}

const SearchWorkersScreen: React.FC<Props> = ({
  onBack,
  onOpenWorkerProfile,
}) => {
  const insets = useSafeAreaInsets();
  const { workers } = useApp();

  const [search, setSearch] = useState('');
  const [profCategory, setProfCategory] = useState('כל המקצועות');
  const [city, setCity] = useState('כל הערים');
  const [availableOnly, setAvailableOnly] = useState(false);

  const filtered = useMemo(() => {
    return workers
      .filter((w) => w.status === 'approved')
      .filter((w) => {
        if (
          profCategory !== 'כל המקצועות' &&
          w.professionCategory !== profCategory
        )
          return false;
        if (city !== 'כל הערים' && w.city !== city) return false;
        if (availableOnly && !w.isAvailable) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const fields = [
            w.fullName,
            w.profession,
            w.skills.join(' '),
            w.certifications.join(' '),
          ]
            .join(' ')
            .toLowerCase();
          if (!fields.includes(q)) return false;
        }
        return true;
      });
  }, [workers, profCategory, city, availableOnly, search]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
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
          placeholder="חפש לפי שם, מקצוע, מיומנות..."
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
        contentContainerStyle={[styles.chipRow, { paddingTop: 0, paddingBottom: 0 }]}
      >
        {CITIES_ISRAEL.slice(0, 12).map((c) => (
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
          style={[
            styles.availChip,
            availableOnly && styles.availChipActive,
          ]}
          onPress={() => setAvailableOnly(!availableOnly)}
          activeOpacity={0.85}
        >
          <Ionicons
            name={availableOnly ? 'checkbox' : 'square-outline'}
            size={18}
            color={availableOnly ? Colors.success : Colors.textMuted}
          />
          <Text
            style={[
              styles.availChipText,
              availableOnly && styles.availChipTextActive,
            ]}
          >
            רק זמינים מיד
          </Text>
        </TouchableOpacity>
        <Text style={styles.resultCount}>{filtered.length} תוצאות</Text>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="search-outline"
            size={56}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>לא נמצאו עובדים</Text>
          <Text style={styles.emptySub}>נסה לשנות את הסינון</Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={filtered}
          keyExtractor={(w) => w.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <WorkerCard worker={item} onPress={() => onOpenWorkerProfile(item.id)} />
          )}
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

const WorkerCard: React.FC<{
  worker: Worker;
  onPress: () => void;
}> = ({ worker, onPress }) => (
  <TouchableOpacity
    style={styles.card}
    onPress={onPress}
    activeOpacity={0.85}
  >
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
            <Ionicons
              name="location-outline"
              size={14}
              color={Colors.textMuted}
            />
            <Text style={styles.metaText}>{worker.city}</Text>
          </View>
          {worker.rating !== undefined && (worker.reviewCount ?? 0) > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="star" size={14} color={Colors.warning} />
              <Text style={styles.metaText}>
                {worker.rating.toFixed(1)} ({worker.reviewCount ?? 0})
              </Text>
            </View>
          )}
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

  chipRow: {
    flexDirection: 'row-reverse',
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
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    lineHeight: FontSize.sm + 4,
  },
  chipTextActive: { color: Colors.white },

  toggleRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  availChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  availChipActive: {},
  availChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
    writingDirection: 'rtl',
  },
  availChipTextActive: { color: Colors.success },
  resultCount: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: '600',
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
});

export default SearchWorkersScreen;
