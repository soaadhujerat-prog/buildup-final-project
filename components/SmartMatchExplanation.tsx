import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, FontSize, Radius, Spacing } from '../theme/colors';

interface Props {
  /** The free-text summary from the future OpenAI semantic pass. While it is
   *  undefined (no backend) this component renders NOTHING — the screen never
   *  shows a fabricated "AI explanation". */
  summary?: string;
}

/** Reusable placeholder for the backend-generated match explanation. When a
 *  real `smart-match` Edge Function starts returning `aiSummary`, that text
 *  flows straight in here with no other screen change. */
const SmartMatchExplanation: React.FC<Props> = ({ summary }) => {
  if (!summary || !summary.trim()) return null;

  return (
    <View style={styles.box}>
      <Ionicons name="sparkles-outline" size={15} color={Colors.primary} />
      <Text style={styles.text}>{summary.trim()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.primaryFaint,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  text: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 20,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default SmartMatchExplanation;
