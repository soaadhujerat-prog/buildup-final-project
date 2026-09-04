import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Contractor } from '../types';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import ContractorAvatar from './ContractorAvatar';
import { contractorAreas } from '../utils/normalize';

interface ContractorCardProps {
  contractor: Contractor;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  openJobsCount: number;
  /** Opens the safe contractor profile (ContractorPublicProfileScreen). The
   *  whole card is tappable, mirroring WorkerCard — optional so a future
   *  consumer can still render a non-navigating card. */
  onPress?: () => void;
}

/** Card for FavoriteContractorsScreen — no rating/stars, just identity +
 *  the one real, computable fact (open jobs right now), plus a "צפה בפרופיל"
 *  affordance mirroring WorkerCard's. The favorite heart is a real nested
 *  touchable (same pattern as WorkerCard) — RN claims the touch on the inner
 *  target first, so it never falls through to the outer onPress. */
const ContractorCard: React.FC<ContractorCardProps> = ({
  contractor,
  isFavorite,
  onToggleFavorite,
  openJobsCount,
  onPress,
}) => {
  const locationLabel = [contractor.city, ...contractorAreas(contractor)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.pressable}
        onPress={onPress}
        activeOpacity={0.85}
        disabled={!onPress}
      >
        <View style={styles.topRow}>
          <View style={styles.identityRow}>
            <ContractorAvatar
              contractor={contractor}
              size={52}
              iconColor={Colors.white}
              fallbackBg={Colors.secondary}
              style={styles.icon}
            />
            <View style={styles.identity}>
              <Text style={styles.name} numberOfLines={1}>
                {contractor.companyName || contractor.fullName}
              </Text>
              {!!locationLabel && (
                <Text style={styles.meta} numberOfLines={1}>
                  {locationLabel}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.favoriteBtn}
            onPress={onToggleFavorite}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={
              isFavorite
                ? `הסר את ${contractor.companyName} מהמועדפים`
                : `הוסף את ${contractor.companyName} למועדפים`
            }
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={22}
              color={isFavorite ? '#E0245E' : Colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        {contractor.projectTypes.length > 0 && (
          <View style={styles.tagsRow}>
            {contractor.projectTypes.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.jobsRow}>
          <Ionicons name="briefcase-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.jobsText}>{openJobsCount} משרות פתוחות</Text>
        </View>

        {!!onPress && (
          <View style={styles.viewProfileRow}>
            <Ionicons name="chevron-back" size={16} color={Colors.primary} />
            <Text style={styles.viewProfileText}>צפה בפרופיל</Text>
          </View>
        )}
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
    gap: Spacing.sm,
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
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  identity: { flex: 1, gap: 2 },
  name: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  meta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  favoriteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tagsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
  },
  tagText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    writingDirection: 'rtl',
  },

  jobsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  jobsText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
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

export default ContractorCard;
