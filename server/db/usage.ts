import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { RobotWorkKind } from '../../shared/accounts.ts';
import { bucharestDay } from '../../shared/quickTry.ts';

// The column of usage_days that counts a job of each kind when it worked.
const COLUMN: Record<RobotWorkKind, string> = {
  grading: 'papers',
  barem: 'barems',
  exercise_list: 'exercise_lists',
  analysis: 'analyses',
  print: 'prints',
};

// Adds one robot job to its day's row (migration 0035): the teacher's own row,
// or the day's Quick Try row when the test is a try. The teacher and the kind
// of test come from the test row, so a test deleted in the same moment counts
// nothing, as in robot_work.
export function countRobotWorkDay(
  db: D1Database,
  work: { testId: number; kind: RobotWorkKind; ok: boolean; tokens?: number | null; at: string },
): D1PreparedStatement {
  const column = work.ok ? COLUMN[work.kind] : 'failed';
  const tokens = work.ok ? (work.tokens ?? 0) : 0;
  return db
    .prepare(
      `INSERT INTO usage_days (day, quick_try, teacher_id, ${column}, tokens)
       SELECT ?1, quick_try, CASE WHEN quick_try = 1 THEN 0 ELSE teacher_id END, 1, ?2 FROM tests WHERE id = ?3
       ON CONFLICT (day, quick_try, teacher_id) DO UPDATE SET ${column} = ${column} + 1, tokens = tokens + excluded.tokens`,
    )
    .bind(bucharestDay(new Date(work.at)), tokens, work.testId);
}

// Adds one Quick Try to its day's row, when the try of this token exists: put
// in the batch that makes the try, after its INSERT, it counts only a try that
// was made.
export function countQuickTryDay(db: D1Database, day: string, tokenHash: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO usage_days (day, quick_try, teacher_id, tries)
       SELECT ?1, 1, 0, 1 FROM quick_tries WHERE token_hash = ?2
       ON CONFLICT (day, quick_try, teacher_id) DO UPDATE SET tries = tries + 1`,
    )
    .bind(day, tokenHash);
}
