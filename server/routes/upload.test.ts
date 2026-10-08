import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { addSubmissionFile, confirmSubmission, deleteSessionFile } from '../db/links.ts';
import { makeClass, makeTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;
let token: string;
let pop: number;
let ionescu: number;
let stan: number;

const jpeg = (text = 'photo') => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(text)]);
const pdf = new TextEncoder().encode('%PDF-1.7 scan');

const session = (secret?: string): Record<string, string> => (secret ? { 'X-Upload-Session': secret } : {});

async function startSession(studentId: number, secret?: string) {
  return api.request('POST', `/api/u/${token}/sessions`, { studentId }, session(secret));
}

async function newSession(studentId: number): Promise<string> {
  const res = await startSession(studentId);
  expect(res.status).toBe(201);
  return res.body.secret as string;
}

function putFile(secret: string | undefined, body: BodyInit, type: string, name = 'pagina.jpg', linkToken = token) {
  return api.fetch(`/api/u/${linkToken}/files`, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name), ...session(secret) },
  });
}

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
  [pop, ionescu, stan] = cls.studentIds as [number, number, number];
  await api.request('PATCH', `/api/admin/classes/${cls.id}/students/${stan}`, { active: false });
  code = await makeTest(api, cls.id, 'Fracții');
  token = await startTest(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/u/:token', () => {
  it('shows the test and the active students, by name, with their state', async () => {
    const secret = await newSession(pop);
    const res = await api.request('GET', `/api/u/${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      test: { code, title: 'Fracții', className: '6E2', status: 'open' },
      students: [
        { id: ionescu, name: 'Ionescu Ana', state: 'none' },
        { id: pop, name: 'Pop Ion', state: 'in_progress' },
      ],
    });
    await putFile(secret, jpeg(), 'image/jpeg');
    await api.request('POST', `/api/u/${token}/confirm`, undefined, session(secret));
    const after = await api.request('GET', `/api/u/${token}`);
    expect(after.body.students[1]).toEqual({ id: pop, name: 'Pop Ion', state: 'done' });
  });

  it('answers an unknown or malformed link with a Romanian 404', async () => {
    for (const bad of ['abcdefghijklmnop', 'short', 'ABCDEFGHIJKLMNOP']) {
      const res = await api.request('GET', `/api/u/${bad}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'unknown_link', message: 'Link greșit. Cere profesorului linkul nou.' });
    }
  });

  it('shows no names once the uploads are closed', async () => {
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(code).run();
    const res = await api.request('GET', `/api/u/${token}`);
    expect(res.body).toEqual({ test: { code, title: 'Fracții', className: '6E2', status: 'done' }, students: [] });
  });

  it('marks every answer as not cacheable', async () => {
    const res = await api.request('GET', `/api/u/${token}`);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('POST /api/u/:token/sessions', () => {
  it('starts an upload with a secret for this phone', async () => {
    const res = await startSession(pop);
    expect(res.status).toBe(201);
    expect(res.body.secret).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(res.body.session).toMatchObject({ studentId: pop, studentName: 'Pop Ion', status: 'uploading', files: [] });
    const stored = await api.db.prepare('SELECT session_hash FROM submissions WHERE student_id = ?').bind(pop).first<{ session_hash: string }>();
    expect(stored?.session_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.session_hash).not.toContain(res.body.secret);
  });

  it('goes on with the upload on the same phone', async () => {
    const secret = await newSession(pop);
    await putFile(secret, jpeg(), 'image/jpeg');
    const res = await startSession(pop, secret);
    expect(res.status).toBe(200);
    expect(res.body.secret).toBeUndefined();
    expect(res.body.session.files).toHaveLength(1);
  });

  it('refuses another phone with a Romanian message', async () => {
    await newSession(pop);
    for (const secret of [undefined, 'another-phone-secret']) {
      const res = await startSession(pop, secret);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.');
    }
  });

  it('refuses a student who already sent the upload', async () => {
    const secret = await newSession(pop);
    await putFile(secret, jpeg(), 'image/jpeg');
    await api.request('POST', `/api/u/${token}/confirm`, undefined, session(secret));
    const res = await startSession(pop, secret);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Lucrarea ta a fost deja trimisă.');
  });

  it('refuses a student who left the class or is not in it', async () => {
    expect((await startSession(stan)).status).toBe(404);
    const other = await makeClass(api, '7E2', ['Marin Dan']);
    const res = await startSession(other.studentIds[0]!);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Nu am găsit numele tău în listă.');
    expect((await api.request('POST', `/api/u/${token}/sessions`, {})).body.message).toBe('Alege-ți numele din listă.');
  });

  it('refuses new uploads once the test is closed', async () => {
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(code).run();
    const res = await startSession(pop);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Încărcarea s-a închis.');
  });
});

describe('PUT /api/u/:token/files', () => {
  it('stores each file in the student folder, in upload order', async () => {
    const secret = await newSession(pop);
    const first = await putFile(secret, jpeg('one'), 'image/jpeg', 'IMG_0001.jpg');
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({
      file: { id: expect.any(Number), name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 7, position: 1 },
    });
    const second = await putFile(secret, pdf, PDF_TYPE, 'scan.pdf');
    expect((await second.json()).file.position).toBe(2);

    const keys = (await api.env.FILES.list()).objects.map((o) => o.key).sort();
    expect(keys).toEqual([
      expect.stringMatching(new RegExp(`^t/${api.teacherId}/2026/${code}/students/${pop}-pop-ion/01-[a-z2-7]{8}\\.jpg$`)),
      expect.stringMatching(new RegExp(`^t/${api.teacherId}/2026/${code}/students/${pop}-pop-ion/02-[a-z2-7]{8}\\.pdf$`)),
    ]);
  });

  it('refuses a HEIC photo and a file whose bytes do not match its type', async () => {
    const secret = await newSession(pop);
    const heic = await putFile(secret, jpeg(), 'image/heic', 'IMG.heic');
    expect(heic.status).toBe(415);
    expect((await heic.json()).message).toBe('Trimite poze JPG sau PDF.');
    expect((await putFile(secret, pdf, 'image/png', 'fake.png')).status).toBe(415);
  });

  it('refuses a request without this phone secret', async () => {
    await newSession(pop);
    for (const secret of [undefined, 'wrong-secret']) {
      const res = await putFile(secret, jpeg(), 'image/jpeg');
      expect(res.status).toBe(401);
      expect((await res.json()).message).toBe('Încărcarea nu mai este valabilă. Alege-ți din nou numele.');
    }
  });

  it('refuses a 21st file', async () => {
    const secret = await newSession(pop);
    const submission = await api.db.prepare('SELECT id FROM submissions WHERE student_id = ?').bind(pop).first<{ id: number }>();
    for (let position = 1; position <= 20; position++) {
      await api.db
        .prepare(
          "INSERT INTO submission_files (submission_id, r2_key, original_name, content_type, size, position, created_at) VALUES (?, ?, 'p.jpg', 'image/jpeg', 1, ?, 't')",
        )
        .bind(submission!.id, `fill/${position}`, position)
        .run();
    }
    const res = await putFile(secret, jpeg(), 'image/jpeg');
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe('Poți trimite cel mult 20 de fișiere.');
  });

  it('refuses files after the upload was sent or the test closed', async () => {
    const secret = await newSession(pop);
    await putFile(secret, jpeg(), 'image/jpeg');
    await api.request('POST', `/api/u/${token}/confirm`, undefined, session(secret));
    expect((await putFile(secret, jpeg(), 'image/jpeg')).status).toBe(409);

    const other = await newSession(ionescu);
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(code).run();
    const closed = await putFile(other, jpeg(), 'image/jpeg');
    expect(closed.status).toBe(409);
    expect((await closed.json()).message).toBe('Încărcarea s-a închis.');
  });

  it('refuses a secret from another test, even for the same student', async () => {
    const secret = await newSession(pop);
    const cls = await api.db.prepare("SELECT id FROM classes WHERE name = '6E2'").first<{ id: number }>();
    const otherToken = await startTest(api, await makeTest(api, cls!.id, 'Alt test'));
    expect((await putFile(secret, jpeg(), 'image/jpeg', 'p.jpg', otherToken)).status).toBe(401);
  });

  it('refuses an upload sent from another site', async () => {
    const secret = await newSession(pop);
    const res = await api.fetch(`/api/u/${token}/files`, {
      method: 'PUT',
      body: jpeg(),
      headers: { 'Content-Type': 'image/jpeg', 'X-Upload-Session': secret, Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });
});

describe('the files of an upload', () => {
  it('lists and streams only this phone files', async () => {
    const secret = await newSession(pop);
    const added = (await (await putFile(secret, jpeg('mine'), 'image/jpeg')).json()).file;
    const otherSecret = await newSession(ionescu);
    const theirs = (await (await putFile(otherSecret, jpeg('theirs'), 'image/jpeg')).json()).file;

    const list = await api.request('GET', `/api/u/${token}/files`, undefined, session(secret));
    expect(list.body.session.files).toEqual([added]);

    const stream = await api.fetch(`/api/u/${token}/files/${added.id}`, { headers: session(secret) });
    expect(stream.status).toBe(200);
    expect(new Uint8Array(await stream.arrayBuffer()).slice(4)).toEqual(new TextEncoder().encode('mine'));

    expect((await api.fetch(`/api/u/${token}/files/${theirs.id}`, { headers: session(secret) })).status).toBe(404);
    expect((await api.fetch(`/api/u/${token}/files/${added.id}`)).status).toBe(401);
  });

  it('deletes a file of this upload, row and stored file', async () => {
    const secret = await newSession(pop);
    const added = (await (await putFile(secret, jpeg(), 'image/jpeg')).json()).file;
    const res = await api.request('DELETE', `/api/u/${token}/files/${added.id}`, undefined, session(secret));
    expect(res.status).toBe(200);
    expect((await api.request('GET', `/api/u/${token}/files`, undefined, session(secret))).body.session.files).toEqual([]);
    expect((await api.env.FILES.list()).objects).toEqual([]);
  });

  it('cannot delete a file of another student', async () => {
    const secret = await newSession(pop);
    const otherSecret = await newSession(ionescu);
    const theirs = (await (await putFile(otherSecret, jpeg(), 'image/jpeg')).json()).file;
    expect((await api.request('DELETE', `/api/u/${token}/files/${theirs.id}`, undefined, session(secret))).status).toBe(404);
    expect((await api.env.FILES.list()).objects).toHaveLength(1);
  });
});

describe('POST /api/u/:token/confirm', () => {
  it('needs at least one file', async () => {
    const secret = await newSession(pop);
    const res = await api.request('POST', `/api/u/${token}/confirm`, undefined, session(secret));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Adaugă cel puțin o poză sau un PDF.');
  });

  it('sends the upload once, and the teacher sees it', async () => {
    const secret = await newSession(pop);
    await putFile(secret, jpeg(), 'image/jpeg');
    await putFile(secret, pdf, PDF_TYPE, 'scan.pdf');
    const res = await api.request('POST', `/api/u/${token}/confirm`, undefined, session(secret));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'submitted', fileCount: 2 });
    expect((await api.request('POST', `/api/u/${token}/confirm`, undefined, session(secret))).status).toBe(409);

    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test.submittedCount).toBe(1);
    expect(detail.body.uploads.find((row: { studentId: number }) => row.studentId === pop)).toMatchObject({
      status: 'submitted',
      fileCount: 2,
      autoSubmitted: false,
    });
  });
});

describe('the upload writes check the rules themselves', () => {
  const now = '2026-10-06T08:00:00.000Z';
  const photo = (position: number) => ({ key: `k/${position}.jpg`, name: `${position}.jpg`, type: 'image/jpeg', size: 4, position });

  async function submissionOf(studentId: number): Promise<number> {
    const row = await api.db.prepare('SELECT id FROM submissions WHERE student_id = ?').bind(studentId).first<{ id: number }>();
    return row!.id;
  }

  async function fileCount(submissionId: number): Promise<number> {
    const row = await api.db
      .prepare('SELECT COUNT(*) AS count FROM submission_files WHERE submission_id = ?')
      .bind(submissionId)
      .first<{ count: number }>();
    return row!.count;
  }

  it('stores no file past the 20th', async () => {
    await newSession(pop);
    const id = await submissionOf(pop);
    for (let position = 1; position <= 20; position++) {
      expect(await addSubmissionFile(api.db, id, photo(position), now)).not.toBeNull();
    }
    expect(await addSubmissionFile(api.db, id, photo(21), now)).toBeNull();
    expect(await fileCount(id)).toBe(20);
  });

  it('adds and deletes nothing once the upload was sent', async () => {
    await newSession(pop);
    const id = await submissionOf(pop);
    const fileId = (await addSubmissionFile(api.db, id, photo(1), now))!;
    await api.db.prepare("UPDATE submissions SET status = 'submitted' WHERE id = ?").bind(id).run();
    expect(await addSubmissionFile(api.db, id, photo(2), now)).toBeNull();
    expect(await deleteSessionFile(api.db, id, fileId)).toBe(false);
    expect(await fileCount(id)).toBe(1);
  });

  it('adds and sends nothing once the test is closed', async () => {
    await newSession(pop);
    const id = await submissionOf(pop);
    await addSubmissionFile(api.db, id, photo(1), now);
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(code).run();
    expect(await addSubmissionFile(api.db, id, photo(2), now)).toBeNull();
    expect(await confirmSubmission(api.db, id, now)).toBeNull();
    const row = await api.db.prepare('SELECT status FROM submissions WHERE id = ?').bind(id).first<{ status: string }>();
    expect(row!.status).toBe('uploading');
    expect(await fileCount(id)).toBe(1);
  });

  it('sends an upload with its file count, and never an empty one', async () => {
    await newSession(pop);
    const id = await submissionOf(pop);
    expect(await confirmSubmission(api.db, id, now)).toBeNull();
    await addSubmissionFile(api.db, id, photo(1), now);
    await addSubmissionFile(api.db, id, photo(2), now);
    expect(await confirmSubmission(api.db, id, now)).toBe(2);
    expect(await confirmSubmission(api.db, id, now)).toBeNull();
  });
});
