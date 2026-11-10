import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QUICK_TRY_STUDENT, QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import { addEvaluation } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// GET /api/try/<token>/result: the page the try's student would see, the same
// view as the student app's result page, open without publishing.

let api: TestApi;
let token: string;
let code: string;
let submissionId: number;

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeEach(async () => {
  api = await startTestApi({ app: { verifyTurnstile: async () => true } });
  ({ token, code } = (await api.request('POST', '/api/try', { turnstileToken: 'ok' })).body);
  submissionId = (await api.request('GET', `/api/try/${token}`)).body.submissionId;
});

afterEach(async () => {
  await api.dispose();
});

describe('the student result of a try', () => {
  it('has no grading before the paper is graded', async () => {
    const res = await api.request('GET', `/api/try/${token}/result`);
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ testCode: code, testTitle: QUICK_TRY_TITLE, studentName: QUICK_TRY_STUDENT, files: [], evaluation: null });
  });

  it("shows the graded paper and its pages, with nothing that is for the teacher only", async () => {
    await api.fetch(`/api/try/${token}/paper`, { method: 'PUT', body: jpeg(), headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': 'p1.jpg' } });
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = '2026-10-07T09:00:00.000Z' WHERE id = ?").bind(submissionId).run();
    await addEvaluation(api, submissionId, { grade: 8, items: [{ needsReview: true }] });
    const { result } = (await api.request('GET', `/api/try/${token}/result`)).body;
    expect(result.status).toBe('graded');
    expect(result.files).toHaveLength(1);
    expect(result.evaluation.grade).toBe(8);
    expect(Object.keys(result.evaluation.items[0]).sort()).toEqual(['comment', 'exerciseId', 'label', 'maxPoints', 'points', 'studentAnswer']);
    const page = await api.fetch(`/api/try/${token}/paper/${result.files[0].id}`);
    expect(page.status).toBe(200);
  });

  it('is refused for an expired try', async () => {
    await api.db.prepare("UPDATE quick_tries SET expires_at = '2020-01-01T00:00:00.000Z'").run();
    expect((await api.request('GET', `/api/try/${token}/result`)).status).toBe(410);
  });
});
