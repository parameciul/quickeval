import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STUDENT_FILE_TYPES, TEACHER_FILE_TYPES, typeFromFileName } from '../shared/files.ts';
import { formatPoints } from '../shared/scoring.ts';
import { type DetectedSubject, isDetectedSubject } from '../shared/subjects.ts';
import type { ExerciseList } from '../shared/schemas.ts';
import { checkExerciseList, checkGeneratedBarem, checkGrading, claudeJsonSchema, exerciseListAnswerSchema, generatedBaremAnswerSchema, gradingResultSchema } from '../shared/schemas.ts';
import type { ClaudeOutcome, ClaudeRunner } from './claude.ts';
import { makeBaremDocx } from './baremDocx.ts';
import { claudeRunner, claudeSettings } from './claude.ts';
import type { TaskFile, WorkFolderInput, WorkFolderOptions } from './workdir.ts';
import { makeWorkFolder, removeFolder, runFolder } from './workdir.ts';

// `npm run try:skill -- <mode> <folder>` (spec §13): tries the grading skill
// on this PC exactly as the robot runs it: the same work folder, the same
// Claude command, and an empty Claude settings folder, so no personal setting
// changes the result. The folder holds the teacher's files:
//
//   test.pdf or test.docx, barem.pdf or barem.docx
//   student/            (grade) the pages, in name order: 1.jpg, 2.jpg, …, 10.jpg
//   exercises.json      (grade) written by the exercise-list mode
//   subject.md          the subject (matematica, fizica, …): written by the exercise-list mode, read by
//                       the grade mode (none: math); put it there by hand to skip the detection
//   notes.md            (barem) the teacher's comments for the barem; the barem mode needs no barem file
//
// The exercise-list mode writes exercises.json; the grade mode writes
// grading.json; the barem mode writes barem.json and barem.docx. Messages are in Romanian: the teacher runs it.

const USAGE = 'Folosire: npm run try:skill -- exercise-list <dosar>  sau  npm run try:skill -- grade <dosar>  sau  npm run try:skill -- barem <dosar>';

export interface TryOptions {
  // Tests replace Claude and the skill folder.
  claude?: ClaudeRunner;
  workdir?: WorkFolderOptions;
  print?: (line: string) => void;
}

async function teacherFile(folder: string, kind: 'test' | 'barem'): Promise<TaskFile | null> {
  for (const extension of ['pdf', 'docx']) {
    const file = path.join(folder, `${kind}.${extension}`);
    const contentType = typeFromFileName(file);
    if (existsSync(file) && contentType && TEACHER_FILE_TYPES.includes(contentType)) return { bytes: await readFile(file), contentType };
  }
  return null;
}

async function studentPages(folder: string): Promise<TaskFile[]> {
  const dir = path.join(folder, 'student');
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((name) => STUDENT_FILE_TYPES.includes(typeFromFileName(name) ?? ''));
  names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return Promise.all(names.map(async (name) => ({ bytes: await readFile(path.join(dir, name)), contentType: typeFromFileName(name)! })));
}

// The list that the exercise-list mode wrote, checked again: the teacher may
// have changed it by hand.
function readExerciseList(text: string): ExerciseList | null {
  try {
    const checked = checkExerciseList(JSON.parse(text));
    return checked.ok ? checked.value.list : null;
  } catch {
    return null;
  }
}

// The subject in the folder's subject.md, or null without one.
async function readSubject(folder: string): Promise<DetectedSubject | null> {
  const file = path.join(folder, 'subject.md');
  if (!existsSync(file)) return null;
  const value = (await readFile(file, 'utf8')).trim();
  return isDetectedSubject(value) ? value : null;
}

async function readNotes(folder: string): Promise<string | undefined> {
  const file = path.join(folder, 'notes.md');
  return existsSync(file) ? readFile(file, 'utf8') : undefined;
}

function workFolderProblem(err: unknown): string {
  const { code, syscall } = (err ?? {}) as { code?: unknown; syscall?: unknown };
  if (code === 'ENOENT' && typeof syscall === 'string' && syscall.includes('pandoc')) {
    return 'Lipsește pandoc, care deschide fișierele Word. Instalează-l de pe https://pandoc.org/installing.html sau pune testul și baremul ca PDF.';
  }
  return 'Fișierele nu au putut fi pregătite pentru Claude. Verifică dacă fișierele Word se deschid în Word.';
}

function problemText(outcome: Exclude<ClaudeOutcome, { ok: true }>): string {
  switch (outcome.problem) {
    case 'not_logged_in':
      return 'Claude nu a acceptat tokenul. Fă unul nou cu „claude setup-token”.';
    case 'usage_limit':
      return 'Planul Claude a ajuns la limită. Încearcă mai târziu.';
    case 'timeout':
      return 'Claude nu a terminat la timp.';
    case 'invalid_output':
      return 'Claude a dat un răspuns care nu poate fi folosit.';
    default:
      return `Claude s-a oprit cu o eroare (${outcome.detail}).`;
  }
}

export async function trySkill(args: string[], env: Record<string, string | undefined>, options: TryOptions = {}): Promise<number> {
  const print = options.print ?? ((line: string) => console.log(line));
  const [mode, folderArg] = args;
  if ((mode !== 'exercise-list' && mode !== 'grade' && mode !== 'barem') || !folderArg) {
    print(USAGE);
    return 1;
  }
  const folder = path.resolve(folderArg);
  if (!options.claude && !env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {
    print('Lipsește CLAUDE_CODE_OAUTH_TOKEN. Fă tokenul cu „claude setup-token” și pune-l în această variabilă.');
    return 1;
  }
  const test = await teacherFile(folder, 'test');
  const barem = mode === 'barem' ? null : await teacherFile(folder, 'barem');
  if (mode === 'barem' ? !test : !test || !barem) {
    if (mode === 'barem') {
      print(`În ${folder} trebuie să fie test.pdf (sau test.docx).`);
      return 1;
    }
    print(`În ${folder} trebuie să fie test.pdf (sau test.docx) și barem.pdf (sau barem.docx).`);
    return 1;
  }
  let list: ExerciseList | undefined;
  let pages: TaskFile[] | undefined;
  if (mode === 'grade') {
    const listFile = path.join(folder, 'exercises.json');
    if (!existsSync(listFile)) {
      print('Lipsește exercises.json. Rulează întâi: npm run try:skill -- exercise-list <dosar>');
      return 1;
    }
    const saved = readExerciseList(await readFile(listFile, 'utf8'));
    if (!saved) {
      print('exercises.json nu este o listă de exerciții bună. Fă-o din nou: npm run try:skill -- exercise-list <dosar>');
      return 1;
    }
    list = saved;
    pages = await studentPages(folder);
    if (pages.length === 0) {
      print(`Pune paginile elevului în ${path.join(folder, 'student')} (JPG, PNG, WebP sau PDF).`);
      return 1;
    }
  }

  // A work folder and an empty Claude settings folder, outside the repo and the teacher's folder.
  const root = runFolder(env, `try-${randomBytes(4).toString('hex')}`);
  try {
    const configDir = path.join(root, 'claude-config');
    await mkdir(configDir, { recursive: true });
    const claude = options.claude ?? claudeRunner(claudeSettings(env, configDir));
    let cwd: string;
    try {
      const known = await readSubject(folder);
      const input: WorkFolderInput =
        mode === 'barem'
          ? { test: test!, requestNotes: await readNotes(folder), subject: known }
          : { test: test!, barem: barem!, exerciseList: list, pages, subject: mode === 'grade' ? (known ?? 'matematica') : known };
      cwd = await makeWorkFolder(root, mode, input, options.workdir);
    } catch (err) {
      print(workFolderProblem(err));
      return 1;
    }
    const jsonSchema = claudeJsonSchema(mode === 'grade' ? gradingResultSchema : mode === 'barem' ? generatedBaremAnswerSchema : exerciseListAnswerSchema);
    print(`Claude lucrează (${mode})…`);
    let outcome: ClaudeOutcome;
    try {
      outcome = await claude({ mode, cwd, jsonSchema });
    } catch {
      print('Lipsește programul claude (Claude Code). Instalează-l pe acest calculator, apoi încearcă din nou.');
      return 1;
    }
    if (!outcome.ok) {
      print(problemText(outcome));
      return 1;
    }
    if (mode === 'barem') {
      const checked = checkGeneratedBarem(outcome.output);
      if (!checked.ok) {
        print(`Baremul nu poate fi folosit (${checked.reason}).`);
        return 1;
      }
      let docx: Uint8Array;
      try {
        docx = await makeBaremDocx(checked.value, path.join(root, 'docx'), options.workdir?.pandoc);
      } catch (err) {
        const { code } = (err ?? {}) as { code?: unknown };
        print(code === 'ENOENT' ? workFolderProblem(err) : 'Baremul nu a putut fi transformat în fișier Word.');
        return 1;
      }
      await writeFile(path.join(folder, 'barem.json'), `${JSON.stringify(checked.value, null, 2)}
`);
      await writeFile(path.join(folder, 'barem.docx'), docx);
      print(`Total ${checked.value.total} de puncte, din oficiu ${checked.value.officePoints}.`);
      print(`Am scris ${path.join(folder, 'barem.json')} și ${path.join(folder, 'barem.docx')}.`);
      return 0;
    }
    if (mode === 'exercise-list') {
      const checked = checkExerciseList(outcome.output);
      if (!checked.ok) {
        print(`Lista de exerciții nu poate fi folosită (${checked.reason}).`);
        return 1;
      }
      await writeFile(path.join(folder, 'exercises.json'), `${JSON.stringify(checked.value.list, null, 2)}\n`);
      const { list: saved, message, subject } = checked.value;
      if (subject && !(await readSubject(folder))) {
        await writeFile(path.join(folder, 'subject.md'), `${subject.value}\n`);
        print(subject.value === 'alta' ? `Materia: alta (${subject.name}). Robotul nu o corectează.` : `Materia: ${subject.value}.`);
      }
      print(`${saved.exercises.length} exerciții, ${formatPoints(saved.totalPoints)} puncte, din oficiu ${formatPoints(saved.officePoints)}.`);
      print(message ?? 'Lista de exerciții este bună.');
      print(`Am scris ${path.join(folder, 'exercises.json')}.`);
      return 0;
    }
    const checked = checkGrading(outcome.output, list!, (await readSubject(folder)) ?? 'matematica');
    if (!checked.ok) {
      print(`Corectarea nu poate fi folosită (${checked.reason}).`);
      return 1;
    }
    await writeFile(path.join(folder, 'grading.json'), `${JSON.stringify(checked.value, null, 2)}\n`);
    const grading = checked.value;
    print(`Punctaj: ${formatPoints(grading.total)} din ${formatPoints(grading.maxTotal)}. Nota: ${formatPoints(grading.grade)}.`);
    for (const item of grading.items) {
      const flag = item.needsReview ? ` (de verificat: ${item.reviewReason})` : '';
      print(`${item.exerciseId}: ${formatPoints(item.points)} din ${formatPoints(item.maxPoints)}${flag}`);
    }
    if (grading.unreadable.length > 0) print(`Pagini care nu se pot citi: ${grading.unreadable.join(', ')}.`);
    print(`Am scris ${path.join(folder, 'grading.json')}.`);
    return 0;
  } finally {
    await removeFolder(root);
  }
}

if (import.meta.main) {
  process.exitCode = await trySkill(process.argv.slice(2), process.env);
}
