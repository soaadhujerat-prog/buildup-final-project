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

import type { RegistrationStatusEvent, UserRole } from '../types';
import type {
  BootstrapResult,
  LoginResult,
  RejectedRegistrationInfo,
  SessionUser,
} from '../types/auth';

import * as authService from './authService';
import { fetchSessionUser } from './profileService';
import { getSupabase } from './supabaseClient';

/** Generic "these credentials didn't work" — used for unknown ID, wrong
 *  password, AND "this role can't use this login form", so none of them are
 *  distinguishable to the caller. */
const genericFailure = (): LoginResult => ({ ok: false, reason: 'wrong_password' });

/**
 * Read the CURRENT session's own rejected registration (RLS scopes
 * `registrations` to `auth_user_id = auth.uid()`), plus its status-event
 * history. Returns null when the session doesn't own a rejected registration —
 * the caller then falls back to the normal signed-out behaviour.
 *
 * Used for BOTH the login path (a fresh confined session) and cold boot (a
 * persisted confined session whose uid has no profile).
 */
export async function fetchOwnRejectedRegistration(): Promise<RejectedRegistrationInfo | null> {
  const sb = getSupabase();
  const { data: reg, error } = await sb
    .from('registrations')
    .select('id, status, rejection_reason, processed_at, created_at')
    .eq('status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !reg) return null;

  let statusHistory: RegistrationStatusEvent[] | undefined;
  try {
    const { data: events } = await sb
      .from('registration_status_events')
      .select('id, registration_id, from_status, to_status, reason, message, actor_id, created_at')
      .eq('registration_id', (reg as { id: string }).id)
      .order('created_at', { ascending: true });
    if (events && events.length) {
      statusHistory = (events as Array<Record<string, unknown>>).map((e) => ({
        id: String(e.id),
        registrationId: String(e.registration_id),
        fromStatus: e.from_status as RegistrationStatusEvent['fromStatus'],
        toStatus: e.to_status as RegistrationStatusEvent['toStatus'],
        reason: (e.reason as string | null) ?? undefined,
        message: (e.message as string | null) ?? undefined,
        actorId: (e.actor_id as string | null) ?? undefined,
        createdAt: String(e.created_at),
      }));
    }
  } catch {
    /* history is optional — the screen still shows reason + date */
  }

  return {
    id: (reg as { id: string }).id,
    rejectionReason: (reg as { rejection_reason: string | null }).rejection_reason ?? undefined,
    processedAt: (reg as { processed_at: string | null }).processed_at ?? undefined,
    statusHistory,
  };
}

/**
 * Cold-start session restore. Reads the persisted Supabase session and rebuilds
 * the `SessionUser` from live DB profile data.
 *
 * Returns `{ user: null }` when there is no session. When the session exists
 * but the profile is missing/unreadable we FIRST check whether the session
 * belongs to a rejected registration — if so we KEEP the session and return
 * `{ user: null, rejectedRegistration }` so the app runs the confined rejected
 * shell; otherwise we sign out. A profile is never created here.
 */
export async function bootstrapSessionUser(): Promise<BootstrapResult> {
  // eslint-disable-next-line no-console
  if (__DEV__) console.log('[AUTH_BOOT] getSession');
  const session = await authService.getCurrentSession();
  if (!session) {
    // eslint-disable-next-line no-console
    if (__DEV__) console.log('[AUTH_BOOT] no session');
    return { user: null };
  }
  // eslint-disable-next-line no-console
  if (__DEV__) console.log('[AUTH_BOOT] session found');

  try {
    const user = await fetchSessionUser();
    if (user) {
      // eslint-disable-next-line no-console
      if (__DEV__) console.log('[AUTH_BOOT] profile loaded');
      return { user };
    }
    // No profile — is this a confined rejected-registration session?
    const rejectedRegistration = await fetchOwnRejectedRegistration();
    if (rejectedRegistration) {
      // eslint-disable-next-line no-console
      if (__DEV__) console.log('[AUTH_BOOT] confined rejected session');
      return { user: null, rejectedRegistration };
    }
    await authService.signOut().catch(() => {});
    return { user: null };
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
    if (err instanceof authService.AuthRejectedRegistrationError) {
      // ID + password matched a REJECTED registration and a CONFINED session is
      // now active. Do NOT sign out and do NOT build a SessionUser — read only
      // this session's own rejected registration and hand it back so AppContext
      // runs the rejected-only shell (currentUser stays null).
      const rejectedRegistration = await fetchOwnRejectedRegistration();
      return { ok: false, reason: 'rejected', status: 'rejected', rejectedRegistration: rejectedRegistration ?? undefined };
    }
    if (err instanceof authService.AuthRegistrationStatusError) {
      // ID + password matched a PENDING registration — route to the pending
      // status screen. No session.
      return { ok: false, status: err.status, reason: err.status };
    }
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
