import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';

interface Props {
  registrationId: string;
  onBackToWelcome: () => void;
}

const RegistrationRejectedScreen: React.FC<Props> = ({
  registrationId,
  onBackToWelcome,
}) => {
  const insets = useSafeAreaInsets();
  const { getRegistration } = useApp();
  const reg = getRegistration(registrationId);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="close-circle-outline" size={56} color={Colors.danger} />
        </View>

        <Text style={styles.title}>הרישום נדחה</Text>
        <Text style={styles.subtitle}>
          לאחר בדיקת הבקשה שלך, מנהל המערכת החליט לדחות את הרישום.
        </Text>

        <View style={styles.reasonBox}>
          <View style={styles.reasonHeader}>
            <Text style={styles.reasonTitle}>סיבת הדחייה</Text>
          </View>
          <Text style={styles.reasonText}>
            {reg?.rejectionReason ?? 'הסיבה לא צוינה.'}
          </Text>

          {reg?.processedAt && (
            <Text style={styles.reasonMeta}>
              נדחה ב-
              <Text style={{ writingDirection: 'ltr' }}>
                {new Date(reg.processedAt).toLocaleString('he-IL')}
              </Text>
            </Text>
          )}
        </View>

        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle"
            size={20}
            color={Colors.secondary}
          />
          <Text style={styles.infoText}>
            אם לדעתך מדובר בטעות, אפשר לפתוח פנייה לתמיכה לאחר חזרה למסך הבית
            ובחירת "צור קשר".
          </Text>
        </View>

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

  reasonBox: {
    backgroundColor: '#FEF2F2',
    borderColor: Colors.danger,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: 6,
  },
  reasonHeader: { width: '100%', alignItems: 'flex-end' },
  reasonTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.danger,
    writingDirection: 'rtl',
  },
  reasonText: {
    fontSize: FontSize.md,
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
    lineHeight: 22,
  },
  reasonMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
    textAlign: 'right',
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

export default RegistrationRejectedScreen;
