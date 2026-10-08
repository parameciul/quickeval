import { z } from 'zod';
import { formatPoints, gradeOf, round2 } from './scoring.ts';

// What the robot's Claude runs return (spec §12.5), and the checks that code
// makes on it. The schemas check only the shape, so the robot can give Claude
// their JSON Schema (z.toJSONSchema). The checks below refuse what cannot be
// used and cut long texts to size: one long comment never throws away a
// whole grading.

// Mode "exercise-list": made once per test from the test and the barem.
export const exerciseListSchema = z.object({
  totalPoints: z.number(),
  officePoints: z.number(),
  exercises: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      maxPoints: z.number(),
      answer: z.string(),
      scoringNotes: z.string(),
      topic: z.string(),
    }),
  ),
  notes: z.string(),
});

export type ExerciseList = z.infer<typeof exerciseListSchema>;

// Mode "grade": one student's work, graded against the exercise list.
export const gradingResultSchema = z.object({
  items: z.array(
    z.object({
      exerciseId: z.string(),
      points: z.number(),
      studentAnswer: z.string(),
      comment: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
      needsReview: z.boolean(),
      reviewReason: z.string(),
    }),
  ),
  unreadable: z.array(z.string()),
  summary: z.string(),
  strengths: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type GradingResult = z.infer<typeof gradingResultSchema>;
export type Confidence = GradingResult['items'][number]['confidence'];

export const MAX_EXERCISES = 60;
const MAX_EXERCISE_ID = 20;
const MAX_TOTAL_POINTS = 1000;
const MAX_LIST_ENTRIES = 5;
const MAX_UNREADABLE = 20;

// Longest texts, in characters. A longer text is cut and ends with "…".
export const TEXT_LIMITS = {
  label: 120,
  answer: 500,
  scoringNotes: 1000,
  topic: 80,
  notes: 1000,
  studentAnswer: 500,
  comment: 1000,
  reviewReason: 500,
  summary: 1500,
  listEntry: 300,
  fileName: 100,
} as const;

// Review reasons that code adds. The teacher reads them; students never do.
export const OUT_OF_RANGE = 'Punctaj în afara intervalului';
export const LOW_CONFIDENCE = 'Robotul nu este sigur de acest punctaj.';
export const CHECK_THIS = 'Verifică acest punctaj.';

// Trims the text and cuts it to `max` characters. Counts whole characters,
// so a letter outside the basic plane is never split.
export function cutText(text: string, max: number): string {
  const trimmed = text.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= max) return trimmed;
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

function cutList(list: string[], entries: number, max: number): string[] {
  return list
    .map((entry) => cutText(entry, max))
    .filter((entry) => entry !== '')
    .slice(0, entries);
}

// Not ok: the output cannot be used, and `reason` says why (for the robot's
// own log; it holds no student data).
export type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface CheckedExerciseList {
  list: ExerciseList;
  // "problem": the points of the exercises and "din oficiu" do not add up to the total.
  status: 'ready' | 'problem';
  message: string | null;
}

export function checkExerciseList(raw: unknown): Checked<CheckedExerciseList> {
  const parsed = exerciseListSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'not an exercise list' };
  const input = parsed.data;
  if (input.exercises.length === 0 || input.exercises.length > MAX_EXERCISES) {
    return { ok: false, reason: `needs 1 to ${MAX_EXERCISES} exercises` };
  }
  if (!(input.totalPoints > 0 && input.totalPoints <= MAX_TOTAL_POINTS)) {
    return { ok: false, reason: 'total points out of range' };
  }
  if (!(input.officePoints >= 0 && input.officePoints < input.totalPoints)) {
    return { ok: false, reason: 'office points out of range' };
  }
  const ids = new Set<string>();
  for (const exercise of input.exercises) {
    const id = exercise.id.trim();
    if (id === '' || id.length > MAX_EXERCISE_ID || ids.has(id)) return { ok: false, reason: 'empty, long, or repeated exercise id' };
    if (!(exercise.maxPoints > 0)) return { ok: false, reason: 'exercise without points' };
    ids.add(id);
  }

  const list: ExerciseList = {
    totalPoints: input.totalPoints,
    officePoints: input.officePoints,
    exercises: input.exercises.map((exercise) => ({
      id: exercise.id.trim(),
      label: cutText(exercise.label, TEXT_LIMITS.label),
      maxPoints: exercise.maxPoints,
      answer: cutText(exercise.answer, TEXT_LIMITS.answer),
      scoringNotes: cutText(exercise.scoringNotes, TEXT_LIMITS.scoringNotes),
      topic: cutText(exercise.topic, TEXT_LIMITS.topic),
    })),
    notes: cutText(input.notes, TEXT_LIMITS.notes),
  };
  const sum = round2(list.exercises.reduce((total, exercise) => total + exercise.maxPoints, list.officePoints));
  if (Math.abs(sum - list.totalPoints) > 0.001) {
    const message = `Punctajele din barem dau ${formatPoints(sum)}, dar totalul este ${formatPoints(list.totalPoints)}.`;
    return { ok: true, value: { list, status: 'problem', message } };
  }
  return { ok: true, value: { list, status: 'ready', message: null } };
}

export interface GradedItem {
  exerciseId: string;
  // 1-based, in the order of the exercise list.
  position: number;
  label: string;
  maxPoints: number;
  points: number;
  studentAnswer: string;
  comment: string;
  confidence: Confidence;
  needsReview: boolean;
  reviewReason: string;
}

export interface Grading {
  maxTotal: number;
  officePoints: number;
  total: number;
  grade: number;
  // An item to check, or a page that could not be read.
  needsReview: boolean;
  summary: string;
  strengths: string[];
  recommendations: string[];
  unreadable: string[];
  items: GradedItem[];
}

// Checks one student's grading against the exercise list: every exercise
// exactly once, points inside [0, max] (outside: clamped and flagged), low
// confidence always flagged. Code computes the total and the grade.
export function checkGrading(raw: unknown, list: ExerciseList): Checked<Grading> {
  const parsed = gradingResultSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'not a grading result' };
  const byId = new Map<string, GradingResult['items'][number]>();
  for (const item of parsed.data.items) {
    const id = item.exerciseId.trim();
    if (byId.has(id)) return { ok: false, reason: 'repeated exercise id' };
    byId.set(id, item);
  }
  if (byId.size !== list.exercises.length || list.exercises.some((exercise) => !byId.has(exercise.id))) {
    return { ok: false, reason: 'exercise ids do not match the exercise list' };
  }

  const items = list.exercises.map((exercise, index): GradedItem => {
    const item = byId.get(exercise.id)!;
    const given = round2(item.points);
    const points = round2(Math.min(Math.max(given, 0), exercise.maxPoints));
    const reasons: string[] = [];
    if (item.needsReview || item.confidence === 'low') {
      reasons.push(item.reviewReason.trim() || (item.confidence === 'low' ? LOW_CONFIDENCE : CHECK_THIS));
    }
    if (points !== given) reasons.push(OUT_OF_RANGE);
    return {
      exerciseId: exercise.id,
      position: index + 1,
      label: exercise.label,
      maxPoints: exercise.maxPoints,
      points,
      studentAnswer: cutText(item.studentAnswer, TEXT_LIMITS.studentAnswer),
      comment: cutText(item.comment, TEXT_LIMITS.comment),
      confidence: item.confidence,
      needsReview: reasons.length > 0,
      reviewReason: cutText(reasons.join('; '), TEXT_LIMITS.reviewReason),
    };
  });
  const unreadable = cutList(parsed.data.unreadable, MAX_UNREADABLE, TEXT_LIMITS.fileName);
  const total = round2(items.reduce((sum, item) => sum + item.points, list.officePoints));
  return {
    ok: true,
    value: {
      maxTotal: list.totalPoints,
      officePoints: list.officePoints,
      total,
      grade: gradeOf(total, list.totalPoints),
      needsReview: unreadable.length > 0 || items.some((item) => item.needsReview),
      summary: cutText(parsed.data.summary, TEXT_LIMITS.summary),
      strengths: cutList(parsed.data.strengths, MAX_LIST_ENTRIES, TEXT_LIMITS.listEntry),
      recommendations: cutList(parsed.data.recommendations, MAX_LIST_ENTRIES, TEXT_LIMITS.listEntry),
      unreadable,
      items,
    },
  };
}
