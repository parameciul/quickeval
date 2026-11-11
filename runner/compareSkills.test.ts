import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseList, GeneratedBarem, GradingResult } from '../shared/schemas.ts';
import type { ClaudeOutcome, ClaudeTask } from './claude.ts';
import { compareSkills, insideRepo, type Live, OLD_BAREM_NOTES, oldSkill as skillOfRef, REPO_DIR } from './compareSkills.ts';
import { answer } from './test/scriptedClaude.ts';
import { DEFAULT_BAREM_NOTES } from './workdir.ts';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: '', topic: 'Fracții' },
    { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

const BAREM: GeneratedBarem = {
  title: 'Test de evaluare – Fracții',
  subtitle: 'Matematică – clasa a VI-a',
  notes: [],
  total: 100,
  officePoints: 10,
  parts: [{ title: '', sections: [{ title: 'SUBIECTUL I', points: 90, items: [{ label: '1.', steps: [{ text: 'Calcul', points: 90 }] }] }] }],
};

const GRADING: GradingResult = {
  items: [
    { exerciseId: 'I.1', points: 4.5, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '', page: 1, areas: [] },
    { exerciseId: 'II.1', points: 2, studentAnswer: 'x = 3', comment: 'Verifică semnul.', confidence: 'high', needsReview: false, reviewReason: '', page: 1, areas: [] },
  ],
  unreadable: [],
  summary: 'Ai lucrat bine.',
  strengths: [],
  recommendations: [],
};

// What the live site holds: one math test with two graded papers.
function fakeLive(): Live & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    query: async <T,>(sql: string) => {
      queries.push(sql);
      let rows: unknown[] = [];
      if (sql.includes('ORDER BY corrected DESC')) rows = [{ code: '6E2-26T1', title: 'Fracții', graded: 2, corrected: 3 }];
      else if (sql.includes("WHERE code = '6E2-26T1'")) {
        rows = [
          {
            id: 7,
            test_file_key: 't/1/2026/6E2-26T1/test.pdf',
            test_file_type: 'application/pdf',
            barem_file_key: 't/1/2026/6E2-26T1/barem.pdf',
            barem_file_type: 'application/pdf',
            barem_notes: 'Acceptă și metoda grafică.',
            exercise_list_json: JSON.stringify(LIST),
          },
        ];
      } else if (sql.includes('FROM submissions WHERE test_id = 7')) rows = [{ id: 11 }, { id: 12 }];
      else if (sql.includes('FROM submission_files')) {
        rows = [
          { submission_id: 11, r2_key: 's/11/a.jpg', content_type: 'image/jpeg' },
          { submission_id: 11, r2_key: 's/11/b.jpg', content_type: 'image/jpeg' },
          { submission_id: 12, r2_key: 's/12/a.jpg', content_type: 'image/jpeg' },
        ];
      } else if (sql.includes('FROM evaluations ev JOIN evaluation_items')) {
        rows = [
          { submission_id: 11, exercise_id: 'I.1', points: 4.5 },
          { submission_id: 11, exercise_id: 'II.1', points: 2 },
          { submission_id: 12, exercise_id: 'I.1', points: 4.5 },
          { submission_id: 12, exercise_id: 'II.1', points: 2 },
        ];
      }
      return rows as T[];
    },
    download: async (key, file) => {
      writeFileSync(file, `bytes of ${key}`);
    },
  };
}

interface Call {
  side: string;
  mode: string;
  notes: string | null;
  subject: string | null;
  required: string[];
  files: string[];
}

// A Claude that answers by mode, and notes which skill and which files each run saw.
function fakeClaude(subject = 'matematica') {
  const calls: Call[] = [];
  const read = (cwd: string, file: string) => (existsSync(path.join(cwd, file)) ? readFileSync(path.join(cwd, file), 'utf8') : null);
  const run = async (task: ClaudeTask): Promise<ClaudeOutcome> => {
    calls.push({
      side: read(task.cwd, '.claude/skills/evaluate-test/SKILL.md')!.trim(),
      mode: task.mode,
      notes: read(task.cwd, 'barem/notes.md'),
      subject: read(task.cwd, 'subject.md'),
      required: (task.jsonSchema as { required: string[] }).required,
      files: readdirSync(task.cwd, { recursive: true }).map(String),
    });
    if (task.mode === 'grade') return answer(GRADING);
    const found = { subject, subjectName: '' };
    return answer(task.mode === 'barem' ? { ...BAREM, ...found } : { ...LIST, ...found });
  };
  return { run, calls };
}

let folder: string;
let temp: string;
let oldSkill: string;
let newSkill: string;
let lines: string[];

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'qe-compare-'));
  temp = mkdtempSync(path.join(tmpdir(), 'qe-compare-temp-'));
  oldSkill = mkdtempSync(path.join(tmpdir(), 'qe-old-skill-'));
  newSkill = mkdtempSync(path.join(tmpdir(), 'qe-new-skill-'));
  writeFileSync(path.join(oldSkill, 'SKILL.md'), 'old');
  writeFileSync(path.join(newSkill, 'SKILL.md'), 'new');
  lines = [];
});

afterEach(() => {
  for (const dir of [folder, temp, oldSkill, newSkill]) rmSync(dir, { recursive: true, force: true });
});

const compare = (args: string[], claude = fakeClaude(), live = fakeLive()) =>
  compareSkills(args, { RUNNER_TEMP: temp }, { claude: claude.run, live, oldSkillDir: oldSkill, workdir: { skillDir: newSkill }, print: (line) => lines.push(line) });

describe('compare:skills', () => {
  it('lists the tests that can be compared, with no student in them', async () => {
    expect(await compare(['list'])).toBe(0);
    expect(lines).toEqual(['6E2-26T1 · Fracții · 2 lucrări corectate · 3 punctaje schimbate de profesor']);
  });

  it('grades the same test with both skills, the way the robot does, and writes a report that passes', async () => {
    const claude = fakeClaude();
    expect(await compare(['run', folder, '6e2-26t1', '--papers', '2'], claude)).toBe(0);
    // A list, a barem and two papers on each side.
    expect(claude.calls.filter((call) => call.side === 'old')).toHaveLength(4);
    expect(claude.calls.filter((call) => call.side === 'new')).toHaveLength(4);
    const list = (side: string) => claude.calls.find((call) => call.side === side && call.mode === 'exercise-list')!;
    expect(list('old').notes).toBe(`${OLD_BAREM_NOTES}\nAcceptă și metoda grafică.\n`);
    expect(list('new').notes).toBe(`${DEFAULT_BAREM_NOTES}\nAcceptă și metoda grafică.\n`);
    expect(list('old').required).not.toContain('subject');
    expect(list('new').required).toContain('subject');
    const grades = claude.calls.filter((call) => call.mode === 'grade');
    expect(grades.filter((call) => call.side === 'old').map((call) => call.subject)).toEqual([null, null]);
    expect(grades.filter((call) => call.side === 'new').map((call) => call.subject)).toEqual(['matematica\n', 'matematica\n']);
    expect(grades.map((call) => call.files.filter((file) => file.startsWith('student')).length).sort()).toEqual([2, 2, 3, 3]);
    const report = readFileSync(path.join(folder, 'report.md'), 'utf8');
    expect(report).toContain('Rezultat: **trece** pe toate testele.');
    expect(report).toContain('| Lucrarea 2 | 7,5 | 7,5 | 7,5 |');
    expect(existsSync(path.join(folder, '6E2-26T1', 'papers', '1', 'page-02.jpg'))).toBe(true);
    expect(existsSync(path.join(folder, '6E2-26T1', 'new', 'grading-2.json'))).toBe(true);
    expect(lines.at(-1)).toContain('Șterge dosarul după ce citești raportul');
    expect(readdirSync(path.join(temp, 'qe'))).toEqual([]);
  });

  it('fails when the new skill does not find math', async () => {
    expect(await compare(['run', folder, '6E2-26T1'], fakeClaude('fizica'))).toBe(2);
    expect(readFileSync(path.join(folder, 'report.md'), 'utf8')).toContain('Materia găsită cu lista de exerciții nu este matematica (fizica).');
  });

  it('reads only: every query is a SELECT', async () => {
    const live = fakeLive();
    await compare(['run', folder, '6E2-26T1'], fakeClaude(), live);
    expect(live.queries.length).toBeGreaterThan(0);
    for (const sql of live.queries) expect(sql.trim()).toMatch(/^SELECT /);
  });

  it('refuses a folder inside the repo: the papers of the students must not land there', async () => {
    expect(insideRepo(path.join(REPO_DIR, 'compare'))).toBe(true);
    expect(insideRepo(REPO_DIR)).toBe(true);
    expect(insideRepo(folder)).toBe(false);
    expect(await compare(['run', path.join(REPO_DIR, 'compare'), '6E2-26T1'])).toBe(1);
    expect(lines.at(-1)).toBe('Alege un dosar în afara proiectului: în el ajung lucrările elevilor.');
  });

  it('shows how to use it, and needs the Claude token', async () => {
    expect(await compare(['run', folder])).toBe(1);
    expect(lines.at(-1)).toMatch(/^Folosire:/);
    expect(await compare(['run', folder, 'not-a-code'])).toBe(1);
    const noClaude = await compareSkills(['run', folder, '6E2-26T1'], {}, { live: fakeLive(), print: (line) => lines.push(line) });
    expect(noClaude).toBe(1);
    expect(lines.at(-1)).toMatch(/CLAUDE_CODE_OAUTH_TOKEN/);
  });
});

describe('the old side', () => {
  it('has the barem note from before the change, and the rest of the notes as now', () => {
    expect(OLD_BAREM_NOTES.split('\n')[0]).toBe(
      'Nu puncta rezolvările care nu se bazează pe ipoteza problemei sau care nu au legătură cu cerințele problemei.',
    );
    expect(OLD_BAREM_NOTES.split('\n').slice(1)).toEqual(DEFAULT_BAREM_NOTES.split('\n').slice(1));
  });

  it('takes the skill of a git ref', async () => {
    const dir = await skillOfRef('HEAD', path.join(temp, 'old-skill'));
    expect(readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toMatch(/^---\nname: evaluate-test\n/);
    expect(existsSync(path.join(dir, 'references', 'grading-rules.md'))).toBe(true);
  });
});
