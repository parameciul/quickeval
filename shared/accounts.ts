// Teacher accounts: roles, approval, and the demo limit.

// "admin": may open Setări and approve accounts. "teacher": Teste and Clase.
export type Role = 'admin' | 'teacher';

// "pending": waits for an administrator. "disabled": an administrator closed it.
export type AccountStatus = 'pending' | 'active' | 'disabled';

// The changes an account goes through, as its history on Setări shows them.
export type AccountEventKind =
  | 'created'
  | 'email_confirmed'
  | 'approved'
  | 'demo'
  | 'complete'
  | 'password'
  | 'closed'
  | 'reopened';

// What the robot does for a teacher: grade one paper, make an exercise list,
// write the class analysis, generate a barem, or make a print PDF (the last
// one without Claude, so without tokens).
export type RobotWorkKind = 'grading' | 'exercise_list' | 'analysis' | 'barem' | 'print';

// The most tokens one robot operation may report: a task reads a few pages and
// writes a few thousand, so a larger number is wrong and would only spoil a
// sum. The robot caps what it sends, and the API caps what it takes.
export const MAX_ROBOT_TOKENS = 10_000_000;

// A demo account may have this many papers graded, in one test only. A paper
// is one student's whole test, however many pages it has. A regrade counts as
// one more.
export const DEMO_PAPER_LIMIT = 35;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
export const MAX_TEACHER_NAME_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 254;

// Passwords of 8 or more characters that people pick most often (lists of
// leaked passwords, and Romanian ones). A new password may not be one of
// them, in any letter case: a guesser tries these first.
const COMMON_PASSWORDS = new Set(
  `12345678 123456789 1234567890 12345678910 87654321 11111111 00000000 88888888 12341234 11223344 123123123
  1q2w3e4r 1qaz2wsx qwertyui qwertyuiop asdfghjk asdfghjkl zxcvbnm1 password password1 password123 passw0rd
  iloveyou sunshine princess football baseball welcome1 welcome123 abc12345 abcd1234 qwerty123 qwerty12 q1w2e3r4
  letmein1 trustno1 superman starwars whatever computer michelle jennifer corvette mercedes internet parola12
  parola123 parola1234 parolamea parolanoua parolaparola parolasecreta romania1 romania123 bucuresti timisoara
  iubire123 iubirea1 dragoste profesor profesor1 profesoara matematica matematica1 quickeval quickeval1
  quickeval123 mqgrader mqgrader1 mqgrader123 liceul123 shakespeare`.split(/\s+/),
);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

// Emails are stored and compared in lowercase, without spaces around them.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// How many papers a demo account may still have graded.
export function demoPapersLeft(papersGraded: number): number {
  return Math.max(0, DEMO_PAPER_LIMIT - papersGraded);
}
