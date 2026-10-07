import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { splitSql, startTestApi, type TestApi } from './test/testApi.ts';

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.dispose();
});

describe('API app', () => {
  it('answers unknown paths with a JSON 404', async () => {
    const res = await api.request('GET', '/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found', message: 'Nu am găsit ce cauți.' });
  });

  it('marks every answer as not cacheable and not to be sniffed', async () => {
    for (const path of ['/api/admin/me', '/api/nothing-here']) {
      const res = await api.request('GET', path);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('answers an unexpected error with a Romanian 500, with the same headers', async () => {
    const app = createApp();
    // createApp() sets the base path /api, so this route answers /api/boom.
    app.get('/boom', () => {
      throw new Error('database exploded');
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('http://localhost/api/boom', {}, api.env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal', message: 'A apărut o eroare. Încearcă din nou.' });
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(errors).toHaveBeenCalledWith('API error:', 'database exploded');
    errors.mockRestore();
  });

  it('keeps a Cache-Control header that a route sets itself', async () => {
    const app = createApp();
    app.get('/cached', (c) => c.json({ ok: true }, 200, { 'Cache-Control': 'private, max-age=60' }));
    const res = await app.request('http://localhost/api/cached', {}, api.env);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=60');
  });
});

describe('test helper', () => {
  it('lets a lowercase content-type header replace the JSON default', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6E2', schoolYear: 2026 }, { 'content-type': 'text/plain' });
    expect(res.status).toBe(415);
  });
});

describe('test database', () => {
  it('has the migrations applied and one teacher', async () => {
    const teacher = await api.db
      .prepare('SELECT email FROM teachers WHERE id = ?')
      .bind(api.teacherId)
      .first<{ email: string }>();
    expect(teacher?.email).toBe('profesor@example.com');
    const tables = await api.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all<{ name: string }>();
    expect(tables.results.map((table) => table.name)).toEqual(
      expect.arrayContaining(['teachers', 'classes', 'students', 'enrollments']),
    );
  });
});

describe('teachers table', () => {
  it('refuses an email with capital letters and accepts a lowercase one', async () => {
    await expect(api.addTeacher('Mixed@Example.com', 'X')).rejects.toThrow(/CHECK constraint failed/);
    await expect(api.addTeacher('second@example.com', 'Y')).resolves.toEqual(expect.any(Number));
  });
});

describe('splitSql', () => {
  it('splits on semicolons at line ends and drops comment lines', () => {
    expect(splitSql('-- note\nCREATE TABLE a (x INTEGER);\n\nCREATE INDEX a_x ON a (x);\n')).toEqual([
      'CREATE TABLE a (x INTEGER)',
      'CREATE INDEX a_x ON a (x)',
    ]);
  });
});
