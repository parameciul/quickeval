import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCX_TYPE, PDF_TYPE } from '../shared/files.ts';
import type { RobotError } from '../shared/runner.ts';
import { RobotApiError } from './api.ts';
import { log } from './log.ts';
import type { TaskContext, TaskEnd } from './tasks.ts';
import { refusal } from './tasks.ts';
import { removeFolder } from './workdir.ts';

// The print PDF of an open test (spec §4.4): the test file, converted to PDF
// when it is a Word file, with the QR code of the student link on every page.
// The PDF work runs in the container of runner/print, never in Node.

export const PRINT_IMAGE = 'quickeval-print';
const BUILD_MS = 10 * 60_000;
// The Word conversion can start LibreOffice twice (docx_to_pdf.py tries again
// with a fresh profile), each time with a cold /tmp in a new container.
export const CONVERT_MS = 180_000;
export const STAMP_MS = 60_000;
const KILL_MS = 30_000;
// LibreOffice and the image build can print a lot; the output is never read.
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export interface PrintTools {
  // Builds the image once per run; later calls return the same promise.
  prepare(): Promise<void>;
  // Runs `args` in a new container with `folder` mounted at /work. Rejects
  // with { kind: 'timeout' | 'failed' } and never with the command line.
  run(args: string[], folder: string, timeoutMs: number): Promise<void>;
}

// The image could not be built: the machine is to blame, not the test file,
// so the run makes no print PDF and counts no attempt.
export class PrintSetupError extends Error {}

// A container step that failed. Its message holds no command line: the
// command holds the student link.
class PrintStepError extends Error {
  readonly kind: 'timeout' | 'failed';
  // execFile stopped the docker client (a timeout, or too much output).
  readonly killed: boolean;

  constructor(kind: 'timeout' | 'failed', killed = false) {
    super(`print step: ${kind}`);
    this.kind = kind;
    this.killed = killed;
  }
}

// Runs a docker command; its output is thrown away.
function docker(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('docker', args, { timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true }, (err) => {
      if (!err) return resolve();
      const killed = err.killed === true;
      const timedOut = killed && err.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
      reject(new PrintStepError(timedOut ? 'timeout' : 'failed', killed));
    });
  });
}

export function dockerTools(contextDir: string = fileURLToPath(new URL('./print/', import.meta.url))): PrintTools {
  let built: Promise<void> | undefined;
  return {
    prepare() {
      built ??= docker(['build', '-t', PRINT_IMAGE, contextDir], BUILD_MS).catch(() => {
        throw new PrintSetupError('the print image could not be built');
      });
      return built;
    },
    async run(args, folder, timeoutMs) {
      const name = `qe-print-${randomBytes(4).toString('hex')}`;
      // On Linux the container writes as the robot's user, so the robot can
      // read and remove what it wrote. Windows has no uid.
      const uid = process.getuid?.();
      const gid = process.getgid?.();
      const user = uid === undefined || gid === undefined ? [] : ['--user', `${uid}:${gid}`];
      try {
        await docker(['run', '--rm', '--name', name, '--network', 'none', ...user, '-v', `${path.resolve(folder)}:/work`, PRINT_IMAGE, ...args], timeoutMs);
      } catch (err) {
        // Stopping the docker client leaves the container running.
        if (err instanceof PrintStepError && err.killed) await docker(['kill', name], KILL_MS).catch(() => undefined);
        throw err instanceof PrintStepError ? err : new PrintStepError('failed');
      }
    },
  };
}

const isTimeout = (err: unknown) => typeof err === 'object' && err !== null && (err as { kind?: unknown }).kind === 'timeout';
// The answers to an upload that only the print PDF's bytes can explain, on top
// of refusal()'s 413 and 422.
const refusedPdf = (err: unknown) => err instanceof RobotApiError && (err.status === 400 || err.status === 415);

// Makes the print PDF of a test and sends it, or sends why it failed. A
// PrintSetupError goes up to the run loop, with nothing sent.
export async function makePrint(ctx: TaskContext, print: { tools: PrintTools; siteUrl: string }, testId: number): Promise<TaskEnd> {
  const started = Date.now();
  const folder = path.join(ctx.root, `print-${testId}`);
  let type: 'pdf' | 'docx' | null = null;
  let end: TaskEnd;
  try {
    end = await (async (): Promise<TaskEnd> => {
      const job = await ctx.api.printJob(testId);
      const sendError = async (error: RobotError): Promise<TaskEnd> =>
        (await ctx.api.sendPrintFailed(testId, { runId: ctx.runId, filesVersion: job.filesVersion, error })) === 'failed' ? 'failed' : 'retry';
      const fileType = job.contentType === PDF_TYPE ? 'pdf' : job.contentType === DOCX_TYPE ? 'docx' : null;
      type = fileType;
      if (!fileType) return sendError('crash');
      const source = await ctx.api.printSource(testId);
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, `in.${fileType}`), source);
      await print.tools.prepare();

      const site = print.siteUrl.replace(/\/+$/, '');
      const link = `${site}/u/${job.uploadToken}`;
      const label = `${new URL(site).host}/u/${job.uploadToken}`;
      let pdf: Uint8Array;
      try {
        let input = '/work/in.pdf';
        if (fileType === 'docx') {
          await print.tools.run(['python3', '/app/docx_to_pdf.py', '/work/in.docx', '-o', '/work/converted.pdf'], folder, CONVERT_MS);
          input = '/work/converted.pdf';
        }
        await print.tools.run(['python3', '/app/stamp_qr.py', input, '/work/out.pdf', link, label], folder, STAMP_MS);
        pdf = await readFile(path.join(folder, 'out.pdf'));
      } catch (err) {
        // The error is never logged: a script's message holds the link.
        return sendError(isTimeout(err) ? 'timeout' : 'crash');
      }
      try {
        await ctx.api.sendPrint(testId, ctx.runId, job.filesVersion, pdf);
        return 'saved';
      } catch (err) {
        // A PDF that the API refuses (a bad request, not a PDF, too large,
        // invalid) counts an attempt, so it fails in the end instead of
        // being made by every run.
        if (refusal(err) === 'invalid' || refusedPdf(err)) return sendError('crash');
        throw err;
      }
    })();
  } catch (err) {
    const kind = refusal(err);
    if (kind !== 'dropped' && kind !== 'lease_lost') throw err;
    end = kind;
  } finally {
    await removeFolder(folder);
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  log('print', type ? { test: testId, type, end, seconds } : { test: testId, end, seconds });
  return end;
}
