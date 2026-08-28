import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import { isImageDocument, formatFileSize } from '../components/DocumentUploadField';
import {
  ContractorRegistrationData,
  WorkerRegistrationData,
} from '../types';
import {
  workerProfessions,
  contractorAreas,
  certificationNames,
} from '../utils/normalize';

interface Props {
  registrationId: string;
  onBack: () => void;
}

const RegistrationDetailsScreen: React.FC<Props> = ({
  registrationId,
  onBack,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    getRegistration,
    approveRegistration,
    rejectRegistration,
  } = useApp();

  const reg = getRegistration(registrationId);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [idImageViewerVisible, setIdImageViewerVisible] = useState(false);

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

  const handleApprove = () => {
    Alert.alert(
      'אישור רישום',
      `האם לאשר את הרישום של ${data.fullName}?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'אשר',
          style: 'default',
          onPress: () => {
            approveRegistration(reg.id, currentUser?.id ?? 'adm1');
            Alert.alert('הרישום אושר', `${data.fullName} אושר/ה בהצלחה.`, [
              { text: 'אישור', onPress: onBack },
            ]);
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
          onPress: () => {
            rejectRegistration(
              reg.id,
              currentUser?.id ?? 'adm1',
              rejectReason.trim()
            );
            setRejectModalVisible(false);
            Alert.alert('הרישום נדחה', `הרישום של ${data.fullName} נדחה.`, [
              { text: 'אישור', onPress: onBack },
            ]);
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
          <View
            style={[
              styles.heroIcon,
              {
                backgroundColor: isWorker ? Colors.primaryFaint : '#DBEAFE',
              },
            ]}
          >
            <Ionicons
              name={isWorker ? 'hammer' : 'business'}
              size={26}
              color={isWorker ? Colors.primary : Colors.secondary}
            />
          </View>
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

        {/* External checks — there is no access to an authorized government
            API to call, so these are always shown as pending external
            verification, never as a fabricated pass. The admin still
            approves/rejects manually regardless of this section. */}
        <Section title="בדיקות אימות חיצוני">
          <CheckRow label="אימות תעודת זהות מול מערכת ממשלתית" />
          {!isWorker && <CheckRow label="אימות מספר רישום קבלן" />}
          <Text style={styles.notes}>
            נדרש חיבור ל-API ממשלתי מורשה לצורך אימות אוטומטי.
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
          <FieldRow label="תעודת זהות" value={data.idNumber} mono ltr />
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
              <FieldRow
                label="תעודות והסמכות"
                value={
                  certificationNames(wd.certifications).length
                    ? certificationNames(wd.certifications).join(', ')
                    : '—'
                }
              />
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
          <Section title="פרטי הקבלן">
            <FieldRow label="חברה" value={cd.companyName} />
            <FieldRow
              label="מספר רישום קבלנים"
              value={cd.contractorRegistrationNumber}
              mono
              ltr
            />
            <FieldRow
              label="אזורי פעילות"
              value={contractorAreas(cd).join(', ') || '—'}
            />
            <FieldRow
              label="סוגי פרויקטים"
              value={cd.projectTypes.join(', ')}
            />
            <FieldRow label="פרטי רישיון" value={cd.licenseDetails} />
          </Section>
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

      {/* Action bar (only for pending) */}
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
            onPress={handleApprove}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
            <Text style={styles.approveText}>אשר רישום</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reject modal */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setRejectModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
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
