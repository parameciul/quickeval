import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClaimResult } from '../shared/runner.ts';
import type { ExerciseList, GradingResult } from '../shared/schemas.ts';
import { robotApi } from './api.ts';
import { gradeSubmission, makeExerciseList, type TaskContext } from './tasks.ts';
import { API_URL, evaluatingTest, fetchFrom, ROBOT_KEY, type RobotWorld } from './test/robotWorld.ts';
import { answer, problem, scriptedClaude } from './test/scriptedClaude.ts';

const RUN = 'run-tasks-0001';

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
    { exerciseId: 'II.1', points: 2, studentAnswer: 'x = 3', comment: 'Verifică semnul.', confidence: 'medium', needsReview: false, reviewReason: '' },
  ],
  unreadable: [],
  summary: 'Ai lucrat bine.',
  strengths: ['Fracții'],
  recommendations: ['Exersează ecuațiile.'],
};

const SKILL_FILES = ['.claude/skills/evaluate-test/SKILL.md', '.claude/skills/evaluate-test/references/grading-rules.md'];

let world: RobotWorld;
let root: string;
let skillDir: string;

beforeEach(async () => {
  world = await evaluatingTest({ uploads: 1, pages: 2 });
  root = mkdtempSync(path.join(tmpdir(), 'qe-tasks-'));
  skillDir = mkdtempSync(path.join(tmpdir(), 'qe-skill-'));
  mkdirSync(path.join(skillDir, 'references'));
  writeFileSync(path.join(skillDir, 'SKILL.md'), '# skill');
  writeFileSync(path.join(skillDir, 'references', 'grading-rules.md'), '# rules');
});

afterEach(async () => {
  await world.api.dispose();
  rmSync(root, { recursive: true, force: true });
  rmSync(skillDir, { recursive: true, force: true });
});

async function context(claude: ReturnType<typeof scriptedClaude>): Promise<TaskContext> {
  const api = robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(world.api), retryDelayMs: 0 });
  expect((await api.lease(RUN)).granted).toBe(true);
  return { api, claude: claude.run, runId: RUN, root, workdir: { skillDir } };
}

const listRow = () =>
  world.api.db.prepare('SELECT exercise_list_status AS status, exercise_list_attempts AS attempts FROM tests WHERE id = ?').bind(world.testId).first<{
    status: string;
    attempts: number;
  }>();
const uploadRow = () =>
  world.api.db.prepare('SELECT status, attempts, run_id FROM submissions WHERE id = ?').bind(world.submissionIds[0]).first<{
    status: string;
    attempts: number;
    run_id: string | null;
  }>();

describe('makeExerciseList', () => {
  it('saves the list that Claude made from the test and the barem, and removes the work folder', async () => {
    const claude = scriptedClaude(answer(LIST));
    expect(await makeExerciseList(await context(claude), world.testId)).toBe('saved');
    expect(await listRow()).toEqual({ status: 'ready', attempts: 0 });
    expect(claude.calls[0]!.task.mode).toBe('exercise-list');
    expect(claude.calls[0]!.task.jsonSchema).toMatchObject({ $schema: 'http://json-schema.org/draft-07/schema#' });
    expect(claude.calls[0]!.files).toEqual([...SKILL_FILES, 'barem/barem.pdf', 'test/test.pdf']);
    expect(readdirSync(root)).toEqual([]);
  });

  it('asks once more after an answer that the checks refuse, then counts an invalid output', async () => {
    const claude = scriptedClaude(answer({ ...LIST, exercises: [] }), answer({ nothing: true }));
    expect(await makeExerciseList(await context(claude), world.testId)).toBe('retry');
    expect(claude.calls).toHaveLength(2);
    expect(await listRow()).toEqual({ status: 'none', attempts: 1 });
  });

  it('keeps the second answer when the first could not be used', async () => {
    const claude = scriptedClaude(problem('invalid_output'), answer(LIST));
    expect(await makeExerciseList(await context(claude), world.testId)).toBe('saved');
    expect(await listRow()).toEqual({ status: 'ready', attempts: 0 });
  });

  it('counts a time limit as an attempt, without a second try', async () => {
    const claude = scriptedClaude(problem('timeout'));
    expect(await makeExerciseList(await context(claude), world.testId)).toBe('retry');
    expect(await listRow()).toEqual({ status: 'none', attempts: 1 });
  });

  it('says when the list failed for good, at the third attempt', async () => {
    await world.api.db.prepare('UPDATE tests SET exercise_list_attempts = 2 WHERE id = ?').bind(world.testId).run();
    const claude = scriptedClaude(problem('crash'));
    expect(await makeExerciseList(await context(claude), world.testId)).toBe('failed');
    expect(await listRow()).toEqual({ status: 'failed', attempts: 3 });
  });

  it('sends a usage limit, which counts no attempt', async () => {
    const claude = scriptedClaude(problem('usage_limit'));
    expect(await makeExerciseList(await context(claude), world.testId)).toBe('usage_limit');
    expect(await listRow()).toEqual({ status: 'none', attempts: 0 });
  });

  it('sends nothing when Claude refuses the token', async () => {
    const claude = scriptedClaude(problem('not_logged_in'));
    expect(await makeExerciseList(await context(claude), world.testId)).toBe('claude_login');
    expect(claude.calls).toHaveLength(1);
    expect(await listRow()).toEqual({ status: 'none', attempts: 0 });
  });

  it('throws away a list made from files that the teacher replaced meanwhile', async () => {
    const claude = scriptedClaude(async () => {
      await world.api.db.prepare('UPDATE tests SET files_version = files_version + 1 WHERE id = ?').bind(world.testId).run();
      return answer(LIST);
    });
    expect(await makeExerciseList(await context(claude), world.testId)).toBe('dropped');
    expect(await listRow()).toEqual({ status: 'none', attempts: 0 });
    expect(readdirSync(root)).toEqual([]);
  });

  it('stops when another run took the lease', async () => {
    const claude = scriptedClaude(async () => {
      await world.api.db.prepare("UPDATE runner_state SET run_id = 'run-tasks-other' WHERE id = 1").run();
      return answer(LIST);
    });
    expect(await makeExerciseList(await context(claude), world.testId)).toBe('lease_lost');
  });

  it('drops a test that left the evaluation before the robot read it', async () => {
    const claude = scriptedClaude();
    const ctx = await context(claude);
    await world.api.request('POST', `/api/admin/tests/${world.code}/reopen`);
    expect(await makeExerciseList(ctx, world.testId)).toBe('dropped');
    expect(claude.calls).toHaveLength(0);
  });
});

describe('gradeSubmission', () => {
  let claim: ClaimResult;

  async function claimed(claude: ReturnType<typeof scriptedClaude>): Promise<TaskContext> {
    await world.api.db
      .prepare("UPDATE tests SET exercise_list_status = 'ready', exercise_list_json = ? WHERE id = ?")
      .bind(JSON.stringify(LIST), world.testId)
      .run();
    const ctx = await context(claude);
    claim = (await ctx.api.claim(RUN))!;
    return ctx;
  }

  it('grades an upload: Claude sees the list and the pages in upload order', async () => {
    const id = world.submissionIds[0]!;
    let secondPage = '';
    const claude = scriptedClaude((task) => {
      secondPage = readFileSync(path.join(task.cwd, 'student', 'page-02.jpg'), 'utf8');
      expect(JSON.parse(readFileSync(path.join(task.cwd, 'exercises.json'), 'utf8'))).toEqual(LIST);
      return answer(GRADING);
    });
    const ctx = await claimed(claude);
    expect(await gradeSubmission(ctx, claim)).toBe('saved');
    expect(claude.calls[0]!.task.mode).toBe('grade');
    expect(claude.calls[0]!.files).toEqual([
      ...SKILL_FILES,
      'barem/barem.pdf',
      'exercises.json',
      'student/page-01.jpg',
      'student/page-02.jpg',
      'test/test.pdf',
    ]);
    expect(secondPage).toBe(`jpeg ${id}-2`);
    expect(await uploadRow()).toMatchObject({ status: 'graded', run_id: null });
    const saved = await world.api.db.prepare('SELECT total, grade, model FROM evaluations WHERE submission_id = ?').bind(id).first();
    expect(saved).toEqual({ total: 7.5, grade: 7.5, model: 'claude-test' });
    expect(readdirSync(root)).toEqual([]);
  });

  it('counts an invalid output after two answers that the checks refuse', async () => {
    const broken = { ...GRADING, items: GRADING.items.slice(0, 1) };
    const claude = scriptedClaude(answer(broken), answer(broken));
    expect(await gradeSubmission(await claimed(claude), claim)).toBe('retry');
    expect(await uploadRow()).toMatchObject({ status: 'submitted', attempts: 1 });
  });

  it('says when the upload failed for good, at the third attempt', async () => {
    await world.api.db.prepare('UPDATE submissions SET attempts = 2 WHERE id = ?').bind(world.submissionIds[0]).run();
    const claude = scriptedClaude(problem('timeout'));
    expect(await gradeSubmission(await claimed(claude), claim)).toBe('failed');
    expect(await uploadRow()).toMatchObject({ status: 'failed', attempts: 3 });
  });

  it('sends an answer that the API refuses again as an invalid output, so the attempt counts', async () => {
    const claude = scriptedClaude(async () => {
      const other = { ...LIST, exercises: [{ ...LIST.exercises[0]!, id: 'III.1' }, LIST.exercises[1]!] };
      await world.api.db.prepare('UPDATE tests SET exercise_list_json = ? WHERE id = ?').bind(JSON.stringify(other), world.testId).run();
      return answer(GRADING);
    });
    expect(await gradeSubmission(await claimed(claude), claim)).toBe('retry');
    expect(await uploadRow()).toMatchObject({ status: 'submitted', attempts: 1 });
  });

  it('throws away a grading whose test the teacher reopened meanwhile', async () => {
    const claude = scriptedClaude(async () => {
      await world.api.request('POST', `/api/admin/tests/${world.code}/reopen`);
      return answer(GRADING);
    });
    expect(await gradeSubmission(await claimed(claude), claim)).toBe('dropped');
    expect(await uploadRow()).toMatchObject({ status: 'submitted', attempts: 0, run_id: RUN });
  });

  it('sends nothing when Claude refuses the token: the upload waits in grading for the run to end', async () => {
    const claude = scriptedClaude(problem('not_logged_in'));
    expect(await gradeSubmission(await claimed(claude), claim)).toBe('claude_login');
    expect(await uploadRow()).toMatchObject({ status: 'grading', attempts: 0, run_id: RUN });
  });

  it('lets a refused robot key stop the run, and still removes the work folder', async () => {
    const claude = scriptedClaude(async () => {
      await world.api.db.prepare("UPDATE settings SET value = 'another-hash' WHERE key = 'runner_key_hash'").run();
      return answer(GRADING);
    });
    await expect(gradeSubmission(await claimed(claude), claim)).rejects.toMatchObject({ status: 401, code: 'robot_denied' });
    expect(readdirSync(root)).toEqual([]);
  });
});
