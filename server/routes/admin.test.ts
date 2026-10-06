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
    expect(res.body).toEqual({ teacher: { id: api.teacherId, email: 'profesor@example.com', name: 'Laura Miron' } });
  });

  it('refuses a login email that is not a teacher', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: 'stranger@example.com' } });
    const res = await api.request('GET', '/api/admin/me');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('unknown_teacher');
  });

  it('ignores the development login on a real host and asks for Access', async () => {
    api = await startTestApi({ env: { ACCESS_TEAM_DOMAIN: 'school.cloudflareaccess.com', ACCESS_AUD: 'aud' } });
    const res = await createApp().request('https://quickeval.pages.dev/api/admin/me', {}, api.env);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'access_denied', message: 'Lipsește autentificarea.' });
  });

  it('names the missing Access settings when nothing is configured', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined } });
    const res = await api.request('GET', '/api/admin/me');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('access_not_configured');
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
