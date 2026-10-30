import type { D1Database } from '@cloudflare/workers-types';
import type { AccountStatus, Role } from '../../shared/accounts.ts';
import type { Account, Teacher } from '../../shared/api.ts';
import { isUniqueViolation } from '../errors.ts';

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
// An email gets at most one confirmation link in this time: asking again
// sooner changes nothing, so nobody can fill a mailbox with links.
export const RESEND_MINUTES = 10;
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
}

interface AccountRow extends TeacherRow {
  status: AccountStatus;
  created_at: string;
  approved_at: string | null;
}

const TEACHER_COLUMNS = 't.id, t.email, t.name, t.role, t.demo, t.tests_evaluated';

function toTeacher(row: TeacherRow): Teacher {
  return { id: row.id, email: row.email, name: row.name, role: row.role, demo: row.demo === 1, testsEvaluated: row.tests_evaluated };
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
// IP_WINDOW_MS from its first attempt; only a wrong password for an existing
// account keeps it (the caller gives it back otherwise: giveBackIpAttempt).
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

// An attempt of this IP that was not a wrong password for an existing account.
export async function giveBackIpAttempt(db: D1Database, ipHash: string): Promise<void> {
  await db.prepare('UPDATE login_ips SET attempts = MAX(attempts - 1, 0) WHERE ip_hash = ?').bind(ipHash).run();
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
// and the windows of IPs that ended are deleted.
export async function createSession(db: D1Database, session: NewSession, now: string): Promise<void> {
  const { teacherId, tokenHash, expiresAt, device, ipHash } = session;
  await db.batch([
    ...(ipHash ? [db.prepare('UPDATE login_ips SET attempts = MAX(attempts - 1, 0) WHERE ip_hash = ?').bind(ipHash)] : []),
    db.prepare('DELETE FROM login_ips WHERE window_start <= ?').bind(msBefore(now, IP_WINDOW_MS)),
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
// confirmed is replaced once RESEND_MINUTES passed, so whoever owns the email
// can always ask again, and gets at most one link in that time. Accounts that
// waited PENDING_DAYS, or were not confirmed in CONFIRM_HOURS, go first.
export async function createAccount(
  db: D1Database,
  input: { name: string; email: string; passwordHash: string; ipHash: string; confirmTokenHash: string },
  now: string,
): Promise<'created' | 'email_taken' | 'too_many'> {
  const dayAgo = daysBefore(now, 1);
  const TOO_MANY = `((SELECT attempts FROM signup_ips WHERE ip_hash = ?1) > ${MAX_SIGNUPS_PER_IP}
    OR (SELECT SUM(attempts) FROM signup_ips) > ${MAX_SIGNUPS_PER_DAY}
    OR (SELECT COUNT(*) FROM teachers WHERE status = 'pending' AND email_confirmed_at IS NOT NULL) >= ${MAX_PENDING_ACCOUNTS})`;
  try {
    const results = await db.batch<{ id?: number; too_many?: number }>([
      db.prepare('DELETE FROM signup_ips WHERE window_start <= ?').bind(dayAgo),
      db
        .prepare(
          `INSERT INTO signup_ips (ip_hash, attempts, window_start) VALUES (?, 1, ?)
           ON CONFLICT (ip_hash) DO UPDATE SET attempts = attempts + 1`,
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
          `DELETE FROM teachers WHERE email = ?2 AND status = 'pending' AND email_confirmed_at IS NULL AND created_at <= ?3
             AND NOT ${TOO_MANY}`,
        )
        .bind(input.ipHash, input.email, msBefore(now, RESEND_MINUTES * 60 * 1000)),
      db
        .prepare(
          `INSERT INTO teachers (email, name, created_at, role, status, demo, password_hash, confirm_token_hash)
           SELECT ?2, ?3, ?4, 'teacher', 'pending', 1, ?5, ?6
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
      `UPDATE teachers SET email_confirmed_at = ?, confirm_token_hash = NULL
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
// confirmed yet is not shown: nobody may approve it.
export async function listAccounts(db: D1Database): Promise<Account[]> {
  const rows = await db
    .prepare(
      `SELECT ${TEACHER_COLUMNS}, t.status, t.created_at, t.approved_at FROM teachers t
       WHERE t.status <> 'pending' OR t.email_confirmed_at IS NOT NULL
       ORDER BY CASE t.status WHEN 'pending' THEN 0 ELSE 1 END, t.name COLLATE NOCASE, t.id`,
    )
    .all<AccountRow>();
  return rows.results.map((row) => ({ ...toTeacher(row), status: row.status, createdAt: row.created_at, approvedAt: row.approved_at }));
}

// The account an administrator's page shows: ids of refused (deleted)
// accounts come back, so the page also sends the time the account was asked
// for, and the write checks both.
export interface ShownAccount {
  teacherId: number;
  createdAt: string;
}

// pending → active, once its email is confirmed. Null when the account is not
// pending (approved meanwhile, or gone), or is another account now.
export async function approveAccount(db: D1Database, shown: ShownAccount, now: string): Promise<{ email: string; name: string } | null> {
  return db
    .prepare(
      `UPDATE teachers SET status = 'active', approved_at = ?
       WHERE id = ? AND created_at = ? AND status = 'pending' AND email_confirmed_at IS NOT NULL RETURNING email, name`,
    )
    .bind(now, shown.teacherId, shown.createdAt)
    .first<{ email: string; name: string }>();
}

// Deletes accounts that still wait: they cannot have logged in, so they have
// no data. Returns how many went; the others were approved or gone meanwhile.
export async function rejectAccounts(db: D1Database, shown: ShownAccount[]): Promise<number> {
  const rows = await db
    .prepare(
      `DELETE FROM teachers WHERE status = 'pending'
         AND EXISTS (SELECT 1 FROM json_each(?) j
                     WHERE json_extract(j.value, '$.teacherId') = teachers.id
                       AND json_extract(j.value, '$.createdAt') = teachers.created_at)
       RETURNING id`,
    )
    .bind(JSON.stringify(shown))
    .all();
  return rows.results.length;
}

// An administrator changes a teacher's account (never an administrator's, nor
// one that waits). Closing it also ends its logins. False when no such account.
export async function updateAccount(
  db: D1Database,
  teacherId: number,
  change: { demo?: boolean; status?: 'active' | 'disabled' },
): Promise<boolean> {
  const demo = change.demo === undefined ? null : change.demo ? 1 : 0;
  const status = change.status ?? null;
  const [updated] = await db.batch([
    db
      .prepare(
        `UPDATE teachers SET demo = COALESCE(?, demo), status = COALESCE(?, status)
         WHERE id = ? AND role = 'teacher' AND status IN ('active', 'disabled')
         RETURNING id`,
      )
      .bind(demo, status, teacherId),
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
// otherwise log in as another. Returns the account's email and name; null when
// there is no such account.
export async function setPassword(
  db: D1Database,
  teacherId: number,
  passwordHash: string,
  options: { keepTokenHash: string | null; teachersOnly: boolean },
): Promise<{ email: string; name: string } | null> {
  const { keepTokenHash, teachersOnly } = options;
  const [updated] = await db.batch<{ email: string; name: string }>([
    db
      .prepare(
        `UPDATE teachers SET password_hash = ?, failed_logins = 0, locked_until = NULL
         WHERE id = ? AND status IN ('active', 'disabled') ${teachersOnly ? "AND role = 'teacher'" : ''}
         RETURNING email, name`,
      )
      .bind(passwordHash, teacherId),
    db
      .prepare(
        `DELETE FROM sessions WHERE teacher_id = ? AND token_hash IS NOT ?
           AND EXISTS (SELECT 1 FROM teachers WHERE id = ? AND password_hash = ?)`,
      )
      .bind(teacherId, keepTokenHash, teacherId, passwordHash),
  ]);
  return updated?.results[0] ?? null;
}
