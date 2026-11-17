import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { makeClass, makeTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { fileKindOfPath, withOldPath } from './oldPaths.ts';

// The old API paths ("barem", "ces") answer like the English ones, so a tab
// with the app from before the deploy keeps working until they go.

describe('fileKindOfPath', () => {
  it('reads the English name and the old one', () => {
    expect(fileKindOfPath('test')).toBe('test');
    expect(fileKindOfPath('marking-scheme')).toBe('barem');
    expect(fileKindOfPath('barem')).toBe('barem');
  });

  it('gives null for any other name', () => {
    for (const raw of [undefined, '', 'answers', 'Barem', 'marking_scheme', 'toString', 'constructor']) {
      expect(fileKindOfPath(raw)).toBeNull();
    }
  });
});

describe('withOldPath', () => {
  it('gives the English path first, then the old one', () => {
    expect(withOldPath('/:code/sen', '/:code/ces')).toEqual(['/:code/sen', '/:code/ces']);
  });
});

describe('the old teacher API paths', () => {
  let api: TestApi;
  let code: string;
  let studentId: number;

  const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
  const put = (path: string, text: string) =>
    api.fetch(path, { method: 'PUT', body: pdf(text), headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': encodeURIComponent(`${text}.pdf`) } });

  beforeEach(async () => {
    api = await startTestApi({ app: { dispatchRobot: vi.fn(async () => true) } });
    const cls = await makeClass(api, '9R2', ['Ene Ana']);
    studentId = cls.studentIds[0]!;
    code = await makeTest(api, cls.id);
  });

  afterEach(async () => {
    await api.dispose();
  });

  it('store and give back the barem and the CES files under both names', async () => {
    const base = `/api/admin/tests/${code}`;
    expect((await put(`${base}/files/barem`, 'barem vechi')).status).toBe(200);
    for (const path of [`${base}/files/barem`, `${base}/files/marking-scheme`]) {
      const res = await api.fetch(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('%PDF-1.7 barem vechi');
    }
    expect((await put(`${base}/ces/files/test`, 'test ces')).status).toBe(200);
    expect((await put(`${base}/ces/files/barem`, 'barem ces')).status).toBe(200);
    for (const [path, text] of [
      [`${base}/ces/files/test`, 'test ces'],
      [`${base}/sen/files/test`, 'test ces'],
      [`${base}/ces/files/barem`, 'barem ces'],
      [`${base}/sen/files/marking-scheme`, 'barem ces'],
    ]) {
      const res = await api.fetch(path!);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(`%PDF-1.7 ${text}`);
    }
  });

  it('answer as the English paths do, with the route behind them', async () => {
    const t = `/api/admin/tests/${code}`;
    const pairs: [string, string, string, unknown, number, string | undefined][] = [
      ['PUT', `${t}/marking-scheme-notes`, `${t}/barem-notes`, { notes: 'Pe pași.' }, 200, undefined],
      ['POST', `${t}/marking-scheme/generate`, `${t}/barem/generate`, undefined, 409, 'missing_test_file'],
      ['POST', `${t}/marking-scheme/checked`, `${t}/barem/checked`, { filesVersion: 7 }, 409, 'stale'],
      ['PUT', `${t}/sen/marking-scheme-notes`, `${t}/ces/barem-notes`, { notes: 'Altfel.' }, 200, undefined],
      ['POST', `${t}/sen/marking-scheme/generate`, `${t}/ces/barem/generate`, undefined, 409, 'missing_test_file'],
      ['POST', `${t}/sen/marking-scheme/checked`, `${t}/ces/barem/checked`, { filesVersion: 7 }, 409, 'stale'],
      ['POST', `${t}/sen/print/retry`, `${t}/ces/print/retry`, undefined, 409, 'not_failed'],
      ['POST', `${t}/sen/exercise-list/accept`, `${t}/ces/exercise-list/accept`, undefined, 409, 'no_problem'],
      ['POST', `${t}/sen/exercise-list/retry`, `${t}/ces/exercise-list/retry`, undefined, 409, 'not_failed'],
      ['DELETE', `${t}/sen`, `${t}/ces`, undefined, 409, 'no_ces'],
      ['PUT', `${t}/sen/off`, `${t}/ces/off`, { off: false }, 200, undefined],
      ['PUT', `/api/admin/students/${studentId}/sen`, `/api/admin/students/${studentId}/ces`, { ces: true }, 200, undefined],
    ];
    for (const [method, now, old, body, status, error] of pairs) {
      for (const path of [now, old]) {
        const res = await api.request(method, path, body);
        expect([path, res.status, res.body.error]).toEqual([path, status, error]);
      }
    }
  });

  it('read the old names as the same data', async () => {
    const t = `/api/admin/tests/${code}`;
    await api.request('PUT', `${t}/barem-notes`, { notes: 'Vechi.' });
    await api.request('PUT', `${t}/ces/barem-notes`, { notes: 'CES vechi.' });
    const test = (await api.request('GET', t)).body.test;
    expect([test.baremNotes, test.ces.baremNotes]).toEqual(['Vechi.', 'CES vechi.']);
    await api.request('PUT', `/api/admin/students/${studentId}/ces`, { ces: true });
    expect((await api.request('GET', `/api/admin/students/${studentId}/history`)).body.student.ces).toBe(true);
  });
});

describe('the old Quick Try paths', () => {
  let api: TestApi;
  let token: string;
  let code: string;

  beforeEach(async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { dispatchRobot: vi.fn(async () => true), verifyTurnstile: async () => true } });
    const res = await api.request('POST', '/api/try', { turnstileToken: 'ok' }, { 'CF-Connecting-IP': '203.0.113.5' });
    ({ token, code } = res.body);
  });

  afterEach(async () => {
    await api.dispose();
  });

  it('pass the allow-list under both names', async () => {
    const base = `/api/try/${token}/tests/${code}`;
    const pdf = new TextEncoder().encode('%PDF-1.7 barem');
    const put = await api.fetch(`${base}/files/barem`, { method: 'PUT', body: pdf, headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': 'b.pdf' } });
    expect(put.status).toBe(200);
    for (const path of [`${base}/files/barem`, `${base}/files/marking-scheme`]) expect((await api.fetch(path)).status).toBe(200);
    // The try has no test file yet: the route itself refuses, under both names.
    for (const path of [`${base}/barem/generate`, `${base}/marking-scheme/generate`]) {
      expect((await api.request('POST', path)).body.error).toBe('missing_test_file');
    }
  });
});
