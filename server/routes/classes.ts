import { Hono } from 'hono';
import { createClassBody, updateClassBody } from '../../shared/api.ts';
import { isValidSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';
import { createClass, getClass, listClasses, listClassStudents, updateClass } from '../db/classes.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';

// /api/admin/classes
export function classRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const raw = c.req.query('year');
    const year = raw === undefined ? schoolYearOf(new Date()) : Number(raw);
    if (!isValidSchoolYear(year)) throw new ApiError(400, 'invalid', 'Anul școlar nu este valid.');
    return c.json({ classes: await listClasses(c.env.DB, c.var.teacher.id, year) });
  });

  routes.post('/', async (c) => {
    const body = await readJson(c, createClassBody);
    const created = await createClass(c.env.DB, c.var.teacher.id, body.name, body.schoolYear, nowIso());
    return c.json({ class: created }, 201);
  });

  routes.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const found = await getClass(c.env.DB, c.var.teacher.id, id);
    if (!found) throw notFound();
    return c.json({ class: found, students: await listClassStudents(c.env.DB, id) });
  });

  routes.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, updateClassBody);
    return c.json({ class: await updateClass(c.env.DB, c.var.teacher.id, id, body) });
  });

  return routes;
}
