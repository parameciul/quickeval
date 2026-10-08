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
      expect.arrayContaining([
        'teachers',
        'classes',
        'students',
        'enrollments',
        'tests',
        'submissions',
        'submission_files',
        'evaluations',
        'evaluation_items',
        'settings',
        'runner_state',
      ]),
    );
  });

  it('deletes the uploads and their file rows together with a test', async () => {
    const db = api.db;
    const cls = await db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, 'C1', 2026, 't') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const student = await db
      .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Pop Ion', 't') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const test = await db
      .prepare(
        "INSERT INTO tests (teacher_id, class_id, number, code, title, created_at, updated_at) VALUES (?, ?, 1, 'C1-26T1', 'T', 't', 't') RETURNING id",
      )
      .bind(api.teacherId, cls!.id)
      .first<{ id: number }>();
    const submission = await db
      .prepare("INSERT INTO submissions (test_id, student_id, status, started_at) VALUES (?, ?, 'uploading', 't') RETURNING id")
      .bind(test!.id, student!.id)
      .first<{ id: number }>();
    await db
      .prepare(
        "INSERT INTO submission_files (submission_id, r2_key, original_name, content_type, size, position, created_at) VALUES (?, 'k', 'a.jpg', 'image/jpeg', 1, 1, 't')",
      )
      .bind(submission!.id)
      .run();

    await db.prepare('DELETE FROM tests WHERE id = ?').bind(test!.id).run();
    const left = await db
      .prepare('SELECT (SELECT COUNT(*) FROM submissions) AS submissions, (SELECT COUNT(*) FROM submission_files) AS files')
      .first<{ submissions: number; files: number }>();
    expect(left).toEqual({ submissions: 0, files: 0 });
  });

  it('refuses a test status outside the known ones', async () => {
    const cls = await api.db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, 'C2', 2026, 't') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const insert = api.db
      .prepare(
        "INSERT INTO tests (teacher_id, class_id, number, code, title, status, created_at, updated_at) VALUES (?, ?, 1, 'C2-26T1', 'T', 'lost', 't', 't')",
      )
      .bind(api.teacherId, cls!.id);
    await expect(insert.run()).rejects.toThrow(/CHECK constraint failed/);
  });

  it('deletes a grading and its items together with the upload', async () => {
    const db = api.db;
    const cls = await db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, 'C3', 2026, 't') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const student = await db
      .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Pop Ana', 't') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const test = await db
      .prepare(
        "INSERT INTO tests (teacher_id, class_id, number, code, title, created_at, updated_at) VALUES (?, ?, 1, 'C3-26T1', 'T', 't', 't') RETURNING id",
      )
      .bind(api.teacherId, cls!.id)
      .first<{ id: number }>();
    const submission = await db
      .prepare("INSERT INTO submissions (test_id, student_id, status, started_at) VALUES (?, ?, 'graded', 't') RETURNING id")
      .bind(test!.id, student!.id)
      .first<{ id: number }>();
    const evaluation = await db
      .prepare(
        `INSERT INTO evaluations (submission_id, max_total, office_points, total, grade, needs_review, summary,
           strengths_json, recommendations_json, unreadable_json, raw_json, created_at, updated_at)
         VALUES (?, 10, 1, 9, 9, 0, 'S', '[]', '[]', '[]', '{}', 't', 't') RETURNING id`,
      )
      .bind(submission!.id)
      .first<{ id: number }>();
    await db
      .prepare(
        `INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason)
         VALUES (?, 'I.1', 1, 'L', 9, 8, 8, 'a', 'c', 'high', 0, '')`,
      )
      .bind(evaluation!.id)
      .run();

    await db.prepare('DELETE FROM submissions WHERE id = ?').bind(submission!.id).run();
    const left = await db
      .prepare('SELECT (SELECT COUNT(*) FROM evaluations) AS evaluations, (SELECT COUNT(*) FROM evaluation_items) AS items')
      .first<{ evaluations: number; items: number }>();
    expect(left).toEqual({ evaluations: 0, items: 0 });
  });

  it('has exactly one robot state row', async () => {
    const rows = await api.db.prepare('SELECT id, run_id FROM runner_state').all<{ id: number; run_id: string | null }>();
    expect(rows.results).toEqual([{ id: 1, run_id: null }]);
    await expect(api.db.prepare('INSERT INTO runner_state (id) VALUES (2)').run()).rejects.toThrow(/CHECK constraint failed/);
  });

  it('has a file bucket', async () => {
    await api.env.FILES.put('probe.txt', 'ok');
    expect(await (await api.env.FILES.get('probe.txt'))?.text()).toBe('ok');
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
