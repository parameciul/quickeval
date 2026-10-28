import type { Context, MiddlewareHandler } from 'hono';
import type { Teacher } from '../../shared/api.ts';
import { findActiveTeacherByEmail, findTeacherBySession } from '../db/accounts.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { nowIso } from '../http.ts';
import { sha256Hex } from '../secrets.ts';
import { sessionToken } from './session.ts';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// The logged-in teacher. Production: the login cookie (routes/auth.ts) of an
// active account. Local development: DEV_TEACHER_EMAIL from .dev.vars, but
// only for requests to localhost, so the setting can never open the live site.
async function loggedInTeacher(c: Context<AppEnv>): Promise<Teacher> {
  const devEmail = c.env.DEV_TEACHER_EMAIL?.trim().toLowerCase();
  if (devEmail && LOCAL_HOSTS.has(new URL(c.req.url).hostname)) {
    const teacher = await findActiveTeacherByEmail(c.env.DB, devEmail);
    if (!teacher) throw new ApiError(403, 'unknown_teacher', 'Contul tău nu are acces la QuickEval.');
    return teacher;
  }
  const token = sessionToken(c);
  const teacher = token ? await findTeacherBySession(c.env.DB, await sha256Hex(token), nowIso()) : null;
  if (!teacher) throw new ApiError(401, 'login_required', 'Intră în cont ca să continui.');
  return teacher;
}

// Puts the logged-in teacher in c.var.teacher, or refuses the request.
export function teacherAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('teacher', await loggedInTeacher(c));
    await next();
  };
}

// Setări and the accounts are for the administrators only.
export function requireAdmin(c: Context<AppEnv>): void {
  if (c.var.teacher.role !== 'admin') {
    throw new ApiError(403, 'admin_only', 'Doar administratorii au acces aici.');
  }
}

export const adminOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  requireAdmin(c);
  await next();
};
