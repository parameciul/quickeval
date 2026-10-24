import { Hono } from 'hono';
import { renameStudentBody } from '../../shared/api.ts';
import { getStudentHistory, renameClashMessage, renameStudent } from '../db/students.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { parseId, readJson } from '../http.ts';

// /api/admin/students
export function studentRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, renameStudentBody);
    const student = await renameStudent(c.env.DB, c.var.teacher.id, id, body.fullName);
    if (!student) throw notFound();
    if (student === 'duplicate') {
      throw new ApiError(409, 'student_exists', await renameClashMessage(c.env.DB, c.var.teacher.id, id, body.fullName));
    }
    return c.json({ student });
  });

  // The student page: every graded test of the student, in every class and year.
  routes.get('/:id/history', async (c) => {
    const history = await getStudentHistory(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!history) throw notFound();
    return c.json(history);
  });

  return routes;
}
