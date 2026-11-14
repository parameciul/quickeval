import type { ReviewPoint, SubmissionDetail, TestDetail, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';

// The review of the points to check (redesign spec §7): which points wait, in
// which order, and the address of each.

// A graded paper, which always has its upload.
export type GradedRow = UploadRow & { submissionId: number };

// A point to check and the paper it is on.
export interface QueuedPoint {
  submissionId: number;
  studentName: string;
  point: ReviewPoint;
}

// Where the review stands: a paper, and one of its points or none.
export interface ReviewSpot {
  submissionId: number;
  key: string | null;
}

// The point's name in the address: the item's id, or "pagini" for the pages
// the robot could not read.
export function pointKey(point: ReviewPoint): string {
  return point.kind === 'pages' ? 'pagini' : String(point.itemId);
}

function isGraded(row: UploadRow): row is GradedRow {
  return row.status === 'graded' && row.submissionId !== null;
}

// The graded papers with points to check, in the order of the uploads list
// (by the student's name).
export function papersToCheck(uploads: UploadRow[]): GradedRow[] {
  return uploads.filter(isGraded).filter((row) => row.reviewPoints.length > 0);
}

// Every other graded paper.
export function otherPapers(uploads: UploadRow[]): GradedRow[] {
  return uploads.filter(isGraded).filter((row) => row.reviewPoints.length === 0);
}

// Every point to check: paper by paper, and in a paper as the API lists them
// (the pages first, then the exercises in the barem's order).
export function pointQueue(uploads: UploadRow[]): QueuedPoint[] {
  return papersToCheck(uploads).flatMap((row) =>
    row.reviewPoints.map((point) => ({ submissionId: row.submissionId, studentName: row.studentName, point })),
  );
}

// Where the review opens without a paper in its address: the first point,
// else the first other graded paper; null before any paper is graded.
export function firstSpot(uploads: UploadRow[]): ReviewSpot | null {
  const first = pointQueue(uploads)[0];
  if (first) return { submissionId: first.submissionId, key: pointKey(first.point) };
  const other = otherPapers(uploads)[0];
  return other ? { submissionId: other.submissionId, key: null } : null;
}

export function isSpotOf(entry: QueuedPoint, spot: ReviewSpot | null): boolean {
  return spot !== null && entry.submissionId === spot.submissionId && pointKey(entry.point) === spot.key;
}

// The point after (1) or before (-1) the spot, going round the queue. From a
// spot that is not a point of the queue: the first or the last point. Null
// when no other point waits.
export function stepPoint(queue: QueuedPoint[], spot: ReviewSpot | null, step: 1 | -1): QueuedPoint | null {
  const index = queue.findIndex((entry) => isSpotOf(entry, spot));
  if (index === -1) return (step === 1 ? queue[0] : queue[queue.length - 1]) ?? null;
  if (queue.length === 1) return null;
  return queue[(index + step + queue.length) % queue.length] ?? null;
}

// The address of the review, on a paper and maybe one of its points.
export function reviewPath(code: string, spot?: { submissionId: number; key?: string | null }): string {
  const base = `/teste/${code}/verificare`;
  if (spot === undefined) return base;
  return spot.key ? `${base}?lucrare=${spot.submissionId}&punct=${spot.key}` : `${base}?lucrare=${spot.submissionId}`;
}

// The page of an upload that the robot names "student/page-02.jpg": the
// upload's files in order, from 0. Null for a name without a number.
export function pageIndex(name: string): number | null {
  const match = /page-(\d+)\.[a-z]+$/.exec(name);
  return match ? Number(match[1]) - 1 : null;
}

// Points as the review writes them: "1p", "0,5p".
export function pointsText(value: number): string {
  return `${formatPoints(value)}p`;
}

// "Subiectul I, 3) · 1p din 2p", or "Paginile necitite".
export function pointName(point: ReviewPoint): string {
  return point.kind === 'pages' ? 'Paginile necitite' : `${point.label} · ${pointsText(point.points)} din ${pointsText(point.maxPoints)}`;
}

// The test after a decision on one of its points, before the API is read
// again: the point leaves the paper's list, and the paper shows its new grade.
export function withoutPoint(detail: TestDetail, saved: SubmissionDetail, point: ReviewPoint): TestDetail {
  const key = pointKey(point);
  return {
    ...detail,
    uploads: detail.uploads.map((row) => {
      if (row.submissionId !== saved.id) return row;
      // A point decided again (a change of mind) was counted the first time.
      const left = row.reviewPoints.filter((other) => pointKey(other) !== key);
      return {
        ...row,
        grade: saved.evaluation?.grade ?? row.grade,
        total: saved.evaluation?.total ?? row.total,
        flagCount: saved.evaluation?.flagCount ?? row.flagCount,
        checkedCount: row.checkedCount + (left.length < row.reviewPoints.length ? 1 : 0),
        reviewPoints: left,
      };
    }),
  };
}
