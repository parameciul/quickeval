import type { D1Database } from '@cloudflare/workers-types';
import type { AccountEventKind, AccountStatus, Role, RobotWorkKind } from '../../shared/accounts.ts';
import type {
  Account,
  AccountActivity,
  AccountCounts,
  AccountEvent,
  AccountTestWork,
  RefusedAccount,
  RobotWorkTotals,
  Teacher,
} from '../../shared/api.ts';
import { isUniqueViolation } from '../errors.ts';
import { papersWaitingSql } from './lifecycle.ts';

// Teacher accounts and logins. Writes check their own rules in their SQL.

// After this many wrong passwords in a row, the account refuses logins for LOCK_MS.
export const MAX_FAILED_LOGINS = 10;
export const LOCK_MS = 15 * 60 * 1000;
// At most this many confirmed accounts wait for approval.
export const MAX_PENDING_ACCOUNTS = 50;
// At most this many sign-up requests from one IP in a day, and from all IPs
// together, whatever their outcome: each may send an email, and Brevo's free
// plan sends 300 a day.
export const MAX_SIGNUPS_PER_IP = 5;
export const MAX_SIGNUPS_PER_DAY = 100;
// An email gets at most one confirmation link in this time from the IP that
// asked first: asking again sooner changes nothing, so nobody can fill a
// mailbox with links. From another IP, only after REPLACE_MINUTES, so someone
// else cannot keep cancelling the link before its owner opens it.
export const RESEND_MINUTES = 10;
export const REPLACE_MINUTES = 60;
// An account that waits this long is deleted at the next sign-up.
export const PENDING_DAYS = 30;
// The link that confirms a new account's email works this long; an account
// not confirmed by then is deleted at the next sign-up.
export const CONFIRM_HOURS = 24;
// After this many wrong passwords for existing accounts from one IP in
// IP_WINDOW_MS, logins from it are refused until the window ends, except from
// a known browser. High, because a school's teachers share one IP.
export const MAX_IP_FAILED_LOGINS = 100;
export const IP_WINDOW_MS = 15 * 60 * 1000;
// A browser that logged in before stops being known after this long unused.
export const DEVICE_DAYS = 365;
// A link that resets a password works this long, once. An account gets at most
// one link every RESET_RESEND_MINUTES and MAX_RESETS_PER_ACCOUNT a day, and one IP asks at most
// MAX_RESETS_PER_IP times a day, whatever the emails (each may send an email).
export const RESET_HOURS = 1;
export const RESET_RESEND_MINUTES = 5;
export const MAX_RESETS_PER_ACCOUNT = 5;
export const MAX_RESETS_PER_IP = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const daysBefore = (now: string, days: number) => new Date(Date.parse(now) - days * DAY_MS).toISOString();
const msBefore = (now: string, ms: number) => new Date(Date.parse(now) - ms).toISOString();

interface TeacherRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  demo: number;
  tests_evaluated: number;
  papers_graded: number;
  papers_waiting: number;
}

interface AccountRow extends TeacherRow {
  status: AccountStatus;
  created_at: string;
  approved_at: string | null;
  last_login_at: string | null;
  barems_generated: number;
  exercise_lists_made: number;
  analyses_made: number;
  prints_made: number;
}

const TEACHER_COLUMNS = `t.id, t.email, t.name, t.role, t.demo, t.tests_evaluated, t.papers_graded, ${papersWaitingSql('t.id')} AS papers_waiting`;

// The columns of an account, beside the teacher's: the history of its state
// and the robot work it made outside grading.
const ACCOUNT_COLUMNS = `${TEACHER_COLUMNS}, t.status, t.created_at, t.approved_at, t.last_login_at,
  t.barems_generated, t.exercise_lists_made, t.analyses_made, t.prints_made`;

function toTeacher(row: TeacherRow): Teacher {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    demo: row.demo === 1,
    testsEvaluated: row.tests_evaluated,
    papersGraded: row.papers_graded,
    papersWaiting: row.papers_waiting,
  };
}

function toAccount(row: AccountRow): Account {
  return {
    ...toTeacher(row),
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    lastLoginAt: row.last_login_at,
    baremsGenerated: row.barems_generated,
    exerciseListsMade: row.exercise_lists_made,
    analysesMade: row.analyses_made,
    printsMade: row.prints_made,
  };
}

// The local development login (DEV_TEACHER_EMAIL): an active account with this email.
export async function findActiveTeacherByEmail(db: D1Database, email: string): Promise<Teacher | null> {
  const row = await db
    .prepare(`SELECT ${TEACHER_COLUMNS} FROM teachers t WHERE t.email = ? AND t.status = 'active'`)
    .bind(email.toLowerCase())
    .first<TeacherRow>();
  return row ? toTeacher(row) : null;
}

// The teacher of a login cookie: the session has not expired and the account is active.
export async function findTeacherBySession(db: D1Database, tokenHash: string, now: string): Promise<Teacher | null> {
  const row = await db
    .prepare(
      `SELECT ${TEACHER_COLUMNS} FROM sessions s JOIN teachers t ON t.id = s.teacher_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND t.status = 'active'`,
    )
    .bind(tokenHash, now)
    .first<TeacherRow>();
  return row ? toTeacher(row) : null;
}

export interface LoginRow {
  id: number;
  status: AccountStatus;
  password_hash: string | null;
  // 1 when the email is confirmed (always, for an account that is not pending).
  confirmed: number;
}

const LOGIN_COLUMNS = 'id, status, password_hash, email_confirmed_at IS NOT NULL AS confirmed';

// Takes one login attempt before the password is checked, for the account
// and for the IP (`ipHash`, see clientIpKey), in one round trip whatever the
// email, so the time of the answer tells nothing. The account's count goes up
// first, and the attempt that reaches MAX_FAILED_LOGINS locks the account for
// LOCK_MS; the lock is checked in the same statement, so many attempts sent
// at once cannot get past it (D1 runs writes one at a time). A good password
// starts the count again (createSession). After a lock ends, the count starts
// at this attempt. The IP's count goes up the same way, in a window of
// IP_WINDOW_MS from its first attempt, for any email: only a good password
// gives it back (createSession, forgetFailedLogins). Keeping it also for an
// unknown email keeps the count from telling which emails have an account.
// "ip_blocked" when the IP used up its attempts (the account takes none),
// "locked" while the account's lock lasts, null for an unknown email.
export async function takeLoginAttempt(
  db: D1Database,
  email: string,
  ipHash: string,
  now: string,
): Promise<LoginRow | 'locked' | 'ip_blocked' | null> {
  const lockedUntil = new Date(Date.parse(now) + LOCK_MS).toISOString();
  const windowOver = msBefore(now, IP_WINDOW_MS);
  const [ip, account, exists] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `INSERT INTO login_ips (ip_hash, attempts, window_start) VALUES (?, 1, ?)
         ON CONFLICT (ip_hash) DO UPDATE SET
           attempts = CASE WHEN window_start <= ? THEN 1 ELSE attempts + 1 END,
           window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
         RETURNING attempts`,
      )
      .bind(ipHash, now, windowOver, windowOver),
    db
      .prepare(
        `UPDATE teachers SET
           failed_logins = CASE WHEN locked_until IS NULL THEN failed_logins + 1 ELSE 1 END,
           locked_until = CASE WHEN locked_until IS NULL AND failed_logins + 1 >= ? THEN ? ELSE NULL END
         WHERE email = ? AND (locked_until IS NULL OR locked_until <= ?)
           AND (SELECT attempts FROM login_ips WHERE ip_hash = ?) <= ?
         RETURNING ${LOGIN_COLUMNS}`,
      )
      .bind(MAX_FAILED_LOGINS, lockedUntil, email, now, ipHash, MAX_IP_FAILED_LOGINS),
    db.prepare('SELECT 1 AS found FROM teachers WHERE email = ?').bind(email),
  ]);
  if (Number(ip?.results[0]?.attempts ?? 0) > MAX_IP_FAILED_LOGINS) return 'ip_blocked';
  const row = account?.results[0] as LoginRow | undefined;
  if (row) return row;
  return exists?.results.length ? 'locked' : null;
}

// The same for a browser that logged in to this account before: it skips the
// account's lock and counts its own wrong passwords, at most MAX_FAILED_LOGINS
// until its next good login. Null when the browser is not known for this
// email, or has used up its attempts: the login then goes through the account.
export async function takeDeviceAttempt(db: D1Database, email: string, deviceHash: string, now: string): Promise<LoginRow | null> {
  const device = await db
    .prepare(
      `UPDATE trusted_devices SET failed_logins = failed_logins + 1, last_used_at = ?
       WHERE token_hash = ? AND failed_logins < ? AND last_used_at > ?
         AND teacher_id = (SELECT id FROM teachers WHERE email = ?)
       RETURNING teacher_id`,
    )
    .bind(now, deviceHash, MAX_FAILED_LOGINS, daysBefore(now, DEVICE_DAYS), email)
    .first<{ teacher_id: number }>();
  if (!device) return null;
  return db.prepare(`SELECT ${LOGIN_COLUMNS} FROM teachers WHERE id = ?`).bind(device.teacher_id).first<LoginRow>();
}

// The current password, checked on "Contul meu" before a new one: it counts
// as a login attempt of the account, so a stolen login cookie cannot guess it
// without end. False while the account is locked. A good password starts the
// count again (setPassword).
export async function takePasswordCheck(db: D1Database, teacherId: number, now: string): Promise<boolean> {
  const lockedUntil = new Date(Date.parse(now) + LOCK_MS).toISOString();
  const row = await db
    .prepare(
      `UPDATE teachers SET
         failed_logins = CASE WHEN locked_until IS NULL THEN failed_logins + 1 ELSE 1 END,
         locked_until = CASE WHEN locked_until IS NULL AND failed_logins + 1 >= ? THEN ? ELSE NULL END
       WHERE id = ? AND (locked_until IS NULL OR locked_until <= ?)
       RETURNING id`,
    )
    .bind(MAX_FAILED_LOGINS, lockedUntil, teacherId, now)
    .first();
  return row !== null;
}

// A good password of an account that may not log in (pending or closed):
// the attempt it took is not a wrong password. Through a known browser, the
// browser's count starts again, as after a login; otherwise the account's,
// and the IP (`ipHash`) gets its attempt back.
export async function forgetFailedLogins(
  db: D1Database,
  teacherId: number,
  device: { deviceHash: string } | { ipHash: string },
): Promise<void> {
  if ('deviceHash' in device) {
    await db
      .prepare('UPDATE trusted_devices SET failed_logins = 0 WHERE token_hash = ? AND teacher_id = ?')
      .bind(device.deviceHash, teacherId)
      .run();
    return;
  }
  await db.batch([
    db.prepare('UPDATE teachers SET failed_logins = 0, locked_until = NULL WHERE id = ?').bind(teacherId),
    db.prepare('UPDATE login_ips SET attempts = MAX(attempts - 1, 0) WHERE ip_hash = ?').bind(device.ipHash),
  ]);
}

export interface NewSession {
  teacherId: number;
  tokenHash: string;
  expiresAt: string;
  // The browser's qe_device token hash; `known` when the login went through it.
  device: { hash: string; known: boolean };
  // The IP's key when the login took an IP attempt (takeLoginAttempt).
  ipHash: string | null;
}

// A good password: a new session, and the teacher's expired sessions and
// long-unused browsers are deleted. A login through the account starts the
// account's count of wrong passwords again; a login through a known browser
// starts that browser's count again and leaves the account's lock as it is,
// so the teacher's logins never lift a lock that someone else's guesses set.
// A browser that was not known becomes known. The IP gets its attempt back,
// and the windows of IPs that ended are deleted. The account keeps the time of
// this login (Setări shows it), which outlives its sessions.
export async function createSession(db: D1Database, session: NewSession, now: string): Promise<void> {
  const { teacherId, tokenHash, expiresAt, device, ipHash } = session;
  await db.batch([
    ...(ipHash ? [db.prepare('UPDATE login_ips SET attempts = MAX(attempts - 1, 0) WHERE ip_hash = ?').bind(ipHash)] : []),
    db.prepare('DELETE FROM login_ips WHERE window_start <= ?').bind(msBefore(now, IP_WINDOW_MS)),
    db.prepare('UPDATE teachers SET last_login_at = ? WHERE id = ?').bind(now, teacherId),
    device.known
      ? db.prepare('UPDATE trusted_devices SET failed_logins = 0, last_used_at = ? WHERE token_hash = ?').bind(now, device.hash)
      : db.prepare('UPDATE teachers SET failed_logins = 0, locked_until = NULL WHERE id = ?').bind(teacherId),
    db
      .prepare(
        `INSERT INTO trusted_devices (token_hash, teacher_id, created_at, last_used_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (token_hash) DO NOTHING`,
      )
      .bind(device.hash, teacherId, now, now),
    db.prepare('DELETE FROM trusted_devices WHERE teacher_id = ? AND last_used_at <= ?').bind(teacherId, daysBefore(now, DEVICE_DAYS)),
    db.prepare('DELETE FROM sessions WHERE teacher_id = ? AND expires_at <= ?').bind(teacherId, now),
    db
      .prepare('INSERT INTO sessions (token_hash, teacher_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(tokenHash, teacherId, now, expiresAt),
  ]);
}

export async function deleteSession(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

// A new account: a teacher, pending, demo, its email not yet confirmed
// (`confirmTokenHash`, the SHA-256 of the link's token). Every request counts
// against its IP (`ipHash`) and all IPs, whatever the outcome, so the limits
// tell nothing about the email either. "too_many" past MAX_SIGNUPS_PER_IP or
// MAX_SIGNUPS_PER_DAY in the last day, or when MAX_PENDING_ACCOUNTS confirmed
// accounts wait. "email_taken" when the email has an account, nothing
// changes, and no email goes out. An account of this email that was never
// confirmed is replaced once RESEND_MINUTES passed from the same IP, or
// REPLACE_MINUTES from another, so whoever owns the email can always ask
// again, and gets at most one link in that time. Accounts that
// waited PENDING_DAYS, or were not confirmed in CONFIRM_HOURS, go first.
export async function createAccount(
  db: D1Database,
  input: { name: string; email: string; passwordHash: string; ipHash: string; confirmTokenHash: string },
  now: string,
): Promise<'created' | 'email_taken' | 'too_many'> {
  const dayAgo = daysBefore(now, 1);
  // Each IP adds at most MAX_SIGNUPS_PER_IP to the total, so one IP cannot
  // close sign-ups for everyone.
  const TOO_MANY = `((SELECT attempts FROM signup_ips WHERE ip_hash = ?1) > ${MAX_SIGNUPS_PER_IP}
    OR (SELECT SUM(MIN(attempts, ${MAX_SIGNUPS_PER_IP})) FROM signup_ips) > ${MAX_SIGNUPS_PER_DAY}
    OR (SELECT COUNT(*) FROM teachers WHERE status = 'pending' AND email_confirmed_at IS NOT NULL) >= ${MAX_PENDING_ACCOUNTS})`;
  try {
    const results = await db.batch<{ id?: number; too_many?: number }>([
      db.prepare('DELETE FROM signup_ips WHERE window_start <= ?').bind(dayAgo),
      db
        .prepare(
          `INSERT INTO signup_ips (ip_hash, attempts, window_start) VALUES (?, 1, ?)
           ON CONFLICT (ip_hash) DO UPDATE SET attempts = MIN(attempts + 1, ${MAX_SIGNUPS_PER_IP + 1})`,
        )
        .bind(input.ipHash, now),
      db
        .prepare(
          `DELETE FROM teachers WHERE status = 'pending'
             AND (created_at <= ? OR (email_confirmed_at IS NULL AND created_at <= ?))`,
        )
        .bind(daysBefore(now, PENDING_DAYS), msBefore(now, CONFIRM_HOURS * 60 * 60 * 1000)),
      db
        .prepare(
          `DELETE FROM teachers WHERE email = ?2 AND status = 'pending' AND email_confirmed_at IS NULL
             AND ((confirm_ip_hash = ?1 AND created_at <= ?3) OR created_at <= ?4)
             AND NOT ${TOO_MANY}`,
        )
        .bind(input.ipHash, input.email, msBefore(now, RESEND_MINUTES * 60 * 1000), msBefore(now, REPLACE_MINUTES * 60 * 1000)),
      db
        .prepare(
          `INSERT INTO teachers (email, name, created_at, role, status, demo, password_hash, confirm_token_hash, confirm_ip_hash)
           SELECT ?2, ?3, ?4, 'teacher', 'pending', 1, ?5, ?6, ?1
           WHERE NOT ${TOO_MANY} AND NOT EXISTS (SELECT 1 FROM teachers WHERE email = ?2)
           RETURNING id`,
        )
        .bind(input.ipHash, input.email, input.name, now, input.passwordHash, input.confirmTokenHash),
      db.prepare(`SELECT ${TOO_MANY} AS too_many`).bind(input.ipHash),
    ]);
    if (results[4]?.results.length) return 'created';
    return results[5]?.results[0]?.too_many ? 'too_many' : 'email_taken';
  } catch (err) {
    // Two sign-ups of one email at the same moment.
    if (isUniqueViolation(err)) return 'email_taken';
    throw err;
  }
}

// The account a confirmation link names: pending, not confirmed, asked for in
// the last CONFIRM_HOURS. Null for a wrong or used link.
export async function findUnconfirmed(
  db: D1Database,
  tokenHash: string,
  now: string,
): Promise<{ id: number; password_hash: string | null } | null> {
  return db
    .prepare(
      `SELECT id, password_hash FROM teachers
       WHERE confirm_token_hash = ? AND status = 'pending' AND email_confirmed_at IS NULL AND created_at > ?`,
    )
    .bind(tokenHash, msBefore(now, CONFIRM_HOURS * 60 * 60 * 1000))
    .first();
}

// The link in the email of a new account, with the password chosen at the
// sign-up (checked by the caller): its email is confirmed, and the account
// now waits for an administrator. Null when the link no longer names it.
export async function confirmEmail(
  db: D1Database,
  shown: { teacherId: number; tokenHash: string },
  now: string,
): Promise<{ email: string; name: string } | null> {
  return db
    .prepare(
      `UPDATE teachers SET email_confirmed_at = ?, confirm_token_hash = NULL, confirm_ip_hash = NULL
       WHERE id = ? AND confirm_token_hash = ? AND status = 'pending' AND email_confirmed_at IS NULL
       RETURNING email, name`,
    )
    .bind(now, shown.teacherId, shown.tokenHash)
    .first<{ email: string; name: string }>();
}

// The addresses that hear about new accounts.
export async function adminEmails(db: D1Database): Promise<string[]> {
  const rows = await db.prepare("SELECT email FROM teachers WHERE role = 'admin' AND status = 'active' ORDER BY id").all<{ email: string }>();
  return rows.results.map((row) => row.email);
}

// Pending accounts first, then by name. A pending account whose email is not
// confirmed yet is not shown: nobody may approve it. Quick Try's guest teachers
// are not accounts.
export async function listAccounts(db: D1Database): Promise<Account[]> {
  const rows = await db
    .prepare(
      `SELECT ${ACCOUNT_COLUMNS} FROM teachers t
       WHERE t.quick_try = 0 AND (t.status <> 'pending' OR t.email_confirmed_at IS NOT NULL)
       ORDER BY CASE t.status WHEN 'pending' THEN 0 ELSE 1 END, t.name COLLATE NOCASE, t.id`,
    )
    .all<AccountRow>();
  return rows.results.map(toAccount);
}

// One account with its history and what it made, for "Detalii" on Setări.
// Null for a Quick Try's guest teacher, which is no account.
export async function findAccount(db: D1Database, teacherId: number): Promise<Account | null> {
  const row = await db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM teachers t WHERE t.id = ? AND t.quick_try = 0`)
    .bind(teacherId)
    .first<AccountRow>();
  return row ? toAccount(row) : null;
}

// The account's changes, oldest first; one that happened in the same instant
// follows the order in which it was written. An administrator who was deleted
// meanwhile leaves no name: the change stays, the actor goes.
export async function listAccountEvents(db: D1Database, teacherId: number): Promise<AccountEvent[]> {
  const rows = await db
    .prepare(
      `SELECT e.kind, e.at, e.by_teacher_id, a.name AS by_name
       FROM account_events e LEFT JOIN teachers a ON a.id = e.by_teacher_id
       WHERE e.teacher_id = ? ORDER BY e.at, e.id`,
    )
    .bind(teacherId)
    .all<{ kind: AccountEventKind; at: string; by_teacher_id: number | null; by_name: string | null }>();
  return rows.results.map((row) => ({
    kind: row.kind,
    at: row.at,
    by: row.by_teacher_id === null ? null : { id: row.by_teacher_id, name: row.by_name ?? '' },
  }));
}

// How many classes, students and tests the account made.
export async function countAccountWork(db: D1Database, teacherId: number): Promise<AccountCounts> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM classes WHERE teacher_id = ?1) AS classes,
         (SELECT COUNT(*) FROM students WHERE teacher_id = ?1) AS students,
         (SELECT COUNT(*) FROM tests WHERE teacher_id = ?1) AS tests`,
    )
    .bind(teacherId)
    .first<AccountCounts>();
  return row ?? { classes: 0, students: 0, tests: 0 };
}

// The last 30 days of grading, and the room the students' pages take. A test
// counts once, however many of its papers were graded in that time. Only the
// pages have their size kept: the test, the barem and the print PDF do not.
export async function accountActivity(db: D1Database, teacherId: number, now: string): Promise<AccountActivity> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(DISTINCT s.test_id) FROM submissions s JOIN tests t ON t.id = s.test_id
           WHERE t.teacher_id = ?1 AND s.graded_at >= ?2) AS tests_30d,
         (SELECT COUNT(*) FROM submissions s JOIN tests t ON t.id = s.test_id
           WHERE t.teacher_id = ?1 AND s.graded_at >= ?2) AS papers_30d,
         (SELECT COALESCE(SUM(f.size), 0) FROM submission_files f
           JOIN submissions s ON s.id = f.submission_id JOIN tests t ON t.id = s.test_id
           WHERE t.teacher_id = ?1) AS r2_bytes`,
    )
    .bind(teacherId, daysBefore(now, 30))
    .first<{ tests_30d: number; papers_30d: number; r2_bytes: number }>();
  return {
    testsLast30Days: row?.tests_30d ?? 0,
    papersLast30Days: row?.papers_30d ?? 0,
    r2Bytes: row?.r2_bytes ?? 0,
  };
}

const NO_ROBOT_WORK = (): RobotWorkTotals => ({
  grading: { done: 0, failed: 0, tokens: 0 },
  exercise_list: { done: 0, failed: 0, tokens: 0 },
  analysis: { done: 0, failed: 0, tokens: 0 },
  barem: { done: 0, failed: 0, tokens: 0 },
  print: { done: 0, failed: 0, tokens: 0 },
});

// The robot's work for the account, by kind: what it finished, what it gave up
// on, and the tokens Claude reported for the finished work. A print PDF is made
// without Claude, so it has no tokens; a failed attempt reports none.
export async function countRobotWork(db: D1Database, teacherId: number): Promise<RobotWorkTotals> {
  const rows = await db
    .prepare(
      `SELECT kind, ok, COUNT(*) AS count, COALESCE(SUM(tokens), 0) AS tokens
       FROM robot_work WHERE teacher_id = ? GROUP BY kind, ok`,
    )
    .bind(teacherId)
    .all<{ kind: RobotWorkKind; ok: number; count: number; tokens: number }>();
  const totals = NO_ROBOT_WORK();
  for (const row of rows.results) {
    const count = totals[row.kind];
    if (row.ok === 1) {
      count.done += row.count;
      count.tokens += row.tokens;
    } else {
      count.failed += row.count;
    }
  }
  return totals;
}

interface AccountTestRow {
  id: number;
  code: string;
  title: string;
  class_name: string;
  created_at: string;
  papers: number;
  points_changed: number;
}

// The robot work of one test as `listAccountTests` adds it up.
const TEST_WORK_FIELD = {
  barem: 'barems',
  exercise_list: 'exerciseLists',
  analysis: 'analyses',
  print: 'prints',
  grading: 'gradings',
} as const;

// Each test of the account with what the robot did for it, how many of its
// papers were graded, and how many of its points the teacher corrected. One
// batch of two statements, whatever the number of tests. A deleted test keeps
// its robot rows with no test, so they count only in the totals.
export async function listAccountTests(db: D1Database, teacherId: number): Promise<AccountTestWork[]> {
  const [tests, robot] = await db.batch<Record<string, number | string>>([
    db
      .prepare(
        `SELECT t.id, t.code, t.title, c.name AS class_name, t.created_at,
           (SELECT COUNT(*) FROM submissions s
             WHERE s.test_id = t.id AND s.status = 'graded') AS papers,
           (SELECT COUNT(*) FROM evaluation_items i
             JOIN evaluations e ON e.id = i.evaluation_id
             JOIN submissions s ON s.id = e.submission_id
             WHERE s.test_id = t.id AND i.changed_by_teacher = 1) AS points_changed
         FROM tests t JOIN classes c ON c.id = t.class_id
         WHERE t.teacher_id = ? ORDER BY t.created_at DESC, t.id DESC`,
      )
      .bind(teacherId),
    db
      .prepare(
        `SELECT test_id, kind, ok, COUNT(*) AS count, COALESCE(SUM(tokens), 0) AS tokens
         FROM robot_work WHERE teacher_id = ?1 AND test_id IS NOT NULL
         GROUP BY test_id, kind, ok`,
      )
      .bind(teacherId),
  ]);
  const work = new Map<number, AccountTestWork>();
  for (const row of (tests?.results ?? []) as unknown as AccountTestRow[]) {
    work.set(row.id, {
      code: row.code,
      title: row.title,
      className: row.class_name,
      createdAt: row.created_at,
      papers: Number(row.papers),
      pointsChanged: Number(row.points_changed),
      robot: { barems: 0, exerciseLists: 0, analyses: 0, prints: 0, gradings: 0, failures: 0, tokens: 0 },
    });
  }
  for (const row of robot?.results ?? []) {
    const test = work.get(Number(row.test_id));
    if (!test) continue;
    if (Number(row.ok) !== 1) {
      test.robot.failures += Number(row.count);
      continue;
    }
    test.robot[TEST_WORK_FIELD[row.kind as RobotWorkKind]] += Number(row.count);
    test.robot.tokens += Number(row.tokens);
  }
  return [...work.values()];
}

// The newest requests that an administrator refused. The account is gone, so
// this is what is left of it; a deleted administrator leaves no name.
export async function listRefusedAccounts(db: D1Database): Promise<RefusedAccount[]> {
  const rows = await db
    .prepare(
      `SELECT r.email, r.name, r.asked_at, r.refused_at, a.name AS by_name
       FROM refused_accounts r LEFT JOIN teachers a ON a.id = r.by_teacher_id
       ORDER BY r.refused_at DESC, r.id DESC LIMIT 50`,
    )
    .all<{ email: string; name: string; asked_at: string; refused_at: string; by_name: string | null }>();
  return rows.results.map((row) => ({
    email: row.email,
    name: row.name,
    askedAt: row.asked_at,
    refusedAt: row.refused_at,
    by: row.by_name,
  }));
}

// The account an administrator's page shows: ids of refused (deleted)
// accounts come back, so the page also sends the time the account was asked
// for, and the write checks both.
export interface ShownAccount {
  teacherId: number;
  createdAt: string;
}

// pending → active, once its email is confirmed. `byTeacherId` is the
// administrator who approved it: the trigger that logs the approval names them.
// Null when the account is not pending (approved meanwhile, or gone), or is
// another account now.
export async function approveAccount(
  db: D1Database,
  shown: ShownAccount,
  now: string,
  byTeacherId: number,
): Promise<{ email: string; name: string } | null> {
  return db
    .prepare(
      `UPDATE teachers SET status = 'active', approved_at = ?, changed_by = ?
       WHERE id = ? AND created_at = ? AND status = 'pending' AND email_confirmed_at IS NOT NULL RETURNING email, name`,
    )
    .bind(now, byTeacherId, shown.teacherId, shown.createdAt)
    .first<{ email: string; name: string }>();
}

// Deletes accounts that still wait: they cannot have logged in, so they have
// no data. Returns how many went; the others were approved or gone meanwhile.
// Each one leaves a row in `refused_accounts` (who asked, and who said no), in
// the same batch and under the same guard as its delete, so a refusal that
// matched nothing writes nothing.
export async function rejectAccounts(
  db: D1Database,
  shown: ShownAccount[],
  now: string,
  byTeacherId: number,
): Promise<number> {
  const WAITING = `teachers.status = 'pending'
    AND EXISTS (SELECT 1 FROM json_each(?1) j
                WHERE json_extract(j.value, '$.teacherId') = teachers.id
                  AND json_extract(j.value, '$.createdAt') = teachers.created_at)`;
  const [, deleted] = await db.batch([
    db
      .prepare(
        `INSERT INTO refused_accounts (email, name, asked_at, refused_at, by_teacher_id)
         SELECT email, name, created_at, ?2, ?3 FROM teachers WHERE ${WAITING}`,
      )
      .bind(JSON.stringify(shown), now, byTeacherId),
    db.prepare(`DELETE FROM teachers WHERE ${WAITING} RETURNING id`).bind(JSON.stringify(shown)),
  ]);
  return deleted?.results.length ?? 0;
}

// An administrator changes a teacher's account (never an administrator's, nor
// one that waits). Closing it also ends its logins. The triggers that log the
// change name `byTeacherId`. False when no such account.
export async function updateAccount(
  db: D1Database,
  teacherId: number,
  change: { demo?: boolean; status?: 'active' | 'disabled' },
  byTeacherId: number,
): Promise<boolean> {
  const demo = change.demo === undefined ? null : change.demo ? 1 : 0;
  const status = change.status ?? null;
  const [updated] = await db.batch([
    db
      .prepare(
        `UPDATE teachers SET demo = COALESCE(?, demo), status = COALESCE(?, status), changed_by = ?,
           reset_token_hash = CASE WHEN ? = 'disabled' THEN NULL ELSE reset_token_hash END
         WHERE id = ? AND role = 'teacher' AND status IN ('active', 'disabled')
         RETURNING id`,
      )
      .bind(demo, status, byTeacherId, status, teacherId),
    db.prepare("DELETE FROM sessions WHERE teacher_id = ? AND EXISTS (SELECT 1 FROM teachers WHERE id = ? AND status = 'disabled')").bind(teacherId, teacherId),
  ]);
  return (updated?.results.length ?? 0) > 0;
}

export async function getPasswordHash(db: D1Database, teacherId: number): Promise<string | null> {
  const row = await db.prepare('SELECT password_hash FROM teachers WHERE id = ?').bind(teacherId).first<{ password_hash: string | null }>();
  return row?.password_hash ?? null;
}

// A new password ends every login of the account but `keepTokenHash` (the
// teacher who changed their own password stays logged in). Never a pending
// account's (that would approve it). With `teachersOnly` (an administrator
// sets it for someone else), never an administrator's: an administrator could
// otherwise log in as another. `byTeacherId` is who set it: the teacher on
// "Contul meu", or the administrator; the trigger that logs it names them.
// Returns the account's email and name; null when there is no such account.
export async function setPassword(
  db: D1Database,
  teacherId: number,
  passwordHash: string,
  options: { keepTokenHash: string | null; teachersOnly: boolean; byTeacherId: number | null },
): Promise<{ email: string; name: string } | null> {
  const { keepTokenHash, teachersOnly, byTeacherId } = options;
  const [updated] = await db.batch<{ email: string; name: string }>([
    db
      .prepare(
        `UPDATE teachers SET password_hash = ?, failed_logins = 0, locked_until = NULL, changed_by = ?,
           reset_token_hash = NULL, reset_expires_at = NULL
         WHERE id = ? AND status IN ('active', 'disabled') ${teachersOnly ? "AND role = 'teacher'" : ''}
         RETURNING email, name`,
      )
      .bind(passwordHash, byTeacherId, teacherId),
    db
      .prepare(
        `DELETE FROM sessions WHERE teacher_id = ? AND token_hash IS NOT ?
           AND EXISTS (SELECT 1 FROM teachers WHERE id = ? AND password_hash = ?)`,
      )
      .bind(teacherId, keepTokenHash, teacherId, passwordHash),
  ]);
  return updated?.results[0] ?? null;
}

// A teacher forgot the password: an active account gets a reset link
// (`tokenHash` is the SHA-256 of its token) unless it got one in the last
// RESET_RESEND_MINUTES. Every request counts against its IP, whatever the
// email, and the same statements run for any email, so nothing tells which
// emails have an account. "too_many" past MAX_RESETS_PER_IP in a day; the
// account's name when a link was made (the caller sends it by email), else null.
export async function requestPasswordReset(
  db: D1Database,
  input: { email: string; ipHash: string; tokenHash: string },
  now: string,
): Promise<'too_many' | { name: string } | null> {
  const [, ip, account] = await db.batch<{ attempts?: number; name?: string }>([
    db.prepare('DELETE FROM reset_ips WHERE window_start <= ?').bind(daysBefore(now, 1)),
    db
      .prepare(
        `INSERT INTO reset_ips (ip_hash, attempts, window_start) VALUES (?, 1, ?)
         ON CONFLICT (ip_hash) DO UPDATE SET attempts = MIN(attempts + 1, ${MAX_RESETS_PER_IP + 1})
         RETURNING attempts`,
      )
      .bind(input.ipHash, now),
    db
      .prepare(
        `UPDATE teachers SET reset_token_hash = ?1, reset_expires_at = ?2, reset_requested_at = ?3,
           reset_count = CASE WHEN reset_window_start IS NULL OR reset_window_start <= ?4 THEN 1 ELSE reset_count + 1 END,
           reset_window_start = CASE WHEN reset_window_start IS NULL OR reset_window_start <= ?4 THEN ?3 ELSE reset_window_start END
         WHERE email = ?5 AND status = 'active'
           AND (reset_requested_at IS NULL OR reset_requested_at <= ?6)
           AND (reset_window_start IS NULL OR reset_window_start <= ?4 OR reset_count < ${MAX_RESETS_PER_ACCOUNT})
           AND (SELECT attempts FROM reset_ips WHERE ip_hash = ?7) <= ${MAX_RESETS_PER_IP}
         RETURNING name`,
      )
      .bind(
        input.tokenHash,
        new Date(Date.parse(now) + RESET_HOURS * 60 * 60 * 1000).toISOString(),
        now,
        daysBefore(now, 1),
        input.email,
        msBefore(now, RESET_RESEND_MINUTES * 60 * 1000),
        input.ipHash,
      ),
  ]);
  if (Number(ip?.results[0]?.attempts ?? 0) > MAX_RESETS_PER_IP) return 'too_many';
  const name = account?.results[0]?.name;
  return name === undefined ? null : { name };
}

// Whether a reset link still works, so the caller hashes a new password only
// for a link that does. `resetPassword` checks it again in its own SQL.
export async function resetLinkWorks(db: D1Database, tokenHash: string, now: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS found FROM teachers WHERE reset_token_hash = ? AND reset_expires_at > ? AND status = 'active'")
    .bind(tokenHash, now)
    .first();
  return row !== null;
}

// The link of the reset email, with the new password: valid, unused and
// unexpired, checked in the statement that sets it. The account's other logins
// end, its lock is lifted, its known browsers are forgotten (a browser that was
// trusted before the reset must log in through the account again), and the
// link is used up. Nobody is logged in here, so no actor is named. The cleanup
// after the UPDATE finds the account by the new hash: it is salted, so it names
// only the account just changed, and if the UPDATE matched nothing no row has
// it. Null when the link no longer works.
export async function resetPassword(
  db: D1Database,
  tokenHash: string,
  passwordHash: string,
  now: string,
): Promise<{ email: string; name: string } | null> {
  const [updated] = await db.batch<{ id: number; email: string; name: string }>([
    db
      .prepare(
        `UPDATE teachers SET password_hash = ?, failed_logins = 0, locked_until = NULL, changed_by = NULL,
           reset_token_hash = NULL, reset_expires_at = NULL
         WHERE reset_token_hash = ? AND reset_expires_at > ? AND status = 'active'
         RETURNING id, email, name`,
      )
      .bind(passwordHash, tokenHash, now),
    db
      .prepare(
        `DELETE FROM sessions WHERE teacher_id IN (SELECT id FROM teachers WHERE password_hash = ? AND status = 'active')`,
      )
      .bind(passwordHash),
    db
      .prepare(
        `DELETE FROM trusted_devices
         WHERE teacher_id IN (SELECT id FROM teachers WHERE password_hash = ? AND status = 'active')`,
      )
      .bind(passwordHash),
  ]);
  const row = updated?.results[0];
  return row ? { email: row.email, name: row.name } : null;
}
