# Generated barem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The teacher clicks "Generează baremul"; the robot reads the test and returns a Word barem in the style of Laura's sample; the barem is inactive until the teacher clicks "Am verificat baremul". The file rows get a one-line layout and a confirm before a barem is replaced.

**Architecture:** A new robot job like the print PDF: a `barem_request` column, a `NEEDS_BAREM` SQL condition, scoped robot routes, and a runner task. Claude answers JSON in a new mode `barem` (checked by a zod schema); plain robot code turns the JSON into Markdown and pandoc turns that into `.docx`. One SQL fragment `BAREM_ACTIVE` guards every place that starts or schedules an evaluation.

**Tech Stack:** TypeScript, Hono on Cloudflare Pages Functions, D1, R2, React + TanStack Query, Vitest, Node robot on GitHub Actions, Claude Code, pandoc.

**Spec:** `docs/superpowers/specs/2026-11-03-generated-barem-design.md` (read it first). Root `AGENTS.md`, `server/AGENTS.md`, `runner/AGENTS.md`, `src/AGENTS.md` hold the project rules.

## Global Constraints

- All user-facing text is Romanian. Code, comments, docs are English. No ticket numbers in code comments. No AI attribution in commits.
- Every teacher query is scoped by teacher id. Checks live inside the SQL of the write, never in a check before it.
- Migration `0020_generated_barem.sql`: one statement per `;` at a line end, no `;` inside strings. It runs on the live D1 before the code reaches `main`.
- Relative imports name the `.ts`/`.tsx` file. No enums, namespaces, or constructor parameter properties.
- Functions: at most 15 D1 queries per request; group writes with `db.batch()`.
- `runner/run.ts` loads only zod; `runner/check.ts` loads no package. Import types from `shared/` with `import type`.
- The robot's Claude reads only its work folder and answers JSON only. Robot logs carry ids, counts, durations, error categories: never the test text or Claude's answer.
- pandoc always runs with `--sandbox` and `pandocEnv()`.
- R2 keys come from rows. The generated barem key is `t/<teacherId>/<schoolYear>/<code>/barem/generat-v<filesVersion>.docx`.
- `MAX_ATTEMPTS` (3) caps barem attempts; a `usage_limit` error counts no attempt (as `failPrint`).
- Romanian strings fixed by the spec: "Generează baremul", "Am verificat baremul", "Se generează baremul… Durează câteva minute.", "Barem generat automat. Verifică-l și corectează-l în Word dacă e nevoie.", "Nu am putut genera baremul.", "Încearcă din nou", "Încarcă întâi testul.", "Verifică baremul generat înainte de evaluare.", "Baremul se generează încă.", "Înlocuiești baremul existent cu unul generat? Baremul de acum rămâne până vine cel nou.", "Înlocuiești baremul existent cu <nume>?". Generated file name: `<cod test> - barem generat.docx`.

## Review Focus

1. A scheduled evaluation (`evaluation_at` set) whose barem becomes unchecked or generating must never start at its time: `DUE` uses `BAREM_ACTIVE` (test in Task 1), and a generation request clears `evaluation_at` (test in Task 2).
2. The teacher replaces the test file while a generated barem is unchecked: the barem goes back to `requested` and "Am verificat baremul" with the old `filesVersion` is refused (tests in Task 2).
3. The teacher uploads her own barem while the robot generates: the robot's late `PUT /barem` is refused 409 `not_needed` and no R2 object is left behind (test in Task 3).
4. Math that breaks a pipe table or Markdown: `|x|`, `$$…$$`, a newline, a leading `1.`, `*`, `_`, `#` outside math (tests in Task 5).
5. A narrow phone screen: the file name wraps under the buttons and the page never scrolls sideways (check in Task 8).

---

### Task 1: Data and the evaluation guard

**Files:**
- Create: `migrations/0020_generated_barem.sql`
- Modify: `server/db/lifecycle.ts` (`READY`, `READY_SELECTED`, `OPEN_WITH_FILES`, `scheduleEvaluation`, `DUE`)
- Modify: `server/routes/tests.ts:73-76` (the evaluation pre-checks)
- Modify: `server/db/tests.ts` (row type, select list, `TestRecord` mapping)
- Modify: `shared/api.ts` (`TestInfo`)
- Modify: `docs/superpowers/specs/2026-10-06-quickeval-design.md` (§7 data, §8 lifecycle: one paragraph each pointing to the new spec)
- Test: `server/routes/evaluation.test.ts`, `server/db/lifecycle.test.ts` (or the file that already tests `promoteDue`)

**Interfaces:**
- Produces: columns `barem_request TEXT NOT NULL DEFAULT 'none' CHECK (barem_request IN ('none', 'requested', 'failed'))`, `barem_request_attempts INTEGER NOT NULL DEFAULT 0`, `barem_unchecked INTEGER NOT NULL DEFAULT 0`.
- Produces: `export const BAREM_ACTIVE = "t.barem_file_key IS NOT NULL AND t.barem_unchecked = 0 AND t.barem_request <> 'requested'"` in `server/db/lifecycle.ts`.
- Produces: `export type BaremRequest = 'none' | 'requested' | 'failed'` in `shared/api.ts`; `TestInfo` gains `barem: { request: BaremRequest; unchecked: boolean }` and `filesVersion: number`. `TestRecord` carries the same (from `files_version`, `barem_request`, `barem_unchecked`).

- [ ] **Step 1: Write the failing tests**

In `evaluation.test.ts` (use the existing fixtures `makeClass`, `makeTest`, `addTestFiles`, `startTest`, `addSubmission`, and a `setTest` helper like `print.test.ts`):

```ts
it('refuses to start an evaluation while the barem is unchecked', async () => {
  await setTest('barem_unchecked = 1');
  const res = await api.request('POST', `/api/admin/tests/${code}/evaluate`, { now: true });
  expect(res.status).toBe(409);
  expect(res.body).toMatchObject({ error: 'barem_unchecked', message: 'Verifică baremul generat înainte de evaluare.' });
});
it('refuses to start an evaluation while the barem is generating', async () => {
  await setTest("barem_request = 'requested'");
  const res = await api.request('POST', `/api/admin/tests/${code}/evaluate`, { now: true });
  expect(res.body).toMatchObject({ error: 'barem_generating', message: 'Baremul se generează încă.' });
});
it('refuses to schedule while the barem is unchecked', ...)        // 409 barem_unchecked, evaluation_at stays NULL
it('starts selected uploads only with an active barem', ...)       // the selected-start route, barem_unchecked = 1 → 409, no submission changes status
```

In the `promoteDue` tests:

```ts
it('does not start a scheduled evaluation whose barem became unchecked', async () => {
  // open test with files and an upload, evaluation_at in the past, then barem_unchecked = 1
  await promoteDue(api.db, nowIso());
  expect((await testRow()).status).toBe('open');
});
```

Use the request bodies the existing tests in these files use; the assertions above are the point.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run server/routes/evaluation.test.ts server/db/lifecycle.test.ts`
Expected: FAIL (no such column `barem_unchecked`).

- [ ] **Step 3: Write the migration, `BAREM_ACTIVE`, the pre-checks, and the `TestInfo` fields**

- Replace `t.barem_file_key IS NOT NULL` with `${BAREM_ACTIVE}` in `READY`, `READY_SELECTED`, `OPEN_WITH_FILES`, `scheduleEvaluation`; add `AND ${BAREM_ACTIVE}` to `DUE`.
- In the pre-check of `tests.ts`, after `missing_barem`: `barem_generating` when `test.barem.request === 'requested'`, then `barem_unchecked` when `test.barem.unchecked`, both 409 with the spec's messages.
- Every place that builds a `TestInfo` from a `TestRecord` fills `barem` and `filesVersion`; `fakeTest()` in `src/test/fakeApi.ts` defaults them to `{ request: 'none', unchecked: false }` and `0`.

- [ ] **Step 4: Run the tests**

Run: `npm run db:local; npx vitest run server/routes/evaluation.test.ts server/db/lifecycle.test.ts; npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add migrations/0020_generated_barem.sql server shared src/test/fakeApi.ts docs/superpowers/specs/2026-10-06-quickeval-design.md
git commit -m "Block evaluations until a generated barem is checked"
```

### Task 2: Teacher routes: request, confirm, and the file uploads

**Files:**
- Modify: `server/db/tests.ts` (`saveTestFile`, new `requestBarem`, `confirmBarem`, `needsBarem`)
- Modify: `server/db/runner.ts` (`NEEDS_BAREM`, `testHasRobotWork`, `runCheck`, `listTasks`)
- Modify: `server/routes/tests.ts` (two routes; the file upload route starts the robot for a barem job)
- Modify: `shared/api.ts`, `shared/runner.ts` (`TasksResult.barems: number[]`, `RunSummary`/summary schema `barems` default 0)
- Test: `server/routes/generatedBarem.test.ts` (new), `server/routes/runner.test.ts` (tasks and check)

**Interfaces:**
- Consumes: Task 1 columns and `TestInfo.barem`, `TestInfo.filesVersion`.
- Produces: `export const NEEDS_BAREM = "t.status IN ('draft', 'open') AND t.test_file_key IS NOT NULL AND t.barem_request = 'requested'"` (server/db/runner.ts).
- Produces: `requestBarem(db, teacherId, testId, now): Promise<boolean>`; `confirmBarem(db, teacherId, testId, filesVersion, now): Promise<boolean>`; `needsBarem(db, testId): Promise<boolean>`.
- Produces routes and answers in `shared/api.ts`:
  - `POST /api/admin/tests/:code/barem/generate` → `BaremGenerateAnswer = { barem: TestInfo['barem']; robot: RobotStart | null }`.
  - `POST /api/admin/tests/:code/barem/checked` body `baremCheckedBody = z.object({ filesVersion: z.number().int().min(0) })` → `{ barem: TestInfo['barem'] }`.
- Produces: `TasksResult.barems: number[]` (test ids, oldest `updated_at` first) and the `barems` count in the run summary.

- [ ] **Step 1: Write the failing tests** (`generatedBarem.test.ts`, setup like `print.test.ts`)

```ts
it('requests a barem, clears the schedule, and starts the robot', async () => {
  // open test with the test file and evaluation_at set
  const res = await api.request('POST', `/api/admin/tests/${code}/barem/generate`);
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ barem: { request: 'requested', unchecked: false }, robot: 'dispatched' });
  expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 0, evaluation_at: null });
});
it('refuses without a test file', ...)                 // 409 missing_test_file 'Încarcă testul înainte să generezi baremul.'
it('refuses in evaluation and done', ...)              // 409 not_editable 'Baremul se poate genera doar înainte de evaluare.'
it('refuses another teacher\'s test', ...)             // 404 (otherTeacherTest)
it('allows a draft test', ...)                          // 200, request 'requested'
it('confirms an unchecked barem with the shown filesVersion', ...)  // 200, barem_unchecked 0
it('refuses a confirm with an old filesVersion', ...)  // 409 stale 'Baremul s-a schimbat. Reîncarcă pagina.', still unchecked
it('a teacher barem upload clears unchecked and a waiting request', ...) // barem_unchecked 0, barem_request 'none'
it('a new test file asks for a new barem when the barem is unchecked', async () => {
  await setTest('barem_unchecked = 1');
  const res = await putTestFile('test2.pdf', 'enunț nou');
  expect(await row()).toMatchObject({ barem_request: 'requested', barem_request_attempts: 0, barem_unchecked: 1 });
  expect(dispatchRobot).toHaveBeenCalled();
});
it('a new test file leaves a checked barem alone', ...)  // barem_request stays 'none'
```

In `runner.test.ts`: `GET /tasks` lists the test in `barems` for draft and open with a request, not for evaluating, done, no test file, or `failed`; `POST /check` reports `hasWork` with only a barem job.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run server/routes/generatedBarem.test.ts server/routes/runner.test.ts`
Expected: FAIL (404 on the new routes, no `barems` in tasks).

- [ ] **Step 3: Implement**

- `requestBarem`: `UPDATE tests SET barem_request = 'requested', barem_request_attempts = 0, evaluation_at = NULL, updated_at = ? WHERE id = ? AND teacher_id = ? AND status IN ('draft', 'open') AND test_file_key IS NOT NULL RETURNING id`. The route turns `false` into the right 409 by reading the record it already has (no test file → `missing_test_file`, else `not_editable`).
- `confirmBarem`: `UPDATE tests SET barem_unchecked = 0, updated_at = ? WHERE id = ? AND teacher_id = ? AND files_version = ? AND barem_unchecked = 1 AND barem_request <> 'requested' RETURNING id`.
- `saveTestFile`: the barem branch adds `barem_unchecked = 0, barem_request = 'none', barem_request_attempts = 0`; the test branch adds `barem_request = CASE WHEN barem_unchecked = 1 AND status IN ('draft', 'open') THEN 'requested' ELSE barem_request END` and the same CASE resetting `barem_request_attempts` to 0.
- File upload route: for `kind === 'test'`, `robotWork = (await needsPrint(...)) || (await needsBarem(...))`.
- `NEEDS_BAREM` joins `NEEDS_PRINT` in `testHasRobotWork`, `runCheck` (a `barems` count in `hasWork`), and `listTasks`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server; npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server shared
git commit -m "Let the teacher request and confirm a generated barem"
```

### Task 3: Robot routes for the barem job

**Files:**
- Modify: `shared/files.ts` (`generatedBaremKey`)
- Modify: `server/db/runner.ts` (`findBaremJob`, `saveGeneratedBarem`, `baremKeyIs`, `failBaremJob`)
- Modify: `server/routes/runner.ts` (four routes)
- Modify: `shared/runner.ts` (`BaremJob`, `baremFailedBody`)
- Test: `server/routes/baremJob.test.ts` (new), `shared/files.test.ts`

**Interfaces:**
- Consumes: `NEEDS_BAREM`, `MAX_ATTEMPTS`, `HOLDS_LEASE`, `refusedWrite`, `readUpload`, `holdsLease`, `deleteFilesQuietly` (all exist; copy the print routes' shape).
- Produces: `generatedBaremKey(teacherId: number, schoolYear: number, code: string, filesVersion: number): string` → `t/1/2026/6E2-26T1/barem/generat-v4.docx`.
- Produces: `interface BaremJob { testId: number; createdAt: string; filesVersion: number; contentType: string; baremNotes: string }`; `baremFailedBody` = the `printFailedBody` shape.
- Produces routes: `GET /api/runner/tests/:id/barem-job` → `{ job: BaremJob }`; `GET /api/runner/tests/:id/barem-job/file` → the test file; `PUT /api/runner/tests/:id/barem` (headers `X-Run-Id`, `X-Files-Version`, `X-Created-At`; body the `.docx`) → `{ status: 'ready' }`; `POST /api/runner/tests/:id/barem-failed` → `{ status: 'none' | 'failed' }`.
- `saveGeneratedBarem(db, testId, runId, filesVersion, createdAt, key, name, now): Promise<{ oldKey: string | null } | null>`: in one batch, reads the old `barem_file_key` and runs the UPDATE under `WAITS_FOR_BAREM` (`NEEDS_BAREM` with `tests.`, plus `files_version`, `created_at`, `HOLDS_LEASE`). The UPDATE sets the key, `barem_file_name = name`, `barem_file_type = DOCX_TYPE`, `barem_unchecked = 1`, `barem_request = 'none'`, `barem_request_attempts = 0`, `files_version = files_version + 1`, and clears the exercise list as `saveTestFile` does.

- [ ] **Step 1: Write the failing tests**

```ts
it('shows the job only while it waits', ...)          // 404 for none, failed, evaluating, no file; 200 { job } when requested, with baremNotes
it('saves the barem as unchecked and deletes the old barem', async () => {
  // test with a teacher barem 'barem.pdf', request, lease held by RUN
  const res = await putBarem(docxBytes, { runId: RUN, filesVersion: v });
  expect(res.status).toBe(200);
  expect(await row()).toMatchObject({ barem_unchecked: 1, barem_request: 'none', barem_file_name: `${code} - barem generat.docx`, barem_file_type: DOCX_TYPE, files_version: v + 1 });
  expect(await api.files.get(oldKey)).toBeNull();
});
it('refuses a barem made from an older file version', ...) // 409 not_needed, R2 key absent
it('refuses after the teacher uploaded her own barem', ...) // 409 not_needed, no object left at generatedBaremKey
it('refuses a body that is not a Word file', ...)          // 415 or 400 as readUpload answers for the print route
it('refuses without the lease', ...)                       // 409 lease_lost
it('counts failures and fails at the third', ...)          // none, none, failed; usage_limit counts none
```

`docxBytes`: a zip header (`PK\x03\x04…`) is enough for `looksLike(DOCX_TYPE)`; check `looksLike` in `shared/files.ts`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run server/routes/baremJob.test.ts shared/files.test.ts`
Expected: FAIL (404 everywhere, `generatedBaremKey` missing).

- [ ] **Step 3: Implement** the helpers and routes, copying `findPrintJob`/`savePrint`/`printKeyIs`/`failPrint` and the print routes. The not-needed error: `new ApiError(409, 'not_needed', 'Baremul nu mai este cerut.')`. After a save, delete `oldKey` quietly when it differs from the new key; after a refused save, delete the new object unless `baremKeyIs` says the row names it.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server shared; npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server shared
git commit -m "Add the robot routes of the barem job"
```

### Task 4: The barem schema and its check

**Files:**
- Modify: `shared/schemas.ts`
- Test: `shared/schemas.test.ts`

**Interfaces:**
- Produces: `generatedBaremSchema` (zod) and `type GeneratedBarem = z.infer<typeof generatedBaremSchema>`:

```ts
{
  title: string;          // "Test de evaluare – Permutări"
  subtitle: string;       // "Matematică – clasa a XI-a R1 (programa M1, 4 ore/săptămână) – Timp de lucru: 50 de minute"
  notes: string[];        // "Precizări privind evaluarea", one per bullet
  total: number;          // din oficiu included, e.g. 100
  officePoints: number;   // e.g. 10; 0 allowed
  parts: {                // one per variant ("RÂNDUL I"); title '' when the test has one variant
    title: string;
    sections: {           // "SUBIECTUL I"
      title: string;
      points: number;
      items: { label: string; steps: { text: string; points: number }[] }[];  // label "1.", "a)", "1. a)"
    }[];
  }[];
}
```

- Produces: `checkGeneratedBarem(raw: unknown): Checked<GeneratedBarem>` (same `Checked` type as `checkExerciseList`).
- Limits: numbers are integers ≥ 0, step points > 0; at most 4 parts, 6 sections per part, 30 items per section, 12 steps per item; `text` ≤ 1500 chars, titles ≤ 200, notes ≤ 10 × 400.

- [ ] **Step 1: Write the failing tests**

```ts
it('accepts a barem whose points add up', () => expect(checkGeneratedBarem(sample).ok).toBe(true));
it('refuses steps that do not add up to the section', ...)   // ok false
it('refuses sections plus din oficiu that miss the total', ...)
it('checks every part on its own', ...)                     // part 2 sums to 95 → ok false
it('refuses an empty part, section, or item', ...)
it('refuses a step of 0 points', ...)
it('accepts officePoints 0 with total = sections', ...)
```

`sample`: one part, sections 30/30/30, officePoints 10, total 100, written in the test file.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run shared/schemas.test.ts`
Expected: FAIL (`checkGeneratedBarem` is not a function).

- [ ] **Step 3: Implement** the schema with `.describe()` texts in English that tell Claude what each field holds (inline LaTeX between single `$`, Romanian text), and the sums in `checkGeneratedBarem`: per item = sum of steps; per section = sum of items == `section.points`; per part = sum of sections + `officePoints` == `total`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run shared/schemas.test.ts; npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared
git commit -m "Add the generated barem schema and its point check"
```

### Task 5: From JSON to a Word file

**Files:**
- Create: `runner/baremDocx.ts`
- Create: `runner/barem-reference.docx` (binary)
- Create: `runner/fixtures/barem/Test - Permutari.docx`, `runner/fixtures/barem/Test - Permutari - barem.docx` (copied from `D:\Projects\Website-Content\Clasa 11R1\`; the user agreed to publish them)
- Test: `runner/baremDocx.test.ts`

**Interfaces:**
- Consumes: `GeneratedBarem` (Task 4), `Pandoc`, `realPandoc` (`runner/workdir.ts`).
- Produces: `baremMarkdown(barem: GeneratedBarem): string` and `makeBaremDocx(barem: GeneratedBarem, folder: string, pandoc?: Pandoc): Promise<Uint8Array>` (writes `barem.md`, runs `pandoc --sandbox -f markdown -t docx --reference-doc <abs path of runner/barem-reference.docx> -o barem.docx barem.md` in `folder`, returns the bytes).

The Markdown layout (exact, so the tests can pin it):

```
**BAREM DE EVALUARE ȘI DE NOTARE**

**<title>**

<subtitle>

**Precizări privind evaluarea**

• <note 1>

• <note 2>

**<part title>**                      (only when non-empty)

| **<SECTION TITLE>** (<points> de puncte) | |
|----------------------------------------------------------------------------------------------------|----------:|
| <label> <step 1 text> | **<p>p** |
| <step 2 text> | **<p>p** |
```

The dash counts (100 and 10) make pandoc give the columns 90% / 10% of the page.

Escaping (`escapeCell(text: string): string`, exported for tests): split on single-`$` math; outside math escape `\ * _ # < > [ ] \``; inside math replace `\|` with `\Vert ` and `|` with `\vert `; everywhere turn `$$…$$` into `$…$` and newlines into spaces; a cell that starts with `<digits>.` gets `\.`.

- [ ] **Step 1: Write the failing tests**

```ts
it('writes one table per section with 90/10 columns', ...)  // baremMarkdown(sample) contains the header row and the separator above
it('puts the label before the first step only', ...)
it('escapes pipes inside math', () => expect(escapeCell('$|x| = 2$')).toBe('$\\vert x\\vert  = 2$'));
it('turns display math into inline math', () => expect(escapeCell('$$x^2$$')).toBe('$x^2$'));
it('joins lines', () => expect(escapeCell('a\nb')).toBe('a b'));
it('keeps a leading number from becoming a list', () => expect(escapeCell('1. x')).toBe('1\\. x'));
it('escapes Markdown outside math only', () => expect(escapeCell('a*b $a*b$')).toBe('a\\*b $a*b$'));
it.skipIf(!hasPandoc)('makes a Word file with real equations and A4 pages', async () => {
  const bytes = await makeBaremDocx(sampleWithMatrix, tmp);
  const xml = await documentXml(bytes);       // unzip with `tar -xOf` or a tiny reader in the test
  expect(xml.match(/<m:mr>/g)?.length).toBe(2);  // \begin{pmatrix}1 & 2\\ 4 & 5\end{pmatrix}
  expect(xml).toContain('w:w="11906"');      // A4 width from the reference doc
  expect(xml).not.toContain('w:numPr');      // no accidental lists
});
```

`hasPandoc`: use the same check `workdir.test.ts` uses.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run runner/baremDocx.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Make the reference doc and implement**

- Reference doc: `pandoc -o runner/barem-reference.docx --print-default-data-file reference.docx`, then set A4 (`w:pgSz w:w="11906" w:h="16838"`, margins 1418) in `word/document.xml`, and Times New Roman 12 pt as the default font in `word/styles.xml`. Unzip, edit, zip again (Windows `tar -a -c -f`). Record the commands in a comment at the top of `baremDocx.ts`.
- Implement `baremMarkdown`, `escapeCell`, `makeBaremDocx`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run runner/baremDocx.test.ts; npm run typecheck`
Expected: PASS (the pandoc test runs on this PC; it skips in CI without pandoc). Open the output in Word once and compare with the sample by eye.

- [ ] **Step 5: Commit**

```bash
git add runner/baremDocx.ts runner/baremDocx.test.ts runner/barem-reference.docx runner/fixtures/barem
git commit -m "Turn a generated barem into a Word file with pandoc"
```

### Task 6: The skill and the Claude mode

**Files:**
- Modify: `.claude/skills/evaluate-test/SKILL.md` (description, `argument-hint`, a `## Mode \`barem\`` section)
- Create: `.claude/skills/evaluate-test/references/barem-writing.md` (style rules)
- Create: `.claude/skills/evaluate-test/references/barem-example.md` (the sample test and barem, from `pandoc -t markdown` of the two fixtures, under the headings "Testul" and "Baremul")
- Modify: `runner/claude.ts` (`ClaudeMode` adds `'barem'`; `TIME_LIMITS_MS.barem = 15 * 60_000`)
- Modify: `runner/workdir.ts` (`WorkFolderInput.requestNotes?: string` → writes `notes.md` in the folder root when non-empty)
- Modify: `runner/tasks.ts` (`JSON_SCHEMAS.barem = claudeJsonSchema(generatedBaremSchema)`)
- Test: `runner/skill.test.ts`, `runner/workdir.test.ts`, `runner/claude.test.ts`

**Interfaces:**
- Consumes: `generatedBaremSchema` (Task 4).
- Produces: `ClaudeMode` includes `'barem'`; the work folder of a barem task holds `.claude/skills/evaluate-test/`, `test/test.pdf` or `test/test.md` (+ `test/media/`), and `notes.md` (teacher comments) when given. No `barem/` folder.

The `barem` mode section says (in the skill's plain English): read the test and `notes.md`; solve every exercise; write the barem in the shape of the JSON fields; copy the test's own structure, variants (Rând I/II), numbering, and points ("6p" per exercise, "(30 de puncte)" per Subiect); when the test shows no points use 90 + 10 din oficiu = 100; points per step, never fractions of a point; write Romanian; math as inline TeX between single `$`; the four "Precizări" of the sample unless `notes.md` says otherwise; read `references/barem-writing.md` and `references/barem-example.md` first.

- [ ] **Step 1: Write the failing tests**

```ts
// skill.test.ts
it('names the barem mode and its references', () => {
  expect(skill).toContain('## Mode `barem`');
  expect(skill).toContain('references/barem-writing.md');
  expect(existsSync(join(SKILL_DIR, 'references', 'barem-example.md'))).toBe(true);
  for (const field of ['title', 'subtitle', 'notes', 'total', 'officePoints', 'parts', 'sections', 'items', 'steps']) expect(skill).toContain(`\`${field}\``);
});
// workdir.test.ts
it('writes the teacher notes for a barem task and no barem folder', ...)  // notes.md content, no barem/ dir
// claude.test.ts
it('runs the barem mode with its time limit', ...)                        // claudeArgs('barem', …) contains '/evaluate-test barem'
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run runner/skill.test.ts runner/workdir.test.ts runner/claude.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the skill text, the references, and the code changes.**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run runner; npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/evaluate-test runner
git commit -m "Teach the grading skill to write a barem"
```

### Task 7: The robot task and the run

**Files:**
- Create: `runner/baremTask.ts`
- Modify: `runner/api.ts` (`baremJob`, `baremSource`, `sendBarem`, `sendBaremFailed`)
- Modify: `runner/run.ts` (barem jobs right after print jobs; `barems` count)
- Modify: `runner/trySkill.ts` (`npm run try:skill -- barem <folder>`: reads `test.pdf|docx` and `notes.md`, writes `barem.json` and `barem.docx`)
- Modify: `runner/test/robotWorld.ts` if it needs a helper to request a barem
- Test: `runner/baremTask.test.ts` (new), `runner/run.test.ts`, `runner/api.test.ts`, `runner/trySkill.test.ts`

**Interfaces:**
- Consumes: Task 3 routes and `BaremJob`; `askClaude`, `sendOutcome`, `refusal`, `TaskContext`, `TaskEnd` from `runner/tasks.ts` (export `askClaude` and `sendOutcome`); `makeWorkFolder`; `makeBaremDocx`; `checkGeneratedBarem`.
- Produces: `makeBarem(ctx: TaskContext, testId: number): Promise<TaskEnd>`. Flow: `baremJob` → `baremSource` → work folder (`{ test, requestNotes: job.baremNotes }`) → `askClaude(ctx, 'barem', cwd, (o) => checkGeneratedBarem(o).ok)` → `makeBaremDocx` in a sub-folder of the task folder → `sendBarem(testId, runId, filesVersion, bytes, createdAt)`. A pandoc failure or a refused upload (400/413/415/422) sends `crash` through `sendBaremFailed`. Logs: `log('barem', { test, end, seconds })` only.
- `RobotApi` additions mirror the print ones: `baremJob(testId): Promise<BaremJob>`, `baremSource(testId): Promise<Uint8Array>`, `sendBarem(testId, runId, filesVersion, docx, createdAt?): Promise<void>`, `sendBaremFailed(testId, body): Promise<'none' | 'failed'>`.

- [ ] **Step 1: Write the failing tests** (robot world + `scriptedClaude`, like `printTask.test.ts` and `tasks.test.ts`)

```ts
it('saves a generated barem', ...)                 // scripted valid JSON → end 'saved', row barem_unchecked 1, R2 object is a zip
it('tries Claude twice on an answer whose points do not add up', ...)  // two calls, then 'retry', attempts 1
it('fails after three attempts', ...)              // 'failed', barem_request 'failed'
it('drops the work when the teacher uploaded a barem meanwhile', ...)   // 'dropped'
it('logs no test text', ...)                       // every log line: no word of the test or Claude's answer
// run.test.ts
it('does barem jobs after print jobs and before exercise lists', ...)
it('counts a failed barem in the failures in a row', ...)
it('still loads only zod', ...)                    // the existing test stays green
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run runner/baremTask.test.ts runner/run.test.ts runner/api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `baremTask.ts`, the API client calls, the run order, and `try:skill barem`.

- [ ] **Step 4: Run the tests**

Run: `npm test` (once, in the foreground, alone: `run.test.ts` times out when two suites run at once), then `npm run typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runner
git commit -m "Let the robot generate a barem"
```

### Task 8: File rows on one line, and the replace confirm

**Files:**
- Modify: `src/admin/TestFileInput.tsx`
- Modify: `src/ui/brand.css` (`.file-field`, new `.file-pick`, `.file-chosen`)
- Modify: `src/admin/testPage/TestFiles.tsx` (confirm before replacing a barem)
- Test: `src/admin/pages/TestPage.test.tsx`, `src/admin/pages/NewTestPage.test.tsx`

**Interfaces:**
- `TestFileInput` keeps its props and gains `actions?: ReactNode` (buttons shown after the file button on the same line, used by Task 9) and `confirm?: (file: File) => boolean` (called after a valid pick; `false` drops the pick and empties the input).
- DOM: `<div className="file-field">` → a `flex-wrap` row: `<input type="file" className="sr-only" id=…>` + `<label htmlFor=… className="button-quiet button-small">{label}</label>` + `{actions}` + `<span className="file-chosen">{picked name}</span>`. The label text stays the same, so `getByLabelText('Încarcă baremul')` still finds the input. `.file-chosen { flex: 1 1 12rem; min-width: 0; overflow-wrap: anywhere }` makes the name drop to the next line on a narrow screen. Keep the keyboard focus ring on the label (`.file-field input:focus-visible + label`).

- [ ] **Step 1: Write the failing tests**

```ts
it('asks before replacing the barem and keeps it on Renunță', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  // test with a barem 'barem.pdf'; pick 'nou.pdf' in 'Înlocuiește baremul'
  expect(window.confirm).toHaveBeenCalledWith('Înlocuiești baremul existent cu nou.pdf?');
  expect(fake.calls.uploadTestFile).toHaveLength(0);
});
it('replaces the barem on OK', ...)                  // one upload call
it('does not ask for the first barem', ...)          // confirm not called
it('does not ask before replacing the test file', ...)
it('shows the picked file name next to the button', ...)  // text 'nou.pdf' in .file-chosen
```

Use the names `fakeApi.ts` already has for recorded calls.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx src/admin/pages/NewTestPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the component, the CSS, and `confirm` in the barem row: `file ? (picked) => window.confirm(\`Înlocuiești baremul existent cu ${picked.name}?\`) : undefined`.

- [ ] **Step 4: Run the tests and look at it**

Run: `npx vitest run src; npm run typecheck`
Expected: PASS.
Then start the `web` and `api` previews (`.claude/launch.json`), open a test page, and with `javascript_tool` check at 1280 px that the button and the file name share one row (same `offsetTop`), and at 375 px (`resize_window` preset mobile) that `.file-chosen` is below the buttons and `document.documentElement.scrollWidth <= innerWidth`. Reset with preset desktop.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Put the file button on the action's line and ask before replacing a barem"
```

### Task 9: The barem row and the evaluation buttons

**Files:**
- Create: `src/admin/testPage/GeneratedBarem.tsx` (the generate button, waiting line, failed line, unchecked warning and confirm button)
- Modify: `src/admin/testPage/TestFiles.tsx` (passes it as `actions` and below the row)
- Modify: `src/admin/testPage/EvaluationControls.tsx` (disabled with a reason)
- Modify: `src/admin/api.ts` (`generateBarem(code)`, `confirmBarem(code, filesVersion)`), `src/test/fakeApi.ts`
- Modify: the test page's refresh rule (refresh every 10 s also while `barem.request === 'requested'`; find where the print PDF's 10 s refresh is decided)
- Modify: `src/AGENTS.md`, `runner/AGENTS.md`, `server/AGENTS.md`, root `AGENTS.md` (one line each: the barem job, `BAREM_ACTIVE`, the new mode), `docs/deploy.md` (migration 0020 before the code)
- Test: `src/admin/testPage/GeneratedBarem.test.tsx` (new), `src/admin/pages/TestPage.test.tsx`

**Interfaces:**
- Consumes: `TestInfo.barem`, `TestInfo.filesVersion` (Task 1), the two teacher routes (Task 2), `TestFileInput.actions` (Task 8).
- Produces: `GeneratedBarem({ test, onChanged, onRobot })`.

- [ ] **Step 1: Write the failing tests**

```ts
it('generates without asking when there is no barem', ...)   // click 'Generează baremul' → generateBarem called, confirm not called
it('asks before replacing a barem by generation', ...)       // confirm text from Global Constraints; false → no call
it('is disabled without a test file, with the hint', ...)    // 'Încarcă întâi testul.'
it('is hidden in evaluation and done', ...)
it('shows the waiting line while generating', ...)           // 'Se generează baremul… Durează câteva minute.', button disabled
it('shows the failure and retries', ...)                     // 'Nu am putut genera baremul.', 'Încearcă din nou' → generateBarem
it('confirms an unchecked barem with the shown version', ...)  // warning text; 'Am verificat baremul' → confirmBarem(code, 7)
it('disables the evaluation buttons while the barem is unchecked', ...)  // 'Verifică baremul generat înainte de evaluare.'
it('disables the evaluation buttons while the barem is generating', ...) // 'Baremul se generează încă.'
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/admin/testPage/GeneratedBarem.test.tsx src/admin/pages/TestPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the component, the API calls, the fake API, the disabled reasons (add them to the `missing` list in `EvaluationControls.tsx`), the refresh rule, and the doc lines.

- [ ] **Step 4: Run everything**

Run: `npm test` (once, alone), `npm run typecheck`, `npm run build`.
Expected: all PASS.
Then `npm run db:local`, `npm run preview`, `npm run smoke` (second terminal): the smoke test still passes. In the browser pane, request a barem on a local test and check the waiting line, then set `barem_unchecked = 1` with `wrangler d1 execute --local` and check the warning and the disabled "Pornește evaluarea".

- [ ] **Step 5: Commit**

```bash
git add src docs AGENTS.md runner/AGENTS.md server/AGENTS.md
git commit -m "Show the generated barem on the test page"
```

### Task 10: Go-live check (with the user)

- [ ] Run `wrangler d1 migrations apply --remote` for 0020 before merging (`docs/deploy.md`).
- [ ] `npm run try:skill -- barem <folder>` on this PC with `Test - Permutari.docx` in a folder outside the repo; the user compares `barem.docx` with the sample.
- [ ] After the merge: one real run on GitHub with the same test; the user opens the Word file, clicks "Am verificat baremul", and starts an evaluation.
