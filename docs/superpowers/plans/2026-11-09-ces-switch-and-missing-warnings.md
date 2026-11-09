# MQGrader: the CES switch and the warnings for what is missing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The last task (Check, live database, push) must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (the live migration, push) needs the user's explicit yes.

**Goal:** A teacher cannot miss that a class has a CES student: Test nou shows the CES students and a switch "Test separat pentru elevii cu CES" (on by default) with the CES test and CES barem beside the class ones; the test page has the same switch; and a draft or open test says clearly what it misses (the test, the barem, the CES test, the CES barem) in the stages, in "De făcut", with orange marks, and in a list under "Creează testul" and "Începe testul".

**Architecture:** One migration (0025) adds `tests.ces_off` ("the teacher said no CES test"). Test nou sends `cesOff`; `PUT /api/admin/tests/:code/ces/off` turns it off (removing the CES files in a guarded write) or on; a CES file turns it on. The tests list gets `prepared.ces` (`wanted`, the CES files, the CES barem request). One shared function, `missingParts` / `missingOf` (`src/admin/missing.ts`), gives the ordered list of what a draft or open test misses; `todo.ts` turns it into a fourth "De făcut" case, so the stage bar follows. The CES barem job waits while the class barem is being generated.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1 and R2, Vitest 5, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-09-ces-switch-and-missing-warnings-design.md` (approved by the user on 2026-11-09, from the mockup in the visual companion). It builds on `docs/superpowers/specs/2026-11-09-ces-variant-design.md` and ships in the same pull request (#57). Root `AGENTS.md`, `server/AGENTS.md` and `src/AGENTS.md` hold the project rules.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- One migration, `migrations/0025_ces_off.sql`. It runs on the live database **before** the code reaches `main` (`docs/deploy.md`): the last task asks the user first.
- Every teacher query is scoped by the teacher's id. A write checks its own rules inside its SQL. Every path that makes robot work starts the robot. At most 15 D1 queries and 10 ms of CPU per request.
- No student page says "CES". Student pages do not change.
- Flat colours only; orange only for what waits on the teacher.
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: `.claude/launch.json` entries, untracked plan files, and another session's unfinished landing-page work).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/ces-variant`. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone; the full run then counts as passed when its failed and passed tests add up to the expected passed number.
- **The checkout may hold another session's uncommitted files** (the landing pages: `despre/`, `ghid/`, `preturi/`, `src/landing/pages.*`, `public/sitemap.xml`, …). They can add tests or a type error that this plan does not cause. When the totals or the typecheck differ only by those files, check this plan's commit in a clean worktree (`git worktree add --detach ../QuickEval-check HEAD`, a junction to `node_modules`, `npm run typecheck`, `npm test`; remove the junction first, then the worktree).

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact for the branch alone. If a run shows other numbers or other errors, and the other session's files do not explain them, stop and report.
- The tested prototype of this plan is in the repo as `refs/protosw/h1` … `refs/protosw/h5`, one per task, on `refs/protosw/hbase` (the same files as `feature/ces-variant` at `52b62fd`). After Task N, `git diff --stat refs/protosw/hN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building the prototype on 2026-11-09.

1. **Stored as "off".** `tests.ces_off` defaults to 0, so every existing test, and a test whose class gets a CES student later, asks for the CES files until the teacher says no. "Wanted" is computed: an active CES student in the class and `ces_off = 0`.
2. **The switch replaces "Șterge varianta CES".** Off removes the CES files in the same guarded write as the removal (refused once a paper went to grading with the CES variant, 409 `ces_papers`), and asks first only when there are CES files. "Șterge varianta CES" stays only for a test that has CES files and no CES student left (it calls the switch's route). The server keeps `DELETE /:code/ces`; the browser no longer calls it (`removeCesVariant` leaves `src/admin/api.ts` and the fake).
3. **Every draft or open test**, with or without CES students, now says what it misses: a fourth "De făcut" case ("Adaugă ce lipsește", after the generated-barem cases), so Pregătire is orange with the note ("lipsesc testul și baremul") instead of pale blue. The Teste page's next step for it is "Încarcă" and the first missing part. A first barem generation that failed with no barem file now reads "lipsește baremul" in the stage note; the panel still says it failed.
4. **The CES barem job waits** while the class barem is being generated (`needsBaremSql('ces')`), so the robot writes it with the class barem beside it. A request is never refused for it. The robot test "makes the CES print PDF and the CES barem after the class ones" now makes the CES barem in its next round.
5. **Old tests that drew a draft with no files** and expected "nothing waits" get the files (`Layout.test.tsx`, `TestsPage.test.tsx`, `todo.test.ts`), or the new note (`stages.test.ts`, `SearchPage.test.tsx`, "Clasele tale").
6. **The CES students' names** on the test page come from the uploads rows (`ces` and `active`); on Test nou, from the class (`getClass`). Test nou sends `cesOff` only for a class with an active CES student, so a class without one creates its test exactly as before.

## Review Focus

1. Turning the switch off never removes CES files a graded paper used: the check is in the UPDATE's SQL (`setCesOff`), tested in Task 1 ("is refused once a paper went to grading with the CES variant").
2. A teacher who turned the switch off is never asked for CES files again for that test: `missingParts` reads `ces.wanted` (tests in Task 2, "asks for the CES test and the CES barem while the class has a CES student and the switch is on").
3. A class with no CES student shows no CES box, no switch and no CES warning (tests in Task 2 and Task 4).
4. "De făcut" now counts drafts without files: the count in the bar rises for a teacher who makes drafts ahead. This is the user's choice; check that the Teste page, "Clasele tale" and the bar agree (Task 2's tests).
5. A CES file uploaded while the switch is off turns it on in the same UPDATE (test in Task 1, "turns the switch on"); no path leaves CES files on a test with `ces_off = 1`.

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch and the prototype**

Run: `git status --short --branch` and `git log --oneline -1`
Expected: `## feature/ces-variant...origin/feature/ces-variant`, HEAD `52b62fd Add the design of the CES switch and the warnings for what is missing` (or a later commit that only adds this plan). Changes to tracked files only in `.claude/launch.json` and the other session's landing-page files.

Run: `git rev-parse --verify refs/protosw/h5`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

### Task 1: Keep the CES switch on the test

The server side: migration 0025, `cesOff` on create, `PUT /:code/ces/off`, a CES file turns the switch on, `TestSummary.prepared.ces`, `CesVariantInfo.off`, and the CES barem job that waits for the class barem.

**Files:**
- Create: `migrations/0025_ces_off.sql`, `server/routes/cesSwitch.test.ts`
- Modify: `shared/api.ts`, `server/db/variant.ts`, `server/db/tests.ts`, `server/routes/tests.ts`, `server/routes/cesVariant.ts`, `src/admin/api.ts`, `src/test/fakeApi.ts`
- Test: `server/routes/cesSwitch.test.ts`, `server/routes/cesVariant.test.ts`, `server/routes/tests.test.ts`, `runner/run.test.ts`

**Interfaces:**
- Consumes: the CES variant's `columns`, `toCesInfo`, `requireTest`, `deleteFilesQuietly`, `robotStarter`.
- Produces: `createTestBody.cesOff?: boolean`; `cesOffBody = { off: boolean }`; `CesOffAnswer = { ces: CesVariantInfo; robot: RobotStart | null }`; `CesVariantInfo.off: boolean`; `CesPrepared = { wanted: boolean; testFile: boolean; baremFile: boolean; baremRequest: BaremRequest }` as `TestSummary.prepared.ces`; `setCesOff(db, teacherId, testId, off, now): Promise<string[] | null>` in `server/db/tests.ts`; `createTest(…, cesOff = false)`; `api.setCesOff(code, off): Promise<CesOffAnswer>`; `NO_CES_PREPARED` and `noCesVariant({ off })` in `src/test/fakeApi.ts`.

- [ ] **Step 1: Create `server/routes/cesSwitch.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { NEEDS_CES_BAREM } from '../db/runner.ts';
import { addCesFiles, addSubmission, makeClass, makeTest, markCes, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The CES switch (spec: CES switch and missing warnings): "Test separat pentru
// elevii cu CES", on by default; off removes the CES files.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let classId: number;
let students: number[];
let code: string;

const setTest = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(code).run();
const testOf = async (target = code) => (await api.request('GET', `/api/admin/tests/${target}`)).body.test;
const listed = async () => (await api.request('GET', '/api/admin/tests?year=2026')).body.tests.find((t: { code: string }) => t.code === code);
const setOff = (off: boolean) => api.request('PUT', `/api/admin/tests/${code}/ces/off`, { off });

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '9R2', ['Bursașiu Teodor', 'Ene Ana']);
  classId = cls.id;
  students = cls.studentIds;
  code = await makeTest(api, classId);
});

afterEach(async () => {
  await api.dispose();
});

describe('a new test and the CES switch', () => {
  it('is on unless Test nou turned it off', async () => {
    expect((await testOf()).ces.off).toBe(false);
    const res = await api.request('POST', '/api/admin/tests', { classId, title: 'Fără CES', cesOff: true });
    expect(res.status).toBe(201);
    expect((await testOf(res.body.code)).ces.off).toBe(true);
  });

  it('gives the tests list what the CES variant has, wanted only with an active CES student and the switch on', async () => {
    expect((await listed()).prepared.ces).toEqual({ wanted: false, testFile: false, baremFile: false, baremRequest: 'none' });
    await markCes(api, students[0]!);
    expect((await listed()).prepared.ces).toEqual({ wanted: true, testFile: false, baremFile: false, baremRequest: 'none' });
    await addCesFiles(api, code, ['test']);
    await setTest("ces_barem_request = 'requested'");
    expect((await listed()).prepared.ces).toEqual({ wanted: true, testFile: true, baremFile: false, baremRequest: 'requested' });
    await setTest('ces_off = 1');
    expect((await listed()).prepared.ces.wanted).toBe(false);
  });
});

describe('PUT /ces/off', () => {
  it('off removes the CES files, from the database and from R2; on asks for them again', async () => {
    await markCes(api, students[0]!);
    const key = `t/1/2026/${code}/ces/test/test-adaptat.pdf`;
    await api.env.FILES.put(key, '%PDF-1.7 ces');
    await setTest(`ces_test_file_key = '${key}', ces_test_file_name = 'Test adaptat.pdf', ces_test_file_type = '${PDF_TYPE}'`);
    const off = await setOff(true);
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ ces: { off: true, files: { test: null, barem: null } }, robot: null });
    expect(await api.env.FILES.get(key)).toBeNull();
    expect((await listed()).prepared.ces.wanted).toBe(false);

    const on = await setOff(false);
    expect(on.body).toMatchObject({ ces: { off: false }, robot: null });
    expect((await listed()).prepared.ces.wanted).toBe(true);
  });

  it('is refused once a paper went to grading with the CES variant', async () => {
    await addCesFiles(api, code);
    const id = await addSubmission(api, code, students[0]!, { status: 'graded', files: 1 });
    await api.db.prepare("UPDATE submissions SET variant = 'ces' WHERE id = ?").bind(id).run();
    const res = await setOff(true);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ces_papers');
    expect((await testOf()).ces).toMatchObject({ off: false, files: { test: { name: 'ces-test.pdf' } } });
  });

  it('starts the robot during the evaluation: the CES papers that waited go as class papers', async () => {
    await startTest(api, code);
    await addCesFiles(api, code, ['test']);
    await markCes(api, students[0]!);
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    const res = await setOff(true);
    expect(res.body.robot).toBe('dispatched');
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
  });

  it('answers 404 for an unknown test', async () => {
    expect((await api.request('PUT', '/api/admin/tests/9R2-26T9/ces/off', { off: true })).status).toBe(404);
  });
});

describe('a CES file', () => {
  it('turns the switch on', async () => {
    await setOff(true);
    const res = await api.fetch(`/api/admin/tests/${code}/ces/files/test`, {
      method: 'PUT',
      body: new TextEncoder().encode('%PDF-1.7 ces'),
      headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': encodeURIComponent('Test adaptat.pdf') },
    });
    expect(res.status).toBe(200);
    expect((await testOf()).ces.off).toBe(false);
  });
});

describe('the CES barem job', () => {
  it('waits while the class barem is being generated', async () => {
    const waiting = async () =>
      (await api.db.prepare(`SELECT COUNT(*) AS n FROM tests t WHERE ${NEEDS_CES_BAREM}`).first<{ n: number }>())!.n;
    await addCesFiles(api, code, ['test']);
    await setTest("ces_barem_request = 'requested', barem_request = 'requested'");
    expect(await waiting()).toBe(0);
    await setTest("barem_request = 'none'");
    expect(await waiting()).toBe(1);
  });
});
```

- [ ] **Step 2: Edit `server/routes/cesVariant.test.ts`**

Find this block:

```ts
      studentCount: 0,
      files: { test: null, barem: null },
```

Replace it with:

```ts
      studentCount: 0,
      off: false,
      files: { test: null, barem: null },
```

- [ ] **Step 3: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
    const prepared = Object.fromEntries(res.body.tests.map((t: { title: string; prepared: unknown }) => [t.title, t.prepared]));
    expect(prepared).toEqual({
      Gol: { testFile: false, baremFile: false, print: 'none', uploadLink: true },
      Gata: { testFile: true, baremFile: true, print: 'ready', uploadLink: true },
      Vechi: { testFile: false, baremFile: false, print: 'none', uploadLink: false },
    });
```

Replace it with:

```ts
    const prepared = Object.fromEntries(res.body.tests.map((t: { title: string; prepared: unknown }) => [t.title, t.prepared]));
    const ces = { wanted: false, testFile: false, baremFile: false, baremRequest: 'none' };
    expect(prepared).toEqual({
      Gol: { testFile: false, baremFile: false, print: 'none', uploadLink: true, ces },
      Gata: { testFile: true, baremFile: true, print: 'ready', uploadLink: true, ces },
      Vechi: { testFile: false, baremFile: false, print: 'none', uploadLink: false, ces },
    });
```

- [ ] **Step 4: Edit `runner/run.test.ts`**

Find this block:

```ts
  it('makes the CES print PDF and the CES barem after the class ones', async () => {
    await setUp(1, 1, false);
```

Replace it with:

```ts
  it('makes the CES print PDF and the CES barem after the class ones', async () => {
    // The CES barem waits while the class barem is being generated: the robot
    // makes it in its next round, after the open test's grading.
    await setUp(1, 1, false);
```

- [ ] **Step 5: Edit `runner/run.test.ts`**

Find this block:

```ts
    await world!.api.env.FILES.put('fixture/ces.pdf', '%PDF-1.7 ces');
    const claude = scriptedClaude(answer(BAREM), answer(BAREM), answer(LIST), answer(GRADING));
    const { run, requests } = recordedRun(claude);
```

Replace it with:

```ts
    await world!.api.env.FILES.put('fixture/ces.pdf', '%PDF-1.7 ces');
    const claude = scriptedClaude(answer(BAREM), answer(LIST), answer(GRADING), answer(BAREM));
    const { run, requests } = recordedRun(claude);
```

- [ ] **Step 6: Run the new tests to see them fail**

Run: `npx vitest run server/routes/cesSwitch.test.ts server/routes/cesVariant.test.ts server/routes/tests.test.ts runner/run.test.ts`
Expected: FAIL. `Test Files  4 failed (4)`, `Tests  10 failed | 81 passed (91)`: the test has no `ces.off` and the tests list no `prepared.ces` (`expected undefined to be false`), the route does not exist (`expected 404 to be 200`), the CES barem job does not wait for the class barem (`expected 1 to be +0`), the old shapes are not the new ones (`tests.test.ts`, `cesVariant.test.ts`), and the robot makes the CES barem in its first round (`run.test.ts`).

- [ ] **Step 7: Create `migrations/0025_ces_off.sql`**

```sql
-- The CES switch (spec: docs/superpowers/specs/2026-11-09-ces-switch-and-missing-warnings-design.md).
-- tests.ces_off: the teacher said "no separate test for the CES students" for
-- this test. Stored as "off", so every test, also one whose class gets a CES
-- student later, asks for the CES files until the teacher says no.
ALTER TABLE tests ADD COLUMN ces_off INTEGER NOT NULL DEFAULT 0 CHECK (ces_off IN (0, 1));
```

- [ ] **Step 8: Edit `shared/api.ts`**

Find this block:

```ts
  title: testTitleSchema,
});

```

Replace it with:

```ts
  title: testTitleSchema,
  // The CES switch turned off on Test nou: no separate test for the CES students.
  cesOff: z.boolean().optional(),
});

// The CES switch of a test: off removes the CES files.
export const cesOffBody = z.object({ off: z.boolean() });

```

- [ ] **Step 9: Edit `shared/api.ts`**

Find this block:

```ts

export interface TestSummary {
```

Replace it with:

```ts

// What the CES variant of a test has, for the list of what is missing.
// `wanted`: the class has an active CES student and the teacher did not turn
// the CES switch off.
export interface CesPrepared {
  wanted: boolean;
  testFile: boolean;
  baremFile: boolean;
  baremRequest: BaremRequest;
}

export interface TestSummary {
```

- [ ] **Step 10: Edit `shared/api.ts`**

Find this block:

```ts
  // teacher asks on the test page. The Teste page draws the stages from it.
  prepared: { testFile: boolean; baremFile: boolean; print: PrintStatus; uploadLink: boolean };
  // The CES variant's barem, while the test has a CES test file: "De făcut"
```

Replace it with:

```ts
  // teacher asks on the test page. The Teste page draws the stages from it.
  prepared: { testFile: boolean; baremFile: boolean; print: PrintStatus; uploadLink: boolean; ces: CesPrepared };
  // The CES variant's barem, while the test has a CES test file: "De făcut"
```

- [ ] **Step 11: Edit `shared/api.ts`**

Find this block:

```ts
  studentCount: number;
  files: Record<TestFileKind, TestFileInfo | null>;
```

Replace it with:

```ts
  studentCount: number;
  // The CES switch is off: the teacher wants no separate test for the CES
  // students of this test.
  off: boolean;
  files: Record<TestFileKind, TestFileInfo | null>;
```

- [ ] **Step 12: Edit `shared/api.ts`**

Find this block:

```ts
  robot: RobotStart | null;
}

// "Încearcă din nou" on a print PDF that failed.
```

Replace it with:

```ts
  robot: RobotStart | null;
}

export type CesOffAnswer = CesRemovedAnswer;

// "Încearcă din nou" on a print PDF that failed.
```

- [ ] **Step 13: Edit `server/db/variant.ts`**

Find this block:

```ts
// A test (alias `t`) with a test file of the variant whose barem the teacher
// asked the robot to generate. A flat condition, like needsPrintSql.
export function needsBaremSql(variant: TestVariant, t = 't'): string {
  const c = columns(variant);
  return `${t}.status IN (${baremStatuses(variant)}) AND ${t}.${c('test_file_key')} IS NOT NULL AND ${t}.${c('barem_request')} = 'requested'`;
}
```

Replace it with:

```ts
// A test (alias `t`) with a test file of the variant whose barem the teacher
// asked the robot to generate. A flat condition, like needsPrintSql. The CES
// barem waits while the class barem is being generated: it is written with the
// class barem beside it, and reuses its exercise ids.
export function needsBaremSql(variant: TestVariant, t = 't'): string {
  const c = columns(variant);
  const afterClass = variant === 'ces' ? ` AND ${t}.barem_request <> 'requested'` : '';
  return `${t}.status IN (${baremStatuses(variant)}) AND ${t}.${c('test_file_key')} IS NOT NULL AND ${t}.${c('barem_request')} = 'requested'${afterClass}`;
}
```

- [ ] **Step 14: Edit `server/db/tests.ts`**

Find this block:

```ts
    studentCount: number;
    papers: number;
```

Replace it with:

```ts
    studentCount: number;
    off: boolean;
    papers: number;
```

- [ ] **Step 15: Edit `server/db/tests.ts`**

Find this block:

```ts
  ces_print_file_key: string | null;
  ces_total_points: number | null;
```

Replace it with:

```ts
  ces_print_file_key: string | null;
  ces_off: number;
  ces_total_points: number | null;
```

- [ ] **Step 16: Edit `server/db/tests.ts`**

Find this block:

```ts
    t.ces_barem_file_key, t.ces_barem_file_name, t.ces_barem_file_type, t.ces_barem_notes, t.ces_barem_request, t.ces_barem_unchecked,
    t.ces_files_version, t.ces_exercise_list_status, t.ces_exercise_list_message, t.ces_print_status, t.ces_print_file_key,
    json_extract(t.ces_exercise_list_json, '$.totalPoints') AS ces_total_points,
```

Replace it with:

```ts
    t.ces_barem_file_key, t.ces_barem_file_name, t.ces_barem_file_type, t.ces_barem_notes, t.ces_barem_request, t.ces_barem_unchecked,
    t.ces_files_version, t.ces_exercise_list_status, t.ces_exercise_list_message, t.ces_print_status, t.ces_print_file_key, t.ces_off,
    json_extract(t.ces_exercise_list_json, '$.totalPoints') AS ces_total_points,
```

- [ ] **Step 17: Edit `server/db/tests.ts`**

Find this block:

```ts
        uploadLink: row.upload_token !== null,
      },
```

Replace it with:

```ts
        uploadLink: row.upload_token !== null,
        ces: {
          wanted: row.ces_student_count > 0 && row.ces_off === 0,
          testFile: row.ces_test_file_key !== null,
          baremFile: row.ces_barem_file_key !== null,
          baremRequest: row.ces_barem_request,
        },
      },
```

- [ ] **Step 18: Edit `server/db/tests.ts`**

Find this block:

```ts
      studentCount: row.ces_student_count,
      papers: row.ces_papers,
```

Replace it with:

```ts
      studentCount: row.ces_student_count,
      off: row.ces_off === 1,
      papers: row.ces_papers,
```

- [ ] **Step 19: Edit `server/db/tests.ts`**

Find this block:

```ts
    studentCount: ces.studentCount,
    files: { test: fileInfo(ces.files.test), barem: fileInfo(ces.files.barem) },
```

Replace it with:

```ts
    studentCount: ces.studentCount,
    off: ces.off,
    files: { test: fileInfo(ces.files.test), barem: fileInfo(ces.files.barem) },
```

- [ ] **Step 20: Edit `server/db/tests.ts`**

Find this block:

```ts
// number and the next try takes a new one (and a new link). At most 12 queries.
export async function createTest(db: D1Database, teacherId: number, classId: number, title: string, now: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_CODE_TRIES; attempt++) {
```

Replace it with:

```ts
// number and the next try takes a new one (and a new link). At most 12 queries.
export async function createTest(db: D1Database, teacherId: number, classId: number, title: string, now: string, cesOff = false): Promise<string> {
  for (let attempt = 1; attempt <= MAX_CODE_TRIES; attempt++) {
```

- [ ] **Step 21: Edit `server/db/tests.ts`**

Find this block:

```ts
          .prepare(
            'INSERT INTO tests (teacher_id, class_id, number, code, title, upload_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(teacherId, classId, number, code, title, newUploadToken(), now, now),
        db.prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ?').bind(number + 1, classId, teacherId),
```

Replace it with:

```ts
          .prepare(
            'INSERT INTO tests (teacher_id, class_id, number, code, title, upload_token, ces_off, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(teacherId, classId, number, code, title, newUploadToken(), cesOff ? 1 : 0, now, now),
        db.prepare('UPDATE classes SET next_test_number = ? WHERE id = ? AND teacher_id = ?').bind(number + 1, classId, teacherId),
```

- [ ] **Step 22: Edit `server/db/tests.ts`**

Find this block:

```ts
  const statuses = baremStatuses(variant);
  const sql =
    kind === 'test'
      ? `UPDATE tests SET ${c('test_file_key')} = ?, ${c('test_file_name')} = ?, ${c('test_file_type')} = ?, updated_at = ?,
           ${c('files_version')} = ${c('files_version')} + 1,
```

Replace it with:

```ts
  const statuses = baremStatuses(variant);
  // A CES file turns the CES switch on.
  const on = variant === 'ces' ? 'ces_off = 0, ' : '';
  const sql =
    kind === 'test'
      ? `UPDATE tests SET ${on}${c('test_file_key')} = ?, ${c('test_file_name')} = ?, ${c('test_file_type')} = ?, updated_at = ?,
           ${c('files_version')} = ${c('files_version')} + 1,
```

- [ ] **Step 23: Edit `server/db/tests.ts`**

Find this block:

```ts
         RETURNING status`
      : `UPDATE tests SET ${c('barem_file_key')} = ?, ${c('barem_file_name')} = ?, ${c('barem_file_type')} = ?, updated_at = ?,
           ${c('files_version')} = ${c('files_version')} + 1,
```

Replace it with:

```ts
         RETURNING status`
      : `UPDATE tests SET ${on}${c('barem_file_key')} = ?, ${c('barem_file_name')} = ?, ${c('barem_file_type')} = ?, updated_at = ?,
           ${c('files_version')} = ${c('files_version')} + 1,
```

- [ ] **Step 24: Edit `server/db/tests.ts`**

Find this block:

```ts

// Deletes the test row; its uploads and file rows go with it (ON DELETE CASCADE).
```

Replace it with:

```ts

// The CES switch. Off: no separate test for the CES students; the CES files go,
// in the same guarded write as removeCesVariant (refused once a paper went to
// grading with the CES variant). Returns the R2 keys to delete, or null when
// the test is not the teacher's or a CES paper blocks it. On: the switch only.
export async function setCesOff(db: D1Database, teacherId: number, testId: number, off: boolean, now: string): Promise<string[] | null> {
  if (!off) {
    const row = await db
      .prepare('UPDATE tests SET ces_off = 0, updated_at = ? WHERE id = ? AND teacher_id = ? RETURNING id')
      .bind(now, testId, teacherId)
      .first<{ id: number }>();
    return row ? [] : null;
  }
  const [before, written] = await db.batch<{ ces_test_file_key?: string | null; ces_barem_file_key?: string | null; ces_print_file_key?: string | null; id?: number }>([
    db.prepare('SELECT ces_test_file_key, ces_barem_file_key, ces_print_file_key FROM tests WHERE id = ? AND teacher_id = ?').bind(testId, teacherId),
    db
      .prepare(
        `UPDATE tests SET ces_off = 1, ces_test_file_key = NULL, ces_test_file_name = NULL, ces_test_file_type = NULL,
           ces_barem_file_key = NULL, ces_barem_file_name = NULL, ces_barem_file_type = NULL, ces_barem_notes = NULL,
           ces_barem_request = 'none', ces_barem_request_attempts = 0, ces_barem_unchecked = 0,
           ces_exercise_list_json = NULL, ces_exercise_list_status = 'none', ces_exercise_list_message = NULL, ces_exercise_list_attempts = 0,
           ces_print_status = 'none', ces_print_file_key = NULL, ces_print_attempts = 0,
           ces_files_version = ces_files_version + 1, updated_at = ?
         WHERE id = ? AND teacher_id = ?
           AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.variant = 'ces')
         RETURNING id`,
      )
      .bind(now, testId, teacherId),
  ]);
  if (!written?.results[0]) return null;
  const row = before?.results[0];
  return [row?.ces_test_file_key, row?.ces_barem_file_key, row?.ces_print_file_key].filter((key): key is string => typeof key === 'string');
}

// Deletes the test row; its uploads and file rows go with it (ON DELETE CASCADE).
```

- [ ] **Step 25: Edit `server/routes/tests.ts`**

Find this block:

```ts
    const body = await readJson(c, createTestBody);
    const code = await createTest(c.env.DB, c.var.teacher.id, body.classId, body.title, nowIso());
    return c.json({ code }, 201);
```

Replace it with:

```ts
    const body = await readJson(c, createTestBody);
    const code = await createTest(c.env.DB, c.var.teacher.id, body.classId, body.title, nowIso(), body.cesOff ?? false);
    return c.json({ code }, 201);
```

- [ ] **Step 26: Edit `server/routes/cesVariant.ts`**

Find this block:

```ts
  baremNotesBody,
  type BaremCheckedAnswer,
```

Replace it with:

```ts
  baremNotesBody,
  cesOffBody,
  type BaremCheckedAnswer,
```

- [ ] **Step 27: Edit `server/routes/cesVariant.ts`**

Find this block:

```ts
  type BaremNotesAnswer,
  type CesRemovedAnswer,
```

Replace it with:

```ts
  type BaremNotesAnswer,
  type CesOffAnswer,
  type CesRemovedAnswer,
```

- [ ] **Step 28: Edit `server/routes/cesVariant.ts`**

Find this block:

```ts
  saveTestFile,
  toCesInfo,
```

Replace it with:

```ts
  saveTestFile,
  setCesOff,
  toCesInfo,
```

- [ ] **Step 29: Edit `server/routes/cesVariant.ts`**

Find this block:

```ts

  // The teacher's comments for the CES barem, read by the robot as part of it.
```

Replace it with:

```ts

  // The CES switch (spec: CES switch). Off: the CES students get the class
  // test, and the CES files go; refused once a paper went to grading with the
  // CES variant. During the evaluation, the CES papers that waited go to the
  // robot as class papers. On: the page asks for the CES files again.
  routes.put('/:code/ces/off', async (c) => {
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    const body = await readJson(c, cesOffBody);
    const keys = await setCesOff(c.env.DB, teacherId, test.id, body.off, nowIso());
    if (keys === null) {
      throw new ApiError(409, 'ces_papers', 'Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi oprită. Poți înlocui fișierele ei.');
    }
    if (keys.length > 0) await deleteFilesQuietly(c.env.FILES, keys);
    const current = await requireTest(c.env.DB, teacherId, test.summary.code);
    const robot = body.off && current.summary.status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ ces: toCesInfo(current.ces), robot } satisfies CesOffAnswer);
  });

  // The teacher's comments for the CES barem, read by the robot as part of it.
```

- [ ] **Step 30: Edit `src/admin/api.ts`**

Find this block:

```ts
  BaremNotesAnswer,
  CesRemovedAnswer,
```

Replace it with:

```ts
  BaremNotesAnswer,
  CesOffAnswer,
  CesRemovedAnswer,
```

- [ ] **Step 31: Edit `src/admin/api.ts`**

Find this block:

```ts
  removeCesVariant(code: string): Promise<CesRemovedAnswer>;
  startTest(code: string): Promise<StartedTest>;
```

Replace it with:

```ts
  removeCesVariant(code: string): Promise<CesRemovedAnswer>;
  setCesOff(code: string, off: boolean): Promise<CesOffAnswer>;
  startTest(code: string): Promise<StartedTest>;
```

- [ ] **Step 32: Edit `src/admin/api.ts`**

Find this block:

```ts
    removeCesVariant: (code) => request<CesRemovedAnswer>('DELETE', `${test(code)}/ces`),
    startTest: (code) => request<StartedTest>('POST', `${test(code)}/start`),
```

Replace it with:

```ts
    removeCesVariant: (code) => request<CesRemovedAnswer>('DELETE', `${test(code)}/ces`),
    setCesOff: (code, off) => request<CesOffAnswer>('PUT', `${test(code)}/ces/off`, { off }),
    startTest: (code) => request<StartedTest>('POST', `${test(code)}/start`),
```

- [ ] **Step 33: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  BaremNotesAnswer,
  CesRemovedAnswer,
```

Replace it with:

```ts
  BaremNotesAnswer,
  CesOffAnswer,
  CesRemovedAnswer,
```

- [ ] **Step 34: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
        uploadLink: test.uploadToken !== null,
      },
```

Replace it with:

```ts
        uploadLink: test.uploadToken !== null,
        ces: {
          wanted: test.ces.studentCount > 0 && !test.ces.off,
          testFile: test.ces.files.test !== null,
          baremFile: test.ces.files.barem !== null,
          baremRequest: test.ces.barem.request,
        },
      },
```

- [ ] **Step 35: Edit `src/test/fakeApi.ts`**

Find this block:

```ts

// A test as the API returns it, for building fake data in tests.
```

Replace it with:

```ts

// The CES part of `prepared` for a class with no CES student.
export const NO_CES_PREPARED = { wanted: false, testFile: false, baremFile: false, baremRequest: 'none' } as const;

// A test as the API returns it, for building fake data in tests.
```

- [ ] **Step 36: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    studentCount: 0,
    files: { test: null, barem: null },
```

Replace it with:

```ts
    studentCount: 0,
    off: false,
    files: { test: null, barem: null },
```

- [ ] **Step 37: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      // Made again from the files and the uploads (withDerived).
      prepared: { testFile: false, baremFile: false, print: 'none', uploadLink: false },
      cesBarem: null,
```

Replace it with:

```ts
      // Made again from the files and the uploads (withDerived).
      prepared: { testFile: false, baremFile: false, print: 'none', uploadLink: false, ces: NO_CES_PREPARED },
      cesBarem: null,
```

- [ ] **Step 38: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    barem: { request: 'none', unchecked: false },
    prepared: { testFile: true, baremFile: true, print: 'ready', uploadLink: true, ...prepared },
    cesBarem: null,
```

Replace it with:

```ts
    barem: { request: 'none', unchecked: false },
    prepared: { testFile: true, baremFile: true, print: 'ready', uploadLink: true, ces: NO_CES_PREPARED, ...prepared },
    cesBarem: null,
```

- [ ] **Step 39: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    ),
    createTest: vi.fn(async (input: { classId: number; title: string }) => {
      const cls = data.classes.find((c) => c.id === input.classId);
```

Replace it with:

```ts
    ),
    createTest: vi.fn(async (input: { classId: number; title: string; cesOff?: boolean }) => {
      const cls = data.classes.find((c) => c.id === input.classId);
```

- [ ] **Step 40: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      const created = fakeTest(
        { code: buildTestCode(cls.name, cls.schoolYear, number), title: input.title, classId: cls.id, className: cls.name, schoolYear: cls.schoolYear },
        uploads,
```

Replace it with:

```ts
      const created = fakeTest(
        {
          code: buildTestCode(cls.name, cls.schoolYear, number),
          title: input.title,
          classId: cls.id,
          className: cls.name,
          schoolYear: cls.schoolYear,
          ces: noCesVariant({ studentCount: students.filter((s) => s.ces).length, off: input.cesOff ?? false }),
        },
        uploads,
```

- [ ] **Step 41: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      if (variant === 'ces') {
        // Like the server: the CES variant's own files, print PDF and list.
        found.ces.files[kind] = info;
```

Replace it with:

```ts
      if (variant === 'ces') {
        // Like the server: the CES variant's own files, print PDF and list; a
        // CES file turns the CES switch on.
        found.ces.off = false;
        found.ces.files[kind] = info;
```

- [ ] **Step 42: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      return { barem: parts.barem };
    }),
```

Replace it with:

```ts
      return { barem: parts.barem };
    }),
    // Like the server: off removes the CES files, only while no paper went to
    // grading with the CES variant.
    setCesOff: vi.fn(async (code: string, off: boolean): Promise<CesOffAnswer> => {
      const found = findTest(code).test;
      if (off && found.ces.papers > 0) {
        throw new ApiError(409, 'ces_papers', 'Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi oprită.');
      }
      found.ces = off ? noCesVariant({ studentCount: found.ces.studentCount, filesVersion: found.ces.filesVersion + 1, off: true }) : { ...found.ces, off: false };
      return { ces: found.ces, robot: off && found.status === 'evaluating' ? 'dispatched' : null };
    }),
```

- [ ] **Step 43: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type error; `Test Files  139 passed | 1 skipped (140)`, `Tests  2177 passed | 3 skipped (2180)`.

- [ ] **Step 44: Commit**

```bash
git add migrations/0025_ces_off.sql shared/api.ts server/db/variant.ts server/db/tests.ts server/routes/tests.ts server/routes/cesVariant.ts server/routes/cesSwitch.test.ts server/routes/cesVariant.test.ts server/routes/tests.test.ts runner/run.test.ts src/admin/api.ts src/test/fakeApi.ts
git commit -m "Add the CES switch to the test: off by Test nou or by the test page"
```

### Task 2: Say what a draft or open test misses, in the stages and in "De făcut"

**Files:**
- Create: `src/admin/missing.ts`
- Modify: `src/admin/shell/todo.ts`, `src/admin/testsPage/nextStep.ts`
- Test: `src/admin/shell/todo.test.ts`, `src/admin/stages.test.ts`, `src/admin/testsPage/nextStep.test.ts`, `src/admin/Layout.test.tsx`, `src/admin/pages/TestsPage.test.tsx`, `src/admin/pages/SearchPage.test.tsx`

**Interfaces:**
- Consumes: Task 1's `TestSummary.prepared.ces` (`CesPrepared`) and `noCesVariant({ off })`.
- Produces: `MissingPart = 'test' | 'barem' | 'cesTest' | 'cesBarem'`; `PreparedParts`; `missingParts(parts): MissingPart[]`; `missingOf(test: TestSummary): MissingPart[]` (empty unless draft or open); `missingNames`, `missingNote`, `missingName`; `MISSING_TASK = 'Adaugă ce lipsește'` in `shell/todo.ts`.

- [ ] **Step 1: Edit `src/admin/shell/todo.test.ts`**

Find this block:

```ts

const summary = (overrides: Partial<TestSummary>): TestSummary => fakeTest({ title: 'Ecuații', ...overrides }).test;
const generated = { request: 'none', unchecked: true } as const;
```

Replace it with:

```ts

// A test with its test file and barem, so that it misses nothing.
const file = { name: 'f.pdf', type: 'application/pdf' };
const withFiles = { files: { test: file, barem: file } };
const summary = (overrides: Partial<TestInfo>): TestSummary => fakeTest({ title: 'Ecuații', ...withFiles, ...overrides }).test;
const generated = { request: 'none', unchecked: true } as const;
```

- [ ] **Step 2: Edit `src/admin/shell/todo.test.ts`**

Find this block:

```ts

describe('todoList', () => {
```

Replace it with:

```ts

describe('what a draft or open test misses, in "De făcut"', () => {
  const missingCes = (overrides: Partial<TestInfo> = {}) =>
    summary({ ces: noCesVariant({ studentCount: 1 }), ...overrides });

  it('asks for the test file and the barem, at Pregătire', () => {
    expect(todoOf(summary({ files: { test: null, barem: null } }))).toMatchObject({
      stage: 'Pregătire',
      task: 'Adaugă ce lipsește',
      text: 'Lipsesc: testul și baremul.',
      action: 'Deschide',
      short: 'lipsesc testul și baremul',
    });
    expect(todoOf(summary({ status: 'open', files: { test: file, barem: null } }))).toMatchObject({ text: 'Lipsește: baremul.', short: 'lipsește baremul' });
    // A barem being generated is not missing.
    expect(todoOf(summary({ files: { test: file, barem: null }, barem: { request: 'requested', unchecked: false } }))).toBeNull();
  });

  it('asks for the CES test and the CES barem while the class has a CES student and the switch is on', () => {
    expect(todoOf(missingCes())).toMatchObject({ text: 'Lipsesc: testul CES și baremul CES.', short: 'lipsesc testul CES și baremul CES' });
    expect(todoOf(summary({ files: { test: null, barem: file }, ces: noCesVariant({ studentCount: 2 }) }))?.text).toBe(
      'Lipsesc: testul, testul CES și baremul CES.',
    );
    expect(todoOf(missingCes({ ces: noCesVariant({ studentCount: 1, off: true }) }))).toBeNull();
    expect(todoOf(missingCes({ ces: noCesVariant({ studentCount: 1, files: { test: file, barem: null }, barem: { request: 'requested', unchecked: false } }) }))).toBeNull();
  });

  it('asks nothing of a test in evaluation or done, and checks a generated barem first', () => {
    expect(todoOf(missingCes({ status: 'evaluating', gradedCount: 1 }))).toBeNull();
    expect(todoOf(missingCes({ status: 'draft', barem: generated }))?.task).toBe('Verifică baremul generat');
  });
});

describe('todoList', () => {
```

- [ ] **Step 3: Edit `src/admin/shell/todo.test.ts`**

Find this block:

```ts
describe('the CES barem in "De făcut"', () => {
  const withCes = (overrides: Partial<TestInfo>): TestSummary => fakeTest({ title: 'Ecuații', ...overrides }).test;
  const ces = (barem: { request: 'none' | 'requested' | 'failed'; unchecked: boolean }) =>
```

Replace it with:

```ts
describe('the CES barem in "De făcut"', () => {
  const withCes = (overrides: Partial<TestInfo>): TestSummary => fakeTest({ title: 'Ecuații', ...withFiles, ...overrides }).test;
  const ces = (barem: { request: 'none' | 'requested' | 'failed'; unchecked: boolean }) =>
```

- [ ] **Step 4: Edit `src/admin/stages.test.ts`**

Find this block:

```ts
const CASES: [string, TestSummary, string, string][] = [
  ['a draft without its test file', summary({ prepared: { testFile: false, baremFile: false, print: 'none' } }), 'nlllll', 'Pregătire · lipsește testul'],
  [
```

Replace it with:

```ts
const CASES: [string, TestSummary, string, string][] = [
  ['a draft without its test file', summary({ prepared: { testFile: false, baremFile: false, print: 'none' } }), 'wlllll', 'Pregătire · lipsesc testul și baremul'],
  [
```

- [ ] **Step 5: Edit `src/admin/stages.test.ts`**

Find this block:

```ts
  ],
  ['a draft without a barem, printed', summary({ prepared: { testFile: true, baremFile: false, print: 'ready' } }), 'ndllll', 'Pregătire · lipsește baremul'],
  ['a draft whose generated barem waits', summary({ barem: { request: 'none', unchecked: true } }), 'wdllll', 'Pregătire · baremul de verificat'],
```

Replace it with:

```ts
  ],
  ['a draft without a barem, printed', summary({ prepared: { testFile: true, baremFile: false, print: 'ready' } }), 'wdllll', 'Pregătire · lipsește baremul'],
  [
    'a draft of a class with a CES student, without the CES files',
    summary({ prepared: { ces: { wanted: true, testFile: false, baremFile: false, baremRequest: 'none' } } }),
    'wdllll',
    'Pregătire · lipsesc testul CES și baremul CES',
  ],
  [
    'a draft of a class with a CES student, the CES barem generated',
    summary({ prepared: { ces: { wanted: true, testFile: true, baremFile: false, baremRequest: 'requested' } } }),
    'ddllll',
    'În clasă · testul nu a început',
  ],
  [
    'an open test whose CES test is missing',
    summary({ status: 'open', ...started, prepared: { ces: { wanted: true, testFile: false, baremFile: true, baremRequest: 'none' } } }),
    'wdnlll',
    'Pregătire · lipsește testul CES',
  ],
  ['a draft whose generated barem waits', summary({ barem: { request: 'none', unchecked: true } }), 'wdllll', 'Pregătire · baremul de verificat'],
```

- [ ] **Step 6: Edit `src/admin/stages.test.ts`**

Find this block:

```ts
  ['a done test without a graded paper', summary({ status: 'done', ...started, submittedCount: 2 }), 'dddddl', 'Rezultate · nicio lucrare corectată'],
  ['a draft whose first barem generation failed', summary({ barem: { request: 'failed', unchecked: false }, prepared: { testFile: true, baremFile: false, print: 'ready' } }), 'ndllll', 'Pregătire · baremul nu s-a generat'],
  ['an archived test with unpublished results', summary({ status: 'done', ...graded, archived: true }), 'dddddl', 'Rezultate · nepublicate'],
```

Replace it with:

```ts
  ['a done test without a graded paper', summary({ status: 'done', ...started, submittedCount: 2 }), 'dddddl', 'Rezultate · nicio lucrare corectată'],
  ['a draft whose first barem generation failed', summary({ barem: { request: 'failed', unchecked: false }, prepared: { testFile: true, baremFile: false, print: 'ready' } }), 'wdllll', 'Pregătire · lipsește baremul'],
  ['an archived test with unpublished results', summary({ status: 'done', ...graded, archived: true }), 'dddddl', 'Rezultate · nepublicate'],
```

- [ ] **Step 7: Edit `src/admin/testsPage/nextStep.test.ts`**

Find this block:

```ts
  ['uploads the missing barem', fakeSummary({ prepared: { testFile: true, baremFile: false, print: 'ready' } }), page('Încarcă baremul')],
  [
```

Replace it with:

```ts
  ['uploads the missing barem', fakeSummary({ prepared: { testFile: true, baremFile: false, print: 'ready' } }), page('Încarcă baremul')],
  [
    'uploads the missing CES test',
    fakeSummary({ prepared: { ces: { wanted: true, testFile: false, baremFile: false, baremRequest: 'none' } } }),
    page('Încarcă testul CES'),
  ],
  [
    'uploads the missing CES barem',
    fakeSummary({ prepared: { ces: { wanted: true, testFile: true, baremFile: false, baremRequest: 'none' } } }),
    page('Încarcă baremul CES'),
  ],
  [
```

- [ ] **Step 8: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, fakeAccount, fakeTeacher, fakeTest } from '../test/fakeApi.ts';
```

Replace it with:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestInfo } from '../../shared/api.ts';
import { createFakeApi, fakeAccount, fakeTeacher, fakeTest } from '../test/fakeApi.ts';
```

- [ ] **Step 9: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
// A screen as narrow as a phone (below 900px), for the code that asks.
const onPhone = () =>
```

Replace it with:

```tsx
// A screen as narrow as a phone (below 900px), for the code that asks.
// The files of a draft or open test that misses nothing.
const file = { name: 'f.pdf', type: 'application/pdf' };
const files = { test: file, barem: file };

const onPhone = () =>
```

- [ ] **Step 10: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx

const withClasses = () =>
  createFakeApi({
```

Replace it with:

```tsx

// The open test misses its files unless given them.
const withClasses = (open: Partial<TestInfo> = {}) =>
  createFakeApi({
```

- [ ] **Step 11: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open' }),
      fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done' }),
```

Replace it with:

```tsx
    tests: [
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', ...open }),
      fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done' }),
```

- [ ] **Step 12: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'done', gradedCount: 24, flagCount: 3 }),
      fakeTest({ code: '6E3-26T1', title: 'Inducție', classId: 2, className: '6E3', barem: { request: 'none', unchecked: true } }),
      fakeTest({ code: '6E3-26T2', title: 'Mulțimi', classId: 2, className: '6E3', status: 'open' }),
      fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done', gradedCount: 20, resultsOpen: true }),
```

Replace it with:

```tsx
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'done', gradedCount: 24, flagCount: 3 }),
      fakeTest({ code: '6E3-26T1', title: 'Inducție', classId: 2, className: '6E3', barem: { request: 'none', unchecked: true }, files }),
      fakeTest({ code: '6E3-26T2', title: 'Mulțimi', classId: 2, className: '6E3', status: 'open', files }),
      fakeTest({ code: '6E2-26T1', title: 'Fracții', status: 'done', gradedCount: 20, resultsOpen: true }),
```

- [ ] **Step 13: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
  it('says so when nothing waits, and names the tests in work without "other"', async () => {
    renderAdmin('/', withClasses());
    await userEvent.click(await within(await menu()).findByRole('button', { name: 'De făcut' }));
```

Replace it with:

```tsx
  it('says so when nothing waits, and names the tests in work without "other"', async () => {
    renderAdmin('/', withClasses({ files }));
    await userEvent.click(await within(await menu()).findByRole('button', { name: 'De făcut' }));
```

- [ ] **Step 14: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
        students: {},
        tests: [fakeTest({ code: '6E2-26T2', status: 'open' }), fakeTest({ code: '6E2-26T1', status: 'draft' })],
      }),
```

Replace it with:

```tsx
        students: {},
        tests: [fakeTest({ code: '6E2-26T2', status: 'open', files }), fakeTest({ code: '6E2-26T1', status: 'draft', files })],
      }),
```

- [ ] **Step 15: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/clase/1', '/clase/2']);
    expect(links[0]).toHaveTextContent('6E21 elevEcuații · Deschis');
    expect(links[1]).toHaveTextContent('Nimic în lucru');
```

Replace it with:

```tsx
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/clase/1', '/clase/2']);
    // The open test misses its files: they wait on the teacher.
    expect(links[0]).toHaveTextContent('6E21 elevEcuații · Pregătire · lipsesc testul și baremul');
    expect(links[1]).toHaveTextContent('Nimic în lucru');
```

- [ ] **Step 16: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx
    expect(within(draft).getByText('Clasa 6E2 · ciornă')).toBeInTheDocument();
    expect(stageText(draft)).toHaveTextContent('Pregătire · lipsește testul');
    expect(within(draft).getByText('—')).toBeInTheDocument();
```

Replace it with:

```tsx
    expect(within(draft).getByText('Clasa 6E2 · ciornă')).toBeInTheDocument();
    expect(stageText(draft)).toHaveTextContent('Pregătire · lipsesc testul și baremul');
    expect(within(draft).getByText('—')).toBeInTheDocument();
```

- [ ] **Step 17: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx
  it('says so when nothing waits, with no button', async () => {
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {}, tests: [fakeTest({ code: '6E2-26T1', title: 'Fracții' })] }));
    expect(await screen.findByText(/Nimic nu te așteaptă acum\./)).toBeInTheDocument();
```

Replace it with:

```tsx
  it('says so when nothing waits, with no button', async () => {
    const file = { name: 'f.pdf', type: 'application/pdf' };
    const ready = fakeTest({ code: '6E2-26T1', title: 'Fracții', files: { test: file, barem: file } });
    renderAdmin('/', createFakeApi({ classes: oneClass, students: {}, tests: [ready] }));
    expect(await screen.findByText(/Nimic nu te așteaptă acum\./)).toBeInTheDocument();
```

- [ ] **Step 18: Edit `src/admin/pages/SearchPage.test.tsx`**

Find this block:

```tsx
      'Teorema lui StewartClasa 9A · arhivatRezultate · publicate',
      'Ștergerea fracțiilorClasa 10B · ciornăPregătire · lipsește testul',
    ]);
```

Replace it with:

```tsx
      'Teorema lui StewartClasa 9A · arhivatRezultate · publicate',
      'Ștergerea fracțiilorClasa 10B · ciornăPregătire · lipsesc testul și baremul',
    ]);
```

- [ ] **Step 19: Run the new tests to see them fail**

Run: `npx vitest run src/admin/shell/todo.test.ts src/admin/stages.test.ts src/admin/testsPage/nextStep.test.ts src/admin/Layout.test.tsx src/admin/pages/TestsPage.test.tsx src/admin/pages/SearchPage.test.tsx`
Expected: FAIL. `Test Files  6 failed (6)`, `Tests  12 failed | 149 passed (161)`: "De făcut" asks nothing for the missing parts (`expected null to match object`), the next step is not "Încarcă testul CES", Pregătire is pale blue (`expected 'nlllll' to be 'wlllll'`), and the Teste page, the search and "Clasele tale" still say "lipsește testul" or "Deschis". The tests that pass at RED are guards: the drafts given their files still need nothing.

- [ ] **Step 20: Create `src/admin/missing.ts`**

```ts
import type { BaremRequest, CesPrepared, TestSummary } from '../../shared/api.ts';

// What a draft or open test still misses (spec: CES switch and missing
// warnings), in this order: the test file, the barem, and, while the class has
// a CES student and the CES switch is on, the CES test file and the CES barem.
// A barem that is being generated is not missing.
export type MissingPart = 'test' | 'barem' | 'cesTest' | 'cesBarem';

const NAMES: Record<MissingPart, string> = {
  test: 'testul',
  barem: 'baremul',
  cesTest: 'testul CES',
  cesBarem: 'baremul CES',
};

// What a test has, or what Test nou will give it.
export interface PreparedParts {
  testFile: boolean;
  baremFile: boolean;
  baremRequest: BaremRequest;
  ces: CesPrepared;
}

export function missingParts(parts: PreparedParts): MissingPart[] {
  const missing: MissingPart[] = [];
  if (!parts.testFile) missing.push('test');
  if (!parts.baremFile && parts.baremRequest !== 'requested') missing.push('barem');
  if (parts.ces.wanted) {
    if (!parts.ces.testFile) missing.push('cesTest');
    if (!parts.ces.baremFile && parts.ces.baremRequest !== 'requested') missing.push('cesBarem');
  }
  return missing;
}

// What a test of the tests list misses: nothing once it is in evaluation or done.
export function missingOf(test: TestSummary): MissingPart[] {
  if (test.status !== 'draft' && test.status !== 'open') return [];
  const { testFile, baremFile, ces } = test.prepared;
  return missingParts({ testFile, baremFile, baremRequest: test.barem.request, ces });
}

// "testul", "testul și baremul", "testul, baremul și testul CES".
export function missingNames(missing: MissingPart[]): string {
  const names = missing.map((part) => NAMES[part]);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} și ${names[names.length - 1]}`;
}

// "lipsește testul CES", "lipsesc testul CES și baremul CES".
export function missingNote(missing: MissingPart[]): string {
  return `${missing.length === 1 ? 'lipsește' : 'lipsesc'} ${missingNames(missing)}`;
}

export function missingName(part: MissingPart): string {
  return NAMES[part];
}
```

- [ ] **Step 21: Edit `src/admin/shell/todo.ts`**

Find this block:

```ts
import { countLabel } from '../../ui/format.ts';
import { reviewPath } from '../reviewPage/points.ts';

```

Replace it with:

```ts
import { countLabel } from '../../ui/format.ts';
import { missingNames, missingNote, missingOf } from '../missing.ts';
import { reviewPath } from '../reviewPage/points.ts';

// The task of a test that misses a part (missingOf).
export const MISSING_TASK = 'Adaugă ce lipsește';

```

- [ ] **Step 22: Edit `src/admin/shell/todo.ts`**

Find this block:

```ts

// What a test waits for from the teacher, if anything (redesign spec §5):
// exactly three cases, checked in this order. The first has two forms: the
// generated barem waits to be checked, or its new generation failed (it can
```

Replace it with:

```ts

// What a test waits for from the teacher, if anything (redesign spec §5, and
// the CES switch spec): four cases, checked in this order. The first has two forms: the
// generated barem waits to be checked, or its new generation failed (it can
```

- [ ] **Step 23: Edit `src/admin/shell/todo.ts`**

Find this block:

```ts
// class barem, also while the test is in evaluation (its CES papers wait); so
// does a missing CES barem that CES papers wait for.
export function todoOf(test: TestSummary): TodoItem | null {
```

Replace it with:

```ts
// class barem, also while the test is in evaluation (its CES papers wait); so
// does a missing CES barem that CES papers wait for. Then what a draft or open
// test still misses (missingOf): its files, and the CES ones.
export function todoOf(test: TestSummary): TodoItem | null {
```

- [ ] **Step 24: Edit `src/admin/shell/todo.ts`**

Find this block:

```ts
  }
  if (test.flagCount > 0) {
```

Replace it with:

```ts
  }
  const missing = missingOf(test);
  if (missing.length > 0) {
    return {
      ...item,
      stage: 'Pregătire',
      task: MISSING_TASK,
      text: `${missing.length === 1 ? 'Lipsește' : 'Lipsesc'}: ${missingNames(missing)}.`,
      action: 'Deschide',
      short: missingNote(missing),
    };
  }
  if (test.flagCount > 0) {
```

- [ ] **Step 25: Edit `src/admin/testsPage/nextStep.ts`**

Find this block:

```ts
import { countLabel } from '../../ui/format.ts';
import { reviewPath } from '../reviewPage/points.ts';
```

Replace it with:

```ts
import { countLabel } from '../../ui/format.ts';
import { missingName, missingOf } from '../missing.ts';
import { MISSING_TASK, todoOf } from '../shell/todo.ts';
import { reviewPath } from '../reviewPage/points.ts';
```

- [ ] **Step 26: Edit `src/admin/testsPage/nextStep.ts`**

Find this block:

```ts
  switch (current.name) {
    case 'Pregătire':
      if (current.state === 'wait') return link(test.barem.request === 'failed' ? 'Generează din nou baremul' : 'Verifică baremul');
```

Replace it with:

```ts
  switch (current.name) {
    case 'Pregătire': {
      // What "De făcut" asks: a part the test misses, the first one first.
      const missing = missingOf(test);
      if (current.state === 'wait' && todoOf(test)?.task === MISSING_TASK) return link(`Încarcă ${missingName(missing[0]!)}`);
      if (current.state === 'wait') return link(test.barem.request === 'failed' ? 'Generează din nou baremul' : 'Verifică baremul');
```

- [ ] **Step 27: Edit `src/admin/testsPage/nextStep.ts`**

Find this block:

```ts
      return test.barem.request === 'requested' ? null : link('Încarcă baremul');
    case 'Tipărire':
```

Replace it with:

```ts
      return test.barem.request === 'requested' ? null : link('Încarcă baremul');
    }
    case 'Tipărire':
```

- [ ] **Step 28: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type error; `Test Files  139 passed | 1 skipped (140)`, `Tests  2185 passed | 3 skipped (2188)`.

- [ ] **Step 29: Commit**

```bash
git add src/admin/missing.ts src/admin/shell/todo.ts src/admin/shell/todo.test.ts src/admin/testsPage/nextStep.ts src/admin/testsPage/nextStep.test.ts src/admin/stages.test.ts src/admin/Layout.test.tsx src/admin/pages/TestsPage.test.tsx src/admin/pages/SearchPage.test.tsx
git commit -m "Say what a draft or open test misses in the stages and in De făcut"
```

### Task 3: Show the CES switch, the file marks and what is missing on the test page

**Files:**
- Create: `src/admin/CesSwitch.tsx`, `src/admin/MissingList.tsx`
- Modify: `src/admin/testPage/CesVariant.tsx`, `src/admin/testPage/StagePanel.tsx`, `src/admin/testPage/TestFiles.tsx`, `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/ui/brand.css`
- Test: `src/admin/pages/TestPageCes.test.tsx`

**Interfaces:**
- Consumes: Task 1's `api.setCesOff`, `CesVariantInfo.off`; Task 2's `missingOf`, `missingName`, `MissingPart`.
- Produces: `CesSwitch({ names, on, disabled?, onToggle })` (a `role="switch"` button, "Test separat pentru elevii cu CES"); `MissingList({ missing, lead, after, why? })`; `CesVariant` takes `uploads`; `TestFileRow` takes `missing`; the CSS `.ces-switch`, `.ces-switch-button`, `.file-mark.is-ready`, `.file-mark.is-missing`, `.missing-list`.

- [ ] **Step 1: Edit `src/admin/pages/TestPageCes.test.tsx`**

Find this block:

```tsx
    const ces = await block();
    expect(ces.getByText(/1 elev cu CES primește acest test, corectat cu baremul lui\./)).toBeInTheDocument();
    const file = new File(['%PDF-1.7'], 'Test adaptat.pdf', { type: PDF_TYPE });
```

Replace it with:

```tsx
    const ces = await block();
    expect(ces.getByText('Clasa are 1 elev cu CES')).toBeInTheDocument();
    const file = new File(['%PDF-1.7'], 'Test adaptat.pdf', { type: PDF_TYPE });
```

- [ ] **Step 2: Edit `src/admin/pages/TestPageCes.test.tsx`**

Find this block:

```tsx

  it('removes the variant after asking, and keeps it once a CES paper was graded', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
```

Replace it with:

```tsx

  it('shows the CES students and the switch, on by default, and turns it off after asking', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
```

- [ ] **Step 3: Edit `src/admin/pages/TestPageCes.test.tsx`**

Find this block:

```tsx
    renderAdmin(`${PAGE}#pregatire`, api);
    await userEvent.click((await block()).getByRole('button', { name: 'Șterge varianta CES' }));
    expect(window.confirm).toHaveBeenCalledWith('Ștergi varianta CES? Elevii cu CES primesc atunci testul clasei.');
    expect(api.removeCesVariant).toHaveBeenCalledWith('9R2-26T1');
    await waitFor(async () => expect((await block()).queryByRole('link', { name: 'test.pdf' })).not.toBeInTheDocument());
  });

  it('says why a variant with graded CES papers cannot be removed', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ status: 'done', ces: noCesVariant({ studentCount: 1, files: FILES, papers: 1 }) }));
    const ces = await block();
    expect(ces.getByText('Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi ștearsă. Poți înlocui fișierele ei.')).toBeInTheDocument();
    expect(ces.queryByRole('button', { name: 'Șterge varianta CES' })).not.toBeInTheDocument();
  });

  it('stays while it has files, even with no CES student left', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ ces: noCesVariant({ files: { test: FILES.test, barem: null } }) }));
    expect((await block()).getByText(/Nu mai e niciun elev cu CES în clasă\./)).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    renderAdmin(`${PAGE}#pregatire`, api);
    const ces = await block();
    expect(ces.getByText('Bursașiu Teodor')).toBeInTheDocument();
    const toggle = ces.getByRole('switch', { name: 'Test separat pentru elevii cu CES' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);
    expect(window.confirm).toHaveBeenCalledWith('Oprești testul separat? Fișierele CES se șterg, iar elevii cu CES primesc testul clasei.');
    expect(api.setCesOff).toHaveBeenCalledWith('9R2-26T1', true);
    await waitFor(async () => expect((await block()).getByRole('switch')).toHaveAttribute('aria-checked', 'false'));
    expect((await block()).queryByText('Testul CES:')).not.toBeInTheDocument();
  });

  it('turns the switch on again without asking, and asks for the CES files', async () => {
    vi.spyOn(window, 'confirm');
    const api = apiWith({ ces: noCesVariant({ studentCount: 1, off: true }) });
    renderAdmin(`${PAGE}#pregatire`, api);
    await userEvent.click((await block()).getByRole('switch', { name: 'Test separat pentru elevii cu CES' }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(api.setCesOff).toHaveBeenCalledWith('9R2-26T1', false);
    expect(await screen.findByLabelText('Încarcă testul CES')).toBeInTheDocument();
  });

  it('says why a variant with graded CES papers cannot be turned off', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ status: 'done', ces: noCesVariant({ studentCount: 1, files: FILES, papers: 1 }) }));
    const ces = await block();
    expect(ces.getByText('Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi oprită. Poți înlocui fișierele ei.')).toBeInTheDocument();
    expect(ces.getByRole('switch')).toBeDisabled();
  });

  it('marks the missing CES files in orange, and the files it has as ready', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ ces: noCesVariant({ studentCount: 1, files: { test: FILES.test, barem: null } }) }));
    const ces = await block();
    expect(ces.getByText('gata')).toHaveClass('file-mark', 'is-ready');
    expect(ces.getByText('lipsește')).toHaveClass('file-mark', 'is-missing');
  });

  it('stays while it has files, even with no CES student left, and can be removed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = apiWith({ ces: noCesVariant({ files: { test: FILES.test, barem: null } }) });
    renderAdmin(`${PAGE}#pregatire`, api);
    const ces = await block();
    expect(ces.getByText(/Nu mai e niciun elev cu CES în clasă\./)).toBeInTheDocument();
    expect(ces.queryByRole('switch')).not.toBeInTheDocument();
    await userEvent.click(ces.getByRole('button', { name: 'Șterge varianta CES' }));
    expect(api.setCesOff).toHaveBeenCalledWith('9R2-26T1', true);
  });
});

describe('what a draft misses, under "Începe testul"', () => {
  it('lists each missing part and why it matters, and still starts', async () => {
    const api = apiWith({ ces: noCesVariant({ studentCount: 1 }) });
    renderAdmin(`${PAGE}#in-clasa`, api);
    const list = await screen.findByText('Înainte să începi, lipsesc:');
    const box = within(list.closest('.missing-list') as HTMLElement);
    expect(box.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'testul CES: elevii cu CES nu au ce primi pe hârtie',
      'baremul CES: lucrările CES vor aștepta baremul CES',
    ]);
    expect(box.getByText('Poți începe oricum.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Începe testul' }));
    expect(api.startTest).toHaveBeenCalledWith('9R2-26T1');
  });

  it('shows nothing when the draft misses nothing, or the switch is off', async () => {
    renderAdmin(`${PAGE}#in-clasa`, apiWith({ ces: noCesVariant({ studentCount: 1, off: true }) }));
    expect(await screen.findByRole('button', { name: 'Începe testul' })).toBeInTheDocument();
    expect(screen.queryByText(/Înainte să începi/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 4: Run the new tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPageCes.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  7 failed | 12 passed (19)`: no "Clasa are 1 elev cu CES", no names, no switch (`Unable to find an accessible element with the role "switch"`), no "gata" mark, no list under "Începe testul".

- [ ] **Step 5: Create `src/admin/CesSwitch.tsx`**

```tsx
import { CesTag } from './CesTag.tsx';

// "Test separat pentru elevii cu CES" (spec: CES switch): on Test nou and in
// the CES block of the test page. On: the CES students get their own test,
// graded with their own barem. Off: they get the class test.
export function CesSwitch({
  names,
  on,
  disabled = false,
  onToggle,
}: {
  // The active CES students of the class.
  names: string[];
  on: boolean;
  disabled?: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <div className="ces-switch">
      <p className="ces-switch-who">
        <strong>
          {names.length === 1 ? 'Clasa are 1 elev cu CES' : `Clasa are ${names.length} elevi cu CES`}
          <CesTag />
        </strong>
        {names.length > 0 && <span className="hint">{names.join(', ')}</span>}
      </p>
      <button type="button" role="switch" aria-checked={on} className="ces-switch-button" disabled={disabled} onClick={() => onToggle(!on)}>
        <span className="switch" aria-hidden="true" />
        <span>Test separat pentru elevii cu CES</span>
      </button>
      <p className="hint">Pornit: elevii cu CES primesc testul lor, corectat cu baremul lor. Oprit: primesc testul clasei.</p>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/admin/MissingList.tsx`**

```tsx
import { missingName, type MissingPart } from './missing.ts';

// Why each missing part matters, under "Începe testul".
const WHY: Record<MissingPart, string> = {
  test: 'nu ai ce tipări cu codul QR',
  barem: 'lucrările vor aștepta baremul',
  cesTest: 'elevii cu CES nu au ce primi pe hârtie',
  cesBarem: 'lucrările CES vor aștepta baremul CES',
};

// The orange list of what a test still misses (spec: CES switch and missing
// warnings): under "Creează testul" on Test nou, and under "Începe testul".
// It never blocks: `after` says that the teacher may go on.
export function MissingList({
  missing,
  lead,
  after,
  why = false,
}: {
  missing: MissingPart[];
  // "Încă" or "Înainte să începi,": the list's title ends in "lipsește:" or "lipsesc:".
  lead: string;
  after: string;
  why?: boolean;
}) {
  if (missing.length === 0) return null;
  return (
    <div className="warning missing-list">
      <p>
        <strong>
          {lead} {missing.length === 1 ? 'lipsește' : 'lipsesc'}:
        </strong>
      </p>
      <ul>
        {missing.map((part) => (
          <li key={part}>{why ? `${missingName(part)}: ${WHY[part]}` : missingName(part)}</li>
        ))}
      </ul>
      <p className="hint">{after}</p>
    </div>
  );
}
```

- [ ] **Step 7: Edit `src/admin/testPage/CesVariant.tsx`**

Find this block:

```tsx
import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
```

Replace it with:

```tsx
import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
```

- [ ] **Step 8: Edit `src/admin/testPage/CesVariant.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { CesSwitch } from '../CesSwitch.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

- [ ] **Step 9: Edit `src/admin/testPage/CesVariant.tsx`**

Find this block:

```tsx

// "Varianta CES" in the panel Pregătire (spec: CES variant): the adapted test
// that the CES students of the class get, with its own barem. Optional: without
// it, they get the class test. Shown while the class has a CES student, or
// while the variant has a file.
export function CesVariant({
  test,
  onChanged,
```

Replace it with:

```tsx

// "Varianta CES" in the panel Pregătire (spec: CES variant, CES switch): the
// adapted test that the CES students of the class get, with its own barem.
// The switch "Test separat pentru elevii cu CES" is on unless the teacher
// turned it off; off removes the CES files, and the CES students get the class
// test. Shown while the class has a CES student, or while the variant has a file.
export function CesVariant({
  test,
  uploads,
  onChanged,
```

- [ ] **Step 10: Edit `src/admin/testPage/CesVariant.tsx`**

Find this block:

```tsx
  test: TestInfo;
  onChanged: () => Promise<void>;
```

Replace it with:

```tsx
  test: TestInfo;
  uploads: UploadRow[];
  onChanged: () => Promise<void>;
```

- [ ] **Step 11: Edit `src/admin/testPage/CesVariant.tsx`**

Find this block:

```tsx
  const api = useApi();
  const remove = useMutation({ mutationFn: () => api.removeCesVariant(test.code), onSuccess: onChanged });
  if (!showsCes(test)) return null;
```

Replace it with:

```tsx
  const api = useApi();
  const toggle = useMutation({
    mutationFn: (off: boolean) => api.setCesOff(test.code, off),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
  });
  if (!showsCes(test)) return null;
```

- [ ] **Step 12: Edit `src/admin/testPage/CesVariant.tsx`**

Find this block:

```tsx
  const expected = ces.classTotalPoints ?? 100;
  const askRemove = () => {
    if (window.confirm('Ștergi varianta CES? Elevii cu CES primesc atunci testul clasei.')) remove.mutate();
  };
```

Replace it with:

```tsx
  const expected = ces.classTotalPoints ?? 100;
  const names = uploads.filter((row) => row.ces && row.active).map((row) => row.studentName);
  const onToggle = (on: boolean) => {
    if (!on && hasFiles && !window.confirm('Oprești testul separat? Fișierele CES se șterg, iar elevii cu CES primesc testul clasei.')) return;
    toggle.mutate(!on);
  };
```

- [ ] **Step 13: Edit `src/admin/testPage/CesVariant.tsx`**

Find this block:

```tsx
      <h3 id="ces-variant-title">Varianta CES</h3>
      <p className="hint">
        {ces.studentCount > 0
          ? `${countLabel(ces.studentCount, 'elev cu CES primește', 'elevi cu CES primesc')} acest test, corectat cu baremul lui.`
          : 'Nu mai e niciun elev cu CES în clasă.'}{' '}
        Varianta e opțională: fără ea, elevii cu CES primesc testul clasei.
      </p>
      <TestFiles test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />
      {ces.totalPoints !== null && ces.totalPoints !== expected && (
```

Replace it with:

```tsx
      <h3 id="ces-variant-title">Varianta CES</h3>
      {ces.studentCount > 0 ? (
        <CesSwitch names={names} on={!ces.off} disabled={toggle.isPending || ces.papers > 0} onToggle={onToggle} />
      ) : (
        <p className="hint">Nu mai e niciun elev cu CES în clasă.</p>
      )}
      {ces.papers > 0 && <p className="hint">Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi oprită. Poți înlocui fișierele ei.</p>}
      {toggle.error && <ErrorMessage error={toggle.error} />}
      {(!ces.off || hasFiles) && <TestFiles test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />}
      {ces.totalPoints !== null && ces.totalPoints !== expected && (
```

- [ ] **Step 14: Edit `src/admin/testPage/CesVariant.tsx`**

Find this block:

```tsx
      )}
      {hasFiles &&
        (ces.papers > 0 ? (
          <p className="hint">Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi ștearsă. Poți înlocui fișierele ei.</p>
        ) : (
          <p>
            <button type="button" className="text-button is-danger" disabled={remove.isPending} onClick={askRemove}>
              Șterge varianta CES
            </button>
          </p>
        ))}
      {remove.error && <ErrorMessage error={remove.error} />}
    </section>
```

Replace it with:

```tsx
      )}
      {ces.studentCount === 0 && hasFiles && ces.papers === 0 && (
        <p>
          <button type="button" className="text-button is-danger" disabled={toggle.isPending} onClick={() => onToggle(false)}>
            Șterge varianta CES
          </button>
        </p>
      )}
    </section>
```

- [ ] **Step 15: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { EvaluationControls } from './EvaluationControls.tsx';
import { CesVariant, CesWaiting } from './CesVariant.tsx';
```

Replace it with:

```tsx
import { EvaluationControls } from './EvaluationControls.tsx';
import { missingOf } from '../missing.ts';
import { MissingList } from '../MissingList.tsx';
import { CesVariant, CesWaiting } from './CesVariant.tsx';
```

- [ ] **Step 16: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx

function PreparePanel({ test, robot, onChanged, onRobot }: PanelProps) {
  return (
```

Replace it with:

```tsx

function PreparePanel({ test, uploads, robot, onChanged, onRobot }: PanelProps) {
  return (
```

- [ ] **Step 17: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
      <TestFiles test={test} onChanged={onChanged} onRobot={onRobot} />
      <CesVariant test={test} onChanged={onChanged} onRobot={onRobot} />
      {waitsForBarem(test) && (
```

Replace it with:

```tsx
      <TestFiles test={test} onChanged={onChanged} onRobot={onRobot} />
      <CesVariant test={test} uploads={uploads} onChanged={onChanged} onRobot={onRobot} />
      {waitsForBarem(test) && (
```

- [ ] **Step 18: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
        </p>
        {start.error && <ErrorMessage error={start.error} />}
```

Replace it with:

```tsx
        </p>
        <MissingList missing={missingOf(test)} lead="Înainte să începi," after="Poți începe oricum." why />
        {start.error && <ErrorMessage error={start.error} />}
```

- [ ] **Step 19: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';
import { TestFileInput } from '../TestFileInput.tsx';
```

Replace it with:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';
import { missingOf, type MissingPart } from '../missing.ts';
import { TestFileInput } from '../TestFileInput.tsx';
```

- [ ] **Step 20: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
import { partsOf } from './variant.ts';

```

Replace it with:

```tsx
import { partsOf } from './variant.ts';

// The part of the missing list (missingOf) that each file is.
const PART: Record<TestVariant, Record<TestFileKind, MissingPart>> = {
  class: { test: 'test', barem: 'barem' },
  ces: { test: 'cesTest', barem: 'cesBarem' },
};

```

- [ ] **Step 21: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  const parts = partsOf(test, variant);
  const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
```

Replace it with:

```tsx
  const parts = partsOf(test, variant);
  const missing = missingOf(test);
  const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
```

- [ ] **Step 22: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
      <ul className="file-list">
        <TestFileRow code={test.code} variant={variant} kind="test" file={parts.files.test} locked={locked} onChanged={onChanged} onRobot={onRobot} />
        <TestFileRow
```

Replace it with:

```tsx
      <ul className="file-list">
        <TestFileRow
          code={test.code}
          variant={variant}
          kind="test"
          file={parts.files.test}
          missing={missing.includes(PART[variant].test)}
          locked={locked}
          onChanged={onChanged}
          onRobot={onRobot}
        />
        <TestFileRow
```

- [ ] **Step 23: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
          file={parts.files.barem}
          locked={locked}
```

Replace it with:

```tsx
          file={parts.files.barem}
          missing={missing.includes(PART[variant].barem)}
          locked={locked}
```

- [ ] **Step 24: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  file,
  locked,
```

Replace it with:

```tsx
  file,
  missing,
  locked,
```

- [ ] **Step 25: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  file: TestInfo['files'][TestFileKind];
  locked: boolean;
```

Replace it with:

```tsx
  file: TestInfo['files'][TestFileKind];
  // A draft or open test needs this file (missingOf): an orange mark.
  missing: boolean;
  locked: boolean;
```

- [ ] **Step 26: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
        {file ? (
          <a href={testFileUrl(code, kind, variant)} target="_blank" rel="noopener">
            {file.name}
          </a>
        ) : (
```

Replace it with:

```tsx
        {file ? (
          <>
            <a href={testFileUrl(code, kind, variant)} target="_blank" rel="noopener">
              {file.name}
            </a>{' '}
            <span className="file-mark is-ready">gata</span>
          </>
        ) : missing ? (
          <span className="file-mark is-missing">lipsește</span>
        ) : (
```

- [ ] **Step 27: Edit `src/admin/api.ts`**

Find this block:

```ts
  CesOffAnswer,
  CesRemovedAnswer,
  ClassDetail,
```

Replace it with:

```ts
  CesOffAnswer,
  ClassDetail,
```

- [ ] **Step 28: Edit `src/admin/api.ts`**

Find this block:

```ts
  // "Șterge varianta CES": only while no paper went to grading with it.
  removeCesVariant(code: string): Promise<CesRemovedAnswer>;
  setCesOff(code: string, off: boolean): Promise<CesOffAnswer>;
```

Replace it with:

```ts
  // "Șterge varianta CES": only while no paper went to grading with it.
  setCesOff(code: string, off: boolean): Promise<CesOffAnswer>;
```

- [ ] **Step 29: Edit `src/admin/api.ts`**

Find this block:

```ts
      request<BaremCheckedAnswer>('POST', `${variantPath(code, variant)}/barem/checked`, { filesVersion }),
    removeCesVariant: (code) => request<CesRemovedAnswer>('DELETE', `${test(code)}/ces`),
    setCesOff: (code, off) => request<CesOffAnswer>('PUT', `${test(code)}/ces/off`, { off }),
```

Replace it with:

```ts
      request<BaremCheckedAnswer>('POST', `${variantPath(code, variant)}/barem/checked`, { filesVersion }),
    setCesOff: (code, off) => request<CesOffAnswer>('PUT', `${test(code)}/ces/off`, { off }),
```

- [ ] **Step 30: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  CesOffAnswer,
  CesRemovedAnswer,
  CesVariantInfo,
```

Replace it with:

```ts
  CesOffAnswer,
  CesVariantInfo,
```

- [ ] **Step 31: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    // Like the server: only while no paper went to grading with the CES variant.
    removeCesVariant: vi.fn(async (code: string): Promise<CesRemovedAnswer> => {
      const found = findTest(code).test;
      if (found.ces.papers > 0) throw new ApiError(409, 'ces_papers', 'Varianta CES are lucrări trimise la corectare, așa că nu mai poate fi ștearsă.');
      found.ces = noCesVariant({ studentCount: found.ces.studentCount, filesVersion: found.ces.filesVersion + 1 });
      return { ces: found.ces, robot: found.status === 'evaluating' ? 'dispatched' : null };
    }),
    // Like the server: the test keeps its link (a draft made before tests got
```

Replace it with:

```ts
    }),
    // Like the server: the test keeps its link (a draft made before tests got
```

- [ ] **Step 32: Edit `src/ui/brand.css`**

Find this block:

```css
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

```

Replace it with:

```css
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

/* "Test separat pentru elevii cu CES" (spec: CES switch): who the CES students
   are, and the switch, framed in the blue so the teacher cannot miss it. */
.ces-switch {
  max-width: 44rem;
  margin: 0.5rem 0 0.75rem;
  padding: 0.75rem 1rem;
  border: 1.5px solid var(--ink);
  border-radius: var(--radius);
}

.ces-switch > p {
  margin: 0;
}

.ces-switch-who {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.ces-switch-button {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0.6rem 0 0.35rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.ces-switch-button:disabled {
  cursor: default;
  opacity: 0.6;
}

/* A file of the test: "gata" in green, "lipsește" in orange while a draft or
   open test needs it. */
.file-mark {
  display: inline-block;
  margin-left: 0.25rem;
  padding: 0 0.5rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
}

.file-mark.is-ready {
  background: var(--ok-bg);
  color: var(--ok-fg);
}

.file-mark.is-missing {
  border: 1px solid var(--orange-mark);
  background: var(--marker);
  color: var(--orange);
}

/* What a test still misses, under "Creează testul" and "Începe testul". */
.missing-list strong {
  color: var(--orange);
}

.missing-list ul {
  margin: 0 0 0.5rem;
  padding-left: 1.25rem;
}

```

- [ ] **Step 33: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type error; `Test Files  139 passed | 1 skipped (140)`, `Tests  2189 passed | 3 skipped (2192)`.

- [ ] **Step 34: Commit**

```bash
git add src/admin/CesSwitch.tsx src/admin/MissingList.tsx src/admin/testPage/CesVariant.tsx src/admin/testPage/StagePanel.tsx src/admin/testPage/TestFiles.tsx src/admin/api.ts src/test/fakeApi.ts src/ui/brand.css src/admin/pages/TestPageCes.test.tsx
git commit -m "Show the CES switch, the file marks and what is missing on the test page"
```

### Task 4: Show the CES students, the switch, the CES files and what is missing on Test nou

**Files:**
- Modify: `src/admin/pages/NewTestPage.tsx`, `src/ui/brand.css`
- Test: `src/admin/pages/NewTestPage.test.tsx`

**Interfaces:**
- Consumes: Task 1's `createTestBody.cesOff`, `api.uploadTestFile(…, 'ces')`, `api.generateBarem(code, 'ces')`; Task 2's `missingParts`; Task 3's `CesSwitch`, `MissingList`; `api.getClass(classId).students` (`StudentRow.ces`, `active`).
- Produces: the CSS `.new-test-ces`, `.step-pair` (two columns, one below 768px).

- [ ] **Step 1: Edit `src/admin/pages/NewTestPage.test.tsx`**

Find this block:

```tsx
  });
});
```

Replace it with:

```tsx
  });
});

describe('NewTestPage, a class with a CES student', () => {
  const withCes = () =>
    createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 },
        { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 2 },
      ],
      students: {
        1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true, ces: false }],
        2: [
          { id: 20, fullName: 'Bursașiu Teodor', active: true, canDelete: true, ces: true },
          { id: 21, fullName: 'Ene Ana', active: true, canDelete: true, ces: false },
        ],
      },
    });
  const missingItems = () => [...document.querySelectorAll('.missing-list li')].map((item) => item.textContent);
  const cesBaremChoices = () => within(screen.getByRole('group', { name: 'Baremul CES' }));

  it('shows the CES students and the switch, on, with the CES files beside the class ones', async () => {
    renderAdmin('/teste/nou', withCes());
    await fillClassAndTitle('2');
    const toggle = await screen.findByRole('switch', { name: 'Test separat pentru elevii cu CES' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Clasa are 1 elev cu CES')).toBeInTheDocument();
    expect(screen.getByText('Bursașiu Teodor')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^Testul CES/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^Baremul CES/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Fișierul testului CES/)).toBeInTheDocument();
  });

  it('shows no switch for a class without a CES student', async () => {
    renderAdmin('/teste/nou', withCes());
    await fillClassAndTitle('1');
    expect(await screen.findByText('Încă lipsesc:')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(missingItems()).toEqual(['testul', 'baremul']);
  });

  it('lists under the button what the test would still miss, and updates it', async () => {
    renderAdmin('/teste/nou', withCes());
    await fillClassAndTitle('2');
    await screen.findByRole('switch');
    expect(screen.getByText('Încă lipsesc:')).toBeInTheDocument();
    expect(missingItems()).toEqual(['testul', 'baremul', 'testul CES', 'baremul CES']);
    expect(screen.getByText('Poți crea testul acum și le adaugi mai târziu.')).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText(/^Fișierul testului CES/), pdf('Test adaptat.pdf'));
    await userEvent.click(cesBaremChoices().getByRole('radio', { name: /^Generează baremul CES/ }));
    expect(missingItems()).toEqual(['testul', 'baremul']);
  });

  it('creates the test with the CES test, and asks for the CES barem after the class files', async () => {
    const api = withCes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle('2');
    await screen.findByRole('switch');
    const test = pdf('Test.pdf');
    const ces = pdf('Test adaptat.pdf');
    await userEvent.upload(screen.getByLabelText(/^Fișierul testului:/), test);
    await userEvent.upload(screen.getByLabelText(/^Fișierul testului CES/), ces);
    await userEvent.click(choice(/^Generează baremul din test/));
    await userEvent.click(cesBaremChoices().getByRole('radio', { name: /^Generează baremul CES/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));

    await expectLocation('/teste/9R2-26T1');
    expect(api.createTest).toHaveBeenCalledWith({ classId: 2, title: 'Fracții', cesOff: false });
    expect(api.uploadTestFile).toHaveBeenCalledWith('9R2-26T1', 'test', ces, 'ces');
    expect(api.generateBarem.mock.calls).toEqual([['9R2-26T1'], ['9R2-26T1', 'ces']]);
  });

  it('turned off, hides the CES files, asks nothing for them, and creates the test without them', async () => {
    const api = withCes();
    renderAdmin('/teste/nou', api, <LocationProbe />);
    await fillClassAndTitle('2');
    await userEvent.click(await screen.findByRole('switch', { name: 'Test separat pentru elevii cu CES' }));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('heading', { level: 2, name: /^Testul CES/ })).not.toBeInTheDocument();
    expect(missingItems()).toEqual(['testul', 'baremul']);
    await userEvent.click(screen.getByRole('button', { name: 'Creează testul' }));
    await expectLocation('/teste/9R2-26T1');
    expect(api.createTest).toHaveBeenCalledWith({ classId: 2, title: 'Fracții', cesOff: true });
    expect(api.uploadTestFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the new tests to see them fail**

Run: `npx vitest run src/admin/pages/NewTestPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  5 failed | 17 passed (22)`: Test nou has no switch (`Unable to find role="switch"`) and no "Încă lipsesc:" (each test waits 3 s for it).

- [ ] **Step 3: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';
import { NewClassDialog } from '../classPage/ClassDialogs.tsx';
import { ErrorMessage, errorText } from '../ErrorMessage.tsx';
import { FileDrop } from '../newTest/FileDrop.tsx';
```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { CesSwitch } from '../CesSwitch.tsx';
import { CesTag } from '../CesTag.tsx';
import { NewClassDialog } from '../classPage/ClassDialogs.tsx';
import { ErrorMessage, errorText } from '../ErrorMessage.tsx';
import { missingParts } from '../missing.ts';
import { MissingList } from '../MissingList.tsx';
import { FileDrop } from '../newTest/FileDrop.tsx';
```

- [ ] **Step 4: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
// ?clasa=<id> picks the class (the class page links here). The test and the
// barem can come now or later; the test page holds them too.
export function NewTestPage() {
```

Replace it with:

```tsx
// ?clasa=<id> picks the class (the class page links here). The test and the
// barem can come now or later; the test page holds them too. A class with a CES
// student shows them and the CES switch, on by default (spec: CES switch); on,
// the CES test and the CES barem sit beside the class ones. Under the button,
// what the test would still miss.
export function NewTestPage() {
```

- [ ] **Step 5: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
  const [newClass, setNewClass] = useState(false);

```

Replace it with:

```tsx
  const [newClass, setNewClass] = useState(false);
  const [cesOn, setCesOn] = useState(true);
  const [cesTestFile, setCesTestFile] = useState<File | null>(null);
  const [cesBaremFile, setCesBaremFile] = useState<File | null>(null);
  const [cesBarem, setCesBarem] = useState<BaremChoice>('upload');
  const chosen = classes.data?.some((item) => !item.archived && String(item.id) === classId) ?? false;
  const detail = useQuery({ queryKey: ['class', Number(classId)], queryFn: () => api.getClass(Number(classId)), enabled: chosen });
  const cesNames = chosen ? (detail.data?.students.filter((student) => student.active && student.ces).map((student) => student.fullName) ?? []) : [];
  const withCes = cesNames.length > 0 && cesOn;

```

- [ ] **Step 6: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
    mutationFn: async () => {
      const code = await api.createTest({ classId: Number(classId), title });
      // The test exists now. What fails next can be done again from the test
```

Replace it with:

```tsx
    mutationFn: async () => {
      const code = await api.createTest({ classId: Number(classId), title, ...(cesNames.length > 0 ? { cesOff: !cesOn } : {}) });
      // The test exists now. What fails next can be done again from the test
```

- [ ] **Step 7: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
      let notice: string | null = null;
      const send = async (file: File, kind: 'test' | 'barem') => {
        try {
          await api.uploadTestFile(code, kind, file);
          return true;
```

Replace it with:

```tsx
      let notice: string | null = null;
      const send = async (file: File, kind: 'test' | 'barem', variant?: 'ces') => {
        try {
          await (variant ? api.uploadTestFile(code, kind, file, variant) : api.uploadTestFile(code, kind, file));
          return true;
```

- [ ] **Step 8: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
          notice ??= `Testul a fost creat, dar baremul nu s-a putut genera: ${errorText(err)}`;
        }
```

Replace it with:

```tsx
          notice ??= `Testul a fost creat, dar baremul nu s-a putut genera: ${errorText(err)}`;
        }
      }
      if (withCes) {
        const cesTestSent = cesTestFile !== null && (await send(cesTestFile, 'test', 'ces'));
        if (cesBarem === 'upload' && cesBaremFile) await send(cesBaremFile, 'barem', 'ces');
        if (cesBarem === 'generate' && cesTestSent) {
          try {
            await api.generateBarem(code, 'ces');
          } catch (err) {
            notice ??= `Testul a fost creat, dar baremul CES nu s-a putut genera: ${errorText(err)}`;
          }
        }
```

- [ ] **Step 9: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
    if (file === null && barem === 'generate') setBarem('later');
  };

  const onSubmit = (event: FormEvent) => {
```

Replace it with:

```tsx
    if (file === null && barem === 'generate') setBarem('later');
  };
  const pickCesTest = (file: File | null) => {
    setCesTestFile(file);
    if (file === null && cesBarem === 'generate') setCesBarem('later');
  };

  // What the new test would still miss, as the test page will say it.
  const missing = missingParts({
    testFile: testFile !== null,
    baremFile: barem === 'upload' && baremFile !== null,
    baremRequest: barem === 'generate' && testFile !== null ? 'requested' : 'none',
    ces: {
      wanted: withCes,
      testFile: cesTestFile !== null,
      baremFile: cesBarem === 'upload' && cesBaremFile !== null,
      baremRequest: cesBarem === 'generate' && cesTestFile !== null ? 'requested' : 'none',
    },
  });

  const onSubmit = (event: FormEvent) => {
```

- [ ] **Step 10: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx

  const choice = (value: BaremChoice, label: string, line: string, extra?: string) => (
    <label className="choice">
```

Replace it with:

```tsx

  const choiceOf = (group: 'barem' | 'ces-barem') => (value: BaremChoice, label: string, line: string, extra?: string) => (
    <label className="choice">
```

- [ ] **Step 11: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
        type="radio"
        name="barem"
        value={value}
        checked={barem === value}
        disabled={value === 'generate' && testFile === null}
        onChange={() => setBarem(value)}
      />
```

Replace it with:

```tsx
        type="radio"
        name={group}
        value={value}
        checked={(group === 'barem' ? barem : cesBarem) === value}
        disabled={value === 'generate' && (group === 'barem' ? testFile : cesTestFile) === null}
        onChange={() => (group === 'barem' ? setBarem(value) : setCesBarem(value))}
      />
```

- [ ] **Step 12: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
  );

```

Replace it with:

```tsx
  );
  const choice = choiceOf('barem');
  const cesChoice = choiceOf('ces-barem');

```

- [ ] **Step 13: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
              </li>
              <li className="step">
                <div>
                  <h2>Testul</h2>
                  <p>Fișierul pe care îl tipărești. PDF sau Word. Poți să-l adaugi și mai târziu.</p>
                  <FileDrop id="new-test-file" name="Fișierul testului" onPick={pickTest} />
                </div>
```

Replace it with:

```tsx
              </li>
              {cesNames.length > 0 && (
                <li className="new-test-ces">
                  <CesSwitch names={cesNames} on={cesOn} onToggle={setCesOn} />
                </li>
              )}
              <li className="step">
                <div className={withCes ? 'step-pair' : undefined}>
                  <div>
                    <h2>Testul</h2>
                    <p>Fișierul pe care îl tipărești. PDF sau Word. Poți să-l adaugi și mai târziu.</p>
                    <FileDrop id="new-test-file" name="Fișierul testului" onPick={pickTest} />
                  </div>
                  {withCes && (
                    <div>
                      <h2>
                        Testul CES
                        <CesTag />
                      </h2>
                      <p>Testul elevilor cu CES, tipărit cu același cod QR. Poți să-l adaugi și mai târziu.</p>
                      <FileDrop id="new-ces-test-file" name="Fișierul testului CES" onPick={pickCesTest} />
                    </div>
                  )}
                </div>
```

- [ ] **Step 14: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
              <li className="step">
                <div>
                  <h2>Baremul</h2>
                  <p>După el se dă punctajul.</p>
                  <fieldset className="choices">
                    <legend className="sr-only">Baremul</legend>
                    {choice('upload', 'Încarc baremul acum', 'PDF sau Word.')}
                    {/* Kept while another choice is made, so the file comes back with it. */}
                    <div className="choice-drop" hidden={barem !== 'upload'}>
                      <FileDrop id="new-barem-file" name="Fișierul baremului" onPick={setBaremFile} />
                    </div>
                    {choice(
                      'generate',
                      'Generează baremul din test',
                      'Primești o propunere în câteva minute. O verifici și o confirmi înainte de corectare.',
                      testFile === null ? 'Alege întâi testul, la pasul 2.' : undefined,
                    )}
                    {choice('later', 'Mai târziu', 'Îl adaugi din pagina testului, la Pregătire. Corectarea nu începe fără barem.')}
                  </fieldset>
                </div>
```

Replace it with:

```tsx
              <li className="step">
                <div className={withCes ? 'step-pair' : undefined}>
                  <div>
                    <h2>Baremul</h2>
                    <p>După el se dă punctajul.</p>
                    <fieldset className="choices">
                      <legend className="sr-only">Baremul</legend>
                      {choice('upload', 'Încarc baremul acum', 'PDF sau Word.')}
                      {/* Kept while another choice is made, so the file comes back with it. */}
                      <div className="choice-drop" hidden={barem !== 'upload'}>
                        <FileDrop id="new-barem-file" name="Fișierul baremului" onPick={setBaremFile} />
                      </div>
                      {choice(
                        'generate',
                        'Generează baremul din test',
                        'Primești o propunere în câteva minute. O verifici și o confirmi înainte de corectare.',
                        testFile === null ? 'Alege întâi testul, la pasul 2.' : undefined,
                      )}
                      {choice('later', 'Mai târziu', 'Îl adaugi din pagina testului, la Pregătire. Corectarea nu începe fără barem.')}
                    </fieldset>
                  </div>
                  {withCes && (
                    <div>
                      <h2>
                        Baremul CES
                        <CesTag />
                      </h2>
                      <p>Doar pentru corectare: 90 de puncte și 10 din oficiu.</p>
                      <fieldset className="choices">
                        <legend className="sr-only">Baremul CES</legend>
                        {cesChoice('upload', 'Încarc baremul CES acum', 'PDF sau Word.')}
                        <div className="choice-drop" hidden={cesBarem !== 'upload'}>
                          <FileDrop id="new-ces-barem-file" name="Fișierul baremului CES" onPick={setCesBaremFile} />
                        </div>
                        {cesChoice(
                          'generate',
                          'Generează baremul CES din testul CES',
                          'Pornește de la baremul clasei. Îl verifici și îl confirmi înainte de corectare.',
                          cesTestFile === null ? 'Alege întâi testul CES, la pasul 2.' : undefined,
                        )}
                        {cesChoice('later', 'Mai târziu', 'Îl adaugi din pagina testului, la Pregătire. Lucrările CES nu se corectează fără el.')}
                      </fieldset>
                    </div>
                  )}
                </div>
```

- [ ] **Step 15: Edit `src/admin/pages/NewTestPage.tsx`**

Find this block:

```tsx
            </div>
            {create.error && <ErrorMessage error={create.error} />}
```

Replace it with:

```tsx
            </div>
            {selected !== '' && <MissingList missing={missing} lead="Încă" after="Poți crea testul acum și le adaugi mai târziu." />}
            {create.error && <ErrorMessage error={create.error} />}
```

- [ ] **Step 16: Edit `src/ui/brand.css`**

Find this block:

```css
  margin: -0.25rem 0 0.25rem 2rem;
}
```

Replace it with:

```css
  margin: -0.25rem 0 0.25rem 2rem;
}

/* A class with a CES student (spec: CES switch): the switch between the first
   step and the files, and the CES files beside the class ones, under them on a
   narrow screen. */
.new-test-ces .ces-switch {
  max-width: none;
  margin: 0;
  background: var(--sheet);
}

.step-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.5rem;
}

@media (max-width: 767px) {
  .step-pair {
    grid-template-columns: minmax(0, 1fr);
  }
}

.step-pair > div > p {
  margin: 0 0 0.75rem;
  color: var(--muted);
  font-size: 0.875rem;
}
```

- [ ] **Step 17: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type error; `Test Files  139 passed | 1 skipped (140)`, `Tests  2194 passed | 3 skipped (2197)`.

- [ ] **Step 18: Commit**

```bash
git add src/admin/pages/NewTestPage.tsx src/admin/pages/NewTestPage.test.tsx src/ui/brand.css
git commit -m "Show the CES students, the CES switch, the CES files and what is missing on Test nou"
```

### Task 5: Write down the CES switch and the warnings

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`, `docs/superpowers/specs/2026-11-09-ces-variant-design.md`, `server/AGENTS.md`, `src/AGENTS.md`

- [ ] **Step 1: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
  - The stages of a test (`src/admin/stages.ts`, for the test page of Phase 4 too). A segment is orange exactly when "De făcut" has the test, at that stage.
    - Pregătire: orange with the case of "De făcut". Done when the test file is there and the barem is active, and always once the test is in evaluation or done. Else in progress: "lipsește testul", "baremul se generează", "lipsește baremul".
    - Tipărire: done when the print PDF exists, and once the test has started. In progress while the print PDF is made ("se pregătește"), after it failed ("nu s-a putut pregăti"), or for a draft made before tests got their link when made ("fără cod QR": no print PDF is made until the teacher presses "Pregătește testul cu cod QR" on the test page). Later without a test file.
```

Replace it with:

```markdown
  - The stages of a test (`src/admin/stages.ts`, for the test page of Phase 4 too). A segment is orange exactly when "De făcut" has the test, at that stage.
    - Pregătire: orange with the case of "De făcut". Done when the test file is there and the barem is active, and always once the test is in evaluation or done. Else in progress: "lipsește testul", "baremul se generează", "lipsește baremul". Since the CES switch (spec `2026-11-09-ces-switch-and-missing-warnings-design.md`), a draft or open test that misses a part waits instead: orange, with its note ("lipsesc testul și baremul", "lipsește testul CES").
    - Tipărire: done when the print PDF exists, and once the test has started. In progress while the print PDF is made ("se pregătește"), after it failed ("nu s-a putut pregăti"), or for a draft made before tests got their link when made ("fără cod QR": no print PDF is made until the teacher presses "Pregătește testul cu cod QR" on the test page). Later without a test file.
```

- [ ] **Step 2: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
  - On a phone (below 768 px) each row becomes a block: the test, the stage, the papers and the next step, one under the other.
- "De făcut" counts exactly three cases, from the tests of the chosen school year that are not archived (`src/admin/shell/todo.ts`, Phase 2):
  - Pregătire, "Verifică baremul generat": a draft or open test whose generated barem waits for "Am verificat baremul" (`barem.unchecked`, no request running). The tests list carries `barem` from Phase 2. The same case says "Generează din nou baremul" when the new generation of an unchecked barem failed (`request` is `failed`): that barem can be neither confirmed nor used until the teacher asks for it again.
  - Verificare, "Decide N puncte nesigure": a test with points to check (`flagCount` above 0).
```

Replace it with:

```markdown
  - On a phone (below 768 px) each row becomes a block: the test, the stage, the papers and the next step, one under the other.
- "De făcut" counts four cases (the fourth since the CES switch, 2026-11-09), from the tests of the chosen school year that are not archived (`src/admin/shell/todo.ts`, Phase 2):
  - Pregătire, "Verifică baremul generat": a draft or open test whose generated barem waits for "Am verificat baremul" (`barem.unchecked`, no request running). The tests list carries `barem` from Phase 2. The same case says "Generează din nou baremul" when the new generation of an unchecked barem failed (`request` is `failed`): that barem can be neither confirmed nor used until the teacher asks for it again.
  - Pregătire, "Adaugă ce lipsește": a draft or open test that misses its test file, its barem, or, while the class has an active CES student and the CES switch is on, its CES test or CES barem (`missingOf` in `src/admin/missing.ts`). A barem being generated is not missing. It comes after the generated-barem cases.
  - Verificare, "Decide N puncte nesigure": a test with points to check (`flagCount` above 0).
```

- [ ] **Step 3: Edit `docs/superpowers/specs/2026-11-09-ces-variant-design.md`**

Find this block:

```markdown

- When the class has at least one active CES student, the test page shows an optional "Varianta CES" block. When the class has none, the block is not shown, unless the test already has a CES variant (then it stays, so the teacher can see and remove it).
- The block has: the CES test file, the CES barem (upload or "Generează baremul"), the comments for the CES barem, and the CES print PDF.
```

Replace it with:

```markdown

- When the class has at least one active CES student, the test page shows an optional "Varianta CES" block. When the class has none, the block is not shown, unless the test already has a CES variant (then it stays, so the teacher can see and remove it). Since the CES switch (`2026-11-09-ces-switch-and-missing-warnings-design.md`), the block holds the switch "Test separat pentru elevii cu CES", on by default; off removes the CES files and replaces "Șterge varianta CES".
- The block has: the CES test file, the CES barem (upload or "Generează baremul"), the comments for the CES barem, and the CES print PDF.
```

- [ ] **Step 4: Edit `server/AGENTS.md`**

Find this block:

```markdown
- The robot reads a draft or open test only while it is a print job (`NEEDS_PRINT` in `db/runner.ts`), checked in SQL, and the print PDF is stored only with the run's lease and the current `files_version`.
- The CES variant (migration 0024): every column of the test file, the barem, its comments and request, the exercise list and the print PDF has a `ces_` twin, with its own `ces_files_version`; the queries that serve both take a `variant` and name their columns with `columns(variant)` (`db/variant.ts`, also `needsPrintSql`, `needsBaremSql`, `baremActiveSql`, `paperVariantSql`). The teacher's CES routes are `/api/admin/tests/:code/ces/…` (`routes/cesVariant.ts`); a CES file or comment change is refused only while a CES paper is in grading, and a CES barem may be generated until the test is done. The robot's routes take `?variant=ces` (none: the class test, as an older robot asks); `/tasks` lists `cesPrints`, `cesBarems` and `cesExerciseLists`. The CES list waits for an active CES barem, the class list and a CES paper (`NEEDS_CES_EXERCISE_LIST`). `GRADABLE` holds a CES paper back until its CES barem is active and its CES list usable, and the claim checks it again and writes `submissions.variant` in the same UPDATE; `findGrading` checks a result against the list of the paper's variant. "Șterge varianta CES" (`removeCesVariant`) checks in its SQL that no paper has the variant `ces`. The report gives the CES columns apart (`cesExercises`) only when they are not the class ones (`sameExercises` in `shared/stats.ts`); the class analysis gets each paper's `variant` and the CES exercises.
- A test gets its `upload_token` in its INSERT (`createTest`), so a draft has its print PDF; Start test keeps it (`COALESCE`, for a draft made before that). A draft made before that gets one at Start, with a new test file (`saveTestFile`), or with "Pregătește testul cu cod QR" (`retryPrint`). Stop test (`stopTest`: open → draft, clears `started_at` and `evaluation_at`) checks in its SQL that the test was never evaluated (`evaluation_started_at IS NULL`) and that no upload of the test has a file or is past `uploading` (`NO_STUDENT_FILES`); a student file that lands at the same moment checks the open test in its own SQL (`OPEN_UPLOAD`), so one of the two is refused. Student writes on a draft answer 409 `not_started`.
```

Replace it with:

```markdown
- The robot reads a draft or open test only while it is a print job (`NEEDS_PRINT` in `db/runner.ts`), checked in SQL, and the print PDF is stored only with the run's lease and the current `files_version`.
- The CES variant (migration 0024): every column of the test file, the barem, its comments and request, the exercise list and the print PDF has a `ces_` twin, with its own `ces_files_version`; the queries that serve both take a `variant` and name their columns with `columns(variant)` (`db/variant.ts`, also `needsPrintSql`, `needsBaremSql`, `baremActiveSql`, `paperVariantSql`). The teacher's CES routes are `/api/admin/tests/:code/ces/…` (`routes/cesVariant.ts`); a CES file or comment change is refused only while a CES paper is in grading, and a CES barem may be generated until the test is done. The robot's routes take `?variant=ces` (none: the class test, as an older robot asks); `/tasks` lists `cesPrints`, `cesBarems` and `cesExerciseLists`. The CES list waits for an active CES barem, the class list and a CES paper (`NEEDS_CES_EXERCISE_LIST`). `GRADABLE` holds a CES paper back until its CES barem is active and its CES list usable, and the claim checks it again and writes `submissions.variant` in the same UPDATE; `findGrading` checks a result against the list of the paper's variant. "Șterge varianta CES" (`removeCesVariant`) checks in its SQL that no paper has the variant `ces`. The CES switch (migration 0025, `tests.ces_off`, stored as "off" so that every test asks for the CES files until the teacher says no): Test nou sends `cesOff`; `PUT /:code/ces/off` (`setCesOff`) turns it off in the same guarded write as the removal (and starts the robot during the evaluation), or on; a CES file sets `ces_off = 0` in its own UPDATE. `TestSummary.prepared.ces` gives the tests list what the CES variant has (`wanted`: an active CES student and the switch on). The CES barem job (`needsBaremSql('ces')`) waits while the class barem is being generated. The report gives the CES columns apart (`cesExercises`) only when they are not the class ones (`sameExercises` in `shared/stats.ts`); the class analysis gets each paper's `variant` and the CES exercises.
- A test gets its `upload_token` in its INSERT (`createTest`), so a draft has its print PDF; Start test keeps it (`COALESCE`, for a draft made before that). A draft made before that gets one at Start, with a new test file (`saveTestFile`), or with "Pregătește testul cu cod QR" (`retryPrint`). Stop test (`stopTest`: open → draft, clears `started_at` and `evaluation_at`) checks in its SQL that the test was never evaluated (`evaluation_started_at IS NULL`) and that no upload of the test has a file or is past `uploading` (`NO_STUDENT_FILES`); a student file that lands at the same moment checks the open test in its own SQL (`OPEN_UPLOAD`), so one of the two is refused. Student writes on a draft answer 409 `not_started`.
```

- [ ] **Step 5: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off), "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: exactly the three cases of spec §5; `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `pages/TestsPage.tsx` is the start page, the Teste page of the redesign (spec §5): the greeting and today's date in Romania's time (`testsPage/greeting.ts`), "N lucruri te așteaptă ˅", which opens the list of what waits in place (`testsPage/TodoRows.tsx`: "De făcut" of every class of the year, as the bar counts it, whatever chip is chosen), the class chips and the box "Arată și testele arhivate", and the groups "În lucru" and "Terminate" (`testsPage/TestGroup.tsx`; `inWork()` in `shell/todo.ts` is the rule of the panel "Clasele tale" too). A row shows the test, the stage bar and the current stage, the papers, and one next step (`testsPage/nextStep.ts`): a link to the test (to the review for "Verifică 3 puncte"), or the button that publishes the results on the row; "Oprește accesul" stays on a row whose results are open. Below 768px each row is a block.
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive, delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off), "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
- `pages/TestsPage.tsx` is the start page, the Teste page of the redesign (spec §5): the greeting and today's date in Romania's time (`testsPage/greeting.ts`), "N lucruri te așteaptă ˅", which opens the list of what waits in place (`testsPage/TodoRows.tsx`: "De făcut" of every class of the year, as the bar counts it, whatever chip is chosen), the class chips and the box "Arată și testele arhivate", and the groups "În lucru" and "Terminate" (`testsPage/TestGroup.tsx`; `inWork()` in `shell/todo.ts` is the rule of the panel "Clasele tale" too). A row shows the test, the stage bar and the current stage, the papers, and one next step (`testsPage/nextStep.ts`): a link to the test (to the review for "Verifică 3 puncte"), or the button that publishes the results on the row; "Oprește accesul" stays on a row whose results are open. Below 768px each row is a block.
```

- [ ] **Step 6: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded. `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa") and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the review queue, the search, the student page's heading); Fișa testului lists the CES files; "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: its own `TestFiles` with `variant="ces"`, the total warning, "Șterge varianta CES") and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

Replace it with:

```markdown
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded. `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa") and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report, the review queue, the search, the student page's heading); Fișa testului lists the CES files; "De făcut" (`shell/todo.ts`) also asks to check a generated CES barem, or to generate it again (`TestSummary.cesBarem`), after the class barem's case and until the test is done; `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: the CES students and the switch "Test separat pentru elevii cu CES" (`CesSwitch.tsx`, also on Test nou; off asks first when there are CES files, then removes them through `setCesOff`), its own `TestFiles` with `variant="ces"` while the switch is on, the total warning, and "Șterge varianta CES" only once the class has no CES student left) and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. What a draft or open test misses (`missing.ts`) is said in the stages, in "De făcut", as orange "lipsește" (and green "gata") marks in `TestFiles`, and as `MissingList.tsx` under "Începe testul" (with why each part matters) and under "Creează testul". `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

- [ ] **Step 7: Run every test**

Run: `npm test`
Expected: `Test Files  139 passed | 1 skipped (140)`, `Tests  2194 passed | 3 skipped (2197)`.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md docs/superpowers/specs/2026-11-09-ces-variant-design.md server/AGENTS.md src/AGENTS.md
git commit -m "Write down the CES switch and the warnings for what is missing"
```

### Task 6: Check, live database, push (main session only)

- [ ] **Step 1: Run every test once more, in UTC**

Run (Git Bash): `TZ=UTC npm test`
Expected: `Test Files  139 passed | 1 skipped (140)`, `Tests  2194 passed | 3 skipped (2197)`.

- [ ] **Step 2: Look at the pages in the browser**

Run `npm run db:local` and `npm run build`, start `npm run preview`, and look at, at desktop width and at 375 px (no sideways scroll): Test nou for a class with a CES student (the box with the names, the switch on, "Testul CES" and "Baremul CES" beside the class ones, the orange list under "Creează testul" that shrinks as files are chosen; the switch off hides the CES column); Test nou for a class without one (no box, the list of the class parts); the new draft's test page (Pregătire orange with "lipsesc …", the orange "lipsește" and green "gata" marks, the switch in "Varianta CES"; off, the CES files go and the note drops the CES parts); "În clasă" (the list under "Începe testul" with why each part matters); "De făcut" and the Teste page ("Adaugă ce lipsește", "Încarcă …"). Stop the preview and end the leftover `workerd.exe` (root `AGENTS.md`, Gotchas).

- [ ] **Step 3: Run the migration on the live database — ask the user first**

Run: `npx wrangler d1 migrations list quickeval --remote`
Expected: only `0025_ces_off.sql` to apply. If another migration is listed, stop and ask the user.

Ask the user, then run: `npx wrangler d1 migrations apply quickeval --remote`
Expected: `0025_ces_off.sql` applied. Only then may the code reach `main`.

- [ ] **Step 4: Push — ask the user first**

Ask the user, then push `feature/ces-variant` (pull request #57 gets the new commits) and add to the pull request's body the CES switch, the warnings, and migration 0025.
