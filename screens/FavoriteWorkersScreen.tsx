import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { useApp } from '../context/AppContext';
import WorkerCard from '../components/WorkerCard';
import InlineToast from '../components/InlineToast';

interface Props {
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
  onOpenSearchWorkers: () => void;
}

/** "עובדים מועדפים" — the workers the current contractor has bookmarked.
 *  Reuses the exact same WorkerCard as SearchWorkersScreen; no separate
 *  card design. Favorites are personal to this contractor (see
 *  ContractorFavoriteWorker in types/index.ts) — this screen never shows
 *  another contractor's list. */
const FavoriteWorkersScreen: React.FC<Props> = ({
  onBack,
  onOpenWorkerProfile,
  onOpenSearchWorkers,
}) => {
  const insets = useSafeAreaInsets();
  const { workers, currentUser, getFavoriteWorkerIds, toggleFavoriteWorker } = useApp();
  const contractorId = currentUser?.role === 'contractor' ? currentUser.id : null;

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

  const favoriteWorkers = useMemo(
    () =>
      workers.filter((w) => w.status === 'approved' && favoriteWorkerIds.includes(w.id)),
    [workers, favoriteWorkerIds]
  );

  const handleToggleFavorite = (workerId: string) => {
    if (!contractorId) return;
    toggleFavoriteWorker(contractorId, workerId);
    setToastMessage('הוסר מהמועדפים');
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
        <Text style={styles.headerTitle} pointerEvents="none">עובדים מועדפים</Text>
        <Text style={styles.headerSubtitle}>העובדים ששמרת לגישה מהירה</Text>
      </View>

      {favoriteWorkers.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="heart-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>עדיין אין עובדים מועדפים</Text>
          <Text style={styles.emptySub}>
            שמור עובדים שתרצה לעבוד איתם שוב כדי למצוא אותם במהירות.
          </Text>
          <TouchableOpacity
            onPress={onOpenSearchWorkers}
            style={styles.emptyCta}
            activeOpacity={0.85}
          >
            <Text style={styles.emptyCtaText}>חפש עובדים</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsCount}>{favoriteWorkers.length} עובדים</Text>
          </View>
          <FlatList
            style={styles.results}
            data={favoriteWorkers}
            keyExtractor={(w) => w.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            renderItem={({ item }) => (
              <WorkerCard
                worker={item}
                onPress={() => onOpenWorkerProfile(item.id)}
                isFavorite
                onToggleFavorite={() => handleToggleFavorite(item.id)}
              />
            )}
          />
        </>
      )}

      <InlineToast message={toastMessage} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.screenTint },

  // No white box / border here on purpose — the header reads as part of
  // the same flowing background as the rest of the screen, matching
  // SearchWorkersScreen/AvailableJobsScreen.
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

export default FavoriteWorkersScreen;
