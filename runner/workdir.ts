import { execFile } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCX_TYPE, extensionFor, PDF_TYPE } from '../shared/files.ts';
import type { TestFileKind } from '../shared/files.ts';
import type { ExerciseList } from '../shared/schemas.ts';

// The work folder of one robot task (spec §12.3). It is the working directory
// of Claude, outside the repo: Claude finds the skill and no CLAUDE.md or
// AGENTS.md, and --restricted keeps it inside. The files hold no names: the
// pages are named by their upload order.
//
//   .claude/skills/evaluate-test/   a copy of the repo's grading skill
//   test/test.pdf                   or test/test.md and test/media/… (from Word)
//   barem/barem.pdf                 or barem/barem.md and barem/media/…
//   exercises.json                  (grade) the exercise list
//   student/page-01.jpg, …          (grade) the pages, in upload order

export const SKILL_DIR = fileURLToPath(new URL('../.claude/skills/evaluate-test/', import.meta.url));

export interface TaskFile {
  bytes: Uint8Array;
  contentType: string;
}

export interface WorkFolderInput {
  test: TaskFile;
  barem: TaskFile;
  // Grade mode: the test's exercise list and the student's pages, in upload order.
  exerciseList?: ExerciseList;
  pages?: TaskFile[];
}

// Runs pandoc with these arguments in this folder.
export type Pandoc = (args: string[], cwd: string) => Promise<void>;

export const realPandoc: Pandoc = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile('pandoc', args, { cwd, timeout: 120_000 }, (err) => (err ? reject(err) : resolve()));
  });

// The folder of one run: task folders and Claude's empty settings folder.
export function runFolder(env: Record<string, string | undefined>, runId: string): string {
  return path.join(env.RUNNER_TEMP || tmpdir(), 'qe', runId);
}

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
  await writeTeacherFile(folder, 'test', input.test, pandoc);
  await writeTeacherFile(folder, 'barem', input.barem, pandoc);
  if (input.exerciseList) {
    await writeFile(path.join(folder, 'exercises.json'), `${JSON.stringify(input.exerciseList, null, 2)}\n`);
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
// Markdown, with TeX math between $ and its pictures in <kind>/media/. Not
// GitHub's Markdown: it turns "a)" and "b)" into "1)" and "2)", and the
// exercise names are lost.
async function writeTeacherFile(folder: string, kind: TestFileKind, file: TaskFile, pandoc: Pandoc): Promise<void> {
  await mkdir(path.join(folder, kind));
  if (file.contentType === PDF_TYPE) {
    await writeFile(path.join(folder, kind, `${kind}.pdf`), file.bytes);
    return;
  }
  if (file.contentType !== DOCX_TYPE) throw new Error(`unknown ${kind} file type`);
  const source = `${kind}/source.docx`;
  await writeFile(path.join(folder, source), file.bytes);
  // Relative paths with "/", run in the work folder: the picture links then work from it.
  await pandoc([source, '-t', 'markdown', `--extract-media=${kind}`, '-o', `${kind}/${kind}.md`], folder);
  await rm(path.join(folder, source));
}

export async function removeFolder(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true });
}
