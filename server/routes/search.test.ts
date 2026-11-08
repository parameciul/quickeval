import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

const search = (q: string, year = 2026) => api.request('GET', `/api/admin/search?q=${encodeURIComponent(q)}&year=${year}`);
const started = (code: string, at: string) => api.db.prepare('UPDATE tests SET started_at = ? WHERE code = ?').bind(at, code).run();

beforeEach(async () => {
  api = await startTestApi();
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/admin/search', () => {
  it('finds students, classes and tests of the year, diacritics aside', async () => {
    const tenth = await makeClass(api, '10B', ['Ștefan Radu', 'Pop Ana']);
    const ninth = await makeClass(api, '9A', ['Ştefania Pop', 'Ioana Stefănescu']);
    await makeClass(api, '12STE');
    const code = await makeTest(api, tenth.id, 'Ștergerea fracțiilor');
    await makeTest(api, ninth.id, 'Teorema lui Stewart');

    const res = await search('stef');
    expect(res.status).toBe(200);
    expect(res.body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Ioana Stefănescu', 'Ștefan Radu', 'Ştefania Pop']);
    expect(res.body.students[1]).toEqual({ id: tenth.studentIds[0], fullName: 'Ștefan Radu', classes: [{ id: tenth.id, name: '10B' }], lastGrade: null });
    expect(res.body.classes).toEqual([]);
    expect(res.body.tests).toEqual([]);

    const more = (await search('  STE ')).body;
    expect(more.classes.map((c: { name: string }) => c.name)).toEqual(['12STE']);
    expect(more.tests.map((t: { code: string; title: string }) => [t.code, t.title])).toEqual([
      [expect.any(String), 'Teorema lui Stewart'],
      [code, 'Ștergerea fracțiilor'],
    ]);
    // A test row is the Teste page's row, so the results page draws its stage.
    expect(more.tests[1]).toMatchObject({ className: '10B', status: 'draft', studentCount: 2 });
  });

  it('keeps to the school year and to the teacher', async () => {
    await makeClass(api, '9A', ['Ștefan Radu']);
    await makeClass(api, '10A', ['Ștefan Matei'], 2027);
    await otherTeacherTest(api);
    const other = await api.addTeacher('al.treilea@example.com', 'Al Treilea');
    await api.db.prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Ștefan Străin', '2026-10-06')").bind(other).run();

    expect((await search('stef')).body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Ștefan Radu']);
    expect((await search('stef', 2027)).body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Ștefan Matei']);
    expect((await search('strain')).body).toEqual({ students: [], classes: [], tests: [] });
    expect((await search('9z')).body.classes).toEqual([]);
  });

  it('lists a student in two classes of the year once, with the classes the student is in', async () => {
    const first = await makeClass(api, '9A', ['Ștefan Radu']);
    const second = await makeClass(api, '9B');
    const third = await makeClass(api, '9C');
    const [id] = first.studentIds as [number];
    for (const cls of [second, third]) {
      await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(cls.id, id).run();
    }
    await api.request('PATCH', `/api/admin/classes/${first.id}/students/${id}`, { active: false });

    const [student] = (await search('stef')).body.students;
    expect(student.classes.map((c: { name: string }) => c.name).sort()).toEqual(['9B', '9C']);

    // A student who left every class of the year still shows, with those classes.
    for (const cls of [second, third]) await api.request('PATCH', `/api/admin/classes/${cls.id}/students/${id}`, { active: false });
    const [left] = (await search('stef')).body.students;
    expect(left.classes.map((c: { name: string }) => c.name).sort()).toEqual(['9A', '9B', '9C']);
  });

  it("gives each student the grade of the latest graded paper of the year", async () => {
    const cls = await makeClass(api, '9A', ['Ștefan Radu', 'Ștefania Pop']);
    const [stefan, stefania] = cls.studentIds as [number, number];
    const older = await makeTest(api, cls.id, 'Fracții');
    const newer = await makeTest(api, cls.id, 'Ecuații');
    const ungraded = await makeTest(api, cls.id, 'Funcții');
    await started(older, '2026-10-06T07:00:00.000Z');
    await started(newer, '2026-11-03T07:00:00.000Z');
    await started(ungraded, '2026-11-20T07:00:00.000Z');
    await addEvaluation(api, await addSubmission(api, newer, stefan, { status: 'graded', files: 1 }), { grade: 7.1 });
    await addEvaluation(api, await addSubmission(api, older, stefan, { status: 'graded', files: 1 }), { grade: 9 });
    await addSubmission(api, ungraded, stefan, { status: 'submitted', files: 1 });
    // A paper of last year does not count.
    const last = await makeClass(api, '8A', [], 2025);
    await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(last.id, stefania).run();
    const old = await makeTest(api, last.id, 'Vechi');
    await started(old, '2025-10-06T07:00:00.000Z');
    await addEvaluation(api, await addSubmission(api, old, stefania, { status: 'graded', files: 1 }), { grade: 5 });

    const students = (await search('stef')).body.students;
    expect(students.map((s: { fullName: string; lastGrade: number | null }) => [s.fullName, s.lastGrade])).toEqual([
      ['Ștefan Radu', 7.1],
      ['Ștefania Pop', null],
    ]);
  });

  it('asks for two letters and at most 80 characters', async () => {
    await makeClass(api, '9A', ['Ana Pop']);
    for (const q of ['', ' a ', 'ș']) {
      const res = await search(q);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid', message: 'Scrie cel puțin două litere.' });
    }
    expect((await search('a'.repeat(81))).body.message).toBe('Caută cel mult 80 de caractere.');
    expect((await search('a'.repeat(80))).status).toBe(200);
    expect((await api.request('GET', '/api/admin/search?q=ana&year=1990')).status).toBe(400);
  });

  it('stays within 15 D1 queries', async () => {
    const cls = await makeClass(api, '9A', ['Ștefan Radu']);
    await makeTest(api, cls.id, 'Ștergeri');
    const db = api.env.DB;
    let queries = 0;
    api.env.DB = new Proxy(db, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key === 'prepare') return (sql: string) => ((queries += 1), target.prepare(sql));
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      expect((await search('ste')).status).toBe(200);
    } finally {
      api.env.DB = db;
    }
    expect(queries).toBeGreaterThan(3);
    expect(queries).toBeLessThanOrEqual(15);
  });
});
