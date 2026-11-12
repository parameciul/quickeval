import type { UploadRow } from '../../../shared/api.ts';
import { papersToCheck, pointKey, pointQueue, reviewPath, type QueuedPoint } from '../reviewPage/points.ts';

// The paper page (spec 2026-11-12 §4): one student's exercises beside the
// paper. "toate" shows every exercise, "verificare" only the points to check.
export type PaperMode = 'toate' | 'verificare';

// A spot of the page: a paper, and its open exercise ("pagini" for the pages
// the robot could not read) or none.
export interface PaperSpot {
  submissionId: number;
  key: string | null;
}

// Where the page is: in the teacher app (`/teste/:code/elevi/:id`, all the
// exercises by default) or in a Quick Try (`/teste/:code/verificare`, the try's
// own route, only the points to check by default).
export type PaperPlace = 'app' | 'try';

export function defaultMode(place: PaperPlace): PaperMode {
  return place === 'app' ? 'toate' : 'verificare';
}

// The view the address names, else the place's own.
export function modeOf(params: URLSearchParams, place: PaperPlace): PaperMode {
  const asked = params.get('vedere');
  return asked === 'toate' || asked === 'verificare' ? asked : defaultMode(place);
}

// The address of a spot. The place's own view is left out of it.
export function paperPath(code: string, place: PaperPlace, spot: PaperSpot, mode: PaperMode): string {
  const params = new URLSearchParams();
  if (place === 'try') params.set('lucrare', String(spot.submissionId));
  if (spot.key !== null) params.set('punct', spot.key);
  if (mode !== defaultMode(place)) params.set('vedere', mode);
  const base = place === 'app' ? `/teste/${code}/elevi/${spot.submissionId}` : reviewPath(code);
  const search = params.toString();
  return search ? `${base}?${search}` : base;
}

// The students of the list: every upload with a paper. Only the points to
// check: the papers with points first, then the others, each group by name.
export function listedPapers(uploads: UploadRow[], mode: PaperMode): (UploadRow & { submissionId: number })[] {
  const papers = uploads.filter((row): row is UploadRow & { submissionId: number } => row.submissionId !== null);
  if (mode === 'toate') return papers;
  const withPoints = new Set(papersToCheck(uploads).map((row) => row.submissionId));
  return [...papers.filter((row) => withPoints.has(row.submissionId)), ...papers.filter((row) => !withPoints.has(row.submissionId))];
}

// The points J and K walk through: every point of the test while only the
// points to check show, else the points of the open paper.
export function walkedPoints(uploads: UploadRow[], mode: PaperMode, submissionId: number): QueuedPoint[] {
  const queue = pointQueue(uploads);
  return mode === 'verificare' ? queue : queue.filter((entry) => entry.submissionId === submissionId);
}

// Where a student opens from the list: on the first point while only the
// points to check show, else with no exercise open.
export function studentSpot(row: UploadRow & { submissionId: number }, mode: PaperMode): PaperSpot {
  const first = row.reviewPoints[0];
  return { submissionId: row.submissionId, key: mode === 'verificare' && first ? pointKey(first) : null };
}
