import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, FontSize, Radius, Spacing, Shadow } from '../theme/colors';
import { JobPost } from '../types';
import { jobProfessions } from '../utils/normalize';
import { formatDate, formatJobRateCompact } from '../utils/helpers';
import { getRegistrationStatus } from '../services/jobStatusService';
import StatusBadge from './StatusBadge';

interface Props {
  job: JobPost;
  /** "X מתוך Y שובצו" — passed in by the screen (which owns assignments). */
  staffingLabel?: string;
  onPressDetails?: () => void;
}

/** Compact, read-only recap of the job the contractor is matching against —
 *  only fields that really exist on JobPost. */
const SmartMatchJobSummary: React.FC<Props> = ({
  job,
  staffingLabel,
  onPressDetails,
}) => {
  const professions = jobProfessions(job);
  const reg = getRegistrationStatus(job);
  const rate = formatJobRateCompact(job);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={2}>
          {job.title}
        </Text>
        <StatusBadge label={reg.label} tone={reg.tone} small />
      </View>

      {professions.length > 0 && (
        <View style={styles.chips}>
          {professions.map((p) => (
            <View key={p} style={styles.chip}>
              <Text style={styles.chipText}>{p}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.metaGrid}>
        <Meta icon="location-outline" text={job.city} />
        {job.startDate ? (
          <Meta icon="calendar-outline" text={`התחלה: ${formatDate(job.startDate)}`} />
        ) : null}
        <Meta
          icon="people-outline"
          text={
            staffingLabel ?? `דרושים ${job.workersNeeded} עובדים`
          }
        />
        {rate ? <Meta icon="cash-outline" text={rate} /> : null}
      </View>

      {onPressDetails && (
        <TouchableOpacity
          style={styles.detailsLink}
          onPress={onPressDetails}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="information-circle-outline" size={15} color={Colors.secondary} />
          <Text style={styles.detailsText}>הצג פרטי משרה</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const Meta: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <View style={styles.meta}>
    <Ionicons name={icon as any} size={14} color={Colors.textMuted} />
    <Text style={styles.metaText} numberOfLines={1}>
      {text}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.small,
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
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
  chips: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: Colors.primaryFaint,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: FontSize.xs,
    color: Colors.primaryDark,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  metaGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    rowGap: 6,
  },
  meta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    minWidth: '46%',
  },
  metaText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  detailsLink: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingTop: 2,
  },
  detailsText: {
    fontSize: FontSize.xs,
    color: Colors.secondary,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default SmartMatchJobSummary;
