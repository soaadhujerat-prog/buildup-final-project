// =============================================================================
// BuildUp – Auth/session shared types
// =============================================================================
// Extracted from context/AppContext.tsx so the auth service layer
// (services/authService.ts, services/authSession.ts, services/profileService.ts)
// can depend on these shapes WITHOUT importing the React context (which would
// create a cycle). AppContext re-exports both names, so existing
// `import { SessionUser, LoginResult } from '../context/AppContext'` keep working.
// =============================================================================

import { Admin, Worker, Contractor, CustomerStatus, RegistrationRecord } from './index';

/** The signed-in user, as the UI consumes it. With the mock backend this is a
 *  MOCK_* object; with Supabase it is rebuilt from the live `profiles` row +
 *  the role-specific profile tables (see services/profileService.ts). It is a
 *  representation of `Supabase session + DB profile`, never a separate source
 *  of truth for role/status. */
export type SessionUser = Admin | Worker | Contractor | null;

export interface LoginResult {
  ok: boolean;
  user?: SessionUser;
  status?: CustomerStatus;         // if a profile / registration record matched
  registration?: RegistrationRecord;
  reason?: 'not_found' | 'wrong_password' | 'pending' | 'rejected' | 'blocked';
}
