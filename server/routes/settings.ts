import { type Context, Hono } from 'hono';
import { updateSettingsBody } from '../../shared/api.ts';
import { getSettings, setMaxParallel, setRobotKeyHash, setShowModel } from '../db/settings.ts';
import { isOwner } from '../db/teachers.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { nowIso, readJson } from '../http.ts';
import { newRobotKey, sha256Hex } from '../secrets.ts';

// The robot's key and settings are shared by every teacher, and its key opens the
// robot API for all of them: only the first teacher may change them.
async function requireOwner(c: Context<AppEnv>): Promise<void> {
  if (!(await isOwner(c.env.DB, c.var.teacher.id))) {
    throw new ApiError(403, 'owner_only', 'Doar administratorul aplicației poate schimba aceste setări.');
  }
}

// /api/admin/settings: the Setări page.
export function settingsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => c.json({ settings: await getSettings(c.env.DB, c.var.teacher.id, nowIso()) }));

  routes.patch('/', async (c) => {
    await requireOwner(c);
    const body = await readJson(c, updateSettingsBody);
    if (body.maxParallelAgents !== undefined) await setMaxParallel(c.env.DB, body.maxParallelAgents);
    if (body.showModelColumn !== undefined) await setShowModel(c.env.DB, body.showModelColumn);
    return c.json({ settings: await getSettings(c.env.DB, c.var.teacher.id, nowIso()) });
  });

  // A new robot key, shown this once. The teacher copies it into the GitHub
  // secret QUICKEVAL_RUNNER_KEY; the old key stops working.
  routes.post('/robot-key', async (c) => {
    await requireOwner(c);
    const key = newRobotKey();
    await setRobotKeyHash(c.env.DB, await sha256Hex(key));
    return c.json({ key }, 201);
  });

  return routes;
}
