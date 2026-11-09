import { execFile } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCX_TYPE, extensionFor, PDF_TYPE } from '../shared/files.ts';
import type { TestFileKind, TestVariant } from '../shared/files.ts';
import type { ClassResults } from '../shared/runner.ts';
import type { ExerciseList } from '../shared/schemas.ts';

// The work folder of one robot task (spec §12.3). It is the working directory
// of Claude, outside the repo: Claude finds the skill and no CLAUDE.md or
// AGENTS.md, and --restricted keeps it inside. The files hold no names: the
// pages are named by their upload order.
//
//   .claude/skills/evaluate-test/   a copy of the repo's grading skill
//   test/test.pdf                   or test/test.md and test/media/… (from Word)
//   barem/barem.pdf                 or barem/barem.md and barem/media/… (from Word)
//   barem/notes.md                  (when the teacher added comments to the barem)
//   exercises.json                  (grade) the exercise list
//   student/page-01.jpg, …          (grade) the pages, in upload order
//   notes.md                        (barem) the teacher's comments for the barem to write; no barem/ folder
//   class-results.json              (class-report) the graded class, anonymized; no test, no barem
//   ces.md                          (CES variant) says that test/ and barem/ are the CES variant's
//   class/exercises.json            (CES exercise list, CES barem) the class list, whose ids the CES list reuses
//   class/barem.pdf                 or class/barem.md and class/media/… (CES barem) the class barem

export const SKILL_DIR = fileURLToPath(new URL('../.claude/skills/evaluate-test/', import.meta.url));

export interface TaskFile {
  bytes: Uint8Array;
  contentType: string;
}

export interface WorkFolderInput {
  // Not for the class analysis: the exercise list in its results holds what it needs.
  test?: TaskFile;
  barem?: TaskFile;
  // Extra teacher comments for the barem, as part of it.
  baremNotes?: string;
  // Grade mode: the test's exercise list and the student's pages, in upload order.
  exerciseList?: ExerciseList;
  pages?: TaskFile[];
  // Barem mode: what the teacher asked for the barem to write. Not the notes of
  // a barem that exists (baremNotes).
  requestNotes?: string;
  // Class-report mode: the graded class, anonymized.
  classResults?: ClassResults;
  // "ces": the task is for the CES variant of the test; ces.md says so.
  variant?: TestVariant;
  // The CES variant's tasks: the class exercise list and the class barem.
  classExerciseList?: ExerciseList | null;
  classBarem?: TaskFile | null;
}

// What ces.md says, for the skill: the files are the CES variant's.
export const CES_NOTE = [
  'This task is for the CES variant of the test: an adapted test for the students of the class',
  'with special educational needs (CES, "cerințe educaționale speciale"). test/ (and barem/, when it is here)',
  'are the CES variant\'s files. Follow the CES notes of your mode in SKILL.md.',
].join('\n');

// Runs pandoc with these arguments in this folder.
export type Pandoc = (args: string[], cwd: string) => Promise<void>;

// pandoc reads a file the teacher made, so it gets only the variables it needs
// to start: never the robot key or the Claude token that the Grade step holds.
const PANDOC_ENV = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot'];

export function pandocEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of PANDOC_ENV) {
    const value = env[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

export const realPandoc: Pandoc = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile('pandoc', args, { cwd, timeout: 120_000, env: pandocEnv(process.env) }, (err) => (err ? reject(err) : resolve()));
  });

// The folder of one run: task folders and Claude's empty settings folder.
export function runFolder(env: Record<string, string | undefined>, runId: string): string {
  return path.join(env.RUNNER_TEMP || tmpdir(), 'qe', runId);
}

// The rules every barem carries, on top of the teacher's own comments for one
// test. They are the first lines of barem/notes.md.
export const DEFAULT_BAREM_NOTES = [
  'Nu puncta rezolvările care nu se bazează pe ipoteza problemei sau care nu au legătură cu cerințele problemei.',
  'Punctează și rezolvările corecte, parțiale sau totale, care nu se potrivesc cu rezultatele parțiale din barem.',
].join('\n');

export interface WorkFolderOptions {
  skillDir?: string;
  pandoc?: Pandoc;
}

export async function makeWorkFolder(root: string, taskId: string, input: WorkFolderInput, options: WorkFolderOptions = {}): Promise<string> {
  const folder = path.join(root, taskId);
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  await cp(options.skillDir ?? SKILL_DIR, path.join(folder, '.claude', 'skills', 'evaluate-test'), { recursive: true });
  const pandoc = options.pandoc ?? realPandoc;
  if (input.test) await writeTeacherFile(folder, 'test', input.test, pandoc);
  if (input.barem) await writeTeacherFile(folder, 'barem', input.barem, pandoc);
  if (input.barem) {
    const teacherNotes = input.baremNotes?.trim();
    const notes = teacherNotes ? `${DEFAULT_BAREM_NOTES}\n${teacherNotes}` : DEFAULT_BAREM_NOTES;
    await writeFile(path.join(folder, 'barem', 'notes.md'), `${notes}\n`);
  }
  const requestNotes = input.requestNotes?.trim();
  if (requestNotes) await writeFile(path.join(folder, 'notes.md'), `${requestNotes}\n`);
  if (input.exerciseList) {
    await writeFile(path.join(folder, 'exercises.json'), `${JSON.stringify(input.exerciseList, null, 2)}\n`);
  }
  if (input.classResults) {
    await writeFile(path.join(folder, 'class-results.json'), `${JSON.stringify(input.classResults, null, 2)}\n`);
  }
  if (input.variant === 'ces') await writeFile(path.join(folder, 'ces.md'), `${CES_NOTE}\n`);
  if (input.classBarem) await writeTeacherFile(folder, 'barem', input.classBarem, pandoc, 'class');
  if (input.classExerciseList) {
    await mkdir(path.join(folder, 'class'), { recursive: true });
    await writeFile(path.join(folder, 'class', 'exercises.json'), `${JSON.stringify(input.classExerciseList, null, 2)}\n`);
  }
  if (input.pages) {
    await mkdir(path.join(folder, 'student'));
    for (const [index, page] of input.pages.entries()) {
      const name = `page-${String(index + 1).padStart(2, '0')}.${extensionFor(page.contentType)}`;
      await writeFile(path.join(folder, 'student', name), page.bytes);
    }
  }
  return folder;
}

// A PDF stays as it is: Claude reads PDFs. A Word file becomes pandoc's
// Markdown, with TeX math between $ and its pictures in <dir>/media/. Not
// GitHub's Markdown: it turns "a)" and "b)" into "1)" and "2)", and the
// exercise names are lost. The folder is the kind's own, or `class` for the
// class barem of a CES task.
async function writeTeacherFile(folder: string, kind: TestFileKind, file: TaskFile, pandoc: Pandoc, dir: string = kind): Promise<void> {
  await mkdir(path.join(folder, dir), { recursive: true });
  if (file.contentType === PDF_TYPE) {
    await writeFile(path.join(folder, dir, `${kind}.pdf`), file.bytes);
    return;
  }
  if (file.contentType !== DOCX_TYPE) throw new Error(`unknown ${kind} file type`);
  const source = `${dir}/source.docx`;
  await writeFile(path.join(folder, source), file.bytes);
  // Relative paths with "/", run in the work folder: the picture links then work from it.
  await pandoc(['--sandbox', source, '-t', 'markdown', `--extract-media=${dir}`, '-o', `${dir}/${kind}.md`], folder);
  await rm(path.join(folder, source));
}

export async function removeFolder(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true });
}
