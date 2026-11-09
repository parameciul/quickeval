import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExerciseList, GradingResult } from '../shared/schemas.ts';
import { PDF_TYPE } from '../shared/files.ts';
import { setRobotKey } from '../server/test/fixtures.ts';
import { startTestApi, type TestApi } from '../server/test/testApi.ts';
import { robotApi } from './api.ts';
import { runRobot } from './run.ts';
import { API_URL, fetchFrom, ROBOT_KEY } from './test/robotWorld.ts';
import { answer, scriptedClaude } from './test/scriptedClaude.ts';

// A Quick Try paper goes through the robot as a class paper does: exercise
// list, then grading. The robot makes no print PDF and no class analysis for it.

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 9, answer: '3/4', scoringNotes: '', topic: 'Fracții' }],
  notes: '',
};

const GRADING: GradingResult = {
  items: [{ exerciseId: 'I.1', points: 8, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '', page: 1 }],
  unreadable: [],
  summary: 'Ai lucrat bine.',
  strengths: ['Fracții'],
  recommendations: ['Exersează.'],
};

let api: TestApi | undefined;
const folders: string[] = [];

afterEach(async () => {
  await api?.dispose();
  api = undefined;
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function folder(prefix: string): string {
  const made = mkdtempSync(path.join(tmpdir(), prefix));
  folders.push(made);
  return made;
}

function skill(): string {
  const dir = folder('qe-skill-');
  mkdirSync(path.join(dir, 'references'));
  writeFileSync(path.join(dir, 'SKILL.md'), '# skill');
  writeFileSync(path.join(dir, 'references', 'grading-rules.md'), '# rules');
  return dir;
}

describe('a Quick Try paper', () => {
  it('gets its exercise list and its grading, and no print or analysis', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { dispatchRobot: async () => true, verifyTurnstile: async () => true } });
    await setRobotKey(api);
    const made = await api.request('POST', '/api/try', { turnstileToken: 'ok' });
    const { token, code } = made.body as { token: string; code: string };
    const put = (url: string, body: BodyInit, type: string) =>
      api!.fetch(url, { method: 'PUT', body, headers: { 'Content-Type': type, 'X-File-Name': 'f' } });
    expect((await put(`/api/try/${token}/tests/${code}/files/test`, '%PDF-1.7 test', PDF_TYPE)).status).toBe(200);
    expect((await put(`/api/try/${token}/tests/${code}/files/barem`, '%PDF-1.7 barem', PDF_TYPE)).status).toBe(200);
    expect((await put(`/api/try/${token}/paper`, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x70]), 'image/jpeg')).status).toBe(201);
    expect((await api.request('POST', `/api/try/${token}/start`, {})).body.status).toBe('evaluating');

    const claude = scriptedClaude(answer(LIST), answer(GRADING));
    const robot = robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(api), retryDelayMs: 0 });
    const report = await runRobot({ api: robot, claude: claude.run, runId: 'run-quick-try-1', root: folder('qe-run-'), workdir: { skillDir: skill() }, heartbeatMs: 60_000 });
    expect(report.summary).toMatchObject({ exerciseLists: 1, graded: 1, failed: 0, analyses: 0, prints: 0, stop: 'done' });
    expect(claude.calls.map((call) => call.task.mode)).toEqual(['exercise-list', 'grade']);
    const test = await api.db.prepare('SELECT status, analysis_status, print_status FROM tests WHERE quick_try = 1').first();
    expect(test).toEqual({ status: 'done', analysis_status: 'none', print_status: 'none' });
    const paper = await api.request('GET', `/api/try/${token}/submissions/${(await api.request('GET', `/api/try/${token}`)).body.submissionId}`);
    expect(paper.body.submission.evaluation.total).toBe(9);
  });
});
