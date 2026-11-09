import type { ClassReport, ReportRow } from './api.ts';
import type { TestVariant } from './files.ts';
import { round2, toCents } from './scoring.ts';

// The statistics of the class report (spec §14.2): pure functions of the
// report's rows, computed in the browser and tested without it.

// A grade falls in one group; the first group holds everything below 5.
export const GRADE_GROUPS = [
  { label: '1-4,99', from: 0 },
  { label: '5-6,99', from: 5 },
  { label: '7-8,99', from: 7 },
  { label: '9-10', from: 9 },
] as const;

export interface ExerciseStats {
  exerciseId: string;
  label: string;
  maxPoints: number;
  // Students that have this exercise in their result.
  count: number;
  // Average points, in cents, and as a whole percent of the maximum.
  averagePoints: number | null;
  averagePercent: number | null;
  // Students with all the points, some, and none.
  full: number;
  partial: number;
  zero: number;
}

export interface ClassStats {
  // Graded students that are still active in the class.
  gradedCount: number;
  // The active students: the graded ones that are active, and the active
  // students that have no result.
  activeCount: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  groups: { label: string; count: number }[];
  // The exercises of the class table, from its papers only.
  perExercise: ExerciseStats[];
  // The exercises of the CES table, when the report has one (reportTables).
  cesPerExercise: ExerciseStats[] | null;
  // Items to check that the teacher has not checked yet, in all the results.
  flaggedCount: number;
}

type ReportExercise = ClassReport['exercises'][number];

// Two exercise lists that the same columns can show: the same ids, each with
// the same maximum, in any order.
export function sameExercises(a: readonly ReportExercise[], b: readonly ReportExercise[]): boolean {
  if (a.length !== b.length) return false;
  const max = new Map(a.map((exercise) => [exercise.id, Math.round(exercise.maxPoints * 100)]));
  return b.every((exercise) => max.get(exercise.id) === Math.round(exercise.maxPoints * 100));
}

// One table of points per exercise in the class report, the CSV and the
// class PDF.
export interface ReportTable {
  variant: TestVariant;
  exercises: ReportExercise[];
  rows: ReportRow[];
}

// The tables of the report: one for the whole class while the CES papers
// share the class columns; else the class papers, then the CES papers with
// the CES exercises. The final scores and grades stay together in the tiles.
export function reportTables(report: Pick<ClassReport, 'exercises' | 'cesExercises' | 'rows'>): ReportTable[] {
  if (report.cesExercises === null) return [{ variant: 'class', exercises: report.exercises, rows: report.rows }];
  return [
    { variant: 'class', exercises: report.exercises, rows: report.rows.filter((row) => row.variant !== 'ces') },
    { variant: 'ces', exercises: report.cesExercises, rows: report.rows.filter((row) => row.variant === 'ces') },
  ];
}

// The average grade of a test, as the class report and the Teste page show
// it: the grades added from the lowest, then 2 decimals. Null with no grade.
export function averageGrade(grades: number[]): number | null {
  if (grades.length === 0) return null;
  const sorted = [...grades].sort((a, b) => a - b);
  return round2(sorted.reduce((total, grade) => total + grade, 0) / sorted.length);
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : round2((sorted[middle - 1]! + sorted[middle]!) / 2);
}

// The statistics of each exercise of one table, from the papers of that table.
function exerciseStats(table: Pick<ReportTable, 'exercises' | 'rows'>): ExerciseStats[] {
  return table.exercises.map((exercise): ExerciseStats => {
    const points = table.rows.flatMap((row) => row.items.filter((item) => item.exerciseId === exercise.id).map((item) => item.points));
    const maxCents = Math.round(exercise.maxPoints * 100);
    const cents = points.map((value) => toCents(value) ?? Math.round(value * 100));
    const averagePoints = points.length === 0 ? null : round2(points.reduce((total, value) => total + value, 0) / points.length);
    return {
      exerciseId: exercise.id,
      label: exercise.label,
      maxPoints: exercise.maxPoints,
      count: points.length,
      averagePoints,
      averagePercent: averagePoints === null ? null : Math.round((averagePoints / exercise.maxPoints) * 100),
      full: cents.filter((value) => value >= maxCents).length,
      partial: cents.filter((value) => value > 0 && value < maxCents).length,
      zero: cents.filter((value) => value <= 0).length,
    };
  });
}

// The grades are the whole class's, CES papers included; the exercises are
// each table's own.
export function classStats(report: Pick<ClassReport, 'exercises' | 'cesExercises' | 'rows' | 'missing'>): ClassStats {
  const grades = report.rows.map((row) => row.grade).sort((a, b) => a - b);
  const groups = GRADE_GROUPS.map((group, index) => {
    const until = GRADE_GROUPS[index + 1]?.from ?? Infinity;
    return { label: group.label, count: grades.filter((grade) => grade >= group.from && grade < until).length };
  });
  const [classTable, cesTable] = reportTables(report);
  const perExercise = exerciseStats(classTable!);
  const activeGraded = report.rows.filter((row) => row.active).length;
  return {
    gradedCount: activeGraded,
    activeCount: activeGraded + report.missing.length,
    average: averageGrade(grades),
    median: median(grades),
    min: grades[0] ?? null,
    max: grades.at(-1) ?? null,
    groups,
    perExercise,
    cesPerExercise: cesTable ? exerciseStats(cesTable) : null,
    flaggedCount: report.rows.reduce((total, row) => total + row.flagCount, 0),
  };
}
