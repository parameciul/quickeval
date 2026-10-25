import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import {
  baremNotesBody,
  createTestBody,
  evaluateTestBody,
  renameTestBody,
  type AnalysisAnswer,
  type BaremNotesAnswer,
  type EvaluationStart,
  type ExerciseListAnswer,
  type PrintRetryAnswer,
  type ReopenAnswer,
  type RegradeAnswer,
  type RobotStartAnswer,
  type TestFileAnswer,
} from '../../shared/api.ts';
import { isTestFileKind, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE, testFileKey, type TestFileKind } from '../../shared/files.ts';
import { MAX_SCHEDULE_DAYS } from '../../shared/tests.ts';
import { acceptExerciseList,
  cancelSchedule,
  hasUploadedFiles,
  regradeTest,
  requestAnalysis,
  retryExerciseList,
  scheduleEvaluation,
  selectedHaveFiles,
  startEvaluationNow,
} from '../db/lifecycle.ts';
import { getClassReport } from '../db/report.ts';
import { setResultsOpen } from '../db/results.ts';
import { testHasRobotWork } from '../db/runner.ts';
import { getShowModel, testPageRobot } from '../db/settings.ts';
import {
  createTest,
  createMultiUploadToken,
  deleteTestRow,
  listTestKeys,
  listTests,
  listUploads,
  needsPrint,
  renameTest,
  reopenTest,
  requireTest,
  retryPrint,
  saveBaremNotes,
  saveTestFile,
  setTestArchived,
  startTest,
  toTestInfo,
} from '../db/tests.ts';
import { robotStarter } from '../dispatch.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
import { nowIso, parseSchoolYear, parseTestCode, readJson } from '../http.ts';
import { newUploadToken } from '../secrets.ts';
import { deleteFilesQuietly, fileResponse, readUpload } from '../uploads.ts';

function parseFileKind(raw: string | undefined): TestFileKind {
  if (raw === undefined || !isTestFileKind(raw)) throw notFound();
  return raw;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Why an evaluation could not start or be scheduled. Read after the write
// changed nothing, so it describes the test as it is now.
async function evaluationBlocker(db: D1Database, teacherId: number, code: string, needsUploads: boolean): Promise<ApiError> {
  const test = await requireTest(db, teacherId, code);
  if (test.summary.status === 'draft') return new ApiError(409, 'not_started', 'Testul nu a început încă.');
  if (test.summary.status !== 'open') return new ApiError(409, 'already_evaluating', 'Evaluarea a pornit deja.');
  if (!test.files.test) return new ApiError(409, 'missing_test_file', 'Încarcă testul înainte de evaluare.');
  if (!test.files.barem) return new ApiError(409, 'missing_barem', 'Încarcă baremul înainte de evaluare.');
  if (needsUploads && !(await hasUploadedFiles(db, test.id))) {
    return new ApiError(409, 'no_uploads', 'Niciun elev nu a încărcat încă fișiere.');
  }
  return new ApiError(409, 'busy', 'Testul s-a schimbat între timp. Încearcă din nou.');
}

// /api/admin/tests
export function testRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const startRobot = robotStarter(options);

  routes.get('/', async (c) => {
    const year = parseSchoolYear(c.req.query('year'));
    return c.json({ tests: await listTests(c.env.DB, c.var.teacher.id, year) });
  });

  routes.post('/', async (c) => {
    const body = await readJson(c, createTestBody);
    const code = await createTest(c.env.DB, c.var.teacher.id, body.classId, body.title, nowIso());
    return c.json({ code }, 201);
  });

  routes.get('/:code', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    return c.json({
      test: toTestInfo(test),
      uploads: await listUploads(c.env.DB, test.id, test.summary.classId),
      showModel: await getShowModel(c.env.DB),
      robot: await testPageRobot(c.env.DB, nowIso()),
    });
  });

  routes.patch('/:code', async (c) => {
    const code = parseTestCode(c.req.param('code'));
    const body = await readJson(c, renameTestBody);
    if (!(await renameTest(c.env.DB, c.var.teacher.id, code, body.title, nowIso()))) throw notFound();
    return c.json({ code, title: body.title });
  });

  // Extra teacher comments for the barem: saved as part of the test, read by
  // the robot as part of the barem. Like a new barem file: the exercise list
  // is cleared and the robot makes it again during evaluation.
  routes.put('/:code/barem-notes', async (c) => {
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
    if (test.summary.status === 'evaluating' && !listBlocked) {
      throw new ApiError(409, 'evaluating', 'Testul se corectează acum. Poți schimba comentariile după ce se termină corectarea.');
    }
    const body = await readJson(c, baremNotesBody);
    const status = await saveBaremNotes(c.env.DB, teacherId, test.id, body.notes, nowIso());
    if (status === null) throw notFound();
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ baremNotes: body.notes, robot } satisfies BaremNotesAnswer);
  });

  // The rows go first, so the test is gone at once; then its files.
  routes.delete('/:code', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const keys = await listTestKeys(c.env.DB, test);
    await deleteTestRow(c.env.DB, c.var.teacher.id, test.id);
    await deleteFilesQuietly(c.env.FILES, keys);
    return c.json({ deleted: true });
  });

  // Start test: draft → open. Students can upload from /u/<uploadToken>.
  routes.post('/:code/start', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const started =
      test.summary.status === 'draft' ? await startTest(c.env.DB, c.var.teacher.id, test.id, newUploadToken(), nowIso()) : null;
    if (!started) throw new ApiError(409, 'already_started', 'Testul a început deja.');
    const robot = (await needsPrint(c.env.DB, test.id)) ? await startRobot(c.env) : null;
    return c.json({ status: 'open', ...started, robot });
  });

  // The link that uploads for many students on one phone (/u/<multiUploadToken>).
  // Made only when the teacher asks for it, on a test that already started.
  // Answers with the kept link when it already exists.
  routes.post('/:code/multi-link', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (test.summary.status === 'draft') throw new ApiError(409, 'not_started', 'Testul nu a început încă.');
    if (test.multiUploadToken) return c.json({ multiUploadToken: test.multiUploadToken });
    const now = nowIso();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const created = await createMultiUploadToken(c.env.DB, c.var.teacher.id, test.id, newUploadToken(), now);
        if (!created) throw notFound();
        return c.json(created, 201);
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === 2) throw err;
      }
    }
    throw new ApiError(500, 'retry', 'A apărut o eroare. Încearcă din nou.');
  });

  // Reopen uploads: evaluating or done → open.
  routes.post('/:code/reopen', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (test.summary.status === 'draft') throw new ApiError(409, 'not_started', 'Testul nu a început încă.');
    if (!(await reopenTest(c.env.DB, c.var.teacher.id, test.id, nowIso()))) {
      throw new ApiError(409, 'already_open', 'Încărcarea este deja deschisă.');
    }
    const robot = (await needsPrint(c.env.DB, test.id)) ? await startRobot(c.env) : null;
    return c.json({ status: 'open', robot } satisfies ReopenAnswer);
  });

  // The test file with the QR code, once the robot has made it.
  routes.get('/:code/print', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const object = test.print.status === 'ready' && test.print.key ? await c.env.FILES.get(test.print.key) : null;
    if (!object) throw notFound();
    return fileResponse(object, `${test.summary.code}-cu-cod-qr.pdf`, PDF_TYPE);
  });

  // "Încearcă din nou": the robot makes the print PDF again.
  routes.post('/:code/print/retry', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (!(await retryPrint(c.env.DB, c.var.teacher.id, test.id, nowIso()))) {
      throw new ApiError(409, 'not_failed', 'Testul cu cod QR nu a eșuat.');
    }
    return c.json({ print: { status: 'none', fromWord: test.print.fromWord }, robot: await startRobot(c.env) } satisfies PrintRetryAnswer);
  });

  // Archives a finished test: it leaves the class table and the test list.
  routes.post('/:code/archive', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const archived = await setTestArchived(c.env.DB, c.var.teacher.id, test.id, true, nowIso());
    if (archived === null) throw new ApiError(409, 'not_done', 'Poți arhiva un test după ce s-a terminat corectarea.');
    return c.json({ archived });
  });

  routes.post('/:code/unarchive', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const archived = await setTestArchived(c.env.DB, c.var.teacher.id, test.id, false, nowIso());
    if (archived === null) throw notFound();
    return c.json({ archived });
  });

  // Opens the result pages of a test for all students. Students open their
  // own page from the link they kept after sending, or from the link the
  // teacher shares with them.
  routes.post('/:code/results/open', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const resultsOpen = await setResultsOpen(c.env.DB, c.var.teacher.id, test.id, true, nowIso());
    if (resultsOpen === null) throw notFound();
    return c.json({ resultsOpen });
  });

  // Closes the result pages of a test for all students. Their files through
  // the result links stop opening too.
  routes.post('/:code/results/close', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const resultsOpen = await setResultsOpen(c.env.DB, c.var.teacher.id, test.id, false, nowIso());
    if (resultsOpen === null) throw notFound();
    return c.json({ resultsOpen });
  });

  // "Recorectează tot": the robot grades every graded upload again, and every
  // upload whose grading failed; results and corrections go.
  routes.post('/:code/regrade', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const regraded = await regradeTest(c.env.DB, c.var.teacher.id, test.id, nowIso());
    if (!regraded) throw notFound();
    if (regraded.count === 0) throw new ApiError(409, 'nothing_to_regrade', 'Testul nu are lucrări corectate.');
    const robot = regraded.status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ count: regraded.count, testStatus: regraded.status, robot } satisfies RegradeAnswer);
  });

  // Start evaluation (spec §8.4): now, or at a later time. Now: the uploads
  // close and the robot is asked to start at once. Now with `submissionIds`:
  // only the selected uploads are graded; the rest wait for a later evaluation.
  routes.post('/:code/evaluate', async (c) => {
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    const body = await readJson(c, evaluateTestBody);
    const now = nowIso();
    // Stored the way nowIso() writes times, so the times compare as text.
    const at = body.at === undefined ? null : new Date(body.at).toISOString();
    if (at !== null && at > now) {
      if (body.submissionIds !== undefined) {
        throw new ApiError(400, 'invalid', 'Evaluarea programată corectează toate lucrările.');
      }
      if (Date.parse(at) - Date.parse(now) > MAX_SCHEDULE_DAYS * DAY_MS) {
        throw new ApiError(400, 'invalid', `Alege o oră din următoarele ${MAX_SCHEDULE_DAYS} de zile.`);
      }
      if (!(await scheduleEvaluation(c.env.DB, teacherId, test.id, at, now))) {
        throw await evaluationBlocker(c.env.DB, teacherId, test.summary.code, false);
      }
      return c.json({ status: 'open', evaluationAt: at, robot: null } satisfies EvaluationStart);
    }
    if (body.submissionIds !== undefined && !(await selectedHaveFiles(c.env.DB, test.id, body.submissionIds))) {
      throw new ApiError(409, 'no_selection', 'Selectează cel puțin o lucrare cu fișiere.');
    }
    const status = await startEvaluationNow(c.env.DB, teacherId, test.id, now, body.submissionIds);
    if (status === null) throw await evaluationBlocker(c.env.DB, teacherId, test.summary.code, true);
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ status, evaluationAt: null, robot } satisfies EvaluationStart);
  });

  routes.delete('/:code/schedule', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (!(await cancelSchedule(c.env.DB, c.var.teacher.id, test.id, nowIso()))) {
      throw new ApiError(409, 'not_scheduled', 'Evaluarea nu este programată.');
    }
    return c.json({ status: 'open', evaluationAt: null });
  });

  // "Folosește oricum": grade with an exercise list whose points do not add up.
  routes.post('/:code/exercise-list/accept', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const status = await acceptExerciseList(c.env.DB, c.var.teacher.id, test.id, nowIso());
    if (status === null) throw new ApiError(409, 'no_problem', 'Lista de exerciții nu are nicio problemă.');
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ exerciseList: { status: 'accepted', message: test.exerciseList.message }, robot } satisfies ExerciseListAnswer);
  });

  // "Încearcă din nou": the robot makes the exercise list again.
  routes.post('/:code/exercise-list/retry', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const status = await retryExerciseList(c.env.DB, c.var.teacher.id, test.id, nowIso());
    if (status === null) throw new ApiError(409, 'not_failed', 'Lista de exerciții nu a eșuat.');
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ exerciseList: { status: 'none', message: null }, robot } satisfies ExerciseListAnswer);
  });

  // "Pornește robotul": the teacher starts the robot again for work that a
  // run left when it stopped early (a usage limit, a crash, the time limit),
  // or for the print PDF of an open test when the robot did not start.
  routes.post('/:code/robot', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    // An open test has robot work only while its print PDF waits; testHasRobotWork decides.
    if (test.summary.status !== 'evaluating' && test.summary.status !== 'open') {
      throw new ApiError(409, 'not_evaluating', 'Testul nu se corectează acum.');
    }
    if (!(await testHasRobotWork(c.env.DB, test.id, nowIso()))) {
      throw new ApiError(409, 'no_work', 'Nicio lucrare a acestui test nu așteaptă robotul.');
    }
    return c.json({ robot: await startRobot(c.env) } satisfies RobotStartAnswer);
  });

  // The rows of the class report (spec §14.2). The statistics are made in the
  // browser from these rows.
  routes.get('/:code/report', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const report = await getClassReport(c.env.DB, c.var.teacher.id, test.id);
    if (!report) throw notFound();
    return c.json({ report });
  });

  // "Regenerează": the robot writes the class analysis again (spec §8.5).
  routes.post('/:code/analysis/regenerate', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (test.summary.status !== 'evaluating' && test.summary.status !== 'done') {
      throw new ApiError(409, 'not_evaluated', 'Analiza se face după ce testul a fost corectat.');
    }
    if (test.summary.gradedCount === 0) throw new ApiError(409, 'no_results', 'Testul nu are lucrări corectate.');
    const analysis = await requestAnalysis(c.env.DB, c.var.teacher.id, test.id, nowIso());
    if (!analysis) throw new ApiError(409, 'busy', 'Testul s-a schimbat între timp. Încearcă din nou.');
    return c.json({ analysis, robot: await startRobot(c.env) } satisfies AnalysisAnswer);
  });

  // Upload or replace the test or the barem: PDF or Word, at most 25 MB. A new
  // barem during evaluation needs a new exercise list: the robot starts.
  routes.put('/:code/files/:kind', async (c) => {
    const kind = parseFileKind(c.req.param('kind'));
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    // While the robot grades, it reads both files. It reads neither while the
    // exercise list has a problem or failed: the teacher may then fix the barem.
    const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
    if (test.summary.status === 'evaluating' && !listBlocked) {
      throw new ApiError(409, 'evaluating', 'Testul se corectează acum. Poți schimba fișierul după ce se termină corectarea.');
    }
    const file = await readUpload(c, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
    const key = testFileKey(teacherId, test.summary.schoolYear, test.summary.code, kind, file.name, file.contentType);
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
    const status = await saveTestFile(c.env.DB, teacherId, test.id, kind, { key, name: file.name, type: file.contentType }, nowIso());
    const old = test.files[kind];
    const stale = [old && old.key !== key ? old.key : null, kind === 'test' ? test.print.key : null].filter((k) => k !== null);
    if (stale.length > 0) await deleteFilesQuietly(c.env.FILES, stale);
    const robot =
      kind === 'barem' ? (status === 'evaluating' ? await startRobot(c.env) : null) : (await needsPrint(c.env.DB, test.id)) ? await startRobot(c.env) : null;
    return c.json({ file: { name: file.name, type: file.contentType }, robot } satisfies TestFileAnswer);
  });

  routes.get('/:code/files/:kind', async (c) => {
    const kind = parseFileKind(c.req.param('kind'));
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const stored = test.files[kind];
    const object = stored ? await c.env.FILES.get(stored.key) : null;
    if (!stored || !object) throw notFound();
    return fileResponse(object, stored.name, stored.type);
  });

  return routes;
}
