import { Hono } from 'hono';
import { correctItemBody } from '../../shared/api.ts';
import { formatPoints, isValidCorrection } from '../../shared/scoring.ts';
import { correctItem, findTeacherItem } from '../db/evaluations.ts';
import { getTeacherSubmission } from '../db/submissions.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';

// The teacher may not change a result while the robot grades the upload again.
export const notGraded = () => new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.');

// /api/admin/evaluation-items: the teacher's corrections of graded items
// (spec §14.1). Answers with the whole upload, so the page shows the new
// total and grade.
export function evaluationItemRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.patch('/:id', async (c) => {
    const teacherId = c.var.teacher.id;
    const itemId = parseId(c.req.param('id'));
    const body = await readJson(c, correctItemBody);
    const item = await findTeacherItem(c.env.DB, teacherId, itemId);
    if (!item) throw notFound();
    if (body.points !== undefined && !isValidCorrection(body.points, item.maxPoints)) {
      throw new ApiError(400, 'invalid_points', `Punctajul este între 0 și ${formatPoints(item.maxPoints)}, din 0,05 în 0,05.`);
    }
    if (!(await correctItem(c.env.DB, teacherId, itemId, body, nowIso()))) throw notGraded();
    const found = await getTeacherSubmission(c.env.DB, teacherId, item.submissionId);
    if (!found) throw notFound();
    return c.json({ submission: found.detail });
  });

  return routes;
}
