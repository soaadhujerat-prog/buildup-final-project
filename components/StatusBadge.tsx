import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, FontSize, Radius } from '../theme/colors';
import AppText from './AppText';

type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

interface Props {
  label: string;
  tone?: Tone;
  small?: boolean;
}

const TONE_STYLES: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: '#DCFCE7', fg: Colors.success },
  info: { bg: '#DBEAFE', fg: Colors.secondary },
  warning: { bg: '#FEF3C7', fg: Colors.warning },
  danger: { bg: '#FEE2E2', fg: Colors.danger },
  neutral: { bg: Colors.gray100, fg: Colors.textSecondary },
};

const StatusBadge: React.FC<Props> = ({ label, tone = 'neutral', small }) => {
  const t = TONE_STYLES[tone];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: t.bg },
        small && styles.badgeSmall,
      ]}
    >
      <AppText
        compact
        style={[styles.label, { color: t.fg }, small && styles.labelSmall]}
      >
        {label}
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  labelSmall: {
    fontSize: 10,
  },
});

export default StatusBadge;
