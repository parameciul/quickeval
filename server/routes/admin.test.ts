import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { clearCertCache } from '../auth/access.ts';
import { makeAccessSigner } from '../test/accessSigner.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

const ACCESS_ENV = { ACCESS_TEAM_DOMAIN: 'school.cloudflareaccess.com', ACCESS_AUD: 'aud' };

let api: TestApi | undefined;

// Answers the Access key download; every other request (the local D1 engine) goes through.
function mockAccessCerts(answer: () => Response) {
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
    String(input instanceof Request ? input.url : input).includes('cloudflareaccess.com/cdn-cgi/access/certs') ? answer() : realFetch(input, init),
  );
}

beforeEach(() => clearCertCache());

afterEach(async () => {
  vi.restoreAllMocks();
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
    api = await startTestApi({ env: ACCESS_ENV });
    const res = await createApp().request('https://quickeval.pages.dev/api/admin/me', {}, api.env);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'access_denied', message: 'Lipsește autentificarea.' });
  });

  it('accepts the development login on 127.0.0.1 too', async () => {
    api = await startTestApi();
    const res = await createApp().request('http://127.0.0.1/api/admin/me', {}, api.env);
    expect(res.status).toBe(200);
  });

  it('accepts a valid Access token on a real host', async () => {
    api = await startTestApi({ env: ACCESS_ENV });
    const signer = await makeAccessSigner();
    mockAccessCerts(() => Response.json({ keys: [signer.publicJwk] }));
    const token = await signer.sign({
      email: 'Profesor@Example.com',
      aud: ['aud'],
      iss: 'https://school.cloudflareaccess.com',
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const res = await createApp().request(
      'https://quickeval.pages.dev/api/admin/me',
      { headers: { 'Cf-Access-Jwt-Assertion': token } },
      api.env,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).teacher.email).toBe('profesor@example.com');
  });

  it('answers 503 when the Access keys cannot be downloaded', async () => {
    api = await startTestApi({ env: ACCESS_ENV });
    const signer = await makeAccessSigner();
    mockAccessCerts(() => new Response('down', { status: 503 }));
    const token = await signer.sign({ email: 'profesor@example.com', aud: ['aud'], exp: Math.floor(Date.now() / 1000) + 600 });
    const res = await createApp().request(
      'https://quickeval.pages.dev/api/admin/me',
      { headers: { 'Cf-Access-Jwt-Assertion': token } },
      api.env,
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'access_unavailable', message: 'Nu pot verifica autentificarea acum.' });
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
