import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

// A fresh database for every test: the counters and lists start empty.
beforeEach(async () => {
  api = await startTestApi();
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/tests', () => {
  it('makes draft tests numbered per class and school year', async () => {
    const cls = await makeClass(api, '6E2');
    const first = await api.request('POST', '/api/admin/tests', { classId: cls.id, title: '  Test   inițial ' });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ code: '6E2-26T1' });
    expect(await makeTest(api, cls.id)).toBe('6E2-26T2');

    const detail = await api.request('GET', '/api/admin/tests/6E2-26T1');
    expect(detail.body.test).toMatchObject({ code: '6E2-26T1', title: 'Test inițial', status: 'draft', className: '6E2', schoolYear: 2026 });
  });

  it('uses the school year of the class in the code', async () => {
    const cls = await makeClass(api, '6E2', [], 2027);
    expect(await makeTest(api, cls.id)).toBe('6E2-27T1');
  });

  it('skips a code that a renamed class already used', async () => {
    const old = await makeClass(api, '6E2');
    await makeTest(api, old.id);
    await api.request('PATCH', `/api/admin/classes/${old.id}`, { name: '6E3' });
    const reborn = await makeClass(api, '6E2');
    expect(await makeTest(api, reborn.id)).toBe('6E2-26T2');
  });

  it('refuses an empty or too long title', async () => {
    const cls = await makeClass(api, '6E2');
    const empty = await api.request('POST', '/api/admin/tests', { classId: cls.id, title: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Scrie titlul testului.');
    const long = await api.request('POST', '/api/admin/tests', { classId: cls.id, title: 'x'.repeat(121) });
    expect(long.body.message).toBe('Titlul are cel mult 120 de caractere.');
  });

  it('asks for a class when the class id is missing or wrong', async () => {
    const res = await api.request('POST', '/api/admin/tests', { title: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Alege clasa.');
    expect((await api.request('POST', '/api/admin/tests', { classId: 1.5, title: 'Test' })).body.message).toBe('Alege clasa.');
  });

  it('refuses an archived class, a missing class, and a class of another teacher', async () => {
    const cls = await makeClass(api, '6E2');
    await api.request('PATCH', `/api/admin/classes/${cls.id}`, { archived: true });
    const archived = await api.request('POST', '/api/admin/tests', { classId: cls.id, title: 'Test' });
    expect(archived.status).toBe(409);
    expect(archived.body.message).toBe('Clasa este arhivată. Scoate-o din arhivă ca să faci un test nou.');

    expect((await api.request('POST', '/api/admin/tests', { classId: 99999, title: 'Test' })).status).toBe(404);

    await otherTeacherTest(api);
    const foreignClass = await api.db.prepare("SELECT id FROM classes WHERE name = '9Z'").first<{ id: number }>();
    expect((await api.request('POST', '/api/admin/tests', { classId: foreignClass!.id, title: 'Test' })).status).toBe(404);
  });
});

describe('GET /api/admin/tests', () => {
  it('lists the tests of a school year, newest first, with counts', async () => {
    const a = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
    const b = await makeClass(api, '7E2');
    const later = await makeClass(api, '6E2', [], 2027);
    const first = await makeTest(api, a.id, 'Primul');
    await makeTest(api, b.id, 'Al doilea');
    await makeTest(api, later.id, 'Anul viitor');
    await addSubmission(api, first, a.studentIds[0]!, { status: 'submitted', files: 2 });
    await addSubmission(api, first, a.studentIds[1]!, { status: 'uploading', files: 1 });
    await api.db.prepare("UPDATE tests SET created_at = '2026-10-01T00:00:00.000Z' WHERE code = ?").bind(first).run();

    const res = await api.request('GET', '/api/admin/tests?year=2026');
    expect(res.status).toBe(200);
    expect(res.body.tests.map((t: { title: string }) => t.title)).toEqual(['Al doilea', 'Primul']);
    expect(res.body.tests[1]).toMatchObject({ code: '6E2-26T1', studentCount: 3, submittedCount: 1, gradedCount: 0, startedAt: null });
  });

  it('refuses a bad year and hides tests of other teachers', async () => {
    expect((await api.request('GET', '/api/admin/tests?year=1990')).status).toBe(400);
    await otherTeacherTest(api);
    expect((await api.request('GET', '/api/admin/tests?year=2026')).body.tests).toEqual([]);
  });
});

describe('GET /api/admin/tests/:code', () => {
  it('returns the test and one upload row per active student, by name', async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva', 'Marin Dan']);
    const [pop, ionescu, stan, marin] = cls.studentIds as [number, number, number, number];
    const code = await makeTest(api, cls.id);
    const submissionId = await addSubmission(api, code, pop, { status: 'submitted', files: 3 });
    await api.db.prepare('UPDATE submissions SET auto_submitted = 1 WHERE id = ?').bind(submissionId).run();
    await addSubmission(api, code, stan, { files: 1 });
    await api.request('PATCH', `/api/admin/classes/${cls.id}/students/${stan}`, { active: false });
    await api.request('PATCH', `/api/admin/classes/${cls.id}/students/${marin}`, { active: false });

    const res = await api.request('GET', `/api/admin/tests/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.test).toMatchObject({
      code,
      uploadToken: null,
      files: { test: null, barem: null },
      exerciseList: { status: 'none', message: null },
      studentCount: 2,
      submittedCount: 1,
    });
    expect(res.body.uploads).toEqual([
      {
        studentId: ionescu,
        studentName: 'Ionescu Ana',
        active: true,
        submissionId: null,
        status: 'none',
        fileCount: 0,
        startedAt: null,
        submittedAt: null,
        autoSubmitted: false,
        grade: null,
        flagCount: 0,
        lastError: null,
      },
      {
        studentId: pop,
        studentName: 'Pop Ion',
        active: true,
        submissionId,
        status: 'submitted',
        fileCount: 3,
        startedAt: '2026-10-06T08:00:00.000Z',
        submittedAt: '2026-10-06T08:30:00.000Z',
        autoSubmitted: true,
        grade: null,
        flagCount: 0,
        lastError: null,
      },
      expect.objectContaining({ studentName: 'Stan Eva', active: false, status: 'uploading', fileCount: 1 }),
    ]);
  });

  it('shows grades, the items to check, and grading errors', async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
    const [pop, ionescu, stan] = cls.studentIds as [number, number, number];
    const code = await makeTest(api, cls.id);
    const graded = await addSubmission(api, code, pop, { status: 'graded', files: 1 });
    await addEvaluation(api, graded, {
      grade: 8.75,
      items: [{ needsReview: true }, { needsReview: true, reviewed: true }, {}, { needsReview: true }],
      unreadable: ['page-02.jpg'],
    });
    const clean = await addSubmission(api, code, ionescu, { status: 'graded', files: 1 });
    await addEvaluation(api, clean, { grade: 10 });
    const failed = await addSubmission(api, code, stan, { status: 'failed', files: 1 });
    await api.db.prepare("UPDATE submissions SET last_error = 'Corectarea a durat prea mult.' WHERE id = ?").bind(failed).run();
    await api.db
      .prepare("UPDATE tests SET exercise_list_status = 'problem', exercise_list_message = 'Punctajele din barem dau 9, dar totalul este 10.' WHERE code = ?")
      .bind(code)
      .run();

    const res = await api.request('GET', `/api/admin/tests/${code}`);
    expect(res.body.test).toMatchObject({
      gradedCount: 2,
      exerciseList: { status: 'problem', message: 'Punctajele din barem dau 9, dar totalul este 10.' },
    });
    const byName = Object.fromEntries(res.body.uploads.map((row: { studentName: string }) => [row.studentName, row]));
    expect(byName['Pop Ion']).toMatchObject({ status: 'graded', grade: 8.75, flagCount: 3, lastError: null });
    expect(byName['Ionescu Ana']).toMatchObject({ status: 'graded', grade: 10, flagCount: 0 });
    expect(byName['Stan Eva']).toMatchObject({ status: 'failed', grade: null, flagCount: 0, lastError: 'Corectarea a durat prea mult.' });
  });

  it('reads the code in any letter case and answers 404 for unknown or foreign codes', async () => {
    const cls = await makeClass(api, '6E2');
    await makeTest(api, cls.id);
    expect((await api.request('GET', '/api/admin/tests/6e2-26t1')).status).toBe(200);
    expect((await api.request('GET', '/api/admin/tests/6E2-26T9')).status).toBe(404);
    expect((await api.request('GET', '/api/admin/tests/not-a-code')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    expect((await api.request('GET', `/api/admin/tests/${foreign.code}`)).status).toBe(404);
  });
});

describe('PATCH /api/admin/tests/:code', () => {
  it('renames a test with a cleaned title', async () => {
    const cls = await makeClass(api, '6E2');
    const code = await makeTest(api, cls.id);
    const res = await api.request('PATCH', `/api/admin/tests/${code}`, { title: ' Teză   semestrială ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code, title: 'Teză semestrială' });
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await api.request('PATCH', `/api/admin/tests/${foreign.code}`, { title: 'Nou' })).status).toBe(404);
    const title = await api.db.prepare('SELECT title FROM tests WHERE code = ?').bind(foreign.code).first<{ title: string }>();
    expect(title?.title).toBe('Test străin');
  });
});

describe('DELETE /api/admin/tests/:code', () => {
  it('deletes the test, its uploads, and every stored file, and nothing else', async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion']);
    const code = await makeTest(api, cls.id);
    const kept = await makeTest(api, cls.id);
    const testId = await testIdOf(api, code);
    const submissionId = await addSubmission(api, code, cls.studentIds[0]!, { files: 2 });
    await api.db
      .prepare("UPDATE tests SET barem_file_key = 'fixture/barem.pdf', barem_file_name = 'barem.pdf', barem_file_type = 'application/pdf' WHERE id = ?")
      .bind(testId)
      .run();
    for (const key of ['fixture/barem.pdf', `fixture/${submissionId}/1.jpg`, `fixture/${submissionId}/2.jpg`, 'fixture/other.jpg']) {
      await api.env.FILES.put(key, 'x');
    }

    const res = await api.request('DELETE', `/api/admin/tests/${code}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect((await api.request('GET', `/api/admin/tests/${code}`)).status).toBe(404);
    expect((await api.request('GET', `/api/admin/tests/${kept}`)).status).toBe(200);
    const rows = await api.db
      .prepare('SELECT (SELECT COUNT(*) FROM submissions) AS submissions, (SELECT COUNT(*) FROM submission_files) AS files')
      .first<{ submissions: number; files: number }>();
    expect(rows).toEqual({ submissions: 0, files: 0 });
    const left = await api.env.FILES.list({ prefix: 'fixture/' });
    expect(left.objects.map((o) => o.key)).toEqual(['fixture/other.jpg']);
  });

  it('answers 404 for a test of another teacher and keeps it', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await api.request('DELETE', `/api/admin/tests/${foreign.code}`)).status).toBe(404);
    expect(await api.db.prepare('SELECT COUNT(*) AS n FROM tests').first<{ n: number }>()).toEqual({ n: 1 });
  });
});

describe('GET /api/admin/classes/:id', () => {
  it('lists the tests of the class, newest first', async () => {
    const cls = await makeClass(api, '6E2');
    await makeTest(api, cls.id, 'Primul');
    await makeTest(api, cls.id, 'Al doilea');
    const res = await api.request('GET', `/api/admin/classes/${cls.id}`);
    expect(res.body.tests.map((t: { code: string }) => t.code)).toEqual(['6E2-26T2', '6E2-26T1']);
  });
});
