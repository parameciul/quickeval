import { z } from 'zod';
import type { TestVariant } from './files.ts';
import type { ExerciseList } from './schemas.ts';

// The robot API (/api/runner, spec §11.3): request bodies and answers, shared
// by the API and the robot.

// A run that sent no heartbeat for this long is taken as dead (spec §11.3).
export const LEASE_STALE_MS = 15 * 60 * 1000;

export const MAX_PARALLEL_AGENTS = 4;

// The largest body of an exercise list or a result, in bytes. A grading of 60
// exercises with every text at its limit is far smaller; the saved raw output
// then stays well under D1's 2 MB row limit.
export const MAX_ROBOT_BODY_BYTES = 1_000_000;

// What a run did, saved when it ends. Counts only: the repo and its logs are
// public, so nothing here may name a student.
export const runSummarySchema = z.object({
  exerciseLists: z.number().int().min(0),
  graded: z.number().int().min(0),
  failed: z.number().int().min(0),
  analyses: z.number().int().min(0),
  // Print PDFs made. Default 0: an older robot's summary has no such count.
  prints: z.number().int().min(0).default(0),
  // Barems generated. Default 0: an older robot's summary has no such count.
  barems: z.number().int().min(0).default(0),
  // Why the run stopped taking new work. "claude_login": Claude did not accept
  // the token, so the run stopped before it spoiled any work. "error": the
  // robot API failed; the GitHub run's log says more.
  stop: z.enum(['done', 'budget', 'usage_limit', 'lease_lost', 'claude_login', 'error']),
});

export type RunSummary = z.infer<typeof runSummarySchema>;

// POST /check: what waits for the robot.
export interface CheckResult {
  hasWork: boolean;
  exerciseLists: number;
  pendingGrading: number;
  analyses: number;
  prints: number;
  barems: number;
  // The CES variants' print PDFs, barems and exercise lists. An older API sends none.
  ces?: number;
}

// A run's id, made by the robot: 8-64 characters from A-Z, a-z, 0-9, "_" and "-".
export const runIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, { message: 'Id-ul rulării nu este valid.' });

export const runBody = z.object({ runId: runIdSchema });

// POST /check: the model and effort the robot is set to use. An older robot
// sends no body at all.
export const checkBody = z.object({
  model: z.string().max(100).optional(),
  effort: z.string().max(100).optional(),
});

export type CheckBody = z.input<typeof checkBody>;

export const releaseBody = z.object({ runId: runIdSchema, summary: runSummarySchema });

// Why a robot task failed. "usage_limit": the Claude plan reached its limit;
// the task is tried again later and counts no attempt.
export const robotErrorSchema = z.enum(['timeout', 'invalid_output', 'crash', 'usage_limit']);

export type RobotError = z.infer<typeof robotErrorSchema>;

// The files_version that the robot read with the test, before it read the files.
const filesVersionSchema = z.number().int().min(0);

// The time the test was made. Ids of deleted tests come back, so an answer names
// the test it was made for. An older robot sends none.
const createdAtSchema = z.string().max(40).optional();

// The exercise list is checked by checkExerciseList (shared/schemas.ts).
export const exerciseListBody = z.discriminatedUnion('ok', [
  z.object({ runId: runIdSchema, filesVersion: filesVersionSchema, createdAt: createdAtSchema, ok: z.literal(true), exerciseList: z.unknown() }),
  z.object({ runId: runIdSchema, filesVersion: filesVersionSchema, createdAt: createdAtSchema, ok: z.literal(false), error: robotErrorSchema }),
]);

// The class analysis, or why the robot could not make it. `version` is the
// state of the grades that the robot read with GET /tests/:id/results: when a
// grade changed meanwhile, the analysis is saved as out of date. The analysis
// is checked by checkClassAnalysis (shared/schemas.ts).
export const analysisBody = z.discriminatedUnion('ok', [
  z.object({ runId: runIdSchema, ok: z.literal(true), version: z.string().max(100), analysis: z.unknown(),
    // The model and effort that wrote it; an older robot sends neither.
    model: z.string().max(100).optional(),
    effort: z.string().max(100).optional(),
  }),
  z.object({ runId: runIdSchema, ok: z.literal(false), error: robotErrorSchema }),
]);

// GET /tests/:id/results: the graded class, anonymized for the analysis
// (spec §11.3). Students are "Elev 1" … "Elev n" in grading order: no names, and
// the points are the final ones, with the teacher's corrections.
export interface ClassResults {
  testId: number;
  version: string;
  maxTotal: number;
  officePoints: number;
  exercises: { id: string; label: string; maxPoints: number; topic: string; answer: string; scoringNotes: string }[];
  students: {
    label: string;
    total: number;
    grade: number;
    items: { exerciseId: string; points: number; studentAnswer: string; comment: string }[];
  }[];
}

// POST /lease.
export interface LeaseResult {
  granted: boolean;
  maxParallel: number;
}

// GET /tasks: test ids, and how many uploads wait for grading. The ces…
// lists are the tests whose CES variant waits for that work; the robot asks
// for it with ?variant=ces. An older API sends none.
export interface TasksResult {
  exerciseLists: number[];
  pendingGrading: number;
  analyses: number[];
  prints: number[];
  barems: number[];
  cesPrints?: number[];
  cesBarems?: number[];
  cesExerciseLists?: number[];
}

// One print PDF to make: the test file's type and version, and the students'
// upload token of the test, which the QR link holds (<site>/u/<uploadToken>).
export interface PrintJob {
  testId: number;
  createdAt: string;
  filesVersion: number;
  contentType: string;
  uploadToken: string;
}

// One barem to write from the test file: the file's type and version, and the
// teacher's comments for the barem. For a CES barem (`variant` "ces") also the
// class barem's type (it is read from GET /tests/:id/barem-job/class-barem)
// and the class exercise list, when they exist: the CES barem reuses their
// exercise names and points.
export interface BaremJob {
  testId: number;
  createdAt: string;
  filesVersion: number;
  contentType: string;
  baremNotes: string;
  variant?: TestVariant;
  classBarem?: { contentType: string } | null;
  classExerciseList?: ExerciseList | null;
}

export const baremFailedBody = z.object({ runId: runIdSchema, filesVersion: z.number().int().min(0), createdAt: createdAtSchema, error: robotErrorSchema });

export const printFailedBody = z.object({ runId: runIdSchema, filesVersion: z.number().int().min(0), createdAt: createdAtSchema, error: robotErrorSchema });

// GET /tests/:id: what the robot needs to know of a test. No names.
export interface RobotTest {
  id: number;
  // The time the test was made: the robot sends it back with its answer.
  createdAt: string;
  // Goes up by 1 each time the teacher replaces the test file or the barem
  // (or its comments). The robot sends it back with the exercise list.
  filesVersion: number;
  files: { test: { contentType: string } | null; barem: { contentType: string } | null };
  exerciseList: ExerciseList | null;
  // Extra teacher comments for the barem, as part of it.
  baremNotes: string;
  // GET /tests/:id?variant=ces: the CES variant's files, list and comments,
  // and the class exercise list, whose exercise ids the CES list reuses.
  variant?: TestVariant;
  classExerciseList?: ExerciseList | null;
}

// The time the upload started, from the claim. Ids of deleted uploads come back,
// so the result names the upload it was made for. An older robot sends none.
const startedAtSchema = z.string().max(40).optional();

// A grading, checked by checkGrading (shared/schemas.ts), or why the robot
// could not grade. Only a usage limit is tried again without an attempt.
export const resultBody = z.discriminatedUnion('ok', [
  z.object({ runId: runIdSchema, startedAt: startedAtSchema, ok: z.literal(true), result: z.unknown(), model: z.string().max(100), effort: z.string().max(100).optional() }),
  z.object({ runId: runIdSchema, startedAt: startedAtSchema, ok: z.literal(false), error: robotErrorSchema }),
]);

// POST /claim: an upload to grade, its test, and its files in upload order.
// No names: the robot names the pages by their order.
export interface ClaimResult {
  submissionId: number;
  testId: number;
  // The time the upload started: the robot sends it back with the result.
  startedAt: string;
  // "ces": grade the paper with the CES variant's files and list
  // (GET /tests/:id?variant=ces). An older API sends none: the class test.
  variant?: TestVariant;
  files: { id: number; contentType: string; position: number }[];
}
