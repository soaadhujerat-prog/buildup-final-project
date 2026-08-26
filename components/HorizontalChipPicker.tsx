import React, { useEffect, useRef } from 'react';
import {
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';

interface Props {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  chipStyle?: StyleProp<ViewStyle>;
  chipActiveStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  textActiveStyle?: StyleProp<TextStyle>;
  activeOpacity?: number;
}

/**
 * Horizontal, RTL-correct chip scroller shared by every single-select
 * "options as chips" field (profession category, specific profession,
 * area of operation, ...).
 *
 * Why this exists: a plain `ScrollView horizontal` with a
 * `flexDirection: 'row-reverse'` content container gets RTL backwards.
 * RN's horizontal scroll offset is always anchored to the *start* of the
 * underlying (LTR) content box — row-reverse just reorders children
 * within that box, so options[0] ends up pushed to the far right of the
 * total content width instead of the visible edge. The result: on mount
 * (scrollX = 0) the user sees the *last* items of the array, with the
 * first item only reachable by scrolling all the way over, and often a
 * chip cut off at the right edge.
 *
 * The fix keeps `options` in its normal (non-reversed) order and
 * flexDirection: 'row', then mirrors the ScrollView (scaleX: -1) and
 * un-mirrors each chip (scaleX: -1 again). That keeps scrollX = 0
 * anchored to options[0] as usual, but paints it flush against the right
 * edge — exactly the RTL reading order — without touching data order.
 */
const HorizontalChipPicker: React.FC<Props> = ({
  options,
  value,
  onChange,
  chipStyle,
  chipActiveStyle,
  textStyle,
  textActiveStyle,
  activeOpacity = 0.85,
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const optionsKey = options.join('');
  const prevOptionsKey = useRef(optionsKey);

  // When the option set itself changes (e.g. "מקצוע ספציפי" swapping to a
  // new list after "תחום מקצועי" changes), snap back to the start so the
  // new list also opens on its own first item — instead of keeping the
  // previous list's scroll position.
  useEffect(() => {
    if (prevOptionsKey.current !== optionsKey) {
      prevOptionsKey.current = optionsKey;
      scrollRef.current?.scrollTo({ x: 0, animated: false });
    }
  }, [optionsKey]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.mirror}
      contentContainerStyle={styles.row}
    >
      {options.map((o) => {
        const active = o === value;
        return (
          <TouchableOpacity
            key={o}
            onPress={() => onChange(o)}
            style={[styles.mirror, chipStyle, active && chipActiveStyle]}
            activeOpacity={activeOpacity}
          >
            <Text style={[textStyle, active && textActiveStyle]}>{o}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  mirror: { transform: [{ scaleX: -1 }] },
  row: { flexDirection: 'row', gap: 8 },
});

export default HorizontalChipPicker;
