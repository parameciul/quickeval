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
