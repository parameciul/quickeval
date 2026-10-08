import type { D1Database } from '@cloudflare/workers-types';
import { LEASE_STALE_MS, type CheckResult } from '../../shared/runner.ts';
import { promoteStatements } from './lifecycle.ts';

// Queries of the robot API (spec §11.3). Each write checks its own rules in
// its SQL: runs can overlap, and parallel tasks of one run call at once.

// The time before which a heartbeat is stale.
export function staleBefore(now: string): string {
  return new Date(Date.parse(now) - LEASE_STALE_MS).toISOString();
}

// Work the robot can take now, as SQL conditions.
// A test in evaluation that waits for its exercise list.
export const NEEDS_EXERCISE_LIST = `t.status = 'evaluating' AND t.exercise_list_status = 'none'
  AND EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status = 'submitted')`;
// An upload (s) that can be graded: its test (t) is in evaluation with a usable exercise list.
export const GRADABLE = `s.status = 'submitted' AND t.status = 'evaluating' AND t.exercise_list_status IN ('ready', 'accepted')`;
// A test whose class analysis was asked for, with nothing left to grade.
export const NEEDS_ANALYSIS = `t.status = 'evaluating' AND t.analysis_status = 'requested'
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status IN ('submitted', 'grading'))`;

// The robot's regular check, in one transaction:
// - an upload left in grading by a run that died or ended goes back to the
//   queue, so no upload is lost when no new run takes the lease;
// - scheduled evaluations whose time has come start, and finished tests end;
// - the time of the check is saved for the robot line;
// - the counts say whether a run has work.
export async function runCheck(db: D1Database, now: string): Promise<CheckResult> {
  const results = await db.batch<{ exercise_lists: number; pending_grading: number; analyses: number }>([
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', run_id = NULL
         WHERE status = 'grading' AND NOT EXISTS (
           SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = submissions.run_id AND r.heartbeat_at >= ?)`,
      )
      .bind(staleBefore(now)),
    ...promoteStatements(db, now),
    db.prepare('UPDATE runner_state SET last_check_at = ? WHERE id = 1').bind(now),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_EXERCISE_LIST}) AS exercise_lists,
         (SELECT COUNT(*) FROM submissions s JOIN tests t ON t.id = s.test_id WHERE ${GRADABLE}) AS pending_grading,
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_ANALYSIS}) AS analyses`,
    ),
  ]);
  const counts = results.at(-1)?.results[0];
  const exerciseLists = counts?.exercise_lists ?? 0;
  const pendingGrading = counts?.pending_grading ?? 0;
  const analyses = counts?.analyses ?? 0;
  return { hasWork: exerciseLists + pendingGrading + analyses > 0, exerciseLists, pendingGrading, analyses };
}
