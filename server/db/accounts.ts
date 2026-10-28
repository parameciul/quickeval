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

// A good password: a new session, the count of wrong passwords starts again,
// and the teacher's expired sessions are deleted.
export async function createSession(db: D1Database, teacherId: number, tokenHash: string, now: string, expiresAt: string): Promise<void> {
  await db.batch([
    db.prepare('UPDATE teachers SET failed_logins = 0, locked_until = NULL WHERE id = ?').bind(teacherId),
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
// account; "too_many" when MAX_PENDING_ACCOUNTS already wait.
export async function createAccount(
  db: D1Database,
  input: { name: string; email: string; passwordHash: string },
  now: string,
): Promise<'created' | 'email_taken' | 'too_many'> {
  try {
    const row = await db
      .prepare(
        `INSERT INTO teachers (email, name, created_at, role, status, demo, password_hash)
         SELECT ?, ?, ?, 'teacher', 'pending', 1, ?
         WHERE (SELECT COUNT(*) FROM teachers WHERE status = 'pending') < ?
         RETURNING id`,
      )
      .bind(input.email, input.name, now, input.passwordHash, MAX_PENDING_ACCOUNTS)
      .first<{ id: number }>();
    return row ? 'created' : 'too_many';
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
      "UPDATE teachers SET status = 'active', approved_at = ? WHERE id = ? AND created_at = ? AND status = 'pending' RETURNING email, name",
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
// teacher who changed their own password stays logged in). An administrator
// may set another active or disabled account's password, never a pending one's
// (that would approve it). False when no such account.
export async function setPassword(
  db: D1Database,
  teacherId: number,
  passwordHash: string,
  keepTokenHash: string | null,
): Promise<boolean> {
  const [updated] = await db.batch([
    db
      .prepare(
        `UPDATE teachers SET password_hash = ?, failed_logins = 0, locked_until = NULL
         WHERE id = ? AND status IN ('active', 'disabled') RETURNING id`,
      )
      .bind(passwordHash, teacherId),
    db.prepare('DELETE FROM sessions WHERE teacher_id = ? AND token_hash IS NOT ?').bind(teacherId, keepTokenHash),
  ]);
  return (updated?.results.length ?? 0) > 0;
}
