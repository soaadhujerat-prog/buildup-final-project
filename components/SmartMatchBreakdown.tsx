import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, FontSize, Spacing } from '../theme/colors';

interface Props {
  strengths: string[];
  concerns: string[];
}

/** "למה הוא מתאים?" + "מה כדאי לקחת בחשבון" — plain-language reasons, no
 *  technical +N / bar chart. Each section renders only when it has content. */
const SmartMatchBreakdown: React.FC<Props> = ({ strengths, concerns }) => {
  if (strengths.length === 0 && concerns.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {strengths.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>למה הוא מתאים?</Text>
          {strengths.map((s, i) => (
            <View key={`s${i}`} style={styles.row}>
              <Ionicons
                name="checkmark-circle"
                size={15}
                color={Colors.success}
                style={styles.icon}
              />
              <Text style={styles.text}>{s}</Text>
            </View>
          ))}
        </View>
      )}

      {concerns.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>מה כדאי לקחת בחשבון</Text>
          {concerns.map((c, i) => (
            <View key={`c${i}`} style={styles.row}>
              <Ionicons
                name="alert-circle"
                size={15}
                color={Colors.warning}
                style={styles.icon}
              />
              <Text style={styles.text}>{c}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  section: { gap: 6 },
  heading: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
  },
  icon: { marginTop: 1 },
  text: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 19,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default SmartMatchBreakdown;
