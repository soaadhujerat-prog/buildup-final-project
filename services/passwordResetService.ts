// =============================================================================
// Password reset service
// =============================================================================
// Thin adapter used by ForgotPasswordScreen / ResetPasswordScreen. Behaviour
// is gated on `EXPO_PUBLIC_USE_BACKEND`:
//
//   backend ON  -> real Supabase Auth (authService.requestPasswordReset /
//                  authService.updatePassword)
//   backend OFF -> the original frontend-only simulation (no email, no lookup,
//                  always the same generic outcome)
//
// Either way `requestPasswordReset` resolves the same `{ ok: true }` regardless
// of whether the address is registered, so the UI can't be used to enumerate
// accounts. The screens are unchanged apart from awaiting these Promises.
// =============================================================================

import { isBackendEnabled } from '../config/env';
import * as authService from './authService';

export interface PasswordResetResult {
  ok: true;
}

export interface UpdatePasswordResult {
  ok: true;
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
 * Set a new password. With the backend on, this is
 * `supabase.auth.updateUser({ password })` on the current session (a
 * PASSWORD_RECOVERY session established from the emailed link, or a normally
 * signed-in user). It rejects on failure so ResetPasswordScreen can show a real
 * error. With the backend off it is the original no-op simulation.
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
