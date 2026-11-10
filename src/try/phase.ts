import type { TestDetail, UploadRow } from '../../shared/api.ts';
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';
import { formatPoints } from '../../shared/scoring.ts';
import { countLabel } from '../ui/format.ts';

// Where a try stands (spec §3.3), from its test:
// - prepare: the files are being sent, or the robot's barem is made or waits
//   for "Pornește corectarea" (states 1 and 2);
// - grading: the paper went to grading (state 3);
// - problem: the barem's points do not add up, and the teacher decides;
// - failed: the robot could not make the barem, read the test and the barem,
//   or grade the paper; the try gives its place back (state 5);
// - graded: the paper is graded (state 4).
export type TryPhase = 'prepare' | 'grading' | 'problem' | 'failed' | 'graded';

// The try's one paper.
export function paperOf(detail: TestDetail): UploadRow | null {
  return detail.uploads[0] ?? null;
}

export function phaseOf(detail: TestDetail): TryPhase {
  const { test } = detail;
  const status = paperOf(detail)?.status ?? 'none';
  // The same three failures as the server's give-back (server/db/quickTry.ts).
  if (test.barem.request === 'failed' || test.exerciseList.status === 'failed' || status === 'failed') return 'failed';
  if (status === 'graded') return 'graded';
  if (status === 'submitted' || status === 'grading') return test.exerciseList.status === 'problem' ? 'problem' : 'grading';
  return 'prepare';
}

// The page reads the test again every 10 s while the robot works for it: a
// barem it makes, or the grading.
export function refreshOf(detail: TestDetail | undefined): number | false {
  if (!detail) return false;
  const phase = phaseOf(detail);
  return phase === 'grading' || (phase === 'prepare' && detail.test.barem.request === 'requested') ? 10_000 : false;
}

// The changes of the test and barem files a try has left (the server's cap;
// the robot's own barem counts as one).
export function fileChangesLeft(detail: TestDetail): number {
  return Math.max(0, QUICK_TRY_FILE_CHANGES - detail.test.filesVersion);
}

// The graded paper's grade and points ("6,7", "67 din 100 de puncte"); null
// before it is graded.
export function scoreOf(detail: TestDetail): { grade: string; points: string } | null {
  const paper = paperOf(detail);
  if (phaseOf(detail) !== 'graded' || paper?.grade == null || paper.total == null || paper.maxTotal == null) return null;
  return { grade: formatPoints(paper.grade), points: `${formatPoints(paper.total)} din ${countLabel(paper.maxTotal, 'punct', 'puncte')}` };
}
