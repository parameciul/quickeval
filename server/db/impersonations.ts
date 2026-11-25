import type { D1Database } from '@cloudflare/workers-types';
import type { AccountView, Teacher, ViewEndReason, Viewing, ViewMode } from '../../shared/api.ts';
import { TEACHER_COLUMNS, type TeacherRow, toTeacher } from './accounts.ts';

// An administrator's view of a teacher's account. The row is also the log, so
// it is kept for VIEW_KEEP_DAYS after it starts. Writes check their own rules
// in their SQL.

export const VIEW_MS = 3_600_000;
export const VIEW_KEEP_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 50;

export interface NewView {
  adminId: number;
  teacherId: number;
  sessionHash: string;
  tokenHash: string;
  mode: ViewMode;
}

export interface FoundView {
  viewing: Viewing;
  teacher: Teacher;
  adminId: number;
}

// Called only after the administrator's password was checked as right, so it
// also starts that account's count of wrong passwords again. Null when the
// caller is not an active administrator or the target is not an active
// teacher (not an administrator, not a Quick Try guest).
export async function startView(db: D1Database, view: NewView, now: string): Promise<Viewing | null> {
  const expiresAt = new Date(Date.parse(now) + VIEW_MS).toISOString();
  const oldest = new Date(Date.parse(now) - VIEW_KEEP_DAYS * DAY_MS).toISOString();
  const results = await db.batch<{ id: number }>([
    db.prepare('UPDATE teachers SET failed_logins = 0, locked_until = NULL WHERE id = ?').bind(view.adminId),
    db.prepare('DELETE FROM impersonations WHERE started_at < ?').bind(oldest),
    db
      .prepare("UPDATE impersonations SET ended_at = expires_at, end_reason = 'expired' WHERE ended_at IS NULL AND expires_at <= ?")
      .bind(now),
    db
      .prepare(
        `UPDATE impersonations SET ended_at = ?, end_reason = 'replaced'
         WHERE session_hash = ? AND ended_at IS NULL
           AND EXISTS (
             SELECT 1 FROM teachers a, teachers t
             WHERE a.id = ? AND a.role = 'admin' AND a.status = 'active'
               AND t.id = ? AND t.role = 'teacher' AND t.status = 'active' AND t.quick_try = 0
           )`,
      )
      .bind(now, view.sessionHash, view.adminId, view.teacherId),
    db
      .prepare(
        `INSERT INTO impersonations (token_hash, session_hash, admin_id, teacher_id, mode, started_at, expires_at)
         SELECT ?, ?, a.id, t.id, ?, ?, ?
         FROM teachers a, teachers t
         WHERE a.id = ? AND a.role = 'admin' AND a.status = 'active'
           AND t.id = ? AND t.role = 'teacher' AND t.status = 'active' AND t.quick_try = 0
         RETURNING id`,
      )
      .bind(view.tokenHash, view.sessionHash, view.mode, now, expiresAt, view.adminId, view.teacherId),
  ]);
  const id = results[4]?.results[0]?.id;
  if (id === undefined) return null;
  const teacher = await db.prepare('SELECT name FROM teachers WHERE id = ?').bind(view.teacherId).first<{ name: string }>();
  return { id, teacher: { id: view.teacherId, name: teacher?.name ?? '' }, mode: view.mode, expiresAt };
}

interface FoundRow extends TeacherRow {
  view_id: number;
  view_mode: ViewMode;
  view_expires_at: string;
  view_admin_id: number;
}

// The live view of this token, only from the administrator's own session, and
// only while that session, the administrator and the teacher still qualify.
export async function findView(db: D1Database, tokenHash: string, sessionHash: string, now: string): Promise<FoundView | null> {
  const row = await db
    .prepare(
      `SELECT ${TEACHER_COLUMNS}, i.id AS view_id, i.mode AS view_mode, i.expires_at AS view_expires_at, i.admin_id AS view_admin_id
       FROM impersonations i
       JOIN sessions s ON s.token_hash = i.session_hash AND s.teacher_id = i.admin_id
       JOIN teachers a ON a.id = i.admin_id
       JOIN teachers t ON t.id = i.teacher_id
       WHERE i.token_hash = ? AND i.session_hash = ? AND i.ended_at IS NULL AND i.expires_at > ?
         AND s.expires_at > ?
         AND a.role = 'admin' AND a.status = 'active'
         AND t.role = 'teacher' AND t.status = 'active' AND t.quick_try = 0`,
    )
    .bind(tokenHash, sessionHash, now, now)
    .first<FoundRow>();
  if (!row) return null;
  return {
    viewing: { id: row.view_id, teacher: { id: row.id, name: row.name }, mode: row.view_mode, expiresAt: row.view_expires_at },
    teacher: toTeacher(row),
    adminId: row.view_admin_id,
  };
}

// The administrator leaves the view.
export async function endView(db: D1Database, tokenHash: string, now: string): Promise<void> {
  await db
    .prepare("UPDATE impersonations SET ended_at = ?, end_reason = 'exit' WHERE token_hash = ? AND ended_at IS NULL")
    .bind(now, tokenHash)
    .run();
}

// A view found dead: 'expired' once its time passed, 'session_gone' otherwise.
export async function closeDeadView(db: D1Database, tokenHash: string, now: string): Promise<void> {
  await db
    .prepare(
      `UPDATE impersonations
       SET ended_at = CASE WHEN expires_at <= ? THEN expires_at ELSE ? END,
           end_reason = CASE WHEN expires_at <= ? THEN 'expired' ELSE 'session_gone' END
       WHERE token_hash = ? AND ended_at IS NULL`,
    )
    .bind(now, now, now, tokenHash)
    .run();
}

interface ViewRow {
  admin_id: number | null;
  admin_name: string | null;
  started_at: string;
  ended_at: string | null;
  end_reason: ViewEndReason | null;
}

export async function listAccountViews(db: D1Database, teacherId: number, now: string): Promise<AccountView[]> {
  const { results } = await db
    .prepare(
      `SELECT i.admin_id, a.name AS admin_name, i.started_at,
         CASE WHEN i.ended_at IS NULL AND i.expires_at <= ? THEN i.expires_at ELSE i.ended_at END AS ended_at,
         CASE WHEN i.ended_at IS NULL AND i.expires_at <= ? THEN 'expired' ELSE i.end_reason END AS end_reason
       FROM impersonations i LEFT JOIN teachers a ON a.id = i.admin_id
       WHERE i.teacher_id = ? ORDER BY i.started_at DESC, i.id DESC LIMIT ${LIST_LIMIT}`,
    )
    .bind(now, now, teacherId)
    .all<ViewRow>();
  return results.map((row) => ({
    admin: row.admin_id === null ? null : { id: row.admin_id, name: row.admin_name ?? '' },
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
  }));
}
