import React, { useState } from 'react';
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

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import ChipInput from '../components/ChipInput';
import CityPickerField from '../components/CityPickerField';
import HorizontalChipPicker from '../components/HorizontalChipPicker';
import ContractorAvatar from '../components/ContractorAvatar';
import { AREAS_ISRAEL } from '../data/mockData';
import { Contractor } from '../types';

interface Props {
  onBack: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0\d{8,9}$/;

const ContractorProfileEditScreen: React.FC<Props> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { currentUser, updateContractorProfile } = useApp();
  const me = currentUser as Contractor | undefined;

  const [fullName, setFullName] = useState(me?.fullName ?? '');
  const [companyName, setCompanyName] = useState(me?.companyName ?? '');
  const [phone, setPhone] = useState(me?.phone ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  const [regNumber, setRegNumber] = useState(
    me?.contractorRegistrationNumber ?? ''
  );
  const [city, setCity] = useState(me?.city ?? 'תל אביב');
  const [areaOfOperation, setAreaOfOperation] = useState(
    me?.areaOfOperation ?? AREAS_ISRAEL[0]
  );
  const [projectTypes, setProjectTypes] = useState<string[]>(
    me?.projectTypes ?? []
  );
  const [licenseDetails, setLicenseDetails] = useState(me?.licenseDetails ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [submitting, setSubmitting] = useState(false);

  // Company photo / logo — reuses the shared BaseUser.avatarUrl field (one
  // source of truth for "the image that represents this contractor"),
  // entirely separate from ID / verification documents. Local URI only for
  // now; a Supabase Storage path slots in here later without any UI change.
  const [avatarUri, setAvatarUri] = useState<string | undefined>(me?.avatarUrl);
  const [avatarSheetOpen, setAvatarSheetOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState<'camera' | 'gallery' | null>(
    null
  );
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);

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

  if (!me || me.role !== 'contractor') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>אין משתמש פעיל</Text>
      </View>
    );
  }

  const handleSave = () => {
    if (submitting) return;
    if (!fullName.trim()) return Alert.alert('שגיאה', 'שם מלא חובה');
    if (!companyName.trim()) return Alert.alert('שגיאה', 'שם החברה חובה');
    if (!PHONE_RE.test(phone.trim()))
      return Alert.alert('שגיאה', 'מספר טלפון לא תקין');
    if (!EMAIL_RE.test(email.trim()))
      return Alert.alert('שגיאה', 'כתובת אימייל לא תקינה');
    if (!regNumber.trim())
      return Alert.alert('שגיאה', 'מספר רישום קבלנים חובה');
    if (!licenseDetails.trim())
      return Alert.alert('שגיאה', 'פרטי רישיון חובה');
    if (projectTypes.length === 0)
      return Alert.alert('שגיאה', 'יש להוסיף לפחות סוג פרויקט אחד');

    setSubmitting(true);
    try {
      updateContractorProfile(me.id, {
        fullName: fullName.trim(),
        companyName: companyName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        contractorRegistrationNumber: regNumber.trim(),
        city,
        areaOfOperation,
        projectTypes,
        licenseDetails: licenseDetails.trim(),
        bio: bio.trim(),
        avatarUrl: avatarUri,
      });
      Alert.alert('נשמר', 'הפרופיל שלך עודכן בהצלחה.', [
        { text: 'אישור', onPress: onBack },
      ]);
    } catch {
      Alert.alert('שגיאה', 'שמירת הפרופיל נכשלה. נסה שוב.');
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
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>עריכת פרופיל</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Section title="תמונה / לוגו חברה">
          <View style={styles.avatarEditWrap}>
            <TouchableOpacity
              onPress={openAvatarSheet}
              activeOpacity={0.8}
              style={styles.avatarTouchable}
            >
              <ContractorAvatar
                contractor={{ avatarUrl: avatarUri }}
                size={92}
              />
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={16} color={Colors.white} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={openAvatarSheet} activeOpacity={0.7}>
              <Text style={styles.avatarEditLink}>החלפת תמונה / לוגו</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <Section title="פרטים אישיים">
          <Field label="שם מלא" value={fullName} onChange={setFullName} />
          <Field
            label="שם החברה"
            value={companyName}
            onChange={setCompanyName}
          />
        </Section>

        <Section title="פרטי קשר">
          <Field
            label="טלפון"
            value={phone}
            onChange={setPhone}
            keyboardType="phone-pad"
            ltr
          />
          <Field
            label="אימייל"
            value={email}
            onChange={setEmail}
            keyboardType="email-address"
            ltr
          />
          <CityPickerField label="עיר" value={city} onChange={setCity} />
        </Section>

        <Section title="פרטי הקבלנות">
          <Field
            label="מספר רישום קבלנים"
            value={regNumber}
            onChange={setRegNumber}
            keyboardType="numeric"
            ltr
          />
          <Field
            label="פרטי רישיון / סיווג"
            value={licenseDetails}
            onChange={setLicenseDetails}
          />
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>אזור פעילות</Text>
            </View>
            <HorizontalChipPicker
              options={AREAS_ISRAEL}
              value={areaOfOperation}
              onChange={setAreaOfOperation}
              chipStyle={styles.chip}
              chipActiveStyle={styles.chipActive}
              textStyle={styles.chipText}
              textActiveStyle={styles.chipTextActive}
            />
          </View>
          <ChipInput
            label="סוגי פרויקטים"
            values={projectTypes}
            onChange={setProjectTypes}
            placeholder="הוסף סוג פרויקט..."
          />
        </Section>

        <Section title="אודות">
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>תיאור קצר על החברה</Text>
            </View>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={bio}
              onChangeText={setBio}
              placeholder="ספר/י על החברה, תחומי התמחות, ניסיון..."
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
              <Text style={styles.avatarSheetTitle}>תמונה / לוגו חברה</Text>
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

            {!!avatarNotice && (
              <Text style={styles.avatarNoticeText}>{avatarNotice}</Text>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const AvatarSheetOption: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}> = ({ icon, label, onPress, busy, disabled, destructive }) => (
  <TouchableOpacity
    style={[
      styles.avatarSheetRow,
      disabled && !busy && styles.avatarSheetRowDisabled,
    ]}
    onPress={onPress}
    activeOpacity={0.75}
    disabled={disabled}
  >
    {busy ? (
      <ActivityIndicator size="small" color={Colors.primary} />
    ) : (
      <Ionicons
        name={icon}
        size={22}
        color={destructive ? Colors.danger : Colors.primary}
      />
    )}
    <Text
      style={[
        styles.avatarSheetRowText,
        destructive && { color: Colors.danger },
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

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
  ltr?: boolean;
}> = ({ label, value, onChange, keyboardType = 'default', ltr }) => (
  <View style={styles.inputGroup}>
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
    </View>
    <TextInput
      style={[styles.input, ltr && { textAlign: 'left', writingDirection: 'ltr' }]}
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

  avatarEditWrap: { alignItems: 'center', gap: 10, width: '100%' },
  avatarTouchable: { position: 'relative' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    borderWidth: 3,
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
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.sm,
  },
  avatarSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: Spacing.md,
  },
  avatarSheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  avatarSheetTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  avatarSheetRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  avatarSheetRowDisabled: { opacity: 0.5 },
  avatarSheetRowText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  avatarNoticeText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 6,
  },

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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
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

export default ContractorProfileEditScreen;
