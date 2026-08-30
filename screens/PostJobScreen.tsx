import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import DatePickerField from '../components/DatePickerField';
import CityPickerField from '../components/CityPickerField';
import ProfessionSelectorModal from '../components/ProfessionSelectorModal';
import WorksiteImagesField from '../components/WorksiteImagesField';
import { formatRatePerUnit } from '../utils/helpers';
import { PROFESSIONS_BY_CATEGORY } from '../data/mockData';
import { Contractor, ProfessionCategory } from '../types';

interface Props {
  onBack: () => void;
  /** Create mode success. */
  onPosted: (jobId: string) => void;
  /** Edit mode success. Falls back to onBack if not supplied. */
  onSaved?: (jobId: string) => void;
  /** Presence of jobId switches the whole screen into edit mode. */
  jobId?: string;
}

interface FormErrors {
  title?: string;
  description?: string;
  profession?: string;
  city?: string;
  address?: string;
  startDate?: string;
  duration?: string;
  payment?: string;
  workersNeeded?: string;
}

// DD/MM/YYYY (DatePickerField's stored format) → Date, local-safe.
const parseDDMMYYYY = (value: string): Date | null => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return isNaN(d.getTime()) ? null : d;
};

const isPastDate = (value: string): boolean => {
  const d = parseDDMMYYYY(value);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
};

const formatPostedAt = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const PostJobScreen: React.FC<Props> = ({ onBack, onPosted, onSaved, jobId }) => {
  const insets = useSafeAreaInsets();
  const { currentUser, postJob, updateJob, getJobById } = useApp();
  const me = currentUser as Contractor | undefined;
  const scrollRef = useRef<ScrollView>(null);

  const isEditMode = !!jobId;
  const existingJob = jobId ? getJobById(jobId) : undefined;
  const canEdit = !isEditMode || (!!existingJob && existingJob.contractorId === me?.id);

  const [title, setTitle] = useState(existingJob?.title ?? '');
  const [description, setDescription] = useState(existingJob?.description ?? '');
  const [profCategory, setProfCategory] = useState<ProfessionCategory | ''>(
    existingJob?.professionCategory ?? ''
  );
  const [profession, setProfession] = useState(existingJob?.profession ?? '');
  const [city, setCity] = useState(existingJob?.city ?? '');
  const [address, setAddress] = useState(existingJob?.address ?? '');
  const [startDate, setStartDate] = useState(existingJob?.startDate ?? '');
  const [duration, setDuration] = useState(existingJob?.duration ?? '');
  const [hourlyRate, setHourlyRate] = useState(
    existingJob?.hourlyRate ? String(existingJob.hourlyRate) : ''
  );
  const [dailyRate, setDailyRate] = useState(
    existingJob?.dailyRate ? String(existingJob.dailyRate) : ''
  );
  const [workersNeeded, setWorkersNeeded] = useState(
    existingJob ? String(existingJob.workersNeeded) : '1'
  );
  const [requiredCerts, setRequiredCerts] = useState(
    existingJob?.requiredCertifications.join(', ') ?? ''
  );
  const [requirements, setRequirements] = useState(
    existingJob?.requirements.join('\n') ?? ''
  );
  const [urgent, setUrgent] = useState(existingJob?.urgent ?? false);
  const [worksiteImages, setWorksiteImages] = useState<string[]>(
    existingJob?.worksiteImages ?? []
  );

  // Errors are DERIVED from the current form values once the user has tried to
  // submit — so a field's error disappears the moment its value becomes valid,
  // and a field that is already valid never shows one.
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [professionModalVisible, setProfessionModalVisible] = useState(false);

  // Edit-mode dirty check — a snapshot of everything editable, taken once
  // from the job as it was loaded. Only used to gate the "unsaved changes"
  // prompt on Back; never re-computed after mount.
  const initialSnapshot = useRef(
    JSON.stringify({
      title: existingJob?.title ?? '',
      description: existingJob?.description ?? '',
      profCategory: existingJob?.professionCategory ?? '',
      profession: existingJob?.profession ?? '',
      city: existingJob?.city ?? '',
      address: existingJob?.address ?? '',
      startDate: existingJob?.startDate ?? '',
      duration: existingJob?.duration ?? '',
      hourlyRate: existingJob?.hourlyRate ? String(existingJob.hourlyRate) : '',
      dailyRate: existingJob?.dailyRate ? String(existingJob.dailyRate) : '',
      workersNeeded: existingJob ? String(existingJob.workersNeeded) : '1',
      requiredCerts: existingJob?.requiredCertifications.join(', ') ?? '',
      requirements: existingJob?.requirements.join('\n') ?? '',
      urgent: existingJob?.urgent ?? false,
      worksiteImages: existingJob?.worksiteImages ?? [],
    })
  ).current;

  const isDirty =
    isEditMode &&
    JSON.stringify({
      title,
      description,
      profCategory,
      profession,
      city,
      address,
      startDate,
      duration,
      hourlyRate,
      dailyRate,
      workersNeeded,
      requiredCerts,
      requirements,
      urgent,
      worksiteImages,
    }) !== initialSnapshot;

  // A category with no specific profession is an INCOMPLETE selection — show it
  // as such, never as a finished value.
  const professionLabel = profession
    ? profession
    : profCategory
    ? `${profCategory} · יש לבחור מקצוע ספציפי`
    : '';
  const previewProfession = profession || profCategory || '';

  const handleBackPress = () => {
    if (isDirty) {
      Alert.alert('יש שינויים שלא נשמרו', 'להמשיך לערוך או לצאת ללא שמירה?', [
        { text: 'המשך עריכה', style: 'cancel' },
        { text: 'צא ללא שמירה', style: 'destructive', onPress: onBack },
      ]);
      return;
    }
    onBack();
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};

    const titleT = title.trim();
    if (!titleT) next.title = 'כותרת המשרה חובה';
    else if (titleT.length < 4) next.title = 'כותרת קצרה מדי (לפחות 4 תווים)';
    else if (titleT.length > 80) next.title = 'כותרת ארוכה מדי (עד 80 תווים)';

    const descT = description.trim();
    if (!descT) next.description = 'תיאור המשרה חובה';
    else if (descT.length < 20)
      next.description = 'התיאור קצר מדי (לפחות 20 תווים)';
    else if (descT.length > 2000)
      next.description = 'התיאור ארוך מדי (עד 2000 תווים)';

    // תחום + מקצוע ספציפי — source of truth is (profCategory, profession).
    if (!profCategory) {
      next.profession = 'יש לבחור תחום מקצועי';
    } else if (!profession.trim()) {
      next.profession = 'יש לבחור מקצוע ספציפי בתוך התחום';
    } else if (
      !(PROFESSIONS_BY_CATEGORY[profCategory] ?? []).includes(profession)
    ) {
      next.profession = 'המקצוע שנבחר אינו תואם לתחום';
    }

    if (!city.trim()) next.city = 'יש לבחור עיר';

    const addrT = address.trim();
    if (!addrT) next.address = 'כתובת מדויקת חובה';
    else if (addrT.length < 3) next.address = 'הכתובת שהוזנה קצרה מדי';

    if (!startDate.trim()) {
      next.startDate = 'תאריך התחלה חובה';
    } else if (!parseDDMMYYYY(startDate)) {
      next.startDate = 'תאריך ההתחלה אינו תקין';
    } else if (isPastDate(startDate)) {
      next.startDate = 'תאריך ההתחלה לא יכול להיות בעבר';
    }

    const durT = duration.trim();
    if (!durT) next.duration = 'משך העבודה המשוער חובה';
    else if (durT.length < 2) next.duration = 'יש לפרט את משך העבודה המשוער';
    else if (durT.length > 60) next.duration = 'הערך שהוזן ארוך מדי';

    const hourlyTrim = hourlyRate.trim();
    const dailyTrim = dailyRate.trim();
    if (!hourlyTrim && !dailyTrim) {
      next.payment = 'יש להזין לפחות תעריף שעתי או תעריף יומי';
    } else if (
      hourlyTrim &&
      (isNaN(Number(hourlyTrim)) || Number(hourlyTrim) <= 0)
    ) {
      next.payment = 'תעריף שעתי חייב להיות מספר גדול מ-0';
    } else if (hourlyTrim && Number(hourlyTrim) > 10000) {
      next.payment = 'התעריף השעתי גבוה מהצפוי — בדוק/י את הערך';
    } else if (
      dailyTrim &&
      (isNaN(Number(dailyTrim)) || Number(dailyTrim) <= 0)
    ) {
      next.payment = 'תעריף יומי חייב להיות מספר גדול מ-0';
    } else if (dailyTrim && Number(dailyTrim) > 100000) {
      next.payment = 'התעריף היומי גבוה מהצפוי — בדוק/י את הערך';
    }

    const wn = Number(workersNeeded);
    if (
      !workersNeeded.trim() ||
      isNaN(wn) ||
      !Number.isInteger(wn) ||
      wn < 1
    ) {
      next.workersNeeded =
        'מספר העובדים הדרוש חייב להיות מספר שלם, 1 ומעלה';
    } else if (wn > 100) {
      next.workersNeeded = 'מספר העובדים הדרוש חייב להיות עד 100';
    }
    return next;
  };

  const errors: FormErrors = submitAttempted ? validate() : {};

  const handleSubmit = () => {
    if (!me) {
      Alert.alert('שגיאה', 'לא ניתן לפרסם משרה — אין משתמש מחובר');
      return;
    }
    setSubmitAttempted(true);
    const foundErrors = validate();
    if (Object.keys(foundErrors).length > 0) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim(),
      profession,
      professionCategory: profCategory as ProfessionCategory,
      city,
      address: address.trim(),
      startDate: startDate.trim(),
      duration: duration.trim(),
      hourlyRate: hourlyRate.trim() ? Number(hourlyRate) : undefined,
      dailyRate: dailyRate.trim() ? Number(dailyRate) : undefined,
      workersNeeded: Number(workersNeeded),
      requiredCertifications: requiredCerts
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      requirements: requirements
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      urgent,
      worksiteImages,
    };

    setSubmitting(true);
    setTimeout(() => {
      if (isEditMode && jobId) {
        // This save is a real content edit — and only here, not for any
        // technical/operational change — so updatedAt is stamped explicitly.
        updateJob(jobId, { ...payload, updatedAt: new Date().toISOString() });
        setSubmitting(false);
        (onSaved ?? onBack)(jobId);
      } else {
        const newJob = postJob({ ...payload, contractorId: me.id });
        setSubmitting(false);
        onPosted(newJob.id);
      }
    }, 500);
  };

  if (isEditMode && !canEdit) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>אין הרשאה לערוך משרה זו</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.headerArea}>
        <TouchableOpacity
          onPress={handleBackPress}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">
          {isEditMode ? 'עריכת משרה' : 'פרסם משרה חדשה'}
        </Text>
        <Text style={styles.headerSubtitle}>
          {isEditMode
            ? 'עדכן את פרטי המשרה — המועמדויות והשיבוצים הקיימים נשארים'
            : 'כמה פרטים ברורים עוזרים לעובדים הנכונים למצוא אותך'}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isEditMode && existingJob && (
          <View style={styles.metaCard}>
            <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.metaCardText}>
              פורסם ב-{formatPostedAt(existingJob.postedAt)}
              {existingJob.updatedAt
                ? ` · עודכן לאחרונה ב-${formatPostedAt(existingJob.updatedAt)}`
                : ''}
            </Text>
          </View>
        )}

        <Section title="פרטי העבודה" icon="briefcase-outline">
          <Field
            label="כותרת המשרה"
            value={title}
            onChange={setTitle}
            placeholder="למשל: עבודות גמר בדירה 4 חדרים"
            error={errors.title}
          />
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>תיאור מפורט</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textarea, errors.description && styles.inputError]}
              value={description}
              onChangeText={setDescription}
              placeholder="פרט את היקף העבודה, האזור, חומרים, ולוח הזמנים."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            {!!errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>תחום מקצועי</Text>
            </View>
            <TouchableOpacity
              style={[styles.selectorRow, errors.profession && styles.inputError]}
              onPress={() => setProfessionModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="hammer-outline" size={20} color={Colors.textSecondary} />
              <Text
                style={[styles.selectorValue, !profession && styles.placeholder]}
                numberOfLines={1}
              >
                {professionLabel || 'בחר תחום ומקצוע ספציפי'}
              </Text>
              <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
            {!!errors.profession && <Text style={styles.errorText}>{errors.profession}</Text>}
          </View>
        </Section>

        <Section title="מיקום וזמן" icon="location-outline">
          <CityPickerField
            label="עיר"
            value={city}
            onChange={setCity}
            placeholder="בחר עיר"
            error={errors.city}
          />
          <Field
            label="כתובת מדויקת"
            value={address}
            onChange={setAddress}
            placeholder="למשל: רוטשילד 25, תל אביב"
            error={errors.address}
          />
          <DatePickerField
            label="תאריך התחלה"
            value={startDate}
            onChange={setStartDate}
            minimumDate={new Date()}
            error={errors.startDate}
          />
          <Field
            label="משך עבודה משוער"
            value={duration}
            onChange={setDuration}
            placeholder="למשל: 3 שבועות"
            error={errors.duration}
          />
        </Section>

        <Section title="תשלום וכוח אדם" icon="cash-outline">
          <View style={styles.paymentGroup}>
            <Field
              label="תעריף לשעה (₪)"
              value={hourlyRate}
              onChange={(v) => setHourlyRate(v.replace(/[^0-9]/g, ''))}
              placeholder="למשל: 65"
              keyboardType="numeric"
            />
            <Field
              label="תעריף ליום (₪)"
              value={dailyRate}
              onChange={(v) => setDailyRate(v.replace(/[^0-9]/g, ''))}
              placeholder="למשל: 850"
              keyboardType="numeric"
            />
            {!!errors.payment && <Text style={styles.errorText}>{errors.payment}</Text>}
          </View>
          <Field
            label="מספר עובדים דרוש"
            value={workersNeeded}
            onChange={(v) => setWorkersNeeded(v.replace(/[^0-9]/g, ''))}
            placeholder="1"
            keyboardType="numeric"
            error={errors.workersNeeded}
          />
        </Section>

        <Section title="דרישות" icon="checkmark-done-outline">
          <Field
            label="הסמכות נדרשות (מופרד בפסיקים)"
            value={requiredCerts}
            onChange={setRequiredCerts}
            placeholder="חשמלאי מוסמך, תעודת בטיחות"
          />
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>דרישות נוספות (שורה לכל דרישה)</Text>
            </View>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
              value={requirements}
              onChangeText={setRequirements}
              placeholder={'ניסיון של 3 שנים\nכלי עבודה אישיים\nרישיון נהיגה'}
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>

          <View style={styles.urgentRow}>
            <View style={styles.switchRow}>
              <Switch
                value={urgent}
                onValueChange={setUrgent}
                trackColor={{ false: Colors.border, true: Colors.danger }}
              />
              <TouchableOpacity
                onPress={() => setUrgent(!urgent)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.switchLabel}>משרה דחופה</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.urgentHint}>
              המשרה תסומן כמשרה דחופה לעובדים רלוונטיים.
            </Text>
          </View>
        </Section>

        <Section title="תמונות מקום העבודה" icon="images-outline">
          <WorksiteImagesField
            images={worksiteImages}
            onChange={setWorksiteImages}
            max={5}
            label="ניתן להוסיף עד 5 תמונות"
          />
        </Section>

        {/* Preview / summary */}
        <View style={styles.previewCard}>
          <View style={styles.previewHead}>
            <Ionicons name="eye-outline" size={16} color={Colors.primary} />
            <Text style={styles.previewTitle}>תצוגה מקדימה</Text>
          </View>
          <Text style={styles.previewJobTitle} numberOfLines={1}>
            {title.trim() || 'כותרת המשרה'}
          </Text>
          <View style={styles.previewRow}>
            {!!previewProfession && (
              <PreviewChip icon="briefcase-outline" text={previewProfession} />
            )}
            {!!city && <PreviewChip icon="location-outline" text={city} />}
            {!!startDate && <PreviewChip icon="calendar-outline" text={startDate} />}
            {urgent && <PreviewChip icon="flash" text="דחוף" tone="danger" />}
          </View>
          <View style={styles.previewRow}>
            {!!hourlyRate.trim() && (
              <PreviewChip icon="cash-outline" text={formatRatePerUnit(Number(hourlyRate), 'שעה')} />
            )}
            {!!dailyRate.trim() && (
              <PreviewChip icon="cash-outline" text={formatRatePerUnit(Number(dailyRate), 'יום')} />
            )}
            <PreviewChip icon="people-outline" text={`${workersNeeded || 0} עובדים`} />
            {worksiteImages.length > 0 && (
              <PreviewChip icon="image-outline" text={`${worksiteImages.length} תמונות`} />
            )}
          </View>
        </View>

        {!isEditMode && (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={18} color={Colors.secondary} />
            <Text style={styles.infoText}>
              המשרה תפורסם מיד לעובדים מתאימים. תוכל לראות מועמדויות במסך פרטי המשרה.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          <Text style={styles.submitText}>
            {submitting
              ? isEditMode
                ? 'שומר...'
                : 'מפרסם...'
              : isEditMode
              ? 'שמור שינויים'
              : 'פרסם משרה'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <ProfessionSelectorModal
        visible={professionModalVisible}
        onClose={() => setProfessionModalVisible(false)}
        professionCategory={profCategory}
        profession={profession}
        allowAllInCategory={false}
        onChange={(nextCategory, nextProfession) => {
          setProfCategory(nextCategory as ProfessionCategory | '');
          setProfession(nextProfession);
        }}
      />
    </KeyboardAvoidingView>
  );
};

// ---------- subcomponents ----------

const Section: React.FC<{
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <View style={styles.section}>
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Ionicons name={icon} size={18} color={Colors.primary} />
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  error?: string;
}> = ({ label, value, onChange, placeholder, keyboardType = 'default', error }) => (
  <View style={styles.inputGroup}>
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
    </View>
    <TextInput
      style={[styles.input, error && styles.inputError]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={Colors.textMuted}
      keyboardType={keyboardType}
    />
    {!!error && <Text style={styles.errorText}>{error}</Text>}
  </View>
);

const PreviewChip: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  tone?: 'danger';
}> = ({ icon, text, tone }) => (
  <View style={[styles.previewChip, tone === 'danger' && styles.previewChipDanger]}>
    <Ionicons name={icon} size={12} color={tone === 'danger' ? Colors.danger : Colors.primary} />
    <Text style={[styles.previewChipText, tone === 'danger' && { color: Colors.danger }]}>
      {text}
    </Text>
  </View>
);

// ---------- styles ----------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.screenTint },

  headerArea: {
    position: 'relative',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  backBtn: {
    position: 'absolute',
    right: Spacing.lg,
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
  headerSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 3,
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

  metaCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.md,
  },
  metaCardText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
  },

  section: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  sectionHead: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
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
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inputError: { borderColor: Colors.danger },
  errorText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' },

  selectorRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  selectorValue: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  placeholder: { color: Colors.textMuted },

  paymentGroup: { gap: Spacing.md },

  urgentRow: { gap: 4 },
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
  urgentHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  previewCard: {
    backgroundColor: Colors.primaryFaint,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  previewHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  previewTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  previewJobTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  previewRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  previewChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  previewChipDanger: { backgroundColor: '#FEE2E2' },
  previewChipText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  infoBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: '#EFF6FF',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.secondary,
    lineHeight: 20,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  submitBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
    ...Shadow.medium,
  },
  submitText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default PostJobScreen;
