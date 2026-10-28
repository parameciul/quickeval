import { Hono } from 'hono';
import { changePasswordBody, shownAccountBody, updateAccountBody } from '../../shared/api.ts';
import { adminOnly } from '../auth/teacherAuth.ts';
import { sessionToken } from '../auth/session.ts';
import { approveAccount, getPasswordHash, listAccounts, rejectAccount, setPassword, updateAccount } from '../db/accounts.ts';
import { emailSender } from '../email.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';
import { hashPassword, verifyPassword } from '../passwords.ts';
import { newTemporaryPassword, sha256Hex } from '../secrets.ts';

const BODY_LIMIT = 4096;

// /api/admin/account: the logged-in teacher's own account.
export function ownAccountRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // The other logins of the account end; this one stays.
  routes.post('/password', async (c) => {
    const body = await readJson(c, changePasswordBody, BODY_LIMIT);
    const teacherId = c.var.teacher.id;
    if (!(await verifyPassword(body.currentPassword, await getPasswordHash(c.env.DB, teacherId)))) {
      throw new ApiError(400, 'wrong_password', 'Parola de acum nu este corectă.');
    }
    const token = sessionToken(c);
    await setPassword(c.env.DB, teacherId, await hashPassword(body.newPassword), {
      keepTokenHash: token ? await sha256Hex(token) : null,
      teachersOnly: false,
    });
    return c.json({ changed: true });
  });

  return routes;
}

// /api/admin/accounts: the administrators approve, refuse, and change the
// teachers' accounts (Setări).
export function accountRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const sendEmail = emailSender(options);
  routes.use('*', adminOnly);

  routes.get('/', async (c) => c.json({ accounts: await listAccounts(c.env.DB) }));

  // The teacher hears about it by email when emails are set up.
  routes.post('/:id/approve', async (c) => {
    const teacherId = parseId(c.req.param('id'));
    const { createdAt } = await readJson(c, shownAccountBody, BODY_LIMIT);
    const approved = await approveAccount(c.env.DB, { teacherId, createdAt }, nowIso());
    if (!approved) throw new ApiError(409, 'not_pending', 'Contul nu mai așteaptă aprobarea.');
    await sendEmail(c.env, {
      to: [approved.email],
      subject: 'QuickEval: contul tău a fost aprobat',
      text: [
        `Bună, ${approved.name}!`,
        '',
        'Contul tău QuickEval a fost aprobat. Intră cu emailul și parola alese:',
        `${new URL(c.req.url).origin}/admin/`,
      ].join('\n'),
    });
    return c.json({ approved: true });
  });

  // Refusing deletes an account that waits.
  routes.post('/:id/reject', async (c) => {
    const teacherId = parseId(c.req.param('id'));
    const { createdAt } = await readJson(c, shownAccountBody, BODY_LIMIT);
    if (!(await rejectAccount(c.env.DB, { teacherId, createdAt }))) {
      throw new ApiError(409, 'not_pending', 'Contul nu mai așteaptă aprobarea.');
    }
    return c.json({ deleted: true });
  });

  // Demo or complete, active or closed. Administrators' accounts do not change here.
  routes.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, updateAccountBody, BODY_LIMIT);
    if (!(await updateAccount(c.env.DB, id, body))) throw notFound();
    return c.json({ accounts: await listAccounts(c.env.DB) });
  });

  // A new password for a teacher who forgot theirs, shown this once. The
  // teacher's logins end, and the teacher gets an email, so a password changed
  // without asking does not go unseen. Never an administrator's: an
  // administrator changes their own on "Contul meu", or with
  // `npm run set-password` when they forgot it.
  routes.post('/:id/password', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === c.var.teacher.id) throw new ApiError(409, 'own_account', 'Schimbă-ți parola din pagina Contul meu.');
    const password = newTemporaryPassword();
    const changed = await setPassword(c.env.DB, id, await hashPassword(password), { keepTokenHash: null, teachersOnly: true });
    if (!changed) throw notFound();
    await sendEmail(c.env, {
      to: [changed.email],
      subject: 'QuickEval: parola ta a fost schimbată',
      text: [
        `Bună, ${changed.name}!`,
        '',
        `Un administrator QuickEval (${c.var.teacher.name}) ți-a făcut o parolă nouă. Ți-o trimite el.`,
        'Dacă nu ai cerut asta, scrie-i unui administrator.',
      ].join('\n'),
    });
    return c.json({ password }, 201);
  });

  return routes;
}
