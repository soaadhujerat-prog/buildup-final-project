import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import BuildUpLogo from '../components/BuildUpLogo';

const { height } = Dimensions.get('window');

type CustomerRole = 'contractor' | 'worker';

interface Props {
  onLogin: (role: CustomerRole) => void;
  onSignUp: (role: CustomerRole) => void;
  onAdminLogin: () => void;
}

// Neutral value props — each one reads the same whether you're a contractor or
// a worker. Icons are from the construction world (Ionicons — already used
// across the app).
const VALUE_PROPS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'people-outline', text: 'מחברים בין קבלנים רשומים לעובדי בנייה מקצועיים' },
  { icon: 'briefcase-outline', text: 'מנהלים עבודה, שיבוצים ותקשורת במקום אחד' },
  { icon: 'ribbon-outline', text: 'בונים שיתופי פעולה מקצועיים לאורך זמן' },
];

const WelcomeScreen: React.FC<Props> = ({ onLogin, onSignUp, onAdminLogin }) => {
  const [selectedRole, setSelectedRole] = useState<CustomerRole>('contractor');

  // Two slow, gentle background blobs. Native-driver only (transform), looped,
  // and stopped on unmount so nothing keeps running after the screen is gone.
  const blob1 = useRef(new Animated.Value(0)).current;
  const blob2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (v: Animated.Value, duration: number) =>
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
    const a1 = loop(blob1, 6500);
    const a2 = loop(blob2, 9000);
    a1.start();
    a2.start();
    return () => {
      a1.stop();
      a2.stop();
    };
  }, [blob1, blob2]);

  const blob1Style = {
    transform: [
      { translateX: blob1.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) },
      { translateY: blob1.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) },
      { scale: blob1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) },
    ],
  };
  const blob2Style = {
    transform: [
      { translateX: blob2.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) },
      { translateY: blob2.interpolate({ inputRange: [0, 1], outputRange: [0, 10] }) },
      { scale: blob2.interpolate({ inputRange: [0, 1], outputRange: [1.02, 0.98] }) },
    ],
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.primary, Colors.primaryDark, Colors.secondaryDark]}
        style={styles.topSection}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Animated.View
          style={[styles.blob, styles.blobLight, blob1Style]}
          pointerEvents="none"
        />
        <Animated.View
          style={[styles.blob, styles.blobNavy, blob2Style]}
          pointerEvents="none"
        />

        <View style={styles.logoArea}>
          <BuildUpLogo size={52} style={styles.logoIcon} />
          <Text style={styles.logoText}>BuildUp</Text>
        </View>

        <View style={styles.features}>
          {VALUE_PROPS.map((feature) => (
            <View key={feature.text} style={styles.featureRow}>
              <Text style={styles.featureText}>{feature.text}</Text>
              <View style={styles.featureIconWrap}>
                <Ionicons
                  name={feature.icon}
                  size={18}
                  color={Colors.white}
                />
              </View>
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.bottomSection}>
        <Text style={styles.welcomeTitle}>ברוכים הבאים ל-BuildUp</Text>
        <Text style={styles.welcomeSubtitle}>
          הפלטפורמה לניהול עבודה, שיבוצים ותקשורת בין אנשי מקצוע בענף הבנייה
        </Text>

        <View style={styles.roleContainer}>
          <View style={styles.roleTitleRow}>
            <Text style={styles.roleTitle}>אני:</Text>
          </View>

          <View style={styles.roleOptions}>
            <RoleCard
              active={selectedRole === 'contractor'}
              accent={Colors.secondary}
              accentFaint={Colors.adminPrimaryFaint}
              icon="business"
              label="קבלן"
              desc="מפרסם משרות ומנהל צוותים"
              onPress={() => setSelectedRole('contractor')}
            />
            <RoleCard
              active={selectedRole === 'worker'}
              accent={Colors.primary}
              accentFaint={Colors.primaryFaint}
              icon="hammer"
              label="עובד"
              desc="מוצא עבודות ומנהל שיבוצים"
              onPress={() => setSelectedRole('worker')}
            />
          </View>
        </View>

        <TouchableOpacity
          style={styles.signUpBtn}
          onPress={() => onSignUp(selectedRole)}
          activeOpacity={0.85}
        >
          <Text style={styles.signUpText}>הרשמה חינמית</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => onLogin(selectedRole)}
          activeOpacity={0.85}
        >
          <Text style={styles.loginText}>יש לי חשבון — כניסה</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.adminLink}
          onPress={onAdminLogin}
          activeOpacity={0.7}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={14}
            color={Colors.textSecondary}
          />
          <Text style={styles.adminLinkText}>כניסת מנהל מערכת</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const RoleCard: React.FC<{
  active: boolean;
  accent: string;
  accentFaint: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  desc: string;
  onPress: () => void;
}> = ({ active, accent, accentFaint, icon, label, desc, onPress }) => (
  <TouchableOpacity
    style={[
      styles.roleCard,
      { borderColor: active ? accent : Colors.border },
      active && { backgroundColor: accentFaint },
    ]}
    activeOpacity={0.85}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
  >
    <View
      style={[
        styles.roleIconWrap,
        { backgroundColor: active ? accent : Colors.gray100 },
      ]}
    >
      <Ionicons name={icon} size={24} color={active ? Colors.white : Colors.textSecondary} />
    </View>
    <Text style={[styles.roleLabel, active && { color: accent }]}>{label}</Text>
    <Text style={styles.roleDesc}>{desc}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topSection: {
    height: height * 0.44,
    paddingTop: 60,
    paddingHorizontal: Spacing.xxl,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobLight: {
    width: 260,
    height: 260,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -90,
    left: -70,
  },
  blobNavy: {
    width: 180,
    height: 180,
    backgroundColor: 'rgba(30,58,95,0.28)',
    bottom: -50,
    right: -30,
  },
  logoArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xxxl,
    alignSelf: 'flex-start',
  },
  logoIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.small,
  },
  logoText: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.white,
  },
  features: {
    width: '100%',
    gap: Spacing.lg,
    alignItems: 'flex-end',
  },
  featureRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
  },
  featureIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  bottomSection: {
    flex: 1,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    padding: Spacing.xxl,
    paddingTop: Spacing.xl,
  },
  welcomeTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: Spacing.sm,
  },
  welcomeSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  roleContainer: {
    width: '100%',
    marginBottom: Spacing.lg,
  },
  roleTitleRow: {
    width: '100%',
    alignItems: 'flex-end',
    marginBottom: Spacing.sm,
  },
  roleTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  roleOptions: {
    flexDirection: 'row-reverse',
    gap: Spacing.sm,
  },
  roleCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    ...Shadow.small,
  },
  roleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  roleLabel: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  roleDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 3,
  },
  signUpBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: Spacing.md,
    ...Shadow.medium,
  },
  signUpText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  loginBtn: {
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  loginText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  adminLink: {
    alignSelf: 'center',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  adminLinkText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '500',
    writingDirection: 'rtl',
  },
});

export default WelcomeScreen;
