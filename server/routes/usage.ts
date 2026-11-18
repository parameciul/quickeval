import { Hono } from 'hono';
import { isUsagePeriod, isUsageSource } from '../../shared/usage.ts';
import { adminOnly } from '../auth/teacherAuth.ts';
import { readUsage } from '../db/usage.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { nowIso } from '../http.ts';

// /api/admin/stats: the usage statistics on Setări, for administrators only.
// The page asks only when the administrator presses "Generează".
export function usageRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', adminOnly);

  routes.get('/', async (c) => {
    const source = c.req.query('source');
    const period = c.req.query('period');
    if (!isUsageSource(source) || !isUsagePeriod(period)) throw new ApiError(400, 'invalid', 'Statistica cerută nu este validă.');
    return c.json({ stats: await readUsage(c.env.DB, source, period, nowIso()) });
  });

  return routes;
}
