// =============================================================================
// BuildUp – Auth session orchestration
// =============================================================================
// Composes authService (Supabase Auth + login-by-id) with profileService
// (DB profile -> SessionUser) and applies role/status gating. This is the ONE
// place the backend login/bootstrap policy lives, so AppContext stays a thin
// facade: it just calls `bootstrapSessionUser()` / `loginById()` and stores the
// result.
//
// Gating is driven ONLY by the live `profiles` row (via profileService), never
// by a JWT claim.
// =============================================================================

import type { UserRole } from '../types';
import type { LoginResult, SessionUser } from '../types/auth';

import * as authService from './authService';
import { fetchSessionUser } from './profileService';

/** Generic "these credentials didn't work" — used for unknown ID, wrong
 *  password, AND "this role can't use this login form", so none of them are
 *  distinguishable to the caller. */
const genericFailure = (): LoginResult => ({ ok: false, reason: 'wrong_password' });

/**
 * Cold-start session restore. Reads the persisted Supabase session and rebuilds
 * the `SessionUser` from live DB profile data.
 *
 * Returns `null` when there is no session, or when the session exists but the
 * profile is missing/unreadable — in the latter case we also sign out so the
 * app never sits in a half-authenticated state. A profile is never created here.
 */
export async function bootstrapSessionUser(): Promise<SessionUser> {
  // eslint-disable-next-line no-console
  if (__DEV__) console.log('[AUTH_BOOT] getSession');
  const session = await authService.getCurrentSession();
  if (!session) {
    // eslint-disable-next-line no-console
    if (__DEV__) console.log('[AUTH_BOOT] no session');
    return null;
  }
  // eslint-disable-next-line no-console
  if (__DEV__) console.log('[AUTH_BOOT] session found');

  try {
    const user = await fetchSessionUser();
    if (!user) {
      await authService.signOut().catch(() => {});
      return null;
    }
    // eslint-disable-next-line no-console
    if (__DEV__) console.log('[AUTH_BOOT] profile loaded');
    return user;
  } catch (err) {
    // Transient DB/network error on boot: don't strand the user in a broken
    // shell. Drop to logged-out; they can retry.
    await authService.signOut().catch(() => {});
    throw err;
  }
}

/**
 * Backend "login by ID + password" followed by role/status gating.
 *
 *   unknown ID / wrong password / role not allowed -> generic failure
 *   profile missing                                -> signed out, not_found
 *   status = approved                              -> ok  (caller sets session user)
 *   status = pending / rejected                    -> signed out, status screen
 *   status = blocked                               -> session kept, blocked user
 *
 * @param allowedRoles roles the calling form accepts (`['worker','contractor']`
 *   for the customer login, `['admin']` for the admin login).
 */
export async function loginById(
  idNumber: string,
  password: string,
  allowedRoles: UserRole[]
): Promise<LoginResult> {
  try {
    await authService.signInById(idNumber, password);
  } catch (err) {
    if (err instanceof authService.AuthInvalidCredentialsError) return genericFailure();
    throw err; // real backend/network error — surfaced by the screen
  }

  let user: SessionUser;
  try {
    user = await fetchSessionUser();
  } catch (err) {
    await authService.signOut().catch(() => {});
    throw err;
  }

  if (!user) {
    await authService.signOut().catch(() => {});
    return { ok: false, reason: 'not_found' };
  }

  if (!allowedRoles.includes(user.role)) {
    // e.g. a worker/contractor trying the admin login form. Deliberately
    // indistinguishable from bad credentials.
    await authService.signOut().catch(() => {});
    return genericFailure();
  }

  switch (user.status) {
    case 'approved':
      return { ok: true, user, status: 'approved' };
    case 'pending':
      await authService.signOut().catch(() => {});
      return { ok: false, status: 'pending', reason: 'pending' };
    case 'rejected':
      await authService.signOut().catch(() => {});
      return { ok: false, status: 'rejected', reason: 'rejected' };
    case 'blocked':
      // Keep the session (mirrors the mock: a blocked user gets a live session
      // that the navigator's blocked guard confines to the block screen +
      // support flow). `ok: false` still tells the login screen this isn't a
      // normal sign-in.
      return { ok: false, user, status: 'blocked', reason: 'blocked' };
    default:
      await authService.signOut().catch(() => {});
      return { ok: false, reason: 'not_found' };
  }
}

export const signOut = authService.signOut;
