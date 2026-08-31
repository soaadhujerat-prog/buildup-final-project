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

/** Where the emailed password-recovery link should send the user back to.
 *  Matches the `scheme` in app.json. Capturing this link in a running app
 *  needs a dev-client / standalone build (Expo Go can't own a custom scheme);
 *  `updatePassword` still works from any valid recovery session. */
const RECOVERY_REDIRECT_URL = 'buildup://reset-password';

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
  | { ok: false; error?: string; status?: 'pending' | 'rejected' };

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
 * Send a password-recovery email. Recovery is by email (independent of the
 * ID+password login). NEVER rejects for "user not found" — the caller always
 * shows the same generic "if this email exists…" message. Only a 5xx (a truly
 * broken backend) propagates.
 */
export const requestPasswordReset = async (email: string): Promise<void> => {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: RECOVERY_REDIRECT_URL,
  });
  if (error && typeof error.status === 'number' && error.status >= 500) {
    throw error;
  }
};

/** Set a new password for the CURRENT session (a PASSWORD_RECOVERY session, or
 *  a normally signed-in user). */
export const updatePassword = async (newPassword: string): Promise<void> => {
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw error;
};
