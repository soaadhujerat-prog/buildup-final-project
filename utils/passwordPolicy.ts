// =============================================================================
// BuildUp – Password policy (single source of truth)
// =============================================================================
// The ONE place the client-side password rules are defined. Used identically by
// SignUpScreen, ResetPasswordScreen and any future "change password" screen, so
// the three can never drift apart.
//
// These rules are ALSO enforced server-side in the `register` Edge Function
// (identical checks) — the frontend copy is UX only and cannot be bypassed.
//
// The remote Supabase Auth policy is looser (min 6 chars, no character
// classes), so anything that satisfies THIS policy always satisfies Supabase.
// =============================================================================

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordCheck {
  key: 'length' | 'letter' | 'digit';
  /** Hebrew label for the inline checklist. */
  label: string;
  passed: boolean;
}

/** Per-rule pass/fail for the given password — drives the live checklist. */
export const passwordChecks = (pwd: string): PasswordCheck[] => [
  {
    key: 'length',
    label: `לפחות ${PASSWORD_MIN_LENGTH} תווים`,
    passed: pwd.length >= PASSWORD_MIN_LENGTH,
  },
  { key: 'letter', label: 'לפחות אות אחת (a-z / A-Z)', passed: /[A-Za-z]/.test(pwd) },
  { key: 'digit', label: 'לפחות ספרה אחת (0-9)', passed: /\d/.test(pwd) },
];

export const isPasswordValid = (pwd: string): boolean =>
  passwordChecks(pwd).every((c) => c.passed);

/** One-line summary shown under the field / used as the fallback error. */
export const PASSWORD_RULE_TEXT = `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים, אות אחת וספרה אחת`;
