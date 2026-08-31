import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  Colors,
  Spacing,
  FontSize,
  FilterChip as FC,
} from '../theme/colors';
import AppText from './AppText';

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'admin';
}

/**
 * Standardized filter chip.
 *
 * Sizing is `minHeight` + vertical padding rather than a hard `height`, so a
 * longer label or an enlarged system font grows the chip instead of clipping
 * the text (a real problem on Android, where Hebrew glyphs sit taller); the
 * `AppText compact` label also drops Android's extra font padding so it stays
 * vertically centred.
 */
const FilterChip: React.FC<FilterChipProps> = ({
  label,
  active,
  onPress,
  tone = 'primary',
}) => {
  const activeBg =
    tone === 'success'
      ? Colors.success
      : tone === 'warning'
      ? Colors.warning
      : tone === 'danger'
      ? Colors.danger
      : tone === 'info'
      ? Colors.info
      : tone === 'admin'
      ? Colors.adminPrimary
      : Colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: activeBg, borderColor: activeBg },
      ]}
      activeOpacity={0.85}
    >
      <AppText
        compact
        style={[styles.label, active && styles.labelActive]}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </TouchableOpacity>
  );
};

/**
 * Standardized horizontal scrollable container for FilterChip rows.
 * Use this to wrap chips so all screens share the same spacing/padding.
 */
export const FilterChipRow: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.row}
  >
    {children}
  </ScrollView>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: FC.gap,
    alignItems: 'center',
  },
  chip: {
    minHeight: FC.height,
    paddingHorizontal: FC.paddingHorizontal,
    paddingVertical: FC.paddingVertical,
    borderRadius: FC.borderRadius,
    borderWidth: FC.borderWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: FontSize.sm + 4,
  },
  labelActive: { color: Colors.white },
});

export default FilterChip;
