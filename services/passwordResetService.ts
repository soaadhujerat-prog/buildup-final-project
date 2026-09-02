// =============================================================================
// Password reset service
// =============================================================================
// Thin adapter used by ForgotPasswordScreen / VerifyRecoveryCodeScreen /
// ResetPasswordScreen. Real Supabase Auth only:
//
//   requestPasswordReset -> authService.requestPasswordReset
//   verifyRecoveryCode   -> authService.verifyRecoveryOtp
//   updatePassword       -> authService.updatePassword
//
// Mobile recovery is CODE-based (Supabase Auth's native `recovery` OTP), NOT a
// clickable deep link — the flow stays entirely inside the app:
//   ForgotPassword (email) -> VerifyRecoveryCode (OTP) -> ResetPassword (new pw)
//
// `requestPasswordReset` always resolves `{ ok: true }` regardless of whether
// the address is registered, so the UI can't be used to enumerate accounts.
//
// -----------------------------------------------------------------------------
// ONE-TIME SUPABASE DASHBOARD CHANGE (not code-managed): Authentication →
// Emails → "Reset Password" must render the OTP via `{{ .Token }}` instead of
// only `{{ .ConfirmationURL }}`.
// =============================================================================

import * as authService from './authService';

export interface PasswordResetResult {
  ok: true;
}

export interface UpdatePasswordResult {
  ok: true;
}

/** Digits in the recovery OTP Supabase Auth emails — MUST match the live
 *  project's Auth "OTP Length" setting (confirmed 8 on device). The screen's
 *  copy, maxLength, numeric validation and button-enable all derive from this
 *  ONE constant so they can't drift. Change here only if the Supabase Auth OTP
 *  length is changed. */
export const RECOVERY_CODE_LENGTH = 8;

/** Thrown for a wrong / expired / already-used recovery code so the screen can
 *  show one clean Hebrew line instead of a raw Supabase error. */
export class RecoveryCodeError extends Error {
  constructor() {
    super('invalid_recovery_code');
    this.name = 'RecoveryCodeError';
  }
}

/**
 * Request a password-recovery email for `email`. Always resolves `{ ok: true }`
 * — callers must show the same generic "if this email exists…" message and
 * never branch on the result. A backend failure is swallowed here on purpose
 * (enumeration safety); it is logged without the address.
 */
export const requestPasswordReset = async (
  email: string
): Promise<PasswordResetResult> => {
  try {
    await authService.requestPasswordReset(email);
  } catch {
    // eslint-disable-next-line no-console
    console.warn('[auth] password-reset request failed');
  }
  return { ok: true };
};

/**
 * Verify the recovery CODE the user copied from the email via native
 * `supabase.auth.verifyOtp({ email, token, type: 'recovery' })`, which opens
 * the recovery session ResetPasswordScreen then updates against. Rejects with
 * `RecoveryCodeError` on a bad / expired / used code — the token is never
 * logged or persisted here.
 */
export const verifyRecoveryCode = async (
  email: string,
  code: string
): Promise<void> => {
  const token = code.replace(/\s+/g, '');
  try {
    await authService.verifyRecoveryOtp(email, token);
  } catch {
    throw new RecoveryCodeError();
  }
};

/**
 * Set a new password via `supabase.auth.updateUser({ password })` on the
 * current session (the recovery session established by `verifyRecoveryCode`, or
 * a normally signed-in user). Rejects on failure so ResetPasswordScreen can
 * show a real error.
 */
export const updatePassword = async (
  newPassword: string
): Promise<UpdatePasswordResult> => {
  await authService.updatePassword(newPassword);
  return { ok: true };
};
