// Smoke test against a running local server: `npm run preview` in one
// terminal, then `npm run smoke` in another. Checks the pages, the /admin and
// /u rewrites, the security headers, one full upload with the local login
// (class, student, test, barem, start, a student's photo, confirm), and one
// grading by a pretend robot (robot key, schedule, start evaluation, check,
// lease, exercise list, claim, page, result, release), the teacher's review
// (read the result, correct a point, the student's history, regrade all),
// then deletes the test.
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

const testFile = await api('PUT', `/api/admin/tests/${code}/files/test`, pdf, { 'Content-Type': 'application/pdf', 'X-File-Name': 'test.pdf' });
check('upload the test file', testFile.status === 200, JSON.stringify(testFile.body));

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

// A pretend robot grades the upload through the robot API.
const noKey = await api('POST', '/api/runner/check');
check('the robot API refuses a request without the key', noKey.status === 401 && noKey.body?.error === 'robot_denied', JSON.stringify(noKey.body));

const keyAnswer = await api('POST', '/api/admin/settings/robot-key');
const robotKey = keyAnswer.body?.key;
check('make a robot key', keyAnswer.status === 201 && /^[A-Za-z0-9_-]{43}$/.test(robotKey ?? ''), JSON.stringify(keyAnswer.body));
const robot = (method, path, body) => api(method, `/api/runner${path}`, body, { Authorization: `Bearer ${robotKey}` });

const later = new Date(Date.now() + 3_600_000).toISOString();
const scheduled = await api('POST', `/api/admin/tests/${code}/evaluate`, { at: later });
check('schedule the evaluation', scheduled.status === 200 && scheduled.body?.evaluationAt === later, JSON.stringify(scheduled.body));
const unscheduled = await api('DELETE', `/api/admin/tests/${code}/schedule`);
check('cancel the schedule', unscheduled.status === 200, JSON.stringify(unscheduled.body));

const evaluating = await api('POST', `/api/admin/tests/${code}/evaluate`, {});
check('start the evaluation now', evaluating.status === 200 && evaluating.body?.status === 'evaluating', JSON.stringify(evaluating.body));

const robotCheck = await robot('POST', '/check');
check('the robot finds work', robotCheck.status === 200 && robotCheck.body?.hasWork === true, JSON.stringify(robotCheck.body));

const runId = 'smoke-run-0001';
const lease = await robot('POST', '/lease', { runId });
check('the robot takes the lease', lease.status === 200 && lease.body?.granted === true, JSON.stringify(lease.body));

const tasks = await robot('GET', '/tasks');
const testId = tasks.body?.exerciseLists?.at(-1);
check('the test waits for its exercise list', tasks.status === 200 && typeof testId === 'number', JSON.stringify(tasks.body));

const exerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 9, answer: '42', scoringNotes: '', topic: 'Probă' }],
  notes: '',
};
const robotTest = await robot('GET', `/tests/${testId}`);
const filesVersion = robotTest.body?.test?.filesVersion;
check('the robot reads the test', robotTest.status === 200 && typeof filesVersion === 'number', JSON.stringify(robotTest.body));
const savedList = await robot('POST', `/tests/${testId}/exercise-list`, { runId, filesVersion, ok: true, exerciseList });
check('the robot saves the exercise list', savedList.body?.exerciseList?.status === 'ready', JSON.stringify(savedList.body));

const claimed = await robot('POST', '/claim', { runId });
check('the robot claims the upload', claimed.status === 200 && claimed.body?.submissionId === row?.submissionId, JSON.stringify(claimed.body));
const fileId = claimed.body?.files?.[0]?.id;
const robotPage = await fetch(`${base}/api/runner/submissions/${row?.submissionId}/files/${fileId}`, { headers: { Authorization: `Bearer ${robotKey}` } });
const robotBytes = new Uint8Array(await robotPage.arrayBuffer());
check('the robot reads the page', robotPage.status === 200 && robotBytes.length === jpeg.length, String(robotPage.status));

const grading = {
  items: [{ exerciseId: 'I.1', points: 7.5, studentAnswer: '42', comment: 'Bine.', confidence: 'high', needsReview: false, reviewReason: '' }],
  unreadable: [],
  summary: 'Ai lucrat bine.',
  strengths: ['Calcul'],
  recommendations: ['Exersează.'],
};
const graded = await robot('POST', `/submissions/${row?.submissionId}/result`, { runId, ok: true, result: grading, model: 'smoke' });
check('the robot saves the grading', graded.status === 200 && graded.body?.status === 'graded', JSON.stringify(graded.body));

const released = await robot('POST', '/release', { runId, summary: { exerciseLists: 1, graded: 1, failed: 0, analyses: 0, stop: 'done' } });
check('the robot frees the lease', released.status === 200, JSON.stringify(released.body));

const gradedDetail = await api('GET', `/api/admin/tests/${code}`);
const gradedRow = gradedDetail.body?.uploads?.find((u) => u.studentId === studentId);
check(
  'the teacher sees the grade and a finished test',
  gradedDetail.body?.test?.status === 'done' && gradedRow?.status === 'graded' && gradedRow?.grade === 8.5,
  JSON.stringify({ status: gradedDetail.body?.test?.status, row: gradedRow }),
);

// The teacher reviews the result: reads it, corrects the points, and grades the test again.
const result = await api('GET', `/api/admin/submissions/${row?.submissionId}`);
const item = result.body?.submission?.evaluation?.items?.[0];
check('the teacher reads the result', result.status === 200 && item?.exerciseId === 'I.1' && item?.points === 7.5, JSON.stringify(result.body));
const corrected = await api('PATCH', `/api/admin/evaluation-items/${item?.id}`, { points: 8, reviewed: true });
check('the teacher corrects the points', corrected.status === 200 && corrected.body?.submission?.evaluation?.grade === 9, JSON.stringify(corrected.body));
const history = await api('GET', `/api/admin/students/${studentId}/history`);
check('the student page lists the grade', history.status === 200 && history.body?.results?.[0]?.grade === 9, JSON.stringify(history.body));
const regraded = await api('POST', `/api/admin/tests/${code}/regrade`);
check('regrade the test', regraded.status === 200 && regraded.body?.count === 1 && regraded.body?.testStatus === 'evaluating', JSON.stringify(regraded.body));

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
