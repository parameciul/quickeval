import { Hono } from 'hono';
import { teacherAuth } from '../auth/teacherAuth.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { restartIfStopped } from '../dispatch.ts';
import { inBackground, nowIso, promoteDue, sameOriginWrites } from '../http.ts';
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
import { markSeen } from '../db/accounts.ts';
import { dataVersion } from '../db/version.ts';
import type { DataVersion, MeAnswer } from '../../shared/api.ts';

// /api/admin: everything the teacher app calls. Every route needs a teacher login; Setări
// and the accounts need an administrator.
export function adminRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites, teacherAuth(), viewReadOnly, promoteDue(options));
  // The app asks /me when it loads and again as its pages mount: the
  // account's last use (Setări), written at most once an hour. While an administrator views a teacher's account, the use is
  // the administrator's own, never the viewed teacher's.
  routes.get('/me', async (c) => {
    await markSeen(c.env.DB, c.var.viewing?.adminId ?? c.var.teacher.id, nowIso());
    return c.json({ teacher: c.var.teacher, viewing: c.var.viewing?.viewing ?? null } satisfies MeAnswer);
  });
  // The teacher app asks this every minute and reads its pages again only when
  // it changed. It also runs promoteDue, which starts the scheduled tests.
  // A live view adds its id as a fourth part, so the page reads again when a
  // view starts or ends.
  // It is also the clock that starts the teachers' robot again after a stop
  // (restartIfStopped), after the answer, which does not wait for it. A view
  // of a teacher's account starts it too: a start changes no teacher data.
  // The work in the background counts against the request's 15 D1 queries: at
  // worst about 13 (the session, promoteDue's batch, the version, the restart
  // claim, the work look, saveRobotStart). Count them before adding more.
  routes.get('/version', async (c) => {
    const base = await dataVersion(c.env.DB, c.var.teacher.id);
    inBackground(c, restartIfStopped(c.env, options, { lane: 'main' }, nowIso()));
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
