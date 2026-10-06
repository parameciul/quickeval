// Smoke test against a running local server: `npm run preview` in one
// terminal, then `npm run smoke` in another. Checks the pages, the /admin
// rewrite, the security headers, and the classes API with the local login.
// Exits with code 1 on the first failure.

const base = process.env.SMOKE_URL ?? 'http://127.0.0.1:8788';
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
}

async function page(path) {
  const res = await fetch(base + path, { redirect: 'manual' });
  return { res, text: await res.text() };
}

async function api(method, path, body) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, init);
  return { status: res.status, body: await res.json() };
}

const landing = await page('/');
check('landing page', landing.res.status === 200 && landing.text.includes('Intră ca profesor'), String(landing.res.status));

for (const path of ['/admin/', '/admin/clase', '/admin/clase/123']) {
  const admin = await page(path);
  check(`teacher app at ${path}`, admin.res.status === 200 && admin.text.includes('<title>QuickEval · Profesor</title>'), String(admin.res.status));
}

const headers = (await page('/admin/')).res.headers;
check('noindex header', (headers.get('x-robots-tag') ?? '').includes('noindex'));
check('content security policy', (headers.get('content-security-policy') ?? '').includes("default-src 'self'"));

const me = await api('GET', '/api/admin/me');
check('local teacher login', me.status === 200 && typeof me.body.teacher?.email === 'string', JSON.stringify(me.body));

const name = `S${Date.now() % 100000}`;
const created = await api('POST', '/api/admin/classes', { name, schoolYear: 2026 });
check('create a class', created.status === 201 && created.body.class?.name === name, JSON.stringify(created.body));

const list = await api('GET', '/api/admin/classes?year=2026');
check('list classes', list.status === 200 && list.body.classes.some((c) => c.name === name), JSON.stringify(list.body));

const missing = await api('GET', '/api/nothing-here');
check('unknown API path is a JSON 404', missing.status === 404 && missing.body.error === 'not_found');

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
