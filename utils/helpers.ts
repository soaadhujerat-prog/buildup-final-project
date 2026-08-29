import type {
  ApplicationStatus,
  Assignment,
  ContractorLicenseVerificationStatus,
  InvitationStatus,
  SupportTicketStatus,
} from '../types';

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

// ---------------------------------------------------------------------------
// Phone — one shared normalizer + validator for every form (worker &
// contractor sign-up, both profile-edit screens). Validation always runs on
// the NORMALIZED value, never on what the user typed, so an already-valid
// stored number like "054-9876543" passes untouched.
// ---------------------------------------------------------------------------

/** Strip spaces, hyphens, parentheses and dots; turn a +972 / 972 prefix
 *  back into a leading 0. Returns digits only (with the leading 0). */
export const normalizePhone = (raw: string): string => {
  const cleaned = (raw ?? '').replace(/[\s\-().]/g, '');
  return cleaned
    .replace(/^\+?972/, '0')
    .replace(/[^\d]/g, '');
};

/** Valid Israeli line: 10 digits starting 0 (mobile / most landlines) or a
 *  9-digit 0-prefixed landline. Checked on the normalized value. */
export const isValidIsraeliPhone = (raw: string): boolean =>
  /^0\d{8,9}$/.test(normalizePhone(raw));

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

// ---------------------------------------------------------------------------
// Support tickets — the raw model keeps 4 statuses
// ('open' | 'in_progress' | 'resolved' | 'closed'), but the UI only ever
// shows THREE states. 'resolved' and 'closed' both mean "finished" to a user,
// so they collapse into one "טופל" category for every badge, filter and
// count. This is the ONE place that maps status → display; never re-derive a
// support label/tone/filter per screen. Raw statuses on old records are left
// untouched — only their presentation is unified.
// ---------------------------------------------------------------------------

export type SupportDisplayState = 'waiting' | 'in_progress' | 'done';

export interface SupportDisplayInfo {
  state: SupportDisplayState;
  label: string;
  tone: BadgeTone;
}

export const SUPPORT_DISPLAY_FILTERS: {
  key: 'all' | SupportDisplayState;
  label: string;
}[] = [
  { key: 'all', label: 'הכל' },
  { key: 'waiting', label: 'ממתין לטיפול' },
  { key: 'in_progress', label: 'בטיפול' },
  { key: 'done', label: 'טופל' },
];

export const supportTicketDisplay = (
  status: SupportTicketStatus
): SupportDisplayInfo => {
  switch (status) {
    case 'open':
      return { state: 'waiting', label: 'ממתין לטיפול', tone: 'danger' };
    case 'in_progress':
      return { state: 'in_progress', label: 'בטיפול', tone: 'warning' };
    case 'resolved':
    case 'closed':
    default:
      return { state: 'done', label: 'טופל', tone: 'success' };
  }
};

/** True while the ticket still needs admin attention — i.e. NOT in the final
 *  "טופל" category. This is what "פניות פתוחות" counts. */
export const isSupportTicketOpen = (status: SupportTicketStatus): boolean =>
  supportTicketDisplay(status).state !== 'done';

/** The one wording for "when was this support ticket received", shared by the
 *  list card and the details screen. Full "DD.MM.YYYY בשעה HH:mm" when the
 *  source timestamp carries a time-of-day; date-only (no invented "בשעה
 *  00:00") when it's a legacy date-only mock value. */
export const supportTicketReceivedLine = (createdAt?: string): string => {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (isNaN(date.getTime())) return '';
  const hasTime = /T\d{2}:\d{2}/.test(createdAt);
  if (hasTime) return `הפנייה התקבלה ב־${formatDateTime(createdAt)}`;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `הפנייה התקבלה ב־${dd}.${mm}.${date.getFullYear()}`;
};

/** Who wrote a support-ticket message, as shown above each bubble. */
export const supportSenderLabel = (
  senderRole: 'admin' | 'worker' | 'contractor'
): string => {
  switch (senderRole) {
    case 'admin':
      return 'מנהל המערכת';
    case 'contractor':
      return 'הקבלן';
    case 'worker':
    default:
      return 'העובד';
  }
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

/** The single human sentence shown wherever an invitation was auto-cancelled
 *  because the job filled up (cancellationReason === 'capacity_full') — one
 *  clear line with date + time + reason, never a bare timestamp followed by a
 *  separate "המשרה אוישה במלואה" fragment. */
export const invitationCapacityCancelSentence = (cancelledAt?: string): string =>
  `ההזמנה בוטלה ב־${formatDateTime(cancelledAt)} משום שהמשרה אוישה במלואה.`;

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
      lines.push(invitationCapacityCancelSentence(inv.cancelledAt));
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

// ---------------------------------------------------------------------------
// Contractor licence — derived expiry / verification / review status.
// Pure date math (no timers, no scheduler): a backend later drives real
// reminders off licenseValidUntil / licenseNextReviewAt; the frontend only
// reads the current state from them.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type LicenseExpiryState =
  | 'valid'
  | 'expiring_soon'
  | 'expired'
  | 'unknown';

/** `warnWithinDays` before licenseValidUntil counts as "expiring_soon". */
export const licenseExpiryState = (
  validUntil?: string,
  warnWithinDays = 30
): LicenseExpiryState => {
  if (!validUntil) return 'unknown';
  const d = new Date(validUntil);
  if (isNaN(d.getTime())) return 'unknown';
  const diff = d.getTime() - Date.now();
  if (diff < 0) return 'expired';
  if (diff <= warnWithinDays * MS_PER_DAY) return 'expiring_soon';
  return 'valid';
};

/** True once licenseNextReviewAt has passed — "נדרשת בדיקה תקופתית". */
export const isLicenseReviewDue = (nextReviewAt?: string): boolean => {
  if (!nextReviewAt) return false;
  const d = new Date(nextReviewAt);
  if (isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
};

/** Days from now until `iso` (negative if already past). */
export const daysUntil = (iso?: string): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / MS_PER_DAY);
};

/** The wording used everywhere the licence-verification meaning is explained.
 *  The admin performs a MANUAL check of the uploaded document only — there is
 *  no government-registry verification yet. Never claim otherwise, and never
 *  expose internal engineering terms to the user. */
export const CONTRACTOR_LICENSE_MANUAL_NOTE =
  'אימות הרישיון מתבצע בבדיקה ידנית של מנהל המערכת על בסיס המסמך שהוגש. אימות מקוון מול מאגר ממשלתי כפוף לזמינות שירות ממשלתי מורשה.';

export type ContractorLicenseState =
  | 'pending'
  | 'verified'
  | 'review_due'
  | 'expiring_soon'
  | 'expired';

export interface ContractorLicenseStatusInfo {
  state: ContractorLicenseState;
  label: string;
  tone: BadgeTone;
  /** True when the contractor / admin should act. */
  needsAttention: boolean;
}

/** THE single source of truth for a contractor licence's visual state,
 *  derived only from stored fields — never a stored status string.
 *  Priority: expired > expiring soon (≤30d) > annual review due > verified.
 *  Anything not yet admin-verified is always "pending", regardless of dates.
 *  A pending update *request* is separate information — it does NOT change
 *  this and never replaces the current approved licence. */
export const getContractorLicenseStatus = (c: {
  licenseVerificationStatus?: ContractorLicenseVerificationStatus;
  licenseValidUntil?: string;
  licenseNextReviewAt?: string;
}): ContractorLicenseStatusInfo => {
  if (c.licenseVerificationStatus !== 'verified') {
    return {
      state: 'pending',
      label: 'ממתין לבדיקת מנהל המערכת',
      tone: 'warning',
      needsAttention: true,
    };
  }
  const exp = licenseExpiryState(c.licenseValidUntil);
  if (exp === 'expired') {
    return { state: 'expired', label: 'פג תוקף', tone: 'danger', needsAttention: true };
  }
  if (exp === 'expiring_soon') {
    return {
      state: 'expiring_soon',
      label: 'מתקרב לפקיעה',
      tone: 'warning',
      needsAttention: true,
    };
  }
  if (isLicenseReviewDue(c.licenseNextReviewAt)) {
    return {
      state: 'review_due',
      label: 'נדרשת בדיקה תקופתית',
      tone: 'warning',
      needsAttention: true,
    };
  }
  return { state: 'verified', label: 'מאומת', tone: 'success', needsAttention: false };
};

/** Back-compat alias — same shape (plus a `state` field) as before. */
export const contractorLicenseUiInfo = getContractorLicenseStatus;

/** "requires attention" for the Admin dashboard KPI / list — the derived
 *  status needs action, OR there's a pending update request to review. */
export const contractorLicenseNeedsAttention = (
  c: {
    licenseVerificationStatus?: ContractorLicenseVerificationStatus;
    licenseValidUntil?: string;
    licenseNextReviewAt?: string;
  },
  hasPendingRequest: boolean
): boolean => hasPendingRequest || getContractorLicenseStatus(c).needsAttention;

/** Frontend-only policy helper — ready for a future "block sensitive business
 *  actions when the licence isn't in force" rule. NOT enforced anywhere yet:
 *  job posting / applications / staffing are deliberately left untouched.
 *  Backend + product policy decide where this gates. */
export const contractorLicenseAllowsSensitiveActions = (c: {
  licenseVerificationStatus?: ContractorLicenseVerificationStatus;
  licenseValidUntil?: string;
}): boolean =>
  c.licenseVerificationStatus === 'verified' &&
  licenseExpiryState(c.licenseValidUntil) !== 'expired';

// ---------------------------------------------------------------------------
// Licence dates — the model stores ISO; DatePickerField speaks "DD/MM/YYYY".
// All licence dates are shown as "DD.MM.YYYY" (never the long "1 בספטמבר"
// form).
// ---------------------------------------------------------------------------

/** ISO → "DD.MM.YYYY" for display. */
export const formatDateIL = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
};

/** DatePickerField "DD/MM/YYYY" → ISO string, or null if malformed. Anchored
 *  to local noon so re-parsing never shifts the calendar day across a TZ. */
export const dmyToIso = (dmy: string): string | null => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((dmy ?? '').trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (isNaN(d.getTime())) return null;
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};

/** ISO → "DD/MM/YYYY" for seeding a DatePickerField's value. */
export const isoToDmy = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
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
