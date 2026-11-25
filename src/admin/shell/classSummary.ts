import type { TestSummary } from '../../../shared/api.ts';
import { round2 } from '../../../shared/scoring.ts';
import { inWork, todoOf } from './todo.ts';

// The numbers of one class in "Clasele tale", from the tests of the year:
// how many of its tests wait on the teacher (as "De făcut" counts them), how
// many are in work (`inWork`), the points still to check, and the class's
// average: the mean of the averages of its finished tests (done, with no
// point left to check: a test still grading already has an average that
// will change), archived tests included (their grades are the year's
// grades), rounded to two decimals; null before any test is finished.
export interface ClassSummary {
  waits: number;
  inWork: number;
  points: number;
  average: number | null;
}

export function classSummary(tests: TestSummary[], classId: number): ClassSummary {
  const own = tests.filter((test) => test.classId === classId);
  const averages = own
    .filter((test) => test.status === 'done' && test.flagCount === 0)
    .map((test) => test.averageGrade)
    .filter((grade): grade is number => grade !== null);
  return {
    waits: own.filter((test) => todoOf(test) !== null).length,
    inWork: own.filter(inWork).length,
    points: own.filter((test) => !test.archived).reduce((sum, test) => sum + test.flagCount, 0),
    average: averages.length === 0 ? null : round2(averages.reduce((sum, grade) => sum + grade, 0) / averages.length),
  };
}
