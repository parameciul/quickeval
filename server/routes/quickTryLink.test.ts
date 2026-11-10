import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { NEEDS_PRINT } from '../db/runner.ts';
import { addEvaluation } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// /api/try/<token>: the try's own link, which serves the teacher API's routes
// for its guest teacher behind an allow-list.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let token: string;
let code: string;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const jpeg = (text = 'photo') => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(text)]);

async function newTry(): Promise<{ token: string; code: string }> {
  const res = await api.request('POST', '/api/try', { turnstileToken: 'ok' }, { 'CF-Connecting-IP': '203.0.113.5' });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body;
}

const put = (path: string, bytes: BodyInit, type: string, name = 'fisier') =>
  api.fetch(path, { method: 'PUT', body: bytes, headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) } });
const putPaper = (bytes: BodyInit = jpeg()) => put(`/api/try/${token}/paper`, bytes, 'image/jpeg', 'pagina1.jpg');
const putTestFile = (kind: 'test' | 'barem') => put(`/api/try/${token}/tests/${code}/files/${kind}`, pdf(kind), PDF_TYPE, `${kind}.pdf`);
const start = (body: unknown = {}) => api.request('POST', `/api/try/${token}/start`, body);
const paperStatus = async () =>
  (await api.db.prepare("SELECT s.status FROM submissions s JOIN tests t ON t.id = s.test_id WHERE t.quick_try = 1").first<{ status: string }>())!.status;

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { dispatchRobot, verifyTurnstile: async () => true } });
  ({ token, code } = await newTry());
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/try/<token>', () => {
  it('answers with the code, the paper and the expiry', async () => {
    const res = await api.request('GET', `/api/try/${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code, submissionId: expect.any(Number), expiresAt: expect.any(String), expired: false });
  });

  it('answers 404 for an unknown or malformed token', async () => {
    expect((await api.request('GET', `/api/try/${'a'.repeat(32)}`)).body.error).toBe('unknown_try');
    expect((await api.request('GET', '/api/try/abc')).body.error).toBe('unknown_try');
    expect((await api.request('GET', `/api/try/abc/paper`)).status).toBe(404);
  });

  it('says an expired try expired, and refuses everything else with 410', async () => {
    await api.db.prepare("UPDATE quick_tries SET expires_at = '2020-01-01T00:00:00.000Z'").run();
    expect((await api.request('GET', `/api/try/${token}`)).body.expired).toBe(true);
    for (const res of [
      await api.request('GET', `/api/try/${token}/paper`),
      await api.request('GET', `/api/try/${token}/tests/${code}`),
      await start(),
      await putPaper(),
    ]) {
      expect(res.status).toBe(410);
    }
  });
});

describe('the paper', () => {
  it('takes pages, lists them, serves them and deletes them', async () => {
    const added = await putPaper(jpeg('one'));
    expect(added.status).toBe(201);
    const file = ((await added.json()) as { file: { id: number } }).file;
    const listed = await api.request('GET', `/api/try/${token}/paper`);
    expect(listed.body.files).toEqual([{ id: file.id, name: 'pagina1.jpg', contentType: 'image/jpeg', size: 7, position: 1 }]);
    const served = await api.fetch(`/api/try/${token}/paper/${file.id}`);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(jpeg('one'));
    expect((await api.request('DELETE', `/api/try/${token}/paper/${file.id}`)).body).toEqual({ deleted: true });
    expect((await api.request('GET', `/api/try/${token}/paper`)).body.files).toEqual([]);
  });

  it('refuses a file that is not a photo or a PDF', async () => {
    const res = await put(`/api/try/${token}/paper`, new TextEncoder().encode('text'), 'text/plain');
    expect(res.status).toBe(415);
  });

  it('is closed once the paper went to grading', async () => {
    await putTestFile('test');
    await putTestFile('barem');
    await putPaper();
    expect((await start()).status).toBe(200);
    const res = await putPaper();
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('paper_sent');
  });

  it("is not another try's", async () => {
    const added = (await (await putPaper()).json()) as { file: { id: number } };
    const other = await newTry();
    expect((await api.fetch(`/api/try/${other.token}/paper/${added.file.id}`)).status).toBe(404);
  });
});

describe('the teacher API through the link', () => {
  it("reads and changes the try's test, and makes no print job", async () => {
    const res = await api.request('GET', `/api/try/${token}/tests/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.test).toMatchObject({ code, title: 'Încercare rapidă', status: 'open' });
    const saved = await putTestFile('test');
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { robot: unknown }).robot).toBeNull();
    expect((await api.db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_PRINT}`).all()).results).toEqual([]);
    expect((await api.fetch(`/api/try/${token}/tests/${code}/files/test`)).status).toBe(200);
  });

  it("renames the try's test", async () => {
    const res = await api.request('PATCH', `/api/try/${token}/tests/${code}`, { title: 'Test funcții 9B' });
    expect(res.status).toBe(200);
    expect((await api.request('GET', `/api/try/${token}/tests/${code}`)).body.test.title).toBe('Test funcții 9B');
  });

  it("never reaches a real teacher's test", async () => {
    const other = await realTeacherTest();
    expect((await api.request('GET', `/api/try/${token}/tests/${other}`)).status).toBe(404);
  });

  it('refuses every route that is not on the allow-list', async () => {
    const submissionId = (await api.request('GET', `/api/try/${token}`)).body.submissionId as number;
    const refused: [string, string][] = [
      ['GET', `/tests`],
      ['POST', `/tests`],
      ['DELETE', `/tests/${code}`],
      ['POST', `/tests/${code}/evaluate`],
      ['POST', `/tests/${code}/regrade`],
      ['POST', `/tests/${code}/exercise-list/retry`],
      ['POST', `/tests/${code}/analysis/regenerate`],
      ['POST', `/tests/${code}/results/open`],
      ['GET', `/tests/${code}/report`],
      ['GET', `/tests/${code}/print`],
      ['PUT', `/tests/${code}/barem-notes`],
      ['POST', `/tests/${code}/finish`],
      ['POST', `/tests/${code}/archive`],
      ['GET', `/tests/${code}/ces/files/test`],
      ['GET', `/submissions/${submissionId}/result-link`],
      ['POST', `/submissions/${submissionId}/reset`],
      ['POST', `/submissions/${submissionId}/regrade`],
      ['POST', `/submissions/${submissionId}/retry`],
      ['POST', `/submissions/${submissionId}/results/open`],
    ];
    for (const [method, path] of refused) {
      const res = await api.request(method, `/api/try/${token}${path}`, method === 'GET' ? undefined : {});
      expect([method, path, res.status]).toEqual([method, path, 404]);
    }
  });
});

describe('the review through the link', () => {
  it('reads the graded paper and takes a correction, without asking for a class analysis', async () => {
    const submissionId = (await api.request('GET', `/api/try/${token}`)).body.submissionId as number;
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE quick_try = 1").run();
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = '2026-10-07T09:00:00.000Z' WHERE id = ?").bind(submissionId).run();
    await addEvaluation(api, submissionId, { items: [{ needsReview: true }] });
    const read = await api.request('GET', `/api/try/${token}/submissions/${submissionId}`);
    expect(read.status).toBe(200);
    const itemId = read.body.submission.evaluation.items[0].id as number;
    const corrected = await api.request('PATCH', `/api/try/${token}/submissions/${submissionId}/items/${itemId}`, {
      gradedAt: '2026-10-07T09:00:00.000Z',
      points: 0.5,
      reviewed: true,
    });
    expect(corrected.status).toBe(200);
    expect(corrected.body.submission.evaluation.items[0].points).toBe(0.5);
    const analysis = await api.db.prepare('SELECT analysis_status FROM tests WHERE quick_try = 1').first<{ analysis_status: string }>();
    expect(analysis!.analysis_status).toBe('none');
    expect(dispatchRobot).not.toHaveBeenCalled();
    const other = await newTry();
    expect((await api.request('GET', `/api/try/${other.token}/submissions/${submissionId}`)).status).toBe(404);
  });
});

describe('POST /api/try/<token>/start', () => {
  it('sends the paper to grading and starts the robot', async () => {
    await putTestFile('test');
    await putTestFile('barem');
    await putPaper();
    const res = await start();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'evaluating', evaluationAt: null, robot: 'dispatched' });
    expect(await paperStatus()).toBe('submitted');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('says what is missing', async () => {
    expect((await start()).body.error).toBe('missing_test_file');
    await putTestFile('test');
    expect((await start()).body.error).toBe('missing_barem');
    await putTestFile('barem');
    expect((await start()).body.error).toBe('no_uploads');
  });

  it("counts a robot's barem as checked when the page names its version", async () => {
    await putTestFile('test');
    const asked = await api.request('POST', `/api/try/${token}/tests/${code}/barem/generate`);
    expect(asked.body.barem.request).toBe('requested');
    // The robot saves its barem (as saveGeneratedBarem does): unchecked.
    await api.db
      .prepare(
        `UPDATE tests SET barem_file_key = 'k', barem_file_name = 'barem.docx', barem_file_type = 'application/pdf',
           barem_unchecked = 1, barem_request = 'none', files_version = files_version + 1 WHERE quick_try = 1`,
      )
      .run();
    await putPaper();
    expect((await start()).body.error).toBe('barem_unchecked');
    const version = (await api.request('GET', `/api/try/${token}/tests/${code}`)).body.test.filesVersion as number;
    expect((await start({ filesVersion: version + 5 })).body.error).toBe('barem_unchecked');
    const res = await start({ filesVersion: version });
    expect(res.body.status).toBe('evaluating');
  });
});

// The code of a test of the real teacher of the test database.
async function realTeacherTest(): Promise<string> {
  const cls = await api.db
    .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '6E2', 2026, '2026-10-06T08:00:00.000Z') RETURNING id")
    .bind(api.teacherId)
    .first<{ id: number }>();
  await api.db
    .prepare(
      `INSERT INTO tests (teacher_id, class_id, number, code, title, created_at, updated_at)
       VALUES (?, ?, 1, '6E2-26T1', 'Test', '2026-10-06T08:00:00.000Z', '2026-10-06T08:00:00.000Z')`,
    )
    .bind(api.teacherId, cls!.id)
    .run();
  return '6E2-26T1';
}
