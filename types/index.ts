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
  // Derived value — computed from the Assignment collection in context.
  // No `rating`/`reviewCount` on either Worker or Contractor: the app has
  // no real review mechanism for users, so it must never show a
  // fabricated number.
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
}

export type Customer = Worker | Contractor;

// ---------------------------------------------------------------------------
// Uploaded documents (frontend-only local file references)
// ---------------------------------------------------------------------------

/** A single locally-picked file (camera, gallery or document picker).
 *  Referenced by URI only — the app never inlines file content (no base64)
 *  into state, mock data, or source code. `uri` is a stand-in for a future
 *  Supabase Storage `storagePath` / signed URL once a real backend exists;
 *  every consumer should treat it as an opaque reference, not assume it's
 *  a permanent or shareable link. */
export interface UploadedDocument {
  uri: string;
  fileName: string;
  mimeType?: string;
  size?: number;
  type: 'id_card';
}

// ---------------------------------------------------------------------------
// Registration (pre-approval pipeline)
// ---------------------------------------------------------------------------

export interface WorkerRegistrationData {
  fullName: string;
  idNumber: string;
  idDocument?: UploadedDocument;
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
  idDocument?: UploadedDocument;
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
  // Structured as discrete city/address fields on purpose (not one free-text
  // "location" string) so a future latitude/longitude/placeId (Google
  // Places) addition can slot in alongside them without reshaping the model.
  startDate: string;
  endDate?: string;
  duration: string;
  /** Two separate, independent rate fields — never a single `rate` +
   *  `rateType` pair. A job must have at least one of the two; both may be
   *  set at once (e.g. hourly for short call-outs, daily for the main
   *  scope). Kept optional (not defaulted to 0) so "not set" is never
   *  confused with "free". */
  hourlyRate?: number;
  dailyRate?: number;
  workersNeeded: number;
  requiredCertifications: string[];
  requirements: string[];
  status: JobStatus;
  urgent: boolean;
  postedAt: string;
  /** Set only once the job has actually been edited after its original
   *  posting — undefined means "never edited". postedAt itself never
   *  changes after creation. */
  updatedAt?: string;
  /** Local file URIs for now (picked via expo-image-picker) — a future
   *  Supabase Storage migration swaps these for storage paths/URLs without
   *  changing how any screen reads this field. Max 5, enforced in the UI. */
  worksiteImages?: string[];
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
// Favorite workers (contractor -> worker, personal to each contractor)
// ---------------------------------------------------------------------------

/** A contractor bookmarking a worker for quick recall later. This is NOT a
 *  property of Worker (no `worker.isFavorite`) — favoriting is per-contractor,
 *  so the same worker can be a favorite for Contractor A and not for
 *  Contractor B. Shaped to drop straight into a future Supabase table:
 *  contractor_favorite_workers(contractor_id, worker_id, created_at). */
export interface ContractorFavoriteWorker {
  id: string;
  contractorId: string;
  workerId: string;
  createdAt: string;
}

/** The mirror relationship: a worker bookmarking a contractor they'd like
 *  to work with again / follow. Personal to each worker — never a property
 *  of Contractor (no `contractor.isFavorite`). Shaped to drop straight into
 *  a future Supabase table: worker_favorite_contractors(worker_id,
 *  contractor_id, created_at). */
export interface WorkerFavoriteContractor {
  id: string;
  workerId: string;
  contractorId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Assignments (real staffing — a worker actually confirmed onto a job)
// ---------------------------------------------------------------------------

export type AssignmentSource = 'application' | 'invitation';
export type AssignmentStatus = 'active' | 'completed' | 'cancelled';

/** Created the moment a contractor accepts a worker's application, or a
 *  worker accepts a contractor's invitation. This is the single source of
 *  truth for "who is actually staffed on this job" — never derive staffing
 *  counts from Application/Invitation counts directly. */
export interface Assignment {
  id: string;
  jobId: string;
  contractorId: string;
  workerId: string;
  source: AssignmentSource;
  sourceId?: string; // the Application or Invitation id that created this
  status: AssignmentStatus;
  createdAt: string;
  updatedAt: string;
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

/** A conversation is identified purely by its two participants — like
 *  WhatsApp, exactly one conversation ever exists per pair, no matter which
 *  screen (worker profile, staffing, job details, ...) opened it. There is
 *  no job scoping: a contractor and a worker share a single thread across
 *  every job they ever discuss. Every screen resolves "who's the other
 *  person" at render time relative to whoever is currently logged in
 *  (`participantIds.find(id => id !== currentUser.id)`), so the same
 *  conversation displays correctly for both sides. */
export interface Conversation {
  id: string;
  participantIds: string[];
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

/** Shape of the original hand-written mock conversations, kept only so
 *  `normalizeConversation` (services/conversationService.ts) can convert old
 *  records to the real `Conversation` shape at load time without losing any
 *  data. Nothing in the app should read this shape directly. */
export interface LegacyConversationRecord {
  id: string;
  participantId?: string;
  participantIds?: string[];
  lastMessage: string;
  lastMessageTime?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  messages: Message[];
  createdAt?: string;
  updatedAt?: string;
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
