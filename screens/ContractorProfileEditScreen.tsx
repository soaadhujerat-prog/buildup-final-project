import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
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
import ContractorAvatar from '../components/ContractorAvatar';
import StatusBadge from '../components/StatusBadge';
import DocumentUploadField from '../components/DocumentUploadField';
import AttachedDocument from '../components/AttachedDocument';
import DatePickerField from '../components/DatePickerField';
import { AREAS_ISRAEL } from '../data/areas';
import { Contractor, UploadedDocument } from '../types';
import {
  isValidIsraeliPhone,
  normalizePhone,
  formatDateIL,
  getContractorLicenseStatus,
  dmyToIso,
} from '../utils/helpers';
import { contractorAreas } from '../utils/normalize';

interface Props {
  onBack: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ContractorProfileEditScreen: React.FC<Props> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    updateContractorProfile,
    openSupportTicket,
    submitContractorLicenseUpdate,
    getPendingLicenseRequestForContractor,
  } = useApp();
  const me = currentUser as Contractor | undefined;

  const [fullName, setFullName] = useState(me?.fullName ?? '');
  const [companyName, setCompanyName] = useState(me?.companyName ?? '');
  const [phone, setPhone] = useState(me?.phone ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  // Official identifier — like an ID number, NOT self-editable after the
  // account exists. Shown read-only; changes go through a support request.
  const regNumber = me?.contractorRegistrationNumber ?? '';
  const [regChangeOpen, setRegChangeOpen] = useState(false);
  const [regChangeNewNumber, setRegChangeNewNumber] = useState('');
  const [regChangeReason, setRegChangeReason] = useState('');
  const [regChangeSubmitting, setRegChangeSubmitting] = useState(false);
  const [city, setCity] = useState(me?.city ?? 'תל אביב');
  const [areasOfOperation, setAreasOfOperation] = useState<string[]>(
    me ? contractorAreas(me) : []
  );
  const toggleArea = (a: string) =>
    setAreasOfOperation((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  const [projectTypes, setProjectTypes] = useState<string[]>(
    me?.projectTypes ?? []
  );
  // Classification / licence text is a VERIFIED field — read-only here, like
  // the registration number. A change goes through a licence-update request.
  const licenseDetails = me?.licenseDetails ?? '';
  const [bio, setBio] = useState(me?.bio ?? '');
  const [submitting, setSubmitting] = useState(false);

  // Licence-update request (new document and/or new classification). Does NOT
  // touch the current approved licence — an admin must approve it first.
  const pendingLicenseReq = me
    ? getPendingLicenseRequestForContractor(me.id)
    : undefined;
  const [licenseDocReq, setLicenseDocReq] = useState<UploadedDocument | null>(
    null
  );
  const [licenseValidUntilReq, setLicenseValidUntilReq] = useState('');
  const [licenseDetailsReq, setLicenseDetailsReq] = useState('');
  const [licenseRegNumberReq, setLicenseRegNumberReq] = useState('');
  const [licenseReqSubmitting, setLicenseReqSubmitting] = useState(false);

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

  const openRegChange = () => {
    setRegChangeNewNumber('');
    setRegChangeReason('');
    setRegChangeOpen(true);
  };

  const submitRegChange = async () => {
    if (!me || regChangeSubmitting) return;
    const requested = regChangeNewNumber.trim();
    if (!requested || !/^\d+$/.test(requested)) {
      Alert.alert('שגיאה', 'יש להזין מספר רישום קבלן תקין');
      return;
    }
    if (requested === regNumber) {
      Alert.alert('שגיאה', 'המספר המבוקש זהה למספר הנוכחי.');
      return;
    }
    setRegChangeSubmitting(true);
    try {
      const reason = regChangeReason.trim();
      const description =
        `בקשה לשינוי מספר רישום קבלנים.\n` +
        `מספר נוכחי: ${regNumber || '—'}\n` +
        `מספר מבוקש: ${requested}\n` +
        (reason ? `הסבר: ${reason}\n` : '') +
        `הבקשה ממתינה לאימות חיצוני על ידי מנהל המערכת. ` +
        `המספר הנוכחי נשאר ללא שינוי עד לאישור.`;
      await openSupportTicket(
        me.id,
        'contractor',
        'question',
        'בקשה לשינוי מספר רישום קבלנים',
        description
      );
      setRegChangeOpen(false);
      Alert.alert(
        'הבקשה נשלחה',
        'הבקשה לשינוי מספר הרישום נשלחה למנהל המערכת ותטופל לאחר אימות חיצוני. המספר הנוכחי נשאר ללא שינוי בינתיים.'
      );
    } catch {
      Alert.alert('שגיאה', 'שליחת הבקשה נכשלה. נסה שוב.');
    } finally {
      setRegChangeSubmitting(false);
    }
  };

  const submitLicenseRequest = async () => {
    if (!me || licenseReqSubmitting) return;
    const proposedIso = dmyToIso(licenseValidUntilReq);
    if (!licenseDocReq || !proposedIso) {
      Alert.alert(
        'שגיאה',
        'יש לצרף מסמך רישיון חדש ולהזין את תאריך התוקף שמופיע בו.'
      );
      return;
    }
    setLicenseReqSubmitting(true);
    try {
      const req = await submitContractorLicenseUpdate(me.id, {
        newLicenseDocument: licenseDocReq,
        proposedValidUntil: proposedIso,
        newLicenseDetails: licenseDetailsReq.trim() || undefined,
        newRegistrationNumber: licenseRegNumberReq.trim() || undefined,
      });
      if (!req) {
        Alert.alert(
          'לא ניתן לשלוח',
          'כבר קיימת בקשת עדכון רישיון שממתינה לאישור מנהל המערכת.'
        );
        return;
      }
      setLicenseDocReq(null);
      setLicenseValidUntilReq('');
      setLicenseDetailsReq('');
      setLicenseRegNumberReq('');
      Alert.alert(
        'הבקשה נשלחה',
        'בקשת עדכון הרישיון נשלחה למנהל המערכת. הרישיון המאושר הנוכחי נשאר בתוקף עד לאישור הבקשה.'
      );
    } catch {
      Alert.alert('שגיאה', 'שליחת הבקשה נכשלה. נסה שוב.');
    } finally {
      setLicenseReqSubmitting(false);
    }
  };

  if (!me || me.role !== 'contractor') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>אין משתמש פעיל</Text>
      </View>
    );
  }

  const handleSave = async () => {
    if (submitting) return;
    if (!fullName.trim()) return Alert.alert('שגיאה', 'שם מלא חובה');
    if (!companyName.trim()) return Alert.alert('שגיאה', 'שם החברה חובה');
    if (!isValidIsraeliPhone(phone))
      return Alert.alert('שגיאה', 'מספר טלפון לא תקין');
    if (!EMAIL_RE.test(email.trim()))
      return Alert.alert('שגיאה', 'כתובת אימייל לא תקינה');
    if (!regNumber.trim())
      return Alert.alert('שגיאה', 'מספר רישום קבלנים חובה');
    if (!licenseDetails.trim())
      return Alert.alert('שגיאה', 'פרטי רישיון חובה');
    if (areasOfOperation.length === 0)
      return Alert.alert('שגיאה', 'יש לבחור לפחות אזור פעילות אחד');
    if (projectTypes.length === 0)
      return Alert.alert('שגיאה', 'יש להוסיף לפחות סוג פרויקט אחד');

    setSubmitting(true);
    try {
      await updateContractorProfile(me.id, {
        fullName: fullName.trim(),
        companyName: companyName.trim(),
        phone: normalizePhone(phone),
        email: email.trim(),
        contractorRegistrationNumber: regNumber.trim(),
        city,
        areasOfOperation,
        areaOfOperation: areasOfOperation[0],
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
        <Text style={styles.headerTitle} pointerEvents="none">עריכת פרופיל</Text>
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
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>מספר רישום קבלנים</Text>
            </View>
            <View style={styles.readonlyField}>
              <Ionicons
                name="lock-closed"
                size={14}
                color={Colors.textMuted}
              />
              <Text style={styles.readonlyValue}>{regNumber || '—'}</Text>
            </View>
            <Text style={styles.readonlyHint}>
              לשינוי מספר הרישום יש לפנות למנהל המערכת לצורך אימות.
            </Text>
            <TouchableOpacity
              style={styles.regChangeBtn}
              onPress={openRegChange}
              activeOpacity={0.85}
            >
              <Ionicons
                name="create-outline"
                size={16}
                color={Colors.primary}
              />
              <Text style={styles.regChangeBtnText}>
                בקשה לשינוי מספר רישום
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>פרטי רישיון / סיווג</Text>
            </View>
            <View style={styles.readonlyField}>
              <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
              <Text style={[styles.readonlyValue, { writingDirection: 'rtl', textAlign: 'right' }]}>
                {licenseDetails || '—'}
              </Text>
            </View>
            <Text style={styles.readonlyHint}>
              לעדכון הסיווג או מסמך הרישיון יש להגיש בקשת עדכון רישיון (למטה)
              לאישור מנהל המערכת.
            </Text>
          </View>
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
                    onPress={() => toggleArea(a)}
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
          <ChipInput
            label="סוגי פרויקטים"
            values={projectTypes}
            onChange={setProjectTypes}
            placeholder="הוסף סוג פרויקט..."
          />
        </Section>

        <Section title="עדכון רישיון קבלן">
          {/* Current approved licence — read-only reference */}
          <View style={styles.licenseCurrentRow}>
            <StatusBadge
              label={getContractorLicenseStatus(me).label}
              tone={getContractorLicenseStatus(me).tone}
              small
            />
            <Text style={styles.label}>רישיון נוכחי</Text>
          </View>
          <View style={styles.inputGroup}>
            <View style={styles.readonlyField}>
              <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
              <Text style={[styles.readonlyValue, { writingDirection: 'ltr' }]}>
                {me.contractorRegistrationNumber || '—'}
              </Text>
            </View>
            <Text style={styles.readonlyHint}>
              סיווג: {me.licenseDetails || '—'}
              {'\n'}בתוקף עד:{' '}
              {me.licenseValidUntil ? formatDateIL(me.licenseValidUntil) : '—'}
            </Text>
          </View>
          <View style={{ marginTop: 4 }}>
            <AttachedDocument doc={me.contractorLicenseDocument} />
          </View>

          {pendingLicenseReq ? (
            <View style={styles.licensePendingBox}>
              <Ionicons
                name="hourglass-outline"
                size={18}
                color={Colors.warning}
              />
              <Text style={styles.licensePendingText}>
                בקשת עדכון רישיון ממתינה לאישור מנהל המערכת. הרישיון המאושר
                הנוכחי נשאר בתוקף עד שההחלטה תתקבל.
              </Text>
            </View>
          ) : (
            <>
              <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 4 }} />
              <Text style={[styles.label, { textAlign: 'right', width: '100%' }]}>
                רישיון חדש
              </Text>
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>מסמך רישיון חדש</Text>
                </View>
                <DocumentUploadField
                  value={licenseDocReq}
                  onChange={setLicenseDocReq}
                  label="רישיון קבלן / תעודת קבלן חדשים"
                  documentType="contractor_license"
                  sheetTitle="העלאת רישיון חדש"
                  emptyHint="צילום, גלריה או קובץ PDF של הרישיון המחודש"
                />
              </View>
              <DatePickerField
                label="בתוקף עד (כפי שמופיע ברישיון החדש)"
                value={licenseValidUntilReq}
                onChange={setLicenseValidUntilReq}
                minimumDate={new Date()}
              />
              <Field
                label="סיווג חדש (אופציונלי)"
                value={licenseDetailsReq}
                onChange={setLicenseDetailsReq}
              />
              <Field
                label="מספר רישום חדש (רק אם השתנה)"
                value={licenseRegNumberReq}
                onChange={(t) =>
                  setLicenseRegNumberReq(t.replace(/\D/g, '').slice(0, 12))
                }
                keyboardType="numeric"
              />
              <Text style={styles.readonlyHint}>
                הרישיון המאושר הנוכחי יישאר פעיל עד שמנהל המערכת יאשר את
                הרישיון החדש. אם הבקשה תידחה — הרישיון הנוכחי יישאר בתוקף.
              </Text>
              <TouchableOpacity
                style={[
                  styles.licenseReqBtn,
                  licenseReqSubmitting && { opacity: 0.7 },
                ]}
                onPress={submitLicenseRequest}
                disabled={licenseReqSubmitting}
                activeOpacity={0.85}
              >
                <Ionicons name="cloud-upload-outline" size={16} color={Colors.white} />
                <Text style={styles.licenseReqBtnText}>
                  {licenseReqSubmitting
                    ? 'שולח...'
                    : 'שלח בקשה לעדכון רישיון'}
                </Text>
              </TouchableOpacity>
            </>
          )}
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
        visible={regChangeOpen}
        animationType="slide"
        transparent
        onRequestClose={() => !regChangeSubmitting && setRegChangeOpen(false)}
      >
        {/* Tap any empty area (backdrop OR inside the sheet, outside an input)
            → dismiss the keyboard only. The sheet stays open and typed text
            is kept. Nested TouchableOpacity buttons still receive their taps. */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.regModalBackdrop}>
            <KeyboardAvoidingView
              style={styles.regModalKav}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <TouchableWithoutFeedback
                onPress={Keyboard.dismiss}
                accessible={false}
              >
                <View style={styles.regModalCard}>
                  <View style={styles.avatarSheetHandle} />
                  <Text style={styles.regModalTitle}>
                    בקשה לשינוי מספר רישום
                  </Text>
                  <Text style={styles.regModalSub}>
                    הבקשה נשלחת למנהל המערכת. המספר הנוכחי נשאר ללא שינוי עד
                    לאימות חיצוני ואישור.
                  </Text>

                  <Text style={styles.label}>מספר רישום נוכחי</Text>
                  <View style={styles.readonlyField}>
                    <Text style={styles.readonlyValue}>{regNumber || '—'}</Text>
                  </View>

                  <Text style={styles.label}>מספר רישום חדש מבוקש</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { textAlign: 'left', writingDirection: 'ltr' },
                    ]}
                    value={regChangeNewNumber}
                    onChangeText={(t) =>
                      setRegChangeNewNumber(t.replace(/\D/g, '').slice(0, 12))
                    }
                    keyboardType="numeric"
                    maxLength={12}
                    placeholder="לדוגמה: 105678"
                    placeholderTextColor={Colors.textMuted}
                  />

                  <Text style={styles.label}>הסבר (אופציונלי)</Text>
                  <TextInput
                    style={[styles.input, styles.regModalTextarea]}
                    value={regChangeReason}
                    onChangeText={setRegChangeReason}
                    placeholder="פרט/י מדוע יש לעדכן את מספר הרישום"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />

                  <View style={styles.regModalActions}>
                    <TouchableOpacity
                      style={[styles.regModalBtn, styles.regModalCancel]}
                      onPress={() => setRegChangeOpen(false)}
                      disabled={regChangeSubmitting}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.regModalCancelText}>חזור</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.regModalBtn,
                        styles.regModalConfirm,
                        regChangeSubmitting && { opacity: 0.7 },
                      ]}
                      onPress={submitRegChange}
                      disabled={regChangeSubmitting}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.regModalConfirmText}>
                        {regChangeSubmitting ? 'שולח...' : 'שליחת בקשה'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

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

  readonlyField: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  readonlyValue: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  readonlyHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.xs + 6,
  },
  regChangeBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  regChangeBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  licenseCurrentRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  licensePendingBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  licensePendingText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  licenseReqBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: Radius.full,
  },
  licenseReqBtnText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  regModalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  regModalKav: { width: '100%' },
  regModalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: 8,
  },
  regModalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  regModalSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.sm + 6,
    marginBottom: 4,
  },
  regModalTextarea: { minHeight: 80, textAlignVertical: 'top' },
  regModalActions: {
    flexDirection: 'row-reverse',
    gap: 12,
    marginTop: 8,
  },
  regModalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  regModalCancel: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  regModalCancelText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: FontSize.md,
    writingDirection: 'rtl',
  },
  regModalConfirm: { backgroundColor: Colors.primary },
  regModalConfirmText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
    writingDirection: 'rtl',
  },

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
