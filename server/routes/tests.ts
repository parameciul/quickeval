import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import {
  baremCheckedBody,
  baremNotesBody,
  createTestBody,
  evaluateTestBody,
  renameTestBody,
  type AnalysisAnswer,
  type BaremCheckedAnswer,
  type BaremGenerateAnswer,
  type BaremNotesAnswer,
  type EvaluationStart,
  type ExerciseListAnswer,
  type FinishedTest,
  type PrintRetryAnswer,
  type RegradeAnswer,
  type ReopenAnswer,
  type RobotStartAnswer,
  type StoppedTest,
  type TestFileAnswer,
} from '../../shared/api.ts';
import { isTestFileKind, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE, testFileKey, type TestFileKind } from '../../shared/files.ts';
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';
import { MAX_SCHEDULE_DAYS } from '../../shared/tests.ts';
import { acceptExerciseList,
  blockedByDemoLimit,
  regradeBlockedByDemoLimit,
  cancelSchedule,
  finishBlocker,
  finishOpenTest,
  hasUploadedFiles,
  regradeTest,
  requestAnalysis,
  retryExerciseList,
  scheduleEvaluation,
  selectedHaveFiles,
  startEvaluationNow,
} from '../db/lifecycle.ts';
import { isQuickTryTest } from '../db/quickTry.ts';
import { getClassReport } from '../db/report.ts';
import { setResultsOpen } from '../db/results.ts';
import { testHasRobotWork } from '../db/runner.ts';
import { getShowModel, testPageRobot } from '../db/settings.ts';
import {
  confirmBarem,
  createTest,
  createMultiUploadToken,
  deleteTestRow,
  hasStudentFiles,
  listTestKeys,
  listTests,
  listUploads,
  needsBarem,
  needsPrint,
  renameTest,
  reopenTest,
  requestBarem,
  requireTest,
  retryPrint,
  saveBaremNotes,
  saveTestFile,
  setTestArchived,
  startTest,
  stopTest,
  toTestInfo,
} from '../db/tests.ts';
import { robotStarter } from '../dispatch.ts';
import { cesVariantRoutes } from './cesVariant.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError, demoLimit, isUniqueViolation, notFound } from '../errors.ts';
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
export async function evaluationBlocker(db: D1Database, teacherId: number, code: string, needsUploads: boolean, scheduling = false): Promise<ApiError> {
  const test = await requireTest(db, teacherId, code);
  if (test.summary.status === 'draft') return new ApiError(409, 'not_started', 'Testul nu a început încă.');
  if (test.summary.status !== 'open') return new ApiError(409, 'already_evaluating', 'Evaluarea a pornit deja.');
  if (!test.files.test) return new ApiError(409, 'missing_test_file', 'Încarcă testul înainte de evaluare.');
  if (test.barem.request === 'requested') return new ApiError(409, 'barem_generating', 'Baremul se generează încă.');
  if (!test.files.barem) return new ApiError(409, 'missing_barem', 'Încarcă baremul înainte de evaluare.');
  if (test.barem.unchecked) return new ApiError(409, 'barem_unchecked', 'Verifică baremul generat înainte de evaluare.');
  if (await blockedByDemoLimit(db, test.id, scheduling)) return demoLimit();
  if (needsUploads && !(await hasUploadedFiles(db, test.id))) {
    return new ApiError(409, 'no_uploads', 'Niciun elev nu a încărcat încă fișiere.');
  }
  return new ApiError(409, 'busy', 'Testul s-a schimbat între timp. Încearcă din nou.');
}

// /api/admin/tests
export function testRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const startRobot = robotStarter(options);
  cesVariantRoutes(routes, startRobot);

  routes.get('/', async (c) => {
    const year = parseSchoolYear(c.req.query('year'));
    return c.json({ tests: await listTests(c.env.DB, c.var.teacher.id, year) });
  });

  routes.post('/', async (c) => {
    const body = await readJson(c, createTestBody);
    const code = await createTest(c.env.DB, c.var.teacher.id, body.classId, body.title, nowIso(), body.cesOff ?? false);
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
    // A running barem job drops its answer now that the files changed, so a waiting request needs a new run.
    const robot = status === 'evaluating' || (await needsBarem(c.env.DB, test.id)) ? await startRobot(c.env) : null;
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

  // Start test: draft → open, on the day of the test. Students can upload
  // from /u/<uploadToken>, the link the test got when it was made. Only a
  // draft made before that gets its link now, and with it a print job.
  routes.post('/:code/start', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const started =
      test.summary.status === 'draft' ? await startTest(c.env.DB, c.var.teacher.id, test.id, newUploadToken(), nowIso()) : null;
    if (!started) throw new ApiError(409, 'already_started', 'Testul a început deja.');
    const robot = (await needsPrint(c.env.DB, test.id)) ? await startRobot(c.env) : null;
    return c.json({ status: 'open', ...started, robot });
  });

  // "Oprește testul": open → draft, for a test started by mistake. Only while
  // no student has uploaded a file and the test was never evaluated; the link
  // and the print PDF stay.
  routes.post('/:code/stop', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (test.summary.status === 'open' && (await stopTest(c.env.DB, c.var.teacher.id, test.id, nowIso()))) {
      return c.json({ status: 'draft' } satisfies StoppedTest);
    }
    // Read after the write changed nothing, so it describes the test as it is now.
    const current = await requireTest(c.env.DB, c.var.teacher.id, test.summary.code);
    if (current.summary.status === 'draft') throw new ApiError(409, 'not_started', 'Testul nu a început încă.');
    if (current.summary.status !== 'open') throw new ApiError(409, 'closed', 'Încărcarea s-a închis. Testul nu mai poate fi oprit.');
    if (current.summary.evaluationStartedAt !== null) {
      throw new ApiError(409, 'evaluated', 'Testul a fost deja evaluat, așa că nu mai poate fi oprit.');
    }
    if (await hasStudentFiles(c.env.DB, current.id)) {
      throw new ApiError(409, 'has_uploads', 'Un elev a încărcat deja lucrarea, așa că testul nu mai poate fi oprit.');
    }
    throw new ApiError(409, 'busy', 'Testul s-a schimbat între timp. Încearcă din nou.');
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

  // "Marchează ca terminat": an open test with every sent paper graded is done
  // again (it was reopened by mistake). No robot.
  routes.post('/:code/finish', async (c) => {
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    if (!(await finishOpenTest(c.env.DB, teacherId, test.id, nowIso()))) {
      const status = (await requireTest(c.env.DB, teacherId, test.summary.code)).summary.status;
      if (status === 'draft') throw new ApiError(409, 'not_started', 'Testul nu a început încă.');
      if (status === 'evaluating') throw new ApiError(409, 'already_evaluating', 'Evaluarea a pornit deja.');
      if (status === 'done') throw new ApiError(409, 'already_done', 'Testul este deja terminat.');
      const why = await finishBlocker(c.env.DB, test.id);
      if (why === 'papers_waiting') throw new ApiError(409, why, 'Mai sunt lucrări trimise care nu au fost corectate.');
      if (why === 'nothing_graded') throw new ApiError(409, why, 'Testul nu are nicio lucrare corectată.');
      throw new ApiError(409, 'busy', 'Testul s-a schimbat între timp. Încearcă din nou.');
    }
    return c.json({ status: 'done' } satisfies FinishedTest);
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

  // "Încearcă din nou": the robot makes the print PDF again. Also "Pregătește
  // testul cu cod QR" for a draft made before tests got their link at once.
  routes.post('/:code/print/retry', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (!(await retryPrint(c.env.DB, c.var.teacher.id, test.id, newUploadToken(), nowIso()))) {
      throw new ApiError(409, 'not_failed', 'Testul cu cod QR nu poate fi încercat din nou.');
    }
    return c.json({ print: { status: 'none', fromWord: test.print.fromWord }, robot: await startRobot(c.env) } satisfies PrintRetryAnswer);
  });

  // "Generează baremul": the robot writes the barem from the test file.
  routes.post('/:code/barem/generate', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (!(await requestBarem(c.env.DB, c.var.teacher.id, test.id, nowIso()))) {
      if (!test.files.test) throw new ApiError(409, 'missing_test_file', 'Încarcă testul înainte să generezi baremul.');
      // The try's own rule (requestBarem's SQL): no request before and no barem.
      const generationUsed = test.barem.request !== 'none' || test.barem.unchecked || test.files.barem !== null;
      if (generationUsed && (await isQuickTryTest(c.env.DB, test.id))) {
        throw new ApiError(409, 'quick_try_barem', 'Într-o încercare rapidă, baremul se generează o singură dată și doar dacă nu ai încărcat unul.');
      }
      throw new ApiError(409, 'not_editable', 'Baremul se poate genera doar înainte de evaluare.');
    }
    const barem = { request: 'requested', unchecked: test.barem.unchecked } as const;
    return c.json({ barem, robot: await startRobot(c.env) } satisfies BaremGenerateAnswer);
  });

  // The teacher checked the generated barem as the page showed it.
  routes.post('/:code/barem/checked', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const body = await readJson(c, baremCheckedBody);
    if (!(await confirmBarem(c.env.DB, c.var.teacher.id, test.id, body.filesVersion, nowIso()))) {
      throw new ApiError(409, 'stale', 'Baremul s-a schimbat. Reîncarcă pagina.');
    }
    return c.json({ barem: { request: test.barem.request, unchecked: false } } satisfies BaremCheckedAnswer);
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
    if (regraded.count === 0) {
      if (await regradeBlockedByDemoLimit(c.env.DB, { testId: test.id })) throw demoLimit();
      throw new ApiError(409, 'nothing_to_regrade', 'Testul nu are lucrări corectate.');
    }
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
        throw await evaluationBlocker(c.env.DB, teacherId, test.summary.code, false, true);
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
  // or for the print PDF or the barem of a draft or open test when the robot
  // did not start.
  routes.post('/:code/robot', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    // A draft or open test has robot work only while its print PDF or barem
    // waits; testHasRobotWork decides.
    const status = test.summary.status;
    const draftWork = status === 'draft' && ((await needsBarem(c.env.DB, test.id)) || (await needsPrint(c.env.DB, test.id)));
    if (status !== 'evaluating' && status !== 'open' && !draftWork) {
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
    // A file key has no random part, so a refused upload with the stored
    // file's name would overwrite it: a try past its limit is refused before
    // R2 is written. The SQL of saveTestFile stays the rule.
    const filesUsedUp = new ApiError(409, 'quick_try_files', `Într-o încercare rapidă poți încărca testul și baremul de cel mult ${QUICK_TRY_FILE_CHANGES} ori în total.`);
    if (test.filesVersion >= QUICK_TRY_FILE_CHANGES && (await isQuickTryTest(c.env.DB, test.id))) throw filesUsedUp;
    const file = await readUpload(c, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
    const key = testFileKey(teacherId, test.summary.schoolYear, test.summary.code, kind, file.name, file.contentType);
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
    const stored = { key, name: file.name, type: file.contentType };
    const saved = await saveTestFile(c.env.DB, teacherId, test.id, kind, stored, nowIso(), newUploadToken());
    if (saved === null && (await isQuickTryTest(c.env.DB, test.id))) {
      const kept = test.files[kind];
      const keptKey = kept ? testFileKey(teacherId, test.summary.schoolYear, test.summary.code, kind, kept.name, kept.type) : null;
      if (key !== keptKey) await deleteFilesQuietly(c.env.FILES, [key]);
      throw filesUsedUp;
    }
    // The replaced file is read in the write's own batch: the robot may have
    // saved a generated barem after this route read the test.
    const replaced = saved?.replacedKey ?? null;
    const stale = [replaced !== key ? replaced : null, saved?.clearedPrintKey ?? null].filter((k) => k !== null);
    if (stale.length > 0) await deleteFilesQuietly(c.env.FILES, stale);
    let robotWork = false;
    if (kind === 'barem') robotWork = saved?.status === 'evaluating';
    else robotWork = (await needsPrint(c.env.DB, test.id)) || (await needsBarem(c.env.DB, test.id));
    const robot = robotWork ? await startRobot(c.env) : null;
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
