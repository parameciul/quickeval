import { Hono } from 'hono';
import { confirmEmailBody, forgotPasswordBody, loginBody, resetPasswordBody, signupBody } from '../../shared/api.ts';
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
  requestPasswordReset,
  RESET_HOURS,
  resetLinkWorks,
  resetPassword,
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
      const confirmUrl = `${new URL(c.req.url).origin}/teacher/confirma-email#${confirmToken}`;
      inBackground(
        c,
        sendEmail(c.env, {
          to: [body.email],
          subject: 'MQGrader: confirmă adresa de email',
          text: [
            `Bună, ${body.name}!`,
            '',
            'Ai cerut un cont în MQGrader. Confirmă că adresa este a ta:',
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
    const settingsUrl = `${new URL(c.req.url).origin}/teacher/setari`;
    inBackground(
      c,
      adminEmails(c.env.DB).then((to) =>
        sendEmail(c.env, {
          to,
          subject: 'MQGrader: cont nou de aprobat',
          text: [
            'Un profesor a cerut un cont în MQGrader și și-a confirmat emailul:',
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

  // "Am uitat parola": a link goes to the email of an active account. The
  // answer is the same for any email, and the email goes out after it, so
  // nothing tells which emails have an account. Only the IP's daily limit
  // answers differently, and it counts every request.
  routes.post('/forgot-password', async (c) => {
    if (!canSendEmail(c.env, options)) {
      throw new ApiError(503, 'reset_off', 'Parola nu se poate reseta prin email încă. Scrie unui administrator.');
    }
    const body = await readJson(c, forgotPasswordBody, BODY_LIMIT);
    const token = newSessionToken();
    const requested = await requestPasswordReset(
      c.env.DB,
      { email: body.email, ipHash: await sha256Hex(clientIpKey(c)), tokenHash: await sha256Hex(token) },
      nowIso(),
    );
    if (requested === 'too_many') {
      throw new ApiError(429, 'too_many_resets', 'Prea multe cereri de resetare. Încearcă din nou mâine.');
    }
    if (requested) {
      // The token is after "#": it never reaches a server log or a Referer.
      const url = `${new URL(c.req.url).origin}/teacher/parola-noua#${token}`;
      inBackground(
        c,
        sendEmail(c.env, {
          to: [body.email],
          subject: 'MQGrader: parolă nouă',
          text: [
            `Bună, ${requested.name}!`,
            '',
            'Ai cerut o parolă nouă pentru contul tău MQGrader. Alege-o aici:',
            url,
            '',
            `Linkul merge ${RESET_HOURS} oră și o singură dată.`,
            'Dacă nu ai cerut tu, ignoră acest email: parola ta rămâne cea veche.',
          ].join('\n'),
        }),
      );
    }
    return c.json({ status: 'sent' });
  });

  // The link from the reset email, with the new password. Every other login
  // of the account ends.
  routes.post('/reset-password', async (c) => {
    const { token, newPassword } = await readJson(c, resetPasswordBody, BODY_LIMIT);
    const badLink = () => new ApiError(404, 'bad_link', 'Linkul nu mai este valabil. Cere altul de pe pagina de intrare.');
    const tokenHash = await sha256Hex(token);
    // A cheap read first: a made-up link costs no password hash.
    if (!(await resetLinkWorks(c.env.DB, tokenHash, nowIso()))) throw badLink();
    const changed = await resetPassword(c.env.DB, tokenHash, await hashPassword(newPassword), nowIso());
    if (!changed) throw badLink();
    inBackground(
      c,
      sendEmail(c.env, {
        to: [changed.email],
        subject: 'MQGrader: parola a fost schimbată',
        text: [
          `Bună, ${changed.name}!`,
          '',
          'Parola contului tău MQGrader tocmai a fost schimbată cu linkul din email.',
          'Dacă nu ai făcut tu asta, scrie imediat unui administrator.',
        ].join('\n'),
      }),
    );
    return c.json({ reset: true });
  });

  routes.post('/logout', async (c) => {
    const token = sessionToken(c);
    if (token) await deleteSession(c.env.DB, await sha256Hex(token));
    clearSessionCookie(c);
    return c.json({ loggedOut: true });
  });

  return routes;
}
