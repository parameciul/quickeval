import type { Context, MiddlewareHandler } from 'hono';
import { findTeacherByEmail } from '../db/teachers.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { verifyAccessJwt } from './access.ts';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// The email of the person who made the request. Production: the Cloudflare
// Access token, checked again here because Access runs before this code.
// Local development: DEV_TEACHER_EMAIL from .dev.vars, but only for requests
// to localhost, so the setting can never open the live site.
async function loginEmail(c: Context<AppEnv>): Promise<string> {
  const devEmail = c.env.DEV_TEACHER_EMAIL?.trim().toLowerCase();
  if (devEmail && LOCAL_HOSTS.has(new URL(c.req.url).hostname)) return devEmail;

  const teamDomain = (c.env.ACCESS_TEAM_DOMAIN ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const aud = (c.env.ACCESS_AUD ?? '').trim();
  if (!teamDomain || !aud) {
    throw new ApiError(500, 'access_not_configured', 'Autentificarea nu este configurată: lipsesc ACCESS_TEAM_DOMAIN sau ACCESS_AUD.');
  }
  const result = await verifyAccessJwt(c.req.header('Cf-Access-Jwt-Assertion'), { teamDomain, aud });
  if (!result.ok) throw new ApiError(403, 'access_denied', result.message);
  return result.email;
}

// Puts the logged-in teacher in c.var.teacher, or refuses the request.
export function teacherAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const email = await loginEmail(c);
    const teacher = await findTeacherByEmail(c.env.DB, email);
    if (!teacher) throw new ApiError(403, 'unknown_teacher', 'Contul tău nu are acces la QuickEval.');
    c.set('teacher', teacher);
    await next();
  };
}
