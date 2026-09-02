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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import CityPickerField from '../components/CityPickerField';
import HorizontalChipPicker from '../components/HorizontalChipPicker';
import DocumentUploadField from '../components/DocumentUploadField';
import DatePickerField from '../components/DatePickerField';
import { PROFESSIONS_BY_CATEGORY, PROFESSION_CATEGORIES } from '../data/professions';
import { AREAS_ISRAEL, PROJECT_TYPES } from '../data/areas';
import {
  Certification,
  ContractorRegistrationData,
  ProfessionCategory,
  UploadedDocument,
  WorkerRegistrationData,
} from '../types';
import CertificationsField from '../components/CertificationsField';
import {
  isValidIsraeliPhone,
  normalizePhone,
  dmyToIso,
  isValidIsraeliIdFormat,
  isValidEmail,
} from '../utils/helpers';
import {
  isPasswordValid,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULE_TEXT,
} from '../utils/passwordPolicy';
import PasswordChecklist from '../components/PasswordChecklist';
import { RegistrationError } from '../services/registrationService';

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
  // Contractor licence / certificate document — a separate document from the
  // ID card and the company logo. Required.
  const [licenseDocument, setLicenseDocument] =
    useState<UploadedDocument | null>(null);
  // "בתוקף עד" as printed on the licence document (DD/MM/YYYY). Required.
  const [licenseValidUntil, setLicenseValidUntil] = useState('');

  const [submitting, setSubmitting] = useState(false);
  // Per-field errors, DERIVED from the current values after the first submit
  // attempt — an error clears as soon as its field becomes valid, and a valid
  // field never shows one. Keys match the field identifiers below.
  const [submitAttempted, setSubmitAttempted] = useState(false);

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

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};

    const nameT = fullName.trim();
    if (!nameT) e.fullName = 'שם מלא חובה';
    else if (nameT.length < 2) e.fullName = 'השם קצר מדי';
    else if (/^\d+$/.test(nameT)) e.fullName = 'שם לא יכול להיות מספרים בלבד';

    if (!idNumber.trim()) e.idNumber = 'תעודת זהות חובה';
    else if (!isValidIsraeliIdFormat(idNumber))
      e.idNumber = 'תעודת זהות חייבת להכיל בדיוק 9 ספרות';

    if (!idDocument) e.idDocument = 'יש לצרף צילום או קובץ של תעודת זהות';

    if (!phone.trim()) e.phone = 'מספר טלפון חובה';
    else if (!isValidIsraeliPhone(phone))
      e.phone = 'מספר טלפון ישראלי לא תקין';

    if (!email.trim()) e.email = 'כתובת אימייל חובה';
    else if (!isValidEmail(email)) e.email = 'כתובת אימייל לא תקינה';

    if (!city.trim()) e.city = 'יש לבחור עיר';

    if (!isPasswordValid(password)) e.password = PASSWORD_RULE_TEXT;
    if (!confirmPwd) e.confirmPwd = 'יש לאמת את הסיסמה';
    else if (password !== confirmPwd) e.confirmPwd = 'הסיסמאות אינן תואמות';

    if (role === 'worker') {
      if (professions.length === 0)
        e.professions = 'יש לבחור לפחות מקצוע אחד';

      const exp = Number(experienceYears);
      if (!experienceYears.trim())
        e.experienceYears = 'שנות ניסיון חובה';
      else if (isNaN(exp) || !Number.isInteger(exp) || exp < 0)
        e.experienceYears = 'שנות ניסיון חייב להיות מספר שלם';
      else if (exp > 70) e.experienceYears = 'הערך שהוזן גבוה מדי';

      const hr = Number(hourlyRate);
      if (!hourlyRate.trim()) e.hourlyRate = 'תעריף שעתי חובה';
      else if (isNaN(hr) || hr <= 0)
        e.hourlyRate = 'תעריף שעתי חייב להיות מספר גדול מ-0';

      const dr = Number(dailyRate);
      if (!dailyRate.trim()) e.dailyRate = 'תעריף יומי חובה';
      else if (isNaN(dr) || dr <= 0)
        e.dailyRate = 'תעריף יומי חייב להיות מספר גדול מ-0';

      if (preferredAreas.length === 0)
        e.preferredAreas = 'יש לבחור לפחות אזור עבודה אחד';
    } else {
      const companyT = companyName.trim();
      if (!companyT) e.companyName = 'שם החברה חובה';
      else if (companyT.length < 2) e.companyName = 'שם החברה קצר מדי';

      // Format-only: digits, non-empty. We have no authorised source that
      // proves a real contractor-registry number's length/checksum, so the
      // message never claims one. Real verification is a future backend step.
      if (!contractorRegNumber.trim())
        e.contractorRegNumber = 'יש להזין מספר רישום קבלן';
      else if (!/^\d+$/.test(contractorRegNumber.trim()))
        e.contractorRegNumber = 'יש להזין מספר רישום קבלן תקין';

      const licT = licenseDetails.trim();
      if (!licT) e.licenseDetails = 'פרטי רישיון / סיווג חובה';
      else if (licT.length < 3) e.licenseDetails = 'יש לפרט את הסיווג';

      if (!licenseDocument)
        e.licenseDocument = 'יש לצרף רישיון קבלן / תעודת קבלן';

      if (!licenseValidUntil.trim())
        e.licenseValidUntil = 'יש להזין את תאריך התוקף של הרישיון';
      else if (!dmyToIso(licenseValidUntil))
        e.licenseValidUntil = 'תאריך תוקף הרישיון אינו תקין';

      if (areasOfOperation.length === 0)
        e.areasOfOperation = 'יש לבחור לפחות אזור פעילות אחד';
      if (projectTypes.length === 0)
        e.projectTypes = 'יש לבחור לפחות סוג פרויקט אחד';
    }
    return e;
  };

  const errors: Record<string, string> = submitAttempted ? validate() : {};

  // Live password feedback — always on, independent of submitAttempted.
  const pwValid = isPasswordValid(password);
  const pwMismatch = confirmPwd.length > 0 && confirmPwd !== password;
  const canSubmit = !submitting && pwValid && password === confirmPwd;

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    const errs = validate();
    if (Object.keys(errs).length > 0) return;
    if (!idDocument) return; // validate() already guarantees this — narrows the type below
    setSubmitting(true);

    try {
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
        registrationId = (await submitWorkerRegistration(data)).id;
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
          licenseDocument: licenseDocument ?? undefined,
          licenseValidUntil: dmyToIso(licenseValidUntil) ?? undefined,
          password,
          bio: bio.trim() || undefined,
        };
        registrationId = (await submitContractorRegistration(data)).id;
      }
      onRegistered(registrationId);
    } catch (e) {
      // Backend enabled and the sign-up genuinely failed — real error, no
      // silent fallback. Errors are deliberately generic (no field-level leak).
      const code = e instanceof RegistrationError ? e.code : 'server';
      Alert.alert(
        'ההרשמה נכשלה',
        code === 'weak_password'
          ? PASSWORD_RULE_TEXT
          : code === 'invalid'
          ? 'חלק מהפרטים שהוזנו אינם תקינים. בדוק/י ונסה/י שוב.'
          : code === 'unavailable'
          ? 'לא ניתן להשלים את ההרשמה עם הפרטים האלה. ייתכן שחלקם כבר קיימים במערכת.'
          : code === 'id_upload_failed' ||
            code === 'id_document_missing' ||
            code === 'unsupported_type' ||
            code === 'too_large'
          ? 'העלאת צילום תעודת הזהות נכשלה. ודא/י שהקובץ תקין (תמונה או PDF, עד 10MB) ונסה/י שוב.'
          : 'אירעה שגיאה בשליחת ההרשמה. בדוק/י את החיבור לאינטרנט ונסה/י שוב.'
      );
    } finally {
      setSubmitting(false);
    }
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
            error={errors.fullName}
          />
          <Field
            label="תעודת זהות"
            value={idNumber}
            onChange={(v) => setIdNumber(v.replace(/\D/g, '').slice(0, 9))}
            placeholder="9 ספרות"
            keyboardType="numeric"
            icon="card-outline"
            error={errors.idNumber}
          />
          <View style={styles.inputGroup}>
            <DocumentUploadField value={idDocument} onChange={setIdDocument} />
            {!!errors.idDocument && (
              <Text style={styles.fieldErrorText}>{errors.idDocument}</Text>
            )}
          </View>
          <Field
            label="טלפון"
            value={phone}
            onChange={setPhone}
            placeholder="050-1234567"
            keyboardType="phone-pad"
            icon="call-outline"
            error={errors.phone}
          />
          <Field
            label="אימייל"
            value={email}
            onChange={setEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            icon="mail-outline"
            error={errors.email}
          />
          <CityPickerField
            label="עיר מגורים"
            value={city}
            onChange={setCity}
            error={errors.city}
          />
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
                {!!errors.professions && (
                  <Text style={styles.chipGroupError}>{errors.professions}</Text>
                )}
              </View>
              <Field
                label="שנות ניסיון"
                value={experienceYears}
                onChange={(v) =>
                  setExperienceYears(v.replace(/\D/g, '').slice(0, 2))
                }
                placeholder="למשל 5"
                keyboardType="numeric"
                icon="time-outline"
                error={errors.experienceYears}
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
                onChange={(v) => setHourlyRate(v.replace(/\D/g, '').slice(0, 5))}
                placeholder="120"
                keyboardType="numeric"
                icon="cash-outline"
                error={errors.hourlyRate}
              />
              <Field
                label="תעריף יומי (₪)"
                value={dailyRate}
                onChange={(v) => setDailyRate(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="800"
                keyboardType="numeric"
                icon="cash-outline"
                error={errors.dailyRate}
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
              {!!errors.preferredAreas && (
                <Text style={styles.chipGroupError}>
                  {errors.preferredAreas}
                </Text>
              )}
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
              error={errors.companyName}
            />
            <Field
              label="מספר רישום קבלנים"
              value={contractorRegNumber}
              onChange={(v) =>
                setContractorRegNumber(v.replace(/\D/g, '').slice(0, 10))
              }
              placeholder="למשל 101234"
              keyboardType="numeric"
              icon="document-text-outline"
              error={errors.contractorRegNumber}
            />
            <Field
              label="פרטי רישיון / סיווג"
              value={licenseDetails}
              onChange={setLicenseDetails}
              placeholder="ק100 – בניה 2 – עד 5 קומות"
              icon="shield-checkmark-outline"
              error={errors.licenseDetails}
            />
            <View style={styles.inputGroup}>
              <DocumentUploadField
                value={licenseDocument}
                onChange={setLicenseDocument}
                label="רישיון קבלן / תעודת קבלן"
                documentType="contractor_license"
                sheetTitle="הוספת רישיון קבלן"
                emptyHint="צילום, גלריה או קובץ PDF של רישיון הקבלן"
              />
              {!!errors.licenseDocument && (
                <Text style={styles.fieldErrorText}>
                  {errors.licenseDocument}
                </Text>
              )}
            </View>
            <DatePickerField
              label="הרישיון בתוקף עד"
              value={licenseValidUntil}
              onChange={setLicenseValidUntil}
              minimumDate={new Date()}
              error={errors.licenseValidUntil}
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
              {!!errors.areasOfOperation && (
                <Text style={styles.chipGroupError}>
                  {errors.areasOfOperation}
                </Text>
              )}
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
            {!!errors.projectTypes && (
              <Text style={styles.chipGroupError}>{errors.projectTypes}</Text>
            )}
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
          <Text style={styles.passwordRule}>{PASSWORD_RULE_TEXT}</Text>
          <Field
            label="סיסמה"
            value={password}
            onChange={setPassword}
            placeholder={`לפחות ${PASSWORD_MIN_LENGTH} תווים`}
            secure
            icon="lock-closed-outline"
          />
          <PasswordChecklist value={password} />
          <Field
            label="אימות סיסמה"
            value={confirmPwd}
            onChange={setConfirmPwd}
            placeholder="הקלד שוב"
            secure
            icon="lock-closed-outline"
            error={pwMismatch ? 'הסיסמאות אינן תואמות' : errors.confirmPwd}
          />
        </Section>

        {Object.keys(errors).length > 0 && (
          <View style={styles.errorBox}>
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={Colors.danger} />
              <Text style={styles.errorText}>
                יש שדות שדורשים תיקון — ראה/י את ההודעות המסומנות למעלה.
              </Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.submitBtn,
            (submitting || !canSubmit) && styles.submitBtnLoading,
          ]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={!canSubmit}
        >
          <Text style={styles.submitBtnText}>
            {submitting ? 'שולח לאישור...' : 'שלח לאישור מנהל המערכת'}
          </Text>
        </TouchableOpacity>
        {!pwValid ? (
          <Text style={styles.submitHint}>
            כדי להמשיך, יש להשלים את דרישות הסיסמה שמסומנות למעלה.
          </Text>
        ) : password !== confirmPwd ? (
          <Text style={styles.submitHint}>
            {confirmPwd.length === 0
              ? 'יש להזין שוב את הסיסמה בשדה "אימות סיסמה".'
              : 'הסיסמאות אינן תואמות — יש לתקן את שדה אימות הסיסמה.'}
          </Text>
        ) : null}

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
  error?: string;
}

const Field: React.FC<FieldProps> = ({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = 'default',
  secure = false,
  icon,
  error,
}) => (
  <View style={styles.inputGroup}>
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
    </View>
    <View style={[styles.inputWrapper, !!error && styles.inputWrapperError]}>
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
    {!!error && <Text style={styles.fieldErrorText}>{error}</Text>}
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
  inputWrapperError: { borderColor: Colors.danger },
  passwordRule: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'right',
    marginBottom: 2,
  },
  submitHint: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  fieldErrorText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: '600',
    writingDirection: 'rtl',
    textAlign: 'right',
    marginTop: 2,
  },
  chipGroupError: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: '600',
    writingDirection: 'rtl',
    textAlign: 'right',
    marginTop: 4,
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
