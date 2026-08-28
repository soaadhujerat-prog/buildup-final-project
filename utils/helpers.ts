import type { ApplicationStatus, Assignment, InvitationStatus } from '../types';

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const formatShortDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'numeric',
  });
};

/** For conversation-list / chat timestamps — never show a raw ISO string.
 *  Today → "HH:mm", yesterday → "אתמול", anything older → "DD/MM/YYYY". */
export const formatConversationTime = (isoString: string): string => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const now = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, now)) {
    return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'אתמול';

  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

/** The one shared "date + time" formatter for every lifecycle timestamp in
 *  the app (application sent/accepted/rejected/withdrawn, invitation
 *  sent/accepted/rejected/cancelled). Output: "28.08.2026 בשעה 14:38" —
 *  DD.MM.YYYY, 24-hour HH:mm, always rendered in the device's local
 *  timezone. Never hand-roll this per screen. */
export const formatDateTime = (isoString?: string): string => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  return `${dd}.${mm}.${yyyy} בשעה ${hh}:${min}`;
};

export const formatCurrency = (amount: number): string => {
  return `${amount.toLocaleString('he-IL')} ₪`;
};

/** Single formatter for "X ₪/unit" — the one consistent way a job rate is
 *  ever rendered, everywhere in the app (JobCard, JobDetails preview chips,
 *  compact list rows). Always a space before ₪. */
export const formatRatePerUnit = (amount: number, unit: 'שעה' | 'יום'): string =>
  `${amount} ₪/${unit}`;

/** Compact "X ₪/שעה • Y ₪/יום" for a job's rate(s) — used anywhere space is
 *  tight (list rows). Handles either field being unset; a job is only ever
 *  missing both if it's badly-formed data (PostJobScreen requires at least
 *  one), so this never needs a "no rate" fallback. */
export const formatJobRateCompact = (job: {
  hourlyRate?: number;
  dailyRate?: number;
}): string => {
  const parts: string[] = [];
  if (job.hourlyRate) parts.push(formatRatePerUnit(job.hourlyRate, 'שעה'));
  if (job.dailyRate) parts.push(formatRatePerUnit(job.dailyRate, 'יום'));
  return parts.join(' • ');
};

export const getInitials = (name: string): string => {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`;
  }
  return name[0] || '?';
};

export const getMatchColor = (score: number): string => {
  if (score >= 85) return '#22C55E';
  if (score >= 65) return '#F97316';
  return '#EF4444';
};

export const getMatchLabel = (score: number): string => {
  if (score >= 85) return 'התאמה מצוינת';
  if (score >= 70) return 'התאמה טובה';
  if (score >= 50) return 'התאמה בינונית';
  return 'התאמה חלשה';
};

// ---------------------------------------------------------------------------
// Application / Invitation status → badge label + tone (one shared source, so
// every screen that shows a lifecycle pill reads the same thing).
// ---------------------------------------------------------------------------

export type BadgeTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: 'ממתין',
  accepted: 'התקבל',
  rejected: 'נדחתה',
  withdrawn: 'בוטלה',
};

export const APPLICATION_STATUS_TONE: Record<ApplicationStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
};

export const INVITATION_STATUS_LABEL: Record<InvitationStatus, string> = {
  pending: 'ממתין',
  accepted: 'התקבל',
  declined: 'נדחתה',
  expired: 'פגה',
  cancelled: 'בוטלה',
};

export const INVITATION_STATUS_TONE: Record<InvitationStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'danger',
  expired: 'neutral',
  cancelled: 'neutral',
};

/** Human timeline sentences for an application, every one a full
 *  "<what happened> ב־DD.MM.YYYY בשעה HH:mm" line. Line 1 is always the
 *  "sent" line; a second line is added for the terminal states that carry
 *  their own timestamp. */
export const applicationTimeline = (app: {
  appliedAt: string;
  respondedAt?: string;
  withdrawnAt?: string;
  status: ApplicationStatus;
}): string[] => {
  const lines: string[] = [`הבקשה נשלחה ב־${formatDateTime(app.appliedAt)}`];
  if (app.status === 'accepted' && app.respondedAt) {
    lines.push(`אושרה ב־${formatDateTime(app.respondedAt)}`);
  } else if (app.status === 'rejected' && app.respondedAt) {
    lines.push(`נדחתה ב־${formatDateTime(app.respondedAt)}`);
  } else if (app.status === 'withdrawn' && app.withdrawnAt) {
    lines.push(`בוטלה על ידי העובד ב־${formatDateTime(app.withdrawnAt)}`);
  }
  return lines;
};

/** Human timeline sentences for an invitation. `perspective` changes the
 *  wording of the "cancelled" line — "בוטלה על ידך" for the contractor who
 *  cancelled it, "בוטלה על ידי הקבלן" for the worker who received it — unless
 *  the cancellation was automatic (`cancellationReason === 'capacity_full'`),
 *  in which case neither side "cancelled" it and the line explains why. */
export const invitationTimeline = (
  inv: {
    sentAt: string;
    respondedAt?: string;
    cancelledAt?: string;
    cancellationReason?: 'manual' | 'capacity_full';
    status: InvitationStatus;
  },
  perspective: 'worker' | 'contractor'
): string[] => {
  const lines: string[] = [`ההזמנה נשלחה ב־${formatDateTime(inv.sentAt)}`];
  if (inv.status === 'accepted' && inv.respondedAt) {
    lines.push(`אושרה ב־${formatDateTime(inv.respondedAt)}`);
  } else if (inv.status === 'declined' && inv.respondedAt) {
    lines.push(`נדחתה ב־${formatDateTime(inv.respondedAt)}`);
  } else if (inv.status === 'cancelled' && inv.cancelledAt) {
    if (inv.cancellationReason === 'capacity_full') {
      lines.push(`בוטלה ב־${formatDateTime(inv.cancelledAt)}`);
      lines.push('המשרה אוישה במלואה');
    } else {
      lines.push(
        perspective === 'contractor'
          ? `בוטלה על ידך ב־${formatDateTime(inv.cancelledAt)}`
          : `בוטלה על ידי הקבלן ב־${formatDateTime(inv.cancelledAt)}`
      );
    }
  }
  return lines;
};

/** Current-state badge for a worker's relationship to a job, honouring the
 *  rule "Assignment describes the present, Application/Invitation describe
 *  history": an accepted application/invitation whose Assignment is no
 *  longer active shows the Assignment's real state, not a stale "התקבל".
 *  Pass the base label/tone (from the *_STATUS_* maps) plus the historical
 *  decision status and the worker's current assignment for this job. */
export const currentStaffedState = (
  base: { label: string; tone: BadgeTone },
  decisionStatus: ApplicationStatus | InvitationStatus,
  assignment?: Pick<Assignment, 'status'>
): { label: string; tone: BadgeTone } => {
  if (decisionStatus === 'accepted' && assignment) {
    if (assignment.status === 'cancelled') {
      return { label: 'בוטל', tone: 'neutral' };
    }
    if (assignment.status === 'completed') {
      return { label: 'הושלם', tone: 'info' };
    }
  }
  return base;
};

/** "בוטל על ידי הקבלן ב־DD.MM.YYYY בשעה HH:mm" (or "העובד"). */
export const assignmentCancelLine = (
  assignment: Pick<Assignment, 'cancelledBy' | 'cancelledAt'>
): string | null => {
  if (!assignment.cancelledAt) return null;
  const who = assignment.cancelledBy === 'worker' ? 'העובד' : 'הקבלן';
  return `בוטל על ידי ${who} ב־${formatDateTime(assignment.cancelledAt)}`;
};

export const getRequestStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    pending: 'ממתין',
    accepted: 'אושר',
    rejected: 'נדחה',
    withdrawn: 'בוטל',
  };
  return labels[status] || status;
};

export const getNotificationIcon = (type: string): string => {
  const icons: Record<string, string> = {
    job_request: 'briefcase',
    job_accepted: 'checkmark-circle',
    job_rejected: 'close-circle',
    new_message: 'chatbubble',
    review: 'star',
    system: 'information-circle',
  };
  return icons[type] || 'notifications';
};

export const getTimeAgo = (dateString: string): string => {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'עכשיו';
  if (diffMins < 60) return `לפני ${diffMins} דקות`;
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays === 1) return 'אתמול';
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  return formatShortDate(dateString);
};

export const getAvatarBackground = (name: string): string => {
  const colors = [
    '#F97316', '#1E3A5F', '#22C55E', '#3B82F6',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F59E0B',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};
