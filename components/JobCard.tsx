import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Job } from '../types';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import {
  formatCurrency,
  getJobStatusColor,
  getJobStatusLabel,
  formatShortDate,
} from '../utils/helpers';

interface JobCardProps {
  job: Job;
  /** Number of applications submitted for this job. Derived from the
   *  Application collection (see AppContext.getApplicationsForJob), not a
   *  static field on JobPost. */
  applicantsCount: number;
  onPress?: () => void;
  showActions?: boolean;
  onEdit?: () => void;
  onViewRequests?: () => void;
  isWorkerView?: boolean;
  onApply?: () => void;
}

const JobCard: React.FC<JobCardProps> = ({
  job,
  applicantsCount,
  onPress,
  showActions = false,
  onEdit,
  onViewRequests,
  isWorkerView = false,
  onApply,
}) => {
  const statusColor = getJobStatusColor(job.status);
  const statusLabel = getJobStatusLabel(job.status);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {job.urgent && (
        <View style={styles.urgentBanner}>
          <Ionicons name="flash" size={12} color={Colors.white} />
          <Text style={styles.urgentText}>דחוף</Text>
        </View>
      )}

      <View style={[styles.topRow, job.urgent && styles.topRowWithUrgent]}>
        <View style={styles.professionTag}>
          <Text style={styles.professionText}>{job.profession}</Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusColor + '20' },
          ]}
        >
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>{job.title}</Text>

      <Text style={styles.description} numberOfLines={2}>
        {job.description}
      </Text>

      <View style={styles.detailsGrid}>
        <View style={styles.detailItem}>
          <Ionicons
            name="location-outline"
            size={14}
            color={Colors.textSecondary}
          />
          <Text style={styles.detailText}>{job.city}</Text>
        </View>

        <View style={styles.detailItem}>
          <Ionicons
            name="calendar-outline"
            size={14}
            color={Colors.textSecondary}
          />
          <Text style={[styles.detailText, { writingDirection: 'ltr' }]}>
            {formatShortDate(job.startDate)}
          </Text>
        </View>

        <View style={styles.detailItem}>
          <Ionicons
            name="time-outline"
            size={14}
            color={Colors.textSecondary}
          />
          <Text style={styles.detailText}>{job.duration}</Text>
        </View>
      </View>

      <View style={styles.metaBlock}>
        <View style={styles.metaItem}>
          <Ionicons
            name="people-outline"
            size={15}
            color={Colors.textSecondary}
          />
          <Text style={styles.metaText}>{job.workersNeeded} עובדים</Text>
        </View>

        <View style={styles.metaItem}>
          <Ionicons
            name="person-outline"
            size={15}
            color={Colors.textSecondary}
          />
          <Text style={styles.metaText}>{applicantsCount} מועמדים</Text>
        </View>
      </View>

      <View style={styles.footerDivider} />

      <View style={styles.footerRow}>
        <View style={styles.rateWrap}>
          <Text style={styles.rate}>{formatCurrency(job.dailyRate)}</Text>
          <Text style={styles.rateLabel}>/יום</Text>
        </View>
      </View>

      {showActions && (
        <View style={styles.actions}>
          {onEdit && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={onEdit}
              activeOpacity={0.8}
            >
              <Ionicons
                name="create-outline"
                size={16}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>
          )}

          {onViewRequests && (
            <TouchableOpacity
              style={styles.requestsBtn}
              onPress={onViewRequests}
              activeOpacity={0.85}
            >
              <Text style={styles.requestsBtnText}>
                בקשות ({applicantsCount})
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {isWorkerView && onApply && (
        <TouchableOpacity
          style={styles.applyBtn}
          onPress={onApply}
          activeOpacity={0.85}
        >
          <Ionicons name="paper-plane" size={16} color={Colors.white} />
          <Text style={styles.applyBtnText}>הגש מועמדות</Text>
        </TouchableOpacity>
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
    overflow: 'hidden',
    ...Shadow.medium,
  },

  urgentBanner: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.danger,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderBottomLeftRadius: Radius.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },

  urgentText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  topRow: {
    width: '100%',
    minHeight: 30,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },

  topRowWithUrgent: {
    marginTop: Spacing.lg,
  },

  professionTag: {
    backgroundColor: Colors.primaryFaint,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },

  professionText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  title: {
    width: '100%',
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: Spacing.xs,
  },

  description: {
    width: '100%',
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: Spacing.md,
  },

  detailsGrid: {
    width: '100%',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },

  detailText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  metaBlock: {
    width: '100%',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  metaText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  footerDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: Spacing.md,
  },

  footerRow: {
    width: '100%',
    alignItems: 'flex-end',
  },

  rateWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    gap: 2,
  },

  rate: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.primary,
    textAlign: 'right',
    writingDirection: 'ltr',
  },

  rateLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  actions: {
    flexDirection: 'row-reverse',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },

  requestsBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  requestsBtnText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  editBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  applyBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 12,
    marginTop: Spacing.md,
  },

  applyBtnText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

export default JobCard;