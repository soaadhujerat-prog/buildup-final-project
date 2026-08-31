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
  /**
   * Government-style ID number, unique per person.
   *
   * OPTIONAL (Phase 2): a Supabase-backed `SessionUser` never carries a
   * plaintext ID — the backend stores it only as a server-side HMAC on
   * `user_identity` (Phase 1 decision #1) and never returns it to the client.
   * The mock data + mock login path still populate and match on it, so nothing
   * changes when `EXPO_PUBLIC_USE_BACKEND=false`. UI that shows this value must
   * tolerate `undefined` (e.g. `value={user.idNumber ?? ''}`).
   */
  idNumber?: string;
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
  /** @deprecated Legacy single-profession field. Source of truth is
   *  `professions` (a worker can practise several specific trades). Kept —
   *  and always normalized to mirror `professions[0]` — so the many list
   *  rows / cards that show one profession keep working unchanged. */
  profession: string;
  /** The worker's specific trades, e.g. ['בנאי', 'ברזלן', 'טפסן']. Always
   *  non-empty after normalization; `profession` mirrors index 0. Filters
   *  that look for a profession check membership here. */
  professions: string[];
  professionCategory: ProfessionCategory;
  skills: string[];
  certifications: Certification[];
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
  /** @deprecated Legacy single-area field. Source of truth is
   *  `areasOfOperation` (a contractor can operate in several regions). Kept
   *  optional only so any old record still type-checks; always normalized to
   *  mirror `areasOfOperation[0]`. */
  areaOfOperation?: string;
  /** The regions the contractor operates in, e.g. ['מרכז', 'שרון']. Always
   *  non-empty after normalization. */
  areasOfOperation: string[];
  projectTypes: string[];
  /** Contractor classification / licence text, e.g. "ק100 – בניה 2". This is
   *  a verified field: on the contractor's own edit screen it is read-only,
   *  and any change goes through a ContractorLicenseUpdateRequest that an
   *  admin reviews (see 3.5–3.7). */
  licenseDetails: string;
  bio?: string;

  // ---- Contractor licence (live source of truth for the ACTIVE licence) ----
  // A contractor is only really a contractor if a licence document exists and
  // an admin has verified it. These fields hold the CURRENT approved licence;
  // a not-yet-approved replacement lives on a ContractorLicenseUpdateRequest,
  // never here, so the approved document is never overwritten while a new one
  // is under review. All dates are ISO strings, rendered via formatDate().
  /** The current APPROVED licence document. */
  contractorLicenseDocument?: UploadedDocument;
  licenseValidFrom?: string;
  licenseValidUntil?: string;
  licenseVerificationStatus?: ContractorLicenseVerificationStatus;
  /** When an admin last verified the current licence. */
  licenseLastVerifiedAt?: string;
  /** When the licence is next due for a periodic review. A backend scheduler
   *  will drive reminders off this; the frontend only derives "review due"
   *  from it (isLicenseReviewDue). */
  licenseNextReviewAt?: string;
}

/** UI-level verification state of a contractor's licence.
 *  - verified          — an admin approved the current document; in force.
 *  - pending_review    — a document exists but has not been verified yet
 *                        (e.g. straight after registration approval).
 *  - renewal_required  — verified but the periodic review date has passed.
 *  - expired           — licenseValidUntil is in the past.
 *  - rejected          — the last update request was rejected; the previously
 *                        approved document (if any) stays current. */
export type ContractorLicenseVerificationStatus =
  | 'verified'
  | 'pending_review'
  | 'renewal_required'
  | 'expired'
  | 'rejected';

/** A contractor-initiated request to change a VERIFIED licence detail — the
 *  document, the classification text, and/or (future) the registration
 *  number. One request can carry several proposed changes so a contractor
 *  updating "number + document" together is one review, not two conflicting
 *  ones. The approved licence on the Contractor is untouched until an admin
 *  approves this request. Never deleted — rejected requests stay as history.
 *  Shaped to drop into a future `contractor_license_update_requests` table. */
export interface ContractorLicenseUpdateRequest {
  id: string;
  contractorId: string;
  newRegistrationNumber?: string;
  newLicenseDetails?: string;
  newLicenseDocument?: UploadedDocument;
  proposedValidFrom?: string;
  proposedValidUntil?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
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
  type: 'id_card' | 'certification' | 'contractor_license';
}

/** A named professional certificate the worker holds, with an optional
 *  scan/photo of the certificate itself. The document belongs to THIS
 *  certification — never a loose array detached from the names. Frontend
 *  keeps only the local URI + metadata (see UploadedDocument); a real
 *  backend uploads it to Storage later. */
export interface Certification {
  id?: string;
  name: string;
  document?: UploadedDocument;
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
  /** @deprecated mirror of `professions[0]` — see Worker.profession. */
  profession: string;
  professions: string[];
  professionCategory: ProfessionCategory;
  skills: string[];
  certifications: Certification[];
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
  /** @deprecated mirror of `areasOfOperation[0]` — see Contractor.areaOfOperation. */
  areaOfOperation?: string;
  areasOfOperation: string[];
  projectTypes: string[];
  licenseDetails: string;
  /** The contractor's licence / certificate document, attached at sign-up.
   *  A separate document from idDocument and from the company logo/avatar.
   *  Part of the immutable registration snapshot. */
  licenseDocument?: UploadedDocument;
  /** "בתוקף עד" — the expiry date PRINTED ON the licence document, entered by
   *  the contractor at sign-up. ISO string. The system never derives this. */
  licenseValidUntil?: string;
  password: string;
  bio?: string;
}

export type RegistrationData = WorkerRegistrationData | ContractorRegistrationData;

/** One immutable entry in a registration's status audit trail. A registration
 *  is NEVER deleted and its status is NEVER silently overwritten — every
 *  admin decision (approve / reject / re-open a rejected request) appends one
 *  of these, so the full history "pending → rejected → pending → approved"
 *  stays visible. `reason` carries the rejection text, `message` the optional
 *  approval note. */
export interface RegistrationStatusEvent {
  id: string;
  registrationId: string;
  fromStatus: CustomerStatus;
  toStatus: CustomerStatus;
  reason?: string;
  message?: string;
  createdAt: string;
  actorId?: string;
}

export interface RegistrationRecord {
  id: string;
  role: 'worker' | 'contractor';
  status: CustomerStatus;
  submittedAt: string;
  processedAt?: string;
  processedBy?: string;
  rejectionReason?: string;
  /** Stamped when the request was last moved to 'rejected'. Mirror of the
   *  matching statusHistory entry's createdAt — kept for quick display. */
  rejectedAt?: string;
  /** Stamped when the request was moved to 'approved'. */
  approvedAt?: string;
  /** Optional free-text note the admin attached when approving — shown to the
   *  new user in their "registration approved" notification. */
  approvalMessage?: string;
  /** The id of the Worker/Contractor that was materialised from this
   *  registration on approval. The one reliable link between a historical
   *  registration snapshot and the live user object — never a duplicated
   *  user, just a foreign key. Undefined until (and unless) approved. */
  createdUserId?: string;
  /** Append-only audit trail — see RegistrationStatusEvent. */
  statusHistory?: RegistrationStatusEvent[];
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
  /** @deprecated Legacy single-profession field. Source of truth is
   *  `professions` (a job may call for several specific trades). Kept — and
   *  always normalized to mirror `professions[0]` — so the many list rows /
   *  cards / matchers that read one profession keep working unchanged. Read
   *  through `jobProfessions()` / `jobPrimaryProfession()` in utils/normalize. */
  profession: string;
  /** The specific trades this job calls for, e.g. ['חשמלאי', 'חשמלאי מוסמך'].
   *  Non-empty after normalization; `profession` mirrors index 0. Filters /
   *  Smart Match check membership here via `jobHasProfession()`. Optional only
   *  so pre-change records still type-check. */
  professions?: string[];
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
   *  Controlled by the contractor from JobDetails. Defaults to true on creation.
   *  Also flipped automatically by AppContext when staffing capacity is
   *  reached / freed — see registrationClosureReason. */
  acceptingApplications: boolean;
  /** Why the job is currently closed to new registrations. Only meaningful
   *  while acceptingApplications === false:
   *   - 'manual'   — the contractor pressed "סגור משרה להרשמה". Stays closed
   *                  even if staffing later drops below workersNeeded.
   *   - 'capacity' — the system auto-closed it because active assignments
   *                  reached workersNeeded. Auto-reopens if an assignment is
   *                  later removed and capacity frees up.
   *  Undefined whenever the job is open. */
  registrationClosureReason?: 'manual' | 'capacity';
}

/** Legacy alias for screens that still import { Job }. */
export type Job = JobPost;

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

/** Worker -> Job. Created by the worker from the AvailableJobs screen.
 *  A record is NEVER deleted — a worker who changes their mind moves the
 *  application to `withdrawn` (keeping full history). `appliedAt` is the
 *  "sent" timestamp; `respondedAt` covers both accept and reject (the
 *  `status` disambiguates which); `withdrawnAt` is stamped only when the
 *  worker pulls the application back. All are ISO strings, rendered via
 *  formatDateTime(). */
export interface Application {
  id: string;
  jobId: string;
  workerId: string;
  message?: string;
  appliedAt: string;
  respondedAt?: string;
  withdrawnAt?: string;
  /** The contractor's optional free-text note attached when they accept or
   *  reject the application (one field for both — the `status` says which
   *  decision it belongs to). Shown to the worker as "הודעת הקבלן". This is
   *  the single "response message" field; do not add accept/reject-specific
   *  variants. */
  contractorResponse?: string;
  status: ApplicationStatus;
}

/** Legacy alias. */
export type JobRequest = Application;
export type JobRequestStatus = ApplicationStatus;

export type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled';

// (Invitation.responseMessage — the worker's optional note when accepting or
// declining — is declared on the Invitation interface below.)

/** Contractor -> Worker. Created from SearchWorkers or SmartMatch.
 *  Like Application, a record is NEVER deleted — a contractor who changes
 *  their mind about a still-`pending` invitation moves it to `cancelled`
 *  (keeping history). `sentAt` is the "sent" timestamp; `respondedAt`
 *  covers both accept and decline (the `status` disambiguates); `cancelledAt`
 *  is stamped only when the contractor withdraws the invitation. All ISO
 *  strings, rendered via formatDateTime(). */
export interface Invitation {
  id: string;
  jobId: string;
  contractorId: string;
  workerId: string;
  message?: string;
  sentAt: string;
  respondedAt?: string;
  cancelledAt?: string;
  /** Why a still-`pending` invitation was moved to `cancelled`:
   *  - 'manual'        — the contractor withdrew it themselves.
   *  - 'capacity_full' — the job reached workersNeeded, so the system
   *                      auto-closed every outstanding invitation for it.
   *  Only meaningful when status === 'cancelled'. */
  cancellationReason?: 'manual' | 'capacity_full';
  /** The worker's optional free-text note attached when they accept or
   *  decline the invitation (mirror of Application.contractorResponse — one
   *  field for both decisions). Shown to the contractor as "הודעת העובד". */
  responseMessage?: string;
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
 *  counts from Application/Invitation counts directly.
 *
 *  Cancelling a *staffed* worker changes THIS record's status to 'cancelled'
 *  (never delete it, never touch the Application/Invitation that produced it —
 *  that acceptance really happened and stays `accepted` in history). The
 *  Application/Invitation is "how the worker got here"; the Assignment is
 *  "are they on the job right now". */
export interface Assignment {
  id: string;
  jobId: string;
  contractorId: string;
  workerId: string;
  source: AssignmentSource;
  sourceId?: string; // the Application or Invitation id that created this
  status: AssignmentStatus;
  /** Real timestamp the staffing slot was created (contractor accepted an
   *  application / worker accepted an invitation). THE source of truth for
   *  "שובץ ב-..." — never fall back to the application/invitation date once an
   *  Assignment exists. */
  createdAt: string;
  updatedAt: string;
  /** Set only when the worker FINISHED their part normally (status became
   *  'completed'). A completed assignment still holds its slot — it is not a
   *  cancellation and never frees a place for a new worker. */
  completedAt?: string;
  /** Set only when status became 'cancelled'. */
  cancelledAt?: string;
  cancelledBy?: 'worker' | 'contractor';
  cancellationMessage?: string;
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
// Smart Match — backend-ready result shape (contractor picks a job, the
// system ranks workers). The SmartMatch SCREEN renders ONLY this shape.
//
// Today it is produced locally by services/smartMatchService.ts from real
// Worker / JobPost / Assignment fields. Later the identical shape will be
// returned by a Supabase Edge Function (`smart-match`) that runs the
// weighted 100-point algorithm plus an OpenAI semantic pass — the UI does
// not change when that swap happens. `MatchResult` above stays as the old
// contractor matcher; this type is the one Smart Match uses.
// ---------------------------------------------------------------------------

/** Band of `matchPercent`, mapped in smartMatchService.levelForPercent:
 *  high 80–100 · good 60–79 · partial 40–59 · low 0–39. */
export type SmartMatchLevel = 'high' | 'good' | 'partial' | 'low';

/** Whether the worker's rate fits the job's rate. `unknown` when the two
 *  sides have no comparable rate field — never guessed. */
export type CompensationStatus =
  | 'within_budget'
  | 'slightly_above'
  | 'above_budget'
  | 'unknown';

/** Per-factor sub-scores. Each value is already normalized to that factor's
 *  own maximum on the future 100-point scale:
 *    profession 30 · experience 13 · availability 12 · compensation 12 ·
 *    skills 12 · distance 11 · sharedHistory 5 · semantic 5.
 *  Profession carries the most weight AND acts as a gate — a worker whose
 *  trade is not one the job asked for is capped well below a real match
 *  (see smartMatchService.computeSmartMatch).
 *
 *  A `null` factor means "not assessable" — either no real data for it
 *  (e.g. no coordinates → distance stays city-level, no comparable rate →
 *  compensation) or no backend for it yet (semantic). A null factor is
 *  EXCLUDED from `matchPercent`, never scored as a zero, so a worker is
 *  never punished for data the app does not have. */
export interface SmartMatchBreakdown {
  profession: number | null;
  skills: number | null;
  experience: number | null;
  availability: number | null;
  compensation: number | null;
  distance: number | null;
  sharedHistory: number | null;
  semantic: number | null;
}

export interface SmartMatchResult {
  workerId: string;
  /** 0..100, computed over the factors that could actually be assessed
   *  (see SmartMatchBreakdown). */
  matchPercent: number;
  matchLevel: SmartMatchLevel;
  breakdown: SmartMatchBreakdown;
  /** Plain-language "why he fits" bullets — only data-backed statements. */
  strengths: string[];
  /** Plain-language "what to consider" bullets — only data-backed. */
  concerns: string[];
  /** Free-text summary from the future OpenAI semantic pass. `undefined`
   *  until a real backend exists — the UI then shows NO explanation rather
   *  than a fabricated one. */
  aiSummary?: string;
  /** Real geo/road distance in km. `undefined` until coordinates + a
   *  distance provider exist; until then the UI falls back to
   *  same-city / other-city wording only. */
  distanceKm?: number;
  compensationStatus: CompensationStatus;
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
  | 'invitation_cancelled'
  | 'assignment_cancelled'
  | 'assignment_completed'
  | 'new_message'
  | 'review'
  | 'registration_approved'
  | 'registration_rejected'
  | 'account_blocked'
  | 'account_unblocked'
  | 'support_response'
  | 'new_pending_registration'
  | 'new_support_ticket'
  | 'license_update_submitted'
  | 'license_update_approved'
  | 'license_update_rejected'
  | 'license_attention'
  | 'license_renewal_requested'
  // Admin manually edited the contractor's registration number from the
  // user card — separate from the licence-update-request flow.
  | 'contractor_registration_number_updated'
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
  /** Optional stable key for notifications that could otherwise be raised
   *  repeatedly (e.g. a licence-attention check that runs whenever an admin
   *  opens the dashboard). `pushNotification` no-ops if a notification with
   *  the same dedupeKey already exists. */
  dedupeKey?: string;
}

export type Notification = AppNotification;

// ---------------------------------------------------------------------------
// Support / complaints / claims
// ---------------------------------------------------------------------------

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportTicketType = 'complaint' | 'claim' | 'question' | 'technical';

export type SupportMessageSenderRole = 'admin' | 'worker' | 'contractor';

/** One message in a support ticket's conversation. A ticket is a thread, not
 *  a single question + single answer: the requester and the admin can go
 *  back and forth any number of times, and every turn APPENDS one of these —
 *  a reply is never overwritten. The original ticket text lives on
 *  `SupportTicket.description`; this array holds every reply after it, in
 *  chronological order. */
export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: SupportMessageSenderRole;
  message: string;
  createdAt: string;
  /** Set only on the admin message that ALSO changed the ticket status in
   *  the same action (status change is never silent — it always carries a
   *  reply). The status the ticket moved TO. Append-only history lives right
   *  here on the message; no separate status-history array. */
  statusChange?: SupportTicketStatus;
}

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
  /** @deprecated Legacy single-answer field. Source of truth for the
   *  conversation is `messages`. Kept as a mirror of the most recent admin
   *  reply so old records and notification bodies still resolve; every
   *  historical reply is preserved in `messages`, never here. */
  adminResponse?: string;
  resolvedAt?: string;
  /** Full conversation, oldest first. Always present after normalization in
   *  AppContext (a legacy `adminResponse` is migrated into a message at load
   *  time). */
  messages?: SupportTicketMessage[];
  /** Conversation lifecycle — kept deliberately SEPARATE from `status`. A
   *  ticket can be "טופל" (done) and still open for follow-up messages, or
   *  explicitly closed so that neither side can add more. Closing never
   *  changes `status` and never removes a message; it can be undone by
   *  reopening. `undefined`/`false` both mean "open". */
  isClosed?: boolean;
  closedAt?: string;
  /** Identifier of the admin who closed the conversation. */
  closedBy?: string;
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
