import { Hono } from 'hono';
import { quickTryCreateBody, type QuickTryAvailability, type QuickTryCreated } from '../../shared/api.ts';
import { optionalTeacher } from '../auth/teacherAuth.ts';
import { createQuickTry, dailyLimitReached } from '../db/quickTry.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError } from '../errors.ts';
import { clientIpKey, nowIso, readJson, sameOriginWrites } from '../http.ts';
import { newDeviceSecret, newResultToken, randomBase32, sha256Hex } from '../secrets.ts';
import { verifyTurnstile } from '../turnstile.ts';

// The message for every used-up limit: a new account grades a whole class
// test for free, so that is the way on (never "unlimited").
const LIMIT_MESSAGE =
  'Limita de încercări gratuite pentru azi a fost atinsă. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.';

// /api/try: Quick Try, one free grading without an account (spec
// docs/superpowers/specs/2026-11-09-quick-try-design.md).
export function quickTryRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const verify = options.verifyTurnstile ?? ((env, token, ip) => verifyTurnstile(env, token, ip));
  routes.use('*', sameOriginWrites);

  routes.get('/availability', async (c) => {
    const teacher = await optionalTeacher(c);
    const admin = teacher?.role === 'admin';
    const answer: QuickTryAvailability = { dailyLimitReached: !admin && (await dailyLimitReached(c.env.DB, nowIso())), admin };
    return c.json(answer);
  });

  // A new try. An administrator skips Turnstile and the limits; everyone else
  // needs a Turnstile answer that Cloudflare accepts.
  routes.post('/', async (c) => {
    const body = await readJson(c, quickTryCreateBody, 8192);
    const teacher = await optionalTeacher(c);
    const admin = teacher?.role === 'admin';
    const ip = c.req.header('CF-Connecting-IP') ?? '';
    if (!admin && !(body.turnstileToken && (await verify(c.env, body.turnstileToken, ip)))) {
      throw new ApiError(403, 'not_human', 'Nu am putut verifica încercarea. Reîncarcă pagina și încearcă din nou.');
    }
    const token = randomBase32(32);
    const made = await createQuickTry(c.env.DB, {
      tokenHash: await sha256Hex(token),
      ipHash: await sha256Hex(clientIpKey(c)),
      byAdmin: admin,
      email: `try-${randomBase32(20)}@quick-try.invalid`,
      sessionHash: await sha256Hex(newDeviceSecret()),
      resultToken: newResultToken(),
      now: nowIso(),
    });
    if (made === 'ip_limit') throw new ApiError(429, 'quick_try_ip_limit', LIMIT_MESSAGE);
    if (made === 'daily_limit') throw new ApiError(429, 'quick_try_daily_limit', LIMIT_MESSAGE);
    return c.json({ token, code: made.code } satisfies QuickTryCreated, 201);
  });

  return routes;
}
