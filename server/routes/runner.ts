import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ExerciseListInfo } from '../../shared/api.ts';
import { isTestFileKind } from '../../shared/files.ts';
import { exerciseListBody, releaseBody, runBody } from '../../shared/runner.ts';
import { checkExerciseList } from '../../shared/schemas.ts';
import { robotAuth } from '../auth/robotAuth.ts';
import {
  failExerciseList,
  findRobotTest,
  heartbeat,
  holdsLease,
  listTasks,
  releaseLease,
  runCheck,
  saveExerciseList,
  takeLease,
} from '../db/runner.ts';
import { getMaxParallel } from '../db/settings.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';
import { fileResponse } from '../uploads.ts';

const leaseLost = () => new ApiError(409, 'lease_lost', 'Altă rulare a robotului lucrează acum.');
// A broken output: the robot counts it as invalid_output.
const invalidResult = () => new ApiError(422, 'invalid_result', 'Rezultatul robotului nu poate fi folosit.');

// Why a robot write changed nothing: the test is gone (404, the robot drops
// the result), another run holds the lease, or the work is no longer needed.
async function refusedWrite(c: Context<AppEnv>, runId: string, exists: boolean, notNeeded: () => ApiError): Promise<ApiError> {
  if (!exists) return notFound();
  if (!(await holdsLease(c.env.DB, runId))) return leaseLost();
  return notNeeded();
}

// /api/runner: the evaluation robot (spec §11.3). Every route needs the robot
// key. Answers carry ids and counts, never student names.
export function runnerRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', robotAuth());

  // The 10-minute check: is there work for a run?
  routes.post('/check', async (c) => c.json(await runCheck(c.env.DB, nowIso())));

  // Only one run works at a time (spec §12.2).
  routes.post('/lease', async (c) => {
    const { runId } = await readJson(c, runBody);
    const granted = await takeLease(c.env.DB, runId, nowIso());
    return c.json({ granted, maxParallel: await getMaxParallel(c.env.DB) });
  });

  routes.post('/heartbeat', async (c) => {
    const { runId } = await readJson(c, runBody);
    if (!(await heartbeat(c.env.DB, runId, nowIso()))) throw leaseLost();
    return c.json({ ok: true });
  });

  routes.post('/release', async (c) => {
    const { runId, summary } = await readJson(c, releaseBody);
    if (!(await releaseLease(c.env.DB, runId, summary, nowIso()))) throw leaseLost();
    return c.json({ released: true });
  });

  routes.get('/tasks', async (c) => c.json(await listTasks(c.env.DB)));

  routes.get('/tests/:id', async (c) => {
    const found = await findRobotTest(c.env.DB, parseId(c.req.param('id')));
    if (!found) throw notFound();
    return c.json({ test: found.test });
  });

  routes.get('/tests/:id/files/:kind', async (c) => {
    const kind = c.req.param('kind');
    const found = await findRobotTest(c.env.DB, parseId(c.req.param('id')));
    if (!found || !isTestFileKind(kind)) throw notFound();
    const key = found.keys[kind];
    const type = found.test.files[kind]?.contentType;
    const object = key ? await c.env.FILES.get(key) : null;
    if (!object || !type) throw notFound();
    return fileResponse(object, kind, type);
  });

  // The exercise list of a test, or why the robot could not make it.
  routes.post('/tests/:id/exercise-list', async (c) => {
    const testId = parseId(c.req.param('id'));
    const body = await readJson(c, exerciseListBody);
    const now = nowIso();
    let saved: ExerciseListInfo | null;
    if (body.ok) {
      const checked = checkExerciseList(body.exerciseList);
      if (!checked.ok) throw invalidResult();
      saved = await saveExerciseList(c.env.DB, testId, body.runId, checked.value, now);
    } else {
      saved = await failExerciseList(c.env.DB, testId, body.runId, body.error, now);
    }
    if (!saved) {
      const exists = (await findRobotTest(c.env.DB, testId)) !== null;
      throw await refusedWrite(c, body.runId, exists, () => new ApiError(409, 'not_needed', 'Lista de exerciții nu mai este cerută.'));
    }
    return c.json({ exerciseList: saved });
  });

  return routes;
}
