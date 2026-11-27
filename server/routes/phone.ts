import { Hono, type MiddlewareHandler } from 'hono';
import { isPhoneToken, type PhoneLinkInfo } from '../../shared/testPhone.ts';
import { findPhoneLink } from '../db/phoneLinks.ts';
import { requireTest } from '../db/tests.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError } from '../errors.ts';
import { nowIso, sameOriginWrites } from '../http.ts';
import { sha256Hex } from '../secrets.ts';
import { testRoutes } from './tests.ts';

const unknownLink = () => new ApiError(404, 'unknown_phone_link', 'Linkul nu este bun. Scanează din nou codul de pe calculator.');
const expiredLink = () =>
  new ApiError(410, 'phone_link_expired', 'Linkul a expirat. Fă un cod nou din pagina testului, la Pregătire: „Fă poze cu telefonul”.');
const notAllowed = () => new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');

// What a phone link may call of the teacher API, after
// /api/phone/<token>/tests/<its own code>: sending the test and the barem (the
// class ones and the CES ones) and asking for a barem made from the test.
// Nothing reads the test through the teacher API: its answer names the
// students. Everything else answers 404, and so does another test's code.
const ALLOWED: readonly [string, RegExp][] = [
  ['PUT', /^\/files\/(test|marking-scheme)$/],
  ['PUT', /^\/sen\/files\/(test|marking-scheme)$/],
  ['POST', /^\/marking-scheme\/generate$/],
  ['POST', /^\/sen\/marking-scheme\/generate$/],
];

// The link of the token: its test and its teacher (an active account) in
// c.var.teacher, so the teacher API's own routes serve it. An expired link
// answers 410.
const linkAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = c.req.param('token') ?? '';
  const link = isPhoneToken(token) ? await findPhoneLink(c.env.DB, await sha256Hex(token)) : null;
  if (!link) throw unknownLink();
  if (nowIso() >= link.expiresAt) throw expiredLink();
  c.set('phoneLink', link);
  c.set('teacher', link.teacher);
  await next();
};

const allowList: MiddlewareHandler<AppEnv> = async (c, next) => {
  const rest = c.req.path.replace(/^\/api\/phone\/[^/]+\/tests/, '');
  const own = `/${c.var.phoneLink.code}`;
  if (!rest.startsWith(`${own}/`)) throw notAllowed();
  const call = rest.slice(own.length);
  if (!ALLOWED.some(([method, path]) => method === c.req.method && path.test(call))) throw notAllowed();
  await next();
};

// /api/phone: a teacher's phone link (shared/testPhone.ts), made by
// POST /api/admin/tests/<code>/phone-link. Its robot work starts the teachers'
// robot, as the test page's own uploads do.
export function phoneRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites);
  routes.use('/:token/*', linkAccess);

  // What the phone page needs of its test: which files are there and the
  // barems' requests. No student, no upload link.
  routes.get('/:token/info', async (c) => {
    const link = c.var.phoneLink;
    const test = await requireTest(c.env.DB, link.teacher.id, link.code);
    const ces = test.ces.studentCount > 0 && !test.ces.off;
    const info: PhoneLinkInfo = {
      code: test.summary.code,
      title: test.summary.title,
      className: test.summary.className,
      expiresAt: link.expiresAt,
      ces,
      files: {
        test: test.files.test !== null,
        barem: test.files.barem !== null,
        cesTest: test.ces.files.test !== null,
        cesBarem: test.ces.files.barem !== null,
      },
      barem: { request: test.barem.request, unchecked: test.barem.unchecked },
      cesBarem: { request: test.ces.barem.request, unchecked: test.ces.barem.unchecked },
    };
    return c.json({ info });
  });

  routes.use('/:token/tests/*', allowList);
  routes.route('/:token/tests', testRoutes(options));
  return routes;
}
