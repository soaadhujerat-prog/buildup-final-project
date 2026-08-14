import React, { useMemo, useState } from 'react';
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

import {
  Colors,
  Spacing,
  Radius,
  FontSize,
  Shadow,
  FilterChip as FC,
} from '../theme/colors';
import { useApp } from '../context/AppContext';
import DatePickerField from '../components/DatePickerField';
import {
  CITIES_ISRAEL,
  PROFESSIONS_BY_CATEGORY,
  PROFESSION_CATEGORIES,
} from '../data/mockData';
import { Contractor, ProfessionCategory } from '../types';

interface Props {
  onBack: () => void;
  onPosted: (jobId: string) => void;
}

const PostJobScreen: React.FC<Props> = ({ onBack, onPosted }) => {
  const insets = useSafeAreaInsets();
  const { currentUser, postJob } = useApp();
  const me = currentUser as Contractor | undefined;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [profCategory, setProfCategory] =
    useState<ProfessionCategory>('בנייה');
  const [profession, setProfession] = useState('בנאי');
  const [city, setCity] = useState(me?.city ?? 'תל אביב');
  const [address, setAddress] = useState('');
  const [startDate, setStartDate] = useState('');
  const [duration, setDuration] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [workersNeeded, setWorkersNeeded] = useState('1');
  const [requiredCerts, setRequiredCerts] = useState('');
  const [requirements, setRequirements] = useState('');
  const [urgent, setUrgent] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const profCategories = useMemo(
    () => PROFESSION_CATEGORIES.filter((c) => c !== 'כל המקצועות'),
    []
  );
  const cityChoices = useMemo(
    () => CITIES_ISRAEL.filter((c) => c !== 'כל הערים'),
    []
  );
  const professionChoices = PROFESSIONS_BY_CATEGORY[profCategory] ?? [];

  const validate = (): string | null => {
    if (!title.trim() || title.trim().length < 4)
      return 'כותרת המשרה חובה (לפחות 4 תווים)';
    if (!description.trim() || description.trim().length < 20)
      return 'תיאור המשרה חובה (לפחות 20 תווים)';
    if (!profession.trim()) return 'יש לבחור מקצוע';
    if (!city.trim()) return 'יש לבחור עיר';
    if (!address.trim()) return 'כתובת המשרה חובה';
    if (!startDate.trim()) return 'תאריך התחלה חובה';
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(startDate.trim()))
      return 'תאריך התחלה חייב להיות בפורמט DD/MM/YYYY';
    if (!duration.trim()) return 'משך הפרויקט חובה';
    if (!dailyRate || isNaN(Number(dailyRate)) || Number(dailyRate) <= 0)
      return 'תעריף יומי חייב להיות מספר חיובי';
    if (
      !workersNeeded ||
      isNaN(Number(workersNeeded)) ||
      Number(workersNeeded) <= 0
    )
      return 'מספר העובדים הדרוש חייב להיות מספר חיובי';
    if (!me) return 'לא ניתן ליצור משרה — אין משתמש מחובר';
    return null;
  };

  const handleSubmit = () => {
    const err = validate();
    if (err) {
      Alert.alert('בדוק את הפרטים', err);
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      const newJob = postJob({
        contractorId: me!.id,
        title: title.trim(),
        description: description.trim(),
        profession,
        professionCategory: profCategory,
        city,
        address: address.trim(),
        startDate: startDate.trim(),
        duration: duration.trim(),
        dailyRate: Number(dailyRate),
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
      });
      setSubmitting(false);
      onPosted(newJob.id);
    }, 700);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.headerBar, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>פרסם משרה חדשה</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingBottom: 60,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Section title="פרטי המשרה">
          <Field
            label="כותרת המשרה"
            value={title}
            onChange={setTitle}
            placeholder="למשל: עבודות גמר בדירה 4 חדרים"
          />
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>תיאור מפורט</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={setDescription}
              placeholder="פרט את היקף העבודה, האזור, חומרים, ולוח הזמנים."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>
        </Section>

        <Section title="סיווג מקצועי">
          <Picker
            label="תחום מקצועי"
            value={profCategory}
            options={profCategories}
            onChange={(v) => {
              setProfCategory(v as ProfessionCategory);
              const list = PROFESSIONS_BY_CATEGORY[v] ?? [];
              if (list.length > 0) setProfession(list[0]);
            }}
          />
          <Picker
            label="מקצוע ספציפי"
            value={profession}
            options={professionChoices}
            onChange={setProfession}
          />
        </Section>

        <Section title="מיקום">
          <Picker
            label="עיר"
            value={city}
            options={cityChoices}
            onChange={setCity}
          />
          <Field
            label="כתובת מדויקת"
            value={address}
            onChange={setAddress}
            placeholder="רחוב הרצל 25"
          />
        </Section>

        <Section title="תקופה ותגמול">
          <DatePickerField
            label="תאריך התחלה"
            value={startDate}
            onChange={setStartDate}
            minimumDate={new Date()}
          />
          <Field
            label="משך משוער"
            value={duration}
            onChange={setDuration}
            placeholder="למשל: שבועיים, חודש"
          />
          <Field
            label="תעריף יומי לעובד (₪)"
            value={dailyRate}
            onChange={setDailyRate}
            placeholder="850"
            keyboardType="numeric"
          />
          <Field
            label="מספר עובדים דרוש"
            value={workersNeeded}
            onChange={setWorkersNeeded}
            placeholder="1"
            keyboardType="numeric"
          />
        </Section>

        <Section title="דרישות והסמכות">
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
        </Section>

        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle"
            size={18}
            color={Colors.secondary}
          />
          <Text style={styles.infoText}>
            המשרה תפורסם מיד לעובדים מתאימים. תוכל לראות מועמדויות במסך פרטי
            המשרה.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          <Text style={styles.submitText}>
            {submitting ? 'מפרסם...' : 'פרסם משרה'}
          </Text>
        </TouchableOpacity>
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
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?:
    | 'default'
    | 'numeric'
    | 'phone-pad'
    | 'email-address'
    | 'numbers-and-punctuation';
}> = ({ label, value, onChange, placeholder, keyboardType = 'default' }) => (
  <View style={styles.inputGroup}>
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
    </View>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={Colors.textMuted}
      keyboardType={keyboardType}
    />
  </View>
);

const Picker: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <View style={styles.inputGroup}>
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
    </View>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {options.map((o) => {
        const active = o === value;
        return (
          <TouchableOpacity
            key={o}
            onPress={() => onChange(o)}
            style={[styles.chip, active && styles.chipActive]}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {o}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headerBar: {
    position: 'relative',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.md,
    padding: 4,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
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
  textarea: { minHeight: 110, textAlignVertical: 'top' },

  chipRow: { flexDirection: 'row-reverse', gap: 8 },
  chip: {
    height: FC.height,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: FC.paddingHorizontal,
    borderRadius: FC.borderRadius,
    borderWidth: FC.borderWidth,
    borderColor: Colors.textMuted,
    backgroundColor: Colors.white,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  chipTextActive: { color: Colors.white },

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
