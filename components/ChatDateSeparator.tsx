import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, FontSize } from '../theme/colors';

interface Props {
  /** Already-formatted label — "היום" / "אתמול" / "DD.MM.YYYY"
   *  (see formatChatDateSeparator in utils/helpers). */
  label: string;
}

/** The subtle centred chip shown inside a chat thread the first time a new
 *  calendar day appears. Shared by the worker and contractor chat screens. */
const ChatDateSeparator: React.FC<Props> = ({ label }) => (
  <View style={styles.wrap}>
    <View style={styles.chip}>
      <Text style={styles.text}>{label}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
  },
  text: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    writingDirection: 'rtl',
  },
});

export default ChatDateSeparator;
