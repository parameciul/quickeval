import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ExerciseListInfo } from '../../shared/api.ts';
import { isTestFileKind, PDF_TYPE, printFileKey } from '../../shared/files.ts';
import {
  analysisBody,
  checkBody,
  exerciseListBody,
  type LeaseResult,
  MAX_ROBOT_BODY_BYTES,
  printFailedBody,
  releaseBody,
  resultBody,
  runBody,
  runIdSchema,
} from '../../shared/runner.ts';
import { checkClassAnalysis, checkExerciseList, checkGrading } from '../../shared/schemas.ts';
import { robotAuth } from '../auth/robotAuth.ts';
import {
  claimSubmission,
  failAnalysis,
  failExerciseList,
  failGrading,
  failPrint,
  findClassResults,
  findGrading,
  findPrintJob,
  findRobotFile,
  findRobotTest,
  heartbeat,
  holdsLease,
  listTasks,
  printKeyIs,
  releaseLease,
  runCheck,
  saveAnalysis,
  saveExerciseList,
  saveGrading,
  savePrint,
  takeLease,
  testExists,
} from '../db/runner.ts';
import { getMaxParallel } from '../db/settings.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';
import { deleteFilesQuietly, fileResponse, readUpload } from '../uploads.ts';

const leaseLost = () => new ApiError(409, 'lease_lost', 'Altă rulare a robotului lucrează acum.');
// A broken output: the robot counts it as invalid_output.
const invalidResult = () => new ApiError(422, 'invalid_result', 'Rezultatul robotului nu poate fi folosit.');
const printNotNeeded = () => new ApiError(409, 'not_needed', 'Testul cu cod QR nu mai este cerut.');

// Why a robot write changed nothing: the test is gone (404, the robot drops
// the result), another run holds the lease, or the work is no longer needed.
async function refusedWrite(c: Context<AppEnv>, runId: string, exists: boolean, notNeeded: () => ApiError): Promise<ApiError> {
  if (!exists) return notFound();
  if (!(await holdsLease(c.env.DB, runId))) return leaseLost();
  return notNeeded();
}

// /api/runner: the evaluation robot (spec §11.3). Every route needs the robot
// key. Answers carry ids and counts, never student names.
export function runnerRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', robotAuth());

  // The 10-minute check: is there work for a run?
  // An older robot sends no body; a newer one names its model and effort.
  routes.post('/check', async (c) => {
    const configured = (c.req.header('Content-Type') ?? '').toLowerCase().startsWith('application/json') ? await readJson(c, checkBody) : {};
    return c.json(await runCheck(c.env.DB, nowIso(), configured));
  });

  // Only one run works at a time (spec §12.2).
  routes.post('/lease', async (c) => {
    const { runId } = await readJson(c, runBody);
    const granted = await takeLease(c.env.DB, runId, nowIso());
    const answer: LeaseResult = { granted, maxParallel: await getMaxParallel(c.env.DB) };
    return c.json(answer);
  });

  routes.post('/heartbeat', async (c) => {
    const { runId } = await readJson(c, runBody);
    if (!(await heartbeat(c.env.DB, runId, nowIso()))) throw leaseLost();
    return c.json({ ok: true });
  });

  routes.post('/release', async (c) => {
    const { runId, summary } = await readJson(c, releaseBody);
    if (!(await releaseLease(c.env.DB, runId, summary, nowIso()))) throw leaseLost();
    return c.json({ released: true });
  });

  routes.get('/tasks', async (c) => c.json(await listTasks(c.env.DB)));

  routes.get('/tests/:id', async (c) => {
    const found = await findRobotTest(c.env.DB, parseId(c.req.param('id')));
    if (!found) throw notFound();
    return c.json({ test: found.test });
  });

  routes.get('/tests/:id/files/:kind', async (c) => {
    const kind = c.req.param('kind');
    const testId = parseId(c.req.param('id'));
    if (!isTestFileKind(kind)) throw notFound();
    const found = await findRobotTest(c.env.DB, testId);
    if (!found) throw notFound();
    const key = found.keys[kind];
    const type = found.test.files[kind]?.contentType;
    const object = key ? await c.env.FILES.get(key) : null;
    if (!object || !type) throw notFound();
    return fileResponse(object, kind, type);
  });

  // The print job of an open test: all the robot reads of a test before its
  // evaluation. 404 unless the test waits for its print PDF.
  routes.get('/tests/:id/print-job', async (c) => {
    const found = await findPrintJob(c.env.DB, parseId(c.req.param('id')));
    if (!found) throw notFound();
    return c.json({ job: found.job });
  });

  routes.get('/tests/:id/print-job/file', async (c) => {
    const found = await findPrintJob(c.env.DB, parseId(c.req.param('id')));
    const object = found ? await c.env.FILES.get(found.testFileKey) : null;
    if (!found || !object) throw notFound();
    return fileResponse(object, 'test', found.job.contentType);
  });

  // The test with the QR code. The object is written first, then the row; a
  // refused row write deletes the object, unless the row already names it
  // (two runs that made the same version).
  routes.put('/tests/:id/print', async (c) => {
    const testId = parseId(c.req.param('id'));
    const runId = runIdSchema.safeParse(c.req.header('X-Run-Id'));
    if (!runId.success) throw new ApiError(400, 'invalid', runId.error.issues[0]?.message ?? 'Datele trimise nu sunt valide.');
    const versionText = c.req.header('X-Files-Version') ?? '';
    const version = Number(versionText);
    if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(version)) throw new ApiError(400, 'invalid', 'Versiunea fișierelor nu este validă.');
    const found = await findPrintJob(c.env.DB, testId);
    if (!found) throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), printNotNeeded);
    // The key is shared by every run that made this version: a run without the
    // lease, or one that read an older file, must not touch the object.
    if (found.job.filesVersion !== version) throw printNotNeeded();
    if (!(await holdsLease(c.env.DB, runId.data))) throw leaseLost();
    const file = await readUpload(c, [PDF_TYPE], 'Fișierul trebuie să fie un PDF.');
    const key = printFileKey(found.teacherId, found.schoolYear, found.code, found.testFileName, version);
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: PDF_TYPE } });
    if (!(await savePrint(c.env.DB, testId, runId.data, version, key, nowIso()))) {
      if (!(await printKeyIs(c.env.DB, testId, key))) await deleteFilesQuietly(c.env.FILES, [key]);
      throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), printNotNeeded);
    }
    return c.json({ status: 'ready' });
  });

  // The robot could not make the PDF.
  routes.post('/tests/:id/print-failed', async (c) => {
    const testId = parseId(c.req.param('id'));
    const body = await readJson(c, printFailedBody);
    const status = await failPrint(c.env.DB, testId, body.runId, body.filesVersion, body.error, nowIso());
    if (!status) throw await refusedWrite(c, body.runId, await testExists(c.env.DB, testId), printNotNeeded);
    return c.json({ status });
  });

  // The exercise list of a test, or why the robot could not make it. A list
  // made from files that the teacher replaced meanwhile is no longer needed.
  routes.post('/tests/:id/exercise-list', async (c) => {
    const testId = parseId(c.req.param('id'));
    const body = await readJson(c, exerciseListBody, MAX_ROBOT_BODY_BYTES);
    const now = nowIso();
    let saved: ExerciseListInfo | null;
    if (body.ok) {
      const checked = checkExerciseList(body.exerciseList);
      if (!checked.ok) throw invalidResult();
      saved = await saveExerciseList(c.env.DB, testId, body.runId, body.filesVersion, checked.value, now);
    } else {
      saved = await failExerciseList(c.env.DB, testId, body.runId, body.filesVersion, body.error, now);
    }
    if (!saved) {
      throw await refusedWrite(c, body.runId, await testExists(c.env.DB, testId), () => new ApiError(409, 'not_needed', 'Lista de exerciții nu mai este cerută.'));
    }
    return c.json({ exerciseList: saved });
  });

  // The graded class, anonymized, for the analysis. Only while the test is
  // in evaluation.
  routes.get('/tests/:id/results', async (c) => {
    const results = await findClassResults(c.env.DB, parseId(c.req.param('id')));
    if (!results) throw notFound();
    return c.json({ results });
  });

  // The class analysis, or why the robot could not write it. Accepted only
  // from the run that holds the lease, for a test that waits for it.
  routes.post('/tests/:id/analysis', async (c) => {
    const testId = parseId(c.req.param('id'));
    const body = await readJson(c, analysisBody, MAX_ROBOT_BODY_BYTES);
    const now = nowIso();
    let status: 'ready' | 'requested' | 'failed' | null;
    if (body.ok) {
      const checked = checkClassAnalysis(body.analysis);
      if (!checked.ok) throw invalidResult();
      const robot = { model: body.model ?? null, effort: body.effort ?? null };
      status = (await saveAnalysis(c.env.DB, testId, body.runId, body.version, checked.value, now, robot)) ? 'ready' : null;
    } else {
      status = await failAnalysis(c.env.DB, testId, body.runId, body.error, now);
    }
    if (!status) {
      throw await refusedWrite(c, body.runId, await testExists(c.env.DB, testId), () => new ApiError(409, 'not_needed', 'Analiza clasei nu mai este cerută.'));
    }
    return c.json({ status });
  });

  // The oldest upload that can be graded, now this run's; 204 when none.
  routes.post('/claim', async (c) => {
    const { runId } = await readJson(c, runBody);
    const claimed = await claimSubmission(c.env.DB, runId);
    if (claimed) return c.json(claimed);
    if (!(await holdsLease(c.env.DB, runId))) throw leaseLost();
    return c.body(null, 204);
  });

  // A student's page. Its name stays out: the student may have typed a name in it.
  routes.get('/submissions/:id/files/:fileId', async (c) => {
    const fileId = parseId(c.req.param('fileId'));
    const file = await findRobotFile(c.env.DB, parseId(c.req.param('id')), fileId);
    const object = file ? await c.env.FILES.get(file.key) : null;
    if (!file || !object) throw notFound();
    return fileResponse(object, `file-${fileId}`, file.contentType);
  });

  // A grading, or why the robot could not grade. Accepted only from the run
  // that is grading the upload; otherwise 409 and the robot drops it (spec §11.3).
  routes.post('/submissions/:id/result', async (c) => {
    const submissionId = parseId(c.req.param('id'));
    const body = await readJson(c, resultBody, MAX_ROBOT_BODY_BYTES);
    const takenOver = () => new ApiError(409, 'taken_over', 'Lucrarea nu mai este corectată de această rulare.');
    const current = await findGrading(c.env.DB, submissionId);
    if (!current) throw notFound();
    if (current.status !== 'grading' || current.runId !== body.runId) throw takenOver();
    const now = nowIso();
    if (body.ok) {
      if (!current.exerciseList) throw takenOver();
      const checked = checkGrading(body.result, current.exerciseList);
      if (!checked.ok) throw invalidResult();
      if (!(await saveGrading(c.env.DB, submissionId, body.runId, checked.value, body.result, body.model, now, body.effort ?? null))) {
        throw (await findGrading(c.env.DB, submissionId)) ? takenOver() : notFound();
      }
      return c.json({ status: 'graded' });
    }
    const status = await failGrading(c.env.DB, submissionId, body.runId, body.error, now);
    if (!status) throw (await findGrading(c.env.DB, submissionId)) ? takenOver() : notFound();
    return c.json({ status });
  });

  return routes;
}
