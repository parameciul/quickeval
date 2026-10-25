import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RobotApi } from './api.ts';
import { robotApi, RobotApiError } from './api.ts';
import { makePrint, PrintSetupError, type PrintTools } from './printTask.ts';
import type { TaskContext } from './tasks.ts';
import { API_URL, fetchFrom, type OpenTest, openTestWithFile, ROBOT_KEY, SOURCE_BYTES } from './test/robotWorld.ts';
import type { TestApi } from '../server/test/testApi.ts';
import { scriptedClaude } from './test/scriptedClaude.ts';

const RUN = 'run-print-task-01';
const STAMPED = '%PDF-1.7 stamped';

let api: TestApi | undefined;
let open: OpenTest;
let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'qe-print-'));
});

afterEach(async () => {
  await api?.dispose();
  api = undefined;
  rmSync(root, { recursive: true, force: true });
});

async function setUp(type: 'pdf' | 'docx'): Promise<void> {
  const world = await openTestWithFile(type, RUN);
  api = world.api;
  open = world;
}

interface Call {
  args: string[];
  folder: string;
  timeoutMs: number;
  // The files in the folder when the step ran.
  files: string[];
}

// A container that writes /work/out.pdf for the stamp, or runs `step` instead.
function fakeTools(step?: (call: Call) => Promise<void> | void): PrintTools & { calls: Call[]; prepared: number } {
  const tools = {
    calls: [] as Call[],
    prepared: 0,
    prepare: async () => {
      tools.prepared += 1;
    },
    run: async (args: string[], folder: string, timeoutMs: number) => {
      const call = { args, folder, timeoutMs, files: readdirSync(folder).sort() };
      tools.calls.push(call);
      if (step) return step(call);
      if (args[1] === '/app/stamp_qr.py') writeFileSync(path.join(folder, 'out.pdf'), STAMPED);
    },
  };
  return tools;
}

function context(tools: PrintTools, wrap: (api: RobotApi) => RobotApi = (api) => api): { ctx: TaskContext; print: { tools: PrintTools; siteUrl: string } } {
  const robot = wrap(robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(api!), retryDelayMs: 0 }));
  const print = { tools, siteUrl: `${API_URL}/` };
  return { ctx: { api: robot, claude: scriptedClaude().run, runId: RUN, root, print }, print };
}

const printRow = () =>
  api!.db
    .prepare('SELECT print_status, print_attempts, print_file_key FROM tests WHERE id = ?')
    .bind(open.testId)
    .first<{ print_status: string; print_attempts: number; print_file_key: string | null }>();

async function storedPrint(): Promise<string | null> {
  const key = (await printRow())?.print_file_key;
  const object = key ? await api!.env.FILES.get(key) : null;
  return object ? object.text() : null;
}

describe('makePrint', () => {
  it('stamps a PDF test and saves it', async () => {
    await setUp('pdf');
    const tools = fakeTools();
    const { ctx, print } = context(tools);
    expect(await makePrint(ctx, print, open.testId)).toBe('saved');
    expect(tools.prepared).toBe(1);
    expect(tools.calls.map((call) => call.args)).toEqual([
      ['python3', '/app/stamp_qr.py', '/work/in.pdf', '/work/out.pdf', `https://quickeval.test/u/${open.uploadToken}`, `quickeval.test/u/${open.uploadToken}`],
    ]);
    expect(tools.calls[0]!.timeoutMs).toBe(60_000);
    expect(tools.calls[0]!.folder).toBe(path.join(root, `print-${open.testId}`));
    expect(tools.calls[0]!.files).toEqual(['in.pdf']);
    expect(await printRow()).toMatchObject({ print_status: 'ready', print_attempts: 0 });
    expect(await storedPrint()).toBe(STAMPED);
  });

  it('converts a Word test first', async () => {
    await setUp('docx');
    let source = '';
    const tools = fakeTools((call) => {
      if (call.args[1] === '/app/docx_to_pdf.py') {
        source = readFileSync(path.join(call.folder, 'in.docx'), 'utf8');
        writeFileSync(path.join(call.folder, 'converted.pdf'), '%PDF-1.7 converted');
      } else writeFileSync(path.join(call.folder, 'out.pdf'), STAMPED);
    });
    const { ctx, print } = context(tools);
    expect(await makePrint(ctx, print, open.testId)).toBe('saved');
    expect(source).toBe(SOURCE_BYTES.docx);
    expect(tools.calls.map((call) => call.args)).toEqual([
      ['python3', '/app/docx_to_pdf.py', '/work/in.docx', '-o', '/work/converted.pdf'],
      ['python3', '/app/stamp_qr.py', '/work/converted.pdf', '/work/out.pdf', `https://quickeval.test/u/${open.uploadToken}`, `quickeval.test/u/${open.uploadToken}`],
    ]);
    // The conversion may start LibreOffice twice, each time with a cold profile.
    expect(tools.calls.map((call) => call.timeoutMs)).toEqual([180_000, 60_000]);
    expect(await printRow()).toMatchObject({ print_status: 'ready' });
  });

  it('counts a failure as a crash and a timeout as a timeout', async () => {
    await setUp('pdf');
    const errors: string[] = [];
    const spy = (robot: RobotApi): RobotApi => ({
      ...robot,
      sendPrintFailed: (testId, body) => {
        errors.push(body.error);
        return robot.sendPrintFailed(testId, body);
      },
    });
    const failing = context(
      fakeTools(() => Promise.reject({ kind: 'failed' })),
      spy,
    );
    expect(await makePrint(failing.ctx, failing.print, open.testId)).toBe('retry');
    expect(await printRow()).toMatchObject({ print_status: 'none', print_attempts: 1 });
    const slow = context(
      fakeTools(() => Promise.reject({ kind: 'timeout' })),
      spy,
    );
    expect(await makePrint(slow.ctx, slow.print, open.testId)).toBe('retry');
    expect(await printRow()).toMatchObject({ print_status: 'none', print_attempts: 2 });
    // A stamp that ends without its output is a crash too; the third attempt fails for good.
    const empty = context(
      fakeTools(() => undefined),
      spy,
    );
    expect(await makePrint(empty.ctx, empty.print, open.testId)).toBe('failed');
    expect(await printRow()).toMatchObject({ print_status: 'failed', print_attempts: 3 });
    expect(errors).toEqual(['crash', 'timeout', 'crash']);
  });

  it.each([400, 413, 415, 422])('counts a PDF that the API refuses with %i as a crash', async (status) => {
    await setUp('pdf');
    const errors: string[] = [];
    const refusing = (robot: RobotApi): RobotApi => ({
      ...robot,
      sendPrint: () => Promise.reject(new RobotApiError(status, 'invalid')),
      sendPrintFailed: (testId, body) => {
        errors.push(body.error);
        return robot.sendPrintFailed(testId, body);
      },
    });
    const { ctx, print } = context(fakeTools(), refusing);
    expect(await makePrint(ctx, print, open.testId)).toBe('retry');
    expect(errors).toEqual(['crash']);
    expect(await printRow()).toMatchObject({ print_status: 'none', print_attempts: 1 });
  });

  it('stops the run when the API fails otherwise', async () => {
    await setUp('pdf');
    const down = (robot: RobotApi): RobotApi => ({ ...robot, sendPrint: () => Promise.reject(new RobotApiError(500, 'internal')) });
    const { ctx, print } = context(fakeTools(), down);
    await expect(makePrint(ctx, print, open.testId)).rejects.toBeInstanceOf(RobotApiError);
    expect(await printRow()).toMatchObject({ print_status: 'none', print_attempts: 0 });
  });

  it('drops a print whose test file changed', async () => {
    await setUp('pdf');
    const tools = fakeTools(async (call) => {
      await api!.db.prepare('UPDATE tests SET files_version = files_version + 1 WHERE id = ?').bind(open.testId).run();
      writeFileSync(path.join(call.folder, 'out.pdf'), STAMPED);
    });
    const { ctx, print } = context(tools);
    expect(await makePrint(ctx, print, open.testId)).toBe('dropped');
    expect(await printRow()).toMatchObject({ print_status: 'none', print_attempts: 0, print_file_key: null });
  });

  it('drops a test that no longer waits for its print PDF, and ends at a lost lease', async () => {
    await setUp('pdf');
    await api!.db.prepare("UPDATE tests SET print_status = 'ready', print_file_key = 'k' WHERE id = ?").bind(open.testId).run();
    const gone = context(fakeTools());
    expect(await makePrint(gone.ctx, gone.print, open.testId)).toBe('dropped');
    await api!.db.prepare("UPDATE tests SET print_status = 'none', print_file_key = NULL WHERE id = ?").bind(open.testId).run();
    await api!.db.prepare("UPDATE runner_state SET run_id = 'run-print-other' WHERE id = 1").run();
    const lost = context(fakeTools());
    expect(await makePrint(lost.ctx, lost.print, open.testId)).toBe('lease_lost');
  });

  it('never logs the token, the link, or a script message', async () => {
    await setUp('pdf');
    const lines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.join(' '));
    });
    try {
      const tools = fakeTools((call) =>
        Promise.reject(new Error(`Command failed: docker run quickeval-print ${call.args.join(' ')}\nTraceback: LibreOffice /work/in.pdf`)),
      );
      const { ctx, print } = context(tools);
      expect(await makePrint(ctx, print, open.testId)).toBe('retry');
    } finally {
      logSpy.mockRestore();
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`^\\[robot\\] print test=${open.testId} type=pdf end=retry seconds=\\d+$`));
    for (const line of lines) {
      expect(line).not.toContain(open.uploadToken);
      expect(line).not.toContain('Traceback');
    }
  });

  it('removes its folder', async () => {
    await setUp('pdf');
    const saved = context(fakeTools());
    expect(await makePrint(saved.ctx, saved.print, open.testId)).toBe('saved');
    expect(readdirSync(root)).toEqual([]);
    await api!.db.prepare("UPDATE tests SET print_status = 'none', print_file_key = NULL WHERE id = ?").bind(open.testId).run();
    const failed = context(fakeTools(() => Promise.reject({ kind: 'failed' })));
    expect(await makePrint(failed.ctx, failed.print, open.testId)).toBe('retry');
    expect(readdirSync(root)).toEqual([]);
  });

  it('sends nothing and removes its folder when the image cannot be built', async () => {
    await setUp('pdf');
    const tools = fakeTools();
    tools.prepare = () => Promise.reject(new PrintSetupError('docker build failed'));
    const { ctx, print } = context(tools);
    await expect(makePrint(ctx, print, open.testId)).rejects.toBeInstanceOf(PrintSetupError);
    expect(tools.calls).toEqual([]);
    expect(await printRow()).toMatchObject({ print_status: 'none', print_attempts: 0 });
    expect(existsSync(path.join(root, `print-${open.testId}`))).toBe(false);
  });
});
