import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';

const { height } = Dimensions.get('window');

type CustomerRole = 'contractor' | 'worker';

interface Props {
  onLogin: (role: CustomerRole) => void;
  onSignUp: (role: CustomerRole) => void;
  onAdminLogin: () => void;
}

const WelcomeScreen: React.FC<Props> = ({ onLogin, onSignUp, onAdminLogin }) => {
  const [selectedRole, setSelectedRole] = useState<CustomerRole>('contractor');

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.primary, Colors.primaryDark]}
        style={styles.topSection}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        <View style={styles.logoArea}>
          <View style={styles.logoIcon}>
            <Ionicons name="construct" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.logoText}>BuildUp</Text>
        </View>

        <View style={styles.features}>
          {[
            { icon: 'flash', text: 'מצא עובדים תוך דקות' },
            { icon: 'star', text: 'התאמה חכמה לפרויקט שלך' },
            { icon: 'shield-checkmark', text: 'משתמשים מאומתים על ידי המערכת' },
          ].map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Text style={styles.featureText}>{feature.text}</Text>
              <Ionicons
                name={feature.icon as any}
                size={20}
                color={Colors.primaryLight}
              />
            </View>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.bottomSection}>
        <Text style={styles.welcomeTitle}>ברוכים הבאים ל-BuildUp</Text>
        <Text style={styles.welcomeSubtitle}>
          הפלטפורמה החכמה לחיבור קבלנים עם עובדי בנייה מקצועיים
        </Text>

        <View style={styles.roleContainer}>
          <View style={styles.roleTitleRow}>
            <Text style={styles.roleTitle}>אני:</Text>
          </View>

          <View style={styles.roleOptions}>
            <TouchableOpacity
              style={[
                styles.roleCard,
                selectedRole === 'contractor' && styles.roleCardActive,
              ]}
              activeOpacity={0.8}
              onPress={() => setSelectedRole('contractor')}
            >
              <Ionicons
                name="business"
                size={28}
                color={
                  selectedRole === 'contractor'
                    ? Colors.primary
                    : Colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.roleLabel,
                  selectedRole === 'contractor' && styles.roleLabelActive,
                ]}
              >
                קבלן
              </Text>
              <Text style={styles.roleDesc}>מחפש עובדים לפרויקטים</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleCard,
                selectedRole === 'worker' && styles.roleCardActive,
              ]}
              activeOpacity={0.8}
              onPress={() => setSelectedRole('worker')}
            >
              <Ionicons
                name="hammer"
                size={28}
                color={
                  selectedRole === 'worker'
                    ? Colors.primary
                    : Colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.roleLabel,
                  selectedRole === 'worker' && styles.roleLabelActive,
                ]}
              >
                עובד
              </Text>
              <Text style={styles.roleDesc}>מחפש עבודות בבנייה</Text>
            </TouchableOpacity>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  topSection: {
    height: height * 0.44,
    paddingTop: 60,
    paddingHorizontal: Spacing.xxl,
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -80,
    left: -60,
  },
  decorCircle2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -40,
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
  featureText: {
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  bottomSection: {
    flex: 1,
    backgroundColor: Colors.white,
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
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  roleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaint,
  },
  roleLabel: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  roleLabelActive: { color: Colors.primary },
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
    fontWeight: '600',
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
