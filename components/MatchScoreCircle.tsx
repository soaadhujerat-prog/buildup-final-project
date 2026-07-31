import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, FontSize } from '../theme/colors';
import { getMatchColor, getMatchLabel } from '../utils/helpers';

interface MatchScoreCircleProps {
  score: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  animated?: boolean;
}

const SIZES = {
  small: { container: 56, fontSize: FontSize.md, labelSize: FontSize.xs },
  medium: { container: 80, fontSize: FontSize.xl, labelSize: FontSize.sm },
  large: { container: 110, fontSize: FontSize.xxxl, labelSize: FontSize.md },
};

const MatchScoreCircle: React.FC<MatchScoreCircleProps> = ({
  score,
  size = 'medium',
  showLabel = false,
  animated = true,
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const color = getMatchColor(score);
  const label = getMatchLabel(score);
  const dim = SIZES[size];

  useEffect(() => {
    if (animated) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(1);
      opacityAnim.setValue(1);
    }
  }, [score]);

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.circle,
          {
            width: dim.container,
            height: dim.container,
            borderRadius: dim.container / 2,
            borderColor: color,
            backgroundColor: color + '15',
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <View style={styles.scoreRow}>
          <Text style={[styles.score, { color, fontSize: dim.fontSize }]}>
            {score}
          </Text>
          <Text
            style={[
              styles.percent,
              { color, fontSize: dim.fontSize * 0.42 },
            ]}
          >
            %
          </Text>
        </View>
      </Animated.View>

      {showLabel && (
        <Animated.Text
          style={[
            styles.label,
            { color, fontSize: dim.labelSize, opacity: opacityAnim },
          ]}
        >
          {label}
        </Animated.Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 6,
  },
  circle: {
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  score: {
    fontWeight: '800',
    lineHeight: undefined,
  },
  percent: {
    fontWeight: '700',
    marginBottom: 4,
  },
  label: {
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

export default MatchScoreCircle;