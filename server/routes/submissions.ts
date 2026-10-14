import { Hono } from 'hono';
import { correctItemBody, regradeBody, reviewPagesBody, type RegradeAnswer, type ResultsOpenAnswer } from '../../shared/api.ts';
import { formatPoints, isValidCorrection } from '../../shared/scoring.ts';
import { correctItem, correctEvaluation, findTeacherItem } from '../db/evaluations.ts';
import { regradeSubmission, retrySubmission } from '../db/lifecycle.ts';
import { setSubmissionResultsOpen, teacherResultToken } from '../db/results.ts';
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

  // The teacher's link to one student's result page, to share when the student
  // lost the link kept after sending or uses another phone. Makes the link for
  // older uploads that have none yet.
  routes.get('/:id/result-link', async (c) => {
    const submissionId = parseId(c.req.param('id'));
    const resultToken = await teacherResultToken(c.env.DB, c.var.teacher.id, submissionId);
    if (!resultToken) throw notFound();
    return c.json({ resultToken });
  });

  // Publishes one student's result page while the rest of the class stays
  // unpublished. The page opens when the test keeps results open for all, or
  // its own upload is published.
  routes.post('/:id/results/open', async (c) => {
    const resultsOpen = await setSubmissionResultsOpen(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), true);
    if (resultsOpen === null) throw notFound();
    return c.json({ resultsOpen } satisfies ResultsOpenAnswer);
  });

  // Takes back one student's result page. When the test keeps results open for
  // all, the page stays open until the teacher stops access for the test.
  routes.post('/:id/results/close', async (c) => {
    const resultsOpen = await setSubmissionResultsOpen(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), false);
    if (resultsOpen === null) throw notFound();
    return c.json({ resultsOpen } satisfies ResultsOpenAnswer);
  });

  // The teacher's correction of one item of the graded result (spec §14.1).
  // The item must be in the result the page shows: the upload in the path,
  // and the grading the body names. Ids come back after a reset or a regrade
  // deletes the newest rows, so a page opened before must not change another
  // result. Answers with the whole upload, so the page shows the new total
  // and grade.
  routes.patch('/:id/items/:itemId', async (c) => {
    const submissionId = parseId(c.req.param('id'));
    const itemId = parseId(c.req.param('itemId'));
    const { gradedAt, ...change } = await readJson(c, correctItemBody);
    const shown = { teacherId: c.var.teacher.id, submissionId, gradedAt };
    const item = await findTeacherItem(c.env.DB, shown, itemId);
    if (item && change.points !== undefined && !isValidCorrection(change.points, item.maxPoints)) {
      throw new ApiError(400, 'invalid_points', `Punctajul este între 0 și ${formatPoints(item.maxPoints)}, din 0,05 în 0,05.`);
    }
    const corrected = item !== null && (await correctItem(c.env.DB, shown, itemId, change, nowIso()));
    const found = await getTeacherSubmission(c.env.DB, shown.teacherId, submissionId);
    if (!found) throw notFound();
    if (!corrected) throw notGraded();
    return c.json({ submission: found.detail });
  });

  // The teacher checked the pages that the robot could not read, or corrected
  // the final sections (Rezumat, Ce a lucrat bine, Recomandări), on the
  // result the page shows.
  routes.patch('/:id/evaluation', async (c) => {
    const teacherId = c.var.teacher.id;
    const submissionId = parseId(c.req.param('id'));
    const { gradedAt, ...change } = await readJson(c, reviewPagesBody);
    const reviewed = await correctEvaluation(c.env.DB, { teacherId, submissionId, gradedAt }, change, nowIso());
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

  // "Recorectează": the robot grades a graded upload again; the result the
  // page shows and the teacher's corrections go.
  routes.post('/:id/regrade', async (c) => {
    const teacherId = c.var.teacher.id;
    const submissionId = parseId(c.req.param('id'));
    const { gradedAt } = await readJson(c, regradeBody);
    const found = await getTeacherSubmission(c.env.DB, teacherId, submissionId);
    if (!found) throw notFound();
    const testStatus = await regradeSubmission(c.env.DB, { teacherId, submissionId, gradedAt }, nowIso());
    if (testStatus === null) throw notGraded();
    const robot = testStatus === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ count: 1, testStatus, robot } satisfies RegradeAnswer);
  });

  return routes;
}
