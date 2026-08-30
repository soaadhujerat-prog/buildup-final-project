import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { StaffingProgress as StaffingProgressData } from '../services/assignmentService';

const STATUS_COLOR: Record<StaffingProgressData['status'], string> = {
  not_started: Colors.textMuted,
  in_progress: Colors.warning,
  completed: Colors.success,
};

interface Props {
  progress: StaffingProgressData;
  /** Compact = small inline bar for cards. Default = full block with label. */
  compact?: boolean;
}

/** The one place that renders "X מתוך Y שובצו" + a progress bar + status —
 *  used on job cards, job details and the staffing screen so the visual
 *  treatment never drifts between them. */
const StaffingProgress: React.FC<Props> = ({ progress, compact }) => {
  const color = STATUS_COLOR[progress.status];

  if (compact) {
    return (
      <View style={styles.compactWrap}>
        <View style={styles.compactTrack}>
          <View
            style={[
              styles.compactFill,
              { width: `${progress.percent}%`, backgroundColor: color },
            ]}
          />
        </View>
        <Text style={[styles.compactText, { color }]}>
          {progress.filled}/{progress.needed} שובצו
        </Text>
      </View>
    );
  }

  // Only a real cancellation leaves a slot to fill — a worker who finished
  // their part still occupies theirs.
  const missingHint =
    progress.missing === 1
      ? 'חסר עובד אחד'
      : progress.missing > 1
      ? `חסרים ${progress.missing} עובדים`
      : null;

  // Secondary breakdown — shown only once some workers have finished, so the
  // main "X מתוך Y שובצו" number never needs a caveat.
  const showBreakdown = progress.completed > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={[styles.statusLabel, { color }]}>{progress.label}</Text>
        <Text style={styles.countText}>
          {progress.filled} מתוך {progress.needed} עובדים שובצו
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${progress.percent}%`, backgroundColor: color },
          ]}
        />
      </View>
      {showBreakdown && (
        <Text style={styles.subText}>
          עובדים כעת: {progress.active} · סיימו עבודה: {progress.completed}
        </Text>
      )}
      {missingHint && (
        <Text style={[styles.subText, styles.missingText]}>{missingHint}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 8 },
  headRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  statusLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  track: {
    // RTL: the fill grows from the RIGHT edge (row-reverse), so 1/3 fills
    // the right third, 3/3 fills the whole bar — matching how Hebrew reads.
    flexDirection: 'row-reverse',
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray200,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },

  subText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  missingText: {
    color: Colors.warning,
    fontWeight: '700',
  },

  compactWrap: { width: '100%', gap: 4 },
  compactTrack: {
    flexDirection: 'row-reverse',
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray200,
    overflow: 'hidden',
  },
  compactFill: { height: '100%', borderRadius: Radius.full },
  compactText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    writingDirection: 'rtl',
    textAlign: 'right',
  },
});

export default StaffingProgress;
