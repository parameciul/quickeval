import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi | undefined;

afterEach(async () => {
  await api?.dispose();
  api = undefined;
});

describe('GET /api/admin/me', () => {
  it('returns the teacher of the local development login', async () => {
    api = await startTestApi();
    const res = await api.request('GET', '/api/admin/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      teacher: { id: api.teacherId, email: 'profesor@example.com', name: 'Laura Miron', role: 'admin', demo: false, testsEvaluated: 0, papersGraded: 0, papersWaiting: 0 },
    });
  });

  it('refuses a login email that is not a teacher', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: 'stranger@example.com' } });
    const res = await api.request('GET', '/api/admin/me');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('unknown_teacher');
  });

  it('refuses the development login of an account that waits for approval', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: 'nou@example.com' } });
    await api.db
      .prepare("INSERT INTO teachers (email, name, created_at, status) VALUES ('nou@example.com', 'Nou', '2026-10-06', 'pending')")
      .run();
    expect((await api.request('GET', '/api/admin/me')).body.error).toBe('unknown_teacher');
  });

  it('ignores the development login on a real host and asks to log in', async () => {
    api = await startTestApi();
    const res = await createApp().request('https://quickeval.pages.dev/api/admin/me', {}, api.env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'login_required', message: 'Intră în cont ca să continui.' });
  });

  it('accepts the development login on 127.0.0.1 too', async () => {
    api = await startTestApi();
    const res = await createApp().request('http://127.0.0.1/api/admin/me', {}, api.env);
    expect(res.status).toBe(200);
  });

  it('asks to log in when nothing is configured and no cookie is sent', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined } });
    const res = await api.request('GET', '/api/admin/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('login_required');
  });
});

describe('admin API protections', () => {
  it('refuses a write that comes from another site', async () => {
    api = await startTestApi();
    const res = await api.request('POST', '/api/admin/me', {}, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('cross_site');
  });

  it('refuses a write marked cross-site by the browser', async () => {
    api = await startTestApi();
    const res = await api.request('POST', '/api/admin/me', {}, { 'Sec-Fetch-Site': 'cross-site' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('cross_site');
  });

  it('answers unknown admin paths with a JSON 404', async () => {
    api = await startTestApi();
    const res = await api.request('GET', '/api/admin/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
