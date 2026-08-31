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
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

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
import CertificationsField from '../components/CertificationsField';
import WorkerAvatar from '../components/WorkerAvatar';
import {
  AREAS_ISRAEL,
  PROFESSIONS_BY_CATEGORY,
  PROFESSION_CATEGORIES,
} from '../data/mockData';
import { Certification, ProfessionCategory, Worker } from '../types';
import { isValidIsraeliPhone, normalizePhone } from '../utils/helpers';
import { workerProfessions, normalizeCertifications } from '../utils/normalize';

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
  const [professions, setProfessions] = useState<string[]>(
    me ? workerProfessions(me) : []
  );
  const [experienceYears, setExperienceYears] = useState(
    String(me?.experienceYears ?? '')
  );
  const [skills, setSkills] = useState<string[]>(me?.skills ?? []);
  const [certifications, setCertifications] = useState<Certification[]>(
    normalizeCertifications(me?.certifications)
  );
  const [hourlyRate, setHourlyRate] = useState(String(me?.hourlyRate ?? ''));
  const [dailyRate, setDailyRate] = useState(String(me?.dailyRate ?? ''));
  const [bio, setBio] = useState(me?.bio ?? '');
  const [preferredAreas, setPreferredAreas] = useState<string[]>(
    me?.preferredAreas ?? []
  );

  // Profile image — a public identity photo, entirely separate from the
  // private ID-card document captured at sign-up (DocumentUploadField).
  // Kept as a local URI for now; only swapped for a Supabase Storage URL
  // once there's a real backend, but the field itself (Worker.avatarUrl)
  // stays the same either way.
  const [avatarUri, setAvatarUri] = useState<string | undefined>(me?.avatarUrl);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState<'camera' | 'gallery' | null>(null);
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);

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
  const toggleProfession = (p: string) => {
    setProfessions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const [submitting, setSubmitting] = useState(false);

  const openAvatarSheet = () => {
    setAvatarNotice(null);
    setAvatarSheetOpen(true);
  };
  const closeAvatarSheet = () => {
    if (avatarBusy) return;
    setAvatarSheetOpen(false);
  };

  const runAvatarCamera = async () => {
    setAvatarNotice(null);
    setAvatarBusy('camera');
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        setAvatarNotice('לא ניתנה הרשאת מצלמה. אפשר לבחור תמונה מהגלריה במקום.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]) return;
      setAvatarUri(result.assets[0].uri);
      setAvatarSheetOpen(false);
    } catch {
      setAvatarNotice('לא ניתן היה לפתוח את המצלמה. נסה שוב.');
    } finally {
      setAvatarBusy(null);
    }
  };

  const runAvatarGallery = async () => {
    setAvatarNotice(null);
    setAvatarBusy('gallery');
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        setAvatarNotice('לא ניתנה הרשאת גישה לגלריה. אפשר לצלם עכשיו במקום.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]) return;
      setAvatarUri(result.assets[0].uri);
      setAvatarSheetOpen(false);
    } catch {
      setAvatarNotice('לא ניתן היה לפתוח את הגלריה. נסה שוב.');
    } finally {
      setAvatarBusy(null);
    }
  };

  const removeAvatar = () => {
    setAvatarUri(undefined);
    setAvatarSheetOpen(false);
  };

  const handleSave = async () => {
    if (submitting) return;
    if (!phone.trim()) return Alert.alert('שגיאה', 'טלפון חובה');
    if (!isValidIsraeliPhone(phone))
      return Alert.alert('שגיאה', 'מספר טלפון לא תקין');
    if (!email.trim() || !email.includes('@'))
      return Alert.alert('שגיאה', 'אימייל לא תקין');
    if (professions.length === 0)
      return Alert.alert('שגיאה', 'יש לבחור לפחות מקצוע אחד');
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
    try {
      await updateWorkerProfile(me.id, {
        avatarUrl: avatarUri,
        phone: normalizePhone(phone),
        email: email.trim(),
        city,
        professionCategory: profCategory,
        profession: professions[0],
        professions,
        experienceYears: exp,
        skills,
        certifications: certifications
          .map((c) => ({ ...c, name: c.name.trim() }))
          .filter((c) => c.name.length > 0),
        hourlyRate: hr,
        dailyRate: dr,
        bio: bio.trim(),
        preferredAreas,
      });
      Alert.alert('נשמר', 'הפרופיל שלך עודכן בהצלחה.', [
        { text: 'אישור', onPress: onBack },
      ]);
    } catch {
      Alert.alert('שגיאה', 'שמירת הפרופיל נכשלה. בדוק את החיבור ונסה שוב.');
    } finally {
      setSubmitting(false);
    }
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
        <Text style={styles.headerTitle} pointerEvents="none">עריכת פרופיל</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingBottom: 60,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Section title="תמונת פרופיל">
          <View style={styles.avatarEditWrap}>
            <TouchableOpacity
              onPress={openAvatarSheet}
              activeOpacity={0.8}
              style={styles.avatarTouchable}
            >
              <WorkerAvatar
                worker={{ id: me.id, fullName: me.fullName, avatarUrl: avatarUri }}
                size={92}
              />
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={16} color={Colors.white} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={openAvatarSheet} activeOpacity={0.7}>
              <Text style={styles.avatarEditLink}>
                {avatarUri ? 'החלף תמונה' : 'הוסף תמונת פרופיל'}
              </Text>
            </TouchableOpacity>
          </View>
        </Section>

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
            />
          </View>
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>מקצוע ספציפי (ניתן לבחור כמה)</Text>
            </View>
            <View style={styles.chipWrap}>
              {professionChoices.map((p) => {
                const active = professions.includes(p);
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => toggleProfession(p)}
                    style={[styles.chip, active && styles.chipActive]}
                    activeOpacity={0.85}
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
            keyboardType="numeric"
          />
          <ChipInput
            label="מיומנויות"
            values={skills}
            onChange={setSkills}
            placeholder="הוסף מיומנות..."
          />
          <CertificationsField
            label="הסמכות ותעודות"
            value={certifications}
            onChange={setCertifications}
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

      {/* Profile image action sheet */}
      <Modal
        visible={avatarSheetOpen}
        animationType="slide"
        transparent
        onRequestClose={closeAvatarSheet}
      >
        <View style={styles.avatarSheetBackdrop}>
          <View style={styles.avatarSheet}>
            <View style={styles.avatarSheetHandle} />
            <View style={styles.avatarSheetHeader}>
              <TouchableOpacity
                onPress={closeAvatarSheet}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="סגור"
                disabled={!!avatarBusy}
              >
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.avatarSheetTitle}>תמונת פרופיל</Text>
              <View style={{ width: 24 }} />
            </View>

            <AvatarSheetOption
              icon="camera"
              label="צלם תמונה"
              onPress={runAvatarCamera}
              busy={avatarBusy === 'camera'}
              disabled={!!avatarBusy}
            />
            <AvatarSheetOption
              icon="images"
              label="בחר מהגלריה"
              onPress={runAvatarGallery}
              busy={avatarBusy === 'gallery'}
              disabled={!!avatarBusy}
            />
            {!!avatarUri && (
              <AvatarSheetOption
                icon="trash-outline"
                label="הסר תמונה"
                onPress={removeAvatar}
                disabled={!!avatarBusy}
                destructive
              />
            )}

            {!!avatarNotice && <Text style={styles.avatarNoticeText}>{avatarNotice}</Text>}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

// ---------- subcomponents ----------

const AvatarSheetOption: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}> = ({ icon, label, onPress, busy, disabled, destructive }) => (
  <TouchableOpacity
    style={[styles.avatarSheetRow, disabled && !busy && styles.avatarSheetRowDisabled]}
    onPress={onPress}
    activeOpacity={0.75}
    disabled={disabled}
  >
    {busy ? (
      <ActivityIndicator size="small" color={Colors.primary} />
    ) : (
      <Ionicons name={icon} size={22} color={destructive ? Colors.danger : Colors.primary} />
    )}
    <Text style={[styles.avatarSheetRowText, destructive && { color: Colors.danger }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

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

  avatarEditWrap: { alignItems: 'center', gap: Spacing.sm },
  avatarTouchable: { position: 'relative' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditLink: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  avatarSheetBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  avatarSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Spacing.xl,
  },
  avatarSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  avatarSheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatarSheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  avatarSheetRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.gray50,
  },
  avatarSheetRowDisabled: { opacity: 0.5 },
  avatarSheetRowText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  avatarNoticeText: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    fontSize: FontSize.xs,
    color: Colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
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
  chipWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
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
