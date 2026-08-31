import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import RtlScrollRow from './RtlScrollRow';

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
 * All of the RTL scroll mechanics now live in the shared `RtlScrollRow`
 * primitive — options stay in their natural order (never reversed), the
 * first option is painted flush against the right edge with no initial
 * scroll, and the rest are reachable by swiping left. When the option set
 * itself changes, `resetKey` snaps the row back to that start.
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
  const optionsKey = options.join('|');

  return (
    <RtlScrollRow resetKey={optionsKey} contentContainerStyle={styles.row}>
      {options.map((o) => {
        const active = o === value;
        return (
          <TouchableOpacity
            key={o}
            onPress={() => onChange(o)}
            style={[chipStyle, active && chipActiveStyle]}
            activeOpacity={activeOpacity}
          >
            <Text style={[styles.chipText, textStyle, active && textActiveStyle]}>
              {o}
            </Text>
          </TouchableOpacity>
        );
      })}
    </RtlScrollRow>
  );
};

const styles = StyleSheet.create({
  row: { gap: 8 },
  // Compact control text: no extra Android font padding so the label sits
  // centred in the chip. Caller's textStyle still wins.
  chipText: { includeFontPadding: false } as TextStyle,
});

export default HorizontalChipPicker;
