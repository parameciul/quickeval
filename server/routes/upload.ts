import type { Context } from 'hono';
import { Hono } from 'hono';
import { startSessionBody, type UploadSession } from '../../shared/api.ts';
import { MAX_STUDENT_FILES, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE, studentFileKey } from '../../shared/files.ts';
import { isUploadToken } from '../../shared/tests.ts';
import {
  addSubmissionFile,
  confirmSubmission,
  createSubmission,
  deleteSessionFile,
  fileSlots,
  findActiveStudent,
  findSession,
  findSessionFile,
  findStudentSubmission,
  findTestByToken,
  listLinkStudents,
  type LinkTest,
  type SessionRecord,
} from '../db/links.ts';
import { listSubmissionFiles, publicFile } from '../db/submissions.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, isUniqueViolation } from '../errors.ts';
import { nowIso, parseId, readJson, sameOriginWrites } from '../http.ts';
import { newDeviceSecret, randomBase32, sha256Hex } from '../secrets.ts';
import { deleteFilesQuietly, fileResponse, readUpload } from '../uploads.ts';

const SESSION_HEADER = 'X-Upload-Session';

const unknownLink = () => new ApiError(404, 'unknown_link', 'Link greșit. Cere profesorului linkul nou.');
const closed = () => new ApiError(409, 'closed', 'Încărcarea s-a închis.');
const alreadySent = () => new ApiError(409, 'already_submitted', 'Lucrarea ta a fost deja trimisă.');
const otherDevice = () =>
  new ApiError(409, 'other_device', 'Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.');
const tooManyFiles = () => new ApiError(409, 'too_many_files', `Poți trimite cel mult ${MAX_STUDENT_FILES} de fișiere.`);
const fileNotFound = () => new ApiError(404, 'not_found', 'Nu am găsit fișierul.');

// The test behind the link in the URL.
async function linkTest(c: Context<AppEnv>): Promise<LinkTest> {
  const token = c.req.param('token') ?? '';
  const test = isUploadToken(token) ? await findTestByToken(c.env.DB, token) : null;
  if (!test) throw unknownLink();
  return test;
}

// The upload that this phone's secret belongs to, in this test only.
async function session(c: Context<AppEnv>, test: LinkTest): Promise<SessionRecord> {
  const secret = c.req.header(SESSION_HEADER);
  const found = secret ? await findSession(c.env.DB, test.id, await sha256Hex(secret)) : null;
  if (!found) throw new ApiError(401, 'no_session', 'Încărcarea nu mai este valabilă. Alege-ți din nou numele.');
  return found;
}

// A change to an upload: the uploads must be open and the upload not yet sent.
async function openSession(c: Context<AppEnv>): Promise<{ test: LinkTest; current: SessionRecord }> {
  const test = await linkTest(c);
  if (test.status !== 'open') throw closed();
  const current = await session(c, test);
  if (current.status !== 'uploading') throw alreadySent();
  return { test, current };
}

async function sessionView(c: Context<AppEnv>, current: SessionRecord): Promise<UploadSession> {
  const files = await listSubmissionFiles(c.env.DB, current.submissionId);
  return { ...current, files: files.map(publicFile) };
}

// /api/u/<token>: the student app. No login: the token in the link is the key
// to one test, and a secret kept on the phone is the key to one upload.
export function uploadRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites);

  routes.get('/:token', async (c) => {
    const test = await linkTest(c);
    return c.json({
      test: { code: test.code, title: test.title, className: test.className, status: test.status },
      students: test.status === 'open' ? await listLinkStudents(c.env.DB, test) : [],
    });
  });

  // Start an upload for a student, or go on with it on the same phone.
  routes.post('/:token/sessions', async (c) => {
    const test = await linkTest(c);
    if (test.status !== 'open') throw closed();
    const { studentId } = await readJson(c, startSessionBody);
    const student = await findActiveStudent(c.env.DB, test, studentId);
    if (!student) throw new ApiError(404, 'unknown_student', 'Nu am găsit numele tău în listă.');

    const existing = await findStudentSubmission(c.env.DB, test.id, studentId);
    if (existing) {
      if (existing.status !== 'uploading') throw alreadySent();
      const secret = c.req.header(SESSION_HEADER);
      if (!secret || existing.sessionHash !== (await sha256Hex(secret))) throw otherDevice();
      const resumed = { submissionId: existing.id, studentId, studentName: student.fullName, status: existing.status };
      return c.json({ session: await sessionView(c, resumed) });
    }

    const secret = newDeviceSecret();
    let submissionId: number;
    try {
      submissionId = await createSubmission(c.env.DB, test.id, studentId, await sha256Hex(secret), nowIso());
    } catch (err) {
      if (isUniqueViolation(err)) throw otherDevice();
      throw err;
    }
    const created: UploadSession = { submissionId, studentId, studentName: student.fullName, status: 'uploading', files: [] };
    return c.json({ secret, session: created }, 201);
  });

  routes.get('/:token/files', async (c) => {
    const test = await linkTest(c);
    return c.json({ session: await sessionView(c, await session(c, test)) });
  });

  // One photo or PDF per request, at most 20 per student.
  routes.put('/:token/files', async (c) => {
    const { test, current } = await openSession(c);
    const slots = await fileSlots(c.env.DB, current.submissionId);
    if (slots.count >= MAX_STUDENT_FILES) {
      throw tooManyFiles();
    }
    const file = await readUpload(c, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE);
    const key = studentFileKey(
      test.teacherId,
      test.schoolYear,
      test.code,
      current.studentId,
      current.studentName,
      slots.next,
      randomBase32(8),
      file.contentType,
    );
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
    const stored = { key, name: file.name, type: file.contentType, size: file.bytes.byteLength, position: slots.next };
    let id: number | null;
    try {
      id = await addSubmissionFile(c.env.DB, current.submissionId, stored, nowIso());
    } catch (err) {
      await deleteFilesQuietly(c.env.FILES, [key]);
      throw err;
    }
    if (id === null) {
      // The upload changed while the file was on its way: remove the file and say why.
      await deleteFilesQuietly(c.env.FILES, [key]);
      await openSession(c);
      throw tooManyFiles();
    }
    return c.json({ file: { id, name: stored.name, contentType: stored.type, size: stored.size, position: stored.position } }, 201);
  });

  routes.get('/:token/files/:fileId', async (c) => {
    const test = await linkTest(c);
    const current = await session(c, test);
    const file = await findSessionFile(c.env.DB, current.submissionId, parseId(c.req.param('fileId')));
    const object = file ? await c.env.FILES.get(file.key) : null;
    if (!file || !object) throw fileNotFound();
    return fileResponse(object, file.name, file.type);
  });

  routes.delete('/:token/files/:fileId', async (c) => {
    const { current } = await openSession(c);
    const fileId = parseId(c.req.param('fileId'));
    const file = await findSessionFile(c.env.DB, current.submissionId, fileId);
    if (!file) throw fileNotFound();
    if (!(await deleteSessionFile(c.env.DB, current.submissionId, fileId))) {
      await openSession(c);
      throw fileNotFound();
    }
    await deleteFilesQuietly(c.env.FILES, [file.key]);
    return c.json({ deleted: true });
  });

  // "Am trimis tot": uploading → submitted. Needs at least one file.
  routes.post('/:token/confirm', async (c) => {
    const { current } = await openSession(c);
    const fileCount = await confirmSubmission(c.env.DB, current.submissionId, nowIso());
    if (fileCount === null) {
      // openSession says why when the test closed or the upload was sent meanwhile.
      await openSession(c);
      throw new ApiError(409, 'no_files', 'Adaugă cel puțin o poză sau un PDF.');
    }
    return c.json({ status: 'submitted', fileCount });
  });

  return routes;
}
