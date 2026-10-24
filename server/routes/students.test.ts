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
