import { describe, expect, it } from 'vitest';
import { fakeSummary } from '../../test/fakeApi.ts';
import { classSummary } from './classSummary.ts';

const done = { status: 'done' as const, gradedCount: 20, resultsOpen: true };

describe('classSummary', () => {
  it('counts only the tests of the class', () => {
    const tests = [
      fakeSummary({ code: '6E2-26T1', classId: 1, status: 'open' }),
      fakeSummary({ code: '6E3-26T1', classId: 2, status: 'open' }),
    ];
    expect(classSummary(tests, 1).inWork).toBe(1);
    expect(classSummary(tests, 3)).toEqual({ waits: 0, inWork: 0, points: 0, average: null });
  });

  it('counts what waits on the teacher, the tests in work and the points to check', () => {
    const tests = [
      fakeSummary({ code: '6E2-26T1', ...done, flagCount: 12 }),
      fakeSummary({ code: '6E2-26T2', ...done, flagCount: 3 }),
      fakeSummary({ code: '6E2-26T3', status: 'open' }),
      fakeSummary({ code: '6E2-26T4', ...done }),
    ];
    // The open test misses nothing, so only the two with points wait.
    expect(classSummary(tests, 1)).toMatchObject({ waits: 2, inWork: 3, points: 15 });
  });

  it('averages the averages of the graded tests, archived ones too', () => {
    const tests = [
      fakeSummary({ code: '6E2-26T1', ...done, averageGrade: 8 }),
      fakeSummary({ code: '6E2-26T2', ...done, averageGrade: 7.5, archived: true, resultsOpen: false }),
      fakeSummary({ code: '6E2-26T3', ...done, averageGrade: 7.2 }),
      fakeSummary({ code: '6E2-26T4', status: 'open', averageGrade: null }),
    ];
    expect(classSummary(tests, 1).average).toBe(7.57);
  });

  it('has no average before a test is graded', () => {
    expect(classSummary([fakeSummary({ status: 'open' })], 1).average).toBeNull();
  });

  it('leaves an archived test out of the work and the points', () => {
    const tests = [fakeSummary({ ...done, resultsOpen: false, archived: true, flagCount: 2 })];
    expect(classSummary(tests, 1)).toMatchObject({ waits: 0, inWork: 0, points: 0 });
  });
});
