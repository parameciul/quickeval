import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseList, GradingResult } from '../shared/schemas.ts';
import { trySkill } from './trySkill.ts';
import { answer, problem, scriptedClaude } from './test/scriptedClaude.ts';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: '', topic: 'Fracții' },
    { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

const GRADING: GradingResult = {
  items: [
    { exerciseId: 'I.1', points: 4.5, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '' },
    { exerciseId: 'II.1', points: 2, studentAnswer: 'x = 3', comment: 'Verifică semnul.', confidence: 'low', needsReview: true, reviewReason: 'Scris neclar.' },
  ],
  unreadable: [],
  summary: 'Ai lucrat bine.',
  strengths: ['Fracții'],
  recommendations: ['Exersează ecuațiile.'],
};

let folder: string;
let temp: string;
let skillDir: string;
let lines: string[];

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'qe-try-'));
  temp = mkdtempSync(path.join(tmpdir(), 'qe-try-temp-'));
  skillDir = mkdtempSync(path.join(tmpdir(), 'qe-try-skill-'));
  writeFileSync(path.join(skillDir, 'SKILL.md'), '# skill');
  writeFileSync(path.join(folder, 'test.pdf'), '%PDF-1.7 test');
  writeFileSync(path.join(folder, 'barem.pdf'), '%PDF-1.7 barem');
  lines = [];
});

afterEach(() => {
  for (const dir of [folder, temp, skillDir]) rmSync(dir, { recursive: true, force: true });
});

const env = { RUNNER_TEMP: '' };
function run(mode: string, claude: ReturnType<typeof scriptedClaude>) {
  return trySkill([mode, folder], { RUNNER_TEMP: temp }, { claude: claude.run, workdir: { skillDir }, print: (line) => lines.push(line) });
}

describe('try:skill exercise-list', () => {
  it('makes the list like the robot, writes exercises.json, and removes its work folder', async () => {
    const claude = scriptedClaude(answer(LIST));
    expect(await run('exercise-list', claude)).toBe(0);
    expect(claude.calls[0]!.task.mode).toBe('exercise-list');
    expect(claude.calls[0]!.task.cwd.startsWith(path.join(temp, 'qe', 'try-'))).toBe(true);
    expect(claude.calls[0]!.files).toEqual(['.claude/skills/evaluate-test/SKILL.md', 'barem/barem.pdf', 'test/test.pdf']);
    expect(JSON.parse(readFileSync(path.join(folder, 'exercises.json'), 'utf8'))).toEqual(LIST);
    expect(lines).toContain('2 exerciții, 10 puncte, din oficiu 1.');
    expect(lines).toContain('Lista de exerciții este bună.');
    expect(readdirSync(path.join(temp, 'qe'))).toEqual([]);
  });

  it('says when the points do not add up', async () => {
    const claude = scriptedClaude(answer({ ...LIST, totalPoints: 12 }));
    expect(await run('exercise-list', claude)).toBe(0);
    expect(lines).toContain('Punctajele din barem dau 10, dar totalul este 12.');
  });

  it('says what went wrong when Claude gives nothing to use', async () => {
    expect(await run('exercise-list', scriptedClaude(problem('not_logged_in')))).toBe(1);
    expect(lines.at(-1)).toBe('Claude nu a acceptat tokenul. Fă unul nou cu „claude setup-token”.');
    expect(await run('exercise-list', scriptedClaude(answer({ exercises: [] })))).toBe(1);
    expect(lines.at(-1)).toBe('Lista de exerciții nu poate fi folosită (not an exercise list).');
    expect(existsSync(path.join(folder, 'exercises.json'))).toBe(false);
  });
});

describe('try:skill grade', () => {
  beforeEach(() => {
    writeFileSync(path.join(folder, 'exercises.json'), JSON.stringify(LIST));
    mkdirSync(path.join(folder, 'student'));
    writeFileSync(path.join(folder, 'student', '10.jpg'), 'page ten');
    writeFileSync(path.join(folder, 'student', '2.png'), 'page two');
    writeFileSync(path.join(folder, 'student', '1.jpg'), 'page one');
    writeFileSync(path.join(folder, 'student', 'notes.txt'), 'not a page');
  });

  it('grades the pages in number order and writes grading.json', async () => {
    let third = '';
    const claude = scriptedClaude((task) => {
      third = readFileSync(path.join(task.cwd, 'student', 'page-03.jpg'), 'utf8');
      return answer(GRADING);
    });
    expect(await run('grade', claude)).toBe(0);
    expect(claude.calls[0]!.files.filter((file) => file.startsWith('student/'))).toEqual(['student/page-01.jpg', 'student/page-02.png', 'student/page-03.jpg']);
    expect(third).toBe('page ten');
    expect(JSON.parse(readFileSync(path.join(folder, 'grading.json'), 'utf8'))).toMatchObject({ total: 7.5, grade: 7.5 });
    expect(lines).toContain('Punctaj: 7,5 din 10. Nota: 7,5.');
    expect(lines).toContain('II.1: 2 din 4,5 (de verificat: Scris neclar.)');
  });

  it('needs the exercise list first', async () => {
    rmSync(path.join(folder, 'exercises.json'));
    expect(await run('grade', scriptedClaude())).toBe(1);
    expect(lines).toEqual(['Lipsește exercises.json. Rulează întâi: npm run try:skill -- exercise-list <dosar>']);
  });

  it('refuses an exercises.json that is not an exercise list', async () => {
    writeFileSync(path.join(folder, 'exercises.json'), '{"exercises": "none"}');
    const claude = scriptedClaude();
    expect(await run('grade', claude)).toBe(1);
    expect(claude.calls).toHaveLength(0);
    expect(lines).toEqual(['exercises.json nu este o listă de exerciții bună. Fă-o din nou: npm run try:skill -- exercise-list <dosar>']);
  });

  it('needs the pages', async () => {
    rmSync(path.join(folder, 'student'), { recursive: true });
    expect(await run('grade', scriptedClaude())).toBe(1);
    expect(lines[0]).toMatch(/^Pune paginile elevului în /);
  });
});

describe('try:skill checks', () => {
  it('shows how to use it', async () => {
    expect(await trySkill(['analyse', folder], env, { print: (line) => lines.push(line) })).toBe(1);
    expect(await trySkill(['grade'], env, { print: (line) => lines.push(line) })).toBe(1);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Folosire: npm run try:skill -- exercise-list <dosar>/);
  });

  it('needs the Claude token: it never uses the login of this PC', async () => {
    expect(await trySkill(['exercise-list', folder], env, { print: (line) => lines.push(line) })).toBe(1);
    expect(lines).toEqual(['Lipsește CLAUDE_CODE_OAUTH_TOKEN. Fă tokenul cu „claude setup-token” și pune-l în această variabilă.']);
  });

  it('says when pandoc is missing for a Word file, and removes its work folder', async () => {
    rmSync(path.join(folder, 'test.pdf'));
    writeFileSync(path.join(folder, 'test.docx'), 'PK word');
    const missing = Object.assign(new Error('spawn pandoc ENOENT'), { code: 'ENOENT', syscall: 'spawn pandoc' });
    const claude = scriptedClaude();
    const pandoc = async () => Promise.reject(missing);
    expect(await trySkill(['exercise-list', folder], { RUNNER_TEMP: temp }, { claude: claude.run, workdir: { skillDir, pandoc }, print: (line) => lines.push(line) })).toBe(1);
    expect(claude.calls).toHaveLength(0);
    expect(lines.at(-1)).toBe('Lipsește pandoc, care deschide fișierele Word. Instalează-l de pe https://pandoc.org/installing.html sau pune testul și baremul ca PDF.');
    expect(readdirSync(path.join(temp, 'qe'))).toEqual([]);
  });

  it('needs the test and the barem', async () => {
    rmSync(path.join(folder, 'barem.pdf'));
    expect(await run('exercise-list', scriptedClaude())).toBe(1);
    expect(lines[0]).toMatch(/trebuie să fie test\.pdf \(sau test\.docx\) și barem\.pdf \(sau barem\.docx\)\.$/);
  });
});
