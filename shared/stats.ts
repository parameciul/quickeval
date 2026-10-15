import type { ClassReport } from './api.ts';
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
  perExercise: ExerciseStats[];
  // Items to check that the teacher has not checked yet, in all the results.
  flaggedCount: number;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : round2((sorted[middle - 1]! + sorted[middle]!) / 2);
}

export function classStats(report: Pick<ClassReport, 'exercises' | 'rows' | 'missing'>): ClassStats {
  const grades = report.rows.map((row) => row.grade).sort((a, b) => a - b);
  const sum = grades.reduce((total, grade) => total + grade, 0);
  const groups = GRADE_GROUPS.map((group, index) => {
    const until = GRADE_GROUPS[index + 1]?.from ?? Infinity;
    return { label: group.label, count: grades.filter((grade) => grade >= group.from && grade < until).length };
  });
  const perExercise = report.exercises.map((exercise): ExerciseStats => {
    const points = report.rows.flatMap((row) => row.items.filter((item) => item.exerciseId === exercise.id).map((item) => item.points));
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
  const activeGraded = report.rows.filter((row) => row.active).length;
  return {
    gradedCount: activeGraded,
    activeCount: activeGraded + report.missing.length,
    average: grades.length === 0 ? null : round2(sum / grades.length),
    median: median(grades),
    min: grades[0] ?? null,
    max: grades.at(-1) ?? null,
    groups,
    perExercise,
    flaggedCount: report.rows.reduce((total, row) => total + row.flagCount, 0),
  };
}
