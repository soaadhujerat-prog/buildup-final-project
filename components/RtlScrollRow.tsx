import React, { useEffect, useRef } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Style for the inner row (gap / padding between items). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * When this value changes, the row snaps back to its logical start (the
   * right edge) with no animation — e.g. after the option set is swapped
   * for a different list.
   */
  resetKey?: string | number;
}

/**
 * The one horizontal RTL scroller for chip / filter rows.
 *
 * Replaces three ad-hoc techniques that had drifted apart (a `scaleX: -1`
 * mirror, a `row-reverse` + `scrollToEnd` anchor, and a bare `row-reverse`).
 *
 * How it works, without ever reversing the data:
 *   - children stay in their natural array order and lay out `row`
 *     (LTR-origin), so `scrollX = 0` is always anchored to children[0];
 *   - the ScrollView is mirrored (`scaleX: -1`) so that anchor is painted
 *     flush against the RIGHT edge — the RTL reading start — and the user
 *     swipes left for the rest;
 *   - each child is un-mirrored once so its own content renders normally.
 *
 * `overScrollMode="never"` suppresses the Android edge-glow, which the
 * mirror would otherwise throw to the wrong side.
 */
const RtlScrollRow: React.FC<Props> = ({
  children,
  style,
  contentContainerStyle,
  resetKey,
}) => {
  const ref = useRef<ScrollView>(null);
  const prevKey = useRef(resetKey);

  useEffect(() => {
    if (resetKey !== undefined && prevKey.current !== resetKey) {
      prevKey.current = resetKey;
      ref.current?.scrollTo({ x: 0, animated: false });
    }
  }, [resetKey]);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      overScrollMode="never"
      style={[styles.mirror, style]}
      contentContainerStyle={[styles.row, contentContainerStyle]}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? (
          <View style={styles.mirror}>{child}</View>
        ) : null
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  mirror: { transform: [{ scaleX: -1 }] },
  row: { flexDirection: 'row', alignItems: 'center' },
});

export default RtlScrollRow;
