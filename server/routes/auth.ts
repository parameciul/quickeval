import { Hono } from 'hono';
import { loginBody, signupBody } from '../../shared/api.ts';
import { clearSessionCookie, SESSION_DAYS, sessionToken, setSessionCookie } from '../auth/session.ts';
import { adminEmails, createAccount, createSession, deleteSession, findTeacherBySession, takeLoginAttempt } from '../db/accounts.ts';
import { emailSender } from '../email.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError } from '../errors.ts';
import { nowIso, readJson, sameOriginWrites } from '../http.ts';
import { hashPassword, verifyPassword } from '../passwords.ts';
import { newSessionToken, sha256Hex } from '../secrets.ts';

const BODY_LIMIT = 4096;

const wrongLogin = () => new ApiError(401, 'wrong_login', 'Emailul sau parola nu sunt corecte.');

// Checked for an unknown email, so its answer takes as long as a wrong password's.
const NO_ACCOUNT_HASH = 'pbkdf2-sha256$30000$zEE+CEDfhgSxGzKY6jIYxA==$g8IQX+dlbPg7DmYMX95oKyfcUZx7RvMD6aiAwPGnl4w=';

// /api/auth: the login page of the teacher app. No login needed here.
export function authRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const sendEmail = emailSender(options);
  routes.use('*', sameOriginWrites);

  // A new teacher asks for an account. It is a demo account and waits until an
  // administrator approves it on Setări; the administrators get an email.
  routes.post('/signup', async (c) => {
    const body = await readJson(c, signupBody, BODY_LIMIT);
    const now = nowIso();
    const created = await createAccount(c.env.DB, { name: body.name, email: body.email, passwordHash: await hashPassword(body.password) }, now);
    if (created === 'email_taken') throw new ApiError(409, 'email_taken', 'Există deja un cont cu acest email. Intră în cont.');
    if (created === 'too_many') {
      throw new ApiError(429, 'too_many_pending', 'Sunt prea multe conturi care așteaptă aprobarea. Încearcă din nou mai târziu.');
    }
    const settingsUrl = `${new URL(c.req.url).origin}/admin/setari`;
    await sendEmail(c.env, {
      to: await adminEmails(c.env.DB),
      subject: `QuickEval: cont nou de aprobat (${body.name})`,
      text: [
        'Un profesor a cerut un cont în QuickEval:',
        '',
        `Nume: ${body.name}`,
        `Email: ${body.email}`,
        '',
        `Aprobă sau refuză contul pe pagina Setări: ${settingsUrl}`,
      ].join('\n'),
    });
    return c.json({ status: 'pending' }, 201);
  });

  routes.post('/login', async (c) => {
    const body = await readJson(c, loginBody, BODY_LIMIT);
    const now = nowIso();
    const login = await takeLoginAttempt(c.env.DB, body.email, now);
    if (login === 'locked') throw new ApiError(429, 'locked', 'Prea multe încercări greșite. Încearcă din nou peste 15 minute.');
    if (!login) {
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
    await createSession(c.env.DB, login.id, tokenHash, now, expiresAt);
    setSessionCookie(c, token);
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
