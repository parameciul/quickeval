import { Hono, type Context, type Handler, type MiddlewareHandler } from 'hono';
import { startViewBody } from '../../shared/api.ts';
import { clearViewCookie, sessionToken, setViewCookie } from '../auth/session.ts';
import { getPasswordHash, takePasswordCheck } from '../db/accounts.ts';
import { endView, startView } from '../db/impersonations.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';
import { verifyPassword } from '../passwords.ts';
import { newSessionToken, sha256Hex } from '../secrets.ts';

const BODY_LIMIT = 4096;

export function readOnlyError(): ApiError {
  return new ApiError(403, 'impersonation_read_only', 'Doar citire: nu poți schimba nimic în contul altui profesor.');
}

// True while the request runs in a view that may not change anything. Routers
// that do not run teacherAuth() leave the view unset.
export function viewOnly(c: Context<AppEnv>): boolean {
  return c.var.viewing?.viewing.mode === 'view';
}

const READ_METHODS = new Set(['GET', 'HEAD']);
const EXIT_PATH = '/api/admin/impersonation';

// In a view, every method that is not a read is refused before routing, so no
// route has to know about views. The one exception is leaving the view.
export const viewReadOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (viewOnly(c) && !READ_METHODS.has(c.req.method)) {
    const path = new URL(c.req.url).pathname.replace(/\/+$/, '');
    if (!(c.req.method === 'DELETE' && path === EXIT_PATH)) throw readOnlyError();
  }
  await next();
};

// POST /api/admin/accounts/:id/impersonation (mounted in routes/accounts.ts,
// behind adminOnly): the administrator types their own password again and
// gets a view of an active teacher's account for one hour. The password counts
// as an attempt of the administrator's account, like the one on "Contul meu".
export const startViewHandler: Handler<AppEnv> = async (c) => {
  if (c.var.viewing) throw readOnlyError();
  const session = sessionToken(c);
  if (!session) throw new ApiError(400, 'view_needs_login', 'Vizualizarea are nevoie de intrarea cu parola.');
  const teacherId = parseId(c.req.param('id'));
  const body = await readJson(c, startViewBody, BODY_LIMIT);
  const adminId = c.var.teacher.id;
  const now = nowIso();
  if (!(await takePasswordCheck(c.env.DB, adminId, now))) {
    throw new ApiError(429, 'too_many_tries', 'Prea multe încercări greșite. Încearcă din nou peste 15 minute.');
  }
  if (!(await verifyPassword(body.password, await getPasswordHash(c.env.DB, adminId)))) {
    throw new ApiError(400, 'wrong_password', 'Parola ta nu este corectă.');
  }
  const token = newSessionToken();
  const viewing = await startView(
    c.env.DB,
    { adminId, teacherId, sessionHash: await sha256Hex(session), tokenHash: await sha256Hex(token), mode: body.mode },
    now,
  );
  if (!viewing) throw new ApiError(409, 'cannot_view', 'Poți vedea doar contul activ al unui profesor.');
  setViewCookie(c, token);
  return c.json({ viewing }, 201);
};

// /api/admin/impersonation: the administrator leaves the view.
export function impersonationRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.delete('/', async (c) => {
    if (c.var.viewing) await endView(c.env.DB, c.var.viewing.tokenHash, nowIso());
    clearViewCookie(c);
    return c.json({ ended: true });
  });
  return routes;
}
