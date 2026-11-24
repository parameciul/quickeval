import type { UploadRow } from '../../../shared/api.ts';
import type { TestStatus } from '../../../shared/tests.ts';
import { heldBack } from '../testPage/paperCounts.ts';
import { papersToCheck, pointKey, pointQueue, reviewPath, type QueuedPoint } from '../reviewPage/points.ts';

// The paper page (spec 2026-11-12 §4): one student's exercises beside the
// paper. "all" shows every exercise, "review" only the points to check.
export type PaperMode = 'all' | 'review';

// A spot of the page: a paper, and its open exercise ("pages" for the pages
// the robot could not read) or none.
export interface PaperSpot {
  submissionId: number;
  key: string | null;
}

// Where the page is: in the teacher app (`/tests/:code/papers/:id`, all the
// exercises by default) or in a Quick Try (`/tests/:code/review`, the try's
// own route, only the points to check by default).
export type PaperPlace = 'app' | 'try';

export function defaultMode(place: PaperPlace): PaperMode {
  return place === 'app' ? 'all' : 'review';
}

// The view the address names, else the place's own.
export function modeOf(params: URLSearchParams, place: PaperPlace): PaperMode {
  const asked = params.get('view');
  return asked === 'all' || asked === 'review' ? asked : defaultMode(place);
}

// The address of a spot. The place's own view is left out of it.
export function paperPath(code: string, place: PaperPlace, spot: PaperSpot, mode: PaperMode): string {
  const params = new URLSearchParams();
  if (place === 'try') params.set('paper', String(spot.submissionId));
  if (spot.key !== null) params.set('item', spot.key);
  if (mode !== defaultMode(place)) params.set('view', mode);
  const base = place === 'app' ? `/tests/${code}/papers/${spot.submissionId}` : reviewPath(code);
  const search = params.toString();
  return search ? `${base}?${search}` : base;
}

// Where a paper is, for the order of the students: graded, then sent and
// not graded yet (waiting, being graded, failed, or held back once the
// uploads closed), then still being sent.
function stageOf(row: UploadRow, testStatus: TestStatus): number {
  if (row.status === 'graded') return 0;
  if (row.status === 'uploading' && !heldBack(row.status, row.fileCount, testStatus)) return 2;
  return 1;
}

// The students of the list, of "Elev 2/7" and of its arrows: every upload
// with a paper, the graded first, then the sent ones not graded yet, then
// the ones still sending, each group in the class's order. Only the points
// to check: the papers with points, and the open paper, which stays in its
// place after its last point is checked.
export function listedPapers(
  uploads: UploadRow[],
  mode: PaperMode,
  testStatus: TestStatus,
  current: number | null = null,
): (UploadRow & { submissionId: number })[] {
  const papers = uploads.filter((row): row is UploadRow & { submissionId: number } => row.submissionId !== null);
  if (mode === 'review') {
    const withPoints = new Set(papersToCheck(uploads).map((row) => row.submissionId));
    return papers.filter((row) => withPoints.has(row.submissionId) || row.submissionId === current);
  }
  return [0, 1, 2].flatMap((stage) => papers.filter((row) => stageOf(row, testStatus) === stage));
}

// The students who sent nothing: no paper, still in the class.
export function papersMissing(uploads: UploadRow[]): UploadRow[] {
  return uploads.filter((row) => row.submissionId === null && row.active);
}

// Where "Doar de verificat" opens: the open point of the open paper, else its
// first point, else the first point of the test, else the open paper as it is.
export function reviewSpot(uploads: UploadRow[], spot: PaperSpot): PaperSpot {
  const own = pointQueue(uploads).filter((entry) => entry.submissionId === spot.submissionId);
  if (own.some((entry) => pointKey(entry.point) === spot.key)) return spot;
  if (own[0]) return { submissionId: spot.submissionId, key: pointKey(own[0].point) };
  const first = pointQueue(uploads)[0];
  return first ? { submissionId: first.submissionId, key: pointKey(first.point) } : spot;
}

// The points J and K walk through: every point of the test while only the
// points to check show, else the points of the open paper.
export function walkedPoints(uploads: UploadRow[], mode: PaperMode, submissionId: number): QueuedPoint[] {
  const queue = pointQueue(uploads);
  return mode === 'review' ? queue : queue.filter((entry) => entry.submissionId === submissionId);
}

// Where a student opens from the list: on the first point while only the
// points to check show, else with no exercise open.
export function studentSpot(row: UploadRow & { submissionId: number }, mode: PaperMode): PaperSpot {
  const first = row.reviewPoints[0];
  return { submissionId: row.submissionId, key: mode === 'review' && first ? pointKey(first) : null };
}
