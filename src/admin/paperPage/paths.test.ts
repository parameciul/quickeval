import { describe, expect, it } from 'vitest';
import { fakeUpload } from '../../test/fakeApi.ts';
import { pointKey } from '../reviewPage/points.ts';
import { absentPaper, listedPapers, papersMissing, reviewSpot } from './paths.ts';

// A class in every state, in the class's order (by name).
const rows = [
  fakeUpload({ studentId: 1, studentName: 'Ana Pop', submissionId: 11, status: 'graded', grade: 6, flagCount: 2 }),
  fakeUpload({ studentId: 2, studentName: 'Dan Marin', submissionId: 12, status: 'submitted', fileCount: 2 }),
  fakeUpload({ studentId: 3, studentName: 'Eva Stan', submissionId: 13, status: 'graded', grade: 9 }),
  fakeUpload({ studentId: 4, studentName: 'Ion Popa', submissionId: 14, status: 'uploading', fileCount: 1 }),
  fakeUpload({ studentId: 5, studentName: 'Lia Dinu', submissionId: 15, status: 'failed', fileCount: 1 }),
  fakeUpload({ studentId: 6, studentName: 'Mara Ilie' }),
  fakeUpload({ studentId: 7, studentName: 'Radu Ene', submissionId: 17, status: 'graded', grade: 7, flagCount: 1 }),
  fakeUpload({ studentId: 8, studentName: 'Sara Vlad', active: false }),
];
const ids = (list: { submissionId: number }[]) => list.map((row) => row.submissionId);

describe('the students of the paper page', () => {
  it('lists the graded papers first, then the ones sent and not graded yet, then the ones still sending', () => {
    expect(ids(listedPapers(rows, 'all', 'open'))).toEqual([11, 13, 17, 12, 15, 14]);
  });

  it('puts a paper held back once the uploads closed with the ones that wait, not with the ones sending', () => {
    expect(ids(listedPapers(rows, 'all', 'evaluating'))).toEqual([11, 13, 17, 12, 14, 15]);
  });

  it('puts last a paper begun with no page once the uploads closed: the student did not take part', () => {
    const begun = fakeUpload({ studentId: 9, studentName: 'Ada Bucur', submissionId: 19, status: 'uploading' });
    expect(ids(listedPapers([begun, ...rows], 'all', 'done'))).toEqual([11, 13, 17, 12, 14, 15, 19]);
    expect(absentPaper(begun, 'done')).toBe(true);
    // While the uploads are open, the student may still send.
    expect(ids(listedPapers([begun, ...rows], 'all', 'open'))).toEqual([11, 13, 17, 12, 15, 19, 14]);
    expect(absentPaper(begun, 'open')).toBe(false);
  });

  it('lists only the papers with points to check, and keeps the open paper in its place', () => {
    expect(ids(listedPapers(rows, 'review', 'done'))).toEqual([11, 17]);
    // Eva's paper is open: her last point was just checked.
    expect(ids(listedPapers(rows, 'review', 'done', 13))).toEqual([11, 13, 17]);
    expect(listedPapers(rows.slice(1, 6), 'review', 'done')).toEqual([]);
  });

  it('names the students who sent nothing and are still in the class', () => {
    expect(papersMissing(rows).map((row) => row.studentName)).toEqual(['Mara Ilie']);
  });
});

describe('where "Doar de verificat" opens', () => {
  it('stays on the open point, else opens the first point of a paper with points to check', () => {
    const point = pointKey(rows[6]!.reviewPoints[0]!);
    expect(reviewSpot(rows, { submissionId: 17, key: point })).toEqual({ submissionId: 17, key: point });
    expect(reviewSpot(rows, { submissionId: 17, key: null })).toEqual({ submissionId: 17, key: point });
  });

  it('opens the first point of the test from a paper with none', () => {
    const first = { submissionId: 11, key: pointKey(rows[0]!.reviewPoints[0]!) };
    expect(reviewSpot(rows, { submissionId: 13, key: '5' })).toEqual(first);
    expect(reviewSpot(rows, { submissionId: 12, key: null })).toEqual(first);
  });

  it('stays where it is when no point is left in the test', () => {
    const checked = rows.map((row) => ({ ...row, flagCount: 0, reviewPoints: [] }));
    expect(reviewSpot(checked, { submissionId: 13, key: null })).toEqual({ submissionId: 13, key: null });
  });
});
