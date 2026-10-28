import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../env.ts';

// The login cookie: a random token, sent only to /api, never readable by
// scripts. SameSite=Lax and the same-origin check on writes keep other sites
// out. Secure on https; local development runs on http.
export const SESSION_COOKIE = 'qe_session';
export const SESSION_DAYS = 30;
const PATH = '/api';

function isHttps(c: Context<AppEnv>): boolean {
  return new URL(c.req.url).protocol === 'https:';
}

export function sessionToken(c: Context<AppEnv>): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function setSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    path: PATH,
    httpOnly: true,
    secure: isHttps(c),
    sameSite: 'Lax',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: PATH, httpOnly: true, secure: isHttps(c), sameSite: 'Lax' });
}
