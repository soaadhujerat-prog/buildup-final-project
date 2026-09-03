// =============================================================================
// BuildUp – Auth service (Supabase Auth wrapper)
// =============================================================================
// A thin, UI-agnostic wrapper around Supabase Auth + the `login-by-id` Edge
// Function. It knows NOTHING about React, AppContext, navigation or the domain
// `SessionUser` shape — composing auth with the DB profile is done one level up
// in services/authSession.ts.
//
// Login UX stays "Israeli ID + password", but Supabase Auth is email+password
// internally. The ID -> email -> session translation happens ENTIRELY inside
// the `login-by-id` Edge Function (service-role + ID_HMAC_PEPPER, both
// server-side only). This client never sees an email as the result of an ID
// lookup, and never sees the id_number hash.
// =============================================================================

import type { Session } from '@supabase/supabase-js';

import { getSupabase } from './supabaseClient';

export type AuthChangeEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY';

/**
 * Thrown for an EXPECTED auth failure — unknown ID, wrong password, or a role
 * the caller isn't allowed to use. Callers translate this into ONE generic
 * "פרטי ההתחברות אינם נכונים" message so the UI can't be used to enumerate
 * accounts. Any other error (network / server / misconfig) is a real error and
 * propagates as-is.
 */
export class AuthInvalidCredentialsError extends Error {
  constructor() {
    super('invalid_credentials');
    this.name = 'AuthInvalidCredentialsError';
  }
}

/**
 * The ID + password matched a registration that is NOT yet approved. Carries
 * the registration status so the caller can route to the right status screen
 * (Phase 2 gating) instead of showing a generic credentials error. Only raised
 * AFTER `login-by-id` has verified the password.
 */
export class AuthRegistrationStatusError extends Error {
  status: 'pending' | 'rejected';
  constructor(status: 'pending' | 'rejected') {
    super(`registration_${status}`);
    this.name = 'AuthRegistrationStatusError';
    this.status = status;
  }
}

/**
 * The ID + password matched a REJECTED registration and `login-by-id` returned
 * a confined session (tokens). By the time this is thrown the Supabase session
 * has ALREADY been established (setSession). The caller must NOT build a
 * SessionUser — there is no profile — and must route to the rejected-only
 * shell. Distinct from `AuthRegistrationStatusError` (which carries no
 * session; still used for `pending`).
 */
export class AuthRejectedRegistrationError extends Error {
  constructor() {
    super('registration_rejected_confined');
    this.name = 'AuthRejectedRegistrationError';
  }
}

/** Eagerly build the Supabase client so persisted-session restore + token
 *  auto-refresh start as early as possible. Safe to call more than once. */
export const initializeAuth = (): void => {
  getSupabase();
};

/** The persisted session (from AsyncStorage), refreshed if needed. `null` when
 *  nobody is signed in. */
export const getCurrentSession = async (): Promise<Session | null> => {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  return data.session ?? null;
};

type EdgeLoginResponse =
  | { ok: true; access_token: string; refresh_token: string }
  | {
      ok: false;
      error?: string;
      status?: 'pending' | 'rejected';
      // Present ONLY for status:'rejected' — the confined session tokens.
      access_token?: string;
      refresh_token?: string;
    };

/**
 * Real "login by Israeli ID + password".
 *
 * Calls the `login-by-id` Edge Function which, server-side only:
 *   normalize(idNumber) -> HMAC-SHA256(pepper) -> user_identity.id_number_hash
 *   -> auth user -> email -> signInWithPassword -> session tokens.
 *
 * The function returns HTTP 200 `{ ok: false }` for EVERY auth failure (no such
 * ID and wrong password are indistinguishable), and a non-2xx only for a
 * malformed request or a genuine server error.
 */
export const signInById = async (
  idNumber: string,
  password: string
): Promise<Session> => {
  const sb = getSupabase();

  const { data, error } = await sb.functions.invoke<EdgeLoginResponse>('login-by-id', {
    body: { idNumber, password },
  });

  if (error) {
    // Non-2xx from the function. A 400 (bad body) still shouldn't leak detail
    // to the user, but anything 5xx is a real backend problem worth surfacing.
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 400 || status === 422) throw new AuthInvalidCredentialsError();
    throw error;
  }

  if (!data || data.ok !== true) {
    // Rejected registration WITH a confined session — establish it, then signal
    // the rejected-only shell. `currentUser` is never built for this session.
    if (
      data &&
      data.status === 'rejected' &&
      data.access_token &&
      data.refresh_token
    ) {
      const { error: setErr } = await sb.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (setErr) throw setErr;
      throw new AuthRejectedRegistrationError();
    }
    if (data && (data.status === 'pending' || data.status === 'rejected')) {
      throw new AuthRegistrationStatusError(data.status);
    }
    throw new AuthInvalidCredentialsError();
  }

  const { data: sessionData, error: setErr } = await sb.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (setErr || !sessionData.session) {
    throw setErr ?? new Error('Failed to establish a session from login-by-id tokens');
  }
  return sessionData.session;
};

export const signOut = async (): Promise<void> => {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
};

/** Subscribe to Supabase auth events. Returns an unsubscribe function. */
export const onAuthStateChange = (
  cb: (event: AuthChangeEvent, session: Session | null) => void
): (() => void) => {
  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    cb(event as AuthChangeEvent, session);
  });
  return () => data.subscription.unsubscribe();
};

/**
 * Send a password-recovery email carrying a one-time CODE (OTP).
 *
 * Mobile recovery is CODE-based, not link-based: `resetPasswordForEmail`
 * generates Supabase Auth's native `recovery` OTP; the emailed template renders
 * it via `{{ .Token }}` (see the deployment note in passwordResetService). The
 * user types that code back into the app — no clickable deep link, no browser,
 * no `redirectTo` / Site-URL dependency (that was the Safari/localhost bug).
 *
 * NEVER rejects for "user not found" — the caller always shows the same generic
 * "if this email exists…" message. Only a 5xx (a truly broken backend)
 * propagates.
 */
export const requestPasswordReset = async (email: string): Promise<void> => {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email);
  if (error && typeof error.status === 'number' && error.status >= 500) {
    throw error;
  }
};

/**
 * Verify the recovery CODE the user copied from the email. On success Supabase
 * Auth establishes the recovery session (native `verifyOtp`, `type: 'recovery'`
 * — no custom token is minted anywhere), which is what `updatePassword` then
 * runs against. Rejects on a wrong / expired / already-used code so the UI can
 * show a clean Hebrew message. The token is never logged or persisted by us.
 */
export const verifyRecoveryOtp = async (
  email: string,
  token: string
): Promise<void> => {
  const { error } = await getSupabase().auth.verifyOtp({
    email,
    token,
    type: 'recovery',
  });
  if (error) throw error;
};

/** Set a new password for the CURRENT session (the recovery session opened by
 *  `verifyRecoveryOtp`, or a normally signed-in user). */
export const updatePassword = async (newPassword: string): Promise<void> => {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw error;
};
