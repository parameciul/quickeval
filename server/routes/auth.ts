import { Hono } from 'hono';
import { loginBody, signupBody } from '../../shared/api.ts';
import { clearSessionCookie, deviceToken, SESSION_DAYS, sessionToken, setDeviceCookie, setSessionCookie } from '../auth/session.ts';
import {
  adminEmails,
  createAccount,
  createSession,
  deleteSession,
  findTeacherBySession,
  takeDeviceAttempt,
  takeLoginAttempt,
} from '../db/accounts.ts';
import { emailSender } from '../email.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError } from '../errors.ts';
import { nowIso, readJson, sameOriginWrites } from '../http.ts';
import { hashPassword, verifyPassword } from '../passwords.ts';
import { newSessionToken, sha256Hex } from '../secrets.ts';

const BODY_LIMIT = 4096;

// One answer for a wrong password, an unknown email, and a locked account, so
// the login tells nobody which emails have an account.
const wrongLogin = () =>
  new ApiError(401, 'wrong_login', 'Emailul sau parola nu sunt corecte. După 10 încercări greșite, contul se blochează 15 minute.');

// Checked for an unknown email or a locked account, so the answer takes as long as a wrong password's.
const NO_ACCOUNT_HASH = 'pbkdf2-sha256$30000$zEE+CEDfhgSxGzKY6jIYxA==$g8IQX+dlbPg7DmYMX95oKyfcUZx7RvMD6aiAwPGnl4w=';

// /api/auth: the login page of the teacher app. No login needed here.
export function authRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const sendEmail = emailSender(options);
  routes.use('*', sameOriginWrites);

  // A new teacher asks for an account. It is a demo account and waits until an
  // administrator approves it on Setări; the administrators get an email. An
  // email that already has an account gets the same answer and changes
  // nothing, so the form tells nobody which emails have an account.
  routes.post('/signup', async (c) => {
    const body = await readJson(c, signupBody, BODY_LIMIT);
    const now = nowIso();
    // Cloudflare sets CF-Connecting-IP; only its hash is kept, and only while the account waits.
    const ipHash = await sha256Hex(c.req.header('CF-Connecting-IP') ?? '');
    const passwordHash = await hashPassword(body.password);
    const created = await createAccount(c.env.DB, { name: body.name, email: body.email, passwordHash, ipHash }, now);
    if (created === 'too_many') {
      throw new ApiError(429, 'too_many_pending', 'Sunt prea multe cereri de cont. Încearcă din nou mâine.');
    }
    if (created === 'created') {
      const settingsUrl = `${new URL(c.req.url).origin}/admin/setari`;
      await sendEmail(c.env, {
        to: await adminEmails(c.env.DB),
        subject: 'QuickEval: cont nou de aprobat',
        text: [
          'Un profesor a cerut un cont în QuickEval:',
          '',
          `Nume: ${body.name}`,
          `Email: ${body.email}`,
          '',
          `Aprobă sau refuză contul pe pagina Setări: ${settingsUrl}`,
        ].join('\n'),
      });
    }
    return c.json({ status: 'pending' }, 201);
  });

  routes.post('/login', async (c) => {
    const body = await readJson(c, loginBody, BODY_LIMIT);
    const now = nowIso();
    const device = deviceToken(c);
    const deviceHash = device ? await sha256Hex(device) : null;
    const throughDevice = deviceHash ? await takeDeviceAttempt(c.env.DB, body.email, deviceHash, now) : null;
    const login = throughDevice ?? (await takeLoginAttempt(c.env.DB, body.email, now));
    if (login === null || login === 'locked') {
      await verifyPassword(body.password, NO_ACCOUNT_HASH);
      throw wrongLogin();
    }
    if (!(await verifyPassword(body.password, login.password_hash))) throw wrongLogin();
    if (login.status === 'pending') {
      throw new ApiError(403, 'account_pending', 'Contul tău așteaptă aprobarea unui administrator. Vei primi acces după aprobare.');
    }
    if (login.status === 'disabled') throw new ApiError(403, 'account_disabled', 'Contul tău a fost închis. Scrie unui administrator.');

    const token = newSessionToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.parse(now) + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    // A browser without a known mark gets a new one: a mark from another
    // account, or one that used up its attempts, is not reused.
    const newDevice = throughDevice ? null : newSessionToken();
    const knownDevice = newDevice ? { hash: await sha256Hex(newDevice), known: false } : { hash: deviceHash!, known: true };
    await createSession(c.env.DB, { teacherId: login.id, tokenHash, expiresAt, device: knownDevice }, now);
    setSessionCookie(c, token);
    if (newDevice) setDeviceCookie(c, newDevice);
    return c.json({ teacher: await findTeacherBySession(c.env.DB, tokenHash, now) });
  });

  routes.post('/logout', async (c) => {
    const token = sessionToken(c);
    if (token) await deleteSession(c.env.DB, await sha256Hex(token));
    clearSessionCookie(c);
    return c.json({ loggedOut: true });
  });

  return routes;
}
