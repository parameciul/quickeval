import { Hono } from 'hono';
import { updateSettingsBody } from '../../shared/api.ts';
import { getSettings, setMaxParallel, setRobotKeyHash } from '../db/settings.ts';
import type { AppEnv } from '../env.ts';
import { nowIso, readJson } from '../http.ts';
import { newRobotKey, sha256Hex } from '../secrets.ts';

// /api/admin/settings: the Setări page.
export function settingsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => c.json({ settings: await getSettings(c.env.DB, c.var.teacher.id, nowIso()) }));

  routes.patch('/', async (c) => {
    const body = await readJson(c, updateSettingsBody);
    await setMaxParallel(c.env.DB, body.maxParallelAgents);
    return c.json({ settings: await getSettings(c.env.DB, c.var.teacher.id, nowIso()) });
  });

  // A new robot key, shown this once. The teacher copies it into the GitHub
  // secret QUICKEVAL_RUNNER_KEY; the old key stops working.
  routes.post('/robot-key', async (c) => {
    const key = newRobotKey();
    await setRobotKeyHash(c.env.DB, await sha256Hex(key));
    return c.json({ key }, 201);
  });

  return routes;
}
