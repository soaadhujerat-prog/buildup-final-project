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
  useRef,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import { AppState as ReactNativeAppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  getWorkerJobAssignment,
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
import * as registrationService from '../services/registrationService';
import {
  updateWorkerProfileBackend,
  updateContractorProfileBackend,
  setWorkerAvailabilityBackend,
} from '../services/profileService';
import * as notificationService from '../services/notificationService';
import * as adminUserService from '../services/adminUserService';
import * as licenseService from '../services/licenseService';
import * as jobsService from '../services/jobsService';
import * as applicationsService from '../services/applicationsService';
import * as assignmentsService from '../services/assignmentsService';
import * as invitationsService from '../services/invitationsService';
import * as participantsService from '../services/participantsService';
import * as favoritesService from '../services/favoritesService';
import * as chatService from '../services/chatService';
import * as supportService from '../services/supportService';
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
  /** 'full' — job already at capacity (accept refused). 'error' — the backend
   *  call failed for another reason (stale application, auth, network); the
   *  screen shows a generic Hebrew failure. */
  reason?: 'full' | 'error';
}

/** Result of `sendInvitation`. On success `invitation` is the created row. On
 *  failure `reason` says why NOTHING was created — `'duplicate'` (a live
 *  pending/accepted invitation already exists for this job+worker) is a
 *  first-class outcome and is NEVER reported as a successful send. Map `reason`
 *  to Hebrew with `invitationsService.sendInvitationErrorText`. */
export interface SendInvitationResult {
  ok: boolean;
  invitation?: Invitation;
  reason?: invitationsService.SendInvitationFailure;
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
  /** Backend only: true while the first support-ticket load for the current
   *  user is in flight. Always false on the mock path. */
  supportTicketsLoading: boolean;
  /** Backend only: re-read the signed-in user's support tickets from Supabase.
   *  No-op on the mock path. */
  refreshSupportTickets: () => Promise<void>;
  contractorLicenseRequests: ContractorLicenseUpdateRequest[];

  // Worker job-search state — persists across navigation (see JobSearchState).
  jobSearchState: JobSearchState;
  updateJobSearchState: (patch: Partial<JobSearchState>) => void;

  /** Phase 4A: true while a backend job fetch is in flight. Lets screens show
   *  a loading state instead of their "no jobs" empty state during the initial
   *  load. Always `false` on the mock path. */
  jobsLoading: boolean;
  /** Phase 4D: true when the LAST backend job fetch threw and left no jobs to
   *  show. Lets screens tell a real load FAILURE apart from a genuinely empty
   *  result (never a silent fall-back to mock data). Cleared the moment the
   *  next fetch starts. Always `false` on the mock path. */
  jobsError: boolean;
  /** Phase 4A: re-pull `jobs` from Supabase for the current user (worker →
   *  open pool, contractor → own, admin → all). No-op on the mock path. 4B/4C
   *  call this after a job mutation; in 4A it runs from the load effect. */
  refreshJobs: () => Promise<void>;

  // Auth
  /** True only while the backend session is being restored on cold start
   *  (`EXPO_PUBLIC_USE_BACKEND=true`). The navigator holds on the splash until
   *  this clears, so Login / a dashboard never flash before we know who is
   *  signed in. Always `false` when the backend flag is off. */
  sessionLoading: boolean;
  /** A Supabase recovery session is active. The navigator routes straight to
   *  ResetPasswordScreen. Set once the emailed recovery CODE is verified
   *  (VerifyRecoveryCodeScreen), or from a `PASSWORD_RECOVERY` auth event. */
  passwordRecoveryActive: boolean;
  /** Enter recovery mode after `verifyRecoveryCode` succeeded — the recovery
   *  session is live, so route to ResetPasswordScreen. */
  beginPasswordRecovery: () => void;
  clearPasswordRecovery: () => void;
  loginAsCustomer: (
    identifier: string,
    password: string
  ) => Promise<LoginResult>;
  loginAsAdmin: (identifier: string, password: string) => Promise<LoginResult>;
  logout: () => void;

  // Registration
  /** Submit a sign-up. Backend (`USE_BACKEND=true`): calls the `register` Edge
   *  Function (creates the auth user + a `pending` registrations row; raw ID /
   *  password / email are never stored). Mock: pushes onto the local array.
   *  Rejects with a `RegistrationError` the screen can surface. */
  submitWorkerRegistration: (
    data: WorkerRegistrationData
  ) => Promise<RegistrationRecord>;
  submitContractorRegistration: (
    data: ContractorRegistrationData
  ) => Promise<RegistrationRecord>;
  getRegistration: (id: string) => RegistrationRecord | undefined;
  /** Re-pull the admin registrations list from the backend (no-op on mock).
   *  Called automatically after approve / reject / revert. */
  refreshRegistrations: () => Promise<void>;

  // Admin actions
  /** Approve a still-`pending` registration. `message` is an optional
   *  free-text note from the admin — stored on the record and used as the
   *  body of the new user's "registration approved" notification. Appends a
   *  RegistrationStatusEvent (pending → approved) to statusHistory. */
  approveRegistration: (
    registrationId: string,
    adminId: string,
    message?: string
  ) => Promise<void>;
  rejectRegistration: (
    registrationId: string,
    adminId: string,
    reason: string
  ) => Promise<void>;
  /** Undo a rejection — moves a `rejected` registration back to `pending` so
   *  it re-enters the pending queue for a fresh review. Never auto-approves.
   *  The rejection is NOT erased: the previous rejectionReason and every
   *  prior statusHistory entry are kept, and a new (rejected → pending)
   *  event is appended. */
  revertRegistrationRejection: (
    registrationId: string,
    adminId: string
  ) => Promise<void>;
  blockUser: (userId: string, adminId: string, reason?: string) => Promise<void>;
  unblockUser: (userId: string, adminId: string) => Promise<void>;
  /** Backend only: true when this user has an encrypted ID on file (drives the
   *  admin "reveal ID" affordance). Always false on the mock path. */
  userHasIdOnFile: (userId: string) => boolean;
  /** Backend only: decrypt one approved user's ID number for admin
   *  verification — re-gated to a live approved admin server-side. */
  revealUserIdNumber: (userId: string) => Promise<string>;

  // Jobs
  postJob: (
    job: Omit<JobPost, 'id' | 'postedAt' | 'status' | 'acceptingApplications'> & {
      acceptingApplications?: boolean;
    }
  ) => Promise<JobPost>;
  /** Contractor manual close / reopen of registration. Backend path (Phase 4C):
   *  writes ONLY jobs.closed_manually via the set_job_closed_manually RPC, then
   *  re-reads the job — job_registration_state alone decides the resulting
   *  open state (reopening a full job leaves it closed, reason 'capacity').
   *  Never sets acceptingApplications directly. Mock path unchanged. */
  setJobAcceptingApplications: (jobId: string, accepting: boolean) => Promise<void>;
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
  ) => Promise<void>;
  /** HARD delete — permanently removes the job from state. Allowed ONLY when
   *  the job never generated any activity: no applications, no invitations and
   *  no assignments (of any status) reference it. Guarded here too, so a call
   *  for a job that has any activity is a silent no-op — the UI must offer
   *  "close registration" instead. Never touches applications / invitations /
   *  assignments (a clean job has none by definition). */
  deleteJob: (jobId: string) => Promise<void>;
  /** True when `deleteJob` would actually delete this job (i.e. it has zero
   *  applications / invitations / assignments). MOCK PATH ONLY — the UI uses
   *  this to decide between "מחק משרה" and "סגור משרה להרשמה". On the backend
   *  path the screen asks the DB via jobsService.jobIsDeletable (the mock
   *  staffing arrays aren't populated). `deleteJob` on the backend path
   *  rejects with jobsService.JobHasActivityError when deletion is blocked. */
  canDeleteJob: (jobId: string) => boolean;

  // Applications (worker -> job)
  /** Submit an application. Backend path (Phase 5A): a real Supabase INSERT
   *  (RLS + trigger enforce worker_id / eligibility / recruitment_cycle) whose
   *  persisted row is merged into `applications`; rejects with an
   *  `applicationsService.ApplicationError` ('duplicate' | 'ineligible' |
   *  'unauthorized') the caller maps to a Hebrew message. `workerId` is ignored
   *  on the backend path (auth.uid() is authoritative). Mock path unchanged. */
  applyToJob: (
    jobId: string,
    workerId: string,
    message?: string
  ) => Promise<Application>;
  /** True while the initial backend applications fetch is in flight. Always
   *  false on the mock path. */
  applicationsLoading: boolean;
  /** Accept / reject a pending application. Backend path (Phase 5B): the atomic
   *  `respond_to_application` RPC — accept also creates ONE real assignment
   *  under a job-row lock (no overbooking), then applications + assignments +
   *  jobs are re-pulled. Returns `{ ok:false, reason:'full' }` when the job
   *  filled first, `{ ok:false, reason:'error' }` on any other failure. Mock
   *  path unchanged. */
  respondToApplication: (
    applicationId: string,
    accepted: boolean,
    response?: string
  ) => Promise<StaffingActionResult>;
  /** Worker pulls back their own still-`pending` application. Never deletes
   *  the record — flips status to 'withdrawn' and stamps `withdrawnAt`, so
   *  the history stays intact and a fresh application can be filed later if
   *  the job is still open. A no-op on any non-pending application. */
  withdrawApplication: (applicationId: string) => Promise<void>;

  // Invitations (contractor -> worker)
  /** Phase 5C-1: re-pull `invitations` from Supabase for the current user
   *  (worker → addressed to them, contractor → sent by them, admin → all).
   *  No-op on the mock path. Called from the load effect and after every
   *  send / respond / cancel on the backend path. */
  refreshInvitations: () => Promise<void>;
  /** Send an invitation. Backend path (Phase 5C-1): the `send_invitation` RPC
   *  (owning approved contractor · approved worker target · job open & not
   *  full · one-live rule) whose persisted row is merged into `invitations`.
   *  Returns a `SendInvitationResult`: `{ ok: true, invitation }` when a NEW
   *  row was created, otherwise `{ ok: false, reason }` where `reason` is
   *  `'duplicate'` (a live pending/accepted invitation already exists — no row
   *  created, NOT a success), `'full'`, `'ineligible'` or `'error'`. The DB
   *  uniqueness/security rules are unchanged — this only maps the RPC's
   *  refusal to a typed result. `contractorId` is ignored on the backend path
   *  (auth.uid() is authoritative). Mock path mirrors the same result shape. */
  sendInvitation: (
    jobId: string,
    contractorId: string,
    workerId: string,
    message?: string
  ) => Promise<SendInvitationResult>;
  /** Accept / decline an invitation, with an optional free-text note from the
   *  worker (stored on invitation.responseMessage). Backend path (Phase 5C-1):
   *  the atomic `respond_to_invitation` RPC — accept also creates ONE real
   *  assignment (source='invitation') under a job-row lock (no overbooking),
   *  then invitations + assignments + jobs are re-pulled. Returns
   *  `{ ok:false, reason:'full' }` when the job filled first,
   *  `{ ok:false, reason:'error' }` on any other failure. Mock path unchanged. */
  respondToInvitation: (
    invitationId: string,
    accepted: boolean,
    message?: string
  ) => Promise<StaffingActionResult>;
  /** Contractor withdraws their own still-`pending` invitation. Never deletes
   *  the record — flips status to 'cancelled' (reason 'manual') and stamps
   *  `cancelledAt`. A no-op on any non-pending invitation (an accepted
   *  invitation already produced an Assignment and must go through the
   *  staffing-cancellation flow instead, never this one). Backend path
   *  (Phase 5C-1): the `cancel_invitation` RPC, then `invitations` is
   *  re-pulled. Mock path unchanged. */
  cancelInvitation: (invitationId: string) => Promise<void>;

  // Assignments (real staffing)
  /** Cancel an ACTIVE assignment — a staffed worker leaving the job, from
   *  either side. Flips the Assignment (not the Application/Invitation that
   *  produced it) to 'cancelled', stamps cancelledAt / cancelledBy /
   *  cancellationMessage, and lets the capacity reconciler reopen registration
   *  if it had auto-closed. Backend path (Phase 5C-2): the `cancel_assignment`
   *  RPC (assigned worker OR owning approved contractor; `cancelled_by` derived
   *  server-side; job-row lock) followed by `refreshAssignments()` +
   *  `refreshJobs()`. Rejects with an `assignmentsService.AssignmentError`
   *  ('not_active' | 'unauthorized' | 'gone') on the backend path. Mock path
   *  unchanged (no-op on a completed / already-cancelled assignment). */
  cancelAssignment: (
    assignmentId: string,
    cancelledBy: 'worker' | 'contractor',
    message?: string
  ) => Promise<void>;
  /** Mark an ACTIVE assignment as the worker having FINISHED their part
   *  normally. Flips the Assignment to 'completed', stamps completedAt. NOT a
   *  cancellation: the slot stays occupied (occupied_slot_count counts active +
   *  completed), so capacity / open state do not change and nothing on the job
   *  itself is touched. Backend path (Phase 5C-2): the `complete_assignment`
   *  RPC (owning approved contractor only; job-row lock) followed by
   *  `refreshAssignments()` + `refreshJobs()`. Rejects with an
   *  `assignmentsService.AssignmentError` on the backend path. Mock path
   *  unchanged (no-op on a completed / already-cancelled assignment). */
  completeAssignment: (assignmentId: string) => Promise<void>;

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
  setWorkerAvailability: (
    workerId: string,
    isAvailable: boolean,
    availableFrom?: string
  ) => Promise<void>;
  updateWorkerProfile: (workerId: string, patch: Partial<Worker>) => Promise<void>;
  updateContractorProfile: (
    contractorId: string,
    patch: Partial<Contractor>
  ) => Promise<void>;
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
  ) => Promise<void>;

  // Messaging — one conversation per pair of users, WhatsApp-style (no job
  // scoping: the same two people always share a single thread). Backend path
  // (Phase 7A): conversation identity + message writes are server-authoritative
  // RPCs, so these are async. The mock path resolves synchronously-wrapped.
  getOrCreateConversation: (
    currentUserId: string,
    otherUserId: string
  ) => Promise<Conversation>;
  sendMessage: (
    conversationId: string,
    senderId: string,
    text: string
  ) => Promise<Message>;
  /** Reload the signed-in user's conversation inbox from the backend
   *  (no-op on the mock path). Cleared to [] on logout. */
  refreshConversations: () => Promise<void>;
  /** Load one thread's persisted message history into state — called by
   *  ChatScreen on open (no-op on the mock path). */
  hydrateConversationMessages: (conversationId: string) => Promise<void>;
  /** Mark a conversation read for the signed-in user (server-persisted
   *  last_read_at). Zeroes that conversation's unread badge. No-op on mock. */
  markConversationRead: (conversationId: string) => Promise<void>;
  /** ChatScreen tells AppContext which thread it is showing (null on leave) so
   *  realtime messages for that thread are treated as already read. Passing a
   *  non-null id also marks that conversation read + clears its chat
   *  notifications. No-op on mock. */
  setActiveConversation: (conversationId: string | null) => void;
  /** Mark all unread `new_message` notifications for one conversation read
   *  (Phase 7C active-chat no-spam). No-op on mock. */
  markChatNotificationsRead: (conversationId: string) => Promise<void>;

  // Support
  /** Open a new support ticket for `userId` (a worker or contractor). Resolves
   *  with the created ticket. Backend (`USE_BACKEND=true`): calls the
   *  `create_support_ticket` RPC — `user_id`/`user_role`/`status`/timestamps are
   *  server-authoritative, admins are notified server-side — then re-reads.
   *  Mock path: unchanged local behaviour, wrapped in a resolved promise. */
  openSupportTicket: (
    userId: string,
    userRole: 'worker' | 'contractor',
    type: SupportTicketType,
    subject: string,
    description: string
  ) => Promise<SupportTicket>;
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
  ) => Promise<void>;
  /** Close a ticket's conversation. Independent of `status` (a "טופל" ticket
   *  stays "טופל"): it only sets `isClosed`/`closedAt`/`closedBy`, bumps
   *  `updatedAt`, and notifies the requester. No message is ever removed or
   *  edited. A no-op if the ticket is missing or already closed. Admin-only
   *  by convention — enforced at the call site. */
  closeSupportTicket: (ticketId: string, adminId: string) => Promise<void>;
  /** Reopen a closed ticket so the conversation can continue. Clears
   *  `isClosed`/`closedAt`/`closedBy`, bumps `updatedAt`, notifies the
   *  requester. `status` is left exactly as it was. A no-op if the ticket is
   *  missing or not currently closed. */
  reopenSupportTicket: (ticketId: string, adminId: string) => Promise<void>;

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
  ) => Promise<ContractorLicenseUpdateRequest | null>;
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
  ) => Promise<void>;
  /** Admin verifies the contractor's CURRENT licence (initial or periodic
   *  review) without any pending replacement — sets status 'verified' and
   *  moves the review clock forward. */
  verifyContractorLicense: (contractorId: string, adminId: string) => Promise<void>;
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
  ) => Promise<void>;
  /** True once a renewal request has been sent to this contractor for the
   *  given licenseValidUntil (used to swap the admin CTA for an info line). */
  hasRenewalRequestBeenSent: (
    contractorId: string,
    licenseValidUntil?: string
  ) => boolean;

  // Notifications
  /** Phase 6: re-pull the signed-in user's real notifications from Supabase
   *  (server-authoritative rows written in-transaction by the staffing RPCs /
   *  triggers). No-op on the mock path. Runs from the session-load effect;
   *  screens may also call it (e.g. pull-to-refresh). */
  refreshNotifications: () => Promise<void>;
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

  const beginPasswordRecovery = useCallback(
    () => setPasswordRecoveryActive(true),
    []
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
    // eslint-disable-next-line no-console
    if (__DEV__) console.log('[AUTH_BOOT] start');

    // The initial bootstrap MUST settle on its own — it never waits on an
    // onAuthStateChange event. `endBootstrap` is the single place sessionLoading
    // is cleared; every path below routes through it exactly once.
    let settled = false;
    const endBootstrap = (user: SessionUser) => {
      if (!alive || settled) return;
      settled = true;
      clearTimeout(safetyNet);
      // eslint-disable-next-line no-console
      if (__DEV__) console.log('[AUTH_BOOT] finish');
      setCurrentUser(user);
      setSessionLoading(false);
    };

    // Secondary safety net ONLY. The real guarantee that sessionLoading ends is
    // the finally() below; this is defence-in-depth so a future hang inside the
    // Supabase auth client can never strand the app on the splash screen.
    const safetyNet = setTimeout(() => {
      if (!alive || settled) return;
      // eslint-disable-next-line no-console
      console.warn('[AUTH_BOOT] bootstrap did not settle in 15s — forcing logged-out');
      endBootstrap(null);
    }, 15000);

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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[AUTH_BOOT] client init failed — logged-out', err);
      endBootstrap(null);
      return () => {
        alive = false;
      };
    }

    bootstrapSessionUser()
      .then((user) => endBootstrap(user))
      .catch((err) => {
        // No silent mock fallback — just land logged-out; the user can retry.
        // eslint-disable-next-line no-console
        console.warn('[AUTH_BOOT] bootstrap error — logged-out', err);
        endBootstrap(null);
      });

    return () => {
      alive = false;
      clearTimeout(safetyNet);
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateJobSearchState = useCallback<AppState['updateJobSearchState']>(
    (patch) => setJobSearchState((prev) => ({ ...prev, ...patch })),
    []
  );

  const [admins] = useState<Admin[]>(MOCK_ADMINS);
  // Backend: the worker/contractor pools start EMPTY and are filled with real
  // Supabase profiles — the admin directory (refreshUserDirectory) for an
  // admin, or the referenced-participant resolver (refreshParticipants) for a
  // worker/contractor. Mock path keeps MOCK_* unchanged.
  const [workers, setWorkers] = useState<Worker[]>(
    isBackendEnabled() ? [] : MOCK_WORKERS
  );
  const [contractors, setContractors] = useState<Contractor[]>(
    isBackendEnabled() ? [] : MOCK_CONTRACTORS
  );
  // Backend: the admin registrations queue is loaded from Supabase
  // (listRegistrationsForAdmin, approved-admin only) and a just-submitted
  // sign-up is prepended in memory for the pending/rejected status screens.
  // Starts EMPTY so the admin dashboard never flashes mock pending counts /
  // cards before the real queue resolves. Mock path keeps MOCK_REGISTRATIONS.
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>(
    isBackendEnabled() ? [] : MOCK_REGISTRATIONS
  );

  // Phase 4A: on the real backend path jobs are loaded from Supabase (see
  // refreshJobs / the load effect below), so they start empty; the mock path
  // is unchanged (MOCK_JOBS).
  const [jobs, setJobs] = useState<JobPost[]>(
    isBackendEnabled() ? [] : MOCK_JOBS
  );
  // True while a backend job fetch is in flight — lets screens show a loading
  // state instead of their "no jobs" empty state during the initial load.
  // Always false on the mock path.
  const [jobsLoading, setJobsLoading] = useState<boolean>(isBackendEnabled());
  // True when the last backend job fetch failed and left nothing to show, so a
  // load failure reads as a failure and not as an empty result. Never a mock
  // fall-back. Always false on the mock path.
  const [jobsError, setJobsError] = useState<boolean>(false);

  // Phase 5A: on the real backend path APPLICATIONS load from Supabase (see
  // refreshApplications below), so they start empty; the mock path keeps
  // MOCK_APPLICATIONS. Invitations & assignments are NOT migrated yet (Phase
  // 5B/5C) — but on the backend path they must start empty too so no mock
  // staffing row can ever attach itself to a real job UUID (fake applicant
  // counts / fake capacity / fake notifications).
  const [applications, setApplications] = useState<Application[]>(
    isBackendEnabled() ? [] : MOCK_APPLICATIONS
  );
  const [applicationsLoading, setApplicationsLoading] = useState<boolean>(
    isBackendEnabled()
  );
  const [invitations, setInvitations] = useState<Invitation[]>(
    isBackendEnabled() ? [] : MOCK_INVITATIONS
  );

  // Seed assignments once from whatever applications/invitations already came
  // in as 'accepted' in the mock data, so staffing counts are consistent with
  // the rest of the prototype from first render — never a separate hardcoded
  // number. Empty on the backend path (see note above).
  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    if (isBackendEnabled()) return [];
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
  //
  // BACKEND (Phase 4A): DISABLED. On the real path `acceptingApplications` is
  // a read-through projection of job_registration_state.open_for_applications
  // (the server-side source of truth) — this client-side reconciler must never
  // run, or it would become a second, conflicting source of truth.
  useEffect(() => {
    if (isBackendEnabled()) return;
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
  // Backend path starts empty and hydrates from Supabase (refreshConversations
  // below); the mock path keeps the normalized + deduped MOCK_CONVERSATIONS.
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    isBackendEnabled()
      ? []
      : dedupeConversations(MOCK_CONVERSATIONS.map(normalizeConversation))
  );
  // Backend path starts empty and hydrates from Supabase (refreshNotifications
  // below, RLS-scoped) + the realtime INSERT channel; the mock path keeps the
  // seeded local notifications. Starting empty on the backend path keeps the
  // bell / NotificationsScreen from briefly showing mock rows at cold start.
  const [notifications, setNotifications] = useState<AppNotification[]>(
    isBackendEnabled() ? [] : MOCK_NOTIFICATIONS
  );
  // Backend path starts empty and hydrates from Supabase (refreshSupportTickets
  // below, RLS-scoped); the mock path keeps the seeded local tickets.
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() =>
    isBackendEnabled() ? [] : MOCK_SUPPORT_TICKETS.map(normalizeSupportTicket)
  );
  const [supportTicketsLoading, setSupportTicketsLoading] = useState<boolean>(
    isBackendEnabled()
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
  //
  // BACKEND (USE_BACKEND=true): DISABLED. `notifications` is a read-through of
  // real `public.notifications` rows and nothing server-side ever writes a
  // `license_attention` row — injecting client-only, non-persistent ones here
  // would pollute the real list (stale after relaunch, wrong unread count).
  // The admin still gets the signal from the AdminDashboard "licence attention"
  // card + AdminLicenseAttentionScreen, both derived live from the real
  // contractor directory.
  useEffect(() => {
    if (isBackendEnabled()) return;
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
  //
  // BACKEND (Phase 4A): DISABLED — this is the second client-side capacity
  // reconciler. Invitations are still mock in Phase 4; the server-side
  // assignments_reconcile trigger owns this behaviour on the real path.
  useEffect(() => {
    if (isBackendEnabled()) return;
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
  >(async (data) => {
    if (isBackendEnabled()) {
      // Real sign-up: creates the auth user + a `pending` registrations row
      // server-side. Raw ID / password / email are never persisted. Errors
      // propagate to SignUpScreen (no silent fallback).
      const rec = await registrationService.submitWorkerRegistration(data);
      // Keep the just-submitted record in memory (own device only, password
      // stripped) so RegistrationPendingScreen can show the clean summary —
      // the un-authenticated signer can't read their row back from the DB.
      setRegistrations((prev) => [rec, ...prev]);
      return rec;
    }

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
  >(async (data) => {
    if (isBackendEnabled()) {
      const rec = await registrationService.submitContractorRegistration(data);
      setRegistrations((prev) => [rec, ...prev]);
      return rec;
    }

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

  const refreshRegistrations = useCallback<AppState['refreshRegistrations']>(
    async () => {
      if (!isBackendEnabled()) return;
      try {
        const rows = await registrationService.listRegistrationsForAdmin();
        setRegistrations(rows);
      } catch {
        // keep whatever the admin already has on screen
      }
    },
    []
  );

  // Backend: load the real registrations queue once the signed-in user is a
  // live, approved admin. Mock: this never runs; `registrations` stays
  // MOCK_REGISTRATIONS.
  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (currentUser?.role !== 'admin' || currentUser.status !== 'approved') return;
    let alive = true;
    registrationService
      .listRegistrationsForAdmin()
      .then((rows) => {
        if (alive) setRegistrations(rows);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [currentUser?.id, currentUser?.role, currentUser?.status]);

  // Backend: which profile ids have a decryptable ID on file (drives the
  // admin "reveal ID" affordance). Populated alongside the user directory.
  const [idOnFile, setIdOnFile] = useState<Set<string>>(new Set());

  // Backend: replace the MOCK_* worker/contractor pools with the live directory
  // for an approved admin, so every admin screen shows real backend users.
  const refreshUserDirectory = useCallback(async () => {
    if (!isBackendEnabled()) return;
    try {
      const dir = await adminUserService.loadUserDirectory();
      setWorkers(dir.workers);
      setContractors(dir.contractors);
      setIdOnFile(dir.idOnFile);
    } catch {
      // keep whatever the admin already has on screen
    }
  }, []);

  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (currentUser?.role !== 'admin' || currentUser.status !== 'approved') return;
    void refreshUserDirectory();
  }, [currentUser?.id, currentUser?.role, currentUser?.status, refreshUserDirectory]);

  // Backend: the signed-in user's real notifications (minimal Phase 3B read
  // path — no realtime). Reloaded whenever the user identity changes.
  const refreshNotifications = useCallback(async () => {
    if (!isBackendEnabled()) return;
    try {
      setNotifications(await notificationService.listNotifications());
    } catch {
      /* keep current */
    }
  }, []);

  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (!currentUser) {
      setNotifications([]);
      return;
    }
    void refreshNotifications();
  }, [currentUser?.id, refreshNotifications]);

  // Backend: the signed-in user's real support tickets + threads. RLS scopes
  // the rows (worker / contractor -> own; admin -> all), so one call covers
  // every role. Reads only — writes go through the support RPCs
  // (openSupportTicket / replyToTicket / close / reopen) which re-read after.
  // No realtime: a support notification arriving also triggers a re-read (see
  // the notifications INSERT handler). No-op / seeded mock on the mock path.
  const refreshSupportTickets = useCallback(async () => {
    if (!isBackendEnabled()) return;
    try {
      setSupportTickets(await supportService.listMyTickets());
    } catch {
      /* keep whatever is loaded — screens show their existing empty state */
    } finally {
      setSupportTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (!currentUser) {
      setSupportTickets([]);
      setSupportTicketsLoading(false);
      return;
    }
    setSupportTicketsLoading(true);
    void refreshSupportTickets();
  }, [currentUser?.id, currentUser?.role, refreshSupportTickets]);

  // ---------------------------------------------------------------------
  // Chat — real backend read layer (7A persistence) + realtime/unread (7B)
  // ---------------------------------------------------------------------
  // `conversations` is the SAME array MessagesScreen / ChatScreen already read.
  // The inbox comes from list_my_conversations() (RLS participant-only,
  // server-computed unread_count); each thread's `messages` stays empty until
  // ChatScreen opens it. Writes go through getOrCreateConversation / sendMessage
  // (RPC). No silent mock fallback: on a failed load the list stays as-is.
  // Cleared on logout so the next account never inherits a thread.
  //
  // 7B realtime: ONE `postgres_changes` INSERT channel on public.messages
  // (chatService.subscribeToMyMessages), RLS-filtered per subscriber. On each
  // event we merge the message by id into its thread (no dup bubble — the
  // sender's own RPC result is already merged), bump the inbox preview/order,
  // and either mark-read (thread actively open) or bump unread. A debounced
  // list_my_conversations() reconciles the authoritative unread_count. The
  // subscription lifecycle is tied to `currentUser?.id` below.
  const mergeMessages = useCallback(
    (existing: Message[], incoming: Message[]): Message[] => {
      const byId = new Map(existing.map((m) => [m.id, m]));
      incoming.forEach((m) => byId.set(m.id, m));
      return Array.from(byId.values()).sort((a, b) => {
        const t = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        return t !== 0 ? t : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    },
    []
  );

  // Which thread ChatScreen currently has open (a ref, not state — the realtime
  // handler reads it without re-subscribing). Drives the read-race semantics:
  // a message that lands while its thread is actively open is marked read;
  // one that lands for any other thread bumps that thread's unread count.
  const activeConversationIdRef = useRef<string | null>(null);
  const conversationsReconcileTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const refreshConversations = useCallback(async () => {
    if (!isBackendEnabled() || !currentUser) return;
    try {
      const fresh = await chatService.listMyConversations(currentUser.id);
      // Preserve any messages already hydrated into a thread this session.
      setConversations((prev) => {
        const prevById = new Map(prev.map((c) => [c.id, c]));
        return fresh.map((c) => {
          const old = prevById.get(c.id);
          return old && old.messages.length
            ? { ...c, messages: mergeMessages(old.messages, []) }
            : c;
        });
      });
    } catch {
      // No silent mock fallback — keep whatever is loaded.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, mergeMessages]);

  /** Coalesce a burst of chat realtime events into one authoritative inbox
   *  refetch. (The notification bell is NOT refreshed here — Phase 7C's fix
   *  gives `public.notifications` its own INSERT subscription below; coupling a
   *  debounced refreshNotifications() to chat events was the unreliable path
   *  that missed live delivery on device.) */
  const scheduleConversationsReconcile = useCallback(() => {
    if (conversationsReconcileTimer.current) return;
    conversationsReconcileTimer.current = setTimeout(() => {
      conversationsReconcileTimer.current = null;
      void refreshConversations();
    }, 300);
  }, [refreshConversations]);

  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (!currentUser) {
      activeConversationIdRef.current = null;
      if (conversationsReconcileTimer.current) {
        clearTimeout(conversationsReconcileTimer.current);
        conversationsReconcileTimer.current = null;
      }
      setConversations([]);
      return;
    }
    void refreshConversations();
  }, [currentUser?.id, refreshConversations]);

  /** Load one thread's persisted history into `conversations[id].messages`.
   *  Called by ChatScreen on open. No-op on the mock path. */
  const hydrateConversationMessages = useCallback(
    async (conversationId: string) => {
      if (!isBackendEnabled()) return;
      try {
        const msgs = await chatService.getConversationMessages(conversationId);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, messages: mergeMessages(c.messages, msgs) }
              : c
          )
        );
      } catch {
        // keep whatever is already on screen
      }
    },
    [mergeMessages]
  );

  /** Mark a conversation read for the signed-in user (server: last_read_at =
   *  now() on their own participant row only). Optimistically zeroes the local
   *  unread badge; the next inbox refetch confirms. No-op on the mock path. */
  const markConversationRead = useCallback(
    async (conversationId: string) => {
      if (!isBackendEnabled()) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId && c.unreadCount
            ? { ...c, unreadCount: 0 }
            : c
        )
      );
      try {
        await chatService.markConversationRead(conversationId);
      } catch {
        // reconciled by the next list_my_conversations(); not fatal
      }
    },
    []
  );

  /** Phase 7C: mark every unread chat (`new_message`) notification for ONE
   *  conversation read — server-side, scoped by related_id (so it also clears
   *  ones not yet loaded into `notifications`). Used when the recipient is /
   *  becomes active in that thread, so a chat they're already looking at never
   *  leaves a notification sitting unread. Chat's own unreadCount is handled
   *  separately by markConversationRead (Phase 7B). No-op on the mock path. */
  const markChatNotificationsRead = useCallback(
    async (conversationId: string) => {
      if (!isBackendEnabled()) return;
      setNotifications((prev) => {
        let touched = false;
        const next = prev.map((n) => {
          if (
            n.type === 'new_message' &&
            n.relatedId === conversationId &&
            !n.isRead
          ) {
            touched = true;
            return { ...n, isRead: true };
          }
          return n;
        });
        return touched ? next : prev;
      });
      try {
        await notificationService.markChatConversationRead(conversationId);
      } catch {
        // reconciled by the next refreshNotifications(); not fatal
      }
    },
    []
  );

  /** Tell AppContext which thread ChatScreen is showing (or null on leave).
   *  Opening a thread marks its chat unread read (7B) and clears any chat
   *  notifications already queued for it (7C). */
  const setActiveConversation = useCallback(
    (conversationId: string | null) => {
      activeConversationIdRef.current = conversationId;
      if (conversationId) {
        void markConversationRead(conversationId);
        void markChatNotificationsRead(conversationId);
      }
    },
    [markConversationRead, markChatNotificationsRead]
  );

  // --- realtime: one INSERT-on-messages channel, lifecycle tied to the user ---
  const handleIncomingMessage = useCallback(
    (message: Message, conversationId: string) => {
      const myId = currentUser?.id;
      if (!myId) return;
      const fromOther = message.senderId !== myId;
      const isActive = activeConversationIdRef.current === conversationId;

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversationId);
        if (idx === -1) {
          // A thread this client hasn't loaded yet (e.g. the other side just
          // created the conversation). The unconditional reconcile below pulls
          // the full inbox (thread + participants + unread_count).
          return prev;
        }
        const c = prev[idx];
        const updated: Conversation = {
          ...c,
          messages: mergeMessages(c.messages, [message]),
          lastMessage: message.content,
          lastMessageAt: message.timestamp,
          updatedAt: message.timestamp,
          unreadCount:
            fromOther && !isActive
              ? (c.unreadCount ?? 0) + 1
              : c.unreadCount,
        };
        const next = prev.slice();
        next.splice(idx, 1);
        next.unshift(updated); // newest activity first
        return next;
      });

      if (fromOther && isActive) {
        // Message arrived while its thread is on screen — it's been seen:
        // clear both the chat unread (7B) and the fresh chat notification (7C).
        void markConversationRead(conversationId);
        void markChatNotificationsRead(conversationId);
      }
      // Always reconcile the authoritative unread_count + notification bell.
      scheduleConversationsReconcile();
    },
    [
      currentUser?.id,
      mergeMessages,
      markConversationRead,
      markChatNotificationsRead,
      scheduleConversationsReconcile,
    ]
  );

  useEffect(() => {
    if (!isBackendEnabled() || !currentUser) return;
    let channel: RealtimeChannel | null =
      chatService.subscribeToMyMessages(handleIncomingMessage);
    return () => {
      chatService.unsubscribeChannel(channel);
      channel = null;
    };
  }, [currentUser?.id, handleIncomingMessage]);

  // --- realtime: one INSERT-on-notifications channel (Phase 7C live delivery).
  // Lifecycle tied to currentUser?.id — subscribe on login, removeChannel on
  // logout / user switch / teardown. RLS + a `user_id=eq.<me>` filter keep it
  // to THIS user's rows. Merge by id (dedupe vs refreshNotifications), keep
  // newest-first. A `new_message` notification for the thread currently open is
  // merged already-read and persisted read (7C no-spam); anything else stays
  // unread and the bell updates immediately. DB refresh (login / foreground /
  // pull-to-refresh) stays the authority; this only accelerates delivery.
  const handleIncomingNotification = useCallback(
    (n: AppNotification) => {
      const myId = currentUser?.id;
      if (!myId || n.userId !== myId) return;

      const forActiveThread =
        n.type === 'new_message' &&
        !!n.relatedId &&
        n.relatedId === activeConversationIdRef.current;
      const merged: AppNotification = forActiveThread
        ? { ...n, isRead: true }
        : n;

      setNotifications((prev) => {
        if (prev.some((x) => x.id === merged.id)) return prev; // dedupe by id
        return [merged, ...prev].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

      if (forActiveThread && n.relatedId) {
        // persist read (server bulk update, scoped by related_id)
        void markChatNotificationsRead(n.relatedId);
      }

      // Support is not a realtime feature, but a support notification (admin
      // replied / status changed / closed / reopened, or — for an admin — a
      // new ticket / user reply) means the ticket list is now stale. Re-read so
      // tapping the notification lands on an up-to-date SupportTicketDetails.
      if (n.type === 'support_response' || n.type === 'new_support_ticket') {
        void refreshSupportTickets();
      }
    },
    [currentUser?.id, markChatNotificationsRead, refreshSupportTickets]
  );

  useEffect(() => {
    if (!isBackendEnabled() || !currentUser) return;
    let channel: RealtimeChannel | null =
      notificationService.subscribeToMyNotifications(
        currentUser.id,
        handleIncomingNotification
      );
    return () => {
      notificationService.unsubscribeNotificationsChannel(channel);
      channel = null;
    };
  }, [currentUser?.id, handleIncomingNotification]);

  // Reconcile from the DB when the app returns to the foreground (Realtime may
  // have missed events while backgrounded — persistence stays the authority).
  useEffect(() => {
    if (!isBackendEnabled()) return;
    const sub = ReactNativeAppState.addEventListener('change', (state) => {
      if (state !== 'active' || !currentUser) return;
      void refreshConversations();
      void refreshNotifications();
      void refreshSupportTickets();
      const active = activeConversationIdRef.current;
      if (active) {
        void hydrateConversationMessages(active);
        void markChatNotificationsRead(active);
      }
    });
    return () => sub.remove();
  }, [
    currentUser?.id,
    refreshConversations,
    refreshNotifications,
    refreshSupportTickets,
    hydrateConversationMessages,
    markChatNotificationsRead,
  ]);

  // Backend: contractor licence-update requests (RLS returns own for a
  // contractor, all for an admin). Frontend-only in the mock path.
  const refreshLicenseRequests = useCallback(async () => {
    if (!isBackendEnabled()) return;
    try {
      setContractorLicenseRequests(await licenseService.listLicenseRequests());
    } catch {
      /* keep current */
    }
  }, []);

  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (
      currentUser?.role !== 'contractor' &&
      !(currentUser?.role === 'admin' && currentUser.status === 'approved')
    ) {
      return;
    }
    void refreshLicenseRequests();
  }, [currentUser?.id, currentUser?.role, currentUser?.status, refreshLicenseRequests]);

  // ---------------------------------------------------------------------
  // Jobs — real backend READ layer (Phase 4A)
  // ---------------------------------------------------------------------
  // Loads `jobs` from Supabase once the authenticated user is known:
  //   worker     -> jobsService.listOpenJobs()          (open + visible pool)
  //   contractor -> jobsService.listContractorJobs(id)  (all own jobs)
  //   admin      -> jobsService.listContractorJobs()    (every job, via RLS)
  // job_registration_state is the sole source of truth for acceptingApplications
  // (see jobsService). No-op on the mock path — `jobs` stays MOCK_JOBS. Writes
  // (postJob / updateJob — 4B; setJobAcceptingApplications / deleteJob — 4C) are
  // routed through jobsService RPCs and always re-read via refreshJobs after.
  const refreshJobs = useCallback(async () => {
    if (!isBackendEnabled() || !currentUser) return;
    setJobsLoading(true);
    setJobsError(false);
    try {
      const list =
        currentUser.role === 'worker'
          ? await jobsService.listOpenJobs()
          : currentUser.role === 'contractor'
          ? await jobsService.listContractorJobs(currentUser.id)
          : await jobsService.listContractorJobs();
      setJobs(list);
    } catch {
      // No silent mock fallback. Flag the failure so screens can say "load
      // failed" instead of "no results"; keep whatever is already on screen.
      setJobsError(true);
    } finally {
      setJobsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (!currentUser) {
      setJobs([]);
      setJobsLoading(false);
      return;
    }
    void refreshJobs();
  }, [currentUser?.id, currentUser?.role, refreshJobs]);

  // ---------------------------------------------------------------------
  // Applications — real backend READ layer (Phase 5A)
  // ---------------------------------------------------------------------
  // One flat list, RLS-scoped by the DB (worker → own; contractor → own jobs'
  // applications; admin → all), kept in the SAME `applications` array every
  // screen/selector already reads. No-op on the mock path (MOCK_APPLICATIONS).
  const refreshApplications = useCallback(async () => {
    if (!isBackendEnabled() || !currentUser) return;
    setApplicationsLoading(true);
    try {
      setApplications(await applicationsService.listVisibleApplications());
    } catch {
      // No silent mock fallback — leave whatever is loaded; screens show empty.
    } finally {
      setApplicationsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (!currentUser) {
      setApplications([]);
      setApplicationsLoading(false);
      return;
    }
    void refreshApplications();
  }, [currentUser?.id, currentUser?.role, refreshApplications]);

  // ---------------------------------------------------------------------
  // Assignments — real backend READ layer (Phase 5B)
  // ---------------------------------------------------------------------
  // Created only by respond_to_application (029). Kept in the SAME `assignments`
  // array the client-side staffing helpers (getStaffingProgress /
  // isJobFullyStaffed) and every screen already read, so real capacity /
  // "X מתוך Y שובצו" light up automatically. RLS scopes rows to the caller.
  const refreshAssignments = useCallback(async () => {
    if (!isBackendEnabled() || !currentUser) return;
    try {
      setAssignments(await assignmentsService.listVisibleAssignments());
    } catch {
      // No silent mock fallback — keep whatever is loaded.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (!currentUser) {
      setAssignments([]);
      return;
    }
    void refreshAssignments();
  }, [currentUser?.id, currentUser?.role, refreshAssignments]);

  // ---------------------------------------------------------------------
  // Invitations — real backend READ layer (Phase 5C-1)
  // ---------------------------------------------------------------------
  // One flat list, RLS-scoped by the DB (worker → addressed to them,
  // contractor → sent by them, admin → all), kept in the SAME `invitations`
  // array every screen/selector already reads. Mutations go through the
  // send_invitation / respond_to_invitation / cancel_invitation RPCs (030);
  // this only reads. No-op on the mock path (MOCK_INVITATIONS).
  const refreshInvitations = useCallback(async () => {
    if (!isBackendEnabled() || !currentUser) return;
    try {
      setInvitations(await invitationsService.listVisibleInvitations());
    } catch {
      // No silent mock fallback — keep whatever is loaded.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (!currentUser) {
      setInvitations([]);
      return;
    }
    void refreshInvitations();
  }, [currentUser?.id, currentUser?.role, refreshInvitations]);

  // ---------------------------------------------------------------------
  // Favorites — real backend READ layer (viewer-specific bookmark lists)
  // ---------------------------------------------------------------------
  // Two independent relationships, hydrated into the SAME arrays the selectors
  // (isFavoriteWorker / getFavoriteWorkerIds / …) already read:
  //   contractor session -> contractor_favorite_workers  -> favoriteWorkers
  //   worker session     -> worker_favorite_contractors  -> favoriteContractors
  // RLS scopes every row to auth.uid(), so a fresh login only ever sees its own
  // list and a logout (currentUser -> null) clears both. No silent mock
  // fallback on failure — the list just stays empty. Writes go through the
  // backend-aware toggles below. No-op on the mock path (MOCK is empty anyway).
  const refreshFavorites = useCallback(async () => {
    if (!isBackendEnabled() || !currentUser) return;
    try {
      if (currentUser.role === 'contractor') {
        const ids = await favoritesService.listFavoriteWorkerIds();
        setFavoriteWorkers(
          ids.map((workerId) => ({
            id: `${currentUser.id}:${workerId}`,
            contractorId: currentUser.id,
            workerId,
            createdAt: '',
          }))
        );
      } else if (currentUser.role === 'worker') {
        const ids = await favoritesService.listFavoriteContractorIds();
        setFavoriteContractors(
          ids.map((contractorId) => ({
            id: `${currentUser.id}:${contractorId}`,
            workerId: currentUser.id,
            contractorId,
            createdAt: '',
          }))
        );
      }
    } catch {
      // No silent mock fallback — keep whatever is loaded (empty on first load).
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (!currentUser) {
      setFavoriteWorkers([]);
      setFavoriteContractors([]);
      return;
    }
    void refreshFavorites();
  }, [currentUser?.id, currentUser?.role, refreshFavorites]);

  // Guards a favorite key while its insert/delete is in flight, so a rapid
  // double-tap can't fire a second racing request (backend path only).
  const favInFlightRef = useRef<Set<string>>(new Set());

  // ---------------------------------------------------------------------
  // Participants — real profile resolution for a worker / contractor (backend)
  // ---------------------------------------------------------------------
  // An admin gets the full directory (refreshUserDirectory). A worker /
  // contractor instead needs the REAL profiles of the people referenced by
  // their jobs / applications / invitations / assignments, so getUserById()
  // (and SearchWorkers / SmartMatch, which read `workers`) resolve to real
  // backend users instead of showing "עובד לא ידוע" / a mock name. All reads
  // are RLS-scoped direct SELECTs (participantsService) — no RPC, no RLS
  // change. Resolved rows are merged into the SAME `workers` / `contractors`
  // arrays every selector already reads. Each id (and the one-time
  // available-workers bulk load) is attempted once per session.
  const participantAttemptsRef = useRef<{
    uid: string | null;
    ids: Set<string>;
    availableLoaded: boolean;
  }>({ uid: null, ids: new Set(), availableLoaded: false });

  const resolveParticipants = useCallback(async () => {
    if (!isBackendEnabled() || !currentUser) return;
    if (currentUser.role === 'admin') return; // admin uses refreshUserDirectory

    const st = participantAttemptsRef.current;
    if (st.uid !== currentUser.id) {
      // identity changed without a logout in between — drop the previous
      // user's resolved pools so nothing stale leaks across sessions.
      participantAttemptsRef.current = {
        uid: currentUser.id,
        ids: new Set(),
        availableLoaded: false,
      };
      if (st.uid !== null) {
        setWorkers([]);
        setContractors([]);
      }
    }
    const attempts = participantAttemptsRef.current;

    const mergeWorkers = (list: Worker[]) => {
      list.forEach((w) => attempts.ids.add(w.id));
      if (!list.length) return;
      setWorkers((prev) => {
        const byId = new Map(prev.map((w) => [w.id, w]));
        list.forEach((w) => byId.set(w.id, w));
        return Array.from(byId.values());
      });
    };
    const mergeContractors = (list: Contractor[]) => {
      list.forEach((c) => attempts.ids.add(c.id));
      if (!list.length) return;
      setContractors((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        list.forEach((c) => byId.set(c.id, c));
        return Array.from(byId.values());
      });
    };

    const wantContractors = new Set<string>();
    jobs.forEach((j) => j.contractorId && wantContractors.add(j.contractorId));
    invitations.forEach(
      (i) => i.contractorId && wantContractors.add(i.contractorId)
    );
    assignments.forEach(
      (a) => a.contractorId && wantContractors.add(a.contractorId)
    );

    // Chat counterparts: the other participant of every conversation in the
    // inbox. Product rule (worker <-> contractor only) means a contractor's
    // counterparts are always workers and a worker's are always contractors,
    // so each id can be routed to the right resolver by the caller's role.
    const convOtherIds = new Set<string>();
    conversations.forEach((c) =>
      c.participantIds.forEach((pid) => {
        if (pid && pid !== currentUser.id) convOtherIds.add(pid);
      })
    );

    try {
      if (currentUser.role === 'contractor') {
        wantContractors.add(currentUser.id); // own job "פורסם על ידי"

        const wantWorkers = new Set<string>();
        applications.forEach((a) => a.workerId && wantWorkers.add(a.workerId));
        invitations.forEach((i) => i.workerId && wantWorkers.add(i.workerId));
        assignments.forEach((a) => a.workerId && wantWorkers.add(a.workerId));
        convOtherIds.forEach((id) => wantWorkers.add(id));

        const missingW = [...wantWorkers].filter((id) => !attempts.ids.has(id));
        const missingC = [...wantContractors].filter(
          (id) => !attempts.ids.has(id)
        );

        const tasks: Promise<void>[] = [];
        if (!attempts.availableLoaded) {
          attempts.availableLoaded = true;
          tasks.push(
            participantsService
              .loadAvailableWorkerSummaries()
              .then(mergeWorkers)
          );
        }
        if (missingW.length) {
          missingW.forEach((id) => attempts.ids.add(id));
          tasks.push(
            participantsService.loadWorkerSummaries(missingW).then(mergeWorkers)
          );
        }
        if (missingC.length) {
          missingC.forEach((id) => attempts.ids.add(id));
          tasks.push(
            participantsService
              .loadContractorSummaries(missingC)
              .then(mergeContractors)
          );
        }
        await Promise.all(tasks);
      } else {
        // worker: resolve the contractors behind their jobs / invitations /
        // assignments / conversations (workerId always resolves to `currentUser`).
        convOtherIds.forEach((id) => wantContractors.add(id));
        const missingC = [...wantContractors].filter(
          (id) => !attempts.ids.has(id)
        );
        if (missingC.length) {
          missingC.forEach((id) => attempts.ids.add(id));
          mergeContractors(
            await participantsService.loadContractorSummaries(missingC)
          );
        }
      }
    } catch {
      // keep whatever resolved; unresolved ids show a neutral fallback and are
      // retried on the next identity change (not in a loop this session).
    }
  }, [
    currentUser?.id,
    currentUser?.role,
    applications,
    invitations,
    assignments,
    jobs,
    conversations,
  ]);

  useEffect(() => {
    if (!isBackendEnabled()) return;
    if (!currentUser) {
      setWorkers([]);
      setContractors([]);
      participantAttemptsRef.current = {
        uid: null,
        ids: new Set(),
        availableLoaded: false,
      };
      return;
    }
    void resolveParticipants();
  }, [currentUser?.id, resolveParticipants]);

  // ---------------------------------------------------------------------
  // Admin actions
  // ---------------------------------------------------------------------

  const approveRegistration = useCallback<AppState['approveRegistration']>(
    async (registrationId, adminId, message) => {
      if (isBackendEnabled()) {
        // Server-authoritative: the `approve-registration` Edge Function
        // re-verifies the caller is a live admin, then materialises everything
        // in one transaction. Then re-pull so the screen reflects reality.
        await registrationService.approveRegistration(registrationId, message);
        await refreshRegistrations();
        return;
      }

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
    [registrations, pushNotification, refreshRegistrations]
  );

  const rejectRegistration = useCallback<AppState['rejectRegistration']>(
    async (registrationId, adminId, reason) => {
      if (isBackendEnabled()) {
        await registrationService.rejectRegistration(registrationId, reason);
        await refreshRegistrations();
        return;
      }

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
    [refreshRegistrations]
  );

  const revertRegistrationRejection = useCallback<
    AppState['revertRegistrationRejection']
  >(
    async (registrationId, adminId) => {
      if (isBackendEnabled()) {
        await registrationService.revertRegistrationRejection(registrationId);
        await refreshRegistrations();
        return;
      }

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
    [refreshRegistrations]
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
    async (userId, _adminId, reason) => {
      if (isBackendEnabled()) {
        // admin-user-action -> admin_block_user (server re-checks live-admin +
        // the 'block_users' permission, flips profiles.status and writes the
        // account_blocked notification in one transaction).
        await adminUserService.blockUser(userId, reason);
        await refreshUserDirectory();
        setCurrentUser((cu) =>
          cu && cu.role !== 'admin' && cu.id === userId
            ? { ...cu, status: 'blocked', blockedReason: reason, blockedAt: nowIso() }
            : cu
        );
        return;
      }
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
    [pushNotification, refreshUserDirectory]
  );

  const unblockUser = useCallback<AppState['unblockUser']>(
    async (userId, _adminId) => {
      if (isBackendEnabled()) {
        await adminUserService.unblockUser(userId);
        await refreshUserDirectory();
        setCurrentUser((cu) =>
          cu && cu.role !== 'admin' && cu.id === userId
            ? { ...cu, status: 'approved', blockedReason: undefined, blockedAt: undefined }
            : cu
        );
        return;
      }
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
    [pushNotification, refreshUserDirectory]
  );

  // ---------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------

  const postJob = useCallback<AppState['postJob']>(
    async (j) => {
      if (isBackendEnabled()) {
        // Phase 4B: create_job RPC (contractor_id forced to auth.uid()) +
        // worksite-image upload, then rebuild from the authoritative read path.
        const { worksiteImages, ...rest } = j as typeof j & {
          worksiteImages?: string[];
        };
        const jobId = await jobsService.createJobBackend(
          rest as Parameters<typeof jobsService.createJobBackend>[0],
          worksiteImages ?? []
        );
        await refreshJobs();
        const fresh = await jobsService.getJobById(jobId);
        if (fresh) {
          setJobs((prev) =>
            prev.some((p) => p.id === fresh.id) ? prev : [fresh, ...prev]
          );
          return fresh;
        }
        return {
          ...(j as Omit<JobPost, 'id' | 'postedAt' | 'status' | 'acceptingApplications'>),
          id: jobId,
          status: 'open',
          postedAt: nowIso(),
          acceptingApplications: true,
        } as JobPost;
      }

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
    },
    [refreshJobs]
  );

  // Plain merge — does NOT stamp updatedAt itself. "עודכן לאחרונה" must only
  // reflect a real content edit, never a technical/operational change, so
  // the decision of whether this call counts as one belongs to the caller
  // (PostJobScreen's save passes updatedAt explicitly; a future
  // technical-only caller simply wouldn't).
  const updateJob = useCallback<AppState['updateJob']>(
    async (jobId, patch) => {
      if (isBackendEnabled()) {
        // Phase 4B: update_job RPC (owner/admin only; content columns + child
        // collections; never contractor_id / status / closed_manually /
        // recruitment_cycle / created_at / derived state) + worksite images.
        await jobsService.updateJobBackend(
          jobId,
          patch as Parameters<typeof jobsService.updateJobBackend>[1]
        );
        await refreshJobs();
        const fresh = await jobsService.getJobById(jobId);
        if (fresh) {
          setJobs((prev) => prev.map((p) => (p.id === jobId ? fresh : p)));
        }
        return;
      }
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j))
      );
    },
    [refreshJobs]
  );

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
    async (jobId) => {
      if (isBackendEnabled()) {
        // Phase 4C: hard delete via the `delete-job` Edge Function — it runs
        // the authoritative DB delete FIRST (jobs_block_delete_with_activity is
        // the final guard; child rows cascade) and only then cleans the private
        // worksite-image Storage objects server-side. A blocked delete throws
        // JobHasActivityError and never touches an image.
        await jobsService.deleteJobBackend(jobId);
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        await refreshJobs();
        return;
      }
      if (!canDeleteJob(jobId)) return; // has activity — keep it
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    },
    [canDeleteJob, refreshJobs]
  );

  // The contractor's manual open/close switch. Closing stamps
  // registrationClosureReason 'manual' so the capacity reconciler will NOT
  // reopen it later. Opening clears the reason; opening a job that is
  // actually full is ignored (the reconciler would just re-close it, and the
  // UI hides the button in that case anyway).
  const setJobAcceptingApplications = useCallback<
    AppState['setJobAcceptingApplications']
  >(
    async (jobId, accepting) => {
      if (isBackendEnabled()) {
        // Phase 4C: write ONLY jobs.closed_manually, then re-read. We do NOT
        // set acceptingApplications here — job_registration_state re-derives
        // it (reopening a full job leaves it closed with reason 'capacity').
        await jobsService.setJobClosedManually(jobId, !accepting);
        await refreshJobs();
        return;
      }
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
    [assignments, refreshJobs]
  );

  // ---------------------------------------------------------------------
  // Applications
  // ---------------------------------------------------------------------

  const applyToJob = useCallback<AppState['applyToJob']>(
    async (jobId, workerId, message) => {
      if (isBackendEnabled()) {
        // Phase 5A. worker_id / eligibility / recruitment_cycle are all
        // enforced server-side; no mock notification for a real job.
        //   • a current-cycle WITHDRAWN row exists  -> reactivate it in place
        //     (reapply_to_job RPC — no second row, same id, fresh applied_at).
        //   • an ACCEPTED row whose latest assignment the WORKER cancelled
        //     (assignment.status='cancelled', cancelledBy='worker') -> CASE 1
        //     reactivation in place (reapply_after_cancellation RPC — 034; the
        //     server re-proves the worker-cancel, so a contractor-cancelled or
        //     completed placement is refused). Phase 5A deliberately left that
        //     row `accepted`, so a plain INSERT would hit the UNIQUE guard and
        //     surface "כבר הגשת מועמדות למשרה זו." — this is the sanctioned path.
        //   • otherwise -> a real INSERT.
        // A still-pending row never reaches here — the JobDetails action bar
        // shows no apply button for it.
        const uid = currentUser?.id;
        const mineForJob = uid
          ? applications.filter((a) => a.jobId === jobId && a.workerId === uid)
          : [];
        const withdrawnRow = mineForJob.find((a) => a.status === 'withdrawn');
        const acceptedRow = mineForJob.find((a) => a.status === 'accepted');
        const myLatestAssignment = uid
          ? getWorkerJobAssignment(assignments, jobId, uid)
          : undefined;
        const workerCancelledPlacement =
          !!acceptedRow &&
          myLatestAssignment?.status === 'cancelled' &&
          myLatestAssignment.cancelledBy === 'worker';
        const created = withdrawnRow
          ? await applicationsService.reapplyToJobBackend(jobId, message)
          : workerCancelledPlacement
          ? await applicationsService.reapplyAfterCancellationBackend(
              jobId,
              message
            )
          : await applicationsService.applyToJobBackend(jobId, message);
        setApplications((prev) => [
          created,
          ...prev.filter((a) => a.id !== created.id),
        ]);
        return created;
      }

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
    [applications, assignments, jobs, workers, pushNotification, currentUser?.id]
  );

  const withdrawApplication = useCallback<AppState['withdrawApplication']>(
    async (applicationId) => {
      if (isBackendEnabled()) {
        // Phase 5A: withdraw_application RPC (own pending row only, pending ->
        // withdrawn, history preserved). Re-pull so the row reflects the DB.
        await applicationsService.withdrawApplicationBackend(applicationId);
        await refreshApplications();
        return;
      }
      setApplications((prev) =>
        prev.map((a) =>
          a.id === applicationId && a.status === 'pending'
            ? { ...a, status: 'withdrawn', withdrawnAt: nowIso() }
            : a
        )
      );
    },
    [refreshApplications]
  );

  const respondToApplication = useCallback<AppState['respondToApplication']>(
    async (applicationId, accepted, response) => {
      if (isBackendEnabled()) {
        // Phase 5B: one atomic RPC. Accept also creates a real assignment under
        // a job-row lock (no overbooking); we then re-pull applications +
        // assignments + jobs, because job_registration_state (full / closed for
        // capacity) may have changed. No client-side capacity math, no manual
        // job close.
        try {
          const updated =
            await applicationsService.respondToApplicationBackend(
              applicationId,
              accepted,
              response
            );
          setApplications((prev) =>
            prev.map((a) => (a.id === updated.id ? updated : a))
          );
          await Promise.all([refreshAssignments(), refreshJobs()]);
          return { ok: true };
        } catch (e) {
          if (
            e instanceof applicationsService.ApplicationError &&
            e.code === 'full'
          ) {
            return { ok: false, reason: 'full' };
          }
          return { ok: false, reason: 'error' };
        }
      }
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
    [applications, jobs, assignments, pushNotification, refreshAssignments, refreshJobs]
  );

  // ---------------------------------------------------------------------
  // Invitations
  // ---------------------------------------------------------------------

  const sendInvitation = useCallback<AppState['sendInvitation']>(
    async (jobId, contractorId, workerId, message) => {
      if (isBackendEnabled()) {
        // Phase 5C-1: send_invitation RPC. contractor_id / worker_id / job_id /
        // status / timestamps are all server-side; eligibility (owner approved
        // contractor · approved worker · job open & not full · one-live rule)
        // is enforced by the RPC. A refusal maps to { ok:false, reason } — a
        // pre-existing live invitation is `'duplicate'` and is NEVER reported
        // as a successful send (no row was created).
        try {
          const created = await invitationsService.sendInvitationBackend(
            jobId,
            workerId,
            message
          );
          setInvitations((prev) => [
            created,
            ...prev.filter((i) => i.id !== created.id),
          ]);
          return { ok: true, invitation: created };
        } catch (e) {
          if (e instanceof invitationsService.InvitationError) {
            if (e.code === 'duplicate') return { ok: false, reason: 'duplicate' };
            if (e.code === 'full') return { ok: false, reason: 'full' };
            if (e.code === 'ineligible') return { ok: false, reason: 'ineligible' };
          }
          return { ok: false, reason: 'error' };
        }
      }

      // Duplicate prevention looks only at *active* invitations
      // (pending / accepted) for this worker+job. A historical
      // declined/cancelled/expired record must never block a re-invite.
      // A live invitation is `'duplicate'` — nothing is created and it is
      // NOT a success (mirrors the backend path).
      const activeDupe = invitations.find(
        (i) =>
          i.jobId === jobId &&
          i.workerId === workerId &&
          (i.status === 'pending' || i.status === 'accepted')
      );
      if (activeDupe) return { ok: false, reason: 'duplicate' };

      // Overbooking guard — a fully-staffed job takes no new invitations.
      const job0 = jobs.find((j) => j.id === jobId);
      if (
        job0 &&
        computeIsJobFullyStaffed(assignments, jobId, job0.workersNeeded)
      ) {
        return { ok: false, reason: 'full' };
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
      return { ok: true, invitation: inv };
    },
    [invitations, jobs, assignments, contractors, pushNotification]
  );

  const cancelInvitation = useCallback<AppState['cancelInvitation']>(
    async (invitationId) => {
      if (isBackendEnabled()) {
        // Phase 5C-1: cancel_invitation RPC (owning approved contractor, still
        // pending -> cancelled/'manual'). Re-pull so the row reflects the DB.
        try {
          await invitationsService.cancelInvitationBackend(invitationId);
        } finally {
          await refreshInvitations();
        }
        return;
      }
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
    [refreshInvitations]
  );

  const respondToInvitation = useCallback<AppState['respondToInvitation']>(
    async (invitationId, accepted, message) => {
      if (isBackendEnabled()) {
        // Phase 5C-1: one atomic RPC. Accept also creates a real assignment
        // (source='invitation') under a job-row lock (no overbooking); we then
        // re-pull invitations + assignments + jobs, because job_registration_state
        // (full / closed for capacity) may have changed. No client-side capacity
        // math, no manual job close. assignments_reconcile (009) still owns the
        // "auto-cancel other pending invitations when full" behaviour.
        try {
          const updated =
            await invitationsService.respondToInvitationBackend(
              invitationId,
              accepted,
              message
            );
          setInvitations((prev) =>
            prev.map((i) => (i.id === updated.id ? updated : i))
          );
          if (accepted) {
            await Promise.all([
              refreshInvitations(),
              refreshAssignments(),
              refreshJobs(),
            ]);
          } else {
            await refreshInvitations();
          }
          return { ok: true };
        } catch (e) {
          if (
            e instanceof invitationsService.InvitationError &&
            e.code === 'full'
          ) {
            return { ok: false, reason: 'full' };
          }
          return { ok: false, reason: 'error' };
        }
      }

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
    [
      invitations,
      jobs,
      assignments,
      workers,
      pushNotification,
      refreshInvitations,
      refreshAssignments,
      refreshJobs,
    ]
  );

  // ---------------------------------------------------------------------
  // Assignment cancellation (staffed worker leaving the job)
  // ---------------------------------------------------------------------

  const cancelAssignment = useCallback<AppState['cancelAssignment']>(
    async (assignmentId, cancelledBy, message) => {
      if (isBackendEnabled()) {
        // Phase 5C-2: cancel_assignment RPC (worker OR owning approved
        // contractor; active -> cancelled; cancelled_by derived server-side;
        // job-row lock serializes against accept paths). Freeing the slot lets
        // job_registration_state reopen the job — so re-pull assignments + jobs.
        // No client capacity math, no source-row rewrite. Throws
        // AssignmentError; the screen maps it to a Hebrew alert.
        await assignmentsService.cancelAssignmentBackend(assignmentId, message);
        await Promise.all([refreshAssignments(), refreshJobs()]);
        return;
      }

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
    [assignments, jobs, workers, pushNotification, refreshAssignments, refreshJobs]
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
    async (assignmentId) => {
      if (isBackendEnabled()) {
        // Phase 5C-2: complete_assignment RPC (owning approved contractor only;
        // active -> completed; job-row lock). The slot stays occupied
        // (occupied_slot_count counts active + completed) so capacity / open
        // state are unchanged — but re-pull both to reflect the persisted row.
        // Throws AssignmentError; the screen maps it to a Hebrew alert.
        await assignmentsService.completeAssignmentBackend(assignmentId);
        await Promise.all([refreshAssignments(), refreshJobs()]);
        return;
      }

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
    [assignments, jobs, pushNotification, refreshAssignments, refreshJobs]
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
      const addRow = (): ContractorFavoriteWorker => ({
        id: isBackendEnabled()
          ? `${contractorId}:${workerId}`
          : newId('fav'),
        contractorId,
        workerId,
        createdAt: nowIso(),
      });

      if (isBackendEnabled()) {
        const key = `${contractorId}:${workerId}`;
        if (favInFlightRef.current.has(key)) return; // double-tap guard
        const exists = favoriteWorkers.some(
          (f) => f.contractorId === contractorId && f.workerId === workerId
        );
        // Optimistic: flip the heart now, reconcile with the server below.
        setFavoriteWorkers((prev) =>
          exists
            ? prev.filter(
                (f) =>
                  !(f.contractorId === contractorId && f.workerId === workerId)
              )
            : [...prev, addRow()]
        );
        favInFlightRef.current.add(key);
        void (async () => {
          try {
            if (exists) {
              await favoritesService.removeFavoriteWorker(contractorId, workerId);
            } else {
              await favoritesService.addFavoriteWorker(contractorId, workerId);
            }
          } catch {
            // Roll the optimistic change back to its pre-tap state.
            setFavoriteWorkers((prev) => {
              const there = prev.some(
                (f) => f.contractorId === contractorId && f.workerId === workerId
              );
              if (exists && !there) return [...prev, addRow()];
              if (!exists && there) {
                return prev.filter(
                  (f) =>
                    !(f.contractorId === contractorId && f.workerId === workerId)
                );
              }
              return prev;
            });
          } finally {
            favInFlightRef.current.delete(key);
          }
        })();
        return;
      }

      // Mock path — unchanged local-only toggle.
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
    [favoriteWorkers]
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
  >(
    (workerId, contractorId) => {
      const addRow = (): WorkerFavoriteContractor => ({
        id: isBackendEnabled()
          ? `${workerId}:${contractorId}`
          : newId('favc'),
        workerId,
        contractorId,
        createdAt: nowIso(),
      });

      if (isBackendEnabled()) {
        const key = `${workerId}:${contractorId}`;
        if (favInFlightRef.current.has(key)) return; // double-tap guard
        const exists = favoriteContractors.some(
          (f) => f.workerId === workerId && f.contractorId === contractorId
        );
        setFavoriteContractors((prev) =>
          exists
            ? prev.filter(
                (f) =>
                  !(f.workerId === workerId && f.contractorId === contractorId)
              )
            : [...prev, addRow()]
        );
        favInFlightRef.current.add(key);
        void (async () => {
          try {
            if (exists) {
              await favoritesService.removeFavoriteContractor(
                workerId,
                contractorId
              );
            } else {
              await favoritesService.addFavoriteContractor(workerId, contractorId);
            }
          } catch {
            setFavoriteContractors((prev) => {
              const there = prev.some(
                (f) => f.workerId === workerId && f.contractorId === contractorId
              );
              if (exists && !there) return [...prev, addRow()];
              if (!exists && there) {
                return prev.filter(
                  (f) =>
                    !(f.workerId === workerId && f.contractorId === contractorId)
                );
              }
              return prev;
            });
          } finally {
            favInFlightRef.current.delete(key);
          }
        })();
        return;
      }

      // Mock path — unchanged local-only toggle.
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
    },
    [favoriteContractors]
  );

  // ---------------------------------------------------------------------
  // Worker / Contractor profile mutations
  // ---------------------------------------------------------------------

  const setWorkerAvailability = useCallback<
    AppState['setWorkerAvailability']
  >(async (workerId, isAvailable, availableFrom) => {
    if (isBackendEnabled()) {
      // Server-authoritative: set_own_worker_availability RPC (self-pinned to
      // auth.uid()). Re-hydrate currentUser from the DB. Errors propagate.
      const fresh = await setWorkerAvailabilityBackend(isAvailable, availableFrom);
      if (fresh) setCurrentUser(fresh);
      return;
    }
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
    async (workerId, patch) => {
      if (isBackendEnabled()) {
        // update_own_worker_profile RPC + avatar / certificate uploads, then
        // rebuild currentUser from the authoritative post-write state.
        const fresh = await updateWorkerProfileBackend(patch);
        if (fresh) setCurrentUser(fresh);
        return;
      }
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
  >(async (contractorId, patch) => {
    if (isBackendEnabled()) {
      const fresh = await updateContractorProfileBackend(patch);
      if (fresh) setCurrentUser(fresh);
      return;
    }
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
    async (contractorId, registrationNumber, _adminId) => {
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

      if (isBackendEnabled()) {
        // admin-user-action Edge Function -> admin_set_contractor_registration_number
        // (server re-checks live-admin, writes the guarded column, notifies the
        // contractor in one transaction; a duplicate number throws).
        await adminUserService.setContractorRegistrationNumber(contractorId, next);
        await refreshUserDirectory();
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
    [contractors, pushNotification, refreshUserDirectory]
  );

  // ---------------------------------------------------------------------
  // Messaging
  // ---------------------------------------------------------------------

  const getOrCreateConversation = useCallback<
    AppState['getOrCreateConversation']
  >(
    async (currentUserId, otherUserId) => {
      if (isBackendEnabled()) {
        // Server is the authority for conversation identity/ownership — one
        // atomic RPC, race-safe on the pair_key unique index.
        const conv = await chatService.getOrCreateDirectConversation(otherUserId);
        setConversations((prev) => {
          const rest = prev.filter((c) => c.id !== conv.id);
          const old = prev.find((c) => c.id === conv.id);
          // Keep any messages already hydrated for this thread, and DON'T let
          // get-or-create (which always reports 0) fabricate a read state —
          // preserve the real unread count; ChatScreen marks it read on open.
          return [
            old
              ? { ...conv, messages: old.messages, unreadCount: old.unreadCount }
              : conv,
            ...rest,
          ];
        });
        return conv;
      }

      const existing = findConversation(conversations, currentUserId, otherUserId);
      if (existing) return existing;

      const fresh = buildConversation({ currentUserId, otherUserId });
      setConversations((prev) => [fresh, ...prev]);
      return fresh;
    },
    [conversations]
  );

  const sendMessage = useCallback<AppState['sendMessage']>(
    async (conversationId, senderId, text) => {
      if (isBackendEnabled()) {
        // RPC sets sender_id = auth.uid() + created_at, trims + validates the
        // body, and requires the caller to be an approved participant.
        const message = await chatService.sendMessage(conversationId, text);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: mergeMessages(c.messages, [message]),
                  lastMessage: message.content,
                  lastMessageAt: message.timestamp,
                  updatedAt: message.timestamp,
                }
              : c
          )
        );
        return message;
      }

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
    [conversations, mergeMessages]
  );

  // ---------------------------------------------------------------------
  // Support
  // ---------------------------------------------------------------------

  const openSupportTicket = useCallback<AppState['openSupportTicket']>(
    async (userId, userRole, type, subject, description) => {
      const subj = subject.trim();
      const desc = description.trim();

      if (isBackendEnabled()) {
        // create_support_ticket derives user_id/user_role/status server-side and
        // notifies every admin in the same transaction. Re-read so the new
        // ticket (with its id) is in `supportTickets` before we return it.
        const id = await supportService.createTicket(type, subj, desc);
        const fresh = await supportService.listMyTickets();
        setSupportTickets(fresh);
        setSupportTicketsLoading(false);
        return (
          fresh.find((t) => t.id === id) ?? {
            id,
            userId,
            userRole,
            type,
            subject: subj,
            description: desc,
            status: 'open' as const,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            messages: [],
          }
        );
      }

      // Mock path (USE_BACKEND=false) — unchanged local behaviour.
      const t: SupportTicket = {
        id: newId('tkt'),
        userId,
        userRole,
        type,
        subject: subj,
        description: desc,
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
          body: `${subj} — ${userRole === 'worker' ? 'עובד' : 'קבלן'}`,
          relatedId: t.id,
        })
      );
      return t;
    },
    [admins, pushNotification]
  );

  const replyToTicket = useCallback<AppState['replyToTicket']>(
    async (ticketId, senderId, senderRole, message, statusChange) => {
      const text = message.trim();
      if (!text) return;
      const isAdmin = senderRole === 'admin';
      const ts = nowIso();

      if (isBackendEnabled()) {
        // reply_to_support_ticket forces sender_role from the caller's real
        // identity, applies `statusChange` for an admin only, guards the closed
        // state, and raises the notification(s) server-side. Re-read after.
        await supportService.replyToTicket(
          ticketId,
          text,
          isAdmin ? statusChange : undefined
        );
        await refreshSupportTickets();
        return;
      }

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
    [supportTickets, admins, pushNotification, refreshSupportTickets]
  );

  const closeSupportTicket = useCallback<AppState['closeSupportTicket']>(
    async (ticketId, adminId) => {
      if (isBackendEnabled()) {
        await supportService.setTicketClosed(ticketId, true);
        await refreshSupportTickets();
        return;
      }
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
    [pushNotification, refreshSupportTickets]
  );

  const reopenSupportTicket = useCallback<AppState['reopenSupportTicket']>(
    async (ticketId, _adminId) => {
      if (isBackendEnabled()) {
        await supportService.setTicketClosed(ticketId, false);
        await refreshSupportTickets();
        return;
      }
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
    [pushNotification, refreshSupportTickets]
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
    async (contractorId, patch) => {
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

      if (isBackendEnabled()) {
        // Client INSERT into contractor_license_update_requests (RLS: own row +
        // is_active_user) + upload to contractor-licenses/{uid}/. Admin
        // notifications come from the DB trigger (020). The one-pending partial
        // unique surfaces as null (already open).
        try {
          const created = await licenseService.submitLicenseUpdate(patch);
          setContractorLicenseRequests((prev) => [created, ...prev]);
          return created;
        } catch (err) {
          if (err instanceof Error && err.message.includes('already pending')) {
            return null;
          }
          throw err;
        }
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
    async (requestId, adminId, approve, reason) => {
      const req = contractorLicenseRequests.find((r) => r.id === requestId);
      if (!req || req.status !== 'pending') return;
      // A rejection must always carry a reason (the UI enforces this too).
      if (!approve && !reason?.trim()) return;

      if (isBackendEnabled()) {
        // review-license-update Edge Function -> review_contractor_license_update
        // (server re-checks live-admin, writes the guarded contractor_profiles
        // licence columns + the contractor notification in one transaction).
        await licenseService.reviewLicenseUpdate(requestId, approve, reason);
        await Promise.all([refreshLicenseRequests(), refreshUserDirectory()]);
        return;
      }

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
    [contractorLicenseRequests, pushNotification, refreshLicenseRequests, refreshUserDirectory]
  );

  const verifyContractorLicense = useCallback<
    AppState['verifyContractorLicense']
  >(
    async (contractorId, _adminId) => {
      if (isBackendEnabled()) {
        await licenseService.verifyContractorLicense(contractorId);
        await refreshUserDirectory();
        return;
      }
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
    [refreshUserDirectory]
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
    async (contractorId, _adminId) => {
      const c = contractors.find((x) => x.id === contractorId);
      if (!c) return;
      const st = getContractorLicenseStatus(c);
      // Only meaningful for a validity problem — never for a periodic review.
      if (st.state !== 'expiring_soon' && st.state !== 'expired') return;

      if (isBackendEnabled()) {
        // review-license-update -> request_contractor_license_renewal
        // (notification only; deduped server-side per contractor+validUntil).
        await licenseService.requestLicenseRenewal(contractorId);
        return;
      }

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
      // Optimistic; then persist is_read (RLS allows only that column).
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      if (isBackendEnabled()) {
        void notificationService.markNotificationRead(id).catch(() => {});
      }
    },
    []
  );

  const markAllNotificationsRead = useCallback<
    AppState['markAllNotificationsRead']
  >((userId) => {
    setNotifications((prev) =>
      prev.map((n) => (n.userId === userId ? { ...n, isRead: true } : n))
    );
    if (isBackendEnabled()) {
      void notificationService.markAllNotificationsRead().catch(() => {});
    }
  }, []);

  const userHasIdOnFile = useCallback<AppState['userHasIdOnFile']>(
    (userId) => idOnFile.has(userId),
    [idOnFile]
  );

  const revealUserIdNumber = useCallback<AppState['revealUserIdNumber']>(
    (userId) => adminUserService.revealUserIdNumber(userId),
    []
  );

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
      beginPasswordRecovery,
      clearPasswordRecovery,
      jobSearchState,
      updateJobSearchState,
      jobsLoading,
      jobsError,
      applicationsLoading,
      refreshJobs,
      refreshInvitations,
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
      supportTicketsLoading,
      refreshSupportTickets,
      contractorLicenseRequests,

      loginAsCustomer,
      loginAsAdmin,
      logout,

      submitWorkerRegistration,
      submitContractorRegistration,
      getRegistration,
      refreshRegistrations,

      approveRegistration,
      rejectRegistration,
      revertRegistrationRejection,
      blockUser,
      unblockUser,
      userHasIdOnFile,
      revealUserIdNumber,

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
      refreshConversations,
      hydrateConversationMessages,
      markConversationRead,
      setActiveConversation,
      markChatNotificationsRead,

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

      refreshNotifications,
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
      beginPasswordRecovery,
      clearPasswordRecovery,
      jobSearchState,
      updateJobSearchState,
      jobsLoading,
      jobsError,
      applicationsLoading,
      refreshJobs,
      refreshInvitations,
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
      supportTicketsLoading,
      refreshSupportTickets,
      contractorLicenseRequests,
      loginAsCustomer,
      loginAsAdmin,
      logout,
      submitWorkerRegistration,
      submitContractorRegistration,
      getRegistration,
      refreshRegistrations,
      approveRegistration,
      rejectRegistration,
      revertRegistrationRejection,
      blockUser,
      unblockUser,
      userHasIdOnFile,
      revealUserIdNumber,
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
      refreshConversations,
      hydrateConversationMessages,
      markConversationRead,
      setActiveConversation,
      markChatNotificationsRead,
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
      refreshNotifications,
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
