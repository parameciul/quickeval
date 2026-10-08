import { Hono } from 'hono';
import { robotAuth } from '../auth/robotAuth.ts';
import { runCheck } from '../db/runner.ts';
import type { AppEnv } from '../env.ts';
import { nowIso } from '../http.ts';

// /api/runner: the evaluation robot (spec §11.3). Every route needs the robot
// key. Answers carry ids and counts, never student names.
export function runnerRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', robotAuth());

  // The 10-minute check: is there work for a run?
  routes.post('/check', async (c) => c.json(await runCheck(c.env.DB, nowIso())));

  return routes;
}
