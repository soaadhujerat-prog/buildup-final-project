import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
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
import ChipInput from '../components/ChipInput';
import CityPickerField from '../components/CityPickerField';
import HorizontalChipPicker from '../components/HorizontalChipPicker';
import {
  AREAS_ISRAEL,
  PROFESSIONS_BY_CATEGORY,
  PROFESSION_CATEGORIES,
} from '../data/mockData';
import { ProfessionCategory, Worker } from '../types';

interface Props {
  onBack: () => void;
}

const WorkerProfileEditScreen: React.FC<Props> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { currentUser, updateWorkerProfile } = useApp();
  const me = currentUser as Worker | undefined;

  const [phone, setPhone] = useState(me?.phone ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  const [city, setCity] = useState(me?.city ?? 'תל אביב');
  const [profCategory, setProfCategory] = useState<ProfessionCategory>(
    (me?.professionCategory ?? 'בנייה') as ProfessionCategory
  );
  const [profession, setProfession] = useState(me?.profession ?? '');
  const [experienceYears, setExperienceYears] = useState(
    String(me?.experienceYears ?? '')
  );
  const [skills, setSkills] = useState<string[]>(me?.skills ?? []);
  const [certifications, setCertifications] = useState<string[]>(
    me?.certifications ?? []
  );
  const [hourlyRate, setHourlyRate] = useState(String(me?.hourlyRate ?? ''));
  const [dailyRate, setDailyRate] = useState(String(me?.dailyRate ?? ''));
  const [bio, setBio] = useState(me?.bio ?? '');
  const [preferredAreas, setPreferredAreas] = useState<string[]>(
    me?.preferredAreas ?? []
  );

  const profCategories = useMemo(
    () => PROFESSION_CATEGORIES.filter((c) => c !== 'כל המקצועות'),
    []
  );
  const professionChoices = PROFESSIONS_BY_CATEGORY[profCategory] ?? [];

  if (!me || me.role !== 'worker') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>אין משתמש פעיל</Text>
      </View>
    );
  }

  const toggleArea = (a: string) => {
    setPreferredAreas((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSave = () => {
    if (submitting) return;
    if (!phone.trim()) return Alert.alert('שגיאה', 'טלפון חובה');
    if (!email.trim() || !email.includes('@'))
      return Alert.alert('שגיאה', 'אימייל לא תקין');
    if (!profession.trim()) return Alert.alert('שגיאה', 'מקצוע חובה');
    const exp = Number(experienceYears);
    if (isNaN(exp) || exp < 0)
      return Alert.alert('שגיאה', 'שנות ניסיון חייב להיות מספר');
    const hr = Number(hourlyRate);
    const dr = Number(dailyRate);
    if (isNaN(hr) || hr <= 0)
      return Alert.alert('שגיאה', 'תעריף שעתי חייב להיות מספר חיובי');
    if (isNaN(dr) || dr <= 0)
      return Alert.alert('שגיאה', 'תעריף יומי חייב להיות מספר חיובי');
    if (preferredAreas.length === 0)
      return Alert.alert('שגיאה', 'יש לבחור לפחות אזור עבודה אחד');

    setSubmitting(true);
    updateWorkerProfile(me.id, {
      phone: phone.trim(),
      email: email.trim(),
      city,
      professionCategory: profCategory,
      profession,
      experienceYears: exp,
      skills,
      certifications,
      hourlyRate: hr,
      dailyRate: dr,
      bio: bio.trim(),
      preferredAreas,
    });

    Alert.alert('נשמר', 'הפרופיל שלך עודכן בהצלחה.', [
      { text: 'אישור', onPress: onBack },
    ]);
    setSubmitting(false);
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
        <Text style={styles.headerTitle}>עריכת פרופיל</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingBottom: 60,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Section title="פרטי קשר">
          <Field label="טלפון" value={phone} onChange={setPhone} keyboardType="phone-pad" />
          <Field
            label="אימייל"
            value={email}
            onChange={setEmail}
            keyboardType="email-address"
          />
          <CityPickerField label="עיר" value={city} onChange={setCity} />
        </Section>

        <Section title="פרטים מקצועיים">
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
                if (list.length > 0 && !list.includes(profession))
                  setProfession(list[0]);
              }}
              chipStyle={styles.chip}
              chipActiveStyle={styles.chipActive}
              textStyle={styles.chipText}
              textActiveStyle={styles.chipTextActive}
            />
          </View>
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>מקצוע ספציפי</Text>
            </View>
            <HorizontalChipPicker
              options={professionChoices}
              value={profession}
              onChange={setProfession}
              chipStyle={styles.chip}
              chipActiveStyle={styles.chipActive}
              textStyle={styles.chipText}
              textActiveStyle={styles.chipTextActive}
            />
          </View>
          <Field
            label="שנות ניסיון"
            value={experienceYears}
            onChange={setExperienceYears}
            keyboardType="numeric"
          />
          <ChipInput
            label="מיומנויות"
            values={skills}
            onChange={setSkills}
            placeholder="הוסף מיומנות..."
          />
          <ChipInput
            label="הסמכות"
            values={certifications}
            onChange={setCertifications}
            placeholder="הוסף הסמכה..."
          />
        </Section>

        <Section title="תעריפים">
          <Field
            label="תעריף שעתי (₪)"
            value={hourlyRate}
            onChange={setHourlyRate}
            keyboardType="numeric"
          />
          <Field
            label="תעריף יומי (₪)"
            value={dailyRate}
            onChange={setDailyRate}
            keyboardType="numeric"
          />
        </Section>

        <Section title="אזורי עבודה מועדפים">
          <View style={styles.areaGrid}>
            {AREAS_ISRAEL.map((a) => {
              const active = preferredAreas.includes(a);
              return (
                <TouchableOpacity
                  key={a}
                  onPress={() => toggleArea(a)}
                  style={[styles.areaChip, active && styles.areaChipActive]}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.areaChipText,
                      active && styles.areaChipTextActive,
                    ]}
                  >
                    {a}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        <Section title="אודות">
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>תיאור אישי קצר</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={bio}
              onChangeText={setBio}
              placeholder="ספר/י על עצמך, מה אתה אוהב לעשות, ניסיון מיוחד..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>
        </Section>

        <TouchableOpacity
          style={[styles.saveBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={submitting}
        >
          <Text style={styles.saveText}>
            {submitting ? 'שומר...' : 'שמור שינויים'}
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
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
}> = ({ label, value, onChange, keyboardType = 'default' }) => (
  <View style={styles.inputGroup}>
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
    </View>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      keyboardType={keyboardType}
      autoCapitalize="none"
      placeholderTextColor={Colors.textMuted}
    />
  </View>
);

// ---------- styles ----------

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

  notFound: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 60,
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

  areaGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  areaChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.gray50,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  areaChipActive: {
    backgroundColor: Colors.primaryFaint,
    borderColor: Colors.primary,
  },
  areaChipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  areaChipTextActive: { color: Colors.primary },

  saveBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
    ...Shadow.medium,
  },
  saveText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default WorkerProfileEditScreen;
