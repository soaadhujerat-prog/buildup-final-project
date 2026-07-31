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
  Conversation,
  AppNotification,
  SupportTicket,
  SupportTicketType,
  ProfessionCategory,
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

  conversations: Conversation[];
  notifications: AppNotification[];
  supportTickets: SupportTicket[];

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

  // Applications (worker -> job)
  applyToJob: (jobId: string, workerId: string, message?: string) => Application;
  respondToApplication: (
    applicationId: string,
    accepted: boolean,
    response?: string
  ) => void;

  // Invitations (contractor -> worker)
  sendInvitation: (
    jobId: string,
    contractorId: string,
    workerId: string,
    message?: string
  ) => Invitation;
  respondToInvitation: (
    invitationId: string,
    accepted: boolean
  ) => void;

  // Worker profile edits
  setWorkerAvailability: (workerId: string, isAvailable: boolean) => void;
  updateWorkerProfile: (workerId: string, patch: Partial<Worker>) => void;
  updateContractorProfile: (
    contractorId: string,
    patch: Partial<Contractor>
  ) => void;

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

  const [admins] = useState<Admin[]>(MOCK_ADMINS);
  const [workers, setWorkers] = useState<Worker[]>(MOCK_WORKERS);
  const [contractors, setContractors] = useState<Contractor[]>(MOCK_CONTRACTORS);
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>(
    MOCK_REGISTRATIONS
  );

  const [jobs, setJobs] = useState<JobPost[]>(MOCK_JOBS);
  const [applications, setApplications] = useState<Application[]>(MOCK_APPLICATIONS);
  const [invitations, setInvitations] = useState<Invitation[]>(MOCK_INVITATIONS);

  const [conversations] = useState<Conversation[]>(MOCK_CONVERSATIONS);
  const [notifications, setNotifications] =
    useState<AppNotification[]>(MOCK_NOTIFICATIONS);
  const [supportTickets, setSupportTickets] =
    useState<SupportTicket[]>(MOCK_SUPPORT_TICKETS);

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

      // 2) Try to match an approved contractor by ID OR registration number.
      const contractor = contractors.find(
        (c) => c.idNumber === id || c.contractorRegistrationNumber === id
      );
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
        return d.idNumber === id || d.contractorRegistrationNumber === id;
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

  const logout = useCallback(() => setCurrentUser(null), []);

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
          rating: undefined,
          reviewCount: 0,
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
          rating: undefined,
          reviewCount: 0,
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

  const setJobAcceptingApplications = useCallback<
    AppState['setJobAcceptingApplications']
  >((jobId, accepting) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, acceptingApplications: accepting } : j
      )
    );
  }, []);

  // ---------------------------------------------------------------------
  // Applications
  // ---------------------------------------------------------------------

  const applyToJob = useCallback<AppState['applyToJob']>(
    (jobId, workerId, message) => {
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
    [jobs, workers, pushNotification]
  );

  const respondToApplication = useCallback<AppState['respondToApplication']>(
    (applicationId, accepted, response) => {
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
        const job = jobs.find((j) => j.id === targetApp!.jobId);
        pushNotification({
          userId: targetApp.workerId,
          type: accepted ? 'application_accepted' : 'application_rejected',
          title: accepted ? 'הבקשה שלך אושרה' : 'הבקשה שלך נדחתה',
          body: job
            ? `בקשתך למשרה "${job.title}" ${accepted ? 'אושרה' : 'נדחתה'}`
            : `בקשתך ${accepted ? 'אושרה' : 'נדחתה'}`,
          relatedId: applicationId,
        });
      }
    },
    [jobs, pushNotification]
  );

  // ---------------------------------------------------------------------
  // Invitations
  // ---------------------------------------------------------------------

  const sendInvitation = useCallback<AppState['sendInvitation']>(
    (jobId, contractorId, workerId, message) => {
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
    [jobs, contractors, pushNotification]
  );

  const respondToInvitation = useCallback<AppState['respondToInvitation']>(
    (invitationId, accepted) => {
      let target: Invitation | undefined;
      setInvitations((prev) =>
        prev.map((i) => {
          if (i.id !== invitationId) return i;
          target = {
            ...i,
            status: accepted ? 'accepted' : 'declined',
            respondedAt: nowIso(),
          };
          return target;
        })
      );
      if (target) {
        const worker = workers.find((w) => w.id === target!.workerId);
        pushNotification({
          userId: target.contractorId,
          type: accepted ? 'invitation_accepted' : 'invitation_declined',
          title: accepted ? 'הזמנתך אושרה' : 'הזמנתך נדחתה',
          body: worker
            ? `${worker.fullName} ${accepted ? 'אישר' : 'דחה'} את ההזמנה`
            : 'התקבלה תגובה להזמנה',
          relatedId: invitationId,
        });
      }
    },
    [workers, pushNotification]
  );

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
      admins,
      workers,
      contractors,
      registrations,
      jobs,
      applications,
      invitations,
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
      setJobAcceptingApplications,
      applyToJob,
      respondToApplication,
      sendInvitation,
      respondToInvitation,

      setWorkerAvailability,
      updateWorkerProfile,
      updateContractorProfile,

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
      getNotificationsForUser,
      getTicketsForUser,
    }),
    [
      currentUser,
      admins,
      workers,
      contractors,
      registrations,
      jobs,
      applications,
      invitations,
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
      setJobAcceptingApplications,
      applyToJob,
      respondToApplication,
      sendInvitation,
      respondToInvitation,
      setWorkerAvailability,
      updateWorkerProfile,
      updateContractorProfile,
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
