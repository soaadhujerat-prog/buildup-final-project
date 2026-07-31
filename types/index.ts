// =============================================================================
// BuildUp – Domain model (frontend prototype)
// =============================================================================
// Three bodies: Admin, Contractor, Worker. Every screen in the app must derive
// the data it shows from one of the objects declared in this file.
// =============================================================================

export type UserRole = 'admin' | 'contractor' | 'worker';

export type CustomerStatus = 'pending' | 'approved' | 'blocked' | 'rejected';

export type ProfessionCategory =
  | 'בנייה'
  | 'חשמל'
  | 'אינסטלציה'
  | 'גבס ותקרות'
  | 'ריצוף'
  | 'צבע וסיוד'
  | 'מסגרות ואלומיניום'
  | 'עבודות עץ'
  | 'פיגומים'
  | 'הריסה';

// ---------------------------------------------------------------------------
// Users (base + three bodies)
// ---------------------------------------------------------------------------

export interface BaseUser {
  id: string;
  idNumber: string;          // government-style ID, unique per person
  fullName: string;
  phone: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
  status: CustomerStatus;    // admin = always approved
  blockedReason?: string;
  blockedAt?: string;
}

export type AdminPermission =
  | 'approve_registrations'
  | 'reject_registrations'
  | 'block_users'
  | 'unblock_users'
  | 'handle_support';

export interface Admin extends BaseUser {
  role: 'admin';
  permissions: AdminPermission[];
}

export interface Worker extends BaseUser {
  role: 'worker';
  city: string;
  profession: string;
  professionCategory: ProfessionCategory;
  skills: string[];
  certifications: string[];
  experienceYears: number;
  preferredAreas: string[];
  isAvailable: boolean;
  availableFrom?: string;
  hourlyRate: number;
  dailyRate: number;
  bio: string;
  // Derived values — computed from Applications/Reviews collections in context.
  rating?: number;
  reviewCount?: number;
  completedJobsCount?: number;
}

export interface Contractor extends BaseUser {
  role: 'contractor';
  companyName: string;
  contractorRegistrationNumber: string;
  city: string;
  areaOfOperation: string;
  projectTypes: string[];
  licenseDetails: string;
  bio?: string;
  rating?: number;
  reviewCount?: number;
}

export type Customer = Worker | Contractor;

// ---------------------------------------------------------------------------
// Registration (pre-approval pipeline)
// ---------------------------------------------------------------------------

export interface WorkerRegistrationData {
  fullName: string;
  idNumber: string;
  phone: string;
  email: string;
  city: string;
  password: string;
  profession: string;
  professionCategory: ProfessionCategory;
  skills: string[];
  certifications: string[];
  experienceYears: number;
  preferredAreas: string[];
  isAvailable: boolean;
  hourlyRate: number;
  dailyRate: number;
  bio?: string;
}

export interface ContractorRegistrationData {
  fullName: string;
  companyName: string;
  idNumber: string;
  contractorRegistrationNumber: string;
  phone: string;
  email: string;
  city: string;
  areaOfOperation: string;
  projectTypes: string[];
  licenseDetails: string;
  password: string;
  bio?: string;
}

export type RegistrationData = WorkerRegistrationData | ContractorRegistrationData;

export interface RegistrationRecord {
  id: string;
  role: 'worker' | 'contractor';
  status: CustomerStatus;
  submittedAt: string;
  processedAt?: string;
  processedBy?: string;
  rejectionReason?: string;
  externalChecks: {
    idValid?: boolean;
    contractorRegistrationValid?: boolean;
    eligibilityNotes?: string;
  };
  data: RegistrationData;
}

// ---------------------------------------------------------------------------
// Jobs, Applications, Invitations
// ---------------------------------------------------------------------------

export type JobStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export interface JobPost {
  id: string;
  contractorId: string;
  title: string;
  description: string;
  profession: string;
  professionCategory: ProfessionCategory;
  city: string;
  address: string;
  startDate: string;
  endDate?: string;
  duration: string;
  dailyRate: number;
  workersNeeded: number;
  requiredCertifications: string[];
  requirements: string[];
  status: JobStatus;
  urgent: boolean;
  postedAt: string;
  /** When false, workers cannot submit new applications.
   *  Controlled by the contractor from JobDetails. Defaults to true on creation. */
  acceptingApplications: boolean;
}

/** Legacy alias for screens that still import { Job }. */
export type Job = JobPost;

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

/** Worker -> Job. Created by the worker from the AvailableJobs screen. */
export interface Application {
  id: string;
  jobId: string;
  workerId: string;
  message?: string;
  appliedAt: string;
  respondedAt?: string;
  contractorResponse?: string;
  status: ApplicationStatus;
}

/** Legacy alias. */
export type JobRequest = Application;
export type JobRequestStatus = ApplicationStatus;

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

/** Contractor -> Worker. Created from SearchWorkers or SmartMatch. */
export interface Invitation {
  id: string;
  jobId: string;
  contractorId: string;
  workerId: string;
  message?: string;
  sentAt: string;
  respondedAt?: string;
  status: InvitationStatus;
}

// ---------------------------------------------------------------------------
// Smart Match
// ---------------------------------------------------------------------------

export interface MatchReason {
  label: string;
  score: number;
  weight: number;
  icon: string;
}

export interface MatchResult {
  worker: Worker;
  matchScore: number;   // 0..100
  reasons: MatchReason[];
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatar?: string;
  participantProfession?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: Message[];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'job_application'
  | 'application_accepted'
  | 'application_rejected'
  | 'invitation_received'
  | 'invitation_accepted'
  | 'invitation_declined'
  | 'new_message'
  | 'review'
  | 'registration_approved'
  | 'registration_rejected'
  | 'account_blocked'
  | 'account_unblocked'
  | 'support_response'
  | 'new_pending_registration'
  | 'new_support_ticket'
  | 'system'
  // legacy values (back-compat with old mock data)
  | 'job_request'
  | 'job_accepted'
  | 'job_rejected';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  relatedId?: string;
}

export type Notification = AppNotification;

// ---------------------------------------------------------------------------
// Support / complaints / claims
// ---------------------------------------------------------------------------

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportTicketType = 'complaint' | 'claim' | 'question' | 'technical';

export interface SupportTicket {
  id: string;
  userId: string;
  userRole: 'worker' | 'contractor';
  type: SupportTicketType;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  assignedAdminId?: string;
  adminResponse?: string;
  resolvedAt?: string;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export interface FilterOptions {
  profession?: string;
  city?: string;
  minRating?: number;
  maxDailyRate?: number;
  isAvailableNow?: boolean;
  minExperience?: number;
}

export type RootStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  UserTypeSelection: undefined;
  Login: { role: UserRole };
  SignUp: { role: 'worker' | 'contractor' };
  RegistrationPending: { registrationId: string };
  RegistrationRejected: { registrationId: string };
  AccountBlocked: { userId: string };
  MainTabs: { role: UserRole };
  AdminMain: undefined;
};
