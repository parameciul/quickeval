import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.dispose();
});

async function createClass(name: string, schoolYear = 2026) {
  const res = await api.request('POST', '/api/admin/classes', { name, schoolYear });
  expect(res.status).toBe(201);
  return res.body.class as { id: number; name: string };
}

describe('classes', () => {
  it('creates a class with a normalized name', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6e2', schoolYear: 2026 });
    expect(res.status).toBe(201);
    expect(res.body.class).toMatchObject({ name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 });
  });

  it('refuses the same class name twice in one school year', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6E2', schoolYear: 2026 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Clasa 6E2 există deja în anul școlar 2026-2027.');
  });

  it('allows the same class name in another school year', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6E2', schoolYear: 2027 });
    expect(res.status).toBe(201);
  });

  it('refuses a bad class name with a Romanian message', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6-E2', schoolYear: 2026 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Numele clasei are 1-8 litere și cifre, de exemplu 6E2.');
  });

  it('lists the classes of one school year, active first, in number order', async () => {
    await createClass('11R1');
    const archived = await createClass('9R2');
    await api.request('PATCH', `/api/admin/classes/${archived.id}`, { archived: true });
    const res = await api.request('GET', '/api/admin/classes?year=2026');
    expect(res.status).toBe(200);
    expect(res.body.classes.map((c: { name: string }) => c.name)).toEqual(['6E2', '11R1', '9R2']);
  });

  it('refuses a body that is not JSON', async () => {
    const res = await api.request('POST', '/api/admin/classes', undefined, { 'Content-Type': 'text/plain' });
    expect(res.status).toBe(415);
    expect(res.body.error).toBe('bad_content_type');
  });

  it('refuses a bad year in the list', async () => {
    const res = await api.request('GET', '/api/admin/classes?year=abc');
    expect(res.status).toBe(400);
  });

  it('renames a class', async () => {
    const created = await createClass('7E2');
    const res = await api.request('PATCH', `/api/admin/classes/${created.id}`, { name: '7e3' });
    expect(res.status).toBe(200);
    expect(res.body.class.name).toBe('7E3');
  });

  it('refuses a rename to a name that already exists', async () => {
    const created = await createClass('8E2');
    const res = await api.request('PATCH', `/api/admin/classes/${created.id}`, { name: '6E2' });
    expect(res.status).toBe(409);
  });

  it('hides the classes of other teachers', async () => {
    const otherId = await api.addTeacher('other@example.com', 'Alt Profesor');
    const row = await api.db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '5A', 2026, '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    expect((await api.request('GET', `/api/admin/classes/${row!.id}`)).status).toBe(404);
    expect((await api.request('PATCH', `/api/admin/classes/${row!.id}`, { archived: true })).status).toBe(404);
    const list = await api.request('GET', '/api/admin/classes?year=2026');
    expect(list.body.classes.map((c: { name: string }) => c.name)).not.toContain('5A');
  });

  it('answers 404 for an id that is not a number', async () => {
    expect((await api.request('GET', '/api/admin/classes/abc')).status).toBe(404);
  });
});

describe('students in a class', () => {
  it('adds pasted names, cleaned, and lists them in Romanian order', async () => {
    const created = await createClass('10A');
    const add = await api.request('POST', `/api/admin/classes/${created.id}/students`, {
      names: ['2. Ștefan Ana', 'Sandu  Ion', 'Tudor Ema'],
    });
    expect(add.status).toBe(201);
    expect(add.body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Ștefan Ana', 'Sandu Ion', 'Tudor Ema']);

    const detail = await api.request('GET', `/api/admin/classes/${created.id}`);
    expect(detail.body.class.studentCount).toBe(3);
    expect(detail.body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Sandu Ion', 'Ștefan Ana', 'Tudor Ema']);
  });

  it('adds 60 names in one request', async () => {
    const created = await createClass('10B');
    const names = Array.from({ length: 60 }, (_, i) => `Elev ${i + 1}`);
    const res = await api.request('POST', `/api/admin/classes/${created.id}/students`, { names });
    expect(res.status).toBe(201);
    expect(new Set(res.body.students.map((s: { id: number }) => s.id)).size).toBe(60);
  });

  it('marks a student as left and back, keeping the student in the list', async () => {
    const created = await createClass('10C');
    const add = await api.request('POST', `/api/admin/classes/${created.id}/students`, { names: ['Pop Ion'] });
    const studentId = add.body.students[0].id;

    const left = await api.request('PATCH', `/api/admin/classes/${created.id}/students/${studentId}`, { active: false });
    expect(left.status).toBe(200);
    expect(left.body.student).toEqual({ id: studentId, fullName: 'Pop Ion', active: false });

    const detail = await api.request('GET', `/api/admin/classes/${created.id}`);
    expect(detail.body.class.studentCount).toBe(0);
    expect(detail.body.students).toEqual([{ id: studentId, fullName: 'Pop Ion', active: false }]);

    const back = await api.request('PATCH', `/api/admin/classes/${created.id}/students/${studentId}`, { active: true });
    expect(back.body.student.active).toBe(true);
  });

  it('refuses to add students to a class that does not exist', async () => {
    const res = await api.request('POST', '/api/admin/classes/99999/students', { names: ['Pop Ion'] });
    expect(res.status).toBe(404);
  });

  it('answers 404 when the student is not in that class', async () => {
    const created = await createClass('10D');
    const res = await api.request('PATCH', `/api/admin/classes/${created.id}/students/99999`, { active: false });
    expect(res.status).toBe(404);
  });
});

describe('students of another teacher', () => {
  it('cannot be added to or changed in that teacher class', async () => {
    const otherId = await api.addTeacher('neighbour@example.com', 'Alt Profesor');
    const otherClass = await api.db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '5B', 2026, '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    const otherStudent = await api.db
      .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Elev Străin', '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(otherClass!.id, otherStudent!.id).run();

    const add = await api.request('POST', `/api/admin/classes/${otherClass!.id}/students`, { names: ['Intrus Ion'] });
    expect(add.status).toBe(404);
    const leave = await api.request('PATCH', `/api/admin/classes/${otherClass!.id}/students/${otherStudent!.id}`, { active: false });
    expect(leave.status).toBe(404);

    const enrollment = await api.db
      .prepare('SELECT active FROM enrollments WHERE class_id = ? AND student_id = ?')
      .bind(otherClass!.id, otherStudent!.id)
      .first<{ active: number }>();
    expect(enrollment?.active).toBe(1);
    const enrolled = await api.db
      .prepare('SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ?')
      .bind(otherClass!.id)
      .first<{ n: number }>();
    expect(enrolled?.n).toBe(1);
  });
});
