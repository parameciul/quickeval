import { describe, expect, it } from 'vitest';
import type { ReportRow } from './api.ts';
import { classStats, GRADE_GROUPS } from './stats.ts';

const exercises = [
  { id: 'E1', label: 'Exercițiul 1', maxPoints: 4 },
  { id: 'E2', label: 'Exercițiul 2', maxPoints: 5 },
];

function row(id: number, grade: number, points: [number, number], flagCount = 0): ReportRow {
  return {
    submissionId: id,
    studentId: id,
    studentName: `Elev ${id}`, active: true,
    total: grade,
    maxTotal: 10,
    grade,
    flagCount,
    model: null,
    effort: null,
    items: [
      { exerciseId: 'E1', points: points[0], maxPoints: 4, flagged: false },
      { exerciseId: 'E2', points: points[1], maxPoints: 5, flagged: false },
    ],
  };
}

describe('classStats', () => {
  it('has no numbers for a class without results', () => {
    const stats = classStats({ exercises, rows: [], missing: [{ studentId: 1, studentName: 'Pop Ion', status: 'none' }] });
    expect(stats).toMatchObject({ gradedCount: 0, activeCount: 1, average: null, median: null, min: null, max: null, flaggedCount: 0 });
    expect(stats.groups.map((group) => group.count)).toEqual([0, 0, 0, 0]);
    expect(stats.perExercise[0]).toMatchObject({ count: 0, averagePoints: null, averagePercent: null, full: 0, partial: 0, zero: 0 });
  });

  it('gives the average, the median, the lowest and the highest grade', () => {
    const rows = [row(1, 10, [4, 5]), row(2, 7.5, [3, 4]), row(3, 4.99, [1, 3]), row(4, 9, [4, 4])];
    const stats = classStats({ exercises, rows, missing: [] });
    expect(stats).toMatchObject({ gradedCount: 4, activeCount: 4, average: 7.87, median: 8.25, min: 4.99, max: 10 });
  });

  it('takes the middle grade of an odd class as the median', () => {
    const stats = classStats({ exercises, rows: [row(1, 3, [0, 0]), row(2, 9, [4, 5]), row(3, 6, [2, 2])], missing: [] });
    expect(stats.median).toBe(6);
  });

  it('puts a grade at a limit in the higher group', () => {
    const grades = [0, 4.99, 5, 6.99, 7, 8.99, 9, 10];
    const stats = classStats({ exercises, rows: grades.map((grade, index) => row(index + 1, grade, [0, 0])), missing: [] });
    expect(GRADE_GROUPS.map((group) => group.label)).toEqual(['1-4,99', '5-6,99', '7-8,99', '9-10']);
    expect(stats.groups).toEqual([
      { label: '1-4,99', count: 2 },
      { label: '5-6,99', count: 2 },
      { label: '7-8,99', count: 2 },
      { label: '9-10', count: 2 },
    ]);
  });

  it('counts the students with all, some, and none of the points of each exercise', () => {
    const rows = [row(1, 9, [4, 5]), row(2, 5, [2, 0]), row(3, 1, [0, 0.33]), row(4, 9, [4, 4.65])];
    const stats = classStats({ exercises, rows, missing: [] });
    expect(stats.perExercise[0]).toMatchObject({ exerciseId: 'E1', count: 4, averagePoints: 2.5, averagePercent: 63, full: 2, partial: 1, zero: 1 });
    expect(stats.perExercise[1]).toMatchObject({ exerciseId: 'E2', averagePoints: 2.5, averagePercent: 50, full: 1, partial: 2, zero: 1 });
  });

  it('counts a maximum that a barem sets to a fraction as full points', () => {
    const odd = [{ id: 'E1', label: 'E1', maxPoints: 0.33 }];
    const rows = [{ ...row(1, 10, [0, 0]), items: [{ exerciseId: 'E1', points: 0.33, maxPoints: 0.33, flagged: false }] }];
    expect(classStats({ exercises: odd, rows, missing: [] }).perExercise[0]).toMatchObject({ full: 1, partial: 0, zero: 0 });
  });

  it('skips a result that has no such exercise, and sums the items to check', () => {
    const rows = [row(1, 8, [3, 3], 2), { ...row(2, 6, [2, 2], 1), items: [{ exerciseId: 'E1', points: 2, maxPoints: 4, flagged: true }] }];
    const stats = classStats({ exercises, rows, missing: [] });
    expect(stats.perExercise[0]!.count).toBe(2);
    expect(stats.perExercise[1]!.count).toBe(1);
    expect(stats.flaggedCount).toBe(3);
  });

  it('counts the active students that have no result', () => {
    const stats = classStats({
      exercises,
      rows: [row(1, 8, [3, 3])],
      missing: [
        { studentId: 2, studentName: 'Ionescu Ana', status: 'none' },
        { studentId: 3, studentName: 'Stan Eva', status: 'failed' },
      ],
    });
    expect(stats).toMatchObject({ gradedCount: 1, activeCount: 3 });
  });

  it('does not count a graded student who left the class among the active students', () => {
    const left = { ...row(2, 9, [4, 5]), active: false };
    const stats = classStats({
      exercises,
      rows: [row(1, 8, [3, 3]), left],
      missing: [{ studentId: 3, studentName: 'Stan Eva', status: 'none' }],
    });
    expect(stats).toMatchObject({ gradedCount: 1, activeCount: 2, average: 8.5 });
  });
});
