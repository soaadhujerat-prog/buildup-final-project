import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenProps {
  children: React.ReactNode;
  /** Apply the top safe-area inset as padding. Default: true. */
  top?: boolean;
  /** Apply the bottom safe-area inset as padding. Default: false. */
  bottom?: boolean;
  /**
   * Render the children inside a vertical ScrollView whose content container
   * always fills at least the viewport (`flexGrow: 1`). Use this for screens
   * whose content can exceed the shortest supported device height — the page
   * then scrolls instead of clipping.
   */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * The single place safe-area insets are turned into padding.
 *
 * Screens used to repeat `paddingTop: insets.top` (and a matching bottom
 * offset on every action bar / FAB) by hand; this wraps that once so the
 * value is sourced from `react-native-safe-area-context` in exactly one
 * spot, and is correct under Android edge-to-edge without a hardcoded
 * status-bar guess.
 */
const Screen: React.FC<ScreenProps> = ({
  children,
  top = true,
  bottom = false,
  scroll = false,
  style,
  contentContainerStyle,
}) => {
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: top ? insets.top : 0,
    paddingBottom: bottom ? insets.bottom : 0,
  };

  if (scroll) {
    return (
      <View style={[styles.flex, style]}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.grow, pad, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return <View style={[styles.flex, pad, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});

export default Screen;
