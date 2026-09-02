import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Modal,
  Image,
  Alert,
  Linking,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import WorkerAvatar from '../components/WorkerAvatar';
import ContractorAvatar from '../components/ContractorAvatar';
import AttachedDocument from '../components/AttachedDocument';
import { isImageDocument, formatFileSize } from '../components/DocumentUploadField';
import {
  formatDateTime,
  formatDateIL,
  registrationEventDisplay,
} from '../utils/helpers';
import {
  ContractorRegistrationData,
  WorkerRegistrationData,
} from '../types';
import {
  workerProfessions,
  contractorAreas,
  normalizeCertifications,
} from '../utils/normalize';
import {
  RegistrationError,
  revealRegistrationIdNumber,
} from '../services/registrationService';

/** Generic, non-leaking message for a failed admin registration action. */
function regActionErrMsg(e: unknown): string {
  const code = e instanceof RegistrationError ? e.code : '';
  if (code === 'forbidden') return 'אין לך הרשאה לבצע פעולה זו.';
  if (code === 'reason_required') return 'יש לציין סיבת דחייה.';
  return 'הפעולה נכשלה. בדוק/י את החיבור לאינטרנט ונסה/י שוב.';
}

type RegStatusFilter = 'pending' | 'approved' | 'rejected';

interface Props {
  registrationId: string;
  onBack: () => void;
  /** Called after approve / reject / undo — tells the navigator which status
   *  tab of "בקשות רישום" to land on. Falls back to onBack when absent. */
  onResolved?: (status: RegStatusFilter) => void;
  /** Admin-only: open the live user card of the user this registration
   *  created (only meaningful once approved). */
  onOpenUser?: (userId: string) => void;
}

const RegistrationDetailsScreen: React.FC<Props> = ({
  registrationId,
  onBack,
  onResolved,
  onOpenUser,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    getRegistration,
    getUserById,
    approveRegistration,
    rejectRegistration,
    revertRegistrationRejection,
  } = useApp();

  const reg = getRegistration(registrationId);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [approveMessage, setApproveMessage] = useState('');
  const [idImageViewerVisible, setIdImageViewerVisible] = useState(false);
  // The applicant's ID number is not in `reg.data` (HMAC + ciphertext only).
  // Fetch the decrypted value via the admin-only `admin-reveal-id` path.
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const dataIdNumber = reg?.data.idNumber;
  useEffect(() => {
    if (dataIdNumber) return;
    let alive = true;
    revealRegistrationIdNumber(registrationId)
      .then((id) => {
        if (alive) setRevealedId(id);
      })
      .catch(() => {
        if (alive) setRevealedId(null);
      });
    return () => {
      alive = false;
    };
  }, [registrationId, dataIdNumber]);

  if (!reg) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>בקשה לא נמצאה</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isWorker = reg.role === 'worker';
  const data = reg.data;
  const wd = isWorker ? (data as WorkerRegistrationData) : null;
  const cd = !isWorker ? (data as ContractorRegistrationData) : null;

  // The live user this registration created (only once approved). This is a
  // real foreign-key lookup — never a duplicated user object.
  const linkedUser = reg.createdUserId
    ? getUserById(reg.createdUserId)
    : undefined;

  const openApproveModal = () => {
    setApproveMessage('');
    setApproveModalVisible(true);
  };

  const done = (status: RegStatusFilter) =>
    onResolved ? onResolved(status) : onBack();

  const submitApprove = async () => {
    try {
      await approveRegistration(
        reg.id,
        currentUser?.id ?? 'adm1',
        approveMessage.trim() || undefined
      );
      setApproveModalVisible(false);
      Alert.alert('הרישום אושר', `${data.fullName} אושר/ה בהצלחה.`, [
        { text: 'אישור', onPress: () => done('approved') },
      ]);
    } catch (e) {
      Alert.alert('אישור נכשל', regActionErrMsg(e));
    }
  };

  const handleRevertRejection = () => {
    Alert.alert(
      'ביטול דחייה',
      `להחזיר את הבקשה של ${data.fullName} לרשימת הבקשות הממתינות לבדיקה מחודשת? הבקשה לא תאושר אוטומטית, והיסטוריית הדחייה תישמר.`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'החזר לבדיקה',
          style: 'default',
          onPress: async () => {
            try {
              await revertRegistrationRejection(reg.id, currentUser?.id ?? 'adm1');
              Alert.alert(
                'הבקשה הוחזרה',
                'הבקשה חזרה לרשימת "ממתינות" לבדיקה מחודשת.',
                [{ text: 'אישור', onPress: () => done('pending') }]
              );
            } catch (e) {
              Alert.alert('הפעולה נכשלה', regActionErrMsg(e));
            }
          },
        },
      ]
    );
  };

  const openIdDocumentFile = async (uri: string) => {
    try {
      const canOpen = await Linking.canOpenURL(uri);
      if (!canOpen) throw new Error('cannot open');
      await Linking.openURL(uri);
    } catch {
      Alert.alert('לא ניתן לפתוח', 'לא ניתן לפתוח את הקובץ במכשיר זה.');
    }
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      Alert.alert('שגיאה', 'יש לציין סיבת דחייה');
      return;
    }
    Alert.alert(
      'דחיית רישום',
      `האם לדחות את הרישום של ${data.fullName}?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'דחה',
          style: 'destructive',
          onPress: async () => {
            try {
              await rejectRegistration(
                reg.id,
                currentUser?.id ?? 'adm1',
                rejectReason.trim()
              );
              setRejectModalVisible(false);
              Alert.alert('הרישום נדחה', `הרישום של ${data.fullName} נדחה.`, [
                { text: 'אישור', onPress: () => done('rejected') },
              ]);
            } catch (e) {
              Alert.alert('הדחייה נכשלה', regActionErrMsg(e));
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">פרטי בקשת רישום</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status / role / id summary */}
        <View style={styles.heroCard}>
          {isWorker ? (
            <WorkerAvatar
              worker={{ id: reg.id, fullName: data.fullName }}
              size={60}
            />
          ) : (
            <ContractorAvatar contractor={null} size={60} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{data.fullName}</Text>
            <Text style={styles.heroRole}>
              {isWorker ? 'עובד' : 'קבלן'}
            </Text>
            <View style={{ marginTop: 6, flexDirection: 'row-reverse' }}>
              <StatusBadge
                label={statusLabel(reg.status)}
                tone={statusTone(reg.status)}
                small
              />
            </View>
          </View>
        </View>

        {/* Rejected summary — this record is NOT deleted; the reason and the
            time it was rejected stay visible, and the admin can send it back
            to review from the action bar below. */}
        {reg.status === 'rejected' && (
          <Section title="סטטוס הבקשה">
            <Text style={styles.rejectedLine}>
              הבקשה נדחתה ב־
              <Text style={{ writingDirection: 'ltr' }}>
                {formatDateTime(reg.rejectedAt ?? reg.processedAt)}
              </Text>
            </Text>
            <View style={styles.reasonCard}>
              <Text style={styles.reasonCardLabel}>סיבת הדחייה</Text>
              <Text style={styles.reasonCardText}>
                {reg.rejectionReason ?? 'הסיבה לא צוינה.'}
              </Text>
            </View>
          </Section>
        )}

        {/* Approved summary — the original registration record is kept even
            though a live user now exists. These are the details AS SUBMITTED
            at sign-up (a historical snapshot); the user's up-to-date profile
            lives in "פרטי משתמש". */}
        {reg.status === 'approved' && (
          <Section title="סטטוס הבקשה">
            <Text style={styles.approvedLine}>
              הבקשה אושרה ב־
              <Text style={{ writingDirection: 'ltr' }}>
                {formatDateTime(reg.approvedAt ?? reg.processedAt)}
              </Text>
            </Text>
            {reg.approvalMessage ? (
              <Text style={styles.approvedNote}>
                הודעה למשתמש: {reg.approvalMessage}
              </Text>
            ) : null}
            <Text style={styles.snapshotNote}>
              הפרטים שבמסך זה הם צילום מצב של מה שנמסר בעת ההרשמה. הפרופיל
              המעודכן של המשתמש נמצא ב"פרטי משתמש".
            </Text>
          </Section>
        )}

        {/* Full status audit trail — appended, never overwritten. Rendered via
            registrationEventDisplay() so raw backend codes ("submitted",
            "pending → pending", …) are never shown; a real admin
            reason/message is surfaced separately as its own line. */}
        {reg.statusHistory && reg.statusHistory.length > 0 && (
          <Section title="היסטוריית סטטוס">
            {reg.statusHistory.map((e) => {
              const ev = registrationEventDisplay(e);
              return (
                <View key={e.id} style={styles.historyRow}>
                  <Text style={styles.historyText}>{ev.title}</Text>
                  {!!ev.detail && (
                    <Text style={styles.historyDetail}>{ev.detail}</Text>
                  )}
                  <Text style={styles.historyDate}>
                    <Text style={{ writingDirection: 'ltr' }}>
                      {formatDateTime(e.createdAt)}
                    </Text>
                  </Text>
                </View>
              );
            })}
          </Section>
        )}

        {/* External checks — there is no access to an authorized government
            API to call, so these are always shown as pending external
            verification, never as a fabricated pass. The admin still
            approves/rejects manually regardless of this section. */}
        <Section title="בדיקות אימות חיצוני">
          <CheckRow label="אימות תעודת זהות מול מערכת ממשלתית" />
          {!isWorker && <CheckRow label="אימות מספר רישום קבלן" />}
          <Text style={styles.notes}>
            בשלב זה מנהל המערכת בודק את הפרטים ידנית. אימות מקוון מול מאגר
            ממשלתי כפוף לזמינות שירות ממשלתי מורשה.
          </Text>
          {reg.externalChecks.eligibilityNotes && (
            <Text style={styles.notes}>
              הערות: {reg.externalChecks.eligibilityNotes}
            </Text>
          )}
        </Section>

        {/* Document the applicant attached during sign-up, if any */}
        <Section title="צילום תעודת זהות">
          {!data.idDocument ? (
            <View style={styles.idPhotoPlaceholder}>
              <Ionicons
                name="alert-circle-outline"
                size={36}
                color={Colors.textMuted}
              />
              <Text style={styles.idPhotoLabel}>לא צורפה תעודת זהות</Text>
            </View>
          ) : isImageDocument(data.idDocument) ? (
            <TouchableOpacity
              onPress={() => setIdImageViewerVisible(true)}
              activeOpacity={0.85}
            >
              <Image
                source={{ uri: data.idDocument.uri }}
                style={styles.idPhotoImage}
                resizeMode="cover"
              />
              <Text style={styles.idPhotoTapHint}>הקש להגדלה</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.idFileCard}
              onPress={() => openIdDocumentFile(data.idDocument!.uri)}
              activeOpacity={0.85}
            >
              <View style={styles.idFileIconWrap}>
                <Ionicons name="document-text" size={26} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.idFileName} numberOfLines={1}>
                  {data.idDocument.fileName}
                </Text>
                {!!formatFileSize(data.idDocument.size) && (
                  <Text style={styles.idFileMeta}>
                    {formatFileSize(data.idDocument.size)}
                  </Text>
                )}
              </View>
              <Ionicons name="open-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </Section>

        {/* Identity */}
        <Section title="פרטים אישיים">
          <FieldRow label="שם מלא" value={data.fullName} />
          <FieldRow
            label="תעודת זהות"
            value={data.idNumber ?? revealedId ?? '—'}
            mono
            ltr
          />
          <FieldRow
            label="טלפון"
            value={data.phone}
            ltr
            onPress={() => Linking.openURL(`tel:${data.phone}`)}
          />
          <FieldRow
            label="אימייל"
            value={data.email}
            ltr
            onPress={() => Linking.openURL(`mailto:${data.email}`)}
          />
          <FieldRow label="עיר" value={data.city} />
        </Section>

        {/* Worker-only */}
        {wd && (
          <>
            <Section title="פרופיל מקצועי">
              <FieldRow
                label={workerProfessions(wd).length > 1 ? 'מקצועות' : 'מקצוע'}
                value={workerProfessions(wd).join(', ')}
              />
              <FieldRow label="תחום" value={wd.professionCategory} />
              <FieldRow
                label="שנות ניסיון"
                value={`${wd.experienceYears} שנים`}
              />
              <FieldRow
                label="מיומנויות"
                value={wd.skills.length ? wd.skills.join(', ') : '—'}
              />
            </Section>

            <Section title="תעודות והסמכות">
              {normalizeCertifications(wd.certifications).length === 0 ? (
                <Text style={styles.emptyLine}>לא הוזנו תעודות בהרשמה</Text>
              ) : (
                normalizeCertifications(wd.certifications).map((cert, i) => (
                  <View key={cert.id ?? `${i}-${cert.name}`} style={styles.certRow}>
                    <Text style={styles.certName}>{cert.name}</Text>
                    <AttachedDocument doc={cert.document} />
                  </View>
                ))
              )}
            </Section>

            <Section title="זמינות ותעריפים">
              <FieldRow
                label="זמין מיד"
                value={wd.isAvailable ? 'כן' : 'לא'}
              />
              <FieldRow
                label="אזורים מועדפים"
                value={wd.preferredAreas.join(', ') || '—'}
              />
              <FieldRow label="תעריף שעתי" value={`${wd.hourlyRate} ₪`} ltr />
              <FieldRow label="תעריף יומי" value={`${wd.dailyRate} ₪`} ltr />
            </Section>
          </>
        )}

        {/* Contractor-only */}
        {cd && (
          <>
            <Section title="פרטי הקבלן">
              <FieldRow label="חברה" value={cd.companyName} />
              <FieldRow
                label="אזורי פעילות"
                value={contractorAreas(cd).join(', ') || '—'}
              />
              <FieldRow
                label="סוגי פרויקטים"
                value={cd.projectTypes.join(', ')}
              />
            </Section>

            {/* Licence — part of the original registration snapshot. The live
                verification status is derived on the user's profile, not here. */}
            <Section title="רישיון קבלן">
              <FieldRow
                label="מספר רישום"
                value={cd.contractorRegistrationNumber}
                mono
                ltr
              />
              <FieldRow label="פרטי רישיון / סיווג" value={cd.licenseDetails} />
              <FieldRow
                label="בתוקף עד"
                value={
                  cd.licenseValidUntil
                    ? formatDateIL(cd.licenseValidUntil)
                    : '—'
                }
                ltr
              />
              <View style={styles.certRow}>
                <Text style={styles.certName}>מסמך הרישיון</Text>
                <AttachedDocument doc={cd.licenseDocument} />
              </View>
              <Text style={styles.notes}>
                סטטוס אימות: ממתין לבדיקת מנהל המערכת. הרישיון ייבדק ידנית על
                בסיס המסמך והתאריך שהוגשו. אימות מקוון מול מאגר ממשלתי כפוף
                לזמינות שירות ממשלתי מורשה.
              </Text>
            </Section>
          </>
        )}

        {data.bio && (
          <Section title="אודות">
            <Text style={styles.bio}>{data.bio}</Text>
          </Section>
        )}

        <Text style={styles.submittedAt}>
          הוגש ב-
          <Text style={{ writingDirection: 'ltr' }}>
            {new Date(reg.submittedAt).toLocaleString('he-IL')}
          </Text>
        </Text>
      </ScrollView>

      {/* Action bar — pending: approve / reject; rejected: send back to review */}
      {reg.status === 'pending' && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => setRejectModalVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="close-circle" size={20} color={Colors.danger} />
            <Text style={styles.rejectText}>דחה</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={openApproveModal}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
            <Text style={styles.approveText}>אשר רישום</Text>
          </TouchableOpacity>
        </View>
      )}
      {reg.status === 'rejected' && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={handleRevertRejection}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-circle" size={20} color={Colors.white} />
            <Text style={styles.approveText}>בטל דחייה והחזר לבדיקה</Text>
          </TouchableOpacity>
        </View>
      )}
      {reg.status === 'approved' && linkedUser && onOpenUser && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.viewUserBtn]}
            onPress={() => onOpenUser(linkedUser.id)}
            activeOpacity={0.85}
          >
            <Ionicons
              name="person-circle-outline"
              size={20}
              color={Colors.white}
            />
            <Text style={styles.approveText}>צפה בפרטי המשתמש</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reject modal — tap any empty area (backdrop or inside the sheet
          outside the input) dismisses the keyboard only; the sheet stays
          open and the typed reason is kept. */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView
              style={styles.modalKav}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <TouchableWithoutFeedback
                onPress={Keyboard.dismiss}
                accessible={false}
              >
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>דחיית רישום</Text>
                  </View>
                  <Text style={styles.modalSub}>
                    ציין סיבה ברורה. הסיבה תוצג למבקש במסך הסטטוס שלו.
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    placeholder="לדוגמה: תעודת הזהות לא אומתה"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalBtnCancel]}
                      onPress={() => setRejectModalVisible(false)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnCancelText}>ביטול</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalBtnConfirm]}
                      onPress={handleReject}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnConfirmText}>שלח דחייה</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Approve modal — optional message to the user; same keyboard UX */}
      <Modal
        visible={approveModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setApproveModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView
              style={styles.modalKav}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <TouchableWithoutFeedback
                onPress={Keyboard.dismiss}
                accessible={false}
              >
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>אישור רישום</Text>
                  </View>
                  <Text style={styles.modalSub}>
                    האם לאשר את הרישום של {data.fullName}?
                  </Text>
                  <Text style={styles.fieldLabel}>הודעה למשתמש (אופציונלי)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={approveMessage}
                    onChangeText={setApproveMessage}
                    placeholder="שמחים לצרף אותך ל-BuildUp!"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalBtnCancel]}
                      onPress={() => setApproveModalVisible(false)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnCancelText}>ביטול</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalBtnApprove]}
                      onPress={submitApprove}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnConfirmText}>אשר רישום</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Full-screen ID photo viewer */}
      {data.idDocument && isImageDocument(data.idDocument) && (
        <Modal
          visible={idImageViewerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIdImageViewerVisible(false)}
        >
          <View style={styles.imageViewerBackdrop}>
            <TouchableOpacity
              style={styles.imageViewerCloseBtn}
              onPress={() => setIdImageViewerVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="סגור"
            >
              <Ionicons name="close" size={28} color={Colors.white} />
            </TouchableOpacity>
            <Image
              source={{ uri: data.idDocument.uri }}
              style={styles.imageViewerImage}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}
    </View>
  );
};

// ---------- subcomponents ----------

function statusLabel(s: string) {
  switch (s) {
    case 'pending':
      return 'ממתין לאישור';
    case 'approved':
      return 'אושר';
    case 'rejected':
      return 'נדחה';
    case 'blocked':
      return 'חסום';
    default:
      return s;
  }
}
function statusTone(
  s: string
): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (s) {
    case 'approved':
      return 'success';
    case 'pending':
      return 'warning';
    case 'rejected':
      return 'danger';
    case 'blocked':
      return 'danger';
    default:
      return 'neutral';
  }
}

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
  onPress?: () => void;
}> = ({ label, value, mono, ltr, onPress }) => (
  <View style={styles.fRow}>
    {onPress ? (
      <TouchableOpacity
        onPress={onPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text
          style={[
            styles.fValue,
            { color: Colors.primary, textDecorationLine: 'underline' },
            mono && { fontFamily: 'monospace' },
            ltr && { writingDirection: 'ltr' },
          ]}
        >
          {value}
        </Text>
      </TouchableOpacity>
    ) : (
      <Text
        style={[
          styles.fValue,
          mono && { fontFamily: 'monospace' },
          ltr && { writingDirection: 'ltr' },
        ]}
      >
        {value}
      </Text>
    )}
    <Text style={styles.fLabel}>{label}</Text>
  </View>
);

const CheckRow: React.FC<{ label: string; value?: boolean }> = ({
  label,
  value,
}) => {
  const status =
    value === undefined ? 'pending' : value ? 'ok' : 'fail';
  const meta =
    status === 'pending'
      ? { color: Colors.warning, icon: 'time-outline', text: 'ממתין לאימות חיצוני' }
      : status === 'ok'
      ? { color: Colors.success, icon: 'checkmark-circle', text: 'תקין' }
      : { color: Colors.danger, icon: 'close-circle', text: 'נכשל' };
  return (
    <View style={styles.checkRow}>
      <Text style={styles.checkLabel}>{label}</Text>
      <View style={styles.checkRight}>
        <Text style={[styles.checkText, { color: meta.color }]}>{meta.text}</Text>
        <Ionicons name={meta.icon as any} size={18} color={meta.color} />
      </View>
    </View>
  );
};

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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.medium,
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroRole: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
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
  // CheckRow ("בדיקות אימות חיצוני") gets its own layout, separate from
  // fRow/fLabel above — its label can run long ("אימות תעודת זהות מול
  // מערכת ממשלתית"), so it always stacks: the check name on its own line,
  // the status (icon + text) on the line under it — both right-aligned via
  // a plain column with alignItems: 'flex-end' (no row-reverse/justify
  // tricks on the outer container, which flip which edge "end" means).
  checkRow: {
    width: '100%',
    alignItems: 'flex-end',
    gap: 4,
    paddingVertical: 8,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkLabel: {
    width: '100%',
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  checkRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  checkText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  notes: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'right',
    marginTop: 6,
    fontStyle: 'italic',
  },

  bio: {
    fontSize: FontSize.sm,
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
    lineHeight: 22,
  },

  idPhotoPlaceholder: {
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  idPhotoLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '700',
    writingDirection: 'rtl',
    marginTop: 4,
  },
  idPhotoMeta: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  idPhotoImage: {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
  },
  idPhotoTapHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 6,
  },
  idFileCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  idFileIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idFileName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  idFileMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'ltr',
    marginTop: 2,
  },

  imageViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerCloseBtn: {
    position: 'absolute',
    top: 50,
    right: Spacing.lg,
    zIndex: 1,
    padding: 6,
  },
  imageViewerImage: { width: '100%', height: '80%' },

  idPhotoNote: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
    writingDirection: 'rtl',
    textAlign: 'center',
  },

  submittedAt: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 8,
  },

  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row-reverse',
    backgroundColor: Colors.white,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.full,
  },
  approveBtn: {
    backgroundColor: Colors.success,
    ...Shadow.small,
  },
  approveText: { color: Colors.white, fontSize: FontSize.md, fontWeight: '700' },
  rejectBtn: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.danger,
  },
  rejectText: { color: Colors.danger, fontSize: FontSize.md, fontWeight: '700' },

  rejectedLine: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  approvedLine: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  approvedNote: {
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
    marginTop: 4,
  },
  snapshotNote: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
    marginTop: 6,
    fontStyle: 'italic',
  },
  emptyLine: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    fontStyle: 'italic',
  },
  certRow: {
    width: '100%',
    gap: 6,
    paddingVertical: 8,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  certName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  viewUserBtn: {
    backgroundColor: Colors.primary,
    ...Shadow.small,
  },
  reasonCard: {
    backgroundColor: '#FEF2F2',
    borderColor: Colors.danger,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: 8,
    gap: 4,
  },
  reasonCardLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  reasonCardText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  historyRow: {
    width: '100%',
    alignItems: 'flex-end',
    gap: 2,
    paddingVertical: 6,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyDate: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'ltr',
  },
  historyText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  historyDetail: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },

  fieldLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalKav: { width: '100%' },
  modalBtnApprove: { backgroundColor: Colors.success },
  modalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    gap: 12,
  },
  modalHeader: { width: '100%', alignItems: 'flex-end' },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  modalSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  modalInput: {
    minHeight: 90,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row-reverse',
    gap: 12,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  modalBtnCancelText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  modalBtnConfirm: { backgroundColor: Colors.danger },
  modalBtnConfirmText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
});

export default RegistrationDetailsScreen;
