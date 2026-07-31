import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';

interface Props {
  /** May be either a customer id (approved-then-blocked) or a registration id. */
  userOrRegistrationId: string;
  onBackToWelcome: () => void;
  onContactSupport?: () => void;
}

const BlockedAccountScreen: React.FC<Props> = ({
  userOrRegistrationId,
  onBackToWelcome,
  onContactSupport,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="ban-outline" size={56} color={Colors.danger} />
        </View>

        <Text style={styles.title}>החשבון שלך חסום</Text>
        <Text style={styles.subtitle}>
          הגישה לחשבון נחסמה על ידי מנהל המערכת.{'\n'}
          לא ניתן להתחבר עד לבירור מול תמיכה.
        </Text>

        <View style={styles.refBox}>
          <Text style={styles.refLabel}>מזהה</Text>
          <Text style={styles.refValue}>{userOrRegistrationId}</Text>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color={Colors.secondary} />
          <Text style={styles.infoText}>
            אם נחסמת בטעות או יש לך מידע לבירור, ניתן לפתוח פנייה לתמיכה.
            צוות המערכת יבחן ויחזור אליך.
          </Text>
        </View>

        {onContactSupport && (
          <TouchableOpacity
            style={styles.secondaryCta}
            onPress={onContactSupport}
            activeOpacity={0.85}
          >
            <Ionicons
              name="help-buoy-outline"
              size={20}
              color={Colors.primary}
            />
            <Text style={styles.secondaryCtaText}>פתיחת פנייה לתמיכה</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.cta}
          onPress={onBackToWelcome}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>חזרה למסך הבית</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scroll: { paddingHorizontal: Spacing.xxl, paddingBottom: 40 },

  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#FEE2E2',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },

  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },

  refBox: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  refLabel: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
    writingDirection: 'rtl',
  },
  refValue: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
  },

  infoBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: '#EFF6FF',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  infoText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.secondary,
    lineHeight: 20,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  secondaryCta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 14,
    marginBottom: Spacing.md,
  },
  secondaryCtaText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  cta: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    ...Shadow.medium,
  },
  ctaText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default BlockedAccountScreen;
