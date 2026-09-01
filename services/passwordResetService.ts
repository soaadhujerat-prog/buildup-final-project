// =============================================================================
// Password reset service
// =============================================================================
// Thin adapter used by ForgotPasswordScreen / VerifyRecoveryCodeScreen /
// ResetPasswordScreen. Behaviour is gated on `EXPO_PUBLIC_USE_BACKEND`:
//
//   backend ON  -> real Supabase Auth (authService.requestPasswordReset /
//                  authService.verifyRecoveryOtp / authService.updatePassword)
//   backend OFF -> the original frontend-only simulation (no email, no lookup,
//                  always the same generic outcome; any RECOVERY_CODE_LENGTH-
//                  digit numeric code is accepted)
//
// Mobile recovery is CODE-based (Supabase Auth's native `recovery` OTP), NOT a
// clickable deep link — the flow stays entirely inside the app:
//   ForgotPassword (email) -> VerifyRecoveryCode (OTP) -> ResetPassword (new pw)
//
// Either way `requestPasswordReset` resolves the same `{ ok: true }` regardless
// of whether the address is registered, so the UI can't be used to enumerate
// accounts.
//
// -----------------------------------------------------------------------------
// ONE-TIME SUPABASE DASHBOARD CHANGE (not done in code — Auth email templates
// are not code-managed here): Authentication → Emails → "Reset Password" must
// render the OTP via `{{ .Token }}` instead of only `{{ .ConfirmationURL }}`.
// The exact Hebrew template to paste is in the task's final report.
// =============================================================================

import { isBackendEnabled } from '../config/env';
import * as authService from './authService';

export interface PasswordResetResult {
  ok: true;
}

export interface UpdatePasswordResult {
  ok: true;
}

/** Digits in the recovery OTP Supabase Auth emails — MUST match the live
 *  project's Auth "OTP Length" setting (confirmed 8 on device). The screen's
 *  copy, maxLength, numeric validation and button-enable, plus the mock-path
 *  check, all derive from this ONE constant so they can't drift. Change here
 *  only if the Supabase Auth OTP length is changed. */
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
 * Request a password-recovery link for `email`. Always resolves `{ ok: true }`
 * — callers must show the same generic "if this email exists…" message and
 * never branch on the result. A backend failure is swallowed here on purpose
 * (enumeration safety); it is logged without the address.
 */
export const requestPasswordReset = async (
  email: string
): Promise<PasswordResetResult> => {
  if (isBackendEnabled()) {
    try {
      await authService.requestPasswordReset(email);
    } catch {
      // eslint-disable-next-line no-console
      console.warn('[auth] password-reset request failed');
    }
  } else {
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return { ok: true };
};

/**
 * Verify the recovery CODE the user copied from the email. Backend on: native
 * `supabase.auth.verifyOtp({ email, token, type: 'recovery' })`, which opens
 * the recovery session ResetPasswordScreen then updates against. Backend off:
 * a short delay, then accept any correctly-shaped numeric code. Rejects with
 * `RecoveryCodeError` on a bad / expired / used code — the token is never
 * logged or persisted here.
 */
export const verifyRecoveryCode = async (
  email: string,
  code: string
): Promise<void> => {
  const token = code.replace(/\s+/g, '');
  if (isBackendEnabled()) {
    try {
      await authService.verifyRecoveryOtp(email, token);
    } catch {
      throw new RecoveryCodeError();
    }
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!new RegExp(`^\\d{${RECOVERY_CODE_LENGTH}}$`).test(token)) {
    throw new RecoveryCodeError();
  }
};

/**
 * Set a new password. With the backend on, this is
 * `supabase.auth.updateUser({ password })` on the current session (the recovery
 * session established by `verifyRecoveryCode`, or a normally signed-in user).
 * It rejects on failure so ResetPasswordScreen can show a real error. With the
 * backend off it is the original no-op simulation.
 */
export const updatePassword = async (
  newPassword: string
): Promise<UpdatePasswordResult> => {
  if (isBackendEnabled()) {
    await authService.updatePassword(newPassword);
  } else {
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return { ok: true };
};
