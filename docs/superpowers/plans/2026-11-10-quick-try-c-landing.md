# MQGrader: Quick Try, part C (the landing page and the cleanup) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The last task (Check in the browser, push) must run in the main session, not in a subagent:** the Turnstile keys and the push need the user.

**Goal:** The landing page's Quick Try: the button "Încearcă acum, fără cont", the form in a window over the page (the test, her barem or "Nu am barem", the student's pages, the Turnstile check), the status line of her try with its link, one try per device per day in `localStorage`; and the deletion of every try once its 7 days are over.

**Architecture:** The landing page stays without React: `src/landing/quickTry/` works on the page's own elements (`ui.ts`), with its logic in small tested modules (`storage.ts`, `api.ts`, `send.ts`, `status.ts`) and Cloudflare's script loaded only when the form opens (`turnstile.ts`). The form makes the try (`POST /api/try`) and sends each file through the try's link with the same calls the try's page makes; the status line follows the try with part B's `phaseOf`. Pages has no timer, so each visit of the landing page (`GET /api/try/availability`) deletes, after its answer, up to three tries whose 7 days are over: their R2 files from the rows, then the rows in one batch.

**Tech Stack:** Node 24, TypeScript, Vite, Hono on Cloudflare Pages with D1 and R2, Cloudflare Turnstile, Vitest 5 with Testing Library. No new npm dependencies. No migration.

**Spec:** `docs/superpowers/specs/2026-11-09-quick-try-design.md` (§3.1 the landing page, §3.2 the form, §4 limits, §5 deleting old tries, §8 left to the builder). Part A (the server, PR #59) is `docs/superpowers/plans/2026-11-09-quick-try-a-server.md`; part B (the try's page, PR #60) is `docs/superpowers/plans/2026-11-10-quick-try-b-page.md`. Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`. No migration.
- One strict `tsconfig.json`. Relative imports name the `.ts` or `.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English. The API reports errors as `{ error, message }`; the form shows `message`.
- The landing page has no React and no inline script or style (its security policy blocks them; `src/landing/landing.test.ts` checks it). The policy allows one more source: Turnstile's script and frame, `https://challenges.cloudflare.com`.
- The landing page makes no "unlimited" promise. The limit text is "Încercările gratuite de azi s-au terminat. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa." (spec §4).
- Exact texts: the button is "Încearcă acum, fără cont" (spec §3.1); "Nu am barem: fă-l din test"; "Deschide încercarea".
- R2 keys come from rows, never from listing R2. A cleanup never deletes a teacher who is not a try (`teachers.quick_try = 1` in every statement).
- Functions: at most 10 ms of CPU and 15 D1 queries per request. The cleanup runs after the answer (`inBackground`), with 2 queries and one batch of 6 statements.
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch `feature/quick-try-landing` (made from `main` in "Before Task 1"). Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone; the full run then counts as passed when its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protoqtc/c1` … `refs/protoqtc/c3`, one per task, on `refs/protoqtc/cbase` (the same files as `main` at `f9a5b3c`). After Task N, `git diff --stat refs/protoqtc/cN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building the prototype on 2026-11-10.

1. **A try is deleted once its 7 days are over (owner, 2026-11-10).** The spec's monthly cleanup (§5, option B) is replaced: the owner chose deletion at the end of the 7 days. Task 1 writes this into the spec.
2. **The landing page is the cleanup's trigger.** Pages runs no timer and the GitHub schedule does not fire reliably. Every visit of the landing page reads `GET /api/try/availability`; after its answer (`inBackground`) it deletes up to `QUICK_TRY_CLEANUP_BATCH` (3) expired tries, the oldest first. Files first, then rows: when R2 fails the rows stay, and a later visit finds the files again. A quiet week only delays the deletion.
3. **Rows in one batch, in the order the foreign keys need:** the test (its paper, pages, grading and points go by `ON DELETE CASCADE`), the class list, the student, the class, the `quick_tries` row and the guest teacher (its sessions cascade). Every statement names the ids through `teachers.quick_try = 1`, so no account is ever reached. D1 refuses a compound SELECT of more than a few parts, so the file keys are read as one row per test (six key columns) and one row per page.
4. **A deleted try's link answers like an unknown one** (404 `unknown_try`). The try's page then says "Verifică dacă l-ai copiat întreg. O încercare se șterge după 7 zile.", since a well-formed link that is unknown is almost always a deleted try.
5. **The site key comes from the server.** `GET /api/try/availability` answers `siteKey` (the Pages secret `TURNSTILE_SITE_KEY`, public by nature): a new key needs no rebuild, and without it the landing page shows no button (only an administrator could make a try). Locally, Cloudflare's test keys pass always (`.dev.vars.example`).
6. **No React on the landing page** (spec §3.1). The form is a `<dialog>` in `index.html`, worked by `ui.ts`; the logic lives in modules tested without the page. Turnstile's script loads only when the form opens.
7. **Her barem starts the grading at once; the robot's does not.** With her own barem file the form sends the start after the last page. With "Nu am barem" the robot makes it, and she reads it and presses "Pornește corectarea" on the try's page (spec §3.3, state 2, owner). Her own file wins when she gives both.
8. **The try is kept the moment it exists.** `localStorage` gets the link right after `POST /api/try`, before any file: a send that breaks half-way shows "Încercarea a fost făcută. Deschide încercarea ca să trimiți ce lipsește." and the try's page takes what is missing (part B, ruling 3).
9. **One try per device per Bucharest day**, unless that try failed (spec §4: a failed try gives the device its place back). An administrator always gets the button. A link that answers 404 or 410 is forgotten.
10. **The status line follows the try every 10 s while the robot works** (a barem it makes, or the grading), with part B's `phaseOf`, and stops when it waits for her or is done.
11. **The form checks each file like the app** (`fileProblem`): the test and the barem like a teacher's file (PDF or Word), the pages like a student's (JPG, PNG, WebP or PDF, 25 MB each, at most 20), with the file's name in the message.
12. **The landing page's own sideways scroll at phone width is not this plan's.** At 351 px the hero is 2 px wider than the page, on the live site too (found while checking the prototype); it is left for a separate fix.

## Review Focus

1. Cloudflare's script cannot load (a blocker, no network): the form says "Verificarea nu s-a putut încărca. Reîncarcă pagina și încearcă din nou." and sends nothing (Task 3, "says when the Turnstile check cannot load").
2. The availability cannot be read (no network): no button shows, and the stored try's line still shows with its link (Task 3, "shows no button when the page cannot ask the server, and still follows her try").
3. A send that breaks after the try exists: the link is kept and offered in the form (Task 3, "keeps the link of a try whose send broke half-way"); the next visit shows "Corectarea nu a pornit încă …" (Task 2).
4. An expired try still in the database, or one already deleted: the line forgets it and the button comes back (Task 3, "forgets a try whose link no longer works"); the deletion never touches an account's rows (Task 1, "never touches a teacher's own classes, students and tests").
5. R2 fails during a cleanup: the rows stay and the next visit deletes the try (Task 1, "keeps the rows when the files could not be deleted …").

---

### Before Task 1: The branch

- [ ] **Step 1: Make the branch and check the prototype**

Run: `git switch -c feature/quick-try-landing main` and `git log --oneline -1`
Expected: HEAD `f9a5b3c Merge pull request #60 from parameciul/feature/quick-try-page` (or a later `main`; then the prototype comparisons below may also show the files `main` changed since).

Run: `git rev-parse --verify refs/protoqtc/c3`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

- [ ] **Step 2: Bring this plan onto the branch**

Run: `git checkout claude/quick-try-c-plan -- docs/superpowers/plans/2026-11-10-quick-try-c-landing.md`
Then: `git commit -m "Add the plan for the Quick Try landing page" -- docs/superpowers/plans/2026-11-10-quick-try-c-landing.md`
Expected: one commit with the one file.

### Task 1: Delete a try once its 7 days are over, and give the form its site key

**Files:**
- Create: `server/routes/quickTryCleanup.test.ts`, `server/quickTryCleanup.ts`
- Modify: `server/routes/quickTry.test.ts`, `src/try/TryApp.test.tsx`, `shared/quickTry.ts`, `shared/api.ts`, `server/env.ts`, `server/db/quickTry.ts`, `server/routes/quickTry.ts`, `src/try/TryNotice.tsx`, `docs/superpowers/specs/2026-11-09-quick-try-design.md`, `AGENTS.md`
- Test: `server/routes/quickTryCleanup.test.ts`, `server/routes/quickTry.test.ts`, `src/try/TryApp.test.tsx`

**Interfaces:**
- Consumes: part A's `quick_tries`, `teachers.quick_try`, `optionalTeacher`, `dailyLimitReached`; `inBackground` in `server/http.ts` (work after the answer; `TestApi.request` waits for it).
- Produces: `QUICK_TRY_CLEANUP_BATCH = 3` in `shared/quickTry.ts`; `QuickTryAvailability.siteKey: string | null`; `Env.TURNSTILE_SITE_KEY?: string`; `expiredTries(db, now, limit): Promise<{ teacherIds: number[]; keys: string[] }>` and `deleteTries(db, teacherIds): Promise<void>` in `server/db/quickTry.ts`; `cleanUpTries(env, now): Promise<number>` in `server/quickTryCleanup.ts`.

- [ ] **Step 1: Create `server/routes/quickTryCleanup.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { QUICK_TRY_CLEANUP_BATCH } from '../../shared/quickTry.ts';
import { sha256Hex } from '../secrets.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// Each visit of the landing page (GET /api/try/availability) deletes a few
// tries whose 7 days are over: their files, then their rows (spec §5).

let api: TestApi;

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeEach(async () => {
  api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined }, app: { verifyTurnstile: async () => true } });
});

afterEach(async () => {
  await api.dispose();
});

const put = (path: string, bytes: BodyInit, type: string, name: string) =>
  api.fetch(path, { method: 'PUT', body: bytes, headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) } });

// A try with its test, its barem and one page of the paper.
async function fullTry(ip = '203.0.113.5'): Promise<{ token: string; teacherId: number }> {
  const res = await api.request('POST', '/api/try', { turnstileToken: 'ok' }, { 'CF-Connecting-IP': ip });
  const { token, code } = res.body as { token: string; code: string };
  for (const kind of ['test', 'barem'] as const) {
    expect((await put(`/api/try/${token}/tests/${code}/files/${kind}`, pdf(kind), PDF_TYPE, `${kind}.pdf`)).status).toBe(200);
  }
  expect((await put(`/api/try/${token}/paper`, jpeg(), 'image/jpeg', 'pagina1.jpg')).status).toBe(201);
  const row = await api.db.prepare('SELECT teacher_id FROM quick_tries WHERE token_hash = ?').bind(await sha256Hex(token)).first<{ teacher_id: number }>();
  return { token, teacherId: row!.teacher_id };
}

const expire = (teacherId: number, at = '2020-01-01T00:00:00.000Z') =>
  api.db.prepare('UPDATE quick_tries SET expires_at = ? WHERE teacher_id = ?').bind(at, teacherId).run();

// The R2 keys of a try's files, from its rows.
async function keysOf(teacherId: number): Promise<string[]> {
  const rows = await api.db
    .prepare(
      `SELECT test_file_key AS k FROM tests WHERE teacher_id = ?1 UNION ALL SELECT barem_file_key FROM tests WHERE teacher_id = ?1
       UNION ALL SELECT f.r2_key FROM submission_files f JOIN submissions s ON s.id = f.submission_id JOIN tests t ON t.id = s.test_id WHERE t.teacher_id = ?1`,
    )
    .bind(teacherId)
    .all<{ k: string | null }>();
  return rows.results.map((row) => row.k).filter((key): key is string => key !== null);
}

// The rows a try has in every table it writes.
async function rowsOf(teacherId: number): Promise<number> {
  const row = await api.db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM teachers WHERE id = ?1) + (SELECT COUNT(*) FROM quick_tries WHERE teacher_id = ?1)
         + (SELECT COUNT(*) FROM classes WHERE teacher_id = ?1) + (SELECT COUNT(*) FROM students WHERE teacher_id = ?1)
         + (SELECT COUNT(*) FROM enrollments e JOIN students s ON s.id = e.student_id WHERE s.teacher_id = ?1)
         + (SELECT COUNT(*) FROM tests WHERE teacher_id = ?1) AS n`,
    )
    .bind(teacherId)
    .first<{ n: number }>();
  return row!.n;
}

const visit = () => api.request('GET', '/api/try/availability');

describe('deleting tries whose 7 days are over', () => {
  it("deletes an expired try's files and rows when the landing page is visited", async () => {
    const old = await fullTry();
    const keys = await keysOf(old.teacherId);
    expect(keys).toHaveLength(3);
    await expire(old.teacherId);
    expect((await visit()).status).toBe(200);
    expect(await rowsOf(old.teacherId)).toBe(0);
    expect((await api.db.prepare('SELECT COUNT(*) AS n FROM submission_files').first<{ n: number }>())!.n).toBe(0);
    for (const key of keys) expect(await api.env.FILES.head(key)).toBeNull();
    expect((await api.request('GET', `/api/try/${old.token}`)).body.error).toBe('unknown_try');
  });

  it('keeps a try whose 7 days are not over', async () => {
    const fresh = await fullTry();
    const rows = await rowsOf(fresh.teacherId);
    await visit();
    expect(await rowsOf(fresh.teacherId)).toBe(rows);
    for (const key of await keysOf(fresh.teacherId)) expect(await api.env.FILES.head(key)).not.toBeNull();
  });

  it(`deletes at most ${QUICK_TRY_CLEANUP_BATCH} tries per visit, the oldest first`, async () => {
    const tries = [];
    for (let i = 0; i <= QUICK_TRY_CLEANUP_BATCH; i++) tries.push(await fullTry(`198.51.100.${i}`));
    for (const [i, one] of tries.entries()) await expire(one.teacherId, `2020-01-0${i + 1}T00:00:00.000Z`);
    await visit();
    const left = await Promise.all(tries.map(async (one) => (await rowsOf(one.teacherId)) > 0));
    expect(left).toEqual([...Array<boolean>(QUICK_TRY_CLEANUP_BATCH).fill(false), true]);
    await visit();
    expect(await rowsOf(tries[QUICK_TRY_CLEANUP_BATCH]!.teacherId)).toBe(0);
  });

  it("never touches a teacher's own classes, students and tests", async () => {
    const before = await rowsOf(api.teacherId);
    const old = await fullTry();
    await expire(old.teacherId);
    await visit();
    expect(await rowsOf(api.teacherId)).toBe(before);
  });

  it('keeps the rows when the files could not be deleted, so the next visit finds them again', async () => {
    const old = await fullTry();
    await expire(old.teacherId);
    const files = api.env.FILES;
    api.env.FILES = new Proxy(files, {
      get: (target, name) =>
        name === 'delete'
          ? async () => {
              throw new Error('R2 is down');
            }
          : (Reflect.get(target, name) as (...args: unknown[]) => unknown).bind(target),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await visit()).status).toBe(200);
    expect(await rowsOf(old.teacherId)).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
    api.env.FILES = files;
    await visit();
    expect(await rowsOf(old.teacherId)).toBe(0);
  });
});

describe('GET /api/try/availability', () => {
  it("gives the form the Turnstile site key, or null when it is not set", async () => {
    expect((await visit()).body.siteKey).toBeNull();
    await api.dispose();
    api = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined, TURNSTILE_SITE_KEY: '1x00000000000000000000AA' } });
    expect((await visit()).body).toEqual({ dailyLimitReached: false, admin: false, siteKey: '1x00000000000000000000AA' });
  });
});
```

- [ ] **Step 2: Edit `server/routes/quickTry.test.ts`**

Find this block:

```ts
    expect(res.body.error).toBe('quick_try_daily_limit');
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: true, admin: false });
  });
```

Replace it with:

```ts
    expect(res.body.error).toBe('quick_try_daily_limit');
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: true, admin: false, siteKey: null });
  });
```

- [ ] **Step 3: Edit `server/routes/quickTry.test.ts`**

Find this block:

```ts
    expect(counted!.n).toBe(0);
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: false, admin: true });
  });
```

Replace it with:

```ts
    expect(counted!.n).toBe(0);
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: false, admin: true, siteKey: null });
  });
```

- [ ] **Step 4: Edit `server/routes/quickTry.test.ts`**

Find this block:

```ts
    expect((await create({})).status).toBe(403);
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: false, admin: false });
  });
```

Replace it with:

```ts
    expect((await create({})).status).toBe(403);
    expect((await api.request('GET', '/api/try/availability')).body).toEqual({ dailyLimitReached: false, admin: false, siteKey: null });
  });
```

- [ ] **Step 5: Edit `src/try/TryApp.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('heading', { name: 'Linkul nu este bun' })).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(await screen.findByRole('heading', { name: 'Linkul nu este bun' })).toBeInTheDocument();
    // A try is deleted once its 7 days are over: its link then answers as unknown.
    expect(screen.getByText('Verifică dacă l-ai copiat întreg. O încercare se șterge după 7 zile.')).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run server/routes/quickTryCleanup.test.ts server/routes/quickTry.test.ts src/try/TryApp.test.tsx`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  8 failed | 14 passed (22)`: no try is deleted (`expected 6 to be +0`, and the batch test, named "deletes at most undefined tries …" while the constant is missing, finds none deleted), the availability has no `siteKey` (`expected undefined to be null`, and the three answers of `server/routes/quickTry.test.ts` lack it), the R2 failure warns nothing, and the try's page lacks the line "O încercare se șterge după 7 zile." The 14 tests that pass at RED are the other tests of the three files, and "keeps a try whose 7 days are not over" and "never touches a teacher's own classes, students and tests", which guard what must not change.

- [ ] **Step 7: Edit `shared/quickTry.ts`**

Find this block:

```ts
export const QUICK_TRY_FILE_CHANGES = 6;

```

Replace it with:

```ts
export const QUICK_TRY_FILE_CHANGES = 6;
// Tries whose days are over that one visit of the landing page deletes (each
// costs one R2 call and a few D1 statements, inside a request's limits).
export const QUICK_TRY_CLEANUP_BATCH = 3;

```

- [ ] **Step 8: Edit `shared/api.ts`**

Find this block:

```ts
// What the landing page reads before the form: whether today's tries are all
// used, and whether the visitor is an administrator (who skips the limits).
export interface QuickTryAvailability {
```

Replace it with:

```ts
// What the landing page reads before the form: whether today's tries are all
// used, whether the visitor is an administrator (who skips the limits), and
// the form's Turnstile site key (public; null when it is not set).
export interface QuickTryAvailability {
```

- [ ] **Step 9: Edit `shared/api.ts`**

Find this block:

```ts
  admin: boolean;
}
```

Replace it with:

```ts
  admin: boolean;
  siteKey: string | null;
}
```

- [ ] **Step 10: Edit `server/env.ts`**

Find this block:

```ts
  TURNSTILE_SECRET_KEY?: string;
}
```

Replace it with:

```ts
  TURNSTILE_SECRET_KEY?: string;
  // The Turnstile site key of the same widget: public, given to the form.
  TURNSTILE_SITE_KEY?: string;
}
```

- [ ] **Step 11: Edit `server/db/quickTry.ts`**

Find this block:

```ts

// Whether the test is a Quick Try test: its refusals have their own messages.
```

Replace it with:

```ts

// The guest teachers of the tries whose days are over, the oldest first.
const EXPIRED = `SELECT q.teacher_id FROM quick_tries q JOIN teachers g ON g.id = q.teacher_id AND g.quick_try = 1
  WHERE q.expires_at <= ? ORDER BY q.expires_at, q.id LIMIT ?`;

// The ids of a JSON list, kept to guest teachers: a cleanup never reaches an account.
const GUESTS = 'SELECT id FROM teachers WHERE quick_try = 1 AND id IN (SELECT value FROM json_each(?1))';

// Up to `limit` tries whose days are over, and the R2 keys of their files,
// read from the rows (never from listing R2).
export async function expiredTries(db: D1Database, now: string, limit: number): Promise<{ teacherIds: number[]; keys: string[] }> {
  const found = await db.prepare(EXPIRED).bind(now, limit).all<{ teacher_id: number }>();
  const teacherIds = found.results.map((row) => row.teacher_id);
  if (teacherIds.length === 0) return { teacherIds, keys: [] };
  // One row per test with its six file keys, and one per page (D1 allows few
  // parts in a compound SELECT).
  const rows = await db
    .prepare(
      `SELECT test_file_key AS a, barem_file_key AS b, print_file_key AS c, ces_test_file_key AS d, ces_barem_file_key AS e, ces_print_file_key AS f
       FROM tests WHERE teacher_id IN (${GUESTS})
       UNION ALL
       SELECT p.r2_key, NULL, NULL, NULL, NULL, NULL FROM submission_files p JOIN submissions s ON s.id = p.submission_id JOIN tests t ON t.id = s.test_id
       WHERE t.teacher_id IN (${GUESTS})`,
    )
    .bind(JSON.stringify(teacherIds))
    .all<Record<string, string | null>>();
  const keys = rows.results.flatMap((row) => Object.values(row).filter((key): key is string => typeof key === 'string'));
  return { teacherIds, keys };
}

// Deletes the tries' rows in one batch, in the order the foreign keys need:
// the test (its paper, pages, grading and points go with it), the class
// list, the student, the class, the try and the guest teacher (its sessions go with it).
export async function deleteTries(db: D1Database, teacherIds: number[]): Promise<void> {
  const list = JSON.stringify(teacherIds);
  await db.batch(
    [
      `DELETE FROM tests WHERE teacher_id IN (${GUESTS})`,
      `DELETE FROM enrollments WHERE class_id IN (SELECT id FROM classes WHERE teacher_id IN (${GUESTS}))`,
      `DELETE FROM students WHERE teacher_id IN (${GUESTS})`,
      `DELETE FROM classes WHERE teacher_id IN (${GUESTS})`,
      `DELETE FROM quick_tries WHERE teacher_id IN (${GUESTS})`,
      `DELETE FROM teachers WHERE id IN (${GUESTS})`,
    ].map((sql) => db.prepare(sql).bind(list)),
  );
}

// Whether the test is a Quick Try test: its refusals have their own messages.
```

- [ ] **Step 12: Create `server/quickTryCleanup.ts`**

```ts
import { QUICK_TRY_CLEANUP_BATCH } from '../shared/quickTry.ts';
import { deleteTries, expiredTries } from './db/quickTry.ts';
import type { Env } from './env.ts';

// Deletes a few tries whose 7 days are over (spec §5): their R2 files first,
// then their rows. When R2 fails, the rows stay and the next call finds the
// files again. Answers how many tries it deleted.
export async function cleanUpTries(env: Env, now: string): Promise<number> {
  const { teacherIds, keys } = await expiredTries(env.DB, now, QUICK_TRY_CLEANUP_BATCH);
  if (teacherIds.length === 0) return 0;
  if (keys.length > 0) await env.FILES.delete(keys);
  await deleteTries(env.DB, teacherIds);
  return teacherIds.length;
}
```

- [ ] **Step 13: Edit `server/routes/quickTry.ts`**

Find this block:

```ts
import { ApiError } from '../errors.ts';
import { clientIpKey, nowIso, parseId, readJson, sameOriginWrites } from '../http.ts';
import { newDeviceSecret, newResultToken, randomBase32, sha256Hex } from '../secrets.ts';
```

Replace it with:

```ts
import { ApiError } from '../errors.ts';
import { clientIpKey, inBackground, nowIso, parseId, readJson, sameOriginWrites } from '../http.ts';
import { cleanUpTries } from '../quickTryCleanup.ts';
import { newDeviceSecret, newResultToken, randomBase32, sha256Hex } from '../secrets.ts';
```

- [ ] **Step 14: Edit `server/routes/quickTry.ts`**

Find this block:

```ts

  routes.get('/availability', async (c) => {
    const teacher = await optionalTeacher(c);
    const admin = teacher?.role === 'admin';
    const answer: QuickTryAvailability = { dailyLimitReached: !admin && (await dailyLimitReached(c.env.DB, nowIso())), admin };
    return c.json(answer);
```

Replace it with:

```ts

  // The landing page reads this on every visit: after the answer, the visit
  // also deletes a few tries whose days are over (no timer runs on Pages).
  routes.get('/availability', async (c) => {
    const now = nowIso();
    const teacher = await optionalTeacher(c);
    const admin = teacher?.role === 'admin';
    const answer: QuickTryAvailability = {
      dailyLimitReached: !admin && (await dailyLimitReached(c.env.DB, now)),
      admin,
      siteKey: c.env.TURNSTILE_SITE_KEY || null,
    };
    inBackground(c, cleanUpTries(c.env, now));
    return c.json(answer);
```

- [ ] **Step 15: Edit `src/try/TryNotice.tsx`**

Find this block:

```tsx
      <h1>Linkul nu este bun</h1>
      <p>Verifică dacă l-ai copiat întreg.</p>
      <a className="button" href="/">
```

Replace it with:

```tsx
      <h1>Linkul nu este bun</h1>
      <p>Verifică dacă l-ai copiat întreg. O încercare se șterge după 7 zile.</p>
      <a className="button" href="/">
```

- [ ] **Step 16: Edit `docs/superpowers/specs/2026-11-09-quick-try-design.md`**

Find this block:

```markdown

- On the last day of each month, every try older than 7 days is deleted: its rows and its R2 files (test, barem, photos, generated files) **(owner, option B)**.
- R2 keys come from rows, never from listing R2 (project rule).
- Note: the GitHub schedule does not fire reliably in this project (see root `AGENTS.md`: every path that makes robot work starts the robot). The cleanup needs a trigger that works; see "Left to the builder".

Privacy **(owner)**: the form has no consent checkbox and no "cover the name" warning. The owner accepts that photos, which may show a student's name, can stay up to about 37 days with the monthly cleanup.

```

Replace it with:

```markdown

- A try is deleted once its 7 days are over: its rows and its R2 files (test, barem, photos, generated files) **(owner, 2026-11-10; this replaces the monthly cleanup, option B)**.
- The trigger: Pages runs no timer and the GitHub schedule does not fire reliably, so each visit of the landing page (`GET /api/try/availability`) deletes, after its answer, up to `QUICK_TRY_CLEANUP_BATCH` (3) tries whose days are over, the oldest first: their R2 files, then their rows. When R2 fails, the rows stay and a later visit tries again **(builder call, made while planning part C)**.
- R2 keys come from rows, never from listing R2 (project rule).
- A deleted try's link answers like an unknown link; the try's page then says that a try is deleted after 7 days **(builder call, made while planning part C)**.

Privacy **(owner)**: the form has no consent checkbox and no "cover the name" warning. The owner accepts that photos, which may show a student's name, stay about 7 days, a little longer when nobody visits the landing page.

```

- [ ] **Step 17: Edit `docs/superpowers/specs/2026-11-09-quick-try-design.md`**

Find this block:

```markdown
- **Pages.** Whether the try's page is a new entry (for example `/try/<token>`) or a route in an existing app, and how much of the admin review and results components it reuses. The look follows the redesign spec (`docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`).
- **The cleanup trigger.** A trigger that really runs on the last day of the month (for example a check in a request path, or the robot's run calling a cleanup endpoint), and that stays within the per-request limits (delete in chunks).
- **Where the global limit lives** (a constant like `DEMO_PAPER_LIMIT`, or a Setări value).
```

Replace it with:

```markdown
- **Pages.** Whether the try's page is a new entry (for example `/try/<token>`) or a route in an existing app, and how much of the admin review and results components it reuses. The look follows the redesign spec (`docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`).
- **The cleanup trigger.** Settled while planning part C: each visit of the landing page (§5).
- **Where the global limit lives** (a constant like `DEMO_PAPER_LIMIT`, or a Setări value).
```

- [ ] **Step 18: Edit `AGENTS.md`**

Find this block:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`, migration 0026): one free grading without an account, at `/api/try`. Each try is a hidden guest teacher (`teachers.quick_try`, disabled, never an account) with its own class, student, test (`tests.quick_try`) and paper; its link `/api/try/<token>` serves the teacher API's own routes for that guest teacher behind an allow-list (`ALLOWED` in `server/routes/quickTry.ts`). A Quick Try test never gets a print job or a class analysis. The limits (`QUICK_TRY_IP_LIMIT` per IP and `QUICK_TRY_DAILY_LIMIT` in total per Bucharest day, `shared/quickTry.ts`) are checked in the SQL of the try's first INSERT (`createQuickTry`); a failed try gives its IP place back, not its daily place. An administrator skips Turnstile and the limits and is not counted. One try makes bounded robot work, checked in the writes' SQL: one barem generation, only with no barem (`requestBarem`), and at most `QUICK_TRY_FILE_CHANGES` changes of its test and barem files (`saveTestFile`). The try's page is `/try/<token>` (`src/try/`), private like a student link: `_headers` gives it noindex and `robots.txt` closes `/try/` in every group.
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

Replace it with:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`, migration 0026): one free grading without an account, at `/api/try`. Each try is a hidden guest teacher (`teachers.quick_try`, disabled, never an account) with its own class, student, test (`tests.quick_try`) and paper; its link `/api/try/<token>` serves the teacher API's own routes for that guest teacher behind an allow-list (`ALLOWED` in `server/routes/quickTry.ts`). A Quick Try test never gets a print job or a class analysis. The limits (`QUICK_TRY_IP_LIMIT` per IP and `QUICK_TRY_DAILY_LIMIT` in total per Bucharest day, `shared/quickTry.ts`) are checked in the SQL of the try's first INSERT (`createQuickTry`); a failed try gives its IP place back, not its daily place. An administrator skips Turnstile and the limits and is not counted. One try makes bounded robot work, checked in the writes' SQL: one barem generation, only with no barem (`requestBarem`), and at most `QUICK_TRY_FILE_CHANGES` changes of its test and barem files (`saveTestFile`). The try's page is `/try/<token>` (`src/try/`), private like a student link: `_headers` gives it noindex and `robots.txt` closes `/try/` in every group. A try is deleted once its 7 days are over: each visit of the landing page (`GET /api/try/availability`) deletes, after its answer, up to `QUICK_TRY_CLEANUP_BATCH` such tries, their R2 files first, then their rows (`cleanUpTries`, `server/quickTryCleanup.ts`).
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

- [ ] **Step 19: Run the tests to see them pass**

Run: `npx vitest run server/routes/quickTryCleanup.test.ts server/routes/quickTry.test.ts src/try/TryApp.test.tsx`
Expected: PASS, `Test Files  3 passed (3)`.

- [ ] **Step 20: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  156 passed | 1 skipped (157)`, `Tests  2301 passed | 3 skipped (2304)`.

- [ ] **Step 21: Commit**

```bash
git add server/routes/quickTryCleanup.test.ts server/quickTryCleanup.ts server/routes/quickTry.test.ts src/try/TryApp.test.tsx shared/quickTry.ts shared/api.ts server/env.ts server/db/quickTry.ts server/routes/quickTry.ts src/try/TryNotice.tsx docs/superpowers/specs/2026-11-09-quick-try-design.md AGENTS.md
git commit -m "Delete a Quick Try once its 7 days are over, and give the form its Turnstile site key"
```

Check: `git diff --stat refs/protoqtc/c1 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 2: The form's logic: the stored try, its calls, the send, the status line

**Files:**
- Create: `src/landing/quickTry/storage.test.ts`, `src/landing/quickTry/api.test.ts`, `src/landing/quickTry/send.test.ts`, `src/landing/quickTry/status.test.ts`, `src/landing/quickTry/storage.ts`, `src/landing/quickTry/api.ts`, `src/landing/quickTry/send.ts`, `src/landing/quickTry/status.ts`
- Modify: `src/try/api.ts`
- Test: the four test files above, and `src/try/api.test.ts` (unchanged, it guards the refactor)

**Interfaces:**
- Consumes: Task 1's `QuickTryAvailability.siteKey`; part B's `tryBase(token)` and `phaseOf(detail)`, `TryPhase`; `fileProblem`, `TEACHER_FILE_TYPES`, `STUDENT_FILE_TYPES`, `MAX_STUDENT_FILES` in `shared/files.ts`; `bucharestDay`, `isQuickTryToken`, `QUICK_TRY_DAYS` in `shared/quickTry.ts`.
- Produces:
  - `apiRequest<T>(fetchImpl, url, method, body?, file?): Promise<T>` exported from `src/try/api.ts` (the try client's own request, now shared).
  - `storage.ts`: `StoredTry { token; code; madeAt }`, `STORED_TRY_KEY = 'quickeval.quickTry'`, `readStoredTry(storage, now): StoredTry | null`, `saveStoredTry(storage, stored): void`, `usedToday(stored, now): boolean`.
  - `api.ts`: `LandingApi { availability(); create(turnstileToken); uploadTestFile(token, code, kind, file); generateBarem(token, code); addPage(token, file); start(token); getTest(token, code) }`, `createLandingApi(fetchImpl?)`.
  - `send.ts`: `TryForm { test: File | null; barem: File | null; robotBarem: boolean; pages: File[] }`, `formProblem(form): string | null`, `SendEvents { onCreated(stored); onProgress(text) }`, `sendTry(api, form, turnstileToken, events, now?): Promise<StoredTry>`.
  - `status.ts`: `statusOf(detail): { text: string; working: boolean }`, `StartAnswer = 'yes' | 'used' | 'full' | 'off'`, `canStart(availability, stored, phase, now): StartAnswer`.

- [ ] **Step 1: Create `src/landing/quickTry/storage.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { readStoredTry, saveStoredTry, STORED_TRY_KEY, usedToday, type StoredTry } from './storage.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';

function memory(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const stored: StoredTry = { token: TOKEN, code: 'PROBA-26T1', madeAt: '2026-11-10T08:00:00.000Z' };

describe("the try kept on the visitor's device", () => {
  it('keeps the link and the time it was made', () => {
    const storage = memory();
    saveStoredTry(storage, stored);
    expect(JSON.parse(storage.getItem(STORED_TRY_KEY)!)).toEqual(stored);
    expect(readStoredTry(storage, new Date('2026-11-12T08:00:00.000Z'))).toEqual(stored);
  });

  it('forgets it after 7 days', () => {
    const storage = memory({ [STORED_TRY_KEY]: JSON.stringify(stored) });
    expect(readStoredTry(storage, new Date('2026-11-17T07:59:59.000Z'))).toEqual(stored);
    expect(readStoredTry(storage, new Date('2026-11-17T08:00:00.000Z'))).toBeNull();
  });

  it('a new try replaces the stored one', () => {
    const storage = memory({ [STORED_TRY_KEY]: JSON.stringify(stored) });
    const next = { ...stored, token: 'b'.repeat(32), madeAt: '2026-11-11T09:00:00.000Z' };
    saveStoredTry(storage, next);
    expect(readStoredTry(storage, new Date('2026-11-11T10:00:00.000Z'))).toEqual(next);
  });

  it('ignores what is not a try', () => {
    for (const raw of ['nu e JSON', '{}', JSON.stringify({ ...stored, token: 'scurt' }), JSON.stringify({ ...stored, madeAt: 'ieri' })]) {
      expect(readStoredTry(memory({ [STORED_TRY_KEY]: raw }), new Date('2026-11-10T09:00:00.000Z'))).toBeNull();
    }
  });

  it('works without storage, as in a private window that refuses it', () => {
    const refusing = memory();
    refusing.getItem = () => {
      throw new Error('denied');
    };
    refusing.setItem = () => {
      throw new Error('denied');
    };
    expect(readStoredTry(refusing, new Date())).toBeNull();
    expect(() => saveStoredTry(refusing, stored)).not.toThrow();
  });

  it("says whether it was made today, Bucharest's day", () => {
    // 23:30 in Bucharest on 10 November is 21:30 UTC.
    const late = { ...stored, madeAt: '2026-11-10T21:30:00.000Z' };
    expect(usedToday(late, new Date('2026-11-10T21:45:00.000Z'))).toBe(true);
    expect(usedToday(late, new Date('2026-11-10T22:05:00.000Z'))).toBe(false);
    expect(usedToday(null, new Date())).toBe(false);
  });
});
```

- [ ] **Step 2: Create `src/landing/quickTry/api.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../ui/ApiError.ts';
import { createLandingApi } from './api.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';

function fakeFetch(answer: unknown = {}, status = 200) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(answer, { status }));
}

describe("the landing page's client", () => {
  it('reads the availability and makes a try with the Turnstile answer', async () => {
    const fetchImpl = fakeFetch({ token: TOKEN, code: 'PROBA-26T1' });
    const api = createLandingApi(fetchImpl);
    await api.availability();
    expect(await api.create('raspuns')).toEqual({ token: TOKEN, code: 'PROBA-26T1' });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ['/api/try/availability', 'GET'],
      ['/api/try', 'POST'],
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string)).toEqual({ turnstileToken: 'raspuns' });
  });

  it("sends the files and the start to the try's own link", async () => {
    const fetchImpl = fakeFetch({});
    const api = createLandingApi(fetchImpl);
    const pdf = new File(['%PDF'], 'test.pdf', { type: 'application/pdf' });
    const photo = new File(['jpg'], 'pagina 1.jpg', { type: 'image/jpeg' });
    await api.uploadTestFile(TOKEN, 'PROBA-26T1', 'test', pdf);
    await api.generateBarem(TOKEN, 'PROBA-26T1');
    await api.addPage(TOKEN, photo);
    await api.start(TOKEN);
    await api.getTest(TOKEN, 'PROBA-26T1');
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [`/api/try/${TOKEN}/tests/PROBA-26T1/files/test`, 'PUT'],
      [`/api/try/${TOKEN}/tests/PROBA-26T1/barem/generate`, 'POST'],
      [`/api/try/${TOKEN}/paper`, 'PUT'],
      [`/api/try/${TOKEN}/start`, 'POST'],
      [`/api/try/${TOKEN}/tests/PROBA-26T1`, 'GET'],
    ]);
    const page = fetchImpl.mock.calls[2]![1]!;
    expect(page.body).toBe(photo);
    expect(new Headers(page.headers).get('X-File-Name')).toBe('pagina%201.jpg');
    expect(new Headers(page.headers).get('Content-Type')).toBe('image/jpeg');
  });

  it("gives the server's refusal as an ApiError with its message", async () => {
    const api = createLandingApi(fakeFetch({ error: 'quick_try_daily_limit', message: 'Limita de încercări gratuite pentru azi a fost atinsă.' }, 429));
    await expect(api.create('x')).rejects.toEqual(new ApiError(429, 'quick_try_daily_limit', 'Limita de încercări gratuite pentru azi a fost atinsă.'));
  });

  it('says so when there is no network', async () => {
    const api = createLandingApi(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api.availability()).rejects.toMatchObject({ code: 'network' });
  });
});
```

- [ ] **Step 3: Create `src/landing/quickTry/send.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { MAX_STUDENT_FILES } from '../../../shared/files.ts';
import { ApiError } from '../../ui/ApiError.ts';
import type { LandingApi } from './api.ts';
import { formProblem, sendTry, type TryForm } from './send.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';
const NOW = new Date('2026-11-10T08:00:00.000Z');

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: 'application/pdf' });
const photo = (name: string) => new File(['jpg'], name, { type: 'image/jpeg' });

function fakeLandingApi() {
  const calls: string[] = [];
  const api = {
    availability: vi.fn(async () => ({ dailyLimitReached: false, admin: false, siteKey: 'site' })),
    create: vi.fn(async (_turnstileToken?: string) => {
      calls.push('create');
      return { token: TOKEN, code: 'PROBA-26T1' };
    }),
    uploadTestFile: vi.fn(async (_token: string, _code: string, kind: 'test' | 'barem', file: File) => void calls.push(`${kind}:${file.name}`)),
    generateBarem: vi.fn(async () => void calls.push('generate')),
    addPage: vi.fn(async (_token: string, file: File) => void calls.push(`page:${file.name}`)),
    start: vi.fn(async () => void calls.push('start')),
    getTest: vi.fn(),
  } satisfies LandingApi;
  return { api, calls };
}

const full: TryForm = { test: pdf('test.pdf'), barem: pdf('barem.pdf'), robotBarem: false, pages: [photo('p1.jpg'), photo('p2.jpg')] };

describe('the form before it is sent', () => {
  it('asks for the test, a barem or the robot, and the pages', () => {
    expect(formProblem({ ...full, test: null })).toBe('Alege fișierul testului.');
    expect(formProblem({ ...full, barem: null })).toBe('Alege fișierul baremului sau cere ca baremul să fie făcut din test.');
    expect(formProblem({ ...full, pages: [] })).toBe('Alege pozele sau PDF-ul lucrării.');
    expect(formProblem(full)).toBeNull();
    expect(formProblem({ ...full, barem: null, robotBarem: true })).toBeNull();
  });

  it("checks each file like the app: the type, an empty file, the size, the pages' count", () => {
    expect(formProblem({ ...full, test: photo('test.jpg') })).toBe('Testul: Încarcă un fișier PDF sau Word (.docx).');
    expect(formProblem({ ...full, barem: new File([], 'barem.pdf', { type: 'application/pdf' }) })).toBe('Baremul: Fișierul este gol.');
    const big = pdf('p.pdf');
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    expect(formProblem({ ...full, pages: [big] })).toBe('p.pdf: Fișierul are peste 25 MB.');
    expect(formProblem({ ...full, pages: [new File(['x'], 'p.heic', { type: 'image/heic' })] })).toBe('p.heic: Trimite poze JPG sau PDF.');
    const many = Array.from({ length: MAX_STUDENT_FILES + 1 }, (_, i) => photo(`p${i}.jpg`));
    expect(formProblem({ ...full, pages: many })).toBe(`Poți trimite cel mult ${MAX_STUDENT_FILES} de fișiere.`);
  });

  it('takes her barem over the robot when she gives both', () => {
    expect(formProblem({ ...full, robotBarem: true })).toBeNull();
  });
});

describe('sending a try', () => {
  it('makes the try, sends the files in order and starts the grading with her barem', async () => {
    const { api, calls } = fakeLandingApi();
    const created = vi.fn();
    const progress = vi.fn();
    const stored = await sendTry(api, full, 'raspuns', { onCreated: created, onProgress: progress }, () => NOW);
    expect(calls).toEqual(['create', 'test:test.pdf', 'barem:barem.pdf', 'page:p1.jpg', 'page:p2.jpg', 'start']);
    expect(api.create).toHaveBeenCalledWith('raspuns');
    expect(stored).toEqual({ token: TOKEN, code: 'PROBA-26T1', madeAt: NOW.toISOString() });
    expect(created).toHaveBeenCalledWith(stored);
    expect(progress.mock.calls.map(([text]) => text)).toEqual([
      'Se pregătește încercarea…',
      'Se trimite testul…',
      'Se trimite baremul…',
      'Se trimit paginile lucrării: 1 din 2…',
      'Se trimit paginile lucrării: 2 din 2…',
      'Se pornește corectarea…',
    ]);
  });

  it('asks for the barem and does not start: she reads it first', async () => {
    const { api, calls } = fakeLandingApi();
    await sendTry(api, { ...full, barem: null, robotBarem: true }, undefined, { onCreated: vi.fn(), onProgress: vi.fn() }, () => NOW);
    expect(calls).toEqual(['create', 'test:test.pdf', 'generate', 'page:p1.jpg', 'page:p2.jpg']);
    expect(api.create).toHaveBeenCalledWith(undefined);
  });

  it('keeps the try as soon as it is made, so a send that breaks half-way can go on from its page', async () => {
    const { api, calls } = fakeLandingApi();
    api.addPage.mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    const created = vi.fn();
    await expect(sendTry(api, full, 'raspuns', { onCreated: created, onProgress: vi.fn() }, () => NOW)).rejects.toMatchObject({ code: 'network' });
    expect(created).toHaveBeenCalledWith({ token: TOKEN, code: 'PROBA-26T1', madeAt: NOW.toISOString() });
    expect(calls).not.toContain('start');
  });

  it('keeps nothing when the try is refused', async () => {
    const { api } = fakeLandingApi();
    api.create.mockRejectedValueOnce(new ApiError(429, 'quick_try_ip_limit', 'Limita'));
    const created = vi.fn();
    await expect(sendTry(api, full, 'raspuns', { onCreated: created, onProgress: vi.fn() }, () => NOW)).rejects.toMatchObject({ status: 429 });
    expect(created).not.toHaveBeenCalled();
    expect(api.uploadTestFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Create `src/landing/quickTry/status.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../../shared/files.ts';
import { tryTest } from '../../test/fakeTryApi.tsx';
import { canStart, statusOf } from './status.ts';

const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };
const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';
const today = { token: TOKEN, code: 'PROBA-26T1', madeAt: '2026-11-10T08:00:00.000Z' };
const now = new Date('2026-11-10T12:00:00.000Z');
const open = { dailyLimitReached: false, admin: false, siteKey: 'site' };

describe('the status line under the button', () => {
  it('follows the robot while it makes the barem, then waits for her start', () => {
    expect(statusOf(tryTest({ files: { ...files, barem: null }, barem: { request: 'requested', unchecked: false } }))).toEqual({
      text: 'Se face baremul…',
      working: true,
    });
    expect(statusOf(tryTest({ files, barem: { request: 'none', unchecked: true } }))).toEqual({
      text: 'Baremul este gata. Deschide încercarea ca să-l citești și să pornești corectarea.',
      working: false,
    });
  });

  it('follows the grading to the graded paper', () => {
    expect(statusOf(tryTest({ status: 'evaluating', files }, { status: 'submitted' }))).toEqual({ text: 'Se corectează… Durează câteva minute.', working: true });
    expect(statusOf(tryTest({ status: 'done', files }, { status: 'graded' }))).toEqual({ text: 'Lucrarea este corectată.', working: false });
  });

  it("names what waits for her: the barem's problem, or a file the form did not send", () => {
    const problem = tryTest({ status: 'evaluating', files, exerciseList: { status: 'problem', message: 'Punctajele dau 9.' } }, { status: 'submitted' });
    expect(statusOf(problem)).toEqual({ text: 'Baremul are o problemă. Deschide încercarea ca să alegi ce faci.', working: false });
    expect(statusOf(tryTest({ files: { ...files, barem: null } }))).toEqual({
      text: 'Corectarea nu a pornit încă. Deschide încercarea ca să trimiți ce lipsește și s-o pornești.',
      working: false,
    });
  });

  it('says a failed try does not count, so she may make another today', () => {
    expect(statusOf(tryTest({ files, barem: { request: 'failed', unchecked: false } }))).toEqual({
      text: 'Încercarea nu a reușit. Nu se numără: poți face alta azi.',
      working: false,
    });
  });
});

describe('whether she may make a try now', () => {
  it('lets her make one when the day has room and this device made none today', () => {
    expect(canStart(open, null, null, now)).toBe('yes');
    expect(canStart(open, { ...today, madeAt: '2026-11-09T08:00:00.000Z' }, 'graded', now)).toBe('yes');
  });

  it("keeps one try per device per day, unless today's failed", () => {
    expect(canStart(open, today, 'grading', now)).toBe('used');
    expect(canStart(open, today, null, now)).toBe('used');
    expect(canStart(open, today, 'failed', now)).toBe('yes');
  });

  it("says when the platform's tries for today are all used", () => {
    expect(canStart({ ...open, dailyLimitReached: true }, null, null, now)).toBe('full');
  });

  it('lets an administrator make as many as she wants', () => {
    expect(canStart({ ...open, admin: true, dailyLimitReached: true }, today, 'grading', now)).toBe('yes');
  });

  it('cannot start without the Turnstile key, except for an administrator', () => {
    expect(canStart({ ...open, siteKey: null }, null, null, now)).toBe('off');
    expect(canStart({ ...open, siteKey: null, admin: true }, null, null, now)).toBe('yes');
  });
});
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run src/landing/quickTry`
Expected: FAIL. `Test Files  4 failed (4)`, `Tests  no tests`: `Failed to resolve import "./storage.ts"` (and `./api.ts`, `./send.ts`, `./status.ts`).

- [ ] **Step 6: Edit `src/try/api.ts`**

Find this block:

```ts

export function createTryClient(token: string, options: { fetchImpl?: typeof fetch } = {}): TryApi {
```

Replace it with:

```ts

// One call of the API: a JSON body, or one file as the whole body (its name
// in X-File-Name). The answer is JSON; a refusal throws its ApiError. The
// landing page's form uses it too.
export async function apiRequest<T>(fetchImpl: typeof fetch, url: string, method: string, body?: unknown, file?: File): Promise<T> {
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
    res = await fetchImpl(url, { method, headers, credentials: 'same-origin', ...(payload === undefined ? {} : { body: payload }) });
  } catch {
    throw new ApiError(0, 'network', NETWORK_MESSAGE);
  }
  return readAnswer<T>(res);
}

export function createTryClient(token: string, options: { fetchImpl?: typeof fetch } = {}): TryApi {
```

- [ ] **Step 7: Edit `src/try/api.ts`**

Find this block:

```ts
  const base = tryBase(token);

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
      res = await fetchImpl(`${base}${path}`, { method, headers, credentials: 'same-origin', ...(payload === undefined ? {} : { body: payload }) });
    } catch {
      throw new ApiError(0, 'network', NETWORK_MESSAGE);
    }
    return readAnswer<T>(res);
  }

```

Replace it with:

```ts
  const base = tryBase(token);
  const request = <T>(method: string, path: string, body?: unknown, file?: File) => apiRequest<T>(fetchImpl, `${base}${path}`, method, body, file);

```

- [ ] **Step 8: Create `src/landing/quickTry/storage.ts`**

```ts
import { bucharestDay, isQuickTryToken, QUICK_TRY_DAYS } from '../../../shared/quickTry.ts';

// The visitor's last try, kept on her device for 7 days (spec §3.1): its link,
// its test's code and the time it was made. A new try replaces it.
export interface StoredTry {
  token: string;
  code: string;
  madeAt: string;
}

export const STORED_TRY_KEY = 'quickeval.quickTry';

const DAY_MS = 24 * 60 * 60 * 1000;

// The stored try, or null when there is none, it is not a try, or its 7 days
// are over. A storage that refuses (a private window) keeps nothing.
export function readStoredTry(storage: Storage, now: Date): StoredTry | null {
  let raw: string | null;
  try {
    raw = storage.getItem(STORED_TRY_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let value: Partial<StoredTry> | null;
  try {
    value = JSON.parse(raw) as Partial<StoredTry> | null;
  } catch {
    return null;
  }
  const { token, code, madeAt } = value ?? {};
  if (typeof token !== 'string' || !isQuickTryToken(token) || typeof code !== 'string' || typeof madeAt !== 'string') return null;
  const made = Date.parse(madeAt);
  if (Number.isNaN(made) || now.getTime() >= made + QUICK_TRY_DAYS * DAY_MS) return null;
  return { token, code, madeAt };
}

export function saveStoredTry(storage: Storage, stored: StoredTry): void {
  try {
    storage.setItem(STORED_TRY_KEY, JSON.stringify(stored));
  } catch {
    // A storage that refuses: the link still shows until the page closes.
  }
}

// Whether the stored try was made on today's Bucharest day: one try per device per day.
export function usedToday(stored: StoredTry | null, now: Date): boolean {
  return stored !== null && bucharestDay(new Date(stored.madeAt)) === bucharestDay(now);
}
```

- [ ] **Step 9: Create `src/landing/quickTry/api.ts`**

```ts
import type { QuickTryAvailability, QuickTryCreated, TestDetail } from '../../../shared/api.ts';
import type { TestFileKind } from '../../../shared/files.ts';
import { apiRequest, tryBase } from '../../try/api.ts';

// The calls of the landing page's Quick Try form: what it reads before the
// form, the new try, and, through the try's link, the files, the start and
// the test the status line follows. Tests pass a fake.
export interface LandingApi {
  availability(): Promise<QuickTryAvailability>;
  create(turnstileToken: string | undefined): Promise<QuickTryCreated>;
  uploadTestFile(token: string, code: string, kind: TestFileKind, file: File): Promise<void>;
  generateBarem(token: string, code: string): Promise<void>;
  addPage(token: string, file: File): Promise<void>;
  start(token: string): Promise<void>;
  getTest(token: string, code: string): Promise<TestDetail>;
}

export function createLandingApi(fetchImpl: typeof fetch = (input, init) => fetch(input, init)): LandingApi {
  const call = <T>(url: string, method: string, body?: unknown, file?: File) => apiRequest<T>(fetchImpl, url, method, body, file);
  const test = (token: string, code: string) => `${tryBase(token)}/tests/${encodeURIComponent(code)}`;
  return {
    availability: () => call<QuickTryAvailability>('/api/try/availability', 'GET'),
    create: (turnstileToken) => call<QuickTryCreated>('/api/try', 'POST', turnstileToken === undefined ? {} : { turnstileToken }),
    uploadTestFile: async (token, code, kind, file) => {
      await call(`${test(token, code)}/files/${kind}`, 'PUT', undefined, file);
    },
    generateBarem: async (token, code) => {
      await call(`${test(token, code)}/barem/generate`, 'POST');
    },
    addPage: async (token, file) => {
      await call(`${tryBase(token)}/paper`, 'PUT', undefined, file);
    },
    start: async (token) => {
      await call(`${tryBase(token)}/start`, 'POST', {});
    },
    getTest: (token, code) => call<TestDetail>(test(token, code), 'GET'),
  };
}
```

- [ ] **Step 10: Create `src/landing/quickTry/send.ts`**

```ts
import {
  fileProblem,
  MAX_STUDENT_FILES,
  STUDENT_FILE_TYPES,
  STUDENT_WRONG_TYPE,
  TEACHER_FILE_TYPES,
  TEACHER_WRONG_TYPE,
} from '../../../shared/files.ts';
import type { LandingApi } from './api.ts';
import type { StoredTry } from './storage.ts';

// What the form holds (spec §3.2): the test, her barem or the robot's, and
// the student's pages.
export interface TryForm {
  test: File | null;
  barem: File | null;
  // "Nu am barem": the barem is made from the test. Her own file wins.
  robotBarem: boolean;
  pages: File[];
}

// Why the form cannot be sent yet, in Romanian; null when it can. The files
// are checked like the app's: the test and barem like a teacher's, the
// pages like a student's.
export function formProblem(form: TryForm): string | null {
  if (!form.test) return 'Alege fișierul testului.';
  const test = fileProblem(form.test, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
  if (test) return `Testul: ${test}`;
  if (form.barem) {
    const barem = fileProblem(form.barem, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
    if (barem) return `Baremul: ${barem}`;
  } else if (!form.robotBarem) {
    return 'Alege fișierul baremului sau cere ca baremul să fie făcut din test.';
  }
  if (form.pages.length === 0) return 'Alege pozele sau PDF-ul lucrării.';
  if (form.pages.length > MAX_STUDENT_FILES) return `Poți trimite cel mult ${MAX_STUDENT_FILES} de fișiere.`;
  for (const page of form.pages) {
    const problem = fileProblem(page, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE);
    if (problem) return `${page.name}: ${problem}`;
  }
  return null;
}

export interface SendEvents {
  // The try exists: keep its link now, so a send that breaks half-way goes
  // on from the try's page.
  onCreated(stored: StoredTry): void;
  onProgress(text: string): void;
}

// Makes the try and sends what the form holds, in order. With her barem the
// grading starts at once; with the robot's she starts it on the try's page,
// after she reads it (spec §3.3, state 2). A refusal throws its ApiError.
export async function sendTry(
  api: LandingApi,
  form: TryForm,
  turnstileToken: string | undefined,
  events: SendEvents,
  now: () => Date = () => new Date(),
): Promise<StoredTry> {
  events.onProgress('Se pregătește încercarea…');
  const { token, code } = await api.create(turnstileToken);
  const stored: StoredTry = { token, code, madeAt: now().toISOString() };
  events.onCreated(stored);
  events.onProgress('Se trimite testul…');
  await api.uploadTestFile(token, code, 'test', form.test!);
  if (form.barem) {
    events.onProgress('Se trimite baremul…');
    await api.uploadTestFile(token, code, 'barem', form.barem);
  } else {
    events.onProgress('Se cere baremul…');
    await api.generateBarem(token, code);
  }
  for (const [index, page] of form.pages.entries()) {
    events.onProgress(`Se trimit paginile lucrării: ${index + 1} din ${form.pages.length}…`);
    await api.addPage(token, page);
  }
  if (form.barem) {
    events.onProgress('Se pornește corectarea…');
    await api.start(token);
  }
  return stored;
}
```

- [ ] **Step 11: Create `src/landing/quickTry/status.ts`**

```ts
import type { QuickTryAvailability, TestDetail } from '../../../shared/api.ts';
import { phaseOf, type TryPhase } from '../../try/phase.ts';
import { usedToday, type StoredTry } from './storage.ts';

// The status line under the button (spec §3.1): what the try waits for, and
// whether the robot works for it (the line then reads the test again).
export function statusOf(detail: TestDetail): { text: string; working: boolean } {
  const phase = phaseOf(detail);
  const { barem, files } = detail.test;
  if (phase === 'failed') return { text: 'Încercarea nu a reușit. Nu se numără: poți face alta azi.', working: false };
  if (phase === 'graded') return { text: 'Lucrarea este corectată.', working: false };
  if (phase === 'grading') return { text: 'Se corectează… Durează câteva minute.', working: true };
  if (phase === 'problem') return { text: 'Baremul are o problemă. Deschide încercarea ca să alegi ce faci.', working: false };
  if (barem.request === 'requested') return { text: 'Se face baremul…', working: true };
  if (barem.unchecked && files.barem) {
    return { text: 'Baremul este gata. Deschide încercarea ca să-l citești și să pornești corectarea.', working: false };
  }
  return { text: 'Corectarea nu a pornit încă. Deschide încercarea ca să trimiți ce lipsește și s-o pornești.', working: false };
}

// Whether the button may open the form: 'yes'; 'used' (this device made its
// try today and it did not fail); 'full' (the platform's tries for today are
// all used); 'off' (no Turnstile key, so only an administrator can make a
// try). An administrator always may.
export type StartAnswer = 'yes' | 'used' | 'full' | 'off';

export function canStart(availability: QuickTryAvailability, stored: StoredTry | null, phase: TryPhase | null, now: Date): StartAnswer {
  if (availability.admin) return 'yes';
  if (!availability.siteKey) return 'off';
  if (usedToday(stored, now) && phase !== 'failed') return 'used';
  if (availability.dailyLimitReached) return 'full';
  return 'yes';
}
```

- [ ] **Step 12: Run the tests to see them pass**

Run: `npx vitest run src/landing/quickTry src/try/api.test.ts`
Expected: PASS, `Test Files  5 passed (5)`, `Tests  30 passed (30)`.

- [ ] **Step 13: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  160 passed | 1 skipped (161)`, `Tests  2327 passed | 3 skipped (2330)`.

- [ ] **Step 14: Commit**

```bash
git add src/landing/quickTry/storage.test.ts src/landing/quickTry/api.test.ts src/landing/quickTry/send.test.ts src/landing/quickTry/status.test.ts src/landing/quickTry/storage.ts src/landing/quickTry/api.ts src/landing/quickTry/send.ts src/landing/quickTry/status.ts src/try/api.ts
git commit -m "Add the Quick Try form's logic: the stored try, its calls, the send and the status line"
```

Check: `git diff --stat refs/protoqtc/c2 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 3: The button, the form and the status line on the landing page

**Files:**
- Create: `src/landing/quickTry/ui.test.ts`, `src/landing/quickTry/turnstile.test.ts`, `src/landing/quickTry/ui.ts`, `src/landing/quickTry/turnstile.ts`
- Modify: `index.html`, `public/_headers`, `src/landing/landing.ts`, `src/landing/landing.css`, `docs/deploy.md`, `.dev.vars.example`, `AGENTS.md`, `src/AGENTS.md`
- Test: `src/landing/quickTry/ui.test.ts`, `src/landing/quickTry/turnstile.test.ts`, `src/landing/landing.test.ts` (unchanged: no inline script or style, the texts)

**Interfaces:**
- Consumes: everything Task 2 produces; `messageOf` and `ApiError` in `src/ui/ApiError.ts`.
- Produces: `TurnstileWidget { token(): string | undefined; reset(): void }`, `LoadTurnstile = (container, siteKey) => Promise<TurnstileWidget>`, `QuickTryDeps { api; storage; now; loadTurnstile; refreshMs? }`, `initQuickTry(root: Document, deps): Promise<void>` in `ui.ts`; `TURNSTILE_SCRIPT`, `loadTurnstile(container, siteKey)` in `turnstile.ts`. The page's elements carry `data-try`, `data-try-open`, `data-try-note`, `data-try-status`, `data-try-status-text`, `data-try-link`, `data-try-dialog`, `data-try-form`, `data-try-turnstile`, `data-try-error`, `data-try-recover`, `data-try-recover-link`, `data-try-progress`, `data-try-close`, `data-try-send`.

- [ ] **Step 1: Create `src/landing/quickTry/ui.test.ts`**

```ts
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import page from '../../../index.html?raw';
import headers from '../../../public/_headers?raw';
import type { QuickTryAvailability } from '../../../shared/api.ts';
import { PDF_TYPE } from '../../../shared/files.ts';
import { tryTest } from '../../test/fakeTryApi.tsx';
import { ApiError } from '../../ui/ApiError.ts';
import type { LandingApi } from './api.ts';
import { STORED_TRY_KEY } from './storage.ts';
import { initQuickTry, type TurnstileWidget } from './ui.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';
const CODE = 'PROBA-26T1';
const NOW = new Date('2026-11-10T08:00:00.000Z');
const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };
const grading = tryTest({ status: 'evaluating', files }, { status: 'submitted' });
const graded = tryTest({ status: 'done', files }, { status: 'graded' });

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

function fakeLandingApi(availability: Partial<QuickTryAvailability> = {}) {
  return {
    availability: vi.fn(async () => ({ dailyLimitReached: false, admin: false, siteKey: 'site-key', ...availability })),
    create: vi.fn(async (_turnstileToken?: string) => ({ token: TOKEN, code: CODE })),
    uploadTestFile: vi.fn(async () => {}),
    generateBarem: vi.fn(async () => {}),
    addPage: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    getTest: vi.fn(async () => grading),
  } satisfies LandingApi;
}

function fakeTurnstile(answer: string | null = 'turnstile-ok') {
  const widget: TurnstileWidget = { token: vi.fn(() => answer ?? undefined), reset: vi.fn() };
  return { load: vi.fn(async (_container: HTMLElement, _siteKey: string) => widget), widget };
}

async function mount(api = fakeLandingApi(), turnstile = fakeTurnstile()) {
  document.body.innerHTML = new DOMParser().parseFromString(page, 'text/html').body.innerHTML;
  await initQuickTry(document, { api, storage: localStorage, now: () => NOW, loadTurnstile: turnstile.load, refreshMs: 5 });
  return { api, turnstile };
}

const button = () => screen.queryByRole('button', { name: 'Încearcă acum, fără cont' });
const dialog = () => document.querySelector<HTMLDialogElement>('[data-try-dialog]')!;

function pick(label: RegExp, ...picked: File[]) {
  const input = within(dialog()).getByLabelText(label) as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: picked, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: PDF_TYPE });
const photo = (name: string) => new File(['jpg'], name, { type: 'image/jpeg' });

function fillForm() {
  pick(/^Testul/, pdf('test.pdf'));
  pick(/^Baremul/, pdf('barem.pdf'));
  pick(/^Lucrarea elevului/, photo('p1.jpg'), photo('p2.jpg'));
}

const send = () => within(dialog()).getByRole('button', { name: 'Trimite' }).click();
const store = (madeAt = NOW.toISOString()) => localStorage.setItem(STORED_TRY_KEY, JSON.stringify({ token: TOKEN, code: CODE, madeAt }));

describe("the landing page's Quick Try", () => {
  it('shows the button beside the account links when a try can be made', async () => {
    await mount();
    expect(button()).toBeVisible();
    expect(button()!.closest('.cta')).not.toBeNull();
  });

  it('shows no button while the Turnstile key is not set', async () => {
    await mount(fakeLandingApi({ siteKey: null }));
    expect(button()).toBeNull();
  });

  it("says when the day's free tries are all used", async () => {
    await mount(fakeLandingApi({ dailyLimitReached: true }));
    expect(button()).toBeNull();
    expect(screen.getByText(/Încercările gratuite de azi s-au terminat/)).toHaveTextContent(
      'Încercările gratuite de azi s-au terminat. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.',
    );
  });

  it("keeps one try per device per day, and shows today's try with its link", async () => {
    store();
    const { api } = await mount();
    expect(button()).toBeNull();
    expect(screen.getByText('Ai făcut încercarea de azi. Mâine poți face alta.')).toBeVisible();
    expect(api.getTest).toHaveBeenCalledWith(TOKEN, CODE);
    expect(screen.getByRole('status')).toHaveTextContent('Se corectează… Durează câteva minute.');
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toHaveAttribute('href', `/try/${TOKEN}`);
  });

  it('follows the grading until the paper is graded', async () => {
    store();
    const api = fakeLandingApi();
    api.getTest.mockResolvedValueOnce(grading).mockResolvedValue(graded);
    await mount(api);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Lucrarea este corectată.'));
    const reads = api.getTest.mock.calls.length;
    await new Promise((done) => setTimeout(done, 30));
    expect(api.getTest.mock.calls.length).toBe(reads);
  });

  it('lets her try again today when her try failed', async () => {
    store();
    const api = fakeLandingApi();
    api.getTest.mockResolvedValue(tryTest({ files, barem: { request: 'failed', unchecked: false } }));
    await mount(api);
    expect(screen.getByRole('status')).toHaveTextContent('Încercarea nu a reușit. Nu se numără: poți face alta azi.');
    expect(button()).toBeVisible();
  });

  it('forgets a try whose link no longer works', async () => {
    store('2026-11-09T08:00:00.000Z');
    const api = fakeLandingApi();
    api.getTest.mockRejectedValue(new ApiError(404, 'unknown_try', 'Linkul nu este bun.'));
    await mount(api);
    expect(screen.queryByRole('status')).toBeNull();
    expect(button()).toBeVisible();
  });

  it('sends the form with the Turnstile answer, keeps the link and follows the try', async () => {
    const { api, turnstile } = await mount();
    button()!.click();
    expect(dialog().hasAttribute('open')).toBe(true);
    await waitFor(() => expect(turnstile.load).toHaveBeenCalledWith(document.querySelector('[data-try-turnstile]'), 'site-key'));
    fillForm();
    send();
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(api.create).toHaveBeenCalledWith('turnstile-ok');
    expect(api.start).toHaveBeenCalledWith(TOKEN);
    expect(JSON.parse(localStorage.getItem(STORED_TRY_KEY)!)).toEqual({ token: TOKEN, code: CODE, madeAt: NOW.toISOString() });
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toHaveAttribute('href', `/try/${TOKEN}`);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Se corectează… Durează câteva minute.'));
    expect(button()).toBeNull();
  });

  it('asks the robot for the barem when she has none', async () => {
    const { api } = await mount();
    button()!.click();
    pick(/^Testul/, pdf('test.pdf'));
    within(dialog()).getByLabelText('Nu am barem: fă-l din test').click();
    pick(/^Lucrarea elevului/, photo('p1.jpg'));
    send();
    await waitFor(() => expect(dialog().hasAttribute('open')).toBe(false));
    expect(api.generateBarem).toHaveBeenCalledWith(TOKEN, CODE);
    expect(api.start).not.toHaveBeenCalled();
  });

  it('says what is missing, and sends nothing', async () => {
    const { api } = await mount();
    button()!.click();
    send();
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Alege fișierul testului.');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('asks for the Turnstile check before it sends', async () => {
    const { api } = await mount(fakeLandingApi(), fakeTurnstile(null));
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Bifează verificarea de mai jos, apoi trimite din nou.'));
    expect(api.create).not.toHaveBeenCalled();
  });

  it("shows the server's refusal in the form, and a new check for the next send", async () => {
    const api = fakeLandingApi();
    api.create.mockRejectedValueOnce(new ApiError(429, 'quick_try_ip_limit', 'Limita de încercări gratuite pentru azi a fost atinsă.'));
    const { turnstile } = await mount(api);
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Limita de încercări gratuite pentru azi a fost atinsă.'));
    expect(turnstile.widget.reset).toHaveBeenCalled();
    expect(dialog().hasAttribute('open')).toBe(true);
    expect(within(dialog()).getByRole('button', { name: 'Trimite' })).toBeEnabled();
    expect(localStorage.getItem(STORED_TRY_KEY)).toBeNull();
  });

  it('keeps the link of a try whose send broke half-way', async () => {
    const api = fakeLandingApi();
    api.addPage.mockRejectedValueOnce(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await mount(api);
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent('Nu mă pot conecta la server.'));
    expect(within(dialog()).getByRole('link', { name: 'Deschide încercarea' })).toHaveAttribute('href', `/try/${TOKEN}`);
    expect(localStorage.getItem(STORED_TRY_KEY)).not.toBeNull();
  });

  it('lets an administrator send without Turnstile and past the limits', async () => {
    store();
    const turnstile = fakeTurnstile();
    const { api } = await mount(fakeLandingApi({ admin: true, dailyLimitReached: true, siteKey: null }), turnstile);
    button()!.click();
    fillForm();
    send();
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(undefined));
    expect(turnstile.load).not.toHaveBeenCalled();
  });

  it('says when the Turnstile check cannot load, and sends nothing', async () => {
    const turnstile = fakeTurnstile();
    turnstile.load.mockRejectedValueOnce(new Error('blocked'));
    const { api } = await mount(fakeLandingApi(), turnstile);
    button()!.click();
    await waitFor(() =>
      expect(within(dialog()).getByRole('alert')).toHaveTextContent('Verificarea nu s-a putut încărca. Reîncarcă pagina și încearcă din nou.'),
    );
    fillForm();
    send();
    await new Promise((done) => setTimeout(done, 10));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Verificarea nu s-a putut încărca. Reîncarcă pagina și încearcă din nou.');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('shows no button when the page cannot ask the server, and still follows her try', async () => {
    store('2026-11-09T08:00:00.000Z');
    const api = fakeLandingApi();
    api.availability.mockRejectedValue(new ApiError(0, 'network', 'Nu mă pot conecta la server.'));
    await mount(api);
    expect(button()).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Se corectează… Durează câteva minute.');
    expect(screen.getByRole('link', { name: 'Deschide încercarea' })).toHaveAttribute('href', `/try/${TOKEN}`);
  });

  it('closes the form with Renunță', async () => {
    await mount();
    button()!.click();
    within(dialog()).getByRole('button', { name: 'Renunță' }).click();
    expect(dialog().hasAttribute('open')).toBe(false);
  });

  it("lets the page's security policy load Turnstile, and nothing else new", () => {
    const policy = headers.split('\n').find((line) => line.trim().startsWith('Content-Security-Policy:'))!;
    expect(policy).toContain("script-src 'self' https://challenges.cloudflare.com;");
    expect(policy).toContain('frame-src https://challenges.cloudflare.com;');
    expect(policy).toContain("connect-src 'self';");
  });
});
```

- [ ] **Step 2: Create `src/landing/quickTry/turnstile.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTurnstile, TURNSTILE_SCRIPT } from './turnstile.ts';

afterEach(() => {
  delete window.turnstile;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe("the form's Turnstile check", () => {
  it("loads Cloudflare's script once and draws the check in Romanian", async () => {
    const api = { render: vi.fn(() => 'w1'), getResponse: vi.fn(() => 'raspuns'), reset: vi.fn() };
    const box = document.body.appendChild(document.createElement('div'));
    const first = loadTurnstile(box, 'site-key');
    const scripts = document.head.querySelectorAll('script');
    expect(Array.from(scripts).map((tag) => tag.src)).toEqual([TURNSTILE_SCRIPT]);
    window.turnstile = api;
    scripts[0]!.dispatchEvent(new Event('load'));
    const widget = await first;
    expect(api.render).toHaveBeenCalledWith(box, { sitekey: 'site-key', language: 'ro' });
    expect(widget.token()).toBe('raspuns');
    widget.reset();
    expect(api.reset).toHaveBeenCalledWith('w1');
    await loadTurnstile(box, 'site-key');
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
    expect(api.render).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/landing/quickTry/ui.test.ts src/landing/quickTry/turnstile.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  no tests`: `Failed to resolve import "./ui.ts" from "src/landing/quickTry/ui.test.ts"` and `Failed to resolve import "./turnstile.ts"`.

- [ ] **Step 4: Edit `index.html`**

Find this block:

```html
              <a class="link" href="/teacher/#cont-nou">Cere un cont de profesor</a>
            </div>
```

Replace it with:

```html
              <a class="link" href="/teacher/#cont-nou">Cere un cont de profesor</a>
              <button class="btn btn-large btn-try" type="button" data-try-open hidden>Încearcă acum, fără cont</button>
            </div>
            <div class="try-line" data-try hidden>
              <p class="try-note" data-try-note hidden></p>
              <p class="try-status" data-try-status role="status" hidden>
                <span data-try-status-text></span>
                <a class="link" data-try-link href="/">Deschide încercarea</a>
              </p>
            </div>
```

- [ ] **Step 5: Edit `index.html`**

Find this block:

```html
    </div>
  </body>
```

Replace it with:

```html
    </div>
    <dialog class="try-dialog" data-try-dialog aria-labelledby="try-title">
      <form class="try-form" data-try-form novalidate>
        <h2 id="try-title">Încearcă o corectare, fără cont</h2>
        <p class="try-lede">Trimiți testul, baremul și lucrarea unui elev. Primești lucrarea corectată, cu punctele de verificat, rezultatul tău și pe cel al elevului.</p>
        <label class="try-field">
          <span>Testul (PDF sau Word)</span>
          <input type="file" name="test" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        </label>
        <label class="try-field">
          <span>Baremul (PDF sau Word)</span>
          <input type="file" name="barem" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        </label>
        <label class="try-check"><input type="checkbox" name="robotBarem" /> Nu am barem: fă-l din test</label>
        <label class="try-field">
          <span>Lucrarea elevului (poze sau PDF, cel mult 20)</span>
          <input type="file" name="pages" multiple accept="image/jpeg,image/png,image/webp,application/pdf" />
        </label>
        <div class="try-turnstile" data-try-turnstile></div>
        <p class="try-error" data-try-error role="alert" hidden></p>
        <p class="try-recover" data-try-recover hidden>Încercarea a fost făcută. <a class="link" data-try-recover-link href="/">Deschide încercarea</a> ca să trimiți ce lipsește.</p>
        <p class="try-progress" data-try-progress aria-live="polite" hidden></p>
        <div class="try-actions">
          <button class="btn" type="button" data-try-close>Renunță</button>
          <button class="btn btn-primary" type="submit" data-try-send>Trimite</button>
        </div>
      </form>
    </dialog>
  </body>
```

- [ ] **Step 6: Edit `public/_headers`**

Find this block:

```text
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'

```

Replace it with:

```text
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'

```

- [ ] **Step 7: Create `src/landing/quickTry/ui.ts`**

```ts
import type { QuickTryAvailability } from '../../../shared/api.ts';
import { ApiError, messageOf } from '../../ui/ApiError.ts';
import { phaseOf, type TryPhase } from '../../try/phase.ts';
import type { LandingApi } from './api.ts';
import { formProblem, sendTry, type TryForm } from './send.ts';
import { canStart, statusOf } from './status.ts';
import { readStoredTry, saveStoredTry, type StoredTry } from './storage.ts';

// The Turnstile check in the form: its answer once the visitor passed it,
// and a new check (an answer is good for one send).
export interface TurnstileWidget {
  token(): string | undefined;
  reset(): void;
}

export type LoadTurnstile = (container: HTMLElement, siteKey: string) => Promise<TurnstileWidget>;

export interface QuickTryDeps {
  api: LandingApi;
  storage: Storage;
  now: () => Date;
  loadTurnstile: LoadTurnstile;
  // How often the status line reads the try again while the robot works.
  refreshMs?: number;
}

const FULL_TEXT =
  'Încercările gratuite de azi s-au terminat. Încearcă din nou mâine sau creează un cont: corectezi gratuit un test pentru toată clasa.';
const USED_TEXT = 'Ai făcut încercarea de azi. Mâine poți face alta.';
const NO_CHECK_TEXT = 'Verificarea nu s-a putut încărca. Reîncarcă pagina și încearcă din nou.';

const tryPath = (token: string) => `/try/${token}`;

function openDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function show(el: HTMLElement, text?: string): void {
  if (text !== undefined) el.textContent = text;
  el.hidden = false;
}

// The landing page's Quick Try (spec §3.1, §3.2): the button, the form in a
// window over the page, and the status line of the visitor's try with its
// link. The page has no React: this works on the page's own elements.
export async function initQuickTry(root: Document, deps: QuickTryDeps): Promise<void> {
  const box = root.querySelector<HTMLElement>('[data-try]');
  const openButton = root.querySelector<HTMLButtonElement>('[data-try-open]');
  const dialog = root.querySelector<HTMLDialogElement>('[data-try-dialog]');
  const form = root.querySelector<HTMLFormElement>('[data-try-form]');
  if (!box || !openButton || !dialog || !form) return;
  const note = box.querySelector<HTMLElement>('[data-try-note]')!;
  const status = box.querySelector<HTMLElement>('[data-try-status]')!;
  const statusText = box.querySelector<HTMLElement>('[data-try-status-text]')!;
  const statusLink = box.querySelector<HTMLAnchorElement>('[data-try-link]')!;
  const error = form.querySelector<HTMLElement>('[data-try-error]')!;
  const recover = form.querySelector<HTMLElement>('[data-try-recover]')!;
  const recoverLink = form.querySelector<HTMLAnchorElement>('[data-try-recover-link]')!;
  const progress = form.querySelector<HTMLElement>('[data-try-progress]')!;
  const sendButton = form.querySelector<HTMLButtonElement>('[data-try-send]')!;
  const closeButton = form.querySelector<HTMLButtonElement>('[data-try-close]')!;
  const turnstileBox = form.querySelector<HTMLElement>('[data-try-turnstile]')!;
  const refreshMs = deps.refreshMs ?? 10_000;

  let availability: QuickTryAvailability | null = null;
  let stored = readStoredTry(deps.storage, deps.now());
  let phase: TryPhase | null = null;
  let widget: Promise<TurnstileWidget> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // The button, or the line that says why there is none.
  function refreshButton(): void {
    const answer = availability ? canStart(availability, stored, phase, deps.now()) : 'off';
    openButton!.hidden = answer !== 'yes';
    note.hidden = true;
    if (answer === 'used') show(note, USED_TEXT);
    if (answer === 'full') show(note, FULL_TEXT);
    box!.hidden = note.hidden && status.hidden;
  }

  // Reads the stored try and shows where it stands; again and again while the
  // robot works. A link that no longer works (deleted or expired) is forgotten.
  async function follow(current: StoredTry): Promise<void> {
    if (timer) clearTimeout(timer);
    statusLink.href = tryPath(current.token);
    try {
      const detail = await deps.api.getTest(current.token, current.code);
      if (stored !== current) return;
      const line = statusOf(detail);
      phase = phaseOf(detail);
      show(status);
      statusText.textContent = line.text;
      if (line.working) timer = setTimeout(() => void follow(current), refreshMs);
    } catch (err) {
      if (stored !== current) return;
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        stored = null;
        phase = null;
        status.hidden = true;
      } else {
        show(status);
        statusText.textContent = 'Nu am putut citi încercarea acum.';
      }
    }
    refreshButton();
  }

  function formValues(): TryForm {
    const files = (name: string) => Array.from((form!.elements.namedItem(name) as HTMLInputElement).files ?? []);
    return {
      test: files('test')[0] ?? null,
      barem: files('barem')[0] ?? null,
      robotBarem: (form!.elements.namedItem('robotBarem') as HTMLInputElement).checked,
      pages: files('pages'),
    };
  }

  function sayError(text: string): void {
    show(error, text);
  }

  openButton.addEventListener('click', () => {
    error.hidden = true;
    recover.hidden = true;
    openDialog(dialog);
    if (availability && !availability.admin && availability.siteKey && !widget) {
      widget = deps.loadTurnstile(turnstileBox, availability.siteKey);
      widget.catch(() => {
        widget = null;
        sayError(NO_CHECK_TEXT);
      });
    }
  });

  closeButton.addEventListener('click', () => closeDialog(dialog));

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });

  async function submit(): Promise<void> {
    error.hidden = true;
    recover.hidden = true;
    const values = formValues();
    const problem = formProblem(values);
    if (problem) return sayError(problem);
    const admin = availability?.admin ?? false;
    let check: TurnstileWidget | null = null;
    let answer: string | undefined;
    if (!admin) {
      check = widget ? await widget.catch(() => null) : null;
      if (!check) return sayError(NO_CHECK_TEXT);
      answer = check.token();
      if (!answer) return sayError('Bifează verificarea de mai jos, apoi trimite din nou.');
    }
    sendButton.disabled = true;
    closeButton.disabled = true;
    let made: StoredTry | null = null;
    try {
      const done = await sendTry(
        deps.api,
        values,
        answer,
        {
          onCreated: (one) => {
            made = one;
            stored = one;
            phase = null;
            saveStoredTry(deps.storage, one);
          },
          onProgress: (text) => show(progress, text),
        },
        deps.now,
      );
      closeDialog(dialog!);
      form!.reset();
      await follow(done);
    } catch (err) {
      sayError(messageOf(err));
      if (made) {
        recoverLink.href = tryPath((made as StoredTry).token);
        show(recover);
        void follow(made);
      }
    } finally {
      progress.hidden = true;
      sendButton.disabled = false;
      closeButton.disabled = false;
      check?.reset();
    }
  }

  const [answer] = await Promise.allSettled([deps.api.availability(), stored ? follow(stored) : Promise.resolve()]);
  if (answer.status === 'fulfilled') availability = answer.value;
  refreshButton();
}
```

- [ ] **Step 8: Create `src/landing/quickTry/turnstile.ts`**

```ts
import type { TurnstileWidget } from './ui.ts';

// Cloudflare Turnstile's script, drawn where the page asks (render=explicit).
// The page's security policy allows this one script and its frame.
export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(container: HTMLElement, options: { sitekey: string; language: string }): string;
  getResponse(widgetId: string): string | undefined;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function script(root: Document): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const tag = root.createElement('script');
    tag.src = TURNSTILE_SCRIPT;
    tag.async = true;
    tag.addEventListener('load', () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile'))));
    tag.addEventListener('error', () => {
      loading = null;
      tag.remove();
      reject(new Error('turnstile'));
    });
    root.head.append(tag);
  });
  return loading;
}

// Loads the script once, then draws the check in `container`, in Romanian.
export async function loadTurnstile(container: HTMLElement, siteKey: string): Promise<TurnstileWidget> {
  const api = await script(container.ownerDocument);
  const id = api.render(container, { sitekey: siteKey, language: 'ro' });
  return { token: () => api.getResponse(id) || undefined, reset: () => api.reset(id) };
}
```

- [ ] **Step 9: Edit `src/landing/landing.ts`**

Find this block:

```ts
// The landing page's only script: the theme button. public/theme.js has
// already painted the theme; this keeps the button's name in step and saves
// the reader's choice, the same way the app's ThemeButton does.
import { currentTheme, otherTheme, saveTheme, storedTheme, type Theme } from '../ui/theme.ts';

```

Replace it with:

```ts
// The landing page's script: the theme button and the Quick Try form.
// public/theme.js has already painted the theme; the button keeps its name in
// step and saves the reader's choice, the same way the app's ThemeButton does.
import { currentTheme, otherTheme, saveTheme, storedTheme, type Theme } from '../ui/theme.ts';
import { createLandingApi } from './quickTry/api.ts';
import { loadTurnstile } from './quickTry/turnstile.ts';
import { initQuickTry } from './quickTry/ui.ts';

```

- [ ] **Step 10: Edit `src/landing/landing.ts`**

Find this block:

```ts

initThemeButton();
```

Replace it with:

```ts

// The device's storage, or one that keeps nothing where the browser refuses it.
function deviceStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
    return { length: 0, clear: () => {}, getItem: () => null, key: () => null, removeItem: () => {}, setItem: () => {} };
  }
}

initThemeButton();
void initQuickTry(document, { api: createLandingApi(), storage: deviceStorage(), now: () => new Date(), loadTurnstile });
```

- [ ] **Step 11: Edit `src/landing/landing.css`**

Find this block:

```css

/* Footer: one line, about as high as the header. */
```

Replace it with:

```css

/* Quick Try: the button beside the account links, the line under them, and
   the form in a window over the page. */
.try-line { display: flex; flex-direction: column; gap: 6px; font-size: 15px; }
.try-line[hidden], .try-line [hidden] { display: none; }
.try-note { color: var(--muted); max-width: 52ch; }
.try-status { display: flex; gap: 4px 12px; flex-wrap: wrap; align-items: baseline; font-weight: 600; }
.try-dialog { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 0; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); color: var(--text); }
.try-dialog::backdrop { background: rgb(12 21 36 / 0.55); }
.try-form { display: flex; flex-direction: column; gap: 16px; padding: 24px; }
.try-form h2 { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; }
.try-lede { color: var(--muted); font-size: 15px; }
.try-field { display: flex; flex-direction: column; gap: 6px; font-size: 15px; font-weight: 600; }
.try-field input { min-width: 0; max-width: 100%; font: 400 14px var(--font); color: var(--text); }
.try-check { display: flex; gap: 8px; align-items: center; font-size: 15px; }
.try-turnstile:empty { display: none; }
.try-error { color: var(--orange); font-weight: 600; }
.try-error[hidden], .try-recover[hidden], .try-progress[hidden] { display: none; }
.try-progress { color: var(--muted); }
.try-actions { display: flex; justify-content: flex-end; gap: 12px; flex-wrap: wrap; }
.try-actions .btn:disabled { opacity: 0.6; cursor: default; }
.btn-try[hidden] { display: none; }

/* Footer: one line, about as high as the header. */
```

- [ ] **Step 12: Edit `docs/deploy.md`**

Find this block:

```markdown

## The robot
```

Replace it with:

```markdown

## Quick Try

- **Turnstile** (needed for visitors' tries; spec `docs/superpowers/specs/2026-11-09-quick-try-design.md` §4). In the Cloudflare dashboard (Turnstile, Add widget): name "MQGrader Quick Try", hostnames `mqgrader.ro` and `quickeval.pages.dev`, mode Managed. Then `npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name quickeval` (the widget's secret key) and `npx wrangler pages secret put TURNSTILE_SITE_KEY --project-name quickeval` (its site key, which is public: the landing page reads it from `GET /api/try/availability`). Both apply from the next deployment. Without the site key the landing page shows no Quick Try button; without the secret key every visitor's try is refused (403 `not_human`). An administrator who is logged in skips Turnstile either way.
- Locally, `.dev.vars` may use Cloudflare's test keys (`.dev.vars.example`): the check always passes.
- Old tries need no job: each visit of the landing page deletes up to three tries whose 7 days are over (`server/quickTryCleanup.ts`). The day's limits are constants in `shared/quickTry.ts`.

## The robot
```

- [ ] **Step 13: Edit `.dev.vars.example`**

Find this block:

```text
# STRIPE_WEBHOOK_SECRET=whsec_...
```

Replace it with:

```text
# STRIPE_WEBHOOK_SECRET=whsec_...
# Quick Try's Turnstile (docs/deploy.md, "Quick Try"): Cloudflare's test keys, whose check always passes.
# TURNSTILE_SITE_KEY=1x00000000000000000000AA
# TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

- [ ] **Step 14: Edit `AGENTS.md`**

Find this block:

```markdown
- `index.html` (landing page), `teacher/index.html` (teacher app, `/teacher/`), `u/index.html` (student app, `/u/<token>`), `try/index.html` (a Quick Try's page, `/try/<token>`).
- `src/`: the two React apps (`admin/`, `upload/`), the landing page's stylesheet and theme button (`landing/`, no React), shared UI (`ui/`), test helpers (`test/`).
- `functions/api/[[route]].ts`: the Cloudflare Pages entry for `/api/*`; it serves the Hono app from `server/app.ts`.
```

Replace it with:

```markdown
- `index.html` (landing page), `teacher/index.html` (teacher app, `/teacher/`), `u/index.html` (student app, `/u/<token>`), `try/index.html` (a Quick Try's page, `/try/<token>`).
- `src/`: the two React apps (`admin/`, `upload/`), the landing page's stylesheet, theme button and Quick Try form (`landing/`, no React), shared UI (`ui/`), test helpers (`test/`).
- `functions/api/[[route]].ts`: the Cloudflare Pages entry for `/api/*`; it serves the Hono app from `server/app.ts`.
```

- [ ] **Step 15: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
- `landing/`: the landing page (`index.html`) in the look of the redesign, with its own tokens (`landing.css`) and one script, the theme button (`landing.ts`). The page's security policy allows no inline script or style; `landing.test.ts` checks that, and Laura Miron's texts word for word. "Cere un cont de profesor" opens `/teacher/#cont-nou`, which `LoginPage` shows as "Cont nou de profesor". The login page repeats the heading, the line and the six stages: a change to them in `index.html` goes into `admin/wayIn/WayIn.tsx` too.
- Light is the default theme on every page: `public/theme.js` and `currentTheme()` follow only a saved choice, never the system setting.
```

Replace it with:

```markdown
- `ui/GradingProgress.tsx` is the grading bar (blue graded, pale blue waiting, empty track not sent) under the test page's uploads heading only (the Teste page shows the stage bar instead); "✓ Corectat complet" shows when every sent paper is graded. The bar is `aria-hidden`: the counts stay in words. `EvaluationControls` shows "Marchează ca terminat" in place of the start button when a paper is graded and none waits.
- `landing/`: the landing page (`index.html`) in the look of the redesign, with its own tokens (`landing.css`) and one script (`landing.ts`): the theme button and Quick Try. `landing/quickTry/` is the Quick Try button, its form in a `<dialog>` and the status line of the visitor's try, with no React: `ui.ts` works on the page's own elements, `send.ts` checks and sends the form (with her barem the grading starts at once; with the robot's she starts it on the try's page), `status.ts` says where the try stands and whether the button shows (one try per device per Bucharest day in `localStorage`, `storage.ts`, unless it failed; an administrator always), and `turnstile.ts` loads Cloudflare's check. The page's security policy allows no inline script or style, and only Turnstile's script and frame from elsewhere; `landing.test.ts` checks that, and Laura Miron's texts word for word. "Cere un cont de profesor" opens `/teacher/#cont-nou`, which `LoginPage` shows as "Cont nou de profesor". The login page repeats the heading, the line and the six stages: a change to them in `index.html` goes into `admin/wayIn/WayIn.tsx` too.
- Light is the default theme on every page: `public/theme.js` and `currentTheme()` follow only a saved choice, never the system setting.
```

- [ ] **Step 16: Run the tests to see them pass**

Run: `npx vitest run src/landing src/try/hosting.test.ts`
Expected: PASS, `Test Files  9 passed (9)`, `Tests  67 passed (67)`.

- [ ] **Step 17: Typecheck, build, and run all tests**

Run: `npm run build`, then `npm test`
Expected: no type errors, the build ends without errors; `Test Files  162 passed | 1 skipped (163)`, `Tests  2346 passed | 3 skipped (2349)`.

- [ ] **Step 18: Commit**

```bash
git add src/landing/quickTry/ui.test.ts src/landing/quickTry/turnstile.test.ts src/landing/quickTry/ui.ts src/landing/quickTry/turnstile.ts index.html public/_headers src/landing/landing.ts src/landing/landing.css docs/deploy.md .dev.vars.example AGENTS.md src/AGENTS.md
git commit -m "Add the Quick Try button, its form and the status line to the landing page"
```

Check: `git diff --stat refs/protoqtc/c3 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 4: Check in the browser, the Turnstile keys, push

Runs in the main session. The keys and the push wait for the user.

- [ ] **Step 1: Run everything once more, also in UTC**

Run: `npm run build`, `npm test`, then in Git Bash `TZ=UTC npm test` (PowerShell: `$env:TZ='UTC'; npm test; Remove-Item Env:TZ`)
Expected: no type errors; `Test Files  162 passed | 1 skipped (163)`, `Tests  2346 passed | 3 skipped (2349)`. both times.

- [ ] **Step 2: Look at the landing page in the browser, as a visitor**

Add Cloudflare's test keys to `.dev.vars` (`TURNSTILE_SITE_KEY=1x00000000000000000000AA`, `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`) and comment out `DEV_TEACHER_EMAIL` (else the browser is the local administrator, who skips the check). Run `npm run db:local`, then the `preview` server of `.claude/launch.json` (http://127.0.0.1:8788; if port 8788 is taken by an old `workerd.exe`, see root `AGENTS.md`, "Gotchas"). Open http://127.0.0.1:8788/ at 375 px and at 1280 px wide.
Expected: "Încearcă acum, fără cont" beside "Cere un cont de profesor"; it opens the form with the Turnstile check, which passes by itself. A test PDF, a barem PDF and two photos are sent (in the console, set the inputs' `files` with a `DataTransfer`, then press "Trimite"); the form closes; the line says "Se corectează… Durează câteva minute." with "Deschide încercarea" and "Ai făcut încercarea de azi. Mâine poți face alta.", and keeps them after a reload. The link opens the try's page at "Lucrarea se corectează". Then expire the try (`npx wrangler d1 execute quickeval --local --command "UPDATE quick_tries SET expires_at = '2020-01-01T00:00:00.000Z'"`) and reload: the line goes, the button comes back, and `SELECT COUNT(*) FROM quick_tries` answers 0. Put `DEV_TEACHER_EMAIL` back afterwards. Fix what is broken as its own commit, with a test where the fault is in code, and say so in the PR.

- [ ] **Step 3: The Turnstile keys on the live site**

Ask the user to make the Turnstile widget and to set the two Pages secrets, as `docs/deploy.md` ("Quick Try") says, before the merge: a new secret applies from the next deployment, and the merge's deployment then has both. Until the site key is set, the live landing page shows no button.

- [ ] **Step 4: Ask the user, then push and open the pull request**

Ask the user first. Then: `git push -u origin feature/quick-try-landing` and open a pull request to `main` titled "Quick Try, part C: the landing page and the cleanup". The body says: no migration; the Turnstile secrets `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` go on the Pages project before the merge; tries are now deleted when their 7 days are over (the owner's choice, replacing the monthly cleanup); the landing page's 2 px sideways scroll at phone width is older than this branch.
