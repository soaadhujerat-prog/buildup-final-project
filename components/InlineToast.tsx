import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, FontSize } from '../theme/colors';

interface Props {
  message: string | null;
}

/** Small, non-blocking feedback banner (e.g. "נוסף למועדפים") — the
 *  opposite of a modal Alert. Renders nothing when there's no message;
 *  the host screen owns the timer that clears it. */
const InlineToast: React.FC<Props> = ({ message }) => {
  if (!message) return null;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.toast}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.xxl,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: Colors.text,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.full,
    maxWidth: '86%',
  },
  text: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

export default InlineToast;
