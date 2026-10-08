import path from 'node:path';
import type { ClaimResult, RobotError } from '../shared/runner.ts';
import { MAX_ROBOT_BODY_BYTES } from '../shared/runner.ts';
import type { ExerciseList } from '../shared/schemas.ts';
import { checkExerciseList, checkGrading, claudeJsonSchema, exerciseListSchema, gradingResultSchema } from '../shared/schemas.ts';
import type { RobotApi } from './api.ts';
import { RobotApiError } from './api.ts';
import type { ClaudeMode, ClaudeOutcome, ClaudeRunner } from './claude.ts';
import { log } from './log.ts';
import type { TaskFile, WorkFolderInput, WorkFolderOptions } from './workdir.ts';
import { makeWorkFolder, removeFolder } from './workdir.ts';

// The robot's two tasks (spec §12.2): make the exercise list of a test, and
// grade one upload. Each one builds its work folder, runs Claude, checks the
// answer with the API's own checks, and sends it.

// How a task ended, for the run loop:
// - saved: the API kept the answer;
// - retry: the robot sent an error, the API counted an attempt, and the work
//   waits for another try;
// - failed: the same, at the last attempt: the work failed for good;
// - dropped: the work was no longer this run's (the teacher reopened the
//   test, replaced a file, or deleted it), so the answer was thrown away;
// - usage_limit: the plan reached its limit; the run takes no new work;
// - claude_login: Claude refused the token; the run stops and sends nothing;
// - lease_lost: another run holds the lease; the run takes no new work.
export type TaskEnd = 'saved' | 'retry' | 'failed' | 'dropped' | 'usage_limit' | 'claude_login' | 'lease_lost';

export interface TaskContext {
  api: RobotApi;
  claude: ClaudeRunner;
  runId: string;
  // The run's folder (runner/workdir.ts runFolder).
  root: string;
  workdir?: WorkFolderOptions;
}

const JSON_SCHEMAS: Record<ClaudeMode, object> = {
  'exercise-list': claudeJsonSchema(exerciseListSchema),
  grade: claudeJsonSchema(gradingResultSchema),
};

// Room for the rest of the body around Claude's answer.
const MAX_ANSWER_BYTES = MAX_ROBOT_BODY_BYTES - 10_000;

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

// Runs Claude, and once more when the answer cannot be used (spec §12.4: an
// invalid output gets one more try with the same input).
async function askClaude(ctx: TaskContext, mode: ClaudeMode, cwd: string, usable: (output: unknown) => boolean): Promise<ClaudeOutcome> {
  let outcome: ClaudeOutcome = { ok: false, problem: 'invalid_output', detail: 'not run' };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    outcome = await ctx.claude({ mode, cwd, jsonSchema: JSON_SCHEMAS[mode] });
    if (outcome.ok && (byteLength(outcome.output) > MAX_ANSWER_BYTES || !usable(outcome.output))) {
      outcome = { ok: false, problem: 'invalid_output', detail: 'refused by the checks' };
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    log('claude', outcome.ok ? { mode, attempt, ok: true, seconds } : { mode, attempt, ok: false, problem: outcome.problem, detail: outcome.detail, seconds });
    if (outcome.ok || outcome.problem !== 'invalid_output') return outcome;
  }
  return outcome;
}

// What an API refusal means for the task. Anything else (a refused robot key,
// an API that cannot be reached) stops the run: it goes up to the run loop.
function refusal(err: unknown): 'dropped' | 'lease_lost' | 'invalid' | null {
  if (!(err instanceof RobotApiError)) return null;
  if (err.status === 409 && err.code === 'lease_lost') return 'lease_lost';
  if (err.status === 404 || (err.status === 409 && (err.code === 'taken_over' || err.code === 'not_needed'))) return 'dropped';
  if (err.status === 422 || err.status === 413) return 'invalid';
  return null;
}

// Sends Claude's answer, or the error, and tells how the task ended. An answer
// that the API refuses although the robot's checks passed is sent again as
// an invalid output, so the attempt counts: an output that is always refused
// must end as failed, not be tried by every run.
// `sendError` tells whether the work failed for good.
async function sendOutcome(
  outcome: ClaudeOutcome,
  sendAnswer: (output: unknown, model: string) => Promise<unknown>,
  sendError: (error: RobotError) => Promise<boolean>,
): Promise<TaskEnd> {
  try {
    if (outcome.ok) {
      await sendAnswer(outcome.output, outcome.model);
      return 'saved';
    }
    const { problem } = outcome;
    if (problem === 'not_logged_in') return 'claude_login';
    const final = await sendError(problem);
    if (problem === 'usage_limit') return 'usage_limit';
    return final ? 'failed' : 'retry';
  } catch (err) {
    const kind = refusal(err);
    if (kind === null) throw err;
    if (kind !== 'invalid') return kind;
  }
  try {
    return (await sendError('invalid_output')) ? 'failed' : 'retry';
  } catch (err) {
    const kind = refusal(err);
    if (kind === null || kind === 'invalid') throw err;
    return kind;
  }
}

async function teacherFiles(ctx: TaskContext, testId: number, files: { test: { contentType: string } | null; barem: { contentType: string } | null }) {
  if (!files.test || !files.barem) return null;
  const [test, barem] = await Promise.all([ctx.api.testFile(testId, 'test'), ctx.api.testFile(testId, 'barem')]);
  return { test: { bytes: test, contentType: files.test.contentType }, barem: { bytes: barem, contentType: files.barem.contentType } };
}

// Null when the files cannot be put in a work folder (a Word file that pandoc
// refuses, a file of an unknown type): the task then counts a crash, so one
// bad file fails after its attempts instead of stopping every run.
type MakeFolder = (input: WorkFolderInput) => Promise<string | null>;

// A program that the robot needs is missing: the machine is to blame, not
// the files, so the run stops instead of counting attempts.
function isMissingProgram(err: unknown): boolean {
  const { code, syscall } = (err ?? {}) as { code?: unknown; syscall?: unknown };
  return code === 'ENOENT' && typeof syscall === 'string' && syscall.startsWith('spawn');
}

// Runs a task that makes its work folder with `makeFolder`, and always
// removes the folder, also one that failed halfway. A 404 or a 409 while the
// task reads its files means that the work is gone.
async function inWorkFolder(ctx: TaskContext, taskId: string, work: (makeFolder: MakeFolder) => Promise<TaskEnd>): Promise<TaskEnd> {
  try {
    return await work(async (input) => {
      try {
        return await makeWorkFolder(ctx.root, taskId, input, ctx.workdir);
      } catch (err) {
        if (isMissingProgram(err)) throw err;
        log('work folder failed', { task: taskId });
        return null;
      }
    });
  } catch (err) {
    const kind = refusal(err);
    if (kind === 'dropped' || kind === 'lease_lost') return kind;
    throw err;
  } finally {
    await removeFolder(path.join(ctx.root, taskId));
  }
}

export async function makeExerciseList(ctx: TaskContext, testId: number): Promise<TaskEnd> {
  const end = await inWorkFolder(ctx, `exercise-list-${testId}`, async (makeFolder) => {
    // The files' version is read before the files: a file replaced after this
    // read makes the API refuse the list.
    const test = await ctx.api.test(testId);
    const post = { runId: ctx.runId, filesVersion: test.filesVersion };
    const sendError = async (error: RobotError) => (await ctx.api.sendExerciseList(testId, { ...post, ok: false, error })).status === 'failed';
    const files = await teacherFiles(ctx, testId, test.files);
    if (!files) return sendOutcome({ ok: false, problem: 'crash', detail: 'missing file' }, async () => undefined, sendError);
    const cwd = await makeFolder(files);
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
    const outcome = await askClaude(ctx, 'exercise-list', cwd, (output) => checkExerciseList(output).ok);
    return sendOutcome(outcome, (exerciseList) => ctx.api.sendExerciseList(testId, { ...post, ok: true, exerciseList }), sendError);
  });
  log('exercise list', { test: testId, end });
  return end;
}

export async function gradeSubmission(ctx: TaskContext, claim: ClaimResult): Promise<TaskEnd> {
  const { submissionId, testId } = claim;
  const end = await inWorkFolder(ctx, `grade-${submissionId}`, async (makeFolder) => {
    const sendError = async (error: RobotError) => (await ctx.api.sendResult(submissionId, { runId: ctx.runId, ok: false, error })) === 'failed';
    const test = await ctx.api.test(testId);
    const list: ExerciseList | null = test.exerciseList;
    const files = await teacherFiles(ctx, testId, test.files);
    if (!list || !files) return sendOutcome({ ok: false, problem: 'crash', detail: 'missing list or file' }, async () => undefined, sendError);
    const pages: TaskFile[] = [];
    for (const file of [...claim.files].sort((a, b) => a.position - b.position)) {
      pages.push({ bytes: await ctx.api.page(submissionId, file.id), contentType: file.contentType });
    }
    const cwd = await makeFolder({ ...files, exerciseList: list, pages });
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
    const outcome = await askClaude(ctx, 'grade', cwd, (output) => checkGrading(output, list).ok);
    return sendOutcome(outcome, (result, model) => ctx.api.sendResult(submissionId, { runId: ctx.runId, ok: true, result, model }), sendError);
  });
  log('grade', { submission: submissionId, test: testId, pages: claim.files.length, end });
  return end;
}
