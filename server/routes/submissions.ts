import { Hono } from 'hono';
import { correctItemBody, reviewPagesBody, type RegradeAnswer } from '../../shared/api.ts';
import { formatPoints, isValidCorrection } from '../../shared/scoring.ts';
import { correctItem, findTeacherItem, reviewPages } from '../db/evaluations.ts';
import { regradeSubmission, retrySubmission } from '../db/lifecycle.ts';
import { deleteSubmissionRow, findTeacherFile, getTeacherSubmission } from '../db/submissions.ts';
import { robotStarter } from '../dispatch.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError, notFound, notGraded } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';
import { deleteFilesQuietly, fileResponse } from '../uploads.ts';

// /api/admin/submissions: one student's upload for one test.
export function submissionRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const startRobot = robotStarter(options);

  routes.get('/:id', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    return c.json({ submission: found.detail });
  });

  // The teacher's correction of one item of the graded result (spec §14.1).
  // The item must be in the result of the upload in the path: item ids come
  // back after a reset or a regrade deletes the newest results, so a page
  // opened before must not change another student's item. Answers with the
  // whole upload, so the page shows the new total and grade.
  routes.patch('/:id/items/:itemId', async (c) => {
    const teacherId = c.var.teacher.id;
    const submissionId = parseId(c.req.param('id'));
    const itemId = parseId(c.req.param('itemId'));
    const body = await readJson(c, correctItemBody);
    const item = await findTeacherItem(c.env.DB, teacherId, submissionId, itemId);
    if (item && body.points !== undefined && !isValidCorrection(body.points, item.maxPoints)) {
      throw new ApiError(400, 'invalid_points', `Punctajul este între 0 și ${formatPoints(item.maxPoints)}, din 0,05 în 0,05.`);
    }
    const corrected = item !== null && (await correctItem(c.env.DB, teacherId, submissionId, itemId, body, nowIso()));
    const found = await getTeacherSubmission(c.env.DB, teacherId, submissionId);
    if (!found) throw notFound();
    if (!corrected) throw notGraded();
    return c.json({ submission: found.detail });
  });

  // The teacher checked the pages that the robot could not read.
  routes.patch('/:id/evaluation', async (c) => {
    const teacherId = c.var.teacher.id;
    const submissionId = parseId(c.req.param('id'));
    const body = await readJson(c, reviewPagesBody);
    const reviewed = await reviewPages(c.env.DB, teacherId, submissionId, body.pagesReviewed, nowIso());
    const found = await getTeacherSubmission(c.env.DB, teacherId, submissionId);
    if (!found) throw notFound();
    if (!reviewed) throw notGraded();
    return c.json({ submission: found.detail });
  });

  routes.get('/:id/files/:fileId', async (c) => {
    const file = await findTeacherFile(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), parseId(c.req.param('fileId')));
    const object = file ? await c.env.FILES.get(file.key) : null;
    if (!file || !object) throw notFound();
    return fileResponse(object, file.name, file.type);
  });

  // Deletes the upload and its files, so the student can start again
  // (for example on another phone).
  routes.post('/:id/reset', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    await deleteSubmissionRow(c.env.DB, found.detail.id);
    await deleteFilesQuietly(c.env.FILES, found.files.map((file) => file.key));
    return c.json({ reset: true });
  });

  // "Reîncearcă": the robot grades a failed upload again.
  routes.post('/:id/retry', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    const testStatus = await retrySubmission(c.env.DB, c.var.teacher.id, found.detail.id, nowIso());
    if (testStatus === null) throw new ApiError(409, 'not_failed', 'Corectarea acestei lucrări nu a eșuat.');
    const robot = testStatus === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ status: 'submitted', robot });
  });

  // "Recorectează": the robot grades a graded upload again; its result and the
  // teacher's corrections go.
  routes.post('/:id/regrade', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    const testStatus = await regradeSubmission(c.env.DB, c.var.teacher.id, found.detail.id, nowIso());
    if (testStatus === null) throw new ApiError(409, 'not_graded', 'Lucrarea nu este corectată acum.');
    const robot = testStatus === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ count: 1, testStatus, robot } satisfies RegradeAnswer);
  });

  return routes;
}
