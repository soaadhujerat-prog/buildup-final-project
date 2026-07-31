import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize } from '../theme/colors';

const { width, height } = Dimensions.get('window');

interface Props {
  onFinish: () => void;
}

const SplashScreen: React.FC<Props> = ({ onFinish }) => {
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const taglineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(taglineAnim, {
        toValue: 1,
        duration: 400,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(onFinish, 1200);
    });
  }, []);

  return (
    <LinearGradient
      colors={[Colors.primary, Colors.primaryDark, Colors.secondary]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Background decoration */}
      <View style={styles.circle1} />
      <View style={styles.circle2} />

      <Animated.View
        style={[
          styles.logoContainer,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <View style={styles.iconWrapper}>
          <Ionicons name="construct" size={56} color={Colors.primary} />
        </View>
        <Text style={styles.appName}>BuildUp</Text>
        <Text style={styles.appNameHe}>בילד אפ</Text>
      </Animated.View>

      <Animated.Text
        style={[
          styles.tagline,
          {
            opacity: taglineAnim,
            transform: [
              {
                translateY: taglineAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ],
          },
        ]}
      >
        מחברים בין קבלנים לעובדים{'\n'}בתחום הבנייה
      </Animated.Text>

      <View style={styles.footer}>
        <View style={styles.loadingDots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.dot} />
          ))}
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: -80,
    right: -80,
  },
  circle2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: 60,
    left: -60,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconWrapper: {
    width: 110,
    height: 110,
    borderRadius: 28,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  appName: {
    fontSize: 42,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 1,
  },
  appNameHe: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    marginTop: 4,
  },
  tagline: {
    fontSize: FontSize.lg,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 28,
    paddingHorizontal: 40,
  },
  footer: {
    position: 'absolute',
    bottom: 60,
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
});

export default SplashScreen;
