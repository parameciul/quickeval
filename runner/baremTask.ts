import path from 'node:path';
import { DOCX_TYPE, PDF_TYPE, type TestVariant } from '../shared/files.ts';
import type { RobotError } from '../shared/runner.ts';
import { checkGeneratedBarem, subjectOf } from '../shared/schemas.ts';
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

// Makes the barem of a test, or of its CES variant, and sends it, or sends why
// it failed. A CES barem is written from the CES test, with the class barem and
// the class exercise list beside it (class/), so it reuses their exercise
// names. A missing pandoc goes up to the run loop, with nothing sent.
export async function makeBarem(ctx: TaskContext, testId: number, variant: TestVariant = 'class'): Promise<TaskEnd> {
  const started = Date.now();
  const ces = variant === 'ces';
  const taskId = `barem-${ces ? 'ces-' : ''}${testId}`;
  let end: TaskEnd;
  try {
    end = await (async (): Promise<TaskEnd> => {
      const job = await ctx.api.baremJob(testId, variant);
      const sendError = async (error: RobotError) =>
        (await ctx.api.sendBaremFailed(testId, { runId: ctx.runId, filesVersion: job.filesVersion, createdAt: job.createdAt, error }, variant)) === 'failed';
      const crash = (detail: string) => sendOutcome({ ok: false, problem: 'crash', detail }, async () => undefined, sendError);
      if (job.contentType !== PDF_TYPE && job.contentType !== DOCX_TYPE) return crash('file type');
      const source = await ctx.api.baremSource(testId, variant);
      const classBarem = ces && job.classBarem ? { bytes: await ctx.api.baremClassBarem(testId), contentType: job.classBarem.contentType } : null;
      let cwd: string;
      try {
        const input = { test: { bytes: source, contentType: job.contentType }, requestNotes: job.baremNotes, subject: job.subject ?? null };
        cwd = await makeWorkFolder(
          ctx.root,
          taskId,
          ces ? { ...input, variant, classBarem, classExerciseList: job.classExerciseList ?? null } : input,
          ctx.workdir,
        );
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
        await ctx.api.sendBarem(testId, ctx.runId, job.filesVersion, docx, job.createdAt, variant, subjectOf(outcome.output));
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
  const seconds = Math.round((Date.now() - started) / 1000);
  log('barem', ces ? { test: testId, variant, end, seconds } : { test: testId, end, seconds });
  return end;
}
