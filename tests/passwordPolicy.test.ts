// =============================================================================
// Unit tests — utils/passwordPolicy.ts  (pure logic, no backend, no RN)
// =============================================================================
// Verifies the REAL client-side password policy that SignUpScreen /
// ResetPasswordScreen consume, and that is mirrored server-side in the
// `register` Edge Function:
//   • minimum 8 characters
//   • at least one Latin letter (a-z / A-Z)
//   • at least one digit (0-9)
//   • NO symbol requirement
//
// Fixtures are synthetic ("Example1", "Worker123", …). No real credential —
// Demo or otherwise — appears in this file.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  PASSWORD_MIN_LENGTH,
  passwordChecks,
  isPasswordValid,
} from '../utils/passwordPolicy';

/** Collapse passwordChecks() into a { ruleKey: passed } map for concise asserts. */
const rules = (pwd: string): Record<string, boolean> =>
  Object.fromEntries(passwordChecks(pwd).map((c) => [c.key, c.passed]));

describe('passwordPolicy — policy constants', () => {
  it('requires a minimum length of 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});

describe('isPasswordValid — accepted passwords', () => {
  it('accepts an 8-char password with letters + a digit ("Example1")', () => {
    expect(isPasswordValid('Example1')).toBe(true);
  });

  it('accepts a longer letters + digits password ("Worker123")', () => {
    expect(isPasswordValid('Worker123')).toBe(true);
  });

  it('does NOT require a symbol (letters + digit, no punctuation)', () => {
    expect(isPasswordValid('abcdEFGH9')).toBe(true);
  });
});

describe('isPasswordValid — rejected passwords', () => {
  it('rejects fewer than 8 characters (even with a letter and a digit)', () => {
    expect(isPasswordValid('Ab1')).toBe(false);
    expect(isPasswordValid('Short1')).toBe(false); // 6 chars
  });

  it('rejects digits only (no letter)', () => {
    expect(isPasswordValid('12345678')).toBe(false);
  });

  it('rejects letters only (no digit)', () => {
    expect(isPasswordValid('OnlyLetters')).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isPasswordValid('')).toBe(false);
  });
});

describe('passwordChecks — per-rule reporting', () => {
  it('reports every rule failing for the empty string', () => {
    expect(rules('')).toEqual({ length: false, letter: false, digit: false });
  });

  it('reports only "digit" failing for a letters-only 8+ password', () => {
    expect(rules('OnlyLetters')).toEqual({
      length: true,
      letter: true,
      digit: false,
    });
  });

  it('reports only "letter" failing for a digits-only 8+ password', () => {
    expect(rules('12345678')).toEqual({
      length: true,
      letter: false,
      digit: true,
    });
  });

  it('reports only "length" failing for a short letters + digit password', () => {
    expect(rules('Ab1')).toEqual({
      length: false,
      letter: true,
      digit: true,
    });
  });

  it('reports all three rules passing for a valid password', () => {
    expect(rules('Example1')).toEqual({
      length: true,
      letter: true,
      digit: true,
    });
  });

  it('always returns exactly the three known rule keys, in order', () => {
    expect(passwordChecks('Example1').map((c) => c.key)).toEqual([
      'length',
      'letter',
      'digit',
    ]);
  });
});
