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
  ProfessionCategory,
  ContractorFavoriteWorker,
  WorkerFavoriteContractor,
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

import { JobFilters, DEFAULT_JOB_FILTERS } from '../components/JobFilterBottomSheet';
import { JobSortOption } from '../components/JobSortBottomSheet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionUser = Admin | Worker | Contractor | null;

export interface LoginResult {
  ok: boolean;
  user?: SessionUser;
  status?: CustomerStatus;         // if registration record matched
  registration?: RegistrationRecord;
  reason?: 'not_found' | 'wrong_password' | 'pending' | 'rejected' | 'blocked';
}

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

  // Worker job-search state — persists across navigation (see JobSearchState).
  jobSearchState: JobSearchState;
  updateJobSearchState: (patch: Partial<JobSearchState>) => void;

  // Auth
  loginAsCustomer: (identifier: string, password: string) => LoginResult;
  loginAsAdmin: (identifier: string, password: string) => LoginResult;
  logout: () => void;

  // Registration
  submitWorkerRegistration: (data: WorkerRegistrationData) => RegistrationRecord;
  submitContractorRegistration: (
    data: ContractorRegistrationData
  ) => RegistrationRecord;
  getRegistration: (id: string) => RegistrationRecord | undefined;

  // Admin actions
  approveRegistration: (registrationId: string, adminId: string) => void;
  rejectRegistration: (
    registrationId: string,
    adminId: string,
    reason: string
  ) => void;
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
  respondToTicket: (
    ticketId: string,
    adminId: string,
    response: string,
    newStatus: SupportTicket['status']
  ) => void;

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

/** Password check for the prototype. We don't store hashes — any non-empty
 *  password matches an approved customer. Empty string => fail. */
const passwordOk = (pwd: string) => pwd.trim().length > 0;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<SessionUser>(null);
  const [jobSearchState, setJobSearchState] = useState<JobSearchState>(
    DEFAULT_JOB_SEARCH_STATE
  );

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
  const [supportTickets, setSupportTickets] =
    useState<SupportTicket[]>(MOCK_SUPPORT_TICKETS);

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
      setNotifications((prev) => [fresh, ...prev]);
    },
    []
  );

  // ---------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------

  const loginAsCustomer = useCallback<AppState['loginAsCustomer']>(
    (identifier, password) => {
      const id = identifier.trim();
      if (!id) return { ok: false, reason: 'not_found' };
      if (!passwordOk(password)) return { ok: false, reason: 'wrong_password' };

      // 1) Try to match an approved worker by ID number.
      const worker = workers.find((w) => w.idNumber === id);
      if (worker) {
        if (worker.status === 'blocked') {
          return { ok: false, status: 'blocked', reason: 'blocked' };
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
          return { ok: false, status: 'blocked', reason: 'blocked' };
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
    (identifier, password) => {
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
    setCurrentUser(null);
    setJobSearchState(DEFAULT_JOB_SEARCH_STATE);
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
    (registrationId, adminId) => {
      const reg = registrations.find((r) => r.id === registrationId);
      if (!reg || reg.status !== 'pending') return;

      // 1) flip registration to approved
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === registrationId
            ? {
                ...r,
                status: 'approved',
                processedAt: nowIso(),
                processedBy: adminId,
              }
            : r
        )
      );

      // 2) materialise the customer object in the correct pool
      if (reg.role === 'worker') {
        const d = reg.data as WorkerRegistrationData;
        const worker: Worker = {
          id: newId('w'),
          idNumber: d.idNumber,
          fullName: d.fullName,
          phone: d.phone,
          email: d.email,
          role: 'worker',
          status: 'approved',
          createdAt: nowIso(),
          city: d.city,
          profession: d.profession,
          professionCategory: d.professionCategory,
          skills: d.skills,
          certifications: d.certifications,
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
          title: 'הרישום שלך אושר',
          body: 'ברוך הבא ל-BuildUp! הפרופיל שלך פעיל, אפשר להתחיל לחפש עבודה.',
          relatedId: worker.id,
        });
      } else {
        const d = reg.data as ContractorRegistrationData;
        const contractor: Contractor = {
          id: newId('c'),
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
          areaOfOperation: d.areaOfOperation,
          projectTypes: d.projectTypes,
          licenseDetails: d.licenseDetails,
          bio: d.bio,
        };
        setContractors((prev) => [...prev, contractor]);
        pushNotification({
          userId: contractor.id,
          type: 'registration_approved',
          title: 'הרישום שלך אושר',
          body: 'ברוך הבא ל-BuildUp! ניתן לפרסם משרות חדשות.',
          relatedId: contractor.id,
        });
      }
    },
    [registrations, pushNotification]
  );

  const rejectRegistration = useCallback<AppState['rejectRegistration']>(
    (registrationId, adminId, reason) => {
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === registrationId
            ? {
                ...r,
                status: 'rejected',
                processedAt: nowIso(),
                processedBy: adminId,
                rejectionReason: reason,
              }
            : r
        )
      );
      const reg = registrations.find((r) => r.id === registrationId);
      if (reg) {
        // note: rejected users don't have a Customer object yet, so we just
        // attach the notification to the registration id as a placeholder.
        pushNotification({
          userId: reg.id,
          type: 'registration_rejected',
          title: 'הרישום נדחה',
          body: reason,
          relatedId: reg.id,
        });
      }
    },
    [registrations, pushNotification]
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
      // Duplicate prevention looks only at *active* applications
      // (pending / accepted). A historical withdrawn/rejected record for
      // the same worker+job must never block a fresh application.
      const activeDupe = applications.find(
        (a) =>
          a.jobId === jobId &&
          a.workerId === workerId &&
          (a.status === 'pending' || a.status === 'accepted')
      );
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
    [applications, jobs, workers, pushNotification]
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
            ? { ...i, status: 'cancelled', cancelledAt: nowIso() }
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

  const respondToTicket = useCallback<AppState['respondToTicket']>(
    (ticketId, adminId, response, newStatus) => {
      let target: SupportTicket | undefined;
      setSupportTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId) return t;
          target = {
            ...t,
            adminResponse: response,
            assignedAdminId: adminId,
            status: newStatus,
            updatedAt: nowIso(),
            resolvedAt: newStatus === 'resolved' ? nowIso() : t.resolvedAt,
          };
          return target;
        })
      );
      if (target) {
        pushNotification({
          userId: target.userId,
          type: 'support_response',
          title: 'תגובה לפנייה שלך',
          body: response.slice(0, 80),
          relatedId: ticketId,
        });
      }
    },
    [pushNotification]
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

      loginAsCustomer,
      loginAsAdmin,
      logout,

      submitWorkerRegistration,
      submitContractorRegistration,
      getRegistration,

      approveRegistration,
      rejectRegistration,
      blockUser,
      unblockUser,

      postJob,
      updateJob,
      setJobAcceptingApplications,
      applyToJob,
      respondToApplication,
      withdrawApplication,
      sendInvitation,
      respondToInvitation,
      cancelInvitation,
      cancelAssignment,

      toggleFavoriteWorker,
      isFavoriteWorker,
      getFavoriteWorkerIds,

      toggleFavoriteContractor,
      isFavoriteContractor,
      getFavoriteContractorIds,

      setWorkerAvailability,
      updateWorkerProfile,
      updateContractorProfile,

      getOrCreateConversation,
      sendMessage,

      openSupportTicket,
      respondToTicket,

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
      loginAsCustomer,
      loginAsAdmin,
      logout,
      submitWorkerRegistration,
      submitContractorRegistration,
      getRegistration,
      approveRegistration,
      rejectRegistration,
      blockUser,
      unblockUser,
      postJob,
      updateJob,
      setJobAcceptingApplications,
      applyToJob,
      respondToApplication,
      withdrawApplication,
      sendInvitation,
      respondToInvitation,
      cancelInvitation,
      cancelAssignment,
      toggleFavoriteWorker,
      isFavoriteWorker,
      getFavoriteWorkerIds,
      toggleFavoriteContractor,
      isFavoriteContractor,
      getFavoriteContractorIds,
      setWorkerAvailability,
      updateWorkerProfile,
      updateContractorProfile,
      getOrCreateConversation,
      sendMessage,
      openSupportTicket,
      respondToTicket,
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
