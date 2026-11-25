import type { Context, MiddlewareHandler } from 'hono';
import type { Teacher } from '../../shared/api.ts';
import { findActiveTeacherByEmail, findTeacherBySession } from '../db/accounts.ts';
import { closeDeadView, findView } from '../db/impersonations.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { nowIso } from '../http.ts';
import { sha256Hex } from '../secrets.ts';
import { clearViewCookie, sessionToken, viewToken } from './session.ts';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// The logged-in teacher. Production: the login cookie (routes/auth.ts) of an
// active account. Local development: DEV_TEACHER_EMAIL from .dev.vars, but
// only for requests to localhost, so the setting can never open the live site.
async function loggedInTeacher(c: Context<AppEnv>): Promise<Teacher> {
  const devEmail = c.env.DEV_TEACHER_EMAIL?.trim().toLowerCase();
  if (devEmail && LOCAL_HOSTS.has(new URL(c.req.url).hostname)) {
    const teacher = await findActiveTeacherByEmail(c.env.DB, devEmail);
    if (!teacher) throw new ApiError(403, 'unknown_teacher', 'Contul tău nu are acces la MQGrader.');
    return teacher;
  }
  const token = sessionToken(c);
  const teacher = token ? await findTeacherBySession(c.env.DB, await sha256Hex(token), nowIso()) : null;
  if (!teacher) throw new ApiError(401, 'login_required', 'Intră în cont ca să continui.');
  return teacher;
}

// The logged-in teacher, or null for a visitor who is not logged in.
export async function optionalTeacher(c: Context<AppEnv>): Promise<Teacher | null> {
  try {
    return await loggedInTeacher(c);
  } catch (err) {
    if (err instanceof ApiError) return null;
    throw err;
  }
}

// Puts the logged-in teacher in c.var.teacher, or refuses the request.
export function teacherAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const real = await loggedInTeacher(c);
    c.set('viewing', null);
    const view = viewToken(c);
    // The page's claim of the view it shows (X-MQ-View: its id, or "none"). A
    // tab that still shows a view the cookie no longer carries must not be
    // served as the administrator under it. No header, "none" or anything else
    // that is not an id: no claim.
    const claimed = /^[1-9][0-9]{0,9}$/.test(c.req.header('X-MQ-View') ?? '') ? Number(c.req.header('X-MQ-View')) : null;
    const ended = () => new ApiError(409, 'impersonation_ended', 'Vizualizarea contului s-a încheiat.');
    if (!view) {
      if (claimed !== null) throw ended();
      c.set('teacher', real);
      await next();
      return;
    }
    // Only an administrator can be viewing. A cookie left in a browser where
    // someone else logged in since is dropped, and the request goes on as that
    // person.
    if (real.role !== 'admin') {
      const owner = await closeDeadView(c.env.DB, await sha256Hex(view), nowIso());
      clearViewCookie(c);
      // The administrator's own view, left open when they stopped being one.
      if (owner === real.id || claimed !== null) throw ended();
      c.set('teacher', real);
      await next();
      return;
    }
    // A view belongs to the administrator's own login session, so the
    // development login (no session cookie) never has one.
    const session = sessionToken(c);
    const tokenHash = await sha256Hex(view);
    const now = nowIso();
    const found = session ? await findView(c.env.DB, tokenHash, await sha256Hex(session), now) : null;
    if (!found || found.adminId !== real.id) {
      await closeDeadView(c.env.DB, tokenHash, now);
      clearViewCookie(c);
      throw ended();
    }
    // A live view, but not the one this tab shows; the cookie stays.
    if (claimed !== null && claimed !== found.viewing.id) throw ended();
    c.set('teacher', found.teacher);
    c.set('viewing', { viewing: found.viewing, adminId: found.adminId, tokenHash });
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
