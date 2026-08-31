import React from 'react';
import { Text, TextProps, TextStyle, StyleSheet } from 'react-native';

export interface AppTextProps extends TextProps {
  /**
   * Compact UI text — chips, badges, segmented controls, small buttons.
   * Drops the extra vertical font padding Android adds around glyphs (which
   * otherwise pushes Hebrew text off-centre inside tight fixed rows), and
   * caps runaway system font-scaling so an enlarged OS font can't blow the
   * label out of its control. NOT for body copy or headings.
   */
  compact?: boolean;
}

/**
 * Shared Text wrapper. Defaults every label to the app's RTL reading
 * direction (`textAlign: 'right'`, `writingDirection: 'rtl'`) so Hebrew is
 * aligned the same on iOS and Android without relying on
 * `I18nManager.forceRTL`. A caller can still override alignment (e.g. a
 * centred header title) or force LTR for numbers / e-mail / phone by
 * passing `style={{ textAlign: 'left', writingDirection: 'ltr' }}`.
 */
const AppText: React.FC<AppTextProps> = ({
  compact = false,
  style,
  maxFontSizeMultiplier,
  ...rest
}) => (
  <Text
    {...rest}
    maxFontSizeMultiplier={maxFontSizeMultiplier ?? (compact ? 1.3 : undefined)}
    style={[compact ? styles.compact : styles.base, style]}
  />
);

const styles = StyleSheet.create({
  base: { textAlign: 'right', writingDirection: 'rtl' } as TextStyle,
  compact: {
    textAlign: 'right',
    writingDirection: 'rtl',
    includeFontPadding: false,
  } as TextStyle,
});

export default AppText;
