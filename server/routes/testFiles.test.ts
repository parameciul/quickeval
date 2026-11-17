import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCX_TYPE, PDF_TYPE } from '../../shared/files.ts';
import { addCesFiles, addSubmission, addTestFiles, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let studentId: number;

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
  dispatchRobot = vi.fn(async () => false);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  studentId = cls.studentIds[0]!;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('PUT /api/admin/tests/:code/files/:kind', () => {
  it('stores the test file in the test folder and shows it on the test', async () => {
    const res = await putFile(code, 'test', pdf('enunț'), PDF_TYPE, 'Test final ședința 1.pdf');
    expect(res.status).toBe(200);
    // The draft has its link, so its print PDF waits for the robot.
    expect(await res.json()).toEqual({ file: { name: 'Test final ședința 1.pdf', type: PDF_TYPE }, robot: 'next_check' });

    const key = `t/${api.teacherId}/2026/${code}/test/test-final-sedinta-1.pdf`;
    expect(await (await api.env.FILES.get(key))?.text()).toBe('%PDF-1.7 enunț');
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test.files).toEqual({ test: { name: 'Test final ședința 1.pdf', type: PDF_TYPE }, barem: null });
  });

  it('replaces a file: the new one is stored, the old one deleted', async () => {
    await putFile(code, 'marking-scheme', pdf('vechi'), PDF_TYPE, 'barem.pdf');
    const res = await putFile(code, 'marking-scheme', docx, DOCX_TYPE, 'Barem nou.docx');
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

    await putFile(code, 'marking-scheme', pdf('barem'), PDF_TYPE, 'barem.pdf');
    expect(await listState()).toEqual({ exercise_list_status: 'none', exercise_list_json: null, exercise_list_attempts: 0 });
  });

  it('refuses a file that is not PDF or Word, with a Romanian message', async () => {
    const res = await putFile(code, 'test', new TextEncoder().encode('just text'), 'text/plain', 'notes.txt');
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'bad_file_type', message: 'Încarcă un fișier PDF sau Word (.docx).' });
  });

  it.each(['none', 'ready', 'accepted'])('refuses a new file while the robot works with an exercise list "%s"', async (list) => {
    // An upload waits for grading, so the test stays in evaluation.
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await api.db.prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = ? WHERE code = ?").bind(list, code).run();
    const res = await putFile(code, 'marking-scheme', pdf('x'), PDF_TYPE, 'barem.pdf');
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('evaluating');
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it.each(['problem', 'failed'])('takes a new barem while the exercise list is "%s", asks for a new list, and starts the robot', async (list) => {
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await api.db
      .prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = ?, exercise_list_message = 'x', exercise_list_attempts = 3 WHERE code = ?")
      .bind(list, code)
      .run();
    dispatchRobot.mockResolvedValueOnce(true);
    const res = await putFile(code, 'marking-scheme', pdf('nou'), PDF_TYPE, 'barem.pdf');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ file: { name: 'barem.pdf', type: PDF_TYPE }, robot: 'dispatched' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    const row = await api.db
      .prepare('SELECT status, exercise_list_status, exercise_list_message, exercise_list_attempts FROM tests WHERE code = ?')
      .bind(code)
      .first();
    expect(row).toEqual({ status: 'evaluating', exercise_list_status: 'none', exercise_list_message: null, exercise_list_attempts: 0 });
  });

  it('says the robot did not start when GitHub does not take the request', async () => {
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await api.db.prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = 'problem' WHERE code = ?").bind(code).run();
    const res = await putFile(code, 'marking-scheme', pdf('nou'), PDF_TYPE, 'barem.pdf');
    expect(res.status).toBe(200);
    expect((await res.json()).robot).toBe('next_check');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('does not start the robot for a new test file while the exercise list has a problem', async () => {
    // The list keeps its problem: the robot has nothing new to do.
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await api.db.prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = 'problem' WHERE code = ?").bind(code).run();
    const res = await putFile(code, 'test', pdf('nou'), PDF_TYPE, 'test.pdf');
    expect(res.status).toBe(200);
    expect((await res.json()).robot).toBeNull();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('does not start the robot for a new barem on a test whose uploads are open', async () => {
    await api.db.prepare("UPDATE tests SET status = 'open', exercise_list_status = 'problem' WHERE code = ?").bind(code).run();
    const res = await putFile(code, 'marking-scheme', pdf('nou'), PDF_TYPE, 'barem.pdf');
    expect(res.status).toBe(200);
    expect((await res.json()).robot).toBeNull();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown kind, an unknown test, and a test of another teacher', async () => {
    expect((await putFile(code, 'answers', pdf('x'), PDF_TYPE, 'a.pdf')).status).toBe(404);
    expect((await putFile('6E2-26T9', 'test', pdf('x'), PDF_TYPE, 'a.pdf')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    expect((await putFile(foreign.code, 'test', pdf('x'), PDF_TYPE, 'a.pdf')).status).toBe(404);
    expect((await api.env.FILES.list()).objects).toEqual([]);
  });

  it('answers 404 for a new barem on a test of another teacher in evaluation, and starts no robot', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db
      .prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = 'problem' WHERE code = ?")
      .bind(foreign.code)
      .run();
    expect((await putFile(foreign.code, 'marking-scheme', pdf('x'), PDF_TYPE, 'barem.pdf')).status).toBe(404);
    expect(dispatchRobot).not.toHaveBeenCalled();
    const row = await api.db.prepare('SELECT exercise_list_status FROM tests WHERE code = ?').bind(foreign.code).first();
    expect(row).toEqual({ exercise_list_status: 'problem' });
  });

  it('refuses an upload sent from another site', async () => {
    const res = await putFile(code, 'test', pdf('x'), PDF_TYPE, 'a.pdf', { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/admin/tests/:code/marking-scheme-notes', () => {
  const notesOf = () =>
    api.db.prepare('SELECT barem_notes, exercise_list_status, files_version FROM tests WHERE code = ?').bind(code).first();
  const saveNotes = (body: unknown) => api.request('PUT', `/api/admin/tests/${code}/marking-scheme-notes`, body);

  it('saves the notes and shows them on the test', async () => {
    const res = await saveNotes({ notes: '  Acceptă și metoda cu proporții.  ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ baremNotes: 'Acceptă și metoda cu proporții.', robot: null });
    expect(await notesOf()).toMatchObject({ barem_notes: 'Acceptă și metoda cu proporții.', exercise_list_status: 'none' });
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test.baremNotes).toBe('Acceptă și metoda cu proporții.');
  });

  it('starts the robot when a barem request waits', async () => {
    dispatchRobot.mockResolvedValueOnce(true);
    await addTestFiles(api, code, ['test']);
    await api.db.prepare("UPDATE tests SET barem_request = 'requested' WHERE code = ?").bind(code).run();
    const res = await saveNotes({ notes: 'Verifică raționamentul.' });
    expect(res.status).toBe(200);
    expect(res.body.robot).toBe('dispatched');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('clears the exercise list like a new barem', async () => {
    await api.db
      .prepare("UPDATE tests SET exercise_list_status = 'ready', exercise_list_json = '{}', files_version = 4 WHERE code = ?")
      .bind(code)
      .run();
    expect((await saveNotes({ notes: 'Verifică raționamentul.' })).status).toBe(200);
    expect(await notesOf()).toEqual({ barem_notes: 'Verifică raționamentul.', exercise_list_status: 'none', files_version: 5 });
  });

  it('refuses while the robot works with the files', async () => {
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await api.db.prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = 'ready' WHERE code = ?").bind(code).run();
    const res = await saveNotes({ notes: 'Ceva.' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('evaluating');
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('takes new notes while the exercise list has a problem and starts the robot', async () => {
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await api.db
      .prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = 'problem', exercise_list_message = 'x' WHERE code = ?")
      .bind(code)
      .run();
    dispatchRobot.mockResolvedValueOnce(true);
    const res = await saveNotes({ notes: 'Acceptă tot.' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ baremNotes: 'Acceptă tot.', robot: 'dispatched' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('refuses notes that are too long', async () => {
    const res = await saveNotes({ notes: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(await notesOf()).toMatchObject({ barem_notes: '' });
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await api.request('PUT', `/api/admin/tests/${foreign.code}/marking-scheme-notes`, { notes: 'x' })).status).toBe(404);
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
    expect((await api.fetch(`/api/admin/tests/${code}/files/marking-scheme`)).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    await api.db
      .prepare("UPDATE tests SET test_file_key = 'x/t.pdf', test_file_name = 't.pdf', test_file_type = 'application/pdf' WHERE code = ?")
      .bind(foreign.code)
      .run();
    await api.env.FILES.put('x/t.pdf', '%PDF-1.7 secret');
    expect((await api.fetch(`/api/admin/tests/${foreign.code}/files/test`)).status).toBe(404);
  });
});

describe('the first, Romanian API paths', () => {
  it('are gone: "barem" and "ces" answer 404, and the data stays as it was', async () => {
    // Every file and the CES print PDF exist, so a GET that still had its old
    // path would answer 200: the English paths below do.
    await addTestFiles(api, code);
    await addCesFiles(api, code);
    await api.db.prepare("UPDATE tests SET ces_print_status = 'ready', ces_print_file_key = ? WHERE code = ?").bind(`fixture/${code}/ces/print.pdf`, code).run();
    for (const key of ['test', 'barem', 'ces/test', 'ces/barem', 'ces/print']) await api.env.FILES.put(`fixture/${code}/${key}.pdf`, `%PDF-1.7 ${key}`);
    const t = `/api/admin/tests/${code}`;
    for (const path of [`${t}/files/marking-scheme`, `${t}/sen/files/test`, `${t}/sen/files/marking-scheme`, `${t}/sen/print`]) {
      expect([path, (await api.fetch(path)).status]).toEqual([path, 200]);
    }

    expect((await putFile(code, 'barem', pdf('x'), PDF_TYPE, 'barem.pdf')).status).toBe(404);
    for (const [method, path, body] of [
      ['GET', `${t}/files/barem`, undefined],
      ['PUT', `${t}/barem-notes`, { notes: 'Vechi.' }],
      ['POST', `${t}/barem/generate`, undefined],
      ['POST', `${t}/barem/checked`, { filesVersion: 0 }],
      ['GET', `${t}/ces/files/test`, undefined],
      ['GET', `${t}/ces/files/barem`, undefined],
      ['GET', `${t}/sen/files/barem`, undefined],
      ['GET', `${t}/ces/files/marking-scheme`, undefined],
      ['PUT', `${t}/ces/barem-notes`, { notes: 'Vechi.' }],
      ['POST', `${t}/ces/barem/generate`, undefined],
      ['POST', `${t}/ces/barem/checked`, { filesVersion: 0 }],
      ['PUT', `${t}/ces/off`, { off: true }],
      ['DELETE', `${t}/ces`, undefined],
      ['GET', `${t}/ces/print`, undefined],
      ['POST', `${t}/ces/print/retry`, undefined],
      ['POST', `${t}/ces/exercise-list/accept`, undefined],
      ['POST', `${t}/ces/exercise-list/retry`, undefined],
      ['PUT', `/api/admin/students/${studentId}/ces`, { ces: true }],
    ] as const) {
      const res = await api.request(method, path, body);
      expect([method, path, res.status]).toEqual([method, path, 404]);
    }
    const test = (await api.request('GET', t)).body.test;
    expect([test.baremNotes, test.ces.baremNotes, test.ces.off, test.files.barem.name, test.ces.files.test.name]).toEqual([
      '',
      '',
      false,
      'barem.pdf',
      'ces-test.pdf',
    ]);
  });
});
