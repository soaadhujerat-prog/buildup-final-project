import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { Contractor } from '../types';

interface Props {
  onBack: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

const ContractorProfileScreen: React.FC<Props> = ({
  onBack,
  onOpenSettings,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser } = useApp();
  const me = currentUser as Contractor | undefined;

  if (!me || me.role !== 'contractor') {
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
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>הפרופיל שלי</Text>
        <TouchableOpacity onPress={onOpenSettings} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroAvatar}>
            <Ionicons name="business" size={32} color={Colors.white} />
          </View>
          <Text style={styles.heroName}>{me.fullName}</Text>
          <Text style={styles.heroCompany}>{me.companyName}</Text>
        </View>

        {/* Company details */}
        <Section title="פרטי החברה">
          <FieldRow label="שם החברה" value={me.companyName} />
          <FieldRow
            label="מספר רישום קבלנים"
            value={me.contractorRegistrationNumber}
            mono
          />
          <FieldRow label="פרטי רישיון" value={me.licenseDetails} />
          <FieldRow label="עיר" value={me.city} />
          <FieldRow label="אזור פעילות" value={me.areaOfOperation} />
        </Section>

        {/* Project types */}
        <Section title="סוגי פרויקטים">
          <View style={styles.tagRow}>
            {me.projectTypes.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* Contact */}
        <Section title="פרטי קשר">
          <FieldRow label="תעודת זהות" value={me.idNumber} mono />
          <FieldRow label="טלפון" value={me.phone} />
          <FieldRow label="אימייל" value={me.email} />
        </Section>

        {/* Bio */}
        {me.bio && (
          <Section title="אודות">
            <Text style={styles.body}>{me.bio}</Text>
          </Section>
        )}

        <TouchableOpacity
          style={styles.editBtn}
          onPress={() =>
            Alert.alert(
              'עריכת פרופיל',
              'עריכת פרופיל מלאה תהיה זמינה בשלב הבא של הפיתוח. בינתיים ניתן לעדכן פרטים דרך הגדרות.'
            )
          }
          activeOpacity={0.85}
        >
          <Ionicons
            name="create-outline"
            size={18}
            color={Colors.primary}
          />
          <Text style={styles.editBtnText}>ערוך פרופיל</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={onLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
          <Text style={styles.logoutBtnText}>התנתק</Text>
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

const FieldRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <View style={styles.fRow}>
    <Text style={[styles.fValue, mono && { fontFamily: 'monospace' }]}>
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
    backgroundColor: Colors.secondary,
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
  heroCompany: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  heroBadges: { marginTop: 8 },
  ratingChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: Radius.full,
  },
  ratingText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '700',
  },
  noReviews: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  statsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statChip: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'flex-end',
    gap: 4,
    ...Shadow.small,
  },
  statValue: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.text,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
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
  sectionBody: { gap: 6 },

  fRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  fValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
    flex: 1,
    textAlign: 'left',
    writingDirection: 'rtl',
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

  body: {
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
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
  logoutBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.md,
    paddingVertical: 14,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    backgroundColor: Colors.white,
  },
  logoutBtnText: {
    color: Colors.danger,
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default ContractorProfileScreen;
