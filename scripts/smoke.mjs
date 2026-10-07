// Smoke test against a running local server: `npm run preview` in one
// terminal, then `npm run smoke` in another. Checks the pages, the /admin and
// /u rewrites, the security headers, and one full upload with the local login:
// class, student, test, barem, start, a student's photo, confirm, and delete.
// Runs every check, then exits with code 1 if any failed.

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

// A JSON request; `body` is a JSON value or raw bytes with their headers.
async function api(method, path, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body instanceof Uint8Array) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { unparsed: text.slice(0, 200) };
  }
  return { status: res.status, headers: res.headers, body: json };
}

const pdf = new TextEncoder().encode('%PDF-1.4\n%%EOF\n');
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

const landing = await page('/');
check('landing page', landing.res.status === 200 && landing.text.includes('Intră ca profesor'), String(landing.res.status));

for (const path of ['/admin/', '/admin/clase', '/admin/teste/6E2-26T1']) {
  const admin = await page(path);
  check(`teacher app at ${path}`, admin.res.status === 200 && admin.text.includes('<title>QuickEval · Profesor</title>'), String(admin.res.status));
}

const student = await page('/u/abcdefghijkmnop2');
check('student app at /u/<token>', student.res.status === 200 && student.text.includes('<title>QuickEval · Trimite lucrarea</title>'), String(student.res.status));
for (const path of ['/admin/', '/u/abcdefghijkmnop2']) {
  const headers = (await page(path)).res.headers;
  check(`noindex header on ${path}`, (headers.get('x-robots-tag') ?? '').includes('noindex'));
  check(`content security policy on ${path}`, (headers.get('content-security-policy') ?? '').includes("default-src 'self'"));
}

const me = await api('GET', '/api/admin/me');
check('local teacher login', me.status === 200 && typeof me.body?.teacher?.email === 'string', JSON.stringify(me.body));
check('API answers are not cached or sniffed', me.headers.get('cache-control') === 'no-store' && me.headers.get('x-content-type-options') === 'nosniff');

const name = `S${Date.now() % 100000}`;
const created = await api('POST', '/api/admin/classes', { name, schoolYear: 2026 });
check('create a class', created.status === 201 && created.body?.class?.name === name, JSON.stringify(created.body));
const classId = created.body?.class?.id;

const list = await api('GET', '/api/admin/classes?year=2026');
check('list classes', list.status === 200 && list.body?.classes?.some((c) => c.name === name), JSON.stringify(list.body));

const added = await api('POST', `/api/admin/classes/${classId}/students`, { names: ['Elev Probă'] });
const studentId = added.body?.students?.[0]?.id;
check('add a student', added.status === 201 && typeof studentId === 'number', JSON.stringify(added.body));

const test = await api('POST', '/api/admin/tests', { classId, title: 'Test de probă' });
const code = test.body?.code;
check('create a test', test.status === 201 && code === `${name}-26T1`, JSON.stringify(test.body));

const barem = await api('PUT', `/api/admin/tests/${code}/files/barem`, pdf, { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent('barem probă.pdf') });
check('upload the barem', barem.status === 200 && barem.body?.file?.name === 'barem probă.pdf', JSON.stringify(barem.body));
const stored = await fetch(`${base}/api/admin/tests/${code}/files/barem`);
check('read the barem back', stored.status === 200 && (await stored.text()) === '%PDF-1.4\n%%EOF\n', String(stored.status));

const started = await api('POST', `/api/admin/tests/${code}/start`);
const token = started.body?.uploadToken;
check('start the test', started.status === 200 && /^[a-z2-7]{16}$/.test(token ?? ''), JSON.stringify(started.body));

const link = await api('GET', `/api/u/${token}`);
check('the link lists the student', link.status === 200 && link.body?.students?.some((s) => s.id === studentId), JSON.stringify(link.body));

const session = await api('POST', `/api/u/${token}/sessions`, { studentId });
const secret = session.body?.secret;
check('the student starts an upload', session.status === 201 && typeof secret === 'string', JSON.stringify(session.body));

const photo = await api('PUT', `/api/u/${token}/files`, jpeg, { 'Content-Type': 'image/jpeg', 'X-File-Name': 'poza.jpg', 'X-Upload-Session': secret });
check('the student uploads a photo', photo.status === 201 && photo.body?.file?.position === 1, JSON.stringify(photo.body));

const sent = await api('POST', `/api/u/${token}/confirm`, undefined, { 'X-Upload-Session': secret });
check('the student sends the upload', sent.status === 200 && sent.body?.fileCount === 1, JSON.stringify(sent.body));

const detail = await api('GET', `/api/admin/tests/${code}`);
const row = detail.body?.uploads?.find((u) => u.studentId === studentId);
check('the teacher sees the upload', row?.status === 'submitted' && row?.fileCount === 1, JSON.stringify(row));

const removed = await api('DELETE', `/api/admin/tests/${code}`);
check('delete the test and its files', removed.status === 200 && (await api('GET', `/api/admin/tests/${code}`)).status === 404, JSON.stringify(removed.body));

const unknownLink = await api('GET', '/api/u/abcdefghijkmnop2');
check('an unknown link is a Romanian JSON 404', unknownLink.status === 404 && unknownLink.body?.error === 'unknown_link', JSON.stringify(unknownLink.body));

const missing = await api('GET', '/api/nothing-here');
check('unknown API path is a JSON 404', missing.status === 404 && missing.body?.error === 'not_found');

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
