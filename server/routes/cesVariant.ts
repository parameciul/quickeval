import type { Hono } from 'hono';
import {
  baremCheckedBody,
  baremNotesBody,
  cesOffBody,
  type BaremCheckedAnswer,
  type BaremGenerateAnswer,
  type BaremNotesAnswer,
  type CesOffAnswer,
  type CesRemovedAnswer,
  type ExerciseListAnswer,
  type PrintRetryAnswer,
  type TestFileAnswer,
} from '../../shared/api.ts';
import { isTestFileKind, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE, testFileKey, type TestFileKind } from '../../shared/files.ts';
import { acceptExerciseList, retryExerciseList } from '../db/lifecycle.ts';
import {
  confirmBarem,
  needsBarem,
  needsPrint,
  removeCesVariant,
  requestBarem,
  requireTest,
  retryPrint,
  saveBaremNotes,
  saveTestFile,
  setCesOff,
  toCesInfo,
  type TestRecord,
} from '../db/tests.ts';
import type { robotStarter } from '../dispatch.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseTestCode, readJson } from '../http.ts';
import { newUploadToken } from '../secrets.ts';
import { deleteFilesQuietly, fileResponse, readUpload } from '../uploads.ts';

function parseFileKind(raw: string | undefined): TestFileKind {
  if (raw === undefined || !isTestFileKind(raw)) throw notFound();
  return raw;
}

// While the robot grades a CES paper, it reads the CES files: they stay as they
// are until it ends. The class files have their own rule (the test's routes).
// The routes look first, for a quick answer; the writes check it again in
// their SQL, for a paper the robot takes in between.
function refuseWhileCesGrading(test: TestRecord): void {
  if (test.ces.grading > 0) {
    throw new ApiError(409, 'ces_grading', 'Robotul corectează acum o lucrare CES. Poți schimba varianta CES după ce termină.');
  }
}

// /api/admin/tests/:code/ces/…: the CES variant of a test (spec: CES variant),
// its own test file, barem, barem comments, exercise list and print PDF. Like
// the class routes, but a CES barem may change while the class papers are
// graded: the CES papers wait for an active CES barem.
export function cesVariantRoutes(routes: Hono<AppEnv>, startRobot: ReturnType<typeof robotStarter>): void {
  routes.put('/:code/ces/files/:kind', async (c) => {
    const kind = parseFileKind(c.req.param('kind'));
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    refuseWhileCesGrading(test);
    const file = await readUpload(c, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
    const key = testFileKey(teacherId, test.summary.schoolYear, test.summary.code, kind, file.name, file.contentType, 'ces');
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
    const stored = { key, name: file.name, type: file.contentType };
    const saved = await saveTestFile(c.env.DB, teacherId, test.id, kind, stored, nowIso(), newUploadToken(), 'ces');
    if (!saved) {
      // Refused: the new file goes, unless it took the old file's key.
      if (key !== test.ces.files[kind]?.key) await deleteFilesQuietly(c.env.FILES, [key]);
      refuseWhileCesGrading(await requireTest(c.env.DB, teacherId, test.summary.code));
      throw notFound();
    }
    const replaced = saved.replacedKey;
    const stale = [replaced !== key ? replaced : null, saved.clearedPrintKey].filter((k) => k !== null);
    if (stale.length > 0) await deleteFilesQuietly(c.env.FILES, stale);
    // A CES barem during the evaluation: the CES papers that waited for it need
    // their exercise list. A CES test file: its print PDF, or its barem to generate.
    const robotWork =
      kind === 'barem'
        ? saved.status === 'evaluating'
        : (await needsPrint(c.env.DB, test.id, 'ces')) || (await needsBarem(c.env.DB, test.id, 'ces'));
    const robot = robotWork ? await startRobot(c.env) : null;
    return c.json({ file: { name: file.name, type: file.contentType }, robot } satisfies TestFileAnswer);
  });

  routes.get('/:code/ces/files/:kind', async (c) => {
    const kind = parseFileKind(c.req.param('kind'));
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const stored = test.ces.files[kind];
    const object = stored ? await c.env.FILES.get(stored.key) : null;
    if (!stored || !object) throw notFound();
    return fileResponse(object, stored.name, stored.type);
  });

  // "Șterge varianta CES": only while no paper went to grading with it. Its
  // students then get the class test again: during the evaluation, the CES
  // papers that waited for the CES barem go to the robot as class papers.
  routes.delete('/:code/ces', async (c) => {
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    const keys = await removeCesVariant(c.env.DB, teacherId, test.id, nowIso());
    if (keys === null) {
      if (test.ces.papers > 0) {
        throw new ApiError(409, 'ces_papers', 'Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi ștearsă. Poți înlocui fișierele ei.');
      }
      throw new ApiError(409, 'no_ces', 'Testul nu are o variantă CES.');
    }
    await deleteFilesQuietly(c.env.FILES, keys);
    const current = await requireTest(c.env.DB, teacherId, test.summary.code);
    const robot = current.summary.status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ ces: toCesInfo(current.ces), robot } satisfies CesRemovedAnswer);
  });

  // The CES switch (spec: CES switch). Off: the CES students get the class
  // test, and the CES files go; refused once a paper went to grading with the
  // CES variant. During the evaluation, the CES papers that waited go to the
  // robot as class papers. On: the page asks for the CES files again.
  routes.put('/:code/ces/off', async (c) => {
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    const body = await readJson(c, cesOffBody);
    const keys = await setCesOff(c.env.DB, teacherId, test.id, body.off, nowIso());
    if (keys === null) {
      throw new ApiError(409, 'ces_papers', 'Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi oprită. Poți înlocui fișierele ei.');
    }
    if (keys.length > 0) await deleteFilesQuietly(c.env.FILES, keys);
    const current = await requireTest(c.env.DB, teacherId, test.summary.code);
    const robot = body.off && current.summary.status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ ces: toCesInfo(current.ces), robot } satisfies CesOffAnswer);
  });

  // The teacher's comments for the CES barem, read by the robot as part of it.
  routes.put('/:code/ces/barem-notes', async (c) => {
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    refuseWhileCesGrading(test);
    const body = await readJson(c, baremNotesBody);
    const status = await saveBaremNotes(c.env.DB, teacherId, test.id, body.notes, nowIso(), 'ces');
    if (status === null) {
      refuseWhileCesGrading(await requireTest(c.env.DB, teacherId, test.summary.code));
      throw notFound();
    }
    const robot = status === 'evaluating' || (await needsBarem(c.env.DB, test.id, 'ces')) ? await startRobot(c.env) : null;
    return c.json({ baremNotes: body.notes, robot } satisfies BaremNotesAnswer);
  });

  // "Generează baremul" for the CES test: the robot writes a barem for grading
  // only, from the CES test and the class barem.
  routes.post('/:code/ces/barem/generate', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    refuseWhileCesGrading(test);
    if (!(await requestBarem(c.env.DB, c.var.teacher.id, test.id, nowIso(), 'ces'))) {
      refuseWhileCesGrading(await requireTest(c.env.DB, c.var.teacher.id, test.summary.code));
      if (!test.ces.files.test) throw new ApiError(409, 'missing_test_file', 'Încarcă testul CES înainte să generezi baremul CES.');
      throw new ApiError(409, 'not_editable', 'Baremul CES nu se mai poate genera după ce s-a terminat corectarea.');
    }
    const barem = { request: 'requested', unchecked: test.ces.barem.unchecked } as const;
    return c.json({ barem, robot: await startRobot(c.env) } satisfies BaremGenerateAnswer);
  });

  // The teacher checked the generated CES barem. CES papers that waited for it
  // go to the robot now.
  routes.post('/:code/ces/barem/checked', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const body = await readJson(c, baremCheckedBody);
    const status = await confirmBarem(c.env.DB, c.var.teacher.id, test.id, body.filesVersion, nowIso(), 'ces');
    if (status === null) throw new ApiError(409, 'stale', 'Baremul CES s-a schimbat. Reîncarcă pagina.');
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ barem: { request: test.ces.barem.request, unchecked: false }, robot } satisfies BaremCheckedAnswer);
  });

  // The CES test with the QR code: the same link as the class test.
  routes.get('/:code/ces/print', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const object = test.ces.print.status === 'ready' && test.ces.print.key ? await c.env.FILES.get(test.ces.print.key) : null;
    if (!object) throw notFound();
    return fileResponse(object, `${test.summary.code}-CES-cu-cod-qr.pdf`, PDF_TYPE);
  });

  routes.post('/:code/ces/print/retry', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (!(await retryPrint(c.env.DB, c.var.teacher.id, test.id, newUploadToken(), nowIso(), 'ces'))) {
      throw new ApiError(409, 'not_failed', 'Testul CES cu cod QR nu poate fi încercat din nou.');
    }
    return c.json({ print: { status: 'none', fromWord: test.ces.print.fromWord }, robot: await startRobot(c.env) } satisfies PrintRetryAnswer);
  });

  routes.post('/:code/ces/exercise-list/accept', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const status = await acceptExerciseList(c.env.DB, c.var.teacher.id, test.id, nowIso(), 'ces');
    if (status === null) throw new ApiError(409, 'no_problem', 'Lista de exerciții CES nu are nicio problemă.');
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ exerciseList: { status: 'accepted', message: test.ces.exerciseList.message }, robot } satisfies ExerciseListAnswer);
  });

  routes.post('/:code/ces/exercise-list/retry', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const status = await retryExerciseList(c.env.DB, c.var.teacher.id, test.id, nowIso(), 'ces');
    if (status === null) throw new ApiError(409, 'not_failed', 'Lista de exerciții CES nu a eșuat.');
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ exerciseList: { status: 'none', message: null }, robot } satisfies ExerciseListAnswer);
  });
}
