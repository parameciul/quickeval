import { describe, expect, it } from 'vitest';
import type { ReviewPoint } from '../../../shared/api.ts';
import { fakeEvaluation, fakeItem, fakePoint, fakeSubmission, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import {
  firstSpot,
  otherPapers,
  pageIndex,
  papersToCheck,
  pointKey,
  pointName,
  pointQueue,
  reviewPath,
  stepPoint,
  withoutPoint,
  type QueuedPoint,
} from './points.ts';

const pages: ReviewPoint = { kind: 'pages', pages: ['student/page-02.jpg'] };

// Ana has the pages and one item to check, Ion one item; Eva has none, Dan
// was not graded yet, and Mara sent nothing.
const uploads = () => [
  fakeUpload({ studentId: 1, studentName: 'Ana Pop', submissionId: 11, status: 'graded', grade: 8, flagCount: 2, reviewPoints: [pages, fakePoint(5)] }),
  fakeUpload({ studentId: 2, studentName: 'Dan Marin', submissionId: 12, status: 'submitted' }),
  fakeUpload({ studentId: 3, studentName: 'Eva Stan', submissionId: 13, status: 'graded', grade: 9 }),
  fakeUpload({ studentId: 4, studentName: 'Ion Popa', submissionId: 14, status: 'graded', grade: 7, flagCount: 1, reviewPoints: [fakePoint(9)] }),
  fakeUpload({ studentId: 5, studentName: 'Mara Ilie' }),
];

const keys = (queue: (QueuedPoint | null)[]) => queue.map((entry) => (entry ? `${entry.submissionId}:${pointKey(entry.point)}` : null));

describe('the points of the review', () => {
  it('names a point by its item, or "pagini" for the pages', () => {
    expect(pointKey(fakePoint(5))).toBe('5');
    expect(pointKey(pages)).toBe('pagini');
  });

  it('splits the graded papers into those with points to check and the others', () => {
    expect(papersToCheck(uploads()).map((row) => row.studentName)).toEqual(['Ana Pop', 'Ion Popa']);
    expect(otherPapers(uploads()).map((row) => row.studentName)).toEqual(['Eva Stan']);
  });

  it('queues the points paper by paper, the pages first', () => {
    expect(keys(pointQueue(uploads()))).toEqual(['11:pagini', '11:5', '14:9']);
  });

  it('opens on the first point, else the first other graded paper, else nowhere', () => {
    expect(firstSpot(uploads())).toEqual({ submissionId: 11, key: 'pagini' });
    const noPoints = uploads().map((row) => ({ ...row, reviewPoints: [] }));
    expect(firstSpot(noPoints)).toEqual({ submissionId: 11, key: null });
    expect(firstSpot(uploads().filter((row) => row.status !== 'graded'))).toBeNull();
  });

  it('steps to the next or the previous point, going round', () => {
    const queue = pointQueue(uploads());
    expect(keys([stepPoint(queue, { submissionId: 11, key: 'pagini' }, 1)])).toEqual(['11:5']);
    expect(keys([stepPoint(queue, { submissionId: 14, key: '9' }, 1)])).toEqual(['11:pagini']);
    expect(keys([stepPoint(queue, { submissionId: 11, key: 'pagini' }, -1)])).toEqual(['14:9']);
    // From a paper with no point open: the first or the last point.
    expect(keys([stepPoint(queue, { submissionId: 13, key: null }, 1)])).toEqual(['11:pagini']);
    expect(keys([stepPoint(queue, { submissionId: 13, key: null }, -1)])).toEqual(['14:9']);
    expect(keys([stepPoint(queue, null, 1)])).toEqual(['11:pagini']);
  });

  it('has no next point when the current one is the last, or none waits', () => {
    const last = pointQueue(uploads()).slice(2);
    expect(stepPoint(last, { submissionId: 14, key: '9' }, 1)).toBeNull();
    expect(stepPoint([], { submissionId: 14, key: '9' }, 1)).toBeNull();
    expect(stepPoint([], null, -1)).toBeNull();
  });

  it('writes the address of a paper and its point', () => {
    expect(reviewPath('6E2-26T1')).toBe('/teste/6E2-26T1/verificare');
    expect(reviewPath('6E2-26T1', { submissionId: 11 })).toBe('/teste/6E2-26T1/verificare?lucrare=11');
    expect(reviewPath('6E2-26T1', { submissionId: 11, key: 'pagini' })).toBe('/teste/6E2-26T1/verificare?lucrare=11&punct=pagini');
  });

  it('finds the page the robot names, counting from 0', () => {
    expect(pageIndex('student/page-02.jpg')).toBe(1);
    expect(pageIndex('student/page-10.pdf')).toBe(9);
    expect(pageIndex('poza.jpg')).toBeNull();
  });

  it('says a point in a few words', () => {
    expect(pointName(fakePoint(5, { label: 'Subiectul I, 3)', points: 0.5, maxPoints: 2 }))).toBe('Subiectul I, 3) · 0,5p din 2p');
    expect(pointName(pages)).toBe('Paginile necitite');
  });

  it('takes a decided point out of its paper, with the paper\'s new grade', () => {
    const detail = fakeTest({ status: 'done' }, uploads());
    const saved = fakeSubmission({
      id: 11,
      status: 'graded',
      evaluation: fakeEvaluation([fakeItem({ id: 5, exerciseId: 'E5', points: 2, needsReview: true })], {
        unreadable: ['student/page-02.jpg'],
        pagesReviewed: true,
      }),
    });
    const after = withoutPoint(detail, saved, pages);
    const ana = after.uploads.find((row) => row.submissionId === 11)!;
    expect(ana.reviewPoints).toEqual([fakePoint(5)]);
    expect(ana).toMatchObject({ grade: saved.evaluation!.grade, total: saved.evaluation!.total, flagCount: 1 });
    expect(after.uploads.find((row) => row.submissionId === 14)!.reviewPoints).toEqual([fakePoint(9)]);
    // The test kept in the cache is not changed in place.
    expect(detail.uploads[0]!.reviewPoints).toHaveLength(2);
  });

  it('counts a decided point as checked once, even when it is decided again', () => {
    const rows = uploads();
    rows[0]!.checkedCount = 1;
    const detail = fakeTest({ status: 'done' }, rows);
    const saved = fakeSubmission({
      id: 11,
      status: 'graded',
      evaluation: fakeEvaluation([fakeItem({ id: 5, exerciseId: 'E5', points: 2, needsReview: true })], {
        unreadable: ['student/page-02.jpg'],
        pagesReviewed: true,
      }),
    });
    const once = withoutPoint(detail, saved, pages);
    const ana = once.uploads.find((row) => row.submissionId === 11)!;
    expect(ana).toMatchObject({ flagCount: 1, checkedCount: 2 });
    expect(ana.reviewPoints).toHaveLength(1);
    const twice = withoutPoint(once, saved, pages);
    expect(twice.uploads.find((row) => row.submissionId === 11)!.checkedCount).toBe(2);
  });
});
