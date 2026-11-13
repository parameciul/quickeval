import type { D1Database } from '@cloudflare/workers-types';

// What the teacher pages show changed when this text changed: the teacher's
// number in `teacher_versions` (migration 0032: triggers add one on every
// change of a test, an upload, its files, a grading or its points) and, while
// GitHub did not take the last start of the robot, the robot's last check
// (the test page's "start failed" note). Two rows, whatever the teacher has.
export async function dataVersion(db: D1Database, teacherId: number): Promise<string> {
  const row = await db
    .prepare(
      `SELECT (SELECT version FROM teacher_versions WHERE teacher_id = ?) AS version,
         r.start_failed_at, r.last_check_at
       FROM (SELECT 1) LEFT JOIN runner_state r ON r.id = 1`,
    )
    .bind(teacherId)
    .first<{ version: number | null; start_failed_at: string | null; last_check_at: string | null }>();
  const failedAt = row?.start_failed_at ?? null;
  return [row?.version ?? 0, failedAt ?? '', failedAt === null ? '' : (row?.last_check_at ?? '')].join('|');
}
