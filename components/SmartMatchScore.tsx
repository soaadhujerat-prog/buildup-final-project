import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { Colors, FontSize, Radius } from '../theme/colors';
import { SmartMatchLevel } from '../types';
import { SMART_MATCH_LEVEL_LABEL } from '../services/smartMatchService';

interface Props {
  percent: number;
  level: SmartMatchLevel;
  /** 'lg' — the prominent circle on a worker card. 'sm' — inline chip. */
  size?: 'lg' | 'sm';
}

// One colour per level, all drawn from the BuildUp palette (green / brand
// brown / navy / muted) so the screen never turns into a rainbow.
const TONE: Record<SmartMatchLevel, string> = {
  high: Colors.success,
  good: Colors.primary,
  partial: Colors.secondary,
  low: Colors.textMuted,
};

/** The headline match figure + its Hebrew label. Purely presentational. */
const SmartMatchScore: React.FC<Props> = ({ percent, level, size = 'lg' }) => {
  const color = TONE[level];
  const label = SMART_MATCH_LEVEL_LABEL[level];

  if (size === 'sm') {
    return (
      <View style={[styles.chip, { backgroundColor: color + '18' }]}>
        <Text style={[styles.chipPct, { color }]}>{percent}%</Text>
        <Text style={[styles.chipLabel, { color }]}>{label}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.ring, { borderColor: color, backgroundColor: color + '12' }]}>
        <Text style={[styles.pct, { color }]}>{percent}</Text>
        <Text style={[styles.pctSign, { color }]}>%</Text>
      </View>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4, width: 78 },
  ring: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  pct: { fontSize: FontSize.xl, fontWeight: '800' },
  pctSign: { fontSize: FontSize.xs, fontWeight: '700', marginTop: 4, marginStart: 1 },
  label: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  chipPct: { fontSize: FontSize.sm, fontWeight: '800' },
  chipLabel: { fontSize: FontSize.xs, fontWeight: '700', writingDirection: 'rtl' },
});

export default SmartMatchScore;
