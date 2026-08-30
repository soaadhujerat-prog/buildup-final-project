import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import StaffingProgress from '../components/StaffingProgress';
import WorkerAvatar from '../components/WorkerAvatar';
import ContractorAvatar from '../components/ContractorAvatar';
import ResponseDialog from '../components/ResponseDialog';
import SharedWorkHistorySheet from '../components/SharedWorkHistorySheet';
import { getJobHeaderBadge, isOpenForApplications } from '../services/jobStatusService';
import {
  getWorkerJobAssignment,
  hasActiveAssignment,
  getWorkerContractorRelationship,
} from '../services/assignmentService';
import { callPhone } from '../utils/contact';
import {
  formatDateTime,
  applicationTimeline,
  invitationTimeline,
  currentStaffedState,
  assignmentCancelLine,
  RELATIONSHIP_BADGE,
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_TONE,
  INVITATION_STATUS_LABEL,
  INVITATION_STATUS_TONE,
} from '../utils/helpers';
import { Application, Contractor, Invitation, Worker } from '../types';
import { contractorAreas } from '../utils/normalize';

interface Props {
  jobId: string;
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
  onOpenSmartMatchForJob: (jobId: string) => void;
  onOpenSentInvitations?: () => void; // contractor only
  onOpenStaffing?: (jobId: string) => void; // contractor only
  onOpenEditJob?: (jobId: string) => void; // contractor owner only
  onOpenChatWithContractor?: (contractorId: string) => void; // worker only
}

const formatDateHe = (dateLike: string): string => {
  const d = new Date(dateLike);
  if (isNaN(d.getTime())) return dateLike;
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const JobDetailsScreen: React.FC<Props> = ({
  jobId,
  onBack,
  onOpenWorkerProfile,
  onOpenSmartMatchForJob,
  onOpenSentInvitations,
  onOpenStaffing,
  onOpenEditJob,
  onOpenChatWithContractor,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    getJobById,
    getUserById,
    getApplicationsForJob,
    getStaffingProgress,
    isJobFullyStaffed,
    invitations,
    assignments,
    applyToJob,
    respondToApplication,
    withdrawApplication,
    cancelInvitation,
    sendInvitation,
    setJobAcceptingApplications,
    isFavoriteContractor,
    toggleFavoriteContractor,
  } = useApp();

  const job = getJobById(jobId);
  const [applying, setApplying] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [candidateDialog, setCandidateDialog] = useState<
    { mode: 'accept' | 'reject'; app: Application } | null
  >(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

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

  const isContractorFavorite =
    isWorker && currentUser && contractor
      ? isFavoriteContractor(currentUser.id, contractor.id)
      : false;
  const handleToggleFavoriteContractor = () => {
    if (!isWorker || !currentUser || !contractor) return;
    toggleFavoriteContractor(currentUser.id, contractor.id);
  };

  // For worker mode: my application history for this job (newest first).
  // There can be more than one row over time — e.g. a withdrawn application
  // followed by a fresh one — so we never assume a single record.
  const myApplications = useMemo(() => {
    if (!isWorker || !currentUser) return [];
    return candidates
      .filter((a) => a.workerId === currentUser.id)
      .sort(
        (a, b) =>
          new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
      );
  }, [candidates, isWorker, currentUser]);

  // The one that still "counts" — pending or accepted. Duplicate prevention
  // and the action bar both key off this, never off historical rows.
  const myActiveApplication = useMemo(
    () =>
      myApplications.find(
        (a) => a.status === 'pending' || a.status === 'accepted'
      ) ?? null,
    [myApplications]
  );
  const myLatestApplication = myApplications[0] ?? null;

  // The worker's CURRENT assignment for this job (active if any, else latest
  // historical). Drives "is this worker actually staffed right now".
  const myAssignment =
    isWorker && currentUser
      ? getWorkerJobAssignment(assignments, job.id, currentUser.id)
      : undefined;
  const myAssignmentCancelled =
    myActiveApplication?.status === 'accepted' &&
    myAssignment?.status === 'cancelled';

  const jobOpen = isOpenForApplications(job);
  const staffing = getStaffingProgress(job.id);
  const fullyStaffed = isJobFullyStaffed(job.id);

  // Worker viewing this contractor — professional-history relationship,
  // derived only from real Assignments (same badge the contractor sees on the
  // worker's profile).
  const contractorRelationship =
    isWorker && currentUser && contractor
      ? getWorkerContractorRelationship(assignments, currentUser.id, contractor.id)
      : 'never';

  // Candidates the contractor should treat as live right now (drives the
  // "מועמדים ממתינים" count) — withdrawn / rejected are history, not pending.
  const pendingCandidatesCount = useMemo(
    () => candidates.filter((a) => a.status === 'pending').length,
    [candidates]
  );

  // Candidates ordered so live ones sit on top, history sinks to the bottom.
  const orderedCandidates = useMemo(() => {
    const rank: Record<Application['status'], number> = {
      pending: 0,
      accepted: 1,
      rejected: 2,
      withdrawn: 3,
    };
    return [...candidates].sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) {
        return rank[a.status] - rank[b.status];
      }
      return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
    });
  }, [candidates]);

  // Invitations sent for this job (contractor mode) — newest first.
  const invitationsForJob = useMemo(
    () =>
      invitations
        .filter((i) => i.jobId === job.id)
        .sort(
          (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
        ),
    [invitations, job.id]
  );

  const submitApplication = (message: string) => {
    if (!isWorker || !currentUser) return;
    setApplyDialogOpen(false);
    setApplying(true);
    setTimeout(() => {
      applyToJob(job.id, currentUser.id, message || undefined);
      setApplying(false);
      Alert.alert(
        'הבקשה נשלחה',
        'בקשתך נשלחה לקבלן. תקבל התראה כשתהיה החלטה.'
      );
    }, 500);
  };

  const handleAccept = (app: Application) => {
    if (fullyStaffed) {
      Alert.alert('כל המקומות במשרה כבר אוישו.');
      return;
    }
    setCandidateDialog({ mode: 'accept', app });
  };

  const handleReject = (app: Application) => {
    setCandidateDialog({ mode: 'reject', app });
  };

  const submitCandidateDialog = (message: string) => {
    if (!candidateDialog) return;
    const { mode, app } = candidateDialog;
    setCandidateDialog(null);
    const res = respondToApplication(
      app.id,
      mode === 'accept',
      message || undefined
    );
    if (mode === 'accept' && !res.ok && res.reason === 'full') {
      Alert.alert('כל המקומות במשרה כבר אוישו.');
    }
  };

  const handleWithdraw = (app: Application) => {
    Alert.alert(
      'לבטל את הבקשה?',
      'הבקשה שלך למשרה תבוטל. כל עוד ההרשמה פתוחה, תוכל להגיש בקשה חדשה בהמשך.',
      [
        { text: 'חזור', style: 'cancel' },
        {
          text: 'ביטול הבקשה',
          style: 'destructive',
          onPress: () => withdrawApplication(app.id),
        },
      ]
    );
  };

  const handleCancelInvitation = (inv: Invitation) => {
    Alert.alert(
      'לבטל את ההזמנה?',
      'העובד לא יוכל יותר לאשר את ההזמנה הזו.',
      [
        { text: 'חזור', style: 'cancel' },
        {
          text: 'ביטול הזמנה',
          style: 'destructive',
          onPress: () => cancelInvitation(inv.id),
        },
      ]
    );
  };

  // A pending invitation auto-cancelled ONLY because the job filled up can be
  // re-sent once a seat frees up and registration reopens. Mirrors
  // sendInvitation's own guards so it never offers a no-op. The old record is
  // left as-is; sendInvitation creates a fresh pending Invitation.
  const canReinviteInvitation = (inv: Invitation): boolean => {
    if (inv.status !== 'cancelled' || inv.cancellationReason !== 'capacity_full') {
      return false;
    }
    if (!isOpenForApplications(job)) return false;
    if (isJobFullyStaffed(job.id)) return false;
    const hasLiveInvitation = invitations.some(
      (i) =>
        i.jobId === job.id &&
        i.workerId === inv.workerId &&
        (i.status === 'pending' || i.status === 'accepted')
    );
    if (hasLiveInvitation) return false;
    return !hasActiveAssignment(assignments, job.id, inv.workerId);
  };

  const handleReinviteInvitation = (inv: Invitation) => {
    const created = sendInvitation(job.id, job.contractorId, inv.workerId);
    if (!created) {
      Alert.alert('לא ניתן להזמין', 'כל המקומות במשרה כבר אוישו.');
      return;
    }
    Alert.alert('הזמנה נשלחה', 'נשלחה הזמנה חדשה לעובד.');
  };

  const headerBadge = getJobHeaderBadge(job, fullyStaffed);

  const renderContractorResponse = (app: Application) =>
    app.contractorResponse ? (
      <View style={styles.responseNote}>
        <Text style={styles.responseNoteLabel}>הודעת הקבלן</Text>
        <Text style={styles.responseNoteText}>{app.contractorResponse}</Text>
      </View>
    ) : null;

  const renderApplyButton = (label: string) => (
    <TouchableOpacity
      style={[styles.actionBtn, styles.applyBtn, applying && { opacity: 0.7 }]}
      onPress={() => setApplyDialogOpen(true)}
      disabled={applying}
      activeOpacity={0.85}
    >
      <Ionicons name="send" size={20} color={Colors.white} />
      <Text style={styles.applyText}>{applying ? 'שולח...' : label}</Text>
    </TouchableOpacity>
  );

  // The worker's bottom action area. Always shows a clear status line + a
  // date/time line, and an explicit action (never a bare status message):
  // apply / re-apply when the job is open, or "ביטול הבקשה" while pending.
  const renderWorkerAction = () => {
    if (myActiveApplication?.status === 'pending') {
      return (
        <View style={styles.workerStatusWrap}>
          <View style={[styles.actionBtn, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="hourglass" size={20} color={Colors.warning} />
            <Text style={styles.appliedText}>ממתינה לתשובת הקבלן</Text>
          </View>
          <Text style={styles.workerStatusTime}>
            הבקשה נשלחה ב־{formatDateTime(myActiveApplication.appliedAt)}
          </Text>
          <TouchableOpacity
            style={styles.withdrawBtn}
            onPress={() => handleWithdraw(myActiveApplication)}
            activeOpacity={0.85}
          >
            <Ionicons
              name="close-circle-outline"
              size={18}
              color={Colors.danger}
            />
            <Text style={styles.withdrawBtnText}>ביטול הבקשה</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Accepted application whose assignment was later cancelled — CURRENT
    // state is "בוטל", not a stale "הבקשה אושרה".
    if (myAssignmentCancelled) {
      const cancelLine = myAssignment
        ? assignmentCancelLine(myAssignment)
        : null;
      return (
        <View style={styles.workerStatusWrap}>
          <View style={[styles.actionBtn, styles.appliedBox]}>
            <Ionicons
              name="close-circle-outline"
              size={20}
              color={Colors.textSecondary}
            />
            <Text style={styles.appliedText}>השיבוץ בוטל</Text>
          </View>
          {myActiveApplication?.respondedAt && (
            <Text style={styles.workerStatusTime}>
              הבקשה אושרה ב־{formatDateTime(myActiveApplication.respondedAt)}
            </Text>
          )}
          {cancelLine && (
            <Text style={styles.workerStatusTime}>{cancelLine}</Text>
          )}
          {myAssignment?.cancellationMessage ? (
            <View style={styles.responseNote}>
              <Text style={styles.responseNoteLabel}>
                {myAssignment.cancelledBy === 'worker'
                  ? 'ההודעה ששלחת'
                  : 'הודעת הקבלן'}
              </Text>
              <Text style={styles.responseNoteText}>
                {myAssignment.cancellationMessage}
              </Text>
            </View>
          ) : null}
          {jobOpen && renderApplyButton('הגש מועמדות מחדש')}
        </View>
      );
    }

    if (myActiveApplication?.status === 'accepted') {
      return (
        <View style={styles.workerStatusWrap}>
          <View style={[styles.actionBtn, { backgroundColor: '#DCFCE7' }]}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            <Text style={styles.appliedText}>הבקשה אושרה</Text>
          </View>
          {myActiveApplication.respondedAt && (
            <Text style={styles.workerStatusTime}>
              אושרה ב־{formatDateTime(myActiveApplication.respondedAt)}
            </Text>
          )}
          {renderContractorResponse(myActiveApplication)}
        </View>
      );
    }

    if (myLatestApplication?.status === 'withdrawn') {
      return (
        <View style={styles.workerStatusWrap}>
          <View style={[styles.actionBtn, styles.appliedBox]}>
            <Ionicons
              name="arrow-undo-outline"
              size={20}
              color={Colors.textSecondary}
            />
            <Text style={styles.appliedText}>הבקשה בוטלה</Text>
          </View>
          {myLatestApplication.withdrawnAt && (
            <Text style={styles.workerStatusTime}>
              בוטלה ב־{formatDateTime(myLatestApplication.withdrawnAt)}
            </Text>
          )}
          {jobOpen && renderApplyButton('הגש מועמדות מחדש')}
        </View>
      );
    }

    if (myLatestApplication?.status === 'rejected') {
      return (
        <View style={styles.workerStatusWrap}>
          <View style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="close-circle" size={20} color={Colors.danger} />
            <Text style={styles.appliedText}>הבקשה נדחתה</Text>
          </View>
          {myLatestApplication.respondedAt && (
            <Text style={styles.workerStatusTime}>
              נדחתה ב־{formatDateTime(myLatestApplication.respondedAt)}
            </Text>
          )}
          {renderContractorResponse(myLatestApplication)}
        </View>
      );
    }

    if (jobOpen) return renderApplyButton('הגש מועמדות');

    return (
      <View style={[styles.actionBtn, styles.appliedBox]}>
        <Text style={styles.appliedText}>
          {fullyStaffed ? 'השיבוץ למשרה הושלם' : 'המשרה סגורה להרשמה'}
        </Text>
      </View>
    );
  };

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
        <Text style={styles.headerTitle} pointerEvents="none">פרטי המשרה</Text>
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
              label={headerBadge.label}
              tone={headerBadge.tone}
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
          <Text style={styles.postedAtText}>
            פורסם ב-{formatDateHe(job.postedAt)}
            {job.updatedAt ? ` · עודכן לאחרונה ב-${formatDateHe(job.updatedAt)}` : ''}
          </Text>
        </View>

        {/* Posted by — visible to worker */}
        {!isContractorOwner && contractor && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>פורסם על ידי</Text>
            </View>
            <View style={styles.contractorRow}>
              <ContractorAvatar
                contractor={contractor}
                size={40}
                style={styles.contractorIcon}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.contractorName}>
                  {contractor.companyName ?? contractor.fullName}
                </Text>
                <Text style={styles.contractorMeta}>
                  {[contractor.city, ...contractorAreas(contractor)]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {isWorker && (
                <TouchableOpacity
                  style={styles.contractorFavoriteBtn}
                  onPress={handleToggleFavoriteContractor}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel={
                    isContractorFavorite ? 'הסר קבלן מהמועדפים' : 'הוסף קבלן למועדפים'
                  }
                >
                  <Ionicons
                    name={isContractorFavorite ? 'heart' : 'heart-outline'}
                    size={22}
                    color={isContractorFavorite ? '#E0245E' : Colors.textMuted}
                  />
                </TouchableOpacity>
              )}
            </View>
            {isWorker && (
              <View style={styles.relationshipBlock}>
                <StatusBadge
                  label={RELATIONSHIP_BADGE[contractorRelationship].label}
                  tone={RELATIONSHIP_BADGE[contractorRelationship].tone}
                />
                {contractorRelationship !== 'never' && (
                  <TouchableOpacity
                    style={styles.historyCta}
                    onPress={() => setHistoryVisible(true)}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color={Colors.primary}
                    />
                    <Text style={styles.historyCtaText}>
                      צפה בהיסטוריית עבודות משותפות
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
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

        {/* Worksite images gallery — only when the job actually has any */}
        {!!job.worksiteImages && job.worksiteImages.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>תמונות ממקום העבודה</Text>
            </View>
            {/* Wrapped grid, not a horizontal scroller — a horizontal
                ScrollView always starts at its left edge regardless of
                row-reverse, which would show the images starting from the
                wrong (last-read) side in RTL. flexWrap has no such issue:
                the first image reliably renders at the right. */}
            <View style={styles.galleryRow}>
              {job.worksiteImages.map((uri) => (
                <TouchableOpacity
                  key={uri}
                  onPress={() => setViewerUri(uri)}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri }} style={styles.galleryThumb} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Practical info */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>פרטים מעשיים</Text>
          </View>
          <FieldRow label="כתובת" value={job.address} />
          <FieldRow label="תאריך התחלה" value={job.startDate} ltr />
          <FieldRow label="משך" value={job.duration} />
          {!!job.hourlyRate && (
            <FieldRow label="תעריף לשעה" value={`${job.hourlyRate} ₪`} ltr />
          )}
          {!!job.dailyRate && (
            <FieldRow label="תעריף ליום" value={`${job.dailyRate} ₪`} ltr />
          )}
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
            {onOpenEditJob && (
              <TouchableOpacity
                style={styles.editJobBtn}
                onPress={() => onOpenEditJob(job.id)}
                activeOpacity={0.85}
              >
                <Ionicons name="pencil" size={18} color={Colors.primary} />
                <Text style={styles.editJobText}>עריכת משרה</Text>
              </TouchableOpacity>
            )}

            {/* Staffing summary */}
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>מצב שיבוץ</Text>
              </View>
              <StaffingProgress progress={staffing} />
              <TouchableOpacity
                style={styles.manageStaffingBtn}
                onPress={() => onOpenStaffing?.(job.id)}
                activeOpacity={0.85}
              >
                <Ionicons name="people" size={16} color={Colors.primary} />
                <Text style={styles.manageStaffingText}>ניהול שיבוצים</Text>
              </TouchableOpacity>
            </View>

            {/* Candidates section — the count is pending-only, so the title
                says so explicitly; accepted / rejected / withdrawn rows stay
                below as history and never inflate the number. */}
            <View style={styles.section}>
              <View style={styles.sectionHeadRow}>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>
                    {pendingCandidatesCount}
                  </Text>
                </View>
                <Text style={styles.sectionTitle}>מועמדים ממתינים</Text>
              </View>
              {candidates.length === 0 ? (
                <Text style={styles.emptyHint}>
                  עדיין לא הוגשו מועמדויות. נסה הזמנה ישירה או התאמה חכמה.
                </Text>
              ) : (
                <>
                  {fullyStaffed && pendingCandidatesCount > 0 && (
                    <Text style={styles.capacityHint}>
                      המשרה מאוישת במלואה — לא ניתן לאשר מועמדים נוספים.
                    </Text>
                  )}
                  {orderedCandidates.map((app) => {
                    const w = getUserById(app.workerId) as Worker | undefined;
                    if (!w) return null;
                    const asg = getWorkerJobAssignment(
                      assignments,
                      job.id,
                      app.workerId
                    );
                    const cancelledStaffing =
                      app.status === 'accepted' &&
                      asg?.status === 'cancelled';
                    const isHistory =
                      app.status === 'withdrawn' ||
                      app.status === 'rejected' ||
                      cancelledStaffing;
                    const badge = currentStaffedState(
                      {
                        label: APPLICATION_STATUS_LABEL[app.status],
                        tone: APPLICATION_STATUS_TONE[app.status],
                      },
                      app.status,
                      asg
                    );
                    const cancelLine = cancelledStaffing
                      ? assignmentCancelLine(asg!)
                      : null;
                    return (
                      <View
                        key={app.id}
                        style={[
                          styles.candidateRow,
                          isHistory && styles.candidateRowHistory,
                        ]}
                      >
                        <View style={styles.candidateHeader}>
                          <TouchableOpacity
                            style={styles.candidateMain}
                            onPress={() => onOpenWorkerProfile(w.id)}
                            activeOpacity={0.85}
                          >
                            <WorkerAvatar worker={w} size={36} />
                            <View style={{ flex: 1 }}>
                              <View style={styles.candidateTopline}>
                                <StatusBadge
                                  label={badge.label}
                                  tone={badge.tone}
                                  small
                                />
                                <Text
                                  style={styles.candidateName}
                                  numberOfLines={1}
                                >
                                  {w.fullName}
                                </Text>
                              </View>
                              <Text
                                style={styles.candidateMeta}
                                numberOfLines={1}
                              >
                                {w.profession} · {w.experienceYears} שנים ·{' '}
                                {w.city}
                              </Text>
                            </View>
                          </TouchableOpacity>

                          {app.status === 'pending' && (
                            <View style={styles.candidateActions}>
                              {!fullyStaffed && (
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
                              )}
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

                        <View style={styles.timelineBlock}>
                          {applicationTimeline(app).map((line) => (
                            <Text key={line} style={styles.timelineText}>
                              {line}
                            </Text>
                          ))}
                          {cancelLine && (
                            <Text style={styles.timelineText}>{cancelLine}</Text>
                          )}
                          {cancelledStaffing && asg?.cancellationMessage ? (
                            <Text style={styles.timelineText}>
                              {asg.cancelledBy === 'worker'
                                ? 'הודעת העובד'
                                : 'הודעתך'}
                              : “{asg.cancellationMessage}”
                            </Text>
                          ) : null}
                        </View>

                        {app.message?.trim() ? (
                          <View style={styles.responseNote}>
                            <Text style={styles.responseNoteLabel}>
                              הודעת העובד
                            </Text>
                            <Text style={styles.responseNoteText}>
                              {app.message.trim()}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </>
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
                  const asg = getWorkerJobAssignment(
                    assignments,
                    job.id,
                    inv.workerId
                  );
                  const cancelledStaffing =
                    inv.status === 'accepted' && asg?.status === 'cancelled';
                  const badge = currentStaffedState(
                    {
                      label: INVITATION_STATUS_LABEL[inv.status],
                      tone: INVITATION_STATUS_TONE[inv.status],
                    },
                    inv.status,
                    asg
                  );
                  const cancelLine = cancelledStaffing
                    ? assignmentCancelLine(asg!)
                    : null;
                  return (
                    <View key={inv.id} style={styles.invRow}>
                      <View style={styles.invHeader}>
                        <TouchableOpacity
                          style={styles.invMain}
                          onPress={() =>
                            w ? onOpenWorkerProfile(w.id) : null
                          }
                          activeOpacity={0.85}
                        >
                          <View style={styles.invTopline}>
                            <StatusBadge
                              label={badge.label}
                              tone={badge.tone}
                              small
                            />
                            <Text style={styles.invName} numberOfLines={1}>
                              {w?.fullName ?? '—'}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {inv.status === 'pending' && (
                          <TouchableOpacity
                            style={styles.invCancelBtn}
                            onPress={() => handleCancelInvitation(inv)}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.invCancelText}>
                              ביטול הזמנה
                            </Text>
                          </TouchableOpacity>
                        )}
                        {canReinviteInvitation(inv) && (
                          <TouchableOpacity
                            style={styles.invReinviteBtn}
                            onPress={() => handleReinviteInvitation(inv)}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.invReinviteText}>
                              הזמן מחדש
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={styles.timelineBlock}>
                        {invitationTimeline(inv, 'contractor').map((line) => (
                          <Text key={line} style={styles.timelineText}>
                            {line}
                          </Text>
                        ))}
                        {cancelLine && (
                          <Text style={styles.timelineText}>{cancelLine}</Text>
                        )}
                      </View>
                    </View>
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

            {/* Registration + staffing actions. When the job is fully
                staffed the system has already closed registration
                (reason 'capacity'); there is nothing sensible to toggle and
                no room to invite anyone, so we show a status line instead. */}
            {fullyStaffed ? (
              <View style={styles.completedBanner}>
                <Ionicons
                  name="checkmark-done"
                  size={18}
                  color={Colors.success}
                />
                <Text style={styles.completedBannerText}>
                  השיבוץ הושלם — {staffing.filled} מתוך {staffing.needed} עובדים
                  שובצו. ההרשמה נסגרה אוטומטית.
                </Text>
              </View>
            ) : (
              <>
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
          </>
        )}
      </ScrollView>

      {/* === Worker mode action bar === */}
      {isWorker && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          {renderWorkerAction()}
        </View>
      )}

      <ResponseDialog
        visible={!!candidateDialog}
        title={
          candidateDialog?.mode === 'accept'
            ? 'לאשר את המועמד?'
            : 'לדחות את הבקשה?'
        }
        message={
          candidateDialog?.mode === 'accept' ? 'העובד ישובץ למשרה.' : undefined
        }
        inputLabel="הודעה לעובד (אופציונלי)"
        inputPlaceholder={
          candidateDialog?.mode === 'accept'
            ? 'שמחים לצרף אותך לפרויקט. ניצור איתך קשר לגבי פרטי ההגעה.'
            : 'תודה על ההתעניינות. בשלב זה בחרנו מועמד אחר.'
        }
        confirmLabel={
          candidateDialog?.mode === 'accept' ? 'אישור ושיבוץ' : 'דחיית הבקשה'
        }
        destructive={candidateDialog?.mode === 'reject'}
        onConfirm={submitCandidateDialog}
        onClose={() => setCandidateDialog(null)}
      />

      <ResponseDialog
        visible={applyDialogOpen}
        title="הגשת מועמדות"
        message="ניתן לצרף הודעה קצרה לקבלן (אופציונלי)"
        inputLabel="הודעה לקבלן (אופציונלי)"
        inputPlaceholder="שלום, יש לי ניסיון בפרויקטים דומים ואשמח להצטרף לעבודה."
        confirmLabel="הגש מועמדות"
        onConfirm={submitApplication}
        onClose={() => setApplyDialogOpen(false)}
      />

      {/* Worksite image full-screen preview */}
      <Modal
        visible={!!viewerUri}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUri(null)}
      >
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity
            style={styles.viewerCloseBtn}
            onPress={() => setViewerUri(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="סגור"
          >
            <Ionicons name="close" size={28} color={Colors.white} />
          </TouchableOpacity>
          {!!viewerUri && (
            <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {isWorker && currentUser && contractor && (
        <SharedWorkHistorySheet
          visible={historyVisible}
          onClose={() => setHistoryVisible(false)}
          workerId={currentUser.id}
          contractorId={contractor.id}
        />
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
  postedAtText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 4,
    lineHeight: FontSize.xs + 6,
  },

  galleryRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  galleryThumb: {
    width: 96,
    height: 96,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseBtn: {
    position: 'absolute',
    top: 50,
    right: Spacing.lg,
    zIndex: 1,
    padding: 6,
  },
  viewerImage: { width: '100%', height: '80%' },

  editJobBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
    marginBottom: Spacing.md,
  },
  editJobText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
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
  relationshipBlock: {
    marginTop: Spacing.md,
    gap: 10,
    alignItems: 'flex-start',
  },
  historyCta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignSelf: 'stretch',
  },
  historyCtaText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
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
  contractorFavoriteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
    flexDirection: 'column',
    gap: 4,
    paddingVertical: 10,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  candidateRowHistory: {
    opacity: 0.6,
  },
  candidateHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  candidateMain: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  candidateTopline: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  // Full-width block under the header row so the "…ב־DD.MM.YYYY בשעה HH:mm"
  // sentences get the whole card width and wrap cleanly instead of being
  // squeezed next to the avatar/actions.
  timelineBlock: {
    width: '100%',
    gap: 2,
  },
  timelineText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.xs + 7,
    flexShrink: 1,
  },
  capacityHint: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingBottom: 8,
  },
  candidateName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
    flexShrink: 1,
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
    paddingTop: 2,
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
    flexDirection: 'column',
    gap: 4,
    paddingVertical: 10,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  invHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  invMain: {
    flex: 1,
  },
  invTopline: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  invName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  invMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  invCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    backgroundColor: Colors.white,
  },
  invCancelText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.danger,
    writingDirection: 'rtl',
  },
  invReinviteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  invReinviteText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.white,
    writingDirection: 'rtl',
  },

  seeAllBtn: { alignItems: 'center', paddingVertical: 8, marginTop: 4 },
  seeAllText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },

  completedBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DCFCE7',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  completedBannerText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.success,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.sm + 6,
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

  workerStatusWrap: {
    gap: 8,
  },
  workerStatusTime: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  responseNote: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: 2,
  },
  responseNoteLabel: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  responseNoteText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.sm + 5,
  },
  withdrawBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    backgroundColor: Colors.white,
  },
  withdrawBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.danger,
    writingDirection: 'rtl',
  },
});

export default JobDetailsScreen;
