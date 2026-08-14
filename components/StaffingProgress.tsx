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
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray200,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },

  compactWrap: { width: '100%', gap: 4 },
  compactTrack: {
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
