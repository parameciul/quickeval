import { Hono } from 'hono';
import { renameStudentBody } from '../../shared/api.ts';
import { renameStudent } from '../db/students.ts';
import type { AppEnv } from '../env.ts';
import { notFound } from '../errors.ts';
import { parseId, readJson } from '../http.ts';

// /api/admin/students
export function studentRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, renameStudentBody);
    const student = await renameStudent(c.env.DB, c.var.teacher.id, id, body.fullName);
    if (!student) throw notFound();
    return c.json({ student });
  });

  return routes;
}
