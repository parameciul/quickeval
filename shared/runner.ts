import { z } from 'zod';
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
}

// A run's id, made by the robot: 8-64 characters from A-Z, a-z, 0-9, "_" and "-".
export const runIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, { message: 'Id-ul rulării nu este valid.' });

export const runBody = z.object({ runId: runIdSchema });

export const releaseBody = z.object({ runId: runIdSchema, summary: runSummarySchema });

// Why a robot task failed. "usage_limit": the Claude plan reached its limit;
// the task is tried again later and counts no attempt.
export const robotErrorSchema = z.enum(['timeout', 'invalid_output', 'crash', 'usage_limit']);

export type RobotError = z.infer<typeof robotErrorSchema>;

// The files_version that the robot read with the test, before it read the files.
const filesVersionSchema = z.number().int().min(0);

// The exercise list is checked by checkExerciseList (shared/schemas.ts).
export const exerciseListBody = z.discriminatedUnion('ok', [
  z.object({ runId: runIdSchema, filesVersion: filesVersionSchema, ok: z.literal(true), exerciseList: z.unknown() }),
  z.object({ runId: runIdSchema, filesVersion: filesVersionSchema, ok: z.literal(false), error: robotErrorSchema }),
]);

// POST /lease.
export interface LeaseResult {
  granted: boolean;
  maxParallel: number;
}

// GET /tasks: test ids, and how many uploads wait for grading.
export interface TasksResult {
  exerciseLists: number[];
  pendingGrading: number;
  analyses: number[];
}

// GET /tests/:id: what the robot needs to know of a test. No names.
export interface RobotTest {
  id: number;
  // Goes up by 1 each time the teacher replaces the test file or the barem.
  // The robot sends it back with the exercise list.
  filesVersion: number;
  files: { test: { contentType: string } | null; barem: { contentType: string } | null };
  exerciseList: ExerciseList | null;
}

// A grading, checked by checkGrading (shared/schemas.ts), or why the robot
// could not grade. Only a usage limit is tried again without an attempt.
export const resultBody = z.discriminatedUnion('ok', [
  z.object({ runId: runIdSchema, ok: z.literal(true), result: z.unknown(), model: z.string().max(100) }),
  z.object({ runId: runIdSchema, ok: z.literal(false), error: robotErrorSchema }),
]);

// POST /claim: an upload to grade, its test, and its files in upload order.
// No names: the robot names the pages by their order.
export interface ClaimResult {
  submissionId: number;
  testId: number;
  files: { id: number; contentType: string; position: number }[];
}
