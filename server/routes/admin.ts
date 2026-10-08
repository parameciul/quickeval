import { Hono } from 'hono';
import { teacherAuth } from '../auth/teacherAuth.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { promoteDue, sameOriginWrites } from '../http.ts';
import { classRoutes } from './classes.ts';
import { studentRoutes } from './students.ts';
import { submissionRoutes } from './submissions.ts';
import { testRoutes } from './tests.ts';

// /api/admin: everything the teacher app calls. Every route needs a teacher login.
export function adminRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites, teacherAuth(), promoteDue);
  routes.get('/me', (c) => c.json({ teacher: c.var.teacher }));
  routes.route('/classes', classRoutes());
  routes.route('/students', studentRoutes());
  routes.route('/tests', testRoutes(options));
  routes.route('/submissions', submissionRoutes(options));
  return routes;
}
