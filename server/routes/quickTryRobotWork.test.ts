import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';
import { addTestFiles, makeClass, makeTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// One try makes a bounded amount of robot work: one barem generation, and at
// most QUICK_TRY_FILE_CHANGES changes of the test and barem files.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let token: string;
let code: string;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const putFile = (kind: 'test' | 'barem', base = `/api/try/${token}`, target = code) =>
  api.fetch(`${base}/tests/${target}/files/${kind}`, {
    method: 'PUT',
    body: pdf(kind),
    headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': `${kind}.pdf` },
  });
const generate = () => api.request('POST', `/api/try/${token}/tests/${code}/barem/generate`);
const row = () =>
  api.db.prepare('SELECT files_version, barem_request FROM tests WHERE quick_try = 1').first<{ files_version: number; barem_request: string }>();

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ app: { dispatchRobot, verifyTurnstile: async () => true } });
  const made = await api.request('POST', '/api/try', { turnstileToken: 'ok' });
  ({ token, code } = made.body);
});

afterEach(async () => {
  await api.dispose();
});

describe('the barem generation of a try', () => {
  it('runs once', async () => {
    await putFile('test');
    expect((await generate()).status).toBe(200);
    await api.db.prepare("UPDATE tests SET barem_request = 'none', barem_unchecked = 1, barem_file_key = 'k' WHERE quick_try = 1").run();
    const again = await generate();
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('quick_try_barem');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('is refused once the try has its own barem', async () => {
    await putFile('test');
    await putFile('barem');
    const res = await generate();
    expect(res.body.error).toBe('quick_try_barem');
    expect((await row())!.barem_request).toBe('none');
  });
});

describe('the file changes of a try', () => {
  it(`stop after ${QUICK_TRY_FILE_CHANGES}`, async () => {
    for (let i = 0; i < QUICK_TRY_FILE_CHANGES; i++) expect((await putFile(i % 2 === 0 ? 'test' : 'barem')).status).toBe(200);
    const res = await putFile('barem');
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('quick_try_files');
    expect((await row())!.files_version).toBe(QUICK_TRY_FILE_CHANGES);
  });

  it("do not limit a real teacher's test", async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion']);
    const own = await makeTest(api, cls.id);
    await addTestFiles(api, own, ['test']);
    for (let i = 0; i <= QUICK_TRY_FILE_CHANGES; i++) expect((await putFile('barem', '/api/admin', own)).status).toBe(200);
  });
});
