// Teacher accounts: roles, approval, and the demo limit.

// "admin": may open Setări and approve accounts. "teacher": Teste and Clase.
export type Role = 'admin' | 'teacher';

// "pending": waits for an administrator. "disabled": an administrator closed it.
export type AccountStatus = 'pending' | 'active' | 'disabled';

// A demo account may send this many tests to evaluation.
export const DEMO_TEST_LIMIT = 5;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
export const MAX_TEACHER_NAME_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 254;

// Emails are stored and compared in lowercase, without spaces around them.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// How many tests a demo account may still send to evaluation.
export function demoTestsLeft(testsEvaluated: number): number {
  return Math.max(0, DEMO_TEST_LIMIT - testsEvaluated);
}
