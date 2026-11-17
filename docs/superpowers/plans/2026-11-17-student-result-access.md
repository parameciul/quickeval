# MQGrader: the result ticket and the short code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student who sent a paper keeps the way back to the result without the teacher: the result link becomes a ticket (the test, the name, a QR code of the link and a six-character code) that works as a screenshot, saves as a picture in one tap and sends to the student's own chat; and on the test's own page a student whose phone has no link types the code.

**Architecture:** Migration 0034 adds `submissions.result_code` (unique per test), made by two triggers whenever a paper gets its `result_token` (not for a Quick Try), and `result_code_tries` for the limit on wrong codes. Task 1 carries the code through the API (`ConfirmAnswer`, `StudentResultView`, `UploadRow`). Task 2 adds `POST /api/u/:token/cod` (`openResultByCode`: one batch takes a try and looks the code up, a right code gives the try back). Task 3 replaces the student app's `ResultLinkBox` with `ResultTicket.tsx` (with `shareLink.ts`, shared with the result page). Task 4 adds `ticketImage.ts` (the picture drawn on a canvas) and `SaveTicket.tsx` (`useSaveTicket`: the picture is made as the ticket shows, so the tap saves it at once), on the ticket and on the result page. Task 5 adds `CodeEntry.tsx` to the closed test page, with the client call `openByCode`. Task 6 shows each code in the teacher's links table and updates the notes.

**Tech Stack:** Node 24, TypeScript, Hono on Cloudflare Pages Functions, D1 (SQLite), React 19, `qrcode.react` (already a dependency), Vitest, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-17-student-result-access-design.md` (approved by the user on 2026-11-17, then settled by the prototype in `3dec876`). Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The mockups the user chose design A from are in `.superpowers/mockups/result-access/`, git-ignored.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics. Code, comments and docs are English. No student page, the ticket and the saved picture included, says how the work is graded (`expectNoGradingWords()`), or "CES".
- Migrations: one statement per `;` at a line end (the test helper splits on that), no `;` inside strings. Migration 0034 must run on the live database before this branch reaches `main` (`docs/deploy.md`).
- Student writes check their rules inside their SQL statement, never in a check before the write. At most 15 D1 queries per request.
- The brand is flat: `src/ui/brand.css` has no `gradient(`. This plan adds no colour token.
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch that holds this plan. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those files time out, or of `server/routes/evaluation.test.ts`, `server/routes/runner.test.ts` and `runner/tasks.test.ts` (an `ECONNRESET` or an `internal` answer from the local worker on a busy PC), run the failed files alone with `npx vitest run <files>`; the full run then counts as passed when its failed and passed tests add up to the expected numbers.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact for the branch alone. If a run shows other numbers or other errors, stop and report.
- **One failure is expected in every full run:** `src/landing/pages.test.ts` › "opens the page about the author with her own story, in her words". It already fails on `main` at `eebea58` (the Despre page changed, its test did not); it is not this plan's work, so leave it.
- The tested prototype of this plan is in the repo as `refs/protora/ra1` … `refs/protora/ra6`, one per task, on `refs/protora/rabase` (`3dec876`, the commit with the settled spec). After Task N, `git diff --stat refs/protora/raN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building the prototype and looking at it on 2026-11-17 (375 px and desktop, light and dark, a local build with sample data). The spec records them since `3dec876`; they are listed here so the user can check them while reading.

1. **The database makes the codes.** Two triggers of migration 0034 give a paper its code when it gets its `result_token` and has none, from SQLite's `random()`; a Quick Try's test gets none. The code is never a secret on its own: it works only with the test's own link and behind the limit.
2. **The limit:** 10 wrong codes per test in 10 minutes (`RESULT_CODE_TRIES`, `RESULT_CODE_WINDOW_MINUTES`); a right code gives its try back; a text that is not a code costs a try; refused tries do not move the window. The route answers before and after the results are published.
3. **The ticket's buttons:** "Salvează biletul" (filled), "Trimite-mi linkul", then the links "Vezi rezultatul" and "Arată linkul întreg". The share sheet gets the text "Codul meu: K7M-92P".
4. **On an iPhone or iPad the picture is made as the ticket shows.** Their share sheet opens only inside the tap; the picture is ready by then, so the tap calls the save with no wait, and the share sheet offers "Save Image". Elsewhere the file downloads as `bilet-<test code>-<student>.png`, and the picture is made on the tap. A page with many tickets (a shared phone) makes one picture at a time, the hidden QR canvas is about `QR_SIZE` (520) real pixels whatever the screen's pixel ratio (the QR library multiplies by it), and every canvas is emptied or removed once its picture is made or failed: a phone limits canvas memory. The page and the picture always show the QR code dark on white, with a wide white edge.
5. **A link opened with a code is marked `byCode`** and never locks the default link of that phone; a link the phone already keeps for that student stays as it was.
6. **Old kept links** (from before codes) show their ticket without the code row, and learn their code when their result page opens.
7. **The test browser has no canvas:** `src/test/setup.ts` makes `getContext` return `null` (as jsdom's own does) without jsdom's "Not implemented" line for every QR code and ticket picture.

## Review Focus

1. A guesser with the test's link types codes one after another: the 11th wrong code within 10 minutes is refused, also when it is the right one, and the field opens again after the window (Task 2: "stops after 10 wrong codes in 10 minutes, for the right code too, then opens again").
2. A borrowed phone opens a friend's result with the code, then the teacher opens the uploads again: that phone can still send its own paper (Task 5: "does not lock the default link of a phone that only opened a result with its code").
3. An iPhone tap on "Salvează biletul" must reach the save with no wait, or Safari refuses the share sheet and the picture lands in Files; and a shared phone with many tickets must not run out of canvas memory (Task 4: "saves the picture inside the tap, with no wait, and says so"; "waits for the picture when the tap comes before it is ready"; "makes one picture at a time when many tickets show").
4. A link kept before codes existed still shows a working ticket, and learns its code later (Task 3: "shows no code row for a link kept before links had codes"; Task 4: "teaches the code to a link this phone kept before links had codes").
5. A paper the teacher reset loses its code with it, so an old screenshot of that code opens nothing (Task 2: "forgets the code of a paper the teacher reset").

## Checks no test makes (on real phones, after the merge to a test environment)

- Scan the ticket from a screenshot, in light and in dark theme, with an iPhone (Photos) and an Android phone (Google Lens): the result page opens.
- Tap "Salvează biletul" on an iPhone: the share sheet opens with "Save Image", and the picture lands in Photos. On Android: the file lands in the downloads and shows in the gallery.
- Scan the saved picture the same way.

---

### Task 1: Every result link gets a short code

**Files:**
- Create: `migrations/0034_result_codes.sql`, `server/routes/resultCodes.test.ts`
- Modify: `shared/tests.ts`, `shared/tests.test.ts`, `shared/api.ts`, `server/db/results.ts`, `server/db/tests.ts`, `server/routes/upload.ts`, `server/routes/upload.test.ts`, `server/routes/tests.test.ts`, `src/test/fakeApi.ts`, `src/test/fakeUploadApi.ts`, and the `StudentResultView` literals of `src/admin/pdf/pdf.test.ts`, `src/try/Graded.test.tsx`, `src/upload/ResultActions.test.tsx`, `src/upload/ResultApp.test.tsx`, `src/upload/StudentResult.test.tsx`

**Interfaces:**
- Produces: `RESULT_CODE_ALPHABET`, `RESULT_CODE_LENGTH`, `RESULT_CODE_TRIES` (10), `RESULT_CODE_WINDOW_MINUTES` (10), `normalizeResultCode(raw: string): string | null`, `formatResultCode(code: string): string` in `shared/tests.ts`; `ConfirmAnswer.resultCode: string | null`, `StudentResultView.resultCode: string | null`, `UploadRow.resultCode: string | null` in `shared/api.ts`; `confirmResultToken(db, submissionId, sessionHash): Promise<{ resultToken: string; resultCode: string | null } | null>`; `FAKE_RESULT_CODE = 'K7M92P'` in `src/test/fakeUploadApi.ts`.

- [ ] **Step 1: Create `server/routes/resultCodes.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeClass, makeTest, startTest, startedAtOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;
let token: string;
let pop: number;
let ana: number;

const jpeg = (text = 'photo') => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(text)]);
const RESULT_CODE = /^[2-9A-HJKMNP-Z]{6}$/;

async function uploadAndConfirm(studentId: number, link = token): Promise<{ resultToken: string; resultCode: string }> {
  const started = await api.request('POST', `/api/u/${link}/sessions`, { studentId });
  expect(started.status).toBe(201);
  const secret = started.body.secret as string;
  const put = await api.fetch(`/api/u/${link}/files`, {
    method: 'PUT',
    body: jpeg(),
    headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': encodeURIComponent('pagina.jpg'), 'X-Upload-Session': secret },
  });
  expect(put.status).toBe(201);
  const confirmed = await api.request('POST', `/api/u/${link}/confirm`, undefined, { 'X-Upload-Session': secret });
  expect(confirmed.status).toBe(200);
  return { resultToken: confirmed.body.resultToken as string, resultCode: confirmed.body.resultCode as string };
}

async function submissionIdOf(studentId: number): Promise<number> {
  const row = await api.db.prepare('SELECT id FROM submissions WHERE student_id = ?').bind(studentId).first<{ id: number }>();
  return row!.id;
}

async function uploadRow(studentId: number): Promise<{ resultToken: string | null; resultCode: string | null }> {
  const detail = await api.request('GET', `/api/admin/tests/${code}`);
  return detail.body.uploads.find((u: { studentId: number }) => u.studentId === studentId);
}

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  [pop, ana] = cls.studentIds as [number, number];
  code = await makeTest(api, cls.id, 'Fracții');
  token = await startTest(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('result codes', () => {
  it('gives every result link a short code that the teacher and the result page also show', async () => {
    const { resultToken, resultCode } = await uploadAndConfirm(pop);
    expect(resultCode).toMatch(RESULT_CODE);
    expect((await uploadRow(pop)).resultCode).toBe(resultCode);
    // A student who sent nothing has no code.
    expect((await uploadRow(ana)).resultCode).toBeNull();

    await api.request('POST', `/api/admin/tests/${code}/close`);
    await api.request('POST', `/api/admin/tests/${code}/results/open`);
    const result = await api.request('GET', `/api/u/rezultat/${resultToken}`);
    expect(result.status).toBe(200);
    expect(result.body.result.resultCode).toBe(resultCode);
  });

  it('has the code from the moment the upload starts', async () => {
    await api.request('POST', `/api/u/${token}/sessions`, { studentId: pop });
    const row = await api.db.prepare('SELECT result_code FROM submissions WHERE student_id = ?').bind(pop).first<{ result_code: string | null }>();
    expect(row!.result_code).toMatch(RESULT_CODE);
  });

  it('makes the code with the link for an older upload that has neither', async () => {
    await uploadAndConfirm(pop);
    const submissionId = await submissionIdOf(pop);
    await api.db.prepare('UPDATE submissions SET result_token = NULL, result_code = NULL WHERE id = ?').bind(submissionId).run();
    expect((await uploadRow(pop)).resultCode).toBeNull();
    const made = await api.request('GET', `/api/admin/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(await startedAtOf(api, submissionId))}`);
    expect(made.status).toBe(200);
    const row = await uploadRow(pop);
    expect(row.resultToken).toBe(made.body.resultToken);
    expect(row.resultCode).toMatch(RESULT_CODE);
  });

  it('keeps the code of a paper whose link is made again', async () => {
    const { resultCode } = await uploadAndConfirm(pop);
    const submissionId = await submissionIdOf(pop);
    await api.db.prepare('UPDATE submissions SET result_token = NULL WHERE id = ?').bind(submissionId).run();
    await api.request('GET', `/api/admin/submissions/${submissionId}/result-link?startedAt=${encodeURIComponent(await startedAtOf(api, submissionId))}`);
    expect((await uploadRow(pop)).resultCode).toBe(resultCode);
  });

  it("gives no code to a Quick Try's paper", async () => {
    await api.db.prepare('UPDATE tests SET quick_try = 1 WHERE code = ?').bind(code).run();
    await api.db
      .prepare(
        `INSERT INTO submissions (test_id, student_id, status, session_hash, result_token, started_at)
         SELECT id, ?, 'uploading', 'hash', 'abcdefghijkmnop2abcdefcd', '2026-11-17T08:00:00.000Z' FROM tests WHERE code = ?`,
      )
      .bind(pop, code)
      .run();
    const row = await api.db.prepare('SELECT result_code FROM submissions WHERE student_id = ?').bind(pop).first<{ result_code: string | null }>();
    expect(row!.result_code).toBeNull();
  });

  it('never lets two papers of one test share a code', async () => {
    const first = await uploadAndConfirm(pop);
    await uploadAndConfirm(ana);
    await expect(
      api.db.prepare('UPDATE submissions SET result_code = ? WHERE student_id = ?').bind(first.resultCode, ana).run(),
    ).rejects.toThrow(/UNIQUE/);
  });
});
```

- [ ] **Step 2: Edit `shared/tests.test.ts`**

Find this block:

```ts
import { describe, expect, it } from 'vitest';
import { buildTestCode, cleanTitle, isResultToken, isUploadToken, normalizeTestCode } from './tests.ts';

```

Replace it with:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildTestCode,
  cleanTitle,
  formatResultCode,
  isResultToken,
  isUploadToken,
  normalizeResultCode,
  normalizeTestCode,
  RESULT_CODE_ALPHABET,
} from './tests.ts';

```

- [ ] **Step 3: Edit `shared/tests.test.ts`**

Find this block:

```ts

describe('cleanTitle', () => {
```

Replace it with:

```ts

describe('result codes', () => {
  it('uses 31 characters, none of them easy to confuse', () => {
    expect(RESULT_CODE_ALPHABET).toHaveLength(31);
    expect(RESULT_CODE_ALPHABET).not.toMatch(/[01OIL]/);
    expect(new Set(RESULT_CODE_ALPHABET).size).toBe(31);
  });

  it('reads a code in any letter case, with or without the dash and spaces', () => {
    expect(normalizeResultCode('K7M92P')).toBe('K7M92P');
    expect(normalizeResultCode('k7m-92p')).toBe('K7M92P');
    expect(normalizeResultCode('  K7M 92P ')).toBe('K7M92P');
    expect(normalizeResultCode('k7m - 92p')).toBe('K7M92P');
  });

  it('refuses what is not a code', () => {
    expect(normalizeResultCode('')).toBeNull();
    expect(normalizeResultCode('K7M92')).toBeNull();
    expect(normalizeResultCode('K7M92PP')).toBeNull();
    // 0, O, 1, I and L are not in the alphabet.
    expect(normalizeResultCode('K7M90P')).toBeNull();
    expect(normalizeResultCode('K7MO2P')).toBeNull();
    expect(normalizeResultCode('K1M92P')).toBeNull();
    expect(normalizeResultCode('KIM92P')).toBeNull();
    expect(normalizeResultCode('KLM92P')).toBeNull();
    expect(normalizeResultCode('K7M92Ș')).toBeNull();
  });

  it('shows a code with a dash in the middle', () => {
    expect(formatResultCode('K7M92P')).toBe('K7M-92P');
  });
});

describe('cleanTitle', () => {
```

- [ ] **Step 4: Edit `server/routes/upload.test.ts`**

Find this block:

```ts
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'submitted', fileCount: 2, resultToken: expect.stringMatching(/^[a-z2-7]{24}$/) });
    expect((await api.request('POST', `/api/u/${token}/confirm`, undefined, session(secret))).status).toBe(409);
```

Replace it with:

```ts
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'submitted',
      fileCount: 2,
      resultToken: expect.stringMatching(/^[a-z2-7]{24}$/),
      resultCode: expect.stringMatching(/^[2-9A-HJKMNP-Z]{6}$/),
    });
    expect((await api.request('POST', `/api/u/${token}/confirm`, undefined, session(secret))).status).toBe(409);
```

- [ ] **Step 5: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
        autoSubmitted: false,
        grade: null,
        total: null,
        maxTotal: null,
        gradedAt: null,
        resultToken: null,
        resultsOpen: false,
        flagCount: 0,
        checkedCount: 0,
        reviewPoints: [],
        model: null,
        effort: null,
```

Replace it with:

```ts
        autoSubmitted: false,
        grade: null,
        total: null,
        maxTotal: null,
        gradedAt: null,
        resultToken: null,
        resultCode: null,
        resultsOpen: false,
        flagCount: 0,
        checkedCount: 0,
        reviewPoints: [],
        model: null,
        effort: null,
```

- [ ] **Step 6: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
        resultToken: null,
        resultsOpen: false,
```

Replace it with:

```ts
        resultToken: null,
        resultCode: null,
        resultsOpen: false,
```

- [ ] **Step 7: Run the new tests to see them fail**

Run: `npx vitest run server/routes/resultCodes.test.ts shared/tests.test.ts server/routes/upload.test.ts server/routes/tests.test.ts`

Expected: FAIL. `Test Files  4 failed (4)`, `Tests  11 failed | 79 passed (90)`: the four tests of `shared/tests.test.ts` › "result codes" fail with `TypeError: normalizeResultCode is not a function` (and `formatResultCode`, and `Target cannot be null or undefined.` for the alphabet); five tests of `resultCodes.test.ts` fail with `D1_ERROR: no such column: result_code` or `expects to receive a string, but got undefined`; `upload.test.ts` › "sends the upload once, and the teacher sees it" and `tests.test.ts` › "returns the test and one upload row per active student, by name" fail on the missing `resultCode`. "keeps the code of a paper whose link is made again" passes already (it compares two missing codes); it guards the next steps.

- [ ] **Step 8: Create `migrations/0034_result_codes.sql`**

```sql
-- A short code for each result link: six characters a student can read from a
-- picture or write in a notebook, typed on the test's own page to open the
-- result (the link itself is too long to type). Unique inside one test: the
-- code is always used together with the test's link. The database makes it,
-- in a trigger, whenever a paper gets its result link, so every path that
-- makes a link makes a code (a clash fails the statement on the unique index,
-- and the caller tries again as it does for the link). The alphabet has no
-- 0, O, 1, I or L. A Quick Try's paper gets none: its page is its own link.
-- One statement per ";" line end (the test helper splits on that), and no ";"
-- inside strings.

ALTER TABLE submissions ADD COLUMN result_code TEXT;

UPDATE submissions SET result_code =
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1)
WHERE result_token IS NOT NULL AND test_id NOT IN (SELECT id FROM tests WHERE quick_try = 1);

-- Two papers of one test that drew the same code draw again, before the index.
UPDATE submissions SET result_code =
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
  substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1)
WHERE result_code IS NOT NULL
  AND EXISTS (SELECT 1 FROM submissions o WHERE o.test_id = submissions.test_id AND o.result_code = submissions.result_code AND o.id <> submissions.id);

CREATE UNIQUE INDEX submissions_result_code ON submissions (test_id, result_code) WHERE result_code IS NOT NULL;

CREATE TRIGGER submissions_result_code_insert AFTER INSERT ON submissions
WHEN NEW.result_token IS NOT NULL AND NEW.result_code IS NULL
  AND NOT EXISTS (SELECT 1 FROM tests WHERE id = NEW.test_id AND quick_try = 1)
BEGIN
  UPDATE submissions SET result_code =
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1)
  WHERE id = NEW.id; END;

CREATE TRIGGER submissions_result_code_update AFTER UPDATE OF result_token ON submissions
WHEN NEW.result_token IS NOT NULL AND NEW.result_code IS NULL
  AND NOT EXISTS (SELECT 1 FROM tests WHERE id = NEW.test_id AND quick_try = 1)
BEGIN
  UPDATE submissions SET result_code =
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1) ||
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + (random() & 2147483647) % 31, 1)
  WHERE id = NEW.id; END;

-- Wrong codes typed on a test's page, counted per test in a window of time.
-- No teacher page shows this table, so it raises no teacher version.
CREATE TABLE result_code_tries (
  test_id INTEGER PRIMARY KEY REFERENCES tests(id) ON DELETE CASCADE,
  tries INTEGER NOT NULL,
  since TEXT NOT NULL
);
```

- [ ] **Step 9: Edit `shared/tests.ts`**

Find this block:

```ts
const RESULT_TOKEN = /^[a-z2-7]{24}$/;

```

Replace it with:

```ts
const RESULT_TOKEN = /^[a-z2-7]{24}$/;

// The characters of a result code: no 0, O, 1, I or L, which look alike in a
// picture or in handwriting. Migration 0034 makes the codes from the same set.
export const RESULT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const RESULT_CODE_LENGTH = 6;
// Wrong codes typed on one test's page: at most this many in a window.
export const RESULT_CODE_TRIES = 10;
export const RESULT_CODE_WINDOW_MINUTES = 10;
const RESULT_CODE = new RegExp(`^[${RESULT_CODE_ALPHABET}]{${RESULT_CODE_LENGTH}}$`);

```

- [ ] **Step 10: Edit `shared/tests.ts`**

Find this block:

```ts

// Joins inner whitespace into single spaces and trims.
```

Replace it with:

```ts

// A result code as a student types it: any letter case, with or without the
// dash or spaces. Returns the stored form ("K7M92P"), or null for anything
// that is not a code.
export function normalizeResultCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, '').toUpperCase();
  return RESULT_CODE.test(code) ? code : null;
}

// A stored result code as the pages show it: "K7M-92P".
export function formatResultCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

// Joins inner whitespace into single spaces and trims.
```

- [ ] **Step 11: Edit `shared/api.ts`**

Find this block:

```ts
  resultToken: string | null;
  // Whether this student can open the result page: the test keeps results
```

Replace it with:

```ts
  resultToken: string | null;
  // The short code the student types on the test's page; made with the link.
  resultCode: string | null;
  // Whether this student can open the result page: the test keeps results
```

- [ ] **Step 12: Edit `shared/api.ts`**

Find this block:

```ts
  fileCount: number;
  resultToken: string;
}

```

Replace it with:

```ts
  fileCount: number;
  resultToken: string;
  // The short code of the result link (`formatResultCode` shows it). Null only
  // for a paper the database gave no code.
  resultCode: string | null;
}

```

- [ ] **Step 13: Edit `shared/api.ts`**

Find this block:

```ts
  evaluation: StudentEvaluation | null;
}
```

Replace it with:

```ts
  evaluation: StudentEvaluation | null;
  // The short code of this result's link, for the ticket the student saves.
  resultCode: string | null;
}
```

- [ ] **Step 14: Edit `server/db/results.ts`**

Find this block:

```ts
// upload gives this phone nothing. Older uploads without a link get one now.
export async function confirmResultToken(db: D1Database, submissionId: number, sessionHash: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT result_token FROM submissions WHERE id = ? AND session_hash = ?')
    .bind(submissionId, sessionHash)
    .first<{ result_token: string | null }>();
  if (!row) return null;
  if (row.result_token) return row.result_token;
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = newResultToken();
    let set: { result_token: string } | null = null;
    try {
      set = await db
        .prepare('UPDATE submissions SET result_token = ? WHERE id = ? AND session_hash = ? AND result_token IS NULL RETURNING result_token')
        .bind(token, submissionId, sessionHash)
        .first<{ result_token: string }>();
    } catch (err) {
```

Replace it with:

```ts
// upload gives this phone nothing. Older uploads without a link get one now.
// The link comes with its short code, which the database makes with it (a
// trigger of migration 0034; a code that clashes inside the test fails the
// UPDATE on the unique index, and the next try draws another).
export async function confirmResultToken(
  db: D1Database,
  submissionId: number,
  sessionHash: string,
): Promise<{ resultToken: string; resultCode: string | null } | null> {
  const read = () =>
    db
      .prepare('SELECT result_token, result_code FROM submissions WHERE id = ? AND session_hash = ?')
      .bind(submissionId, sessionHash)
      .first<{ result_token: string | null; result_code: string | null }>();
  const row = await read();
  if (!row) return null;
  if (row.result_token) return { resultToken: row.result_token, resultCode: row.result_code };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db
        .prepare('UPDATE submissions SET result_token = ? WHERE id = ? AND session_hash = ? AND result_token IS NULL')
        .bind(newResultToken(), submissionId, sessionHash)
        .run();
    } catch (err) {
```

- [ ] **Step 15: Edit `server/db/results.ts`**

Find this block:

```ts
    }
    if (set) return set.result_token;
    const again = await db
      .prepare('SELECT result_token FROM submissions WHERE id = ? AND session_hash = ?')
      .bind(submissionId, sessionHash)
      .first<{ result_token: string | null }>();
    if (again?.result_token) return again.result_token;
    if (!again) return null;
  }
```

Replace it with:

```ts
    }
    // Read after the write: the trigger sets the code after the UPDATE.
    const again = await read();
    if (!again) return null;
    if (again.result_token) return { resultToken: again.result_token, resultCode: again.result_code };
  }
```

- [ ] **Step 16: Edit `server/db/results.ts`**

Find this block:

```ts
  submitted_at: string | null;
}
```

Replace it with:

```ts
  submitted_at: string | null;
  result_code: string | null;
}
```

- [ ] **Step 17: Edit `server/db/results.ts`**

Find this block:

```ts
const RESULT_SELECT = `SELECT t.code, t.title, c.name AS class_name, t.results_open AS test_open, s.results_open AS submission_open,
    s.id AS submission_id, s.status, st.full_name AS student_name, s.submitted_at
  FROM submissions s
```

Replace it with:

```ts
const RESULT_SELECT = `SELECT t.code, t.title, c.name AS class_name, t.results_open AS test_open, s.results_open AS submission_open,
    s.id AS submission_id, s.status, st.full_name AS student_name, s.submitted_at, s.result_code
  FROM submissions s
```

- [ ] **Step 18: Edit `server/db/results.ts`**

Find this block:

```ts
      evaluation: null,
    };
```

Replace it with:

```ts
      evaluation: null,
      resultCode: row.result_code,
    };
```

- [ ] **Step 19: Edit `server/db/results.ts`**

Find this block:

```ts
    evaluation: evaluation ? toStudentEvaluation(evaluation) : null,
  };
```

Replace it with:

```ts
    evaluation: evaluation ? toStudentEvaluation(evaluation) : null,
    resultCode: row.result_code,
  };
```

- [ ] **Step 20: Edit `server/db/tests.ts`**

Find this block:

```ts
  result_token: string | null;
  submission_open: number | null;
```

Replace it with:

```ts
  result_token: string | null;
  result_code: string | null;
  submission_open: number | null;
```

- [ ] **Step 21: Edit `server/db/tests.ts`**

Find this block:

```ts
           s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted, s.last_error, ev.grade, ev.total, ev.max_total, ev.created_at AS graded_at, ev.model, ev.effort,
           s.result_token, s.results_open AS submission_open, (SELECT t.results_open FROM tests t WHERE t.id = ?) AS test_open,
           (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count,
```

Replace it with:

```ts
           s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted, s.last_error, ev.grade, ev.total, ev.max_total, ev.created_at AS graded_at, ev.model, ev.effort,
           s.result_token, s.result_code, s.results_open AS submission_open, (SELECT t.results_open FROM tests t WHERE t.id = ?) AS test_open,
           (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count,
```

- [ ] **Step 22: Edit `server/db/tests.ts`**

Find this block:

```ts
      resultToken: row.result_token,
      resultsOpen: row.submission_id !== null && (row.test_open === 1 || row.submission_open === 1),
```

Replace it with:

```ts
      resultToken: row.result_token,
      resultCode: row.result_code,
      resultsOpen: row.submission_id !== null && (row.test_open === 1 || row.submission_open === 1),
```

- [ ] **Step 23: Edit `server/routes/upload.ts`**

Find this block:

```ts
        if (!isUniqueViolation(err)) throw err;
        if (!String(err instanceof Error ? err.message : err).includes('result_token')) throw otherDevice();
        if (attempt === 2) throw new ApiError(500, 'retry', 'A apărut o eroare. Încearcă din nou.');
```

Replace it with:

```ts
        if (!isUniqueViolation(err)) throw err;
        // The link's short code is made in the same statement (a trigger).
        if (!/result_token|result_code/.test(String(err instanceof Error ? err.message : err))) throw otherDevice();
        if (attempt === 2) throw new ApiError(500, 'retry', 'A apărut o eroare. Încearcă din nou.');
```

- [ ] **Step 24: Edit `server/routes/upload.ts`**

Find this block:

```ts
    }
    const resultToken = await confirmResultToken(c.env.DB, current.submissionId, sessionHash);
    // confirmSubmission already sent the upload, so files exist: a missing
```

Replace it with:

```ts
    }
    const link = await confirmResultToken(c.env.DB, current.submissionId, sessionHash);
    // confirmSubmission already sent the upload, so files exist: a missing
```

- [ ] **Step 25: Edit `server/routes/upload.ts`**

Find this block:

```ts
    // not "add at least a photo".
    if (!resultToken) throw new ApiError(401, 'no_session', 'Încărcarea nu mai este valabilă. Alege-ți din nou numele.');
    return c.json({ status: 'submitted', fileCount, resultToken } satisfies { status: string } & ConfirmAnswer);
  });
```

Replace it with:

```ts
    // not "add at least a photo".
    if (!link) throw new ApiError(401, 'no_session', 'Încărcarea nu mai este valabilă. Alege-ți din nou numele.');
    return c.json({ status: 'submitted', fileCount, ...link } satisfies { status: string } & ConfirmAnswer);
  });
```

- [ ] **Step 26: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    gradedAt: overrides.status === 'graded' ? '2026-10-07T09:00:00.000Z' : null,
    resultToken: null,
    resultsOpen: false,
    flagCount: 0,
```

Replace it with:

```ts
    gradedAt: overrides.status === 'graded' ? '2026-10-07T09:00:00.000Z' : null,
    resultToken: null,
    resultCode: null,
    resultsOpen: false,
    flagCount: 0,
```

- [ ] **Step 27: Edit `src/test/fakeUploadApi.ts`**

Find this block:

```ts
  };
}

interface FakeSession {
```

Replace it with:

```ts
  };
}

// The short code of every fake result link, as the server stores it.
export const FAKE_RESULT_CODE = 'K7M92P';

interface FakeSession {
```

- [ ] **Step 28: Edit `src/test/fakeUploadApi.ts`**

Find this block:

```ts
      if (student) student.state = 'done';
      return { fileCount: session.files.length, resultToken: session.resultToken };
    }),
```

Replace it with:

```ts
      if (student) student.state = 'done';
      return { fileCount: session.files.length, resultToken: session.resultToken, resultCode: FAKE_RESULT_CODE };
    }),
```

- [ ] **Step 29: Edit `src/test/fakeUploadApi.ts`**

Find this block:

```ts
      evaluation: null,
    })),
```

Replace it with:

```ts
      evaluation: null,
      resultCode: FAKE_RESULT_CODE,
    })),
```

- [ ] **Step 30: Edit `src/admin/pdf/pdf.test.ts`**

Find this block:

```ts
const gradedView: StudentResultView = {
  testCode: '6E2-26T1',
```

Replace it with:

```ts
const gradedView: StudentResultView = {
  resultCode: 'K7M92P',
  testCode: '6E2-26T1',
```

- [ ] **Step 31: Edit `src/try/Graded.test.tsx`**

Find this block:

```tsx
const studentResult: StudentResultView = {
  testCode: TRY_CODE,
```

Replace it with:

```tsx
const studentResult: StudentResultView = {
  resultCode: null,
  testCode: TRY_CODE,
```

- [ ] **Step 32: Edit `src/upload/ResultActions.test.tsx`**

Find this block:

```tsx
const graded: StudentResultView = {
  testCode: '6E2-26T1',
```

Replace it with:

```tsx
const graded: StudentResultView = {
  resultCode: 'K7M92P',
  testCode: '6E2-26T1',
```

- [ ] **Step 33: Edit `src/upload/ResultApp.test.tsx`**

Find this block:

```tsx
const graded: StudentResultView = {
  testCode: '6E2-26T1',
```

Replace it with:

```tsx
const graded: StudentResultView = {
  resultCode: 'K7M92P',
  testCode: '6E2-26T1',
```

- [ ] **Step 34: Edit `src/upload/StudentResult.test.tsx`**

Find this block:

```tsx
const result: StudentResultView = {
  testCode: 'PROBA-26T1',
```

Replace it with:

```tsx
const result: StudentResultView = {
  resultCode: null,
  testCode: 'PROBA-26T1',
```

- [ ] **Step 35: Typecheck and run the whole suite**

Run: `npm run typecheck`, then `npm test`

Expected: no type error; `Test Files  1 failed | 188 passed | 1 skipped (190)`, `Tests  1 failed | 2910 passed | 3 skipped (2914)`; the one failure is the known `src/landing/pages.test.ts` test.

- [ ] **Step 36: Check against the prototype and commit**

```bash
git add migrations/0034_result_codes.sql server/routes/resultCodes.test.ts shared/tests.ts shared/tests.test.ts shared/api.ts server/db/results.ts server/db/tests.ts server/routes/upload.ts server/routes/upload.test.ts server/routes/tests.test.ts src/test/fakeApi.ts src/test/fakeUploadApi.ts src/admin/pdf/pdf.test.ts src/try/Graded.test.tsx src/upload/ResultActions.test.tsx src/upload/ResultApp.test.tsx src/upload/StudentResult.test.tsx
git diff --cached --stat refs/protora/ra1 -- . ':!docs/superpowers/plans'
git commit -m "Give every result link a short code"
```

The `git diff` line prints nothing.

---

### Task 2: Open a result by its code on the test's page (the API)

**Files:**
- Modify: `shared/api.ts`, `server/db/results.ts`, `server/routes/upload.ts`, `server/routes/resultCodes.test.ts`

**Interfaces:**
- Consumes: Task 1's `normalizeResultCode`, `RESULT_CODE_TRIES`, `RESULT_CODE_WINDOW_MINUTES`.
- Produces: `resultCodeBody` (zod, `{ code: string }`, at most 40 characters) and `ResultCodeAnswer { resultToken: string; resultCode: string; studentId: number; studentName: string }` in `shared/api.ts`; `openResultByCode(db, testId, code: string | null, now: string): Promise<ResultCodeAnswer | 'limited' | null>` in `server/db/results.ts`; `POST /api/u/:token/cod` answers 200 with a `ResultCodeAnswer`, 404 `unknown_code`, 429 `too_many_tries`, 409 `not_started`.

- [ ] **Step 1: Edit `server/routes/resultCodes.test.ts`**

Find this block:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeClass, makeTest, startTest, startedAtOf } from '../test/fixtures.ts';
```

Replace it with:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeClass, makeTest, startTest, startedAtOf } from '../test/fixtures.ts';
```

- [ ] **Step 2: Edit `server/routes/resultCodes.test.ts`**

Find this block:

```ts
  });
});
```

Replace it with:

```ts
  });
});

describe('opening a result by its code', () => {
  const typeCode = (typed: string, link = token) => api.request('POST', `/api/u/${link}/cod`, { code: typed });
  const wrongCode = (right: string) => (right.startsWith('2') ? '3' : '2') + right.slice(1);

  it('gives the result link for the right code, through either link of the test', async () => {
    const { resultToken, resultCode } = await uploadAndConfirm(pop);
    const res = await typeCode(resultCode);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resultToken, resultCode, studentId: pop, studentName: 'Pop Ion' });

    const multi = (await api.request('POST', `/api/admin/tests/${code}/multi-link`)).body.token as string;
    expect((await typeCode(resultCode, multi)).body.resultToken).toBe(resultToken);
  });

  it('reads the code as the student types it, before and after the uploads close', async () => {
    const { resultToken, resultCode } = await uploadAndConfirm(pop);
    const typed = `${resultCode.slice(0, 3).toLowerCase()} - ${resultCode.slice(3).toLowerCase()} `;
    expect((await typeCode(typed)).body.resultToken).toBe(resultToken);
    await api.request('POST', `/api/admin/tests/${code}/close`);
    expect((await typeCode(resultCode)).body.resultToken).toBe(resultToken);
  });

  it('refuses a wrong code, a text that is not a code, and the code of another test', async () => {
    const { resultCode } = await uploadAndConfirm(pop);
    const wrong = await typeCode(wrongCode(resultCode));
    expect(wrong.status).toBe(404);
    expect(wrong.body).toEqual({ error: 'unknown_code', message: 'Codul nu este bun. Verifică fiecare literă și încearcă din nou.' });
    expect((await typeCode('')).status).toBe(404);
    expect((await typeCode('nu știu')).status).toBe(404);

    const cls = await makeClass(api, '7A', ['Alt Elev']);
    const otherCode = await makeTest(api, cls.id, 'Ecuații');
    const otherToken = await startTest(api, otherCode);
    expect((await typeCode(resultCode, otherToken)).status).toBe(404);
  });

  it('refuses a body with no code, an unknown link and a test that has not started', async () => {
    expect((await api.request('POST', `/api/u/${token}/cod`, {})).status).toBe(400);
    expect((await typeCode('K7M92P', 'abcdefghijkmnop2')).status).toBe(404);
    const cls = await makeClass(api, '7A', ['Alt Elev']);
    const draft = await makeTest(api, cls.id, 'Ecuații');
    const draftToken = (await api.db.prepare('SELECT upload_token FROM tests WHERE code = ?').bind(draft).first<{ upload_token: string }>())!.upload_token;
    const res = await typeCode('K7M92P', draftToken);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('not_started');
  });

  it('stops after 10 wrong codes in 10 minutes, for the right code too, then opens again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'));
      const { resultToken, resultCode } = await uploadAndConfirm(pop);
      for (let attempt = 0; attempt < 10; attempt++) expect((await typeCode(wrongCode(resultCode))).status).toBe(404);
      const stopped = await typeCode(resultCode);
      expect(stopped.status).toBe(429);
      expect(stopped.body).toEqual({ error: 'too_many_tries', message: 'Prea multe încercări. Încearcă din nou peste câteva minute.' });
      // Refused tries do not push the window forward.
      vi.setSystemTime(new Date('2026-11-17T08:09:59.000Z'));
      expect((await typeCode(resultCode)).status).toBe(429);
      vi.setSystemTime(new Date('2026-11-17T08:10:00.000Z'));
      expect((await typeCode(resultCode)).body.resultToken).toBe(resultToken);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not count a right code, and counts a text that is not a code', async () => {
    const { resultCode } = await uploadAndConfirm(pop);
    for (let attempt = 0; attempt < 9; attempt++) expect((await typeCode('nu știu')).status).toBe(404);
    for (let attempt = 0; attempt < 5; attempt++) expect((await typeCode(resultCode)).status).toBe(200);
    expect((await typeCode(wrongCode(resultCode))).status).toBe(404);
    expect((await typeCode(resultCode)).status).toBe(429);
  });

  it('counts the wrong codes of each test apart', async () => {
    const { resultCode } = await uploadAndConfirm(pop);
    const cls = await makeClass(api, '7A', ['Alt Elev']);
    const otherCode = await makeTest(api, cls.id, 'Ecuații');
    const otherToken = await startTest(api, otherCode);
    for (let attempt = 0; attempt < 10; attempt++) await typeCode('nu știu', otherToken);
    expect((await typeCode('nu știu', otherToken)).status).toBe(429);
    expect((await typeCode(resultCode)).status).toBe(200);
  });

  it('forgets the code of a paper the teacher reset', async () => {
    const { resultCode } = await uploadAndConfirm(pop);
    const submissionId = await submissionIdOf(pop);
    const reset = await api.request('POST', `/api/admin/submissions/${submissionId}/reset`, { startedAt: await startedAtOf(api, submissionId) });
    expect(reset.status).toBe(200);
    expect((await typeCode(resultCode)).status).toBe(404);
  });

  it('refuses a cross-site request', async () => {
    const res = await api.fetch(`/api/u/${token}/cod`, {
      method: 'POST',
      body: JSON.stringify({ code: 'K7M92P' }),
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 3: Run the new tests to see them fail**

Run: `npx vitest run server/routes/resultCodes.test.ts`

Expected: FAIL. `Test Files  1 failed (1)`, `Tests  7 failed | 8 passed (15)`: the seven new tests of "opening a result by its code" fail (`expected 404 to be 200`, `expected 404 to be 429`, `expected 404 to be 400`, and `{ error: 'not_found', … }` in place of `unknown_code`): the route does not exist yet. The six tests of Task 1, "forgets the code of a paper the teacher reset" and "refuses a cross-site request" pass already (a missing route answers 404, and every write from another site is refused).

- [ ] **Step 4: Edit `shared/api.ts`**

Find this block:

```ts
export type ShownUploadBody = z.output<typeof shownUpload>;

```

Replace it with:

```ts
export type ShownUploadBody = z.output<typeof shownUpload>;

// The student app: open a result by the short code of its link, typed on the
// test's page. Any text is taken: the server counts a text that is not a code
// as a wrong try.
export const resultCodeBody = z.object({
  code: z.string({ message: 'Scrie codul tău.' }).max(40, { message: 'Codul are 6 caractere.' }),
});

// The result link a code opened, with what the phone keeps beside it.
export interface ResultCodeAnswer {
  resultToken: string;
  resultCode: string;
  studentId: number;
  studentName: string;
}

```

- [ ] **Step 5: Edit `server/db/results.ts`**

Find this block:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { StudentEvaluation, StudentResultView, SubmissionFile, UploadStatus } from '../../shared/api.ts';
import { isUniqueViolation } from '../errors.ts';
```

Replace it with:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { ResultCodeAnswer, StudentEvaluation, StudentResultView, SubmissionFile, UploadStatus } from '../../shared/api.ts';
import { RESULT_CODE_TRIES, RESULT_CODE_WINDOW_MINUTES } from '../../shared/tests.ts';
import { isUniqueViolation } from '../errors.ts';
```

- [ ] **Step 6: Edit `server/db/results.ts`**

Find this block:

```ts

interface ResultRow {
```

Replace it with:

```ts

// A result link by its short code, typed on the page of the test `testId`.
// Wrong codes are counted per test: at most RESULT_CODE_TRIES in a window of
// RESULT_CODE_WINDOW_MINUTES, so the codes of a test cannot be guessed. The
// first statement takes a try, and refuses it when none is left, inside its
// own SQL; a right code gives its try back. `code` is null for a text that is
// not a code: it costs a try like any wrong code.
export async function openResultByCode(
  db: D1Database,
  testId: number,
  code: string | null,
  now: string,
): Promise<ResultCodeAnswer | 'limited' | null> {
  const windowStart = new Date(Date.parse(now) - RESULT_CODE_WINDOW_MINUTES * 60_000).toISOString();
  const [taken, found] = await db.batch<{ tries: number } | CodeRow>([
    db
      .prepare(
        `INSERT INTO result_code_tries (test_id, tries, since) VALUES (?, 1, ?)
         ON CONFLICT (test_id) DO UPDATE SET
           tries = CASE WHEN since <= ? THEN 1 ELSE tries + 1 END,
           since = CASE WHEN since <= ? THEN excluded.since ELSE since END
         WHERE since <= ? OR tries < ?
         RETURNING tries`,
      )
      .bind(testId, now, windowStart, windowStart, windowStart, RESULT_CODE_TRIES),
    db
      .prepare(
        `SELECT s.result_token, s.result_code, s.student_id, st.full_name
         FROM submissions s JOIN students st ON st.id = s.student_id
         WHERE s.test_id = ? AND s.result_code = ? AND s.result_token IS NOT NULL`,
      )
      .bind(testId, code ?? ''),
  ]);
  if ((taken?.results ?? []).length === 0) return 'limited';
  const row = (found?.results ?? [])[0] as CodeRow | undefined;
  if (!row) return null;
  await db.prepare('UPDATE result_code_tries SET tries = tries - 1 WHERE test_id = ? AND tries > 0').bind(testId).run();
  return { resultToken: row.result_token, resultCode: row.result_code, studentId: row.student_id, studentName: row.full_name };
}

interface CodeRow {
  result_token: string;
  result_code: string;
  student_id: number;
  full_name: string;
}

interface ResultRow {
```

- [ ] **Step 7: Edit `server/routes/upload.ts`**

Find this block:

```ts
import { Hono } from 'hono';
import { startSessionBody, type ConfirmAnswer, type LinkInfo, type UploadSession } from '../../shared/api.ts';
import { checkoutBody } from '../../shared/payments.ts';
import { MAX_STUDENT_FILES, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE, studentFileKey } from '../../shared/files.ts';
import { isResultToken, isUploadToken } from '../../shared/tests.ts';
import {
```

Replace it with:

```ts
import { Hono } from 'hono';
import { resultCodeBody, startSessionBody, type ConfirmAnswer, type LinkInfo, type ResultCodeAnswer, type UploadSession } from '../../shared/api.ts';
import { checkoutBody } from '../../shared/payments.ts';
import { MAX_STUDENT_FILES, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE, studentFileKey } from '../../shared/files.ts';
import { isResultToken, isUploadToken, normalizeResultCode } from '../../shared/tests.ts';
import {
```

- [ ] **Step 8: Edit `server/routes/upload.ts`**

Find this block:

```ts
} from '../db/links.ts';
import { confirmResultToken, findResultByToken, findResultFile, resultsOpenByToken, resultsPublished } from '../db/results.ts';
import { listPayments, type PaidTest, type PaymentPayer } from '../db/payments.ts';
```

Replace it with:

```ts
} from '../db/links.ts';
import {
  confirmResultToken,
  findResultByToken,
  findResultFile,
  openResultByCode,
  resultsOpenByToken,
  resultsPublished,
} from '../db/results.ts';
import { listPayments, type PaidTest, type PaymentPayer } from '../db/payments.ts';
```

- [ ] **Step 9: Edit `server/routes/upload.ts`**

Find this block:

```ts

  // A student's result page by its secret link. Only while the teacher keeps
```

Replace it with:

```ts

  // The result link of a student who lost it, by its short code. The code
  // works only here, on the page of its own test (either link of the test),
  // and wrong codes are limited per test. It gives the link whether or not
  // the results are published: the result page itself says when they are not.
  routes.post('/:token/cod', async (c) => {
    const test = await linkTest(c);
    if (test.status === 'draft') throw notStarted();
    const { code } = await readJson(c, resultCodeBody);
    const found = await openResultByCode(c.env.DB, test.id, normalizeResultCode(code), nowIso());
    if (found === 'limited') {
      throw new ApiError(429, 'too_many_tries', 'Prea multe încercări. Încearcă din nou peste câteva minute.');
    }
    if (!found) throw new ApiError(404, 'unknown_code', 'Codul nu este bun. Verifică fiecare literă și încearcă din nou.');
    return c.json(found satisfies ResultCodeAnswer);
  });

  // A student's result page by its secret link. Only while the teacher keeps
```

- [ ] **Step 10: Typecheck and run the whole suite**

Run: `npm run typecheck`, then `npm test`

Expected: no type error; `Test Files  1 failed | 188 passed | 1 skipped (190)`, `Tests  1 failed | 2919 passed | 3 skipped (2923)`; the one failure is the known `src/landing/pages.test.ts` test.

- [ ] **Step 11: Check against the prototype and commit**

```bash
git add shared/api.ts server/db/results.ts server/routes/upload.ts server/routes/resultCodes.test.ts
git diff --cached --stat refs/protora/ra2 -- . ':!docs/superpowers/plans'
git commit -m "Open a result by its short code on the test's page"
```

The `git diff` line prints nothing.

---

### Task 3: The result link as a ticket

**Files:**
- Create: `src/upload/shareLink.ts`, `src/upload/ResultTicket.tsx`, `src/upload/ResultTicket.test.tsx`
- Modify: `src/upload/resultLinks.ts`, `src/upload/resultLinks.test.ts`, `src/upload/UploadScreen.tsx`, `src/upload/UploadScreen.test.tsx`, `src/upload/UploadApp.tsx`, `src/upload/UploadApp.test.tsx`, `src/upload/ResultActions.tsx`, `src/ui/brand.css`

**Interfaces:**
- Consumes: Task 1's `ConfirmAnswer.resultCode`, `formatResultCode`.
- Produces: `shareLink(data: { url: string; title: string; text?: string }): Promise<'shared' | 'cancelled' | 'copied' | 'manual'>`; `ResultTicket({ resultToken, resultCode: string | null, studentName, test: TicketTest, fresh?: boolean })`, `TicketTest { title; className; code }`, `TICKET_TITLE`, `TICKET_HOW`, `TICKET_HOW_NO_CODE` in `src/upload/ResultTicket.tsx`; `SavedResultLink.resultCode: string | null`; `saveResultLink(uploadToken, studentId, resultToken, studentName, resultCode: string | null = null)`; `UploadScreen`'s `onSent(fileCount, resultToken, resultCode)`. `ResultLinkBox` is gone.

- [ ] **Step 1: Create `src/upload/ResultTicket.test.tsx`**

```tsx
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { ResultTicket, TICKET_HOW, TICKET_HOW_NO_CODE } from './ResultTicket.tsx';

const TEST = { title: 'Fracții', className: '6E2', code: '6E2-26T1' };
const URL_TEXT = `${window.location.origin}/u/rezultat/result-token-11`;

// Sets what the browser offers: the share sheet, the clipboard, or neither.
function browserOffers({ share, writeText }: { share?: (data: ShareData) => Promise<void>; writeText?: (text: string) => Promise<void> }) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, 'clipboard', { value: writeText ? { writeText } : undefined, configurable: true, writable: true });
}

function show(props: Partial<Parameters<typeof ResultTicket>[0]> = {}) {
  return render(<ResultTicket resultToken="result-token-11" resultCode="K7M92P" studentName="Pop Ion" test={TEST} {...props} />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  browserOffers({});
});

describe('ResultTicket', () => {
  it('shows the test, the student, the QR code of the result link and the code', () => {
    show();
    const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByText('Biletul tău pentru rezultat')).toBeInTheDocument();
    expect(within(ticket).getByText('Fracții')).toBeInTheDocument();
    expect(within(ticket).getByText('Pop Ion')).toBeInTheDocument();
    expect(within(ticket).getByText('Clasa 6E2 · 6E2-26T1')).toBeInTheDocument();
    expect(within(ticket).getByTitle('Codul QR al rezultatului')).toBeInTheDocument();
    expect(within(ticket).getByText('Codul tău')).toBeInTheDocument();
    expect(within(ticket).getByText('K7M-92P')).toBeInTheDocument();
    expect(within(ticket).getByText(TICKET_HOW)).toBeInTheDocument();
    expect(within(ticket).getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', URL_TEXT);
    expectNoGradingWords();
  });

  it('draws the QR code dark on white, whatever the theme', () => {
    show();
    const paths = screen.getByTitle('Codul QR al rezultatului').closest('svg')!.querySelectorAll('path');
    expect([...paths].map((path) => path.getAttribute('fill'))).toEqual(['#FFFFFF', '#000000']);
  });

  it('shows no code row for a link kept before links had codes', () => {
    show({ resultCode: null });
    expect(screen.queryByText('Codul tău')).not.toBeInTheDocument();
    expect(screen.getByText(TICKET_HOW_NO_CODE)).toBeInTheDocument();
    expect(screen.getByTitle('Codul QR al rezultatului')).toBeInTheDocument();
  });

  it('says when the result appears only right after sending', () => {
    const first = show({ fresh: true });
    expect(screen.getByText(/^Rezultatul apare aici după ce profesorul publică rezultatele/)).toBeInTheDocument();
    first.unmount();
    show();
    expect(screen.queryByText(/^Rezultatul apare aici/)).not.toBeInTheDocument();
  });

  it('keeps the long address behind a button, whole and with a copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserOffers({ writeText });
    show();
    expect(screen.queryByText(URL_TEXT)).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Arată linkul întreg' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(screen.getByText(URL_TEXT)).toHaveClass('result-link-url');
    // Text, not a field that cuts the address off.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copiază linkul' }));
    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
    expect(screen.getByRole('button', { name: 'Copiat!' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ascunde linkul' }));
    expect(screen.queryByText(URL_TEXT)).not.toBeInTheDocument();
  });

  it('sends the link with the code through the share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    browserOffers({ share });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Trimite-mi linkul' }));
    expect(share).toHaveBeenCalledWith({ url: URL_TEXT, title: 'Pop Ion · Fracții', text: 'Codul meu: K7M-92P' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sends the link alone when it has no code', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    browserOffers({ share });
    show({ resultCode: null });
    await userEvent.click(screen.getByRole('button', { name: 'Trimite-mi linkul' }));
    expect(share).toHaveBeenCalledWith({ url: URL_TEXT, title: 'Pop Ion · Fracții' });
  });

  it('does nothing more when the share sheet is closed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserOffers({ share: vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')), writeText });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Trimite-mi linkul' }));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('copies the link when the phone has no share sheet, and says so for a while', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserOffers({ writeText });
    vi.useFakeTimers();
    show();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trimite-mi linkul' }));
    });
    expect(writeText).toHaveBeenCalledWith(URL_TEXT);
    expect(screen.getByRole('status')).toHaveTextContent('Linkul a fost copiat.');
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the whole link to copy by hand when it can neither share nor copy', async () => {
    browserOffers({});
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Trimite-mi linkul' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Copiază linkul de aici:');
    expect(screen.getByText(URL_TEXT)).toHaveClass('result-link-url');
  });
});
```

- [ ] **Step 2: Edit `src/upload/resultLinks.test.ts`**

Find this block:

```ts
    saveResultLink(TOKEN, 10, 'rt-10', 'Pop Ion');
    expect(loadResultLink(TOKEN, 10)).toEqual({ studentId: 10, studentName: 'Pop Ion', resultToken: 'rt-10' });
    expect(loadResultLink(TOKEN, 11)).toBeNull();
    expect(loadResultLink('otherlinktoken22', 10)).toBeNull();
  });
```

Replace it with:

```ts
    saveResultLink(TOKEN, 10, 'rt-10', 'Pop Ion');
    expect(loadResultLink(TOKEN, 10)).toEqual({ studentId: 10, studentName: 'Pop Ion', resultToken: 'rt-10', resultCode: null });
    expect(loadResultLink(TOKEN, 11)).toBeNull();
    expect(loadResultLink('otherlinktoken22', 10)).toBeNull();
  });

  it('keeps the short code of a link, and reads a link kept before links had codes', () => {
    saveResultLink(TOKEN, 10, 'rt-10', 'Pop Ion', 'K7M92P');
    expect(loadResultLink(TOKEN, 10)).toEqual({ studentId: 10, studentName: 'Pop Ion', resultToken: 'rt-10', resultCode: 'K7M92P' });
    expect(loadResultLinks(TOKEN)).toEqual([{ studentId: 10, studentName: 'Pop Ion', resultToken: 'rt-10', resultCode: 'K7M92P' }]);
    // What an older version of the page stored.
    localStorage.setItem(`qe.result.${TOKEN}.11`, JSON.stringify({ resultToken: 'rt-11', studentName: 'Ionescu Ana' }));
    expect(loadResultLink(TOKEN, 11)).toEqual({ studentId: 11, studentName: 'Ionescu Ana', resultToken: 'rt-11', resultCode: null });
  });
```

- [ ] **Step 3: Edit `src/upload/resultLinks.test.ts`**

Find this block:

```ts
    expect(loadResultLinks(TOKEN)).toEqual([
      { studentId: 10, studentName: 'Ionescu Ana', resultToken: 'rt-10' },
      { studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11' },
    ]);
```

Replace it with:

```ts
    expect(loadResultLinks(TOKEN)).toEqual([
      { studentId: 10, studentName: 'Ionescu Ana', resultToken: 'rt-10', resultCode: null },
      { studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11', resultCode: null },
    ]);
```

- [ ] **Step 4: Edit `src/upload/resultLinks.test.ts`**

Find this block:

```ts
    expect(loadResultLink(TOKEN, 10)).toBeNull();
    expect(loadResultLink(TOKEN, 11)).toEqual({ studentId: 11, studentName: 'Ionescu Ana', resultToken: 'rt-alive' });
    expect(loadResultLinks('otherlinktoken22')).toEqual([]);
```

Replace it with:

```ts
    expect(loadResultLink(TOKEN, 10)).toBeNull();
    expect(loadResultLink(TOKEN, 11)).toEqual({ studentId: 11, studentName: 'Ionescu Ana', resultToken: 'rt-alive', resultCode: null });
    expect(loadResultLinks('otherlinktoken22')).toEqual([]);
```

- [ ] **Step 5: Edit `src/upload/resultLinks.test.ts`**

Find this block:

```ts
    expect(() => forgetResultLinkByToken('rt-missing')).not.toThrow();
    expect(loadResultLink(TOKEN, 10)).toEqual({ studentId: 10, studentName: 'Pop Ion', resultToken: 'rt-10' });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
```

Replace it with:

```ts
    expect(() => forgetResultLinkByToken('rt-missing')).not.toThrow();
    expect(loadResultLink(TOKEN, 10)).toEqual({ studentId: 10, studentName: 'Pop Ion', resultToken: 'rt-10', resultCode: null });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
```

- [ ] **Step 6: Edit `src/upload/resultLinks.test.ts`**

Find this block:

```ts
    // Not remembered yet: the other link's papers are not this test's.
    expect(loadTestResultLinks(TOKEN, 'key-a')).toEqual([{ studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11' }]);
    rememberTestKey(multi, 'key-a');
```

Replace it with:

```ts
    // Not remembered yet: the other link's papers are not this test's.
    expect(loadTestResultLinks(TOKEN, 'key-a')).toEqual([{ studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11', resultCode: null }]);
    rememberTestKey(multi, 'key-a');
```

- [ ] **Step 7: Edit `src/upload/resultLinks.test.ts`**

Find this block:

```ts
    expect(loadTestResultLinks(TOKEN, 'key-a')).toEqual([
      { studentId: 10, studentName: 'Ionescu Ana', resultToken: 'rt-10' },
      { studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11' },
    ]);
    // A link the server does not know never matches, whatever key is asked.
    expect(loadTestResultLinks(TOKEN, UNKNOWN_TEST_KEY)).toEqual([{ studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11' }]);
  });
```

Replace it with:

```ts
    expect(loadTestResultLinks(TOKEN, 'key-a')).toEqual([
      { studentId: 10, studentName: 'Ionescu Ana', resultToken: 'rt-10', resultCode: null },
      { studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11', resultCode: null },
    ]);
    // A link the server does not know never matches, whatever key is asked.
    expect(loadTestResultLinks(TOKEN, UNKNOWN_TEST_KEY)).toEqual([{ studentId: 11, studentName: 'Pop Ion', resultToken: 'rt-11', resultCode: null }]);
  });
```

- [ ] **Step 8: Edit `src/upload/resultLinks.test.ts`**

Find this block:

```ts
    // the class is not in the list, so their link stays.
    expect(loadResultLinks(TOKEN)).toEqual([{ studentId: 12, studentName: 'Stan Eva', resultToken: 'rt-12' }]);
    expect(singleUploadLocked(TOKEN)).toBe(true);
```

Replace it with:

```ts
    // the class is not in the list, so their link stays.
    expect(loadResultLinks(TOKEN)).toEqual([{ studentId: 12, studentName: 'Stan Eva', resultToken: 'rt-12', resultCode: null }]);
    expect(singleUploadLocked(TOKEN)).toBe(true);
```

- [ ] **Step 9: Edit `src/upload/UploadApp.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/rezultat/result-token-11`);
    // The whole address is text on the page (not cut off in a field), so a screenshot keeps all of it.
    expect(screen.getByText(`${window.location.origin}/u/rezultat/result-token-11`)).toHaveClass('result-link-url');
```

Replace it with:

```tsx
    expect(screen.getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/rezultat/result-token-11`);
    // The ticket: a screenshot of it holds the QR code and the short code.
    const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByText('Fracții')).toBeInTheDocument();
    expect(within(ticket).getByTitle('Codul QR al rezultatului')).toBeInTheDocument();
    expect(within(ticket).getByText('K7M-92P')).toBeInTheDocument();
    // The whole address is text on the page (not cut off in a field), one tap away.
    await userEvent.click(within(ticket).getByRole('button', { name: 'Arată linkul întreg' }));
    expect(screen.getByText(`${window.location.origin}/u/rezultat/result-token-11`)).toHaveClass('result-link-url');
```

- [ ] **Step 10: Edit `src/upload/UploadApp.test.tsx`**

Find this block:

```tsx
    expect(screen.getByText('Rezultatul apare aici după ce profesorul publică rezultatele: nota, punctajul pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări.')).toBeInTheDocument();
    expect(localStorage.getItem(`qe.result.${LINK_TOKEN}.11`)).toContain('result-token-11');
    expectNoGradingWords();
```

Replace it with:

```tsx
    expect(screen.getByText('Rezultatul apare aici după ce profesorul publică rezultatele: nota, punctajul pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(`qe.result.${LINK_TOKEN}.11`)!)).toEqual({ resultToken: 'result-token-11', studentName: 'Pop Ion', resultCode: 'K7M92P' });
    expectNoGradingWords();
```

- [ ] **Step 11: Edit `src/upload/UploadApp.test.tsx`**

Find this block:

```tsx
    saveSecret(LINK_TOKEN, 11, 'secret-11');
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
```

Replace it with:

```tsx
    saveSecret(LINK_TOKEN, 11, 'secret-11');
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    render(<UploadApp api={api} token={LINK_TOKEN} />);
```

- [ ] **Step 12: Edit `src/upload/UploadApp.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/rezultat/result-token-11`);
    expect(screen.getByText(/Linkul cu rezultatul pentru Pop Ion/)).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/u/rezultat/result-token-11`)).toHaveClass('result-link-url');
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
```

Replace it with:

```tsx
    expect(screen.getByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/rezultat/result-token-11`);
    const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByText('K7M-92P')).toBeInTheDocument();
    // Not right after sending: no word on when the result appears.
    expect(screen.queryByText(/^Rezultatul apare aici/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Alege-ți numele' })).not.toBeInTheDocument();
```

- [ ] **Step 13: Edit `src/upload/UploadApp.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/rezultat/result-token-11`);
    expect(screen.getByText(/Linkul cu rezultatul pentru Pop Ion/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
```

Replace it with:

```tsx
    expect(await screen.findByRole('link', { name: 'Vezi rezultatul' })).toHaveAttribute('href', `${window.location.origin}/u/rezultat/result-token-11`);
    // Kept before links had codes: the ticket has the QR code and no code row.
    const ticket = screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByTitle('Codul QR al rezultatului')).toBeInTheDocument();
    expect(within(ticket).queryByText('Codul tău')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
```

- [ ] **Step 14: Edit `src/upload/UploadScreen.test.tsx`**

Find this block:

```tsx
    expect(confirm).toHaveBeenLastCalledWith('Ești sigur? După confirmare nu mai poți schimba nimic.');
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(2, 'result-token-11'));
    expect(localStorage.getItem(`qe.session.${LINK_TOKEN}.11`)).toBeNull();
```

Replace it with:

```tsx
    expect(confirm).toHaveBeenLastCalledWith('Ești sigur? După confirmare nu mai poți schimba nimic.');
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(2, 'result-token-11', 'K7M92P'));
    expect(localStorage.getItem(`qe.session.${LINK_TOKEN}.11`)).toBeNull();
```

- [ ] **Step 15: Run the new tests to see them fail**

Run: `npx vitest run src/upload/ResultTicket.test.tsx src/upload/resultLinks.test.ts src/upload/UploadApp.test.tsx src/upload/UploadScreen.test.tsx`

Expected: FAIL. `Test Files  4 failed (4)`, `Tests  11 failed | 45 passed (56)`: `ResultTicket.test.tsx` does not load (`Failed to resolve import "./ResultTicket.tsx"`); six tests of `resultLinks.test.ts` fail on the missing `resultCode` (`expected { studentId: 10, …(2) } to deeply equal { studentId: 10, …(3) }`); three tests of `UploadApp.test.tsx` fail with `Unable to find an accessible element with the role "region" and name "Biletul pentru rezultat: Pop Ion"`; and `UploadScreen.test.tsx` fails with `expected "vi.fn()" to be called with arguments: [ 2, 'result-token-11', 'K7M92P' ]`.

- [ ] **Step 16: Create `src/upload/shareLink.ts`**

```ts
// Sends a result link where the student will find it again: the phone's share
// sheet (their own chat, a message to a parent), else the clipboard, else the
// page shows the link to copy by hand.
export type LinkShare = 'shared' | 'cancelled' | 'copied' | 'manual';

export async function shareLink(data: { url: string; title: string; text?: string }): Promise<LinkShare> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      // The student closed the share sheet: nothing more to do.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(data.url);
    return 'copied';
  } catch {
    // No clipboard (an old browser, or a page not on https).
    return 'manual';
  }
}
```

- [ ] **Step 17: Create `src/upload/ResultTicket.tsx`**

```tsx
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { displayClassName } from '../../shared/classes.ts';
import { formatResultCode } from '../../shared/tests.ts';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { resultPageUrl } from './resultLinks.ts';
import { shareLink } from './shareLink.ts';

// The test a ticket is for, as the student knows it.
export interface TicketTest {
  title: string;
  className: string;
  code: string;
}

export const TICKET_TITLE = 'Biletul tău pentru rezultat';
export const TICKET_HOW = 'Scanează codul QR cu camera. Sau deschide linkul testului și scrie codul.';
export const TICKET_HOW_NO_CODE = 'Scanează codul QR cu camera.';

// How long "Linkul a fost copiat." stays on screen.
const COPIED_MS = 4000;

type ShareState = 'idle' | 'copied' | 'manual';

// A student's way back to the result page, drawn as a ticket: the test, the
// name, the QR code of the result link and its short code. Students keep the
// link as a screenshot, so the screen itself is what must work later: a phone
// reads the QR code out of the picture, and the code can be typed on the
// test's page. The long address stays behind "Arată linkul întreg".
export function ResultTicket({
  resultToken,
  resultCode,
  studentName,
  test,
  fresh = false,
}: {
  resultToken: string;
  // Null for a link this phone kept before links had codes.
  resultCode: string | null;
  studentName: string;
  test: TicketTest;
  // Right after sending: also says when the result appears.
  fresh?: boolean;
}) {
  const [share, setShare] = useState<ShareState>('idle');
  const [linkShown, setLinkShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = resultPageUrl(resultToken);
  const code = resultCode ? formatResultCode(resultCode) : null;

  useEffect(() => {
    if (share !== 'copied') return;
    const timer = setTimeout(() => setShare('idle'), COPIED_MS);
    return () => clearTimeout(timer);
  }, [share]);

  async function send() {
    setShare('idle');
    const sent = await shareLink({
      url,
      title: `${studentName} · ${test.title}`,
      ...(code ? { text: `Codul meu: ${code}` } : {}),
    });
    if (sent === 'copied') setShare('copied');
    if (sent === 'manual') {
      setShare('manual');
      setLinkShown(true);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="ticket-box" aria-label={studentName ? `Biletul pentru rezultat: ${studentName}` : 'Biletul pentru rezultat'}>
      <div className="ticket">
        <p className="ticket-top">
          <span>{TICKET_TITLE}</span>
          <strong>{test.title}</strong>
        </p>
        <div className="ticket-mid">
          <p className="ticket-who">
            <strong>{studentName}</strong>
            <span>
              {displayClassName(test.className)} · {test.code}
            </span>
          </p>
          {/* Dark on white in both themes, with a white edge: phones read it from a screenshot. */}
          <div className="ticket-qr">
            <QRCodeSVG value={url} size={176} marginSize={0} level="M" title="Codul QR al rezultatului" />
          </div>
          {code && (
            <p className="ticket-code">
              <span>Codul tău</span>
              <strong>{code}</strong>
            </p>
          )}
        </div>
        <p className="ticket-foot">{code ? TICKET_HOW : TICKET_HOW_NO_CODE}</p>
      </div>
      <div className="ticket-actions">
        <button type="button" className="button-quiet button-big" onClick={() => void send()}>
          <ActionIcon name="send" />
          Trimite-mi linkul
        </button>
      </div>
      {share === 'copied' && (
        <p role="status" className="hint">
          Linkul a fost copiat.
        </p>
      )}
      {share === 'manual' && (
        <p role="status" className="hint">
          Copiază linkul de aici:
        </p>
      )}
      {fresh && (
        <p className="hint">
          Rezultatul apare aici după ce profesorul publică rezultatele: nota, punctajul pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări.
        </p>
      )}
      <p className="ticket-links">
        <a href={url}>Vezi rezultatul</a>
        <button type="button" className="link-button" aria-expanded={linkShown} onClick={() => setLinkShown((shown) => !shown)}>
          {linkShown ? 'Ascunde linkul' : 'Arată linkul întreg'}
        </button>
      </p>
      {linkShown && (
        <>
          {/* The whole address as text, never cut off: a cut address in a
              picture is a broken link. */}
          <p className="result-link-url">{url}</p>
          <p>
            <button type="button" className="button-quiet button-small" onClick={() => void copy()}>
              <ActionIcon name={copied ? 'check' : 'copy'} />
              {copied ? 'Copiat!' : 'Copiază linkul'}
            </button>
          </p>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 18: Edit `src/upload/resultLinks.ts`**

Find this block:

```ts
  resultToken: string;
}
```

Replace it with:

```ts
  resultToken: string;
  // The link's short code. Null for a link kept before links had codes.
  resultCode: string | null;
}

// What the phone stored for one kept link, read with care: it is the page's
// own data, but an older version of the page wrote less.
function readSaved(raw: string, studentId: number): SavedResultLink | null {
  const parsed = JSON.parse(raw) as { resultToken?: unknown; studentName?: unknown; resultCode?: unknown };
  if (typeof parsed.resultToken !== 'string' || parsed.resultToken === '') return null;
  return {
    studentId,
    studentName: typeof parsed.studentName === 'string' ? parsed.studentName : '',
    resultToken: parsed.resultToken,
    resultCode: typeof parsed.resultCode === 'string' && parsed.resultCode !== '' ? parsed.resultCode : null,
  };
}
```

- [ ] **Step 19: Edit `src/upload/resultLinks.ts`**

Find this block:

```ts
      try {
        const parsed = JSON.parse(raw) as { resultToken?: unknown; studentName?: unknown };
        if (typeof parsed.resultToken !== 'string' || parsed.resultToken === '') continue;
        found.push({
          studentId,
          studentName: typeof parsed.studentName === 'string' ? parsed.studentName : '',
          resultToken: parsed.resultToken,
        });
      } catch {
```

Replace it with:

```ts
      try {
        const saved = readSaved(raw, studentId);
        if (saved) found.push(saved);
      } catch {
```

- [ ] **Step 20: Edit `src/upload/resultLinks.ts`**

Find this block:

```ts

export function saveResultLink(uploadToken: string, studentId: number, resultToken: string, studentName: string): void {
  try {
    localStorage.setItem(keyOf(uploadToken, studentId), JSON.stringify({ resultToken, studentName }));
  } catch {
```

Replace it with:

```ts

export function saveResultLink(
  uploadToken: string,
  studentId: number,
  resultToken: string,
  studentName: string,
  resultCode: string | null = null,
): void {
  try {
    localStorage.setItem(keyOf(uploadToken, studentId), JSON.stringify({ resultToken, studentName, resultCode }));
  } catch {
```

- [ ] **Step 21: Edit `src/upload/resultLinks.ts`**

Find this block:

```ts
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { resultToken?: unknown; studentName?: unknown };
    if (typeof parsed.resultToken !== 'string' || parsed.resultToken === '') return null;
    return {
      studentId,
      studentName: typeof parsed.studentName === 'string' ? parsed.studentName : '',
      resultToken: parsed.resultToken,
    };
  } catch {
```

Replace it with:

```ts
    if (!raw) return null;
    return readSaved(raw, studentId);
  } catch {
```

- [ ] **Step 22: Edit `src/upload/UploadScreen.tsx`**

Find this block:

```tsx
  session: ActiveSession;
  onSent: (fileCount: number, resultToken: string) => void;
  onLost: (message: string) => void;
```

Replace it with:

```tsx
  session: ActiveSession;
  onSent: (fileCount: number, resultToken: string, resultCode: string | null) => void;
  onLost: (message: string) => void;
```

- [ ] **Step 23: Edit `src/upload/UploadScreen.tsx`**

Find this block:

```tsx
    try {
      const { fileCount, resultToken } = await api.confirm(token, session.secret);
      forgetSecret(token, session.studentId);
      onSent(fileCount, resultToken);
    } catch (err) {
```

Replace it with:

```tsx
    try {
      const { fileCount, resultToken, resultCode } = await api.confirm(token, session.secret);
      forgetSecret(token, session.studentId);
      onSent(fileCount, resultToken, resultCode);
    } catch (err) {
```

- [ ] **Step 24: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
  rememberTestKey,
  resultPageUrl,
  saveResultLink,
```

Replace it with:

```tsx
  rememberTestKey,
  saveResultLink,
```

- [ ] **Step 25: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
import { UploadScreen } from './UploadScreen.tsx';
import { StudentHeader } from './StudentHeader.tsx';
```

Replace it with:

```tsx
import { UploadScreen } from './UploadScreen.tsx';
import { ResultTicket } from './ResultTicket.tsx';
import { StudentHeader } from './StudentHeader.tsx';
```

- [ ] **Step 26: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
  | { kind: 'upload'; info: LinkInfo; session: ActiveSession }
  | { kind: 'sent'; info: LinkInfo; fileCount: number; resultToken: string; studentName: string }
  | { kind: 'locked'; info: LinkInfo };
```

Replace it with:

```tsx
  | { kind: 'upload'; info: LinkInfo; session: ActiveSession }
  | { kind: 'sent'; info: LinkInfo; fileCount: number; resultToken: string; resultCode: string | null; studentName: string }
  | { kind: 'locked'; info: LinkInfo };
```

- [ ] **Step 27: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
            <>
              <KeptResultLinks uploadToken={token} />
              <NamePicker
```

Replace it with:

```tsx
            <>
              <KeptResultLinks uploadToken={token} info={phase.info} />
              <NamePicker
```

- [ ] **Step 28: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
            <>
              <KeptResultLinks uploadToken={token} />
              <p className="hint">
```

Replace it with:

```tsx
            <>
              <KeptResultLinks uploadToken={token} info={phase.info} />
              <p className="hint">
```

- [ ] **Step 29: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
                session={phase.session}
                onSent={(fileCount, resultToken) => {
                  saveResultLink(token, phase.session.studentId, resultToken, phase.session.studentName);
                  setPhase({ kind: 'sent', info: phase.info, fileCount, resultToken, studentName: phase.session.studentName });
                }}
```

Replace it with:

```tsx
                session={phase.session}
                onSent={(fileCount, resultToken, resultCode) => {
                  saveResultLink(token, phase.session.studentId, resultToken, phase.session.studentName, resultCode);
                  setPhase({ kind: 'sent', info: phase.info, fileCount, resultToken, resultCode, studentName: phase.session.studentName });
                }}
```

- [ ] **Step 30: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
          {phase.kind === 'sent' && token && (
            <section className="sent">
              <h2>Gata! Lucrarea ta a fost trimisă.</h2>
              <p>{phase.fileCount === 1 ? 'Ai trimis un fișier.' : `Ai trimis ${phase.fileCount} fișiere.`}</p>
              <ResultLinkBox resultToken={phase.resultToken} studentName={phase.studentName} fresh />
              {phase.info.multi && (
```

Replace it with:

```tsx
          {phase.kind === 'sent' && token && (
            <>
              <section className="sent">
                <h2>Gata! Lucrarea ta a fost trimisă.</h2>
                <p>{phase.fileCount === 1 ? 'Ai trimis un fișier.' : `Ai trimis ${phase.fileCount} fișiere.`}</p>
              </section>
              <ResultTicket
                resultToken={phase.resultToken}
                resultCode={phase.resultCode}
                studentName={phase.studentName}
                test={phase.info.test}
                fresh
              />
              {phase.info.multi && (
```

- [ ] **Step 31: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
                  <p className="hint">Poți trimite acum lucrarea altui elev, cu același link.</p>
                  <button type="button" className="button button-big" onClick={() => load(null)}>
                    <ActionIcon name="add-person" />
```

Replace it with:

```tsx
                  <p className="hint">Poți trimite acum lucrarea altui elev, cu același link.</p>
                  <button type="button" className="button-quiet button-big" onClick={() => load(null)}>
                    <ActionIcon name="add-person" />
```

- [ ] **Step 32: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
              )}
            </section>
          )}
```

Replace it with:

```tsx
              )}
            </>
          )}
```

- [ ] **Step 33: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
  const [links] = useState<SavedResultLink[]>(() => loadTestResultLinks(uploadToken, info.test.key));
  const kept = links.length > 0 && (
    <section aria-label="Linkurile tale cu rezultate">
      {links.map((link) => (
        <ResultLinkBox key={link.resultToken} resultToken={link.resultToken} studentName={link.studentName} />
      ))}
    </section>
  );
  if (!info.test.resultsOpen) {
```

Replace it with:

```tsx
  const [links] = useState<SavedResultLink[]>(() => loadTestResultLinks(uploadToken, info.test.key));
  const kept = links.length > 0 && <Tickets links={links} info={info} />;
  if (!info.test.resultsOpen) {
```

- [ ] **Step 34: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
// back on the same phone.
function KeptResultLinks({ uploadToken }: { uploadToken: string }) {
  const [links] = useState<SavedResultLink[]>(() => loadResultLinks(uploadToken));
  if (links.length === 0) return null;
  return (
    <section aria-label="Linkurile tale cu rezultate">
      {links.map((link) => (
        <ResultLinkBox key={link.studentId} resultToken={link.resultToken} studentName={link.studentName} />
      ))}
    </section>
  );
}

// One kept result link, with a copy button. After sending it also says the
// result comes only after the teacher opens the results.
export function ResultLinkBox({ resultToken, studentName, fresh = false }: { resultToken: string; studentName: string; fresh?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = resultPageUrl(resultToken);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="result-link-box">
      <p>
        {fresh ? (
          <>
            Păstrează linkul cu rezultatul{studentName ? ` pentru ${studentName}` : ''}:
          </>
        ) : (
          <>
            Linkul cu rezultatul{studentName ? ` pentru ${studentName}` : ''}:
          </>
        )}
      </p>
      <p>
        <a href={url}>Vezi rezultatul</a>
      </p>
      {/* The whole address as text, never cut off: students often keep it as
          a screenshot, and a cut address in the picture is a broken link. */}
      <p className="result-link-url">
        {url}
      </p>
      <p>
        <button type="button" className="button-quiet button-small" onClick={copy}>
          <ActionIcon name={copied ? 'check' : 'copy'} />
          {copied ? 'Copiat!' : 'Copiază linkul'}
        </button>
      </p>
      {fresh && (
        <p className="hint">
          Rezultatul apare aici după ce profesorul publică rezultatele: nota, punctajul pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări.
        </p>
      )}
    </div>
```

Replace it with:

```tsx
// back on the same phone.
function KeptResultLinks({ uploadToken, info }: { uploadToken: string; info: LinkInfo }) {
  const [links] = useState<SavedResultLink[]>(() => loadResultLinks(uploadToken));
  if (links.length === 0) return null;
  return <Tickets links={links} info={info} />;
}

// The kept result links of one test, each as its ticket.
function Tickets({ links, info }: { links: SavedResultLink[]; info: LinkInfo }) {
  return (
    <div className="tickets">
      {links.map((link) => (
        <ResultTicket
          key={link.resultToken}
          resultToken={link.resultToken}
          resultCode={link.resultCode}
          studentName={link.studentName}
          test={info.test}
        />
      ))}
    </div>
```

- [ ] **Step 35: Edit `src/upload/ResultActions.tsx`**

Find this block:

```tsx
import { ActionIcon } from '../ui/ActionIcon.tsx';

```

Replace it with:

```tsx
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { shareLink } from './shareLink.ts';

```

- [ ] **Step 36: Edit `src/upload/ResultActions.tsx`**

Find this block:

```tsx
    setShare('idle');
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url, title: `${result.studentName} · ${result.testTitle}` });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShare('copied');
    } catch {
      // No clipboard (an old browser, or a page not on https): the student
      // copies the link by hand.
      setShare('manual');
    }
  }
```

Replace it with:

```tsx
    setShare('idle');
    const sent = await shareLink({ url, title: `${result.studentName} · ${result.testTitle}` });
    if (sent === 'copied' || sent === 'manual') setShare(sent);
  }
```

- [ ] **Step 37: Edit `src/ui/brand.css`**

Find this block:

```css

/* A kept link to a student's result page, on the phone that sent the upload. */
.result-link-box {
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1.5px solid var(--rule);
  border-radius: 0.75rem;
  background: var(--sheet);
}

.result-link-box p {
  margin: 0 0 0.5rem;
}
```

Replace it with:

```css

/* A student's way back to the result page, drawn as a ticket (the test, the
   name, the QR code of the result link and its short code), on the phone that
   sent the upload. A screenshot of it must work later, so the QR code is
   large, and dark on white in both themes. */
.tickets {
  display: grid;
  gap: 1.5rem;
}

.ticket-box {
  max-width: 24rem;
  margin-top: 1rem;
}

.ticket-box p {
  margin: 0;
}

.ticket {
  border: 1.5px solid var(--rule);
  border-radius: 0.875rem;
  background: var(--sheet);
  overflow: hidden;
}

.ticket-top {
  display: grid;
  gap: 0.1rem;
  padding: 0.875rem 1rem;
  background: var(--ink);
  color: var(--on-ink);
}

.ticket-top span {
  font-size: 0.8125rem;
}

.ticket-top strong {
  font-size: 1.1875rem;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.ticket-mid {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
  padding: 1.125rem 1rem 0.875rem;
}

.ticket-who {
  justify-self: stretch;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
  font-size: 0.9375rem;
}

.ticket-who span {
  color: var(--muted);
}

.ticket-qr {
  /* About four modules of white, which readers need on a dark page. */
  padding: 1.375rem;
  border-radius: var(--radius);
  background: #ffffff;
  line-height: 0;
}

.ticket-code {
  justify-self: stretch;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  border-radius: var(--radius);
  background: var(--ink-tint);
}

.ticket-code span {
  color: var(--muted);
  font-size: 0.875rem;
}

.ticket-code strong {
  font-size: 1.625rem;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ticket-foot {
  padding: 0 1rem 0.875rem;
  color: var(--muted);
  font-size: 0.8125rem;
  text-align: center;
}

.ticket-actions {
  display: grid;
  gap: 0.625rem;
  margin-top: 0.875rem;
}

.ticket-box > .hint,
.ticket-box > .alert {
  margin-top: 0.75rem;
}

.ticket-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  margin-top: 0.875rem;
}

.ticket-links .link-button {
  min-height: 2.75rem;
}

.ticket-links a {
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
}

.ticket-box .result-link-url {
  margin-block: 0.25rem 0.5rem;
}
```

- [ ] **Step 38: Typecheck and run the whole suite**

Run: `npm run typecheck`, then `npm test`

Expected: no type error; `Test Files  1 failed | 189 passed | 1 skipped (191)`, `Tests  1 failed | 2930 passed | 3 skipped (2934)`; the one failure is the known `src/landing/pages.test.ts` test.

- [ ] **Step 39: Check against the prototype and commit**

```bash
git add src/upload/shareLink.ts src/upload/ResultTicket.tsx src/upload/ResultTicket.test.tsx src/upload/resultLinks.ts src/upload/resultLinks.test.ts src/upload/UploadScreen.tsx src/upload/UploadScreen.test.tsx src/upload/UploadApp.tsx src/upload/UploadApp.test.tsx src/upload/ResultActions.tsx src/ui/brand.css
git diff --cached --stat refs/protora/ra3 -- . ':!docs/superpowers/plans'
git commit -m "Show the result link as a ticket with its QR code and short code"
```

The `git diff` line prints nothing.

---

### Task 4: Save the ticket as a picture

**Files:**
- Create: `src/upload/ticketImage.ts`, `src/upload/ticketImage.test.ts`, `src/upload/SaveTicket.tsx`, `src/upload/SaveTicket.test.tsx`
- Modify: `src/test/setup.ts`, `src/upload/ResultTicket.tsx`, `src/upload/ResultActions.tsx`, `src/upload/ResultActions.test.tsx`, `src/upload/ResultApp.tsx`, `src/upload/ResultApp.test.tsx`, `src/upload/resultLinks.ts`, and spec §7.2 (`docs/superpowers/specs/2026-11-17-student-result-access-design.md`: the picture is made early only on an iPhone or iPad, and the canvas memory)

**Interfaces:**
- Consumes: Task 3's `ResultTicket`, `TICKET_HOW`, `TICKET_HOW_NO_CODE`; `saveFile` and `shareFile` of `src/admin/pdf/share.ts`.
- Produces: `TicketPicture { testTitle; studentName; classLine; code: string | null; how; qr: CanvasImageSource }`, `TICKET_WIDTH` (1080), `TICKET_HEIGHT` (1350), `QR_SIZE` (520), `ticketFileName(testCode, studentName)`, `wrapLines(measure, text, width, maxLines)`, `drawTicket(context, picture)`, `renderTicket(picture): Promise<Blob>`, `savesThroughShare(): boolean`, `saveTicket(blob, fileName, title): Promise<ShareResult>` in `src/upload/ticketImage.ts`; `useSaveTicket({ url, testCode, picture: Omit<TicketPicture, 'qr'>, className }): { button: ReactNode; note: ReactNode }` in `src/upload/SaveTicket.tsx`; `rememberResultCode(resultToken, resultCode)` in `src/upload/resultLinks.ts`.

- [ ] **Step 1: Create `src/upload/ticketImage.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFile, shareFile } from '../admin/pdf/share.ts';
import {
  drawTicket,
  renderTicket,
  saveTicket,
  savesThroughShare,
  TICKET_HEIGHT,
  TICKET_WIDTH,
  ticketFileName,
  wrapLines,
  type TicketPicture,
} from './ticketImage.ts';

vi.mock('../admin/pdf/share.ts', () => ({ saveFile: vi.fn(), shareFile: vi.fn() }));

// Every letter is 10 wide: enough to test the line breaks.
const measure = (text: string) => text.length * 10;

// A canvas context that records what is drawn.
function fakeContext() {
  const texts: { text: string; x: number; y: number; font: string; fill: string; align: string }[] = [];
  const images: { source: unknown; x: number; y: number; width: number; height: number }[] = [];
  const rects: { fill: string; x: number; y: number; width: number; height: number }[] = [];
  const context = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    lineCap: 'butt',
    imageSmoothingEnabled: true,
    fillRect(x: number, y: number, width: number, height: number) {
      rects.push({ fill: this.fillStyle, x, y, width, height });
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, font: this.font, fill: this.fillStyle, align: this.textAlign });
    },
    measureText: (text: string) => ({ width: text.length * 20 }),
    drawImage(source: unknown, x: number, y: number, width: number, height: number) {
      images.push({ source, x, y, width, height });
    },
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
  };
  return { context: context as unknown as CanvasRenderingContext2D, texts, images, rects, arc: context.arc };
}

const QR = { qr: true } as unknown as CanvasImageSource;
const picture: TicketPicture = {
  testTitle: 'Fracții',
  studentName: 'Pop Ion',
  classLine: 'Clasa 6E2 · 6E2-26T1',
  code: 'K7M-92P',
  how: 'Scanează codul QR cu camera. Sau deschide linkul testului și scrie codul.',
  qr: QR,
};

function userAgent(value: string, touchPoints = 0) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value);
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(saveFile).mockReset();
  vi.mocked(shareFile).mockReset();
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
});

describe('ticketFileName', () => {
  it('names the file by the test and the student, in plain letters', () => {
    expect(ticketFileName('6E2-26T1', 'Pop Ion')).toBe('bilet-6E2-26T1-Pop-Ion.png');
    expect(ticketFileName('6E2-26T1', 'Țîrcă Ștefăniță-Ion')).toBe('bilet-6E2-26T1-Tirca-Stefanita-Ion.png');
    expect(ticketFileName('6E2-26T1', '')).toBe('bilet-6E2-26T1.png');
  });
});

describe('wrapLines', () => {
  it('keeps a short text on one line', () => {
    expect(wrapLines(measure, 'Test la fracții', 300, 2)).toEqual(['Test la fracții']);
    expect(wrapLines(measure, '', 300, 2)).toEqual([]);
  });

  it('breaks at spaces, and ends what does not fit in "…"', () => {
    expect(wrapLines(measure, 'Test la fracții ordinare', 150, 2)).toEqual(['Test la fracții', 'ordinare']);
    expect(wrapLines(measure, 'Test de evaluare la fracții ordinare și zecimale', 150, 2)).toEqual(['Test de', 'evaluare la…']);
  });

  it('keeps a word wider than the line whole', () => {
    expect(wrapLines(measure, 'Electromagnetism', 100, 2)).toEqual(['Electromagnetism']);
  });
});

describe('drawTicket', () => {
  it('draws the lockup, the test, the student, the QR code, the code and how to use it', () => {
    const { context, texts, images, rects, arc } = fakeContext();
    drawTicket(context, picture);
    // A white ground over the whole picture, first.
    expect(rects[0]).toEqual({ fill: '#ffffff', x: 0, y: 0, width: TICKET_WIDTH, height: TICKET_HEIGHT });
    // The mark's three arcs.
    expect(arc).toHaveBeenCalledTimes(3);
    const written = texts.map((entry) => entry.text);
    expect(written).toEqual([
      'MQGrader',
      'by Laura Miron',
      'Fracții',
      'Pop Ion · Clasa 6E2 · 6E2-26T1',
      'Codul tău',
      'K7M-92P',
      'Scanează codul QR cu camera. Sau deschide',
      'linkul testului și scrie codul.',
    ]);
    // The QR code: square, in the middle, not smoothed.
    expect(images).toEqual([{ source: QR, x: 280, y: 470, width: 520, height: 520 }]);
    expect((context as unknown as { imageSmoothingEnabled: boolean }).imageSmoothingEnabled).toBe(false);
    // The code is the largest text.
    expect(texts.find((entry) => entry.text === 'K7M-92P')!.font).toMatch(/^700 92px /);
    // Everything stays inside the picture.
    for (const entry of texts) {
      expect(entry.y).toBeGreaterThan(0);
      expect(entry.y).toBeLessThan(TICKET_HEIGHT);
    }
  });

  it('draws no code for a link without one, and the QR code lower', () => {
    const { context, texts, images } = fakeContext();
    drawTicket(context, { ...picture, code: null, how: 'Scanează codul QR cu camera.' });
    const written = texts.map((entry) => entry.text);
    expect(written).not.toContain('Codul tău');
    expect(written).toContain('Scanează codul QR cu camera.');
    expect(images[0]!.y).toBe(560);
  });

  it('cuts a long test title to two lines', () => {
    const { context, texts } = fakeContext();
    drawTicket(context, { ...picture, testTitle: 'Test de evaluare sumativă la unitatea de învățare fracții ordinare și fracții zecimale periodice' });
    const title = texts.filter((entry) => entry.font.startsWith('700 60px'));
    expect(title).toHaveLength(2);
    expect(title[1]!.text.endsWith('…')).toBe(true);
  });

  it('never writes a grade, points or a word on how the work is graded', () => {
    const { context, texts } = fakeContext();
    drawTicket(context, picture);
    const all = texts.map((entry) => entry.text).join('\n');
    expect(all).not.toMatch(/\b(AI|IA|CES)\b/);
    expect(all.toLowerCase()).not.toMatch(/not[aă]|punct|robot|automat|inteligen/);
  });
});

describe('renderTicket', () => {
  it('draws on a canvas of the picture size, gives a PNG and frees the canvas', async () => {
    const { context } = fakeContext();
    const png = new Blob(['png'], { type: 'image/png' });
    const sizes: number[][] = [];
    const canvases: HTMLCanvasElement[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      sizes.push([this.width, this.height]);
      canvases.push(this);
      return context;
    } as never);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback: BlobCallback) {
      callback(png);
    });
    await expect(renderTicket(picture)).resolves.toBe(png);
    expect(sizes).toEqual([[TICKET_WIDTH, TICKET_HEIGHT]]);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    // Phones limit canvas memory: the canvas is emptied once the PNG is made.
    expect([canvases[0]!.width, canvases[0]!.height]).toEqual([0, 0]);
  });

  it('fails when the browser gives no canvas or no picture', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(renderTicket(picture)).rejects.toThrow();
    const { context } = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback: BlobCallback) {
      callback(null);
    });
    await expect(renderTicket(picture)).rejects.toThrow();
  });
});

describe('saveTicket', () => {
  const blob = new Blob(['png'], { type: 'image/png' });

  it('downloads the picture on a phone that is not an iPhone', async () => {
    userAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36');
    expect(savesThroughShare()).toBe(false);
    await expect(saveTicket(blob, 'bilet.png', 'Pop Ion · Fracții')).resolves.toBe('downloaded');
    expect(saveFile).toHaveBeenCalledWith(blob, 'bilet.png');
    expect(shareFile).not.toHaveBeenCalled();
  });

  it('opens the share sheet on an iPhone, which has "Save Image"', async () => {
    userAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
    vi.mocked(shareFile).mockResolvedValue('shared');
    expect(savesThroughShare()).toBe(true);
    await expect(saveTicket(blob, 'bilet.png', 'Pop Ion · Fracții')).resolves.toBe('shared');
    expect(shareFile).toHaveBeenCalledWith(blob, 'bilet.png', 'Pop Ion · Fracții');
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('takes an iPad that says it is a Mac for what it is, and a Mac for a Mac', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
    userAgent(mac, 5);
    expect(savesThroughShare()).toBe(true);
    userAgent(mac, 0);
    expect(savesThroughShare()).toBe(false);
  });
});
```

- [ ] **Step 2: Create `src/upload/SaveTicket.test.tsx`**

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { ResultTicket, TICKET_HOW } from './ResultTicket.tsx';
import { renderTicket, saveTicket, savesThroughShare } from './ticketImage.ts';

vi.mock('./ticketImage.ts', async (original) => ({
  ...(await original<typeof import('./ticketImage.ts')>()),
  renderTicket: vi.fn(),
  saveTicket: vi.fn(),
  savesThroughShare: vi.fn(),
}));

const TEST = { title: 'Fracții', className: '6E2', code: '6E2-26T1' };
const png = new Blob(['png'], { type: 'image/png' });

function show(resultCode: string | null = 'K7M92P') {
  return render(<ResultTicket resultToken="result-token-11" resultCode={resultCode} studentName="Pop Ion" test={TEST} />);
}

// Shows the ticket and waits until its picture is made.
async function showReady(resultCode: string | null = 'K7M92P') {
  const shown = show(resultCode);
  await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(1));
  // The picture's promise settles.
  await act(async () => {});
  return shown;
}

beforeEach(() => {
  vi.mocked(renderTicket).mockResolvedValue(png);
  vi.mocked(saveTicket).mockResolvedValue('downloaded');
  // An iPhone: the picture is made as the ticket shows.
  vi.mocked(savesThroughShare).mockReturnValue(true);
});

afterEach(() => {
  vi.mocked(renderTicket).mockReset();
  vi.mocked(saveTicket).mockReset();
  vi.mocked(savesThroughShare).mockReset();
  vi.useRealTimers();
});

describe('Salvează biletul', () => {
  it('is the main button of the ticket, before "Trimite-mi linkul"', () => {
    show();
    const names = screen.getAllByRole('button').map((button) => button.textContent);
    expect(names).toEqual(['Salvează biletul', 'Trimite-mi linkul', 'Arată linkul întreg']);
    expect(screen.getByRole('button', { name: 'Salvează biletul' })).toHaveClass('button', 'button-big');
  });

  it('makes the picture of the ticket as soon as it shows, with the QR code of the result link', async () => {
    await showReady();
    const drawn = vi.mocked(renderTicket).mock.calls[0]![0];
    expect(drawn).toMatchObject({
      testTitle: 'Fracții',
      studentName: 'Pop Ion',
      classLine: 'Clasa 6E2 · 6E2-26T1',
      code: 'K7M-92P',
      how: TICKET_HOW,
    });
    expect(drawn.qr).toBeInstanceOf(HTMLCanvasElement);
    // The hidden QR canvas goes once the picture is made.
    expect(document.querySelector('canvas')).toBeNull();
    expect(saveTicket).not.toHaveBeenCalled();
  });

  it('saves the picture inside the tap, with no wait, and says so', async () => {
    await showReady();
    // An iPhone opens the share sheet only inside the tap: the save starts
    // before the click returns.
    fireEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(saveTicket).toHaveBeenCalledWith(png, 'bilet-6E2-26T1-Pop-Ion.png', 'Pop Ion · Fracții');
    expect(await screen.findByRole('status')).toHaveTextContent('Biletul a fost salvat. Îl găsești lângă pozele tale sau în descărcări.');
    // The picture is made once, not again for the tap.
    expect(renderTicket).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Salvează biletul' })).toBeEnabled();
    expectNoGradingWords();
  });

  it('waits for the picture when the tap comes before it is ready', async () => {
    let finish: (blob: Blob) => void = () => {};
    vi.mocked(renderTicket).mockImplementationOnce(() => new Promise<Blob>((resolve) => (finish = resolve)));
    show();
    await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(screen.getByRole('button', { name: 'Salvează biletul' })).toBeDisabled();
    expect(saveTicket).not.toHaveBeenCalled();
    await act(async () => finish(png));
    expect(saveTicket).toHaveBeenCalledWith(png, 'bilet-6E2-26T1-Pop-Ion.png', 'Pop Ion · Fracții');
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(renderTicket).toHaveBeenCalledTimes(1);
  });

  it('saves a ticket without a code for a link that has none', async () => {
    await showReady(null);
    expect(vi.mocked(renderTicket).mock.calls[0]![0]).toMatchObject({ code: null, how: 'Scanează codul QR cu camera.' });
  });

  it('takes the note away after a few seconds', async () => {
    await showReady();
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says nothing when the student closes the share sheet', async () => {
    vi.mocked(saveTicket).mockResolvedValue('cancelled');
    await showReady();
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Salvează biletul' })).toBeEnabled());
    expect(saveTicket).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('makes the picture again on the tap when the first one failed', async () => {
    vi.mocked(renderTicket).mockRejectedValueOnce(new Error('no font'));
    show();
    await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(1));
    await act(async () => {});
    // The QR canvas goes after a failure too; the tap draws it again.
    expect(document.querySelector('canvas')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(renderTicket).toHaveBeenCalledTimes(2);
    expect(saveTicket).toHaveBeenCalledWith(png, 'bilet-6E2-26T1-Pop-Ion.png', 'Pop Ion · Fracții');
  });

  it('tells the student to take a screenshot when the picture cannot be made, and can try again', async () => {
    vi.mocked(renderTicket).mockRejectedValue(new Error('no canvas'));
    show();
    await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am putut salva biletul. Fă o poză ecranului.');
    expect(saveTicket).not.toHaveBeenCalled();
    vi.mocked(renderTicket).mockResolvedValue(png);
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('makes the picture on the tap on a phone that downloads it', async () => {
    vi.mocked(savesThroughShare).mockReturnValue(false);
    show();
    await act(async () => {});
    expect(renderTicket).not.toHaveBeenCalled();
    expect(document.querySelector('canvas')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(renderTicket).toHaveBeenCalledTimes(1);
    expect(saveTicket).toHaveBeenCalledWith(png, 'bilet-6E2-26T1-Pop-Ion.png', 'Pop Ion · Fracții');
  });

  it('makes one picture at a time when many tickets show', async () => {
    let running = 0;
    let most = 0;
    const finish: (() => void)[] = [];
    vi.mocked(renderTicket).mockImplementation(
      () =>
        new Promise<Blob>((resolve) => {
          running += 1;
          most = Math.max(most, running);
          finish.push(() => {
            running -= 1;
            resolve(png);
          });
        }),
    );
    render(
      <>
        {[1, 2, 3, 4, 5].map((n) => (
          <ResultTicket key={n} resultToken={`result-token-${n}`} resultCode="K7M92P" studentName={`Elev ${n}`} test={TEST} />
        ))}
      </>,
    );
    for (let n = 1; n <= 5; n++) {
      await vi.waitFor(() => expect(renderTicket).toHaveBeenCalledTimes(n));
      // At most one hidden QR canvas on the page.
      expect(document.querySelectorAll('canvas').length).toBeLessThanOrEqual(1);
      await act(async () => finish[n - 1]!());
    }
    expect(most).toBe(1);
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('tells the student when the phone refuses to save it', async () => {
    vi.mocked(saveTicket).mockRejectedValue(new Error('refused'));
    await showReady();
    await userEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am putut salva biletul. Fă o poză ecranului.');
  });
});
```

- [ ] **Step 3: Edit `src/upload/ResultActions.test.tsx`**

Find this block:

```tsx
import { ResultActions } from './ResultActions.tsx';

```

Replace it with:

```tsx
import { ResultActions } from './ResultActions.tsx';
import { renderTicket, saveTicket } from './ticketImage.ts';

```

- [ ] **Step 4: Edit `src/upload/ResultActions.test.tsx`**

Find this block:

```tsx
vi.mock('../admin/pdf/share.ts', () => ({ saveFile: vi.fn() }));

```

Replace it with:

```tsx
vi.mock('../admin/pdf/share.ts', () => ({ saveFile: vi.fn() }));
vi.mock('./ticketImage.ts', async (original) => ({
  ...(await original<typeof import('./ticketImage.ts')>()),
  renderTicket: vi.fn(),
  saveTicket: vi.fn(),
}));

```

- [ ] **Step 5: Edit `src/upload/ResultActions.test.tsx`**

Find this block:

```tsx
beforeEach(() => {
  browserOffers({});
});

```

Replace it with:

```tsx
beforeEach(() => {
  browserOffers({});
  // The ticket's picture is made as the page shows.
  vi.mocked(renderTicket).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
});

```

- [ ] **Step 6: Edit `src/upload/ResultActions.test.tsx`**

Find this block:

```tsx
  vi.mocked(saveFile).mockReset();
  browserOffers({});
});
```

Replace it with:

```tsx
  vi.mocked(saveFile).mockReset();
  vi.mocked(renderTicket).mockReset();
  vi.mocked(saveTicket).mockReset();
  vi.restoreAllMocks();
  browserOffers({});
});

describe('Salvează biletul on the result page', () => {
  it('saves the ticket of this result, with its code', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    vi.mocked(renderTicket).mockResolvedValue(png);
    vi.mocked(saveTicket).mockResolvedValue('downloaded');
    render(<ResultActions result={graded} url={URL_TEXT} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvează biletul' }));
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Biletul a fost salvat.');
    expect(vi.mocked(renderTicket).mock.calls[0]![0]).toMatchObject({
      testTitle: 'Fracții',
      studentName: 'Pop Ion',
      classLine: 'Clasa 6E2 · 6E2-26T1',
      code: 'K7M-92P',
    });
    expect(saveTicket).toHaveBeenCalledWith(png, 'bilet-6E2-26T1-Pop-Ion.png', 'Pop Ion · Fracții');
    expectNoGradingWords();
  });

  it('is there before the result is graded too', () => {
    render(<ResultActions result={{ ...graded, status: 'submitted', evaluation: null }} url={URL_TEXT} />);
    expect(screen.getByRole('button', { name: 'Salvează biletul' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descarcă PDF' })).toBeNull();
  });
});
```

- [ ] **Step 7: Edit `src/upload/ResultApp.test.tsx`**

Find this block:

```tsx

  it('shows only the send, PDF and files buttons, and the files after it', async () => {
    const api = createFakeUploadApi();
```

Replace it with:

```tsx

  it('shows only the send, ticket, PDF and files buttons, and the files after it', async () => {
    const api = createFakeUploadApi();
```

- [ ] **Step 8: Edit `src/upload/ResultApp.test.tsx`**

Find this block:

```tsx
    const buttons = within(screen.getByRole('main')).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Trimite linkul', 'Descarcă PDF', 'Arată fișierele']);
    await userEvent.click(screen.getByRole('button', { name: 'Arată fișierele' }));
```

Replace it with:

```tsx
    const buttons = within(screen.getByRole('main')).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Trimite linkul', 'Salvează biletul', 'Descarcă PDF', 'Arată fișierele']);
    await userEvent.click(screen.getByRole('button', { name: 'Arată fișierele' }));
```

- [ ] **Step 9: Edit `src/upload/ResultApp.test.tsx`**

Find this block:

```tsx

  it('hides empty final sections', async () => {
```

Replace it with:

```tsx

  it('teaches the code to a link this phone kept before links had codes', async () => {
    const api = createFakeUploadApi();
    api.getResult.mockResolvedValue(structuredClone(graded));
    saveResultLink('abcdefghijkmnop2', 11, 'result-token-11', 'Pop Ion');
    saveResultLink('abcdefghijkmnop2', 12, 'result-token-12', 'Stan Eva');
    render(<ResultApp api={api} resultToken="result-token-11" />);
    await screen.findByRole('heading', { name: 'Pop Ion' });
    expect(loadResultLinks('abcdefghijkmnop2')).toEqual([
      { studentId: 11, studentName: 'Pop Ion', resultToken: 'result-token-11', resultCode: 'K7M92P' },
      { studentId: 12, studentName: 'Stan Eva', resultToken: 'result-token-12', resultCode: null },
    ]);
  });

  it('hides empty final sections', async () => {
```

- [ ] **Step 10: Run the new tests to see them fail**

Run: `npx vitest run src/upload/ticketImage.test.ts src/upload/SaveTicket.test.tsx src/upload/ResultActions.test.tsx src/upload/ResultApp.test.tsx`

Expected: FAIL. `Test Files  4 failed (4)`, `Tests  2 failed | 9 passed (11)`: `ticketImage.test.ts`, `SaveTicket.test.tsx` and `ResultActions.test.tsx` do not load (`Failed to resolve import "./ticketImage.ts"`); in `ResultApp.test.tsx`, "shows only the send, ticket, PDF and files buttons, and the files after it" (`expected [ 'Trimite linkul', …(2) ] to deeply equal [ 'Trimite linkul', …(3) ]`) and "teaches the code to a link this phone kept before links had codes" fail. The other tests of `ResultApp.test.tsx` pass.

- [ ] **Step 11: Create `src/upload/ticketImage.ts`**

```ts
import { saveFile, shareFile, type ShareResult } from '../admin/pdf/share.ts';

// The result ticket as a picture for the phone's gallery: what the ticket on
// the page shows, drawn on a canvas in the browser. Always light, whatever
// the page's theme: it is a picture to keep, and phones read a dark QR code
// on white best. It holds no grade and no points.

export interface TicketPicture {
  testTitle: string;
  studentName: string;
  // "Clasa 6E2 · 6E2-26T1".
  classLine: string;
  // The code as shown ("K7M-92P"), or null for a link without one.
  code: string | null;
  // "Scanează codul QR cu camera. …": how the ticket is used.
  how: string;
  // The QR code of the result link, already drawn (a canvas of the QR library).
  qr: CanvasImageSource;
}

export const TICKET_WIDTH = 1080;
export const TICKET_HEIGHT = 1350;

const MARGIN = 80;
// The QR code's side in the picture, in pixels.
export const QR_SIZE = 520;
// A white edge around the QR code, which readers need.
const QR_EDGE = 28;
const FONT = '"Schibsted Grotesk", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
const TEXT = '#0c1524';
const MUTED = '#4a566a';
const INK = '#1b5cc8';
const TINT = '#e6eefb';
const ORANGE = '#e2590b';

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

// "bilet-6E2-26T1-Pop-Ion.png": letters without their marks, so every phone
// can store the name.
export function ticketFileName(testCode: string, studentName: string): string {
  const clean = [testCode, studentName]
    .map((part) =>
      part
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter((part) => part !== '');
  return `${['bilet', ...clean].join('-')}.png`;
}

// Breaks a text into lines no wider than `width`, at most `maxLines`; what
// does not fit ends in "…". A single word wider than the line stays whole.
export function wrapLines(measure: (text: string) => number, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter((word) => word !== '');
  const lines: string[] = [];
  let line = '';
  for (let index = 0; index < words.length; index++) {
    const next = line === '' ? words[index]! : `${line} ${words[index]}`;
    if (line === '' || measure(next) <= width) {
      line = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      // The last line allowed: cut words until "…" fits.
      let cut = line;
      while (cut.includes(' ') && measure(`${cut}…`) > width) cut = cut.slice(0, cut.lastIndexOf(' '));
      lines.push(`${cut}…`);
      return lines;
    }
    lines.push(line);
    line = words[index]!;
  }
  if (line !== '') lines.push(line);
  return lines;
}

// The MQGrader mark: three arcs of one ring, two blue and one orange.
function drawMark(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const scale = size / 64;
  const arcs: [number, string][] = [
    [-78, INK],
    [42, INK],
    [162, ORANGE],
  ];
  context.lineWidth = 7 * scale;
  context.lineCap = 'butt';
  for (const [start, colour] of arcs) {
    context.beginPath();
    context.strokeStyle = colour;
    context.arc(x + 32 * scale, y + 32 * scale, 18 * scale, (start * Math.PI) / 180, ((start + 96) * Math.PI) / 180);
    context.stroke();
  }
}

// Draws the whole picture. The canvas is TICKET_WIDTH by TICKET_HEIGHT.
export function drawTicket(context: CanvasRenderingContext2D, picture: TicketPicture): void {
  const centre = TICKET_WIDTH / 2;
  const inner = TICKET_WIDTH - 2 * MARGIN;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, TICKET_WIDTH, TICKET_HEIGHT);

  // The site's lockup, top left.
  drawMark(context, MARGIN, MARGIN, 96);
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.fillStyle = TEXT;
  context.font = font(700, 46);
  context.fillText('MQGrader', MARGIN + 116, MARGIN + 50);
  context.fillStyle = MUTED;
  context.font = font(400, 28);
  context.fillText('by Laura Miron', MARGIN + 116, MARGIN + 88);

  // The test and the student.
  context.textAlign = 'center';
  context.fillStyle = TEXT;
  context.font = font(700, 60);
  let y = 290;
  for (const line of wrapLines((text) => context.measureText(text).width, picture.testTitle, inner, 2)) {
    context.fillText(line, centre, y);
    y += 72;
  }
  context.fillStyle = MUTED;
  context.font = font(400, 34);
  const who = [picture.studentName, picture.classLine].filter((part) => part !== '').join(' · ');
  for (const line of wrapLines((text) => context.measureText(text).width, who, inner, 2)) {
    context.fillText(line, centre, y - 8);
    y += 46;
  }

  // The QR code, lower when there is no code under it.
  const qrTop = picture.code ? 470 : 560;
  context.fillStyle = '#ffffff';
  context.fillRect(centre - QR_SIZE / 2 - QR_EDGE, qrTop - QR_EDGE, QR_SIZE + 2 * QR_EDGE, QR_SIZE + 2 * QR_EDGE);
  context.imageSmoothingEnabled = false;
  context.drawImage(picture.qr, centre - QR_SIZE / 2, qrTop, QR_SIZE, QR_SIZE);

  if (picture.code) {
    context.fillStyle = TINT;
    context.fillRect(MARGIN, 1040, inner, 150);
    context.textAlign = 'left';
    context.fillStyle = MUTED;
    context.font = font(400, 34);
    context.fillText('Codul tău', MARGIN + 40, 1128);
    context.textAlign = 'right';
    context.fillStyle = INK;
    context.font = font(700, 92);
    context.fillText(picture.code, TICKET_WIDTH - MARGIN - 40, 1148);
  }

  context.textAlign = 'center';
  context.fillStyle = MUTED;
  context.font = font(400, 30);
  y = 1250;
  for (const line of wrapLines((text) => context.measureText(text).width, picture.how, inner, 2)) {
    context.fillText(line, centre, y);
    y += 40;
  }
}

// The picture as a PNG file. Waits for the page's font first, so the picture
// has the site's letters; without it the system font is used.
export async function renderTicket(picture: TicketPicture): Promise<Blob> {
  try {
    await document.fonts?.load(font(700, 60));
    await document.fonts?.ready;
  } catch {
    // The picture is drawn with the system font.
  }
  const canvas = document.createElement('canvas');
  canvas.width = TICKET_WIDTH;
  canvas.height = TICKET_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  drawTicket(context, picture);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      // Phones limit canvas memory: free this one at once.
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error('no picture'));
    }, 'image/png');
  });
}

// An iPhone or iPad saves a picture to its gallery from the share sheet
// ("Save Image"); a download there goes to Files, where students do not look.
// An iPad says it is a Mac, but a Mac has no touch screen.
export function savesThroughShare(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

// Gives the picture to the phone: the share sheet on an iPhone or iPad (a
// download when it refuses), a download everywhere else.
export async function saveTicket(blob: Blob, fileName: string, title: string): Promise<ShareResult> {
  if (savesThroughShare()) return shareFile(blob, fileName, title);
  saveFile(blob, fileName);
  return 'downloaded';
}
```

- [ ] **Step 12: Create `src/upload/SaveTicket.tsx`**

```tsx
import { QRCodeCanvas } from 'qrcode.react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { QR_SIZE, renderTicket, saveTicket, savesThroughShare, ticketFileName, type TicketPicture } from './ticketImage.ts';

// How long "Biletul a fost salvat." stays on screen.
const SAVED_MS = 4000;

type SaveState = 'idle' | 'busy' | 'saved' | 'failed';

// One picture at a time on the page: each holds two canvases while it is
// drawn, and a phone limits canvas memory (a shared phone may show many
// tickets). A turn ends when its picture is made or failed.
let line: Promise<void> = Promise.resolve();

function takeTurn(): Promise<() => void> {
  let release: () => void = () => {};
  const done = new Promise<void>((resolve) => (release = resolve));
  const turn = line.then(() => release);
  line = line.then(() => done);
  return turn;
}

// "Salvează biletul": saves the result ticket as a picture, one tap, so it
// lands beside the student's photos. Gives the button and, apart, the note of
// what happened, so each page puts them where its layout wants them.
//
// On an iPhone or iPad the picture is made as soon as the ticket shows (one
// ticket at a time), so a tap saves it with no wait: the share sheet opens
// only right inside the tap, and is refused after the waits of drawing the
// picture. Elsewhere the file downloads, which may wait, so the picture is
// made on the tap. A picture that failed is made again on the next tap. The
// QR code is drawn on a hidden canvas only while a picture is made.
export function useSaveTicket({
  url,
  testCode,
  picture,
  className,
}: {
  // The result link the QR code holds.
  url: string;
  testCode: string;
  picture: Omit<TicketPicture, 'qr'>;
  className: string;
}): { button: ReactNode; note: ReactNode } {
  const qr = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<SaveState>('idle');
  // A picture is being drawn while `round` is ahead of `doneRound`.
  const [round, setRound] = useState(0);
  const [doneRound, setDoneRound] = useState(0);
  const ready = useRef<Blob | null>(null);
  const pending = useRef<Promise<Blob> | null>(null);
  const settle = useRef<{ resolve: (png: Blob) => void; reject: (err: unknown) => void } | null>(null);
  const release = useRef<(() => void) | null>(null);
  const working = useRef(false);
  const latest = useRef(picture);
  latest.current = picture;

  // Starts drawing the picture; the effect below makes it.
  const startDraw = (): Promise<Blob> => {
    const made = new Promise<Blob>((resolve, reject) => (settle.current = { resolve, reject }));
    made.catch(() => {});
    pending.current = made;
    setRound((value) => value + 1);
    return made;
  };

  useEffect(() => {
    if (!savesThroughShare()) return;
    let current = true;
    void takeTurn().then((done) => {
      if (!current || ready.current || pending.current) {
        done();
        return;
      }
      release.current = done;
      startDraw();
    });
    return () => {
      current = false;
      release.current?.();
      release.current = null;
    };
  }, []);

  useEffect(() => {
    if (round === 0) return;
    const drawn = qr.current;
    const waiting = settle.current;
    if (!drawn || !waiting) return;
    const end = () => {
      if (settle.current === waiting) settle.current = null;
      release.current?.();
      release.current = null;
      setDoneRound(round);
    };
    renderTicket({ ...latest.current, qr: drawn }).then(
      (png) => {
        ready.current = png;
        end();
        waiting.resolve(png);
      },
      (err: unknown) => {
        pending.current = null;
        end();
        waiting.reject(err);
      },
    );
  }, [round]);

  useEffect(() => {
    if (state !== 'saved') return;
    const timer = setTimeout(() => setState('idle'), SAVED_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function save() {
    if (working.current) return;
    working.current = true;
    setState('busy');
    const wanted = latest.current;
    try {
      // With the picture ready, saveTicket runs inside the tap: no wait before it.
      const png = ready.current ?? (await (pending.current ?? startDraw()).catch(() => startDraw()));
      const result = await saveTicket(png, ticketFileName(testCode, wanted.studentName), `${wanted.studentName} · ${wanted.testTitle}`);
      // The student closed the share sheet: nothing was saved, nothing failed.
      setState(result === 'cancelled' ? 'idle' : 'saved');
    } catch {
      setState('failed');
    } finally {
      working.current = false;
    }
  }

  // The QR library draws at the screen's pixel ratio: this size gives a
  // canvas of about QR_SIZE pixels on every screen.
  const qrSize = Math.ceil(QR_SIZE / (window.devicePixelRatio || 1));
  const button = (
    <>
      {round !== doneRound && <QRCodeCanvas ref={qr} value={url} size={qrSize} marginSize={0} level="M" hidden aria-hidden="true" />}
      <button type="button" className={className} disabled={state === 'busy'} onClick={() => void save()}>
        <ActionIcon name={state === 'saved' ? 'check' : 'download'} />
        Salvează biletul
      </button>
    </>
  );
  const note =
    state === 'saved' ? (
      <p role="status" className="hint">
        Biletul a fost salvat. Îl găsești lângă pozele tale sau în descărcări.
      </p>
    ) : state === 'failed' ? (
      <p role="alert" className="alert">
        Nu am putut salva biletul. Fă o poză ecranului.
      </p>
    ) : null;
  return { button, note };
}
```

- [ ] **Step 13: Edit `src/test/setup.ts`**

Find this block:

```ts

afterEach(() => {
```

Replace it with:

```ts

// jsdom has no canvas: getContext gives null, as jsdom's own does, without its
// "Not implemented" line for every QR code and ticket picture. Tests that
// draw spy on it.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}

afterEach(() => {
```

- [ ] **Step 14: Edit `src/upload/ResultTicket.tsx`**

Find this block:

```tsx
import { resultPageUrl } from './resultLinks.ts';
import { shareLink } from './shareLink.ts';
```

Replace it with:

```tsx
import { resultPageUrl } from './resultLinks.ts';
import { useSaveTicket } from './SaveTicket.tsx';
import { shareLink } from './shareLink.ts';
```

- [ ] **Step 15: Edit `src/upload/ResultTicket.tsx`**

Find this block:

```tsx
  const code = resultCode ? formatResultCode(resultCode) : null;

```

Replace it with:

```tsx
  const code = resultCode ? formatResultCode(resultCode) : null;
  const classLine = `${displayClassName(test.className)} · ${test.code}`;
  const save = useSaveTicket({
    url,
    testCode: test.code,
    picture: { testTitle: test.title, studentName, classLine, code, how: code ? TICKET_HOW : TICKET_HOW_NO_CODE },
    className: 'button button-big',
  });

```

- [ ] **Step 16: Edit `src/upload/ResultTicket.tsx`**

Find this block:

```tsx
            <strong>{studentName}</strong>
            <span>
              {displayClassName(test.className)} · {test.code}
            </span>
          </p>
```

Replace it with:

```tsx
            <strong>{studentName}</strong>
            <span>{classLine}</span>
          </p>
```

- [ ] **Step 17: Edit `src/upload/ResultTicket.tsx`**

Find this block:

```tsx
      <div className="ticket-actions">
        <button type="button" className="button-quiet button-big" onClick={() => void send()}>
```

Replace it with:

```tsx
      <div className="ticket-actions">
        {save.button}
        <button type="button" className="button-quiet button-big" onClick={() => void send()}>
```

- [ ] **Step 18: Edit `src/upload/ResultTicket.tsx`**

Find this block:

```tsx
      </div>
      {share === 'copied' && (
```

Replace it with:

```tsx
      </div>
      {save.note}
      {share === 'copied' && (
```

- [ ] **Step 19: Edit `src/upload/ResultActions.tsx`**

Find this block:

```tsx
import type { StudentResultView } from '../../shared/api.ts';
import { renderPdf } from '../admin/pdf/renderPdf.ts';
```

Replace it with:

```tsx
import type { StudentResultView } from '../../shared/api.ts';
import { displayClassName } from '../../shared/classes.ts';
import { formatResultCode } from '../../shared/tests.ts';
import { renderPdf } from '../admin/pdf/renderPdf.ts';
```

- [ ] **Step 20: Edit `src/upload/ResultActions.tsx`**

Find this block:

```tsx
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { shareLink } from './shareLink.ts';
```

Replace it with:

```tsx
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { TICKET_HOW, TICKET_HOW_NO_CODE } from './ResultTicket.tsx';
import { useSaveTicket } from './SaveTicket.tsx';
import { shareLink } from './shareLink.ts';
```

- [ ] **Step 21: Edit `src/upload/ResultActions.tsx`**

Find this block:

```tsx

// The result page's two actions, so a student can pass the result on to a
// parent: "Trimite linkul" opens the phone's share sheet, else copies the
// link, else shows it to copy by hand; "Descarcă PDF" saves the same student
// PDF the teacher gives, once the result is graded.
export function ResultActions({ result, url }: { result: StudentResultView; url: string }) {
```

Replace it with:

```tsx

// The result page's actions, so a student can pass the result on to a parent
// and find it again: "Trimite linkul" opens the phone's share sheet, else
// copies the link, else shows it to copy by hand; "Salvează biletul" saves
// the result ticket as a picture (the QR code of this page and its short
// code); "Descarcă PDF" saves the same student PDF the teacher gives, once
// the result is graded.
export function ResultActions({ result, url }: { result: StudentResultView; url: string }) {
```

- [ ] **Step 22: Edit `src/upload/ResultActions.tsx`**

Find this block:

```tsx
  const pdfInput = studentPdfInputFromResult(result);

```

Replace it with:

```tsx
  const pdfInput = studentPdfInputFromResult(result);
  const code = result.resultCode ? formatResultCode(result.resultCode) : null;
  const save = useSaveTicket({
    url,
    testCode: result.testCode,
    picture: {
      testTitle: result.testTitle,
      studentName: result.studentName,
      classLine: `${displayClassName(result.className)} · ${result.testCode}`,
      code,
      how: code ? TICKET_HOW : TICKET_HOW_NO_CODE,
    },
    className: 'button-quiet button-small',
  });

```

- [ ] **Step 23: Edit `src/upload/ResultActions.tsx`**

Find this block:

```tsx
        </button>
        {pdfInput && (
```

Replace it with:

```tsx
        </button>
        {save.button}
        {pdfInput && (
```

- [ ] **Step 24: Edit `src/upload/ResultActions.tsx`**

Find this block:

```tsx
      )}
      {busy && (
```

Replace it with:

```tsx
      )}
      {save.note}
      {busy && (
```

- [ ] **Step 25: Edit `src/upload/ResultApp.tsx`**

Find this block:

```tsx
import { resultFileUrl, type UploadApi } from './api.ts';
import { forgetResultLinkByToken } from './resultLinks.ts';
import { ResultActions } from './ResultActions.tsx';
```

Replace it with:

```tsx
import { resultFileUrl, type UploadApi } from './api.ts';
import { forgetResultLinkByToken, rememberResultCode } from './resultLinks.ts';
import { ResultActions } from './ResultActions.tsx';
```

- [ ] **Step 26: Edit `src/upload/ResultApp.tsx`**

Find this block:

```tsx
      .then((result) => {
        if (current) setPhase({ kind: 'ready', result });
```

Replace it with:

```tsx
      .then((result) => {
        if (result.resultCode) rememberResultCode(resultToken, result.resultCode);
        if (current) setPhase({ kind: 'ready', result });
```

- [ ] **Step 27: Edit `src/upload/resultLinks.ts`**

Find this block:

```ts

// Drops the kept links whose upload the teacher reset: the student is back in
```

Replace it with:

```ts

// Writes the short code into every kept link of this result token that has
// none: a link kept before links had codes learns it when its result page
// opens, so its ticket shows the code from then on.
export function rememberResultCode(resultToken: string, resultCode: string): void {
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith('qe.result.')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.resultToken !== resultToken || typeof parsed.resultCode === 'string') continue;
        localStorage.setItem(key, JSON.stringify({ ...parsed, resultCode }));
      } catch {
        continue;
      }
    }
  } catch {
    // Blocked storage: the ticket stays without its code.
  }
}

// Drops the kept links whose upload the teacher reset: the student is back in
```

- [ ] **Step 28: Edit `docs/superpowers/specs/2026-11-17-student-result-access-design.md`**

Find this block:

```markdown
- The file is named `bilet-<test code>-<student name folded to ASCII>.png`.
- The picture is made once, as soon as the ticket shows, so the tap saves it with no wait: an iPhone opens its share sheet only inside the tap, and refuses it after the waits of drawing. A tap before the picture is ready waits for it; a picture that failed is made again on the tap.
- Saving: on an iPhone or iPad (an iPad that says it is a Mac has a touch screen), the share sheet opens (it has "Save Image"), and the file downloads when the sheet is not possible; everywhere else the file downloads (`saveFile` of `src/admin/pdf/share.ts`). A failure says "Nu am putut salva biletul. Fă o poză ecranului."
```

Replace it with:

```markdown
- The file is named `bilet-<test code>-<student name folded to ASCII>.png`.
- On an iPhone or iPad the picture is made as soon as the ticket shows, so the tap saves it with no wait: their share sheet opens only inside the tap, and is refused after the waits of drawing. A tap before the picture is ready waits for it; a picture that failed is made again on the tap. Elsewhere the file downloads, which may wait, so the picture is made on the tap.
- A phone limits canvas memory, and a shared phone may show many tickets: the page makes one picture at a time, draws the hidden QR code at about 520 real pixels whatever the screen's pixel ratio, and empties or removes every canvas once its picture is made or failed.
- Saving: on an iPhone or iPad (an iPad that says it is a Mac has a touch screen), the share sheet opens (it has "Save Image"), and the file downloads when the sheet is not possible; everywhere else the file downloads (`saveFile` of `src/admin/pdf/share.ts`). A failure says "Nu am putut salva biletul. Fă o poză ecranului."
```

- [ ] **Step 29: Typecheck and run the whole suite**

Run: `npm run typecheck`, then `npm test`

Expected: no type error; `Test Files  1 failed | 191 passed | 1 skipped (193)`, `Tests  1 failed | 2958 passed | 3 skipped (2962)`; the one failure is the known `src/landing/pages.test.ts` test.

- [ ] **Step 30: Check against the prototype and commit**

```bash
git add src/upload/ticketImage.ts src/upload/ticketImage.test.ts src/upload/SaveTicket.tsx src/upload/SaveTicket.test.tsx src/test/setup.ts src/upload/ResultTicket.tsx src/upload/ResultActions.tsx src/upload/ResultActions.test.tsx src/upload/ResultApp.tsx src/upload/ResultApp.test.tsx src/upload/resultLinks.ts docs/superpowers/specs/2026-11-17-student-result-access-design.md
git diff --cached --stat refs/protora/ra4 -- . ':!docs/superpowers/plans'
git commit -m "Save the result ticket as a picture"
```

The `git diff` line prints nothing.

---

### Task 5: The code field on the closed test page

**Files:**
- Create: `src/upload/CodeEntry.tsx`, `src/upload/CodeEntry.test.tsx`
- Modify: `src/upload/api.ts`, `src/upload/api.test.ts`, `src/test/fakeUploadApi.ts`, `src/upload/resultLinks.ts`, `src/upload/UploadApp.tsx`, `src/upload/UploadApp.test.tsx`, `src/ui/brand.css`

**Interfaces:**
- Consumes: Task 2's `POST /api/u/:token/cod` and `ResultCodeAnswer`; Task 3's `ResultTicket` and `saveResultLink`.
- Produces: `UploadApi.openByCode(token: string, code: string): Promise<ResultCodeAnswer>`; `typedCode(raw: string): string` and `CodeEntry({ api, token, onOpened })` in `src/upload/CodeEntry.tsx`; `UploadApp`'s new prop `goTo?: (url: string) => void` (default `window.location.assign`); `SavedResultLink.byCode?: true`; `saveResultLink(…, resultCode, byCode = false)`; `singleUploadLocked` ignores `byCode` links.

- [ ] **Step 1: Create `src/upload/CodeEntry.test.tsx`**

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeUploadApi, LINK_TOKEN, linkInfo } from '../test/fakeUploadApi.ts';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { typedCode } from './CodeEntry.tsx';
import { loadResultLink, saveResultLink } from './resultLinks.ts';
import { UploadApp } from './UploadApp.tsx';

const published = () => ({ ...linkInfo({ status: 'done', resultsOpen: true }), students: [] });
const closedOnly = () => ({ ...linkInfo({ status: 'evaluating' }), students: [] });
const field = () => screen.getByLabelText('Scrie codul tău');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('typedCode', () => {
  it('shows capitals with a dash after the third character', () => {
    expect(typedCode('k')).toBe('K');
    expect(typedCode('k7m')).toBe('K7M');
    expect(typedCode('k7m9')).toBe('K7M-9');
    expect(typedCode('k7m92p')).toBe('K7M-92P');
    expect(typedCode('K7M-92P')).toBe('K7M-92P');
  });

  it('drops spaces and signs, and what is past six characters', () => {
    expect(typedCode(' k7m - 92p ')).toBe('K7M-92P');
    expect(typedCode('k7m92pxyz')).toBe('K7M-92P');
    expect(typedCode('k7m.')).toBe('K7M');
  });

  it('lets the student delete the dash', () => {
    expect(typedCode('K7M-')).toBe('K7M');
  });

  it('keeps a character the codes do not use, so the student sees it', () => {
    expect(typedCode('o0il1')).toBe('O0I-L1');
  });
});

describe('the code field on the closed test page', () => {
  it('shows the field and where to look, when the results are published and this phone kept no link', async () => {
    const api = createFakeUploadApi(published());
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByText('Rezultatele au fost publicate.')).toBeInTheDocument();
    const entry = screen.getByRole('region', { name: 'Deschide rezultatul cu codul' });
    expect(within(entry).getByLabelText('Scrie codul tău')).toHaveValue('');
    expect(within(entry).getByRole('button', { name: 'Vezi rezultatul' })).toBeEnabled();
    expect(within(entry).getByText('Nu știi codul?')).toBeInTheDocument();
    expect(within(entry).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Caută în poze biletul cu codul QR.',
      'Caută în mesaje linkul pe care ți l-ai trimis.',
      'Deschide testul pe telefonul cu care ai trimis lucrarea.',
      'Dacă nu găsești nimic, cere profesorului codul tău.',
    ]);
    // Nothing went wrong: no error, and no word of the closed uploads.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('opens the result with the right code, and keeps the link on this phone', async () => {
    const api = createFakeUploadApi(published());
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'k7m92p');
    expect(field()).toHaveValue('K7M-92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledWith('/u/rezultat/result-token-11'));
    expect(api.openByCode).toHaveBeenCalledWith(LINK_TOKEN, 'K7M-92P');
    expect(loadResultLink(LINK_TOKEN, 11)).toEqual({
      studentId: 11,
      studentName: 'Pop Ion',
      resultToken: 'result-token-11',
      resultCode: 'K7M92P',
      byCode: true,
    });
    // The page now shows the ticket, for the next visit.
    expect(await screen.findByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' })).toBeInTheDocument();
  });

  it('sends the code with the Enter key too', async () => {
    const api = createFakeUploadApi(published());
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'K7M92P{Enter}');
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledTimes(1));
  });

  it('shows the ticket and opens no page while the results are not published', async () => {
    const api = createFakeUploadApi(closedOnly());
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Încărcarea s-a închis.');
    expect(screen.getByText('Dacă nu ai trimis lucrarea, spune-i profesorului.')).toBeInTheDocument();
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    const ticket = await screen.findByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' });
    expect(within(ticket).getByText('K7M-92P')).toBeInTheDocument();
    expect(goTo).not.toHaveBeenCalled();
    // The field gave way to the ticket.
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
  });

  it('shows the refusal under the field and keeps what was typed', async () => {
    const api = createFakeUploadApi(published());
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'K7M92B');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Codul nu este bun. Verifică fiecare literă și încearcă din nou.');
    expect(field()).toHaveValue('K7M-92B');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAccessibleDescription('Codul nu este bun. Verifică fiecare literă și încearcă din nou.');
    expect(goTo).not.toHaveBeenCalled();
    expect(localStorage.getItem(`qe.result.${LINK_TOKEN}.11`)).toBeNull();
    // Typing again takes the refusal away.
    await userEvent.type(field(), '{Backspace}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectNoGradingWords();
  });

  it('says so when too many wrong codes were typed', async () => {
    const api = createFakeUploadApi(published());
    api.openByCode.mockRejectedValueOnce(new ApiError(429, 'too_many_tries', 'Prea multe încercări. Încearcă din nou peste câteva minute.'));
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={vi.fn()} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Prea multe încercări. Încearcă din nou peste câteva minute.');
  });

  it('asks for a code before it asks the server', async () => {
    const api = createFakeUploadApi(published());
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={vi.fn()} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Scrie codul de pe biletul tău.');
    expect(api.openByCode).not.toHaveBeenCalled();
  });

  it('keeps the field behind "Am alt cod" when this phone has a ticket', async () => {
    const api = createFakeUploadApi(published());
    saveResultLink(LINK_TOKEN, 12, 'result-token-12', 'Stan Eva', 'ABC234');
    const goTo = vi.fn();
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    expect(await screen.findByRole('region', { name: 'Biletul pentru rezultat: Stan Eva' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Am alt cod' }));
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledWith('/u/rezultat/result-token-11'));
    // Both tickets are kept on this phone.
    expect(await screen.findByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Biletul pentru rezultat: Stan Eva' })).toBeInTheDocument();
  });

  it('does not lock the default link of a phone that only opened a result with its code', async () => {
    const api = createFakeUploadApi(published());
    const goTo = vi.fn();
    const first = render(<UploadApp api={api} token={LINK_TOKEN} goTo={goTo} />);
    await screen.findByText('Rezultatele au fost publicate.');
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(goTo).toHaveBeenCalled());
    first.unmount();
    // The teacher opens the uploads again: this phone may still send a paper.
    const reopened = linkInfo();
    reopened.students[1]!.state = 'done';
    render(<UploadApp api={createFakeUploadApi(reopened)} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Ionescu Ana' })).toBeEnabled();
    expect(screen.queryByText(/Ai trimis deja lucrarea de pe acest telefon/)).not.toBeInTheDocument();
    // The ticket is still there, above the names.
    expect(screen.getByRole('region', { name: 'Biletul pentru rezultat: Pop Ion' })).toBeInTheDocument();
  });

  it('keeps a link this phone sent when the same code is typed on it', async () => {
    const api = createFakeUploadApi(published());
    saveResultLink(LINK_TOKEN, 11, 'result-token-11', 'Pop Ion', 'K7M92P');
    render(<UploadApp api={api} token={LINK_TOKEN} goTo={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Am alt cod' }));
    await userEvent.type(field(), 'K7M92P');
    await userEvent.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await vi.waitFor(() => expect(api.openByCode).toHaveBeenCalled());
    await screen.findByRole('button', { name: 'Am alt cod' });
    expect(loadResultLink(LINK_TOKEN, 11)).not.toHaveProperty('byCode');
  });

  it('shows no code field while the uploads are open or the test has not started', async () => {
    const open = render(<UploadApp api={createFakeUploadApi()} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
    open.unmount();
    render(<UploadApp api={createFakeUploadApi({ ...linkInfo({ status: 'draft' }), students: [] })} token={LINK_TOKEN} goTo={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Testul nu a început încă.');
    expect(screen.queryByLabelText('Scrie codul tău')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Edit `src/upload/api.test.ts`**

Find this block:

```ts
    expect(init!.headers).toMatchObject({ 'X-Upload-Session': 'saved-secret', 'Content-Type': 'application/json' });
  });
```

Replace it with:

```ts
    expect(init!.headers).toMatchObject({ 'X-Upload-Session': 'saved-secret', 'Content-Type': 'application/json' });
  });

  it('sends a typed code to the test of the link, with no upload secret', async () => {
    const answer = { resultToken: 'abcdefghijkmnop2abcdefcd', resultCode: 'K7M92P', studentId: 11, studentName: 'Pop Ion' };
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, answer));
    await expect(createUploadClient({ fetchImpl }).openByCode(TOKEN, 'K7M-92P')).resolves.toEqual(answer);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/u/${TOKEN}/cod`);
    expect(init!.method).toBe('POST');
    expect(init!.body).toBe(JSON.stringify({ code: 'K7M-92P' }));
    expect(init!.headers).not.toHaveProperty('X-Upload-Session');
  });
```

- [ ] **Step 3: Edit `src/upload/UploadApp.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByText('Rezultatele au fost publicate.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Linkul cu rezultatul tău este salvat pe telefonul și în browserul cu care ai trimis lucrarea. Dacă nu îl găsești acolo, cere profesorului linkul tău.',
      ),
    ).toBeInTheDocument();
    // Nothing went wrong: no error, and no word of the closed uploads.
```

Replace it with:

```tsx
    expect(await screen.findByText('Rezultatele au fost publicate.')).toBeInTheDocument();
    expect(screen.getByText('Deschide testul pe telefonul cu care ai trimis lucrarea.')).toBeInTheDocument();
    expect(screen.getByText('Dacă nu găsești nimic, cere profesorului codul tău.')).toBeInTheDocument();
    // Nothing went wrong: no error, and no word of the closed uploads.
```

- [ ] **Step 4: Edit `src/upload/UploadApp.test.tsx`**

Find this block:

```tsx
    const first = render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByText(/cere profesorului linkul tău/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vezi rezultatul' })).not.toBeInTheDocument();
```

Replace it with:

```tsx
    const first = render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByText(/cere profesorului codul tău/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vezi rezultatul' })).not.toBeInTheDocument();
```

- [ ] **Step 5: Edit `src/upload/UploadApp.test.tsx`**

Find this block:

```tsx
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByText(/cere profesorului linkul tău/)).toBeInTheDocument();
    expect(api.getLink).toHaveBeenCalledTimes(1);
```

Replace it with:

```tsx
    render(<UploadApp api={api} token={LINK_TOKEN} />);
    expect(await screen.findByText(/cere profesorului codul tău/)).toBeInTheDocument();
    expect(api.getLink).toHaveBeenCalledTimes(1);
```

- [ ] **Step 6: Run the new tests to see them fail**

Run: `npx vitest run src/upload/CodeEntry.test.tsx src/upload/api.test.ts src/upload/UploadApp.test.tsx`

Expected: FAIL. `Test Files  3 failed (3)`, `Tests  3 failed | 37 passed (40)`: `CodeEntry.test.tsx` does not load (`Failed to resolve import "./CodeEntry.tsx"`); `api.test.ts` › "sends a typed code to the test of the link, with no upload secret" fails with `openByCode is not a function`; and in `UploadApp.test.tsx`, "says where the result is when the results are published and this phone kept no link" and "shows no result link kept for another test, or for a link the server no longer knows" fail with `Unable to find an element with the text` (the list of where to look is not there yet).

- [ ] **Step 7: Create `src/upload/CodeEntry.tsx`**

```tsx
import { useId, useRef, useState, type FormEvent } from 'react';
import type { ResultCodeAnswer } from '../../shared/api.ts';
import { RESULT_CODE_LENGTH } from '../../shared/tests.ts';
import { ActionIcon } from '../ui/ActionIcon.tsx';
import { messageOf } from '../ui/ApiError.ts';
import type { UploadApi } from './api.ts';

// The code as the field shows it while the student types: capitals, only
// letters and digits, a dash after the third. What is not in the codes'
// alphabet stays, so the student sees what was typed; the server refuses it.
export function typedCode(raw: string): string {
  const plain = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, RESULT_CODE_LENGTH);
  return plain.length > 3 ? `${plain.slice(0, 3)}-${plain.slice(3)}` : plain;
}

// "Scrie codul tău": the way back to a result for a student whose phone has
// no link (another phone, a cleared browser). The code is the short one on
// the ticket; it works only here, on the test's own page. Under the field,
// where to look for a code that is not at hand.
export function CodeEntry({
  api,
  token,
  onOpened,
}: {
  api: UploadApi;
  token: string;
  // The result link the code opened.
  onOpened: (answer: ResultCodeAnswer) => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A second tap can come before the disabled button is drawn.
  const working = useRef(false);
  const fieldId = useId();
  const errorId = useId();

  async function open(event: FormEvent) {
    event.preventDefault();
    if (working.current) return;
    if (code === '') {
      setError('Scrie codul de pe biletul tău.');
      return;
    }
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      onOpened(await api.openByCode(token, code));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="code-entry" aria-label="Deschide rezultatul cu codul">
      <form className="code-form" onSubmit={(event) => void open(event)} noValidate>
        <label htmlFor={fieldId}>Scrie codul tău</label>
        <input
          id={fieldId}
          type="text"
          className="code-input"
          value={code}
          onChange={(event) => {
            setCode(typedCode(event.target.value));
            setError(null);
          }}
          placeholder="ABC-234"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={RESULT_CODE_LENGTH + 4}
          aria-invalid={error !== null}
          aria-describedby={error !== null ? errorId : undefined}
        />
        <button type="submit" className="button button-big" disabled={busy}>
          <ActionIcon name="eye" />
          Vezi rezultatul
        </button>
        {error !== null && (
          <p id={errorId} className="alert" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="code-where">
        <p>Nu știi codul?</p>
        <ul>
          <li>Caută în poze biletul cu codul QR.</li>
          <li>Caută în mesaje linkul pe care ți l-ai trimis.</li>
          <li>Deschide testul pe telefonul cu care ai trimis lucrarea.</li>
          <li>Dacă nu găsești nimic, cere profesorului codul tău.</li>
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Edit `src/upload/api.ts`**

Find this block:

```ts
import type { ConfirmAnswer, LinkInfo, SessionStart, StudentResultView, SubmissionFile, UploadSession } from '../../shared/api.ts';
import type { CheckoutAnswer, CheckoutInput, PaymentRow } from '../../shared/payments.ts';
```

Replace it with:

```ts
import type {
  ConfirmAnswer,
  LinkInfo,
  ResultCodeAnswer,
  SessionStart,
  StudentResultView,
  SubmissionFile,
  UploadSession,
} from '../../shared/api.ts';
import type { CheckoutAnswer, CheckoutInput, PaymentRow } from '../../shared/payments.ts';
```

- [ ] **Step 9: Edit `src/upload/api.ts`**

Find this block:

```ts
  fileBlob(token: string, secret: string, fileId: number): Promise<Blob>;
  // One student's result page by its secret link.
```

Replace it with:

```ts
  fileBlob(token: string, secret: string, fileId: number): Promise<Blob>;
  // The result link behind a short code, typed on the page of the link's test.
  openByCode(token: string, code: string): Promise<ResultCodeAnswer>;
  // One student's result page by its secret link.
```

- [ ] **Step 10: Edit `src/upload/api.ts`**

Find this block:

```ts
    },
    getResult: async (resultToken) =>
```

Replace it with:

```ts
    },
    openByCode: (token, code) => json<ResultCodeAnswer>('POST', `${base(token)}/cod`, null, { code }),
    getResult: async (resultToken) =>
```

- [ ] **Step 11: Edit `src/test/fakeUploadApi.ts`**

Find this block:

```ts
import { vi } from 'vitest';
import type { LinkInfo, StudentResultView, SubmissionFile } from '../../shared/api.ts';
import type { CheckoutInput, PaymentRow } from '../../shared/payments.ts';
```

Replace it with:

```ts
import { vi } from 'vitest';
import type { LinkInfo, ResultCodeAnswer, StudentResultView, SubmissionFile } from '../../shared/api.ts';
import { normalizeResultCode } from '../../shared/tests.ts';
import type { CheckoutInput, PaymentRow } from '../../shared/payments.ts';
```

- [ ] **Step 12: Edit `src/test/fakeUploadApi.ts`**

Find this block:

```ts
    fileBlob: vi.fn(async (_token: string, _secret: string, _fileId: number) => new Blob(['jpeg'], { type: 'image/jpeg' })),
    getResult: vi.fn(async (_resultToken: string): Promise<StudentResultView> => ({
```

Replace it with:

```ts
    fileBlob: vi.fn(async (_token: string, _secret: string, _fileId: number) => new Blob(['jpeg'], { type: 'image/jpeg' })),
    // The one code the fake knows is Pop Ion's (FAKE_RESULT_CODE), typed any way.
    openByCode: vi.fn(async (_token: string, code: string): Promise<ResultCodeAnswer> => {
      if (normalizeResultCode(code) !== FAKE_RESULT_CODE) {
        throw new ApiError(404, 'unknown_code', 'Codul nu este bun. Verifică fiecare literă și încearcă din nou.');
      }
      return { resultToken: 'result-token-11', resultCode: FAKE_RESULT_CODE, studentId: 11, studentName: 'Pop Ion' };
    }),
    getResult: vi.fn(async (_resultToken: string): Promise<StudentResultView> => ({
```

- [ ] **Step 13: Edit `src/upload/resultLinks.ts`**

Find this block:

```ts
  resultCode: string | null;
}
```

Replace it with:

```ts
  resultCode: string | null;
  // Opened on this phone with its code, not sent from it: such a link never
  // locks the default link (a borrowed phone must still send its own paper).
  byCode?: true;
}
```

- [ ] **Step 14: Edit `src/upload/resultLinks.ts`**

Find this block:

```ts
function readSaved(raw: string, studentId: number): SavedResultLink | null {
  const parsed = JSON.parse(raw) as { resultToken?: unknown; studentName?: unknown; resultCode?: unknown };
  if (typeof parsed.resultToken !== 'string' || parsed.resultToken === '') return null;
```

Replace it with:

```ts
function readSaved(raw: string, studentId: number): SavedResultLink | null {
  const parsed = JSON.parse(raw) as { resultToken?: unknown; studentName?: unknown; resultCode?: unknown; byCode?: unknown };
  if (typeof parsed.resultToken !== 'string' || parsed.resultToken === '') return null;
```

- [ ] **Step 15: Edit `src/upload/resultLinks.ts`**

Find this block:

```ts
    resultCode: typeof parsed.resultCode === 'string' && parsed.resultCode !== '' ? parsed.resultCode : null,
  };
```

Replace it with:

```ts
    resultCode: typeof parsed.resultCode === 'string' && parsed.resultCode !== '' ? parsed.resultCode : null,
    ...(parsed.byCode === true ? { byCode: true as const } : {}),
  };
```

- [ ] **Step 16: Edit `src/upload/resultLinks.ts`**

Find this block:

```ts
  resultCode: string | null = null,
): void {
  try {
    localStorage.setItem(keyOf(uploadToken, studentId), JSON.stringify({ resultToken, studentName, resultCode }));
  } catch {
```

Replace it with:

```ts
  resultCode: string | null = null,
  byCode = false,
): void {
  try {
    const saved = byCode ? { resultToken, studentName, resultCode, byCode: true } : { resultToken, studentName, resultCode };
    localStorage.setItem(keyOf(uploadToken, studentId), JSON.stringify(saved));
  } catch {
```

- [ ] **Step 17: Edit `src/upload/resultLinks.ts`**

Find this block:

```ts
// upload that still counts: at least one kept result link whose student
// already sent (or left the class after sending). Callers first prune the
// stale links, so a reset upload unlocks the phone again.
export function singleUploadLocked(uploadToken: string): boolean {
  return loadResultLinks(uploadToken).length > 0;
}
```

Replace it with:

```ts
// upload that still counts: at least one kept result link whose student
// already sent (or left the class after sending), and that this phone did
// not only open with its code. Callers first prune the
// stale links, so a reset upload unlocks the phone again.
export function singleUploadLocked(uploadToken: string): boolean {
  return loadResultLinks(uploadToken).some((link) => !link.byCode);
}
```

- [ ] **Step 18: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { LinkInfo, LinkStudent } from '../../shared/api.ts';
import { displayClassName } from '../../shared/classes.ts';
```

Replace it with:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { studentResultPath, type LinkInfo, type LinkStudent, type ResultCodeAnswer } from '../../shared/api.ts';
import { displayClassName } from '../../shared/classes.ts';
```

- [ ] **Step 19: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
import type { ActiveSession, UploadApi } from './api.ts';
import { NamePicker } from './NamePicker.tsx';
import {
  loadResultLinks,
```

Replace it with:

```tsx
import type { ActiveSession, UploadApi } from './api.ts';
import { CodeEntry } from './CodeEntry.tsx';
import { NamePicker } from './NamePicker.tsx';
import {
  loadResultLink,
  loadResultLinks,
```

- [ ] **Step 20: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
// so one phone can send for several students in turn.
export function UploadApp({ api, token }: { api: UploadApi; token: string | null }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
```

Replace it with:

```tsx
// so one phone can send for several students in turn.
export function UploadApp({
  api,
  token,
  goTo = (url) => window.location.assign(url),
}: {
  api: UploadApi;
  token: string | null;
  // Opens another page; tests pass a fake.
  goTo?: (url: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
```

- [ ] **Step 21: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
          )}
          {phase.kind === 'closed' && token && <ClosedScreen uploadToken={token} info={phase.info} />}
          {phase.kind === 'names' && token && (
```

Replace it with:

```tsx
          )}
          {phase.kind === 'closed' && token && <ClosedScreen api={api} uploadToken={token} info={phase.info} goTo={goTo} />}
          {phase.kind === 'names' && token && (
```

- [ ] **Step 22: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
// result opens only by its own link, so the page cannot hand it out by name.
function ClosedScreen({ uploadToken, info }: { uploadToken: string; info: LinkInfo }) {
  const [links] = useState<SavedResultLink[]>(() => loadTestResultLinks(uploadToken, info.test.key));
  const kept = links.length > 0 && <Tickets links={links} info={info} />;
  if (!info.test.resultsOpen) {
```

Replace it with:

```tsx
// result opens only by its own link, so the page cannot hand it out by name.
// A student whose phone has no link (another phone, a cleared browser) types
// the short code of the ticket: the page then keeps the link on this phone
// too, and opens the result when the results are published.
function ClosedScreen({
  api,
  uploadToken,
  info,
  goTo,
}: {
  api: UploadApi;
  uploadToken: string;
  info: LinkInfo;
  goTo: (url: string) => void;
}) {
  const [links, setLinks] = useState<SavedResultLink[]>(() => loadTestResultLinks(uploadToken, info.test.key));
  // With a kept link the field waits behind "Am alt cod" (a shared phone).
  const [otherCode, setOtherCode] = useState(false);
  const opened = (answer: ResultCodeAnswer) => {
    // A link this phone already keeps (it sent that paper) stays as it is.
    if (loadResultLink(uploadToken, answer.studentId)?.resultToken !== answer.resultToken) {
      saveResultLink(uploadToken, answer.studentId, answer.resultToken, answer.studentName, answer.resultCode, true);
    }
    setLinks(loadTestResultLinks(uploadToken, info.test.key));
    setOtherCode(false);
    if (info.test.resultsOpen) goTo(studentResultPath(answer.resultToken));
  };
  const kept = links.length > 0 && <Tickets links={links} info={info} />;
  const entry =
    links.length === 0 || otherCode ? (
      <CodeEntry api={api} token={uploadToken} onOpened={opened} />
    ) : (
      <p className="other-code">
        <button type="button" className="link-button" onClick={() => setOtherCode(true)}>
          Am alt cod
        </button>
      </p>
    );
  if (!info.test.resultsOpen) {
```

- [ ] **Step 23: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
        </p>
        {kept}
        <p className="hint">Dacă nu ai trimis lucrarea, spune-i profesorului.</p>
      </>
```

Replace it with:

```tsx
        </p>
        <p className="hint">Dacă nu ai trimis lucrarea, spune-i profesorului.</p>
        {kept}
        {entry}
      </>
```

- [ ] **Step 24: Edit `src/upload/UploadApp.tsx`**

Find this block:

```tsx
      <p className="notice-ok">Rezultatele au fost publicate.</p>
      {kept || (
        <p className="hint">
          Linkul cu rezultatul tău este salvat pe telefonul și în browserul cu care ai trimis lucrarea. Dacă nu îl găsești acolo, cere profesorului linkul tău.
        </p>
      )}
    </>
```

Replace it with:

```tsx
      <p className="notice-ok">Rezultatele au fost publicate.</p>
      {kept}
      {entry}
    </>
```

- [ ] **Step 25: Edit `src/ui/brand.css`**

Find this block:

```css

/* The whole result link, as text that wraps: students keep it as a
```

Replace it with:

```css

/* "Scrie codul tău": the short code of the ticket, typed on the test's page
   by a student whose phone has no link. One large field, then where to look
   for a code that is not at hand. */
.code-entry {
  max-width: 24rem;
  margin-top: 1rem;
}

.code-form {
  display: grid;
  gap: 0.625rem;
  padding: 1rem;
  border: 1.5px solid var(--rule);
  border-radius: 0.875rem;
  background: var(--sheet);
}

.code-form label {
  font-size: 1.0625rem;
}

.code-form input.code-input {
  width: 100%;
  min-height: 3.75rem;
  padding-inline: 1rem;
  border-width: 2px;
  font-size: 1.875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.code-form input.code-input::placeholder {
  color: var(--control);
  font-weight: 400;
}

.code-form input.code-input[aria-invalid="true"] {
  border-color: var(--error-fg);
}

.code-form .alert {
  margin: 0;
}

.code-where {
  margin-top: 1.125rem;
}

.code-where p {
  margin: 0;
  font-weight: 600;
}

.code-where ul {
  margin: 0.375rem 0 0;
  padding-left: 1.25rem;
  color: var(--muted);
  font-size: 0.9375rem;
}

.code-where li {
  margin-top: 0.25rem;
}

.other-code {
  margin: 1rem 0 0;
}

.other-code .link-button {
  min-height: 2.75rem;
}

/* The whole result link, as text that wraps: students keep it as a
```

- [ ] **Step 26: Typecheck and run the whole suite**

Run: `npm run typecheck`, then `npm test`

Expected: no type error; `Test Files  1 failed | 192 passed | 1 skipped (194)`, `Tests  1 failed | 2974 passed | 3 skipped (2978)`; the one failure is the known `src/landing/pages.test.ts` test.

- [ ] **Step 27: Check against the prototype and commit**

```bash
git add src/upload/CodeEntry.tsx src/upload/CodeEntry.test.tsx src/upload/api.ts src/upload/api.test.ts src/test/fakeUploadApi.ts src/upload/resultLinks.ts src/upload/UploadApp.tsx src/upload/UploadApp.test.tsx src/ui/brand.css
git diff --cached --stat refs/protora/ra5 -- . ':!docs/superpowers/plans'
git commit -m "Open a lost result with its code on the test's page"
```

The `git diff` line prints nothing.

---

### Task 6: The codes for the teacher, and the notes

**Files:**
- Modify: `src/admin/testPage/ResultLinksTable.tsx`, `src/admin/testPage/ResultsAccess.tsx`, `src/admin/testPage/ResultsPanel.test.tsx`, `src/ui/brand.css`, `src/AGENTS.md`, `server/AGENTS.md`

**Interfaces:**
- Consumes: Task 1's `UploadRow.resultCode` and `formatResultCode`.

- [ ] **Step 1: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx

  it('makes the link of an older paper first, then copies it', async () => {
```

Replace it with:

```tsx

  it("shows each paper's short code beside its link, and none for a paper without one", async () => {
    const rows = graded().map((upload) =>
      upload.studentId === 10 ? { ...upload, resultToken: 'result-token-5', resultCode: 'K7M92P' } : upload,
    );
    renderAdmin(PAGE, apiWith({ status: 'done' }, rows));
    const pop = await screen.findByRole('row', { name: /^Pop Ion/ });
    // "Codul" is for screen readers only.
    expect(within(pop).getByText('K7M-92P')).toHaveTextContent('Codul K7M-92P');
    expect(within(pop).getByText('Codul')).toHaveClass('sr-only');
    expect(within(row('Stan Eva')).queryByText(/^[2-9A-Z]{3}-[2-9A-Z]{3}$/)).not.toBeInTheDocument();
    // A student who sent nothing has neither.
    expect(within(row('Marin Dan')).getByText('Nu a trimis lucrarea.')).toBeInTheDocument();
  });

  it('makes the link of an older paper first, then copies it', async () => {
```

- [ ] **Step 2: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
    expect(within(ways[1]!).getByText('Codul QR de pe test, de pe telefonul cu care au trimis.')).toBeInTheDocument();
    // The test's link gives a result only on the phone that sent the paper.
    expect(
      within(ways[1]!).getByText('Pe alt telefon sau în alt browser, linkul testului nu arată rezultatul: trimite-i elevului linkul lui, din tabelul „Elevii”.'),
    ).toBeInTheDocument();
```

Replace it with:

```tsx
    expect(within(ways[1]!).getByText('Codul QR de pe test, de pe telefonul cu care au trimis.')).toBeInTheDocument();
    // On another phone the student types the code of the ticket.
    expect(
      within(ways[1]!).getByText('Pe alt telefon, elevul scrie codul de pe biletul lui. Codul fiecărui elev este și în tabelul „Elevii”.'),
    ).toBeInTheDocument();
```

- [ ] **Step 3: Run the new tests to see them fail**

Run: `npx vitest run src/admin/testPage/ResultsPanel.test.tsx`

Expected: FAIL. `Test Files  1 failed (1)`, `Tests  2 failed | 32 passed (34)`: "shows each paper's short code beside its link, and none for a paper without one" (`Unable to find an element with the text: K7M-92P`) and "names the two ways once published, …" (`Unable to find an element with the text: Pe alt telefon, elevul scrie codul…`) fail. The other tests of the file pass.

- [ ] **Step 4: Edit `src/admin/testPage/ResultLinksTable.tsx`**

Find this block:

```tsx
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel } from '../../ui/format.ts';
```

Replace it with:

```tsx
import { formatPoints } from '../../../shared/scoring.ts';
import { formatResultCode } from '../../../shared/tests.ts';
import { countLabel } from '../../ui/format.ts';
```

- [ ] **Step 5: Edit `src/admin/testPage/ResultLinksTable.tsx`**

Find this block:

```tsx
        {hasLink(row) ? (
          <CopyResultLink
            key={row.submissionId}
            submissionId={row.submissionId}
            startedAt={row.startedAt}
            resultToken={row.resultToken}
            studentName={row.studentName}
            named
          />
        ) : (
```

Replace it with:

```tsx
        {hasLink(row) ? (
          <span className="result-link-with-code">
            {/* The short code the student types on the test's page; the
                teacher can read it out to a student who lost the link. */}
            {row.resultCode !== null && (
              <span className="result-code">
                <span className="sr-only">Codul </span>
                {formatResultCode(row.resultCode)}
              </span>
            )}
            <CopyResultLink
              key={row.submissionId}
              submissionId={row.submissionId}
              startedAt={row.startedAt}
              resultToken={row.resultToken}
              studentName={row.studentName}
              named
            />
          </span>
        ) : (
```

- [ ] **Step 6: Edit `src/admin/testPage/ResultsAccess.tsx`**

Find this block:

```tsx
          <p className="hint">Codul QR de pe test, de pe telefonul cu care au trimis.</p>
          {/* A result opens only by its own link, which that phone kept. */}
          <p className="hint">Pe alt telefon sau în alt browser, linkul testului nu arată rezultatul: trimite-i elevului linkul lui, din tabelul „Elevii”.</p>
          {test.uploadToken !== null && <StudentLink code={test.code} token={test.uploadToken} />}
```

Replace it with:

```tsx
          <p className="hint">Codul QR de pe test, de pe telefonul cu care au trimis.</p>
          {/* A result opens only by its own link: the phone that sent kept
              it, and any other phone opens it with the link's short code. */}
          <p className="hint">Pe alt telefon, elevul scrie codul de pe biletul lui. Codul fiecărui elev este și în tabelul „Elevii”.</p>
          {test.uploadToken !== null && <StudentLink code={test.code} token={test.uploadToken} />}
```

- [ ] **Step 7: Edit `src/ui/brand.css`**

Find this block:

```css

/* The files strip while the files are hidden: same look as the link strip.
```

Replace it with:

```css

/* The short code of a result link, beside "Copiază linkul" in Rezultate. */
.result-link-with-code {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
}

.result-code {
  font-weight: 600;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* The files strip while the files are hidden: same look as the link strip.
```

- [ ] **Step 8: Edit `src/AGENTS.md`**

Find this block:

```markdown
- Light is the default theme on every page: `public/theme.js` and `currentTheme()` follow only a saved choice, never the system setting.
- `upload/`: the student app. A kept result link (`ResultLinkBox`) shows its whole address as text that wraps, never in a field that cuts it off: students keep it as a screenshot. The kept result links are stored per link token, and a test has two links (the default one, and the one for many uploads), so the phone also remembers which test each link names (`qe.link.<token>` holds `LinkInfo.test.key`; `resultLinks.ts`). Once the uploads closed, the page (`ClosedScreen` in `UploadApp.tsx`) shows the links kept through either link of the test (`loadTestResultLinks`; a link kept before the phone remembered tests is asked for once, `learnOtherLinks`), and has three states: results not published, "Încărcarea s-a închis."; published with a kept link, "Rezultatele au fost publicate." and the link, with no alert; published with none, that line and where the result is (the phone and browser that sent the paper, else the teacher has the student's link). A result never opens from the test's link by picking a name. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone). `StudentResult.tsx` takes `fileUrl`, so a Quick Try's page shows the same student result. `StudentHeader.tsx` is the header of both student pages (the site's lockup linking to mqgrader.ro, "Despre", the theme button). `ResultActions.tsx`: "Trimite linkul" (share sheet, else copy, else the link as text) and "Descarcă PDF" (the teacher's student PDF, from `studentPdfInputFromResult`; pdfmake stays a lazy import).
- `try/`: a Quick Try's page (`/try/<token>`, spec `docs/superpowers/specs/2026-11-09-quick-try-design.md` §3.3). It reuses the teacher app through `createApiClient({ base: '/api/try/<token>' })`: the calls and the file links (`AdminApi.base`) go to the try's link, and only the calls of the server's allow-list are used (`TRY_ADMIN_CALLS` in `test/fakeTryApi.tsx`, whose `tryAdminApi()` makes a page test fail on any other call). `api.ts` is the try's own client (`info`, the student's pages, `start`, the student `result`). `phase.ts` says where the try stands from its test (`prepare`, `grading`, `problem`, `failed` as the server's give-back, `graded`), reads it again every 10 s while the robot works, and gives the graded paper's grade (`scoreOf`, also used by the landing card). `TryHead.tsx` is the head of every state: the name with its rename, the times, the subject ("Materia: …", read only: a try has no "Schimbă"), the test and barem to download, "Distribuie". `Prepare.tsx` holds the test, the barem (her own, or the robot's to download, then "Pornește corectarea" with its `filesVersion`), the student's pages and the file changes left; `Working.tsx` the grading, the barem's problem ("Folosește oricum" or another barem) and the failure (no retry); `Graded.tsx` the grade and the points to check, then the two views under tabs that stay at the top (`try-tabs`, the page's own; `try.css` keeps the scrollbar's room so views of any height start at the same place): "Verificare" (the points to check, each opening the teacher app's own paper page (`TryPaperPage`) at `/teste/<code>/verificare?lucrare=&punct=` inside the try's router, with only the points to check by default (`vedere=toate` shows all), and without the students, the path, the head's actions, the result link and "Reîncearcă", whose routes the try's allow-list does not have; its links to `/teste/<code>` come back to the try, `#rezultate` opens the student's result, and the app's address of the paper, `/teste/<code>/elevi/<id>`, opens the page with every exercise; under the points, "Toate exercițiile" opens that view too, also when no point is left; there is no teacher's result of its own: the paper page holds it) and "Rezultatul elevului" (`StudentResult`, checked with `expectNoGradingWords()`). `ui/FilesBeside.tsx` is the paper's files strip that opens them left of the result, on the try's student result and on the student's result; `try.css` gives the try's top bar the shell's `--bar` and `--top`, and `--top` on `.try-panel` sticks the shown files under the tabs. "Distribuie" (`Share.tsx`) shares or copies the try's link. The page never shows the test's upload link or a QR code.
```

Replace it with:

```markdown
- Light is the default theme on every page: `public/theme.js` and `currentTheme()` follow only a saved choice, never the system setting.
- `upload/`: the student app. A kept result link is a ticket (`ResultTicket.tsx`, spec `docs/superpowers/specs/2026-11-17-student-result-access-design.md`): the test, the student, the QR code of the result link (dark on white in both themes) and its short code (`formatResultCode`), because students keep it as a screenshot; then "Salvează biletul" (`SaveTicket.tsx`: the same ticket as a 1080×1350 PNG drawn on a canvas, `ticketImage.ts`; on an iPhone or iPad it is made as soon as the ticket shows, one ticket at a time, so the tap opens the share sheet with no wait (it opens only inside the tap); elsewhere it is made on the tap and downloads; the hidden QR canvas is about `QR_SIZE` real pixels and every canvas is freed after use, because phones limit canvas memory), "Trimite-mi linkul" (`shareLink.ts`: the share sheet with the code, else copy, else the link as text) and "Arată linkul întreg" (the whole address as text that wraps, never in a field that cuts it off). The phone keeps each link's code beside it; a link kept before codes existed shows its ticket without the code row until its result page opens (`rememberResultCode`). The kept result links are stored per link token, and a test has two links (the default one, and the one for many uploads), so the phone also remembers which test each link names (`qe.link.<token>` holds `LinkInfo.test.key`; `resultLinks.ts`). Once the uploads closed, the page (`ClosedScreen` in `UploadApp.tsx`) shows the links kept through either link of the test (`loadTestResultLinks`; a link kept before the phone remembered tests is asked for once, `learnOtherLinks`), and has three states: results not published, "Încărcarea s-a închis."; published with a kept link, "Rezultatele au fost publicate." and the tickets, with no alert; published with none, that line. With no kept link the page shows "Scrie codul tău" (`CodeEntry.tsx`, `POST /api/u/<token>/cod`) and where to look for a lost code; with one, the field waits behind "Am alt cod". A good code keeps the link on this phone, marked `byCode` (such a link never locks the default link: a borrowed phone still sends its own paper), and, once the results are published, opens the result page (`goTo`). A result never opens from the test's link by picking a name. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone). `StudentResult.tsx` takes `fileUrl`, so a Quick Try's page shows the same student result. `StudentHeader.tsx` is the header of both student pages (the site's lockup linking to mqgrader.ro, "Despre", the theme button). `ResultActions.tsx`: "Trimite linkul" (share sheet, else copy, else the link as text) and "Descarcă PDF" (the teacher's student PDF, from `studentPdfInputFromResult`; pdfmake stays a lazy import).
- `try/`: a Quick Try's page (`/try/<token>`, spec `docs/superpowers/specs/2026-11-09-quick-try-design.md` §3.3). It reuses the teacher app through `createApiClient({ base: '/api/try/<token>' })`: the calls and the file links (`AdminApi.base`) go to the try's link, and only the calls of the server's allow-list are used (`TRY_ADMIN_CALLS` in `test/fakeTryApi.tsx`, whose `tryAdminApi()` makes a page test fail on any other call). `api.ts` is the try's own client (`info`, the student's pages, `start`, the student `result`). `phase.ts` says where the try stands from its test (`prepare`, `grading`, `problem`, `failed` as the server's give-back, `graded`), reads it again every 10 s while the robot works, and gives the graded paper's grade (`scoreOf`, also used by the landing card). `TryHead.tsx` is the head of every state: the name with its rename, the times, the subject ("Materia: …", read only: a try has no "Schimbă"), the test and barem to download, "Distribuie". `Prepare.tsx` holds the test, the barem (her own, or the robot's to download, then "Pornește corectarea" with its `filesVersion`), the student's pages and the file changes left; `Working.tsx` the grading, the barem's problem ("Folosește oricum" or another barem) and the failure (no retry); `Graded.tsx` the grade and the points to check, then the two views under tabs that stay at the top (`try-tabs`, the page's own; `try.css` keeps the scrollbar's room so views of any height start at the same place): "Verificare" (the points to check, each opening the teacher app's own paper page (`TryPaperPage`) at `/teste/<code>/verificare?lucrare=&punct=` inside the try's router, with only the points to check by default (`vedere=toate` shows all), and without the students, the path, the head's actions, the result link and "Reîncearcă", whose routes the try's allow-list does not have; its links to `/teste/<code>` come back to the try, `#rezultate` opens the student's result, and the app's address of the paper, `/teste/<code>/elevi/<id>`, opens the page with every exercise; under the points, "Toate exercițiile" opens that view too, also when no point is left; there is no teacher's result of its own: the paper page holds it) and "Rezultatul elevului" (`StudentResult`, checked with `expectNoGradingWords()`). `ui/FilesBeside.tsx` is the paper's files strip that opens them left of the result, on the try's student result and on the student's result; `try.css` gives the try's top bar the shell's `--bar` and `--top`, and `--top` on `.try-panel` sticks the shown files under the tabs. "Distribuie" (`Share.tsx`) shares or copies the try's link. The page never shows the test's upload link or a QR code.
```

- [ ] **Step 9: Edit `server/AGENTS.md`**

Find this block:

```markdown
- Student calls are scoped by the test of the link's token, and an upload by the hash of the phone's secret (`X-Upload-Session`) within that test. Only hashes of secrets are stored.
- Each student write checks its own rules inside its SQL statement (`db/links.ts`: the test is open and its scheduled time has not come, the upload is not sent yet, at most 20 files; confirm is one `db.batch()`). Never turn these into a check before the write: two requests at once would get past it. Starting an upload still checks the open test in its route (`routes/upload.ts`), before `createSubmission` inserts (see `docs/superpowers/plans/plan-3a-followups.md`); the insert itself checks that the student is active in the test's class.
```

Replace it with:

```markdown
- Student calls are scoped by the test of the link's token, and an upload by the hash of the phone's secret (`X-Upload-Session`) within that test. Only hashes of secrets are stored.
- Result codes (migration 0034): each result link has a six-character code (`submissions.result_code`, from `RESULT_CODE_ALPHABET` of `shared/tests.ts`), unique inside its test. The database makes it in a trigger whenever a paper gets its `result_token` (the INSERT of `createSubmission` and the lazy UPDATEs of `confirmResultToken` and `teacherResultToken`), so no path can make a link without its code; a clash fails the statement on the unique index and the caller tries again, as for the token. `POST /api/u/:token/cod` (`openResultByCode`) gives the link of a code typed on either link of its own test (never a draft), published or not; wrong codes are counted per test in `result_code_tries`, at most `RESULT_CODE_TRIES` in `RESULT_CODE_WINDOW_MINUTES`, checked in the try's own upsert, and a right code gives its try back. A text that is not a code costs a try too.
- Each student write checks its own rules inside its SQL statement (`db/links.ts`: the test is open and its scheduled time has not come, the upload is not sent yet, at most 20 files; confirm is one `db.batch()`). Never turn these into a check before the write: two requests at once would get past it. Starting an upload still checks the open test in its route (`routes/upload.ts`), before `createSubmission` inserts (see `docs/superpowers/plans/plan-3a-followups.md`); the insert itself checks that the student is active in the test's class.
```

- [ ] **Step 10: Typecheck and run the whole suite**

Run: `npm run typecheck`, then `npm test`

Expected: no type error; `Test Files  1 failed | 192 passed | 1 skipped (194)`, `Tests  1 failed | 2975 passed | 3 skipped (2979)` (the same with `TZ=UTC`); the one failure is the known `src/landing/pages.test.ts` test.

- [ ] **Step 11: Check against the prototype and commit**

```bash
git add src/admin/testPage/ResultLinksTable.tsx src/admin/testPage/ResultsAccess.tsx src/admin/testPage/ResultsPanel.test.tsx src/ui/brand.css src/AGENTS.md server/AGENTS.md
git diff --cached --stat refs/protora/ra6 -- . ':!docs/superpowers/plans'
git commit -m "Show each result code to the teacher, and document the codes"
```

The `git diff` line prints nothing.

---

## After Task 6

- Run migration 0034 on the live database before the branch reaches `main`: `npx wrangler d1 migrations apply quickeval --remote`, from this worktree (`docs/deploy.md`).
- Do the checks on real phones listed above, on a test environment, before the merge.
