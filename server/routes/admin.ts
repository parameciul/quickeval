import { Hono } from 'hono';
import { teacherAuth } from '../auth/teacherAuth.ts';
import type { AppEnv } from '../env.ts';
import { sameOriginWrites } from '../http.ts';
import { classRoutes } from './classes.ts';
import { studentRoutes } from './students.ts';

// /api/admin: everything the teacher app calls. Every route needs a teacher login.
export function adminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites, teacherAuth());
  routes.get('/me', (c) => c.json({ teacher: c.var.teacher }));
  routes.route('/classes', classRoutes());
  routes.route('/students', studentRoutes());
  return routes;
}
