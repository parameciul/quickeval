import { Hono } from 'hono';
import { addStudentsBody, createClassBody, setEnrollmentBody, updateClassBody } from '../../shared/api.ts';
import { createClass, getClass, listClassGrades, listClasses, listClassStudents, updateClass } from '../db/classes.ts';
import { addStudentsToClass, deleteStudentFromClass, setEnrollmentActive } from '../db/students.ts';
import { listClassTests } from '../db/tests.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId, parseSchoolYear, readJson } from '../http.ts';
import { deleteFilesQuietly } from '../uploads.ts';

// /api/admin/classes
export function classRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const year = parseSchoolYear(c.req.query('year'));
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
    return c.json({
      class: found,
      students: await listClassStudents(c.env.DB, c.var.teacher.id, id),
      tests: await listClassTests(c.env.DB, c.var.teacher.id, id),
      grades: await listClassGrades(c.env.DB, c.var.teacher.id, id),
    });
  });

  routes.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, updateClassBody);
    return c.json({ class: await updateClass(c.env.DB, c.var.teacher.id, id, body) });
  });

  routes.post('/:id/students', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, addStudentsBody);
    if (!(await getClass(c.env.DB, c.var.teacher.id, id))) throw notFound();
    const students = await addStudentsToClass(c.env.DB, c.var.teacher.id, id, body.names, nowIso());
    return c.json({ students }, 201);
  });

  routes.patch('/:id/students/:studentId', async (c) => {
    const id = parseId(c.req.param('id'));
    const studentId = parseId(c.req.param('studentId'));
    const body = await readJson(c, setEnrollmentBody);
    const student = await setEnrollmentActive(c.env.DB, c.var.teacher.id, id, studentId, body.active);
    if (!student) throw notFound();
    return c.json({ student });
  });

  routes.delete('/:id/students/:studentId', async (c) => {
    const id = parseId(c.req.param('id'));
    const studentId = parseId(c.req.param('studentId'));
    const result = await deleteStudentFromClass(c.env.DB, c.var.teacher.id, id, studentId);
    if (result === 'not_found') throw notFound();
    if (result === 'has_work') {
      throw new ApiError(409, 'student_has_work', 'Elevul are lucrări trimise sau corectate în această clasă. Îl poți marca „A plecat”.');
    }
    await deleteFilesQuietly(c.env.FILES, result.keys);
    return c.json({ deleted: true });
  });

  return routes;
}
