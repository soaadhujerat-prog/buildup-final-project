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
import StatusBadge from '../components/StatusBadge';
import { Worker } from '../types';

interface Props {
  onBack: () => void;
  onOpenEdit: () => void;
  onOpenAvailability: () => void;
  onOpenSettings: () => void;
}

const WorkerProfessionalProfileScreen: React.FC<Props> = ({
  onBack,
  onOpenEdit,
  onOpenAvailability,
  onOpenSettings,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser } = useApp();
  const me = currentUser as Worker | undefined;

  if (!me || me.role !== 'worker') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>פרופיל לא זמין</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>הפרופיל המקצועי</Text>
        <TouchableOpacity onPress={onOpenSettings} style={styles.settingsBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="settings-outline" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroAvatar}>
            <Ionicons name="hammer" size={32} color={Colors.white} />
          </View>
          <Text style={styles.heroName}>{me.fullName}</Text>
          <Text style={styles.heroProfession}>
            {me.profession} · {me.experienceYears} שנות ניסיון
          </Text>
          <View style={styles.heroBadges}>
            <StatusBadge
              label={me.isAvailable ? 'זמין מיד' : 'לא זמין כעת'}
              tone={me.isAvailable ? 'success' : 'neutral'}
              small
            />
          </View>
        </View>

        {/* Rates */}
        <View style={styles.ratesCard}>
          <View style={styles.rateBlock}>
            <Text style={styles.rateValue}>{me.dailyRate}₪</Text>
            <Text style={styles.rateLabel}>תעריף יומי</Text>
          </View>
          <View style={styles.rateDivider} />
          <View style={styles.rateBlock}>
            <Text style={styles.rateValue}>{me.hourlyRate}₪</Text>
            <Text style={styles.rateLabel}>תעריף שעתי</Text>
          </View>
        </View>

        {/* Bio */}
        {me.bio && (
          <Section title="אודות">
            <Text style={styles.body}>{me.bio}</Text>
          </Section>
        )}

        {/* Profession info */}
        <Section title="פרטים מקצועיים">
          <FieldRow label="תחום" value={me.professionCategory} />
          <FieldRow label="מקצוע" value={me.profession} />
          <FieldRow
            label="שנות ניסיון"
            value={`${me.experienceYears} שנים`}
          />
          <FieldRow label="עיר" value={me.city} />
        </Section>

        {/* Availability */}
        <TouchableOpacity
          style={styles.availabilityRow}
          onPress={onOpenAvailability}
          activeOpacity={0.85}
        >
          <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.availabilityTitle}>ניהול זמינות</Text>
            <Text style={styles.availabilitySub}>
              {me.preferredAreas.length > 0
                ? `אזורי עבודה: ${me.preferredAreas.join(', ')}`
                : 'הגדר אזורי עבודה'}
            </Text>
          </View>
          <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>

        {/* Skills */}
        {me.skills.length > 0 && (
          <Section title="מיומנויות">
            <View style={styles.tagRow}>
              {me.skills.map((s) => (
                <View key={s} style={styles.tag}>
                  <Text style={styles.tagText}>{s}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Certifications */}
        {me.certifications.length > 0 && (
          <Section title="הסמכות ותעודות">
            {me.certifications.map((c) => (
              <View key={c} style={styles.certRow}>
                <Text style={styles.certText}>{c}</Text>
                <Ionicons
                  name="ribbon-outline"
                  size={18}
                  color={Colors.warning}
                />
              </View>
            ))}
          </Section>
        )}

        {/* Contact */}
        <Section title="פרטי קשר">
          <FieldRow label="ת.ז" value={me.idNumber} mono ltr />
          <FieldRow label="טלפון" value={me.phone} ltr />
          <FieldRow label="אימייל" value={me.email} ltr />
        </Section>

        <TouchableOpacity
          style={styles.editBtn}
          onPress={onOpenEdit}
          activeOpacity={0.85}
        >
          <Ionicons name="create-outline" size={18} color={Colors.primary} />
          <Text style={styles.editBtnText}>ערוך פרופיל</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

// ---------- subcomponents ----------

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const FieldRow: React.FC<{
  label: string;
  value: string;
  mono?: boolean;
  ltr?: boolean;
}> = ({ label, value, mono, ltr }) => (
  <View style={styles.fRow}>
    <Text
      style={[
        styles.fValue,
        mono && { fontFamily: 'monospace' },
        ltr && { writingDirection: 'ltr' },
      ]}
    >
      {value}
    </Text>
    <Text style={styles.fLabel}>{label}</Text>
  </View>
);

// ---------- styles ----------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headerBar: {
    position: 'relative',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    position: 'absolute',
    right: Spacing.lg,
    top: Spacing.md,
    padding: 4,
  },
  settingsBtn: {
    position: 'absolute',
    left: Spacing.lg,
    top: Spacing.md,
    padding: 4,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  notFound: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 60,
  },
  backLink: { alignItems: 'center', marginTop: 12 },
  backLinkText: { color: Colors.primary, fontWeight: '700' },

  heroCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    alignItems: 'center',
    gap: 4,
    ...Shadow.medium,
  },
  heroAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  heroName: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  heroProfession: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  heroBadges: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },

  ratesCard: {
    flexDirection: 'row-reverse',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  rateBlock: { flex: 1, alignItems: 'center' },
  rateDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  rateValue: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.primary,
  },
  rateLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
    writingDirection: 'rtl',
  },

  section: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  sectionHead: { width: '100%', alignItems: 'flex-end', marginBottom: 8 },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  sectionBody: { gap: 6, alignItems: 'flex-end', width: '100%' },

  body: {
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
  },

  fRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
    gap: 6,
    paddingVertical: 6,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    flexShrink: 0,
  },
  fValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  availabilityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  availabilityTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  availabilitySub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },

  tagRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
  },
  tagText: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  certRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: Radius.sm,
  },
  certText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
    writingDirection: 'rtl',
    textAlign: 'right',
    flex: 1,
  },

  editBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  editBtnText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default WorkerProfessionalProfileScreen;
