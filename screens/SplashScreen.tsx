import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  TouchableWithoutFeedback,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize } from '../theme/colors';
import BuildUpLogo from '../components/BuildUpLogo';

interface Props {
  onFinish: () => void;
}

// The ONE place splash timing lives: how long the splash stays up after its
// entrance animation settles, before navigating on. Was 1200ms — +2000ms so
// the richer motion has room to breathe.
const HOLD_AFTER_ENTRANCE_MS = 1200 + 2000;

const SplashScreen: React.FC<Props> = ({ onFinish }) => {
  const insets = useSafeAreaInsets();
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textShift = useRef(new Animated.Value(12)).current;

  const blob1 = useRef(new Animated.Value(0)).current;
  const blob2 = useRef(new Animated.Value(0)).current;
  const dots = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  const finishedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The hold timer is armed once (mount-only effect) but `onFinish` can change
  // on a later re-render (e.g. the navigator swapping the auth-bootstrap splash
  // for the real one). Keep a ref to the latest so `finish` never fires a
  // stale callback.
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    onFinishRef.current();
  };

  useEffect(() => {
    // --- Entrance: logo fades + scales up, then title/subtitle follow ---
    const entrance = Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 450,
          delay: 200,
          useNativeDriver: true,
        }),
        Animated.timing(textShift, {
          toValue: 0,
          duration: 450,
          delay: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);
    // Navigate only after the entrance settles — same structure as before,
    // just a longer hold. One timer, cleared on unmount / tap-to-skip.
    entrance.start(() => {
      timerRef.current = setTimeout(finish, HOLD_AFTER_ENTRANCE_MS);
    });

    // --- Looping ambient motion (native-driver transforms only) ---
    const blobLoop = (v: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    const a1 = blobLoop(blob1, 6000);
    const a2 = blobLoop(blob2, 8500);

    // --- Bottom dots: a gentle staggered pulse, no spinner ---
    const pulse = (v: Animated.Value) =>
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: 420,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0.3,
          duration: 420,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]);
    const dotsLoop = Animated.loop(
      Animated.stagger(160, dots.map((d) => pulse(d)))
    );

    a1.start();
    a2.start();
    dotsLoop.start();

    return () => {
      entrance.stop();
      a1.stop();
      a2.stop();
      dotsLoop.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blob1Style = {
    transform: [
      { translateX: blob1.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }) },
      { translateY: blob1.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
      { scale: blob1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) },
    ],
  };
  const blob2Style = {
    transform: [
      { translateX: blob2.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
      { translateY: blob2.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }) },
      { scale: blob2.interpolate({ inputRange: [0, 1], outputRange: [1.02, 0.98] }) },
    ],
  };

  return (
    <TouchableWithoutFeedback onPress={finish}>
      <LinearGradient
        // Vertical 3-zone blend, no visible banding: warm sand → brand brown
        // (the midpoint, unchanged) → the muted navy already used here. Extra
        // in-between stops + custom locations keep every transition soft.
        colors={[
          '#D8C3A0', // top — warm sand, present but not washed out
          '#B98F63', // caramel
          Colors.primary, // #9A7150 — BuildUp warm brown, held at the centre
          Colors.primaryDark, // #7A573C — deeper brown
          '#3C4152', // bridge — brown desaturating toward blue
          Colors.secondaryDark, // #152D4A — muted navy (already in the screen)
        ]}
        locations={[0, 0.18, 0.4, 0.6, 0.82, 1]}
        style={styles.container}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <Animated.View
          style={[styles.blob, styles.circle1, blob1Style]}
          pointerEvents="none"
        />
        <Animated.View
          style={[styles.blob, styles.circle2, blob2Style]}
          pointerEvents="none"
        />

        <Animated.View
          style={[
            styles.logoContainer,
            { transform: [{ scale: logoScale }], opacity: logoOpacity },
          ]}
        >
          <BuildUpLogo size={110} style={styles.iconWrapper} />
          <Text style={styles.appName}>BuildUp</Text>
          <Text style={styles.appNameHe}>בילד אפ</Text>
        </Animated.View>

        <Animated.Text
          style={[
            styles.tagline,
            { opacity: textOpacity, transform: [{ translateY: textShift }] },
          ]}
        >
          מחברים בין קבלנים לעובדים{'\n'}בתחום הבנייה
        </Animated.Text>

        <View
          style={[
            styles.footer,
            { bottom: Math.max(60, insets.bottom + 24) },
          ]}
        >
          <View style={styles.loadingDots}>
            {dots.map((d, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  {
                    opacity: d,
                    transform: [
                      {
                        scale: d.interpolate({
                          inputRange: [0.3, 1],
                          outputRange: [0.85, 1.15],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </LinearGradient>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    // top blob — soft translucent sand, tone-on-tone with the beige top
    backgroundColor: 'rgba(226,208,178,0.20)',
  },
  circle1: {
    width: 300,
    height: 300,
    top: -80,
    right: -80,
  },
  circle2: {
    width: 200,
    height: 200,
    bottom: 60,
    left: -60,
    // bottom blob — translucent navy/blue that melts into the lower gradient
    backgroundColor: 'rgba(46,91,150,0.22)',
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
    // `bottom` is applied inline from the safe-area inset so the loading
    // dots always clear the home indicator / Android navigation area.
    position: 'absolute',
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});

export default SplashScreen;
