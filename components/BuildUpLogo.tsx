import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../theme/colors';

interface Props {
  /** Side length of the white badge, in px. Default 56. */
  size?: number;
  /** Passed through to the outer badge View — use it for margins / shadow /
   *  a screen-specific corner radius. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The single BuildUp brand mark. Deliberately made of TWO elements so it
 * doesn't read as belonging to one side of the marketplace:
 *   • a building (Ionicons "business")   → contractors / companies / projects
 *   • a crossed-tools badge (Ionicons "construct") → workers / trades
 * Together = "we connect both, across construction". Brown building + navy
 * tool badge on a white square — reads cleanly on the dark Splash gradient
 * and on the light Welcome surface alike. Vector-only, no image asset.
 */
const BuildUpLogo: React.FC<Props> = ({ size = 56, style }) => {
  const radius = Math.round(size * 0.26);
  const buildingSize = Math.round(size * 0.56);
  const badgeSize = Math.round(size * 0.44);
  const badgeIcon = Math.round(badgeSize * 0.62);
  const badgeRing = Math.max(2, Math.round(size * 0.04));
  const inset = Math.round(size * 0.055);

  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      <Ionicons name="business" size={buildingSize} color={Colors.primary} />
      <View
        style={[
          styles.toolBadge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            borderWidth: badgeRing,
            right: inset,
            bottom: inset,
          },
        ]}
      >
        <Ionicons name="construct" size={badgeIcon} color={Colors.white} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  toolBadge: {
    position: 'absolute',
    backgroundColor: Colors.secondary,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BuildUpLogo;
