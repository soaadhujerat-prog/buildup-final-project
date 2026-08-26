// =============================================================================
// Password reset service — placeholder that mirrors the shape a real backend
// call will have (e.g. Supabase Auth's `resetPasswordForEmail`).
// =============================================================================
// The frontend has no backend yet, so this never actually sends an email and
// never checks whether the address belongs to a real account — doing that
// lookup here would let the UI (even indirectly, via timing or a branching
// result) leak which emails are registered. It always resolves the same way
// after a short delay, so ForgotPasswordScreen can show one generic message
// no matter what. Swapping this implementation for a real call later (e.g.
// `supabase.auth.resetPasswordForEmail(email, { redirectTo })`) requires no
// changes to the screen — only this function's body.
// =============================================================================

export interface PasswordResetResult {
  ok: true;
}

/**
 * Requests a password-reset link for `email`. Always resolves `{ ok: true }`
 * regardless of whether the address is registered — callers must always
 * show the same generic "if this email exists..." message and never branch
 * on the result to reveal account existence.
 */
export const requestPasswordReset = (email: string): Promise<PasswordResetResult> => {
  void email; // placeholder — no lookup, no network call, no logging
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ok: true }), 600);
  });
};

export interface UpdatePasswordResult {
  ok: true;
}

/**
 * Sets a new password from ResetPasswordScreen. This is a Frontend-only
 * placeholder — it never touches the mock users and never performs a real
 * password change; it just simulates the round trip so the screen's
 * loading/success states behave like they will once wired up.
 *
 * Once a real backend exists, this becomes the one place that changes:
 * ResetPasswordScreen is only reachable there via a genuine Supabase
 * password-recovery session (established from the emailed deep link), and
 * this function's body becomes
 * `supabase.auth.updateUser({ password: newPassword })` — no redesign of
 * the screen or its validation is needed.
 */
export const updatePassword = (newPassword: string): Promise<UpdatePasswordResult> => {
  void newPassword; // placeholder — no real password change, no logging
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ok: true }), 600);
  });
};
