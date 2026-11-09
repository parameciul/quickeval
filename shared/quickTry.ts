// Quick Try: one free grading without an account (spec
// docs/superpowers/specs/2026-11-09-quick-try-design.md).

// Tries per IP address per Bucharest day (administrators are not counted).
export const QUICK_TRY_IP_LIMIT = 10;
// Tries per Bucharest day on the whole platform (administrators are not counted).
export const QUICK_TRY_DAILY_LIMIT = 30;
// A try's link works this many days.
export const QUICK_TRY_DAYS = 7;
// A try may change its test and barem files this many times in all (each
// change can make robot work), and ask the robot for a barem once.
export const QUICK_TRY_FILE_CHANGES = 6;

// The guest teacher's name, class and student, and the test's title.
export const QUICK_TRY_GUEST = 'Încercare';
export const QUICK_TRY_CLASS = 'PROBA';
export const QUICK_TRY_STUDENT = 'Elev';
export const QUICK_TRY_TITLE = 'Încercare rapidă';

const QUICK_TRY_TOKEN = /^[a-z2-7]{32}$/;

// The secret part of a try's link: 32 characters from a-z and 2-7, longer than
// an upload or result token so the three cannot be confused.
export function isQuickTryToken(raw: string): boolean {
  return QUICK_TRY_TOKEN.test(raw);
}

// The calendar day in Romania, "YYYY-MM-DD": the daily limits start again at
// Bucharest midnight.
export function bucharestDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
