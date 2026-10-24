import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';

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
    expect(left.body.student).toEqual({ id: studentId, fullName: 'Pop Ion', active: false, canDelete: true });

    const detail = await api.request('GET', `/api/admin/classes/${created.id}`);
    expect(detail.body.class.studentCount).toBe(0);
    expect(detail.body.students).toEqual([{ id: studentId, fullName: 'Pop Ion', active: false, canDelete: true }]);

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

describe('duplicate student names in a class', () => {
  const addTo = (classId: number, names: string[]) => api.request('POST', `/api/admin/classes/${classId}/students`, { names });

  it('refuses a name already in the class, whatever its case', async () => {
    const created = await createClass('11A');
    expect((await addTo(created.id, ['Ștefan Ana'])).status).toBe(201);
    const res = await addTo(created.id, ['Marin Dan', 'ȘTEFAN ANA']);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('student_exists');
    expect(res.body.message).toBe('Elevul „ȘTEFAN ANA” este deja în clasă.');
    const detail = await api.request('GET', `/api/admin/classes/${created.id}`);
    expect(detail.body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Ștefan Ana']);
    const orphans = await api.db
      .prepare("SELECT COUNT(*) AS n FROM students WHERE full_name = 'Marin Dan'")
      .first<{ n: number }>();
    expect(orphans?.n).toBe(0);
  });

  it('names every duplicate of a list, at most three, then counts the rest', async () => {
    const created = await createClass('11B');
    await addTo(created.id, ['A Unu', 'B Doi', 'C Trei', 'D Patru', 'E Cinci']);
    const two = await addTo(created.id, ['a unu', 'Nou Elev', 'b doi']);
    expect(two.status).toBe(409);
    expect(two.body.message).toBe('Elevii „a unu”, „b doi” sunt deja în clasă.');
    const five = await addTo(created.id, ['a unu', 'b doi', 'c trei', 'd patru', 'e cinci']);
    expect(five.body.message).toBe('Elevii „a unu”, „b doi”, „c trei” și încă 2 sunt deja în clasă.');
  });

  it('refuses a name of a student who left', async () => {
    const created = await createClass('11C');
    const add = await addTo(created.id, ['Pop Ion']);
    await api.request('PATCH', `/api/admin/classes/${created.id}/students/${add.body.students[0].id}`, { active: false });
    const res = await addTo(created.id, ['Pop Ion']);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('student_exists');
  });

  it('allows the same name in another class', async () => {
    const first = await createClass('11D');
    const second = await createClass('11E');
    await addTo(first.id, ['Pop Ion']);
    expect((await addTo(second.id, ['Pop Ion'])).status).toBe(201);
  });

  it('refuses a cedilla twin', async () => {
    const created = await createClass('11F');
    await addTo(created.id, ['Șerban Ion']);
    const res = await addTo(created.id, ['Şerban Ion']);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('student_exists');
  });

  it('keeps names that differ by a diacritic apart', async () => {
    const created = await createClass('11G');
    await addTo(created.id, ['Stefan Ana']);
    expect((await addTo(created.id, ['Ștefan Ana'])).status).toBe(201);
  });

  it('answers 404 for another teacher class even when the name would clash', async () => {
    const otherId = await api.addTeacher('dup-neighbour@example.com', 'Alt Profesor');
    const otherClass = await api.db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '5C', 2026, '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    expect((await addTo(otherClass!.id, ['Pop Ion'])).status).toBe(404);
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

describe('delete student', () => {
  const GONE = 'Elevul are lucrări trimise sau corectate în această clasă. Îl poți marca „A plecat”.';
  const del = (classId: number, studentId: number) => api.request('DELETE', `/api/admin/classes/${classId}/students/${studentId}`);
  const count = async (sql: string, ...binds: unknown[]) =>
    (await api.db.prepare(sql).bind(...binds).first<{ n: number }>())!.n;

  it('lists canDelete for each student', async () => {
    const cls = await makeClass(api, 'D1A', ['Ana Graded', 'Bia New']);
    const code = await makeTest(api, cls.id);
    const sub = await addSubmission(api, code, cls.studentIds[0]!, { status: 'graded' });
    await addEvaluation(api, sub);
    const detail = await api.request('GET', `/api/admin/classes/${cls.id}`);
    const byName = Object.fromEntries(detail.body.students.map((s: { fullName: string; canDelete: boolean }) => [s.fullName, s.canDelete]));
    expect(byName).toEqual({ 'Ana Graded': false, 'Bia New': true });
  });

  it('fills canDelete when students are added and marked as left', async () => {
    const cls = await makeClass(api, 'D1B');
    const add = await api.request('POST', `/api/admin/classes/${cls.id}/students`, { names: ['Pop Ion'] });
    expect(add.body.students[0].canDelete).toBe(true);
    const left = await api.request('PATCH', `/api/admin/classes/${cls.id}/students/${add.body.students[0].id}`, { active: false });
    expect(left.body.student).toMatchObject({ active: false, canDelete: true });
  });

  it('deletes a student with no uploads', async () => {
    const cls = await makeClass(api, 'D2', ['Ana Unu', 'Bia Doi']);
    const res = await del(cls.id, cls.studentIds[0]!);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    const detail = await api.request('GET', `/api/admin/classes/${cls.id}`);
    expect(detail.body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Bia Doi']);
    expect(detail.body.class.studentCount).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ? AND student_id = ?', cls.id, cls.studentIds[0])).toBe(0);
  });

  it('deletes a student who left', async () => {
    const cls = await makeClass(api, 'D3', ['Pop Ion']);
    await api.request('PATCH', `/api/admin/classes/${cls.id}/students/${cls.studentIds[0]}`, { active: false });
    expect((await del(cls.id, cls.studentIds[0]!)).status).toBe(200);
  });

  it('deletes the unsent and failed uploads of the student with them', async () => {
    const cls = await makeClass(api, 'D4', ['Ana Unu']);
    const studentId = cls.studentIds[0]!;
    const first = await makeTest(api, cls.id, 'Primul');
    const second = await makeTest(api, cls.id, 'Al doilea');
    const unsent = await addSubmission(api, first, studentId, { status: 'uploading', files: 2 });
    const failed = await addSubmission(api, second, studentId, { status: 'failed', files: 1 });
    const res = await del(cls.id, studentId);
    expect(res.status).toBe(200);
    for (const id of [unsent, failed]) {
      expect(await count('SELECT COUNT(*) AS n FROM submissions WHERE id = ?', id)).toBe(0);
      expect(await count('SELECT COUNT(*) AS n FROM submission_files WHERE submission_id = ?', id)).toBe(0);
    }
  });

  it.each(['submitted', 'grading', 'graded'] as const)('refuses a student with a %s upload', async (status) => {
    const cls = await makeClass(api, `D5${status.slice(0, 4).toUpperCase()}${status.length}`, ['Ana Unu']);
    const studentId = cls.studentIds[0]!;
    const unsentTest = await makeTest(api, cls.id, 'Neterminat');
    const code = await makeTest(api, cls.id, 'Terminat');
    const unsent = await addSubmission(api, unsentTest, studentId, { status: 'uploading', files: 1 });
    const sub = await addSubmission(api, code, studentId, { status, files: 1 });
    if (status === 'graded') await addEvaluation(api, sub);
    const res = await del(cls.id, studentId);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('student_has_work');
    expect(res.body.message).toBe(GONE);
    expect(await count('SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ? AND student_id = ?', cls.id, studentId)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM submissions WHERE id IN (?, ?)', sub, unsent)).toBe(2);
  });

  it('keeps the student in another class', async () => {
    const first = await makeClass(api, 'D6A', ['Pop Ion']);
    const second = await makeClass(api, 'D6B');
    await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(second.id, first.studentIds[0]).run();
    const code = await makeTest(api, second.id);
    const elsewhere = await addSubmission(api, code, first.studentIds[0]!, { status: 'graded' });
    await addEvaluation(api, elsewhere);
    expect((await del(first.id, first.studentIds[0]!)).status).toBe(200);
    const detail = await api.request('GET', `/api/admin/classes/${second.id}`);
    expect(detail.body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Pop Ion']);
    expect(await count('SELECT COUNT(*) AS n FROM submissions WHERE id = ?', elsewhere)).toBe(1);
  });

  it('never gives the id of a deleted student to a new student', async () => {
    const cls = await makeClass(api, 'D7');
    const newest = await api.db.prepare('SELECT MAX(id) AS id FROM students').first<{ id: number }>();
    const added = await api.request('POST', `/api/admin/classes/${cls.id}/students`, { names: ['Ultimul Elev'] });
    const lastId = added.body.students[0].id as number;
    expect(lastId).toBeGreaterThan(newest!.id);
    expect((await del(cls.id, lastId)).status).toBe(200);
    const next = await api.request('POST', `/api/admin/classes/${cls.id}/students`, { names: ['Noul Elev'] });
    expect(next.body.students[0].id).toBeGreaterThan(lastId);
  });

  it('answers 404 for a student who is not in the class, also on a second delete', async () => {
    const cls = await makeClass(api, 'D8', ['Pop Ion']);
    expect((await del(cls.id, 99999)).status).toBe(404);
    expect((await del(cls.id, cls.studentIds[0]!)).status).toBe(200);
    expect((await del(cls.id, cls.studentIds[0]!)).status).toBe(404);
  });

  it('answers 404 for a class that is not a number', async () => {
    expect((await del(99999, 1)).status).toBe(404);
    expect((await api.request('DELETE', '/api/admin/classes/abc/students/1')).status).toBe(404);
  });

  it('answers 404 for the class of another teacher and keeps the student', async () => {
    const other = await otherTeacherTest(api, 'delete-neighbour@example.com');
    const row = await api.db
      .prepare('SELECT class_id FROM enrollments WHERE student_id = ?')
      .bind(other.studentId)
      .first<{ class_id: number }>();
    expect((await del(row!.class_id, other.studentId)).status).toBe(404);
    expect(await count('SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ? AND student_id = ?', row!.class_id, other.studentId)).toBe(1);
  });
});
