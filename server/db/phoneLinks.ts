import type { D1Database } from '@cloudflare/workers-types';
import type { Teacher } from '../../shared/api.ts';
import { TEACHER_COLUMNS, toTeacher, type TeacherRow } from './accounts.ts';

// A phone link of a test (migration 0041), as the phone router needs it: the
// test's code and its teacher, an active account only.
export interface PhoneLink {
  testId: number;
  code: string;
  expiresAt: string;
  teacher: Teacher;
}

// A new link for a test of this teacher: not a Quick Try's (its own link does
// that) and not archived. Every expired link goes in the same batch, so the
// table holds only the links of the last day.
// False when the test is not one the teacher may photograph for.
export async function createPhoneLink(
  db: D1Database,
  teacherId: number,
  testId: number,
  tokenHash: string,
  now: string,
  expiresAt: string,
): Promise<boolean> {
  const [, inserted] = await db.batch([
    db.prepare('DELETE FROM test_phone_links WHERE expires_at <= ?').bind(now),
    db
      .prepare(
        `INSERT INTO test_phone_links (token_hash, test_id, created_at, expires_at)
         SELECT ?, t.id, ?, ? FROM tests t
         WHERE t.id = ? AND t.teacher_id = ? AND t.quick_try = 0 AND t.archived = 0`,
      )
      .bind(tokenHash, now, expiresAt, testId, teacherId),
  ]);
  return (inserted?.meta.changes ?? 0) === 1;
}

// The link of a token hash with its test and its teacher, or null (unknown,
// or the teacher's account is not active). Expired links are found too: the
// router answers them with their own message.
export async function findPhoneLink(db: D1Database, tokenHash: string): Promise<PhoneLink | null> {
  const row = await db
    .prepare(
      `SELECT ${TEACHER_COLUMNS}, l.test_id AS link_test_id, x.code AS link_code, l.expires_at AS link_expires_at
       FROM test_phone_links l JOIN tests x ON x.id = l.test_id JOIN teachers t ON t.id = x.teacher_id
       WHERE l.token_hash = ? AND t.status = 'active'`,
    )
    .bind(tokenHash)
    .first<TeacherRow & { link_test_id: number; link_code: string; link_expires_at: string }>();
  if (!row) return null;
  return { testId: row.link_test_id, code: row.link_code, expiresAt: row.link_expires_at, teacher: toTeacher(row) };
}
