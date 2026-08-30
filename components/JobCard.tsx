import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { JobPost } from '../types';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { formatRatePerUnit } from '../utils/helpers';
import { jobProfessions } from '../utils/normalize';
import StatusBadge from './StatusBadge';

interface JobCardProps {
  job: JobPost;
  contractorName: string;
  onPress: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Short "27.08" form — deliberately not a relative "לפני X ימים" count,
 *  per the explicit preference for a plain, unambiguous date over a
 *  computed one. */
const formatShortPostedDate = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
};

/** The shared job result card for the worker-facing job search. Compact,
 *  whole-card tappable, with an explicit "צפה בפרטי המשרה" affordance so
 *  it's clear it leads somewhere. No AI/recommendation labels — Smart
 *  Match scoring is a future backend feature, not simulated here. */
const JobCard: React.FC<JobCardProps> = ({ job, contractorName, onPress }) => {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.headRow}>
        <Text style={styles.title} numberOfLines={1}>
          {job.title}
        </Text>
        {job.urgent && <StatusBadge label="דחוף" tone="danger" small />}
      </View>

      <Text style={styles.contractor} numberOfLines={1}>
        <Ionicons name="business-outline" size={12} color={Colors.textMuted} /> {contractorName}
        {'  ·  פורסם ב-'}
        {formatShortPostedDate(job.postedAt)}
      </Text>

      <Text style={styles.desc} numberOfLines={2}>
        {job.description}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaGroup}>
          <View style={styles.metaItem}>
            <Ionicons name="briefcase-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {jobProfessions(job).join(' · ')}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {job.city}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText} numberOfLines={1}>
              {job.duration}
            </Text>
          </View>
        </View>
        <View style={styles.rateBadge}>
          {!!job.hourlyRate && <RateLine amount={job.hourlyRate} unit="שעה" />}
          {!!job.dailyRate && <RateLine amount={job.dailyRate} unit="יום" />}
        </View>
      </View>

      <View style={styles.viewDetailsRow}>
        <Ionicons name="chevron-back" size={16} color={Colors.primary} />
        <Text style={styles.viewDetailsText}>צפה בפרטי המשרה</Text>
      </View>
    </TouchableOpacity>
  );
};

/** One line of the rate badge — built from the single shared
 *  formatRatePerUnit formatter, just split for the two-tone styling
 *  (amount+₪ bold, /unit muted). */
const RateLine: React.FC<{ amount: number; unit: 'שעה' | 'יום' }> = ({ amount, unit }) => {
  const [main, unitPart] = formatRatePerUnit(amount, unit).split('/');
  return (
    <Text style={styles.rateLine} numberOfLines={1}>
      {main}
      <Text style={styles.rateUnit}>/{unitPart}</Text>
    </Text>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadow.small,
  },

  headRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
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
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.primaryFaint,
    borderRadius: Radius.sm,
  },
  rateLine: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'ltr',
  },
  rateUnit: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
  },

  viewDetailsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  viewDetailsText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
});

export default JobCard;
