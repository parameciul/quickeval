import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestApi } from '../server/test/testApi.ts';
import { DOCX_TYPE } from '../shared/files.ts';
import type { GeneratedBarem } from '../shared/schemas.ts';
import type { RobotApi } from './api.ts';
import { robotApi, RobotApiError } from './api.ts';
import { makeBarem } from './baremTask.ts';
import type { TaskContext } from './tasks.ts';
import { API_URL, fetchFrom, type OpenTest, openTestWithFile, requestBarem, ROBOT_KEY } from './test/robotWorld.ts';
import { answer, problem, scriptedClaude } from './test/scriptedClaude.ts';
import type { Pandoc } from './workdir.ts';

const RUN = 'run-barem-task-01';
const hasPandoc = spawnSync('pandoc', ['--version']).status === 0;

const BAREM: GeneratedBarem = {
  title: 'Test de evaluare – Fracții',
  subtitle: 'Matematică – clasa a VI-a – Timp de lucru: 50 de minute',
  notes: ['Se acordă 1 punct din oficiu.'],
  total: 10,
  officePoints: 1,
  parts: [
    {
      title: '',
      sections: [
        {
          title: 'SUBIECTUL I',
          points: 9,
          items: [{ label: '1.', steps: [{ text: 'Calculează $\\frac{3}{4}$.', points: 4 }, { text: 'Răspuns final.', points: 5 }] }],
        },
      ],
    },
  ],
};

let api: TestApi | undefined;
let open: OpenTest;
let root: string;
let skillDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'qe-barem-'));
  skillDir = mkdtempSync(path.join(tmpdir(), 'qe-barem-skill-'));
  writeFileSync(path.join(skillDir, 'SKILL.md'), '# skill');
});

afterEach(async () => {
  await api?.dispose();
  api = undefined;
  rmSync(root, { recursive: true, force: true });
  rmSync(skillDir, { recursive: true, force: true });
});

async function setUp(type: 'pdf' | 'docx' = 'pdf', notes = ''): Promise<void> {
  const world = await openTestWithFile(type, RUN);
  api = world.api;
  open = world;
  await requestBarem(api, open.testId, notes);
}

// A pandoc that writes a Word file (a zip) or the Markdown of a Word test.
function fakePandoc(): Pandoc {
  return async (args, cwd) => {
    if (args.includes('docx')) writeFileSync(path.join(cwd, 'barem.docx'), 'PK\u0003\u0004 fake word');
    else writeFileSync(path.join(cwd, 'test', 'test.md'), 'enunț');
  };
}

function context(claude: ReturnType<typeof scriptedClaude>, pandoc: Pandoc = fakePandoc(), wrap: (api: RobotApi) => RobotApi = (robot) => robot): TaskContext {
  const robot = wrap(robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(api!), retryDelayMs: 0 }));
  return { api: robot, claude: claude.run, runId: RUN, root, workdir: { skillDir, pandoc } };
}

const row = () =>
  api!.db
    .prepare('SELECT barem_request, barem_request_attempts, barem_unchecked, barem_file_key, barem_file_type FROM tests WHERE id = ?')
    .bind(open.testId)
    .first<{ barem_request: string; barem_request_attempts: number; barem_unchecked: number; barem_file_key: string | null; barem_file_type: string | null }>();

const storedStart = async () => {
  const object = await api!.env.FILES.get((await row())!.barem_file_key!);
  return new TextDecoder().decode(new Uint8Array(await object!.arrayBuffer()).slice(0, 2));
};

const withLogs = async (work: () => Promise<unknown>): Promise<string[]> => {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.join(' '));
  });
  try {
    await work();
  } finally {
    spy.mockRestore();
  }
  return lines;
};

const failedErrors = (errors: string[]) => (robot: RobotApi): RobotApi => ({
  ...robot,
  sendBaremFailed: (testId, body) => {
    errors.push(body.error);
    return robot.sendBaremFailed(testId, body);
  },
});

describe('makeBarem', () => {
  it('saves a generated barem', async () => {
    await setUp('pdf', 'Acordă punct parțial.');
    const claude = scriptedClaude(answer(BAREM));
    expect(await makeBarem(context(claude), open.testId)).toBe('saved');
    expect(await row()).toMatchObject({ barem_request: 'none', barem_unchecked: 1, barem_file_type: DOCX_TYPE });
    expect(await storedStart()).toBe('PK');
    expect(claude.calls[0]!.task.mode).toBe('barem');
    expect(claude.calls[0]!.files).toEqual(['.claude/skills/evaluate-test/SKILL.md', 'notes.md', 'test/test.pdf']);
  });

  it("gives Claude the test's subject when it is known", async () => {
    await setUp('pdf');
    await api!.db.prepare("UPDATE tests SET subject = 'chimie', subject_by = 'teacher' WHERE id = ?").bind(open.testId).run();
    let subject = '';
    const claude = scriptedClaude((task) => {
      subject = readFileSync(path.join(task.cwd, 'subject.md'), 'utf8');
      return answer(BAREM);
    });
    expect(await makeBarem(context(claude), open.testId)).toBe('saved');
    expect(subject).toBe('chimie\n');
  });

  it('turns a Word test into Markdown for Claude, and writes no notes without comments', async () => {
    await setUp('docx');
    const claude = scriptedClaude(answer(BAREM));
    expect(await makeBarem(context(claude), open.testId)).toBe('saved');
    expect(claude.calls[0]!.files).toContain('test/test.md');
    expect(claude.calls[0]!.files).not.toContain('notes.md');
  });

  it('tries Claude twice on an answer whose points do not add up', async () => {
    await setUp();
    const wrong = { ...BAREM, total: 11 };
    const claude = scriptedClaude(answer(wrong), answer(wrong));
    const errors: string[] = [];
    expect(await makeBarem(context(claude, fakePandoc(), failedErrors(errors)), open.testId)).toBe('retry');
    expect(claude.calls).toHaveLength(2);
    expect(errors).toEqual(['invalid_output']);
    expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 1, barem_unchecked: 0 });
  });

  it('fails after three attempts', async () => {
    await setUp();
    const ends: string[] = [];
    for (let i = 0; i < 3; i++) ends.push(await makeBarem(context(scriptedClaude(problem('crash'))), open.testId));
    expect(ends).toEqual(['retry', 'retry', 'failed']);
    expect(await row()).toMatchObject({ barem_request: 'failed', barem_request_attempts: 3 });
  });

  it('counts a pandoc failure as a crash', async () => {
    await setUp();
    const errors: string[] = [];
    const pandoc: Pandoc = () => Promise.reject(new Error('pandoc: bad input'));
    expect(await makeBarem(context(scriptedClaude(answer(BAREM)), pandoc, failedErrors(errors)), open.testId)).toBe('retry');
    expect(errors).toEqual(['crash']);
    expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 1 });
  });

  it('lets a missing pandoc go up without counting an attempt', async () => {
    await setUp();
    const missing = Object.assign(new Error('spawn pandoc ENOENT'), { code: 'ENOENT', syscall: 'spawn pandoc' });
    const pandoc: Pandoc = () => Promise.reject(missing);
    await expect(makeBarem(context(scriptedClaude(answer(BAREM)), pandoc), open.testId)).rejects.toBe(missing);
    expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 0 });
    expect(readdirSync(root)).toEqual([]);
  });

  it('counts a Word test that pandoc cannot read as a crash, and does not ask Claude', async () => {
    await setUp('docx');
    const pandoc: Pandoc = () => Promise.reject(new Error('pandoc: not a docx'));
    const claude = scriptedClaude();
    expect(await makeBarem(context(claude, pandoc), open.testId)).toBe('retry');
    expect(claude.calls).toHaveLength(0);
    expect(await row()).toMatchObject({ barem_request_attempts: 1 });
  });

  it.each([400, 413, 415, 422])('counts a file that the API refuses with %i as a crash', async (status) => {
    await setUp();
    const errors: string[] = [];
    const refusing = (robot: RobotApi): RobotApi =>
      failedErrors(errors)({ ...robot, sendBarem: () => Promise.reject(new RobotApiError(status, 'invalid')) });
    expect(await makeBarem(context(scriptedClaude(answer(BAREM)), fakePandoc(), refusing), open.testId)).toBe('retry');
    expect(errors).toEqual(['crash']);
    expect(await row()).toMatchObject({ barem_request_attempts: 1 });
  });

  it('stops the run when the API fails otherwise', async () => {
    await setUp();
    const down = (robot: RobotApi): RobotApi => ({ ...robot, sendBarem: () => Promise.reject(new RobotApiError(500, 'internal')) });
    await expect(makeBarem(context(scriptedClaude(answer(BAREM)), fakePandoc(), down), open.testId)).rejects.toBeInstanceOf(RobotApiError);
    expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 0 });
  });

  it('drops the work when the teacher uploaded a barem meanwhile', async () => {
    await setUp();
    const claude = scriptedClaude(async () => {
      await api!.db
        .prepare("UPDATE tests SET barem_request = 'none', barem_file_key = 'teacher/barem.pdf', files_version = files_version + 1 WHERE id = ?")
        .bind(open.testId)
        .run();
      return answer(BAREM);
    });
    expect(await makeBarem(context(claude), open.testId)).toBe('dropped');
    expect(await row()).toMatchObject({ barem_file_key: 'teacher/barem.pdf', barem_unchecked: 0 });
  });

  it('ends at a lost lease', async () => {
    await setUp();
    await api!.db.prepare("UPDATE runner_state SET run_id = 'run-barem-other' WHERE id = 1").run();
    expect(await makeBarem(context(scriptedClaude(answer(BAREM))), open.testId)).toBe('lease_lost');
  });

  it('stops at a usage limit without counting an attempt', async () => {
    await setUp();
    expect(await makeBarem(context(scriptedClaude(problem('usage_limit'))), open.testId)).toBe('usage_limit');
    expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 0 });
  });

  it('logs no test text', async () => {
    await setUp('pdf', 'Secret teacher comment');
    const lines = await withLogs(() => makeBarem(context(scriptedClaude(answer(BAREM))), open.testId));
    expect(lines.filter((line) => line.startsWith('[robot] barem '))).toHaveLength(1);
    expect(lines.some((line) => new RegExp(`^\\[robot\\] barem test=${open.testId} end=saved seconds=\\d+$`).test(line))).toBe(true);
    for (const line of lines) {
      for (const word of ['Fracții', 'Secret', 'enunț', 'SUBIECTUL', 'Calculează']) expect(line).not.toContain(word);
    }
  });

  it('removes its folders', async () => {
    await setUp();
    expect(await makeBarem(context(scriptedClaude(answer(BAREM))), open.testId)).toBe('saved');
    expect(readdirSync(root)).toEqual([]);
    await requestBarem(api!, open.testId);
    expect(await makeBarem(context(scriptedClaude(problem('crash'))), open.testId)).toBe('retry');
    expect(readdirSync(root)).toEqual([]);
  });

  it.skipIf(!hasPandoc)('makes a real Word file with pandoc', async () => {
    await setUp();
    const ctx = { ...context(scriptedClaude(answer(BAREM))), workdir: { skillDir } };
    expect(await makeBarem(ctx, open.testId)).toBe('saved');
    expect(await storedStart()).toBe('PK');
  });
});
