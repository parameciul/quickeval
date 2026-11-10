import { Hono, type Context, type MiddlewareHandler } from 'hono';
import {
  quickTryCreateBody,
  quickTryStartBody,
  type EvaluationStart,
  type QuickTryAvailability,
  type QuickTryCreated,
  type QuickTryInfo,
  type SubmissionFile,
} from '../../shared/api.ts';
import { MAX_STUDENT_FILES, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE, studentFileKey } from '../../shared/files.ts';
import { isQuickTryToken, QUICK_TRY_STUDENT } from '../../shared/quickTry.ts';
import { optionalTeacher } from '../auth/teacherAuth.ts';
import { startEvaluationNow } from '../db/lifecycle.ts';
import { addSubmissionFile, deleteSessionFile, fileSlots, findSessionFile } from '../db/links.ts';
import { createQuickTry, dailyLimitReached, findQuickTry, guestTeacher, listPaperFiles } from '../db/quickTry.ts';
import { findResultBySubmission } from '../db/results.ts';
import { confirmBarem, requireTest } from '../db/tests.ts';
import { robotStarter } from '../dispatch.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError } from '../errors.ts';
import { clientIpKey, nowIso, parseId, readJson, sameOriginWrites } from '../http.ts';
import { newDeviceSecret, newResultToken, randomBase32, sha256Hex } from '../secrets.ts';
import { verifyTurnstile } from '../turnstile.ts';
import { deleteFilesQuietly, fileResponse, readUpload } from '../uploads.ts';
import { submissionRoutes } from './submissions.ts';
import { evaluationBlocker, testRoutes } from './tests.ts';

// The message for every used-up limit: a new account grades a whole class
// test for free, so that is the way on (never "unlimited").
const LIMIT_MESSAGE =
  'Limita de încercări gratuite pentru azi a fost atinsă. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.';

const unknownTry = () => new ApiError(404, 'unknown_try', 'Linkul nu este bun. Verifică dacă l-ai copiat întreg.');
const expiredTry = () => new ApiError(410, 'expired', 'Încercarea a expirat. Poți face o încercare nouă de pe pagina principală.');
const tooManyFiles = () => new ApiError(409, 'too_many_files', `Poți trimite cel mult ${MAX_STUDENT_FILES} de fișiere.`);
const paperClosed = () => new ApiError(409, 'paper_sent', 'Lucrarea a plecat deja la corectare.');
const fileNotFound = () => new ApiError(404, 'not_found', 'Nu am găsit fișierul.');

// What a try's link may call of the teacher API, after /api/try/<token>:
// reading the test and its files, replacing the test or the barem, asking for
// a barem, "Folosește oricum", and the review of the one paper. Everything
// else of the teacher API answers 404.
const ALLOWED: readonly [string, RegExp][] = [
  ['GET', /^\/tests\/[^/]+$/],
  ['GET', /^\/tests\/[^/]+\/files\/(test|barem)$/],
  ['PUT', /^\/tests\/[^/]+\/files\/(test|barem)$/],
  ['POST', /^\/tests\/[^/]+\/barem\/generate$/],
  ['POST', /^\/tests\/[^/]+\/exercise-list\/accept$/],
  ['GET', /^\/submissions\/\d+$/],
  ['GET', /^\/submissions\/\d+\/files\/\d+$/],
  ['PATCH', /^\/submissions\/\d+\/items\/\d+$/],
  ['PATCH', /^\/submissions\/\d+\/evaluation$/],
];

// The try of the link: c.var.quickTry, and its guest teacher in c.var.teacher,
// so the teacher API's own routes serve it. An expired try answers 410.
async function loadTry(c: Context<AppEnv>): Promise<{ expired: boolean }> {
  const token = c.req.param('token') ?? '';
  const found = isQuickTryToken(token) ? await findQuickTry(c.env.DB, await sha256Hex(token)) : null;
  if (!found) throw unknownTry();
  c.set('quickTry', found);
  c.set('teacher', guestTeacher(found.teacherId));
  return { expired: nowIso() >= found.expiresAt };
}

const tryAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  if ((await loadTry(c)).expired) throw expiredTry();
  await next();
};

const allowList: MiddlewareHandler<AppEnv> = async (c, next) => {
  const rest = c.req.path.replace(/^\/api\/try\/[^/]+/, '');
  if (!ALLOWED.some(([method, path]) => method === c.req.method && path.test(rest))) {
    throw new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');
  }
  await next();
};

// /api/try: Quick Try, one free grading without an account (spec
// docs/superpowers/specs/2026-11-09-quick-try-design.md).
export function quickTryRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const verify = options.verifyTurnstile ?? ((env, token, ip) => verifyTurnstile(env, token, ip));
  const startRobot = robotStarter(options);
  routes.use('*', sameOriginWrites);
  // No promoteDue here: a try never schedules (evaluate and schedule are not
  // on the allow-list). A route that schedules must add it first.

  routes.get('/availability', async (c) => {
    const teacher = await optionalTeacher(c);
    const admin = teacher?.role === 'admin';
    const answer: QuickTryAvailability = { dailyLimitReached: !admin && (await dailyLimitReached(c.env.DB, nowIso())), admin };
    return c.json(answer);
  });

  // A new try. An administrator skips Turnstile and the limits; everyone else
  // needs a Turnstile answer that Cloudflare accepts.
  routes.post('/', async (c) => {
    const body = await readJson(c, quickTryCreateBody, 8192);
    const teacher = await optionalTeacher(c);
    const admin = teacher?.role === 'admin';
    const ip = c.req.header('CF-Connecting-IP') ?? '';
    if (!admin && !(body.turnstileToken && (await verify(c.env, body.turnstileToken, ip)))) {
      throw new ApiError(403, 'not_human', 'Nu am putut verifica încercarea. Reîncarcă pagina și încearcă din nou.');
    }
    const token = randomBase32(32);
    const made = await createQuickTry(c.env.DB, {
      tokenHash: await sha256Hex(token),
      ipHash: await sha256Hex(clientIpKey(c)),
      byAdmin: admin,
      email: `try-${randomBase32(20)}@quick-try.invalid`,
      sessionHash: await sha256Hex(newDeviceSecret()),
      resultToken: newResultToken(),
      now: nowIso(),
    });
    if (made === 'ip_limit') throw new ApiError(429, 'quick_try_ip_limit', LIMIT_MESSAGE);
    if (made === 'daily_limit') throw new ApiError(429, 'quick_try_daily_limit', LIMIT_MESSAGE);
    return c.json({ token, code: made.code } satisfies QuickTryCreated, 201);
  });

  // The try's page reads this first. An expired try still answers here, so
  // the page can say so.
  routes.get('/:token', async (c) => {
    const { expired } = await loadTry(c);
    const found = c.var.quickTry;
    const answer: QuickTryInfo = { code: found.code, submissionId: found.submissionId, expiresAt: found.expiresAt, expired };
    return c.json(answer);
  });

  routes.use('/:token/*', tryAccess);

  // The student's pages, as the student app takes them: one photo or PDF per
  // request, at most MAX_STUDENT_FILES, only before the paper goes to grading.
  routes.get('/:token/paper', async (c) => {
    const files: SubmissionFile[] = await listPaperFiles(c.env.DB, c.var.quickTry.submissionId);
    return c.json({ files });
  });

  routes.put('/:token/paper', async (c) => {
    const found = c.var.quickTry;
    const slots = await fileSlots(c.env.DB, found.submissionId);
    if (slots.count >= MAX_STUDENT_FILES) throw tooManyFiles();
    const file = await readUpload(c, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE);
    const key = studentFileKey(
      found.teacherId,
      found.schoolYear,
      found.code,
      found.studentId,
      QUICK_TRY_STUDENT,
      slots.next,
      randomBase32(8),
      file.contentType,
    );
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
    const stored = { key, name: file.name, type: file.contentType, size: file.bytes.byteLength, position: slots.next };
    let id: number | null;
    try {
      id = await addSubmissionFile(c.env.DB, found.submissionId, found.sessionHash, stored, nowIso());
    } catch (err) {
      await deleteFilesQuietly(c.env.FILES, [key]);
      throw err;
    }
    if (id === null) {
      await deleteFilesQuietly(c.env.FILES, [key]);
      throw (await fileSlots(c.env.DB, found.submissionId)).count >= MAX_STUDENT_FILES ? tooManyFiles() : paperClosed();
    }
    const answer: SubmissionFile = { id, name: stored.name, contentType: stored.type, size: stored.size, position: stored.position };
    return c.json({ file: answer }, 201);
  });

  routes.get('/:token/paper/:fileId', async (c) => {
    const file = await findSessionFile(c.env.DB, c.var.quickTry.submissionId, parseId(c.req.param('fileId')));
    const object = file ? await c.env.FILES.get(file.key) : null;
    if (!file || !object) throw fileNotFound();
    return fileResponse(object, file.name, file.type);
  });

  routes.delete('/:token/paper/:fileId', async (c) => {
    const found = c.var.quickTry;
    const fileId = parseId(c.req.param('fileId'));
    const file = await findSessionFile(c.env.DB, found.submissionId, fileId);
    if (!file) throw fileNotFound();
    if (!(await deleteSessionFile(c.env.DB, found.submissionId, found.sessionHash, fileId, nowIso()))) throw paperClosed();
    await deleteFilesQuietly(c.env.FILES, [file.key]);
    return c.json({ deleted: true });
  });

  // The page the try's student would see: the student app's result view,
  // open without publishing.
  routes.get('/:token/result', async (c) => {
    const result = await findResultBySubmission(c.env.DB, c.var.quickTry.submissionId);
    if (!result) throw unknownTry();
    return c.json({ result });
  });

  // "Pornește corectarea": a barem the robot made counts as checked (she
  // downloaded and read it), then the paper goes to grading.
  routes.post('/:token/start', async (c) => {
    const found = c.var.quickTry;
    const body = await readJson(c, quickTryStartBody);
    const test = await requireTest(c.env.DB, found.teacherId, found.code);
    const now = nowIso();
    if (test.barem.unchecked && body.filesVersion !== undefined) {
      await confirmBarem(c.env.DB, found.teacherId, found.testId, body.filesVersion, now);
    }
    const status = await startEvaluationNow(c.env.DB, found.teacherId, found.testId, now);
    if (status === null) throw await evaluationBlocker(c.env.DB, found.teacherId, found.code, true);
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ status, evaluationAt: null, robot } satisfies EvaluationStart);
  });

  routes.use('/:token/tests/*', allowList);
  routes.use('/:token/submissions/*', allowList);
  routes.route('/:token/tests', testRoutes(options));
  routes.route('/:token/submissions', submissionRoutes(options));

  return routes;
}
