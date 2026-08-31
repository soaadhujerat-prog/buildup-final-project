import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TextInput,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import WorkerAvatar from '../components/WorkerAvatar';
import ContractorAvatar from '../components/ContractorAvatar';
import AttachedDocument from '../components/AttachedDocument';
import { Contractor, Worker } from '../types';
import {
  getWorkerAssignmentStats,
  getContractorWorkforceStats,
} from '../services/assignmentService';
import {
  workerProfessions,
  workerPrimaryProfession,
  contractorAreas,
  normalizeCertifications,
} from '../utils/normalize';
import {
  formatDateIL,
  getContractorLicenseStatus,
  daysUntil,
  CONTRACTOR_LICENSE_MANUAL_NOTE,
} from '../utils/helpers';

interface Props {
  userId: string;
  onBack: () => void;
  /** Admin-only drilldown into every job a contractor posted (read-only). */
  onOpenContractorJobs?: (contractorId: string) => void;
}

const AdminUserDetailsScreen: React.FC<Props> = ({
  userId,
  onBack,
  onOpenContractorJobs,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    getUserById,
    jobs,
    applications,
    invitations,
    assignments,
    supportTickets,
    blockUser,
    unblockUser,
    updateContractorRegistrationNumber,
    getPendingLicenseRequestForContractor,
    reviewContractorLicenseUpdate,
    verifyContractorLicense,
    requestContractorLicenseRenewal,
    hasRenewalRequestBeenSent,
  } = useApp();

  const user = getUserById(userId);
  const [blockModalVisible, setBlockModalVisible] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [regEditVisible, setRegEditVisible] = useState(false);
  const [regEditValue, setRegEditValue] = useState('');
  const [regEditSubmitting, setRegEditSubmitting] = useState(false);
  const [licRejectVisible, setLicRejectVisible] = useState(false);
  const [licRejectReason, setLicRejectReason] = useState('');

  // Every KPI is derived LIVE from the source arrays in AppContext — no
  // stored counters anywhere. sendInvitation / applyToJob / an Assignment
  // being created / openSupportTicket all mutate one of these arrays, so the
  // numbers here update the moment that happens.
  const activity = useMemo(() => {
    if (!user) return null;
    if (user.role === 'worker') {
      // "הגיש מועמדויות" — every Application this worker ever filed.
      const applicationsCount = applications.filter(
        (a) => a.workerId === user.id
      ).length;
      // "הזמנות שקיבל" — historical count of Invitation records sent to this
      // worker (any later status still counts; the record isn't a duplicate).
      const invitationsCount = invitations.filter(
        (i) => i.workerId === user.id
      ).length;
      // Staffing split — effective/latest assignment per unique job (shared
      // selector). completed is NOT active; cancelled is neither.
      const { activeJobs, completedJobs } = getWorkerAssignmentStats(
        assignments,
        user.id
      );
      const ticketsCount = supportTickets.filter(
        (t) => t.userId === user.id
      ).length;
      return {
        applicationsCount,
        invitationsCount,
        activeJobs,
        completedJobs,
        ticketsCount,
      };
    }
    if (user.role === 'contractor') {
      const myJobs = jobs.filter((j) => j.contractorId === user.id);
      const myJobIds = new Set(myJobs.map((j) => j.id));
      // "מועמדויות שקיבל" — Applications filed to any of this contractor's jobs.
      const applicationsCount = applications.filter((a) =>
        myJobIds.has(a.jobId)
      ).length;
      // Workforce split — effective/latest assignment per (worker, job),
      // de-duped to unique workers across ALL of the contractor's jobs
      // (shared selector). cancelled-only worker counts in neither.
      const { activeWorkers, everWorkedWorkers } = getContractorWorkforceStats(
        assignments,
        user.id
      );
      const ticketsCount = supportTickets.filter(
        (t) => t.userId === user.id
      ).length;
      return {
        jobsCount: myJobs.length,
        applicationsCount,
        activeWorkers,
        everWorkedWorkers,
        ticketsCount,
      };
    }
    return null;
  }, [user, applications, invitations, assignments, supportTickets, jobs]);

  if (!user || user.role === 'admin') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>משתמש לא נמצא</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isWorker = user.role === 'worker';
  const w = isWorker ? (user as Worker) : null;
  const c = !isWorker ? (user as Contractor) : null;

  const handleBlockConfirm = () => {
    if (!blockReason.trim()) {
      Alert.alert('שגיאה', 'יש לציין סיבת חסימה');
      return;
    }
    blockUser(user.id, currentUser?.id ?? 'adm1', blockReason.trim());
    setBlockModalVisible(false);
    setBlockReason('');
    Alert.alert('המשתמש נחסם', `${user.fullName} נחסם/ה בהצלחה.`);
  };

  const openRegEdit = () => {
    setRegEditValue(c?.contractorRegistrationNumber ?? '');
    setRegEditVisible(true);
  };

  const handleRegEditConfirm = () => {
    if (!c || regEditSubmitting) return;
    const next = regEditValue.trim();
    if (!next || !/^\d+$/.test(next)) {
      Alert.alert('שגיאה', 'יש להזין מספר רישום קבלן תקין');
      return;
    }
    if (next === c.contractorRegistrationNumber) {
      setRegEditVisible(false);
      return;
    }
    setRegEditSubmitting(true);
    try {
      // Updates the ONE Contractor object in AppContext — same id, no new
      // user, every other field untouched. All screens read this object, so
      // the change shows everywhere immediately. This path also notifies the
      // contractor that their registration number was changed.
      updateContractorRegistrationNumber(
        c.id,
        next,
        currentUser?.id ?? 'adm1'
      );
      setRegEditVisible(false);
      Alert.alert('עודכן', 'מספר רישום הקבלנים עודכן.');
    } catch {
      Alert.alert('שגיאה', 'עדכון מספר הרישום נכשל. נסה שוב.');
    } finally {
      setRegEditSubmitting(false);
    }
  };

  const handleUnblock = () => {
    Alert.alert(
      'ביטול חסימה',
      `לאשר את ביטול החסימה של ${user.fullName}?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'בטל חסימה',
          style: 'default',
          onPress: () => {
            unblockUser(user.id, currentUser?.id ?? 'adm1');
            Alert.alert(
              'החסימה בוטלה',
              `החסימה של ${user.fullName} בוטלה בהצלחה.`
            );
          },
        },
      ]
    );
  };

  // ---- Contractor licence review ----
  const pendingLicenseReq = c
    ? getPendingLicenseRequestForContractor(c.id)
    : undefined;

  // Renewal request — only for a VALIDITY problem (expiring_soon / expired).
  // Sends the contractor a notification and changes nothing on the licence.
  const handleRequestRenewal = () => {
    if (!c) return;
    const st = getContractorLicenseStatus(c);
    const when = c.licenseValidUntil ? formatDateIL(c.licenseValidUntil) : '';
    Alert.alert(
      'בקשת חידוש רישיון',
      st.state === 'expired'
        ? `רישיון הקבלן פג${
            when ? ` בתאריך ${when}` : ''
          }. לשלוח לקבלן בקשה להעלות רישיון מעודכן?`
        : `רישיון הקבלן עומד לפוג${
            when ? ` ב־${when}` : ''
          }. לשלוח לקבלן בקשה להעלות רישיון מעודכן?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'שלח בקשה',
          onPress: () => {
            requestContractorLicenseRenewal(c.id, currentUser?.id ?? 'adm1');
            Alert.alert('הבקשה נשלחה', 'נשלחה לקבלן בקשה לחידוש הרישיון.');
          },
        },
      ]
    );
  };

  // Periodic review — only offered when the licence status is exactly
  // "review due". It moves the review clock forward; it never touches the
  // licence's validity date or the document.
  const handlePeriodicReview = () => {
    if (!c) return;
    Alert.alert(
      'בדיקה תקופתית של הרישיון',
      'אני מאשר/ת שבדקתי את רישיון הקבלן הנוכחי והוא תקין.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'אשר בדיקה',
          onPress: () => {
            verifyContractorLicense(c.id, currentUser?.id ?? 'adm1');
            Alert.alert(
              'הבדיקה נרשמה',
              'מועד הבדיקה התקופתית הבאה נקבע לעוד שנה.'
            );
          },
        },
      ]
    );
  };

  const handleLicenseApprove = () => {
    if (!pendingLicenseReq) return;
    Alert.alert(
      'אישור עדכון רישיון',
      'לאשר את הרישיון החדש? הוא יחליף את הרישיון המאושר הנוכחי ויסומן כמאומת.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'אשר',
          onPress: () => {
            reviewContractorLicenseUpdate(
              pendingLicenseReq.id,
              currentUser?.id ?? 'adm1',
              true
            );
            Alert.alert('אושר', 'הרישיון החדש עודכן ואומת.');
          },
        },
      ]
    );
  };

  const handleLicenseRejectConfirm = () => {
    if (!pendingLicenseReq) return;
    if (!licRejectReason.trim()) {
      Alert.alert('שגיאה', 'יש לציין סיבת דחייה');
      return;
    }
    reviewContractorLicenseUpdate(
      pendingLicenseReq.id,
      currentUser?.id ?? 'adm1',
      false,
      licRejectReason.trim()
    );
    setLicRejectVisible(false);
    setLicRejectReason('');
    Alert.alert(
      'הבקשה נדחתה',
      'בקשת עדכון הרישיון נדחתה. הרישיון הקודם נשאר בתוקף.'
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">פרטי משתמש</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          {isWorker && w ? (
            <WorkerAvatar worker={w} size={64} />
          ) : (
            <ContractorAvatar
              contractor={c}
              size={64}
              style={[styles.heroIcon, { backgroundColor: '#DBEAFE' }]}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{user.fullName}</Text>
            <Text style={styles.heroRole}>
              {isWorker ? 'עובד' : 'קבלן'}
              {' · '}
              {isWorker ? (w ? workerPrimaryProfession(w) : '') : c?.companyName}
            </Text>
            <View style={styles.heroBadges}>
              <StatusBadge
                label={user.status === 'approved' ? 'פעיל' : 'חסום'}
                tone={user.status === 'approved' ? 'success' : 'danger'}
                small
              />
            </View>
          </View>
        </View>

        {/* Activity KPIs — every number derived live from AppContext arrays */}
        {activity && (
          <View style={styles.statsRow}>
            {isWorker ? (
              <>
                <StatChip
                  label="הגיש מועמדויות"
                  value={(activity as any).applicationsCount}
                />
                <StatChip
                  label="הזמנות שקיבל"
                  value={(activity as any).invitationsCount}
                />
                <StatChip
                  label="שיבוצים פעילים"
                  value={(activity as any).activeJobs}
                />
                <StatChip
                  label="עבודות שהסתיימו"
                  value={(activity as any).completedJobs}
                />
                <StatChip
                  label="פניות תמיכה"
                  value={(activity as any).ticketsCount}
                />
              </>
            ) : (
              <>
                <StatChip
                  label="משרות שפרסם"
                  value={(activity as any).jobsCount}
                  onPress={
                    c && onOpenContractorJobs
                      ? () => onOpenContractorJobs(c.id)
                      : undefined
                  }
                />
                <StatChip
                  label="מועמדויות שקיבל"
                  value={(activity as any).applicationsCount}
                />
                <StatChip
                  label="עובדים פעילים כרגע"
                  value={(activity as any).activeWorkers}
                />
                <StatChip
                  label="עובדים שעבדו עם הקבלן"
                  value={(activity as any).everWorkedWorkers}
                />
                <StatChip
                  label="פניות תמיכה"
                  value={(activity as any).ticketsCount}
                />
              </>
            )}
          </View>
        )}

        {/* Identity */}
        <Section title="פרטי קשר">
          <FieldRow label="שם מלא" value={user.fullName} />
          <FieldRow label="תעודת זהות" value={user.idNumber ?? ''} mono ltr />
          <FieldRow
            label="טלפון"
            value={user.phone}
            ltr
            onPress={() => Linking.openURL(`tel:${user.phone}`)}
          />
          <FieldRow
            label="אימייל"
            value={user.email}
            ltr
            onPress={() => Linking.openURL(`mailto:${user.email}`)}
          />
          <FieldRow label="עיר" value={user.city} />
        </Section>

        {/* Worker-only — current profile straight off the live Worker object */}
        {w && (
          <>
            <Section title="פרופיל מקצועי">
              <FieldRow
                label={workerProfessions(w).length > 1 ? 'מקצועות' : 'מקצוע'}
                value={workerProfessions(w).join(', ')}
              />
              <FieldRow label="תחום" value={w.professionCategory} />
              <FieldRow
                label="שנות ניסיון"
                value={`${w.experienceYears} שנים`}
              />
              <FieldRow
                label="מיומנויות"
                value={w.skills.length ? w.skills.join(', ') : '—'}
              />
              <FieldRow
                label="אזורים מועדפים"
                value={w.preferredAreas.length ? w.preferredAreas.join(', ') : '—'}
              />
            </Section>

            <Section title="זמינות ותעריפים">
              <FieldRow label="זמין" value={w.isAvailable ? 'כן' : 'לא'} />
              {!!w.availableFrom && (
                <FieldRow
                  label="זמין החל מ-"
                  value={new Date(w.availableFrom).toLocaleDateString('he-IL')}
                  ltr
                />
              )}
              <FieldRow label="תעריף שעתי" value={`${w.hourlyRate} ₪`} ltr />
              <FieldRow label="תעריף יומי" value={`${w.dailyRate} ₪`} ltr />
            </Section>

            <Section title="תעודות והסמכות">
              {normalizeCertifications(w.certifications).length === 0 ? (
                <Text style={styles.emptyLine}>לא הוזנו תעודות</Text>
              ) : (
                normalizeCertifications(w.certifications).map((cert, i) => (
                  <View
                    key={cert.id ?? `${i}-${cert.name}`}
                    style={styles.certRow}
                  >
                    <Text style={styles.certName}>{cert.name}</Text>
                    <AttachedDocument doc={cert.document} />
                  </View>
                ))
              )}
            </Section>
          </>
        )}

        {/* Contractor-only */}
        {c && (
          <>
            <Section title="פרטי הקבלן">
              <FieldRow label="חברה" value={c.companyName} />
              <FieldRow
                label="אזורי פעילות"
                value={contractorAreas(c).join(', ') || '—'}
              />
              <FieldRow
                label="סוגי פרויקטים"
                value={c.projectTypes.join(', ')}
              />
            </Section>

            {/* Current approved licence (manual admin check only) */}
            <Section title="רישיון קבלן">
              <View style={styles.licStatusRow}>
                <StatusBadge
                  label={getContractorLicenseStatus(c).label}
                  tone={getContractorLicenseStatus(c).tone}
                  small
                />
                <Text style={styles.fLabel}>סטטוס</Text>
              </View>
              {getContractorLicenseStatus(c).state === 'expiring_soon' && (
                <Text style={styles.licContextLine}>
                  התוקף יפוג בעוד{' '}
                  {Math.max(0, daysUntil(c.licenseValidUntil) ?? 0)} ימים
                  {c.licenseValidUntil
                    ? ` (${formatDateIL(c.licenseValidUntil)})`
                    : ''}
                </Text>
              )}
              {getContractorLicenseStatus(c).state === 'expired' && (
                <Text style={[styles.licContextLine, { color: Colors.danger }]}>
                  הרישיון פג תוקף
                  {c.licenseValidUntil
                    ? ` בתאריך ${formatDateIL(c.licenseValidUntil)}`
                    : ''}
                </Text>
              )}
              <FieldRow
                label="מספר רישום"
                value={c.contractorRegistrationNumber}
                mono
                ltr
              />
              <FieldRow label="סיווג" value={c.licenseDetails} />
              <FieldRow
                label="בתוקף עד"
                value={c.licenseValidUntil ? formatDateIL(c.licenseValidUntil) : '—'}
                ltr
              />
              <FieldRow
                label="נבדק לאחרונה"
                value={
                  c.licenseLastVerifiedAt
                    ? formatDateIL(c.licenseLastVerifiedAt)
                    : 'טרם נבדק'
                }
                ltr
              />
              <FieldRow
                label="בדיקה תקופתית הבאה"
                value={
                  getContractorLicenseStatus(c).state === 'review_due'
                    ? 'נדרשת בדיקה תקופתית'
                    : c.licenseNextReviewAt
                    ? formatDateIL(c.licenseNextReviewAt)
                    : '—'
                }
                ltr
              />
              <View style={{ marginTop: 6 }}>
                <Text style={styles.fLabel}>המסמך המאושר הנוכחי</Text>
                <View style={{ marginTop: 6 }}>
                  <AttachedDocument doc={c.contractorLicenseDocument} />
                </View>
              </View>
              <Text style={styles.licNote}>{CONTRACTOR_LICENSE_MANUAL_NOTE}</Text>

              {/* VALIDITY problem → ask the contractor to upload a renewed
                  licence. Never shown together with "בצע בדיקה תקופתית"
                  (the central status is a single value). */}
              {(getContractorLicenseStatus(c).state === 'expiring_soon' ||
                getContractorLicenseStatus(c).state === 'expired') &&
                (pendingLicenseReq ? (
                  <Text style={styles.licInfoLine}>
                    עדכון רישיון ממתין לבדיקה
                  </Text>
                ) : hasRenewalRequestBeenSent(c.id, c.licenseValidUntil) ? (
                  <Text style={styles.licInfoLine}>
                    בקשת חידוש נשלחה לקבלן
                  </Text>
                ) : (
                  <TouchableOpacity
                    style={styles.licRenewCta}
                    onPress={handleRequestRenewal}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="refresh-outline"
                      size={16}
                      color={Colors.white}
                    />
                    <Text style={styles.licReviewCtaText}>בקש חידוש רישיון</Text>
                  </TouchableOpacity>
                ))}

              {/* The periodic-review action appears ONLY when the licence
                  status is exactly "נדרשת בדיקה תקופתית" — not when it's
                  expiring / expired (that needs a renewal, not a review). */}
              {getContractorLicenseStatus(c).state === 'review_due' && (
                <TouchableOpacity
                  style={styles.licReviewCta}
                  onPress={handlePeriodicReview}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={16}
                    color={Colors.white}
                  />
                  <Text style={styles.licReviewCtaText}>בצע בדיקה תקופתית</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.regEditBtn}
                onPress={openRegEdit}
                activeOpacity={0.85}
              >
                <Ionicons name="create-outline" size={16} color={Colors.primary} />
                <Text style={styles.regEditBtnText}>עדכן מספר רישום</Text>
              </TouchableOpacity>
            </Section>

            {/* Pending contractor-initiated licence-update request — current
                vs. new, side by side, so the admin can compare before deciding. */}
            {pendingLicenseReq && (
              <Section title="בקשת עדכון רישיון">
                <FieldRow
                  label="תאריך הבקשה"
                  value={formatDateIL(pendingLicenseReq.createdAt)}
                  ltr
                />
                <View style={styles.licCompareHead}>
                  <Text style={styles.licCompareCol}>חדש שהוגש</Text>
                  <Text style={styles.licCompareCol}>נוכחי</Text>
                  <Text style={styles.licCompareLabel} />
                </View>
                <LicCompareRow
                  label="מספר רישום"
                  current={c.contractorRegistrationNumber}
                  next={
                    pendingLicenseReq.newRegistrationNumber ??
                    c.contractorRegistrationNumber
                  }
                  changed={!!pendingLicenseReq.newRegistrationNumber}
                />
                <LicCompareRow
                  label="סיווג"
                  current={c.licenseDetails}
                  next={pendingLicenseReq.newLicenseDetails ?? c.licenseDetails}
                  changed={!!pendingLicenseReq.newLicenseDetails}
                />
                <LicCompareRow
                  label="בתוקף עד"
                  current={
                    c.licenseValidUntil ? formatDateIL(c.licenseValidUntil) : '—'
                  }
                  next={
                    pendingLicenseReq.proposedValidUntil
                      ? formatDateIL(pendingLicenseReq.proposedValidUntil)
                      : c.licenseValidUntil
                      ? formatDateIL(c.licenseValidUntil)
                      : '—'
                  }
                  changed={!!pendingLicenseReq.proposedValidUntil}
                />
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.fLabel}>מסמך נוכחי</Text>
                  <View style={{ marginTop: 4, marginBottom: 8 }}>
                    <AttachedDocument doc={c.contractorLicenseDocument} />
                  </View>
                  <Text style={styles.fLabel}>מסמך חדש שהוגש</Text>
                  <View style={{ marginTop: 4 }}>
                    <AttachedDocument
                      doc={pendingLicenseReq.newLicenseDocument}
                    />
                  </View>
                </View>
                <View style={styles.licReviewActions}>
                  <TouchableOpacity
                    style={[styles.licReviewBtn, styles.licRejectBtn]}
                    onPress={() => setLicRejectVisible(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.licRejectBtnText}>דחה</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.licReviewBtn, styles.licApproveBtn]}
                    onPress={handleLicenseApprove}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.licApproveBtnText}>אשר</Text>
                  </TouchableOpacity>
                </View>
              </Section>
            )}
          </>
        )}

        {user.bio && (
          <Section title="אודות">
            <Text style={styles.bio}>{user.bio}</Text>
          </Section>
        )}

        {user.status === 'blocked' && user.blockedReason && (
          <View style={styles.blockedBox}>
            <View style={styles.blockedHeader}>
              <Ionicons name="ban" size={18} color={Colors.danger} />
              <Text style={styles.blockedTitle}>סיבת חסימה</Text>
            </View>
            <Text style={styles.blockedText}>{user.blockedReason}</Text>
            {user.blockedAt && (
              <Text style={styles.blockedMeta}>
                נחסם ב-
                <Text style={{ writingDirection: 'ltr' }}>
                  {new Date(user.blockedAt).toLocaleString('he-IL')}
                </Text>
              </Text>
            )}
          </View>
        )}

        <Text style={styles.createdAt}>
          חבר במערכת מאז{' '}
          <Text style={{ writingDirection: 'ltr' }}>
            {new Date(user.createdAt).toLocaleDateString('he-IL')}
          </Text>
        </Text>
      </ScrollView>

      {/* Action bar */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
        {user.status === 'approved' ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.blockBtn]}
            onPress={() => setBlockModalVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="ban" size={20} color={Colors.white} />
            <Text style={styles.blockText}>חסום משתמש</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.unblockBtn]}
            onPress={handleUnblock}
            activeOpacity={0.85}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={Colors.white}
            />
            <Text style={styles.unblockText}>בטל חסימה</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={blockModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBlockModalVisible(false)}
      >
        {/* Tap any empty area (backdrop OR inside the sheet, outside the
            input) → dismiss the keyboard only; the sheet stays open and the
            typed reason is kept. "ביטול" / "אשר חסימה" still work. */}
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
                    <Text style={styles.modalTitle}>חסימת משתמש</Text>
                  </View>
                  <Text style={styles.modalSub}>
                    ציין סיבה לחסימה. הסיבה תוצג למשתמש במסך החסימה.
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={blockReason}
                    onChangeText={setBlockReason}
                    placeholder="לדוגמה: דיווחים חוזרים על התנהגות בלתי הולמת"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalBtnCancel]}
                      onPress={() => setBlockModalVisible(false)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnCancelText}>ביטול</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalBtnConfirm]}
                      onPress={handleBlockConfirm}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnConfirmText}>אשר חסימה</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={regEditVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !regEditSubmitting && setRegEditVisible(false)}
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
                    <Text style={styles.modalTitle}>עדכון מספר רישום קבלנים</Text>
                  </View>

                  <Text style={styles.fLabel}>מספר נוכחי</Text>
                  <View style={styles.regReadonly}>
                    <Text style={styles.regReadonlyValue}>
                      {c?.contractorRegistrationNumber || '—'}
                    </Text>
                  </View>

                  <Text style={styles.fLabel}>מספר רישום חדש</Text>
                  <TextInput
                    style={[
                      styles.modalInput,
                      styles.regInput,
                      { textAlign: 'left', writingDirection: 'ltr' },
                    ]}
                    value={regEditValue}
                    onChangeText={(t) =>
                      setRegEditValue(t.replace(/[^\d]/g, ''))
                    }
                    keyboardType="numeric"
                    placeholder="לדוגמה: 105678"
                    placeholderTextColor={Colors.textMuted}
                  />

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalBtnCancel]}
                      onPress={() => setRegEditVisible(false)}
                      disabled={regEditSubmitting}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnCancelText}>ביטול</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalBtn,
                        styles.regSaveBtn,
                        regEditSubmitting && { opacity: 0.7 },
                      ]}
                      onPress={handleRegEditConfirm}
                      disabled={regEditSubmitting}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnConfirmText}>
                        {regEditSubmitting ? 'שומר...' : 'עדכן'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Licence-update rejection reason */}
      <Modal
        visible={licRejectVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLicRejectVisible(false)}
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
                    <Text style={styles.modalTitle}>דחיית עדכון רישיון</Text>
                  </View>
                  <Text style={styles.modalSub}>
                    ציין סיבה לדחייה. הסיבה תישלח לקבלן. הרישיון הקודם יישאר
                    בתוקף.
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    value={licRejectReason}
                    onChangeText={setLicRejectReason}
                    placeholder="לדוגמה: המסמך אינו קריא / פרטי הרישיון אינם תואמים"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                  />
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalBtnCancel]}
                      onPress={() => setLicRejectVisible(false)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnCancelText}>ביטול</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.modalBtnConfirm]}
                      onPress={handleLicenseRejectConfirm}
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
    </View>
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

const LicCompareRow: React.FC<{
  label: string;
  current: string;
  next: string;
  changed: boolean;
}> = ({ label, current, next, changed }) => (
  <View style={styles.licCompareRow}>
    <Text
      style={[styles.licCompareVal, changed && styles.licCompareValChanged]}
      numberOfLines={2}
    >
      {next}
    </Text>
    <Text style={styles.licCompareVal} numberOfLines={2}>
      {current}
    </Text>
    <Text style={styles.licCompareLabel}>{label}</Text>
  </View>
);

const StatChip: React.FC<{
  label: string;
  value: number;
  onPress?: () => void;
}> = ({ label, value, onPress }) => {
  const body = (
    <>
      <Text style={styles.statChipValue}>{value}</Text>
      <Text style={styles.statChipLabel}>{label}</Text>
      {onPress && (
        <Ionicons
          name="chevron-back"
          size={13}
          color={Colors.textMuted}
          style={styles.statChipChevron}
        />
      )}
    </>
  );
  return onPress ? (
    <TouchableOpacity
      style={[styles.statChip, styles.statChipPressable]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {body}
    </TouchableOpacity>
  ) : (
    <View style={styles.statChip}>{body}</View>
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
    width: 64,
    height: 64,
    borderRadius: 20,
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
    marginTop: 2,
  },
  heroBadges: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },

  statsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statChip: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'flex-end',
    ...Shadow.small,
  },
  statChipPressable: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  statChipChevron: {
    position: 'absolute',
    left: Spacing.md,
    top: Spacing.md,
  },
  statChipValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  statChipLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
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

  bio: {
    fontSize: FontSize.sm,
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
    lineHeight: 22,
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

  blockedBox: {
    backgroundColor: '#FEF2F2',
    borderColor: Colors.danger,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 4,
  },
  blockedHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  blockedTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.danger,
    writingDirection: 'rtl',
  },
  blockedText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
    lineHeight: 20,
  },
  blockedMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  createdAt: {
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
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.full,
  },
  blockBtn: { backgroundColor: Colors.danger, ...Shadow.small },
  blockText: { color: Colors.white, fontSize: FontSize.md, fontWeight: '700' },
  unblockBtn: { backgroundColor: Colors.success, ...Shadow.small },
  unblockText: { color: Colors.white, fontSize: FontSize.md, fontWeight: '700' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalKav: { width: '100%' },
  regEditBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  licReviewCta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.warning,
  },
  licRenewCta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  licReviewCtaText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.white,
    writingDirection: 'rtl',
  },
  licInfoLine: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.secondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 8,
  },
  regEditBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  licStatusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  licNote: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
    marginTop: 8,
    fontStyle: 'italic',
  },
  licContextLine: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.warning,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  licCompareHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingBottom: 4,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  licCompareCol: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  licCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  licCompareLabel: {
    width: 80,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  licCompareVal: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  licCompareValChanged: {
    color: Colors.primary,
    fontWeight: '800',
  },
  licReviewActions: {
    flexDirection: 'row-reverse',
    gap: 12,
    marginTop: 12,
  },
  licReviewBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  licApproveBtn: { backgroundColor: Colors.success },
  licApproveBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  licRejectBtn: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.danger,
  },
  licRejectBtnText: {
    color: Colors.danger,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  regReadonly: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  regReadonlyValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  regInput: { minHeight: 0, paddingVertical: 12 },
  regSaveBtn: { backgroundColor: Colors.primary },
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

export default AdminUserDetailsScreen;
