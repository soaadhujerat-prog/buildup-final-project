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
import {
  ContractorRegistrationData,
  WorkerRegistrationData,
} from '../types';

interface Props {
  registrationId: string;
  onBackToWelcome: () => void;
}

const RegistrationPendingScreen: React.FC<Props> = ({
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
          <Ionicons name="hourglass-outline" size={56} color={Colors.warning} />
        </View>

        <Text style={styles.title}>הרישום נשלח לאישור</Text>
        <Text style={styles.subtitle}>
          הבקשה שלך התקבלה ונמצאת בבדיקת מנהל המערכת.{'\n'}
          תקבל הודעה בכתובת המייל שלך ברגע שהחשבון יאושר.
        </Text>

        <View style={styles.refBox}>
          <Text style={styles.refLabel}>מספר בקשה</Text>
          <Text style={styles.refValue}>{registrationId}</Text>
        </View>

        {reg && (
          <View style={styles.summaryBox}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryTitle}>פרטי הבקשה שהוגשה</Text>
            </View>

            <Row label="סוג רישום" value={reg.role === 'worker' ? 'עובד' : 'קבלן'} />
            <Row label="שם מלא" value={reg.data.fullName} />
            <Row label="תעודת זהות" value={reg.data.idNumber} ltr />
            <Row label="טלפון" value={reg.data.phone} ltr />
            <Row label="אימייל" value={reg.data.email} ltr />
            <Row label="עיר" value={reg.data.city} />

            {reg.role === 'worker' ? (
              <>
                <Row
                  label="מקצוע"
                  value={(reg.data as WorkerRegistrationData).profession}
                />
                <Row
                  label="ניסיון"
                  value={`${(reg.data as WorkerRegistrationData).experienceYears} שנים`}
                />
              </>
            ) : (
              <>
                <Row
                  label="חברה"
                  value={(reg.data as ContractorRegistrationData).companyName}
                />
                <Row
                  label="מספר רישום קבלנים"
                  value={
                    (reg.data as ContractorRegistrationData)
                      .contractorRegistrationNumber
                  }
                  ltr
                />
              </>
            )}

            <Row
              label="תאריך הגשה"
              value={new Date(reg.submittedAt).toLocaleString('he-IL')}
              ltr
            />
          </View>
        )}

        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle"
            size={20}
            color={Colors.secondary}
          />
          <Text style={styles.infoText}>
            עד לאישור, לא תוכל להתחבר. ניסיון התחברות במצב ממתין יוביל לעמוד
            סטטוס זה.
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

const Row: React.FC<{ label: string; value: string; ltr?: boolean }> = ({
  label,
  value,
  ltr,
}) => (
  <View style={styles.row}>
    <Text style={[styles.rowValue, ltr && { writingDirection: 'ltr' }]}>
      {value}
    </Text>
    <Text style={styles.rowLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scroll: { paddingHorizontal: Spacing.xxl, paddingBottom: 40 },

  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#FEF3C7',
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
    backgroundColor: Colors.primaryFaint,
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
    color: Colors.primary,
    fontWeight: '800',
    fontFamily: 'monospace',
  },

  summaryBox: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 8,
  },
  summaryHeader: { width: '100%', alignItems: 'flex-end', marginBottom: 4 },
  summaryTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
    gap: 6,
    paddingVertical: 6,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    flexShrink: 0,
  },
  rowValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
    writingDirection: 'rtl',
    flexShrink: 1,
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

export default RegistrationPendingScreen;
