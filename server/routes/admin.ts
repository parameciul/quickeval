import { Hono } from 'hono';
import { teacherAuth } from '../auth/teacherAuth.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { promoteDue, sameOriginWrites } from '../http.ts';
import { accountRoutes, ownAccountRoutes } from './accounts.ts';
import { classRoutes } from './classes.ts';
import { adminPaymentRoutes } from './payments.ts';
import { impersonationRoutes, viewReadOnly } from './impersonation.ts';
import { searchRoutes } from './search.ts';
import { settingsRoutes } from './settings.ts';
import { studentRoutes } from './students.ts';
import { submissionRoutes } from './submissions.ts';
import { testRoutes } from './tests.ts';
import { usageRoutes } from './usage.ts';
import { dataVersion } from '../db/version.ts';
import type { DataVersion, MeAnswer } from '../../shared/api.ts';

// /api/admin: everything the teacher app calls. Every route needs a teacher login; Setări
// and the accounts need an administrator.
export function adminRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites, teacherAuth(), viewReadOnly, promoteDue(options));
  routes.get('/me', (c) => c.json({ teacher: c.var.teacher, viewing: c.var.viewing?.viewing ?? null } satisfies MeAnswer));
  // The teacher app asks this every minute and reads its pages again only when
  // it changed. It also runs promoteDue, which starts the scheduled tests.
  // A live view adds its id as a fourth part, so the page reads again when a
  // view starts or ends.
  routes.get('/version', async (c) => {
    const base = await dataVersion(c.env.DB, c.var.teacher.id);
    const viewing = c.var.viewing?.viewing;
    return c.json({ version: viewing ? `${base}|v${viewing.id}` : base } satisfies DataVersion);
  });
  routes.route('/impersonation', impersonationRoutes());
  routes.route('/classes', classRoutes());
  routes.route('/students', studentRoutes(options));
  routes.route('/tests', testRoutes(options));
  routes.route('/search', searchRoutes());
  routes.route('/submissions', submissionRoutes(options));
  routes.route('/settings', settingsRoutes());
  routes.route('/stats', usageRoutes());
  routes.route('/account', ownAccountRoutes());
  routes.route('/accounts', accountRoutes(options));
  routes.route('/payments', adminPaymentRoutes(options));
  return routes;
}
