import { Hono } from 'hono';
import { confirmEmailBody, loginBody, signupBody } from '../../shared/api.ts';
import { clearSessionCookie, deviceToken, SESSION_DAYS, sessionToken, setDeviceCookie, setSessionCookie } from '../auth/session.ts';
import {
  adminEmails,
  confirmEmail,
  CONFIRM_HOURS,
  createAccount,
  createSession,
  deleteSession,
  findTeacherBySession,
  findUnconfirmed,
  forgetFailedLogins,
  giveBackIpAttempt,
  takeDeviceAttempt,
  takeLoginAttempt,
} from '../db/accounts.ts';
import { canSendEmail, emailSender } from '../email.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError } from '../errors.ts';
import { clientIpKey, inBackground, nowIso, readJson, sameOriginWrites } from '../http.ts';
import { hashPassword, verifyPassword } from '../passwords.ts';
import { newSessionToken, sha256Hex } from '../secrets.ts';

const BODY_LIMIT = 4096;

// One answer for a wrong password, an unknown email, and a locked account, so
// the login tells nobody which emails have an account.
const wrongLogin = () =>
  new ApiError(401, 'wrong_login', 'Emailul sau parola nu sunt corecte. După 10 încercări greșite, contul se blochează 15 minute.');

// Many wrong passwords from this network (a school shares one IP): said
// apart, so a teacher knows to wait or use another network.
const networkBlocked = () =>
  new ApiError(
    429,
    'network_blocked',
    'Din rețeaua ta s-au încercat prea multe parole greșite. Încearcă din nou peste 15 minute, sau din altă rețea (de exemplu datele mobile).',
  );

// /api/auth: the login page of the teacher app. No login needed here.
export function authRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const sendEmail = emailSender(options);
  routes.use('*', sameOriginWrites);

  // A new teacher asks for an account. It is a demo account; the teacher first
  // confirms the email with the link it gets, then an administrator approves
  // it on Setări. An email that already has an account gets the same answer
  // and changes nothing, so the form tells nobody which emails have an
  // account. The email goes out after the answer, so the answer's time tells
  // nothing either.
  routes.post('/signup', async (c) => {
    if (!canSendEmail(c.env, options)) {
      throw new ApiError(503, 'signup_off', 'Conturile noi nu se pot cere încă. Scrie unui administrator.');
    }
    const body = await readJson(c, signupBody, BODY_LIMIT);
    const now = nowIso();
    // Only the hash of the IP is kept, and only while the account waits.
    const ipHash = await sha256Hex(clientIpKey(c));
    const passwordHash = await hashPassword(body.password);
    const confirmToken = newSessionToken();
    const confirmTokenHash = await sha256Hex(confirmToken);
    const created = await createAccount(
      c.env.DB,
      {
        name: body.name,
        email: body.email,
        passwordHash,
        ipHash,
        confirmTokenHash,
      },
      now,
    );
    if (created === 'too_many') {
      throw new ApiError(429, 'too_many_pending', 'Sunt prea multe cereri de cont. Încearcă din nou mâine.');
    }
    if (created === 'created') {
      // The token is after "#": it never reaches a server log or a Referer.
      const confirmUrl = `${new URL(c.req.url).origin}/admin/confirma-email#${confirmToken}`;
      inBackground(
        c,
        sendEmail(c.env, {
          to: [body.email],
          subject: 'QuickEval: confirmă adresa de email',
          text: [
            `Bună, ${body.name}!`,
            '',
            'Ai cerut un cont în QuickEval. Confirmă că adresa este a ta:',
            confirmUrl,
            '',
            `Linkul merge ${CONFIRM_HOURS} de ore. După confirmare, un administrator aprobă contul.`,
            'Dacă nu ai cerut tu contul, ignoră acest email.',
          ].join('\n'),
        }),
      );
    }
    return c.json({ status: 'pending' }, 201);
  });

  // The link from the email, with the password chosen at the sign-up: the
  // account now waits for an administrator, and the administrators get an
  // email. The password proves that whoever opened the link also asked for
  // this account: someone who asked with another's email, and their own
  // password, cannot get that person to confirm it.
  routes.post('/confirm', async (c) => {
    const { token, password } = await readJson(c, confirmEmailBody, BODY_LIMIT);
    const now = nowIso();
    const tokenHash = await sha256Hex(token);
    const badLink = () => new ApiError(404, 'bad_link', 'Linkul nu mai este valabil. Cere contul din nou de pe pagina de intrare.');
    const account = await findUnconfirmed(c.env.DB, tokenHash, now);
    if (!account) throw badLink();
    if (!(await verifyPassword(password, account.password_hash))) {
      throw new ApiError(
        400,
        'wrong_password',
        'Parola nu este cea aleasă când ai cerut contul. Dacă nu ai cerut tu contul cu acest link, cere-l din nou de pe pagina de intrare.',
      );
    }
    const confirmed = await confirmEmail(c.env.DB, { teacherId: account.id, tokenHash }, now);
    if (!confirmed) throw badLink();
    const settingsUrl = `${new URL(c.req.url).origin}/admin/setari`;
    inBackground(
      c,
      adminEmails(c.env.DB).then((to) =>
        sendEmail(c.env, {
          to,
          subject: 'QuickEval: cont nou de aprobat',
          text: [
            'Un profesor a cerut un cont în QuickEval și și-a confirmat emailul:',
            '',
            `Nume: ${confirmed.name}`,
            `Email: ${confirmed.email}`,
            '',
            `Aprobă sau refuză contul pe pagina Setări: ${settingsUrl}`,
          ].join('\n'),
        }),
      ),
    );
    return c.json({ confirmed: true });
  });

  routes.post('/login', async (c) => {
    const body = await readJson(c, loginBody, BODY_LIMIT);
    const now = nowIso();
    const device = deviceToken(c);
    const deviceHash = device ? await sha256Hex(device) : null;
    const throughDevice = deviceHash ? await takeDeviceAttempt(c.env.DB, body.email, deviceHash, now) : null;
    // A known browser skips the IP's limit, as it skips the account's lock.
    const ipHash = throughDevice ? null : await sha256Hex(clientIpKey(c));
    const login = throughDevice ?? (await takeLoginAttempt(c.env.DB, body.email, ipHash!, now));
    if (login === 'ip_blocked') throw networkBlocked();
    if (login === null || login === 'locked') {
      // Not a wrong password for an account: the IP gets its attempt back,
      // after the answer, so the time of the answer stays the same.
      inBackground(c, giveBackIpAttempt(c.env.DB, ipHash!));
      // A check against no hash, so the answer takes as long as a wrong password's.
      await verifyPassword(body.password, null);
      throw wrongLogin();
    }
    if (!(await verifyPassword(body.password, login.password_hash))) throw wrongLogin();
    if (login.status !== 'active') {
      await forgetFailedLogins(c.env.DB, login.id, throughDevice ? { deviceHash: deviceHash! } : { ipHash: ipHash! });
      if (login.status === 'disabled') throw new ApiError(403, 'account_disabled', 'Contul tău a fost închis. Scrie unui administrator.');
      if (!login.confirmed) {
        throw new ApiError(403, 'email_unconfirmed', 'Confirmă mai întâi adresa de email, cu linkul primit pe email.');
      }
      throw new ApiError(403, 'account_pending', 'Contul tău așteaptă aprobarea unui administrator. Vei primi acces după aprobare.');
    }

    const token = newSessionToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.parse(now) + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    // A browser without a known mark gets a new one: a mark from another
    // account, or one that used up its attempts, is not reused.
    const newDevice = throughDevice ? null : newSessionToken();
    const knownDevice = newDevice ? { hash: await sha256Hex(newDevice), known: false } : { hash: deviceHash!, known: true };
    await createSession(
      c.env.DB,
      {
        teacherId: login.id,
        tokenHash,
        expiresAt,
        device: knownDevice,
        ipHash,
      },
      now,
    );
    setSessionCookie(c, token);
    if (newDevice) setDeviceCookie(c, newDevice);
    return c.json({
      teacher: await findTeacherBySession(c.env.DB, tokenHash, now),
    });
  });

  routes.post('/logout', async (c) => {
    const token = sessionToken(c);
    if (token) await deleteSession(c.env.DB, await sha256Hex(token));
    clearSessionCookie(c);
    return c.json({ loggedOut: true });
  });

  return routes;
}
