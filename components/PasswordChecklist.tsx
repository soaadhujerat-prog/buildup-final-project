import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, FontSize, Radius } from '../theme/colors';
import { passwordChecks } from '../utils/passwordPolicy';

interface Props {
  /** The current password value. */
  value: string;
}

/**
 * Live password-requirements checklist. A met rule reads as "OK" (green check);
 * an unmet rule is neutral (muted circle) — never a red error. Shown while the
 * user types so they always know exactly what is still missing.
 */
const PasswordChecklist: React.FC<Props> = ({ value }) => {
  const checks = passwordChecks(value);
  return (
    <View style={styles.box}>
      {checks.map((c) => (
        <View key={c.key} style={styles.row}>
          <Ionicons
            name={c.passed ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={c.passed ? Colors.success : Colors.textMuted}
          />
          <Text style={[styles.label, c.passed && styles.labelPassed]}>
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 4,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  labelPassed: {
    color: Colors.text,
    fontWeight: '600',
  },
});

export default PasswordChecklist;
