import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

describe('splitSql', () => {
  it('splits on semicolons at line ends and drops comment lines', () => {
    expect(splitSql('-- note\nCREATE TABLE a (x INTEGER);\n\nCREATE INDEX a_x ON a (x);\n')).toEqual([
      'CREATE TABLE a (x INTEGER)',
      'CREATE INDEX a_x ON a (x)',
    ]);
  });
});
