import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOCX_TYPE, PDF_TYPE } from '../../shared/files.ts';
import { makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

function putFile(testCode: string, kind: string, body: BodyInit, type: string, name: string, headers: Record<string, string> = {}) {
  return api.fetch(`/api/admin/tests/${testCode}/files/${kind}`, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name), ...headers },
  });
}

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2');
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('PUT /api/admin/tests/:code/files/:kind', () => {
  it('stores the test file in the test folder and shows it on the test', async () => {
    const res = await putFile(code, 'test', pdf('enunț'), PDF_TYPE, 'Test final ședința 1.pdf');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ file: { name: 'Test final ședința 1.pdf', type: PDF_TYPE } });

    const key = `t/${api.teacherId}/2026/${code}/test/test-final-sedinta-1.pdf`;
    expect(await (await api.env.FILES.get(key))?.text()).toBe('%PDF-1.7 enunț');
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test.files).toEqual({ test: { name: 'Test final ședința 1.pdf', type: PDF_TYPE }, barem: null });
  });

  it('replaces a file: the new one is stored, the old one deleted', async () => {
    await putFile(code, 'barem', pdf('vechi'), PDF_TYPE, 'barem.pdf');
    const res = await putFile(code, 'barem', docx, DOCX_TYPE, 'Barem nou.docx');
    expect(res.status).toBe(200);
    const listed = await api.env.FILES.list({ prefix: `t/${api.teacherId}/2026/${code}/barem/` });
    expect(listed.objects.map((o) => o.key)).toEqual([`t/${api.teacherId}/2026/${code}/barem/barem-nou.docx`]);
  });

  it('keeps the file when the new one has the same name', async () => {
    await putFile(code, 'test', pdf('unu'), PDF_TYPE, 'test.pdf');
    await putFile(code, 'test', pdf('doi'), PDF_TYPE, 'test.pdf');
    expect(await (await api.env.FILES.get(`t/${api.teacherId}/2026/${code}/test/test.pdf`))?.text()).toBe('%PDF-1.7 doi');
  });

  it('clears the exercise list when the barem changes', async () => {
    await api.db
      .prepare("UPDATE tests SET exercise_list_status = 'ready', exercise_list_json = '{}', exercise_list_attempts = 2 WHERE code = ?")
      .bind(code)
      .run();
    const listState = () =>
      api.db
        .prepare('SELECT exercise_list_status, exercise_list_json, exercise_list_attempts FROM tests WHERE code = ?')
        .bind(code)
        .first();

    await putFile(code, 'test', pdf('enunț'), PDF_TYPE, 'test.pdf');
    expect(await listState()).toEqual({ exercise_list_status: 'ready', exercise_list_json: '{}', exercise_list_attempts: 2 });

    await putFile(code, 'barem', pdf('barem'), PDF_TYPE, 'barem.pdf');
    expect(await listState()).toEqual({ exercise_list_status: 'none', exercise_list_json: null, exercise_list_attempts: 0 });
  });

  it('refuses a file that is not PDF or Word, with a Romanian message', async () => {
    const res = await putFile(code, 'test', new TextEncoder().encode('just text'), 'text/plain', 'notes.txt');
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'bad_file_type', message: 'Încarcă un fișier PDF sau Word (.docx).' });
  });

  it('refuses a new file while the test is being graded', async () => {
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(code).run();
    const res = await putFile(code, 'test', pdf('x'), PDF_TYPE, 'test.pdf');
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('evaluating');
  });

  it('answers 404 for an unknown kind, an unknown test, and a test of another teacher', async () => {
    expect((await putFile(code, 'answers', pdf('x'), PDF_TYPE, 'a.pdf')).status).toBe(404);
    expect((await putFile('6E2-26T9', 'test', pdf('x'), PDF_TYPE, 'a.pdf')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    expect((await putFile(foreign.code, 'test', pdf('x'), PDF_TYPE, 'a.pdf')).status).toBe(404);
    expect((await api.env.FILES.list()).objects).toEqual([]);
  });

  it('refuses an upload sent from another site', async () => {
    const res = await putFile(code, 'test', pdf('x'), PDF_TYPE, 'a.pdf', { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/tests/:code/files/:kind', () => {
  it('streams the stored file under its original name', async () => {
    await putFile(code, 'test', pdf('enunț'), PDF_TYPE, 'Test (final).pdf');
    const res = await api.fetch(`/api/admin/tests/${code}/files/test`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(PDF_TYPE);
    expect(res.headers.get('Content-Disposition')).toBe("inline; filename*=UTF-8''Test%20%28final%29.pdf");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await res.text()).toBe('%PDF-1.7 enunț');
  });

  it('answers 404 when there is no file yet, and for a test of another teacher', async () => {
    expect((await api.fetch(`/api/admin/tests/${code}/files/barem`)).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    await api.db
      .prepare("UPDATE tests SET test_file_key = 'x/t.pdf', test_file_name = 't.pdf', test_file_type = 'application/pdf' WHERE code = ?")
      .bind(foreign.code)
      .run();
    await api.env.FILES.put('x/t.pdf', '%PDF-1.7 secret');
    expect((await api.fetch(`/api/admin/tests/${foreign.code}/files/test`)).status).toBe(404);
  });
});
