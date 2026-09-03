// =============================================================================
// BuildUp – Auth/session shared types
// =============================================================================
// Extracted from context/AppContext.tsx so the auth service layer
// (services/authService.ts, services/authSession.ts, services/profileService.ts)
// can depend on these shapes WITHOUT importing the React context (which would
// create a cycle). AppContext re-exports both names, so existing
// `import { SessionUser, LoginResult } from '../context/AppContext'` keep working.
// =============================================================================

import {
  Admin,
  Worker,
  Contractor,
  CustomerStatus,
  RegistrationRecord,
  RegistrationStatusEvent,
} from './index';

/** The signed-in user, as the UI consumes it. With the mock backend this is a
 *  MOCK_* object; with Supabase it is rebuilt from the live `profiles` row +
 *  the role-specific profile tables (see services/profileService.ts). It is a
 *  representation of `Supabase session + DB profile`, never a separate source
 *  of truth for role/status. */
export type SessionUser = Admin | Worker | Contractor | null;

/** Minimal view of a REJECTED registration that a password-verified applicant
 *  is allowed to see about themselves. There is NO profile / user_identity for
 *  this person — this is the only thing their confined session exposes, plus
 *  their own registration_support_* island. */
export interface RejectedRegistrationInfo {
  id: string;
  rejectionReason?: string;
  processedAt?: string;
  statusHistory?: RegistrationStatusEvent[];
}

export interface LoginResult {
  ok: boolean;
  user?: SessionUser;
  status?: CustomerStatus;         // if a profile / registration record matched
  registration?: RegistrationRecord;
  /** Set only for `reason: 'rejected'` when the Edge Function returned a
   *  confined session — the app runs a rejected-only shell (currentUser stays
   *  null). */
  rejectedRegistration?: RejectedRegistrationInfo;
  reason?: 'not_found' | 'wrong_password' | 'pending' | 'rejected' | 'blocked';
}

/** Result of the cold-start session restore. `user` is the normal session
 *  user (null when logged out / unreadable). `rejectedRegistration` is set
 *  instead when the persisted session belongs to a rejected registration with
 *  no profile — the caller restores the confined shell rather than signing
 *  out. */
export interface BootstrapResult {
  user: SessionUser;
  rejectedRegistration?: RejectedRegistrationInfo;
}
