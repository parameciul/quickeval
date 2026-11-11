import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extensionFor } from '../shared/files.ts';
import {
  checkExerciseList,
  checkGeneratedBarem,
  checkGrading,
  claudeJsonSchema,
  type ExerciseList,
  exerciseListAnswerSchema,
  exerciseListSchema,
  generatedBaremAnswerSchema,
  generatedBaremSchema,
  gradingResultSchema,
  subjectOf,
} from '../shared/schemas.ts';
import { normalizeTestCode } from '../shared/tests.ts';
import type { ClaudeMode, ClaudeOutcome, ClaudeRunner } from './claude.ts';
import { claudeRunner, claudeSettings } from './claude.ts';
import { type PaperRun, reportMarkdown, type Side, type TestRun, verdict } from './compareReport.ts';
import type { TaskFile, WorkFolderInput, WorkFolderOptions } from './workdir.ts';
import { DEFAULT_BAREM_NOTES, makeWorkFolder, removeFolder, runFolder, SKILL_DIR } from './workdir.ts';

// `npm run compare:skills` (spec: any subject, "The math comparison"): grades
// real math tests of the live site with the old grading skill (from `main`)
// and the new one, the way the robot does, and writes a report that compares
// both with the teacher's final points. It only reads the live database and
// R2, through Wrangler and the user's own login. Everything it reads lands in
// a folder outside the repo, and the papers are numbered, never named.
//
//   npm run compare:skills -- list
//   npm run compare:skills -- run <folder> <code> <code> [--papers 10] [--parallel 2] [--ref origin/main]

const USAGE =
  'Folosire: npm run compare:skills -- list   sau   npm run compare:skills -- run <dosar> <cod test> <cod test> [--papers 10] [--parallel 2] [--ref origin/main]';

export const REPO_DIR = fileURLToPath(new URL('..', import.meta.url));
// Found as Node finds a package: a worktree has no node_modules of its own and
// uses the main checkout's.
export const WRANGLER = path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js');

// The first barem note before the change (spec: "ipoteza problemei"): the old
// side grades with the old note, the new side with DEFAULT_BAREM_NOTES.
export const OLD_BAREM_NOTES = [
  'Nu puncta rezolvările care nu se bazează pe ipoteza problemei sau care nu au legătură cu cerințele problemei.',
  ...DEFAULT_BAREM_NOTES.split('\n').slice(1),
].join('\n');

// The live site, read only.
export interface Live {
  query<T>(sql: string): Promise<T[]>;
  // Saves the R2 object to the file.
  download(key: string, file: string): Promise<void>;
}

function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout),
    );
  });
}

// The live D1 and R2 through Wrangler, with the user's Wrangler login.
export function wranglerLive(): Live {
  const wrangler = (args: string[]) => run(process.execPath, [WRANGLER, ...args], REPO_DIR);
  return {
    query: async <T,>(sql: string) => {
      const out = await wrangler(['d1', 'execute', 'quickeval', '--remote', '--json', '--command', sql]);
      const parsed = JSON.parse(out) as { results: T[] }[];
      return parsed[0]?.results ?? [];
    },
    download: async (key, file) => {
      await wrangler(['r2', 'object', 'get', `quickeval-files/${key}`, '--remote', '--file', file]);
    },
  };
}

export interface CompareOptions {
  claude?: ClaudeRunner;
  live?: Live;
  print?: (line: string) => void;
  // The old skill's folder; by default taken from `git archive <ref>`.
  oldSkillDir?: string;
  workdir?: WorkFolderOptions;
}

interface Candidate {
  code: string;
  title: string;
  graded: number;
  corrected: number;
}

const CANDIDATES = `SELECT t.code, t.title,
  (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status = 'graded') AS graded,
  (SELECT COUNT(*) FROM evaluation_items i JOIN evaluations ev ON ev.id = i.evaluation_id JOIN submissions s ON s.id = ev.submission_id
     WHERE s.test_id = t.id AND i.changed_by_teacher = 1) AS corrected
  FROM tests t
  WHERE t.quick_try = 0 AND t.test_file_key IS NOT NULL AND t.barem_file_key IS NOT NULL AND t.exercise_list_json IS NOT NULL
  ORDER BY corrected DESC, graded DESC LIMIT 20`;

// One live test with its files and graded papers, in the folder.
interface TestData {
  code: string;
  test: TaskFile;
  barem: TaskFile;
  baremNotes: string;
  liveList: ExerciseList;
  papers: { pages: TaskFile[]; teacher: Record<string, number> }[];
}

async function fetchTest(live: Live, code: string, dir: string, papers: number): Promise<TestData> {
  // The code is checked by normalizeTestCode: safe inside the SQL text.
  const rows = await live.query<{
    id: number;
    test_file_key: string;
    test_file_type: string;
    barem_file_key: string;
    barem_file_type: string;
    barem_notes: string | null;
    exercise_list_json: string;
  }>(
    `SELECT id, test_file_key, test_file_type, barem_file_key, barem_file_type, barem_notes, exercise_list_json FROM tests
     WHERE code = '${code}' AND quick_try = 0 AND test_file_key IS NOT NULL AND barem_file_key IS NOT NULL AND exercise_list_json IS NOT NULL`,
  );
  if (rows.length !== 1) throw new Error(rows.length === 0 ? `Testul ${code} nu există sau nu are testul, baremul și lista.` : `Codul ${code} este la mai mulți profesori.`);
  const row = rows[0]!;
  await mkdir(path.join(dir, 'papers'), { recursive: true });
  const teacherFile = async (kind: 'test' | 'barem', key: string, type: string): Promise<TaskFile> => {
    const file = path.join(dir, `${kind}.${extensionFor(type)}`);
    await live.download(key, file);
    return { bytes: await readFile(file), contentType: type };
  };
  const test = await teacherFile('test', row.test_file_key, row.test_file_type);
  const barem = await teacherFile('barem', row.barem_file_key, row.barem_file_type);
  // The class papers only: a CES paper has another list.
  const ids = (
    await live.query<{ id: number }>(
      `SELECT id FROM submissions WHERE test_id = ${Number(row.id)} AND status = 'graded' AND COALESCE(variant, 'class') <> 'ces' ORDER BY id LIMIT ${papers}`,
    )
  ).map((paper) => Number(paper.id));
  const files = ids.length
    ? await live.query<{ submission_id: number; r2_key: string; content_type: string }>(
        `SELECT submission_id, r2_key, content_type FROM submission_files WHERE submission_id IN (${ids.join(',')}) ORDER BY submission_id, position`,
      )
    : [];
  const items = ids.length
    ? await live.query<{ submission_id: number; exercise_id: string; points: number }>(
        `SELECT ev.submission_id, i.exercise_id, i.points FROM evaluations ev JOIN evaluation_items i ON i.evaluation_id = ev.id
         WHERE ev.submission_id IN (${ids.join(',')})`,
      )
    : [];
  const result: TestData['papers'] = [];
  for (const [index, id] of ids.entries()) {
    const pages: TaskFile[] = [];
    for (const [page, file] of files.filter((one) => Number(one.submission_id) === id).entries()) {
      const name = path.join(dir, 'papers', String(index + 1), `page-${String(page + 1).padStart(2, '0')}.${extensionFor(file.content_type)}`);
      await mkdir(path.dirname(name), { recursive: true });
      await live.download(file.r2_key, name);
      pages.push({ bytes: await readFile(name), contentType: file.content_type });
    }
    const teacher = Object.fromEntries(items.filter((item) => Number(item.submission_id) === id).map((item) => [item.exercise_id, Number(item.points)]));
    result.push({ pages, teacher });
  }
  return { code, test, barem, baremNotes: row.barem_notes ?? '', liveList: JSON.parse(row.exercise_list_json) as ExerciseList, papers: result };
}

// At most `size` tasks at once.
async function pool(tasks: (() => Promise<void>)[], size: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]!();
  };
  await Promise.all(Array.from({ length: Math.max(1, size) }, worker));
}

// The old skill's folder, from `git archive <ref>`.
export async function oldSkill(ref: string, into: string): Promise<string> {
  await mkdir(into, { recursive: true });
  const tar = path.join(into, 'skill.tar');
  await run('git', ['archive', '--format=tar', `--output=${tar}`, ref, '.claude/skills/evaluate-test'], REPO_DIR);
  // A relative name: GNU tar (Git for Windows) reads "C:" in a path as a remote host.
  await run('tar', ['-xf', 'skill.tar'], into);
  return path.join(into, '.claude', 'skills', 'evaluate-test');
}

function option(args: string[], name: string, fallback: string): string {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1]! : fallback;
}

// Whether `folder` is inside the repo: student pages must never land there.
export function insideRepo(folder: string, repo = REPO_DIR): boolean {
  const relative = path.relative(path.resolve(repo), path.resolve(folder));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function compareSkills(args: string[], env: Record<string, string | undefined>, options: CompareOptions = {}): Promise<number> {
  const print = options.print ?? ((line: string) => console.log(line));
  const live = options.live ?? wranglerLive();
  if (args[0] === 'list') {
    const candidates = await live.query<Candidate>(CANDIDATES);
    if (candidates.length === 0) print('Nu am găsit niciun test cu test, barem și lucrări corectate.');
    for (const one of candidates) print(`${one.code} · ${one.title} · ${one.graded} lucrări corectate · ${one.corrected} punctaje schimbate de profesor`);
    return 0;
  }
  const [mode, folderArg, ...rest] = args;
  const codes = rest.filter((arg, index) => !arg.startsWith('--') && !rest[index - 1]?.startsWith('--')).map(normalizeTestCode);
  const papers = Number(option(rest, '--papers', '10'));
  const parallel = Number(option(rest, '--parallel', '2'));
  if (mode !== 'run' || !folderArg || codes.length === 0 || codes.some((code) => code === null) || !(papers >= 1) || !(parallel >= 1)) {
    print(USAGE);
    return 1;
  }
  const folder = path.resolve(folderArg);
  if (insideRepo(folder)) {
    print('Alege un dosar în afara proiectului: în el ajung lucrările elevilor.');
    return 1;
  }
  if (!options.claude && !env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {
    print('Lipsește CLAUDE_CODE_OAUTH_TOKEN. Fă tokenul cu „claude setup-token” și pune-l în această variabilă.');
    return 1;
  }
  const root = runFolder(env, `compare-${randomBytes(4).toString('hex')}`);
  try {
    const configDir = path.join(root, 'claude-config');
    await mkdir(configDir, { recursive: true });
    const claude = options.claude ?? claudeRunner(claudeSettings(env, configDir));
    const skills: Record<Side, string> = {
      old: options.oldSkillDir ?? (await oldSkill(option(rest, '--ref', 'origin/main'), path.join(folder, 'old-skill'))),
      new: options.workdir?.skillDir ?? SKILL_DIR,
    };
    const notes: Record<Side, string> = { old: OLD_BAREM_NOTES, new: DEFAULT_BAREM_NOTES };
    // The old robot asked for no subject; the new one asks in two modes.
    const schemas: Record<Side, Record<'exercise-list' | 'barem', object>> = {
      old: { 'exercise-list': claudeJsonSchema(exerciseListSchema), barem: claudeJsonSchema(generatedBaremSchema) },
      new: { 'exercise-list': claudeJsonSchema(exerciseListAnswerSchema), barem: claudeJsonSchema(generatedBaremAnswerSchema) },
    };
    let task = 0;
    const ask = async (side: Side, mode: ClaudeMode, input: WorkFolderInput, keep: string): Promise<ClaudeOutcome> => {
      const taskId = `${mode}-${side}-${task++}`;
      try {
        const cwd = await makeWorkFolder(root, taskId, input, { ...options.workdir, skillDir: skills[side], defaultNotes: notes[side] });
        const jsonSchema = mode === 'grade' ? claudeJsonSchema(gradingResultSchema) : schemas[side][mode as 'exercise-list' | 'barem'];
        const outcome = await claude({ mode, cwd, jsonSchema });
        await writeFile(keep, `${JSON.stringify(outcome.ok ? outcome.output : { problem: outcome.problem, detail: outcome.detail }, null, 2)}\n`);
        if (!outcome.ok) print(`${path.basename(keep)}: Claude nu a reușit (${outcome.problem}).`);
        return outcome;
      } finally {
        await removeFolder(path.join(root, taskId));
      }
    };
    const runs: TestRun[] = [];
    for (const code of codes as string[]) {
      const dir = path.join(folder, code);
      print(`Citesc testul ${code}…`);
      const data = await fetchTest(live, code, dir, papers);
      for (const side of ['old', 'new'] as const) await mkdir(path.join(dir, side), { recursive: true });
      const testRun: TestRun = {
        code,
        liveList: data.liveList,
        lists: { old: null, new: null },
        barems: { old: null, new: null },
        subjects: { list: null, barem: null },
        papers: data.papers.map((paper, index): PaperRun => ({ paper: index + 1, old: null, new: null, teacher: paper.teacher })),
      };
      const tasks: (() => Promise<void>)[] = [];
      for (const side of ['old', 'new'] as const) {
        tasks.push(async () => {
          const outcome = await ask(side, 'exercise-list', { test: data.test, barem: data.barem, baremNotes: data.baremNotes }, path.join(dir, side, 'exercises.json'));
          const checked = outcome.ok ? checkExerciseList(outcome.output) : null;
          testRun.lists[side] = checked?.ok ? checked.value.list : null;
          if (side === 'new' && outcome.ok) testRun.subjects.list = subjectOf(outcome.output);
        });
        tasks.push(async () => {
          const outcome = await ask(side, 'barem', { test: data.test }, path.join(dir, side, 'barem.json'));
          const checked = outcome.ok ? checkGeneratedBarem(outcome.output) : null;
          testRun.barems[side] = checked?.ok ? checked.value : null;
          if (side === 'new' && outcome.ok) testRun.subjects.barem = subjectOf(outcome.output);
        });
        data.papers.forEach((paper, index) => {
          tasks.push(async () => {
            // Both sides grade against the list the live test uses; only the new side is told the subject.
            const subject = side === 'new' ? ('matematica' as const) : undefined;
            const input = { test: data.test, barem: data.barem, baremNotes: data.baremNotes, exerciseList: data.liveList, pages: paper.pages, subject };
            const outcome = await ask(side, 'grade', input, path.join(dir, side, `grading-${index + 1}.json`));
            const checked = outcome.ok ? checkGrading(outcome.output, data.liveList, subject ?? null) : null;
            testRun.papers[index]![side] = checked?.ok ? checked.value : null;
          });
        });
      }
      print(`Claude lucrează la testul ${code}: ${tasks.length} sarcini…`);
      await pool(tasks, parallel);
      runs.push(testRun);
    }
    await writeFile(path.join(folder, 'report.md'), reportMarkdown(runs));
    await writeFile(path.join(folder, 'results.json'), `${JSON.stringify(runs, null, 2)}\n`);
    const passed = runs.every((one) => verdict(one).pass);
    print(passed ? 'Rezultat: trece.' : 'Rezultat: nu trece.');
    print(`Am scris ${path.join(folder, 'report.md')}. Șterge dosarul după ce citești raportul: are lucrările elevilor.`);
    return passed ? 0 : 2;
  } finally {
    await removeFolder(root);
  }
}

if (import.meta.main) {
  process.exitCode = await compareSkills(process.argv.slice(2), process.env);
}
