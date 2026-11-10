import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUICK_TRY_DAILY_LIMIT, QUICK_TRY_IP_LIMIT, isQuickTryToken } from '../../shared/quickTry.ts';
import { sha256Hex } from '../secrets.ts';
import { verifyTurnstile } from '../turnstile.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

afterEach(async () => {
  await api.dispose();
});

// A visitor who is not logged in (no DEV_TEACHER_EMAIL), with a Turnstile
// check that accepts the answer "ok".
async function visitorApi() {
  const verify = vi.fn(async (_env: unknown, token: string) => token === 'ok');
  api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { verifyTurnstile: verify } });
  return verify;
}

const create = (body: unknown = { turnstileToken: 'ok' }, ip = '203.0.113.5') =>
  api.request('POST', '/api/try', body, { 'CF-Connecting-IP': ip });

describe('POST /api/try', () => {
  it('makes a try and answers with its link token and test code', async () => {
    const verify = await visitorApi();
    const res = await create();
    expect(res.status).toBe(201);
    expect(isQuickTryToken(res.body.token)).toBe(true);
    expect(res.body.code).toMatch(/^PROBA-\d{2}T1$/);
    expect(verify).toHaveBeenCalledWith(expect.anything(), 'ok', '203.0.113.5');
    const row = await api.db
      .prepare('SELECT ip_hash, by_admin FROM quick_tries WHERE token_hash = ?')
      .bind(await sha256Hex(res.body.token))
      .first();
    expect(row).toEqual({ ip_hash: await sha256Hex('203.0.113.5'), by_admin: 0 });
  });

  it("names the try's test with the name it gets, or with the default name", async () => {
    await visitorApi();
    const title = async (token: string) =>
      (
        await api.db
          .prepare('SELECT t.title FROM tests t JOIN quick_tries q ON q.teacher_id = t.teacher_id WHERE q.token_hash = ?')
          .bind(await sha256Hex(token))
          .first<{ title: string }>()
      )!.title;
    const named = await create({ turnstileToken: 'ok', title: '  Test   funcții 9B ' });
    expect(named.status).toBe(201);
    expect(await title(named.body.token)).toBe('Test funcții 9B');
    expect(await title((await create({ turnstileToken: 'ok', title: '   ' }, '203.0.113.6')).body.token)).toBe('Încercare rapidă');
    expect(await title((await create({ turnstileToken: 'ok' }, '203.0.113.7')).body.token)).toBe('Încercare rapidă');
    const long = await create({ turnstileToken: 'ok', title: 'x'.repeat(500) }, '203.0.113.8');
    expect(long.status).toBe(400);
  });

  it('refuses a visitor without a Turnstile answer, or with one Cloudflare refuses', async () => {
    await visitorApi();
    for (const body of [{}, { turnstileToken: 'bot' }]) {
      const res = await create(body);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('not_human');
    }
    expect((await api.db.prepare('SELECT COUNT(*) AS n FROM quick_tries').first<{ n: number }>())!.n).toBe(0);
  });

  it('refuses a cross-site request', async () => {
    await visitorApi();
    const res = await api.request('POST', '/api/try', { turnstileToken: 'ok' }, { 'Sec-Fetch-Site': 'cross-site' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('cross_site');
  });

  it(`refuses the ${QUICK_TRY_IP_LIMIT + 1}th try of one IP with the account message`, async () => {
    await visitorApi();
    for (let i = 0; i < QUICK_TRY_IP_LIMIT; i++) expect((await create()).status).toBe(201);
    const res = await create();
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('quick_try_ip_limit');
    expect(res.body.message).toContain('creează un cont: corectezi gratuit un test pentru toată clasa');
    expect(res.body.message).not.toMatch(/nelimitat/i);
    expect((await create(undefined, '203.0.113.6')).status).toBe(201);
  });

  it('refuses every visitor once the day is full', async () => {
    await visitorApi();
    for (let i = 0; i < QUICK_TRY_DAILY_LIMIT; i++) expect((await create(undefined, `198.51.100.${i}`)).status).toBe(201);
    const res = await create(undefined, '192.0.2.1');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('quick_try_daily_limit');
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: true, admin: false, signedIn: false, siteKey: null });
  });

  it('lets an administrator skip Turnstile and the limits', async () => {
    const verify = vi.fn(async () => false);
    api = await startTestApi({ app: { verifyTurnstile: verify } });
    for (let i = 0; i < QUICK_TRY_IP_LIMIT + 1; i++) expect((await create({})).status).toBe(201);
    expect(verify).not.toHaveBeenCalled();
    const counted = await api.db.prepare('SELECT COUNT(*) AS n FROM quick_tries WHERE by_admin = 0').first<{ n: number }>();
    expect(counted!.n).toBe(0);
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: false, admin: true, signedIn: true, siteKey: null });
  });

  it('does not count a teacher who is not an administrator as one', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: 'altul@example.com' }, app: { verifyTurnstile: async () => false } });
    await api.addTeacher('altul@example.com', 'Alt Profesor');
    expect((await create({})).status).toBe(403);
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: false, admin: false, signedIn: true, siteKey: null });
  });
});

describe('verifyTurnstile', () => {
  const env = (secret?: string) => ({ TURNSTILE_SECRET_KEY: secret }) as Parameters<typeof verifyTurnstile>[0];

  it('asks Cloudflare with the secret, the answer and the IP', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json({ success: true }));
    expect(await verifyTurnstile(env('secret'), 'answer', '203.0.113.5', fetchImpl as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const form = init!.body as FormData;
    expect([form.get('secret'), form.get('response'), form.get('remoteip')]).toEqual(['secret', 'answer', '203.0.113.5']);
  });

  it('says no without a secret, for a refused answer, an error status, or a failed request', async () => {
    const answer = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as unknown as typeof fetch;
    expect(await verifyTurnstile(env(), 'a', '', answer({ success: true }))).toBe(false);
    expect(await verifyTurnstile(env('s'), 'a', '', answer({ success: false }))).toBe(false);
    expect(await verifyTurnstile(env('s'), 'a', '', answer({ success: true }, 500))).toBe(false);
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile(env('s'), 'a', '', failing)).toBe(false);
  });
});
