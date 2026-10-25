# The Test With a QR Code, Ready to Print: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a test starts, the robot makes a PDF of the teacher's test (converted from Word when needed) with the student upload QR code in the bottom-right corner of every page, and the test page offers it for download.

**Architecture:** A print job is an open test with a test file and no print PDF (`NEEDS_PRINT`, migration 0014). The API starts the robot when a print job appears; the robot reads the job through narrow robot routes, runs LibreOffice and a Python stamp script inside a pinned Docker image (`runner/print/`), and uploads the PDF, which the API keeps in R2. The teacher page shows the state and the download link.

**Tech Stack:** Hono on Cloudflare Pages Functions, D1, R2, React + TanStack Query, Vitest; robot in Node 24 (no new npm package); Docker image `ubuntu:24.04` with LibreOffice 26.2.6.3 (The Document Foundation archive), Python 3, PyMuPDF, segno.

**Spec:** `docs/superpowers/specs/2026-10-25-qr-print-test-design.md` (the design; read it first). Project spec: `docs/superpowers/specs/2026-10-06-quickeval-design.md`. Spike files: `.superpowers/qr-print-spike/` (untracked; `stamp.py`, `Dockerfile.tdf`, `decode.py`, `run11.sh`).

## Global Constraints

- All user-facing text is Romanian; the API reports errors as `{ error, message }`.
- Every teacher query is scoped by the teacher's id; codes go through `parseTestCode`, ids through `parseId`.
- Robot writes check their rules inside their SQL statement (lease, `NEEDS_PRINT`, `files_version`), never in a check before the write.
- R2 keys come from rows, never from listing R2.
- Functions: at most 10 ms CPU and 15 D1 queries per request.
- `run.ts` loads only zod; `check.ts` loads no package. The PDF work runs in the container, never in Node.
- Robot logs carry ids, counts, durations, and error categories only: never the upload token, the link, a file name, or a script's output.
- Relative imports name the `.ts`/`.tsx` file; `erasableSyntaxOnly` (no enums, namespaces, parameter properties).
- Code comments name no ticket or issue numbers. Commits have no AI attribution lines.
- Migration `0014` runs on the live D1 before the code reaches `main`. Migration files: one statement per `;` at a line end, no `;` inside strings.
- LibreOffice is pinned: `LibreOffice_26.2.6.3_Linux_x86-64_deb.tar.gz` from `https://downloadarchive.documentfoundation.org/libreoffice/old/26.2.6.3/deb/x86_64/`, SHA-256 `fd0e8f8f2408dd2e5b90286e60f3f97cf566ba441cd48cfc5bcc68067303e0bc`.
- The image has no fonts beyond LibreOffice's own and `fonts-liberation`, `fonts-crosextra-carlito`, `fonts-crosextra-caladea` (Noto or DejaVu packages turn "∖" into "∣").
- The PDF carries no word about a robot, AI, or grading: only the QR code and the short link.

## Review Focus

1. **A test file replaced while the robot works on its print job.** Expect: the old PDF is refused (409 `not_needed`), the robot drops it, and a new job makes the PDF of the new file. Test in Task 3 (`refuses a print made from an older files_version`).
2. **A test file re-uploaded under the same name.** Expect: the new print PDF gets a new R2 key (the key carries `files_version`), and the old one is deleted, never the new one. Test in Task 2 (`a new test file with the same name keeps no old print`).
3. **The upload token in a robot log.** Expect: no log line has the token or the link, also when a script fails (execFile's error message holds the command line). Test in Task 5 (`never logs the token, the link, or a script message`).
4. **An open test that has a print job, in an existing robot or check test.** Expect: existing tests that expect `hasWork: false` with an open test that has a test file still pass, because they are updated on purpose, not by accident. Task 3 lists them.
5. **A page where content fills the bottom strip** (a footer, a full-page table). Expect: the page shrinks, nothing is covered. Test in Task 4 (`shrinks a page whose bottom strip has text`).

---

### Task 1: Data, shared types, and the spec

**Files:**
- Create: `migrations/0014_print.sql`
- Modify: `shared/files.ts`, `shared/files.test.ts`, `shared/api.ts`, `shared/runner.ts`, `server/db/tests.ts`, `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Test: `shared/files.test.ts`, `server/routes/tests.test.ts`

**Interfaces:**
- Produces:
  - `printFileKey(teacherId: number, schoolYear: number, code: string, testFileName: string, filesVersion: number): string` → `t/1/2026/6E2-26T1/print/test-final-v3-qr.pdf` (slug of the test file name without extension, then `-v<filesVersion>-qr.pdf`).
  - `shared/api.ts`: `export type PrintStatus = 'none' | 'ready' | 'failed'`; `TestInfo.print: { status: PrintStatus; fromWord: boolean }`; `StartedTest.robot: RobotStart | null`; `export interface ReopenAnswer { status: TestStatus; robot: RobotStart | null }`; `export interface PrintRetryAnswer { print: { status: PrintStatus; fromWord: boolean }; robot: RobotStart }`.
  - `shared/runner.ts`: `CheckResult.prints: number`; `TasksResult.prints: number[]`; `RunSummary.prints` (`z.number().int().min(0).default(0)`, so an older robot's summary still parses); `export interface PrintJob { testId: number; filesVersion: number; contentType: string; uploadToken: string }`; `export const printFailedBody = z.object({ runId: runIdSchema, filesVersion: z.number().int().min(0), error: robotErrorSchema })`.
  - `server/db/tests.ts`: `TestRecord.print: { status: PrintStatus; key: string | null; fromWord: boolean }`; `toTestInfo` maps it to `{ status, fromWord }`; `fromWord` is `test_file_type = DOCX_TYPE`.

- [ ] **Step 1: Write the migration** `migrations/0014_print.sql`: three `ALTER TABLE tests ADD COLUMN` statements: `print_status TEXT NOT NULL DEFAULT 'none' CHECK (print_status IN ('none', 'ready', 'failed'))`, `print_file_key TEXT`, `print_attempts INTEGER NOT NULL DEFAULT 0`, with a header comment in the style of `0004_files_version.sql`.

- [ ] **Step 2: Write the failing tests**

```ts
// shared/files.test.ts
it('names the print PDF after the test file and its files version', () => {
  expect(printFileKey(1, 2026, '6E2-26T1', 'Test final.docx', 3)).toBe('t/1/2026/6E2-26T1/print/test-final-v3-qr.pdf');
  expect(printFileKey(1, 2026, '6E2-26T1', 'Test final.pdf', 4)).toBe('t/1/2026/6E2-26T1/print/test-final-v4-qr.pdf');
});

// server/routes/tests.test.ts
it('shows the print state of a test', async () => {
  // a draft test with a Word test file (UPDATE test_file_type to DOCX_TYPE)
  expect(res.body.test.print).toEqual({ status: 'none', fromWord: true });
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run shared/files.test.ts server/routes/tests.test.ts`
Expected: FAIL (`printFileKey` is not a function; `print` undefined).

- [ ] **Step 4: Implement** the key in `shared/files.ts` (next to `testFileKey`, reusing `slugify` and `withoutExtension`), the types above, and the three columns in `SELECT_TEST`, `TestRow`, `toRecord`, `toTestInfo`. Add `prints` to `RunSummary` in `shared/runner.ts` with the default.

- [ ] **Step 5: Edit the project spec**: §7.1 (the three columns), §7.2 (the `print/` folder), §8.2 (Start test starts the robot when a print job appears), §11.1 (the two teacher routes of Task 2), §11.3 (the four robot routes of Task 3), §12 (print jobs first in a run; the container). One or two sentences each, pointing to the design document.

- [ ] **Step 6: Run the whole suite and the types**

Run: `npm run typecheck && npm test`
Expected: PASS. Fix every existing test that compares a whole `TestInfo`, `CheckResult`, `TasksResult`, or `RunSummary` with `toEqual` by adding the new field (`src/test/fakeApi.ts` test fixtures get `print: { status: 'none', fromWord: false }`).

- [ ] **Step 7: Commit** `git add -A migrations shared server src docs && git commit -m "Add the print PDF columns, key, and types"`

---

### Task 2: Teacher API: start, reopen, new test file, download, retry, delete

**Files:**
- Modify: `server/db/tests.ts`, `server/routes/tests.ts`, `server/db/runner.ts` (export `NEEDS_PRINT` only; the robot queries are Task 3)
- Test: create `server/routes/print.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `printFileKey`.
- Produces:
  - `server/db/runner.ts`: `export const NEEDS_PRINT = "t.status = 'open' AND t.upload_token IS NOT NULL AND t.test_file_key IS NOT NULL AND t.print_status = 'none'"`.
  - `server/db/tests.ts`: `saveTestFile` (kind `'test'`) also sets `print_status = 'none', print_attempts = 0, print_file_key = NULL`; its return type stays `TestStatus | null` (the route takes the old print key from the `TestRecord` it already read). `needsPrint(db, testId): Promise<boolean>` (one `SELECT` with `NEEDS_PRINT`). `retryPrint(db, teacherId, testId, now): Promise<boolean>` (`UPDATE … SET print_status = 'none', print_attempts = 0 WHERE id = ? AND teacher_id = ? AND status = 'open' AND print_status = 'failed'`). `listTestKeys` adds `record.print.key`.
  - Routes:
    - `POST /:code/start` answers `{ status, uploadToken, startedAt, robot }`: `robot = await needsPrint(...) ? await startRobot(c.env) : null`.
    - `POST /:code/reopen` answers `ReopenAnswer` the same way.
    - `PUT /:code/files/test` deletes the old print object quietly (`test.print.key`, when set) after the row write, and sets `robot` when `needsPrint` (a barem keeps today's rule).
    - `GET /:code/print`: 404 `not_found` unless `print.status === 'ready'` and the object exists; `fileResponse(object, `${code}-cu-cod-qr.pdf`, PDF_TYPE)`.
    - `POST /:code/print/retry`: `retryPrint`, else 409 `not_failed` „Testul cu cod QR nu a eșuat.”; answers `PrintRetryAnswer` with `robot = await startRobot(c.env)`.

- [ ] **Step 1: Write the failing tests** in `server/routes/print.test.ts` (use `startTestApi({ app: { dispatchRobot } })` with a `vi.fn` that resolves, as in `evaluation.test.ts`):

```ts
it('starts the robot when a started test has a test file', /* addTestFiles(['test']) before start: dispatchRobot called once, body.robot === 'dispatched' */);
it('does not start the robot when the started test has no test file', /* robot === null, dispatch not called */);
it('starts the robot when an open test gets its test file', /* PUT files/test → body.robot === 'dispatched' */);
it('starts the robot on reopen when the print PDF is missing', /* evaluating test, print_status 'none' → reopen → robot 'dispatched'; with print_status 'ready' → robot null */);
it('a new test file resets the print PDF and deletes the old one', /* print_status 'ready', print_file_key 'old-key' in R2 → PUT files/test → row: status 'none', key null, attempts 0; R2 'old-key' gone */);
it('a new test file with the same name keeps no old print', /* key from printFileKey(..., filesVersion n) in R2 and row; re-upload same name → old object deleted; files_version n+1 */);
it('a new barem does not touch the print PDF', /* print_status 'ready' stays */);
it('serves the print PDF only when it is ready', /* 'none' → 404; 'ready' + object → 200, Content-Type application/pdf, Content-Disposition names '6E2-26T1-cu-cod-qr.pdf' */);
it('retries a failed print and starts the robot', /* 'failed' → 200 { print: { status: 'none', ... }, robot: 'dispatched' }; 'ready' → 409 not_failed */);
it("keeps another teacher's test out", /* otherTeacherTest: GET print and POST retry → 404 */);
it('deletes the print PDF with the test', /* DELETE test → R2 print key gone */);
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run server/routes/print.test.ts`
Expected: FAIL (routes 404, `robot` undefined).

- [ ] **Step 3: Implement** the queries and routes above. Order in `PUT /files/test`: R2 put of the new test file, `saveTestFile`, delete the old test file and the old print file quietly, then `needsPrint` and `startRobot`. Update `src/admin/api.ts` types: `reopenTest(code): Promise<ReopenAnswer>`.

- [ ] **Step 4: Run the suite**

Run: `npm run typecheck && npm test`
Expected: PASS (existing start/reopen tests that compare whole answers get `robot: null`).

- [ ] **Step 5: Commit** `git commit -am "Start the robot for a print job and serve the print PDF to the teacher"` (add the new test file first).

---

### Task 3: Robot API: the print job

**Files:**
- Modify: `server/db/runner.ts`, `server/routes/runner.ts`
- Test: create `server/routes/runnerPrint.test.ts`; update `server/routes/runner.test.ts` expectations of `/check` and `/tasks`

**Interfaces:**
- Consumes: `NEEDS_PRINT`, `printFileKey`, `PrintJob`, `printFailedBody`.
- Produces (all under the robot key):
  - `GET /api/runner/tests/:id/print-job` → `{ job: PrintJob }`, 404 unless `NEEDS_PRINT`.
  - `GET /api/runner/tests/:id/print-job/file` → the test file bytes (`fileResponse(object, 'test', type)`), 404 unless `NEEDS_PRINT`.
  - `PUT /api/runner/tests/:id/print` with headers `X-Run-Id`, `X-Files-Version`, `Content-Type: application/pdf`, body the PDF → `{ status: 'ready' }`. Body read with `readUpload(c, [PDF_TYPE], …)`; key `printFileKey(teacherId, schoolYear, code, testFileName, filesVersion)`; R2 put, then `savePrint`; when it changes nothing, delete the object and throw `refusedWrite(…, () => new ApiError(409, 'not_needed', 'Testul cu cod QR nu mai este cerut.'))`. A bad `X-Run-Id` → 400 through `runIdSchema`.
  - `POST /api/runner/tests/:id/print-failed` `printFailedBody` → `{ status: 'none' | 'failed' }`, same refusals.
  - `server/db/runner.ts`: `findPrintJob(db, testId): Promise<{ job: PrintJob; testFileKey: string; teacherId: number; schoolYear: number; code: string; testFileName: string } | null>`; `savePrint(db, testId, runId, filesVersion, key, now): Promise<boolean>`; `failPrint(db, testId, runId, filesVersion, error, now): Promise<'none' | 'failed' | null>` (attempts + 1, `failed` at `MAX_ATTEMPTS`); all writes `WHERE id = ? AND files_version = ? AND ${NEEDS_PRINT} AND ${HOLDS_LEASE}` (with the `t.` alias handled: write the UPDATEs as `UPDATE tests AS t`).
  - `runCheck` and `listTasks` count/list `NEEDS_PRINT` tests as `prints` (ids ordered by `t.started_at, t.id`); `hasWork` includes them; `testHasRobotWork` includes `(${NEEDS_PRINT})`.

- [ ] **Step 1: Write the failing tests** in `server/routes/runnerPrint.test.ts` (`setRobotKey`, `robotRequest`, a lease taken with `POST /lease`):

```ts
it('lists an open test with a test file as a print job', /* /check → prints 1, hasWork true; /tasks → prints [testId] */);
it('lists no print job for a draft, an evaluating, a done, a ready, or a failed test', /* each → prints 0 */);
it('gives the print job and its file only while the job waits', /* job → { testId, filesVersion, contentType: 'application/pdf', uploadToken }; file bytes; after print_status 'ready' → both 404; an evaluating test → 404 */);
it('saves the print PDF from the run that holds the lease', /* PUT → 200 ready; row ready with the key of printFileKey(...); R2 holds the bytes */);
it('refuses a print made from an older files_version', /* X-Files-Version stale → 409 not_needed; R2 has no object under the new key; row stays 'none' */);
it('refuses a print from a run without the lease', /* other run id → 409 lease_lost */);
it('refuses a body that is not a PDF', /* 'hello' → 415 */);
it('counts a failed print and fails it at the third attempt', /* print-failed x3 → 'none', 'none', 'failed' */);
it('keeps the robot key away from the teacher routes', /* GET /api/admin/tests/:code/print with only the robot key → 401/403 as today for admin */);
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run server/routes/runnerPrint.test.ts`
Expected: FAIL (404 on the new routes, `prints` undefined).

- [ ] **Step 3: Implement** the queries and routes. Keep the R2 key out of every answer.

- [ ] **Step 4: Run the suite and update on purpose**

Run: `npm test`
Expected: PASS after updating the tests that assert `/check` or `/tasks` bodies exactly (`runner.test.ts`, `runner/check.test.ts`, `runner/api.test.ts`): add `prints: 0` / `prints: []`. Any test that now finds `hasWork: true` because an open test has a test file gets the file removed or the test made evaluating, with a comment saying why.

- [ ] **Step 5: Commit** `git commit -am "Give the robot the print job of an open test"` (add the new test file first).

---

### Task 4: The print container

**Files:**
- Create: `runner/print/Dockerfile`, `runner/print/docx_to_pdf.py` (copy of `D:\Projects\Website\tools\docx_to_pdf.py`, header comment changed to say it runs in this image), `runner/print/stamp_qr.py`, `runner/print/test_print.py`, `runner/print/container.test.ts`
- No `package.json` change: the container test runs only when `QE_PRINT_IMAGE_TESTS=1` is set (Task 7 documents it).

**Interfaces:**
- Produces:
  - Image (built from `runner/print/`): scripts in `/app`; `soffice` on `PATH`; working folder `/work`.
  - `python3 /app/docx_to_pdf.py /work/in.docx -o /work/converted.pdf` (exit 0, file written).
  - `python3 /app/stamp_qr.py IN.pdf OUT.pdf URL LABEL`: exit 0 and prints `pages=<n>` on success; exit 2 with no output for a PDF it cannot open or an encrypted one.
  - In `stamp_qr.py`: `stamp(src: str, out: str, url: str, label: str) -> int` and `strip_is_empty(page, strip) -> bool`.

The Dockerfile follows `.superpowers/qr-print-spike/Dockerfile.tdf` with these changes: `FROM ubuntu:24.04@sha256:<digest>` (pin the digest of the tag at build time: `docker buildx imagetools inspect ubuntu:24.04`); the download is checked with `echo "<sha256>  /tmp/lo.tar.gz" | sha256sum -c -`; packages: the LibreOffice runtime libraries of the spike, `fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea fontconfig python3 python3-pip ca-certificates curl` (no `fonts-stix`: the TDF build brings its own math fonts); `pip3 install --break-system-packages pymupdf==<pin> segno==<pin>` (pin the versions the build resolves today); no `opencv` (test-only, installed by the test); `COPY docx_to_pdf.py stamp_qr.py /app/`; `ENV HOME=/tmp`.

`stamp_qr.py` grows from the spike's `stamp.py` (same QR size 64 pt with a 4-module quiet zone, margin 14 pt, label 6.5 pt grey Helvetica bottom-left), with:
- the strip = the bottom `BAND = QR_PT + MARGIN + 4` points of the page, full width; `strip_is_empty` is true when no text block (`page.get_text('blocks')`), drawing (`page.get_drawings()`, ignoring a fill that covers 90% or more of the page), or image (`page.get_image_info()`) intersects it;
- empty strip → the page is shown at scale 1; otherwise at `(height - BAND) / height`, top, centered (the spike's rule);
- the result is reopened and must have the same page count; else exit 3.

- [ ] **Step 1: Write the failing tests**

`runner/print/test_print.py` (unittest, run inside the image with opencv installed by the test runner):

```python
def test_keeps_the_page_count_and_the_link(self):  # 2-page PDF made with pymupdf → stamp → 2 pages; QR decodes to the URL on each page at 300 dpi
def test_keeps_a_page_whose_strip_is_empty_at_full_size(self):  # text only at the top → the original text's bbox is unchanged (±0.5 pt)
def test_shrinks_a_page_whose_bottom_strip_has_text(self):  # a line at y = height - 30 → the text bbox in the output ends above height - BAND, and no text intersects the QR square
def test_handles_a_landscape_page(self):  # 842 x 595 → QR inside the page, decodes
def test_refuses_a_file_that_is_not_a_pdf(self):  # exit code 2
def test_converts_word_math_without_broken_signs(self):  # a minimal docx written with zipfile: an OMML equation with "sup A", "ℕ*", "A∖B" → docx_to_pdf.py → text has 'sup', 'ℕ', '∖', and no '¿'
```

`runner/print/container.test.ts`: `describe.skipIf(process.env.QE_PRINT_IMAGE_TESTS !== '1')`, builds the image with `docker build -t quickeval-print-test runner/print` (timeout 15 min), then `docker run --rm -v <runner/print>:/tests quickeval-print-test sh -c "pip3 install --break-system-packages opencv-python-headless && python3 -m unittest /tests/test_print.py"` and expects exit 0.

- [ ] **Step 2: Run them and see them fail**

Run (PowerShell): `$env:QE_PRINT_IMAGE_TESTS='1'; npx vitest run runner/print/container.test.ts`
Expected: FAIL (`stamp_qr.py` missing).

- [ ] **Step 3: Write** the Dockerfile and `stamp_qr.py`; copy `docx_to_pdf.py`.

- [ ] **Step 4: Run them and see them pass**, then run `npm test` without the variable (the container test is skipped; the count of skipped tests goes up by one).

- [ ] **Step 5: Check by eye** that the two spike worksheets still match (`.superpowers/qr-print-spike/run11.sh` adapted to the new image), and that `in/anexa.docx` page 1 shows "∖", "𝒱", "ℝ" as in `out11/anexa-1.png`.

- [ ] **Step 6: Commit** `git add runner/print && git commit -m "Add the print container: pinned LibreOffice and the QR stamp"`

---

### Task 5: The robot's print task

**Files:**
- Create: `runner/printTask.ts`, `runner/printTask.test.ts`
- Modify: `runner/api.ts` (+ `runner/api.test.ts`), `runner/tasks.ts` (export `refusal`), `runner/run.ts` (+ `runner/run.test.ts`), `runner/check.ts` (log `prints`)

**Interfaces:**
- Consumes: Task 3 routes; Task 4 image and script arguments.
- Produces:
  - `RobotApi`: `printJob(testId): Promise<PrintJob>`; `printSource(testId): Promise<Uint8Array>`; `sendPrint(testId, runId, filesVersion, pdf: Uint8Array): Promise<void>`; `sendPrintFailed(testId, body: z.input<typeof printFailedBody>): Promise<'none' | 'failed'>`. `sendPrint` uses a new `send` path with a byte body: headers `Content-Type: application/pdf`, `X-Run-Id`, `X-Files-Version`.
  - `runner/printTask.ts`:
    ```ts
    export interface PrintTools {
      // Builds the image once per run; later calls return the same promise.
      prepare(): Promise<void>;
      // Runs `args` in a new container with `folder` mounted at /work. Rejects
      // with { kind: 'timeout' | 'failed' } and never with the command line.
      run(args: string[], folder: string, timeoutMs: number): Promise<void>;
    }
    export class PrintSetupError extends Error {}
    export function dockerTools(contextDir?: string): PrintTools;
    export async function makePrint(ctx: TaskContext, print: { tools: PrintTools; siteUrl: string }, testId: number): Promise<TaskEnd>;
    ```
  - `TaskContext` gets `print?: { tools: PrintTools; siteUrl: string }`; `main` sets it from `QUICKEVAL_URL` and `dockerTools()`.

`dockerTools`: `prepare` runs `docker build -t quickeval-print <runner/print>` (10 min) and maps any failure to `PrintSetupError`; `run` runs `docker run --rm --name qe-print-<8 hex> --network none --user <uid>:<gid> -v <folder>:/work quickeval-print <args>` through `execFile` (uid/gid from `process.getuid?.()`, left out on Windows); on timeout it runs `docker kill <name>`. Errors are rethrown as `{ kind }` only: `execFile`'s message holds the URL.

`makePrint`: folder `<root>/print-<testId>`; read `printJob`, then `printSource`; write `in.pdf` or `in.docx` (`DOCX_TYPE`); for Word run `['python3', '/app/docx_to_pdf.py', '/work/in.docx', '-o', '/work/converted.pdf']` (60 s); run `['python3', '/app/stamp_qr.py', '/work/<in|converted>.pdf', '/work/out.pdf', url, label]` (60 s) with `url = ${siteUrl without trailing /}/u/${uploadToken}` and `label = ${new URL(siteUrl).host}/u/${uploadToken}`; send `out.pdf`. A `{ kind: 'timeout' }` sends `timeout`, any other failure `crash`; the answer `failed` → `'failed'`, `none` → `'retry'`; refusals through `refusal()` (`dropped`, `lease_lost`); the folder is always removed. Log: `log('print', { test, type: 'pdf' | 'docx', end, seconds })` only.

`run.ts`: at the start of each loop round, before exercise lists, for each id in `tasks.prints` not tried this run: `record(await makePrint(...), 'prints')`, except that a print `'retry'`/`'failed'` does not change `failuresInARow`. A `PrintSetupError` sets `failure = true`, logs `print setup failed`, and skips print jobs for the rest of the run. `counts.prints` goes into the summary.

- [ ] **Step 1: Write the failing tests**

```ts
// runner/printTask.test.ts, against evaluatingTest-like world with an OPEN test (new helper openTestWithFile(type) in robotWorld.ts: test file in R2, started, robot key set, lease taken), with fake PrintTools that write /work/out.pdf ('%PDF-1.7 stamped') into the folder
it('stamps a PDF test and saves it', /* run args: one call, stamp_qr.py with url 'https://quickeval.test/u/<token>' and label 'quickeval.test/u/<token>'; end 'saved'; row ready */);
it('converts a Word test first', /* two calls: docx_to_pdf.py, then stamp_qr.py on /work/converted.pdf */);
it('counts a failure as a crash and a timeout as a timeout', /* run rejects { kind: 'failed' } → print_attempts 1, end 'retry'; { kind: 'timeout' } likewise */);
it('drops a print whose test file changed', /* bump files_version between printJob and sendPrint → end 'dropped' */);
it('never logs the token, the link, or a script message', /* spy console.log; a run that rejects with an Error whose message contains the URL; no line contains the token */);
it('removes its folder', /* folder gone after saved and after a failure */);

// runner/run.test.ts
it('makes the print PDF first, then grades', /* world with an open test with a test file and an evaluating test with uploads → order of calls: print before claim; summary.prints 1 */);
it('stops making prints when the image cannot be built, and exits 1', /* prepare rejects PrintSetupError → exitCode 1, no print-failed sent, grading still runs */);
it('runs with Node and zod alone: the workflow installs nothing else', /* existing test stays green */);
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run runner/printTask.test.ts runner/run.test.ts runner/api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the client methods, `printTask.ts`, and the run loop change.

- [ ] **Step 4: Run the whole suite, once, in the foreground, alone**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "Make the print PDF in the robot run, before the gradings"` (add new files first).

---

### Task 6: The teacher's page

**Files:**
- Create: `src/admin/testPage/PrintTest.tsx`, `src/admin/testPage/PrintTest.test.tsx`
- Modify: `src/admin/api.ts` (+ `api.test.ts`), `src/test/fakeApi.ts`, `src/admin/pages/TestPage.tsx` (+ `TestPage.test.tsx`)

**Interfaces:**
- Consumes: Task 1 `TestInfo.print`, Task 2 routes and answers.
- Produces:
  - `printFileUrl(code: string): string` → `/api/admin/tests/<code>/print`; `AdminApi.retryPrint(code): Promise<PrintRetryAnswer>`.
  - `PrintTest({ test, onChanged, onRobot }: { test: TestInfo; onChanged: () => Promise<void>; onRobot: (robot: RobotStart | null) => void })`, shown in `TestActions` below the student links while `test.status === 'open'` (also when the links are hidden). `startTest` and `reopenTest` mutations pass their answer's `robot` to `onRobot` (thread `onRobot` into `TestActions`).

Copy (exact):
- heading `<h3>Testul pentru tipărit</h3>`
- no test file: „Încarcă testul ca să primești varianta cu cod QR.”
- `none`: `<p role="status">Se pregătește testul cu cod QR…</p>`
- `ready`: link `<a className="button button-small" href={printFileUrl(code)} download>Descarcă testul cu cod QR</a>`, then the hint „Codul QR apare în colțul fiecărei pagini.”; when `fromWord`, a second hint „PDF-ul a fost făcut din fișierul Word. Verifică-l înainte să-l tipărești. Pentru o copie exactă, încarcă testul ca PDF.”
- `failed`: „Nu am putut pregăti testul cu cod QR.” and the button „Încearcă din nou” (`retryPrint`, then `onRobot(answer.robot)` and `onChanged()`), errors through `ErrorMessage`.

- [ ] **Step 1: Write the failing tests** in `PrintTest.test.tsx` (with `renderAdmin` and the fake API):

```tsx
it('asks for the test file first', /* files.test null → text „Încarcă testul ca să primești varianta cu cod QR.” */);
it('says the PDF is being made', /* print none → role status text */);
it('offers the download when ready', /* link name „Descarcă testul cu cod QR”, href '/api/admin/tests/6E2-26T1/print' */);
it('warns about a PDF made from Word', /* fromWord true → the Word hint; false → absent */);
it('retries a failed print', /* click „Încearcă din nou” → api.retryPrint('6E2-26T1') called */);
// TestPage.test.tsx
it('shows the print block only while the test is open', /* draft and evaluating → no „Testul pentru tipărit” */);
it('says the robot started after Start test', /* fake startTest returns robot 'dispatched' → robotStartMessage('dispatched') shown */);
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/admin/testPage/PrintTest.test.tsx src/admin/pages/TestPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the component, the client, the fake (`retryPrint` sets the fake test's print to `none` and answers `robot: 'dispatched'`; `startTest` answers `robot: null` unless the fake test has a test file), and the wiring.

- [ ] **Step 4: Run the suite and the types**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Look at it**: `npm run db:local`, start the `api` and `web` preview servers, set a test's `print_status` to `ready` with an object in local R2 (`wrangler r2 object put --local`), and check the block at phone width (375 px) and in dark mode; the download opens a PDF.

- [ ] **Step 6: Commit** `git commit -am "Show the test with the QR code on the test page"` (add new files first).

---

### Task 7: Docs and go-live notes

**Files:**
- Modify: `AGENTS.md`, `runner/AGENTS.md`, `server/AGENTS.md`, `src/AGENTS.md`, `docs/deploy.md`

- [ ] **Step 1: Write** one short line each:
  - root `AGENTS.md` Structure: `runner/print/` (the print container); Rules: "A print job is an open test with a test file and no print PDF; every path that makes one starts the robot."
  - `runner/AGENTS.md`: `printTask.ts`; the container (pinned LibreOffice, only these fonts, and why); `QE_PRINT_IMAGE_TESTS=1` for the container tests; never log the token or a script's output.
  - `server/AGENTS.md`: the robot reads an open test only while it is a print job (`NEEDS_PRINT`), checked in SQL.
  - `src/AGENTS.md`: `testPage/PrintTest.tsx`.
  - `docs/deploy.md`: migration 0014 before the merge; the first run with a print job builds the image (a few minutes); how to update LibreOffice (new version, new SHA-256, run the container tests and look at the two worksheets).

- [ ] **Step 2: Run everything**

Run: `npm run build && npm test` and `$env:QE_PRINT_IMAGE_TESTS='1'; npx vitest run runner/print/container.test.ts`
Expected: PASS.

- [ ] **Step 3: Smoke test** (`npm run db:local`, `npm run preview`, `npm run smoke` in a second terminal): PASS. Check `netstat -ano | findstr :8788` first for an old `workerd.exe`.

- [ ] **Step 4: Commit** `git commit -am "Document the print PDF and its go-live"`

**Go-live (the user):** run `wrangler d1 migrations apply quickeval --remote` for 0014 before merging; after the merge, upload one Word test and one PDF test of Laura's to an open test, wait for the robot, and look at both PDFs before printing.
