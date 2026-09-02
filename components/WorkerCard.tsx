import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Worker } from '../types';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { workerProfessions } from '../utils/normalize';
import StatusBadge from './StatusBadge';
import WorkerAvatar from './WorkerAvatar';

interface WorkerCardProps {
  worker: Worker;
  onPress?: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  /** Contractor→worker residence distance in km (Phase 10 "nearby workers").
   *  Undefined = unknown city data → no distance row (never a fake "0 ק"מ"). */
  distanceKm?: number;
}

/** The single shared worker result card — used by SearchWorkersScreen and
 *  FavoriteWorkersScreen. No rating/stars/review-count anywhere: BuildUp
 *  has no real review mechanism, so nothing here fabricates one. */
const WorkerCard: React.FC<WorkerCardProps> = ({
  worker,
  onPress,
  isFavorite,
  onToggleFavorite,
  distanceKm,
}) => {
  return (
    <View style={styles.card}>
      {/* The whole card navigates to the profile — the favorite button below
          is a real nested touchable, which RN resolves correctly (it claims
          the touch before it can bubble to this outer press). */}
      <TouchableOpacity style={styles.pressable} onPress={onPress} activeOpacity={0.85}>
        {/* TOP ROW — identity (avatar + name + profession) on the right,
            favorite + availability grouped together on the left, both
            starting flush at the card's own top padding. */}
        <View style={styles.topRow}>
          <View style={styles.identityRow}>
            <WorkerAvatar worker={worker} size={56} />
            <View style={styles.identity}>
              <Text style={styles.name} numberOfLines={1}>
                {worker.fullName}
              </Text>
              <Text style={styles.profession} numberOfLines={1}>
                {workerProfessions(worker).join(' · ')}
              </Text>
            </View>
          </View>

          <View style={styles.statusCluster}>
            <View style={styles.availabilitySlot}>
              {worker.isAvailable && <StatusBadge label="זמין מיד" tone="success" small />}
            </View>
            <TouchableOpacity
              style={styles.favoriteBtn}
              onPress={onToggleFavorite}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={
                isFavorite
                  ? `הסר את ${worker.fullName} מהמועדפים`
                  : `הוסף את ${worker.fullName} למועדפים`
              }
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={22}
                color={isFavorite ? '#E0245E' : Colors.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ב. מידע מרכזי */}
        <View style={styles.metaRow}>
          <View style={styles.metaGroup}>
            <View style={styles.metaItem}>
              <Ionicons name="briefcase-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{worker.experienceYears} שנים</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {worker.city}
              </Text>
            </View>
            {distanceKm != null && (
              <View style={styles.metaItem}>
                <Ionicons name="navigate-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {`כ-${Math.round(distanceKm)} ק"מ מאזור המגורים שלך`}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.rateBadge}>
            <Text style={styles.rateValue}>₪{worker.dailyRate}</Text>
            <Text style={styles.rateLabel}>ליום</Text>
          </View>
        </View>

        {/* ג. מיומנויות */}
        {worker.skills.length > 0 && (
          <View style={styles.skillsRow}>
            {worker.skills.slice(0, 3).map((skill) => (
              <View key={skill} style={styles.skillTag}>
                <Text style={styles.skillText}>{skill}</Text>
              </View>
            ))}
            {worker.skills.length > 3 && (
              <View style={[styles.skillTag, styles.moreTag]}>
                <Text style={styles.moreText}>+{worker.skills.length - 3}</Text>
              </View>
            )}
          </View>
        )}

        {/* ד. CTA — same tap target/action as the card itself, just a
            visible affordance so it's clear the card leads to a profile. */}
        <View style={styles.viewProfileRow}>
          <Ionicons name="chevron-back" size={16} color={Colors.primary} />
          <Text style={styles.viewProfileText}>צפה בפרופיל</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.small,
  },

  pressable: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },

  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },

  identityRow: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
  },

  // Favorite + availability badge, grouped together in the top-left corner:
  // heart furthest left, "זמין מיד" snug against it to its right. Always
  // rendered as a pair so the favorite button stays pinned to the left
  // whether or not a badge is present.
  statusCluster: {
    flexShrink: 0,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  availabilitySlot: {},
  favoriteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  identity: { flex: 1, gap: 2 },
  name: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  profession: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  metaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  metaGroup: {
    flex: 1,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  metaText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  rateBadge: {
    flexShrink: 0,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.primaryFaint,
    borderRadius: Radius.sm,
  },
  rateValue: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'ltr',
  },
  rateLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    writingDirection: 'rtl',
  },

  skillsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  skillTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
  },
  skillText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    writingDirection: 'rtl',
  },
  moreTag: { backgroundColor: Colors.primaryFaint },
  moreText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '700',
  },

  viewProfileRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  viewProfileText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
});

export default WorkerCard;
