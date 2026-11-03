import path from 'node:path';
import { DOCX_TYPE, PDF_TYPE } from '../shared/files.ts';
import type { RobotError } from '../shared/runner.ts';
import { checkGeneratedBarem } from '../shared/schemas.ts';
import { RobotApiError } from './api.ts';
import { makeBaremDocx } from './baremDocx.ts';
import { log } from './log.ts';
import type { TaskContext, TaskEnd } from './tasks.ts';
import { askClaude, isMissingProgram, refusal, sendOutcome } from './tasks.ts';
import { makeWorkFolder, removeFolder } from './workdir.ts';

// The barem of a test that has none (spec: generated barem): Claude reads the
// test file and the teacher's comments and writes the barem as JSON, and
// pandoc turns it into the Word file that the teacher checks.

// The answers to an upload that only the Word file's bytes can explain, on top
// of refusal()'s 413 and 422.
const refusedDocx = (err: unknown) => err instanceof RobotApiError && (err.status === 400 || err.status === 415);

// Makes the barem of a test and sends it, or sends why it failed. A missing
// pandoc goes up to the run loop, with nothing sent.
export async function makeBarem(ctx: TaskContext, testId: number): Promise<TaskEnd> {
  const started = Date.now();
  const taskId = `barem-${testId}`;
  let end: TaskEnd;
  try {
    end = await (async (): Promise<TaskEnd> => {
      const job = await ctx.api.baremJob(testId);
      const sendError = async (error: RobotError) =>
        (await ctx.api.sendBaremFailed(testId, { runId: ctx.runId, filesVersion: job.filesVersion, createdAt: job.createdAt, error })) === 'failed';
      const crash = (detail: string) => sendOutcome({ ok: false, problem: 'crash', detail }, async () => undefined, sendError);
      if (job.contentType !== PDF_TYPE && job.contentType !== DOCX_TYPE) return crash('file type');
      const source = await ctx.api.baremSource(testId);
      let cwd: string;
      try {
        cwd = await makeWorkFolder(ctx.root, taskId, { test: { bytes: source, contentType: job.contentType }, requestNotes: job.baremNotes }, ctx.workdir);
      } catch (err) {
        if (isMissingProgram(err)) throw err;
        log('work folder failed', { task: taskId });
        return crash('work folder');
      }
      const outcome = await askClaude(ctx, 'barem', cwd, (output) => checkGeneratedBarem(output).ok);
      if (!outcome.ok) return sendOutcome(outcome, async () => undefined, sendError);
      const checked = checkGeneratedBarem(outcome.output);
      if (!checked.ok) return crash('barem');
      let docx: Uint8Array;
      try {
        docx = await makeBaremDocx(checked.value, path.join(cwd, 'docx'), ctx.workdir?.pandoc);
      } catch (err) {
        if (isMissingProgram(err)) throw err;
        log('barem file failed', { task: taskId });
        return crash('pandoc');
      }
      try {
        await ctx.api.sendBarem(testId, ctx.runId, job.filesVersion, docx, job.createdAt);
        return 'saved';
      } catch (err) {
        // A file that the API refuses counts an attempt, so it fails in the
        // end instead of being made by every run.
        if (refusal(err) === 'invalid' || refusedDocx(err)) return crash('refused file');
        throw err;
      }
    })();
  } catch (err) {
    const kind = refusal(err);
    if (kind !== 'dropped' && kind !== 'lease_lost') throw err;
    end = kind;
  } finally {
    await removeFolder(path.join(ctx.root, taskId));
  }
  log('barem', { test: testId, end, seconds: Math.round((Date.now() - started) / 1000) });
  return end;
}
