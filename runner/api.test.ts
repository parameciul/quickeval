import { afterEach, describe, expect, it } from 'vitest';
import type { ExerciseList, GradingResult } from '../shared/schemas.ts';
import { RobotApiError, robotApi, robotApiFromEnv } from './api.ts';
import { API_URL, evaluatingTest, fetchFrom, ROBOT_KEY, type RobotWorld } from './test/robotWorld.ts';

const RUN = 'run-api-0001';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 9, answer: '3/4', scoringNotes: '', topic: 'Fracții' }],
  notes: '',
};

const GRADING: GradingResult = {
  items: [{ exerciseId: 'I.1', points: 7.5, studentAnswer: '3/4', comment: 'Bine.', confidence: 'high', needsReview: false, reviewReason: '' }],
  unreadable: [],
  summary: 'Ai lucrat bine.',
  strengths: ['Fracții'],
  recommendations: ['Exersează.'],
};

let world: RobotWorld | undefined;

afterEach(async () => {
  await world?.api.dispose();
  world = undefined;
});

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('robotApi with the real API', () => {
  it('goes through a whole grading', async () => {
    world = await evaluatingTest({ uploads: 1, pages: 2 });
    const { testId } = world;
    const [submissionId] = world.submissionIds;
    const robot = robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(world.api) });

    expect(await robot.check()).toEqual({ hasWork: true, exerciseLists: 1, pendingGrading: 0, analyses: 0 });
    expect(await robot.lease(RUN)).toEqual({ granted: true, maxParallel: 1 });
    await robot.heartbeat(RUN);
    expect(await robot.tasks()).toEqual({ exerciseLists: [testId], pendingGrading: 0, analyses: [] });
    expect(await robot.test(testId)).toEqual({
      id: testId,
      filesVersion: 0,
      files: { test: { contentType: 'application/pdf' }, barem: { contentType: 'application/pdf' } },
      exerciseList: null,
    });
    expect(text(await robot.testFile(testId, 'barem'))).toBe('%PDF-1.7 barem');
    expect(await robot.sendExerciseList(testId, { runId: RUN, filesVersion: 0, ok: true, exerciseList: LIST })).toEqual({ status: 'ready', message: null });

    const claimed = await robot.claim(RUN);
    expect(claimed).toMatchObject({ submissionId, testId });
    expect(claimed!.files.map((file) => [file.contentType, file.position])).toEqual([
      ['image/jpeg', 1],
      ['image/jpeg', 2],
    ]);
    expect(text(await robot.page(submissionId!, claimed!.files[1]!.id))).toBe(`jpeg ${submissionId}-2`);
    expect(await robot.sendResult(submissionId!, { runId: RUN, ok: true, result: GRADING, model: 'claude-test' })).toBe('graded');
    expect(await robot.claim(RUN)).toBeNull();
    await robot.release(RUN, { exerciseLists: 1, graded: 1, failed: 0, analyses: 0, stop: 'done' });
    expect((await robot.lease('run-api-0002')).granted).toBe(true);
  });

  it('turns refusals into errors with the API codes', async () => {
    world = await evaluatingTest();
    const robot = robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(world.api) });
    await robot.lease(RUN);
    await expect(robot.heartbeat('run-api-other')).rejects.toMatchObject({ status: 409, code: 'lease_lost' });
    await expect(robot.test(99999)).rejects.toMatchObject({ status: 404, code: 'not_found' });
    const stranger = robotApi(API_URL, 'not-the-robot-key', { fetch: fetchFrom(world.api) });
    await expect(stranger.check()).rejects.toMatchObject({ status: 401, code: 'robot_denied' });
    await expect(stranger.check()).rejects.toBeInstanceOf(RobotApiError);
  });
});

describe('robotApi requests', () => {
  function fakeFetch(...answers: (Response | Error)[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const answer = answers.shift() ?? new Error('no more answers');
      if (answer instanceof Error) throw answer;
      return answer;
    };
    return { calls, fetch };
  }
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const COUNTS = { hasWork: false, exerciseLists: 0, pendingGrading: 0, analyses: 0 };

  it('sends the key, JSON bodies, and a time limit', async () => {
    const { calls, fetch } = fakeFetch(json(200, { granted: true, maxParallel: 2 }));
    await robotApi('https://site.test/', 'k3y', { fetch }).lease(RUN);
    expect(calls[0]!.url).toBe('https://site.test/api/runner/lease');
    expect(calls[0]!.init).toMatchObject({ method: 'POST', body: JSON.stringify({ runId: RUN }) });
    expect(calls[0]!.init.headers).toEqual({ Authorization: 'Bearer k3y', 'Content-Type': 'application/json' });
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('tries again after a network error or a server error', async () => {
    const { calls, fetch } = fakeFetch(new TypeError('fetch failed'), json(503, {}), json(200, COUNTS));
    expect(await robotApi('https://site.test', 'k', { fetch, retryDelayMs: 0 }).check()).toEqual(COUNTS);
    expect(calls).toHaveLength(3);
  });

  it('gives up after three tries', async () => {
    const down = fakeFetch(new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed'));
    await expect(robotApi('https://site.test', 'k', { fetch: down.fetch, retryDelayMs: 0 }).check()).rejects.toMatchObject({ status: 0, code: 'network' });
    expect(down.calls).toHaveLength(3);
    const failing = fakeFetch(json(500, {}), json(502, {}), new Response('Bad gateway', { status: 502 }));
    await expect(robotApi('https://site.test', 'k', { fetch: failing.fetch, retryDelayMs: 0 }).check()).rejects.toMatchObject({ status: 502, code: 'http_502' });
  });

  it('does not try a refused request again', async () => {
    const { calls, fetch } = fakeFetch(json(409, { error: 'taken_over', message: '…' }));
    const sent = robotApi('https://site.test', 'k', { fetch, retryDelayMs: 0 }).sendResult(5, { runId: RUN, ok: false, error: 'crash' });
    await expect(sent).rejects.toMatchObject({ status: 409, code: 'taken_over' });
    expect(calls).toHaveLength(1);
  });
});

describe('robotApiFromEnv', () => {
  it('needs both the site address and the robot key', () => {
    expect(robotApiFromEnv({})).toBeNull();
    expect(robotApiFromEnv({ QUICKEVAL_URL: 'https://site.test', QUICKEVAL_RUNNER_KEY: ' ' })).toBeNull();
    expect(robotApiFromEnv({ QUICKEVAL_URL: '', QUICKEVAL_RUNNER_KEY: 'k' })).toBeNull();
    expect(robotApiFromEnv({ QUICKEVAL_URL: 'https://site.test', QUICKEVAL_RUNNER_KEY: 'k' })).not.toBeNull();
  });
});
