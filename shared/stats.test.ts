import { describe, expect, it } from 'vitest';
import type { ReportRow } from './api.ts';
import { averageGrade, classStats, GRADE_GROUPS, reportTables, sameExercises } from './stats.ts';

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
    flagCount, ces: false, variant: 'class',
    items: [
      { exerciseId: 'E1', points: points[0], maxPoints: 4, flagged: false },
      { exerciseId: 'E2', points: points[1], maxPoints: 5, flagged: false },
    ],
  };
}

describe('averageGrade', () => {
  it('gives the average of the class report, in any order of the grades', () => {
    const grades = [7.5, 7.67, 9.13, 4.99];
    const rows = grades.map((grade, index) => row(index + 1, grade, [0, 0]));
    expect(averageGrade(grades)).toBe(classStats({ cesExercises: null, exercises, rows, missing: [] }).average);
    expect(averageGrade([...grades].reverse())).toBe(averageGrade(grades));
  });

  it('rounds a half cent up', () => {
    expect(averageGrade([7.5, 7.67])).toBe(7.59);
  });

  it('has none without grades', () => {
    expect(averageGrade([])).toBeNull();
  });
});

describe('classStats', () => {
  it('has no numbers for a class without results', () => {
    const stats = classStats({ cesExercises: null, exercises, rows: [], missing: [{ studentId: 1, studentName: 'Pop Ion', status: 'none', ces: false }] });
    expect(stats).toMatchObject({ gradedCount: 0, activeCount: 1, average: null, median: null, min: null, max: null, flaggedCount: 0 });
    expect(stats.groups.map((group) => group.count)).toEqual([0, 0, 0, 0]);
    expect(stats.perExercise[0]).toMatchObject({ count: 0, averagePoints: null, averagePercent: null, full: 0, partial: 0, zero: 0 });
  });

  it('gives the average, the median, the lowest and the highest grade', () => {
    const rows = [row(1, 10, [4, 5]), row(2, 7.5, [3, 4]), row(3, 4.99, [1, 3]), row(4, 9, [4, 4])];
    const stats = classStats({ cesExercises: null, exercises, rows, missing: [] });
    expect(stats).toMatchObject({ gradedCount: 4, activeCount: 4, average: 7.87, median: 8.25, min: 4.99, max: 10 });
  });

  it('takes the middle grade of an odd class as the median', () => {
    const stats = classStats({ cesExercises: null, exercises, rows: [row(1, 3, [0, 0]), row(2, 9, [4, 5]), row(3, 6, [2, 2])], missing: [] });
    expect(stats.median).toBe(6);
  });

  it('puts a grade at a limit in the higher group', () => {
    const grades = [0, 4.99, 5, 6.99, 7, 8.99, 9, 10];
    const stats = classStats({ cesExercises: null, exercises, rows: grades.map((grade, index) => row(index + 1, grade, [0, 0])), missing: [] });
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
    const stats = classStats({ cesExercises: null, exercises, rows, missing: [] });
    expect(stats.perExercise[0]).toMatchObject({ exerciseId: 'E1', count: 4, averagePoints: 2.5, averagePercent: 63, full: 2, partial: 1, zero: 1 });
    expect(stats.perExercise[1]).toMatchObject({ exerciseId: 'E2', averagePoints: 2.5, averagePercent: 50, full: 1, partial: 2, zero: 1 });
  });

  it('counts a maximum that a barem sets to a fraction as full points', () => {
    const odd = [{ id: 'E1', label: 'E1', maxPoints: 0.33 }];
    const rows = [{ ...row(1, 10, [0, 0]), items: [{ exerciseId: 'E1', points: 0.33, maxPoints: 0.33, flagged: false }] }];
    expect(classStats({ cesExercises: null, exercises: odd, rows, missing: [] }).perExercise[0]).toMatchObject({ full: 1, partial: 0, zero: 0 });
  });

  it('skips a result that has no such exercise, and sums the items to check', () => {
    const rows = [row(1, 8, [3, 3], 2), { ...row(2, 6, [2, 2], 1), items: [{ exerciseId: 'E1', points: 2, maxPoints: 4, flagged: true }] }];
    const stats = classStats({ cesExercises: null, exercises, rows, missing: [] });
    expect(stats.perExercise[0]!.count).toBe(2);
    expect(stats.perExercise[1]!.count).toBe(1);
    expect(stats.flaggedCount).toBe(3);
  });

  it('counts the active students that have no result', () => {
    const stats = classStats({
      cesExercises: null,
      exercises,
      rows: [row(1, 8, [3, 3])],
      missing: [
        { studentId: 2, studentName: 'Ionescu Ana', status: 'none', ces: false },
        { studentId: 3, studentName: 'Stan Eva', status: 'failed', ces: false },
      ],
    });
    expect(stats).toMatchObject({ gradedCount: 1, activeCount: 3 });
  });

  it('does not count a graded student who left the class among the active students', () => {
    const left = { ...row(2, 9, [4, 5]), active: false };
    const stats = classStats({
      cesExercises: null,
      exercises,
      rows: [row(1, 8, [3, 3]), left],
      missing: [{ studentId: 3, studentName: 'Stan Eva', status: 'none', ces: false }],
    });
    expect(stats).toMatchObject({ gradedCount: 1, activeCount: 2, average: 8.5 });
  });
});

describe('the CES table', () => {
  const cesRow = (id: number, grade: number, points: number): ReportRow => ({
    ...row(id, grade, [0, 0]),
    variant: 'ces',
    ces: true,
    items: [{ exerciseId: 'C1', points, maxPoints: 9, flagged: false }],
  });

  it('tells lists that the same columns can show', () => {
    const a = [
      { id: 'E1', label: 'a', maxPoints: 4 },
      { id: 'E2', label: 'b', maxPoints: 5 },
    ];
    expect(sameExercises(a, [a[1]!, a[0]!])).toBe(true);
    expect(sameExercises(a, [a[0]!])).toBe(false);
    expect(sameExercises(a, [a[0]!, { ...a[1]!, maxPoints: 6 }])).toBe(false);
    expect(sameExercises(a, [a[0]!, { ...a[1]!, id: 'E3' }])).toBe(false);
  });

  it('is one table while the CES papers share the class columns', () => {
    const rows = [row(1, 8, [4, 3]), { ...row(2, 9, [4, 4]), variant: 'ces' as const }];
    expect(reportTables({ exercises, cesExercises: null, rows })).toEqual([{ variant: 'class', exercises, rows }]);
  });

  it('puts the CES papers in their own table, with their own exercise statistics, and keeps every grade together', () => {
    const cesExercises = [{ id: 'C1', label: 'CES 1', maxPoints: 9 }];
    const rows = [row(1, 6, [4, 1]), cesRow(2, 10, 9), row(3, 8, [2, 5])];
    const tables = reportTables({ exercises, cesExercises, rows });
    expect(tables.map((table) => [table.variant, table.rows.map((r) => r.submissionId)])).toEqual([
      ['class', [1, 3]],
      ['ces', [2]],
    ]);
    const stats = classStats({ exercises, cesExercises, rows, missing: [] });
    expect(stats.average).toBe(8);
    expect(stats.perExercise[0]).toMatchObject({ exerciseId: 'E1', count: 2, averagePoints: 3 });
    expect(stats.cesPerExercise).toEqual([expect.objectContaining({ exerciseId: 'C1', count: 1, averagePoints: 9, full: 1 })]);
    expect(classStats({ exercises, cesExercises: null, rows: [row(1, 6, [4, 1])], missing: [] }).cesPerExercise).toBeNull();
  });
});
