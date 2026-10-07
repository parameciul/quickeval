# QuickEval Plan 2: Tests and Student Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 14 must run in the main session, not in a subagent:** every outward step needs the user's explicit yes, and some steps are clicks the user makes in the Cloudflare dashboard or on a phone.

**Goal:** The teacher creates a test for a class, uploads the test and the barem, starts it, and shares a link and a QR code; students upload photos or PDFs from their phones; the teacher sees who uploaded and opens their files, on the live site.

**Architecture:** The same repo and stack as Plan 1. A second migration adds the `tests`, `submissions`, and `submission_files` tables; an R2 bucket (`FILES`) holds every file, and files leave it only through the API. The teacher API grows routes for tests, files, and uploads; a new student API at `/api/u/<token>` needs no login: the token in the link opens one test, and a secret kept on the phone opens one upload. A third Vite entry, `u/index.html`, is the phone-first student app.

**Tech Stack:** Node 24, TypeScript 7, React 19, React Router 8, TanStack Query 5, Vite 8, Vitest 5 (jsdom + Testing Library), Hono 4, zod 4, wrangler 4 (Pages, D1, R2, `getPlatformProxy`), qrcode.react 4.2.

**Spec:** `docs/superpowers/specs/2026-10-06-quickeval-design.md`. This plan implements §19 item 2: §7.1–§7.2 (the three tables, R2 layout), §8.1–§8.3 and the reopen, replace-file and delete parts of §8.5, the Teste, Test nou, Test, Lucrarea elevului (files only) and Clasa (tests list) screens of §9, §10, the test, file, upload and submission routes of §11.1, §11.2, and the R2 parts of §15 and §18. Plan 1's follow-ups (`docs/superpowers/plans/plan-1-followups.md`) are input too.

## Global Constraints

- Node 24 (`.node-version`), npm 11. After `npm install`, npm may ask to approve install scripts: run `npm approve-scripts workerd esbuild` only if npm says scripts are blocked. Never hand-write the version-pinned `allowScripts` keys.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments, and docs are English. **No page tells students that AI grades their work**; student-app tests check every screen with `expectNoGradingWords()`.
- API errors are `{ "error": "<code>", "message": "<Romanian text>" }`, made with `ApiError(status, code, message)`.
- Every teacher query is scoped by the logged-in teacher's id. Every student query is scoped by the test of the link's token, and an upload by the hash of the phone's secret within that test. Each new teacher route gets an "another teacher's → 404" test.
- Times are stored as ISO 8601 UTC strings and shown in Europe/Bucharest time ("6 oct. 2026, 10:15").
- Functions do no heavy CPU work and make at most 15 D1 queries per request. The uploads table is one query.
- Files: test and barem are PDF or DOCX; student files are JPEG, PNG, WebP, or PDF; at most 25 MB each; at most 20 files per student. The API checks the declared type and the file's first bytes.
- R2 is private. Keys follow spec §7.2 and come from database rows, never from listing R2.
- API tests use wrangler's `getPlatformProxy`. No direct `miniflare` dependency. Its R2 refuses request-body streams, so the API reads an upload with `arrayBuffer()` after checking `Content-Length`.
- `public/_redirects` uses the directory forms `/admin/* /admin/ 200` and `/u/* /u/ 200`. Only `/admin` and `/api/admin` are behind Cloudflare Access; `/u` and `/api/u` must stay outside it.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers.
- Development happens on Windows (commands below work in Git Bash and in PowerShell unless a step says otherwise). CI runs on Linux.
- Run every command from the repo root `D:\Projects\QuickEval`.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Append to** `path`: add one empty line, then exactly the block given, at the end of the file.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- Tests that start wrangler's local engine leave nothing running when they pass. If a run is stopped halfway on Windows, check for a leftover `workerd.exe` as `AGENTS.md` describes.

## Rulings made while planning

These decisions were made while the plan was built and tested. They are binding for the implementers and reviewers.

1. **Uploads are read whole.** In tests, wrangler's R2 proxy refuses a stream of unknown length ("Provided readable stream must have a known length"). The API refuses a declared `Content-Length` over 25 MB, then reads the body with `arrayBuffer()`, checks its real size, and stores the bytes. One code path, the same in tests and in production. Cost if wrong: a 25 MB upload uses more memory than a stream would; uploads stay well below the Workers limits.
2. **Student PDFs show as a row, not in a new tab.** A PDF made in the page (a `blob:` URL) cannot open reliably in a new tab: Android downloads it, and the page's `object-src 'none'` can block it. Photos get thumbnails and a full-screen view. The teacher opens every file, PDFs too. Task 13 updates spec §10.5.
3. **`promoteDueTests` comes with Plan 3.** Before Plan 3 nothing sets `evaluation_at`, so there is nothing to promote. Task 13 notes this in spec §8.3.
4. **Reopen is built now.** The route and the button exist (§8.5), but a test reaches `evaluating` or `done` only from Plan 3. Tests set those states in the database.
5. **A name is confirmed before an upload starts.** A tap on a name asks "Ești <nume>?", because the upload then belongs to that name on that phone. Task 13 adds this to spec §10.2.
6. **The uploads table** has one row per active student, plus a row for any student who left the class after starting an upload (marked "a plecat").
7. **A closed link shows no names.** `GET /api/u/<token>` returns an empty name list unless the test is open.
8. **Test codes skip a taken code.** When a class was renamed and a new class took the old name, the next code can already exist. `createTest` then moves the class counter past it and tries again, at most 3 times (at most 12 queries).
9. **Delete order.** Deleting a test or resetting an upload deletes the rows first (the database cascades to uploads and file rows), then the R2 objects whose keys the rows named. A failed R2 delete is logged and the request still succeeds.
10. **File checks.** The API accepts a file only when its `Content-Type` is allowed and its first bytes match that type (`%PDF-`, `PK\x03\x04`, `FF D8 FF`, the PNG signature, `RIFF….WEBP`). A HEIC photo gets "Trimite poze JPG sau PDF." The apps check type and size before sending, with the same messages (`shared/files.ts`).
11. **Plan 1 follow-ups.** Task 1 and Task 2 do the "Do early" items, the hardening items, and part of the test gaps. The UX polish items stay open for Plan 4; Task 13 rewrites `plan-1-followups.md` into done and open lists.
12. **The class page and the error boundary both reset per page.** `ClassDetails` gets `key={classId}`, and the layout gives the error boundary `key={location.pathname}`. Both stay: the class-page key states the intent where it matters.

## Not in this plan

Start evaluation, scheduling, "Evaluate now", the robot, Setări, results, reports, and the student history page come in Plans 3 and 4.

---

### Task 1: API hardening and Plan 1 follow-ups

The API closes the Plan 1 gaps: no student can be added to another teacher's class, ids are plain digits, every answer is marked not cacheable, and an Access key outage answers 503 instead of 403. The test helper and the tests get stronger.

**Files:**
- Create: `shared/ids.ts`, `server/test/accessSigner.ts`
- Modify: `server/http.ts`, `server/app.ts`, `server/auth/access.ts`, `server/auth/teacherAuth.ts`, `server/db/students.ts`, `server/test/testApi.ts`
- Test: `shared/ids.test.ts`, `server/http.test.ts` (new); `server/app.test.ts`, `server/auth/access.test.ts`, `server/routes/admin.test.ts`, `server/db/students.test.ts`, `server/routes/classes.test.ts` (modified)

**Interfaces:**
- Consumes: Plan 1's API (`createApp`, `teacherAuth`, `verifyAccessJwt`, `addStudentsToClass`, `startTestApi`).
- Produces:
  - `parsePositiveId(raw: string | undefined): number | null` in `shared/ids.ts` (digits only, no leading zero, safe integer). `parseId` in `server/http.ts` now uses it.
  - `AccessResult` failure gains `unavailable?: true` (keys could not be downloaded). `teacherAuth` answers 503 `access_unavailable` for it.
  - `TestResponse` gains `headers: Headers`; `body` is `null` for an empty answer. `TestApi` gains `fetch(path: string, init?: RequestInit): Promise<Response>` for raw requests. `request()` merges header keys in any letter case.
  - `makeAccessSigner(): Promise<AccessSigner>` with `{ publicJwk, sign(payload, header?) }`, plus `base64Url`, `encodeJson`, in `server/test/accessSigner.ts`.
  - Every `/api` answer has `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store` unless the route set its own.

- [ ] **Step 1: Create `shared/ids.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { parsePositiveId } from './ids.ts';

describe('parsePositiveId', () => {
  it('accepts plain positive integers', () => {
    expect(parsePositiveId('1')).toBe(1);
    expect(parsePositiveId('12345')).toBe(12345);
  });

  it.each(['0', '012', '-1', '1e3', '0x10', ' 5 ', '5 ', '1.0', '', 'abc'])('refuses %j', (raw) => {
    expect(parsePositiveId(raw)).toBeNull();
  });

  it('refuses a missing value and numbers too big to be exact', () => {
    expect(parsePositiveId(undefined)).toBeNull();
    expect(parsePositiveId('9007199254740993')).toBeNull();
  });
});
```

- [ ] **Step 2: Create `server/test/accessSigner.ts`**

The RSA test key and token signer, shared by the Access verifier tests and the route tests.

```ts
// Makes Cloudflare Access style login tokens for tests: an RSA key pair made
// in the test, its public key as the team's published key (kid "key-1"), and
// a sign() that builds RS256 tokens.

export interface AccessSigner {
  publicJwk: JsonWebKey & { kid: string };
  sign(payload: Record<string, unknown>, header?: Record<string, unknown>): Promise<string>;
}

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const encodeJson = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

export async function makeAccessSigner(): Promise<AccessSigner> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'key-1' };
  return {
    publicJwk,
    async sign(payload, header = { alg: 'RS256', kid: 'key-1' }) {
      const input = `${encodeJson(header)}.${encodeJson(payload)}`;
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
      return `${input}.${base64Url(new Uint8Array(signature))}`;
    },
  };
}
```

- [ ] **Step 3: Replace `server/test/testApi.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { D1Database } from '@cloudflare/workers-types';
import { getPlatformProxy } from 'wrangler';
import { createApp } from '../app.ts';
import type { Env } from '../env.ts';

// API tests run the real Hono app in Node against the local D1 engine that
// `wrangler pages dev` also uses. getPlatformProxy reads the bindings from
// wrangler.toml. With persist: false, every startTestApi() call gets a new,
// empty, in-memory database; the migrations are applied to it here.

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);
const WRANGLER_CONFIG = fileURLToPath(new URL('../../wrangler.toml', import.meta.url));

export const TEACHER_EMAIL = 'profesor@example.com';

export interface TestResponse {
  status: number;
  headers: Headers;
  // The parsed JSON body, or null for an empty body. Tests read fields from it directly.
  body: any;
}

export interface TestApi {
  env: Env;
  db: D1Database;
  teacherId: number;
  // A JSON request to the API. A body is sent as JSON unless the headers name another type.
  request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<TestResponse>;
  // The raw response, for requests whose body or answer is not JSON.
  fetch(path: string, init?: RequestInit): Promise<Response>;
  addTeacher(email: string, name: string): Promise<number>;
  dispose(): Promise<void>;
}

// Migration files hold one statement per ";" at a line end (see migrations/).
export function splitSql(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function applyMigrations(db: D1Database): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8');
    await db.batch(splitSql(sql).map((statement) => db.prepare(statement)));
  }
}

export async function startTestApi(options: { env?: Partial<Env> } = {}): Promise<TestApi> {
  const platform = await getPlatformProxy<Pick<Env, 'DB'>>({
    configPath: WRANGLER_CONFIG,
    persist: false,
    remoteBindings: false,
  });
  const db = platform.env.DB;

  const addTeacher = async (email: string, name: string) => {
    const row = await db
      .prepare('INSERT INTO teachers (email, name, created_at) VALUES (?, ?, ?) RETURNING id')
      .bind(email, name, '2026-10-06T08:00:00.000Z')
      .first<{ id: number }>();
    return row!.id;
  };

  let teacherId: number;
  try {
    await applyMigrations(db);
    teacherId = await addTeacher(TEACHER_EMAIL, 'Laura Miron');
  } catch (err) {
    // A failed setup must not leave the local engine running.
    await platform.dispose();
    throw err;
  }

  const env: Env = { DB: db, DEV_TEACHER_EMAIL: TEACHER_EMAIL, ...options.env };
  const app = createApp();
  const send = (path: string, init: RequestInit = {}) => Promise.resolve(app.request(`http://localhost${path}`, init, env));

  return {
    env,
    db,
    teacherId,
    addTeacher,
    async request(method, path, body, headers = {}) {
      const merged = new Headers(headers);
      const init: RequestInit = { method, headers: merged };
      if (body !== undefined) {
        if (!merged.has('Content-Type')) merged.set('Content-Type', 'application/json');
        init.body = JSON.stringify(body);
      }
      const res = await send(path, init);
      const text = await res.text();
      return { status: res.status, headers: res.headers, body: text === '' ? null : JSON.parse(text) };
    },
    fetch: send,
    dispose: () => platform.dispose(),
  };
}
```

- [ ] **Step 4: Create `server/http.test.ts`**

```ts
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, isUniqueViolation } from './errors.ts';
import { parseId, readJson, sameOriginWrites } from './http.ts';

// A small app that answers ApiErrors the way server/app.ts does.
function testApp() {
  const app = new Hono();
  app.onError((err, c) =>
    err instanceof ApiError ? c.json({ error: err.code, message: err.message }, err.status) : c.json({ error: 'internal' }, 500),
  );
  app.use('*', sameOriginWrites);
  app.post('/echo', async (c) => c.json(await readJson(c, z.object({ name: z.string().min(1, { message: 'Numele lipsește.' }) }))));
  app.get('/item/:id', (c) => c.json({ id: parseId(c.req.param('id')) }));
  return app;
}

const post = (body: string, headers: Record<string, string> = { 'Content-Type': 'application/json' }) =>
  testApp().request('http://localhost/echo', { method: 'POST', body, headers });

describe('readJson', () => {
  it('returns the parsed body', async () => {
    const res = await post(JSON.stringify({ name: 'Ana' }));
    expect(await res.json()).toEqual({ name: 'Ana' });
  });

  it('accepts a JSON content type with a charset', async () => {
    const res = await post(JSON.stringify({ name: 'Ana' }), { 'Content-Type': 'application/json; charset=utf-8' });
    expect(res.status).toBe(200);
  });

  it('refuses another content type with 415', async () => {
    const res = await post(JSON.stringify({ name: 'Ana' }), { 'Content-Type': 'text/plain' });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'bad_content_type', message: 'Cererea trebuie trimisă ca JSON.' });
  });

  it('refuses broken JSON with 400', async () => {
    const res = await post('{"name": ');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_json');
  });

  it('reports the first schema problem in Romanian', async () => {
    const res = await post(JSON.stringify({ name: '' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid', message: 'Numele lipsește.' });
  });
});

describe('parseId', () => {
  it('passes a positive integer and answers 404 for anything else', async () => {
    expect(await (await testApp().request('http://localhost/item/42')).json()).toEqual({ id: 42 });
    for (const raw of ['0', '1e3', '0x10', '-1', '07']) {
      expect((await testApp().request(`http://localhost/item/${raw}`)).status).toBe(404);
    }
  });
});

describe('sameOriginWrites', () => {
  it('lets reads through from any site', async () => {
    const res = await testApp().request('http://localhost/item/1', { headers: { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' } });
    expect(res.status).toBe(200);
  });

  it('accepts a write from the same origin', async () => {
    const res = await post(JSON.stringify({ name: 'Ana' }), {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
      'Sec-Fetch-Site': 'same-origin',
    });
    expect(res.status).toBe(200);
  });

  it('refuses a write from another origin or marked by the browser as another site', async () => {
    const refused: Record<string, string>[] = [{ Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'same-site' }, { 'Sec-Fetch-Site': 'cross-site' }];
    for (const headers of refused) {
      const res = await post(JSON.stringify({ name: 'Ana' }), { 'Content-Type': 'application/json', ...headers });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('cross_site');
    }
  });
});

describe('isUniqueViolation', () => {
  it('recognizes the SQLite unique error in an Error or a string', () => {
    expect(isUniqueViolation(new Error('D1_ERROR: UNIQUE constraint failed: classes.teacher_id'))).toBe(true);
    expect(isUniqueViolation('UNIQUE constraint failed: tests.code')).toBe(true);
    expect(isUniqueViolation(new Error('FOREIGN KEY constraint failed'))).toBe(false);
  });
});
```

- [ ] **Step 5: Replace `server/app.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { splitSql, startTestApi, type TestApi } from './test/testApi.ts';

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.dispose();
});

describe('API app', () => {
  it('answers unknown paths with a JSON 404', async () => {
    const res = await api.request('GET', '/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found', message: 'Nu am găsit ce cauți.' });
  });

  it('marks every answer as not cacheable and not to be sniffed', async () => {
    for (const path of ['/api/admin/me', '/api/nothing-here']) {
      const res = await api.request('GET', path);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('answers an unexpected error with a Romanian 500, with the same headers', async () => {
    const app = createApp();
    // createApp() sets the base path /api, so this route answers /api/boom.
    app.get('/boom', () => {
      throw new Error('database exploded');
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('http://localhost/api/boom', {}, api.env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal', message: 'A apărut o eroare. Încearcă din nou.' });
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(errors).toHaveBeenCalledWith('API error:', 'database exploded');
    errors.mockRestore();
  });

  it('keeps a Cache-Control header that a route sets itself', async () => {
    const app = createApp();
    app.get('/cached', (c) => c.json({ ok: true }, 200, { 'Cache-Control': 'private, max-age=60' }));
    const res = await app.request('http://localhost/api/cached', {}, api.env);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=60');
  });
});

describe('test helper', () => {
  it('lets a lowercase content-type header replace the JSON default', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6E2', schoolYear: 2026 }, { 'content-type': 'text/plain' });
    expect(res.status).toBe(415);
  });
});

describe('test database', () => {
  it('has the migrations applied and one teacher', async () => {
    const teacher = await api.db
      .prepare('SELECT email FROM teachers WHERE id = ?')
      .bind(api.teacherId)
      .first<{ email: string }>();
    expect(teacher?.email).toBe('profesor@example.com');
    const tables = await api.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all<{ name: string }>();
    expect(tables.results.map((table) => table.name)).toEqual(
      expect.arrayContaining(['teachers', 'classes', 'students', 'enrollments']),
    );
  });
});

describe('teachers table', () => {
  it('refuses an email with capital letters and accepts a lowercase one', async () => {
    await expect(api.addTeacher('Mixed@Example.com', 'X')).rejects.toThrow(/CHECK constraint failed/);
    await expect(api.addTeacher('second@example.com', 'Y')).resolves.toEqual(expect.any(Number));
  });
});

describe('splitSql', () => {
  it('splits on semicolons at line ends and drops comment lines', () => {
    expect(splitSql('-- note\nCREATE TABLE a (x INTEGER);\n\nCREATE INDEX a_x ON a (x);\n')).toEqual([
      'CREATE TABLE a (x INTEGER)',
      'CREATE INDEX a_x ON a (x)',
    ]);
  });
});
```

- [ ] **Step 6: Replace `server/auth/access.test.ts`**

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeJson, makeAccessSigner, type AccessSigner } from '../test/accessSigner.ts';
import { clearCertCache, verifyAccessJwt, type FetchLike } from './access.ts';

const TEAM = 'school.cloudflareaccess.com';
const AUD = 'aud-123';
const config = { teamDomain: TEAM, aud: AUD };

let signer: AccessSigner;

const nowSec = () => Math.floor(Date.now() / 1000);
const goodPayload = () => ({ email: 'Profesor@Example.com', aud: [AUD], iss: `https://${TEAM}`, exp: nowSec() + 600 });
const certsFetch: FetchLike = async () => Response.json({ keys: [signer.publicJwk] });

beforeAll(async () => {
  signer = await makeAccessSigner();
});

beforeEach(() => clearCertCache());

afterEach(() => {
  vi.useRealTimers();
});

describe('verifyAccessJwt', () => {
  it('accepts a good token and returns the email in lowercase', async () => {
    expect(await verifyAccessJwt(await signer.sign(goodPayload()), config, certsFetch)).toEqual({
      ok: true,
      email: 'profesor@example.com',
    });
  });

  it('accepts an audience written as one string', async () => {
    const token = await signer.sign({ ...goodPayload(), aud: AUD });
    expect((await verifyAccessJwt(token, config, certsFetch)).ok).toBe(true);
  });

  it('refuses a missing token', async () => {
    expect((await verifyAccessJwt(undefined, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a token that is not RS256', async () => {
    const token = await signer.sign(goodPayload(), { alg: 'HS256', kid: 'key-1' });
    expect((await verifyAccessJwt(token, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a malformed token with null header', async () => {
    expect(await verifyAccessJwt('bnVsbA.e30.AA', config, certsFetch)).toEqual({
      ok: false,
      message: 'Token de autentificare greșit.',
    });
  });

  it.each(['abc', 'a.b', 'a.b.c.d', '%%%.e30.AA', `${encodeJson({ alg: 'RS256' })}.not-json.AA`])(
    'refuses %j as a malformed token',
    async (token) => {
      expect(await verifyAccessJwt(token, config, certsFetch)).toEqual({ ok: false, message: 'Token de autentificare greșit.' });
    },
  );

  it('refuses a token signed with an unknown key id', async () => {
    const token = await signer.sign(goodPayload(), { alg: 'RS256', kid: 'other' });
    expect(await verifyAccessJwt(token, config, certsFetch)).toEqual({
      ok: false,
      message: 'Cheie de autentificare necunoscută.',
    });
  });

  it('refuses a changed payload', async () => {
    const [head, , sig] = (await signer.sign(goodPayload())).split('.');
    const forged = `${head}.${encodeJson({ ...goodPayload(), email: 'intruder@example.com' })}.${sig}`;
    expect((await verifyAccessJwt(forged, config, certsFetch)).ok).toBe(false);
  });

  it('refuses an expired token', async () => {
    const token = await signer.sign({ ...goodPayload(), exp: nowSec() - 1 });
    expect(await verifyAccessJwt(token, config, certsFetch)).toEqual({ ok: false, message: 'Autentificarea a expirat.' });
  });

  it('refuses a token that is valid only later, with one minute of leeway', async () => {
    const later = await signer.sign({ ...goodPayload(), nbf: nowSec() + 120 });
    const almostNow = await signer.sign({ ...goodPayload(), nbf: nowSec() + 30 });
    expect(await verifyAccessJwt(later, config, certsFetch)).toEqual({
      ok: false,
      message: 'Autentificarea nu este încă validă.',
    });
    expect((await verifyAccessJwt(almostNow, config, certsFetch)).ok).toBe(true);
  });

  it('refuses a token for another audience or issuer', async () => {
    const otherAudience = await signer.sign({ ...goodPayload(), aud: ['other'] });
    const otherIssuer = await signer.sign({ ...goodPayload(), iss: 'https://evil.example' });
    expect((await verifyAccessJwt(otherAudience, config, certsFetch)).ok).toBe(false);
    expect((await verifyAccessJwt(otherIssuer, config, certsFetch)).ok).toBe(false);
  });

  it('refuses a token without an email', async () => {
    const { email: _ignored, ...payload } = goodPayload();
    expect((await verifyAccessJwt(await signer.sign(payload), config, certsFetch)).ok).toBe(false);
  });
});

describe('verifyAccessJwt key downloads', () => {
  it('downloads the keys again once when it meets an unknown key id', async () => {
    let calls = 0;
    const rotatingFetch: FetchLike = async () => {
      calls += 1;
      return Response.json({ keys: calls === 1 ? [] : [signer.publicJwk] });
    };
    expect((await verifyAccessJwt(await signer.sign(goodPayload()), config, rotatingFetch)).ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('forces at most one download per 30 seconds for unknown key ids', async () => {
    let calls = 0;
    const countingFetch: FetchLike = async () => {
      calls += 1;
      return Response.json({ keys: [signer.publicJwk] });
    };
    const unknownA = await signer.sign(goodPayload(), { alg: 'RS256', kid: 'made-up-a' });
    const unknownB = await signer.sign(goodPayload(), { alg: 'RS256', kid: 'made-up-b' });
    await verifyAccessJwt(unknownA, config, countingFetch);
    await verifyAccessJwt(unknownB, config, countingFetch);
    expect(calls).toBe(2);
  });

  it('reports a failed key download as unavailable, without throwing', async () => {
    const failingFetch: FetchLike = async () => new Response('down', { status: 503 });
    expect(await verifyAccessJwt(await signer.sign(goodPayload()), config, failingFetch)).toEqual({
      ok: false,
      message: 'Nu pot verifica autentificarea acum.',
      unavailable: true,
    });
  });

  it('keeps using the downloaded keys when a later download fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let up = true;
    const flakyFetch: FetchLike = async () => (up ? Response.json({ keys: [signer.publicJwk] }) : new Response('down', { status: 503 }));
    expect((await verifyAccessJwt(await signer.sign(goodPayload()), config, flakyFetch)).ok).toBe(true);
    up = false;
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    expect((await verifyAccessJwt(await signer.sign(goodPayload()), config, flakyFetch)).ok).toBe(true);
  });
});
```

- [ ] **Step 7: Replace `server/routes/admin.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { clearCertCache } from '../auth/access.ts';
import { makeAccessSigner } from '../test/accessSigner.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

const ACCESS_ENV = { ACCESS_TEAM_DOMAIN: 'school.cloudflareaccess.com', ACCESS_AUD: 'aud' };

let api: TestApi | undefined;

// Answers the Access key download; every other request (the local D1 engine) goes through.
function mockAccessCerts(answer: () => Response) {
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
    String(input instanceof Request ? input.url : input).includes('cloudflareaccess.com/cdn-cgi/access/certs') ? answer() : realFetch(input, init),
  );
}

beforeEach(() => clearCertCache());

afterEach(async () => {
  vi.restoreAllMocks();
  await api?.dispose();
  api = undefined;
});

describe('GET /api/admin/me', () => {
  it('returns the teacher of the local development login', async () => {
    api = await startTestApi();
    const res = await api.request('GET', '/api/admin/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ teacher: { id: api.teacherId, email: 'profesor@example.com', name: 'Laura Miron' } });
  });

  it('refuses a login email that is not a teacher', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: 'stranger@example.com' } });
    const res = await api.request('GET', '/api/admin/me');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('unknown_teacher');
  });

  it('ignores the development login on a real host and asks for Access', async () => {
    api = await startTestApi({ env: ACCESS_ENV });
    const res = await createApp().request('https://quickeval.pages.dev/api/admin/me', {}, api.env);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'access_denied', message: 'Lipsește autentificarea.' });
  });

  it('accepts the development login on 127.0.0.1 too', async () => {
    api = await startTestApi();
    const res = await createApp().request('http://127.0.0.1/api/admin/me', {}, api.env);
    expect(res.status).toBe(200);
  });

  it('accepts a valid Access token on a real host', async () => {
    api = await startTestApi({ env: ACCESS_ENV });
    const signer = await makeAccessSigner();
    mockAccessCerts(() => Response.json({ keys: [signer.publicJwk] }));
    const token = await signer.sign({
      email: 'Profesor@Example.com',
      aud: ['aud'],
      iss: 'https://school.cloudflareaccess.com',
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const res = await createApp().request(
      'https://quickeval.pages.dev/api/admin/me',
      { headers: { 'Cf-Access-Jwt-Assertion': token } },
      api.env,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).teacher.email).toBe('profesor@example.com');
  });

  it('answers 503 when the Access keys cannot be downloaded', async () => {
    api = await startTestApi({ env: ACCESS_ENV });
    const signer = await makeAccessSigner();
    mockAccessCerts(() => new Response('down', { status: 503 }));
    const token = await signer.sign({ email: 'profesor@example.com', aud: ['aud'], exp: Math.floor(Date.now() / 1000) + 600 });
    const res = await createApp().request(
      'https://quickeval.pages.dev/api/admin/me',
      { headers: { 'Cf-Access-Jwt-Assertion': token } },
      api.env,
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'access_unavailable', message: 'Nu pot verifica autentificarea acum.' });
  });

  it('names the missing Access settings when nothing is configured', async () => {
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined } });
    const res = await api.request('GET', '/api/admin/me');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('access_not_configured');
  });
});

describe('admin API protections', () => {
  it('refuses a write that comes from another site', async () => {
    api = await startTestApi();
    const res = await api.request('POST', '/api/admin/me', {}, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('cross_site');
  });

  it('refuses a write marked cross-site by the browser', async () => {
    api = await startTestApi();
    const res = await api.request('POST', '/api/admin/me', {}, { 'Sec-Fetch-Site': 'cross-site' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('cross_site');
  });

  it('answers unknown admin paths with a JSON 404', async () => {
    api = await startTestApi();
    const res = await api.request('GET', '/api/admin/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
```

- [ ] **Step 8: Replace `server/db/students.test.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';
import { listClassStudents } from './classes.ts';
import { addStudentsToClass } from './students.ts';

let api: TestApi;
let classId: number;

beforeAll(async () => {
  api = await startTestApi();
  const row = await api.db
    .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '6E2', 2026, '2026-10-06') RETURNING id")
    .bind(api.teacherId)
    .first<{ id: number }>();
  classId = row!.id;
});

afterAll(async () => {
  await api.dispose();
});

const count = async (sql: string) => (await api.db.prepare(sql).first<{ n: number }>())!.n;

describe('addStudentsToClass', () => {
  it('adds the students and enrolls them, with ids in name order', async () => {
    const added = await addStudentsToClass(api.db, api.teacherId, classId, ['Pop Ion', 'Ionescu Ana'], '2026-10-06T08:00:00.000Z');
    expect(added.map((s) => s.fullName)).toEqual(['Pop Ion', 'Ionescu Ana']);
    expect(added[1]!.id).toBe(added[0]!.id + 1);
    expect(await count(`SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ${classId}`)).toBe(2);
  });

  it('adds nothing when another request took the same ids', async () => {
    const studentsBefore = await count('SELECT COUNT(*) AS n FROM students');
    // A database whose "highest id" answer is stale, as if another request
    // inserted students between the read and the batch.
    const stale = {
      prepare: (sql: string) => api.db.prepare(sql.startsWith('SELECT COALESCE(MAX(id)') ? 'SELECT 0 AS max' : sql),
      batch: api.db.batch.bind(api.db),
    } as unknown as D1Database;
    await expect(addStudentsToClass(stale, api.teacherId, classId, ['Nou Elev'], '2026-10-06T08:00:00.000Z')).rejects.toMatchObject({
      status: 409,
      code: 'busy',
    });
    expect(await count('SELECT COUNT(*) AS n FROM students')).toBe(studentsBefore);
    expect(await count(`SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ${classId}`)).toBe(2);
  });
});

describe('addStudentsToClass ownership', () => {
  it('adds nothing to a class of another teacher', async () => {
    const otherTeacherId = await api.addTeacher('owner-check@example.com', 'Alt Profesor');
    const studentsBefore = await count('SELECT COUNT(*) AS n FROM students');
    await expect(addStudentsToClass(api.db, otherTeacherId, classId, ['Intrus Ion'], '2026-10-06T08:00:00.000Z')).rejects.toMatchObject({
      status: 404,
    });
    expect(await count('SELECT COUNT(*) AS n FROM students')).toBe(studentsBefore);
    expect(await count(`SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ${classId}`)).toBe(2);
  });
});

describe('listClassStudents', () => {
  it('lists the students for the owning teacher and nothing for another teacher', async () => {
    const row = await api.db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '7B', 2026, '2026-10-06') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const otherClassId = row!.id;
    await addStudentsToClass(api.db, api.teacherId, otherClassId, ['Zaharia Dan'], '2026-10-06T08:00:00.000Z');
    const otherTeacherId = await api.addTeacher('other@example.com', 'Alt Profesor');

    expect((await listClassStudents(api.db, api.teacherId, otherClassId)).map((s) => s.fullName)).toEqual(['Zaharia Dan']);
    expect(await listClassStudents(api.db, otherTeacherId, otherClassId)).toEqual([]);
  });
});
```

- [ ] **Step 9: Replace `server/routes/classes.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.dispose();
});

async function createClass(name: string, schoolYear = 2026) {
  const res = await api.request('POST', '/api/admin/classes', { name, schoolYear });
  expect(res.status).toBe(201);
  return res.body.class as { id: number; name: string };
}

describe('classes', () => {
  it('creates a class with a normalized name', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6e2', schoolYear: 2026 });
    expect(res.status).toBe(201);
    expect(res.body.class).toMatchObject({ name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 });
  });

  it('refuses the same class name twice in one school year', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6E2', schoolYear: 2026 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Clasa 6E2 există deja în anul școlar 2026-2027.');
  });

  it('allows the same class name in another school year', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6E2', schoolYear: 2027 });
    expect(res.status).toBe(201);
  });

  it('refuses a bad class name with a Romanian message', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6-E2', schoolYear: 2026 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Numele clasei are 1-8 litere și cifre, de exemplu 6E2.');
  });

  it('lists the classes of one school year, active first, in number order', async () => {
    await createClass('11R1');
    const archived = await createClass('9R2');
    await api.request('PATCH', `/api/admin/classes/${archived.id}`, { archived: true });
    const res = await api.request('GET', '/api/admin/classes?year=2026');
    expect(res.status).toBe(200);
    expect(res.body.classes.map((c: { name: string }) => c.name)).toEqual(['6E2', '11R1', '9R2']);
  });

  it('refuses a body that is not JSON', async () => {
    const res = await api.request('POST', '/api/admin/classes', undefined, { 'Content-Type': 'text/plain' });
    expect(res.status).toBe(415);
    expect(res.body.error).toBe('bad_content_type');
  });

  it('refuses a bad year in the list', async () => {
    const res = await api.request('GET', '/api/admin/classes?year=abc');
    expect(res.status).toBe(400);
  });

  it('renames a class', async () => {
    const created = await createClass('7E2');
    const res = await api.request('PATCH', `/api/admin/classes/${created.id}`, { name: '7e3' });
    expect(res.status).toBe(200);
    expect(res.body.class.name).toBe('7E3');
  });

  it('refuses a rename to a name that already exists', async () => {
    const created = await createClass('8E2');
    const res = await api.request('PATCH', `/api/admin/classes/${created.id}`, { name: '6E2' });
    expect(res.status).toBe(409);
  });

  it('hides the classes of other teachers', async () => {
    const otherId = await api.addTeacher('other@example.com', 'Alt Profesor');
    const row = await api.db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '5A', 2026, '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    expect((await api.request('GET', `/api/admin/classes/${row!.id}`)).status).toBe(404);
    expect((await api.request('PATCH', `/api/admin/classes/${row!.id}`, { archived: true })).status).toBe(404);
    const list = await api.request('GET', '/api/admin/classes?year=2026');
    expect(list.body.classes.map((c: { name: string }) => c.name)).not.toContain('5A');
  });

  it('answers 404 for an id that is not a number', async () => {
    expect((await api.request('GET', '/api/admin/classes/abc')).status).toBe(404);
  });
});

describe('students in a class', () => {
  it('adds pasted names, cleaned, and lists them in Romanian order', async () => {
    const created = await createClass('10A');
    const add = await api.request('POST', `/api/admin/classes/${created.id}/students`, {
      names: ['2. Ștefan Ana', 'Sandu  Ion', 'Tudor Ema'],
    });
    expect(add.status).toBe(201);
    expect(add.body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Ștefan Ana', 'Sandu Ion', 'Tudor Ema']);

    const detail = await api.request('GET', `/api/admin/classes/${created.id}`);
    expect(detail.body.class.studentCount).toBe(3);
    expect(detail.body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Sandu Ion', 'Ștefan Ana', 'Tudor Ema']);
  });

  it('adds 60 names in one request', async () => {
    const created = await createClass('10B');
    const names = Array.from({ length: 60 }, (_, i) => `Elev ${i + 1}`);
    const res = await api.request('POST', `/api/admin/classes/${created.id}/students`, { names });
    expect(res.status).toBe(201);
    expect(new Set(res.body.students.map((s: { id: number }) => s.id)).size).toBe(60);
  });

  it('marks a student as left and back, keeping the student in the list', async () => {
    const created = await createClass('10C');
    const add = await api.request('POST', `/api/admin/classes/${created.id}/students`, { names: ['Pop Ion'] });
    const studentId = add.body.students[0].id;

    const left = await api.request('PATCH', `/api/admin/classes/${created.id}/students/${studentId}`, { active: false });
    expect(left.status).toBe(200);
    expect(left.body.student).toEqual({ id: studentId, fullName: 'Pop Ion', active: false });

    const detail = await api.request('GET', `/api/admin/classes/${created.id}`);
    expect(detail.body.class.studentCount).toBe(0);
    expect(detail.body.students).toEqual([{ id: studentId, fullName: 'Pop Ion', active: false }]);

    const back = await api.request('PATCH', `/api/admin/classes/${created.id}/students/${studentId}`, { active: true });
    expect(back.body.student.active).toBe(true);
  });

  it('refuses to add students to a class that does not exist', async () => {
    const res = await api.request('POST', '/api/admin/classes/99999/students', { names: ['Pop Ion'] });
    expect(res.status).toBe(404);
  });

  it('answers 404 when the student is not in that class', async () => {
    const created = await createClass('10D');
    const res = await api.request('PATCH', `/api/admin/classes/${created.id}/students/99999`, { active: false });
    expect(res.status).toBe(404);
  });
});

describe('students of another teacher', () => {
  it('cannot be added to or changed in that teacher class', async () => {
    const otherId = await api.addTeacher('neighbour@example.com', 'Alt Profesor');
    const otherClass = await api.db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '5B', 2026, '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    const otherStudent = await api.db
      .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Elev Străin', '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(otherClass!.id, otherStudent!.id).run();

    const add = await api.request('POST', `/api/admin/classes/${otherClass!.id}/students`, { names: ['Intrus Ion'] });
    expect(add.status).toBe(404);
    const leave = await api.request('PATCH', `/api/admin/classes/${otherClass!.id}/students/${otherStudent!.id}`, { active: false });
    expect(leave.status).toBe(404);

    const enrollment = await api.db
      .prepare('SELECT active FROM enrollments WHERE class_id = ? AND student_id = ?')
      .bind(otherClass!.id, otherStudent!.id)
      .first<{ active: number }>();
    expect(enrollment?.active).toBe(1);
    const enrolled = await api.db
      .prepare('SELECT COUNT(*) AS n FROM enrollments WHERE class_id = ?')
      .bind(otherClass!.id)
      .first<{ n: number }>();
    expect(enrolled?.n).toBe(1);
  });
});
```

- [ ] **Step 10: Run the tests to see them fail**

Run: `npx vitest run server/app.test.ts server/auth/access.test.ts server/db/students.test.ts server/http.test.ts server/routes/admin.test.ts server/routes/classes.test.ts shared/ids.test.ts`
Expected: FAIL. `Test Files  6 failed | 1 passed (7)`, `Tests  7 failed | 62 passed (69)`. `shared/ids.test.ts` fails with `Cannot find module './ids.ts'`. The 7 failing tests: the two header checks in `server/app.test.ts` (`expected null to be 'nosniff'`), the `parseId` check in `server/http.test.ts` (`expected 200 to be 404`), `adds nothing to a class of another teacher` (`promise resolved … instead of rejecting`), the two key-download checks in `server/auth/access.test.ts`, and the 503 check in `server/routes/admin.test.ts` (`expected 403 to be 503`).

- [ ] **Step 11: Create `shared/ids.ts`**

```ts
const POSITIVE_ID = /^[1-9]\d{0,15}$/;

// Ids in URLs are plain positive integers written in digits only: "12" is an
// id, but "012", "1e3", "0x10", " 5 " and "-1" are not. Returns null for
// anything else, so a typed or broken URL shows "not found".
export function parsePositiveId(raw: string | undefined): number | null {
  if (raw === undefined || !POSITIVE_ID.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
```

- [ ] **Step 12: Replace `server/http.ts`**

```ts
import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { parsePositiveId } from '../shared/ids.ts';
import { ApiError, notFound } from './errors.ts';

// Reads a JSON body and checks it with a zod schema. The first problem becomes
// a 400 with the schema's Romanian message.
export async function readJson<Schema extends z.ZodType>(c: Context, schema: Schema): Promise<z.output<Schema>> {
  const type = c.req.header('Content-Type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'bad_content_type', 'Cererea trebuie trimisă ca JSON.');
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'bad_json', 'Cererea nu este JSON valid.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Datele trimise nu sunt valide.');
  }
  return parsed.data;
}

// Route ids are positive integers. Anything else is a page that does not exist.
export function parseId(raw: string | undefined): number {
  const id = parsePositiveId(raw);
  if (id === null) throw notFound();
  return id;
}

// Writes must come from our own pages. A cross-site form or fetch carries
// Sec-Fetch-Site or an Origin from another site; both are refused.
export const sameOriginWrites: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const site = c.req.header('Sec-Fetch-Site');
    const origin = c.req.header('Origin');
    if ((site && site !== 'same-origin') || (origin && origin !== new URL(c.req.url).origin)) {
      throw new ApiError(403, 'cross_site', 'Cererea vine de pe alt site și a fost refuzată.');
    }
  }
  await next();
};

export function nowIso(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 13: Replace `server/app.ts`**

```ts
import { Hono } from 'hono';
import type { AppEnv } from './env.ts';
import { ApiError } from './errors.ts';
import { adminRoutes } from './routes/admin.ts';

// The whole API. functions/api/[[route]].ts serves it on Cloudflare Pages.
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>().basePath('/api');

  // public/_headers does not reach Function responses, so the API sets its own:
  // browsers must not guess content types, and nothing private is cached.
  // A route that sets its own Cache-Control keeps it.
  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
  });

  app.route('/admin', adminRoutes());

  app.notFound((c) => c.json({ error: 'not_found', message: 'Nu am găsit ce cauți.' }, 404));
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.code, message: err.message }, err.status);
    console.error('API error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'internal', message: 'A apărut o eroare. Încearcă din nou.' }, 500);
  });
  return app;
}

export const app = createApp();
```

- [ ] **Step 14: Replace `server/auth/access.ts`**

```ts
// Checks the Cloudflare Access login token (Cf-Access-Jwt-Assertion header):
// RS256 signature against the team's published keys, issuer, audience, expiry
// and not-before. Ported from the Website's functions/tm25mlg/api/_middleware.js.

export interface AccessConfig {
  teamDomain: string;
  aud: string;
}

// unavailable: the token could not be checked because the team's keys could
// not be downloaded. The caller answers 503 (try again later), not 403.
export type AccessResult = { ok: true; email: string } | { ok: false; message: string; unavailable?: true };

export type FetchLike = (url: string) => Promise<Response>;

interface Jwk extends JsonWebKey {
  kid?: string;
}

interface ParsedJwt {
  header: { alg?: string; kid?: string };
  payload: { email?: unknown; aud?: unknown; iss?: unknown; exp?: unknown; nbf?: unknown };
  signingInput: string;
  signature: Uint8Array<ArrayBuffer>;
}

const CACHE_FOR_MS = 5 * 60 * 1000;
// At most one forced download per this time, so tokens with made-up key ids
// cannot turn into a stream of downloads.
const REFETCH_EVERY_MS = 30 * 1000;

let certCache: { at: number; forcedAt: number; keys: Jwk[] | null } = { at: 0, forcedAt: 0, keys: null };

// Test hook: forget the cached signing keys.
export function clearCertCache(): void {
  certCache = { at: 0, forcedAt: 0, keys: null };
}

function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  let b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseJwt(token: string): ParsedJwt | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts as [string, string, string];
  try {
    const decode = (part: string) => JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
    const header = decode(head);
    const payload = decode(body);
    // Validate that header and payload are non-null objects (not arrays)
    if (!header || typeof header !== 'object' || Array.isArray(header)) return null;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    return { header, payload, signingInput: `${head}.${body}`, signature: base64UrlToBytes(sig) };
  } catch {
    return null;
  }
}

// fresh: skip the cache once, because Access rotates its signing keys.
// When the download fails, keys downloaded earlier are still used: Access
// keeps old keys valid for a while after a rotation.
async function accessKeys(teamDomain: string, fetchImpl: FetchLike, fresh: boolean): Promise<Jwk[]> {
  const now = Date.now();
  if (certCache.keys) {
    if (!fresh && now - certCache.at < CACHE_FOR_MS) return certCache.keys;
    if (fresh && now - certCache.forcedAt < REFETCH_EVERY_MS) return certCache.keys;
  }
  if (fresh) certCache.forcedAt = now;
  try {
    const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`certs HTTP ${res.status}`);
    const json = (await res.json()) as { keys?: Jwk[] };
    certCache.keys = json.keys ?? [];
    certCache.at = now;
    return certCache.keys;
  } catch (err) {
    if (certCache.keys) return certCache.keys;
    throw err;
  }
}

export async function verifyAccessJwt(
  token: string | undefined,
  config: AccessConfig,
  fetchImpl: FetchLike = (url) => fetch(url),
): Promise<AccessResult> {
  if (!token) return { ok: false, message: 'Lipsește autentificarea.' };
  const jwt = parseJwt(token);
  if (!jwt || jwt.header.alg !== 'RS256') return { ok: false, message: 'Token de autentificare greșit.' };

  const findKey = async (fresh: boolean) =>
    (await accessKeys(config.teamDomain, fetchImpl, fresh)).find((key) => key.kid === jwt.header.kid) ?? null;
  let jwk: Jwk | null;
  try {
    jwk = (await findKey(false)) ?? (await findKey(true));
  } catch {
    return { ok: false, message: 'Nu pot verifica autentificarea acum.', unavailable: true };
  }
  if (!jwk) return { ok: false, message: 'Cheie de autentificare necunoscută.' };

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } catch {
    return { ok: false, message: 'Cheie de autentificare greșită.' };
  }
  const valid = await crypto.subtle
    .verify('RSASSA-PKCS1-v1_5', key, jwt.signature, new TextEncoder().encode(jwt.signingInput))
    .catch(() => false);
  if (!valid) return { ok: false, message: 'Semnătura autentificării nu este validă.' };

  const { email, aud, iss, exp, nbf } = jwt.payload;
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof exp !== 'number' || exp <= nowSec) return { ok: false, message: 'Autentificarea a expirat.' };
  // One minute of leeway for clock drift between Access and this Function.
  if (typeof nbf === 'number' && nbf > nowSec + 60) return { ok: false, message: 'Autentificarea nu este încă validă.' };
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(config.aud)) return { ok: false, message: 'Autentificare pentru altă aplicație.' };
  if (String(iss ?? '').replace(/\/+$/, '') !== `https://${config.teamDomain}`) {
    return { ok: false, message: 'Autentificare de la alt emitent.' };
  }
  if (typeof email !== 'string' || email === '') return { ok: false, message: 'Autentificarea nu are email.' };
  return { ok: true, email: email.toLowerCase() };
}
```

- [ ] **Step 15: Replace `server/auth/teacherAuth.ts`**

```ts
import type { Context, MiddlewareHandler } from 'hono';
import { findTeacherByEmail } from '../db/teachers.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { verifyAccessJwt } from './access.ts';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// The email of the person who made the request. Production: the Cloudflare
// Access token, checked again here because Access runs before this code.
// Local development: DEV_TEACHER_EMAIL from .dev.vars, but only for requests
// to localhost, so the setting can never open the live site.
async function loginEmail(c: Context<AppEnv>): Promise<string> {
  const devEmail = c.env.DEV_TEACHER_EMAIL?.trim().toLowerCase();
  if (devEmail && LOCAL_HOSTS.has(new URL(c.req.url).hostname)) return devEmail;

  const teamDomain = (c.env.ACCESS_TEAM_DOMAIN ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const aud = (c.env.ACCESS_AUD ?? '').trim();
  if (!teamDomain || !aud) {
    throw new ApiError(500, 'access_not_configured', 'Autentificarea nu este configurată: lipsesc ACCESS_TEAM_DOMAIN sau ACCESS_AUD.');
  }
  const result = await verifyAccessJwt(c.req.header('Cf-Access-Jwt-Assertion'), { teamDomain, aud });
  if (!result.ok) {
    if (result.unavailable) throw new ApiError(503, 'access_unavailable', result.message);
    throw new ApiError(403, 'access_denied', result.message);
  }
  return result.email;
}

// Puts the logged-in teacher in c.var.teacher, or refuses the request.
export function teacherAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const email = await loginEmail(c);
    const teacher = await findTeacherByEmail(c.env.DB, email);
    if (!teacher) throw new ApiError(403, 'unknown_teacher', 'Contul tău nu are acces la QuickEval.');
    c.set('teacher', teacher);
    await next();
  };
}
```

- [ ] **Step 16: Replace `server/db/students.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { StudentRow } from '../../shared/api.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';

// Adds new students and enrolls them in the class with a fixed number of
// queries, whatever the number of names: the free plan limits the queries per
// request. The ids are chosen here (one above the current maximum) so the
// enrollment insert can name them. Both inserts run in one batch, which D1 runs
// as one transaction: either every name is added or none is. If another request
// took one of these ids in the meantime, the batch fails on the primary key and
// the teacher is asked to try again. Both inserts also check that the class
// belongs to the teacher, so nothing is added to another teacher's class.
export async function addStudentsToClass(
  db: D1Database,
  teacherId: number,
  classId: number,
  names: string[],
  now: string,
): Promise<StudentRow[]> {
  const top = await db.prepare('SELECT COALESCE(MAX(id), 0) AS max FROM students').first<{ max: number }>();
  const rows = names.map((fullName, index) => ({ id: (top?.max ?? 0) + index + 1, fullName }));
  const json = JSON.stringify(rows);
  const ownsClass = 'EXISTS (SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?)';
  let inserted: number;
  try {
    const [students] = await db.batch([
      db
        .prepare(
          `INSERT INTO students (id, teacher_id, full_name, created_at)
           SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.fullName'), ? FROM json_each(?)
           WHERE ${ownsClass}`,
        )
        .bind(teacherId, now, json, classId, teacherId),
      db
        .prepare(`INSERT INTO enrollments (class_id, student_id) SELECT ?, json_extract(value, '$.id') FROM json_each(?) WHERE ${ownsClass}`)
        .bind(classId, json, classId, teacherId),
    ]);
    inserted = students?.meta.changes ?? 0;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, 'busy', 'Altcineva a adăugat elevi în același timp. Încearcă din nou.');
    }
    throw err;
  }
  if (inserted === 0) throw notFound();
  return rows.map((row) => ({ id: row.id, fullName: row.fullName, active: true }));
}

// Marks a student as left (active = false) or back in the class. The class must
// belong to the teacher. Returns null when the student is not in that class.
export async function setEnrollmentActive(
  db: D1Database,
  teacherId: number,
  classId: number,
  studentId: number,
  active: boolean,
): Promise<StudentRow | null> {
  const row = await db
    .prepare(
      `UPDATE enrollments SET active = ?
       WHERE class_id = ? AND student_id = ?
         AND class_id IN (SELECT id FROM classes WHERE teacher_id = ?)
       RETURNING student_id`,
    )
    .bind(active ? 1 : 0, classId, studentId, teacherId)
    .first<{ student_id: number }>();
  if (!row) return null;
  const student = await db
    .prepare('SELECT full_name FROM students WHERE id = ? AND teacher_id = ?')
    .bind(studentId, teacherId)
    .first<{ full_name: string }>();
  return { id: studentId, fullName: student!.full_name, active };
}

export async function renameStudent(
  db: D1Database,
  teacherId: number,
  studentId: number,
  fullName: string,
): Promise<{ id: number; fullName: string } | null> {
  const row = await db
    .prepare('UPDATE students SET full_name = ? WHERE id = ? AND teacher_id = ? RETURNING id')
    .bind(fullName, studentId, teacherId)
    .first<{ id: number }>();
  return row ? { id: row.id, fullName } : null;
}
```

- [ ] **Step 17: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  18 passed (18)`, `Tests  143 passed (143)`.

- [ ] **Step 18: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 19: Commit**

```bash
git add shared/ids.ts shared/ids.test.ts server
git commit -m "Harden the API: teacher-scoped student adds, strict ids, no-store answers, 503 on Access outages"
```

---

### Task 2: Teacher app follow-ups

The teacher app gets an error boundary with a Romanian message, the class page resets per class and accepts only plain-digit ids, and archived cards keep full-contrast buttons.

**Files:**
- Create: `src/ui/ErrorBoundary.tsx`
- Modify: `src/admin/Layout.tsx`, `src/admin/pages/ClassPage.tsx`, `src/admin/pages/ClassesPage.tsx`, `src/ui/brand.css`, `src/test/renderAdmin.tsx`
- Test: `src/ui/ErrorBoundary.test.tsx` (new), `src/admin/pages/ClassPage.test.tsx` (modified)

**Interfaces:**
- Consumes: `parsePositiveId` (Task 1).
- Produces:
  - `ErrorBoundary` (class component, props `{ children }`) in `src/ui/ErrorBoundary.tsx`. The student app uses it in Task 11.
  - `renderAdmin(path, api, extra?)`: `extra` is drawn inside the router, above the pages. Task 9 widens `path`.
  - CSS class `card-count` for the count line of a card.

- [ ] **Step 1: Create `src/ui/ErrorBoundary.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary.tsx';

function Broken(): never {
  throw new Error('render failed');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('shows its children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>Conținut</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Conținut')).toBeInTheDocument();
  });

  it('shows a Romanian message and a reload button when a child crashes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Pagina nu s-a putut afișa. Reîncarcă pagina și încearcă din nou.');
    expect(screen.getByRole('button', { name: 'Reîncarcă pagina' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Replace `src/test/renderAdmin.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { ApiProvider } from '../admin/ApiContext.tsx';
import type { AdminApi } from '../admin/api.ts';
import { AppRoutes } from '../admin/AppRoutes.tsx';
import { SchoolYearProvider } from '../admin/SchoolYearContext.tsx';

// Renders the teacher app at a path (without the /admin basename), with a fake
// API and school year 2026-2027. `extra` is drawn inside the router, above the
// pages; tests use it for a button that navigates.
export function renderAdmin(path: string, api: AdminApi, extra?: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <SchoolYearProvider initialYear={2026}>
          <MemoryRouter initialEntries={[path]}>
            {extra}
            <AppRoutes />
          </MemoryRouter>
        </SchoolYearProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
}
```

- [ ] **Step 3: Replace `src/admin/pages/ClassPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

// Direct jumps between class pages, as a link from one class to another would do.
function Jumps() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/clase/1')}>
        Mergi la clasa 1
      </button>
      <button type="button" onClick={() => navigate('/clase/2')}>
        Mergi la clasa 2
      </button>
    </>
  );
}

const oneClass = () =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {
      1: [
        { id: 10, fullName: 'Pop Ion', active: true },
        { id: 11, fullName: 'Ionescu Ana', active: false },
      ],
    },
  });

describe('ClassPage', () => {
  it('shows the class and its students, with students who left marked', async () => {
    renderAdmin('/clase/1', oneClass());
    expect(await screen.findByRole('heading', { name: 'Clasa 6E2 · 2026-2027' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Elevi (1 elev)' })).toBeInTheDocument();
    const left = screen.getByText('Ionescu Ana').closest('li')!;
    expect(within(left).getByText('a plecat')).toBeInTheDocument();
  });

  it('adds pasted names, one per line, without list numbers', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const box = await screen.findByLabelText('Numele elevilor, câte unul pe rând');
    await userEvent.type(box, '1. Marin Dan{Enter}{Enter}2) Stan Eva');
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă 2 elevi' }));
    expect(api.addStudents).toHaveBeenCalledWith(1, ['Marin Dan', 'Stan Eva']);
    expect(await screen.findByText('Marin Dan')).toBeInTheDocument();
    expect(box).toHaveValue('');
  });

  it('marks a student as left', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'A plecat' }));
    expect(api.setStudentActive).toHaveBeenCalledWith(1, 10, false);
    expect(await within(row).findByRole('button', { name: 'Revine în clasă' })).toBeInTheDocument();
  });

  it('renames a student', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Redenumește' }));
    const input = screen.getByLabelText('Numele elevului');
    await userEvent.clear(input);
    await userEvent.type(input, 'Pop Ioan');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.renameStudent).toHaveBeenCalledWith(10, 'Pop Ioan');
    expect(await screen.findByText('Pop Ioan')).toBeInTheDocument();
  });

  it('renames the class', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește clasa' }));
    const input = screen.getByLabelText('Nume nou');
    await userEvent.clear(input);
    await userEvent.type(input, '6E3');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.updateClass).toHaveBeenCalledWith(1, { name: '6E3' });
    expect(await screen.findByRole('heading', { name: 'Clasa 6E3 · 2026-2027' })).toBeInTheDocument();
  });

  it.each(['abc', '1e3', '01'])('shows the not-found page for the class id %j', async (id) => {
    renderAdmin(`/clase/${id}`, oneClass());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('starts with an empty draft when it moves straight to another class', async () => {
    const api = createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
        { id: 2, name: '7E2', schoolYear: 2026, archived: false, studentCount: 0 },
      ],
      students: {},
    });
    // Class 2 is opened first, so later its page shows at once, without a loading step.
    renderAdmin('/clase/2', api, <Jumps />);
    await screen.findByRole('heading', { name: 'Clasa 7E2 · 2026-2027' });
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la clasa 1' }));
    await userEvent.type(await screen.findByLabelText('Numele elevilor, câte unul pe rând'), 'Pop Ion');
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la clasa 2' }));
    expect(await screen.findByRole('heading', { name: 'Clasa 7E2 · 2026-2027' })).toBeInTheDocument();
    expect(screen.getByLabelText('Numele elevilor, câte unul pe rând')).toHaveValue('');
  });

  it('shows the server message for a class that does not exist', async () => {
    renderAdmin('/clase/999', oneClass());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/ClassPage.test.tsx src/ui/ErrorBoundary.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  3 failed | 7 passed (10)`. `src/ui/ErrorBoundary.test.tsx` fails with `Failed to resolve import "./ErrorBoundary.tsx"`. In `ClassPage.test.tsx` the ids `"1e3"` and `"01"` do not show the not-found page, and the draft test fails on `toHaveValue` (the draft carries over to class 2).

- [ ] **Step 5: Create `src/ui/ErrorBoundary.tsx`**

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

// Catches a page that crashes while it draws, so the reader sees a Romanian
// message and a reload button instead of an empty screen. Give it a new key
// on every page change, so moving to another page clears the error.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Page error:', error.message, info.componentStack ?? '');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="alert" role="alert">
        <p className="alert-text">Pagina nu s-a putut afișa. Reîncarcă pagina și încearcă din nou.</p>
        <button type="button" className="button-quiet button-small" onClick={() => window.location.reload()}>
          Reîncarcă pagina
        </button>
      </div>
    );
  }
}
```

- [ ] **Step 6: Replace `src/admin/Layout.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { formatSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { useApi } from './ApiContext.tsx';
import { ErrorMessage } from './ErrorMessage.tsx';
import { schoolYearOptions, useSchoolYear } from './SchoolYearContext.tsx';

export function Layout() {
  const api = useApi();
  const location = useLocation();
  const { year, setYear } = useSchoolYear();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });

  return (
    <>
      <header className="site-header">
        <div className="wrap header-bar">
          <Link className="brand" to="/">
            <BrandMark />
            <span className="brand-text">
              <span className="brand-name">QuickEval</span>
              <span className="brand-sub">Matematică cu Laura Miron</span>
            </span>
          </Link>
          <nav className="main-nav" aria-label="Meniu">
            <NavLink to="/clase">Clase</NavLink>
          </nav>
          <div className="header-tools">
            <label className="sr-only" htmlFor="school-year">
              Anul școlar
            </label>
            <select id="school-year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {schoolYearOptions(schoolYearOf(new Date())).map((option) => (
                <option key={option} value={option}>
                  {formatSchoolYear(option)}
                </option>
              ))}
            </select>
            <ThemeButton />
          </div>
        </div>
      </header>
      <main className="wrap page">
        {me.error ? (
          <ErrorMessage error={me.error} />
        ) : (
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        )}
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <p>QuickEval{me.data ? ` · ${me.data.name}` : ''}</p>
        </div>
      </footer>
    </>
  );
}
```

- [ ] **Step 7: Replace `src/admin/pages/ClassPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { StudentRow } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { MAX_NAMES_PER_REQUEST, parseStudentNames } from '../../../shared/students.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

export function ClassPage() {
  const classId = parsePositiveId(useParams().id);
  if (classId === null) return <NotFoundPage />;
  // A new key for each class: a draft or an open form never carries over to another class.
  return <ClassDetails key={classId} classId={classId} />;
}

function ClassDetails({ classId }: { classId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['class', classId], queryFn: () => api.getClass(classId) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['class', classId] });
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
  };

  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;

  const { class: info, students } = detail.data;
  return (
    <section>
      <p>
        <Link to="/clase">← Toate clasele</Link>
      </p>
      <h1>
        {displayClassName(info.name)} · {formatSchoolYear(info.schoolYear)}
      </h1>
      <RenameClassForm classId={classId} currentName={info.name} onDone={refresh} />

      <h2>Elevi ({studentCountLabel(info.studentCount)})</h2>
      {students.length === 0 ? (
        <p className="hint">Clasa nu are încă elevi. Adaugă-i mai jos.</p>
      ) : (
        <ol className="row-list">
          {students.map((student) => (
            <StudentItem key={student.id} classId={classId} student={student} onChanged={refresh} />
          ))}
        </ol>
      )}

      <h2>Adaugă elevi</h2>
      <AddStudentsForm classId={classId} onDone={refresh} />
    </section>
  );
}

function RenameClassForm({ classId, currentName, onDone }: { classId: number; currentName: string; onDone: () => Promise<void> }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const rename = useMutation({
    mutationFn: () => api.updateClass(classId, { name }),
    onSuccess: async () => {
      setOpen(false);
      await onDone();
    },
  });

  if (!open) {
    return (
      <button type="button" className="button-quiet button-small" onClick={() => setOpen(true)}>
        Redenumește clasa
      </button>
    );
  }
  return (
    <form
      className="form-row"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <label htmlFor="rename-class">Nume nou</label>
      <input id="rename-class" type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={20} required />
      <button className="button button-small" type="submit" disabled={rename.isPending}>
        Salvează
      </button>
      <button type="button" className="button-quiet button-small" onClick={() => setOpen(false)}>
        Renunță
      </button>
      {rename.error && <ErrorMessage error={rename.error} />}
    </form>
  );
}

function StudentItem({ classId, student, onChanged }: { classId: number; student: StudentRow; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(student.fullName);

  const toggle = useMutation({
    mutationFn: () => api.setStudentActive(classId, student.id, !student.active),
    onSuccess: onChanged,
  });
  const rename = useMutation({
    mutationFn: () => api.renameStudent(student.id, fullName),
    onSuccess: async () => {
      setEditing(false);
      await onChanged();
    },
  });

  if (editing) {
    return (
      <li>
        <form
          className="form-row"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            rename.mutate();
          }}
        >
          <label className="sr-only" htmlFor={`student-${student.id}`}>
            Numele elevului
          </label>
          <input id={`student-${student.id}`} type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={80} required />
          <button className="button button-small" type="submit" disabled={rename.isPending}>
            Salvează
          </button>
          <button type="button" className="button-quiet button-small" onClick={() => setEditing(false)}>
            Renunță
          </button>
        </form>
        {rename.error && <ErrorMessage error={rename.error} />}
      </li>
    );
  }

  return (
    <li className={student.active ? undefined : 'is-muted'}>
      <span className="row-name">{student.fullName}</span>
      {!student.active && <span className="tag">a plecat</span>}
      <button type="button" className="button-quiet button-small" onClick={() => setEditing(true)}>
        Redenumește
      </button>
      <button type="button" className="button-quiet button-small" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
        {student.active ? 'A plecat' : 'Revine în clasă'}
      </button>
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </li>
  );
}

function AddStudentsForm({ classId, onDone }: { classId: number; onDone: () => Promise<void> }) {
  const api = useApi();
  const [text, setText] = useState('');
  const names = parseStudentNames(text);
  const tooMany = names.length > MAX_NAMES_PER_REQUEST;
  const add = useMutation({
    mutationFn: () => api.addStudents(classId, names),
    onSuccess: async () => {
      setText('');
      await onDone();
    },
  });

  return (
    <form
      className="form-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      <label htmlFor="student-names">Numele elevilor, câte unul pe rând</label>
      <p className="hint" id="student-names-hint">
        Poți lipi lista din catalog. Numerele de la începutul rândurilor se șterg singure.
      </p>
      <textarea
        id="student-names"
        aria-describedby="student-names-hint"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {tooMany && (
        <p className="alert" role="alert">
          Adaugă cel mult {MAX_NAMES_PER_REQUEST} de nume odată.
        </p>
      )}
      <span>
        <button className="button" type="submit" disabled={names.length === 0 || tooMany || add.isPending}>
          {names.length > 0 ? `Adaugă ${studentCountLabel(names.length)}` : 'Adaugă elevii'}
        </button>
      </span>
      {add.error && <ErrorMessage error={add.error} />}
    </form>
  );
}
```

- [ ] **Step 8: Replace `src/admin/pages/ClassesPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { ClassSummary } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';

export function ClassesPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { year } = useSchoolYear();
  const [name, setName] = useState('');

  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['classes', year] });

  const create = useMutation({
    mutationFn: () => api.createClass({ name, schoolYear: year }),
    onSuccess: async () => {
      setName('');
      await refresh();
    },
  });

  const archive = useMutation({
    mutationFn: (item: ClassSummary) => api.updateClass(item.id, { archived: !item.archived }),
    onSuccess: refresh,
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <section>
      <h1>Clase {formatSchoolYear(year)}</h1>

      <form className="form-row" onSubmit={onSubmit}>
        <label htmlFor="class-name">Clasă nouă</label>
        <input
          id="class-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="de exemplu 6E2"
          maxLength={20}
          required
        />
        <button className="button" type="submit" disabled={create.isPending}>
          Adaugă clasa
        </button>
      </form>
      {create.error && <ErrorMessage error={create.error} />}
      {archive.error && <ErrorMessage error={archive.error} />}

      {classes.isPending && <p>Se încarcă…</p>}
      {classes.error && <ErrorMessage error={classes.error} />}
      {classes.data && classes.data.length === 0 && <p className="hint">Nu ai nicio clasă în acest an școlar.</p>}
      {classes.data && classes.data.length > 0 && (
        <ul className="card-list">
          {classes.data.map((item) => (
            <li key={item.id} className={item.archived ? 'card is-muted' : 'card'}>
              <Link className="card-title" to={`/clase/${item.id}`}>
                {displayClassName(item.name)}
              </Link>
              <span className="card-count">{studentCountLabel(item.studentCount)}</span>
              {item.archived && <span className="tag">Arhivată</span>}
              <span>
                <button
                  type="button"
                  className="button-quiet button-small"
                  onClick={() => archive.mutate(item)}
                  disabled={archive.isPending}
                >
                  {item.archived ? 'Scoate din arhivă' : 'Arhivează'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 9: Edit `src/ui/brand.css`**

Only the archived-card rule changes: it mutes the title and the count instead of the whole card. Find this block:

```css
.card.is-muted {
  opacity: 0.7;
}
```

Replace it with:

```css
/* An archived card: only its text is muted, so its buttons keep full contrast. */
.card.is-muted .card-title,
.card.is-muted .card-count {
  color: var(--muted);
}
```

- [ ] **Step 10: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  19 passed (19)`, `Tests  148 passed (148)`.

- [ ] **Step 11: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 12: Commit**

```bash
git add src
git commit -m "Add an error boundary, reset the class page per class, and keep archived buttons readable"
```

---

### Task 3: Storage, schema, and the shared rules for tests and files

The R2 binding, the second migration, and the pure rules that the later tasks build on: test codes, upload tokens, file types and limits, R2 keys, secrets, and reading and serving file bodies.

**Files:**
- Create: `migrations/0002_tests.sql`, `shared/tests.ts`, `shared/files.ts`, `server/secrets.ts`, `server/uploads.ts`
- Modify: `wrangler.toml`, `server/env.ts`, `server/test/testApi.ts`
- Test: `shared/tests.test.ts`, `shared/files.test.ts`, `server/secrets.test.ts`, `server/uploads.test.ts` (new), `server/app.test.ts` (modified)

**Interfaces:**
- Consumes: Task 1's test helper.
- Produces:
  - `Env.FILES: R2Bucket` (binding `FILES`, bucket `quickeval-files`); `startTestApi()` gives tests an empty in-memory bucket in `api.env.FILES`.
  - `shared/tests.ts`: `type TestStatus = 'draft' | 'open' | 'evaluating' | 'done'`, `MAX_TITLE_LENGTH = 120`, `buildTestCode(className, schoolYear, number): string` ("6E2-26T1"), `normalizeTestCode(raw): string | null` (any letter case), `isUploadToken(raw): boolean` (16 chars a-z2-7), `cleanTitle(raw): string`.
  - `shared/files.ts`: `MAX_FILE_BYTES`, `MAX_STUDENT_FILES = 20`, `PDF_TYPE`, `DOCX_TYPE`, `JPEG_TYPE`, `TEACHER_FILE_TYPES`, `STUDENT_FILE_TYPES`, messages `TEACHER_WRONG_TYPE`, `STUDENT_WRONG_TYPE`, `EMPTY_FILE`, `FILE_TOO_BIG`, `type TestFileKind = 'test' | 'barem'`, `isTestFileKind`, `extensionFor(type)`, `typeFromFileName(name)`, `uploadTypeOf(file)`, `fileProblem(file, allowedTypes, wrongTypeMessage): string | null`, `looksLike(type, firstBytes)`, `slugify(text, maxLength?)`, `testFolder(teacherId, schoolYear, code)`, `testFileKey(teacherId, schoolYear, code, kind, originalName, type)`, `studentFileKey(teacherId, schoolYear, code, studentId, studentName, position, random, type)`.
  - `server/secrets.ts`: `randomBase32(length)`, `newUploadToken()`, `newDeviceSecret()`, `sha256Hex(text): Promise<string>`.
  - `server/uploads.ts`: `interface UploadedFile { bytes: ArrayBuffer; contentType: string; name: string }`, `readUpload(c, allowedTypes, wrongTypeMessage): Promise<UploadedFile>` (415 wrong type, 413 over 25 MB, 400 empty), `fileNameHeader(raw)`, `fileResponse(object, name, type): Response` (inline, `private, no-store`, `X-Frame-Options: SAMEORIGIN`), `deleteFiles(bucket, keys)` (groups of 1000), `deleteFilesQuietly(bucket, keys)` (logs a failure instead of throwing).
  - Tables `tests`, `submissions`, `submission_files` with every column of spec §7.1 (the exercise-list and analysis columns wait for Plan 3), status CHECKs, and `ON DELETE CASCADE` from tests to uploads to file rows.

- [ ] **Step 1: Create `shared/tests.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildTestCode, cleanTitle, isUploadToken, normalizeTestCode } from './tests.ts';

describe('buildTestCode', () => {
  it('joins the class, the last two digits of the school year, and the number', () => {
    expect(buildTestCode('6E2', 2026, 1)).toBe('6E2-26T1');
    expect(buildTestCode('11R1', 2027, 12)).toBe('11R1-27T12');
    expect(buildTestCode('5A', 2100, 3)).toBe('5A-00T3');
  });
});

describe('normalizeTestCode', () => {
  it('accepts codes in any letter case', () => {
    expect(normalizeTestCode('6E2-26T1')).toBe('6E2-26T1');
    expect(normalizeTestCode('6e2-26t1')).toBe('6E2-26T1');
  });

  it.each(['', '6E2', '6E2-26', '6E2-2026T1', '6E2-26T1000', '6-E2-26T1', 'ABCDEFGHI-26T1', '6E2_26T1'])('refuses %j', (raw) => {
    expect(normalizeTestCode(raw)).toBeNull();
  });
});

describe('isUploadToken', () => {
  it('accepts 16 characters from a-z and 2-7 only', () => {
    expect(isUploadToken('abcdefghijklmn27')).toBe(true);
    expect(isUploadToken('abcdefghijklmn2')).toBe(false);
    expect(isUploadToken('abcdefghijklmn28')).toBe(false);
    expect(isUploadToken('ABCDEFGHIJKLMN27')).toBe(false);
  });
});

describe('cleanTitle', () => {
  it('trims and joins inner whitespace', () => {
    expect(cleanTitle('  Test de   evaluare\n inițială ')).toBe('Test de evaluare inițială');
  });
});
```

- [ ] **Step 2: Create `shared/files.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  DOCX_TYPE,
  extensionFor,
  fileProblem,
  isTestFileKind,
  looksLike,
  MAX_FILE_BYTES,
  PDF_TYPE,
  slugify,
  STUDENT_FILE_TYPES,
  STUDENT_WRONG_TYPE,
  studentFileKey,
  TEACHER_FILE_TYPES,
  TEACHER_WRONG_TYPE,
  testFileKey,
  testFolder,
  typeFromFileName,
  uploadTypeOf,
} from './files.ts';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

describe('slugify', () => {
  it('removes Romanian diacritics, comma-below and cedilla forms alike', () => {
    expect(slugify('Ștefănescu Țața Îonuț Âna')).toBe('stefanescu-tata-ionut-ana');
    expect(slugify('Şerban Ţuţu')).toBe('serban-tutu');
  });

  it('turns everything else into single dashes and trims them', () => {
    expect(slugify('  Test (final) #2!  ')).toBe('test-final-2');
  });

  it('cuts long names and never ends with a dash', () => {
    expect(slugify('a'.repeat(59) + ' b', 60)).toBe('a'.repeat(59));
  });

  it('falls back to "fisier" when nothing is left', () => {
    expect(slugify('!!!')).toBe('fisier');
    expect(slugify('')).toBe('fisier');
  });
});

describe('keys', () => {
  it('builds the test folder and the keys of the test and barem files', () => {
    expect(testFolder(1, 2026, '6E2-26T1')).toBe('t/1/2026/6E2-26T1/');
    expect(testFileKey(1, 2026, '6E2-26T1', 'barem', 'Barem final.PDF', PDF_TYPE)).toBe('t/1/2026/6E2-26T1/barem/barem-final.pdf');
    expect(testFileKey(1, 2026, '6E2-26T1', 'test', 'Test.docx', DOCX_TYPE)).toBe('t/1/2026/6E2-26T1/test/test.docx');
  });

  it('builds a student file key from the type, not from the original name', () => {
    expect(studentFileKey(1, 2026, '6E2-26T1', 14, 'Popescu Ana', 1, 'k3f9q2xa', 'image/jpeg')).toBe(
      't/1/2026/6E2-26T1/students/14-popescu-ana/01-k3f9q2xa.jpg',
    );
    expect(studentFileKey(1, 2026, '6E2-26T1', 14, 'Popescu Ana', 12, 'abcdefgh', PDF_TYPE)).toBe(
      't/1/2026/6E2-26T1/students/14-popescu-ana/12-abcdefgh.pdf',
    );
  });
});

describe('types', () => {
  it('knows the two kinds of test files', () => {
    expect(isTestFileKind('test')).toBe(true);
    expect(isTestFileKind('barem')).toBe(true);
    expect(isTestFileKind('other')).toBe(false);
  });

  it('maps types to extensions and extensions to types', () => {
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('text/html')).toBe('bin');
    expect(typeFromFileName('Lucrare.DOCX')).toBe(DOCX_TYPE);
    expect(typeFromFileName('poza.jpeg')).toBe('image/jpeg');
    expect(typeFromFileName('poza.heic')).toBeNull();
    expect(typeFromFileName('fara-extensie')).toBeNull();
  });
});

describe('fileProblem', () => {
  const pick = (name: string, type: string, size = 1000) => ({ name, type, size });

  it('accepts an allowed file and names the type from the extension when the browser gives none', () => {
    expect(fileProblem(pick('test.pdf', PDF_TYPE), TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE)).toBeNull();
    expect(fileProblem(pick('Barem.docx', ''), TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE)).toBeNull();
    expect(uploadTypeOf(pick('Barem.docx', ''))).toBe(DOCX_TYPE);
  });

  it('names the problem of a file that cannot be sent', () => {
    expect(fileProblem(pick('poza.heic', 'image/heic'), STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE)).toBe('Trimite poze JPG sau PDF.');
    expect(fileProblem(pick('notes.txt', ''), TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE)).toBe('Încarcă un fișier PDF sau Word (.docx).');
    expect(fileProblem(pick('gol.pdf', PDF_TYPE, 0), TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE)).toBe('Fișierul este gol.');
    expect(fileProblem(pick('mare.pdf', PDF_TYPE, MAX_FILE_BYTES + 1), TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE)).toBe(
      'Fișierul are peste 25 MB.',
    );
  });
});

describe('looksLike', () => {
  it('recognizes each accepted type by its first bytes', () => {
    expect(looksLike(PDF_TYPE, text('%PDF-1.7'))).toBe(true);
    expect(looksLike(DOCX_TYPE, bytes(0x50, 0x4b, 0x03, 0x04, 0x14))).toBe(true);
    expect(looksLike('image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(looksLike('image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(looksLike('image/webp', text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe(true);
  });

  it('refuses a file whose bytes belong to another type', () => {
    expect(looksLike('image/jpeg', text('%PDF-1.7'))).toBe(false);
    expect(looksLike(PDF_TYPE, bytes(0xff, 0xd8, 0xff))).toBe(false);
    expect(looksLike('image/webp', text('RIFF\u0000\u0000\u0000\u0000WAVE'))).toBe(false);
    expect(looksLike('text/html', text('<html>'))).toBe(false);
    expect(looksLike(PDF_TYPE, bytes())).toBe(false);
  });
});
```

- [ ] **Step 3: Create `server/secrets.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isUploadToken } from '../shared/tests.ts';
import { newDeviceSecret, newUploadToken, randomBase32, sha256Hex } from './secrets.ts';

describe('secrets', () => {
  it('makes upload tokens that the student routes accept, different every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newUploadToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(isUploadToken(token)).toBe(true);
  });

  it('makes base32 strings of the asked length', () => {
    expect(randomBase32(8)).toMatch(/^[a-z2-7]{8}$/);
  });

  it('makes 192-bit device secrets in base64url', () => {
    const secret = newDeviceSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newDeviceSecret()).not.toBe(secret);
  });

  it('hashes text with SHA-256 as lowercase hex', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
```

- [ ] **Step 4: Create `server/uploads.test.ts`**

```ts
import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { MAX_FILE_BYTES, PDF_TYPE, TEACHER_FILE_TYPES } from '../shared/files.ts';
import { ApiError } from './errors.ts';
import { deleteFiles, deleteFilesQuietly, fileNameHeader, fileResponse, readUpload } from './uploads.ts';

const WRONG_TYPE = 'Încarcă un fișier PDF sau Word (.docx).';
const pdfBytes = new TextEncoder().encode('%PDF-1.7 test');

function uploadApp() {
  const app = new Hono();
  app.onError((err, c) =>
    err instanceof ApiError ? c.json({ error: err.code, message: err.message }, err.status) : c.json({ error: 'internal' }, 500),
  );
  app.put('/file', async (c) => {
    const file = await readUpload(c, TEACHER_FILE_TYPES, WRONG_TYPE);
    return c.json({ name: file.name, type: file.contentType, size: file.bytes.byteLength });
  });
  return app;
}

const put = (body: BodyInit, headers: Record<string, string>) =>
  uploadApp().request('http://localhost/file', { method: 'PUT', body, headers });

describe('readUpload', () => {
  it('returns the bytes, the type, and the decoded original name', async () => {
    const res = await put(pdfBytes, { 'Content-Type': PDF_TYPE, 'X-File-Name': encodeURIComponent('Barem ședința 1.pdf') });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Barem ședința 1.pdf', type: PDF_TYPE, size: pdfBytes.length });
  });

  it('refuses a type that is not allowed', async () => {
    const res = await put(new TextEncoder().encode('<html>'), { 'Content-Type': 'text/html' });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'bad_file_type', message: WRONG_TYPE });
  });

  it('refuses a file whose bytes do not match its type', async () => {
    const res = await put(new TextEncoder().encode('not a pdf'), { 'Content-Type': PDF_TYPE });
    expect(res.status).toBe(415);
  });

  it('refuses an empty file', async () => {
    const res = await put(new Uint8Array(0), { 'Content-Type': PDF_TYPE });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Fișierul este gol.');
  });

  it('refuses a declared size over 25 MB before reading the body', async () => {
    const res = await put(pdfBytes, { 'Content-Type': PDF_TYPE, 'Content-Length': String(MAX_FILE_BYTES + 1) });
    expect(res.status).toBe(413);
    expect((await res.json()).message).toBe('Fișierul are peste 25 MB.');
  });

  it('refuses a body over 25 MB even without a declared size', async () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(pdfBytes);
    const res = await put(big, { 'Content-Type': PDF_TYPE });
    expect(res.status).toBe(413);
  });
});

describe('fileNameHeader', () => {
  it('decodes the name and drops folders, control characters, and extra spaces', () => {
    expect(fileNameHeader(encodeURIComponent('C:\\fakepath\\Poză  1.jpg'))).toBe('Poză 1.jpg');
    expect(fileNameHeader(encodeURIComponent('a\u0007b.pdf'))).toBe('ab.pdf');
  });

  it('falls back to "fisier" for a missing or broken name', () => {
    expect(fileNameHeader(undefined)).toBe('fisier');
    expect(fileNameHeader('%E0%A4%A')).toBe('fisier');
    expect(fileNameHeader(encodeURIComponent('   '))).toBe('fisier');
  });

  it('keeps at most 200 characters', () => {
    expect(fileNameHeader('a'.repeat(300))).toHaveLength(200);
  });
});

describe('fileResponse', () => {
  it('streams the file inline under its original name, never cached, framed only by our pages', async () => {
    const object = { body: new Blob(['%PDF-1.7']).stream(), size: 8 } as unknown as R2ObjectBody;
    const res = fileResponse(object, "Lucrare (finală)'s.pdf", PDF_TYPE);
    expect(res.headers.get('Content-Type')).toBe(PDF_TYPE);
    expect(res.headers.get('Content-Length')).toBe('8');
    expect(res.headers.get('Content-Disposition')).toBe("inline; filename*=UTF-8''Lucrare%20%28final%C4%83%29%27s.pdf");
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(await res.text()).toBe('%PDF-1.7');
  });
});

describe('deleteFilesQuietly', () => {
  it('logs a failed delete instead of throwing', async () => {
    const bucket = {
      delete: async () => {
        throw new Error('R2 down');
      },
    } as unknown as R2Bucket;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(deleteFilesQuietly(bucket, ['a'])).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledWith('File delete failed:', 'R2 down');
    errors.mockRestore();
  });
});

describe('deleteFiles', () => {
  it('deletes in groups of at most 1000 keys and skips an empty list', async () => {
    const calls: string[][] = [];
    const bucket = { delete: async (keys: string[]) => void calls.push(keys) } as unknown as R2Bucket;
    await deleteFiles(bucket, Array.from({ length: 2500 }, (_, i) => `k${i}`));
    expect(calls.map((keys) => keys.length)).toEqual([1000, 1000, 500]);
    calls.length = 0;
    await deleteFiles(bucket, []);
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 5: Replace `server/app.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { splitSql, startTestApi, type TestApi } from './test/testApi.ts';

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api.dispose();
});

describe('API app', () => {
  it('answers unknown paths with a JSON 404', async () => {
    const res = await api.request('GET', '/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found', message: 'Nu am găsit ce cauți.' });
  });

  it('marks every answer as not cacheable and not to be sniffed', async () => {
    for (const path of ['/api/admin/me', '/api/nothing-here']) {
      const res = await api.request('GET', path);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('answers an unexpected error with a Romanian 500, with the same headers', async () => {
    const app = createApp();
    // createApp() sets the base path /api, so this route answers /api/boom.
    app.get('/boom', () => {
      throw new Error('database exploded');
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('http://localhost/api/boom', {}, api.env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal', message: 'A apărut o eroare. Încearcă din nou.' });
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(errors).toHaveBeenCalledWith('API error:', 'database exploded');
    errors.mockRestore();
  });

  it('keeps a Cache-Control header that a route sets itself', async () => {
    const app = createApp();
    app.get('/cached', (c) => c.json({ ok: true }, 200, { 'Cache-Control': 'private, max-age=60' }));
    const res = await app.request('http://localhost/api/cached', {}, api.env);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=60');
  });
});

describe('test helper', () => {
  it('lets a lowercase content-type header replace the JSON default', async () => {
    const res = await api.request('POST', '/api/admin/classes', { name: '6E2', schoolYear: 2026 }, { 'content-type': 'text/plain' });
    expect(res.status).toBe(415);
  });
});

describe('test database', () => {
  it('has the migrations applied and one teacher', async () => {
    const teacher = await api.db
      .prepare('SELECT email FROM teachers WHERE id = ?')
      .bind(api.teacherId)
      .first<{ email: string }>();
    expect(teacher?.email).toBe('profesor@example.com');
    const tables = await api.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all<{ name: string }>();
    expect(tables.results.map((table) => table.name)).toEqual(
      expect.arrayContaining(['teachers', 'classes', 'students', 'enrollments', 'tests', 'submissions', 'submission_files']),
    );
  });

  it('deletes the uploads and their file rows together with a test', async () => {
    const db = api.db;
    const cls = await db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, 'C1', 2026, 't') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const student = await db
      .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Pop Ion', 't') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const test = await db
      .prepare(
        "INSERT INTO tests (teacher_id, class_id, number, code, title, created_at, updated_at) VALUES (?, ?, 1, 'C1-26T1', 'T', 't', 't') RETURNING id",
      )
      .bind(api.teacherId, cls!.id)
      .first<{ id: number }>();
    const submission = await db
      .prepare("INSERT INTO submissions (test_id, student_id, status, started_at) VALUES (?, ?, 'uploading', 't') RETURNING id")
      .bind(test!.id, student!.id)
      .first<{ id: number }>();
    await db
      .prepare(
        "INSERT INTO submission_files (submission_id, r2_key, original_name, content_type, size, position, created_at) VALUES (?, 'k', 'a.jpg', 'image/jpeg', 1, 1, 't')",
      )
      .bind(submission!.id)
      .run();

    await db.prepare('DELETE FROM tests WHERE id = ?').bind(test!.id).run();
    const left = await db
      .prepare('SELECT (SELECT COUNT(*) FROM submissions) AS submissions, (SELECT COUNT(*) FROM submission_files) AS files')
      .first<{ submissions: number; files: number }>();
    expect(left).toEqual({ submissions: 0, files: 0 });
  });

  it('refuses a test status outside the known ones', async () => {
    const cls = await api.db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, 'C2', 2026, 't') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const insert = api.db
      .prepare(
        "INSERT INTO tests (teacher_id, class_id, number, code, title, status, created_at, updated_at) VALUES (?, ?, 1, 'C2-26T1', 'T', 'lost', 't', 't')",
      )
      .bind(api.teacherId, cls!.id);
    await expect(insert.run()).rejects.toThrow(/CHECK constraint failed/);
  });

  it('has a file bucket', async () => {
    await api.env.FILES.put('probe.txt', 'ok');
    expect(await (await api.env.FILES.get('probe.txt'))?.text()).toBe('ok');
  });
});

describe('teachers table', () => {
  it('refuses an email with capital letters and accepts a lowercase one', async () => {
    await expect(api.addTeacher('Mixed@Example.com', 'X')).rejects.toThrow(/CHECK constraint failed/);
    await expect(api.addTeacher('second@example.com', 'Y')).resolves.toEqual(expect.any(Number));
  });
});

describe('splitSql', () => {
  it('splits on semicolons at line ends and drops comment lines', () => {
    expect(splitSql('-- note\nCREATE TABLE a (x INTEGER);\n\nCREATE INDEX a_x ON a (x);\n')).toEqual([
      'CREATE TABLE a (x INTEGER)',
      'CREATE INDEX a_x ON a (x)',
    ]);
  });
});
```

- [ ] **Step 6: Replace `server/test/testApi.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { D1Database } from '@cloudflare/workers-types';
import { getPlatformProxy } from 'wrangler';
import { createApp } from '../app.ts';
import type { Env } from '../env.ts';

// API tests run the real Hono app in Node against the local D1 and R2 engines
// that `wrangler pages dev` also uses. getPlatformProxy reads the bindings from
// wrangler.toml. With persist: false, every startTestApi() call gets a new,
// empty, in-memory database and file bucket; the migrations are applied here.

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);
const WRANGLER_CONFIG = fileURLToPath(new URL('../../wrangler.toml', import.meta.url));

export const TEACHER_EMAIL = 'profesor@example.com';

export interface TestResponse {
  status: number;
  headers: Headers;
  // The parsed JSON body, or null for an empty body. Tests read fields from it directly.
  body: any;
}

export interface TestApi {
  env: Env;
  db: D1Database;
  teacherId: number;
  // A JSON request to the API. A body is sent as JSON unless the headers name another type.
  request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<TestResponse>;
  // The raw response, for requests whose body or answer is not JSON.
  fetch(path: string, init?: RequestInit): Promise<Response>;
  addTeacher(email: string, name: string): Promise<number>;
  dispose(): Promise<void>;
}

// Migration files hold one statement per ";" at a line end (see migrations/).
export function splitSql(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .split(/;\s*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function applyMigrations(db: D1Database): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8');
    await db.batch(splitSql(sql).map((statement) => db.prepare(statement)));
  }
}

export async function startTestApi(options: { env?: Partial<Env> } = {}): Promise<TestApi> {
  const platform = await getPlatformProxy<Pick<Env, 'DB' | 'FILES'>>({
    configPath: WRANGLER_CONFIG,
    persist: false,
    remoteBindings: false,
  });
  const db = platform.env.DB;

  const addTeacher = async (email: string, name: string) => {
    const row = await db
      .prepare('INSERT INTO teachers (email, name, created_at) VALUES (?, ?, ?) RETURNING id')
      .bind(email, name, '2026-10-06T08:00:00.000Z')
      .first<{ id: number }>();
    return row!.id;
  };

  let teacherId: number;
  try {
    await applyMigrations(db);
    teacherId = await addTeacher(TEACHER_EMAIL, 'Laura Miron');
  } catch (err) {
    // A failed setup must not leave the local engine running.
    await platform.dispose();
    throw err;
  }

  const env: Env = { DB: db, FILES: platform.env.FILES, DEV_TEACHER_EMAIL: TEACHER_EMAIL, ...options.env };
  const app = createApp();
  const send = (path: string, init: RequestInit = {}) => Promise.resolve(app.request(`http://localhost${path}`, init, env));

  return {
    env,
    db,
    teacherId,
    addTeacher,
    async request(method, path, body, headers = {}) {
      const merged = new Headers(headers);
      const init: RequestInit = { method, headers: merged };
      if (body !== undefined) {
        if (!merged.has('Content-Type')) merged.set('Content-Type', 'application/json');
        init.body = JSON.stringify(body);
      }
      const res = await send(path, init);
      const text = await res.text();
      return { status: res.status, headers: res.headers, body: text === '' ? null : JSON.parse(text) };
    },
    fetch: send,
    dispose: () => platform.dispose(),
  };
}
```

- [ ] **Step 7: Run the tests to see them fail**

Run: `npx vitest run server/app.test.ts server/secrets.test.ts server/uploads.test.ts shared/files.test.ts shared/tests.test.ts`
Expected: FAIL. `Test Files  5 failed (5)`, `Tests  4 failed | 7 passed (11)`. Four files fail with `Cannot find module` (`./tests.ts`, `./files.ts`, `../shared/tests.ts`, `../shared/files.ts`). In `server/app.test.ts` the four "test database" checks fail: the new tables are missing (`no such table: tests`) and there is no bucket (`Cannot read properties of undefined (reading 'put')`).

- [ ] **Step 8: Replace `wrangler.toml`**

The bucket does not exist in Cloudflare yet; Task 14 creates it before this code reaches `main`. Locally, wrangler simulates it.

```toml
name = "quickeval"
pages_build_output_dir = "dist"
compatibility_date = "2026-10-01"

[[d1_databases]]
binding = "DB"
database_name = "quickeval"
database_id = "ef431f1d-ad8f-4e4c-9667-9cd17f0f168e"
migrations_dir = "migrations"

[[r2_buckets]]
binding = "FILES"
bucket_name = "quickeval-files"
```

- [ ] **Step 9: Create `migrations/0002_tests.sql`**

```sql
-- Tests, the students' uploads, and the uploaded files (spec §7.1). The
-- exercise-list and analysis columns of tests are used from Plan 3 on. Times
-- are ISO 8601 UTC strings. One statement per ";" line end (the test helper
-- splits on that), and no ";" inside strings.

CREATE TABLE tests (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  number INTEGER NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'evaluating', 'done')),
  upload_token TEXT UNIQUE,
  started_at TEXT,
  evaluation_at TEXT,
  evaluation_started_at TEXT,
  test_file_key TEXT,
  test_file_name TEXT,
  test_file_type TEXT,
  barem_file_key TEXT,
  barem_file_name TEXT,
  barem_file_type TEXT,
  exercise_list_json TEXT,
  exercise_list_status TEXT NOT NULL DEFAULT 'none' CHECK (exercise_list_status IN ('none', 'ready', 'problem', 'accepted', 'failed')),
  exercise_list_message TEXT,
  exercise_list_attempts INTEGER NOT NULL DEFAULT 0,
  analysis_json TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'none' CHECK (analysis_status IN ('none', 'requested', 'ready', 'failed')),
  analysis_stale INTEGER NOT NULL DEFAULT 0,
  analysis_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (teacher_id, code),
  UNIQUE (class_id, number)
);

CREATE TABLE submissions (
  id INTEGER PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  status TEXT NOT NULL CHECK (status IN ('uploading', 'submitted', 'grading', 'graded', 'failed')),
  session_hash TEXT UNIQUE,
  auto_submitted INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  run_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  graded_at TEXT,
  UNIQUE (test_id, student_id)
);

CREATE INDEX submissions_by_student ON submissions (student_id);

CREATE TABLE submission_files (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX submission_files_by_submission ON submission_files (submission_id, position);
```

- [ ] **Step 10: Replace `server/env.ts`**

```ts
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { Teacher } from '../shared/api.ts';

// Bindings and settings of the Pages project (wrangler.toml, Pages settings, .dev.vars).
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  // Local development only: honoured only for requests to localhost or 127.0.0.1.
  DEV_TEACHER_EMAIL?: string;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { teacher: Teacher };
}
```

- [ ] **Step 11: Create `shared/tests.ts`**

```ts
export type TestStatus = 'draft' | 'open' | 'evaluating' | 'done';

export const MAX_TITLE_LENGTH = 120;

const TEST_CODE = /^[A-Z0-9]{1,8}-\d{2}T\d{1,3}$/;
const UPLOAD_TOKEN = /^[a-z2-7]{16}$/;

// Class "6E2" in school year 2026, test number 1: "6E2-26T1".
export function buildTestCode(className: string, schoolYear: number, number: number): string {
  return `${className}-${String(schoolYear % 100).padStart(2, '0')}T${number}`;
}

// Codes come from URLs, so "6e2-26t1" is read as "6E2-26T1". Returns null for
// anything that is not a test code.
export function normalizeTestCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return TEST_CODE.test(code) ? code : null;
}

// The secret part of a student upload link: 16 characters from a-z and 2-7.
export function isUploadToken(raw: string): boolean {
  return UPLOAD_TOKEN.test(raw);
}

// Joins inner whitespace into single spaces and trims.
export function cleanTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 12: Create `shared/files.ts`**

```ts
// File rules shared by the API, the teacher app, and the student app: types,
// limits, and the R2 keys of a test's "cloud folder" (spec §7.2).

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_STUDENT_FILES = 20;

export const PDF_TYPE = 'application/pdf';
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const JPEG_TYPE = 'image/jpeg';

// The test and the barem: PDF or Word.
export const TEACHER_FILE_TYPES: readonly string[] = [PDF_TYPE, DOCX_TYPE];
// A student's pages: photos or PDF scans.
export const STUDENT_FILE_TYPES: readonly string[] = [JPEG_TYPE, 'image/png', 'image/webp', PDF_TYPE];

// The same Romanian messages in the API and in the apps, which check a file
// before they send it.
export const TEACHER_WRONG_TYPE = 'Încarcă un fișier PDF sau Word (.docx).';
export const STUDENT_WRONG_TYPE = 'Trimite poze JPG sau PDF.';
export const EMPTY_FILE = 'Fișierul este gol.';
export const FILE_TOO_BIG = 'Fișierul are peste 25 MB.';

export type TestFileKind = 'test' | 'barem';

export function isTestFileKind(raw: string): raw is TestFileKind {
  return raw === 'test' || raw === 'barem';
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  [PDF_TYPE]: 'pdf',
  [DOCX_TYPE]: 'docx',
  [JPEG_TYPE]: 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: PDF_TYPE,
  docx: DOCX_TYPE,
  jpg: JPEG_TYPE,
  jpeg: JPEG_TYPE,
  png: 'image/png',
  webp: 'image/webp',
};

export function extensionFor(contentType: string): string {
  return EXTENSION_BY_TYPE[contentType] ?? 'bin';
}

// Browsers sometimes give a file an empty type (for example a .docx on a PC
// without Word). The extension then tells the type. Null for unknown ones.
export function typeFromFileName(name: string): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  return TYPE_BY_EXTENSION[extension] ?? null;
}

// The type a picked file is sent with: its own type, or the one its extension names.
export function uploadTypeOf(file: { name: string; type: string }): string {
  return file.type || typeFromFileName(file.name) || '';
}

// Why a picked file cannot be sent, as a Romanian message; null when it can.
export function fileProblem(
  file: { name: string; type: string; size: number },
  allowedTypes: readonly string[],
  wrongTypeMessage: string,
): string | null {
  if (!allowedTypes.includes(uploadTypeOf(file))) return wrongTypeMessage;
  if (file.size === 0) return EMPTY_FILE;
  if (file.size > MAX_FILE_BYTES) return FILE_TOO_BIG;
  return null;
}

// The first bytes of each accepted type, so a renamed file of another kind
// (a HEIC photo called .jpg, a .doc called .docx) is refused.
export function looksLike(contentType: string, head: Uint8Array): boolean {
  const starts = (...bytes: number[]) => bytes.every((byte, index) => head[index] === byte);
  const ascii = (text: string, offset = 0) => [...text].every((char, index) => head[offset + index] === char.charCodeAt(0));
  switch (contentType) {
    case PDF_TYPE:
      return ascii('%PDF-');
    case DOCX_TYPE:
      return starts(0x50, 0x4b, 0x03, 0x04);
    case JPEG_TYPE:
      return starts(0xff, 0xd8, 0xff);
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/webp':
      return ascii('RIFF') && ascii('WEBP', 8);
    default:
      return false;
  }
}

// Lowercase ASCII for keys: diacritics removed (ș→s, ț→t, ă→a, â→a, î→i),
// every other character a dash, no dashes at the ends. "fisier" when nothing is left.
export function slugify(text: string, maxLength = 60): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, '');
  return slug || 'fisier';
}

function withoutExtension(name: string): string {
  return name.replace(/\.[^.]*$/, '');
}

// Every file of a test lives under this prefix.
export function testFolder(teacherId: number, schoolYear: number, code: string): string {
  return `t/${teacherId}/${schoolYear}/${code}/`;
}

// t/1/2026/6E2-26T1/barem/barem-final.pdf
export function testFileKey(
  teacherId: number,
  schoolYear: number,
  code: string,
  kind: TestFileKind,
  originalName: string,
  contentType: string,
): string {
  return `${testFolder(teacherId, schoolYear, code)}${kind}/${slugify(withoutExtension(originalName))}.${extensionFor(contentType)}`;
}

// t/1/2026/6E2-26T1/students/14-popescu-ana/01-k3f9q2xa.jpg. The random part
// keeps keys unique when a student deletes a page and uploads another one.
export function studentFileKey(
  teacherId: number,
  schoolYear: number,
  code: string,
  studentId: number,
  studentName: string,
  position: number,
  random: string,
  contentType: string,
): string {
  const folder = `${studentId}-${slugify(studentName, 40)}`;
  return `${testFolder(teacherId, schoolYear, code)}students/${folder}/${String(position).padStart(2, '0')}-${random}.${extensionFor(contentType)}`;
}
```

- [ ] **Step 13: Create `server/secrets.ts`**

```ts
// Random secrets and their hashes (spec §15). Only hashes of device secrets
// are stored; the secrets themselves stay in the students' browsers.

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

// Each character carries 5 random bits (a byte's low 5 bits: no bias).
export function randomBase32(length: number): string {
  let out = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(length))) out += BASE32.charAt(byte & 31);
  return out;
}

// The secret part of a student upload link: 16 characters, 80 bits.
export function newUploadToken(): string {
  return randomBase32(16);
}

// The secret that ties an upload to one phone: 24 bytes (192 bits), base64url.
export function newDeviceSecret(): string {
  let binary = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(24))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 14: Create `server/uploads.ts`**

```ts
import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types';
import type { Context } from 'hono';
import { EMPTY_FILE, FILE_TOO_BIG, looksLike, MAX_FILE_BYTES } from '../shared/files.ts';
import { ApiError } from './errors.ts';

export interface UploadedFile {
  bytes: ArrayBuffer;
  contentType: string;
  name: string;
}

function tooBig(): ApiError {
  return new ApiError(413, 'file_too_big', FILE_TOO_BIG);
}

// The original file name from the X-File-Name header, which the apps send
// URI-encoded (names have diacritics). Without folders, control characters,
// or extra spaces; at most 200 characters; "fisier" when nothing is left.
export function fileNameHeader(raw: string | undefined): string {
  let name: string;
  try {
    name = decodeURIComponent(raw ?? '');
  } catch {
    name = '';
  }
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return clean || 'fisier';
}

// Reads a raw file upload. The Content-Type must be one of `allowedTypes` and
// match the file's first bytes; the size must be 1 byte to 25 MB. The body is
// read whole: wrangler's local engine (used by the tests) refuses to store a
// stream of unknown length, and buffering 25 MB is still light work.
export async function readUpload(c: Context, allowedTypes: readonly string[], wrongTypeMessage: string): Promise<UploadedFile> {
  const contentType = (c.req.header('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!allowedTypes.includes(contentType)) throw new ApiError(415, 'bad_file_type', wrongTypeMessage);
  const declared = Number(c.req.header('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) throw tooBig();

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) throw new ApiError(400, 'empty_file', EMPTY_FILE);
  if (bytes.byteLength > MAX_FILE_BYTES) throw tooBig();
  if (!looksLike(contentType, new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)))) {
    throw new ApiError(415, 'bad_file_type', wrongTypeMessage);
  }
  return { bytes, contentType, name: fileNameHeader(c.req.header('X-File-Name')) };
}

// RFC 5987 encoding for filename*: encodeURIComponent leaves ' ( ) * as they are.
function encodeHeaderValue(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

// Streams a stored file to the browser under its original name. Only our own
// pages may show it in a frame, and it is never cached.
export function fileResponse(object: R2ObjectBody, name: string, contentType: string): Response {
  return new Response(object.body as unknown as ReadableStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(object.size),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeHeaderValue(name)}`,
      'Cache-Control': 'private, no-store',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
}

// Deletes stored files; R2 takes at most 1000 keys per call.
export async function deleteFiles(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let start = 0; start < keys.length; start += 1000) {
    await bucket.delete(keys.slice(start, start + 1000));
  }
}

// Deletes files whose rows are already gone. A failure only leaves orphan
// files in R2, so it is logged and the request still succeeds.
export async function deleteFilesQuietly(bucket: R2Bucket, keys: string[]): Promise<void> {
  try {
    await deleteFiles(bucket, keys);
  } catch (err) {
    console.error('File delete failed:', err instanceof Error ? err.message : String(err));
  }
}
```

- [ ] **Step 15: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  23 passed (23)`, `Tests  191 passed (191)`.

- [ ] **Step 16: Run the typecheck and the local migration**

Run: `npm run typecheck`, then `npm run db:local`
Expected: the typecheck prints nothing (exit code 0). The migration run lists `0002_tests.sql` with ✅ (and `0001_people.sql` as already applied, or ✅ on a fresh local database).

- [ ] **Step 17: Commit**

```bash
git add wrangler.toml migrations shared server
git commit -m "Add the tests schema, the R2 binding, and the shared rules for test codes and files"
```

---

### Task 4: Teacher API for tests

The teacher creates, lists, opens, renames, and deletes tests. The test detail carries the uploads table; the class detail lists its tests.

**Files:**
- Create: `server/db/tests.ts`, `server/routes/tests.ts`, `server/test/fixtures.ts`
- Modify: `shared/api.ts`, `server/http.ts`, `server/routes/admin.ts`, `server/routes/classes.ts`, `src/test/fakeApi.ts`
- Test: `server/routes/tests.test.ts`

**Interfaces:**
- Consumes: `shared/tests.ts`, `deleteFilesQuietly` (Task 3).
- Produces:
  - `shared/api.ts`: `testTitleSchema`, `createTestBody` (`{ classId, title }`), `renameTestBody` (`{ title }`), `CreateTestInput`, and the types `TestSummary`, `TestFileInfo`, `TestInfo`, `UploadStatus`, `UploadRow`, `TestDetail`. `ClassDetail` gains `tests: TestSummary[]`.
  - `server/http.ts`: `parseTestCode(raw): string` (404 when not a code), `parseSchoolYear(raw): number` (the current year when missing, 400 when invalid).
  - `server/db/tests.ts`: `StoredFile`, `TestRecord`, `toTestInfo`, `listTests`, `listClassTests`, `findTest`, `requireTest`, `listUploads`, `createTest(db, teacherId, classId, title, now): Promise<string>`, `renameTest`, `listTestKeys`, `deleteTestRow`.
  - Routes: `GET /api/admin/tests?year=`, `POST /api/admin/tests` → 201 `{ code }`, `GET /api/admin/tests/:code` → `TestDetail`, `PATCH /api/admin/tests/:code` → `{ code, title }`, `DELETE /api/admin/tests/:code` → `{ deleted: true }`. `GET /api/admin/classes/:id` adds `tests`.
  - `server/test/fixtures.ts`: `makeClass(api, name, students?, schoolYear?)`, `makeTest(api, classId, title?)`, `testIdOf(api, code)`, `addSubmission(api, code, studentId, options?)`, `otherTeacherTest(api, email?)`.

- [ ] **Step 1: Create `server/test/fixtures.ts`**

```ts
import type { UploadStatus } from '../../shared/api.ts';
import type { TestApi } from './testApi.ts';

// Shortcuts for API tests: classes, students, and tests through the teacher
// API; uploads straight in the database.

export async function makeClass(
  api: TestApi,
  name: string,
  students: string[] = [],
  schoolYear = 2026,
): Promise<{ id: number; studentIds: number[] }> {
  const created = await api.request('POST', '/api/admin/classes', { name, schoolYear });
  if (created.status !== 201) throw new Error(`makeClass ${name}: ${JSON.stringify(created.body)}`);
  const id = created.body.class.id as number;
  if (students.length === 0) return { id, studentIds: [] };
  const added = await api.request('POST', `/api/admin/classes/${id}/students`, { names: students });
  return { id, studentIds: added.body.students.map((s: { id: number }) => s.id) };
}

export async function makeTest(api: TestApi, classId: number, title = 'Test de evaluare'): Promise<string> {
  const res = await api.request('POST', '/api/admin/tests', { classId, title });
  if (res.status !== 201) throw new Error(`makeTest: ${JSON.stringify(res.body)}`);
  return res.body.code as string;
}

export async function testIdOf(api: TestApi, code: string): Promise<number> {
  const row = await api.db.prepare('SELECT id FROM tests WHERE code = ?').bind(code).first<{ id: number }>();
  return row!.id;
}

// An upload row with `files` file rows (keys only; nothing is stored in R2).
export async function addSubmission(
  api: TestApi,
  code: string,
  studentId: number,
  options: { status?: Exclude<UploadStatus, 'none'>; files?: number; startedAt?: string } = {},
): Promise<number> {
  const testId = await testIdOf(api, code);
  const status = options.status ?? 'uploading';
  const row = await api.db
    .prepare('INSERT INTO submissions (test_id, student_id, status, started_at, submitted_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(testId, studentId, status, options.startedAt ?? '2026-10-06T08:00:00.000Z', status === 'uploading' ? null : '2026-10-06T08:30:00.000Z')
    .first<{ id: number }>();
  const submissionId = row!.id;
  for (let position = 1; position <= (options.files ?? 0); position++) {
    await api.db
      .prepare(
        `INSERT INTO submission_files (submission_id, r2_key, original_name, content_type, size, position, created_at)
         VALUES (?, ?, ?, 'image/jpeg', 100, ?, '2026-10-06T08:10:00.000Z')`,
      )
      .bind(submissionId, `fixture/${submissionId}/${position}.jpg`, `poza${position}.jpg`, position)
      .run();
  }
  return submissionId;
}

// A test, class, and student that belong to another teacher.
export async function otherTeacherTest(api: TestApi, email = 'alt.profesor@example.com'): Promise<{ code: string; studentId: number }> {
  const teacherId = await api.addTeacher(email, 'Alt Profesor');
  const cls = await api.db
    .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '9Z', 2026, '2026-10-06') RETURNING id")
    .bind(teacherId)
    .first<{ id: number }>();
  const student = await api.db
    .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Elev Străin', '2026-10-06') RETURNING id")
    .bind(teacherId)
    .first<{ id: number }>();
  await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(cls!.id, student!.id).run();
  await api.db
    .prepare(
      `INSERT INTO tests (teacher_id, class_id, number, code, title, status, upload_token, created_at, updated_at)
       VALUES (?, ?, 1, '9Z-26T1', 'Test străin', 'open', 'zzzzzzzzzzzzzzzz', '2026-10-06', '2026-10-06')`,
    )
    .bind(teacherId, cls!.id)
    .run();
  return { code: '9Z-26T1', studentId: student!.id };
}
```

- [ ] **Step 2: Create `server/routes/tests.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSubmission, makeClass, makeTest, otherTeacherTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

// A fresh database for every test: the counters and lists start empty.
beforeEach(async () => {
  api = await startTestApi();
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/tests', () => {
  it('makes draft tests numbered per class and school year', async () => {
    const cls = await makeClass(api, '6E2');
    const first = await api.request('POST', '/api/admin/tests', { classId: cls.id, title: '  Test   inițial ' });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ code: '6E2-26T1' });
    expect(await makeTest(api, cls.id)).toBe('6E2-26T2');

    const detail = await api.request('GET', '/api/admin/tests/6E2-26T1');
    expect(detail.body.test).toMatchObject({ code: '6E2-26T1', title: 'Test inițial', status: 'draft', className: '6E2', schoolYear: 2026 });
  });

  it('uses the school year of the class in the code', async () => {
    const cls = await makeClass(api, '6E2', [], 2027);
    expect(await makeTest(api, cls.id)).toBe('6E2-27T1');
  });

  it('skips a code that a renamed class already used', async () => {
    const old = await makeClass(api, '6E2');
    await makeTest(api, old.id);
    await api.request('PATCH', `/api/admin/classes/${old.id}`, { name: '6E3' });
    const reborn = await makeClass(api, '6E2');
    expect(await makeTest(api, reborn.id)).toBe('6E2-26T2');
  });

  it('refuses an empty or too long title', async () => {
    const cls = await makeClass(api, '6E2');
    const empty = await api.request('POST', '/api/admin/tests', { classId: cls.id, title: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body.message).toBe('Scrie titlul testului.');
    const long = await api.request('POST', '/api/admin/tests', { classId: cls.id, title: 'x'.repeat(121) });
    expect(long.body.message).toBe('Titlul are cel mult 120 de caractere.');
  });

  it('asks for a class when the class id is missing or wrong', async () => {
    const res = await api.request('POST', '/api/admin/tests', { title: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Alege clasa.');
    expect((await api.request('POST', '/api/admin/tests', { classId: 1.5, title: 'Test' })).body.message).toBe('Alege clasa.');
  });

  it('refuses an archived class, a missing class, and a class of another teacher', async () => {
    const cls = await makeClass(api, '6E2');
    await api.request('PATCH', `/api/admin/classes/${cls.id}`, { archived: true });
    const archived = await api.request('POST', '/api/admin/tests', { classId: cls.id, title: 'Test' });
    expect(archived.status).toBe(409);
    expect(archived.body.message).toBe('Clasa este arhivată. Scoate-o din arhivă ca să faci un test nou.');

    expect((await api.request('POST', '/api/admin/tests', { classId: 99999, title: 'Test' })).status).toBe(404);

    await otherTeacherTest(api);
    const foreignClass = await api.db.prepare("SELECT id FROM classes WHERE name = '9Z'").first<{ id: number }>();
    expect((await api.request('POST', '/api/admin/tests', { classId: foreignClass!.id, title: 'Test' })).status).toBe(404);
  });
});

describe('GET /api/admin/tests', () => {
  it('lists the tests of a school year, newest first, with counts', async () => {
    const a = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
    const b = await makeClass(api, '7E2');
    const later = await makeClass(api, '6E2', [], 2027);
    const first = await makeTest(api, a.id, 'Primul');
    await makeTest(api, b.id, 'Al doilea');
    await makeTest(api, later.id, 'Anul viitor');
    await addSubmission(api, first, a.studentIds[0]!, { status: 'submitted', files: 2 });
    await addSubmission(api, first, a.studentIds[1]!, { status: 'uploading', files: 1 });
    await api.db.prepare("UPDATE tests SET created_at = '2026-10-01T00:00:00.000Z' WHERE code = ?").bind(first).run();

    const res = await api.request('GET', '/api/admin/tests?year=2026');
    expect(res.status).toBe(200);
    expect(res.body.tests.map((t: { title: string }) => t.title)).toEqual(['Al doilea', 'Primul']);
    expect(res.body.tests[1]).toMatchObject({ code: '6E2-26T1', studentCount: 3, submittedCount: 1, startedAt: null });
  });

  it('refuses a bad year and hides tests of other teachers', async () => {
    expect((await api.request('GET', '/api/admin/tests?year=1990')).status).toBe(400);
    await otherTeacherTest(api);
    expect((await api.request('GET', '/api/admin/tests?year=2026')).body.tests).toEqual([]);
  });
});

describe('GET /api/admin/tests/:code', () => {
  it('returns the test and one upload row per active student, by name', async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva', 'Marin Dan']);
    const [pop, ionescu, stan, marin] = cls.studentIds as [number, number, number, number];
    const code = await makeTest(api, cls.id);
    const submissionId = await addSubmission(api, code, pop, { status: 'submitted', files: 3 });
    await api.db.prepare('UPDATE submissions SET auto_submitted = 1 WHERE id = ?').bind(submissionId).run();
    await addSubmission(api, code, stan, { files: 1 });
    await api.request('PATCH', `/api/admin/classes/${cls.id}/students/${stan}`, { active: false });
    await api.request('PATCH', `/api/admin/classes/${cls.id}/students/${marin}`, { active: false });

    const res = await api.request('GET', `/api/admin/tests/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.test).toMatchObject({ code, uploadToken: null, files: { test: null, barem: null }, studentCount: 2, submittedCount: 1 });
    expect(res.body.uploads).toEqual([
      {
        studentId: ionescu,
        studentName: 'Ionescu Ana',
        active: true,
        submissionId: null,
        status: 'none',
        fileCount: 0,
        startedAt: null,
        submittedAt: null,
        autoSubmitted: false,
      },
      {
        studentId: pop,
        studentName: 'Pop Ion',
        active: true,
        submissionId,
        status: 'submitted',
        fileCount: 3,
        startedAt: '2026-10-06T08:00:00.000Z',
        submittedAt: '2026-10-06T08:30:00.000Z',
        autoSubmitted: true,
      },
      expect.objectContaining({ studentName: 'Stan Eva', active: false, status: 'uploading', fileCount: 1 }),
    ]);
  });

  it('reads the code in any letter case and answers 404 for unknown or foreign codes', async () => {
    const cls = await makeClass(api, '6E2');
    await makeTest(api, cls.id);
    expect((await api.request('GET', '/api/admin/tests/6e2-26t1')).status).toBe(200);
    expect((await api.request('GET', '/api/admin/tests/6E2-26T9')).status).toBe(404);
    expect((await api.request('GET', '/api/admin/tests/not-a-code')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    expect((await api.request('GET', `/api/admin/tests/${foreign.code}`)).status).toBe(404);
  });
});

describe('PATCH /api/admin/tests/:code', () => {
  it('renames a test with a cleaned title', async () => {
    const cls = await makeClass(api, '6E2');
    const code = await makeTest(api, cls.id);
    const res = await api.request('PATCH', `/api/admin/tests/${code}`, { title: ' Teză   semestrială ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ code, title: 'Teză semestrială' });
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await api.request('PATCH', `/api/admin/tests/${foreign.code}`, { title: 'Nou' })).status).toBe(404);
    const title = await api.db.prepare('SELECT title FROM tests WHERE code = ?').bind(foreign.code).first<{ title: string }>();
    expect(title?.title).toBe('Test străin');
  });
});

describe('DELETE /api/admin/tests/:code', () => {
  it('deletes the test, its uploads, and every stored file, and nothing else', async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion']);
    const code = await makeTest(api, cls.id);
    const kept = await makeTest(api, cls.id);
    const testId = await testIdOf(api, code);
    const submissionId = await addSubmission(api, code, cls.studentIds[0]!, { files: 2 });
    await api.db
      .prepare("UPDATE tests SET barem_file_key = 'fixture/barem.pdf', barem_file_name = 'barem.pdf', barem_file_type = 'application/pdf' WHERE id = ?")
      .bind(testId)
      .run();
    for (const key of ['fixture/barem.pdf', `fixture/${submissionId}/1.jpg`, `fixture/${submissionId}/2.jpg`, 'fixture/other.jpg']) {
      await api.env.FILES.put(key, 'x');
    }

    const res = await api.request('DELETE', `/api/admin/tests/${code}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect((await api.request('GET', `/api/admin/tests/${code}`)).status).toBe(404);
    expect((await api.request('GET', `/api/admin/tests/${kept}`)).status).toBe(200);
    const rows = await api.db
      .prepare('SELECT (SELECT COUNT(*) FROM submissions) AS submissions, (SELECT COUNT(*) FROM submission_files) AS files')
      .first<{ submissions: number; files: number }>();
    expect(rows).toEqual({ submissions: 0, files: 0 });
    const left = await api.env.FILES.list({ prefix: 'fixture/' });
    expect(left.objects.map((o) => o.key)).toEqual(['fixture/other.jpg']);
  });

  it('answers 404 for a test of another teacher and keeps it', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await api.request('DELETE', `/api/admin/tests/${foreign.code}`)).status).toBe(404);
    expect(await api.db.prepare('SELECT COUNT(*) AS n FROM tests').first<{ n: number }>()).toEqual({ n: 1 });
  });
});

describe('GET /api/admin/classes/:id', () => {
  it('lists the tests of the class, newest first', async () => {
    const cls = await makeClass(api, '6E2');
    await makeTest(api, cls.id, 'Primul');
    await makeTest(api, cls.id, 'Al doilea');
    const res = await api.request('GET', `/api/admin/classes/${cls.id}`);
    expect(res.body.tests.map((t: { code: string }) => t.code)).toEqual(['6E2-26T2', '6E2-26T1']);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run server/routes/tests.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  13 failed | 2 passed (15)`. The routes do not exist yet: requests answer 404 (`expected 404 to be 201`, `makeTest: {"error":"not_found",…}`). The "another teacher" checks for rename and delete pass already, because a missing route also answers 404.

- [ ] **Step 4: Replace `shared/api.ts`**

```ts
import { z } from 'zod';
import { normalizeClassName } from './classes.ts';
import type { TestFileKind } from './files.ts';
import { isValidSchoolYear } from './schoolYear.ts';
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST } from './students.ts';
import { cleanTitle, MAX_TITLE_LENGTH, type TestStatus } from './tests.ts';

// Request bodies of the teacher API. The server parses every body with these
// schemas; the browser uses the inferred types.

export const schoolYearSchema = z
  .number()
  .refine(isValidSchoolYear, { message: 'Anul școlar nu este valid.' });

export const classNameSchema = z.string().transform((raw, ctx) => {
  const name = normalizeClassName(raw);
  if (name === null) {
    ctx.addIssue({ code: 'custom', message: 'Numele clasei are 1-8 litere și cifre, de exemplu 6E2.' });
    return z.NEVER;
  }
  return name;
});

export const studentNameSchema = z
  .string()
  .transform(cleanStudentName)
  .pipe(
    z
      .string()
      .min(1, { message: 'Numele elevului lipsește.' })
      .max(MAX_NAME_LENGTH, { message: `Numele unui elev are cel mult ${MAX_NAME_LENGTH} de caractere.` }),
  );

export const createClassBody = z.object({
  name: classNameSchema,
  schoolYear: schoolYearSchema,
});

export const updateClassBody = z
  .object({
    name: classNameSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => body.name !== undefined || body.archived !== undefined, {
    message: 'Nu ai schimbat nimic.',
  });

export const addStudentsBody = z.object({
  names: z
    .array(studentNameSchema)
    .min(1, { message: 'Scrie cel puțin un nume.' })
    .max(MAX_NAMES_PER_REQUEST, { message: `Adaugă cel mult ${MAX_NAMES_PER_REQUEST} de nume odată.` }),
});

export const setEnrollmentBody = z.object({ active: z.boolean() });

export const renameStudentBody = z.object({ fullName: studentNameSchema });

export const testTitleSchema = z
  .string()
  .transform(cleanTitle)
  .pipe(
    z
      .string()
      .min(1, { message: 'Scrie titlul testului.' })
      .max(MAX_TITLE_LENGTH, { message: `Titlul are cel mult ${MAX_TITLE_LENGTH} de caractere.` }),
  );

export const createTestBody = z.object({
  classId: z.number({ message: 'Alege clasa.' }).int({ message: 'Alege clasa.' }).positive({ message: 'Alege clasa.' }),
  title: testTitleSchema,
});

export const renameTestBody = z.object({ title: testTitleSchema });

export type CreateClassInput = z.input<typeof createClassBody>;
export type UpdateClassInput = z.input<typeof updateClassBody>;
export type CreateTestInput = z.input<typeof createTestBody>;

// Response shapes of the teacher API.

export interface Teacher {
  id: number;
  email: string;
  name: string;
}

export interface ClassSummary {
  id: number;
  name: string;
  schoolYear: number;
  archived: boolean;
  studentCount: number;
}

export interface StudentRow {
  id: number;
  fullName: string;
  active: boolean;
}

export interface ClassDetail {
  class: ClassSummary;
  students: StudentRow[];
  tests: TestSummary[];
}

export interface TestSummary {
  code: string;
  title: string;
  status: TestStatus;
  classId: number;
  className: string;
  schoolYear: number;
  createdAt: string;
  // When Start test opened the uploads: the "date and hour" of the test.
  startedAt: string | null;
  // Active students of the class, and uploads that were sent (confirmed or included).
  studentCount: number;
  submittedCount: number;
}

export interface TestFileInfo {
  name: string;
  type: string;
}

export interface TestInfo extends TestSummary {
  uploadToken: string | null;
  files: Record<TestFileKind, TestFileInfo | null>;
}

// "none": the student has not started an upload.
export type UploadStatus = 'none' | 'uploading' | 'submitted' | 'grading' | 'graded' | 'failed';

// One row of the uploads table: an active student of the class, or a student
// who left the class after starting an upload.
export interface UploadRow {
  studentId: number;
  studentName: string;
  active: boolean;
  submissionId: number | null;
  status: UploadStatus;
  fileCount: number;
  startedAt: string | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
}

export interface TestDetail {
  test: TestInfo;
  uploads: UploadRow[];
}
```

- [ ] **Step 5: Replace `server/http.ts`**

```ts
import type { Context, MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { parsePositiveId } from '../shared/ids.ts';
import { isValidSchoolYear, schoolYearOf } from '../shared/schoolYear.ts';
import { normalizeTestCode } from '../shared/tests.ts';
import { ApiError, notFound } from './errors.ts';

// Reads a JSON body and checks it with a zod schema. The first problem becomes
// a 400 with the schema's Romanian message.
export async function readJson<Schema extends z.ZodType>(c: Context, schema: Schema): Promise<z.output<Schema>> {
  const type = c.req.header('Content-Type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'bad_content_type', 'Cererea trebuie trimisă ca JSON.');
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'bad_json', 'Cererea nu este JSON valid.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Datele trimise nu sunt valide.');
  }
  return parsed.data;
}

// Route ids are positive integers. Anything else is a page that does not exist.
export function parseId(raw: string | undefined): number {
  const id = parsePositiveId(raw);
  if (id === null) throw notFound();
  return id;
}

// Test codes in routes, in any letter case. Anything else is a page that does not exist.
export function parseTestCode(raw: string | undefined): string {
  const code = normalizeTestCode(raw ?? '');
  if (code === null) throw notFound();
  return code;
}

// The ?year= of a list; the current school year when it is missing.
export function parseSchoolYear(raw: string | undefined): number {
  const year = raw === undefined ? schoolYearOf(new Date()) : Number(raw);
  if (!isValidSchoolYear(year)) throw new ApiError(400, 'invalid', 'Anul școlar nu este valid.');
  return year;
}

// Writes must come from our own pages. A cross-site form or fetch carries
// Sec-Fetch-Site or an Origin from another site; both are refused.
export const sameOriginWrites: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const site = c.req.header('Sec-Fetch-Site');
    const origin = c.req.header('Origin');
    if ((site && site !== 'same-origin') || (origin && origin !== new URL(c.req.url).origin)) {
      throw new ApiError(403, 'cross_site', 'Cererea vine de pe alt site și a fost refuzată.');
    }
  }
  await next();
};

export function nowIso(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 6: Create `server/db/tests.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { TestInfo, TestSummary, UploadRow, UploadStatus } from '../../shared/api.ts';
import type { TestFileKind } from '../../shared/files.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { buildTestCode, type TestStatus } from '../../shared/tests.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';

export interface StoredFile {
  key: string;
  name: string;
  type: string;
}

// A test as the API works with it: the summary the browser sees, plus its
// database id and the R2 keys of its files.
export interface TestRecord {
  id: number;
  summary: TestSummary;
  uploadToken: string | null;
  files: Record<TestFileKind, StoredFile | null>;
}

interface TestRow {
  id: number;
  code: string;
  title: string;
  status: TestStatus;
  class_id: number;
  class_name: string;
  school_year: number;
  created_at: string;
  started_at: string | null;
  upload_token: string | null;
  test_file_key: string | null;
  test_file_name: string | null;
  test_file_type: string | null;
  barem_file_key: string | null;
  barem_file_name: string | null;
  barem_file_type: string | null;
  student_count: number;
  submitted_count: number;
}

const SELECT_TEST = `
  SELECT t.id, t.code, t.title, t.status, t.class_id, c.name AS class_name, c.school_year,
    t.created_at, t.started_at, t.upload_token,
    t.test_file_key, t.test_file_name, t.test_file_type,
    t.barem_file_key, t.barem_file_name, t.barem_file_type,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = t.class_id AND e.active = 1) AS student_count,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status <> 'uploading') AS submitted_count
  FROM tests t JOIN classes c ON c.id = t.class_id`;

function storedFile(key: string | null, name: string | null, type: string | null): StoredFile | null {
  return key && name && type ? { key, name, type } : null;
}

function toRecord(row: TestRow): TestRecord {
  return {
    id: row.id,
    summary: {
      code: row.code,
      title: row.title,
      status: row.status,
      classId: row.class_id,
      className: row.class_name,
      schoolYear: row.school_year,
      createdAt: row.created_at,
      startedAt: row.started_at,
      studentCount: row.student_count,
      submittedCount: row.submitted_count,
    },
    uploadToken: row.upload_token,
    files: {
      test: storedFile(row.test_file_key, row.test_file_name, row.test_file_type),
      barem: storedFile(row.barem_file_key, row.barem_file_name, row.barem_file_type),
    },
  };
}

// What the teacher app sees of a test: no R2 keys.
export function toTestInfo(record: TestRecord): TestInfo {
  const info = (file: StoredFile | null) => (file ? { name: file.name, type: file.type } : null);
  return {
    ...record.summary,
    uploadToken: record.uploadToken,
    files: { test: info(record.files.test), barem: info(record.files.barem) },
  };
}

// Tests of the teacher's classes in one school year, newest first.
export async function listTests(db: D1Database, teacherId: number, schoolYear: number): Promise<TestSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND c.school_year = ? ORDER BY t.created_at DESC, t.id DESC`)
    .bind(teacherId, schoolYear)
    .all<TestRow>();
  return results.map((row) => toRecord(row).summary);
}

// Tests of one class, newest first.
export async function listClassTests(db: D1Database, teacherId: number, classId: number): Promise<TestSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND t.class_id = ? ORDER BY t.number DESC`)
    .bind(teacherId, classId)
    .all<TestRow>();
  return results.map((row) => toRecord(row).summary);
}

export async function findTest(db: D1Database, teacherId: number, code: string): Promise<TestRecord | null> {
  const row = await db.prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND t.code = ?`).bind(teacherId, code).first<TestRow>();
  return row ? toRecord(row) : null;
}

export async function requireTest(db: D1Database, teacherId: number, code: string): Promise<TestRecord> {
  const record = await findTest(db, teacherId, code);
  if (!record) throw notFound();
  return record;
}

// The uploads table in one query: every active student of the class, and any
// student who left the class after starting an upload. Sorted by name.
export async function listUploads(db: D1Database, testId: number, classId: number): Promise<UploadRow[]> {
  const { results } = await db
    .prepare(
      `SELECT st.id AS student_id, st.full_name, e.active,
         s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted,
         (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count
       FROM enrollments e
       JOIN students st ON st.id = e.student_id
       LEFT JOIN submissions s ON s.test_id = ? AND s.student_id = e.student_id
       WHERE e.class_id = ? AND (e.active = 1 OR s.id IS NOT NULL)`,
    )
    .bind(testId, classId)
    .all<{
      student_id: number;
      full_name: string;
      active: number;
      submission_id: number | null;
      status: UploadStatus | null;
      started_at: string | null;
      submitted_at: string | null;
      auto_submitted: number | null;
      file_count: number;
    }>();
  return results
    .map((row) => ({
      studentId: row.student_id,
      studentName: row.full_name,
      active: row.active === 1,
      submissionId: row.submission_id,
      status: row.status ?? 'none',
      fileCount: row.file_count,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      autoSubmitted: row.auto_submitted === 1,
    }))
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));
}

const MAX_CODE_TRIES = 3;

// Makes a draft test with the class's next number, for example "6E2-26T3".
// The number and the code are unique, so a test made at the same moment, or a
// class that had this name before a rename, can already hold them: the counter
// then moves past that number and the next try takes a new one. At most 12
// queries.
export async function createTest(db: D1Database, teacherId: number, classId: number, title: string, now: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_CODE_TRIES; attempt++) {
    const cls = await db
      .prepare('SELECT name, school_year, next_test_number, archived FROM classes WHERE id = ? AND teacher_id = ?')
      .bind(classId, teacherId)
      .first<{ name: string; school_year: number; next_test_number: number; archived: number }>();
    if (!cls) throw notFound();
    if (cls.archived === 1) {
      throw new ApiError(409, 'class_archived', 'Clasa este arhivată. Scoate-o din arhivă ca să faci un test nou.');
    }
    const number = cls.next_test_number;
    const code = buildTestCode(cls.name, cls.school_year, number);
    try {
      await db.batch([
        db
          .prepare('INSERT INTO tests (teacher_id, class_id, number, code, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(teacherId, classId, number, code, title, now, now),
        db.prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ?').bind(number + 1, classId, teacherId),
      ]);
      return code;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await db
        .prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ? AND next_test_number <= ?')
        .bind(number + 1, classId, teacherId, number)
        .run();
    }
  }
  throw new ApiError(409, 'busy', 'Nu am putut alege un cod pentru test. Încearcă din nou.');
}

export async function renameTest(db: D1Database, teacherId: number, code: string, title: string, now: string): Promise<boolean> {
  const row = await db
    .prepare('UPDATE tests SET title = ?, updated_at = ? WHERE teacher_id = ? AND code = ? RETURNING id')
    .bind(title, now, teacherId, code)
    .first<{ id: number }>();
  return row !== null;
}

// Every R2 key of a test: its test and barem files and all student files.
export async function listTestKeys(db: D1Database, record: TestRecord): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT f.r2_key FROM submission_files f JOIN submissions s ON s.id = f.submission_id WHERE s.test_id = ?')
    .bind(record.id)
    .all<{ r2_key: string }>();
  const keys = results.map((row) => row.r2_key);
  for (const file of [record.files.test, record.files.barem]) if (file) keys.push(file.key);
  return keys;
}

// Deletes the test row; its uploads and file rows go with it (ON DELETE CASCADE).
export async function deleteTestRow(db: D1Database, teacherId: number, testId: number): Promise<void> {
  await db.prepare('DELETE FROM tests WHERE id = ? AND teacher_id = ?').bind(testId, teacherId).run();
}
```

- [ ] **Step 7: Create `server/routes/tests.ts`**

```ts
import { Hono } from 'hono';
import { createTestBody, renameTestBody } from '../../shared/api.ts';
import { createTest, deleteTestRow, listTestKeys, listTests, listUploads, renameTest, requireTest, toTestInfo } from '../db/tests.ts';
import type { AppEnv } from '../env.ts';
import { notFound } from '../errors.ts';
import { nowIso, parseSchoolYear, parseTestCode, readJson } from '../http.ts';
import { deleteFilesQuietly } from '../uploads.ts';

// /api/admin/tests
export function testRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const year = parseSchoolYear(c.req.query('year'));
    return c.json({ tests: await listTests(c.env.DB, c.var.teacher.id, year) });
  });

  routes.post('/', async (c) => {
    const body = await readJson(c, createTestBody);
    const code = await createTest(c.env.DB, c.var.teacher.id, body.classId, body.title, nowIso());
    return c.json({ code }, 201);
  });

  routes.get('/:code', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    return c.json({ test: toTestInfo(test), uploads: await listUploads(c.env.DB, test.id, test.summary.classId) });
  });

  routes.patch('/:code', async (c) => {
    const code = parseTestCode(c.req.param('code'));
    const body = await readJson(c, renameTestBody);
    if (!(await renameTest(c.env.DB, c.var.teacher.id, code, body.title, nowIso()))) throw notFound();
    return c.json({ code, title: body.title });
  });

  // The rows go first, so the test is gone at once; then its files.
  routes.delete('/:code', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const keys = await listTestKeys(c.env.DB, test);
    await deleteTestRow(c.env.DB, c.var.teacher.id, test.id);
    await deleteFilesQuietly(c.env.FILES, keys);
    return c.json({ deleted: true });
  });

  return routes;
}
```

- [ ] **Step 8: Replace `server/routes/admin.ts`**

```ts
import { Hono } from 'hono';
import { teacherAuth } from '../auth/teacherAuth.ts';
import type { AppEnv } from '../env.ts';
import { sameOriginWrites } from '../http.ts';
import { classRoutes } from './classes.ts';
import { studentRoutes } from './students.ts';
import { testRoutes } from './tests.ts';

// /api/admin: everything the teacher app calls. Every route needs a teacher login.
export function adminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites, teacherAuth());
  routes.get('/me', (c) => c.json({ teacher: c.var.teacher }));
  routes.route('/classes', classRoutes());
  routes.route('/students', studentRoutes());
  routes.route('/tests', testRoutes());
  return routes;
}
```

- [ ] **Step 9: Replace `server/routes/classes.ts`**

```ts
import { Hono } from 'hono';
import { addStudentsBody, createClassBody, setEnrollmentBody, updateClassBody } from '../../shared/api.ts';
import { createClass, getClass, listClasses, listClassStudents, updateClass } from '../db/classes.ts';
import { addStudentsToClass, setEnrollmentActive } from '../db/students.ts';
import { listClassTests } from '../db/tests.ts';
import type { AppEnv } from '../env.ts';
import { notFound } from '../errors.ts';
import { nowIso, parseId, parseSchoolYear, readJson } from '../http.ts';

// /api/admin/classes
export function classRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const year = parseSchoolYear(c.req.query('year'));
    return c.json({ classes: await listClasses(c.env.DB, c.var.teacher.id, year) });
  });

  routes.post('/', async (c) => {
    const body = await readJson(c, createClassBody);
    const created = await createClass(c.env.DB, c.var.teacher.id, body.name, body.schoolYear, nowIso());
    return c.json({ class: created }, 201);
  });

  routes.get('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const found = await getClass(c.env.DB, c.var.teacher.id, id);
    if (!found) throw notFound();
    return c.json({
      class: found,
      students: await listClassStudents(c.env.DB, c.var.teacher.id, id),
      tests: await listClassTests(c.env.DB, c.var.teacher.id, id),
    });
  });

  routes.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, updateClassBody);
    return c.json({ class: await updateClass(c.env.DB, c.var.teacher.id, id, body) });
  });

  routes.post('/:id/students', async (c) => {
    const id = parseId(c.req.param('id'));
    const body = await readJson(c, addStudentsBody);
    if (!(await getClass(c.env.DB, c.var.teacher.id, id))) throw notFound();
    const students = await addStudentsToClass(c.env.DB, c.var.teacher.id, id, body.names, nowIso());
    return c.json({ students }, 201);
  });

  routes.patch('/:id/students/:studentId', async (c) => {
    const id = parseId(c.req.param('id'));
    const studentId = parseId(c.req.param('studentId'));
    const body = await readJson(c, setEnrollmentBody);
    const student = await setEnrollmentActive(c.env.DB, c.var.teacher.id, id, studentId, body.active);
    if (!student) throw notFound();
    return c.json({ student });
  });

  return routes;
}
```

- [ ] **Step 10: Replace `src/test/fakeApi.ts`**

`ClassDetail` now has `tests`, so the fake's class detail returns an empty list.

```ts
import { vi } from 'vitest';
import type { ClassSummary, StudentRow } from '../../shared/api.ts';
import { normalizeClassName } from '../../shared/classes.ts';
import { ApiError, type AdminApi } from '../admin/api.ts';

// An in-memory AdminApi for page tests. Every method is a vi.fn, so tests can
// check calls or replace one answer with mockRejectedValueOnce.
export interface FakeData {
  classes: ClassSummary[];
  students: Record<number, StudentRow[]>;
}

export function createFakeApi(data: FakeData = { classes: [], students: {} }) {
  let nextId = 1000;
  const countActive = (classId: number) => (data.students[classId] ?? []).filter((s) => s.active).length;

  const api = {
    me: vi.fn(async () => ({ id: 1, email: 'profesor@example.com', name: 'Laura Miron' })),
    listClasses: vi.fn(async (schoolYear: number) =>
      data.classes.filter((c) => c.schoolYear === schoolYear).map((c) => ({ ...c, studentCount: countActive(c.id) })),
    ),
    createClass: vi.fn(async (input: { name: string; schoolYear: number }) => {
      const name = normalizeClassName(input.name);
      if (!name) throw new ApiError(400, 'invalid', 'Numele clasei are 1-8 litere și cifre, de exemplu 6E2.');
      const created: ClassSummary = { id: nextId++, name, schoolYear: input.schoolYear, archived: false, studentCount: 0 };
      data.classes.push(created);
      return created;
    }),
    getClass: vi.fn(async (classId: number) => {
      const found = data.classes.find((c) => c.id === classId);
      if (!found) throw new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');
      return { class: { ...found, studentCount: countActive(classId) }, students: [...(data.students[classId] ?? [])], tests: [] };
    }),
    updateClass: vi.fn(async (classId: number, input: { name?: string; archived?: boolean }) => {
      const found = data.classes.find((c) => c.id === classId)!;
      if (input.name !== undefined) found.name = normalizeClassName(input.name) ?? found.name;
      if (input.archived !== undefined) found.archived = input.archived;
      return { ...found };
    }),
    addStudents: vi.fn(async (classId: number, names: string[]) => {
      const added = names.map((fullName) => ({ id: nextId++, fullName, active: true }));
      data.students[classId] = [...(data.students[classId] ?? []), ...added];
      return added;
    }),
    setStudentActive: vi.fn(async (classId: number, studentId: number, active: boolean) => {
      const student = data.students[classId]!.find((s) => s.id === studentId)!;
      student.active = active;
      return { ...student };
    }),
    renameStudent: vi.fn(async (studentId: number, fullName: string) => {
      for (const list of Object.values(data.students)) {
        const student = list.find((s) => s.id === studentId);
        if (student) student.fullName = fullName;
      }
      return { id: studentId, fullName };
    }),
  } satisfies AdminApi;
  return api;
}

export type FakeApi = ReturnType<typeof createFakeApi>;
```

- [ ] **Step 11: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  24 passed (24)`, `Tests  206 passed (206)`.

- [ ] **Step 12: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 13: Commit**

```bash
git add shared/api.ts server src/test/fakeApi.ts
git commit -m "Add the teacher API for tests: create, list, open, rename, delete"
```

---

### Task 5: Test and barem files

The teacher uploads, replaces, and opens the test file and the barem.

**Files:**
- Modify: `server/db/tests.ts`, `server/routes/tests.ts`
- Test: `server/routes/testFiles.test.ts`

**Interfaces:**
- Consumes: `readUpload`, `fileResponse`, `deleteFilesQuietly`, `testFileKey` (Task 3); `requireTest` (Task 4).
- Produces:
  - `saveTestFile(db, teacherId, testId, kind, file, now)` in `server/db/tests.ts`. A new barem resets the exercise-list columns.
  - Routes: `PUT /api/admin/tests/:code/files/:kind` (raw body, headers `Content-Type`, `X-File-Name` URI-encoded) → `{ file: { name, type } }`; 409 `evaluating` while the test is being graded. `GET /api/admin/tests/:code/files/:kind` streams the file.

- [ ] **Step 1: Create `server/routes/testFiles.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOCX_TYPE, PDF_TYPE } from '../../shared/files.ts';
import { makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

function putFile(testCode: string, kind: string, body: BodyInit, type: string, name: string, headers: Record<string, string> = {}) {
  return api.fetch(`/api/admin/tests/${testCode}/files/${kind}`, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name), ...headers },
  });
}

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2');
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('PUT /api/admin/tests/:code/files/:kind', () => {
  it('stores the test file in the test folder and shows it on the test', async () => {
    const res = await putFile(code, 'test', pdf('enunț'), PDF_TYPE, 'Test final ședința 1.pdf');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ file: { name: 'Test final ședința 1.pdf', type: PDF_TYPE } });

    const key = `t/${api.teacherId}/2026/${code}/test/test-final-sedinta-1.pdf`;
    expect(await (await api.env.FILES.get(key))?.text()).toBe('%PDF-1.7 enunț');
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test.files).toEqual({ test: { name: 'Test final ședința 1.pdf', type: PDF_TYPE }, barem: null });
  });

  it('replaces a file: the new one is stored, the old one deleted', async () => {
    await putFile(code, 'barem', pdf('vechi'), PDF_TYPE, 'barem.pdf');
    const res = await putFile(code, 'barem', docx, DOCX_TYPE, 'Barem nou.docx');
    expect(res.status).toBe(200);
    const listed = await api.env.FILES.list({ prefix: `t/${api.teacherId}/2026/${code}/barem/` });
    expect(listed.objects.map((o) => o.key)).toEqual([`t/${api.teacherId}/2026/${code}/barem/barem-nou.docx`]);
  });

  it('keeps the file when the new one has the same name', async () => {
    await putFile(code, 'test', pdf('unu'), PDF_TYPE, 'test.pdf');
    await putFile(code, 'test', pdf('doi'), PDF_TYPE, 'test.pdf');
    expect(await (await api.env.FILES.get(`t/${api.teacherId}/2026/${code}/test/test.pdf`))?.text()).toBe('%PDF-1.7 doi');
  });

  it('clears the exercise list when the barem changes', async () => {
    await api.db
      .prepare("UPDATE tests SET exercise_list_status = 'ready', exercise_list_json = '{}', exercise_list_attempts = 2 WHERE code = ?")
      .bind(code)
      .run();
    const listState = () =>
      api.db
        .prepare('SELECT exercise_list_status, exercise_list_json, exercise_list_attempts FROM tests WHERE code = ?')
        .bind(code)
        .first();

    await putFile(code, 'test', pdf('enunț'), PDF_TYPE, 'test.pdf');
    expect(await listState()).toEqual({ exercise_list_status: 'ready', exercise_list_json: '{}', exercise_list_attempts: 2 });

    await putFile(code, 'barem', pdf('barem'), PDF_TYPE, 'barem.pdf');
    expect(await listState()).toEqual({ exercise_list_status: 'none', exercise_list_json: null, exercise_list_attempts: 0 });
  });

  it('refuses a file that is not PDF or Word, with a Romanian message', async () => {
    const res = await putFile(code, 'test', new TextEncoder().encode('just text'), 'text/plain', 'notes.txt');
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'bad_file_type', message: 'Încarcă un fișier PDF sau Word (.docx).' });
  });

  it('refuses a new file while the test is being graded', async () => {
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(code).run();
    const res = await putFile(code, 'test', pdf('x'), PDF_TYPE, 'test.pdf');
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('evaluating');
  });

  it('answers 404 for an unknown kind, an unknown test, and a test of another teacher', async () => {
    expect((await putFile(code, 'answers', pdf('x'), PDF_TYPE, 'a.pdf')).status).toBe(404);
    expect((await putFile('6E2-26T9', 'test', pdf('x'), PDF_TYPE, 'a.pdf')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    expect((await putFile(foreign.code, 'test', pdf('x'), PDF_TYPE, 'a.pdf')).status).toBe(404);
    expect((await api.env.FILES.list()).objects).toEqual([]);
  });

  it('refuses an upload sent from another site', async () => {
    const res = await putFile(code, 'test', pdf('x'), PDF_TYPE, 'a.pdf', { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/tests/:code/files/:kind', () => {
  it('streams the stored file under its original name', async () => {
    await putFile(code, 'test', pdf('enunț'), PDF_TYPE, 'Test (final).pdf');
    const res = await api.fetch(`/api/admin/tests/${code}/files/test`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(PDF_TYPE);
    expect(res.headers.get('Content-Disposition')).toBe("inline; filename*=UTF-8''Test%20%28final%29.pdf");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await res.text()).toBe('%PDF-1.7 enunț');
  });

  it('answers 404 when there is no file yet, and for a test of another teacher', async () => {
    expect((await api.fetch(`/api/admin/tests/${code}/files/barem`)).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    await api.db
      .prepare("UPDATE tests SET test_file_key = 'x/t.pdf', test_file_name = 't.pdf', test_file_type = 'application/pdf' WHERE code = ?")
      .bind(foreign.code)
      .run();
    await api.env.FILES.put('x/t.pdf', '%PDF-1.7 secret');
    expect((await api.fetch(`/api/admin/tests/${foreign.code}/files/test`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run server/routes/testFiles.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  7 failed | 3 passed (10)`. The file routes do not exist yet: uploads answer 404 (`expected 404 to be 200`). The two 404 checks and the other-site check pass already.

- [ ] **Step 3: Replace `server/db/tests.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { TestInfo, TestSummary, UploadRow, UploadStatus } from '../../shared/api.ts';
import type { TestFileKind } from '../../shared/files.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { buildTestCode, type TestStatus } from '../../shared/tests.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';

export interface StoredFile {
  key: string;
  name: string;
  type: string;
}

// A test as the API works with it: the summary the browser sees, plus its
// database id and the R2 keys of its files.
export interface TestRecord {
  id: number;
  summary: TestSummary;
  uploadToken: string | null;
  files: Record<TestFileKind, StoredFile | null>;
}

interface TestRow {
  id: number;
  code: string;
  title: string;
  status: TestStatus;
  class_id: number;
  class_name: string;
  school_year: number;
  created_at: string;
  started_at: string | null;
  upload_token: string | null;
  test_file_key: string | null;
  test_file_name: string | null;
  test_file_type: string | null;
  barem_file_key: string | null;
  barem_file_name: string | null;
  barem_file_type: string | null;
  student_count: number;
  submitted_count: number;
}

const SELECT_TEST = `
  SELECT t.id, t.code, t.title, t.status, t.class_id, c.name AS class_name, c.school_year,
    t.created_at, t.started_at, t.upload_token,
    t.test_file_key, t.test_file_name, t.test_file_type,
    t.barem_file_key, t.barem_file_name, t.barem_file_type,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = t.class_id AND e.active = 1) AS student_count,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status <> 'uploading') AS submitted_count
  FROM tests t JOIN classes c ON c.id = t.class_id`;

function storedFile(key: string | null, name: string | null, type: string | null): StoredFile | null {
  return key && name && type ? { key, name, type } : null;
}

function toRecord(row: TestRow): TestRecord {
  return {
    id: row.id,
    summary: {
      code: row.code,
      title: row.title,
      status: row.status,
      classId: row.class_id,
      className: row.class_name,
      schoolYear: row.school_year,
      createdAt: row.created_at,
      startedAt: row.started_at,
      studentCount: row.student_count,
      submittedCount: row.submitted_count,
    },
    uploadToken: row.upload_token,
    files: {
      test: storedFile(row.test_file_key, row.test_file_name, row.test_file_type),
      barem: storedFile(row.barem_file_key, row.barem_file_name, row.barem_file_type),
    },
  };
}

// What the teacher app sees of a test: no R2 keys.
export function toTestInfo(record: TestRecord): TestInfo {
  const info = (file: StoredFile | null) => (file ? { name: file.name, type: file.type } : null);
  return {
    ...record.summary,
    uploadToken: record.uploadToken,
    files: { test: info(record.files.test), barem: info(record.files.barem) },
  };
}

// Tests of the teacher's classes in one school year, newest first.
export async function listTests(db: D1Database, teacherId: number, schoolYear: number): Promise<TestSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND c.school_year = ? ORDER BY t.created_at DESC, t.id DESC`)
    .bind(teacherId, schoolYear)
    .all<TestRow>();
  return results.map((row) => toRecord(row).summary);
}

// Tests of one class, newest first.
export async function listClassTests(db: D1Database, teacherId: number, classId: number): Promise<TestSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND t.class_id = ? ORDER BY t.number DESC`)
    .bind(teacherId, classId)
    .all<TestRow>();
  return results.map((row) => toRecord(row).summary);
}

export async function findTest(db: D1Database, teacherId: number, code: string): Promise<TestRecord | null> {
  const row = await db.prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND t.code = ?`).bind(teacherId, code).first<TestRow>();
  return row ? toRecord(row) : null;
}

export async function requireTest(db: D1Database, teacherId: number, code: string): Promise<TestRecord> {
  const record = await findTest(db, teacherId, code);
  if (!record) throw notFound();
  return record;
}

// The uploads table in one query: every active student of the class, and any
// student who left the class after starting an upload. Sorted by name.
export async function listUploads(db: D1Database, testId: number, classId: number): Promise<UploadRow[]> {
  const { results } = await db
    .prepare(
      `SELECT st.id AS student_id, st.full_name, e.active,
         s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted,
         (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count
       FROM enrollments e
       JOIN students st ON st.id = e.student_id
       LEFT JOIN submissions s ON s.test_id = ? AND s.student_id = e.student_id
       WHERE e.class_id = ? AND (e.active = 1 OR s.id IS NOT NULL)`,
    )
    .bind(testId, classId)
    .all<{
      student_id: number;
      full_name: string;
      active: number;
      submission_id: number | null;
      status: UploadStatus | null;
      started_at: string | null;
      submitted_at: string | null;
      auto_submitted: number | null;
      file_count: number;
    }>();
  return results
    .map((row) => ({
      studentId: row.student_id,
      studentName: row.full_name,
      active: row.active === 1,
      submissionId: row.submission_id,
      status: row.status ?? 'none',
      fileCount: row.file_count,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      autoSubmitted: row.auto_submitted === 1,
    }))
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));
}

const MAX_CODE_TRIES = 3;

// Makes a draft test with the class's next number, for example "6E2-26T3".
// The number and the code are unique, so a test made at the same moment, or a
// class that had this name before a rename, can already hold them: the counter
// then moves past that number and the next try takes a new one. At most 12
// queries.
export async function createTest(db: D1Database, teacherId: number, classId: number, title: string, now: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_CODE_TRIES; attempt++) {
    const cls = await db
      .prepare('SELECT name, school_year, next_test_number, archived FROM classes WHERE id = ? AND teacher_id = ?')
      .bind(classId, teacherId)
      .first<{ name: string; school_year: number; next_test_number: number; archived: number }>();
    if (!cls) throw notFound();
    if (cls.archived === 1) {
      throw new ApiError(409, 'class_archived', 'Clasa este arhivată. Scoate-o din arhivă ca să faci un test nou.');
    }
    const number = cls.next_test_number;
    const code = buildTestCode(cls.name, cls.school_year, number);
    try {
      await db.batch([
        db
          .prepare('INSERT INTO tests (teacher_id, class_id, number, code, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(teacherId, classId, number, code, title, now, now),
        db.prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ?').bind(number + 1, classId, teacherId),
      ]);
      return code;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await db
        .prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ? AND next_test_number <= ?')
        .bind(number + 1, classId, teacherId, number)
        .run();
    }
  }
  throw new ApiError(409, 'busy', 'Nu am putut alege un cod pentru test. Încearcă din nou.');
}

export async function renameTest(db: D1Database, teacherId: number, code: string, title: string, now: string): Promise<boolean> {
  const row = await db
    .prepare('UPDATE tests SET title = ?, updated_at = ? WHERE teacher_id = ? AND code = ? RETURNING id')
    .bind(title, now, teacherId, code)
    .first<{ id: number }>();
  return row !== null;
}

// Points the test at a new test or barem file. A new barem also clears the
// exercise list, which the robot made from the old one (spec §8.5).
export async function saveTestFile(
  db: D1Database,
  teacherId: number,
  testId: number,
  kind: TestFileKind,
  file: StoredFile,
  now: string,
): Promise<void> {
  const sql =
    kind === 'test'
      ? 'UPDATE tests SET test_file_key = ?, test_file_name = ?, test_file_type = ?, updated_at = ? WHERE id = ? AND teacher_id = ?'
      : `UPDATE tests SET barem_file_key = ?, barem_file_name = ?, barem_file_type = ?, updated_at = ?,
           exercise_list_status = 'none', exercise_list_json = NULL, exercise_list_message = NULL, exercise_list_attempts = 0
         WHERE id = ? AND teacher_id = ?`;
  await db.prepare(sql).bind(file.key, file.name, file.type, now, testId, teacherId).run();
}

// Every R2 key of a test: its test and barem files and all student files.
export async function listTestKeys(db: D1Database, record: TestRecord): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT f.r2_key FROM submission_files f JOIN submissions s ON s.id = f.submission_id WHERE s.test_id = ?')
    .bind(record.id)
    .all<{ r2_key: string }>();
  const keys = results.map((row) => row.r2_key);
  for (const file of [record.files.test, record.files.barem]) if (file) keys.push(file.key);
  return keys;
}

// Deletes the test row; its uploads and file rows go with it (ON DELETE CASCADE).
export async function deleteTestRow(db: D1Database, teacherId: number, testId: number): Promise<void> {
  await db.prepare('DELETE FROM tests WHERE id = ? AND teacher_id = ?').bind(testId, teacherId).run();
}
```

- [ ] **Step 4: Replace `server/routes/tests.ts`**

```ts
import { Hono } from 'hono';
import { createTestBody, renameTestBody } from '../../shared/api.ts';
import { isTestFileKind, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE, testFileKey, type TestFileKind } from '../../shared/files.ts';
import {
  createTest,
  deleteTestRow,
  listTestKeys,
  listTests,
  listUploads,
  renameTest,
  requireTest,
  saveTestFile,
  toTestInfo,
} from '../db/tests.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseSchoolYear, parseTestCode, readJson } from '../http.ts';
import { deleteFilesQuietly, fileResponse, readUpload } from '../uploads.ts';

function parseFileKind(raw: string | undefined): TestFileKind {
  if (raw === undefined || !isTestFileKind(raw)) throw notFound();
  return raw;
}

// /api/admin/tests
export function testRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const year = parseSchoolYear(c.req.query('year'));
    return c.json({ tests: await listTests(c.env.DB, c.var.teacher.id, year) });
  });

  routes.post('/', async (c) => {
    const body = await readJson(c, createTestBody);
    const code = await createTest(c.env.DB, c.var.teacher.id, body.classId, body.title, nowIso());
    return c.json({ code }, 201);
  });

  routes.get('/:code', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    return c.json({ test: toTestInfo(test), uploads: await listUploads(c.env.DB, test.id, test.summary.classId) });
  });

  routes.patch('/:code', async (c) => {
    const code = parseTestCode(c.req.param('code'));
    const body = await readJson(c, renameTestBody);
    if (!(await renameTest(c.env.DB, c.var.teacher.id, code, body.title, nowIso()))) throw notFound();
    return c.json({ code, title: body.title });
  });

  // The rows go first, so the test is gone at once; then its files.
  routes.delete('/:code', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const keys = await listTestKeys(c.env.DB, test);
    await deleteTestRow(c.env.DB, c.var.teacher.id, test.id);
    await deleteFilesQuietly(c.env.FILES, keys);
    return c.json({ deleted: true });
  });

  // Upload or replace the test or the barem: PDF or Word, at most 25 MB.
  routes.put('/:code/files/:kind', async (c) => {
    const kind = parseFileKind(c.req.param('kind'));
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    if (test.summary.status === 'evaluating') {
      throw new ApiError(409, 'evaluating', 'Testul se corectează acum. Poți schimba fișierul după ce se termină corectarea.');
    }
    const file = await readUpload(c, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
    const key = testFileKey(teacherId, test.summary.schoolYear, test.summary.code, kind, file.name, file.contentType);
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
    await saveTestFile(c.env.DB, teacherId, test.id, kind, { key, name: file.name, type: file.contentType }, nowIso());
    const old = test.files[kind];
    if (old && old.key !== key) await deleteFilesQuietly(c.env.FILES, [old.key]);
    return c.json({ file: { name: file.name, type: file.contentType } });
  });

  routes.get('/:code/files/:kind', async (c) => {
    const kind = parseFileKind(c.req.param('kind'));
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const stored = test.files[kind];
    const object = stored ? await c.env.FILES.get(stored.key) : null;
    if (!stored || !object) throw notFound();
    return fileResponse(object, stored.name, stored.type);
  });

  return routes;
}
```

- [ ] **Step 5: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  25 passed (25)`, `Tests  216 passed (216)`.

- [ ] **Step 6: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "Upload, replace, and open the test and barem files"
```

---

### Task 6: Start, reopen, and the teacher's view of uploads

Start test makes the upload link. Reopen opens uploads again. The teacher opens one student's upload, streams its files, and resets it.

**Files:**
- Create: `server/db/submissions.ts`, `server/routes/submissions.ts`
- Modify: `shared/api.ts`, `server/db/tests.ts`, `server/routes/tests.ts`, `server/routes/admin.ts`
- Test: `server/routes/lifecycle.test.ts`, `server/routes/submissions.test.ts`

**Interfaces:**
- Consumes: `newUploadToken` (Task 3); `requireTest`, `TestRecord` (Task 4).
- Produces:
  - `shared/api.ts`: `StartedTest { status, uploadToken, startedAt }`, `SubmissionFile { id, name, contentType, size, position }`, `SubmissionDetail`.
  - `server/db/tests.ts`: `startTest(db, teacherId, testId, token, now)`, `reopenTest(db, teacherId, testId, now)`.
  - `server/db/submissions.ts`: `SubmissionFileRecord`, `publicFile`, `listSubmissionFiles(db, submissionId)`, `getTeacherSubmission`, `findTeacherFile`, `deleteSubmissionRow`.
  - Routes: `POST /api/admin/tests/:code/start` → `StartedTest` (409 `already_started`), `POST /api/admin/tests/:code/reopen` → `{ status: 'open' }` (409 `not_started` / `already_open`), `GET /api/admin/submissions/:id` → `{ submission }`, `GET /api/admin/submissions/:id/files/:fileId` (stream), `POST /api/admin/submissions/:id/reset` → `{ reset: true }`.

- [ ] **Step 1: Create `server/routes/lifecycle.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isUploadToken } from '../../shared/tests.ts';
import { makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;

const setState = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(code).run();
const state = () =>
  api.db.prepare('SELECT status, evaluation_at, analysis_stale FROM tests WHERE code = ?').bind(code).first();

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2');
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/tests/:code/start', () => {
  it('opens the uploads and makes the upload link', async () => {
    const res = await api.request('POST', `/api/admin/tests/${code}/start`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('open');
    expect(isUploadToken(res.body.uploadToken)).toBe(true);
    expect(Date.parse(res.body.startedAt)).not.toBeNaN();

    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test).toMatchObject({ status: 'open', uploadToken: res.body.uploadToken, startedAt: res.body.startedAt });
  });

  it('refuses to start a test twice and keeps the first link', async () => {
    const first = await api.request('POST', `/api/admin/tests/${code}/start`);
    const second = await api.request('POST', `/api/admin/tests/${code}/start`);
    expect(second.status).toBe(409);
    expect(second.body.message).toBe('Testul a început deja.');
    expect((await api.request('GET', `/api/admin/tests/${code}`)).body.test.uploadToken).toBe(first.body.uploadToken);
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET status = 'draft' WHERE code = ?").bind(foreign.code).run();
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/start`)).status).toBe(404);
  });
});

describe('POST /api/admin/tests/:code/reopen', () => {
  it('refuses a draft and an open test', async () => {
    const draft = await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(draft.status).toBe(409);
    expect(draft.body.message).toBe('Testul nu a început încă.');
    await api.request('POST', `/api/admin/tests/${code}/start`);
    const open = await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(open.status).toBe(409);
    expect(open.body.message).toBe('Încărcarea este deja deschisă.');
  });

  it('reopens a test that is being graded and cancels its schedule', async () => {
    await setState("status = 'evaluating', evaluation_at = '2026-10-07T08:00:00.000Z'");
    const res = await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'open' });
    expect(await state()).toEqual({ status: 'open', evaluation_at: null, analysis_stale: 0 });
  });

  it('marks a ready class analysis as possibly out of date', async () => {
    await setState("status = 'done', analysis_status = 'ready'");
    await api.request('POST', `/api/admin/tests/${code}/reopen`);
    expect(await state()).toEqual({ status: 'open', evaluation_at: null, analysis_stale: 1 });
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(foreign.code).run();
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/reopen`)).status).toBe(404);
    const row = await api.db.prepare('SELECT status FROM tests WHERE code = ?').bind(foreign.code).first<{ status: string }>();
    expect(row?.status).toBe('done');
  });
});
```

- [ ] **Step 2: Create `server/routes/submissions.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;
let studentId: number;
let submissionId: number;

const fileIds = async (id: number) =>
  (await api.db.prepare('SELECT id FROM submission_files WHERE submission_id = ? ORDER BY position').bind(id).all<{ id: number }>()).results.map(
    (row) => row.id,
  );

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  studentId = cls.studentIds[0]!;
  code = await makeTest(api, cls.id, 'Fracții');
  submissionId = await addSubmission(api, code, studentId, { status: 'submitted', files: 2 });
  await api.env.FILES.put(`fixture/${submissionId}/1.jpg`, 'first page');
  await api.env.FILES.put(`fixture/${submissionId}/2.jpg`, 'second page');
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/admin/submissions/:id', () => {
  it('returns the upload with its files in upload order', async () => {
    const [first, second] = await fileIds(submissionId);
    const res = await api.request('GET', `/api/admin/submissions/${submissionId}`);
    expect(res.status).toBe(200);
    expect(res.body.submission).toEqual({
      id: submissionId,
      testCode: code,
      testTitle: 'Fracții',
      studentId,
      studentName: 'Pop Ion',
      status: 'submitted',
      autoSubmitted: false,
      startedAt: '2026-10-06T08:00:00.000Z',
      submittedAt: '2026-10-06T08:30:00.000Z',
      files: [
        { id: first, name: 'poza1.jpg', contentType: 'image/jpeg', size: 100, position: 1 },
        { id: second, name: 'poza2.jpg', contentType: 'image/jpeg', size: 100, position: 2 },
      ],
    });
  });

  it('answers 404 for an unknown upload and for an upload of another teacher', async () => {
    expect((await api.request('GET', '/api/admin/submissions/99999')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId);
    expect((await api.request('GET', `/api/admin/submissions/${foreignId}`)).status).toBe(404);
  });
});

describe('GET /api/admin/submissions/:id/files/:fileId', () => {
  it('streams a file of the upload', async () => {
    const [first] = await fileIds(submissionId);
    const res = await api.fetch(`/api/admin/submissions/${submissionId}/files/${first}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(await res.text()).toBe('first page');
  });

  it('answers 404 for a file of another upload and for files of another teacher', async () => {
    const cls = await makeClass(api, '7E2', ['Stan Eva']);
    const otherCode = await makeTest(api, cls.id);
    const otherSubmission = await addSubmission(api, otherCode, cls.studentIds[0]!, { files: 1 });
    const [otherFile] = await fileIds(otherSubmission);
    expect((await api.fetch(`/api/admin/submissions/${submissionId}/files/${otherFile}`)).status).toBe(404);

    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { files: 1 });
    const [foreignFile] = await fileIds(foreignId);
    await api.env.FILES.put(`fixture/${foreignId}/1.jpg`, 'secret');
    expect((await api.fetch(`/api/admin/submissions/${foreignId}/files/${foreignFile}`)).status).toBe(404);
  });
});

describe('POST /api/admin/submissions/:id/reset', () => {
  it('deletes the upload and its files, so the student can start again', async () => {
    const res = await api.request('POST', `/api/admin/submissions/${submissionId}/reset`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reset: true });

    expect((await api.request('GET', `/api/admin/submissions/${submissionId}`)).status).toBe(404);
    expect((await api.env.FILES.list({ prefix: 'fixture/' })).objects).toEqual([]);
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.uploads[0]).toMatchObject({ studentName: 'Pop Ion', status: 'none', submissionId: null, fileCount: 0 });
  });

  it('answers 404 for an upload of another teacher and keeps it', async () => {
    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { files: 1 });
    expect((await api.request('POST', `/api/admin/submissions/${foreignId}/reset`)).status).toBe(404);
    const row = await api.db.prepare('SELECT COUNT(*) AS n FROM submission_files WHERE submission_id = ?').bind(foreignId).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run server/routes/lifecycle.test.ts server/routes/submissions.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  8 failed | 5 passed (13)`. The start, reopen, and submission routes do not exist yet: they answer 404. The five 404 checks pass already.

- [ ] **Step 4: Replace `shared/api.ts`**

```ts
import { z } from 'zod';
import { normalizeClassName } from './classes.ts';
import type { TestFileKind } from './files.ts';
import { isValidSchoolYear } from './schoolYear.ts';
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST } from './students.ts';
import { cleanTitle, MAX_TITLE_LENGTH, type TestStatus } from './tests.ts';

// Request bodies of the teacher API. The server parses every body with these
// schemas; the browser uses the inferred types.

export const schoolYearSchema = z
  .number()
  .refine(isValidSchoolYear, { message: 'Anul școlar nu este valid.' });

export const classNameSchema = z.string().transform((raw, ctx) => {
  const name = normalizeClassName(raw);
  if (name === null) {
    ctx.addIssue({ code: 'custom', message: 'Numele clasei are 1-8 litere și cifre, de exemplu 6E2.' });
    return z.NEVER;
  }
  return name;
});

export const studentNameSchema = z
  .string()
  .transform(cleanStudentName)
  .pipe(
    z
      .string()
      .min(1, { message: 'Numele elevului lipsește.' })
      .max(MAX_NAME_LENGTH, { message: `Numele unui elev are cel mult ${MAX_NAME_LENGTH} de caractere.` }),
  );

export const createClassBody = z.object({
  name: classNameSchema,
  schoolYear: schoolYearSchema,
});

export const updateClassBody = z
  .object({
    name: classNameSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => body.name !== undefined || body.archived !== undefined, {
    message: 'Nu ai schimbat nimic.',
  });

export const addStudentsBody = z.object({
  names: z
    .array(studentNameSchema)
    .min(1, { message: 'Scrie cel puțin un nume.' })
    .max(MAX_NAMES_PER_REQUEST, { message: `Adaugă cel mult ${MAX_NAMES_PER_REQUEST} de nume odată.` }),
});

export const setEnrollmentBody = z.object({ active: z.boolean() });

export const renameStudentBody = z.object({ fullName: studentNameSchema });

export const testTitleSchema = z
  .string()
  .transform(cleanTitle)
  .pipe(
    z
      .string()
      .min(1, { message: 'Scrie titlul testului.' })
      .max(MAX_TITLE_LENGTH, { message: `Titlul are cel mult ${MAX_TITLE_LENGTH} de caractere.` }),
  );

export const createTestBody = z.object({
  classId: z.number({ message: 'Alege clasa.' }).int({ message: 'Alege clasa.' }).positive({ message: 'Alege clasa.' }),
  title: testTitleSchema,
});

export const renameTestBody = z.object({ title: testTitleSchema });

export type CreateClassInput = z.input<typeof createClassBody>;
export type UpdateClassInput = z.input<typeof updateClassBody>;
export type CreateTestInput = z.input<typeof createTestBody>;

// Response shapes of the teacher API.

export interface Teacher {
  id: number;
  email: string;
  name: string;
}

export interface ClassSummary {
  id: number;
  name: string;
  schoolYear: number;
  archived: boolean;
  studentCount: number;
}

export interface StudentRow {
  id: number;
  fullName: string;
  active: boolean;
}

export interface ClassDetail {
  class: ClassSummary;
  students: StudentRow[];
  tests: TestSummary[];
}

export interface TestSummary {
  code: string;
  title: string;
  status: TestStatus;
  classId: number;
  className: string;
  schoolYear: number;
  createdAt: string;
  // When Start test opened the uploads: the "date and hour" of the test.
  startedAt: string | null;
  // Active students of the class, and uploads that were sent (confirmed or included).
  studentCount: number;
  submittedCount: number;
}

export interface TestFileInfo {
  name: string;
  type: string;
}

export interface TestInfo extends TestSummary {
  uploadToken: string | null;
  files: Record<TestFileKind, TestFileInfo | null>;
}

// "none": the student has not started an upload.
export type UploadStatus = 'none' | 'uploading' | 'submitted' | 'grading' | 'graded' | 'failed';

// One row of the uploads table: an active student of the class, or a student
// who left the class after starting an upload.
export interface UploadRow {
  studentId: number;
  studentName: string;
  active: boolean;
  submissionId: number | null;
  status: UploadStatus;
  fileCount: number;
  startedAt: string | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
}

export interface TestDetail {
  test: TestInfo;
  uploads: UploadRow[];
}

// Start test: the link is /u/<uploadToken>.
export interface StartedTest {
  status: TestStatus;
  uploadToken: string;
  startedAt: string;
}

// One uploaded page or PDF, in upload order.
export interface SubmissionFile {
  id: number;
  name: string;
  contentType: string;
  size: number;
  position: number;
}

export interface SubmissionDetail {
  id: number;
  testCode: string;
  testTitle: string;
  studentId: number;
  studentName: string;
  status: Exclude<UploadStatus, 'none'>;
  autoSubmitted: boolean;
  startedAt: string;
  submittedAt: string | null;
  files: SubmissionFile[];
}
```

- [ ] **Step 5: Replace `server/db/tests.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { TestInfo, TestSummary, UploadRow, UploadStatus } from '../../shared/api.ts';
import type { TestFileKind } from '../../shared/files.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { buildTestCode, type TestStatus } from '../../shared/tests.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';

export interface StoredFile {
  key: string;
  name: string;
  type: string;
}

// A test as the API works with it: the summary the browser sees, plus its
// database id and the R2 keys of its files.
export interface TestRecord {
  id: number;
  summary: TestSummary;
  uploadToken: string | null;
  files: Record<TestFileKind, StoredFile | null>;
}

interface TestRow {
  id: number;
  code: string;
  title: string;
  status: TestStatus;
  class_id: number;
  class_name: string;
  school_year: number;
  created_at: string;
  started_at: string | null;
  upload_token: string | null;
  test_file_key: string | null;
  test_file_name: string | null;
  test_file_type: string | null;
  barem_file_key: string | null;
  barem_file_name: string | null;
  barem_file_type: string | null;
  student_count: number;
  submitted_count: number;
}

const SELECT_TEST = `
  SELECT t.id, t.code, t.title, t.status, t.class_id, c.name AS class_name, c.school_year,
    t.created_at, t.started_at, t.upload_token,
    t.test_file_key, t.test_file_name, t.test_file_type,
    t.barem_file_key, t.barem_file_name, t.barem_file_type,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = t.class_id AND e.active = 1) AS student_count,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status <> 'uploading') AS submitted_count
  FROM tests t JOIN classes c ON c.id = t.class_id`;

function storedFile(key: string | null, name: string | null, type: string | null): StoredFile | null {
  return key && name && type ? { key, name, type } : null;
}

function toRecord(row: TestRow): TestRecord {
  return {
    id: row.id,
    summary: {
      code: row.code,
      title: row.title,
      status: row.status,
      classId: row.class_id,
      className: row.class_name,
      schoolYear: row.school_year,
      createdAt: row.created_at,
      startedAt: row.started_at,
      studentCount: row.student_count,
      submittedCount: row.submitted_count,
    },
    uploadToken: row.upload_token,
    files: {
      test: storedFile(row.test_file_key, row.test_file_name, row.test_file_type),
      barem: storedFile(row.barem_file_key, row.barem_file_name, row.barem_file_type),
    },
  };
}

// What the teacher app sees of a test: no R2 keys.
export function toTestInfo(record: TestRecord): TestInfo {
  const info = (file: StoredFile | null) => (file ? { name: file.name, type: file.type } : null);
  return {
    ...record.summary,
    uploadToken: record.uploadToken,
    files: { test: info(record.files.test), barem: info(record.files.barem) },
  };
}

// Tests of the teacher's classes in one school year, newest first.
export async function listTests(db: D1Database, teacherId: number, schoolYear: number): Promise<TestSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND c.school_year = ? ORDER BY t.created_at DESC, t.id DESC`)
    .bind(teacherId, schoolYear)
    .all<TestRow>();
  return results.map((row) => toRecord(row).summary);
}

// Tests of one class, newest first.
export async function listClassTests(db: D1Database, teacherId: number, classId: number): Promise<TestSummary[]> {
  const { results } = await db
    .prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND t.class_id = ? ORDER BY t.number DESC`)
    .bind(teacherId, classId)
    .all<TestRow>();
  return results.map((row) => toRecord(row).summary);
}

export async function findTest(db: D1Database, teacherId: number, code: string): Promise<TestRecord | null> {
  const row = await db.prepare(`${SELECT_TEST} WHERE t.teacher_id = ? AND t.code = ?`).bind(teacherId, code).first<TestRow>();
  return row ? toRecord(row) : null;
}

export async function requireTest(db: D1Database, teacherId: number, code: string): Promise<TestRecord> {
  const record = await findTest(db, teacherId, code);
  if (!record) throw notFound();
  return record;
}

// The uploads table in one query: every active student of the class, and any
// student who left the class after starting an upload. Sorted by name.
export async function listUploads(db: D1Database, testId: number, classId: number): Promise<UploadRow[]> {
  const { results } = await db
    .prepare(
      `SELECT st.id AS student_id, st.full_name, e.active,
         s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted,
         (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count
       FROM enrollments e
       JOIN students st ON st.id = e.student_id
       LEFT JOIN submissions s ON s.test_id = ? AND s.student_id = e.student_id
       WHERE e.class_id = ? AND (e.active = 1 OR s.id IS NOT NULL)`,
    )
    .bind(testId, classId)
    .all<{
      student_id: number;
      full_name: string;
      active: number;
      submission_id: number | null;
      status: UploadStatus | null;
      started_at: string | null;
      submitted_at: string | null;
      auto_submitted: number | null;
      file_count: number;
    }>();
  return results
    .map((row) => ({
      studentId: row.student_id,
      studentName: row.full_name,
      active: row.active === 1,
      submissionId: row.submission_id,
      status: row.status ?? 'none',
      fileCount: row.file_count,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      autoSubmitted: row.auto_submitted === 1,
    }))
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));
}

const MAX_CODE_TRIES = 3;

// Makes a draft test with the class's next number, for example "6E2-26T3".
// The number and the code are unique, so a test made at the same moment, or a
// class that had this name before a rename, can already hold them: the counter
// then moves past that number and the next try takes a new one. At most 12
// queries.
export async function createTest(db: D1Database, teacherId: number, classId: number, title: string, now: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_CODE_TRIES; attempt++) {
    const cls = await db
      .prepare('SELECT name, school_year, next_test_number, archived FROM classes WHERE id = ? AND teacher_id = ?')
      .bind(classId, teacherId)
      .first<{ name: string; school_year: number; next_test_number: number; archived: number }>();
    if (!cls) throw notFound();
    if (cls.archived === 1) {
      throw new ApiError(409, 'class_archived', 'Clasa este arhivată. Scoate-o din arhivă ca să faci un test nou.');
    }
    const number = cls.next_test_number;
    const code = buildTestCode(cls.name, cls.school_year, number);
    try {
      await db.batch([
        db
          .prepare('INSERT INTO tests (teacher_id, class_id, number, code, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(teacherId, classId, number, code, title, now, now),
        db.prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ?').bind(number + 1, classId, teacherId),
      ]);
      return code;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await db
        .prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ? AND next_test_number <= ?')
        .bind(number + 1, classId, teacherId, number)
        .run();
    }
  }
  throw new ApiError(409, 'busy', 'Nu am putut alege un cod pentru test. Încearcă din nou.');
}

export async function renameTest(db: D1Database, teacherId: number, code: string, title: string, now: string): Promise<boolean> {
  const row = await db
    .prepare('UPDATE tests SET title = ?, updated_at = ? WHERE teacher_id = ? AND code = ? RETURNING id')
    .bind(title, now, teacherId, code)
    .first<{ id: number }>();
  return row !== null;
}

// draft → open, with a new upload link. Null when the test is no longer a draft.
export async function startTest(
  db: D1Database,
  teacherId: number,
  testId: number,
  uploadToken: string,
  now: string,
): Promise<{ uploadToken: string; startedAt: string } | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET status = 'open', upload_token = ?, started_at = ?, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status = 'draft'
       RETURNING upload_token, started_at`,
    )
    .bind(uploadToken, now, now, testId, teacherId)
    .first<{ upload_token: string; started_at: string }>();
  return row ? { uploadToken: row.upload_token, startedAt: row.started_at } : null;
}

// evaluating or done → open (spec §8.5). Graded results stay; a scheduled
// evaluation is cancelled; a ready analysis is marked as possibly out of date.
// False when the test was not closed.
export async function reopenTest(db: D1Database, teacherId: number, testId: number, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET status = 'open', evaluation_at = NULL, updated_at = ?,
         analysis_stale = CASE WHEN analysis_status = 'ready' THEN 1 ELSE analysis_stale END
       WHERE id = ? AND teacher_id = ? AND status IN ('evaluating', 'done')
       RETURNING id`,
    )
    .bind(now, testId, teacherId)
    .first<{ id: number }>();
  return row !== null;
}

// Points the test at a new test or barem file. A new barem also clears the
// exercise list, which the robot made from the old one (spec §8.5).
export async function saveTestFile(
  db: D1Database,
  teacherId: number,
  testId: number,
  kind: TestFileKind,
  file: StoredFile,
  now: string,
): Promise<void> {
  const sql =
    kind === 'test'
      ? 'UPDATE tests SET test_file_key = ?, test_file_name = ?, test_file_type = ?, updated_at = ? WHERE id = ? AND teacher_id = ?'
      : `UPDATE tests SET barem_file_key = ?, barem_file_name = ?, barem_file_type = ?, updated_at = ?,
           exercise_list_status = 'none', exercise_list_json = NULL, exercise_list_message = NULL, exercise_list_attempts = 0
         WHERE id = ? AND teacher_id = ?`;
  await db.prepare(sql).bind(file.key, file.name, file.type, now, testId, teacherId).run();
}

// Every R2 key of a test: its test and barem files and all student files.
export async function listTestKeys(db: D1Database, record: TestRecord): Promise<string[]> {
  const { results } = await db
    .prepare('SELECT f.r2_key FROM submission_files f JOIN submissions s ON s.id = f.submission_id WHERE s.test_id = ?')
    .bind(record.id)
    .all<{ r2_key: string }>();
  const keys = results.map((row) => row.r2_key);
  for (const file of [record.files.test, record.files.barem]) if (file) keys.push(file.key);
  return keys;
}

// Deletes the test row; its uploads and file rows go with it (ON DELETE CASCADE).
export async function deleteTestRow(db: D1Database, teacherId: number, testId: number): Promise<void> {
  await db.prepare('DELETE FROM tests WHERE id = ? AND teacher_id = ?').bind(testId, teacherId).run();
}
```

- [ ] **Step 6: Create `server/db/submissions.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { SubmissionDetail, SubmissionFile, UploadStatus } from '../../shared/api.ts';
import type { StoredFile } from './tests.ts';

interface FileRow {
  id: number;
  r2_key: string;
  original_name: string;
  content_type: string;
  size: number;
  position: number;
}

export interface SubmissionFileRecord extends SubmissionFile {
  key: string;
}

function toFile(row: FileRow): SubmissionFileRecord {
  return { id: row.id, key: row.r2_key, name: row.original_name, contentType: row.content_type, size: row.size, position: row.position };
}

// What the browser sees of a file: no R2 key.
export function publicFile(file: SubmissionFileRecord): SubmissionFile {
  return { id: file.id, name: file.name, contentType: file.contentType, size: file.size, position: file.position };
}

// The files of one upload, in upload order.
export async function listSubmissionFiles(db: D1Database, submissionId: number): Promise<SubmissionFileRecord[]> {
  const { results } = await db
    .prepare('SELECT id, r2_key, original_name, content_type, size, position FROM submission_files WHERE submission_id = ? ORDER BY position, id')
    .bind(submissionId)
    .all<FileRow>();
  return results.map(toFile);
}

// One upload as the teacher sees it, with its files. Null when it is not an
// upload of one of the teacher's tests.
export async function getTeacherSubmission(
  db: D1Database,
  teacherId: number,
  submissionId: number,
): Promise<{ detail: SubmissionDetail; files: SubmissionFileRecord[] } | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.status, s.auto_submitted, s.started_at, s.submitted_at, s.student_id, st.full_name, t.code, t.title
       FROM submissions s
       JOIN tests t ON t.id = s.test_id
       JOIN students st ON st.id = s.student_id
       WHERE s.id = ? AND t.teacher_id = ?`,
    )
    .bind(submissionId, teacherId)
    .first<{
      id: number;
      status: Exclude<UploadStatus, 'none'>;
      auto_submitted: number;
      started_at: string;
      submitted_at: string | null;
      student_id: number;
      full_name: string;
      code: string;
      title: string;
    }>();
  if (!row) return null;
  const files = await listSubmissionFiles(db, row.id);
  return {
    detail: {
      id: row.id,
      testCode: row.code,
      testTitle: row.title,
      studentId: row.student_id,
      studentName: row.full_name,
      status: row.status,
      autoSubmitted: row.auto_submitted === 1,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      files: files.map(publicFile),
    },
    files,
  };
}

// A file of an upload of one of the teacher's tests.
export async function findTeacherFile(db: D1Database, teacherId: number, submissionId: number, fileId: number): Promise<StoredFile | null> {
  const row = await db
    .prepare(
      `SELECT f.r2_key, f.original_name, f.content_type
       FROM submission_files f
       JOIN submissions s ON s.id = f.submission_id
       JOIN tests t ON t.id = s.test_id
       WHERE f.id = ? AND f.submission_id = ? AND t.teacher_id = ?`,
    )
    .bind(fileId, submissionId, teacherId)
    .first<{ r2_key: string; original_name: string; content_type: string }>();
  return row ? { key: row.r2_key, name: row.original_name, type: row.content_type } : null;
}

// Deletes an upload; its file rows go with it (ON DELETE CASCADE).
export async function deleteSubmissionRow(db: D1Database, submissionId: number): Promise<void> {
  await db.prepare('DELETE FROM submissions WHERE id = ?').bind(submissionId).run();
}
```

- [ ] **Step 7: Replace `server/routes/tests.ts`**

```ts
import { Hono } from 'hono';
import { createTestBody, renameTestBody } from '../../shared/api.ts';
import { isTestFileKind, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE, testFileKey, type TestFileKind } from '../../shared/files.ts';
import {
  createTest,
  deleteTestRow,
  listTestKeys,
  listTests,
  listUploads,
  renameTest,
  reopenTest,
  requireTest,
  saveTestFile,
  startTest,
  toTestInfo,
} from '../db/tests.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseSchoolYear, parseTestCode, readJson } from '../http.ts';
import { newUploadToken } from '../secrets.ts';
import { deleteFilesQuietly, fileResponse, readUpload } from '../uploads.ts';

function parseFileKind(raw: string | undefined): TestFileKind {
  if (raw === undefined || !isTestFileKind(raw)) throw notFound();
  return raw;
}

// /api/admin/tests
export function testRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const year = parseSchoolYear(c.req.query('year'));
    return c.json({ tests: await listTests(c.env.DB, c.var.teacher.id, year) });
  });

  routes.post('/', async (c) => {
    const body = await readJson(c, createTestBody);
    const code = await createTest(c.env.DB, c.var.teacher.id, body.classId, body.title, nowIso());
    return c.json({ code }, 201);
  });

  routes.get('/:code', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    return c.json({ test: toTestInfo(test), uploads: await listUploads(c.env.DB, test.id, test.summary.classId) });
  });

  routes.patch('/:code', async (c) => {
    const code = parseTestCode(c.req.param('code'));
    const body = await readJson(c, renameTestBody);
    if (!(await renameTest(c.env.DB, c.var.teacher.id, code, body.title, nowIso()))) throw notFound();
    return c.json({ code, title: body.title });
  });

  // The rows go first, so the test is gone at once; then its files.
  routes.delete('/:code', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const keys = await listTestKeys(c.env.DB, test);
    await deleteTestRow(c.env.DB, c.var.teacher.id, test.id);
    await deleteFilesQuietly(c.env.FILES, keys);
    return c.json({ deleted: true });
  });

  // Start test: draft → open. Students can upload from /u/<uploadToken>.
  routes.post('/:code/start', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const started =
      test.summary.status === 'draft' ? await startTest(c.env.DB, c.var.teacher.id, test.id, newUploadToken(), nowIso()) : null;
    if (!started) throw new ApiError(409, 'already_started', 'Testul a început deja.');
    return c.json({ status: 'open', ...started });
  });

  // Reopen uploads: evaluating or done → open.
  routes.post('/:code/reopen', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (test.summary.status === 'draft') throw new ApiError(409, 'not_started', 'Testul nu a început încă.');
    if (!(await reopenTest(c.env.DB, c.var.teacher.id, test.id, nowIso()))) {
      throw new ApiError(409, 'already_open', 'Încărcarea este deja deschisă.');
    }
    return c.json({ status: 'open' });
  });

  // Upload or replace the test or the barem: PDF or Word, at most 25 MB.
  routes.put('/:code/files/:kind', async (c) => {
    const kind = parseFileKind(c.req.param('kind'));
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    if (test.summary.status === 'evaluating') {
      throw new ApiError(409, 'evaluating', 'Testul se corectează acum. Poți schimba fișierul după ce se termină corectarea.');
    }
    const file = await readUpload(c, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
    const key = testFileKey(teacherId, test.summary.schoolYear, test.summary.code, kind, file.name, file.contentType);
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
    await saveTestFile(c.env.DB, teacherId, test.id, kind, { key, name: file.name, type: file.contentType }, nowIso());
    const old = test.files[kind];
    if (old && old.key !== key) await deleteFilesQuietly(c.env.FILES, [old.key]);
    return c.json({ file: { name: file.name, type: file.contentType } });
  });

  routes.get('/:code/files/:kind', async (c) => {
    const kind = parseFileKind(c.req.param('kind'));
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const stored = test.files[kind];
    const object = stored ? await c.env.FILES.get(stored.key) : null;
    if (!stored || !object) throw notFound();
    return fileResponse(object, stored.name, stored.type);
  });

  return routes;
}
```

- [ ] **Step 8: Create `server/routes/submissions.ts`**

```ts
import { Hono } from 'hono';
import { deleteSubmissionRow, findTeacherFile, getTeacherSubmission } from '../db/submissions.ts';
import type { AppEnv } from '../env.ts';
import { notFound } from '../errors.ts';
import { parseId } from '../http.ts';
import { deleteFilesQuietly, fileResponse } from '../uploads.ts';

// /api/admin/submissions: one student's upload for one test.
export function submissionRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/:id', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    return c.json({ submission: found.detail });
  });

  routes.get('/:id/files/:fileId', async (c) => {
    const file = await findTeacherFile(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), parseId(c.req.param('fileId')));
    const object = file ? await c.env.FILES.get(file.key) : null;
    if (!file || !object) throw notFound();
    return fileResponse(object, file.name, file.type);
  });

  // Deletes the upload and its files, so the student can start again
  // (for example on another phone).
  routes.post('/:id/reset', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    await deleteSubmissionRow(c.env.DB, found.detail.id);
    await deleteFilesQuietly(c.env.FILES, found.files.map((file) => file.key));
    return c.json({ reset: true });
  });

  return routes;
}
```

- [ ] **Step 9: Replace `server/routes/admin.ts`**

```ts
import { Hono } from 'hono';
import { teacherAuth } from '../auth/teacherAuth.ts';
import type { AppEnv } from '../env.ts';
import { sameOriginWrites } from '../http.ts';
import { classRoutes } from './classes.ts';
import { studentRoutes } from './students.ts';
import { submissionRoutes } from './submissions.ts';
import { testRoutes } from './tests.ts';

// /api/admin: everything the teacher app calls. Every route needs a teacher login.
export function adminRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites, teacherAuth());
  routes.get('/me', (c) => c.json({ teacher: c.var.teacher }));
  routes.route('/classes', classRoutes());
  routes.route('/students', studentRoutes());
  routes.route('/tests', testRoutes());
  routes.route('/submissions', submissionRoutes());
  return routes;
}
```

- [ ] **Step 10: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  27 passed (27)`, `Tests  229 passed (229)`.

- [ ] **Step 11: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 12: Commit**

```bash
git add shared/api.ts server
git commit -m "Start and reopen tests, and let the teacher open and reset uploads"
```

---

### Task 7: Student upload API

`/api/u/<token>`: the name list, the device lock, file upload, list, preview, delete, and confirm. No login.

**Files:**
- Create: `server/db/links.ts`, `server/routes/upload.ts`
- Modify: `shared/api.ts`, `server/app.ts`, `server/test/fixtures.ts`
- Test: `server/routes/upload.test.ts`

**Interfaces:**
- Consumes: `readUpload`, `fileResponse`, `deleteFilesQuietly`, `studentFileKey`, `newDeviceSecret`, `sha256Hex`, `randomBase32` (Task 3); `listSubmissionFiles`, `publicFile` (Task 6).
- Produces:
  - `shared/api.ts`: `startSessionBody` (`{ studentId }`), `LinkStudentState`, `LinkStudent`, `LinkInfo`, `UploadSession`, `SessionStart` (`{ secret?, session }`).
  - `server/db/links.ts`: `LinkTest`, `SessionRecord`, `findTestByToken`, `listLinkStudents`, `findActiveStudent`, `findStudentSubmission`, `createSubmission`, `findSession`, `fileSlots`, `addSubmissionFile`, `findSessionFile`, `deleteSessionFile`, `confirmSubmission`.
  - Routes (all under `/api/u/:token`, header `X-Upload-Session` for an upload): `GET /` → `LinkInfo`; `POST /sessions` → 201 `{ secret, session }` or 200 `{ session }`; `GET /files` → `{ session }`; `PUT /files` → 201 `{ file }`; `GET /files/:fileId` (stream); `DELETE /files/:fileId` → `{ deleted: true }`; `POST /confirm` → `{ status: 'submitted', fileCount }`. Errors: 404 `unknown_link`, 409 `closed`, 404 `unknown_student`, 409 `already_submitted`, 409 `other_device`, 401 `no_session`, 409 `too_many_files`, 409 `no_files`.
  - `startTest(api, code): Promise<string>` (the token) in `server/test/fixtures.ts`.

- [ ] **Step 1: Replace `server/test/fixtures.ts`**

```ts
import type { UploadStatus } from '../../shared/api.ts';
import type { TestApi } from './testApi.ts';

// Shortcuts for API tests: classes, students, and tests through the teacher
// API; uploads straight in the database.

export async function makeClass(
  api: TestApi,
  name: string,
  students: string[] = [],
  schoolYear = 2026,
): Promise<{ id: number; studentIds: number[] }> {
  const created = await api.request('POST', '/api/admin/classes', { name, schoolYear });
  if (created.status !== 201) throw new Error(`makeClass ${name}: ${JSON.stringify(created.body)}`);
  const id = created.body.class.id as number;
  if (students.length === 0) return { id, studentIds: [] };
  const added = await api.request('POST', `/api/admin/classes/${id}/students`, { names: students });
  return { id, studentIds: added.body.students.map((s: { id: number }) => s.id) };
}

export async function makeTest(api: TestApi, classId: number, title = 'Test de evaluare'): Promise<string> {
  const res = await api.request('POST', '/api/admin/tests', { classId, title });
  if (res.status !== 201) throw new Error(`makeTest: ${JSON.stringify(res.body)}`);
  return res.body.code as string;
}

export async function testIdOf(api: TestApi, code: string): Promise<number> {
  const row = await api.db.prepare('SELECT id FROM tests WHERE code = ?').bind(code).first<{ id: number }>();
  return row!.id;
}

// An upload row with `files` file rows (keys only; nothing is stored in R2).
export async function addSubmission(
  api: TestApi,
  code: string,
  studentId: number,
  options: { status?: Exclude<UploadStatus, 'none'>; files?: number; startedAt?: string } = {},
): Promise<number> {
  const testId = await testIdOf(api, code);
  const status = options.status ?? 'uploading';
  const row = await api.db
    .prepare('INSERT INTO submissions (test_id, student_id, status, started_at, submitted_at) VALUES (?, ?, ?, ?, ?) RETURNING id')
    .bind(testId, studentId, status, options.startedAt ?? '2026-10-06T08:00:00.000Z', status === 'uploading' ? null : '2026-10-06T08:30:00.000Z')
    .first<{ id: number }>();
  const submissionId = row!.id;
  for (let position = 1; position <= (options.files ?? 0); position++) {
    await api.db
      .prepare(
        `INSERT INTO submission_files (submission_id, r2_key, original_name, content_type, size, position, created_at)
         VALUES (?, ?, ?, 'image/jpeg', 100, ?, '2026-10-06T08:10:00.000Z')`,
      )
      .bind(submissionId, `fixture/${submissionId}/${position}.jpg`, `poza${position}.jpg`, position)
      .run();
  }
  return submissionId;
}

// Start test through the teacher API; returns the upload token of the link.
export async function startTest(api: TestApi, code: string): Promise<string> {
  const res = await api.request('POST', `/api/admin/tests/${code}/start`);
  if (res.status !== 200) throw new Error(`startTest: ${JSON.stringify(res.body)}`);
  return res.body.uploadToken as string;
}

// A test, class, and student that belong to another teacher.
export async function otherTeacherTest(api: TestApi, email = 'alt.profesor@example.com'): Promise<{ code: string; studentId: number }> {
  const teacherId = await api.addTeacher(email, 'Alt Profesor');
  const cls = await api.db
    .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, '9Z', 2026, '2026-10-06') RETURNING id")
    .bind(teacherId)
    .first<{ id: number }>();
  const student = await api.db
    .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Elev Străin', '2026-10-06') RETURNING id")
    .bind(teacherId)
    .first<{ id: number }>();
  await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(cls!.id, student!.id).run();
  await api.db
    .prepare(
      `INSERT INTO tests (teacher_id, class_id, number, code, title, status, upload_token, created_at, updated_at)
       VALUES (?, ?, 1, '9Z-26T1', 'Test străin', 'open', 'zzzzzzzzzzzzzzzz', '2026-10-06', '2026-10-06')`,
    )
    .bind(teacherId, cls!.id)
    .run();
  return { code: '9Z-26T1', studentId: student!.id };
}
```

- [ ] **Step 2: Create `server/routes/upload.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
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
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(code).run();
    const res = await api.request('GET', `/api/u/${token}`);
    expect(res.body).toEqual({ test: { code, title: 'Fracții', className: '6E2', status: 'evaluating' }, students: [] });
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
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run server/routes/upload.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  21 failed | 1 passed (22)`. `/api/u` does not exist yet: every call gets the generic 404. Only the `Cache-Control` check passes.

- [ ] **Step 4: Replace `shared/api.ts`**

```ts
import { z } from 'zod';
import { normalizeClassName } from './classes.ts';
import type { TestFileKind } from './files.ts';
import { isValidSchoolYear } from './schoolYear.ts';
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST } from './students.ts';
import { cleanTitle, MAX_TITLE_LENGTH, type TestStatus } from './tests.ts';

// Request bodies of the teacher API. The server parses every body with these
// schemas; the browser uses the inferred types.

export const schoolYearSchema = z
  .number()
  .refine(isValidSchoolYear, { message: 'Anul școlar nu este valid.' });

export const classNameSchema = z.string().transform((raw, ctx) => {
  const name = normalizeClassName(raw);
  if (name === null) {
    ctx.addIssue({ code: 'custom', message: 'Numele clasei are 1-8 litere și cifre, de exemplu 6E2.' });
    return z.NEVER;
  }
  return name;
});

export const studentNameSchema = z
  .string()
  .transform(cleanStudentName)
  .pipe(
    z
      .string()
      .min(1, { message: 'Numele elevului lipsește.' })
      .max(MAX_NAME_LENGTH, { message: `Numele unui elev are cel mult ${MAX_NAME_LENGTH} de caractere.` }),
  );

export const createClassBody = z.object({
  name: classNameSchema,
  schoolYear: schoolYearSchema,
});

export const updateClassBody = z
  .object({
    name: classNameSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => body.name !== undefined || body.archived !== undefined, {
    message: 'Nu ai schimbat nimic.',
  });

export const addStudentsBody = z.object({
  names: z
    .array(studentNameSchema)
    .min(1, { message: 'Scrie cel puțin un nume.' })
    .max(MAX_NAMES_PER_REQUEST, { message: `Adaugă cel mult ${MAX_NAMES_PER_REQUEST} de nume odată.` }),
});

export const setEnrollmentBody = z.object({ active: z.boolean() });

export const renameStudentBody = z.object({ fullName: studentNameSchema });

export const testTitleSchema = z
  .string()
  .transform(cleanTitle)
  .pipe(
    z
      .string()
      .min(1, { message: 'Scrie titlul testului.' })
      .max(MAX_TITLE_LENGTH, { message: `Titlul are cel mult ${MAX_TITLE_LENGTH} de caractere.` }),
  );

export const createTestBody = z.object({
  classId: z.number({ message: 'Alege clasa.' }).int({ message: 'Alege clasa.' }).positive({ message: 'Alege clasa.' }),
  title: testTitleSchema,
});

export const renameTestBody = z.object({ title: testTitleSchema });

// The student app: start or resume an upload for one student of the class.
export const startSessionBody = z.object({
  studentId: z
    .number({ message: 'Alege-ți numele din listă.' })
    .int({ message: 'Alege-ți numele din listă.' })
    .positive({ message: 'Alege-ți numele din listă.' }),
});

export type CreateClassInput = z.input<typeof createClassBody>;
export type UpdateClassInput = z.input<typeof updateClassBody>;
export type CreateTestInput = z.input<typeof createTestBody>;

// Response shapes of the teacher API.

export interface Teacher {
  id: number;
  email: string;
  name: string;
}

export interface ClassSummary {
  id: number;
  name: string;
  schoolYear: number;
  archived: boolean;
  studentCount: number;
}

export interface StudentRow {
  id: number;
  fullName: string;
  active: boolean;
}

export interface ClassDetail {
  class: ClassSummary;
  students: StudentRow[];
  tests: TestSummary[];
}

export interface TestSummary {
  code: string;
  title: string;
  status: TestStatus;
  classId: number;
  className: string;
  schoolYear: number;
  createdAt: string;
  // When Start test opened the uploads: the "date and hour" of the test.
  startedAt: string | null;
  // Active students of the class, and uploads that were sent (confirmed or included).
  studentCount: number;
  submittedCount: number;
}

export interface TestFileInfo {
  name: string;
  type: string;
}

export interface TestInfo extends TestSummary {
  uploadToken: string | null;
  files: Record<TestFileKind, TestFileInfo | null>;
}

// "none": the student has not started an upload.
export type UploadStatus = 'none' | 'uploading' | 'submitted' | 'grading' | 'graded' | 'failed';

// One row of the uploads table: an active student of the class, or a student
// who left the class after starting an upload.
export interface UploadRow {
  studentId: number;
  studentName: string;
  active: boolean;
  submissionId: number | null;
  status: UploadStatus;
  fileCount: number;
  startedAt: string | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
}

export interface TestDetail {
  test: TestInfo;
  uploads: UploadRow[];
}

// Start test: the link is /u/<uploadToken>.
export interface StartedTest {
  status: TestStatus;
  uploadToken: string;
  startedAt: string;
}

// One uploaded page or PDF, in upload order.
export interface SubmissionFile {
  id: number;
  name: string;
  contentType: string;
  size: number;
  position: number;
}

// Response shapes of the student API (/api/u/<token>).

// "done": the student already sent the upload and cannot pick the name again.
export type LinkStudentState = 'none' | 'in_progress' | 'done';

export interface LinkStudent {
  id: number;
  name: string;
  state: LinkStudentState;
}

// The page behind an upload link. The name list is empty unless uploads are open.
export interface LinkInfo {
  test: { code: string; title: string; className: string; status: TestStatus };
  students: LinkStudent[];
}

// One student's upload, as that student's phone sees it.
export interface UploadSession {
  submissionId: number;
  studentId: number;
  studentName: string;
  status: Exclude<UploadStatus, 'none'>;
  files: SubmissionFile[];
}

// POST /sessions: `secret` comes only with a new upload; the phone keeps it
// and sends it as X-Upload-Session on every later call.
export interface SessionStart {
  secret?: string;
  session: UploadSession;
}

export interface SubmissionDetail {
  id: number;
  testCode: string;
  testTitle: string;
  studentId: number;
  studentName: string;
  status: Exclude<UploadStatus, 'none'>;
  autoSubmitted: boolean;
  startedAt: string;
  submittedAt: string | null;
  files: SubmissionFile[];
}
```

- [ ] **Step 5: Create `server/db/links.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { LinkStudent, LinkStudentState, UploadStatus } from '../../shared/api.ts';
import { compareStudentNames } from '../../shared/students.ts';
import type { TestStatus } from '../../shared/tests.ts';
import type { StoredFile } from './tests.ts';

// Queries of the student app. Every one is scoped by the test that the
// upload link names, or by the upload that the phone's secret names.

export interface LinkTest {
  id: number;
  teacherId: number;
  classId: number;
  code: string;
  title: string;
  status: TestStatus;
  className: string;
  schoolYear: number;
}

// An upload, found by the hash of the phone's secret.
export interface SessionRecord {
  submissionId: number;
  studentId: number;
  studentName: string;
  status: Exclude<UploadStatus, 'none'>;
}

export async function findTestByToken(db: D1Database, token: string): Promise<LinkTest | null> {
  const row = await db
    .prepare(
      `SELECT t.id, t.teacher_id, t.class_id, t.code, t.title, t.status, c.name AS class_name, c.school_year
       FROM tests t JOIN classes c ON c.id = t.class_id
       WHERE t.upload_token = ?`,
    )
    .bind(token)
    .first<{
      id: number;
      teacher_id: number;
      class_id: number;
      code: string;
      title: string;
      status: TestStatus;
      class_name: string;
      school_year: number;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    teacherId: row.teacher_id,
    classId: row.class_id,
    code: row.code,
    title: row.title,
    status: row.status,
    className: row.class_name,
    schoolYear: row.school_year,
  };
}

// The active students of the class with the state of their upload, by name.
export async function listLinkStudents(db: D1Database, test: LinkTest): Promise<LinkStudent[]> {
  const { results } = await db
    .prepare(
      `SELECT st.id, st.full_name, s.status
       FROM enrollments e
       JOIN students st ON st.id = e.student_id
       LEFT JOIN submissions s ON s.test_id = ? AND s.student_id = st.id
       WHERE e.class_id = ? AND e.active = 1`,
    )
    .bind(test.id, test.classId)
    .all<{ id: number; full_name: string; status: UploadStatus | null }>();
  const stateOf = (status: UploadStatus | null): LinkStudentState =>
    status === null ? 'none' : status === 'uploading' ? 'in_progress' : 'done';
  return results
    .map((row) => ({ id: row.id, name: row.full_name, state: stateOf(row.status) }))
    .sort((a, b) => compareStudentNames(a.name, b.name));
}

// A student of the test's class who has not left it.
export async function findActiveStudent(db: D1Database, test: LinkTest, studentId: number): Promise<{ id: number; fullName: string } | null> {
  const row = await db
    .prepare(
      `SELECT st.id, st.full_name FROM enrollments e JOIN students st ON st.id = e.student_id
       WHERE e.class_id = ? AND e.student_id = ? AND e.active = 1`,
    )
    .bind(test.classId, studentId)
    .first<{ id: number; full_name: string }>();
  return row ? { id: row.id, fullName: row.full_name } : null;
}

export async function findStudentSubmission(
  db: D1Database,
  testId: number,
  studentId: number,
): Promise<{ id: number; status: Exclude<UploadStatus, 'none'>; sessionHash: string | null } | null> {
  const row = await db
    .prepare('SELECT id, status, session_hash FROM submissions WHERE test_id = ? AND student_id = ?')
    .bind(testId, studentId)
    .first<{ id: number; status: Exclude<UploadStatus, 'none'>; session_hash: string | null }>();
  return row ? { id: row.id, status: row.status, sessionHash: row.session_hash } : null;
}

// Returns the new upload's id. Throws a UNIQUE error when another phone
// started this student's upload first.
export async function createSubmission(db: D1Database, testId: number, studentId: number, sessionHash: string, now: string): Promise<number> {
  const row = await db
    .prepare("INSERT INTO submissions (test_id, student_id, status, session_hash, started_at) VALUES (?, ?, 'uploading', ?, ?) RETURNING id")
    .bind(testId, studentId, sessionHash, now)
    .first<{ id: number }>();
  return row!.id;
}

export async function findSession(db: D1Database, testId: number, sessionHash: string): Promise<SessionRecord | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.student_id, s.status, st.full_name
       FROM submissions s JOIN students st ON st.id = s.student_id
       WHERE s.test_id = ? AND s.session_hash = ?`,
    )
    .bind(testId, sessionHash)
    .first<{ id: number; student_id: number; status: Exclude<UploadStatus, 'none'>; full_name: string }>();
  return row ? { submissionId: row.id, studentId: row.student_id, studentName: row.full_name, status: row.status } : null;
}

// How many files the upload has, and the position of the next one.
export async function fileSlots(db: D1Database, submissionId: number): Promise<{ count: number; next: number }> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count, COALESCE(MAX(position), 0) + 1 AS next FROM submission_files WHERE submission_id = ?')
    .bind(submissionId)
    .first<{ count: number; next: number }>();
  return { count: row?.count ?? 0, next: row?.next ?? 1 };
}

export async function addSubmissionFile(
  db: D1Database,
  submissionId: number,
  file: StoredFile & { size: number; position: number },
  now: string,
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO submission_files (submission_id, r2_key, original_name, content_type, size, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(submissionId, file.key, file.name, file.type, file.size, file.position, now)
    .first<{ id: number }>();
  return row!.id;
}

export async function findSessionFile(db: D1Database, submissionId: number, fileId: number): Promise<StoredFile | null> {
  const row = await db
    .prepare('SELECT r2_key, original_name, content_type FROM submission_files WHERE id = ? AND submission_id = ?')
    .bind(fileId, submissionId)
    .first<{ r2_key: string; original_name: string; content_type: string }>();
  return row ? { key: row.r2_key, name: row.original_name, type: row.content_type } : null;
}

export async function deleteSessionFile(db: D1Database, submissionId: number, fileId: number): Promise<void> {
  await db.prepare('DELETE FROM submission_files WHERE id = ? AND submission_id = ?').bind(fileId, submissionId).run();
}

// uploading → submitted. False when the upload was already sent.
export async function confirmSubmission(db: D1Database, submissionId: number, now: string): Promise<boolean> {
  const row = await db
    .prepare("UPDATE submissions SET status = 'submitted', submitted_at = ? WHERE id = ? AND status = 'uploading' RETURNING id")
    .bind(now, submissionId)
    .first<{ id: number }>();
  return row !== null;
}
```

- [ ] **Step 6: Create `server/routes/upload.ts`**

```ts
import type { Context } from 'hono';
import { Hono } from 'hono';
import { startSessionBody, type UploadSession } from '../../shared/api.ts';
import { MAX_STUDENT_FILES, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE, studentFileKey } from '../../shared/files.ts';
import { isUploadToken } from '../../shared/tests.ts';
import {
  addSubmissionFile,
  confirmSubmission,
  createSubmission,
  deleteSessionFile,
  fileSlots,
  findActiveStudent,
  findSession,
  findSessionFile,
  findStudentSubmission,
  findTestByToken,
  listLinkStudents,
  type LinkTest,
  type SessionRecord,
} from '../db/links.ts';
import { listSubmissionFiles, publicFile } from '../db/submissions.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, isUniqueViolation } from '../errors.ts';
import { nowIso, parseId, readJson, sameOriginWrites } from '../http.ts';
import { newDeviceSecret, randomBase32, sha256Hex } from '../secrets.ts';
import { deleteFilesQuietly, fileResponse, readUpload } from '../uploads.ts';

const SESSION_HEADER = 'X-Upload-Session';

const unknownLink = () => new ApiError(404, 'unknown_link', 'Link greșit. Cere profesorului linkul nou.');
const closed = () => new ApiError(409, 'closed', 'Încărcarea s-a închis.');
const alreadySent = () => new ApiError(409, 'already_submitted', 'Lucrarea ta a fost deja trimisă.');
const otherDevice = () =>
  new ApiError(409, 'other_device', 'Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.');

// The test behind the link in the URL.
async function linkTest(c: Context<AppEnv>): Promise<LinkTest> {
  const token = c.req.param('token') ?? '';
  const test = isUploadToken(token) ? await findTestByToken(c.env.DB, token) : null;
  if (!test) throw unknownLink();
  return test;
}

// The upload that this phone's secret belongs to, in this test only.
async function session(c: Context<AppEnv>, test: LinkTest): Promise<SessionRecord> {
  const secret = c.req.header(SESSION_HEADER);
  const found = secret ? await findSession(c.env.DB, test.id, await sha256Hex(secret)) : null;
  if (!found) throw new ApiError(401, 'no_session', 'Încărcarea nu mai este valabilă. Alege-ți din nou numele.');
  return found;
}

// A change to an upload: the uploads must be open and the upload not yet sent.
async function openSession(c: Context<AppEnv>): Promise<{ test: LinkTest; current: SessionRecord }> {
  const test = await linkTest(c);
  if (test.status !== 'open') throw closed();
  const current = await session(c, test);
  if (current.status !== 'uploading') throw alreadySent();
  return { test, current };
}

async function sessionView(c: Context<AppEnv>, current: SessionRecord): Promise<UploadSession> {
  const files = await listSubmissionFiles(c.env.DB, current.submissionId);
  return { ...current, files: files.map(publicFile) };
}

// /api/u/<token>: the student app. No login: the token in the link is the key
// to one test, and a secret kept on the phone is the key to one upload.
export function uploadRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites);

  routes.get('/:token', async (c) => {
    const test = await linkTest(c);
    return c.json({
      test: { code: test.code, title: test.title, className: test.className, status: test.status },
      students: test.status === 'open' ? await listLinkStudents(c.env.DB, test) : [],
    });
  });

  // Start an upload for a student, or go on with it on the same phone.
  routes.post('/:token/sessions', async (c) => {
    const test = await linkTest(c);
    if (test.status !== 'open') throw closed();
    const { studentId } = await readJson(c, startSessionBody);
    const student = await findActiveStudent(c.env.DB, test, studentId);
    if (!student) throw new ApiError(404, 'unknown_student', 'Nu am găsit numele tău în listă.');

    const existing = await findStudentSubmission(c.env.DB, test.id, studentId);
    if (existing) {
      if (existing.status !== 'uploading') throw alreadySent();
      const secret = c.req.header(SESSION_HEADER);
      if (!secret || existing.sessionHash !== (await sha256Hex(secret))) throw otherDevice();
      const resumed = { submissionId: existing.id, studentId, studentName: student.fullName, status: existing.status };
      return c.json({ session: await sessionView(c, resumed) });
    }

    const secret = newDeviceSecret();
    let submissionId: number;
    try {
      submissionId = await createSubmission(c.env.DB, test.id, studentId, await sha256Hex(secret), nowIso());
    } catch (err) {
      if (isUniqueViolation(err)) throw otherDevice();
      throw err;
    }
    const created: UploadSession = { submissionId, studentId, studentName: student.fullName, status: 'uploading', files: [] };
    return c.json({ secret, session: created }, 201);
  });

  routes.get('/:token/files', async (c) => {
    const test = await linkTest(c);
    return c.json({ session: await sessionView(c, await session(c, test)) });
  });

  // One photo or PDF per request, at most 20 per student.
  routes.put('/:token/files', async (c) => {
    const { test, current } = await openSession(c);
    const slots = await fileSlots(c.env.DB, current.submissionId);
    if (slots.count >= MAX_STUDENT_FILES) {
      throw new ApiError(409, 'too_many_files', `Poți trimite cel mult ${MAX_STUDENT_FILES} de fișiere.`);
    }
    const file = await readUpload(c, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE);
    const key = studentFileKey(
      test.teacherId,
      test.schoolYear,
      test.code,
      current.studentId,
      current.studentName,
      slots.next,
      randomBase32(8),
      file.contentType,
    );
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
    const stored = { key, name: file.name, type: file.contentType, size: file.bytes.byteLength, position: slots.next };
    let id: number;
    try {
      id = await addSubmissionFile(c.env.DB, current.submissionId, stored, nowIso());
    } catch (err) {
      await deleteFilesQuietly(c.env.FILES, [key]);
      throw err;
    }
    return c.json({ file: { id, name: stored.name, contentType: stored.type, size: stored.size, position: stored.position } }, 201);
  });

  routes.get('/:token/files/:fileId', async (c) => {
    const test = await linkTest(c);
    const current = await session(c, test);
    const file = await findSessionFile(c.env.DB, current.submissionId, parseId(c.req.param('fileId')));
    const object = file ? await c.env.FILES.get(file.key) : null;
    if (!file || !object) throw new ApiError(404, 'not_found', 'Nu am găsit fișierul.');
    return fileResponse(object, file.name, file.type);
  });

  routes.delete('/:token/files/:fileId', async (c) => {
    const { current } = await openSession(c);
    const fileId = parseId(c.req.param('fileId'));
    const file = await findSessionFile(c.env.DB, current.submissionId, fileId);
    if (!file) throw new ApiError(404, 'not_found', 'Nu am găsit fișierul.');
    await deleteSessionFile(c.env.DB, current.submissionId, fileId);
    await deleteFilesQuietly(c.env.FILES, [file.key]);
    return c.json({ deleted: true });
  });

  // "Am trimis tot": uploading → submitted. Needs at least one file.
  routes.post('/:token/confirm', async (c) => {
    const { current } = await openSession(c);
    const { count } = await fileSlots(c.env.DB, current.submissionId);
    if (count === 0) throw new ApiError(409, 'no_files', 'Adaugă cel puțin o poză sau un PDF.');
    if (!(await confirmSubmission(c.env.DB, current.submissionId, nowIso()))) throw alreadySent();
    return c.json({ status: 'submitted', fileCount: count });
  });

  return routes;
}
```

- [ ] **Step 7: Replace `server/app.ts`**

```ts
import { Hono } from 'hono';
import type { AppEnv } from './env.ts';
import { ApiError } from './errors.ts';
import { adminRoutes } from './routes/admin.ts';
import { uploadRoutes } from './routes/upload.ts';

// The whole API. functions/api/[[route]].ts serves it on Cloudflare Pages.
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>().basePath('/api');

  // public/_headers does not reach Function responses, so the API sets its own:
  // browsers must not guess content types, and nothing private is cached.
  // A route that sets its own Cache-Control keeps it.
  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
  });

  app.route('/admin', adminRoutes());
  app.route('/u', uploadRoutes());

  app.notFound((c) => c.json({ error: 'not_found', message: 'Nu am găsit ce cauți.' }, 404));
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.code, message: err.message }, err.status);
    console.error('API error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: 'internal', message: 'A apărut o eroare. Încearcă din nou.' }, 500);
  });
  return app;
}

export const app = createApp();
```

- [ ] **Step 8: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  28 passed (28)`, `Tests  251 passed (251)`.

- [ ] **Step 9: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add shared/api.ts server
git commit -m "Add the student upload API"
```

---

### Task 8: Tests list and new-test page

The teacher app's start page becomes "Teste"; "Test nou" creates a test with optional files; the class page lists its tests. The API client and the fake get every test and upload call.

**Files:**
- Create: `src/admin/StatusChip.tsx`, `src/admin/TestFileInput.tsx`, `src/admin/pages/TestsPage.tsx`, `src/admin/pages/NewTestPage.tsx`
- Modify: `src/admin/api.ts`, `src/admin/ErrorMessage.tsx`, `src/admin/AppRoutes.tsx`, `src/admin/Layout.tsx`, `src/admin/pages/ClassPage.tsx`, `src/admin/pages/NotFoundPage.tsx`, `src/ui/format.ts`, `src/ui/brand.css`, `src/test/fakeApi.ts`, `src/test/renderAdmin.tsx`
- Test: `src/admin/pages/TestsPage.test.tsx`, `src/admin/pages/NewTestPage.test.tsx` (new); `src/admin/api.test.ts`, `src/admin/pages/ClassPage.test.tsx`, `src/admin/pages/ClassesPage.test.tsx`, `src/ui/format.test.ts` (modified)

**Interfaces:**
- Consumes: the Task 4–6 routes and types; `uploadTypeOf`, `fileProblem` (Task 3).
- Produces:
  - `AdminApi` gains `listTests`, `createTest` (returns the code), `getTest`, `renameTest`, `deleteTest`, `uploadTestFile(code, kind, file)`, `startTest`, `reopenTest`, `getSubmission`, `resetSubmission`; plus `testFileUrl(code, kind)` and `submissionFileUrl(submissionId, fileId)`.
  - `src/ui/format.ts`: `testStatusLabel`, `uploadStatusLabel`, `formatDateTime(iso)`, `formatFileSize(bytes)`.
  - `errorText(error): string` in `src/admin/ErrorMessage.tsx`; `StatusChip({ status })`; `TestFileInput({ id, label, onPick, disabled? })`.
  - Fake: `FakeData.tests?: TestDetail[]`, `FakeData.submissions?: SubmissionDetail[]`, `fakeTest(overrides?, uploads?)`, `fakeUpload(overrides)`, `FAKE_TOKEN`, `FAKE_STARTED_AT`.
  - `LocationProbe` and `expectLocation(expected)` in `src/test/renderAdmin.tsx` (a navigation shows in the probe; `expectLocation` waits for it).
  - Routes: `/` → `TestsPage`, `/teste/nou` → `NewTestPage` (reads `?clasa=<id>`). After creating, the page navigates to `/teste/<code>`, with `state.notice` when a file failed; Task 9 adds that page.

- [ ] **Step 1: Replace `src/test/fakeApi.ts`**

```ts
import { vi } from 'vitest';
import type {
  ClassSummary,
  StudentRow,
  SubmissionDetail,
  TestDetail,
  TestInfo,
  TestSummary,
  UploadRow,
} from '../../shared/api.ts';
import { normalizeClassName } from '../../shared/classes.ts';
import { uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
import { buildTestCode } from '../../shared/tests.ts';
import { ApiError, type AdminApi } from '../admin/api.ts';

// An in-memory AdminApi for page tests. Every method is a vi.fn, so tests can
// check calls or replace one answer with mockRejectedValueOnce.
export interface FakeData {
  classes: ClassSummary[];
  students: Record<number, StudentRow[]>;
  tests?: TestDetail[];
  submissions?: SubmissionDetail[];
}

export const FAKE_TOKEN = 'abcdefghijkmnop2';
export const FAKE_STARTED_AT = '2026-10-06T07:15:00.000Z';

const notFound = () => new ApiError(404, 'not_found', 'Nu am găsit ce cauți.');

function summaryOf(test: TestInfo): TestSummary {
  const { uploadToken: _token, files: _files, ...summary } = test;
  return summary;
}

// A test as the API returns it, for building fake data in tests.
export function fakeTest(overrides: Partial<TestInfo> = {}, uploads: UploadRow[] = []): TestDetail {
  return {
    test: {
      code: '6E2-26T1',
      title: 'Fracții',
      status: 'draft',
      classId: 1,
      className: '6E2',
      schoolYear: 2026,
      createdAt: '2026-10-05T08:00:00.000Z',
      startedAt: null,
      studentCount: uploads.filter((row) => row.active).length,
      submittedCount: uploads.filter((row) => row.status !== 'none' && row.status !== 'uploading').length,
      uploadToken: null,
      files: { test: null, barem: null },
      ...overrides,
    },
    uploads,
  };
}

// One row of the uploads table, for building fake data in tests.
export function fakeUpload(overrides: Partial<UploadRow> & Pick<UploadRow, 'studentId' | 'studentName'>): UploadRow {
  return {
    active: true,
    submissionId: null,
    status: 'none',
    fileCount: 0,
    startedAt: null,
    submittedAt: null,
    autoSubmitted: false,
    ...overrides,
  };
}

export function createFakeApi(data: FakeData = { classes: [], students: {} }) {
  let nextId = 1000;
  const tests = (data.tests ??= []);
  const submissions = (data.submissions ??= []);
  const countActive = (classId: number) => (data.students[classId] ?? []).filter((s) => s.active).length;
  const findTest = (code: string) => {
    const found = tests.find((t) => t.test.code === code);
    if (!found) throw notFound();
    return found;
  };

  const api = {
    me: vi.fn(async () => ({ id: 1, email: 'profesor@example.com', name: 'Laura Miron' })),
    listClasses: vi.fn(async (schoolYear: number) =>
      data.classes.filter((c) => c.schoolYear === schoolYear).map((c) => ({ ...c, studentCount: countActive(c.id) })),
    ),
    createClass: vi.fn(async (input: { name: string; schoolYear: number }) => {
      const name = normalizeClassName(input.name);
      if (!name) throw new ApiError(400, 'invalid', 'Numele clasei are 1-8 litere și cifre, de exemplu 6E2.');
      const created: ClassSummary = { id: nextId++, name, schoolYear: input.schoolYear, archived: false, studentCount: 0 };
      data.classes.push(created);
      return created;
    }),
    getClass: vi.fn(async (classId: number) => {
      const found = data.classes.find((c) => c.id === classId);
      if (!found) throw notFound();
      return {
        class: { ...found, studentCount: countActive(classId) },
        students: [...(data.students[classId] ?? [])],
        tests: tests.filter((t) => t.test.classId === classId).map((t) => summaryOf(t.test)),
      };
    }),
    updateClass: vi.fn(async (classId: number, input: { name?: string; archived?: boolean }) => {
      const found = data.classes.find((c) => c.id === classId)!;
      if (input.name !== undefined) found.name = normalizeClassName(input.name) ?? found.name;
      if (input.archived !== undefined) found.archived = input.archived;
      return { ...found };
    }),
    addStudents: vi.fn(async (classId: number, names: string[]) => {
      const added = names.map((fullName) => ({ id: nextId++, fullName, active: true }));
      data.students[classId] = [...(data.students[classId] ?? []), ...added];
      return added;
    }),
    setStudentActive: vi.fn(async (classId: number, studentId: number, active: boolean) => {
      const student = data.students[classId]!.find((s) => s.id === studentId)!;
      student.active = active;
      return { ...student };
    }),
    renameStudent: vi.fn(async (studentId: number, fullName: string) => {
      for (const list of Object.values(data.students)) {
        const student = list.find((s) => s.id === studentId);
        if (student) student.fullName = fullName;
      }
      return { id: studentId, fullName };
    }),
    listTests: vi.fn(async (schoolYear: number) =>
      tests.filter((t) => t.test.schoolYear === schoolYear).map((t) => summaryOf(t.test)),
    ),
    createTest: vi.fn(async (input: { classId: number; title: string }) => {
      const cls = data.classes.find((c) => c.id === input.classId);
      if (!cls) throw notFound();
      const number = tests.filter((t) => t.test.classId === cls.id).length + 1;
      const students = (data.students[cls.id] ?? []).filter((s) => s.active);
      const uploads = students.map((s) => fakeUpload({ studentId: s.id, studentName: s.fullName }));
      const created = fakeTest(
        { code: buildTestCode(cls.name, cls.schoolYear, number), title: input.title, classId: cls.id, className: cls.name, schoolYear: cls.schoolYear },
        uploads,
      );
      tests.unshift(created);
      return created.test.code;
    }),
    getTest: vi.fn(async (code: string) => structuredClone(findTest(code))),
    renameTest: vi.fn(async (code: string, title: string) => {
      findTest(code).test.title = title;
      return { code, title };
    }),
    deleteTest: vi.fn(async (code: string) => {
      tests.splice(tests.indexOf(findTest(code)), 1);
    }),
    uploadTestFile: vi.fn(async (code: string, kind: TestFileKind, file: File) => {
      const info = { name: file.name, type: uploadTypeOf(file) };
      findTest(code).test.files[kind] = info;
      return info;
    }),
    startTest: vi.fn(async (code: string) => {
      const found = findTest(code).test;
      Object.assign(found, { status: 'open', uploadToken: FAKE_TOKEN, startedAt: FAKE_STARTED_AT });
      return { status: found.status, uploadToken: FAKE_TOKEN, startedAt: FAKE_STARTED_AT };
    }),
    reopenTest: vi.fn(async (code: string) => {
      findTest(code).test.status = 'open';
    }),
    getSubmission: vi.fn(async (submissionId: number) => {
      const found = submissions.find((s) => s.id === submissionId);
      if (!found) throw notFound();
      return structuredClone(found);
    }),
    resetSubmission: vi.fn(async (submissionId: number) => {
      for (const detail of tests) {
        const row = detail.uploads.find((u) => u.submissionId === submissionId);
        if (row) Object.assign(row, { submissionId: null, status: 'none', fileCount: 0, startedAt: null, submittedAt: null });
      }
      const index = submissions.findIndex((s) => s.id === submissionId);
      if (index >= 0) submissions.splice(index, 1);
    }),
  } satisfies AdminApi;
  return api;
}

export type FakeApi = ReturnType<typeof createFakeApi>;
```

- [ ] **Step 2: Replace `src/test/renderAdmin.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { expect } from 'vitest';
import { ApiProvider } from '../admin/ApiContext.tsx';
import type { AdminApi } from '../admin/api.ts';
import { AppRoutes } from '../admin/AppRoutes.tsx';
import { SchoolYearProvider } from '../admin/SchoolYearContext.tsx';

// Shows where the app is, for tests that check a navigation: the path, and
// the notice that a page passed along in the navigation state.
export function LocationProbe() {
  const location = useLocation();
  const state = location.state as { notice?: string } | null;
  return (
    <p data-testid="location">
      {location.pathname}
      {location.search}
      {state?.notice ? ` | ${state.notice}` : ''}
    </p>
  );
}

// Waits until the LocationProbe shows the expected place. A navigation runs
// after the API answer, so a single immediate check could look too early.
export async function expectLocation(expected: string | RegExp): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(expected));
}

// Renders the teacher app at a path (without the /admin basename), with a fake
// API and school year 2026-2027. `extra` is drawn inside the router, above the
// pages; tests use it for a button that navigates.
export function renderAdmin(path: string, api: AdminApi, extra?: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <SchoolYearProvider initialYear={2026}>
          <MemoryRouter initialEntries={[path]}>
            {extra}
            <AppRoutes />
          </MemoryRouter>
        </SchoolYearProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
}
```

- [ ] **Step 3: Replace `src/admin/api.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCX_TYPE } from '../../shared/files.ts';
import { ApiError, createApiClient, LoginExpiredError, reloadForLogin, submissionFileUrl, testFileUrl } from './api.ts';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('createApiClient', () => {
  it('asks for the classes of a school year and returns them', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { classes: [{ id: 1, name: '6E2' }] }));
    const api = createApiClient({ fetchImpl });
    expect(await api.listClasses(2026)).toEqual([{ id: 1, name: '6E2' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/admin/classes?year=2026',
      expect.objectContaining({ method: 'GET', redirect: 'manual', credentials: 'same-origin' }),
    );
  });

  it('sends JSON bodies', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(201, { class: { id: 2, name: '7E2' } }),
    );
    const api = createApiClient({ fetchImpl });
    await api.createClass({ name: '7e2', schoolYear: 2026 });
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: '7e2', schoolYear: 2026 }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('turns an error answer into an ApiError with the server message', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(409, { error: 'class_exists', message: 'Clasa 6E2 există deja în anul școlar 2026-2027.' }),
    );
    const api = createApiClient({ fetchImpl });
    const error = await api.createClass({ name: '6E2', schoolYear: 2026 }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'class_exists', message: 'Clasa 6E2 există deja în anul școlar 2026-2027.' });
  });

  it('reloads for a new login when Access redirects', async () => {
    const redirect = { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() } as Response;
    const onLoginExpired = vi.fn();
    const api = createApiClient({ fetchImpl: vi.fn(async () => redirect), onLoginExpired });
    await expect(api.me()).rejects.toBeInstanceOf(LoginExpiredError);
    expect(onLoginExpired).toHaveBeenCalledTimes(1);
  });

  it('reports a non-JSON server error without reloading', async () => {
    const onLoginExpired = vi.fn();
    const fetchImpl = vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    const api = createApiClient({ fetchImpl, onLoginExpired });
    await expect(api.me()).rejects.toMatchObject({ code: 'bad_response' });
    expect(onLoginExpired).not.toHaveBeenCalled();
  });
});

describe('createApiClient tests and uploads', () => {
  it('sends a test file raw, with its type and its encoded name', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { file: { name: 'Barem ș.docx', type: DOCX_TYPE } }),
    );
    const api = createApiClient({ fetchImpl });
    // A .docx on a PC without Word: the browser gives no type.
    const file = new File(['PK'], 'Barem ș.docx', { type: '' });
    expect(await api.uploadTestFile('6E2-26T1', 'barem', file)).toEqual({ name: 'Barem ș.docx', type: DOCX_TYPE });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/admin/tests/6E2-26T1/files/barem');
    expect(init!.method).toBe('PUT');
    expect(init!.body).toBe(file);
    expect(init!.headers).toMatchObject({ 'Content-Type': DOCX_TYPE, 'X-File-Name': 'Barem%20%C8%99.docx' });
  });

  it('calls the test and upload routes', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { tests: [], code: 'X' }));
    const api = createApiClient({ fetchImpl });
    await api.listTests(2026);
    await api.createTest({ classId: 1, title: 'Test' });
    await api.startTest('6E2-26T1');
    await api.reopenTest('6E2-26T1');
    await api.deleteTest('6E2-26T1');
    await api.resetSubmission(7);
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init!.method} ${String(url)}`)).toEqual([
      'GET /api/admin/tests?year=2026',
      'POST /api/admin/tests',
      'POST /api/admin/tests/6E2-26T1/start',
      'POST /api/admin/tests/6E2-26T1/reopen',
      'DELETE /api/admin/tests/6E2-26T1',
      'POST /api/admin/submissions/7/reset',
    ]);
  });

  it('builds the links that open stored files', () => {
    expect(testFileUrl('6E2-26T1', 'test')).toBe('/api/admin/tests/6E2-26T1/files/test');
    expect(submissionFileUrl(7, 12)).toBe('/api/admin/submissions/7/files/12');
  });
});

describe('createApiClient failures', () => {
  it('reports a dropped connection in Romanian', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const api = createApiClient({ fetchImpl });
    const error = await api.me().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 0,
      code: 'network',
      message: 'Nu mă pot conecta la server. Verifică internetul și încearcă din nou.',
    });
  });

  it('reports a JSON answer with a broken body in Romanian', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"classes": [', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const api = createApiClient({ fetchImpl });
    const error = await api.listClasses(2026).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 200,
      code: 'bad_response',
      message: 'Serverul nu a răspuns corect. Încearcă din nou.',
    });
  });

  it.each([401, 403])('reloads for a new login on a %i answer with an HTML body', async (status) => {
    const onLoginExpired = vi.fn();
    const fetchImpl = vi.fn(
      async () => new Response('<html>Sign in</html>', { status, headers: { 'Content-Type': 'text/html' } }),
    );
    const api = createApiClient({ fetchImpl, onLoginExpired });
    await expect(api.me()).rejects.toBeInstanceOf(LoginExpiredError);
    expect(onLoginExpired).toHaveBeenCalledTimes(1);
  });

  it('keeps a 401 answer with a JSON body as an ApiError', async () => {
    const onLoginExpired = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse(401, { error: 'unauthorized', message: 'Nu ești autentificat.' }));
    const api = createApiClient({ fetchImpl, onLoginExpired });
    await expect(api.me()).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(onLoginExpired).not.toHaveBeenCalled();
  });
});

describe('reloadForLogin', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reloads on the first call', () => {
    const reload = vi.fn();
    reloadForLogin(reload, () => 100_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload again within 10 seconds', () => {
    const reload = vi.fn();
    reloadForLogin(reload, () => 100_000);
    reloadForLogin(reload, () => 109_999);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again after 10 seconds', () => {
    const reload = vi.fn();
    reloadForLogin(reload, () => 100_000);
    reloadForLogin(reload, () => 110_000);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when the storage is blocked', () => {
    const reload = vi.fn();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    reloadForLogin(reload, () => 100_000);
    expect(reload).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Replace `src/ui/format.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatDateTime, formatFileSize, studentCountLabel, testStatusLabel, uploadStatusLabel } from './format.ts';

describe('studentCountLabel', () => {
  it('uses Romanian number words', () => {
    expect(studentCountLabel(0)).toBe('niciun elev');
    expect(studentCountLabel(1)).toBe('1 elev');
    expect(studentCountLabel(2)).toBe('2 elevi');
    expect(studentCountLabel(19)).toBe('19 elevi');
    expect(studentCountLabel(20)).toBe('20 de elevi');
    expect(studentCountLabel(28)).toBe('28 de elevi');
    expect(studentCountLabel(101)).toBe('101 elevi');
    expect(studentCountLabel(200)).toBe('200 de elevi');
  });
});

describe('status labels', () => {
  it('names test and upload states in Romanian', () => {
    expect(testStatusLabel('draft')).toBe('Ciornă');
    expect(testStatusLabel('open')).toBe('Deschis');
    expect(uploadStatusLabel('none')).toBe('Nu a trimis');
    expect(uploadStatusLabel('uploading')).toBe('Încarcă…');
    expect(uploadStatusLabel('submitted')).toBe('Trimis');
  });
});

describe('formatDateTime', () => {
  it('shows Romania local time, in summer and in winter', () => {
    expect(formatDateTime('2026-10-06T07:15:00.000Z')).toBe('6 oct. 2026, 10:15');
    expect(formatDateTime('2027-01-15T07:05:00.000Z')).toBe('15 ian. 2027, 09:05');
  });
});

describe('formatFileSize', () => {
  it('uses KB below one megabyte and MB with one decimal above', () => {
    expect(formatFileSize(300)).toBe('1 KB');
    expect(formatFileSize(820 * 1024)).toBe('820 KB');
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1,3 MB');
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25 MB');
  });
});
```

- [ ] **Step 5: Create `src/admin/pages/TestsPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const withTests = () =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {},
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', startedAt: '2026-10-06T07:15:00.000Z' }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'submitted', submissionId: 5 }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva' }),
      ]),
      fakeTest({ code: '6E2-26T1', title: 'Fracții' }),
      fakeTest({ code: '6E2-27T1', title: 'Anul viitor', schoolYear: 2027 }),
    ],
  });

describe('TestsPage', () => {
  it('is the start page and lists the tests of the selected school year', async () => {
    const api = withTests();
    renderAdmin('/', api);
    expect(await screen.findByRole('heading', { name: 'Teste 2026-2027' })).toBeInTheDocument();
    const card = (await screen.findByRole('link', { name: '6E2-26T2' })).closest('li')!;
    expect(within(card).getByText('Ecuații')).toBeInTheDocument();
    expect(within(card).getByText('Clasa 6E2 · 6 oct. 2026, 10:15')).toBeInTheDocument();
    expect(within(card).getByText('Deschis')).toBeInTheDocument();
    expect(within(card).getByText('Trimise: 1 din 2')).toBeInTheDocument();

    const draft = screen.getByRole('link', { name: '6E2-26T1' }).closest('li')!;
    expect(within(draft).getByText('Ciornă')).toBeInTheDocument();
    expect(within(draft).queryByText(/Trimise/)).not.toBeInTheDocument();
    expect(screen.queryByText('Anul viitor')).not.toBeInTheDocument();
    expect(api.listTests).toHaveBeenCalledWith(2026);
  });

  it('links each test to its page and offers a new test', async () => {
    renderAdmin('/', withTests());
    expect(await screen.findByRole('link', { name: '6E2-26T2' })).toHaveAttribute('href', '/teste/6E2-26T2');
    expect(screen.getByRole('link', { name: 'Test nou' })).toHaveAttribute('href', '/teste/nou');
  });

  it('says so when the year has no tests', async () => {
    renderAdmin('/', createFakeApi());
    expect(await screen.findByText('Nu ai niciun test în acest an școlar.')).toBeInTheDocument();
  });

  it('marks Teste in the menu on test pages and Clase on class pages', async () => {
    renderAdmin('/', withTests());
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Teste' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(menu).getByRole('link', { name: 'Clase' }));
    expect(within(menu).getByRole('link', { name: 'Clase' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('link', { name: 'Teste' })).not.toHaveAttribute('aria-current');
  });
});
```

- [ ] **Step 6: Create `src/admin/pages/NewTestPage.test.tsx`**

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DOCX_TYPE, PDF_TYPE } from '../../../shared/files.ts';
import { ApiError } from '../api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

const classes = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '7E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 3, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 },
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true }] },
  });

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: PDF_TYPE });

describe('NewTestPage', () => {
  it('offers the classes that are not archived', async () => {
    renderAdmin('/teste/nou', classes());
    const select = await screen.findByLabelText('Clasa');
    const options = [...(select as HTMLSelectElement).options].map((option) => option.textContent);
    expect(options).toEqual(['Alege clasa', 'Clasa 6E2', 'Clasa 7E2']);
  });

  it('creates the test, uploads the chosen files, and opens the test', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await userEvent.selectOptions(await screen.findByLabelText('Clasa'), '1');
    await userEvent.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    const test = pdf('Test.pdf');
    const barem = new File(['PK'], 'Barem.docx', { type: DOCX_TYPE });
    await userEvent.upload(screen.getByLabelText('Testul (PDF sau Word, opțional)'), test);
    await userEvent.upload(screen.getByLabelText('Baremul (PDF sau Word, opțional)'), barem);
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));

    await expectLocation('/teste/6E2-26T1');
    expect(api.createTest).toHaveBeenCalledWith({ classId: 1, title: 'Fracții' });
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', test);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', barem);
  });

  it('picks the class named in the link', async () => {
    renderAdmin('/teste/nou?clasa=2', classes());
    expect(await screen.findByLabelText('Clasa')).toHaveValue('2');
  });

  it('refuses a file that is not PDF or Word before sending anything', async () => {
    const api = classes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    const user = userEvent.setup({ applyAccept: false });
    await user.selectOptions(await screen.findByLabelText('Clasa'), '1');
    await user.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    await user.upload(screen.getByLabelText('Testul (PDF sau Word, opțional)'), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Încarcă un fișier PDF sau Word (.docx).');
    await user.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1');
    expect(api.uploadTestFile).not.toHaveBeenCalled();
  });

  it('opens the new test with a notice when a file fails to upload', async () => {
    const api = classes();
    api.uploadTestFile.mockRejectedValueOnce(new ApiError(413, 'file_too_big', 'Fișierul are peste 25 MB.'));
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await userEvent.selectOptions(await screen.findByLabelText('Clasa'), '1');
    await userEvent.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    await userEvent.upload(screen.getByLabelText('Testul (PDF sau Word, opțional)'), pdf('Test.pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/6E2-26T1 | Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat: Fișierul are peste 25 MB.');
  });

  it('shows the server message when the test cannot be made', async () => {
    const api = classes();
    api.createTest.mockRejectedValueOnce(new ApiError(409, 'class_archived', 'Clasa este arhivată.'));
    renderAdmin('/teste/nou', api);
    await userEvent.selectOptions(await screen.findByLabelText('Clasa'), '2');
    await userEvent.type(screen.getByLabelText('Titlul testului'), 'Fracții');
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clasa este arhivată.');
  });

  it('asks for a class first when the year has none', async () => {
    renderAdmin('/teste/nou', createFakeApi());
    expect(await screen.findByRole('link', { name: 'Adaugă întâi o clasă.' })).toHaveAttribute('href', '/clase');
  });
});
```

- [ ] **Step 7: Replace `src/admin/pages/ClassPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

// Direct jumps between class pages, as a link from one class to another would do.
function Jumps() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/clase/1')}>
        Mergi la clasa 1
      </button>
      <button type="button" onClick={() => navigate('/clase/2')}>
        Mergi la clasa 2
      </button>
    </>
  );
}

const oneClass = () =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 }],
    students: {
      1: [
        { id: 10, fullName: 'Pop Ion', active: true },
        { id: 11, fullName: 'Ionescu Ana', active: false },
      ],
    },
  });

describe('ClassPage', () => {
  it('shows the class and its students, with students who left marked', async () => {
    renderAdmin('/clase/1', oneClass());
    expect(await screen.findByRole('heading', { name: 'Clasa 6E2 · 2026-2027' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Elevi (1 elev)' })).toBeInTheDocument();
    const left = screen.getByText('Ionescu Ana').closest('li')!;
    expect(within(left).getByText('a plecat')).toBeInTheDocument();
  });

  it('adds pasted names, one per line, without list numbers', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const box = await screen.findByLabelText('Numele elevilor, câte unul pe rând');
    await userEvent.type(box, '1. Marin Dan{Enter}{Enter}2) Stan Eva');
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă 2 elevi' }));
    expect(api.addStudents).toHaveBeenCalledWith(1, ['Marin Dan', 'Stan Eva']);
    expect(await screen.findByText('Marin Dan')).toBeInTheDocument();
    expect(box).toHaveValue('');
  });

  it('lists the tests of the class and offers a new one for it', async () => {
    const api = oneClass();
    await api.createTest({ classId: 1, title: 'Fracții' });
    renderAdmin('/clase/1', api);
    expect(await screen.findByRole('link', { name: '6E2-26T1 · Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(screen.getByRole('link', { name: 'Test nou pentru această clasă' })).toHaveAttribute('href', '/teste/nou?clasa=1');
  });

  it('offers no new test for an archived class', async () => {
    const api = oneClass();
    await api.updateClass(1, { archived: true });
    renderAdmin('/clase/1', api);
    expect(await screen.findByText('Clasa nu are încă teste.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Test nou pentru această clasă' })).not.toBeInTheDocument();
  });

  it('marks a student as left', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'A plecat' }));
    expect(api.setStudentActive).toHaveBeenCalledWith(1, 10, false);
    expect(await within(row).findByRole('button', { name: 'Revine în clasă' })).toBeInTheDocument();
  });

  it('renames a student', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    const row = (await screen.findByText('Pop Ion')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Redenumește' }));
    const input = screen.getByLabelText('Numele elevului');
    await userEvent.clear(input);
    await userEvent.type(input, 'Pop Ioan');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.renameStudent).toHaveBeenCalledWith(10, 'Pop Ioan');
    expect(await screen.findByText('Pop Ioan')).toBeInTheDocument();
  });

  it('renames the class', async () => {
    const api = oneClass();
    renderAdmin('/clase/1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește clasa' }));
    const input = screen.getByLabelText('Nume nou');
    await userEvent.clear(input);
    await userEvent.type(input, '6E3');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.updateClass).toHaveBeenCalledWith(1, { name: '6E3' });
    expect(await screen.findByRole('heading', { name: 'Clasa 6E3 · 2026-2027' })).toBeInTheDocument();
  });

  it.each(['abc', '1e3', '01'])('shows the not-found page for the class id %j', async (id) => {
    renderAdmin(`/clase/${id}`, oneClass());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('starts with an empty draft when it moves straight to another class', async () => {
    const api = createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
        { id: 2, name: '7E2', schoolYear: 2026, archived: false, studentCount: 0 },
      ],
      students: {},
    });
    // Class 2 is opened first, so later its page shows at once, without a loading step.
    renderAdmin('/clase/2', api, <Jumps />);
    await screen.findByRole('heading', { name: 'Clasa 7E2 · 2026-2027' });
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la clasa 1' }));
    await userEvent.type(await screen.findByLabelText('Numele elevilor, câte unul pe rând'), 'Pop Ion');
    await userEvent.click(screen.getByRole('button', { name: 'Mergi la clasa 2' }));
    expect(await screen.findByRole('heading', { name: 'Clasa 7E2 · 2026-2027' })).toBeInTheDocument();
    expect(screen.getByLabelText('Numele elevilor, câte unul pe rând')).toHaveValue('');
  });

  it('shows the server message for a class that does not exist', async () => {
    renderAdmin('/clase/999', oneClass());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});
```

- [ ] **Step 8: Replace `src/admin/pages/ClassesPage.test.tsx`**

The classes page now lives only at `/clase`; `/` is the tests list.

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const twoClasses = () =>
  createFakeApi({
    classes: [
      { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
      { id: 2, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 },
      { id: 3, name: '5A', schoolYear: 2027, archived: false, studentCount: 0 },
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true }] },
  });

describe('ClassesPage', () => {
  it('shows the classes of the selected school year', async () => {
    const api = twoClasses();
    renderAdmin('/clase', api);
    expect(await screen.findByRole('heading', { name: 'Clase 2026-2027' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByText('1 elev')).toBeInTheDocument();
    expect(screen.getByText('Arhivată')).toBeInTheDocument();
    expect(screen.queryByText('Clasa 5A')).not.toBeInTheDocument();
    expect(api.listClasses).toHaveBeenCalledWith(2026);
  });

  it('shows the teacher name in the footer', async () => {
    renderAdmin('/clase', twoClasses());
    expect(await screen.findByText('QuickEval · Laura Miron')).toBeInTheDocument();
  });

  it('switches the school year from the header', async () => {
    const api = twoClasses();
    renderAdmin('/clase', api);
    await screen.findByRole('heading', { name: 'Clase 2026-2027' });
    await userEvent.selectOptions(screen.getByLabelText('Anul școlar'), '2027');
    expect(await screen.findByRole('heading', { name: 'Clase 2027-2028' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Clasa 5A' })).toBeInTheDocument();
  });

  it('adds a class in the selected school year', async () => {
    const api = twoClasses();
    renderAdmin('/clase', api);
    await userEvent.type(await screen.findByLabelText('Clasă nouă'), '7e2');
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă clasa' }));
    expect(api.createClass).toHaveBeenCalledWith({ name: '7e2', schoolYear: 2026 });
    expect(await screen.findByRole('link', { name: 'Clasa 7E2' })).toBeInTheDocument();
    expect(screen.getByLabelText('Clasă nouă')).toHaveValue('');
  });

  it('shows the server message when the class already exists', async () => {
    const api = twoClasses();
    api.createClass.mockRejectedValueOnce(
      new ApiError(409, 'class_exists', 'Clasa 6E2 există deja în anul școlar 2026-2027.'),
    );
    renderAdmin('/clase', api);
    await userEvent.type(await screen.findByLabelText('Clasă nouă'), '6E2');
    await userEvent.click(screen.getByRole('button', { name: 'Adaugă clasa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clasa 6E2 există deja în anul școlar 2026-2027.');
  });

  it('archives a class and brings it back', async () => {
    const api = twoClasses();
    renderAdmin('/clase', api);
    const card = (await screen.findByRole('link', { name: 'Clasa 6E2' })).closest('li')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Arhivează' }));
    expect(api.updateClass).toHaveBeenCalledWith(1, { archived: true });
    expect(await within(card).findByRole('button', { name: 'Scoate din arhivă' })).toBeInTheDocument();
  });

  it('says so when the year has no classes', async () => {
    renderAdmin('/clase', createFakeApi());
    expect(await screen.findByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run the tests to see them fail**

Run: `npx vitest run src/admin/api.test.ts src/admin/pages/ClassPage.test.tsx src/admin/pages/ClassesPage.test.tsx src/admin/pages/NewTestPage.test.tsx src/admin/pages/TestsPage.test.tsx src/ui/format.test.ts`
Expected: FAIL. `Test Files  5 failed | 1 passed (6)`, `Tests  19 failed | 32 passed (51)`. `api.test.ts`: `api.uploadTestFile is not a function`, `api.listTests is not a function`, `testFileUrl is not a function`. `format.test.ts`: `testStatusLabel is not a function` (and the same for `formatDateTime` and `formatFileSize`). The page tests do not find the new pages (`Unable to find a label with the text of: Clasa`, `Unable to find role="link" and name "6E2-26T1 · Fracții"`). `ClassesPage.test.tsx` passes.

- [ ] **Step 10: Replace `src/admin/api.ts`**

```ts
import type {
  ClassDetail,
  ClassSummary,
  CreateClassInput,
  CreateTestInput,
  StartedTest,
  StudentRow,
  SubmissionDetail,
  Teacher,
  TestDetail,
  TestFileInfo,
  TestSummary,
  UpdateClassInput,
} from '../../shared/api.ts';
import { uploadTypeOf, type TestFileKind } from '../../shared/files.ts';

// Everything the teacher app asks the server. Pages get it from useApi(), so
// tests can pass a fake.
export interface AdminApi {
  me(): Promise<Teacher>;
  listClasses(schoolYear: number): Promise<ClassSummary[]>;
  createClass(input: CreateClassInput): Promise<ClassSummary>;
  getClass(classId: number): Promise<ClassDetail>;
  updateClass(classId: number, input: UpdateClassInput): Promise<ClassSummary>;
  addStudents(classId: number, names: string[]): Promise<StudentRow[]>;
  setStudentActive(classId: number, studentId: number, active: boolean): Promise<StudentRow>;
  renameStudent(studentId: number, fullName: string): Promise<{ id: number; fullName: string }>;
  listTests(schoolYear: number): Promise<TestSummary[]>;
  // Returns the code of the new test.
  createTest(input: CreateTestInput): Promise<string>;
  getTest(code: string): Promise<TestDetail>;
  renameTest(code: string, title: string): Promise<{ code: string; title: string }>;
  deleteTest(code: string): Promise<void>;
  uploadTestFile(code: string, kind: TestFileKind, file: File): Promise<TestFileInfo>;
  startTest(code: string): Promise<StartedTest>;
  reopenTest(code: string): Promise<void>;
  getSubmission(submissionId: number): Promise<SubmissionDetail>;
  resetSubmission(submissionId: number): Promise<void>;
}

// Files open straight from the API: the browser sends the Access login cookie.
export function testFileUrl(code: string, kind: TestFileKind): string {
  return `/api/admin/tests/${encodeURIComponent(code)}/files/${kind}`;
}

export function submissionFileUrl(submissionId: number, fileId: number): string {
  return `/api/admin/submissions/${submissionId}/files/${fileId}`;
}

// An error answer from the API, with its Romanian message.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// The Cloudflare Access login ended. The app reloads the page so Access shows
// its login screen.
export class LoginExpiredError extends Error {
  constructor() {
    super('Sesiunea a expirat. Reîncarcă pagina ca să intri din nou.');
  }
}

const RELOAD_KEY = 'quickeval.loginReloadAt';
const RELOAD_GAP_MS = 10_000;

// Reloads at most once per 10 seconds, so a broken login can never cause a reload loop.
// The parameters exist for tests; the defaults reload the real page.
export function reloadForLogin(reload: () => void = () => window.location.reload(), now: () => number = Date.now): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (now() - last < RELOAD_GAP_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(now()));
  } catch {
    return;
  }
  reload();
}

export interface ApiClientOptions {
  fetchImpl?: typeof fetch;
  onLoginExpired?: () => void;
}

export function createApiClient(options: ApiClientOptions = {}): AdminApi {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const onLoginExpired = options.onLoginExpired ?? reloadForLogin;

  // A JSON body, or a file sent raw with its type and URI-encoded name.
  async function request<T>(method: string, path: string, body?: unknown, file?: File): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let payload: BodyInit | undefined;
    if (file) {
      headers['Content-Type'] = uploadTypeOf(file) || 'application/octet-stream';
      headers['X-File-Name'] = encodeURIComponent(file.name);
      payload = file;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetchImpl(`/api/admin${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        // An expired Access session answers with a redirect to the login page on
        // another origin. 'manual' turns it into an opaqueredirect response here.
        redirect: 'manual',
        ...(payload === undefined ? {} : { body: payload }),
      });
    } catch {
      throw new ApiError(0, 'network', 'Nu mă pot conecta la server. Verifică internetul și încearcă din nou.');
    }
    const isJson = (res.headers.get('Content-Type') ?? '').includes('application/json');
    if (res.type === 'opaqueredirect' || ((res.status === 401 || res.status === 403) && !isJson)) {
      onLoginExpired();
      throw new LoginExpiredError();
    }
    if (!isJson) {
      throw new ApiError(res.status, 'bad_response', 'Serverul nu a răspuns corect. Încearcă din nou.');
    }
    let data: { error?: string; message?: string };
    try {
      data = (await res.json()) as { error?: string; message?: string };
    } catch {
      throw new ApiError(res.status, 'bad_response', 'Serverul nu a răspuns corect. Încearcă din nou.');
    }
    if (!res.ok) {
      throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'A apărut o eroare. Încearcă din nou.');
    }
    return data as T;
  }

  const test = (code: string) => `/tests/${encodeURIComponent(code)}`;

  return {
    me: async () => (await request<{ teacher: Teacher }>('GET', '/me')).teacher,
    listClasses: async (schoolYear) =>
      (await request<{ classes: ClassSummary[] }>('GET', `/classes?year=${schoolYear}`)).classes,
    createClass: async (input) => (await request<{ class: ClassSummary }>('POST', '/classes', input)).class,
    getClass: (classId) => request<ClassDetail>('GET', `/classes/${classId}`),
    updateClass: async (classId, input) =>
      (await request<{ class: ClassSummary }>('PATCH', `/classes/${classId}`, input)).class,
    addStudents: async (classId, names) =>
      (await request<{ students: StudentRow[] }>('POST', `/classes/${classId}/students`, { names })).students,
    setStudentActive: async (classId, studentId, active) =>
      (await request<{ student: StudentRow }>('PATCH', `/classes/${classId}/students/${studentId}`, { active })).student,
    renameStudent: async (studentId, fullName) =>
      (await request<{ student: { id: number; fullName: string } }>('PATCH', `/students/${studentId}`, { fullName })).student,
    listTests: async (schoolYear) => (await request<{ tests: TestSummary[] }>('GET', `/tests?year=${schoolYear}`)).tests,
    createTest: async (input) => (await request<{ code: string }>('POST', '/tests', input)).code,
    getTest: (code) => request<TestDetail>('GET', test(code)),
    renameTest: (code, title) => request<{ code: string; title: string }>('PATCH', test(code), { title }),
    deleteTest: async (code) => {
      await request('DELETE', test(code));
    },
    uploadTestFile: async (code, kind, file) =>
      (await request<{ file: TestFileInfo }>('PUT', `${test(code)}/files/${kind}`, undefined, file)).file,
    startTest: (code) => request<StartedTest>('POST', `${test(code)}/start`),
    reopenTest: async (code) => {
      await request('POST', `${test(code)}/reopen`);
    },
    getSubmission: async (submissionId) =>
      (await request<{ submission: SubmissionDetail }>('GET', `/submissions/${submissionId}`)).submission,
    resetSubmission: async (submissionId) => {
      await request('POST', `/submissions/${submissionId}/reset`);
    },
  };
}
```

- [ ] **Step 11: Replace `src/ui/format.ts`**

```ts
import type { UploadStatus } from '../../shared/api.ts';
import type { TestStatus } from '../../shared/tests.ts';

// Romanian counts: "1 elev", "2 elevi", "20 de elevi" (20 or more, and round
// hundreds, take "de").
export function studentCountLabel(count: number): string {
  if (count === 0) return 'niciun elev';
  if (count === 1) return '1 elev';
  const lastTwo = count % 100;
  return lastTwo >= 20 || lastTwo === 0 ? `${count} de elevi` : `${count} elevi`;
}

const TEST_STATUS: Record<TestStatus, string> = {
  draft: 'Ciornă',
  open: 'Deschis',
  evaluating: 'Se corectează',
  done: 'Corectat',
};

export function testStatusLabel(status: TestStatus): string {
  return TEST_STATUS[status];
}

const UPLOAD_STATUS: Record<UploadStatus, string> = {
  none: 'Nu a trimis',
  uploading: 'Încarcă…',
  submitted: 'Trimis',
  grading: 'Se corectează',
  graded: 'Corectat',
  failed: 'Eroare',
};

export function uploadStatusLabel(status: UploadStatus): string {
  return UPLOAD_STATUS[status];
}

const DATE_TIME = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Every time on screen is Romania's local time: "6 oct. 2026, 10:15".
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

const ONE_DECIMAL = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

// "820 KB", "1,3 MB".
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${ONE_DECIMAL.format(bytes / (1024 * 1024))} MB`;
}
```

- [ ] **Step 12: Replace `src/admin/ErrorMessage.tsx`**

```tsx
import { ApiError, LoginExpiredError } from './api.ts';

// The Romanian text for a failed request. Only the API client's own errors
// carry Romanian text; any other error gets a generic message instead of the
// browser's English one.
export function errorText(error: unknown): string {
  return error instanceof ApiError || error instanceof LoginExpiredError ? error.message : 'A apărut o eroare. Încearcă din nou.';
}

// Shows the Romanian message of a failed request. An expired login also gets
// a button that reloads the page, in case the automatic reload was skipped.
export function ErrorMessage({ error }: { error: unknown }) {
  return (
    <div className="alert" role="alert">
      <p className="alert-text">{errorText(error)}</p>
      {error instanceof LoginExpiredError && (
        <button type="button" className="button-quiet button-small" onClick={() => window.location.reload()}>
          Reîncarcă pagina
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 13: Create `src/admin/StatusChip.tsx`**

```tsx
import type { TestStatus } from '../../shared/tests.ts';
import { testStatusLabel } from '../ui/format.ts';

export function StatusChip({ status }: { status: TestStatus }) {
  return <span className={`status status-${status}`}>{testStatusLabel(status)}</span>;
}
```

- [ ] **Step 14: Create `src/admin/TestFileInput.tsx`**

```tsx
import { useState } from 'react';
import { DOCX_TYPE, fileProblem, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE } from '../../shared/files.ts';

const ACCEPT = ['.pdf', '.docx', PDF_TYPE, DOCX_TYPE].join(',');

// Picks the test or the barem: a PDF or Word file of at most 25 MB. A file
// that cannot be sent shows its problem here and is not passed on.
export function TestFileInput({
  id,
  label,
  onPick,
  disabled = false,
}: {
  id: string;
  label: string;
  onPick: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="file-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept={ACCEPT}
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          const found = file ? fileProblem(file, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE) : null;
          setProblem(found);
          onPick(found ? null : file);
        }}
      />
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 15: Create `src/admin/pages/TestsPage.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { StatusChip } from '../StatusChip.tsx';

// The start page: the tests of the selected school year, newest first.
export function TestsPage() {
  const api = useApi();
  const { year } = useSchoolYear();
  const tests = useQuery({ queryKey: ['tests', year], queryFn: () => api.listTests(year) });

  return (
    <section>
      <div className="page-head">
        <h1>Teste {formatSchoolYear(year)}</h1>
        <Link className="button" to="/teste/nou">
          Test nou
        </Link>
      </div>

      {tests.isPending && <p>Se încarcă…</p>}
      {tests.error && <ErrorMessage error={tests.error} />}
      {tests.data && tests.data.length === 0 && <p className="hint">Nu ai niciun test în acest an școlar.</p>}
      {tests.data && tests.data.length > 0 && (
        <ul className="card-list">
          {tests.data.map((test) => (
            <li key={test.code} className="card">
              <Link className="card-title" to={`/teste/${test.code}`}>
                {test.code}
              </Link>
              <span>{test.title}</span>
              <span className="card-count">
                {displayClassName(test.className)}
                {test.startedAt && ` · ${formatDateTime(test.startedAt)}`}
              </span>
              <span>
                <StatusChip status={test.status} />
              </span>
              {test.status !== 'draft' && (
                <span className="card-count">
                  Trimise: {test.submittedCount} din {test.studentCount}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 16: Create `src/admin/pages/NewTestPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import type { TestFileKind } from '../../../shared/files.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { MAX_TITLE_LENGTH } from '../../../shared/tests.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage, errorText } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { TestFileInput } from '../TestFileInput.tsx';

// /teste/nou: class and title; the test and the barem can come now or later.
// ?clasa=<id> picks the class (the class page links here).
export function NewTestPage() {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { year } = useSchoolYear();
  const [params] = useSearchParams();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });
  const [classId, setClassId] = useState(params.get('clasa') ?? '');
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<Record<TestFileKind, File | null>>({ test: null, barem: null });

  const create = useMutation({
    mutationFn: async () => {
      const code = await api.createTest({ classId: Number(classId), title });
      // The test exists now. A file that fails to upload can be sent again from the test page.
      let notice: string | null = null;
      for (const kind of ['test', 'barem'] as const) {
        const file = files[kind];
        if (!file) continue;
        try {
          await api.uploadTestFile(code, kind, file);
        } catch (err) {
          notice ??= `Testul a fost creat, dar fișierul ${file.name} nu s-a încărcat: ${errorText(err)}`;
        }
      }
      return { code, notice };
    },
    onSuccess: async ({ code, notice }) => {
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
      navigate(`/teste/${code}`, { state: notice ? { notice } : null });
    },
  });

  const open = classes.data?.filter((item) => !item.archived) ?? [];
  const selected = open.some((item) => String(item.id) === classId) ? classId : '';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <section>
      <p>
        <Link to="/">← Toate testele</Link>
      </p>
      <h1>Test nou</h1>

      {classes.isPending && <p>Se încarcă…</p>}
      {classes.error && <ErrorMessage error={classes.error} />}
      {classes.data && open.length === 0 && (
        <p className="hint">
          Nu ai nicio clasă în anul școlar {formatSchoolYear(year)}. <Link to="/clase">Adaugă întâi o clasă.</Link>
        </p>
      )}
      {open.length > 0 && (
        <form className="form-stack narrow" onSubmit={onSubmit}>
          <label htmlFor="test-class">Clasa</label>
          <select id="test-class" value={selected} onChange={(event) => setClassId(event.target.value)} required>
            <option value="">Alege clasa</option>
            {open.map((item) => (
              <option key={item.id} value={item.id}>
                {displayClassName(item.name)}
              </option>
            ))}
          </select>

          <label htmlFor="test-title">Titlul testului</label>
          <input
            id="test-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="de exemplu Test de evaluare inițială"
            maxLength={MAX_TITLE_LENGTH}
            required
          />

          <TestFileInput
            id="new-test-file"
            label="Testul (PDF sau Word, opțional)"
            onPick={(file) => setFiles((current) => ({ ...current, test: file }))}
          />
          <TestFileInput
            id="new-barem-file"
            label="Baremul (PDF sau Word, opțional)"
            onPick={(file) => setFiles((current) => ({ ...current, barem: file }))}
          />

          <span>
            <button className="button" type="submit" disabled={create.isPending || selected === ''}>
              {create.isPending ? 'Se creează…' : 'Creează testul'}
            </button>
          </span>
          {create.error && <ErrorMessage error={create.error} />}
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 17: Replace `src/admin/AppRoutes.tsx`**

```tsx
import { Route, Routes } from 'react-router';
import { Layout } from './Layout.tsx';
import { ClassesPage } from './pages/ClassesPage.tsx';
import { ClassPage } from './pages/ClassPage.tsx';
import { NewTestPage } from './pages/NewTestPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { TestsPage } from './pages/TestsPage.tsx';

// Paths are relative to the /admin basename set in App.tsx.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TestsPage />} />
        <Route path="teste/nou" element={<NewTestPage />} />
        <Route path="clase" element={<ClassesPage />} />
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 18: Replace `src/admin/Layout.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { formatSchoolYear, schoolYearOf } from '../../shared/schoolYear.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import { useApi } from './ApiContext.tsx';
import { ErrorMessage } from './ErrorMessage.tsx';
import { schoolYearOptions, useSchoolYear } from './SchoolYearContext.tsx';

export function Layout() {
  const api = useApi();
  const location = useLocation();
  const onTests = location.pathname === '/' || location.pathname.startsWith('/teste');
  const { year, setYear } = useSchoolYear();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me() });

  return (
    <>
      <header className="site-header">
        <div className="wrap header-bar">
          <Link className="brand" to="/">
            <BrandMark />
            <span className="brand-text">
              <span className="brand-name">QuickEval</span>
              <span className="brand-sub">Matematică cu Laura Miron</span>
            </span>
          </Link>
          <nav className="main-nav" aria-label="Meniu">
            {/* Teste is the start page and also covers every /teste/... page. */}
            <Link to="/" aria-current={onTests ? 'page' : undefined}>
              Teste
            </Link>
            <NavLink to="/clase">Clase</NavLink>
          </nav>
          <div className="header-tools">
            <label className="sr-only" htmlFor="school-year">
              Anul școlar
            </label>
            <select id="school-year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {schoolYearOptions(schoolYearOf(new Date())).map((option) => (
                <option key={option} value={option}>
                  {formatSchoolYear(option)}
                </option>
              ))}
            </select>
            <ThemeButton />
          </div>
        </div>
      </header>
      <main className="wrap page">
        {me.error ? (
          <ErrorMessage error={me.error} />
        ) : (
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        )}
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <p>QuickEval{me.data ? ` · ${me.data.name}` : ''}</p>
        </div>
      </footer>
    </>
  );
}
```

- [ ] **Step 19: Replace `src/admin/pages/ClassPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { StudentRow } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { MAX_NAMES_PER_REQUEST, parseStudentNames } from '../../../shared/students.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { StatusChip } from '../StatusChip.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

export function ClassPage() {
  const classId = parsePositiveId(useParams().id);
  if (classId === null) return <NotFoundPage />;
  // A new key for each class: a draft or an open form never carries over to another class.
  return <ClassDetails key={classId} classId={classId} />;
}

function ClassDetails({ classId }: { classId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['class', classId], queryFn: () => api.getClass(classId) });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['class', classId] });
    await queryClient.invalidateQueries({ queryKey: ['classes'] });
  };

  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;

  const { class: info, students, tests } = detail.data;
  return (
    <section>
      <p>
        <Link to="/clase">← Toate clasele</Link>
      </p>
      <h1>
        {displayClassName(info.name)} · {formatSchoolYear(info.schoolYear)}
      </h1>
      <RenameClassForm classId={classId} currentName={info.name} onDone={refresh} />

      <h2>Teste</h2>
      {tests.length === 0 ? (
        <p className="hint">Clasa nu are încă teste.</p>
      ) : (
        <ol className="row-list">
          {tests.map((test) => (
            <li key={test.code}>
              <Link className="row-name" to={`/teste/${test.code}`}>
                {test.code} · {test.title}
              </Link>
              <StatusChip status={test.status} />
            </li>
          ))}
        </ol>
      )}
      {!info.archived && (
        <p>
          <Link to={`/teste/nou?clasa=${classId}`}>Test nou pentru această clasă</Link>
        </p>
      )}

      <h2>Elevi ({studentCountLabel(info.studentCount)})</h2>
      {students.length === 0 ? (
        <p className="hint">Clasa nu are încă elevi. Adaugă-i mai jos.</p>
      ) : (
        <ol className="row-list">
          {students.map((student) => (
            <StudentItem key={student.id} classId={classId} student={student} onChanged={refresh} />
          ))}
        </ol>
      )}

      <h2>Adaugă elevi</h2>
      <AddStudentsForm classId={classId} onDone={refresh} />
    </section>
  );
}

function RenameClassForm({ classId, currentName, onDone }: { classId: number; currentName: string; onDone: () => Promise<void> }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const rename = useMutation({
    mutationFn: () => api.updateClass(classId, { name }),
    onSuccess: async () => {
      setOpen(false);
      await onDone();
    },
  });

  if (!open) {
    return (
      <button type="button" className="button-quiet button-small" onClick={() => setOpen(true)}>
        Redenumește clasa
      </button>
    );
  }
  return (
    <form
      className="form-row"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <label htmlFor="rename-class">Nume nou</label>
      <input id="rename-class" type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={20} required />
      <button className="button button-small" type="submit" disabled={rename.isPending}>
        Salvează
      </button>
      <button type="button" className="button-quiet button-small" onClick={() => setOpen(false)}>
        Renunță
      </button>
      {rename.error && <ErrorMessage error={rename.error} />}
    </form>
  );
}

function StudentItem({ classId, student, onChanged }: { classId: number; student: StudentRow; onChanged: () => Promise<void> }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(student.fullName);

  const toggle = useMutation({
    mutationFn: () => api.setStudentActive(classId, student.id, !student.active),
    onSuccess: onChanged,
  });
  const rename = useMutation({
    mutationFn: () => api.renameStudent(student.id, fullName),
    onSuccess: async () => {
      setEditing(false);
      await onChanged();
    },
  });

  if (editing) {
    return (
      <li>
        <form
          className="form-row"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            rename.mutate();
          }}
        >
          <label className="sr-only" htmlFor={`student-${student.id}`}>
            Numele elevului
          </label>
          <input id={`student-${student.id}`} type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={80} required />
          <button className="button button-small" type="submit" disabled={rename.isPending}>
            Salvează
          </button>
          <button type="button" className="button-quiet button-small" onClick={() => setEditing(false)}>
            Renunță
          </button>
        </form>
        {rename.error && <ErrorMessage error={rename.error} />}
      </li>
    );
  }

  return (
    <li className={student.active ? undefined : 'is-muted'}>
      <span className="row-name">{student.fullName}</span>
      {!student.active && <span className="tag">a plecat</span>}
      <button type="button" className="button-quiet button-small" onClick={() => setEditing(true)}>
        Redenumește
      </button>
      <button type="button" className="button-quiet button-small" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
        {student.active ? 'A plecat' : 'Revine în clasă'}
      </button>
      {toggle.error && <ErrorMessage error={toggle.error} />}
    </li>
  );
}

function AddStudentsForm({ classId, onDone }: { classId: number; onDone: () => Promise<void> }) {
  const api = useApi();
  const [text, setText] = useState('');
  const names = parseStudentNames(text);
  const tooMany = names.length > MAX_NAMES_PER_REQUEST;
  const add = useMutation({
    mutationFn: () => api.addStudents(classId, names),
    onSuccess: async () => {
      setText('');
      await onDone();
    },
  });

  return (
    <form
      className="form-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      <label htmlFor="student-names">Numele elevilor, câte unul pe rând</label>
      <p className="hint" id="student-names-hint">
        Poți lipi lista din catalog. Numerele de la începutul rândurilor se șterg singure.
      </p>
      <textarea
        id="student-names"
        aria-describedby="student-names-hint"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {tooMany && (
        <p className="alert" role="alert">
          Adaugă cel mult {MAX_NAMES_PER_REQUEST} de nume odată.
        </p>
      )}
      <span>
        <button className="button" type="submit" disabled={names.length === 0 || tooMany || add.isPending}>
          {names.length > 0 ? `Adaugă ${studentCountLabel(names.length)}` : 'Adaugă elevii'}
        </button>
      </span>
      {add.error && <ErrorMessage error={add.error} />}
    </form>
  );
}
```

- [ ] **Step 20: Replace `src/admin/pages/NotFoundPage.tsx`**

```tsx
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section>
      <h1>Pagina nu există</h1>
      <p>
        <Link to="/">Mergi la teste</Link>
      </p>
    </section>
  );
}
```

- [ ] **Step 21: Append to `src/ui/brand.css`**

```css
/* Tests */

.page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 0.75rem;
}

.page-head h1 {
  margin: 0;
}

.narrow {
  max-width: 34rem;
}

.file-field {
  display: grid;
  gap: 0.35rem;
}

input[type="file"] {
  max-width: 100%;
  font: inherit;
}

/* A test's state: draft is plain, open is green, being graded is
   highlighted, graded is blue ink. */
.status {
  display: inline-block;
  padding: 0 0.6rem;
  border: 1.5px solid var(--rule);
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 700;
  white-space: nowrap;
}

.status-open {
  border-color: var(--ok-fg);
  background: var(--ok-bg);
  color: var(--ok-fg);
}

.status-evaluating {
  border-color: var(--marker-edge);
  background: var(--marker);
  color: var(--text);
}

.status-done {
  border-color: var(--ink);
  color: var(--ink);
}
```

- [ ] **Step 22: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  30 passed (30)`, `Tests  270 passed (270)`.

- [ ] **Step 23: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 24: Commit**

```bash
git add src
git commit -m "Add the tests list and the new-test page, and list a class's tests"
```

---

### Task 9: Test page

`/teste/<code>`: the header, the rename form, the test and barem files, Start test, the link with Copy and the QR code (also full screen), Reopen, the uploads table (refreshed every 10 seconds while uploads are open), reset, and delete.

**Files:**
- Create: `src/admin/pages/TestPage.tsx`, `src/admin/testPage/TestFiles.tsx`, `src/admin/testPage/UploadLink.tsx`, `src/admin/testPage/UploadsTable.tsx`
- Modify: `package.json`, `package-lock.json` (qrcode.react), `src/admin/AppRoutes.tsx`, `src/test/renderAdmin.tsx`, `src/ui/brand.css`
- Test: `src/admin/pages/TestPage.test.tsx`

**Interfaces:**
- Consumes: the Task 8 client, fake, `StatusChip`, `TestFileInput`, `LocationProbe`, `expectLocation`.
- Produces:
  - `refreshInterval(status): number | false` in `src/admin/pages/TestPage.tsx` (10 000 ms while open or evaluating).
  - `uploadLink(token): string` (`<origin>/u/<token>`) and `UploadLink({ token })` in `src/admin/testPage/UploadLink.tsx`.
  - `renderAdmin(path, api, extra?)`: `path` may be `{ pathname, state }`.
  - Route `/teste/:code` → `TestPage`. Its uploads table links to `/teste/<code>/elevi/<submissionId>`; Task 10 adds that page.

- [ ] **Step 1: Install the QR code library**

Run: `npm install qrcode.react@^4.2.0`
Expected: npm adds the package. `package.json` lists `"qrcode.react": "^4.2.0"` under `dependencies`.

- [ ] **Step 2: Replace `src/test/renderAdmin.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { expect } from 'vitest';
import { ApiProvider } from '../admin/ApiContext.tsx';
import type { AdminApi } from '../admin/api.ts';
import { AppRoutes } from '../admin/AppRoutes.tsx';
import { SchoolYearProvider } from '../admin/SchoolYearContext.tsx';

// Shows where the app is, for tests that check a navigation: the path, and
// the notice that a page passed along in the navigation state.
export function LocationProbe() {
  const location = useLocation();
  const state = location.state as { notice?: string } | null;
  return (
    <p data-testid="location">
      {location.pathname}
      {location.search}
      {state?.notice ? ` | ${state.notice}` : ''}
    </p>
  );
}

// Waits until the LocationProbe shows the expected place. A navigation runs
// after the API answer, so a single immediate check could look too early.
export async function expectLocation(expected: string | RegExp): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(expected));
}

// Renders the teacher app at a path (without the /admin basename), with a fake
// API and school year 2026-2027. The path can carry navigation state, as a
// page that navigates here would pass. `extra` is drawn inside the router,
// above the pages; tests use it for a button that navigates.
export function renderAdmin(path: string | { pathname: string; state: unknown }, api: AdminApi, extra?: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <SchoolYearProvider initialYear={2026}>
          <MemoryRouter initialEntries={[path]}>
            {extra}
            <AppRoutes />
          </MemoryRouter>
        </SchoolYearProvider>
      </QueryClientProvider>
    </ApiProvider>,
  );
}
```

- [ ] **Step 3: Create `src/admin/pages/TestPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../../shared/files.ts';
import { createFakeApi, FAKE_TOKEN, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { refreshInterval } from './TestPage.tsx';

const uploads = [
  fakeUpload({
    studentId: 10,
    studentName: 'Pop Ion',
    submissionId: 5,
    status: 'submitted',
    fileCount: 3,
    startedAt: '2026-10-06T07:20:00.000Z',
    submittedAt: '2026-10-06T07:40:00.000Z',
    autoSubmitted: true,
  }),
  fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'uploading', fileCount: 1, startedAt: '2026-10-06T07:25:00.000Z' }),
  fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
];

function apiWith(overrides: Parameters<typeof fakeTest>[0] = {}) {
  return createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
    students: {},
    tests: [fakeTest(overrides, uploads)],
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TestPage', () => {
  it('shows the code, state, title, class, and start time', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN, startedAt: '2026-10-06T07:15:00.000Z' }));
    expect(await screen.findByRole('heading', { name: '6E2-26T1' })).toBeInTheDocument();
    expect(screen.getByText('Deschis')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clasa 6E2' })).toHaveAttribute('href', '/clase/1');
    expect(screen.getByText(/început 6 oct\. 2026, 10:15/)).toBeInTheDocument();
  });

  it('reads the code in any letter case and refuses something else', async () => {
    renderAdmin('/teste/6e2-26t1', apiWith());
    expect(await screen.findByRole('heading', { name: '6E2-26T1' })).toBeInTheDocument();
  });

  it('shows the not-found page for a path that is not a test code', async () => {
    renderAdmin('/teste/abc', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('starts a draft test and then shows the link and the QR code', async () => {
    const api = apiWith();
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Începe testul' }));
    expect(api.startTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByLabelText('Linkul pentru elevi')).toHaveValue(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByTitle('Codul QR al linkului')).toBeInTheDocument();
  });

  it('copies the link', async () => {
    const user = userEvent.setup();
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await user.click(await screen.findByRole('button', { name: 'Copiază linkul' }));
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/u/${FAKE_TOKEN}`);
    expect(screen.getByRole('status')).toHaveTextContent('Copiat!');
  });

  it('shows the QR code on the whole screen and closes it with Escape', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN }));
    await userEvent.click(await screen.findByRole('button', { name: 'Arată codul QR pe tot ecranul' }));
    const dialog = screen.getByRole('dialog', { name: 'Codul QR pentru elevi' });
    expect(within(dialog).getByText(`${window.location.origin}/u/${FAKE_TOKEN}`)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Închide' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uploads the test file and links to it', async () => {
    const api = apiWith();
    renderAdmin('/teste/6E2-26T1', api);
    const file = new File(['%PDF-1.7'], 'Test.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText('Încarcă testul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', file);
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
    expect(screen.getByLabelText('Înlocuiește testul')).toBeInTheDocument();
  });

  it('locks the files while the test is being graded', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'evaluating' }));
    expect(await screen.findByLabelText('Încarcă baremul')).toBeDisabled();
  });

  it('lists the uploads of the students', async () => {
    renderAdmin('/teste/6E2-26T1', apiWith({ status: 'open', uploadToken: FAKE_TOKEN, submittedCount: 1, studentCount: 3 }));
    expect(await screen.findByRole('heading', { name: 'Încărcări · trimise 1 din 3' })).toBeInTheDocument();
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(within(pop).getByText('Trimis')).toBeInTheDocument();
    expect(within(pop).getByText('Fără confirmare')).toBeInTheDocument();
    expect(within(pop).getByText('6 oct. 2026, 10:40')).toBeInTheDocument();
    expect(within(pop).getByRole('link', { name: 'Vezi fișierele' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/5');
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
    expect(within(marin).getByText('Nu a trimis')).toBeInTheDocument();
    expect(within(marin).queryByRole('button', { name: 'Resetează' })).not.toBeInTheDocument();
  });

  it('resets an upload only after the teacher confirms', async () => {
    const api = apiWith({ status: 'open', uploadToken: FAKE_TOKEN });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin('/teste/6E2-26T1', api);
    const stan = (await screen.findByRole('rowheader', { name: 'Stan Eva' })).closest('tr')!;
    await userEvent.click(within(stan).getByRole('button', { name: 'Resetează' }));
    expect(api.resetSubmission).not.toHaveBeenCalled();
    await userEvent.click(within(stan).getByRole('button', { name: 'Resetează' }));
    expect(confirm).toHaveBeenLastCalledWith('Ștergi încărcarea elevului Stan Eva? Elevul o poate lua de la capăt.');
    expect(api.resetSubmission).toHaveBeenCalledWith(6);
    expect(await within(stan).findByText('Nu a trimis')).toBeInTheDocument();
  });

  it('reopens the uploads of a closed test', async () => {
    const api = apiWith({ status: 'done' });
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redeschide încărcarea' }));
    expect(api.reopenTest).toHaveBeenCalledWith('6E2-26T1');
  });

  it('renames the test', async () => {
    const api = apiWith();
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Redenumește testul' }));
    const input = screen.getByLabelText('Titlu nou');
    await userEvent.clear(input);
    await userEvent.type(input, 'Teză');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.renameTest).toHaveBeenCalledWith('6E2-26T1', 'Teză');
    expect(await screen.findByText(/^Teză/)).toBeInTheDocument();
  });

  it('deletes the test after the teacher confirms and goes to the test list', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/teste/6E2-26T1', api, <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge testul' }));
    expect(api.deleteTest).toHaveBeenCalledWith('6E2-26T1');
    await expectLocation(/^\/$/);
  });

  it('shows the notice that the new-test page passed along', async () => {
    renderAdmin({ pathname: '/teste/6E2-26T1', state: { notice: 'Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat.' } }, apiWith());
    expect(await screen.findByRole('alert')).toHaveTextContent('Testul a fost creat, dar fișierul Test.pdf nu s-a încărcat.');
  });
});

describe('refreshInterval', () => {
  it('asks for news every 10 seconds only while uploads or grading go on', () => {
    expect(refreshInterval('open')).toBe(10_000);
    expect(refreshInterval('evaluating')).toBe(10_000);
    expect(refreshInterval('draft')).toBe(false);
    expect(refreshInterval('done')).toBe(false);
    expect(refreshInterval(undefined)).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to see it fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, no tests run: `Failed to resolve import "./TestPage.tsx"`.

- [ ] **Step 5: Create `src/admin/testPage/UploadLink.tsx`**

```tsx
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';

// The address students open: https://<host>/u/<token>.
export function uploadLink(token: string): string {
  return `${window.location.origin}/u/${token}`;
}

// The link for the students: the address with a Copy button, a QR code, and a
// full-screen QR code for the class projector.
export function UploadLink({ token }: { token: string }) {
  const url = uploadLink(token);
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const [fullScreen, setFullScreen] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <div className="upload-link">
      <label htmlFor="upload-url">Linkul pentru elevi</label>
      <div className="form-row">
        <input id="upload-url" type="text" value={url} readOnly onFocus={(event) => event.target.select()} />
        <button type="button" className="button button-small" onClick={copy}>
          Copiază linkul
        </button>
        {copied === 'yes' && <span role="status">Copiat!</span>}
        {copied === 'failed' && <span role="status">Nu am putut copia. Selectează linkul și copiază-l de mână.</span>}
      </div>
      <QRCodeSVG value={url} size={200} marginSize={4} title="Codul QR al linkului" className="qr" />
      <p>
        <button type="button" className="button-quiet button-small" onClick={() => setFullScreen(true)}>
          Arată codul QR pe tot ecranul
        </button>
      </p>
      {fullScreen && <QrOverlay url={url} onClose={() => setFullScreen(false)} />}
    </div>
  );
}

// The QR code as big as the screen allows. Escape or the button closes it.
function QrOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="qr-overlay" role="dialog" aria-modal="true" aria-label="Codul QR pentru elevi">
      <QRCodeSVG value={url} size={1024} marginSize={4} title="Codul QR al linkului" className="qr-big" />
      <p className="qr-url">{url}</p>
      <button ref={close} type="button" className="button" onClick={onClose}>
        Închide
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/admin/testPage/TestFiles.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { TestInfo } from '../../../shared/api.ts';
import type { TestFileKind } from '../../../shared/files.ts';
import { testFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { TestFileInput } from '../TestFileInput.tsx';

const NAMES: Record<TestFileKind, { title: string; upload: string; replace: string }> = {
  test: { title: 'Testul', upload: 'Încarcă testul', replace: 'Înlocuiește testul' },
  barem: { title: 'Baremul', upload: 'Încarcă baremul', replace: 'Înlocuiește baremul' },
};

// The test and the barem: open them, upload them, or replace them. Not while
// the test is being graded.
export function TestFiles({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const locked = test.status === 'evaluating';
  return (
    <>
      <h2>Fișiere</h2>
      {locked && <p className="hint">Testul se corectează acum. Poți schimba fișierele după ce se termină corectarea.</p>}
      <ul className="file-list">
        <TestFileRow code={test.code} kind="test" file={test.files.test} locked={locked} onChanged={onChanged} />
        <TestFileRow code={test.code} kind="barem" file={test.files.barem} locked={locked} onChanged={onChanged} />
      </ul>
    </>
  );
}

function TestFileRow({
  code,
  kind,
  file,
  locked,
  onChanged,
}: {
  code: string;
  kind: TestFileKind;
  file: TestInfo['files'][TestFileKind];
  locked: boolean;
  onChanged: () => Promise<void>;
}) {
  const api = useApi();
  // A new key empties the file input after each upload.
  const [round, setRound] = useState(0);
  const upload = useMutation({
    mutationFn: (picked: File) => api.uploadTestFile(code, kind, picked),
    onSuccess: async () => {
      setRound((value) => value + 1);
      await onChanged();
    },
  });
  const names = NAMES[kind];

  return (
    <li>
      <strong>{names.title}:</strong>{' '}
      {file ? (
        <a href={testFileUrl(code, kind)} target="_blank" rel="noopener">
          {file.name}
        </a>
      ) : (
        <span className="hint">lipsește</span>
      )}
      <TestFileInput
        key={round}
        id={`file-${kind}`}
        label={file ? names.replace : names.upload}
        disabled={locked || upload.isPending}
        onPick={(picked) => {
          if (picked) upload.mutate(picked);
        }}
      />
      {upload.isPending && <p role="status">Se încarcă…</p>}
      {upload.error && <ErrorMessage error={upload.error} />}
    </li>
  );
}
```

- [ ] **Step 7: Create `src/admin/testPage/UploadsTable.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { UploadRow } from '../../../shared/api.ts';
import { formatDateTime, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// Who uploaded what: one row per student of the class.
export function UploadsTable({ code, uploads, onChanged }: { code: string; uploads: UploadRow[]; onChanged: () => Promise<void> }) {
  if (uploads.length === 0) return <p className="hint">Clasa nu are elevi. Adaugă-i din pagina clasei.</p>;
  return (
    <div className="table-wrap">
      <table className="uploads">
        <caption className="sr-only">Încărcările elevilor</caption>
        <thead>
          <tr>
            <th scope="col">Elev</th>
            <th scope="col">Stare</th>
            <th scope="col">Fișiere</th>
            <th scope="col">Ora</th>
            <th scope="col">
              <span className="sr-only">Acțiuni</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((row) => (
            <UploadTableRow key={row.studentId} code={code} row={row} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadTableRow({ code, row, onChanged }: { code: string; row: UploadRow; onChanged: () => Promise<void> }) {
  const api = useApi();
  const reset = useMutation({
    mutationFn: (submissionId: number) => api.resetSubmission(submissionId),
    onSuccess: onChanged,
  });
  const time = row.submittedAt ?? row.startedAt;
  const submissionId = row.submissionId;

  return (
    <tr className={row.status === 'none' ? 'is-muted' : undefined}>
      <th scope="row">
        {row.studentName}
        {!row.active && <span className="tag">a plecat</span>}
      </th>
      <td>
        {uploadStatusLabel(row.status)}
        {row.autoSubmitted && <span className="tag">Fără confirmare</span>}
      </td>
      <td>{row.fileCount}</td>
      <td>{time ? formatDateTime(time) : '—'}</td>
      <td>
        {submissionId !== null && (
          <span className="row-actions">
            <Link to={`/teste/${code}/elevi/${submissionId}`}>Vezi fișierele</Link>
            <button
              type="button"
              className="button-quiet button-small"
              disabled={reset.isPending}
              onClick={() => {
                if (window.confirm(`Ștergi încărcarea elevului ${row.studentName}? Elevul o poate lua de la capăt.`)) {
                  reset.mutate(submissionId);
                }
              }}
            >
              Resetează
            </button>
          </span>
        )}
        {reset.error && <ErrorMessage error={reset.error} />}
      </td>
    </tr>
  );
}
```

- [ ] **Step 8: Create `src/admin/pages/TestPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { TestInfo } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { MAX_TITLE_LENGTH, normalizeTestCode, type TestStatus } from '../../../shared/tests.ts';
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { StatusChip } from '../StatusChip.tsx';
import { TestFiles } from '../testPage/TestFiles.tsx';
import { UploadLink } from '../testPage/UploadLink.tsx';
import { UploadsTable } from '../testPage/UploadsTable.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// While students upload (and later while the robot grades), the page asks for
// news every 10 seconds.
export function refreshInterval(status: TestStatus | undefined): number | false {
  return status === 'open' || status === 'evaluating' ? 10_000 : false;
}

export function TestPage() {
  const code = normalizeTestCode(useParams().code ?? '');
  if (code === null) return <NotFoundPage />;
  return <TestDetails key={code} code={code} />;
}

function TestDetails({ code }: { code: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const detail = useQuery({
    queryKey: ['test', code],
    queryFn: () => api.getTest(code),
    refetchInterval: (query) => refreshInterval(query.state.data?.test.status),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
    await queryClient.invalidateQueries({ queryKey: ['tests'] });
  };
  const remove = useMutation({
    mutationFn: () => api.deleteTest(code),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
      navigate('/');
    },
  });

  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;

  const { test, uploads } = detail.data;
  return (
    <section>
      <p>
        <Link to="/">← Toate testele</Link>
      </p>
      {notice && (
        <p className="alert" role="alert">
          {notice}
        </p>
      )}
      <div className="page-head">
        <h1>{test.code}</h1>
        <StatusChip status={test.status} />
      </div>
      <p className="lead-line">
        {test.title} · <Link to={`/clase/${test.classId}`}>{displayClassName(test.className)}</Link>
        {test.startedAt && ` · început ${formatDateTime(test.startedAt)}`}
      </p>
      <RenameTestForm code={code} currentTitle={test.title} onDone={refresh} />

      <TestFiles test={test} onChanged={refresh} />

      <h2>Încărcarea lucrărilor</h2>
      <TestActions test={test} onChanged={refresh} />

      <h2>
        Încărcări · trimise {test.submittedCount} din {test.studentCount}
      </h2>
      <UploadsTable code={code} uploads={uploads} onChanged={refresh} />

      <h2>Șterge testul</h2>
      <p className="hint">Se șterg și toate lucrările încărcate de elevi.</p>
      <button
        type="button"
        className="button-quiet button-danger"
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm(`Ștergi testul ${code}? Se șterg și toate lucrările încărcate.`)) remove.mutate();
        }}
      >
        Șterge testul
      </button>
      {remove.error && <ErrorMessage error={remove.error} />}
    </section>
  );
}

// What the teacher can do next, by the state of the test.
function TestActions({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
  const start = useMutation({ mutationFn: () => api.startTest(test.code), onSuccess: onChanged });
  const reopen = useMutation({ mutationFn: () => api.reopenTest(test.code), onSuccess: onChanged });

  if (test.status === 'draft') {
    return (
      <>
        <p className="hint">Elevii pot încărca lucrările după ce începi testul. Atunci apar linkul și codul QR.</p>
        <button type="button" className="button" disabled={start.isPending} onClick={() => start.mutate()}>
          Începe testul
        </button>
        {start.error && <ErrorMessage error={start.error} />}
      </>
    );
  }
  if (test.status === 'open' && test.uploadToken) return <UploadLink token={test.uploadToken} />;
  return (
    <>
      <p className="hint">Încărcarea este închisă. Dacă o redeschizi, elevii care nu au trimis pot încărca acum.</p>
      <button type="button" className="button-quiet" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
        Redeschide încărcarea
      </button>
      {reopen.error && <ErrorMessage error={reopen.error} />}
    </>
  );
}

function RenameTestForm({ code, currentTitle, onDone }: { code: string; currentTitle: string; onDone: () => Promise<void> }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(currentTitle);
  const rename = useMutation({
    mutationFn: () => api.renameTest(code, title),
    onSuccess: async () => {
      setOpen(false);
      await onDone();
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        className="button-quiet button-small"
        onClick={() => {
          setTitle(currentTitle);
          setOpen(true);
        }}
      >
        Redenumește testul
      </button>
    );
  }
  return (
    <form
      className="form-row"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        rename.mutate();
      }}
    >
      <label htmlFor="rename-test">Titlu nou</label>
      <input id="rename-test" type="text" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={MAX_TITLE_LENGTH} required />
      <button className="button button-small" type="submit" disabled={rename.isPending}>
        Salvează
      </button>
      <button type="button" className="button-quiet button-small" onClick={() => setOpen(false)}>
        Renunță
      </button>
      {rename.error && <ErrorMessage error={rename.error} />}
    </form>
  );
}
```

- [ ] **Step 9: Replace `src/admin/AppRoutes.tsx`**

```tsx
import { Route, Routes } from 'react-router';
import { Layout } from './Layout.tsx';
import { ClassesPage } from './pages/ClassesPage.tsx';
import { ClassPage } from './pages/ClassPage.tsx';
import { NewTestPage } from './pages/NewTestPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { TestPage } from './pages/TestPage.tsx';
import { TestsPage } from './pages/TestsPage.tsx';

// Paths are relative to the /admin basename set in App.tsx.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TestsPage />} />
        <Route path="teste/nou" element={<NewTestPage />} />
        <Route path="teste/:code" element={<TestPage />} />
        <Route path="clase" element={<ClassesPage />} />
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 10: Append to `src/ui/brand.css`**

```css
.lead-line {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

.file-list {
  display: grid;
  gap: 0.75rem;
  max-width: 44rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.file-list > li {
  display: grid;
  gap: 0.35rem;
  padding: 0.75rem 1rem;
  border: 1.5px solid var(--rule);
  border-radius: 0.75rem;
  background: var(--sheet);
}

.button-danger {
  color: var(--error-fg);
}

.button-danger:hover {
  border-color: var(--error-fg);
}

/* The upload link: the address, a QR code, and the projector view */

.upload-link input[type="text"] {
  flex: 1 1 18rem;
  min-width: 0;
}

.qr {
  display: block;
  width: 200px;
  height: 200px;
  margin-top: 0.5rem;
}

.qr-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
  background: #ffffff;
  color: #24272d;
}

.qr-big {
  width: min(85vw, 75vh);
  height: min(85vw, 75vh);
}

.qr-url {
  margin: 0;
  font-size: clamp(1rem, 0.6rem + 1.5vw, 1.8rem);
  font-weight: 700;
  word-break: break-all;
  text-align: center;
}

/* The uploads table */

.table-wrap {
  max-width: 100%;
  overflow-x: auto;
}

table.uploads {
  min-width: 36rem;
  border-collapse: collapse;
  background: var(--sheet);
}

table.uploads th,
table.uploads td {
  padding: 0.45rem 0.75rem;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  vertical-align: middle;
}

table.uploads thead th {
  color: var(--muted);
  font-size: 0.9rem;
}

table.uploads tbody th {
  font-weight: 700;
}

table.uploads tr.is-muted td {
  color: var(--muted);
}

table.uploads .tag {
  margin-left: 0.4rem;
}

.row-actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.75rem;
}
```

- [ ] **Step 11: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  31 passed (31)`, `Tests  285 passed (285)`.

- [ ] **Step 12: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json src
git commit -m "Add the test page: files, start, link and QR code, uploads table"
```

---

### Task 10: One student's files

`/teste/<code>/elevi/<submissionId>`: the student's name, the upload state and times, the photos inline, a link for each PDF, and reset. Plan 4 adds the graded result here.

**Files:**
- Create: `src/admin/pages/SubmissionPage.tsx`
- Modify: `src/admin/AppRoutes.tsx`, `src/ui/brand.css`
- Test: `src/admin/pages/SubmissionPage.test.tsx`

**Interfaces:**
- Consumes: `getSubmission`, `resetSubmission`, `submissionFileUrl` (Task 8); `formatFileSize`, `formatDateTime`, `uploadStatusLabel`.
- Produces: route `/teste/:code/elevi/:submissionId` → `SubmissionPage`. The page shows "not found" when the upload belongs to another test than the address names.

- [ ] **Step 1: Create `src/admin/pages/SubmissionPage.test.tsx`**

```tsx
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { createFakeApi, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

const submission: SubmissionDetail = {
  id: 5,
  testCode: '6E2-26T1',
  testTitle: 'Fracții',
  studentId: 10,
  studentName: 'Pop Ion',
  status: 'submitted',
  autoSubmitted: false,
  startedAt: '2026-10-06T07:20:00.000Z',
  submittedAt: '2026-10-06T07:40:00.000Z',
  files: [
    { id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 1 },
    { id: 22, name: 'scan.pdf', contentType: 'application/pdf', size: 1.5 * 1024 * 1024, position: 2 },
  ],
};

const apiWith = (detail: SubmissionDetail = submission) =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
    students: {},
    tests: [
      fakeTest({ status: 'open' }, [fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'submitted', fileCount: 2 })]),
    ],
    submissions: [detail],
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SubmissionPage', () => {
  it('shows the student, the upload state, and the times', async () => {
    renderAdmin('/teste/6E2-26T1/elevi/5', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.getByText(/6E2-26T1 · Fracții · Trimis/)).toBeInTheDocument();
    expect(screen.getByText('Început 6 oct. 2026, 10:20 · trimis 6 oct. 2026, 10:40')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 6E2-26T1' })).toHaveAttribute('href', '/teste/6E2-26T1');
  });

  it('shows photos inline and links PDFs, in upload order', async () => {
    renderAdmin('/teste/6E2-26T1/elevi/5', apiWith());
    const photo = await screen.findByRole('img', { name: 'Pagina 1' });
    expect(photo).toHaveAttribute('src', '/api/admin/submissions/5/files/21');
    expect(screen.getByText('Pagina 1: IMG_0001.jpg · 820 KB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Deschide PDF-ul' })).toHaveAttribute('href', '/api/admin/submissions/5/files/22');
    expect(screen.getByText('Pagina 2: scan.pdf · 1,5 MB')).toBeInTheDocument();
  });

  it('says so when the student has no files yet', async () => {
    renderAdmin('/teste/6E2-26T1/elevi/5', apiWith({ ...submission, status: 'uploading', submittedAt: null, files: [] }));
    expect(await screen.findByText('Elevul nu a încărcat încă niciun fișier.')).toBeInTheDocument();
  });

  it('resets the upload after the teacher confirms and goes back to the test', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/teste/6E2-26T1/elevi/5', api, <LocationProbe />);
    await userEvent.click(await screen.findByRole('button', { name: 'Resetează' }));
    expect(api.resetSubmission).toHaveBeenCalledWith(5);
    await expectLocation('/teste/6E2-26T1');
  });

  it('shows the not-found page for an upload id that is not a number', async () => {
    renderAdmin('/teste/6E2-26T1/elevi/abc', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('shows the not-found page when the upload belongs to another test', async () => {
    renderAdmin('/teste/6E2-26T9/elevi/5', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('shows the server message for an upload that does not exist', async () => {
    renderAdmin('/teste/6E2-26T1/elevi/99', apiWith());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run src/admin/pages/SubmissionPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  5 failed | 2 passed (7)`. The route does not exist yet, so the not-found page shows (`Unable to find role="heading" and name "Pop Ion"`). The two not-found checks pass already.

- [ ] **Step 3: Create `src/admin/pages/SubmissionPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import type { SubmissionFile } from '../../../shared/api.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { formatDateTime, formatFileSize, uploadStatusLabel } from '../../ui/format.ts';
import { submissionFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// /teste/:code/elevi/:submissionId: one student's pages, in upload order.
// Plan 4 adds the graded result next to them.
export function SubmissionPage() {
  const params = useParams();
  const code = normalizeTestCode(params.code ?? '');
  const submissionId = parsePositiveId(params.submissionId);
  if (code === null || submissionId === null) return <NotFoundPage />;
  return <SubmissionDetails key={submissionId} code={code} submissionId={submissionId} />;
}

function SubmissionDetails({ code, submissionId }: { code: string; submissionId: number }) {
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['submission', submissionId], queryFn: () => api.getSubmission(submissionId) });
  const reset = useMutation({
    mutationFn: () => api.resetSubmission(submissionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['test', code] });
      navigate(`/teste/${code}`);
    },
  });

  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.error) return <ErrorMessage error={detail.error} />;
  const submission = detail.data;
  // The address names another test than the upload belongs to.
  if (submission.testCode !== code) return <NotFoundPage />;

  return (
    <section>
      <p>
        <Link to={`/teste/${code}`}>← {code}</Link>
      </p>
      <h1>{submission.studentName}</h1>
      <p className="lead-line">
        {submission.testCode} · {submission.testTitle} · {uploadStatusLabel(submission.status)}
        {submission.autoSubmitted && <span className="tag">Fără confirmare</span>}
      </p>
      <p className="hint">
        Început {formatDateTime(submission.startedAt)}
        {submission.submittedAt && ` · trimis ${formatDateTime(submission.submittedAt)}`}
      </p>

      <h2>Fișiere ({submission.files.length})</h2>
      {submission.files.length === 0 ? (
        <p className="hint">Elevul nu a încărcat încă niciun fișier.</p>
      ) : (
        <ol className="page-files">
          {submission.files.map((file) => (
            <PageFile key={file.id} submissionId={submissionId} file={file} />
          ))}
        </ol>
      )}

      <h2>Resetează încărcarea</h2>
      <p className="hint">Se șterg fișierele, iar elevul poate lua încărcarea de la capăt, și de pe alt telefon.</p>
      <button
        type="button"
        className="button-quiet button-danger"
        disabled={reset.isPending}
        onClick={() => {
          if (window.confirm(`Ștergi încărcarea elevului ${submission.studentName}? Elevul o poate lua de la capăt.`)) reset.mutate();
        }}
      >
        Resetează
      </button>
      {reset.error && <ErrorMessage error={reset.error} />}
    </section>
  );
}

function PageFile({ submissionId, file }: { submissionId: number; file: SubmissionFile }) {
  const url = submissionFileUrl(submissionId, file.id);
  const caption = `Pagina ${file.position}: ${file.name} · ${formatFileSize(file.size)}`;
  if (file.contentType.startsWith('image/')) {
    return (
      <li>
        <a href={url} target="_blank" rel="noopener">
          <img src={url} alt={`Pagina ${file.position}`} loading="lazy" />
        </a>
        <p className="hint">{caption}</p>
      </li>
    );
  }
  return (
    <li>
      <a href={url} target="_blank" rel="noopener">
        Deschide PDF-ul
      </a>
      <p className="hint">{caption}</p>
    </li>
  );
}
```

- [ ] **Step 4: Replace `src/admin/AppRoutes.tsx`**

```tsx
import { Route, Routes } from 'react-router';
import { Layout } from './Layout.tsx';
import { ClassesPage } from './pages/ClassesPage.tsx';
import { ClassPage } from './pages/ClassPage.tsx';
import { NewTestPage } from './pages/NewTestPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { SubmissionPage } from './pages/SubmissionPage.tsx';
import { TestPage } from './pages/TestPage.tsx';
import { TestsPage } from './pages/TestsPage.tsx';

// Paths are relative to the /admin basename set in App.tsx.
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TestsPage />} />
        <Route path="teste/nou" element={<NewTestPage />} />
        <Route path="teste/:code" element={<TestPage />} />
        <Route path="teste/:code/elevi/:submissionId" element={<SubmissionPage />} />
        <Route path="clase" element={<ClassesPage />} />
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 5: Append to `src/ui/brand.css`**

```css
/* A student's pages */

.page-files {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 1rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.page-files > li {
  padding: 0.5rem;
  border: 1.5px solid var(--rule);
  border-radius: 0.75rem;
  background: var(--sheet);
}

.page-files img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 0.4rem;
}

.page-files .hint {
  margin-top: 0.35rem;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 6: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  32 passed (32)`, `Tests  292 passed (292)`.

- [ ] **Step 7: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "Add the page with one student's uploaded files"
```

---

### Task 11: Student app: link page, names, and the phone's secret

The third Vite entry, `u/index.html`, serves `/u/<token>`. The app loads the link, shows the test and the class list, asks "Ești <nume>?", starts or resumes the upload, and keeps the phone's secret in localStorage. A closed test or a wrong link gets a Romanian message. The upload screen is a first, short version; Task 12 replaces it.

**Files:**
- Create: `u/index.html`, `src/ui/ApiError.ts`, `src/upload/api.ts`, `src/upload/session.ts`, `src/upload/UploadApp.tsx`, `src/upload/NamePicker.tsx`, `src/upload/UploadScreen.tsx`, `src/upload/main.tsx`, `src/test/fakeUploadApi.ts`, `src/test/gradingWords.ts`
- Modify: `vite.config.ts`, `public/_redirects`, `src/admin/api.ts`, `src/ui/brand.css`
- Test: `src/upload/api.test.ts`, `src/upload/session.test.ts`, `src/upload/UploadApp.test.tsx`

**Interfaces:**
- Consumes: `LinkInfo`, `SessionStart`, `UploadSession`, `SubmissionFile` (Task 7); `isUploadToken`; `ErrorBoundary` (Task 2); `BrandMark`.
- Produces:
  - `src/ui/ApiError.ts`: `ApiError` (moved here; `src/admin/api.ts` re-exports it), `NETWORK_MESSAGE`, `BAD_RESPONSE_MESSAGE`, `GENERIC_MESSAGE`, `messageOf(error)`, `readAnswer<T>(res)`.
  - `src/upload/api.ts`: `UploadApi` (`getLink`, `startSession`, `getSession`, `uploadFile(token, secret, blob, name, onProgress)`, `deleteFile`, `confirm`, `fileBlob`), `ActiveSession`, `UploadRequest`, `createUploadClient(options?)` (XMLHttpRequest for upload progress).
  - `src/upload/session.ts`: `saveSecret`, `loadSecret`, `forgetSecret` (key `qe.session.<token>.<studentId>`), `savedStudent(token, students)`.
  - `UploadApp({ api, token })`, `UNKNOWN_LINK` in `src/upload/UploadApp.tsx`; `NamePicker({ students, message, onPick })`; `UploadScreen({ api, token, session, onSent, onLost })`.
  - Test helpers: `createFakeUploadApi(info?)` (with `seedSession`, `dropSession`), `linkInfo(overrides?)`, `LINK_TOKEN`; `expectNoGradingWords(text?)`.

- [ ] **Step 1: Create `src/test/gradingWords.ts`**

```ts
import { expect } from 'vitest';

// No student page may tell students how their work is graded. "AI" is checked
// in capitals only: "ai" is a common Romanian word ("you have").
export function expectNoGradingWords(text: string = document.body.textContent ?? ''): void {
  expect(text).not.toMatch(/\bAI\b/);
  expect(text.toLowerCase()).not.toMatch(/inteligen|claude|robot|automat/);
}
```

- [ ] **Step 2: Create `src/test/fakeUploadApi.ts`**

```ts
import { vi } from 'vitest';
import type { LinkInfo, SubmissionFile } from '../../shared/api.ts';
import { ApiError } from '../ui/ApiError.ts';
import type { UploadApi } from '../upload/api.ts';

// An in-memory UploadApi for student-app tests. Every method is a vi.fn, so
// tests can check calls or replace one answer with mockRejectedValueOnce.

export const LINK_TOKEN = 'abcdefghijkmnop2';

export function linkInfo(overrides: Partial<LinkInfo['test']> = {}): LinkInfo {
  return {
    test: { code: '6E2-26T1', title: 'Fracții', className: '6E2', status: 'open', ...overrides },
    students: [
      { id: 10, name: 'Ionescu Ana', state: 'none' },
      { id: 11, name: 'Pop Ion', state: 'none' },
      { id: 12, name: 'Stan Eva', state: 'done' },
    ],
  };
}

interface FakeSession {
  studentId: number;
  secret: string;
  files: SubmissionFile[];
  sent: boolean;
}

export function createFakeUploadApi(info: LinkInfo = linkInfo()) {
  const sessions: FakeSession[] = [];
  let nextFileId = 100;
  const noSession = () => new ApiError(401, 'no_session', 'Încărcarea nu mai este valabilă. Alege-ți din nou numele.');
  const bySecret = (secret: string) => {
    const found = sessions.find((s) => s.secret === secret);
    if (!found) throw noSession();
    return found;
  };
  const view = (session: FakeSession) => ({
    submissionId: session.studentId + 1000,
    studentId: session.studentId,
    studentName: info.students.find((s) => s.id === session.studentId)?.name ?? '',
    status: session.sent ? ('submitted' as const) : ('uploading' as const),
    files: [...session.files],
  });

  const api = {
    getLink: vi.fn(async (_token: string) => structuredClone(info)),
    startSession: vi.fn(async (_token: string, studentId: number, secret: string | null) => {
      const student = info.students.find((s) => s.id === studentId);
      if (!student) throw new ApiError(404, 'unknown_student', 'Nu am găsit numele tău în listă.');
      if (student.state === 'done') throw new ApiError(409, 'already_submitted', 'Lucrarea ta a fost deja trimisă.');
      const existing = sessions.find((s) => s.studentId === studentId);
      if (existing) {
        if (existing.secret !== secret) {
          throw new ApiError(409, 'other_device', 'Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.');
        }
        return { session: view(existing) };
      }
      const created = { studentId, secret: `secret-${studentId}`, files: [], sent: false };
      sessions.push(created);
      student.state = 'in_progress';
      return { secret: created.secret, session: view(created) };
    }),
    getSession: vi.fn(async (_token: string, secret: string) => view(bySecret(secret))),
    uploadFile: vi.fn(async (_token: string, secret: string, file: Blob, name: string, onProgress: (sent: number) => void) => {
      const session = bySecret(secret);
      onProgress(1);
      const stored = { id: nextFileId++, name, contentType: file.type, size: file.size, position: session.files.length + 1 };
      session.files.push(stored);
      return stored;
    }),
    deleteFile: vi.fn(async (_token: string, secret: string, fileId: number) => {
      const session = bySecret(secret);
      session.files = session.files.filter((f) => f.id !== fileId);
    }),
    confirm: vi.fn(async (_token: string, secret: string) => {
      const session = bySecret(secret);
      session.sent = true;
      const student = info.students.find((s) => s.id === session.studentId);
      if (student) student.state = 'done';
      return { fileCount: session.files.length };
    }),
    fileBlob: vi.fn(async (_token: string, _secret: string, _fileId: number) => new Blob(['jpeg'], { type: 'image/jpeg' })),
    // Test helper: an upload this phone started before (for example before a reload).
    seedSession(studentId: number, files: SubmissionFile[] = []) {
      sessions.push({ studentId, secret: `secret-${studentId}`, files, sent: false });
      const student = info.students.find((s) => s.id === studentId);
      if (student) student.state = 'in_progress';
    },
    // Test helper: the teacher reset this student's upload.
    dropSession(studentId: number) {
      const index = sessions.findIndex((s) => s.studentId === studentId);
      if (index >= 0) sessions.splice(index, 1);
      const student = info.students.find((s) => s.id === studentId);
      if (student) student.state = 'none';
    },
  } satisfies UploadApi & Record<string, unknown>;
  return api;
}

export type FakeUploadApi = ReturnType<typeof createFakeUploadApi>;
```

- [ ] **Step 3: Create `src/upload/api.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { createUploadClient, type UploadRequest } from './api.ts';

const TOKEN = 'abcdefghijkmnop2';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// A stand-in for XMLHttpRequest that records what it was given and answers
// when the test calls finish() or fail().
class FakeRequest implements UploadRequest {
  upload: UploadRequest['upload'] = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: Blob | null = null;
  private answerType = '';

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader(name: string) {
    return name.toLowerCase() === 'content-type' ? this.answerType : null;
  }
  send(body: Blob) {
    this.body = body;
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true });
  }
  finish(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.answerType = 'application/json';
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
}

describe('createUploadClient', () => {
  it('asks for the link page without a session', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { test: {}, students: [] }));
    await createUploadClient({ fetchImpl }).getLink(TOKEN);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/u/${TOKEN}`);
    expect(init!.method).toBe('GET');
    expect(init!.headers).not.toHaveProperty('X-Upload-Session');
  });

  it('sends the saved secret when it starts a session', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { session: { files: [] } }));
    await createUploadClient({ fetchImpl }).startSession(TOKEN, 10, 'saved-secret');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/u/${TOKEN}/sessions`);
    expect(init!.body).toBe(JSON.stringify({ studentId: 10 }));
    expect(init!.headers).toMatchObject({ 'X-Upload-Session': 'saved-secret', 'Content-Type': 'application/json' });
  });

  it('turns an error answer into an ApiError with the server message', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(409, { error: 'other_device', message: 'Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.' }),
    );
    const error = await createUploadClient({ fetchImpl })
      .startSession(TOKEN, 10, null)
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'other_device' });
  });

  it('reports a dropped connection in Romanian', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(createUploadClient({ fetchImpl }).getLink(TOKEN)).rejects.toMatchObject({
      code: 'network',
      message: 'Nu mă pot conecta la server. Verifică internetul și încearcă din nou.',
    });
  });

  it('uploads a file raw, with progress, and returns the stored file', async () => {
    const request = new FakeRequest();
    const client = createUploadClient({ newRequest: () => request });
    const photo = new Blob(['jpeg'], { type: 'image/jpeg' });
    const progress: number[] = [];
    const done = client.uploadFile(TOKEN, 'secret', photo, 'Poză 1.jpg', (sent) => progress.push(sent));

    expect(request.method).toBe('PUT');
    expect(request.url).toBe(`/api/u/${TOKEN}/files`);
    expect(request.headers).toEqual({ 'Content-Type': 'image/jpeg', 'X-File-Name': 'Poz%C4%83%201.jpg', 'X-Upload-Session': 'secret' });
    expect(request.body).toBe(photo);
    request.progress(50, 100);
    request.progress(100, 100);
    const file = { id: 3, name: 'Poză 1.jpg', contentType: 'image/jpeg', size: 4, position: 1 };
    request.finish(201, { file });
    expect(await done).toEqual(file);
    expect(progress).toEqual([0.5, 1]);
  });

  it('reports a refused upload with the server message, and a dropped one as a network error', async () => {
    const refused = new FakeRequest();
    const first = createUploadClient({ newRequest: () => refused }).uploadFile(TOKEN, 's', new Blob(['x']), 'a.heic', () => {});
    refused.finish(415, { error: 'bad_file_type', message: 'Trimite poze JPG sau PDF.' });
    await expect(first).rejects.toMatchObject({ status: 415, message: 'Trimite poze JPG sau PDF.' });

    const dropped = new FakeRequest();
    const second = createUploadClient({ newRequest: () => dropped }).uploadFile(TOKEN, 's', new Blob(['x']), 'a.jpg', () => {});
    dropped.fail();
    await expect(second).rejects.toMatchObject({ code: 'network' });
  });

  it('names the routes for files and for the confirmation', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { fileCount: 2, session: {} }));
    const client = createUploadClient({ fetchImpl });
    await client.getSession(TOKEN, 's');
    await client.deleteFile(TOKEN, 's', 7);
    await client.confirm(TOKEN, 's');
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init!.method} ${String(url)}`)).toEqual([
      `GET /api/u/${TOKEN}/files`,
      `DELETE /api/u/${TOKEN}/files/7`,
      `POST /api/u/${TOKEN}/confirm`,
    ]);
  });

  it('downloads a sent file with the session secret', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response('jpeg bytes', { status: 200 }));
    const blob = await createUploadClient({ fetchImpl }).fileBlob(TOKEN, 's', 7);
    expect(await blob.text()).toBe('jpeg bytes');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/u/${TOKEN}/files/7`);
    expect(init!.headers).toEqual({ 'X-Upload-Session': 's' });
  });
});
```

- [ ] **Step 4: Create `src/upload/session.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetSecret, loadSecret, saveSecret, savedStudent } from './session.ts';

const TOKEN = 'abcdefghijkmnop2';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('session secrets', () => {
  it('keeps one secret per link and student', () => {
    saveSecret(TOKEN, 10, 'secret-10');
    expect(loadSecret(TOKEN, 10)).toBe('secret-10');
    expect(localStorage.getItem(`qe.session.${TOKEN}.10`)).toBe('secret-10');
    expect(loadSecret(TOKEN, 11)).toBeNull();
    expect(loadSecret('otherlinktoken22', 10)).toBeNull();
    forgetSecret(TOKEN, 10);
    expect(loadSecret(TOKEN, 10)).toBeNull();
  });

  it('works without errors when the storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveSecret(TOKEN, 10, 's')).not.toThrow();
    expect(loadSecret(TOKEN, 10)).toBeNull();
  });

  it('finds the student whose upload this phone started', () => {
    saveSecret(TOKEN, 11, 's');
    saveSecret(TOKEN, 12, 's');
    const students = [
      { id: 10, name: 'Ionescu Ana', state: 'in_progress' as const },
      { id: 11, name: 'Pop Ion', state: 'in_progress' as const },
      { id: 12, name: 'Stan Eva', state: 'done' as const },
    ];
    expect(savedStudent(TOKEN, students)?.id).toBe(11);
    expect(savedStudent(TOKEN, students.slice(2))).toBeNull();
  });
});
```

- [ ] **Step 5: Create `src/upload/UploadApp.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeUploadApi, LINK_TOKEN, linkInfo } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { saveSecret } from './session.ts';
import { UploadApp } from './UploadApp.tsx';

describe('UploadApp', () => {
  it('shows the test and the class list, with ✓ for students who already sent', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Fracții' })).toBeInTheDocument();
    expect(screen.getByText('Clasa 6E2 · 6E2-26T1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pop Ion' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stan Eva, a trimis' })).toBeDisabled();
    expectNoGradingWords();
  });

  it('starts the upload after the student confirms the name, and keeps the secret', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    expect(screen.getByRole('heading', { name: 'Ești Pop Ion?' })).toBeInTheDocument();
    expectNoGradingWords();
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    expect(api.startSession).toHaveBeenCalledWith(LINK_TOKEN, 11, null);
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(localStorage.getItem(`qe.session.${LINK_TOKEN}.11`)).toBe('secret-11');
  });

  it('goes back to the list when the student says it is not their name', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Nu, aleg alt nume' }));
    expect(screen.getByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expect(api.startSession).not.toHaveBeenCalled();
  });

  it('shows the server message when another phone holds the upload', async () => {
    const api = createFakeUploadApi();
    api.seedSession(11);
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.');
    expect(screen.getByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
  });

  it('goes straight back to an upload this phone started', async () => {
    const api = createFakeUploadApi();
    api.seedSession(11);
    saveSecret(LINK_TOKEN, 11, 'secret-11');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(api.startSession).toHaveBeenCalledWith(LINK_TOKEN, 11, 'secret-11');
  });

  it('says the uploads are closed once the test is closed', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'evaluating' }), students: [] });
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Încărcarea s-a închis.');
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('shows a wrong-link message for an address without a valid token, without asking the server', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={null} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Link greșit. Cere profesorului linkul nou.');
    expect(api.getLink).not.toHaveBeenCalled();
  });

  it('shows the server message for an unknown link', async () => {
    const api = createFakeUploadApi();
    api.getLink.mockRejectedValueOnce(new ApiError(404, 'unknown_link', 'Link greșit. Cere profesorului linkul nou.'));
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Link greșit. Cere profesorului linkul nou.');
  });
});
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run src/upload`
Expected: FAIL. `Test Files  3 failed (3)`, no tests run: `Failed to resolve import "../ui/ApiError.ts"` (in `api.test.ts` and `UploadApp.test.tsx`) and `Failed to resolve import "./session.ts"`.

- [ ] **Step 7: Create `src/ui/ApiError.ts`**

```ts
// An error answer from the API, with its Romanian message. Both apps use it.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const NETWORK_MESSAGE = 'Nu mă pot conecta la server. Verifică internetul și încearcă din nou.';
export const BAD_RESPONSE_MESSAGE = 'Serverul nu a răspuns corect. Încearcă din nou.';
export const GENERIC_MESSAGE = 'A apărut o eroare. Încearcă din nou.';

// The Romanian text of a failed request; a generic one for errors that did
// not come from the API, so the browser's English text never shows.
export function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERIC_MESSAGE;
}

// Turns a JSON answer into its data, or into an ApiError with the server's message.
export async function readAnswer<T>(res: Response): Promise<T> {
  if (!(res.headers.get('Content-Type') ?? '').includes('application/json')) {
    throw new ApiError(res.status, 'bad_response', BAD_RESPONSE_MESSAGE);
  }
  let data: { error?: string; message?: string };
  try {
    data = (await res.json()) as { error?: string; message?: string };
  } catch {
    throw new ApiError(res.status, 'bad_response', BAD_RESPONSE_MESSAGE);
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? GENERIC_MESSAGE);
  return data as T;
}
```

- [ ] **Step 8: Replace `src/admin/api.ts`**

The teacher client now reads JSON answers with the shared `readAnswer`; its behaviour and its tests do not change.

```ts
import type {
  ClassDetail,
  ClassSummary,
  CreateClassInput,
  CreateTestInput,
  StartedTest,
  StudentRow,
  SubmissionDetail,
  Teacher,
  TestDetail,
  TestFileInfo,
  TestSummary,
  UpdateClassInput,
} from '../../shared/api.ts';
import { uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
import { ApiError, NETWORK_MESSAGE, readAnswer } from '../ui/ApiError.ts';

export { ApiError };

// Everything the teacher app asks the server. Pages get it from useApi(), so
// tests can pass a fake.
export interface AdminApi {
  me(): Promise<Teacher>;
  listClasses(schoolYear: number): Promise<ClassSummary[]>;
  createClass(input: CreateClassInput): Promise<ClassSummary>;
  getClass(classId: number): Promise<ClassDetail>;
  updateClass(classId: number, input: UpdateClassInput): Promise<ClassSummary>;
  addStudents(classId: number, names: string[]): Promise<StudentRow[]>;
  setStudentActive(classId: number, studentId: number, active: boolean): Promise<StudentRow>;
  renameStudent(studentId: number, fullName: string): Promise<{ id: number; fullName: string }>;
  listTests(schoolYear: number): Promise<TestSummary[]>;
  // Returns the code of the new test.
  createTest(input: CreateTestInput): Promise<string>;
  getTest(code: string): Promise<TestDetail>;
  renameTest(code: string, title: string): Promise<{ code: string; title: string }>;
  deleteTest(code: string): Promise<void>;
  uploadTestFile(code: string, kind: TestFileKind, file: File): Promise<TestFileInfo>;
  startTest(code: string): Promise<StartedTest>;
  reopenTest(code: string): Promise<void>;
  getSubmission(submissionId: number): Promise<SubmissionDetail>;
  resetSubmission(submissionId: number): Promise<void>;
}

// Files open straight from the API: the browser sends the Access login cookie.
export function testFileUrl(code: string, kind: TestFileKind): string {
  return `/api/admin/tests/${encodeURIComponent(code)}/files/${kind}`;
}

export function submissionFileUrl(submissionId: number, fileId: number): string {
  return `/api/admin/submissions/${submissionId}/files/${fileId}`;
}


// The Cloudflare Access login ended. The app reloads the page so Access shows
// its login screen.
export class LoginExpiredError extends Error {
  constructor() {
    super('Sesiunea a expirat. Reîncarcă pagina ca să intri din nou.');
  }
}

const RELOAD_KEY = 'quickeval.loginReloadAt';
const RELOAD_GAP_MS = 10_000;

// Reloads at most once per 10 seconds, so a broken login can never cause a reload loop.
// The parameters exist for tests; the defaults reload the real page.
export function reloadForLogin(reload: () => void = () => window.location.reload(), now: () => number = Date.now): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (now() - last < RELOAD_GAP_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(now()));
  } catch {
    return;
  }
  reload();
}

export interface ApiClientOptions {
  fetchImpl?: typeof fetch;
  onLoginExpired?: () => void;
}

export function createApiClient(options: ApiClientOptions = {}): AdminApi {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const onLoginExpired = options.onLoginExpired ?? reloadForLogin;

  // A JSON body, or a file sent raw with its type and URI-encoded name.
  async function request<T>(method: string, path: string, body?: unknown, file?: File): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let payload: BodyInit | undefined;
    if (file) {
      headers['Content-Type'] = uploadTypeOf(file) || 'application/octet-stream';
      headers['X-File-Name'] = encodeURIComponent(file.name);
      payload = file;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetchImpl(`/api/admin${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        // An expired Access session answers with a redirect to the login page on
        // another origin. 'manual' turns it into an opaqueredirect response here.
        redirect: 'manual',
        ...(payload === undefined ? {} : { body: payload }),
      });
    } catch {
      throw new ApiError(0, 'network', NETWORK_MESSAGE);
    }
    const isJson = (res.headers.get('Content-Type') ?? '').includes('application/json');
    if (res.type === 'opaqueredirect' || ((res.status === 401 || res.status === 403) && !isJson)) {
      onLoginExpired();
      throw new LoginExpiredError();
    }
    return readAnswer<T>(res);
  }

  const test = (code: string) => `/tests/${encodeURIComponent(code)}`;

  return {
    me: async () => (await request<{ teacher: Teacher }>('GET', '/me')).teacher,
    listClasses: async (schoolYear) =>
      (await request<{ classes: ClassSummary[] }>('GET', `/classes?year=${schoolYear}`)).classes,
    createClass: async (input) => (await request<{ class: ClassSummary }>('POST', '/classes', input)).class,
    getClass: (classId) => request<ClassDetail>('GET', `/classes/${classId}`),
    updateClass: async (classId, input) =>
      (await request<{ class: ClassSummary }>('PATCH', `/classes/${classId}`, input)).class,
    addStudents: async (classId, names) =>
      (await request<{ students: StudentRow[] }>('POST', `/classes/${classId}/students`, { names })).students,
    setStudentActive: async (classId, studentId, active) =>
      (await request<{ student: StudentRow }>('PATCH', `/classes/${classId}/students/${studentId}`, { active })).student,
    renameStudent: async (studentId, fullName) =>
      (await request<{ student: { id: number; fullName: string } }>('PATCH', `/students/${studentId}`, { fullName })).student,
    listTests: async (schoolYear) => (await request<{ tests: TestSummary[] }>('GET', `/tests?year=${schoolYear}`)).tests,
    createTest: async (input) => (await request<{ code: string }>('POST', '/tests', input)).code,
    getTest: (code) => request<TestDetail>('GET', test(code)),
    renameTest: (code, title) => request<{ code: string; title: string }>('PATCH', test(code), { title }),
    deleteTest: async (code) => {
      await request('DELETE', test(code));
    },
    uploadTestFile: async (code, kind, file) =>
      (await request<{ file: TestFileInfo }>('PUT', `${test(code)}/files/${kind}`, undefined, file)).file,
    startTest: (code) => request<StartedTest>('POST', `${test(code)}/start`),
    reopenTest: async (code) => {
      await request('POST', `${test(code)}/reopen`);
    },
    getSubmission: async (submissionId) =>
      (await request<{ submission: SubmissionDetail }>('GET', `/submissions/${submissionId}`)).submission,
    resetSubmission: async (submissionId) => {
      await request('POST', `/submissions/${submissionId}/reset`);
    },
  };
}
```

- [ ] **Step 9: Create `src/upload/api.ts`**

```ts
import type { LinkInfo, SessionStart, SubmissionFile, UploadSession } from '../../shared/api.ts';
import { ApiError, NETWORK_MESSAGE, readAnswer } from '../ui/ApiError.ts';

// Everything the student app asks the server. The page gets it as a prop, so
// tests can pass a fake.
export interface UploadApi {
  getLink(token: string): Promise<LinkInfo>;
  // `secret`: the one this phone saved for the student, if any.
  startSession(token: string, studentId: number, secret: string | null): Promise<SessionStart>;
  getSession(token: string, secret: string): Promise<UploadSession>;
  // onProgress gets the sent share of the file, from 0 to 1.
  uploadFile(token: string, secret: string, file: Blob, name: string, onProgress: (sent: number) => void): Promise<SubmissionFile>;
  deleteFile(token: string, secret: string, fileId: number): Promise<void>;
  confirm(token: string, secret: string): Promise<{ fileCount: number }>;
  // A file already sent, for its preview after a page reload.
  fileBlob(token: string, secret: string, fileId: number): Promise<Blob>;
}

// The student's upload on this phone: who it is, the secret, and the files sent so far.
export interface ActiveSession {
  studentId: number;
  studentName: string;
  secret: string;
  files: SubmissionFile[];
}

const SESSION_HEADER = 'X-Upload-Session';

// The parts of XMLHttpRequest the upload uses. Tests pass a fake.
export interface UploadRequest {
  upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  status: number;
  responseText: string;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  getResponseHeader(name: string): string | null;
  send(body: Blob): void;
}

export interface UploadClientOptions {
  fetchImpl?: typeof fetch;
  newRequest?: () => UploadRequest;
}

export function createUploadClient(options: UploadClientOptions = {}): UploadApi {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const newRequest = options.newRequest ?? (() => new XMLHttpRequest() as unknown as UploadRequest);
  const base = (token: string) => `/api/u/${encodeURIComponent(token)}`;

  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(url, { credentials: 'same-origin', ...init });
    } catch {
      throw new ApiError(0, 'network', NETWORK_MESSAGE);
    }
  }

  async function json<T>(method: string, url: string, secret: string | null, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (secret) headers[SESSION_HEADER] = secret;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await send(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return readAnswer<T>(res);
  }

  // XMLHttpRequest, because fetch cannot report upload progress.
  function upload(url: string, secret: string, file: Blob, name: string, onProgress: (sent: number) => void): Promise<SubmissionFile> {
    return new Promise((resolve, reject) => {
      const request = newRequest();
      request.open('PUT', url);
      request.setRequestHeader('Content-Type', file.type);
      request.setRequestHeader('X-File-Name', encodeURIComponent(name));
      request.setRequestHeader(SESSION_HEADER, secret);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
      };
      request.onerror = () => reject(new ApiError(0, 'network', NETWORK_MESSAGE));
      request.onload = () => {
        const answer = new Response(request.responseText, {
          status: request.status,
          headers: { 'Content-Type': request.getResponseHeader('Content-Type') ?? '' },
        });
        readAnswer<{ file: SubmissionFile }>(answer).then((data) => resolve(data.file), reject);
      };
      request.send(file);
    });
  }

  return {
    getLink: (token) => json<LinkInfo>('GET', base(token), null),
    startSession: (token, studentId, secret) => json<SessionStart>('POST', `${base(token)}/sessions`, secret, { studentId }),
    getSession: async (token, secret) => (await json<{ session: UploadSession }>('GET', `${base(token)}/files`, secret)).session,
    uploadFile: (token, secret, file, name, onProgress) => upload(`${base(token)}/files`, secret, file, name, onProgress),
    deleteFile: async (token, secret, fileId) => {
      await json('DELETE', `${base(token)}/files/${fileId}`, secret);
    },
    confirm: (token, secret) => json<{ fileCount: number }>('POST', `${base(token)}/confirm`, secret),
    fileBlob: async (token, secret, fileId) => {
      const res = await send(`${base(token)}/files/${fileId}`, { headers: { [SESSION_HEADER]: secret } });
      if (!res.ok) await readAnswer(res);
      return res.blob();
    },
  };
}
```

- [ ] **Step 10: Create `src/upload/session.ts`**

```ts
import type { LinkStudent } from '../../shared/api.ts';

// The secret that ties a student's upload to this phone (spec §10.3). It is
// kept in localStorage, so a reload or a closed tab can go on with the upload.
// Storage can be blocked; the secret then lasts until the page closes.

const key = (token: string, studentId: number) => `qe.session.${token}.${studentId}`;

export function saveSecret(token: string, studentId: number, secret: string): void {
  try {
    localStorage.setItem(key(token, studentId), secret);
  } catch {
    // Blocked storage: nothing to keep.
  }
}

export function loadSecret(token: string, studentId: number): string | null {
  try {
    return localStorage.getItem(key(token, studentId));
  } catch {
    return null;
  }
}

export function forgetSecret(token: string, studentId: number): void {
  try {
    localStorage.removeItem(key(token, studentId));
  } catch {
    // Blocked storage: nothing was kept.
  }
}

// A student whose upload this phone started and did not send yet: the app
// goes straight back to that upload.
export function savedStudent(token: string, students: LinkStudent[]): LinkStudent | null {
  return students.find((student) => student.state === 'in_progress' && loadSecret(token, student.id) !== null) ?? null;
}
```

- [ ] **Step 11: Create `src/upload/NamePicker.tsx`**

```tsx
import { useState } from 'react';
import type { LinkStudent } from '../../shared/api.ts';

// The class list. A tap on a name asks "Ești tu?" first, because the upload
// then belongs to that name on this phone. Names that already sent their
// upload show ✓ and cannot be picked.
export function NamePicker({
  students,
  message,
  onPick,
}: {
  students: LinkStudent[];
  message: string | null;
  onPick: (student: LinkStudent) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<LinkStudent | null>(null);
  const [busy, setBusy] = useState(false);

  if (chosen) {
    return (
      <section className="confirm-name">
        <h2>Ești {chosen.name}?</h2>
        <div className="big-actions">
          <button
            type="button"
            className="button button-big"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onPick(chosen);
              setBusy(false);
              setChosen(null);
            }}
          >
            Da, încep
          </button>
          <button type="button" className="button-quiet button-big" disabled={busy} onClick={() => setChosen(null)}>
            Nu, aleg alt nume
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2>Alege-ți numele</h2>
      {message && (
        <p className="alert" role="alert">
          {message}
        </p>
      )}
      {students.length === 0 ? (
        <p className="hint">Lista clasei este goală. Spune-i profesorului.</p>
      ) : (
        <ul className="name-list">
          {students.map((student) => (
            <li key={student.id}>
              <button
                type="button"
                className="name-button"
                disabled={student.state === 'done'}
                aria-label={student.state === 'done' ? `${student.name}, a trimis` : undefined}
                onClick={() => setChosen(student)}
              >
                {student.name}
                {student.state === 'done' && <span aria-hidden="true"> ✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 12: Create `src/upload/UploadScreen.tsx`**

```tsx
import type { ActiveSession, UploadApi } from './api.ts';

// The upload screen. Task 12 of Plan 2 replaces this first version with the
// photo and file upload.
export function UploadScreen({
  session,
}: {
  api: UploadApi;
  token: string;
  session: ActiveSession;
  onSent: (fileCount: number) => void;
  onLost: (message: string) => void;
}) {
  return (
    <section>
      <h2>{session.studentName}</h2>
      <p>Fișiere încărcate: {session.files.length}</p>
    </section>
  );
}
```

- [ ] **Step 13: Create `src/upload/UploadApp.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { LinkInfo, LinkStudent } from '../../shared/api.ts';
import { displayClassName } from '../../shared/classes.ts';
import { ApiError, GENERIC_MESSAGE, messageOf } from '../ui/ApiError.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import type { ActiveSession, UploadApi } from './api.ts';
import { NamePicker } from './NamePicker.tsx';
import { loadSecret, saveSecret, savedStudent } from './session.ts';
import { UploadScreen } from './UploadScreen.tsx';

export const UNKNOWN_LINK = 'Link greșit. Cere profesorului linkul nou.';

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed'; message: string }
  | { kind: 'closed'; info: LinkInfo }
  | { kind: 'names'; info: LinkInfo; message: string | null }
  | { kind: 'upload'; info: LinkInfo; session: ActiveSession }
  | { kind: 'sent'; info: LinkInfo; fileCount: number };

// The student app at /u/<token>: pick your name, add the pages, send them.
// `token` is null when the address holds no valid upload token.
export function UploadApp({ api, token }: { api: UploadApi; token: string | null }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  // Starts or resumes the upload of one student on this phone.
  const begin = useCallback(
    async (linkToken: string, info: LinkInfo, student: LinkStudent) => {
      const saved = loadSecret(linkToken, student.id);
      try {
        const started = await api.startSession(linkToken, student.id, saved);
        const secret = started.secret ?? saved;
        if (!secret) throw new ApiError(0, 'no_secret', GENERIC_MESSAGE);
        if (started.secret) saveSecret(linkToken, student.id, started.secret);
        setPhase({
          kind: 'upload',
          info,
          session: { studentId: student.id, studentName: started.session.studentName, secret, files: started.session.files },
        });
      } catch (err) {
        setPhase({ kind: 'names', info, message: messageOf(err) });
      }
    },
    [api],
  );

  // Loads the link page; `message` is shown above the names.
  const load = useCallback(
    async (message: string | null, isCurrent: () => boolean = () => true) => {
      if (!token) {
        setPhase({ kind: 'failed', message: UNKNOWN_LINK });
        return;
      }
      try {
        const info = await api.getLink(token);
        if (!isCurrent()) return;
        if (info.test.status !== 'open') {
          setPhase({ kind: 'closed', info });
          return;
        }
        const saved = message === null ? savedStudent(token, info.students) : null;
        if (saved) await begin(token, info, saved);
        else setPhase({ kind: 'names', info, message });
      } catch (err) {
        if (isCurrent()) setPhase({ kind: 'failed', message: messageOf(err) });
      }
    },
    [api, token, begin],
  );

  useEffect(() => {
    let current = true;
    void load(null, () => current);
    return () => {
      current = false;
    };
  }, [load]);

  return (
    <>
      <header className="site-header">
        <div className="wrap header-bar">
          <span className="brand">
            <BrandMark />
            <span className="brand-text">
              <span className="brand-name">QuickEval</span>
              <span className="brand-sub">Matematică cu Laura Miron</span>
            </span>
          </span>
        </div>
      </header>
      <main className="wrap upload-page">
        <ErrorBoundary>
          {phase.kind === 'loading' && <p>Se încarcă…</p>}
          {phase.kind === 'failed' && (
            <p className="alert" role="alert">
              {phase.message}
            </p>
          )}
          {phase.kind !== 'loading' && phase.kind !== 'failed' && <TestTitle info={phase.info} />}
          {phase.kind === 'closed' && (
            <>
              <p className="alert" role="alert">
                Încărcarea s-a închis.
              </p>
              <p className="hint">Dacă nu ai trimis lucrarea, spune-i profesorului.</p>
            </>
          )}
          {phase.kind === 'names' && token && (
            <NamePicker
              students={phase.info.students}
              message={phase.message}
              onPick={(student) => begin(token, phase.info, student)}
            />
          )}
          {phase.kind === 'upload' && token && (
            <UploadScreen
              api={api}
              token={token}
              session={phase.session}
              onSent={(fileCount) => setPhase({ kind: 'sent', info: phase.info, fileCount })}
              onLost={(message) => load(message)}
            />
          )}
          {phase.kind === 'sent' && (
            <section className="sent">
              <h2>Gata! Lucrarea ta a fost trimisă.</h2>
              <p>{phase.fileCount === 1 ? 'Ai trimis un fișier.' : `Ai trimis ${phase.fileCount} fișiere.`}</p>
            </section>
          )}
        </ErrorBoundary>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <p>QuickEval · Matematică cu Laura Miron</p>
        </div>
      </footer>
    </>
  );
}

function TestTitle({ info }: { info: LinkInfo }) {
  return (
    <>
      <h1>{info.test.title}</h1>
      <p className="hint">
        {displayClassName(info.test.className)} · {info.test.code}
      </p>
    </>
  );
}
```

- [ ] **Step 14: Create `src/upload/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isUploadToken } from '../../shared/tests.ts';
import '../ui/brand.css';
import { createUploadClient } from './api.ts';
import { UploadApp } from './UploadApp.tsx';

// /u/<token>: the token is the second part of the path.
const token = window.location.pathname.split('/')[2] ?? '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UploadApp api={createUploadClient()} token={isUploadToken(token) ? token : null} />
  </StrictMode>,
);
```

- [ ] **Step 15: Create `u/index.html`**

```html
<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>QuickEval · Trimite lucrarea</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <script src="/theme.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,700;0,800;1,400&family=Caveat:wght@600&display=swap"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/upload/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 16: Replace `vite.config.ts`**

```ts
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `npm run dev:api` serves the API (wrangler pages dev) here.
const API_ORIGIN = 'http://127.0.0.1:8788';

// The teacher app (/admin/) and the student app (/u/) are single-page apps. In
// dev, every page request under them gets their index.html, the same as
// public/_redirects does on Pages.
const APPS = ['/admin', '/u'];

function appFallback(): Plugin {
  return {
    name: 'quickeval-app-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        const app = APPS.find((base) => path === base || (path.startsWith(`${base}/`) && !path.includes('.')));
        if (app) req.url = `${app}/index.html`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), appFallback()],
  appType: 'mpa',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: page('./index.html'),
        admin: page('./admin/index.html'),
        upload: page('./u/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: API_ORIGIN,
        // Keep the browser's Host header. The API then sees the page's own
        // origin (localhost:5173) and accepts its writes (sameOriginWrites).
        changeOrigin: false,
      },
    },
  },
});
```

- [ ] **Step 17: Replace `public/_redirects`**

```text
# The teacher app and the student app are single-page apps: every /admin page
# loads /admin/ (admin/index.html), every /u/<token> page loads /u/
# (u/index.html). Keep this directory form: wrangler refuses
# "/admin/* /admin/index.html 200" as a redirect loop.
/admin/* /admin/ 200
/u/* /u/ 200
```

- [ ] **Step 18: Append to `src/ui/brand.css`**

```css
/* The student app: phone first, big touch targets (at least 44 px) */

.upload-page {
  max-width: 40rem;
  padding-block: 1.25rem 2.5rem;
}

.button-big {
  min-height: 3.25rem;
  padding-inline: 1.5rem;
  font-size: 1.1rem;
}

.big-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.name-list {
  display: grid;
  gap: 0.5rem;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
}

.name-button {
  width: 100%;
  min-height: 3rem;
  padding: 0.6rem 1rem;
  border: 1.5px solid var(--rule);
  border-radius: 0.75rem;
  background: var(--sheet);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.name-button:hover:not(:disabled) {
  border-color: var(--ink);
}

.sent {
  margin-top: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 0.75rem;
  background: var(--ok-bg);
  color: var(--ok-fg);
}

.sent h2 {
  margin-top: 0;
}
```

- [ ] **Step 19: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  35 passed (35)`, `Tests  311 passed (311)`.

- [ ] **Step 20: Run the typecheck and the build**

Run: `npm run build`
Expected: the typecheck passes and Vite writes `dist/index.html`, `dist/admin/index.html`, and `dist/u/index.html`, ending with `✓ built in …`.

- [ ] **Step 21: Commit**

```bash
git add u vite.config.ts public/_redirects src
git commit -m "Add the student app: link page, class list, and the phone's upload secret"
```

---

### Task 12: Student upload screen

Photo tips, "Fă o poză" (camera) and "Alege fișiere" (many files), photos made smaller on the phone, one upload at a time with a progress bar and a retry button, thumbnails with a full-screen view, delete, and "Am trimis tot".

**Files:**
- Create: `src/upload/shrink.ts`, `src/upload/PhotoViewer.tsx`
- Modify: `src/upload/UploadScreen.tsx`, `src/ui/brand.css`
- Test: `src/upload/shrink.test.ts`, `src/upload/UploadScreen.test.tsx` (new); `src/upload/UploadApp.test.tsx` (modified)

**Interfaces:**
- Consumes: `UploadApi`, `ActiveSession` (Task 11); `fileProblem`-style checks, `STUDENT_FILE_TYPES`, `MAX_STUDENT_FILES`, messages (Task 3); `formatFileSize` (Task 8).
- Produces:
  - `src/upload/shrink.ts`: `MAX_SIDE = 2000`, `JPEG_QUALITY = 0.85`, `fitWithin(width, height, max?)`, `jpegName(name)`, `PhotoTools`, `browserPhotoTools`, `shrinkPhoto(file, tools?): Promise<Blob>`.
  - `PhotoViewer({ src, label, onClose })`.
  - `UploadScreen` gains the optional prop `shrink?: (file: File) => Promise<Blob>` (tests pass one; the app uses `shrinkPhoto`).

- [ ] **Step 1: Create `src/upload/shrink.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { fitWithin, jpegName, shrinkPhoto, type PhotoTools } from './shrink.ts';

// Fake tools: a photo of the given size that encodes to `encodedBytes` bytes.
function tools(width: number, height: number, encodedBytes: number | null) {
  const close = vi.fn();
  const fake = {
    decode: vi.fn(async () => ({ width, height, source: {} as CanvasImageSource, close })),
    encode: vi.fn(async () => (encodedBytes === null ? null : new Blob([new Uint8Array(encodedBytes)], { type: 'image/jpeg' }))),
  } satisfies PhotoTools;
  return { fake, close };
}

const photo = (type: string, bytes: number, name = 'IMG_0001.jpg') => new File([new Uint8Array(bytes)], name, { type });

describe('fitWithin', () => {
  it('keeps the long side at most 2000 px and the shape the same', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 1000, height: 2000 });
    expect(fitWithin(1600, 1200)).toEqual({ width: 1600, height: 1200 });
  });
});

describe('jpegName', () => {
  it('gives the name a .jpg extension', () => {
    expect(jpegName('IMG_0001.PNG')).toBe('IMG_0001.jpg');
    expect(jpegName('scan.page.webp')).toBe('scan.page.jpg');
    expect(jpegName('.png')).toBe('poza.jpg');
  });
});

describe('shrinkPhoto', () => {
  it('makes a big photo a smaller JPEG of at most 2000 px', async () => {
    const { fake, close } = tools(4000, 3000, 500);
    const result = await shrinkPhoto(photo('image/jpeg', 3000), fake);
    expect(result.size).toBe(500);
    expect(result.type).toBe('image/jpeg');
    expect(fake.encode).toHaveBeenCalledWith(expect.anything(), { width: 2000, height: 1500 }, 0.85);
    expect(close).toHaveBeenCalled();
  });

  it('keeps a JPEG that would not get smaller', async () => {
    const { fake } = tools(1200, 900, 4000);
    const original = photo('image/jpeg', 3000);
    expect(await shrinkPhoto(original, fake)).toBe(original);
  });

  it('turns a PNG or WebP photo into a JPEG even when it grows', async () => {
    const { fake } = tools(1200, 900, 4000);
    const result = await shrinkPhoto(photo('image/png', 3000, 'scan.png'), fake);
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBe(4000);
  });

  it('sends PDFs, unreadable photos, and failed encodings as they are', async () => {
    const pdf = photo('application/pdf', 100, 'scan.pdf');
    const { fake } = tools(100, 100, 50);
    expect(await shrinkPhoto(pdf, fake)).toBe(pdf);
    expect(fake.decode).not.toHaveBeenCalled();

    const unreadable = photo('image/jpeg', 100);
    const broken = { decode: vi.fn(async () => Promise.reject(new Error('bad image'))), encode: vi.fn() } as unknown as PhotoTools;
    expect(await shrinkPhoto(unreadable, broken)).toBe(unreadable);

    const noCanvas = tools(4000, 3000, null);
    const original = photo('image/jpeg', 3000);
    expect(await shrinkPhoto(original, noCanvas.fake)).toBe(original);
    expect(noCanvas.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Create `src/upload/UploadScreen.test.tsx`**

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionFile } from '../../shared/api.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeUploadApi, LINK_TOKEN, type FakeUploadApi } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import type { ActiveSession } from './api.ts';
import { UploadScreen } from './UploadScreen.tsx';

const jpeg = (name = 'IMG_0001.jpg', bytes = 10) => new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });
const pdf = (name = 'scan.pdf') => new File(['%PDF-1.7'], name, { type: 'application/pdf' });

// The test stands in for the phone's photo shrinking: it keeps every file as it is.
const keepAsIs = vi.fn(async (file: File) => file as Blob);

function setup(files: SubmissionFile[] = []) {
  const api = createFakeUploadApi();
  api.seedSession(11, files);
  const session: ActiveSession = { studentId: 11, studentName: 'Pop Ion', secret: 'secret-11', files };
  const onSent = vi.fn();
  const onLost = vi.fn();
  render(<UploadScreen api={api} token={LINK_TOKEN} session={session} onSent={onSent} onLost={onLost} shrink={keepAsIs} />);
  return { api, onSent, onLost };
}

const pick = (files: File[]) => userEvent.upload(screen.getByLabelText('Alege fișiere'), files);

async function pages(api: FakeUploadApi, count: number) {
  await waitFor(() => expect(api.uploadFile).toHaveBeenCalledTimes(count));
  await waitFor(() => expect(screen.getAllByText('Încărcat')).toHaveLength(count));
}

beforeEach(() => {
  // jsdom has no object URLs; the previews only need a string.
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  keepAsIs.mockClear();
});

describe('UploadScreen', () => {
  it('shows the photo tips, the two buttons, and a disabled send button', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.getByText('Prinde toată pagina în poză.')).toBeInTheDocument();
    expect(screen.getByLabelText('Fă o poză')).toHaveAttribute('capture', 'environment');
    expect(screen.getByLabelText('Alege fișiere')).toHaveAttribute('multiple');
    expect(screen.getByRole('button', { name: 'Am trimis tot' })).toBeDisabled();
    expectNoGradingWords();
  });

  it('sends the picked pages one by one, in order, after the shrink step', async () => {
    const { api } = setup();
    const first = jpeg('IMG_0001.jpg');
    const second = pdf('scan.pdf');
    await pick([first, second]);
    await pages(api, 2);
    expect(keepAsIs).toHaveBeenCalledTimes(2);
    expect(api.uploadFile.mock.calls.map((call) => call[3])).toEqual(['IMG_0001.jpg', 'scan.pdf']);
    expect(api.uploadFile.mock.calls[0]![1]).toBe('secret-11');
    expect(screen.getByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', 'blob:preview');
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Am trimis tot' })).toBeEnabled();
  });

  it('sends a shrunk photo as a JPEG with a .jpg name', async () => {
    const { api } = setup();
    keepAsIs.mockImplementationOnce(async () => new Blob([new Uint8Array(4)], { type: 'image/jpeg' }));
    await pick([new File([new Uint8Array(40)], 'scan.png', { type: 'image/png' })]);
    await pages(api, 1);
    const [, , blob, name] = api.uploadFile.mock.calls[0]!;
    expect(name).toBe('scan.jpg');
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBe(4);
  });

  it('shows the progress of a page while it is sent', async () => {
    const { api } = setup();
    let finish: (file: SubmissionFile) => void = () => {};
    api.uploadFile.mockImplementationOnce(async (_token, _secret, _blob, _name, onProgress) => {
      onProgress(0.5);
      return new Promise<SubmissionFile>((resolve) => {
        finish = resolve;
      });
    });
    await pick([jpeg()]);
    expect(await screen.findByText(/Se încarcă… 50%/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Se încarcă IMG_0001.jpg' })).toHaveAttribute('value', '0.5');
    expect(screen.getByRole('button', { name: 'Am trimis tot' })).toBeDisabled();
    finish({ id: 1, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 10, position: 1 });
    expect(await screen.findByText('Încărcat')).toBeInTheDocument();
  });

  it('refuses a HEIC photo before sending anything', async () => {
    const { api } = setup();
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(screen.getByLabelText('Alege fișiere'), new File(['x'], 'IMG.heic', { type: 'image/heic' }));
    expect(screen.getByRole('alert')).toHaveTextContent('IMG.heic: Trimite poze JPG sau PDF.');
    expect(api.uploadFile).not.toHaveBeenCalled();
  });

  it('takes at most 20 pages', async () => {
    const already = Array.from({ length: 19 }, (_, i) => ({ id: i + 1, name: `p${i + 1}.pdf`, contentType: 'application/pdf', size: 5, position: i + 1 }));
    const { api } = setup(already);
    await pick([pdf('a.pdf'), pdf('b.pdf')]);
    expect(screen.getByRole('alert')).toHaveTextContent('Poți trimite cel mult 20 de fișiere.');
    await waitFor(() => expect(api.uploadFile).toHaveBeenCalledTimes(1));
    expect(api.uploadFile.mock.calls[0]![3]).toBe('a.pdf');
  });

  it('refuses a page bigger than 25 MB after the shrink step', async () => {
    const { api } = setup();
    keepAsIs.mockImplementationOnce(async () => new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: 'application/pdf' }));
    await pick([pdf('mare.pdf')]);
    expect(await screen.findByText('Fișierul are peste 25 MB.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Încearcă din nou' })).not.toBeInTheDocument();
    expect(api.uploadFile).not.toHaveBeenCalled();
  });

  it('lets the student send a failed page again', async () => {
    const { api } = setup();
    api.uploadFile.mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server. Verifică internetul și încearcă din nou.'));
    await pick([jpeg()]);
    expect(await screen.findByText('Nu mă pot conecta la server. Verifică internetul și încearcă din nou.')).toBeInTheDocument();
    expect(screen.getByText('Încearcă din nou sau șterge paginile cu eroare.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(await screen.findByText('Încărcat')).toBeInTheDocument();
    expect(api.uploadFile).toHaveBeenCalledTimes(2);
    // The second try sends the file prepared by the first one.
    expect(keepAsIs).toHaveBeenCalledTimes(1);
  });

  it('deletes a sent page on the server', async () => {
    const { api } = setup();
    await pick([jpeg('a.jpg'), jpeg('b.jpg')]);
    await pages(api, 2);
    await userEvent.click(screen.getByRole('button', { name: 'Șterge pagina 1' }));
    await waitFor(() => expect(screen.queryByText('a.jpg')).not.toBeInTheDocument());
    expect(api.deleteFile).toHaveBeenCalledWith(LINK_TOKEN, 'secret-11', 100);
    expect(screen.getByText('b.jpg')).toBeInTheDocument();
  });

  it('sends everything after the student confirms, and forgets the secret', async () => {
    localStorage.setItem(`qe.session.${LINK_TOKEN}.11`, 'secret-11');
    const { api, onSent } = setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await pick([jpeg(), pdf()]);
    await pages(api, 2);
    await userEvent.click(screen.getByRole('button', { name: 'Am trimis tot' }));
    expect(api.confirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Am trimis tot' }));
    expect(confirm).toHaveBeenLastCalledWith('Ești sigur? După confirmare nu mai poți schimba nimic.');
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(2));
    expect(localStorage.getItem(`qe.session.${LINK_TOKEN}.11`)).toBeNull();
  });

  it('goes back to the names when the teacher reset the upload', async () => {
    const { api, onLost } = setup();
    api.dropSession(11);
    await pick([jpeg()]);
    await waitFor(() => expect(onLost).toHaveBeenCalledWith('Încărcarea nu mai este valabilă. Alege-ți din nou numele.'));
  });

  it('shows the pages sent before a reload, with photo previews from the server', async () => {
    const files = [
      { id: 7, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 900, position: 1 },
      { id: 8, name: 'scan.pdf', contentType: 'application/pdf', size: 2000, position: 2 },
    ];
    const { api } = setup(files);
    expect(await screen.findByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', 'blob:preview');
    expect(api.fileBlob).toHaveBeenCalledTimes(1);
    expect(api.fileBlob).toHaveBeenCalledWith(LINK_TOKEN, 'secret-11', 7);
    expect(screen.getAllByText('Încărcat')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Am trimis tot' })).toBeEnabled();
  });

  it('opens a photo on the whole screen and closes it with Escape', async () => {
    const { api } = setup();
    await pick([jpeg()]);
    await pages(api, 1);
    await userEvent.click(screen.getByRole('button', { name: 'Vezi pagina 1' }));
    const viewer = screen.getByRole('dialog', { name: 'Pagina 1' });
    expect(within(viewer).getByRole('button', { name: 'Închide' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expectNoGradingWords();
  });
});
```

- [ ] **Step 3: Replace `src/upload/UploadApp.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeUploadApi, LINK_TOKEN, linkInfo } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { saveSecret } from './session.ts';
import { UploadApp } from './UploadApp.tsx';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UploadApp', () => {
  it('shows the test and the class list, with ✓ for students who already sent', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Fracții' })).toBeInTheDocument();
    expect(screen.getByText('Clasa 6E2 · 6E2-26T1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pop Ion' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stan Eva, a trimis' })).toBeDisabled();
    expectNoGradingWords();
  });

  it('starts the upload after the student confirms the name, and keeps the secret', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    expect(screen.getByRole('heading', { name: 'Ești Pop Ion?' })).toBeInTheDocument();
    expectNoGradingWords();
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    expect(api.startSession).toHaveBeenCalledWith(LINK_TOKEN, 11, null);
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(localStorage.getItem(`qe.session.${LINK_TOKEN}.11`)).toBe('secret-11');
  });

  it('goes back to the list when the student says it is not their name', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Nu, aleg alt nume' }));
    expect(screen.getByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expect(api.startSession).not.toHaveBeenCalled();
  });

  it('shows the server message when another phone holds the upload', async () => {
    const api = createFakeUploadApi();
    api.seedSession(11);
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Încărcarea a început pe alt telefon. Roagă profesorul să o reseteze.');
    expect(screen.getByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
  });

  it('goes straight back to an upload this phone started', async () => {
    const api = createFakeUploadApi();
    api.seedSession(11);
    saveSecret(LINK_TOKEN, 11, 'secret-11');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(api.startSession).toHaveBeenCalledWith(LINK_TOKEN, 11, 'secret-11');
  });

  it('says the uploads are closed once the test is closed', async () => {
    const api = createFakeUploadApi({ ...linkInfo({ status: 'evaluating' }), students: [] });
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Încărcarea s-a închis.');
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('shows a wrong-link message for an address without a valid token, without asking the server', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={null} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Link greșit. Cere profesorului linkul nou.');
    expect(api.getLink).not.toHaveBeenCalled();
  });

  it('sends a page from start to end and says the work was sent', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true });
    const api = createFakeUploadApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    await userEvent.upload(await screen.findByLabelText('Alege fișiere'), new File(['%PDF-1.7'], 'scan.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Încărcat')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Am trimis tot' }));
    expect(await screen.findByRole('heading', { name: 'Gata! Lucrarea ta a fost trimisă.' })).toBeInTheDocument();
    expect(screen.getByText('Ai trimis un fișier.')).toBeInTheDocument();
    expectNoGradingWords();
  });

  it('goes back to the names, with the reason, when the teacher reset the upload', async () => {
    const api = createFakeUploadApi();
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pop Ion' }));
    await userEvent.click(screen.getByRole('button', { name: 'Da, încep' }));
    await screen.findByLabelText('Alege fișiere');
    api.dropSession(11);
    await userEvent.upload(screen.getByLabelText('Alege fișiere'), new File(['%PDF-1.7'], 'scan.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('heading', { name: 'Alege-ți numele' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Încărcarea nu mai este valabilă. Alege-ți din nou numele.');
  });

  it('shows the server message for an unknown link', async () => {
    const api = createFakeUploadApi();
    api.getLink.mockRejectedValueOnce(new ApiError(404, 'unknown_link', 'Link greșit. Cere profesorului linkul nou.'));
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Link greșit. Cere profesorului linkul nou.');
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run src/upload/UploadApp.test.tsx src/upload/UploadScreen.test.tsx src/upload/shrink.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  15 failed | 8 passed (23)`. `shrink.test.ts`: `Failed to resolve import "./shrink.ts"`. The upload-screen tests do not find the new screen (`Unable to find a label with the text of: Alege fișiere`). The eight older `UploadApp.test.tsx` tests pass.

- [ ] **Step 5: Create `src/upload/shrink.ts`**

```ts
// Photos are made smaller on the phone before they are sent (spec §5, §10.4):
// at most 2000 px on the long side, JPEG quality 0.85. A JPEG that would come
// out bigger than it was is sent as it was. PDFs are sent as they are.

export const MAX_SIDE = 2000;
export const JPEG_QUALITY = 0.85;

const SHRINKABLE = ['image/jpeg', 'image/png', 'image/webp'];

export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// "IMG_0001.PNG" becomes "IMG_0001.jpg".
export function jpegName(name: string): string {
  return `${name.replace(/\.[^.]*$/, '') || 'poza'}.jpg`;
}

export interface DecodedPhoto {
  width: number;
  height: number;
  source: CanvasImageSource;
  close(): void;
}

// How a photo is read and written again. The browser tools need a real
// browser; tests pass fakes.
export interface PhotoTools {
  decode(file: Blob): Promise<DecodedPhoto>;
  encode(source: CanvasImageSource, size: { width: number; height: number }, quality: number): Promise<Blob | null>;
}

export const browserPhotoTools: PhotoTools = {
  // createImageBitmap turns the photo the way the camera held it (EXIF orientation).
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  },
  encode(source, size, quality) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }
      // A white page under transparent parts of a PNG, not a black one.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(source, 0, 0, size.width, size.height);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
  },
};

// Returns the smaller JPEG, or the file itself when it cannot or need not change.
export async function shrinkPhoto(file: File, tools: PhotoTools = browserPhotoTools): Promise<Blob> {
  if (!SHRINKABLE.includes(file.type)) return file;
  let photo: DecodedPhoto;
  try {
    photo = await tools.decode(file);
  } catch {
    return file;
  }
  try {
    const result = await tools.encode(photo.source, fitWithin(photo.width, photo.height), JPEG_QUALITY);
    if (!result) return file;
    if (file.type === 'image/jpeg' && result.size >= file.size) return file;
    return result;
  } finally {
    photo.close();
  }
}
```

- [ ] **Step 6: Create `src/upload/PhotoViewer.tsx`**

```tsx
import { useEffect, useRef } from 'react';

// One photo on the whole screen. Escape or the button closes it.
export function PhotoViewer({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={label}>
      <img src={src} alt={label} />
      <button ref={close} type="button" className="button button-big" onClick={onClose}>
        Închide
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Replace `src/upload/UploadScreen.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { SubmissionFile } from '../../shared/api.ts';
import {
  EMPTY_FILE,
  FILE_TOO_BIG,
  JPEG_TYPE,
  MAX_FILE_BYTES,
  MAX_STUDENT_FILES,
  PDF_TYPE,
  STUDENT_FILE_TYPES,
  STUDENT_WRONG_TYPE,
  uploadTypeOf,
} from '../../shared/files.ts';
import { ApiError, messageOf } from '../ui/ApiError.ts';
import { formatFileSize } from '../ui/format.ts';
import type { ActiveSession, UploadApi } from './api.ts';
import { PhotoViewer } from './PhotoViewer.tsx';
import { forgetSecret } from './session.ts';
import { jpegName, shrinkPhoto } from './shrink.ts';

const PICK_ACCEPT = [...STUDENT_FILE_TYPES, '.jpg', '.jpeg', '.png', '.webp', '.pdf'].join(',');
const TOO_MANY = `Poți trimite cel mult ${MAX_STUDENT_FILES} de fișiere.`;

// One page of the student's work, on its way to the server or already there.
interface PageItem {
  key: string;
  name: string;
  contentType: string;
  size: number;
  fileId: number | null;
  state: 'waiting' | 'sending' | 'sent' | 'failed';
  progress: number;
  error: string | null;
  // Failed only because of the network or the server: the same file can be sent again.
  canRetry: boolean;
  preview: string | null;
}

let nextKey = 1;

function sentItem(file: SubmissionFile): PageItem {
  return {
    key: `server-${file.id}`,
    name: file.name,
    contentType: file.contentType,
    size: file.size,
    fileId: file.id,
    state: 'sent',
    progress: 1,
    error: null,
    canRetry: false,
    preview: null,
  };
}

// The upload screen: photo tips, the camera and file buttons, the list of
// pages with their progress, and "Am trimis tot". Pages are sent one at a time,
// in the order they were picked.
export function UploadScreen({
  api,
  token,
  session,
  onSent,
  onLost,
  shrink = shrinkPhoto,
}: {
  api: UploadApi;
  token: string;
  session: ActiveSession;
  onSent: (fileCount: number) => void;
  onLost: (message: string) => void;
  shrink?: (file: File) => Promise<Blob>;
}) {
  const [items, setItems] = useState<PageItem[]>(() => session.files.map(sentItem));
  const [notice, setNotice] = useState<string | null>(null);
  const [viewingKey, setViewingKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The file of each page that is not on the server yet; `ready` once it was made smaller.
  const sources = useRef(new Map<string, { blob: Blob; ready: boolean }>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const previews = useRef<string[]>([]);

  const update = useCallback((key: string, changes: Partial<PageItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }, []);

  const previewOf = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    previews.current.push(url);
    return url;
  }, []);

  // Pages already on the server (after a reload): their photos come back for the preview.
  useEffect(() => {
    let current = true;
    for (const file of session.files) {
      if (!file.contentType.startsWith('image/')) continue;
      api
        .fileBlob(token, session.secret, file.id)
        .then((blob) => {
          if (current) update(`server-${file.id}`, { preview: previewOf(blob) });
        })
        .catch(() => {
          // No preview: the page is still on the server.
        });
    }
    return () => {
      current = false;
    };
  }, [api, token, session, update, previewOf]);

  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const send = useCallback(
    async (key: string, name: string) => {
      const source = sources.current.get(key);
      if (!source) return;
      update(key, { state: 'sending', progress: 0, error: null });
      let { blob } = source;
      let fileName = name;
      if (!source.ready) {
        const original = blob as File;
        blob = await shrink(original);
        if (blob !== original) fileName = jpegName(name);
        else if (!blob.type) blob = new Blob([blob], { type: uploadTypeOf(original) });
        const problem = blob.size === 0 ? EMPTY_FILE : blob.size > MAX_FILE_BYTES ? FILE_TOO_BIG : null;
        if (problem) {
          sources.current.delete(key);
          update(key, { state: 'failed', error: problem, canRetry: false });
          return;
        }
        sources.current.set(key, { blob, ready: true });
        update(key, {
          name: fileName,
          size: blob.size,
          contentType: blob.type,
          preview: blob.type.startsWith('image/') ? previewOf(blob) : null,
        });
      }
      try {
        const stored = await api.uploadFile(token, session.secret, blob, fileName, (sent) => update(key, { progress: sent }));
        sources.current.delete(key);
        update(key, { state: 'sent', progress: 1, fileId: stored.id });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          onLost(err.message);
          return;
        }
        update(key, { state: 'failed', error: messageOf(err), canRetry: true });
      }
    },
    [api, token, session.secret, shrink, update, previewOf, onLost],
  );

  const enqueue = (key: string, name: string) => {
    queue.current = queue.current.then(() => send(key, name));
  };

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = '';
    const problems: string[] = [];
    const room = MAX_STUDENT_FILES - items.length;
    if (picked.length > room) problems.push(TOO_MANY);
    const added: PageItem[] = [];
    for (const file of picked.slice(0, Math.max(0, room))) {
      const type = uploadTypeOf(file);
      if (!STUDENT_FILE_TYPES.includes(type)) {
        problems.push(`${file.name}: ${STUDENT_WRONG_TYPE}`);
        continue;
      }
      const key = `local-${nextKey++}`;
      sources.current.set(key, { blob: file, ready: false });
      added.push({
        key,
        name: file.name,
        contentType: type,
        size: file.size,
        fileId: null,
        state: 'waiting',
        progress: 0,
        error: null,
        canRetry: false,
        preview: null,
      });
    }
    setNotice(problems.length > 0 ? problems.join(' ') : null);
    setItems((current) => [...current, ...added]);
    for (const item of added) enqueue(item.key, item.name);
  };

  const remove = async (item: PageItem) => {
    if (item.fileId !== null) {
      try {
        await api.deleteFile(token, session.secret, item.fileId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) onLost(err.message);
        else setNotice(messageOf(err));
        return;
      }
    }
    sources.current.delete(item.key);
    setItems((current) => current.filter((other) => other.key !== item.key));
  };

  const confirm = async () => {
    if (!window.confirm('Ești sigur? După confirmare nu mai poți schimba nimic.')) return;
    setConfirming(true);
    try {
      const { fileCount } = await api.confirm(token, session.secret);
      forgetSecret(token, session.studentId);
      onSent(fileCount);
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiError && err.status === 401) onLost(err.message);
      else setNotice(messageOf(err));
    }
  };

  const allSent = items.length > 0 && items.every((item) => item.state === 'sent');
  const hasFailed = items.some((item) => item.state === 'failed');
  const viewingIndex = items.findIndex((item) => item.key === viewingKey);
  const viewing = viewingIndex >= 0 ? items[viewingIndex] : undefined;

  return (
    <section>
      <h2>{session.studentName}</h2>

      <details className="tips" open={items.length === 0}>
        <summary>Cum faci poze bune</summary>
        <ul>
          <li>Fă pozele la lumină bună, fără umbre pe foaie.</li>
          <li>Prinde toată pagina în poză.</li>
          <li>O singură pagină pe fiecare poză.</li>
          <li>Pune paginile în ordine: prima pagină prima.</li>
        </ul>
      </details>

      <div className="big-actions">
        <label className="button button-big pick-button">
          Fă o poză
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={addFiles} />
        </label>
        <label className="button-quiet button-big pick-button">
          Alege fișiere
          <input type="file" accept={PICK_ACCEPT} multiple className="sr-only" onChange={addFiles} />
        </label>
      </div>
      <p className="hint">Poze JPG, PNG sau PDF, cel mult {MAX_STUDENT_FILES} de fișiere.</p>

      {notice && (
        <p className="alert" role="alert">
          {notice}
        </p>
      )}

      <h3>Paginile tale ({items.length})</h3>
      {items.length === 0 ? (
        <p className="hint">Nu ai adăugat încă nicio pagină.</p>
      ) : (
        <ol className="page-list">
          {items.map((item, index) => (
            <li key={item.key} className={`page-item is-${item.state}`}>
              {item.preview ? (
                <button type="button" className="thumb" onClick={() => setViewingKey(item.key)} aria-label={`Vezi pagina ${index + 1}`}>
                  <img src={item.preview} alt={`Pagina ${index + 1}`} />
                </button>
              ) : (
                <span className="thumb thumb-file" aria-hidden="true">
                  {item.contentType === PDF_TYPE ? 'PDF' : item.contentType === JPEG_TYPE ? 'JPG' : 'Poză'}
                </span>
              )}
              <span className="page-info">
                <span className="page-name">{item.name}</span>
                <span className="hint">{formatFileSize(item.size)}</span>
                {item.state === 'waiting' && <span>Așteaptă…</span>}
                {item.state === 'sending' && (
                  <span>
                    Se încarcă… {Math.round(item.progress * 100)}%
                    <progress max={1} value={item.progress} aria-label={`Se încarcă ${item.name}`} />
                  </span>
                )}
                {item.state === 'sent' && <span className="page-ok">Încărcat</span>}
                {item.state === 'failed' && <span className="page-error">{item.error}</span>}
              </span>
              <span className="page-actions">
                {item.state === 'failed' && item.canRetry && (
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => {
                      update(item.key, { state: 'waiting', error: null });
                      enqueue(item.key, item.name);
                    }}
                  >
                    Încearcă din nou
                  </button>
                )}
                {item.state !== 'sending' && item.state !== 'waiting' && (
                  <button type="button" className="button-quiet button-small" onClick={() => remove(item)} aria-label={`Șterge pagina ${index + 1}`}>
                    Șterge
                  </button>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="send-all">
        {hasFailed && <p className="hint">Încearcă din nou sau șterge paginile cu eroare.</p>}
        {!hasFailed && items.length > 0 && !allSent && <p className="hint">Așteaptă să se încarce toate paginile.</p>}
        <button type="button" className="button button-big" disabled={!allSent || confirming} onClick={confirm}>
          Am trimis tot
        </button>
      </div>

      {viewing?.preview && (
        <PhotoViewer src={viewing.preview} label={`Pagina ${viewingIndex + 1}`} onClose={() => setViewingKey(null)} />
      )}
    </section>
  );
}
```

- [ ] **Step 8: Append to `src/ui/brand.css`**

```css
.tips {
  margin-block: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--marker-edge);
  border-radius: 0.35rem;
  background: var(--marker);
}

.tips summary {
  font-weight: 700;
  cursor: pointer;
}

.tips ul {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
}

/* The file inputs hide inside their labels; the label shows the focus. */
.pick-button:focus-within {
  outline: 3px solid var(--ink);
  outline-offset: 3px;
}

.page-list {
  display: grid;
  gap: 0.5rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.page-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border: 1.5px solid var(--rule);
  border-radius: 0.75rem;
  background: var(--sheet);
}

.page-item.is-failed {
  border-color: var(--error-fg);
}

.thumb {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--rule);
  border-radius: 0.4rem;
  background: var(--paper);
  cursor: pointer;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-file {
  color: var(--muted);
  font-weight: 800;
  cursor: default;
}

.page-info {
  display: grid;
  flex: 1;
  min-width: 0;
}

.page-name {
  overflow: hidden;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-info progress {
  display: block;
  width: 100%;
}

.page-ok {
  color: var(--ok-fg);
  font-weight: 700;
}

.page-error {
  color: var(--error-fg);
}

.page-actions {
  display: grid;
  gap: 0.35rem;
}

.send-all {
  margin-top: 1.5rem;
}

.photo-viewer {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.92);
}

.photo-viewer img {
  max-width: 100%;
  max-height: calc(100vh - 6rem);
  object-fit: contain;
}
```

- [ ] **Step 9: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  37 passed (37)`, `Tests  332 passed (332)`.

- [ ] **Step 10: Run the typecheck and the build**

Run: `npm run build`
Expected: the typecheck passes and Vite ends with `✓ built in …`.

- [ ] **Step 11: Commit**

```bash
git add src
git commit -m "Add the student upload screen with photo shrinking, progress, and preview"
```

---

### Task 13: Smoke test and docs

The smoke test runs one full upload against the production build. The docs describe the new parts, and the spec records the planning rulings.

**Files:**
- Modify: `scripts/smoke.mjs`, `AGENTS.md`, `README.md`, `docs/superpowers/specs/2026-10-06-quickeval-design.md`, `docs/superpowers/plans/plan-1-followups.md`

**Interfaces:**
- Consumes: every route of Tasks 4–7; the three entries of the build.
- Produces: `npm run smoke` checks the pages, the headers, and one upload from class to delete.

- [ ] **Step 1: Replace `scripts/smoke.mjs`**

```js
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
```

- [ ] **Step 2: Run the production build and the smoke test**

Run: `npm run db:local`, then `npm run preview` in one terminal and, when it answers on http://127.0.0.1:8788, `npm run smoke` in a second terminal.
Expected: 26 lines that start with `PASS`, then `All smoke checks passed.` Stop the preview afterwards and check that nothing still listens on port 8788 (`netstat -ano | findstr :8788`; on a leftover, use the PowerShell command in `AGENTS.md`).

- [ ] **Step 3: Replace `AGENTS.md`**

````markdown
# AGENTS.md

QuickEval: a web app that helps Laura Miron (math teacher, Liceul William Shakespeare, Timișoara) collect and grade her students' math tests. The teacher pages and the student pages are in Romanian. Code, comments, and docs are in English.

- Design: `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Plans: `docs/superpowers/plans/`
- Live: https://quickeval.pages.dev/
- Brand source: the "Matematică cu Laura Miron" site (`D:\Projects\Website`, https://lauramiron.pages.dev/)

## Structure

- `index.html`: the landing page. `admin/index.html`: the teacher app entry (React, served under `/admin/`). `u/index.html`: the student app entry (served under `/u/<token>`).
- `src/ui/`: brand CSS (colours from the Laura Miron site), brand mark, theme switch, Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps).
- `src/admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page.
- `src/upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone).
- `src/test/`: test setup, the fake APIs (`fakeApi.ts`, `fakeUploadApi.ts`), `renderAdmin()`, `expectNoGradingWords()`.
- `functions/api/[[route]].ts`: the Cloudflare Pages entry for `/api/*`. It serves the Hono app from `server/app.ts`.
- `server/`: the API. `routes/` (HTTP: `admin.ts` and its parts, `upload.ts` for students), `db/` (D1 queries), `auth/` (Cloudflare Access login), `http.ts` (JSON bodies, ids, codes, same-origin writes), `errors.ts` (`ApiError`), `uploads.ts` (file bodies in and out of R2), `secrets.ts` (tokens and hashes), `test/` (API test helper and fixtures).
- `shared/`: code for both the API and the browser: zod request schemas and response types (`api.ts`), school year, class names, student names, ids, test codes (`tests.ts`), file rules and R2 keys (`files.ts`).
- `migrations/`: D1 SQL migrations, numbered. One statement per `;` at a line end (the test helper splits on that), and no `;` inside strings.
- `public/`: copied as-is into `dist/`: `_routes.json` (only `/api/*` runs Functions), `_redirects`, `_headers`, `theme.js`, `favicon.svg`, `robots.txt`.
- `scripts/`: `seed-local.sql` (the local teacher), `smoke.mjs` (checks a running local server, including one full upload).

## Commands

- `npm test`: all tests (Vitest projects "web" and "node").
- `npm run typecheck`: TypeScript, one strict config for everything.
- `npm run build`: typecheck, then the Vite build into `dist/`.
- `npm run db:local`: apply the migrations to the local D1 and add the local teacher.
- `npm run dev:api` and `npm run dev:web` (two terminals): develop with hot reload at http://localhost:5173/admin/. A started test's student page is at http://localhost:5173/u/<token>.
- `npm run preview`, then `npm run smoke` in a second terminal: the production build on http://127.0.0.1:8788 and its smoke test.

## Rules

- All user-facing text is Romanian. The API reports errors as `{ error, message }`; the UI shows `message`.
- No page tells students that AI grades their work. Student-app tests check every screen with `expectNoGradingWords()`.
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`, test codes through `parseTestCode`.
- Student calls are scoped by the test of the link's token, and an upload by the hash of the phone's secret (`X-Upload-Session`) within that test. Only hashes of secrets are stored.
- R2 is private: every file goes through the API with an ownership check. The database is the truth: R2 keys come from rows, never from listing R2.
- Times are stored as ISO 8601 UTC strings and shown in Europe/Bucharest time. School year Y runs from September of Y to August of Y+1.
- Functions do no heavy CPU work (10 ms of CPU per request on the free plan) and make at most 15 D1 queries per request. Group writes with `db.batch()`. Adding students uses a fixed number of queries, whatever the number of names; the uploads table is one query.
- Relative imports name the `.ts` or `.tsx` file. TypeScript runs with `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties.
- Commits have no AI attribution lines. Code comments name no ticket or issue numbers.

## Gotchas

- npm blocks install scripts. After a fresh install, run `npm approve-scripts workerd esbuild`.
- `_redirects` must use the directory form `/admin/* /admin/ 200` and `/u/* /u/ 200`. Wrangler refuses `/admin/* /admin/index.html 200` as a redirect loop.
- The Vite dev proxy keeps the Host header (`changeOrigin: false`). Otherwise the API refuses every write as cross-site.
- API tests use wrangler's `getPlatformProxy` (`server/test/testApi.ts`). Do not add `miniflare` as a direct dependency: its newest version changed its options format.
- `getPlatformProxy`'s R2 refuses a request-body stream ("must have a known length"). The API reads an upload with `arrayBuffer()` (after checking `Content-Length` ≤ 25 MB) and stores the bytes; production works the same way.
- Local login: `.dev.vars` sets `DEV_TEACHER_EMAIL`. The API accepts it only for requests to localhost or 127.0.0.1.
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer.
- Development happens on Windows. CI runs on Linux.
- On Windows, stopping a background `npm run preview` or `npm run dev:api` job can leave `workerd.exe` listening on its port. A new server then seems to start but answers with old data, or requests hang. Check with `netstat -ano | findstr :8788` and end the leftovers in PowerShell:

  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*\Projects\QuickEval\node_modules*' -or $_.CommandLine -like '*npm-cli.js*run preview*' -or $_.CommandLine -like '*npm-cli.js*run dev:*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```

## Deploy

- Cloudflare Pages project `quickeval`, connected to the GitHub repo. Every push to `main` deploys. Build command `npm run build`, output `dist`, Node version from `.node-version`. Preview deployments are off: they would share the production database and bucket.
- `wrangler.toml` is the source of truth for bindings: D1 `DB` → database `quickeval`, R2 `FILES` → bucket `quickeval-files`.
- Settings `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are Pages secrets: `npx wrangler pages secret put <NAME> --project-name quickeval`. A new secret applies from the next deployment.
- A new migration runs on the live database before the code that needs it: `npx wrangler d1 migrations apply quickeval --remote`. A new binding's resource (a bucket, a database) exists before the code that binds it reaches `main`.
- Cloudflare Access ("QuickEval admin") protects only `/admin` and `/api/admin`. Student pages (`/u`, `/api/u`) and the robot (`/api/runner`) must stay outside it.
- CI (`.github/workflows/ci.yml`) runs the typecheck, the tests, and the build on every push and pull request.
````

- [ ] **Step 4: Replace `README.md`**

```markdown
# QuickEval

A test platform for Laura Miron's math classes: classes and students, tests, student uploads, grading, and reports. Runs on Cloudflare Pages (Functions, D1, R2).

- Design: `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Developer guide: `AGENTS.md`

## Quick start (Windows, Node 24)

1. `npm install`, then `npm approve-scripts workerd esbuild`
2. Copy `.dev.vars.example` to `.dev.vars`
3. `npm run db:local`
4. `npm run dev:api` in one terminal and `npm run dev:web` in another
5. Open http://localhost:5173/admin/
6. To try the student page: make a test, click **Începe testul**, and open its link (http://localhost:5173/u/&lt;token&gt;)
```

- [ ] **Step 5: Replace `docs/superpowers/plans/plan-1-followups.md`**

```markdown
# Plan 1 follow-ups

Plan 1 was built task by task with a review after each task and a final whole-branch review. The code in the repo is the source of truth. The code blocks in `2026-10-06-quickeval-plan-1-foundation.md` are the plan as written; they do not show the fixes below.

## Changes from the written plan (already in the code)

- `server/auth/access.ts`: `parseJwt` refuses a token whose header or payload is not an object, so a malformed token gets 403, not 500. Regression test in `access.test.ts`.
- `src/admin/api.ts`: a failed `fetch` becomes `ApiError(0, 'network', …)` and a broken JSON body becomes `ApiError(status, 'bad_response', …)`, both with Romanian text. `reloadForLogin(reload?, now?)` has injectable parameters and tests for the 10-second limit.
- `src/admin/ErrorMessage.tsx`: shows `error.message` only for `ApiError` and `LoginExpiredError`; any other error shows the generic Romanian text.
- `shared/students.ts`: `cleanStudentName` also removes a bare list number (`3.`, `4)`, `5`), so empty numbered rows of a pasted list are dropped. Side effect: `1.5 Pop Ana` becomes `5 Pop Ana` (unrealistic input).
- `migrations/0001_people.sql`: `teachers.email` has `CHECK (email = lower(email))`. Insert teachers with `lower('<email>')`.
- `server/db/classes.ts`: `listClassStudents(db, teacherId, classId)` is scoped by teacher. `setEnrollmentActive`'s follow-up select is scoped by teacher too.
- `.github/workflows/ci.yml`: `permissions: contents: read`.
- Local dev databases made before the CHECK constraint keep the old schema. Reset with: delete `.wrangler/state`, then `npm run db:local`.

## Live state after Plan 1

- Live at https://quickeval.pages.dev/ since 2026-10-07. The live database has two teachers: Laura's account (empty on purpose; she creates her own classes) and a test account. The test account has classes 6E2 and 11R1, with 30 made-up students in 6E2.

## Done in Plan 2

- Cross-teacher tests for adding students and for leaving a class; `addStudentsToClass` checks class ownership in both inserts.
- `ClassDetails` has `key={classId}`, and the error boundary resets on every page change.
- Archived cards mute only their title and count; their buttons keep full contrast.
- API responses get `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` (a route may set its own Cache-Control).
- A React error boundary with a Romanian message.
- `teacherAuth` answers 503 when the Access keys cannot be downloaded, and keys downloaded earlier stay in use when a later download fails.
- `parseId` and the class page accept only plain digits (`shared/ids.ts`).
- Test helper: disposes the platform when setup fails, merges header keys in any letter case, handles an empty body, and has `fetch()` for raw requests.
- Direct tests for `readJson`, `parseId`, `sameOriginWrites`, `isUniqueViolation`, and the `onError` 500 path.
- Access verifier tests: the one-forced-download-per-30-seconds limit, future `nbf`, malformed tokens, `aud` as a string, `127.0.0.1` as a dev host, and a valid token through to a 200.
- `scripts/smoke.mjs`: the header comment, a guarded JSON parse, header checks on `/u/` too.
- `AGENTS.md`: "Romanian count labels".

## Still open (for Plan 4, the polish plan, unless an earlier plan needs them)

- Cloudflare Access covers only the main host. Optionally add `*.quickeval.pages.dev` with the same two paths. The API already refuses requests without a valid token there.
- `updateClass` ignores `meta.changes` (matters once classes can be deleted).
- The `fetch` catch in `src/admin/api.ts` reports a deliberate abort as a network error (nothing aborts today).
- Classes: empty PATCH body, `archived: false`. Students: prove the batch is a transaction (fail the second statement).
- Some Plan 1 API test files depend on test order (shared state across `it` blocks). Plan 2 files start a fresh database per test.
- `shared/students.test.ts`: an ordering pair that separates Romanian from root collation (`['Șa', 'Sz']`); boundaries for `isValidSchoolYear` (2020, 2100, 2101) and an 8-character class name.
- UI: "Scoate din arhivă" and "Revine în clasă" paths, the 60-name limit, number-only paste, failing add and rename, "Renunță", the empty-class hint, `ThemeButton`, `schoolYearOptions` (the year-switch test depends on the current date).
- Class page: reset the draft and the error on "Renunță"; focus the input that appears; give the repeated "Redenumește" / "A plecat" buttons per-student context (`aria-describedby`); a failed background refresh should not replace the whole page.
- Classes page: every card's "Arhivează" button has the same accessible name; create and archive errors stay after the school-year switch; the theme icon goes stale when the system theme changes; a saved school year outside the offered range shows the wrong option.
- The class heading counts active students, while the list also shows students who left.
- `robots.txt` `Disallow: /` hides the `X-Robots-Tag: noindex` header from crawlers that obey it.
```

- [ ] **Step 6: Update the spec**

In `docs/superpowers/specs/2026-10-06-quickeval-design.md`, make these three changes and nothing else:

1. §8.3, at the end of the bullet that starts with "Every API call that reads a test", after "even when the robot is late.", add: ` (Plan 3 adds it, together with scheduling: before Plan 3 nothing sets `evaluation_at`.)`
2. §10, step 2, after "cannot be picked.", add: ` A tap on a name asks "Ești <name>?" first, because the upload then belongs to that name on this phone.`
3. §10, step 5: replace the sentence "A PDF opens in a new tab." with: `A PDF shows as a row with its name and size: the student picked the file, and a PDF made in the page cannot open reliably in a new tab (Android downloads it, and the page's security policy can block it).` and add after "until Confirm.": ` The teacher opens every file, PDFs too, from the teacher app.`

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: PASS. `Test Files  37 passed (37)`, `Tests  332 passed (332)`.

- [ ] **Step 8: Commit**

```bash
git add scripts/smoke.mjs AGENTS.md README.md docs
git commit -m "Extend the smoke test to a full upload and document Plan 2"
```

---

### Task 14: Go live (main session)

The bucket and the new tables exist in Cloudflare before the code that uses them reaches `main`. Every push to `main` deploys. Ask the user before each step marked "ask first", and wait for a clear yes. Steps marked "(user)" are clicks or checks the user makes.

**Files:**
- Modify: nothing, unless a live check fails.

- [ ] **Step 1: Check the branch**

Run: `git status --short`, `npm test`, `npm run build`
Expected: a clean tree on the Plan 2 branch, all tests pass, the build ends with `✓ built in …`.

- [ ] **Step 2: Check the two apps in a browser (controller)**

The controller does this check in the browser pane, before anything goes live. With `npm run db:local` done and `npm run dev:api` and `npm run dev:web` running (two background jobs), open http://localhost:5173/admin/ and:
1. Create a class with two students on the Clase page.
2. On Teste, click **Test nou**, pick the class, type a title, attach a PDF as the test, and click **Creează testul**. Expected: the test page opens; the test file shows as a link; the uploads table lists both students as "Nu a trimis".
3. Click **Începe testul**. Expected: the link, **Copiază linkul**, and a QR code appear; **Arată codul QR pe tot ecranul** shows a big QR code; Escape closes it.
4. Open the link in a narrow window (or the browser's phone view). Pick a name, confirm, attach a photo and a PDF with **Alege fișiere**. Expected: both show "Încărcat", the photo with a thumbnail. Reload the page: the upload comes back with both files. Click **Am trimis tot** and confirm. Expected: "Gata! Lucrarea ta a fost trimisă."
5. Back on the test page (wait up to 10 seconds): the student shows "Trimis" with 2 files; **Vezi fișierele** shows the photo and a link to the PDF.
Stop both servers afterwards and check that nothing still listens on ports 8788 and 5173 (on a leftover, use the PowerShell command in `AGENTS.md`).

- [ ] **Step 3: Turn on R2 (user)**

Give the user these clicks: Cloudflare dashboard (the account with the Pages projects `lauramiron` and `quickeval`) → **R2 Object Storage** → **Purchase R2 Plan** (or **Get started**). The free tier costs nothing up to 10 GB, but Cloudflare asks for a card or PayPal once. The user enters the payment details; the agent never does. Wait until the user says R2 is on.

- [ ] **Step 4: Create the bucket (ask first)**

Run: `npx wrangler r2 bucket create quickeval-files --location weur`
Expected: `Created bucket 'quickeval-files' with location hint weur`. Then `npx wrangler r2 bucket list` lists `quickeval-files`. If the first command answers "Authentication error [code: 10000]", run it once more (a known wrangler token-renewal problem).

- [ ] **Step 5: Apply the migration to the live database (ask first)**

Run: `npx wrangler d1 migrations apply quickeval --remote`
Expected: `0002_tests.sql` with ✅. Then:
`npx wrangler d1 execute quickeval --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('tests', 'submissions', 'submission_files')"`
lists the three tables.

- [ ] **Step 6: Merge and deploy (ask first)**

Merge the Plan 2 branch into `main` (the finishing-a-development-branch skill), push `main`, and wait for the GitHub check `test` and the Cloudflare check `Cloudflare Pages` on the pushed commit (`gh api repos/parameciul/quickeval/commits/<sha>/check-runs`). Both must succeed. If no Cloudflare check appears within 5 minutes, the Pages project may have lost its GitHub link: ask the user to look for a yellow "disconnected from your Git account" box on the project page and to check the Cloudflare app's repository access at https://github.com/settings/installations.

- [ ] **Step 7: Check the open routes from outside Access**

Run:
- `curl -s -o /dev/null -w "%{http_code}" https://quickeval.pages.dev/u/abcdefghijkmnop2` → `200` (the student page, not an Access login redirect)
- `curl -s https://quickeval.pages.dev/api/u/abcdefghijkmnop2` → `{"error":"unknown_link","message":"Link greșit. Cere profesorului linkul nou."}`
- `curl -s -o /dev/null -w "%{http_code}" https://quickeval.pages.dev/api/admin/tests` → `302` (Access still protects the teacher API)

- [ ] **Step 8: Check one full upload and one large file on the live site (user)**

The user logs in at https://quickeval.pages.dev/admin/ with the **test account** (not Laura's account) and:
1. Opens **Test nou**, picks the test class (6E2), types a title, attaches a PDF, and creates the test.
2. Clicks **Începe testul** and opens the link (or scans the QR code) **on a phone that is not logged in to anything**.
3. On the phone: picks a name, confirms, takes a photo with **Fă o poză**, waits for "Încărcat", and taps **Am trimis tot**.
4. On the teacher page (within 10 seconds): the student shows "Trimis"; **Vezi fișierele** shows the photo.
5. On the same test, replaces the test file with a large PDF (15–25 MB, for example a scanned document) with **Înlocuiește testul**. Expected: the new file name shows as a link, and it opens. This checks Ruling 1 on the real free plan: the API reads the whole file before it stores it. If the upload fails with a 500 or with Cloudflare error 1102 ("exceeded resource limits"), stop: tell the user, and plan a change that streams the body to R2 in production. Change no code without the user's yes.
6. Deletes the test with **Șterge testul** (it was only a check).

Ask the user what they saw on the phone, and confirm on the teacher page.

- [ ] **Step 9: Report**

Tell the user what is live, what the check showed, and that Laura can now make real tests in her own account.
