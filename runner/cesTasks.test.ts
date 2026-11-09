import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markCes } from '../server/test/fixtures.ts';
import type { TestApi } from '../server/test/testApi.ts';
import { DOCX_TYPE, PDF_TYPE } from '../shared/files.ts';
import type { ExerciseList, GeneratedBarem } from '../shared/schemas.ts';
import { robotApi } from './api.ts';
import { makeBarem } from './baremTask.ts';
import type { PrintTools } from './printTask.ts';
import { makePrint } from './printTask.ts';
import type { TaskContext } from './tasks.ts';
import { gradeSubmission, makeExerciseList } from './tasks.ts';
import { addOpenTest, API_URL, evaluatingTest, fetchFrom, ROBOT_KEY } from './test/robotWorld.ts';
import { answer, scriptedClaude } from './test/scriptedClaude.ts';
import { CES_NOTE, type Pandoc } from './workdir.ts';

// The robot's work on the CES variant of a test: its print PDF, its generated
// barem and its exercise list, each from the CES files (spec: CES variant).

const RUN = 'run-ces-tasks-0001';

const CLASS_LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 5, answer: '1', scoringNotes: '', topic: 'Partea întreagă' },
    { id: 'I.2', label: 'Subiectul I, exercițiul 2', maxPoints: 4, answer: '-2', scoringNotes: '', topic: 'Modulul' },
  ],
  notes: '',
};

const CES_BAREM: GeneratedBarem = {
  title: 'Test adaptat – Modulul',
  subtitle: 'Matematică – clasa a IX-a',
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
          items: [
            { label: '1.', steps: [{ text: 'Spațiile: $-3$ și $-2$.', points: 5 }] },
            { label: '2.', steps: [{ text: '$a = -2$.', points: 4 }] },
          ],
        },
      ],
    },
  ],
};

let api: TestApi | undefined;
let root: string;
let skillDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'qe-ces-'));
  skillDir = mkdtempSync(path.join(tmpdir(), 'qe-ces-skill-'));
  writeFileSync(path.join(skillDir, 'SKILL.md'), '# skill');
});

afterEach(async () => {
  await api?.dispose();
  api = undefined;
  rmSync(root, { recursive: true, force: true });
  rmSync(skillDir, { recursive: true, force: true });
});

// A pandoc that writes a Word file (a zip).
const fakePandoc: Pandoc = async (args, cwd) => {
  if (args.includes('docx')) writeFileSync(path.join(cwd, 'barem.docx'), 'PK\u0003\u0004 fake word');
};

function context(claude: ReturnType<typeof scriptedClaude>, print?: { tools: PrintTools; siteUrl: string }): TaskContext {
  const robot = robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(api!), retryDelayMs: 0 });
  return { api: robot, claude: claude.run, runId: RUN, root, workdir: { skillDir, pandoc: fakePandoc }, print };
}

const lease = () => api!.request('POST', '/api/runner/lease', { runId: RUN }, { Authorization: `Bearer ${ROBOT_KEY}` });
const setTest = (testId: number, sql: string, ...params: unknown[]) =>
  api!.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(...params, testId).run();
const read = async (key: string) => new TextDecoder().decode(new Uint8Array(await (await api!.env.FILES.get(key))!.arrayBuffer()));

// An open test with a class test and its CES variant's test file in R2.
async function openWithCesTest(): Promise<{ testId: number; code: string; uploadToken: string }> {
  const world = await evaluatingTest({ uploads: 0 });
  api = world.api;
  const open = await addOpenTest(api, 'pdf');
  const key = `fixture/${open.code}/ces/test.pdf`;
  await setTest(open.testId, "ces_test_file_key = ?, ces_test_file_name = 'Test adaptat.pdf', ces_test_file_type = ?", key, PDF_TYPE);
  await api.env.FILES.put(key, '%PDF-1.7 test adaptat');
  await lease();
  return open;
}

describe('makePrint for the CES variant', () => {
  it('stamps the CES test with the class link and saves it as the CES print PDF', async () => {
    const open = await openWithCesTest();
    // The class print PDF is made already: only the CES one waits.
    await setTest(open.testId, "print_status = 'ready', print_file_key = 'x/class-print.pdf'");
    const calls: string[][] = [];
    const tools: PrintTools = {
      prepare: async () => undefined,
      run: async (args, folder) => {
        calls.push(args);
        expect(readFileSync(path.join(folder, 'in.pdf'), 'utf8')).toBe('%PDF-1.7 test adaptat');
        writeFileSync(path.join(folder, 'out.pdf'), '%PDF-1.7 stamped');
      },
    };
    const end = await makePrint(context(scriptedClaude(), { tools, siteUrl: API_URL }), { tools, siteUrl: API_URL }, open.testId, 'ces');
    expect(end).toBe('saved');
    expect(calls[0]).toContain(`${API_URL}/u/${open.uploadToken}`);
    const row = await api!.db
      .prepare('SELECT print_status, print_file_key, ces_print_status, ces_print_file_key FROM tests WHERE id = ?')
      .bind(open.testId)
      .first<Record<string, string>>();
    expect(row).toMatchObject({ print_status: 'ready', print_file_key: 'x/class-print.pdf', ces_print_status: 'ready' });
    expect(row!.ces_print_file_key).toBe(`t/1/2026/${open.code}/ces/print/test-adaptat-v0-qr.pdf`);
    expect(await read(row!.ces_print_file_key!)).toBe('%PDF-1.7 stamped');
  });
});

describe('makeBarem for the CES variant', () => {
  it('writes the CES barem from the CES test, with the class barem and list beside it', async () => {
    const open = await openWithCesTest();
    await setTest(
      open.testId,
      "barem_file_key = ?, barem_file_name = 'barem.pdf', barem_file_type = ?, exercise_list_json = ?, exercise_list_status = 'ready', ces_barem_request = 'requested', ces_barem_notes = 'Fără indicații pentru profesor.'",
      `fixture/${open.code}/barem.pdf`,
      PDF_TYPE,
      JSON.stringify(CLASS_LIST),
    );
    await api!.env.FILES.put(`fixture/${open.code}/barem.pdf`, '%PDF-1.7 barem clasă');
    let ces = '';
    let classList = '';
    const claude = scriptedClaude((task) => {
      ces = readFileSync(path.join(task.cwd, 'ces.md'), 'utf8');
      classList = readFileSync(path.join(task.cwd, 'class', 'exercises.json'), 'utf8');
      return answer(CES_BAREM);
    });
    expect(await makeBarem(context(claude), open.testId, 'ces')).toBe('saved');
    expect(claude.calls[0]!.task.mode).toBe('barem');
    expect(claude.calls[0]!.files).toEqual([
      '.claude/skills/evaluate-test/SKILL.md',
      'ces.md',
      'class/barem.pdf',
      'class/exercises.json',
      'notes.md',
      'test/test.pdf',
    ]);
    expect(ces).toBe(`${CES_NOTE}\n`);
    expect(JSON.parse(classList)).toEqual(CLASS_LIST);
    const row = await api!.db
      .prepare('SELECT barem_file_key, ces_barem_file_key, ces_barem_file_name, ces_barem_file_type, ces_barem_unchecked, ces_barem_request, ces_files_version FROM tests WHERE id = ?')
      .bind(open.testId)
      .first<Record<string, string | number>>();
    expect(row).toMatchObject({
      barem_file_key: `fixture/${open.code}/barem.pdf`,
      ces_barem_file_key: `t/1/2026/${open.code}/ces/barem/generat_v0.docx`,
      ces_barem_file_name: `${open.code} - barem CES generat.docx`,
      ces_barem_file_type: DOCX_TYPE,
      ces_barem_unchecked: 1,
      ces_barem_request: 'none',
      ces_files_version: 1,
    });
  });

  it('writes a CES barem without a class barem, and says it is for the CES variant', async () => {
    const open = await openWithCesTest();
    await setTest(open.testId, "ces_barem_request = 'requested'");
    const claude = scriptedClaude(answer(CES_BAREM));
    expect(await makeBarem(context(claude), open.testId, 'ces')).toBe('saved');
    expect(claude.calls[0]!.files).toEqual(['.claude/skills/evaluate-test/SKILL.md', 'ces.md', 'test/test.pdf']);
  });
});

describe('gradeSubmission of a CES paper', () => {
  it('grades the paper with the CES test, barem and list, and says so in ces.md', async () => {
    const world = await evaluatingTest({ uploads: 1, pages: 1 });
    api = world.api;
    const studentId = (await api.db.prepare('SELECT student_id FROM submissions WHERE id = ?').bind(world.submissionIds[0]).first<{ student_id: number }>())!
      .student_id;
    await markCes(api, studentId);
    const cesList = { ...CLASS_LIST, exercises: [{ ...CLASS_LIST.exercises[0]!, maxPoints: 9 }] };
    await setTest(
      world.testId,
      `exercise_list_json = ?, exercise_list_status = 'ready', ces_exercise_list_json = ?, ces_exercise_list_status = 'ready',
       ces_test_file_key = 'fixture/ces/test.pdf', ces_test_file_name = 't.pdf', ces_test_file_type = ?,
       ces_barem_file_key = 'fixture/ces/barem.pdf', ces_barem_file_name = 'b.pdf', ces_barem_file_type = ?, ces_barem_notes = 'Scrisul nu se depunctează.'`,
      JSON.stringify(CLASS_LIST),
      JSON.stringify(cesList),
      PDF_TYPE,
      PDF_TYPE,
    );
    await api.env.FILES.put('fixture/ces/test.pdf', '%PDF-1.7 test CES');
    await api.env.FILES.put('fixture/ces/barem.pdf', '%PDF-1.7 barem CES');
    await lease();
    const claimed = await robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(api), retryDelayMs: 0 }).claim(RUN);
    expect(claimed).toMatchObject({ submissionId: world.submissionIds[0], variant: 'ces' });

    let seen = { test: '', barem: '', notes: '', list: '' };
    const claude = scriptedClaude((task) => {
      seen = {
        test: readFileSync(path.join(task.cwd, 'test', 'test.pdf'), 'utf8'),
        barem: readFileSync(path.join(task.cwd, 'barem', 'barem.pdf'), 'utf8'),
        notes: readFileSync(path.join(task.cwd, 'barem', 'notes.md'), 'utf8'),
        list: readFileSync(path.join(task.cwd, 'exercises.json'), 'utf8'),
      };
      return answer({
        items: [{ exerciseId: 'I.1', points: 7, studentAnswer: '1', comment: 'Bine.', confidence: 'high', needsReview: false, reviewReason: '', page: 1 }],
        unreadable: [],
        summary: 'Bine.',
        strengths: [],
        recommendations: ['Exersează.'],
      });
    });
    expect(await gradeSubmission(context(claude), claimed!)).toBe('saved');
    expect(claude.calls[0]!.files).toContain('ces.md');
    expect(seen.test).toBe('%PDF-1.7 test CES');
    expect(seen.barem).toBe('%PDF-1.7 barem CES');
    expect(seen.notes).toContain('Scrisul nu se depunctează.');
    expect(JSON.parse(seen.list)).toEqual(cesList);
    const evaluation = await api.db.prepare('SELECT total, max_total FROM evaluations WHERE submission_id = ?').bind(world.submissionIds[0]).first();
    expect(evaluation).toEqual({ total: 8, max_total: 10 });
  });
});

describe('makeExerciseList for the CES variant', () => {
  it('makes the CES list from the CES files, with the class list beside them, and keeps the class list', async () => {
    const world = await evaluatingTest({ uploads: 1 });
    api = world.api;
    const studentId = (await api.db.prepare('SELECT student_id FROM submissions WHERE id = ?').bind(world.submissionIds[0]).first<{ student_id: number }>())!
      .student_id;
    await markCes(api, studentId);
    await setTest(
      world.testId,
      `exercise_list_json = ?, exercise_list_status = 'ready',
       ces_test_file_key = 'fixture/ces/test.pdf', ces_test_file_name = 't.pdf', ces_test_file_type = ?,
       ces_barem_file_key = 'fixture/ces/barem.pdf', ces_barem_file_name = 'b.pdf', ces_barem_file_type = ?, ces_files_version = 2`,
      JSON.stringify(CLASS_LIST),
      PDF_TYPE,
      PDF_TYPE,
    );
    await api.env.FILES.put('fixture/ces/test.pdf', '%PDF-1.7 test CES');
    await api.env.FILES.put('fixture/ces/barem.pdf', '%PDF-1.7 barem CES');
    await lease();
    const tasks = await api.request('GET', '/api/runner/tasks', undefined, { Authorization: `Bearer ${ROBOT_KEY}` });
    expect(tasks.body).toMatchObject({ exerciseLists: [], cesExerciseLists: [world.testId] });

    const cesList = { ...CLASS_LIST, exercises: [CLASS_LIST.exercises[0]!, { ...CLASS_LIST.exercises[1]!, answer: '−2' }] };
    let test = '';
    const claude = scriptedClaude((task) => {
      test = readFileSync(path.join(task.cwd, 'test', 'test.pdf'), 'utf8');
      return answer(cesList);
    });
    expect(await makeExerciseList(context(claude), world.testId, 'ces')).toBe('saved');
    expect(test).toBe('%PDF-1.7 test CES');
    expect(claude.calls[0]!.files).toEqual([
      '.claude/skills/evaluate-test/SKILL.md',
      'barem/barem.pdf',
      'barem/notes.md',
      'ces.md',
      'class/exercises.json',
      'test/test.pdf',
    ]);
    const row = await api.db
      .prepare('SELECT exercise_list_json, ces_exercise_list_json, ces_exercise_list_status FROM tests WHERE id = ?')
      .bind(world.testId)
      .first<Record<string, string>>();
    expect(JSON.parse(row!.exercise_list_json!)).toEqual(CLASS_LIST);
    expect(JSON.parse(row!.ces_exercise_list_json!).exercises[1].answer).toBe('−2');
    expect(row!.ces_exercise_list_status).toBe('ready');
    expect(readdirSync(root)).toEqual([]);
  });
});
