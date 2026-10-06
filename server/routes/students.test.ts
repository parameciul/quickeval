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
