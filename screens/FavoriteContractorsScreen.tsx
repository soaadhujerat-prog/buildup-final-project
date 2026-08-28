import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { useApp } from '../context/AppContext';
import ContractorCard from '../components/ContractorCard';
import { isOpenForApplications } from '../services/jobStatusService';
import { Contractor } from '../types';

interface Props {
  onBack: () => void;
  onOpenAvailableJobs: () => void;
}

/** "קבלנים מועדפים" — the contractors the current worker has bookmarked.
 *  Favorites are personal to this worker (see WorkerFavoriteContractor in
 *  types/index.ts) — this screen never shows another worker's list. */
const FavoriteContractorsScreen: React.FC<Props> = ({ onBack, onOpenAvailableJobs }) => {
  const insets = useSafeAreaInsets();
  const { currentUser, contractors, jobs, getFavoriteContractorIds, toggleFavoriteContractor } =
    useApp();
  const workerId = currentUser?.role === 'worker' ? currentUser.id : null;

  const favoriteContractorIds = useMemo(
    () => (workerId ? getFavoriteContractorIds(workerId) : []),
    [workerId, getFavoriteContractorIds]
  );

  const favoriteContractorsList = useMemo(
    () =>
      contractors.filter(
        (c) => c.status === 'approved' && favoriteContractorIds.includes(c.id)
      ),
    [contractors, favoriteContractorIds]
  );

  const openJobsCountByContractor = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs.forEach((j) => {
      if (isOpenForApplications(j)) {
        counts[j.contractorId] = (counts[j.contractorId] ?? 0) + 1;
      }
    });
    return counts;
  }, [jobs]);

  const handleToggleFavorite = (contractorId: string) => {
    if (!workerId) return;
    toggleFavoriteContractor(workerId, contractorId);
  };

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
        <Text style={styles.headerTitle}>קבלנים מועדפים</Text>
        <Text style={styles.headerSubtitle}>הקבלנים ששמרת לגישה מהירה</Text>
      </View>

      {favoriteContractorsList.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="heart-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>עדיין אין קבלנים מועדפים</Text>
          <Text style={styles.emptySub}>
            שמור קבלנים שתרצה לעקוב אחר המשרות שלהם כדי למצוא אותם במהירות.
          </Text>
          <TouchableOpacity
            onPress={onOpenAvailableJobs}
            style={styles.emptyCta}
            activeOpacity={0.85}
          >
            <Text style={styles.emptyCtaText}>חפש עבודות</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsCount}>{favoriteContractorsList.length} קבלנים</Text>
          </View>
          <FlatList
            style={styles.results}
            data={favoriteContractorsList}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            renderItem={({ item }: { item: Contractor }) => (
              <ContractorCard
                contractor={item}
                isFavorite
                onToggleFavorite={() => handleToggleFavorite(item.id)}
                openJobsCount={openJobsCountByContractor[item.id] ?? 0}
              />
            )}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.screenTint },

  // No white box / border here on purpose — the header reads as part of
  // the same flowing background as the rest of the screen, matching
  // AvailableJobsScreen/SearchWorkersScreen.
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

  resultsHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  resultsCount: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
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

export default FavoriteContractorsScreen;
