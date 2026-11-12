import { z } from 'zod';
import { formatPoints, gradeOf, round2 } from './scoring.ts';
import { DETECTED_SUBJECTS, type DetectedSubject, MAX_SUBJECT_NAME } from './subjects.ts';

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

// The subject that the robot found, in the answer of the modes "exercise-list"
// and "barem" (spec: any subject). It is not part of the stored list or barem.
export const subjectAnswerSchema = z.object({
  subject: z.enum(DETECTED_SUBJECTS).describe('The value of the subject, or "alta" for a subject that is not in the list.'),
  subjectName: z.string().describe('For "alta", the Romanian name of the subject in lower case, for example "istorie". An empty string otherwise.'),
});

// What Claude answers in the mode "exercise-list".
export const exerciseListAnswerSchema = exerciseListSchema.extend(subjectAnswerSchema.shape);

export interface FoundSubject {
  value: DetectedSubject;
  // The name of an `alta` subject, cut to MAX_SUBJECT_NAME; "" otherwise.
  name: string;
}

// The subject in an answer, or null for an answer without one (an older robot).
export function subjectOf(raw: unknown): FoundSubject | null {
  const parsed = subjectAnswerSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { subject, subjectName } = parsed.data;
  return { value: subject, name: subject === 'alta' ? cutText(subjectName, MAX_SUBJECT_NAME) : '' };
}

// Mode "grade": one student's work, graded against the exercise list.
export const CONFIDENCE_LEVELS = ['very_low', 'low', 'medium', 'high', 'very_high'] as const;

// One block of the student's work for an exercise: its page, counted from 1 as
// in `student/`, and its corners as fractions (0 to 1) of the page's width (x)
// and height (y), from the top left corner of the page as it is shown. The
// shape only: `checkGrading` drops an area that cannot be drawn, so a bad
// area never throws away a grading.
export const answerAreaSchema = z.object({
  page: z.number(),
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});

export type AnswerArea = z.infer<typeof answerAreaSchema>;

export const gradingResultSchema = z.object({
  items: z.array(
    z.object({
      exerciseId: z.string(),
      points: z.number(),
      studentAnswer: z.string(),
      comment: z.string(),
      confidence: z.enum(CONFIDENCE_LEVELS),
      needsReview: z.boolean(),
      reviewReason: z.string(),
      // The page of the student's work where the answer is, counted from 1 as
      // in `student/`; 0 when it is not known. Gradings made before this field
      // existed have none.
      page: z.number().int().min(0).default(0),
      // Where the answer is on the pages, so the review can frame it; [] when
      // the student did not answer or the robot is not sure. Gradings made
      // before this field existed have none.
      areas: z.array(answerAreaSchema).default([]),
    }),
  ),
  unreadable: z.array(z.string()),
  summary: z.string(),
  strengths: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type GradingResult = z.infer<typeof gradingResultSchema>;
export type Confidence = GradingResult['items'][number]['confidence'];

// The robot's confidence in 5 steps, 1 (very_low) to 5 (very_high). The three
// old values stay valid, so gradings made before keep working.
export const CONFIDENCE_LEVEL: Record<Confidence, number> = {
  very_low: 1,
  low: 2,
  medium: 3,
  high: 4,
  very_high: 5,
};

export function confidenceLevel(confidence: Confidence): number {
  return CONFIDENCE_LEVEL[confidence];
}

// Mode "class-report": the whole class, anonymized (spec §12.5).
export const classAnalysisSchema = z.object({
  overview: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  commonMistakes: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type ClassAnalysis = z.infer<typeof classAnalysisSchema>;

export const MAX_EXERCISES = 60;
const MAX_EXERCISE_ID = 20;
const MAX_TOTAL_POINTS = 1000;
const MAX_LIST_ENTRIES = 5;
const MAX_UNREADABLE = 20;
const MAX_ANALYSIS_ENTRIES = 8;
// Areas kept per exercise: the real papers tried needed at most 3.
export const MAX_AREAS = 6;

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
  overview: 2000,
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

const fraction = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
const round4 = (value: number) => Math.round(value * 10000) / 10000;

// The areas that can be drawn: a page from 1, corners inside the page and in
// order (top left, then bottom right), at most MAX_AREAS, rounded to 4 decimals.
// An area on a page the paper does not have is left to the review to skip.
export function drawableAreas(areas: readonly AnswerArea[]): AnswerArea[] {
  return areas
    .filter((area) => Number.isInteger(area.page) && area.page >= 1)
    .filter((area) => [area.x0, area.y0, area.x1, area.y1].every(fraction) && area.x0 < area.x1 && area.y0 < area.y1)
    .slice(0, MAX_AREAS)
    .map((area) => ({ page: area.page, x0: round4(area.x0), y0: round4(area.y0), x1: round4(area.x1), y1: round4(area.y1) }));
}

// The JSON Schema that the robot gives Claude (`claude --json-schema`).
// Claude Code accepts draft-07 schemas; it refuses zod's default draft
// 2020-12 ("no schema with key or ref").
export function claudeJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
}

// Not ok: the output cannot be used, and `reason` says why (for the robot's
// own log; it holds no student data).
export type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface CheckedExerciseList {
  // Points rounded to cents, as the grades use them.
  list: ExerciseList;
  // "problem": the points of the exercises and "din oficiu" do not add up to the total.
  status: 'ready' | 'problem';
  message: string | null;
  // The subject the robot found; null in an older robot's answer.
  subject: FoundSubject | null;
}

export function checkExerciseList(raw: unknown): Checked<CheckedExerciseList> {
  const parsed = exerciseListSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'not an exercise list' };
  // Points are kept in cents: 0.333 × 3 + 9 must be a problem, not a total
  // of 10 that a perfect paper never reaches.
  const input = {
    ...parsed.data,
    totalPoints: round2(parsed.data.totalPoints),
    officePoints: round2(parsed.data.officePoints),
    exercises: parsed.data.exercises.map((exercise) => ({ ...exercise, maxPoints: round2(exercise.maxPoints) })),
  };
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
    if (id === '' || Array.from(id).length > MAX_EXERCISE_ID || ids.has(id)) return { ok: false, reason: 'empty, long, or repeated exercise id' };
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
  const subject = subjectOf(raw);
  const sum = round2(list.exercises.reduce((total, exercise) => total + exercise.maxPoints, list.officePoints));
  if (sum !== list.totalPoints) {
    const message = `Punctajele din barem dau ${formatPoints(sum)}, dar totalul este ${formatPoints(list.totalPoints)}.`;
    return { ok: true, value: { list, status: 'problem', message, subject } };
  }
  return { ok: true, value: { list, status: 'ready', message: null, subject } };
}

// Checks the class analysis: it needs an overview, and the lists are cut to
// 8 entries of at most 300 characters, so one long answer is never thrown away.
export function checkClassAnalysis(raw: unknown): Checked<ClassAnalysis> {
  const parsed = classAnalysisSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'not a class analysis' };
  const overview = cutText(parsed.data.overview, TEXT_LIMITS.overview);
  if (overview === '') return { ok: false, reason: 'empty overview' };
  return {
    ok: true,
    value: {
      overview,
      strengths: cutList(parsed.data.strengths, MAX_ANALYSIS_ENTRIES, TEXT_LIMITS.listEntry),
      weaknesses: cutList(parsed.data.weaknesses, MAX_ANALYSIS_ENTRIES, TEXT_LIMITS.listEntry),
      commonMistakes: cutList(parsed.data.commonMistakes, MAX_ANALYSIS_ENTRIES, TEXT_LIMITS.listEntry),
      recommendations: cutList(parsed.data.recommendations, MAX_ANALYSIS_ENTRIES, TEXT_LIMITS.listEntry),
    },
  };
}

// Mode "barem": the barem that Claude writes from a test (a full marking
// scheme, not the robot's exercise list). Texts are Romanian; math is inline
// LaTeX between single `$`.
const TEXT = 'Romanian text. Math is inline LaTeX between single $ signs, for example $x^2+1$.';

export const generatedBaremSchema = z.object({
  title: z.string().describe('The barem title, for example "Test de evaluare – Permutări".'),
  subtitle: z
    .string()
    .describe('Subject, class, programme and working time, for example "Matematică – clasa a XI-a R1 (programa M1, 4 ore/săptămână) – Timp de lucru: 50 de minute".'),
  notes: z.array(z.string()).describe('The "Precizări privind evaluarea": one short sentence per entry. Romanian text.'),
  total: z.number().describe('A whole number: all points of the test, "din oficiu" included, for example 100.'),
  officePoints: z.number().describe('A whole number: the "din oficiu" points, for example 10. 0 when the test gives none.'),
  parts: z
    .array(
      z.object({
        title: z.string().describe('The variant, for example "RÂNDUL I". An empty string when the test has one variant.'),
        sections: z.array(
          z.object({
            title: z.string().describe('The section, for example "SUBIECTUL I".'),
            points: z.number().describe('A whole number: the points of the section: the sum of the points of all its steps.'),
            items: z.array(
              z.object({
                label: z.string().describe('The exercise label, for example "1.", "a)" or "1. a)".'),
                steps: z.array(
                  z.object({
                    text: z.string().describe(`One step of the solution and what earns the points. ${TEXT}`),
                    points: z.number().describe('The points of this step: a whole number, at least 1.'),
                  }),
                ),
              }),
            ),
          }),
        ),
      }),
    )
    .describe('One entry per variant. In each part, the sections plus officePoints add up to total.'),
});

export type GeneratedBarem = z.infer<typeof generatedBaremSchema>;

// What Claude answers in the mode "barem".
export const generatedBaremAnswerSchema = generatedBaremSchema.extend(subjectAnswerSchema.shape);

const isCount = (n: number) => Number.isInteger(n) && n >= 0;
const MAX_BAREM_PARTS = 4;
const MAX_BAREM_SECTIONS = 6;
// A language test can have many small items in one subject.
const MAX_BAREM_ITEMS = 60;
const MAX_BAREM_STEPS = 12;
const MAX_BAREM_NOTES = 10;
const BAREM_TITLE = 200;
const BAREM_NOTE = 400;
const BAREM_STEP = 1500;

// Checks the generated barem: the shape, the counts, and the sums. The steps
// of a section add up to its points, and in every part the sections plus
// "din oficiu" add up to the total. Long texts are cut, as in the other checks.
export function checkGeneratedBarem(raw: unknown): Checked<GeneratedBarem> {
  const parsed = generatedBaremSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'not a barem' };
  const input = parsed.data;
  if (!isCount(input.total) || !isCount(input.officePoints)) return { ok: false, reason: 'total and office points must be whole numbers' };
  if (input.parts.length === 0 || input.parts.length > MAX_BAREM_PARTS) return { ok: false, reason: `needs 1 to ${MAX_BAREM_PARTS} parts` };
  if (input.notes.length > MAX_BAREM_NOTES) return { ok: false, reason: `at most ${MAX_BAREM_NOTES} notes` };
  for (const part of input.parts) {
    if (part.sections.length === 0 || part.sections.length > MAX_BAREM_SECTIONS) {
      return { ok: false, reason: `needs 1 to ${MAX_BAREM_SECTIONS} sections in a part` };
    }
    let sectionsTotal = 0;
    for (const section of part.sections) {
      if (section.items.length === 0 || section.items.length > MAX_BAREM_ITEMS) {
        return { ok: false, reason: `needs 1 to ${MAX_BAREM_ITEMS} items in a section` };
      }
      let sectionSum = 0;
      for (const item of section.items) {
        if (item.steps.length === 0 || item.steps.length > MAX_BAREM_STEPS) {
          return { ok: false, reason: `needs 1 to ${MAX_BAREM_STEPS} steps in an item` };
        }
        for (const step of item.steps) {
          if (!isCount(step.points) || step.points === 0) return { ok: false, reason: 'step points must be a whole number above 0' };
          if (step.text.trim() === '') return { ok: false, reason: 'empty step text' };
          sectionSum += step.points;
        }
      }
      if (!isCount(section.points)) return { ok: false, reason: 'section points must be a whole number' };
      if (sectionSum !== section.points) return { ok: false, reason: 'steps do not add up to the section points' };
      sectionsTotal += section.points;
    }
    if (sectionsTotal + input.officePoints !== input.total) return { ok: false, reason: 'sections and office points do not add up to the total' };
  }
  return {
    ok: true,
    value: {
      title: cutText(input.title, BAREM_TITLE),
      subtitle: cutText(input.subtitle, BAREM_TITLE),
      notes: cutList(input.notes, MAX_BAREM_NOTES, BAREM_NOTE),
      total: input.total,
      officePoints: input.officePoints,
      parts: input.parts.map((part) => ({
        title: cutText(part.title, BAREM_TITLE),
        sections: part.sections.map((section) => ({
          title: cutText(section.title, BAREM_TITLE),
          points: section.points,
          items: section.items.map((item) => ({
            label: cutText(item.label, BAREM_TITLE),
            steps: item.steps.map((step) => ({ text: cutText(step.text, BAREM_STEP), points: step.points })),
          })),
        })),
      })),
    },
  };
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
  // 1-based page of the answer; 0 when unknown.
  page: number;
  // Where the answer is on the pages (drawableAreas); [] when unknown.
  areas: AnswerArea[];
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
// exactly once, points inside [0, max] (outside: clamped and flagged), very
// low and low confidence always flagged, and medium confidence too in every
// subject but math, while the robot has no real barem of those subjects (a
// null subject is math). Code computes the total and the grade.
export function checkGrading(raw: unknown, list: ExerciseList, subject: DetectedSubject | null = null): Checked<Grading> {
  const newSubject = subject !== null && subject !== 'matematica';
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
    // The code's reason comes first: a long reason from the robot is cut at
    // the end and can never hide it.
    const reasons: string[] = [];
    if (points !== given) reasons.push(OUT_OF_RANGE);
    const unsure = item.confidence === 'low' || item.confidence === 'very_low' || (newSubject && item.confidence === 'medium');
    if (item.needsReview || unsure) {
      reasons.push(item.reviewReason.trim() || (unsure ? LOW_CONFIDENCE : CHECK_THIS));
    }
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
      page: item.page,
      areas: drawableAreas(item.areas),
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
