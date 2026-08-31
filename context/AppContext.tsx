// =============================================================================
// BuildUp – Global app state (prototype)
// =============================================================================
// Single React context that holds every mutable collection in the app.
// Screens read from here instead of importing MOCK_* directly, so the data
// the UI shows always reflects the latest actions (registration, approval,
// applications, invitations, support tickets, etc.).
// =============================================================================

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
  useCallback,
} from 'react';

import {
  Admin,
  Worker,
  Contractor,
  Customer,
  CustomerStatus,
  RegistrationRecord,
  RegistrationData,
  WorkerRegistrationData,
  ContractorRegistrationData,
  JobPost,
  Application,
  Invitation,
  Assignment,
  Conversation,
  Message,
  AppNotification,
  SupportTicket,
  SupportTicketType,
  SupportTicketStatus,
  SupportTicketMessage,
  SupportMessageSenderRole,
  RegistrationStatusEvent,
  ProfessionCategory,
  ContractorFavoriteWorker,
  WorkerFavoriteContractor,
  ContractorLicenseUpdateRequest,
  UploadedDocument,
} from '../types';

import {
  MOCK_ADMINS,
  MOCK_WORKERS,
  MOCK_CONTRACTORS,
  MOCK_REGISTRATIONS,
  MOCK_JOBS,
  MOCK_APPLICATIONS,
  MOCK_INVITATIONS,
  MOCK_CONVERSATIONS,
  MOCK_NOTIFICATIONS,
  MOCK_SUPPORT_TICKETS,
} from '../data/mockData';

import {
  buildAssignmentFromApplication,
  buildAssignmentFromInvitation,
  hasActiveAssignment,
  getActiveAssignedWorkersCount,
  isJobFullyStaffed as computeIsJobFullyStaffed,
  getStaffingProgress as computeStaffingProgress,
  StaffingProgress,
} from '../services/assignmentService';

import {
  findConversation,
  buildConversation,
  buildMessage,
  normalizeConversation,
  dedupeConversations,
} from '../services/conversationService';

import { isBackendEnabled } from '../config/env';
import * as authService from '../services/authService';
import { bootstrapSessionUser, loginById } from '../services/authSession';
import type { SessionUser, LoginResult } from '../types/auth';

import { JobFilters, DEFAULT_JOB_FILTERS } from '../components/JobFilterBottomSheet';
import { JobSortOption } from '../components/JobSortBottomSheet';
import {
  workerProfessions,
  contractorAreas,
  normalizeCertifications,
} from '../utils/normalize';
import {
  supportTicketDisplay,
  getContractorLicenseStatus,
  daysUntil,
  formatDateIL,
} from '../utils/helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// SessionUser + LoginResult now live in types/auth.ts so the auth service layer
// can use them without importing this React context. Re-exported here so every
// existing `import { SessionUser, LoginResult } from '../context/AppContext'`
// keeps working unchanged.
export type { SessionUser, LoginResult };

/** Result of any action that would create a new staffing slot (accepting an
 *  application / invitation). `ok: false, reason: 'full'` means the job had
 *  already reached workersNeeded and nothing was changed — the caller should
 *  surface "כל המקומות במשרה כבר אוישו." */
export interface StaffingActionResult {
  ok: boolean;
  reason?: 'full';
}

/** The worker job-search screen's search/filter/sort — lifted up here
 *  (instead of local useState in AvailableJobsScreen) because the
 *  drilldown route stack unmounts the whole tab shell whenever a screen
 *  like JobDetails is pushed on top of it. Local state would reset on
 *  every "back"; this survives for as long as the app session does. */
export interface JobSearchState {
  query: string;
  filters: JobFilters;
  sort: JobSortOption;
}

export const DEFAULT_JOB_SEARCH_STATE: JobSearchState = {
  query: '',
  filters: DEFAULT_JOB_FILTERS,
  sort: 'default',
};

interface AppState {
  // Session
  currentUser: SessionUser;

  // Pools (single source of truth for every "where did this number come from" question)
  admins: Admin[];
  workers: Worker[];
  contractors: Contractor[];
  registrations: RegistrationRecord[];

  jobs: JobPost[];
  applications: Application[];
  invitations: Invitation[];
  assignments: Assignment[];
  favoriteWorkers: ContractorFavoriteWorker[];
  favoriteContractors: WorkerFavoriteContractor[];

  conversations: Conversation[];
  notifications: AppNotification[];
  supportTickets: SupportTicket[];
  contractorLicenseRequests: ContractorLicenseUpdateRequest[];

  // Worker job-search state — persists across navigation (see JobSearchState).
  jobSearchState: JobSearchState;
  updateJobSearchState: (patch: Partial<JobSearchState>) => void;

  // Auth
  /** True only while the backend session is being restored on cold start
   *  (`EXPO_PUBLIC_USE_BACKEND=true`). The navigator holds on the splash until
   *  this clears, so Login / a dashboard never flash before we know who is
   *  signed in. Always `false` when the backend flag is off. */
  sessionLoading: boolean;
  /** A Supabase PASSWORD_RECOVERY session is active (app was opened from the
   *  emailed reset link). The navigator routes straight to ResetPassword. */
  passwordRecoveryActive: boolean;
  clearPasswordRecovery: () => void;
  loginAsCustomer: (
    identifier: string,
    password: string
  ) => Promise<LoginResult>;
  loginAsAdmin: (identifier: string, password: string) => Promise<LoginResult>;
  logout: () => void;

  // Registration
  submitWorkerRegistration: (data: WorkerRegistrationData) => RegistrationRecord;
  submitContractorRegistration: (
    data: ContractorRegistrationData
  ) => RegistrationRecord;
  getRegistration: (id: string) => RegistrationRecord | undefined;

  // Admin actions
  /** Approve a still-`pending` registration. `message` is an optional
   *  free-text note from the admin — stored on the record and used as the
   *  body of the new user's "registration approved" notification. Appends a
   *  RegistrationStatusEvent (pending → approved) to statusHistory. */
  approveRegistration: (
    registrationId: string,
    adminId: string,
    message?: string
  ) => void;
  rejectRegistration: (
    registrationId: string,
    adminId: string,
    reason: string
  ) => void;
  /** Undo a rejection — moves a `rejected` registration back to `pending` so
   *  it re-enters the pending queue for a fresh review. Never auto-approves.
   *  The rejection is NOT erased: the previous rejectionReason and every
   *  prior statusHistory entry are kept, and a new (rejected → pending)
   *  event is appended. */
  revertRegistrationRejection: (registrationId: string, adminId: string) => void;
  blockUser: (userId: string, adminId: string, reason?: string) => void;
  unblockUser: (userId: string, adminId: string) => void;

  // Jobs
  postJob: (
    job: Omit<JobPost, 'id' | 'postedAt' | 'status' | 'acceptingApplications'> & {
      acceptingApplications?: boolean;
    }
  ) => JobPost;
  setJobAcceptingApplications: (jobId: string, accepting: boolean) => void;
  /** Edits an existing job in place — same id, same contractorId, same
   *  postedAt (none of those three are patchable, by type). A plain merge —
   *  does NOT stamp updatedAt itself; pass it explicitly in `patch` when
   *  the call represents a real content edit (see PostJobScreen). A
   *  technical/operational change (e.g. setJobAcceptingApplications) should
   *  never bump it. Applications/Invitations/Assignments are keyed by
   *  jobId, not embedded in the job object, so they're untouched. */
  updateJob: (
    jobId: string,
    patch: Partial<Omit<JobPost, 'id' | 'contractorId' | 'postedAt'>>
  ) => void;
  /** HARD delete — permanently removes the job from state. Allowed ONLY when
   *  the job never generated any activity: no applications, no invitations and
   *  no assignments (of any status) reference it. Guarded here too, so a call
   *  for a job that has any activity is a silent no-op — the UI must offer
   *  "close registration" instead. Never touches applications / invitations /
   *  assignments (a clean job has none by definition). */
  deleteJob: (jobId: string) => void;
  /** True when `deleteJob` would actually delete this job (i.e. it has zero
   *  applications / invitations / assignments). The UI uses this to decide
   *  between "מחק משרה" and "סגור משרה להרשמה". */
  canDeleteJob: (jobId: string) => boolean;

  // Applications (worker -> job)
  applyToJob: (jobId: string, workerId: string, message?: string) => Application;
  /** Accept / reject a pending application. Accepting is refused (returns
   *  `{ ok: false, reason: 'full' }`, no state change) when the job's active
   *  assignments already equal workersNeeded — this is the one guard against
   *  overbooking, so no screen re-implements it. Rejecting always succeeds. */
  respondToApplication: (
    applicationId: string,
    accepted: boolean,
    response?: string
  ) => StaffingActionResult;
  /** Worker pulls back their own still-`pending` application. Never deletes
   *  the record — flips status to 'withdrawn' and stamps `withdrawnAt`, so
   *  the history stays intact and a fresh application can be filed later if
   *  the job is still open. A no-op on any non-pending application. */
  withdrawApplication: (applicationId: string) => void;

  // Invitations (contractor -> worker)
  /** Send an invitation. Returns `null` (nothing created) when the job is
   *  already fully staffed — the caller should surface
   *  "כל המקומות במשרה כבר אוישו." */
  sendInvitation: (
    jobId: string,
    contractorId: string,
    workerId: string,
    message?: string
  ) => Invitation | null;
  /** Accept / decline an invitation, with an optional free-text note from
   *  the worker (stored on invitation.responseMessage, shown to the
   *  contractor and included in their notification). Accepting is refused
   *  (returns `{ ok: false, reason: 'full' }`, no state change) when the job
   *  is already fully staffed. Declining always succeeds. */
  respondToInvitation: (
    invitationId: string,
    accepted: boolean,
    message?: string
  ) => StaffingActionResult;
  /** Contractor withdraws their own still-`pending` invitation. Never
   *  deletes the record — flips status to 'cancelled' and stamps
   *  `cancelledAt`. A no-op on any non-pending invitation (an accepted
   *  invitation already produced an Assignment and must go through the
   *  staffing-cancellation flow instead, never this one). */
  cancelInvitation: (invitationId: string) => void;

  // Assignments (real staffing)
  /** Cancel an ACTIVE assignment — a staffed worker leaving the job, from
   *  either side. Flips the Assignment (not the Application/Invitation that
   *  produced it) to 'cancelled', stamps cancelledAt / cancelledBy /
   *  cancellationMessage, notifies the other party, and lets the capacity
   *  reconciler reopen registration if it had auto-closed. No-op on a
   *  completed or already-cancelled assignment. */
  cancelAssignment: (
    assignmentId: string,
    cancelledBy: 'worker' | 'contractor',
    message?: string
  ) => void;
  /** Mark an ACTIVE assignment as the worker having FINISHED their part
   *  normally. Flips the Assignment to 'completed', stamps completedAt /
   *  updatedAt, and notifies the worker. This is NOT a cancellation: the slot
   *  stays occupied (no capacity change, no reopening of registration), and
   *  nothing on the job itself changes — job.status, acceptingApplications,
   *  workersNeeded and the job lifecycle are all untouched. No-op on a
   *  completed or already-cancelled assignment. */
  completeAssignment: (assignmentId: string) => void;

  // Favorite workers — personal to each contractor, never a global Worker
  // property. See ContractorFavoriteWorker in types/index.ts.
  toggleFavoriteWorker: (contractorId: string, workerId: string) => void;
  isFavoriteWorker: (contractorId: string, workerId: string) => boolean;
  getFavoriteWorkerIds: (contractorId: string) => string[];

  // Favorite contractors — the mirror relationship, personal to each
  // worker. See WorkerFavoriteContractor in types/index.ts.
  toggleFavoriteContractor: (workerId: string, contractorId: string) => void;
  isFavoriteContractor: (workerId: string, contractorId: string) => boolean;
  getFavoriteContractorIds: (workerId: string) => string[];

  // Worker profile edits
  setWorkerAvailability: (workerId: string, isAvailable: boolean) => void;
  updateWorkerProfile: (workerId: string, patch: Partial<Worker>) => void;
  updateContractorProfile: (
    contractorId: string,
    patch: Partial<Contractor>
  ) => void;
  /** Admin edits the contractor's registration number from the user card.
   *  Persists it on the same Contractor object and notifies the contractor —
   *  but ONLY when the value really changes (identical value, empty value, or
   *  an unknown contractor -> nothing happens, no notification). This is the
   *  manual-edit path only; changing the number as part of approving a
   *  ContractorLicenseUpdateRequest keeps its own single "licence updated"
   *  notification and does not go through here. */
  updateContractorRegistrationNumber: (
    contractorId: string,
    registrationNumber: string,
    adminId: string
  ) => void;

  // Messaging — one conversation per pair of users, WhatsApp-style (no job
  // scoping: the same two people always share a single thread).
  getOrCreateConversation: (
    currentUserId: string,
    otherUserId: string
  ) => Conversation;
  sendMessage: (conversationId: string, senderId: string, text: string) => Message;

  // Support
  openSupportTicket: (
    userId: string,
    userRole: 'worker' | 'contractor',
    type: SupportTicketType,
    subject: string,
    description: string
  ) => SupportTicket;
  /** Append one reply to a ticket's conversation — from the admin OR from
   *  the requester. Never overwrites an earlier reply; the previous messages
   *  stay in `messages`. Bumps `updatedAt` and mirrors the latest admin reply
   *  onto the legacy `adminResponse` field.
   *
   *  `statusChange` (admin only): when passed AND different from the current
   *  status, the SAME action also moves the ticket to that status (stamping
   *  `resolvedAt` for 'resolved'), records it on the appended message
   *  (`message.statusChange`), and sends a "status changed" notification
   *  instead of a plain "new reply" one. A status change is never silent —
   *  it always carries a reply, so there is no standalone setTicketStatus. */
  replyToTicket: (
    ticketId: string,
    senderId: string,
    senderRole: SupportMessageSenderRole,
    message: string,
    statusChange?: SupportTicketStatus
  ) => void;
  /** Close a ticket's conversation. Independent of `status` (a "טופל" ticket
   *  stays "טופל"): it only sets `isClosed`/`closedAt`/`closedBy`, bumps
   *  `updatedAt`, and notifies the requester. No message is ever removed or
   *  edited. A no-op if the ticket is missing or already closed. Admin-only
   *  by convention — enforced at the call site. */
  closeSupportTicket: (ticketId: string, adminId: string) => void;
  /** Reopen a closed ticket so the conversation can continue. Clears
   *  `isClosed`/`closedAt`/`closedBy`, bumps `updatedAt`, notifies the
   *  requester. `status` is left exactly as it was. A no-op if the ticket is
   *  missing or not currently closed. */
  reopenSupportTicket: (ticketId: string, adminId: string) => void;

  // Contractor licence verification
  /** Contractor asks to change a verified licence detail (document and/or
   *  classification text and/or — future — registration number). Creates a
   *  `pending` ContractorLicenseUpdateRequest; the contractor's CURRENT
   *  approved licence stays untouched until an admin approves. Notifies
   *  admins. */
  submitContractorLicenseUpdate: (
    contractorId: string,
    patch: {
      newLicenseDocument?: UploadedDocument;
      newLicenseDetails?: string;
      newRegistrationNumber?: string;
      proposedValidFrom?: string;
      proposedValidUntil?: string;
    }
  ) => ContractorLicenseUpdateRequest | null;
  /** Admin approves / rejects a pending licence-update request. Approve →
   *  the proposed values become the contractor's current verified licence
   *  (re-stamps verifiedAt / nextReviewAt); reject → the request is marked
   *  rejected (reason required) and the current licence is left as-is. The
   *  request record is kept either way (audit history). Notifies the
   *  contractor. */
  reviewContractorLicenseUpdate: (
    requestId: string,
    adminId: string,
    approve: boolean,
    reason?: string
  ) => void;
  /** Admin verifies the contractor's CURRENT licence (initial or periodic
   *  review) without any pending replacement — sets status 'verified' and
   *  moves the review clock forward. */
  verifyContractorLicense: (contractorId: string, adminId: string) => void;
  getPendingLicenseRequestForContractor: (
    contractorId: string
  ) => ContractorLicenseUpdateRequest | undefined;
  /** Admin asks a contractor whose licence is expiring / expired to upload a
   *  renewed one. Changes NOTHING on the licence itself (no date, no
   *  document, no verification / review stamp) — it only sends the
   *  contractor an in-app notification. Deduped per (contractor,
   *  licenseValidUntil) so repeated taps never re-notify; a no-op unless the
   *  derived status is 'expiring_soon' or 'expired'. */
  requestContractorLicenseRenewal: (
    contractorId: string,
    adminId: string
  ) => void;
  /** True once a renewal request has been sent to this contractor for the
   *  given licenseValidUntil (used to swap the admin CTA for an info line). */
  hasRenewalRequestBeenSent: (
    contractorId: string,
    licenseValidUntil?: string
  ) => boolean;

  // Notifications
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: (userId: string) => void;

  // Derived selectors (cheap enough to recompute — no memoisation needed)
  getUserById: (userId: string) => Customer | Admin | undefined;
  getJobById: (jobId: string) => JobPost | undefined;
  getApplicationsForJob: (jobId: string) => Application[];
  getApplicationsForWorker: (workerId: string) => Application[];
  getInvitationsForContractor: (contractorId: string) => Invitation[];
  getInvitationsForWorker: (workerId: string) => Invitation[];
  getJobsForContractor: (contractorId: string) => JobPost[];
  getAssignmentsForJob: (jobId: string) => Assignment[];
  getAssignmentsForWorker: (workerId: string) => Assignment[];
  getStaffingProgress: (jobId: string) => StaffingProgress;
  /** Canonical "does this job still have room for another worker?" — active
   *  assignment count vs workersNeeded. Use before any invite/accept action. */
  isJobFullyStaffed: (jobId: string) => boolean;
  getNotificationsForUser: (userId: string) => AppNotification[];
  getTicketsForUser: (userId: string) => SupportTicket[];
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AppContext = createContext<AppState | null>(null);

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) =>
  `${prefix}${Math.random().toString(36).slice(2, 8)}`;

/** Read-time migration for support tickets: guarantees `messages` is always
 *  an array and folds a legacy single `adminResponse` into the conversation
 *  history (as one admin message) when the record predates the thread model.
 *  Never drops data — an explicit `messages` array is kept as-is. */
const normalizeSupportTicket = (t: SupportTicket): SupportTicket => {
  if (Array.isArray(t.messages)) return t;
  const messages: SupportTicketMessage[] = [];
  if (t.adminResponse && t.adminResponse.trim()) {
    messages.push({
      id: newId('stm'),
      ticketId: t.id,
      senderId: t.assignedAdminId ?? 'adm1',
      senderRole: 'admin',
      message: t.adminResponse.trim(),
      createdAt: t.resolvedAt ?? t.updatedAt ?? t.createdAt,
    });
  }
  return { ...t, messages };
};

/** Password check for the prototype. We don't store hashes — any non-empty
 *  password matches an approved customer. Empty string => fail. */
const passwordOk = (pwd: string) => pwd.trim().length > 0;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<SessionUser>(null);
  // Backend-only: while a persisted Supabase session is being restored + its
  // profile rebuilt on cold start. Starts true iff the backend flag is on.
  const [sessionLoading, setSessionLoading] = useState<boolean>(isBackendEnabled());
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(false);
  const [jobSearchState, setJobSearchState] = useState<JobSearchState>(
    DEFAULT_JOB_SEARCH_STATE
  );

  const clearPasswordRecovery = useCallback(
    () => setPasswordRecoveryActive(false),
    []
  );

  // ---------------------------------------------------------------------
  // Backend session bootstrap + auth-event wiring (no-op when USE_BACKEND=false)
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!isBackendEnabled()) return;
    let alive = true;

    // Building the client throws if the public Supabase config is missing —
    // don't let that crash the provider; just fall through to logged-out.
    let unsubscribe: (() => void) | undefined;
    try {
      authService.initializeAuth();
      unsubscribe = authService.onAuthStateChange((event) => {
        if (!alive) return;
        if (event === 'SIGNED_OUT') setCurrentUser(null);
        else if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryActive(true);
      });
    } catch {
      setSessionLoading(false);
      return;
    }

    bootstrapSessionUser()
      .then((user) => {
        if (alive) setCurrentUser(user);
      })
      .catch(() => {
        // No silent mock fallback — just land logged-out; the user can retry.
        if (alive) setCurrentUser(null);
      })
      .finally(() => {
        if (alive) setSessionLoading(false);
      });

    return () => {
      alive = false;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateJobSearchState = useCallback<AppState['updateJobSearchState']>(
    (patch) => setJobSearchState((prev) => ({ ...prev, ...patch })),
    []
  );

  const [admins] = useState<Admin[]>(MOCK_ADMINS);
  const [workers, setWorkers] = useState<Worker[]>(MOCK_WORKERS);
  const [contractors, setContractors] = useState<Contractor[]>(MOCK_CONTRACTORS);
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>(
    MOCK_REGISTRATIONS
  );

  const [jobs, setJobs] = useState<JobPost[]>(MOCK_JOBS);
  const [applications, setApplications] = useState<Application[]>(MOCK_APPLICATIONS);
  const [invitations, setInvitations] = useState<Invitation[]>(MOCK_INVITATIONS);

  // Seed assignments once from whatever applications/invitations already came
  // in as 'accepted' in the mock data, so staffing counts are consistent with
  // the rest of the prototype from first render — never a separate hardcoded
  // number.
  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    const seeded: Assignment[] = [];
    MOCK_APPLICATIONS.filter((a) => a.status === 'accepted').forEach((a) => {
      const job = MOCK_JOBS.find((j) => j.id === a.jobId);
      if (job) seeded.push(buildAssignmentFromApplication(a, job));
    });
    MOCK_INVITATIONS.filter((i) => i.status === 'accepted').forEach((i) => {
      const job = MOCK_JOBS.find((j) => j.id === i.jobId);
      if (job && !hasActiveAssignment(seeded, job.id, i.workerId)) {
        seeded.push(buildAssignmentFromInvitation(i, job));
      }
    });
    return seeded;
  });

  // ---------------------------------------------------------------------
  // Capacity <-> registration reconciliation
  // ---------------------------------------------------------------------
  // Staffing capacity is the source of truth for whether a job accepts new
  // registrations. Any time the assignment collection changes we re-check
  // every job:
  //   • reached workersNeeded  -> auto-close (registrationClosureReason
  //     'capacity'), unless the contractor had already closed it manually.
  //   • dropped below workersNeeded AND it had been auto-closed -> reopen.
  //   • closed manually -> never touched here.
  // This is the ONE place that keeps job.acceptingApplications honest, so
  // every screen can keep trusting isOpenForApplications(job) alone.
  useEffect(() => {
    setJobs((prevJobs) => {
      let changed = false;
      const next = prevJobs.map((j) => {
        const full = computeIsJobFullyStaffed(assignments, j.id, j.workersNeeded);
        if (full && j.acceptingApplications) {
          changed = true;
          return {
            ...j,
            acceptingApplications: false,
            registrationClosureReason: 'capacity' as const,
          };
        }
        if (
          !full &&
          !j.acceptingApplications &&
          j.registrationClosureReason === 'capacity'
        ) {
          changed = true;
          return {
            ...j,
            acceptingApplications: true,
            registrationClosureReason: undefined,
          };
        }
        return j;
      });
      return changed ? next : prevJobs;
    });
  }, [assignments]);

  // Normalize once at load — MOCK_CONVERSATIONS ships as legacy-shaped
  // records (single participantId, no participantIds array); this is the
  // one place that converts them to the real Conversation shape, exactly
  // like a real migration would when reading old records from a database.
  // dedupeConversations is a safety net that merges any records that ended
  // up sharing the same pair of participants, so a pair never shows up as
  // more than one thread in MessagesScreen.
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    dedupeConversations(MOCK_CONVERSATIONS.map(normalizeConversation))
  );
  const [notifications, setNotifications] =
    useState<AppNotification[]>(MOCK_NOTIFICATIONS);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() =>
    MOCK_SUPPORT_TICKETS.map(normalizeSupportTicket)
  );

  // Contractor licence-update requests — frontend-only, no mock seed. Shaped
  // 1:1 with a future `contractor_license_update_requests` table. Never
  // deleted: approved / rejected requests stay as audit history.
  const [contractorLicenseRequests, setContractorLicenseRequests] = useState<
    ContractorLicenseUpdateRequest[]
  >([]);

  // Frontend-only for now — no mock seed data, contractors build this list
  // themselves at runtime. Shaped 1:1 with the future
  // contractor_favorite_workers Supabase table (see types/index.ts).
  const [favoriteWorkers, setFavoriteWorkers] = useState<ContractorFavoriteWorker[]>([]);
  const [favoriteContractors, setFavoriteContractors] = useState<
    WorkerFavoriteContractor[]
  >([]);

  // ---------------------------------------------------------------------
  // Notification helpers
  // ---------------------------------------------------------------------

  const pushNotification = useCallback(
    (n: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'>) => {
      const fresh: AppNotification = {
        id: newId('n'),
        createdAt: nowIso(),
        isRead: false,
        ...n,
      };
      setNotifications((prev) =>
        fresh.dedupeKey && prev.some((p) => p.dedupeKey === fresh.dedupeKey)
          ? prev
          : [fresh, ...prev]
      );
    },
    []
  );

  // ---------------------------------------------------------------------
  // Contractor-licence attention check (frontend, on admin session only)
  // ---------------------------------------------------------------------
  // There is no backend scheduler. Instead, whenever an admin is logged in
  // (and whenever the contractor pool changes under them), we scan every
  // contractor's licence against TODAY and raise an in-app notification for
  // "review due" / "expiring soon" / "expired". Each notification carries a
  // stable dedupeKey (contractorId + kind + the relevant date), so the same
  // state never notifies twice — no setInterval, no fake cron, no email.
  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    const adminId = currentUser.id;
    contractors.forEach((c) => {
      const st = getContractorLicenseStatus(c);
      if (st.state === 'expired') {
        pushNotification({
          userId: adminId,
          type: 'license_attention',
          title: 'רישיון פג תוקף',
          body: `רישיון הקבלן ${c.fullName} (${c.companyName}) פג תוקף.`,
          relatedId: c.id,
          dedupeKey: `lic:${c.id}:expired:${c.licenseValidUntil ?? ''}`,
        });
      } else if (st.state === 'expiring_soon') {
        const d = Math.max(0, daysUntil(c.licenseValidUntil) ?? 0);
        pushNotification({
          userId: adminId,
          type: 'license_attention',
          title: 'רישיון עומד לפוג',
          body: `רישיון הקבלן ${c.fullName} יפוג בעוד ${d} ימים.`,
          relatedId: c.id,
          dedupeKey: `lic:${c.id}:expiring:${c.licenseValidUntil ?? ''}`,
        });
      } else if (st.state === 'review_due') {
        pushNotification({
          userId: adminId,
          type: 'license_attention',
          title: 'נדרשת בדיקה תקופתית',
          body: `הגיע מועד הבדיקה התקופתית של רישיון הקבלן ${c.fullName}.`,
          relatedId: c.id,
          dedupeKey: `lic:${c.id}:review:${c.licenseNextReviewAt ?? ''}`,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, contractors]);

  // ---------------------------------------------------------------------
  // Capacity -> pending invitations reconciliation
  // ---------------------------------------------------------------------
  // A job that has reached workersNeeded takes no more workers, so leaving
  // invitations "pending" against it is dishonest. Whenever staffing changes
  // we auto-cancel every still-pending invitation for any now-full job
  // (reason 'capacity_full') and notify each worker that the seat is gone —
  // NOT phrased as if the contractor cancelled them personally. Guarded by
  // `status === 'pending'` so it only fires once per invitation.
  useEffect(() => {
    const toClose = invitations.filter((inv) => {
      if (inv.status !== 'pending') return false;
      const job = jobs.find((j) => j.id === inv.jobId);
      return (
        !!job &&
        computeIsJobFullyStaffed(assignments, inv.jobId, job.workersNeeded)
      );
    });
    if (toClose.length === 0) return;

    const ts = nowIso();
    const ids = new Set(toClose.map((i) => i.id));
    setInvitations((prev) =>
      prev.map((i) =>
        ids.has(i.id) && i.status === 'pending'
          ? {
              ...i,
              status: 'cancelled',
              cancelledAt: ts,
              cancellationReason: 'capacity_full' as const,
            }
          : i
      )
    );
    toClose.forEach((inv) => {
      const job = jobs.find((j) => j.id === inv.jobId);
      pushNotification({
        userId: inv.workerId,
        type: 'invitation_cancelled',
        title: 'ההזמנה למשרה נסגרה',
        body: `המשרה "${
          job?.title ?? ''
        }" אוישה במלואה ולכן ההזמנה אינה פעילה עוד.`,
        relatedId: inv.id,
      });
    });
  }, [assignments, invitations, jobs, pushNotification]);

  // ---------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------

  const loginAsCustomer = useCallback<AppState['loginAsCustomer']>(
    async (identifier, password) => {
      if (isBackendEnabled()) {
        const result = await loginById(identifier, password, [
          'worker',
          'contractor',
        ]);
        // approved -> live session; blocked -> live (confined) session too,
        // exactly like the mock path below.
        if ((result.ok || result.reason === 'blocked') && result.user) {
          setCurrentUser(result.user);
        }
        return result;
      }

      // Mock path (USE_BACKEND=false) — unchanged behaviour. The short delay
      // preserves the "מתחבר..." moment the LoginScreen used to add itself.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const id = identifier.trim();
      if (!id) return { ok: false, reason: 'not_found' };
      if (!passwordOk(password)) return { ok: false, reason: 'wrong_password' };

      // 1) Try to match an approved worker by ID number.
      const worker = workers.find((w) => w.idNumber === id);
      if (worker) {
        if (worker.status === 'blocked') {
          // A blocked user DOES get a live session — but the navigator's
          // blocked guard keeps them out of every normal shell and only lets
          // them reach the BlockedAccount screen + the shared support-ticket
          // flow (open a ticket, follow the admin's replies). `ok: false` +
          // `reason: 'blocked'` still tells LoginScreen this is not a normal
          // sign-in.
          setCurrentUser(worker);
          return { ok: false, user: worker, status: 'blocked', reason: 'blocked' };
        }
        setCurrentUser(worker);
        return { ok: true, user: worker, status: 'approved' };
      }

      // 2) Try to match an approved contractor by ID number. A contractor
      // registration number is a professional/verification detail, not a
      // login credential, so it must never match here.
      const contractor = contractors.find((c) => c.idNumber === id);
      if (contractor) {
        if (contractor.status === 'blocked') {
          // See the worker branch above — a blocked contractor gets a live
          // session that the navigator's blocked guard confines to the
          // BlockedAccount screen and the shared support-ticket flow.
          setCurrentUser(contractor);
          return {
            ok: false,
            user: contractor,
            status: 'blocked',
            reason: 'blocked',
          };
        }
        setCurrentUser(contractor);
        return { ok: true, user: contractor, status: 'approved' };
      }

      // 3) Fall through to registration records (pending / rejected).
      const reg = registrations.find((r) => {
        if (r.role === 'worker') {
          const d = r.data as WorkerRegistrationData;
          return d.idNumber === id;
        }
        const d = r.data as ContractorRegistrationData;
        return d.idNumber === id;
      });

      if (reg) {
        return {
          ok: false,
          status: reg.status,
          registration: reg,
          reason:
            reg.status === 'pending'
              ? 'pending'
              : reg.status === 'rejected'
              ? 'rejected'
              : 'blocked',
        };
      }

      return { ok: false, reason: 'not_found' };
    },
    [workers, contractors, registrations]
  );

  const loginAsAdmin = useCallback<AppState['loginAsAdmin']>(
    async (identifier, password) => {
      if (isBackendEnabled()) {
        const result = await loginById(identifier, password, ['admin']);
        if (result.ok && result.user) setCurrentUser(result.user);
        return result;
      }

      // Mock path (USE_BACKEND=false) — unchanged behaviour.
      await new Promise((resolve) => setTimeout(resolve, 500));

      const id = identifier.trim();
      if (!id || !passwordOk(password)) {
        return { ok: false, reason: 'wrong_password' };
      }
      const admin =
        admins.find((a) => a.idNumber === id) ??
        admins.find((a) => a.email === id);
      if (!admin) return { ok: false, reason: 'not_found' };
      setCurrentUser(admin);
      return { ok: true, user: admin, status: 'approved' };
    },
    [admins]
  );

  // Logging out also clears the job-search state — otherwise a different
  // worker logging in on the same device/session would inherit whatever
  // search/filter/sort the previous one left behind.
  const logout = useCallback(() => {
    if (isBackendEnabled()) {
      // Fire-and-forget: clears the persisted Supabase session + fires
      // SIGNED_OUT (which also nulls currentUser). We still clear locally now
      // so the UI reacts immediately.
      void authService.signOut().catch(() => {});
    }
    setCurrentUser(null);
    setJobSearchState(DEFAULT_JOB_SEARCH_STATE);
    setPasswordRecoveryActive(false);
  }, []);

  // ---------------------------------------------------------------------
  // Registration submission
  // ---------------------------------------------------------------------

  const submitWorkerRegistration = useCallback<
    AppState['submitWorkerRegistration']
  >((data) => {
    const rec: RegistrationRecord = {
      id: newId('reg'),
      role: 'worker',
      status: 'pending',
      submittedAt: nowIso(),
      externalChecks: { idValid: undefined },
      data,
    };
    setRegistrations((prev) => [rec, ...prev]);

    // notify all admins
    admins.forEach((a) =>
      pushNotification({
        userId: a.id,
        type: 'new_pending_registration',
        title: 'בקשת רישום חדשה',
        body: `${data.fullName} הגיש בקשה לרישום כעובד`,
        relatedId: rec.id,
      })
    );
    return rec;
  }, [admins, pushNotification]);

  const submitContractorRegistration = useCallback<
    AppState['submitContractorRegistration']
  >((data) => {
    const rec: RegistrationRecord = {
      id: newId('reg'),
      role: 'contractor',
      status: 'pending',
      submittedAt: nowIso(),
      externalChecks: {
        idValid: undefined,
        contractorRegistrationValid: undefined,
      },
      data,
    };
    setRegistrations((prev) => [rec, ...prev]);

    admins.forEach((a) =>
      pushNotification({
        userId: a.id,
        type: 'new_pending_registration',
        title: 'בקשת רישום חדשה',
        body: `${data.fullName} הגיש בקשה לרישום כקבלן`,
        relatedId: rec.id,
      })
    );
    return rec;
  }, [admins, pushNotification]);

  const getRegistration = useCallback<AppState['getRegistration']>(
    (id) => registrations.find((r) => r.id === id),
    [registrations]
  );

  // ---------------------------------------------------------------------
  // Admin actions
  // ---------------------------------------------------------------------

  const approveRegistration = useCallback<AppState['approveRegistration']>(
    (registrationId, adminId, message) => {
      const reg = registrations.find((r) => r.id === registrationId);
      if (!reg || reg.status !== 'pending') return;

      const ts = nowIso();
      const note = message?.trim() || undefined;
      // The id of the user we're about to materialise — decided up front so
      // the registration record can carry a reliable link to it.
      const newUserId = newId(reg.role === 'worker' ? 'w' : 'c');
      const event: RegistrationStatusEvent = {
        id: newId('rse'),
        registrationId,
        fromStatus: reg.status,
        toStatus: 'approved',
        message: note,
        createdAt: ts,
        actorId: adminId,
      };

      // 1) flip registration to approved (append audit event, never overwrite)
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === registrationId
            ? {
                ...r,
                status: 'approved',
                processedAt: ts,
                processedBy: adminId,
                approvedAt: ts,
                approvalMessage: note,
                createdUserId: newUserId,
                statusHistory: [...(r.statusHistory ?? []), event],
              }
            : r
        )
      );

      // 2) materialise the customer object in the correct pool
      if (reg.role === 'worker') {
        const d = reg.data as WorkerRegistrationData;
        const worker: Worker = {
          id: newUserId,
          idNumber: d.idNumber,
          fullName: d.fullName,
          phone: d.phone,
          email: d.email,
          role: 'worker',
          status: 'approved',
          createdAt: nowIso(),
          city: d.city,
          profession: workerProfessions(d)[0] ?? d.profession,
          professions: workerProfessions(d),
          professionCategory: d.professionCategory,
          skills: d.skills,
          certifications: normalizeCertifications(d.certifications),
          experienceYears: d.experienceYears,
          preferredAreas: d.preferredAreas,
          isAvailable: d.isAvailable,
          hourlyRate: d.hourlyRate,
          dailyRate: d.dailyRate,
          bio: d.bio ?? '',
          completedJobsCount: 0,
        };
        setWorkers((prev) => [...prev, worker]);
        pushNotification({
          userId: worker.id,
          type: 'registration_approved',
          title: 'ההרשמה שלך אושרה 🎉',
          body:
            note ??
            'שמחים לצרף אותך ל-BuildUp. החשבון שלך אושר וניתן להתחיל להשתמש במערכת.',
          relatedId: worker.id,
        });
      } else {
        const d = reg.data as ContractorRegistrationData;
        // Approving a contractor registration IS the first manual licence
        // verification: before pressing "אשר רישום" the admin has already
        // reviewed the licence document, registration number, classification
        // and "בתוקף עד" date on RegistrationDetails. So the live licence
        // starts 'verified' — no separate second step. licenseValidUntil and
        // the document are copied EXACTLY from what was submitted (never
        // derived); the annual review clock starts now.
        const nextReview1y = new Date();
        nextReview1y.setFullYear(nextReview1y.getFullYear() + 1);
        const contractor: Contractor = {
          id: newUserId,
          idNumber: d.idNumber,
          fullName: d.fullName,
          phone: d.phone,
          email: d.email,
          role: 'contractor',
          status: 'approved',
          createdAt: nowIso(),
          companyName: d.companyName,
          contractorRegistrationNumber: d.contractorRegistrationNumber,
          city: d.city,
          areasOfOperation: contractorAreas(d),
          areaOfOperation: contractorAreas(d)[0],
          projectTypes: d.projectTypes,
          licenseDetails: d.licenseDetails,
          bio: d.bio,
          contractorLicenseDocument: d.licenseDocument,
          licenseValidUntil: d.licenseValidUntil,
          licenseVerificationStatus: 'verified',
          licenseLastVerifiedAt: ts,
          licenseNextReviewAt: nextReview1y.toISOString(),
        };
        setContractors((prev) => [...prev, contractor]);
        pushNotification({
          userId: contractor.id,
          type: 'registration_approved',
          title: 'ההרשמה שלך אושרה 🎉',
          body:
            note ??
            'שמחים לצרף אותך ל-BuildUp. החשבון שלך אושר וניתן לפרסם משרות חדשות.',
          relatedId: contractor.id,
        });
      }
    },
    [registrations, pushNotification]
  );

  const rejectRegistration = useCallback<AppState['rejectRegistration']>(
    (registrationId, adminId, reason) => {
      const ts = nowIso();
      // The registration record is NEVER deleted — it stays in the pool with
      // status 'rejected', full data intact, plus an appended audit event.
      setRegistrations((prev) =>
        prev.map((r) => {
          if (r.id !== registrationId) return r;
          const event: RegistrationStatusEvent = {
            id: newId('rse'),
            registrationId,
            fromStatus: r.status,
            toStatus: 'rejected',
            reason,
            createdAt: ts,
            actorId: adminId,
          };
          return {
            ...r,
            status: 'rejected',
            processedAt: ts,
            processedBy: adminId,
            rejectedAt: ts,
            rejectionReason: reason,
            statusHistory: [...(r.statusHistory ?? []), event],
          };
        })
      );
      // No in-app AppNotification here: a pending registration has no real
      // Worker/Contractor account (no real userId) yet, so a notification
      // would be fake. The data a future backend needs to send the real
      // rejection email is fully persisted on the record: data.email,
      // status 'rejected', rejectionReason, rejectedAt and the appended
      // statusHistory event. The applicant also sees the reason on
      // RegistrationRejectedScreen.
    },
    []
  );

  const revertRegistrationRejection = useCallback<
    AppState['revertRegistrationRejection']
  >(
    (registrationId, adminId) => {
      const ts = nowIso();
      setRegistrations((prev) =>
        prev.map((r) => {
          if (r.id !== registrationId || r.status !== 'rejected') return r;
          const prior = r.statusHistory ?? [];
          // If this record was rejected before the audit trail existed (old
          // mock data), backfill the rejection as a history entry now so the
          // "why it was rejected" is not lost when we move it back to pending.
          const backfill: RegistrationStatusEvent[] =
            prior.length === 0 && (r.rejectionReason || r.rejectedAt)
              ? [
                  {
                    id: newId('rse'),
                    registrationId,
                    fromStatus: 'pending' as CustomerStatus,
                    toStatus: 'rejected' as CustomerStatus,
                    reason: r.rejectionReason,
                    createdAt: r.rejectedAt ?? r.processedAt ?? r.submittedAt,
                    actorId: r.processedBy,
                  },
                ]
              : [];
          const event: RegistrationStatusEvent = {
            id: newId('rse'),
            registrationId,
            fromStatus: r.status,
            toStatus: 'pending',
            createdAt: ts,
            actorId: adminId,
          };
          // Back to a clean 'pending' state for a fresh review: the current
          // rejectionReason / rejectedAt / processedAt / processedBy are all
          // cleared. The rejection itself is NOT lost — it stays in
          // statusHistory (reason + timestamp) via `prior`/`backfill`.
          return {
            ...r,
            status: 'pending',
            processedAt: undefined,
            processedBy: undefined,
            rejectedAt: undefined,
            rejectionReason: undefined,
            statusHistory: [...prior, ...backfill, event],
          };
        })
      );
    },
    []
  );

  const setCustomerStatus = useCallback(
    (userId: string, status: CustomerStatus) => {
      setWorkers((prev) =>
        prev.map((w) => (w.id === userId ? { ...w, status } : w))
      );
      setContractors((prev) =>
        prev.map((c) => (c.id === userId ? { ...c, status } : c))
      );
    },
    []
  );

  const blockUser = useCallback<AppState['blockUser']>(
    (userId, _adminId, reason) => {
      const blockedAt = nowIso();
      setWorkers((prev) =>
        prev.map((w) =>
          w.id === userId
            ? { ...w, status: 'blocked', blockedReason: reason, blockedAt }
            : w
        )
      );
      setContractors((prev) =>
        prev.map((c) =>
          c.id === userId
            ? { ...c, status: 'blocked', blockedReason: reason, blockedAt }
            : c
        )
      );
      // Keep the live session in sync — if the blocked user IS the current
      // user, the navigator's blocked guard then takes over immediately.
      setCurrentUser((cu) =>
        cu && cu.role !== 'admin' && cu.id === userId
          ? { ...cu, status: 'blocked', blockedReason: reason, blockedAt }
          : cu
      );
      pushNotification({
        userId,
        type: 'account_blocked',
        title: 'החשבון שלך נחסם',
        body: reason ?? 'החשבון שלך נחסם על ידי מנהל המערכת.',
        relatedId: userId,
      });
    },
    [pushNotification]
  );

  const unblockUser = useCallback<AppState['unblockUser']>(
    (userId, _adminId) => {
      setWorkers((prev) =>
        prev.map((w) =>
          w.id === userId
            ? {
                ...w,
                status: 'approved',
                blockedReason: undefined,
                blockedAt: undefined,
              }
            : w
        )
      );
      setContractors((prev) =>
        prev.map((c) =>
          c.id === userId
            ? {
                ...c,
                status: 'approved',
                blockedReason: undefined,
                blockedAt: undefined,
              }
            : c
        )
      );
      setCurrentUser((cu) =>
        cu && cu.role !== 'admin' && cu.id === userId
          ? {
              ...cu,
              status: 'approved',
              blockedReason: undefined,
              blockedAt: undefined,
            }
          : cu
      );
      pushNotification({
        userId,
        type: 'account_unblocked',
        title: 'החשבון שלך שוחרר',
        body: 'החשבון שלך פעיל שוב. ברוך שובך!',
        relatedId: userId,
      });
    },
    [pushNotification]
  );

  // ---------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------

  const postJob = useCallback<AppState['postJob']>((j) => {
    const job: JobPost = {
      ...j,
      id: newId('j'),
      status: 'open',
      postedAt: nowIso(),
      acceptingApplications:
        (j as Partial<JobPost>).acceptingApplications ?? true,
    };
    setJobs((prev) => [job, ...prev]);
    return job;
  }, []);

  // Plain merge — does NOT stamp updatedAt itself. "עודכן לאחרונה" must only
  // reflect a real content edit, never a technical/operational change, so
  // the decision of whether this call counts as one belongs to the caller
  // (PostJobScreen's save passes updatedAt explicitly; a future
  // technical-only caller simply wouldn't).
  const updateJob = useCallback<AppState['updateJob']>((jobId, patch) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));
  }, []);

  // A job is "clean" (hard-deletable) only when nothing points at it. Any
  // application / invitation / assignment — of ANY status, including
  // withdrawn / declined / cancelled — makes it part of someone's history and
  // it must be kept.
  const canDeleteJob = useCallback<AppState['canDeleteJob']>(
    (jobId) =>
      !applications.some((a) => a.jobId === jobId) &&
      !invitations.some((i) => i.jobId === jobId) &&
      !assignments.some((a) => a.jobId === jobId),
    [applications, invitations, assignments]
  );

  const deleteJob = useCallback<AppState['deleteJob']>(
    (jobId) => {
      if (!canDeleteJob(jobId)) return; // has activity — keep it
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    },
    [canDeleteJob]
  );

  // The contractor's manual open/close switch. Closing stamps
  // registrationClosureReason 'manual' so the capacity reconciler will NOT
  // reopen it later. Opening clears the reason; opening a job that is
  // actually full is ignored (the reconciler would just re-close it, and the
  // UI hides the button in that case anyway).
  const setJobAcceptingApplications = useCallback<
    AppState['setJobAcceptingApplications']
  >(
    (jobId, accepting) => {
      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== jobId) return j;
          if (accepting) {
            if (computeIsJobFullyStaffed(assignments, j.id, j.workersNeeded)) {
              return j;
            }
            return {
              ...j,
              acceptingApplications: true,
              registrationClosureReason: undefined,
            };
          }
          return {
            ...j,
            acceptingApplications: false,
            registrationClosureReason: 'manual' as const,
          };
        })
      );
    },
    [assignments]
  );

  // ---------------------------------------------------------------------
  // Applications
  // ---------------------------------------------------------------------

  const applyToJob = useCallback<AppState['applyToJob']>(
    (jobId, workerId, message) => {
      // Duplicate prevention looks only at applications that still "count":
      // a pending one, or an accepted one whose Assignment is still active.
      // An accepted application whose assignment was later cancelled is
      // history — it must not block the worker from applying again.
      const activeDupe = applications.find((a) => {
        if (a.jobId !== jobId || a.workerId !== workerId) return false;
        if (a.status === 'pending') return true;
        if (a.status === 'accepted') {
          return hasActiveAssignment(assignments, jobId, workerId);
        }
        return false;
      });
      if (activeDupe) return activeDupe;

      const app: Application = {
        id: newId('app'),
        jobId,
        workerId,
        message,
        appliedAt: nowIso(),
        status: 'pending',
      };
      setApplications((prev) => [app, ...prev]);

      const job = jobs.find((x) => x.id === jobId);
      const worker = workers.find((w) => w.id === workerId);
      if (job && worker) {
        pushNotification({
          userId: job.contractorId,
          type: 'job_application',
          title: 'בקשה חדשה למשרה',
          body: `${worker.fullName} הגיש מועמדות ל"${job.title}"`,
          relatedId: app.id,
        });
      }
      return app;
    },
    [applications, assignments, jobs, workers, pushNotification]
  );

  const withdrawApplication = useCallback<AppState['withdrawApplication']>(
    (applicationId) => {
      setApplications((prev) =>
        prev.map((a) =>
          a.id === applicationId && a.status === 'pending'
            ? { ...a, status: 'withdrawn', withdrawnAt: nowIso() }
            : a
        )
      );
    },
    []
  );

  const respondToApplication = useCallback<AppState['respondToApplication']>(
    (applicationId, accepted, response) => {
      const existing = applications.find((a) => a.id === applicationId);
      if (!existing) return { ok: false };
      const job = jobs.find((j) => j.id === existing.jobId);

      // Overbooking guard — the one place it lives. Accepting a NEW worker
      // onto a job that is already at workersNeeded is refused outright.
      if (
        accepted &&
        job &&
        !hasActiveAssignment(assignments, job.id, existing.workerId) &&
        computeIsJobFullyStaffed(assignments, job.id, job.workersNeeded)
      ) {
        return { ok: false, reason: 'full' };
      }

      let targetApp: Application | undefined;
      setApplications((prev) =>
        prev.map((a) => {
          if (a.id !== applicationId) return a;
          targetApp = {
            ...a,
            status: accepted ? 'accepted' : 'rejected',
            respondedAt: nowIso(),
            contractorResponse: response,
          };
          return targetApp;
        })
      );
      if (targetApp) {
        if (accepted && job) {
          setAssignments((prev) =>
            hasActiveAssignment(prev, job.id, targetApp!.workerId) ||
            computeIsJobFullyStaffed(prev, job.id, job.workersNeeded)
              ? prev
              : [...prev, buildAssignmentFromApplication(targetApp!, job)]
          );
        }
        const jobTitle = job?.title ?? '';
        const baseBody = accepted
          ? `הבקשה שלך למשרה "${jobTitle}" אושרה.`
          : `התקבלה החלטה לגבי הבקשה שלך למשרה "${jobTitle}".`;
        const note = response?.trim();
        pushNotification({
          userId: targetApp.workerId,
          type: accepted ? 'application_accepted' : 'application_rejected',
          title: accepted ? 'הבקשה שלך אושרה' : 'הבקשה שלך נדחתה',
          body: note ? `${baseBody}\nהודעת הקבלן: "${note}"` : baseBody,
          relatedId: applicationId,
        });
      }
      return { ok: true };
    },
    [applications, jobs, assignments, pushNotification]
  );

  // ---------------------------------------------------------------------
  // Invitations
  // ---------------------------------------------------------------------

  const sendInvitation = useCallback<AppState['sendInvitation']>(
    (jobId, contractorId, workerId, message) => {
      // Duplicate prevention looks only at *active* invitations
      // (pending / accepted) for this worker+job. A historical
      // declined/cancelled/expired record must never block a re-invite.
      const activeDupe = invitations.find(
        (i) =>
          i.jobId === jobId &&
          i.workerId === workerId &&
          (i.status === 'pending' || i.status === 'accepted')
      );
      if (activeDupe) return activeDupe;

      // Overbooking guard — a fully-staffed job takes no new invitations.
      const job0 = jobs.find((j) => j.id === jobId);
      if (
        job0 &&
        computeIsJobFullyStaffed(assignments, jobId, job0.workersNeeded)
      ) {
        return null;
      }

      const inv: Invitation = {
        id: newId('inv'),
        jobId,
        contractorId,
        workerId,
        message,
        sentAt: nowIso(),
        status: 'pending',
      };
      setInvitations((prev) => [inv, ...prev]);

      const job = jobs.find((j) => j.id === jobId);
      const contractor = contractors.find((c) => c.id === contractorId);
      pushNotification({
        userId: workerId,
        type: 'invitation_received',
        title: 'הזמנה חדשה לעבודה',
        body: contractor && job
          ? `${contractor.companyName} הזמין אותך לפרויקט "${job.title}"`
          : 'התקבלה הזמנה חדשה לעבודה',
        relatedId: inv.id,
      });
      return inv;
    },
    [invitations, jobs, assignments, contractors, pushNotification]
  );

  const cancelInvitation = useCallback<AppState['cancelInvitation']>(
    (invitationId) => {
      setInvitations((prev) =>
        prev.map((i) =>
          i.id === invitationId && i.status === 'pending'
            ? {
                ...i,
                status: 'cancelled',
                cancelledAt: nowIso(),
                cancellationReason: 'manual' as const,
              }
            : i
        )
      );
    },
    []
  );

  const respondToInvitation = useCallback<AppState['respondToInvitation']>(
    (invitationId, accepted, message) => {
      const existing = invitations.find((i) => i.id === invitationId);
      if (!existing) return { ok: false };
      const job = jobs.find((j) => j.id === existing.jobId);

      // Overbooking guard — a worker cannot accept an invitation onto a job
      // that filled up while the invitation was outstanding.
      if (
        accepted &&
        job &&
        !hasActiveAssignment(assignments, job.id, existing.workerId) &&
        computeIsJobFullyStaffed(assignments, job.id, job.workersNeeded)
      ) {
        return { ok: false, reason: 'full' };
      }

      const note = message?.trim() || undefined;
      let target: Invitation | undefined;
      setInvitations((prev) =>
        prev.map((i) => {
          if (i.id !== invitationId) return i;
          target = {
            ...i,
            status: accepted ? 'accepted' : 'declined',
            respondedAt: nowIso(),
            responseMessage: note,
          };
          return target;
        })
      );
      if (target) {
        if (accepted && job) {
          setAssignments((prev) =>
            hasActiveAssignment(prev, job.id, target!.workerId) ||
            computeIsJobFullyStaffed(prev, job.id, job.workersNeeded)
              ? prev
              : [...prev, buildAssignmentFromInvitation(target!, job)]
          );
        }
        const worker = workers.find((w) => w.id === target!.workerId);
        const baseBody = worker
          ? `${worker.fullName} ${accepted ? 'אישר' : 'דחה'} את ההזמנה למשרה "${
              job?.title ?? ''
            }"`
          : 'התקבלה תגובה להזמנה';
        pushNotification({
          userId: target.contractorId,
          type: accepted ? 'invitation_accepted' : 'invitation_declined',
          title: accepted ? 'הזמנתך אושרה' : 'הזמנתך נדחתה',
          body: note ? `${baseBody}\nהודעת העובד: "${note}"` : baseBody,
          relatedId: invitationId,
        });
      }
      return { ok: true };
    },
    [invitations, jobs, assignments, workers, pushNotification]
  );

  // ---------------------------------------------------------------------
  // Assignment cancellation (staffed worker leaving the job)
  // ---------------------------------------------------------------------

  const cancelAssignment = useCallback<AppState['cancelAssignment']>(
    (assignmentId, cancelledBy, message) => {
      const existing = assignments.find((a) => a.id === assignmentId);
      if (!existing || existing.status !== 'active') return;

      const note = message?.trim() || undefined;
      const ts = nowIso();

      // Only the Assignment changes. The Application/Invitation that put this
      // worker on the job stays `accepted` — that acceptance really happened.
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === assignmentId && a.status === 'active'
            ? {
                ...a,
                status: 'cancelled',
                cancelledAt: ts,
                cancelledBy,
                cancellationMessage: note,
                updatedAt: ts,
              }
            : a
        )
      );
      // Capacity auto-reopen is handled by the [assignments] reconciler.

      const job = jobs.find((j) => j.id === existing.jobId);
      const jobTitle = job?.title ?? '';

      if (cancelledBy === 'contractor') {
        const base = `השיבוץ שלך למשרה "${jobTitle}" בוטל על ידי הקבלן.`;
        pushNotification({
          userId: existing.workerId,
          type: 'assignment_cancelled',
          title: 'השיבוץ שלך בוטל',
          body: note ? `${base}\nהודעת הקבלן: "${note}"` : base,
          relatedId: existing.jobId,
        });
      } else {
        const worker = workers.find((w) => w.id === existing.workerId);
        const base = `${
          worker?.fullName ?? 'עובד'
        } ויתר/ה על השיבוץ למשרה "${jobTitle}".`;
        pushNotification({
          userId: existing.contractorId,
          type: 'assignment_cancelled',
          title: 'עובד ויתר על השיבוץ',
          body: note ? `${base}\nהודעת העובד: "${note}"` : base,
          relatedId: existing.jobId,
        });
      }
    },
    [assignments, jobs, workers, pushNotification]
  );

  // ---------------------------------------------------------------------
  // Assignment completion (worker finished their part — NOT a cancellation)
  // ---------------------------------------------------------------------
  // Only THIS assignment record changes: status → 'completed', + completedAt.
  // The slot stays occupied (getOccupiedSlotCount counts active + completed),
  // so the [assignments] capacity reconciler sees no drop and never reopens
  // registration. job.status / acceptingApplications / workersNeeded are
  // deliberately not touched here — one worker finishing is not the whole job
  // finishing.
  const completeAssignment = useCallback<AppState['completeAssignment']>(
    (assignmentId) => {
      const existing = assignments.find((a) => a.id === assignmentId);
      if (!existing || existing.status !== 'active') return;

      const ts = nowIso();
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === assignmentId && a.status === 'active'
            ? { ...a, status: 'completed', completedAt: ts, updatedAt: ts }
            : a
        )
      );

      const job = jobs.find((j) => j.id === existing.jobId);
      pushNotification({
        userId: existing.workerId,
        type: 'assignment_completed',
        title: 'העבודה שלך במשרה הסתיימה',
        body: `הקבלן סימן שסיימת את עבודתך במשרה "${
          job?.title ?? ''
        }". השיבוץ נשמר בהיסטוריית העבודות שלך.`,
        relatedId: existing.jobId,
      });
    },
    [assignments, jobs, pushNotification]
  );

  // ---------------------------------------------------------------------
  // Favorite workers
  // ---------------------------------------------------------------------

  const isFavoriteWorker = useCallback<AppState['isFavoriteWorker']>(
    (contractorId, workerId) =>
      favoriteWorkers.some(
        (f) => f.contractorId === contractorId && f.workerId === workerId
      ),
    [favoriteWorkers]
  );

  const getFavoriteWorkerIds = useCallback<AppState['getFavoriteWorkerIds']>(
    (contractorId) =>
      favoriteWorkers
        .filter((f) => f.contractorId === contractorId)
        .map((f) => f.workerId),
    [favoriteWorkers]
  );

  const toggleFavoriteWorker = useCallback<AppState['toggleFavoriteWorker']>(
    (contractorId, workerId) => {
      setFavoriteWorkers((prev) => {
        const exists = prev.some(
          (f) => f.contractorId === contractorId && f.workerId === workerId
        );
        if (exists) {
          return prev.filter(
            (f) => !(f.contractorId === contractorId && f.workerId === workerId)
          );
        }
        return [
          ...prev,
          { id: newId('fav'), contractorId, workerId, createdAt: nowIso() },
        ];
      });
    },
    []
  );

  // ---------------------------------------------------------------------
  // Favorite contractors (mirror of favorite workers, above)
  // ---------------------------------------------------------------------

  const isFavoriteContractor = useCallback<AppState['isFavoriteContractor']>(
    (workerId, contractorId) =>
      favoriteContractors.some(
        (f) => f.workerId === workerId && f.contractorId === contractorId
      ),
    [favoriteContractors]
  );

  const getFavoriteContractorIds = useCallback<
    AppState['getFavoriteContractorIds']
  >(
    (workerId) =>
      favoriteContractors
        .filter((f) => f.workerId === workerId)
        .map((f) => f.contractorId),
    [favoriteContractors]
  );

  const toggleFavoriteContractor = useCallback<
    AppState['toggleFavoriteContractor']
  >((workerId, contractorId) => {
    setFavoriteContractors((prev) => {
      const exists = prev.some(
        (f) => f.workerId === workerId && f.contractorId === contractorId
      );
      if (exists) {
        return prev.filter(
          (f) => !(f.workerId === workerId && f.contractorId === contractorId)
        );
      }
      return [
        ...prev,
        { id: newId('favc'), workerId, contractorId, createdAt: nowIso() },
      ];
    });
  }, []);

  // ---------------------------------------------------------------------
  // Worker / Contractor profile mutations
  // ---------------------------------------------------------------------

  const setWorkerAvailability = useCallback<
    AppState['setWorkerAvailability']
  >((workerId, isAvailable) => {
    setWorkers((prev) =>
      prev.map((w) =>
        w.id === workerId ? { ...w, isAvailable } : w
      )
    );
    setCurrentUser((cu) =>
      cu && cu.role === 'worker' && cu.id === workerId
        ? { ...cu, isAvailable }
        : cu
    );
  }, []);

  const updateWorkerProfile = useCallback<AppState['updateWorkerProfile']>(
    (workerId, patch) => {
      setWorkers((prev) =>
        prev.map((w) => (w.id === workerId ? { ...w, ...patch } : w))
      );
      setCurrentUser((cu) =>
        cu && cu.role === 'worker' && cu.id === workerId
          ? { ...cu, ...patch }
          : cu
      );
    },
    []
  );

  const updateContractorProfile = useCallback<
    AppState['updateContractorProfile']
  >((contractorId, patch) => {
    setContractors((prev) =>
      prev.map((c) => (c.id === contractorId ? { ...c, ...patch } : c))
    );
    setCurrentUser((cu) =>
      cu && cu.role === 'contractor' && cu.id === contractorId
        ? { ...cu, ...patch }
        : cu
    );
  }, []);

  const updateContractorRegistrationNumber = useCallback<
    AppState['updateContractorRegistrationNumber']
  >(
    (contractorId, registrationNumber, _adminId) => {
      const next = registrationNumber.trim();
      const existing = contractors.find((c) => c.id === contractorId);
      // No real change (or nothing to change) -> persist nothing and,
      // critically, send NO notification.
      if (
        !existing ||
        !next ||
        next === existing.contractorRegistrationNumber
      ) {
        return;
      }

      setContractors((prev) =>
        prev.map((c) =>
          c.id === contractorId
            ? { ...c, contractorRegistrationNumber: next }
            : c
        )
      );
      setCurrentUser((cu) =>
        cu && cu.role === 'contractor' && cu.id === contractorId
          ? { ...cu, contractorRegistrationNumber: next }
          : cu
      );

      // The update is saved at this point — now tell the contractor. This is
      // the manual-edit path only, so it never doubles up with the
      // "בקשת עדכון הרישיון אושרה" notification from reviewContractorLicenseUpdate.
      pushNotification({
        userId: contractorId,
        type: 'contractor_registration_number_updated',
        title: 'מספר רישום הקבלן עודכן',
        body: 'מספר רישום הקבלן בחשבונך עודכן על ידי מנהל המערכת. ניתן לצפות בפרטים המעודכנים בפרופיל שלך.',
        relatedId: contractorId,
      });
    },
    [contractors, pushNotification]
  );

  // ---------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------

  const getOrCreateConversation = useCallback<
    AppState['getOrCreateConversation']
  >(
    (currentUserId, otherUserId) => {
      const existing = findConversation(conversations, currentUserId, otherUserId);
      if (existing) return existing;

      const fresh = buildConversation({ currentUserId, otherUserId });
      setConversations((prev) => [fresh, ...prev]);
      return fresh;
    },
    [conversations]
  );

  const sendMessage = useCallback<AppState['sendMessage']>(
    (conversationId, senderId, text) => {
      const conversation = conversations.find((c) => c.id === conversationId);
      const receiverId =
        conversation?.participantIds.find((id) => id !== senderId) ??
        senderId;
      const message = buildMessage(senderId, receiverId, text);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: [...c.messages, message],
                lastMessage: message.content,
                lastMessageAt: message.timestamp,
                updatedAt: message.timestamp,
              }
            : c
        )
      );
      return message;
    },
    [conversations]
  );

  // ---------------------------------------------------------------------
  // Support
  // ---------------------------------------------------------------------

  const openSupportTicket = useCallback<AppState['openSupportTicket']>(
    (userId, userRole, type, subject, description) => {
      const t: SupportTicket = {
        id: newId('tkt'),
        userId,
        userRole,
        type,
        subject,
        description,
        status: 'open',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        messages: [],
      };
      setSupportTickets((prev) => [t, ...prev]);
      admins.forEach((a) =>
        pushNotification({
          userId: a.id,
          type: 'new_support_ticket',
          title: 'פנייה חדשה לתמיכה',
          body: `${subject} — ${userRole === 'worker' ? 'עובד' : 'קבלן'}`,
          relatedId: t.id,
        })
      );
      return t;
    },
    [admins, pushNotification]
  );

  const replyToTicket = useCallback<AppState['replyToTicket']>(
    (ticketId, senderId, senderRole, message, statusChange) => {
      const text = message.trim();
      if (!text) return;
      const isAdmin = senderRole === 'admin';
      const ts = nowIso();

      const existing = supportTickets.find((t) => t.id === ticketId);
      if (!existing) return;
      // Hard stop: a closed conversation accepts no more messages from either
      // side, regardless of what any screen still shows. The UI hides the
      // compose box, but this is the real guard.
      if (existing.isClosed) return;
      // Status only moves when the caller is an admin AND the target differs.
      const applyStatus =
        isAdmin && !!statusChange && statusChange !== existing.status
          ? statusChange
          : undefined;

      const msg: SupportTicketMessage = {
        id: newId('stm'),
        ticketId,
        senderId,
        senderRole,
        message: text,
        createdAt: ts,
        ...(applyStatus ? { statusChange: applyStatus } : {}),
      };

      let target: SupportTicket | undefined;
      setSupportTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t;
          target = {
            ...t,
            messages: [...(t.messages ?? []), msg],
            updatedAt: ts,
            // Mirror only — the latest admin reply, for legacy readers /
            // notification bodies. Every reply is kept in `messages`.
            adminResponse: isAdmin ? text : t.adminResponse,
            assignedAdminId: isAdmin ? senderId : t.assignedAdminId,
            ...(applyStatus
              ? {
                  status: applyStatus,
                  resolvedAt:
                    applyStatus === 'resolved' ? ts : t.resolvedAt,
                }
              : {}),
          };
          return target;
        })
      );

      if (!target) return;
      if (isAdmin) {
        if (applyStatus) {
          // A status change is not "just a new reply" — say what changed.
          const statusLabel = supportTicketDisplay(applyStatus).label;
          pushNotification({
            userId: target.userId,
            type: 'support_response',
            title: 'סטטוס פניית התמיכה שלך השתנה',
            body:
              `הפנייה "${target.subject}" עברה לסטטוס "${statusLabel}". ` +
              `מנהל המערכת כתב: ${text.slice(0, 140)}`,
            relatedId: ticketId,
          });
        } else {
          pushNotification({
            userId: target.userId,
            type: 'support_response',
            title: 'תגובה חדשה לפנייה שלך',
            body: text.slice(0, 80),
            relatedId: ticketId,
          });
        }
      } else {
        // The requester replied — let every admin know so it doesn't sit
        // unseen. relatedId routes straight to the ticket.
        admins.forEach((a) =>
          pushNotification({
            userId: a.id,
            type: 'support_response',
            title: 'המשתמש הגיב לפניית תמיכה',
            body: `${target!.subject} — ${text.slice(0, 60)}`,
            relatedId: ticketId,
          })
        );
      }
    },
    [supportTickets, admins, pushNotification]
  );

  const closeSupportTicket = useCallback<AppState['closeSupportTicket']>(
    (ticketId, adminId) => {
      const ts = nowIso();
      let target: SupportTicket | undefined;
      setSupportTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId || t.isClosed) return t;
          target = {
            ...t,
            isClosed: true,
            closedAt: ts,
            closedBy: adminId,
            updatedAt: ts,
          };
          return target;
        })
      );
      if (!target) return;
      pushNotification({
        userId: target.userId,
        type: 'support_response',
        title: 'הפנייה שלך נסגרה',
        body: 'הטיפול בפנייה הסתיים והיא נסגרה. ניתן לצפות בהיסטוריית השיחה בכל עת.',
        relatedId: ticketId,
      });
    },
    [pushNotification]
  );

  const reopenSupportTicket = useCallback<AppState['reopenSupportTicket']>(
    (ticketId, _adminId) => {
      const ts = nowIso();
      let target: SupportTicket | undefined;
      setSupportTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId || !t.isClosed) return t;
          target = {
            ...t,
            isClosed: false,
            closedAt: undefined,
            closedBy: undefined,
            updatedAt: ts,
          };
          return target;
        })
      );
      if (!target) return;
      pushNotification({
        userId: target.userId,
        type: 'support_response',
        title: 'הפנייה שלך נפתחה מחדש',
        body: 'הפנייה חזרה למצב פתוח וניתן להמשיך את השיחה.',
        relatedId: ticketId,
      });
    },
    [pushNotification]
  );

  // -------------------------------------------------------------------
  // Contractor licence verification
  // -------------------------------------------------------------------

  const yearsFromNow = (n: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + n);
    return d.toISOString();
  };

  const getPendingLicenseRequestForContractor = useCallback<
    AppState['getPendingLicenseRequestForContractor']
  >(
    (contractorId) =>
      contractorLicenseRequests.find(
        (r) => r.contractorId === contractorId && r.status === 'pending'
      ),
    [contractorLicenseRequests]
  );

  const submitContractorLicenseUpdate = useCallback<
    AppState['submitContractorLicenseUpdate']
  >(
    (contractorId, patch) => {
      const hasChange =
        !!patch.newLicenseDocument ||
        !!patch.newLicenseDetails?.trim() ||
        !!patch.newRegistrationNumber?.trim() ||
        !!patch.proposedValidUntil;
      if (!hasChange) return null;
      // Only one open request at a time.
      if (
        contractorLicenseRequests.some(
          (r) => r.contractorId === contractorId && r.status === 'pending'
        )
      ) {
        return null;
      }
      const req: ContractorLicenseUpdateRequest = {
        id: newId('lreq'),
        contractorId,
        newLicenseDocument: patch.newLicenseDocument,
        newLicenseDetails: patch.newLicenseDetails?.trim() || undefined,
        newRegistrationNumber: patch.newRegistrationNumber?.trim() || undefined,
        proposedValidFrom: patch.proposedValidFrom,
        proposedValidUntil: patch.proposedValidUntil,
        status: 'pending',
        createdAt: nowIso(),
      };
      setContractorLicenseRequests((prev) => [req, ...prev]);

      const contractor = contractors.find((c) => c.id === contractorId);
      admins.forEach((a) =>
        pushNotification({
          userId: a.id,
          type: 'license_update_submitted',
          title: 'בקשת עדכון רישיון חדשה',
          body: `${
            contractor?.companyName ?? 'קבלן'
          } הגיש בקשה לעדכון רישיון הקבלן לבדיקה.`,
          relatedId: contractorId,
        })
      );
      return req;
    },
    [contractorLicenseRequests, contractors, admins, pushNotification]
  );

  const reviewContractorLicenseUpdate = useCallback<
    AppState['reviewContractorLicenseUpdate']
  >(
    (requestId, adminId, approve, reason) => {
      const req = contractorLicenseRequests.find((r) => r.id === requestId);
      if (!req || req.status !== 'pending') return;
      // A rejection must always carry a reason (the UI enforces this too).
      if (!approve && !reason?.trim()) return;
      const ts = nowIso();

      setContractorLicenseRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: approve ? 'approved' : 'rejected',
                reviewedAt: ts,
                reviewedBy: adminId,
                rejectionReason: approve ? undefined : reason?.trim(),
              }
            : r
        )
      );

      if (approve) {
        // The proposed values become the current verified licence. The old
        // document is replaced only NOW, on approval — never while pending.
        setContractors((prev) =>
          prev.map((c) =>
            c.id === req.contractorId
              ? {
                  ...c,
                  contractorRegistrationNumber:
                    req.newRegistrationNumber ??
                    c.contractorRegistrationNumber,
                  licenseDetails: req.newLicenseDetails ?? c.licenseDetails,
                  contractorLicenseDocument:
                    req.newLicenseDocument ?? c.contractorLicenseDocument,
                  licenseValidFrom:
                    req.proposedValidFrom ?? c.licenseValidFrom,
                  // Always the date the contractor entered from the new
                  // document — never derived. Falls back to the current value
                  // only if a request somehow carried none.
                  licenseValidUntil:
                    req.proposedValidUntil ?? c.licenseValidUntil,
                  licenseVerificationStatus: 'verified',
                  licenseLastVerifiedAt: ts,
                  // Annual manual review clock — 1 year from THIS verification,
                  // independent of how long the document itself is valid.
                  licenseNextReviewAt: yearsFromNow(1),
                }
              : c
          )
        );
      }

      pushNotification({
        userId: req.contractorId,
        type: approve
          ? 'license_update_approved'
          : 'license_update_rejected',
        title: approve
          ? 'בקשת עדכון הרישיון אושרה'
          : 'בקשת עדכון הרישיון נדחתה',
        body: approve
          ? 'הרישיון החדש עודכן ואומת. הוא מוצג כעת בפרופיל שלך.'
          : `הבקשה נדחתה${
              reason?.trim() ? `: ${reason.trim()}` : ''
            }. הרישיון הקודם נשאר בתוקף.`,
        relatedId: req.contractorId,
      });
    },
    [contractorLicenseRequests, pushNotification]
  );

  const verifyContractorLicense = useCallback<
    AppState['verifyContractorLicense']
  >(
    (contractorId, _adminId) => {
      const ts = nowIso();
      // The periodic annual review — a pure admin-side audit stamp. It moves
      // ONLY the review clock forward. licenseValidUntil, the document, the
      // registration number and the classification are all left untouched,
      // and no contractor notification is raised (nothing changed for them).
      setContractors((prev) =>
        prev.map((c) =>
          c.id === contractorId
            ? {
                ...c,
                licenseVerificationStatus: 'verified',
                licenseLastVerifiedAt: ts,
                licenseNextReviewAt: yearsFromNow(1),
              }
            : c
        )
      );
    },
    []
  );

  const renewalRequestKey = (contractorId: string, validUntil?: string) =>
    `lic-renewal:${contractorId}:${validUntil ?? ''}`;

  const hasRenewalRequestBeenSent = useCallback<
    AppState['hasRenewalRequestBeenSent']
  >(
    (contractorId, licenseValidUntil) => {
      const key = renewalRequestKey(contractorId, licenseValidUntil);
      return notifications.some((n) => n.dedupeKey === key);
    },
    [notifications]
  );

  const requestContractorLicenseRenewal = useCallback<
    AppState['requestContractorLicenseRenewal']
  >(
    (contractorId, _adminId) => {
      const c = contractors.find((x) => x.id === contractorId);
      if (!c) return;
      const st = getContractorLicenseStatus(c);
      // Only meaningful for a validity problem — never for a periodic review.
      if (st.state !== 'expiring_soon' && st.state !== 'expired') return;

      const when = c.licenseValidUntil ? formatDateIL(c.licenseValidUntil) : '';
      // Sends the contractor a notification and NOTHING else. dedupeKey keeps
      // repeated taps (and the same expiring state) from re-notifying.
      pushNotification({
        userId: contractorId,
        type: 'license_renewal_requested',
        title:
          st.state === 'expired'
            ? 'רישיון הקבלן שלך פג תוקף'
            : 'נדרש חידוש רישיון קבלן',
        body:
          st.state === 'expired'
            ? `רישיון הקבלן שלך פג${
                when ? ` בתאריך ${when}` : ''
              }. יש להעלות רישיון מעודכן לצורך בדיקת מנהל המערכת.`
            : `רישיון הקבלן שלך עומד לפוג${
                when ? ` בתאריך ${when}` : ''
              }. יש להעלות מסמך רישיון מעודכן ותאריך תוקף חדש.`,
        relatedId: contractorId,
        dedupeKey: renewalRequestKey(contractorId, c.licenseValidUntil),
      });
    },
    [contractors, pushNotification]
  );

  // ---------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------

  const markNotificationRead = useCallback<AppState['markNotificationRead']>(
    (id) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    },
    []
  );

  const markAllNotificationsRead = useCallback<
    AppState['markAllNotificationsRead']
  >((userId) => {
    setNotifications((prev) =>
      prev.map((n) => (n.userId === userId ? { ...n, isRead: true } : n))
    );
  }, []);

  // ---------------------------------------------------------------------
  // Selectors
  // ---------------------------------------------------------------------

  const getUserById = useCallback<AppState['getUserById']>(
    (id) =>
      workers.find((w) => w.id === id) ??
      contractors.find((c) => c.id === id) ??
      admins.find((a) => a.id === id),
    [workers, contractors, admins]
  );

  const getJobById = useCallback<AppState['getJobById']>(
    (id) => jobs.find((j) => j.id === id),
    [jobs]
  );

  const getApplicationsForJob = useCallback<AppState['getApplicationsForJob']>(
    (jobId) => applications.filter((a) => a.jobId === jobId),
    [applications]
  );

  const getApplicationsForWorker = useCallback<
    AppState['getApplicationsForWorker']
  >(
    (workerId) => applications.filter((a) => a.workerId === workerId),
    [applications]
  );

  const getInvitationsForContractor = useCallback<
    AppState['getInvitationsForContractor']
  >(
    (contractorId) =>
      invitations.filter((i) => i.contractorId === contractorId),
    [invitations]
  );

  const getInvitationsForWorker = useCallback<
    AppState['getInvitationsForWorker']
  >((workerId) => invitations.filter((i) => i.workerId === workerId), [
    invitations,
  ]);

  const getJobsForContractor = useCallback<AppState['getJobsForContractor']>(
    (contractorId) => jobs.filter((j) => j.contractorId === contractorId),
    [jobs]
  );

  const getAssignmentsForJob = useCallback<AppState['getAssignmentsForJob']>(
    (jobId) => assignments.filter((a) => a.jobId === jobId),
    [assignments]
  );

  const getAssignmentsForWorker = useCallback<
    AppState['getAssignmentsForWorker']
  >(
    (workerId) => assignments.filter((a) => a.workerId === workerId),
    [assignments]
  );

  const getStaffingProgress = useCallback<AppState['getStaffingProgress']>(
    (jobId) => {
      const job = jobs.find((j) => j.id === jobId);
      return computeStaffingProgress(assignments, jobId, job?.workersNeeded ?? 0);
    },
    [assignments, jobs]
  );

  const isJobFullyStaffed = useCallback<AppState['isJobFullyStaffed']>(
    (jobId) => {
      const job = jobs.find((j) => j.id === jobId);
      if (!job) return false;
      return computeIsJobFullyStaffed(assignments, jobId, job.workersNeeded);
    },
    [assignments, jobs]
  );

  const getNotificationsForUser = useCallback<
    AppState['getNotificationsForUser']
  >(
    (userId) =>
      notifications
        .filter((n) => n.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [notifications]
  );

  const getTicketsForUser = useCallback<AppState['getTicketsForUser']>(
    (userId) => supportTickets.filter((t) => t.userId === userId),
    [supportTickets]
  );

  // ---------------------------------------------------------------------
  // Value
  // ---------------------------------------------------------------------

  const value = useMemo<AppState>(
    () => ({
      currentUser,
      sessionLoading,
      passwordRecoveryActive,
      clearPasswordRecovery,
      jobSearchState,
      updateJobSearchState,
      admins,
      workers,
      contractors,
      registrations,
      jobs,
      applications,
      invitations,
      assignments,
      favoriteWorkers,
      favoriteContractors,
      conversations,
      notifications,
      supportTickets,
      contractorLicenseRequests,

      loginAsCustomer,
      loginAsAdmin,
      logout,

      submitWorkerRegistration,
      submitContractorRegistration,
      getRegistration,

      approveRegistration,
      rejectRegistration,
      revertRegistrationRejection,
      blockUser,
      unblockUser,

      postJob,
      updateJob,
      deleteJob,
      canDeleteJob,
      setJobAcceptingApplications,
      applyToJob,
      respondToApplication,
      withdrawApplication,
      sendInvitation,
      respondToInvitation,
      cancelInvitation,
      cancelAssignment,
      completeAssignment,

      toggleFavoriteWorker,
      isFavoriteWorker,
      getFavoriteWorkerIds,

      toggleFavoriteContractor,
      isFavoriteContractor,
      getFavoriteContractorIds,

      setWorkerAvailability,
      updateWorkerProfile,
      updateContractorProfile,
      updateContractorRegistrationNumber,

      getOrCreateConversation,
      sendMessage,

      openSupportTicket,
      replyToTicket,
      closeSupportTicket,
      reopenSupportTicket,

      submitContractorLicenseUpdate,
      reviewContractorLicenseUpdate,
      verifyContractorLicense,
      getPendingLicenseRequestForContractor,
      requestContractorLicenseRenewal,
      hasRenewalRequestBeenSent,

      markNotificationRead,
      markAllNotificationsRead,

      getUserById,
      getJobById,
      getApplicationsForJob,
      getApplicationsForWorker,
      getInvitationsForContractor,
      getInvitationsForWorker,
      getJobsForContractor,
      getAssignmentsForJob,
      getAssignmentsForWorker,
      getStaffingProgress,
      isJobFullyStaffed,
      getNotificationsForUser,
      getTicketsForUser,
    }),
    [
      currentUser,
      sessionLoading,
      passwordRecoveryActive,
      clearPasswordRecovery,
      jobSearchState,
      updateJobSearchState,
      admins,
      workers,
      contractors,
      registrations,
      jobs,
      applications,
      invitations,
      assignments,
      favoriteWorkers,
      favoriteContractors,
      conversations,
      notifications,
      supportTickets,
      contractorLicenseRequests,
      loginAsCustomer,
      loginAsAdmin,
      logout,
      submitWorkerRegistration,
      submitContractorRegistration,
      getRegistration,
      approveRegistration,
      rejectRegistration,
      revertRegistrationRejection,
      blockUser,
      unblockUser,
      postJob,
      updateJob,
      deleteJob,
      canDeleteJob,
      setJobAcceptingApplications,
      applyToJob,
      respondToApplication,
      withdrawApplication,
      sendInvitation,
      respondToInvitation,
      cancelInvitation,
      cancelAssignment,
      completeAssignment,
      toggleFavoriteWorker,
      isFavoriteWorker,
      getFavoriteWorkerIds,
      toggleFavoriteContractor,
      isFavoriteContractor,
      getFavoriteContractorIds,
      setWorkerAvailability,
      updateWorkerProfile,
      updateContractorProfile,
      updateContractorRegistrationNumber,
      getOrCreateConversation,
      sendMessage,
      openSupportTicket,
      replyToTicket,
      closeSupportTicket,
      reopenSupportTicket,
      submitContractorLicenseUpdate,
      reviewContractorLicenseUpdate,
      verifyContractorLicense,
      getPendingLicenseRequestForContractor,
      requestContractorLicenseRenewal,
      hasRenewalRequestBeenSent,
      markNotificationRead,
      markAllNotificationsRead,
      getUserById,
      getJobById,
      getApplicationsForJob,
      getApplicationsForWorker,
      getInvitationsForContractor,
      getInvitationsForWorker,
      getJobsForContractor,
      getAssignmentsForJob,
      getAssignmentsForWorker,
      getStaffingProgress,
      isJobFullyStaffed,
      getNotificationsForUser,
      getTicketsForUser,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useApp = (): AppState => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside <AppProvider>');
  }
  return ctx;
};
