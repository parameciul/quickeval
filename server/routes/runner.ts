import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ExerciseListInfo } from '../../shared/api.ts';
import { DOCX_TYPE, generatedBaremKey, isTestFileKind, PDF_TYPE, printFileKey, type TestVariant } from '../../shared/files.ts';
import {
  analysisBody,
  baremFailedBody,
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
import { checkClassAnalysis, checkExerciseList, checkGrading, type FoundSubject, subjectOf } from '../../shared/schemas.ts';
import { robotAuth } from '../auth/robotAuth.ts';
import {
  baremKeyIs,
  claimSubmission,
  failAnalysis,
  failBaremJob,
  failExerciseList,
  failGrading,
  failPrint,
  findBaremJob,
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
  saveGeneratedBarem,
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
const baremNotNeeded = () => new ApiError(409, 'not_needed', 'Baremul nu mai este cerut.');
const printNotNeeded = () => new ApiError(409, 'not_needed', 'Testul cu cod QR nu mai este cerut.');

// ?variant=ces names the CES variant of a test (its own files, barem, list and
// print PDF); none names the class test, as an older robot asks.
function parseVariant(raw: string | undefined): TestVariant {
  if (raw === undefined) return 'class';
  if (raw === 'ces') return 'ces';
  throw notFound();
}

// The subject that the robot sends with a generated barem: X-Subject (a value)
// and X-Subject-Name (URI-encoded). Null when there is none (an older robot) or
// it cannot be read: the barem is still saved.
function subjectHeaders(c: Context<AppEnv>): FoundSubject | null {
  let name = '';
  try {
    name = decodeURIComponent(c.req.header('X-Subject-Name') ?? '');
  } catch {
    return null;
  }
  return subjectOf({ subject: c.req.header('X-Subject'), subjectName: name });
}

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
    const found = await findRobotTest(c.env.DB, parseId(c.req.param('id')), parseVariant(c.req.query('variant')));
    if (!found) throw notFound();
    return c.json({ test: found.test });
  });

  routes.get('/tests/:id/files/:kind', async (c) => {
    const kind = c.req.param('kind');
    const testId = parseId(c.req.param('id'));
    if (!isTestFileKind(kind)) throw notFound();
    const found = await findRobotTest(c.env.DB, testId, parseVariant(c.req.query('variant')));
    if (!found) throw notFound();
    const key = found.keys[kind];
    const type = found.test.files[kind]?.contentType;
    const object = key ? await c.env.FILES.get(key) : null;
    if (!object || !type) throw notFound();
    return fileResponse(object, kind, type);
  });

  // The print job of a draft or open test: with the barem job, all the robot
  // reads of a test before its evaluation. 404 unless the test waits for its
  // print PDF.
  routes.get('/tests/:id/print-job', async (c) => {
    const found = await findPrintJob(c.env.DB, parseId(c.req.param('id')), parseVariant(c.req.query('variant')));
    if (!found) throw notFound();
    return c.json({ job: found.job });
  });

  routes.get('/tests/:id/print-job/file', async (c) => {
    const found = await findPrintJob(c.env.DB, parseId(c.req.param('id')), parseVariant(c.req.query('variant')));
    const object = found ? await c.env.FILES.get(found.testFileKey) : null;
    if (!found || !object) throw notFound();
    return fileResponse(object, 'test', found.job.contentType);
  });

  // The test with the QR code. The object is written first, then the row; a
  // refused row write deletes the object, unless the row already names it
  // (two runs that made the same version).
  routes.put('/tests/:id/print', async (c) => {
    const testId = parseId(c.req.param('id'));
    const variant = parseVariant(c.req.query('variant'));
    const runId = runIdSchema.safeParse(c.req.header('X-Run-Id'));
    if (!runId.success) throw new ApiError(400, 'invalid', runId.error.issues[0]?.message ?? 'Datele trimise nu sunt valide.');
    const versionText = c.req.header('X-Files-Version') ?? '';
    const version = Number(versionText);
    if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(version)) throw new ApiError(400, 'invalid', 'Versiunea fișierelor nu este validă.');
    const found = await findPrintJob(c.env.DB, testId, variant);
    if (!found) throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), printNotNeeded);
    // The key is shared by every run that made this version: a run without the
    // lease, or one that read an older file, must not touch the object.
    if (found.job.filesVersion !== version) throw printNotNeeded();
    // An older robot names no creation time: the test as it is now.
    const createdAt = c.req.header('X-Created-At') ?? null;
    if (createdAt !== null && createdAt !== found.job.createdAt) throw printNotNeeded();
    if (!(await holdsLease(c.env.DB, runId.data))) throw leaseLost();
    const file = await readUpload(c, [PDF_TYPE], 'Fișierul trebuie să fie un PDF.');
    const key = printFileKey(found.teacherId, found.schoolYear, found.code, found.testFileName, version, variant);
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: PDF_TYPE } });
    if (!(await savePrint(c.env.DB, testId, runId.data, version, createdAt, key, nowIso(), variant))) {
      if (!(await printKeyIs(c.env.DB, testId, key, variant))) await deleteFilesQuietly(c.env.FILES, [key]);
      throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), printNotNeeded);
    }
    return c.json({ status: 'ready' });
  });

  // The robot could not make the PDF.
  routes.post('/tests/:id/print-failed', async (c) => {
    const testId = parseId(c.req.param('id'));
    const body = await readJson(c, printFailedBody);
    const variant = parseVariant(c.req.query('variant'));
    const status = await failPrint(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, body.error, nowIso(), variant);
    if (!status) throw await refusedWrite(c, body.runId, await testExists(c.env.DB, testId), printNotNeeded);
    return c.json({ status });
  });

  // The barem job of a draft or open test: 404 unless the test waits for its
  // generated barem.
  routes.get('/tests/:id/barem-job', async (c) => {
    const found = await findBaremJob(c.env.DB, parseId(c.req.param('id')), parseVariant(c.req.query('variant')));
    if (!found) throw notFound();
    return c.json({ job: found.job });
  });

  routes.get('/tests/:id/barem-job/file', async (c) => {
    const found = await findBaremJob(c.env.DB, parseId(c.req.param('id')), parseVariant(c.req.query('variant')));
    const object = found ? await c.env.FILES.get(found.testFileKey) : null;
    if (!found || !object) throw notFound();
    return fileResponse(object, 'test', found.job.contentType);
  });

  // The class barem, for a CES barem job only: the CES barem reuses its
  // exercise names and points.
  routes.get('/tests/:id/barem-job/class-barem', async (c) => {
    const found = await findBaremJob(c.env.DB, parseId(c.req.param('id')), 'ces');
    const type = found?.job.classBarem?.contentType;
    const object = found?.classBaremKey ? await c.env.FILES.get(found.classBaremKey) : null;
    if (!found || !object || !type) throw notFound();
    return fileResponse(object, 'barem', type);
  });

  // The generated barem, a Word file. Like the print PDF, the object is
  // written first, then the row; a refused row write deletes the object, unless
  // the row already names it. The barem it replaces is deleted after the save.
  routes.put('/tests/:id/barem', async (c) => {
    const testId = parseId(c.req.param('id'));
    const variant = parseVariant(c.req.query('variant'));
    const runId = runIdSchema.safeParse(c.req.header('X-Run-Id'));
    if (!runId.success) throw new ApiError(400, 'invalid', runId.error.issues[0]?.message ?? 'Datele trimise nu sunt valide.');
    const versionText = c.req.header('X-Files-Version') ?? '';
    const version = Number(versionText);
    if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(version)) throw new ApiError(400, 'invalid', 'Versiunea fișierelor nu este validă.');
    const found = await findBaremJob(c.env.DB, testId, variant);
    if (!found) throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), baremNotNeeded);
    // The key is shared by every run that made this version: a run without the
    // lease, or one that read an older file, must not touch the object.
    if (found.job.filesVersion !== version) throw baremNotNeeded();
    const createdAt = c.req.header('X-Created-At') ?? null;
    if (createdAt !== null && createdAt !== found.job.createdAt) throw baremNotNeeded();
    if (!(await holdsLease(c.env.DB, runId.data))) throw leaseLost();
    const file = await readUpload(c, [DOCX_TYPE], 'Fișierul trebuie să fie un document Word.');
    const key = generatedBaremKey(found.teacherId, found.schoolYear, found.code, version, variant);
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: DOCX_TYPE } });
    const name = variant === 'ces' ? `${found.code} - barem CES generat.docx` : `${found.code} - barem generat.docx`;
    const saved = await saveGeneratedBarem(c.env.DB, testId, runId.data, version, createdAt, key, name, nowIso(), variant, subjectHeaders(c));
    if (!saved) {
      if (!(await baremKeyIs(c.env.DB, testId, key, variant))) await deleteFilesQuietly(c.env.FILES, [key]);
      throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), baremNotNeeded);
    }
    if (saved.oldKey && saved.oldKey !== key) await deleteFilesQuietly(c.env.FILES, [saved.oldKey]);
    return c.json({ status: 'ready' });
  });

  // The robot could not write the barem.
  routes.post('/tests/:id/barem-failed', async (c) => {
    const testId = parseId(c.req.param('id'));
    const body = await readJson(c, baremFailedBody);
    const variant = parseVariant(c.req.query('variant'));
    const status = await failBaremJob(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, body.error, nowIso(), variant);
    if (!status) throw await refusedWrite(c, body.runId, await testExists(c.env.DB, testId), baremNotNeeded);
    return c.json({ status });
  });

  // The exercise list of a test, or why the robot could not make it. A list
  // made from files that the teacher replaced meanwhile is no longer needed.
  routes.post('/tests/:id/exercise-list', async (c) => {
    const testId = parseId(c.req.param('id'));
    const variant = parseVariant(c.req.query('variant'));
    const body = await readJson(c, exerciseListBody, MAX_ROBOT_BODY_BYTES);
    const now = nowIso();
    let saved: ExerciseListInfo | null;
    if (body.ok) {
      const checked = checkExerciseList(body.exerciseList);
      if (!checked.ok) throw invalidResult();
      saved = await saveExerciseList(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, checked.value, now, variant);
    } else {
      saved = await failExerciseList(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, body.error, now, variant);
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
    // An older robot names no start time: the upload as it is now.
    const startedAt = body.startedAt ?? current.startedAt;
    if (startedAt !== current.startedAt) throw takenOver();
    const now = nowIso();
    if (body.ok) {
      if (!current.exerciseList) throw takenOver();
      const checked = checkGrading(body.result, current.exerciseList, current.subject);
      if (!checked.ok) throw invalidResult();
      if (!(await saveGrading(c.env.DB, submissionId, body.runId, startedAt, checked.value, body.result, body.model, now, body.effort ?? null))) {
        throw (await findGrading(c.env.DB, submissionId)) ? takenOver() : notFound();
      }
      return c.json({ status: 'graded' });
    }
    const status = await failGrading(c.env.DB, submissionId, body.runId, startedAt, body.error, now);
    if (!status) throw (await findGrading(c.env.DB, submissionId)) ? takenOver() : notFound();
    return c.json({ status });
  });

  return routes;
}
