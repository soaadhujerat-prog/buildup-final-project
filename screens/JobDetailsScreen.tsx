import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import StaffingProgress from '../components/StaffingProgress';
import { getRegistrationStatus } from '../services/jobStatusService';
import { callPhone } from '../utils/contact';
import { Application, Contractor, Worker } from '../types';

interface Props {
  jobId: string;
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
  onOpenSmartMatchForJob: (jobId: string) => void;
  onOpenSentInvitations?: () => void; // contractor only
  onOpenStaffing?: (jobId: string) => void; // contractor only
  onOpenChatWithContractor?: (contractorId: string) => void; // worker only
}

const JobDetailsScreen: React.FC<Props> = ({
  jobId,
  onBack,
  onOpenWorkerProfile,
  onOpenSmartMatchForJob,
  onOpenSentInvitations,
  onOpenStaffing,
  onOpenChatWithContractor,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    getJobById,
    getUserById,
    getApplicationsForJob,
    getStaffingProgress,
    invitations,
    applyToJob,
    respondToApplication,
    setJobAcceptingApplications,
  } = useApp();

  const job = getJobById(jobId);
  const [applying, setApplying] = useState(false);

  if (!job) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>המשרה לא נמצאה</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const contractor = getUserById(job.contractorId) as Contractor | undefined;
  const candidates = getApplicationsForJob(jobId);

  const role = currentUser?.role;
  const isContractorOwner =
    role === 'contractor' && currentUser?.id === job.contractorId;
  const isWorker = role === 'worker';

  // For worker mode: did I already apply?
  const myExistingApplication = useMemo(() => {
    if (!isWorker) return null;
    return candidates.find((a) => a.workerId === currentUser?.id) ?? null;
  }, [candidates, isWorker, currentUser]);

  // Invitations sent for this job (contractor mode)
  const invitationsForJob = useMemo(
    () => invitations.filter((i) => i.jobId === job.id),
    [invitations, job.id]
  );

  const handleApply = () => {
    if (!isWorker || !currentUser) return;
    setApplying(true);
    setTimeout(() => {
      applyToJob(job.id, currentUser.id);
      setApplying(false);
      Alert.alert(
        'הבקשה נשלחה',
        'בקשתך נשלחה לקבלן. תקבל התראה כשתהיה החלטה.'
      );
    }, 500);
  };

  const handleAccept = (app: Application) => {
    Alert.alert('אישור מועמד', `לאשר את ${getUserById(app.workerId)?.fullName}?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'אשר',
        onPress: () => respondToApplication(app.id, true),
      },
    ]);
  };

  const handleReject = (app: Application) => {
    Alert.alert('דחיית מועמד', `לדחות את ${getUserById(app.workerId)?.fullName}?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'דחה',
        style: 'destructive',
        onPress: () => respondToApplication(app.id, false),
      },
    ]);
  };

  const registrationStatus = getRegistrationStatus(job);

  const handleToggleApplications = () => {
    const opening = !job.acceptingApplications;
    Alert.alert(
      opening ? 'פתיחת המשרה להרשמה' : 'סגירת המשרה להרשמה',
      opening
        ? 'המשרה תהפוך זמינה לרישום מועמדים חדשים.'
        : 'המשרה תיסגר ולא ניתן יהיה להגיש אליה מועמדויות חדשות.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: opening ? 'פתח' : 'סגור',
          onPress: () => setJobAcceptingApplications(job.id, opening),
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
        <Text style={styles.headerTitle}>פרטי המשרה</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingBottom: 140,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <StatusBadge
              label={registrationStatus.label}
              tone={registrationStatus.tone}
              small
            />
            {job.urgent && <StatusBadge label="דחוף" tone="danger" small />}
          </View>
          <Text style={styles.heroTitle}>{job.title}</Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMeta}>
              <Ionicons
                name="briefcase-outline"
                size={14}
                color={Colors.textSecondary}
              />
              <Text style={styles.heroMetaText}>{job.profession}</Text>
            </View>
            <View style={styles.heroMeta}>
              <Ionicons
                name="location-outline"
                size={14}
                color={Colors.textSecondary}
              />
              <Text style={styles.heroMetaText}>{job.city}</Text>
            </View>
          </View>
        </View>

        {/* Posted by — visible to worker */}
        {!isContractorOwner && contractor && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>פורסם על ידי</Text>
            </View>
            <View style={styles.contractorRow}>
              <View style={styles.contractorIcon}>
                <Ionicons
                  name="business"
                  size={20}
                  color={Colors.secondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contractorName}>
                  {contractor.companyName ?? contractor.fullName}
                </Text>
                <Text style={styles.contractorMeta}>
                  {contractor.city} · {contractor.areaOfOperation}
                </Text>
              </View>
            </View>
            {currentUser?.role === 'worker' && (
              <View style={styles.contactRow}>
                <TouchableOpacity
                  style={styles.contactBtn}
                  onPress={() =>
                    onOpenChatWithContractor?.(contractor.id)
                  }
                  activeOpacity={0.85}
                  accessibilityLabel="שלח הודעה לקבלן"
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={16}
                    color={Colors.primary}
                  />
                  <Text style={styles.contactBtnText}>שלח הודעה</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.contactBtn}
                  onPress={() => callPhone(contractor.phone)}
                  activeOpacity={0.85}
                  accessibilityLabel="התקשר לקבלן"
                >
                  <Ionicons
                    name="call-outline"
                    size={16}
                    color={Colors.primary}
                  />
                  <Text style={styles.contactBtnText}>התקשר</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Description */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>תיאור המשרה</Text>
          </View>
          <Text style={styles.body}>{job.description}</Text>
        </View>

        {/* Practical info */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>פרטים מעשיים</Text>
          </View>
          <FieldRow label="כתובת" value={job.address} />
          <FieldRow label="תאריך התחלה" value={job.startDate} ltr />
          <FieldRow label="משך" value={job.duration} />
          <FieldRow label="תעריף יומי" value={`${job.dailyRate} ₪`} ltr />
          <FieldRow
            label="עובדים דרושים"
            value={`${job.workersNeeded}`}
          />
        </View>

        {/* Required certs */}
        {job.requiredCertifications.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>הסמכות נדרשות</Text>
            </View>
            <View style={styles.tagRow}>
              {job.requiredCertifications.map((c) => (
                <View key={c} style={styles.tag}>
                  <Ionicons
                    name="ribbon-outline"
                    size={12}
                    color={Colors.warning}
                  />
                  <Text style={styles.tagText}>{c}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Requirements */}
        {job.requirements.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>דרישות נוספות</Text>
            </View>
            {job.requirements.map((r, idx) => (
              <View key={idx} style={styles.bullet}>
                <Text style={styles.bulletText}>{r}</Text>
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={Colors.success}
                />
              </View>
            ))}
          </View>
        )}

        {/* === CONTRACTOR MODE: Management hub === */}
        {isContractorOwner && (
          <>
            {/* Staffing summary */}
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>מצב שיבוץ</Text>
              </View>
              <StaffingProgress progress={getStaffingProgress(job.id)} />
              <TouchableOpacity
                style={styles.manageStaffingBtn}
                onPress={() => onOpenStaffing?.(job.id)}
                activeOpacity={0.85}
              >
                <Ionicons name="people" size={16} color={Colors.primary} />
                <Text style={styles.manageStaffingText}>ניהול שיבוצים</Text>
              </TouchableOpacity>
            </View>

            {/* Candidates section */}
            <View style={styles.section}>
              <View style={styles.sectionHeadRow}>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{candidates.length}</Text>
                </View>
                <Text style={styles.sectionTitle}>מועמדים</Text>
              </View>
              {candidates.length === 0 ? (
                <Text style={styles.emptyHint}>
                  עדיין לא הוגשו מועמדויות. נסה הזמנה ישירה או התאמה חכמה.
                </Text>
              ) : (
                candidates.map((app) => {
                  const w = getUserById(app.workerId) as Worker | undefined;
                  if (!w) return null;
                  return (
                    <View key={app.id} style={styles.candidateRow}>
                      <TouchableOpacity
                        style={styles.candidateMain}
                        onPress={() => onOpenWorkerProfile(w.id)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.candidateAvatar}>
                          <Ionicons
                            name="hammer"
                            size={18}
                            color={Colors.primary}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={styles.candidateTopline}>
                            <StatusBadge
                              label={
                                app.status === 'pending'
                                  ? 'ממתין'
                                  : app.status === 'accepted'
                                  ? 'אושר'
                                  : 'נדחה'
                              }
                              tone={
                                app.status === 'pending'
                                  ? 'warning'
                                  : app.status === 'accepted'
                                  ? 'success'
                                  : 'danger'
                              }
                              small
                            />
                            <Text style={styles.candidateName}>
                              {w.fullName}
                            </Text>
                          </View>
                          <Text style={styles.candidateMeta}>
                            {w.profession} · {w.experienceYears} שנים · {w.city}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {app.status === 'pending' && (
                        <View style={styles.candidateActions}>
                          <TouchableOpacity
                            onPress={() => handleAccept(app)}
                            style={styles.acceptBtn}
                            activeOpacity={0.85}
                          >
                            <Ionicons
                              name="checkmark"
                              size={18}
                              color={Colors.white}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleReject(app)}
                            style={styles.rejectBtn}
                            activeOpacity={0.85}
                          >
                            <Ionicons
                              name="close"
                              size={18}
                              color={Colors.danger}
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            {/* Invitations sent for this job */}
            <View style={styles.section}>
              <View style={styles.sectionHeadRow}>
                <View
                  style={[styles.countPill, { backgroundColor: '#DBEAFE' }]}
                >
                  <Text
                    style={[
                      styles.countPillText,
                      { color: Colors.secondary },
                    ]}
                  >
                    {invitationsForJob.length}
                  </Text>
                </View>
                <Text style={styles.sectionTitle}>הזמנות שנשלחו</Text>
              </View>
              {invitationsForJob.length === 0 ? (
                <Text style={styles.emptyHint}>לא שלחת עדיין הזמנות</Text>
              ) : (
                invitationsForJob.slice(0, 5).map((inv) => {
                  const w = getUserById(inv.workerId) as Worker | undefined;
                  return (
                    <TouchableOpacity
                      key={inv.id}
                      style={styles.invRow}
                      onPress={() =>
                        w ? onOpenWorkerProfile(w.id) : null
                      }
                      activeOpacity={0.85}
                    >
                      <Text style={styles.invMeta}>
                        {new Date(inv.sentAt).toLocaleDateString('he-IL')}
                      </Text>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.invName}>{w?.fullName ?? '—'}</Text>
                        <StatusBadge
                          label={
                            inv.status === 'pending'
                              ? 'ממתין'
                              : inv.status === 'accepted'
                              ? 'התקבל'
                              : 'נדחה'
                          }
                          tone={
                            inv.status === 'pending'
                              ? 'warning'
                              : inv.status === 'accepted'
                              ? 'success'
                              : 'danger'
                          }
                          small
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              {invitationsForJob.length > 5 && onOpenSentInvitations && (
                <TouchableOpacity
                  onPress={onOpenSentInvitations}
                  style={styles.seeAllBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.seeAllText}>
                    הצג את כל ההזמנות
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Toggle accepting applications */}
            <TouchableOpacity
              style={[
                styles.toggleApplicationsBtn,
                job.acceptingApplications
                  ? styles.toggleApplicationsBtnClose
                  : styles.toggleApplicationsBtnOpen,
              ]}
              onPress={handleToggleApplications}
              activeOpacity={0.85}
            >
              <Ionicons
                name={
                  job.acceptingApplications
                    ? 'lock-closed-outline'
                    : 'lock-open-outline'
                }
                size={18}
                color={
                  job.acceptingApplications ? Colors.danger : Colors.success
                }
              />
              <Text
                style={[
                  styles.toggleApplicationsText,
                  job.acceptingApplications
                    ? { color: Colors.danger }
                    : { color: Colors.success },
                ]}
              >
                {job.acceptingApplications
                  ? 'סגור משרה להרשמה'
                  : 'פתח משרה להרשמה'}
              </Text>
            </TouchableOpacity>

            {/* Smart match for this job */}
            <TouchableOpacity
              style={styles.smartMatchBtn}
              onPress={() => onOpenSmartMatchForJob(job.id)}
              activeOpacity={0.85}
            >
              <Ionicons name="sparkles" size={20} color={Colors.white} />
              <Text style={styles.smartMatchText}>
                מצא מועמדים מתאימים בהתאמה חכמה
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* === Worker mode action bar === */}
      {isWorker && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          {myExistingApplication ? (
            <View
              style={[
                styles.actionBtn,
                styles.appliedBox,
                {
                  backgroundColor:
                    myExistingApplication.status === 'accepted'
                      ? '#DCFCE7'
                      : myExistingApplication.status === 'rejected'
                      ? '#FEE2E2'
                      : '#FEF3C7',
                },
              ]}
            >
              <Ionicons
                name={
                  myExistingApplication.status === 'accepted'
                    ? 'checkmark-circle'
                    : myExistingApplication.status === 'rejected'
                    ? 'close-circle'
                    : 'hourglass'
                }
                size={20}
                color={
                  myExistingApplication.status === 'accepted'
                    ? Colors.success
                    : myExistingApplication.status === 'rejected'
                    ? Colors.danger
                    : Colors.warning
                }
              />
              <Text style={styles.appliedText}>
                {myExistingApplication.status === 'accepted'
                  ? 'הבקשה אושרה'
                  : myExistingApplication.status === 'rejected'
                  ? 'הבקשה נדחתה'
                  : 'הבקשה ממתינה לתשובה'}
              </Text>
            </View>
          ) : job.acceptingApplications ? (
            <TouchableOpacity
              style={[styles.actionBtn, styles.applyBtn, applying && { opacity: 0.7 }]}
              onPress={handleApply}
              disabled={applying}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={20} color={Colors.white} />
              <Text style={styles.applyText}>
                {applying ? 'שולח...' : 'הגש מועמדות'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.actionBtn, styles.appliedBox]}>
              <Text style={styles.appliedText}>
                המשרה סגורה להרשמה
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// ---------- subcomponents ----------

const FieldRow: React.FC<{ label: string; value: string; ltr?: boolean }> = ({
  label,
  value,
  ltr,
}) => (
  <View style={styles.fRow}>
    <Text style={[styles.fValue, ltr && { writingDirection: 'ltr' }]}>
      {value}
    </Text>
    <Text style={styles.fLabel}>{label}</Text>
  </View>
);

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
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: 8,
    ...Shadow.medium,
  },
  heroTop: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 4,
  },
  heroMetaRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.md,
    marginTop: 6,
  },
  heroMeta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  heroMetaText: {
    fontSize: FontSize.sm,
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
  contactRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: Spacing.md,
  },
  contactBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  contactBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  manageStaffingBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  manageStaffingText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  sectionHeadRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  countPill: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: Colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.primary,
  },

  body: {
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
  },

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

  tagRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  tagText: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  bullet: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  bulletText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  contractorRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
  },
  contractorIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractorName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  contractorMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  emptyHint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    paddingVertical: 12,
    fontStyle: 'italic',
  },

  candidateRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  candidateMain: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  candidateAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  candidateTopline: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  candidateName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  candidateMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  candidateActions: {
    flexDirection: 'row-reverse',
    gap: 6,
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },

  invRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  invName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
    marginBottom: 2,
  },
  invMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  seeAllBtn: { alignItems: 'center', paddingVertical: 8, marginTop: 4 },
  seeAllText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },

  smartMatchBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.secondary,
    paddingVertical: 16,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
    ...Shadow.medium,
  },
  smartMatchText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  toggleApplicationsBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
    borderWidth: 1.5,
    backgroundColor: Colors.white,
  },
  toggleApplicationsBtnClose: {
    borderColor: Colors.danger,
  },
  toggleApplicationsBtnOpen: {
    borderColor: Colors.success,
  },
  toggleApplicationsText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
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
  applyBtn: {
    backgroundColor: Colors.primary,
    ...Shadow.small,
  },
  applyText: { color: Colors.white, fontSize: FontSize.md, fontWeight: '700' },
  appliedBox: { backgroundColor: '#FEF3C7' },
  appliedText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
});

export default JobDetailsScreen;
