import { Hono } from 'hono';
import { renameStudentBody, studentCesBody } from '../../shared/api.ts';
import { getStudentHistory, renameClashMessage, renameStudent, setStudentCes } from '../db/students.ts';
import { robotStarter } from '../dispatch.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { parseId, readJson } from '../http.ts';

// /api/admin/students
export function studentRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const startRobot = robotStarter(options);

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

  // The CES mark: the student gets the CES variant of the tests that have one.
  // During an evaluation the mark can free a waiting paper or make the CES
  // exercise list due: the robot starts.
  routes.put('/:id/ces', async (c) => {
    const body = await readJson(c, studentCesBody);
    const saved = await setStudentCes(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), body.ces);
    if (!saved) throw notFound();
    if (saved.robotWork) await startRobot(c.env);
    return c.json({ student: saved.student });
  });

  // The student page: every graded test of the student, in every class and year.
  routes.get('/:id/history', async (c) => {
    const history = await getStudentHistory(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!history) throw notFound();
    return c.json(history);
  });

  return routes;
}
