import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import CityPickerField from '../components/CityPickerField';
import HorizontalChipPicker from '../components/HorizontalChipPicker';
import DocumentUploadField from '../components/DocumentUploadField';
import {
  AREAS_ISRAEL,
  PROFESSIONS_BY_CATEGORY,
  PROFESSION_CATEGORIES,
  PROJECT_TYPES,
} from '../data/mockData';
import {
  Certification,
  ContractorRegistrationData,
  ProfessionCategory,
  UploadedDocument,
  WorkerRegistrationData,
} from '../types';
import CertificationsField from '../components/CertificationsField';
import { isValidIsraeliPhone, normalizePhone } from '../utils/helpers';

type Role = 'worker' | 'contractor';

interface Props {
  role: Role;
  onRegistered: (registrationId: string) => void;
  onBack: () => void;
  onGoLogin: () => void;
}

const SignUpScreen: React.FC<Props> = ({
  role,
  onRegistered,
  onBack,
  onGoLogin,
}) => {
  const insets = useSafeAreaInsets();
  const { submitWorkerRegistration, submitContractorRegistration } = useApp();

  // Shared identity fields
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idDocument, setIdDocument] = useState<UploadedDocument | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('תל אביב');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [bio, setBio] = useState('');

  // Worker-only fields
  const [profCategory, setProfCategory] =
    useState<ProfessionCategory>('בנייה');
  const [professions, setProfessions] = useState<string[]>(['בנאי']);
  const [skills, setSkills] = useState('');               // comma separated
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [experienceYears, setExperienceYears] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [preferredAreas, setPreferredAreas] = useState<string[]>(['מרכז']);

  // Contractor-only fields
  const [companyName, setCompanyName] = useState('');
  const [contractorRegNumber, setContractorRegNumber] = useState('');
  const [areasOfOperation, setAreasOfOperation] = useState<string[]>(['מרכז']);
  const [projectTypes, setProjectTypes] = useState<string[]>(['מגורים']);
  const [licenseDetails, setLicenseDetails] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const profCategories = useMemo(
    () => PROFESSION_CATEGORIES.filter((c) => c !== 'כל המקצועות'),
    []
  );
  const professionChoices = PROFESSIONS_BY_CATEGORY[profCategory] ?? [];

  const togglePreferredArea = (a: string) => {
    setPreferredAreas((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  };
  const toggleProfession = (p: string) => {
    setProfessions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };
  const toggleProjectType = (t: string) => {
    setProjectTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };
  const toggleAreaOfOperation = (a: string) => {
    setAreasOfOperation((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!fullName.trim()) errs.push('שם מלא חובה');
    if (!idNumber.trim() || idNumber.trim().length < 5)
      errs.push('תעודת זהות חובה (לפחות 5 ספרות)');
    if (!idDocument) errs.push('יש לצרף צילום או קובץ של תעודת זהות');
    if (!phone.trim()) errs.push('מספר טלפון חובה');
    else if (!isValidIsraeliPhone(phone)) errs.push('מספר טלפון לא תקין');
    if (!email.trim() || !email.includes('@')) errs.push('כתובת אימייל לא תקינה');
    if (!city.trim()) errs.push('יש לבחור עיר');
    if (password.length < 4) errs.push('סיסמה חייבת לפחות 4 תווים');
    if (password !== confirmPwd) errs.push('הסיסמאות אינן תואמות');

    if (role === 'worker') {
      if (professions.length === 0) errs.push('יש לבחור לפחות מקצוע אחד');
      if (!experienceYears || isNaN(Number(experienceYears)))
        errs.push('שנות ניסיון חייב להיות מספר');
      if (!hourlyRate || isNaN(Number(hourlyRate)))
        errs.push('תעריף שעתי חייב להיות מספר');
      if (!dailyRate || isNaN(Number(dailyRate)))
        errs.push('תעריף יומי חייב להיות מספר');
      if (preferredAreas.length === 0)
        errs.push('יש לבחור לפחות אזור עבודה אחד');
    } else {
      if (!companyName.trim()) errs.push('שם החברה חובה');
      if (!contractorRegNumber.trim())
        errs.push('מספר רישום קבלנים חובה');
      if (!licenseDetails.trim()) errs.push('פרטי רישיון/סיווג חובה');
      if (areasOfOperation.length === 0)
        errs.push('יש לבחור לפחות אזור פעילות אחד');
      if (projectTypes.length === 0)
        errs.push('יש לבחור לפחות סוג פרויקט אחד');
    }
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    if (!idDocument) return; // validate() already guarantees this — narrows the type below
    setErrors([]);
    setSubmitting(true);

    setTimeout(() => {
      let registrationId: string;
      if (role === 'worker') {
        const data: WorkerRegistrationData = {
          fullName: fullName.trim(),
          idNumber: idNumber.trim(),
          idDocument,
          phone: normalizePhone(phone),
          email: email.trim(),
          city,
          password,
          profession: professions[0],
          professions,
          professionCategory: profCategory,
          skills: skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          certifications: certifications
            .map((c) => ({ ...c, name: c.name.trim() }))
            .filter((c) => c.name.length > 0),
          experienceYears: Number(experienceYears),
          preferredAreas,
          isAvailable,
          hourlyRate: Number(hourlyRate),
          dailyRate: Number(dailyRate),
          bio: bio.trim() || undefined,
        };
        registrationId = submitWorkerRegistration(data).id;
      } else {
        const data: ContractorRegistrationData = {
          fullName: fullName.trim(),
          companyName: companyName.trim(),
          idNumber: idNumber.trim(),
          idDocument,
          contractorRegistrationNumber: contractorRegNumber.trim(),
          phone: normalizePhone(phone),
          email: email.trim(),
          city,
          areasOfOperation,
          areaOfOperation: areasOfOperation[0],
          projectTypes,
          licenseDetails: licenseDetails.trim(),
          password,
          bio: bio.trim() || undefined,
        };
        registrationId = submitContractorRegistration(data).id;
      }
      setSubmitting(false);
      onRegistered(registrationId);
    }, 700);
  };

  const isWorker = role === 'worker';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-forward" size={26} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {isWorker ? 'הרשמה כעובד' : 'הרשמה כקבלן'}
          </Text>
        </View>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>
            מלא את כל הפרטים. הרישום יישלח לאישור מנהל המערכת לפני שתוכל
            להתחבר.
          </Text>
        </View>

        {/* Identity */}
        <Section title="פרטים אישיים">
          <Field
            label="שם מלא"
            value={fullName}
            onChange={setFullName}
            placeholder="לדוגמה: דניאל כהן"
            icon="person-outline"
          />
          <Field
            label="תעודת זהות"
            value={idNumber}
            onChange={setIdNumber}
            placeholder="9 ספרות"
            keyboardType="numeric"
            icon="card-outline"
          />
          <DocumentUploadField value={idDocument} onChange={setIdDocument} />
          <Field
            label="טלפון"
            value={phone}
            onChange={setPhone}
            placeholder="050-1234567"
            keyboardType="phone-pad"
            icon="call-outline"
          />
          <Field
            label="אימייל"
            value={email}
            onChange={setEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            icon="mail-outline"
          />
          <CityPickerField label="עיר מגורים" value={city} onChange={setCity} />
        </Section>

        {/* Role-specific */}
        {isWorker ? (
          <>
            <Section title="פרופיל מקצועי">
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>תחום מקצועי</Text>
                </View>
                <HorizontalChipPicker
                  options={profCategories}
                  value={profCategory}
                  onChange={(v) => {
                    setProfCategory(v as ProfessionCategory);
                    const list = PROFESSIONS_BY_CATEGORY[v] ?? [];
                    // keep only picks that still belong to the new category
                    setProfessions((prev) => {
                      const kept = prev.filter((p) => list.includes(p));
                      return kept.length > 0
                        ? kept
                        : list.length > 0
                        ? [list[0]]
                        : [];
                    });
                  }}
                  chipStyle={styles.chip}
                  chipActiveStyle={styles.chipActive}
                  textStyle={styles.chipText}
                  textActiveStyle={styles.chipTextActive}
                  activeOpacity={0.8}
                />
              </View>
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>מקצוע ספציפי (ניתן לבחור כמה)</Text>
                </View>
                <View style={styles.chipRow}>
                  {professionChoices.map((p) => {
                    const active = professions.includes(p);
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => toggleProfession(p)}
                        style={[styles.chip, active && styles.chipActive]}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {p}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <Field
                label="שנות ניסיון"
                value={experienceYears}
                onChange={setExperienceYears}
                placeholder="למשל 5"
                keyboardType="numeric"
                icon="time-outline"
              />
              <Field
                label="מיומנויות (מופרד בפסיקים)"
                value={skills}
                onChange={setSkills}
                placeholder="לוחות חשמל, תשתיות, חשמל ביתי"
                icon="construct-outline"
              />
              <CertificationsField
                value={certifications}
                onChange={setCertifications}
              />
            </Section>

            <Section title="זמינות ותעריפים">
              <Field
                label="תעריף שעתי (₪)"
                value={hourlyRate}
                onChange={setHourlyRate}
                placeholder="120"
                keyboardType="numeric"
                icon="cash-outline"
              />
              <Field
                label="תעריף יומי (₪)"
                value={dailyRate}
                onChange={setDailyRate}
                placeholder="800"
                keyboardType="numeric"
                icon="cash-outline"
              />

              <View style={styles.switchRow}>
                <Switch
                  value={isAvailable}
                  onValueChange={setIsAvailable}
                  trackColor={{
                    false: Colors.border,
                    true: Colors.primary,
                  }}
                />
                <Text style={styles.switchLabel}>זמין לעבודה החל מעכשיו</Text>
              </View>

              <Text style={styles.label}>אזורי עבודה מועדפים</Text>
              <View style={styles.chipRow}>
                {AREAS_ISRAEL.map((a) => {
                  const active = preferredAreas.includes(a);
                  return (
                    <TouchableOpacity
                      key={a}
                      onPress={() => togglePreferredArea(a)}
                      style={[styles.chip, active && styles.chipActive]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {a}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Section>
          </>
        ) : (
          <Section title="פרטי הקבלן">
            <Field
              label="שם החברה / שם עסק"
              value={companyName}
              onChange={setCompanyName}
              placeholder="לדוגמה: בנייה פרו בע״מ"
              icon="business-outline"
            />
            <Field
              label="מספר רישום קבלנים"
              value={contractorRegNumber}
              onChange={setContractorRegNumber}
              placeholder="למשל 101234"
              keyboardType="numeric"
              icon="document-text-outline"
            />
            <Field
              label="פרטי רישיון / סיווג"
              value={licenseDetails}
              onChange={setLicenseDetails}
              placeholder="ק100 – בניה 2 – עד 5 קומות"
              icon="shield-checkmark-outline"
            />
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>אזורי פעילות (ניתן לבחור כמה)</Text>
              </View>
              <View style={styles.chipRow}>
                {AREAS_ISRAEL.map((a) => {
                  const active = areasOfOperation.includes(a);
                  return (
                    <TouchableOpacity
                      key={a}
                      onPress={() => toggleAreaOfOperation(a)}
                      style={[styles.chip, active && styles.chipActive]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {a}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Text style={styles.label}>סוגי פרויקטים</Text>
            <View style={styles.chipRow}>
              {PROJECT_TYPES.map((t) => {
                const active = projectTypes.includes(t);
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => toggleProjectType(t)}
                    style={[styles.chip, active && styles.chipActive]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Section>
        )}

        <Section title="תיאור קצר">
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>אודות (אופציונלי)</Text>
            </View>
            <View style={[styles.inputWrapper, styles.textarea]}>
              <TextInput
                style={[styles.input, { minHeight: 80, paddingTop: 12 }]}
                value={bio}
                onChangeText={setBio}
                placeholder="ספר/י על עצמך בקצרה"
                placeholderTextColor={Colors.textMuted}
                multiline
              />
            </View>
          </View>
        </Section>

        <Section title="סיסמה">
          <Field
            label="סיסמה"
            value={password}
            onChange={setPassword}
            placeholder="לפחות 4 תווים"
            secure
            icon="lock-closed-outline"
          />
          <Field
            label="אימות סיסמה"
            value={confirmPwd}
            onChange={setConfirmPwd}
            placeholder="הקלד שוב"
            secure
            icon="lock-closed-outline"
          />
        </Section>

        {errors.length > 0 && (
          <View style={styles.errorBox}>
            {errors.map((e, i) => (
              <View key={i} style={styles.errorRow}>
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={Colors.danger}
                />
                <Text style={styles.errorText}>{e}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnLoading]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={submitting}
        >
          <Text style={styles.submitBtnText}>
            {submitting ? 'שולח לאישור...' : 'שלח לאישור מנהל המערכת'}
          </Text>
        </TouchableOpacity>

        <View style={styles.signupRow}>
          <Text style={styles.signupText}>כבר יש לך חשבון?</Text>
          <TouchableOpacity onPress={onGoLogin} activeOpacity={0.7}>
            <Text style={styles.signupLink}>התחבר</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ---------- subcomponents ----------

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
  secure?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

const Field: React.FC<FieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  secure = false,
  icon,
}) => (
  <View style={styles.inputGroup}>
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
    </View>
    <View style={styles.inputWrapper}>
      {icon && <Ionicons name={icon} size={18} color={Colors.textMuted} />}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboardType}
        secureTextEntry={secure}
        autoCapitalize="none"
      />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scroll: { paddingHorizontal: Spacing.xxl, paddingBottom: 60 },
  headerRow: { position: 'relative', minHeight: 32, marginBottom: Spacing.md },
  backBtn: { position: 'absolute', right: 0, padding: 4 },

  titleRow: { width: '100%', alignItems: 'flex-end' },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: Spacing.xs,
  },
  subtitleRow: { width: '100%', alignItems: 'flex-end' },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },

  section: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionHeader: { width: '100%', alignItems: 'flex-end', marginBottom: Spacing.sm },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  sectionBody: { gap: Spacing.md },

  inputGroup: { width: '100%', gap: 6 },
  labelRow: { width: '100%', alignItems: 'flex-end' },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  textarea: { alignItems: 'flex-start' },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    paddingVertical: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  chipRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.textMuted,
    backgroundColor: Colors.white,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaint,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  chipTextActive: { color: Colors.primary },

  switchRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
    writingDirection: 'rtl',
  },

  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: Colors.danger,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 6,
  },
  errorRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.danger,
    fontWeight: '600',
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.md,
    ...Shadow.medium,
  },
  submitBtnLoading: { opacity: 0.7 },
  submitBtnText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  signupRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.md,
  },
  signupText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  signupLink: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default SignUpScreen;
