import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let studentId: number;

beforeAll(async () => {
  api = await startTestApi();
  const created = await api.request('POST', '/api/admin/classes', { name: '6E2', schoolYear: 2026 });
  const added = await api.request('POST', `/api/admin/classes/${created.body.class.id}/students`, { names: ['Pop Ion'] });
  studentId = added.body.students[0].id;
});

afterAll(async () => {
  await api.dispose();
});

describe('PATCH /api/admin/students/:id', () => {
  it('renames a student with a cleaned name', async () => {
    const res = await api.request('PATCH', `/api/admin/students/${studentId}`, { fullName: '  Pop   Ioan ' });
    expect(res.status).toBe(200);
    expect(res.body.student).toEqual({ id: studentId, fullName: 'Pop Ioan' });
  });

  it('refuses an empty name', async () => {
    const res = await api.request('PATCH', `/api/admin/students/${studentId}`, { fullName: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Numele elevului lipsește.');
  });

  it('refuses a rename to a name already in one of the student classes', async () => {
    const cls = await api.request('POST', '/api/admin/classes', { name: '7A', schoolYear: 2026 });
    const added = await api.request('POST', `/api/admin/classes/${cls.body.class.id}/students`, { names: ['Dan Ana', 'Dan Eva'] });
    const evaId = added.body.students[1].id;
    const res = await api.request('PATCH', `/api/admin/students/${evaId}`, { fullName: 'DAN ANA' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('student_exists');
    expect(res.body.message).toBe('Există deja un elev cu numele „DAN ANA” în clasa 7A.');
    const kept = await api.db.prepare('SELECT full_name FROM students WHERE id = ?').bind(evaId).first<{ full_name: string }>();
    expect(kept?.full_name).toBe('Dan Eva');
  });

  it('refuses a rename to the name of a student who left the class', async () => {
    const cls = await api.request('POST', '/api/admin/classes', { name: '7E', schoolYear: 2026 });
    const classId = cls.body.class.id;
    const added = await api.request('POST', `/api/admin/classes/${classId}/students`, { names: ['Lup Sorin', 'Lup Sorina'] });
    const [leftId, otherId] = [added.body.students[0].id, added.body.students[1].id];
    await api.request('PATCH', `/api/admin/classes/${classId}/students/${leftId}`, { active: false });
    const res = await api.request('PATCH', `/api/admin/students/${otherId}`, { fullName: 'Lup Sorin' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('student_exists');
    const kept = await api.db.prepare('SELECT full_name FROM students WHERE id = ?').bind(otherId).first<{ full_name: string }>();
    expect(kept?.full_name).toBe('Lup Sorina');
  });

  it('refuses a rename to a name held in the second class of the student', async () => {
    const first = await api.request('POST', '/api/admin/classes', { name: '7F', schoolYear: 2026 });
    const second = await api.request('POST', '/api/admin/classes', { name: '7G', schoolYear: 2026 });
    const added = await api.request('POST', `/api/admin/classes/${first.body.class.id}/students`, { names: ['Moga Dan'] });
    const movingId = added.body.students[0].id;
    await api.request('POST', `/api/admin/classes/${second.body.class.id}/students`, { names: ['Moga Daniel'] });
    await api.db
      .prepare("INSERT INTO enrollments (class_id, student_id, active) VALUES (?, ?, 1)")
      .bind(second.body.class.id, movingId)
      .run();
    const res = await api.request('PATCH', `/api/admin/students/${movingId}`, { fullName: 'MOGA DANIEL' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('student_exists');
    expect(res.body.message).toContain('7G');
    const kept = await api.db.prepare('SELECT full_name FROM students WHERE id = ?').bind(movingId).first<{ full_name: string }>();
    expect(kept?.full_name).toBe('Moga Dan');
  });

  it('allows a student to change the case of their own name', async () => {
    const cls = await api.request('POST', '/api/admin/classes', { name: '7B', schoolYear: 2026 });
    const added = await api.request('POST', `/api/admin/classes/${cls.body.class.id}/students`, { names: ['Rus Mara'] });
    const res = await api.request('PATCH', `/api/admin/students/${added.body.students[0].id}`, { fullName: 'RUS MARA' });
    expect(res.status).toBe(200);
    expect(res.body.student.fullName).toBe('RUS MARA');
  });

  it('allows a name that only another class holds', async () => {
    const first = await api.request('POST', '/api/admin/classes', { name: '7C', schoolYear: 2026 });
    const second = await api.request('POST', '/api/admin/classes', { name: '7D', schoolYear: 2026 });
    await api.request('POST', `/api/admin/classes/${first.body.class.id}/students`, { names: ['Vlad Tom'] });
    const added = await api.request('POST', `/api/admin/classes/${second.body.class.id}/students`, { names: ['Vlad Toma'] });
    const res = await api.request('PATCH', `/api/admin/students/${added.body.students[0].id}`, { fullName: 'Vlad Tom' });
    expect(res.status).toBe(200);
  });

  it('answers 404 for a student of another teacher', async () => {
    const otherId = await api.addTeacher('other@example.com', 'Alt Profesor');
    const row = await api.db
      .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Alt Elev', '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    const res = await api.request('PATCH', `/api/admin/students/${row!.id}`, { fullName: 'Nume Nou' });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/admin/students/:id/ces', () => {
  it('marks a student as CES and the class list shows it, then takes the mark away', async () => {
    const created = await api.request('POST', '/api/admin/classes', { name: '9R2', schoolYear: 2026 });
    const classId = created.body.class.id as number;
    const added = await api.request('POST', `/api/admin/classes/${classId}/students`, { names: ['Bursașiu Teodor', 'Ene Ana'] });
    expect(added.body.students.map((s: { ces: boolean }) => s.ces)).toEqual([false, false]);
    const id = added.body.students[0].id as number;

    const marked = await api.request('PUT', `/api/admin/students/${id}/ces`, { ces: true });
    expect(marked.status).toBe(200);
    expect(marked.body.student).toEqual({ id, ces: true });
    const detail = await api.request('GET', `/api/admin/classes/${classId}`);
    const ces = Object.fromEntries(detail.body.students.map((s: { fullName: string; ces: boolean }) => [s.fullName, s.ces]));
    expect(ces).toEqual({ 'Bursașiu Teodor': true, 'Ene Ana': false });

    // Leaving the class keeps the mark.
    const left = await api.request('PATCH', `/api/admin/classes/${classId}/students/${id}`, { active: false });
    expect(left.body.student.ces).toBe(true);

    const unmarked = await api.request('PUT', `/api/admin/students/${id}/ces`, { ces: false });
    expect(unmarked.body.student).toEqual({ id, ces: false });
  });

  it('refuses a body without the mark', async () => {
    const res = await api.request('PUT', `/api/admin/students/${studentId}/ces`, { ces: 'da' });
    expect(res.status).toBe(400);
  });

  it('answers 404 for a student of another teacher', async () => {
    const otherId = await api.addTeacher('other-ces@example.com', 'Alt Profesor');
    const row = await api.db
      .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Alt Elev', '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    const res = await api.request('PUT', `/api/admin/students/${row!.id}/ces`, { ces: true });
    expect(res.status).toBe(404);
    const kept = await api.db.prepare('SELECT ces FROM students WHERE id = ?').bind(row!.id).first<{ ces: number }>();
    expect(kept!.ces).toBe(0);
  });
});
