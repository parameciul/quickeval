import type { D1Database } from '@cloudflare/workers-types';
import type { AccountStatus, Role } from '../../shared/accounts.ts';
import type { Account, Teacher } from '../../shared/api.ts';
import { isUniqueViolation } from '../errors.ts';

// Teacher accounts and logins. Writes check their own rules in their SQL.

// After this many wrong passwords in a row, the account refuses logins for LOCK_MS.
export const MAX_FAILED_LOGINS = 10;
export const LOCK_MS = 15 * 60 * 1000;
// At most this many accounts wait for approval: a stream of sign-ups cannot fill the table.
export const MAX_PENDING_ACCOUNTS = 50;
// At most this many sign-ups from one IP in a day, so one visitor cannot fill the waiting list.
export const MAX_SIGNUPS_PER_IP = 3;
// An account that waits this long is deleted at the next sign-up.
export const PENDING_DAYS = 30;
// A browser that logged in before stops being known after this long unused.
export const DEVICE_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const daysBefore = (now: string, days: number) => new Date(Date.parse(now) - days * DAY_MS).toISOString();

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
}

// Takes one login attempt of the account before its password is checked: the
// count goes up first, and the attempt that reaches MAX_FAILED_LOGINS locks
// the account for LOCK_MS. The lock is checked in the same statement, so many
// attempts sent at once cannot get past it (D1 runs writes one at a time). A
// good password starts the count again (createSession). After a lock ends, the
// count starts at this attempt. "locked" while the lock lasts; null for an
// unknown email.
export async function takeLoginAttempt(db: D1Database, email: string, now: string): Promise<LoginRow | 'locked' | null> {
  const lockedUntil = new Date(Date.parse(now) + LOCK_MS).toISOString();
  const row = await db
    .prepare(
      `UPDATE teachers SET
         failed_logins = CASE WHEN locked_until IS NULL THEN failed_logins + 1 ELSE 1 END,
         locked_until = CASE WHEN locked_until IS NULL AND failed_logins + 1 >= ? THEN ? ELSE NULL END
       WHERE email = ? AND (locked_until IS NULL OR locked_until <= ?)
       RETURNING id, status, password_hash`,
    )
    .bind(MAX_FAILED_LOGINS, lockedUntil, email, now)
    .first<LoginRow>();
  if (row) return row;
  const exists = await db.prepare('SELECT 1 AS found FROM teachers WHERE email = ?').bind(email).first();
  return exists ? 'locked' : null;
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
  return db.prepare('SELECT id, status, password_hash FROM teachers WHERE id = ?').bind(device.teacher_id).first<LoginRow>();
}

export interface NewSession {
  teacherId: number;
  tokenHash: string;
  expiresAt: string;
  // The browser's qe_device token hash; `known` when the login went through it.
  device: { hash: string; known: boolean };
}

// A good password: a new session, and the teacher's expired sessions and
// long-unused browsers are deleted. A login through the account starts the
// account's count of wrong passwords again; a login through a known browser
// starts that browser's count again and leaves the account's lock as it is,
// so the teacher's logins never lift a lock that someone else's guesses set.
// A browser that was not known becomes known.
export async function createSession(db: D1Database, session: NewSession, now: string): Promise<void> {
  const { teacherId, tokenHash, expiresAt, device } = session;
  await db.batch([
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

// A new account: a teacher, pending, demo. "email_taken" when the email has an
// account; "too_many" when MAX_PENDING_ACCOUNTS already wait, or this IP
// (`ipHash`) asked for MAX_SIGNUPS_PER_IP accounts in the last day that still
// wait. Accounts that waited PENDING_DAYS are deleted first.
export async function createAccount(
  db: D1Database,
  input: { name: string; email: string; passwordHash: string; ipHash: string },
  now: string,
): Promise<'created' | 'email_taken' | 'too_many'> {
  try {
    const [, inserted] = await db.batch<{ id: number }>([
      db.prepare("DELETE FROM teachers WHERE status = 'pending' AND created_at <= ?").bind(daysBefore(now, PENDING_DAYS)),
      db
        .prepare(
          `INSERT INTO teachers (email, name, created_at, role, status, demo, password_hash, signup_ip_hash)
           SELECT ?, ?, ?, 'teacher', 'pending', 1, ?, ?
           WHERE (SELECT COUNT(*) FROM teachers WHERE status = 'pending') < ?
             AND (SELECT COUNT(*) FROM teachers WHERE status = 'pending' AND signup_ip_hash = ? AND created_at > ?) < ?
           RETURNING id`,
        )
        .bind(
          input.email,
          input.name,
          now,
          input.passwordHash,
          input.ipHash,
          MAX_PENDING_ACCOUNTS,
          input.ipHash,
          daysBefore(now, 1),
          MAX_SIGNUPS_PER_IP,
        ),
    ]);
    return inserted?.results.length ? 'created' : 'too_many';
  } catch (err) {
    if (isUniqueViolation(err)) return 'email_taken';
    throw err;
  }
}

// The addresses that hear about new accounts.
export async function adminEmails(db: D1Database): Promise<string[]> {
  const rows = await db.prepare("SELECT email FROM teachers WHERE role = 'admin' AND status = 'active' ORDER BY id").all<{ email: string }>();
  return rows.results.map((row) => row.email);
}

// Pending accounts first, then by name.
export async function listAccounts(db: D1Database): Promise<Account[]> {
  const rows = await db
    .prepare(
      `SELECT ${TEACHER_COLUMNS}, t.status, t.created_at, t.approved_at FROM teachers t
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

// pending → active. Null when the account is not pending (approved meanwhile,
// or gone), or is another account now.
export async function approveAccount(db: D1Database, shown: ShownAccount, now: string): Promise<{ email: string; name: string } | null> {
  return db
    .prepare(
      `UPDATE teachers SET status = 'active', approved_at = ?, signup_ip_hash = NULL
       WHERE id = ? AND created_at = ? AND status = 'pending' RETURNING email, name`,
    )
    .bind(now, shown.teacherId, shown.createdAt)
    .first<{ email: string; name: string }>();
}

// Deletes an account that still waits: it cannot have logged in, so it has no data.
export async function rejectAccount(db: D1Database, shown: ShownAccount): Promise<boolean> {
  const row = await db
    .prepare("DELETE FROM teachers WHERE id = ? AND created_at = ? AND status = 'pending' RETURNING id")
    .bind(shown.teacherId, shown.createdAt)
    .first();
  return row !== null;
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
