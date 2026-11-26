import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { RobotWorkKind } from '../../shared/accounts.ts';
import { bucharestDay } from '../../shared/quickTry.ts';
import { EMPTY_USAGE, type UsageCounts, type UsagePeriod, type UsageSource, type UsageStats, usageKeys } from '../../shared/usage.ts';

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
// nothing, as in robot_work. A job that worked and that the backup Claude
// account did (only Quick Try work) also counts in backup_jobs (migration 0039).
export function countRobotWorkDay(
  db: D1Database,
  work: { testId: number; kind: RobotWorkKind; ok: boolean; tokens?: number | null; backup?: boolean; at: string },
): D1PreparedStatement {
  const column = work.ok ? COLUMN[work.kind] : 'failed';
  const tokens = work.ok ? (work.tokens ?? 0) : 0;
  const backup = work.ok && work.backup === true ? 1 : 0;
  return db
    .prepare(
      `INSERT INTO usage_days (day, quick_try, teacher_id, ${column}, tokens, backup_jobs)
       SELECT ?1, quick_try, CASE WHEN quick_try = 1 THEN 0 ELSE teacher_id END, 1, ?2, ?4 FROM tests WHERE id = ?3
       ON CONFLICT (day, quick_try, teacher_id) DO UPDATE SET ${column} = ${column} + 1, tokens = tokens + excluded.tokens,
         backup_jobs = backup_jobs + excluded.backup_jobs`,
    )
    .bind(bucharestDay(new Date(work.at)), tokens, work.testId, backup);
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

const SOURCE_FILTER: Record<UsageSource, string> = { all: '', 'quick-try': 'AND quick_try = 1', teachers: 'AND quick_try = 0' };

// The usage statistics of a period ending today (Bucharest): one query that
// adds the rows of each day (or month) in SQL. A day with no row shows zeros.
export async function readUsage(db: D1Database, source: UsageSource, period: UsagePeriod, now: string): Promise<UsageStats> {
  const keys = usageKeys(period, bucharestDay(new Date(now)));
  const length = period === '12m' ? 7 : 10;
  const from = period === '12m' ? `${keys.at(-1)}-01` : keys.at(-1)!;
  const { results } = await db
    .prepare(
      `SELECT substr(day, 1, ?1) AS key, SUM(papers) AS papers, SUM(barems) AS barems, SUM(exercise_lists) AS exerciseLists,
         SUM(analyses) AS analyses, SUM(prints) AS prints, SUM(failed) AS failed, SUM(tokens) AS tokens, SUM(tries) AS tries,
         SUM(backup_jobs) AS backupJobs
       FROM usage_days WHERE day >= ?2 ${SOURCE_FILTER[source]} GROUP BY key`,
    )
    .bind(length, from)
    .all<UsageCounts & { key: string }>();
  const byKey = new Map(results.map((row) => [row.key, row]));
  const rows = keys.map((key) => {
    const { key: _, ...counts } = byKey.get(key) ?? { key, ...EMPTY_USAGE };
    return { key, ...counts };
  });
  const totals = { ...EMPTY_USAGE };
  for (const row of rows) for (const name of Object.keys(totals) as (keyof UsageCounts)[]) totals[name] += row[name];
  return { source, period, totals, rows };
}
