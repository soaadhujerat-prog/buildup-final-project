import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Worker } from '../types';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { formatCurrency, getInitials, getAvatarBackground } from '../utils/helpers';

interface WorkerCardProps {
  worker: Worker;
  onPress?: () => void;
  onInvite?: () => void;
  compact?: boolean;
}

const WorkerCard: React.FC<WorkerCardProps> = ({
  worker,
  onPress,
  onInvite,
  compact = false,
}) => {
  const avatarBg = getAvatarBackground(worker.fullName);

  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.cardCompact]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.top}>
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          <Text style={styles.avatarText}>{getInitials(worker.fullName)}</Text>
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{worker.fullName}</Text>

            {worker.isAvailable ? (
              <View style={styles.availBadge}>
                <Text style={styles.availText}>זמין</Text>
              </View>
            ) : (
              <View style={styles.unavailBadge}>
                <Text style={styles.unavailText}>לא זמין</Text>
              </View>
            )}
          </View>

          <Text style={styles.profession}>{worker.profession}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons
                name="location-outline"
                size={13}
                color={Colors.textSecondary}
              />
              <Text style={styles.metaText}>{worker.city}</Text>
            </View>

            <View style={styles.metaItem}>
              <Ionicons
                name="briefcase-outline"
                size={13}
                color={Colors.textSecondary}
              />
              <Text style={styles.metaText}>{worker.experienceYears} שנים</Text>
            </View>
          </View>
        </View>
      </View>

      {!compact && (
        <>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="star" size={14} color={Colors.warning} />
              <Text style={styles.statValue}>{worker.rating}</Text>
              <Text style={styles.statLabel}>({worker.reviewCount})</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.stat}>
              <Ionicons
                name="checkmark-circle-outline"
                size={14}
                color={Colors.success}
              />
              <Text style={styles.statValue}>{worker.completedJobsCount}</Text>
              <Text style={styles.statLabel}>עבודות</Text>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.stat}>
              <Text style={styles.rateText}>{formatCurrency(worker.dailyRate)}</Text>
              <Text style={styles.statLabel}>/יום</Text>
            </View>
          </View>

          <View style={styles.skillsRow}>
            {worker.skills.slice(0, 3).map((skill, i) => (
              <View key={i} style={styles.skillTag}>
                <Text style={styles.skillText}>{skill}</Text>
              </View>
            ))}

            {worker.skills.length > 3 && (
              <View style={[styles.skillTag, styles.moreTag]}>
                <Text style={styles.moreText}>+{worker.skills.length - 3}</Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={onPress}
              activeOpacity={0.8}
            >
              <Text style={styles.profileBtnText}>פרופיל</Text>
            </TouchableOpacity>

            {onInvite && (
              <TouchableOpacity
                style={styles.inviteBtn}
                onPress={onInvite}
                activeOpacity={0.8}
              >
                <Ionicons name="paper-plane" size={15} color={Colors.white} />
                <Text style={styles.inviteBtnText}>הזמן לעבודה</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    ...Shadow.medium,
  },

  cardCompact: {
    padding: Spacing.md,
    marginHorizontal: 0,
    marginVertical: 0,
  },

  top: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  avatarText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },

  info: {
    flex: 1,
    alignItems: 'stretch',
  },

  nameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },

  name: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  availBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },

  availText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: '600',
    writingDirection: 'rtl',
  },

  unavailBadge: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },

  unavailText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    writingDirection: 'rtl',
  },

  profession: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  metaRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.md,
  },

  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  metaText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  statsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },

  stat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  statValue: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'ltr',
  },

  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },

  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
  },

  rateText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'ltr',
  },

  skillsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },

  skillTag: {
    backgroundColor: Colors.primaryFaint,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },

  skillText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '500',
    writingDirection: 'rtl',
  },

  moreTag: {
    backgroundColor: Colors.gray100,
  },

  moreText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  actions: {
    flexDirection: 'row-reverse',
    gap: Spacing.sm,
  },

  profileBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },

  profileBtnText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    writingDirection: 'rtl',
  },

  inviteBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },

  inviteBtnText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: '600',
    writingDirection: 'rtl',
  },
});

export default WorkerCard;