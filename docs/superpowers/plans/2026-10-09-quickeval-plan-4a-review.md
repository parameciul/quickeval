# QuickEval Plan 4a: Review of the Grades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 9 must run in the main session, not in a subagent:** every outward step needs the user's explicit yes, and some steps are done by the user alone.

**Goal:** The teacher checks and corrects the robot's grades: a result page for each student's upload (points per exercise, the items to check, Verificat, new points and comments, the check of pages the robot could not read, Recorectează), "Recorectează tot" for a whole test, a history page for each student, and the number of items to check on the test list.

**Architecture:** The API gains the graded result in `GET /api/admin/submissions/:id`, the teacher's corrections (`PATCH /api/admin/evaluation-items/:id`, `PATCH /api/admin/submissions/:id/evaluation`), Regrade for one upload or a whole test, and `GET /api/admin/students/:id/history`. A new migration (0006) adds `evaluations.pages_reviewed_at`. A new `server/db/evaluations.ts` reads results and holds the corrections; one SQL fragment (`flagCountSql`) counts the items to check everywhere. Each correction and regrade checks in its SQL that the upload is graded and the test is the teacher's. The teacher app gets the result page (`src/admin/submissionPage/`), the student page (`/elevi/:id`), and the regrade buttons. The robot does not change.

**Tech Stack:** Node 24, TypeScript 7, React 19, TanStack Query, React Router, Vitest 5, Testing Library, Hono 4, zod 4, wrangler 4 (`getPlatformProxy`), Cloudflare D1 and R2. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-quickeval-design.md`. This plan implements §19 item 4a: §14.1 (the student result page, without the PDF and Share, which are Plan 4b), the Regrade of §8.5, the routes of §11.1 for results, corrections, Regrade, and history, the student page of §9, and the flag count on Teste (`docs/superpowers/plans/plan-3a-followups.md`, "For Plan 4"). Task 8 writes this plan's rulings into the spec and cuts §19 item 4 into 4a and 4b. Read `plan-3b-followups.md` too: the code in the repo is the source of truth, not the older plans.

## Global Constraints

- Node 24 (`.node-version`), npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx`/`.mjs` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments, and docs are English. **No page tells students that AI grades their work.** The pages of this plan are teacher pages: they may name the robot.
- API errors are `{ "error": "<code>", "message": "<Romanian text>" }`, made with `ApiError(status, code, message)`.
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`, test codes through `parseTestCode`; the teacher app reads ids with `parsePositiveId`.
- Each teacher write of this plan checks its own rules inside its SQL statement (or one `db.batch()`): the upload is graded, and the test is the teacher's. Never turn these into a check before the write. A rule on a value that never changes (an item's maximum) may be checked before the write.
- Points and grades are computed by code, never by Claude. Teacher points go in steps of 0.05 and are checked in whole cents.
- Times are stored as ISO 8601 UTC strings written by `toISOString()` (`nowIso()`), and shown in Europe/Bucharest time.
- Functions do no heavy CPU work and make at most 15 D1 queries per request.
- API tests use wrangler's `getPlatformProxy`. No direct `miniflare` dependency.
- A new migration runs on the live database before the code that needs it reaches `main` (`docs/deploy.md`).
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers.
- Development happens on Windows (commands below work in Git Bash and in PowerShell unless a step says otherwise). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`. Run `npm test` alone, in the foreground: `runner/run.test.ts` times out when two test runs share the machine.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto4a/t1` … `refs/proto4a/t8`, one per task, on `refs/proto4a/base` (its own commit, with the same files as `f76220e`). After Task N, `git diff --stat refs/proto4a/tN HEAD` lists only this plan file. The repo's tags `base` and `t1` … `t9` belong to Plan 3a's prototype: leave them.
- One test runs the real pandoc, and only where pandoc is installed (`pandoc --version` works). The totals below are for a PC with pandoc; without it, that test shows as skipped.
- Tests that start wrangler's local engine leave nothing running when they pass. If a run is stopped halfway on Windows, check for a leftover `workerd.exe` as `AGENTS.md` describes.

## Rulings made while planning

These decisions were made while the plan was built and tested. They are binding for the implementers and reviewers. Task 8 writes the ones that change the spec into the spec.

1. **Plan 4 is cut in two** (the user's choice, 2026-10-09). 4a is the review of the grades and changes no robot code. 4b is the class analysis, the class report, PDFs, CSV, Share, and the operations notes. Nothing makes a class analysis in 4a, so `analysis_status` stays `none`, and no test waits for one.
2. **Unreadable pages get their own check.** Migration 0006 adds `evaluations.pages_reviewed_at`. `PATCH /api/admin/submissions/:id/evaluation { pagesReviewed }` sets or clears it. The pages count as one item to check until it is set. Without it, a page the robot could not read would count forever.
3. **One count of the items to check.** `flagCountSql(ev)` (unchecked flagged items, plus one while unreadable pages are not checked) feeds the uploads table, the new `TestSummary.flagCount`, the result page, and the history.
4. **Points in cents.** `isValidCorrection(points, maxPoints)` (`shared/scoring.ts`) takes 0 to the maximum in steps of 0.05, and the maximum itself, which a barem can set to 0.33. The route checks it against the item's maximum, which never changes; the write itself checks that the upload is graded and the test is the teacher's. The page uses the same function before it sends.
5. **The total and the grade.** A correction first writes the item, then sums the total again from all items (`ROUND(Σ points + office_points, 2)`) and computes the grade with `gradeSql` (integer hundredths, half up), in one batch. Summing from the items makes two corrections at once safe. A test compares `gradeSql` with `gradeOf` for every amount in cents up to 100 points.
6. **What a correction marks.** New points or a new comment set `changed_by_teacher = 1` and mark a ready class analysis as stale. `reviewed: true` sets `reviewed_at` and keeps the first time; `reviewed: false` clears it. A check alone changes no total and no `updated_at`.
7. **The page sends only what changed**, and saving an item that waits for a check also checks it. "Verificat" alone keeps the points.
8. **Regrade.** One upload: only a graded one (409 `not_graded`; a failed one has Reîncearcă). A whole test: every graded upload and every failed one (409 `nothing_to_regrade` when there is none). Uploads in `grading` stay with their run. Results and corrections are deleted, the uploads become `submitted` with 0 attempts and no error, run id, or grading time. A `done` test goes back to `evaluating` with the analysis rule of §8.5, and the robot is started (`robotStarter`, because the GitHub schedule does not fire) while the test is `evaluating`. An `open` test grades them after Start evaluation, and the page says so.
9. **The history** lists only graded uploads, newest test first (by the test's start), each with its grade and items to check, and the student's classes (a class the student left is marked).
10. **The result page layout.** One column on a phone (pages first). From 64rem, the pages take a third and stay in view while the results scroll. PDFs show in a frame: file answers carry `X-Frame-Options: SAMEORIGIN`, and the page's CSP (`default-src 'self'`) allows frames of the same site. `.table-wrap` becomes `position: relative`, so the hidden column names of a wide table stay inside its scrolling box: before, they made pages wider than a phone.
11. **The result page refreshes** every 10 seconds while its upload waits for the robot or is being graded, like the test page.
12. **Not in the page:** taking a check back. The API allows it (`reviewed: false`, `pagesReviewed: false`).
13. **The query count of a correction.** `PATCH /api/admin/evaluation-items/:id` is the heaviest route of this plan: the `promoteDue` middleware (3), the teacher login (1), `findTeacherItem` (1), the item write (1), the batch for the total, the grade, and the analysis (3), and the upload for the answer (4): 13 of the 15 allowed, 14 when the same request also starts a scheduled evaluation. Do not add queries to it.

## Not in this plan

The class analysis (the robot's third task, the `class-report` mode, the `ClassAnalysis` contract, its routes, Regenerează), the class report, PDFs, CSV, Share, and the operations notes in `docs/deploy.md` are Plan 4b. `docs/superpowers/plans/plan-4a-followups.md` (Task 8) lists what this plan leaves open.

---

### Task 1: The graded result in the API, and one count of the items to check

Migration 0006 adds `evaluations.pages_reviewed_at`. `GET /api/admin/submissions/:id` returns the test's status, the last error, and the graded result with its items. The test list and the test page count the items to check of all graded uploads.

**Files:**
- Create: `migrations/0006_pages_reviewed.sql`, `server/db/evaluations.ts`
- Modify: `shared/api.ts`, `server/db/submissions.ts`, `server/db/tests.ts`, `src/test/fakeApi.ts`
- Test: `server/routes/submissions.test.ts`, `server/routes/tests.test.ts`, `src/admin/pages/SubmissionPage.test.tsx` (modified)

**Interfaces:**
- Consumes: `addSubmission()`, `addEvaluation()` (`server/test/fixtures.ts`); `Confidence` (`shared/schemas.ts`).
- Produces:
  - Column `evaluations.pages_reviewed_at TEXT`.
  - `flagCountSql(ev: string): string` and `getEvaluation(db, submissionId): Promise<EvaluationInfo | null>` in `server/db/evaluations.ts`.
  - Types in `shared/api.ts`: `EvaluationItemInfo { id, exerciseId, label, maxPoints, aiPoints, points, studentAnswer, comment, confidence, needsReview, reviewReason, reviewed, changedByTeacher }`; `EvaluationInfo { maxTotal, officePoints, total, grade, summary, strengths, recommendations, unreadable, pagesReviewed, flagCount, items }`; `SubmissionDetail` adds `testStatus: TestStatus`, `lastError: string | null`, `evaluation: EvaluationInfo | null`; `TestSummary` adds `flagCount: number`.

- [ ] **Step 1: Edit `server/routes/submissions.test.ts`**

Find this block:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

Replace it with:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

- [ ] **Step 2: Edit `server/routes/submissions.test.ts`**

Find this block:

```ts
      testTitle: 'Fracții',
      studentId,
```

Replace it with:

```ts
      testTitle: 'Fracții',
      testStatus: 'draft',
      studentId,
```

- [ ] **Step 3: Edit `server/routes/submissions.test.ts`**

Find this block:

```ts
      submittedAt: '2026-10-06T08:30:00.000Z',
      files: [
```

Replace it with:

```ts
      submittedAt: '2026-10-06T08:30:00.000Z',
      lastError: null,
      files: [
```

- [ ] **Step 4: Edit `server/routes/submissions.test.ts`**

Find this block:

```ts
      ],
    });
```

Replace it with:

```ts
      ],
      evaluation: null,
    });
  });

  it('returns the graded result with its items in barem order', async () => {
    await api.db.prepare("UPDATE submissions SET status = 'graded' WHERE id = ?").bind(submissionId).run();
    const evaluationId = await addEvaluation(api, submissionId, {
      grade: 8.5,
      items: [{ needsReview: true }, { needsReview: true, reviewed: true }, {}],
      unreadable: ['student/page-02.jpg'],
    });
    await api.db
      .prepare(`UPDATE evaluations SET strengths_json = '["Fracții"]', recommendations_json = '["Exersează ecuațiile."]' WHERE id = ?`)
      .bind(evaluationId)
      .run();
    // The first item moves to the end of the barem.
    await api.db
      .prepare("UPDATE evaluation_items SET position = 9, points = 0.5, changed_by_teacher = 1 WHERE evaluation_id = ? AND exercise_id = 'E1'")
      .bind(evaluationId)
      .run();
    const itemId = async (exerciseId: string) =>
      (await api.db.prepare('SELECT id FROM evaluation_items WHERE exercise_id = ?').bind(exerciseId).first<{ id: number }>())!.id;
    const item = { label: 'Exercițiu', maxPoints: 1, aiPoints: 1, points: 1, studentAnswer: 'r', comment: 'c', confidence: 'high' };

    const res = await api.request('GET', `/api/admin/submissions/${submissionId}`);
    expect(res.body.submission.status).toBe('graded');
    expect(res.body.submission.evaluation).toEqual({
      maxTotal: 10,
      officePoints: 1,
      total: 8.5,
      grade: 8.5,
      summary: 'Rezumat.',
      strengths: ['Fracții'],
      recommendations: ['Exersează ecuațiile.'],
      unreadable: ['student/page-02.jpg'],
      pagesReviewed: false,
      // E1 is not checked yet, and the unreadable page counts once.
      flagCount: 2,
      items: [
        { ...item, id: await itemId('E2'), exerciseId: 'E2', needsReview: true, reviewReason: 'Verifică', reviewed: true, changedByTeacher: false },
        { ...item, id: await itemId('E3'), exerciseId: 'E3', needsReview: false, reviewReason: '', reviewed: false, changedByTeacher: false },
        {
          ...item,
          id: await itemId('E1'),
          exerciseId: 'E1',
          points: 0.5,
          needsReview: true,
          reviewReason: 'Verifică',
          reviewed: false,
          changedByTeacher: true,
        },
      ],
    });
  });

  it('stops counting the unreadable pages once the teacher checked them', async () => {
    await api.db.prepare("UPDATE submissions SET status = 'graded' WHERE id = ?").bind(submissionId).run();
    const evaluationId = await addEvaluation(api, submissionId, { unreadable: ['student/page-01.jpg'] });
    await api.db.prepare("UPDATE evaluations SET pages_reviewed_at = '2026-10-08T10:00:00.000Z' WHERE id = ?").bind(evaluationId).run();
    const res = await api.request('GET', `/api/admin/submissions/${submissionId}`);
    expect(res.body.submission.evaluation).toMatchObject({ pagesReviewed: true, flagCount: 0 });
  });

  it('gives the test status and the error of a failed grading', async () => {
    await api.db
      .prepare("UPDATE submissions SET status = 'failed', last_error = 'Robotul nu a terminat la timp.' WHERE id = ?")
      .bind(submissionId)
      .run();
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(code).run();
    const res = await api.request('GET', `/api/admin/submissions/${submissionId}`);
    expect(res.body.submission).toMatchObject({
      status: 'failed',
      testStatus: 'done',
      lastError: 'Robotul nu a terminat la timp.',
      evaluation: null,
    });
```

- [ ] **Step 5: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
    expect(res.body.tests.map((t: { title: string }) => t.title)).toEqual(['Al doilea', 'Primul']);
    expect(res.body.tests[1]).toMatchObject({ code: '6E2-26T1', studentCount: 3, submittedCount: 1, gradedCount: 0, startedAt: null });
  });
```

Replace it with:

```ts
    expect(res.body.tests.map((t: { title: string }) => t.title)).toEqual(['Al doilea', 'Primul']);
    expect(res.body.tests[1]).toMatchObject({
      code: '6E2-26T1',
      studentCount: 3,
      submittedCount: 1,
      gradedCount: 0,
      flagCount: 0,
      startedAt: null,
    });
  });

  it('counts the items to check of all graded uploads', async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
    const code = await makeTest(api, cls.id);
    const first = await addSubmission(api, code, cls.studentIds[0]!, { status: 'graded', files: 1 });
    await addEvaluation(api, first, { items: [{ needsReview: true }, { needsReview: true, reviewed: true }], unreadable: ['student/page-01.jpg'] });
    const second = await addSubmission(api, code, cls.studentIds[1]!, { status: 'graded', files: 1 });
    const checked = await addEvaluation(api, second, { items: [{ needsReview: true }], unreadable: ['student/page-03.jpg'] });
    await api.db.prepare("UPDATE evaluations SET pages_reviewed_at = '2026-10-08T10:00:00.000Z' WHERE id = ?").bind(checked).run();
    await addSubmission(api, code, cls.studentIds[2]!, { status: 'submitted', files: 1 });

    const res = await api.request('GET', '/api/admin/tests?year=2026');
    // First upload: one item and the unreadable page; second: one item (its pages are checked).
    expect(res.body.tests[0]).toMatchObject({ code, gradedCount: 2, flagCount: 3 });
  });
```

- [ ] **Step 6: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
      gradedCount: 2,
      exerciseList: { status: 'problem', message: 'Punctajele din barem dau 9, dar totalul este 10.' },
```

Replace it with:

```ts
      gradedCount: 2,
      flagCount: 3,
      exerciseList: { status: 'problem', message: 'Punctajele din barem dau 9, dar totalul este 10.' },
```

- [ ] **Step 7: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
    expect(byName['Stan Eva']).toMatchObject({ status: 'failed', grade: null, flagCount: 0, lastError: 'Corectarea a durat prea mult.' });
  });
```

Replace it with:

```ts
    expect(byName['Stan Eva']).toMatchObject({ status: 'failed', grade: null, flagCount: 0, lastError: 'Corectarea a durat prea mult.' });

    // Once the teacher checked the unreadable page, it no longer counts.
    await api.db.prepare("UPDATE evaluations SET pages_reviewed_at = '2026-10-08T10:00:00.000Z' WHERE submission_id = ?").bind(graded).run();
    const checked = await api.request('GET', `/api/admin/tests/${code}`);
    expect(checked.body.test.flagCount).toBe(2);
    expect(checked.body.uploads.find((row: { studentName: string }) => row.studentName === 'Pop Ion').flagCount).toBe(2);
  });
```

- [ ] **Step 8: Edit `src/admin/pages/SubmissionPage.test.tsx`**

Find this block:

```tsx
  testTitle: 'Fracții',
  studentId: 10,
```

Replace it with:

```tsx
  testTitle: 'Fracții',
  testStatus: 'open',
  studentId: 10,
```

- [ ] **Step 9: Edit `src/admin/pages/SubmissionPage.test.tsx`**

Find this block:

```tsx
  submittedAt: '2026-10-06T07:40:00.000Z',
  files: [
```

Replace it with:

```tsx
  submittedAt: '2026-10-06T07:40:00.000Z',
  lastError: null,
  files: [
```

- [ ] **Step 10: Edit `src/admin/pages/SubmissionPage.test.tsx`**

Find this block:

```tsx
  ],
};
```

Replace it with:

```tsx
  ],
  evaluation: null,
};
```

- [ ] **Step 11: Run the tests to see them fail**

Run: `npx vitest run server/routes/submissions.test.ts server/routes/tests.test.ts src/admin/pages/SubmissionPage.test.tsx`
Expected: FAIL. `Test Files  2 failed | 1 passed (3)`, `Tests  7 failed | 27 passed (34)`. In `server/routes/submissions.test.ts` 4 tests fail: the upload has no `testStatus`, `lastError`, or `evaluation` (`expected { id: 1, testCode: '6E2-26T1', …(8) } to deeply equal { id: 1, testCode: '6E2-26T1', …(11) }`, `expected undefined to deeply equal { maxTotal: 10, officePoints: 1, …(9) }`), and `D1_ERROR: no such column: pages_reviewed_at`. In `server/routes/tests.test.ts` 3 tests fail: the test has no `flagCount`, and `no such column: pages_reviewed_at`. `src/admin/pages/SubmissionPage.test.tsx` passes: only its fixture gained the new fields.

- [ ] **Step 12: Create `migrations/0006_pages_reviewed.sql`**

```sql
-- When the teacher checked the pages that the robot could not read. Until
-- then those pages count as one item to check. A new grading starts unchecked.

ALTER TABLE evaluations ADD COLUMN pages_reviewed_at TEXT;
```

- [ ] **Step 13: Edit `shared/api.ts`**

Find this block:

```ts
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
import { isValidSchoolYear } from './schoolYear.ts';
```

Replace it with:

```ts
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
import type { Confidence } from './schemas.ts';
import { isValidSchoolYear } from './schoolYear.ts';
```

- [ ] **Step 14: Edit `shared/api.ts`**

Find this block:

```ts
  gradedCount: number;
}
```

Replace it with:

```ts
  gradedCount: number;
  // Items to check in all graded uploads, counted as in the uploads table.
  flagCount: number;
}
```

- [ ] **Step 15: Edit `shared/api.ts`**

Find this block:

```ts

export interface SubmissionDetail {
```

Replace it with:

```ts

// One exercise of a graded upload. `aiPoints` are the robot's points;
// `points` are the final points, which the teacher may change.
export interface EvaluationItemInfo {
  id: number;
  exerciseId: string;
  label: string;
  maxPoints: number;
  aiPoints: number;
  points: number;
  studentAnswer: string;
  comment: string;
  confidence: Confidence;
  // The robot asked the teacher to check this item, and why.
  needsReview: boolean;
  reviewReason: string;
  // The teacher marked the item as checked.
  reviewed: boolean;
  changedByTeacher: boolean;
}

// The graded result of an upload (spec §14.1).
export interface EvaluationInfo {
  maxTotal: number;
  officePoints: number;
  total: number;
  // Out of 10.
  grade: number;
  summary: string;
  strengths: string[];
  recommendations: string[];
  // Pages the robot could not read, as the robot named them ("student/page-02.jpg").
  unreadable: string[];
  // The teacher checked those pages.
  pagesReviewed: boolean;
  // Items to check that the teacher has not checked yet, plus one for pages
  // that could not be read and are not checked yet.
  flagCount: number;
  items: EvaluationItemInfo[];
}

export interface SubmissionDetail {
```

- [ ] **Step 16: Edit `shared/api.ts`**

Find this block:

```ts
  testTitle: string;
  studentId: number;
```

Replace it with:

```ts
  testTitle: string;
  testStatus: TestStatus;
  studentId: number;
```

- [ ] **Step 17: Edit `shared/api.ts`**

Find this block:

```ts
  submittedAt: string | null;
  files: SubmissionFile[];
}
```

Replace it with:

```ts
  submittedAt: string | null;
  // Why grading failed, for the teacher.
  lastError: string | null;
  files: SubmissionFile[];
  // Null until the upload is graded.
  evaluation: EvaluationInfo | null;
}
```

- [ ] **Step 18: Create `server/db/evaluations.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { EvaluationInfo, EvaluationItemInfo } from '../../shared/api.ts';
import type { Confidence } from '../../shared/schemas.ts';

// Graded results and the teacher's checks of them (spec §14.1).

// Items to check of the evaluation `ev` that the teacher has not checked yet,
// plus one while pages that the robot could not read are not checked. The
// uploads table, the test list, and the result page count the same way.
export function flagCountSql(ev: string): string {
  return `((SELECT COUNT(*) FROM evaluation_items i WHERE i.evaluation_id = ${ev}.id AND i.needs_review = 1 AND i.reviewed_at IS NULL)
    + CASE WHEN json_array_length(${ev}.unreadable_json) > 0 AND ${ev}.pages_reviewed_at IS NULL THEN 1 ELSE 0 END)`;
}

interface EvaluationRow {
  id: number;
  max_total: number;
  office_points: number;
  total: number;
  grade: number;
  summary: string;
  strengths_json: string;
  recommendations_json: string;
  unreadable_json: string;
  pages_reviewed_at: string | null;
  flag_count: number;
}

interface ItemRow {
  id: number;
  exercise_id: string;
  label: string;
  max_points: number;
  ai_points: number;
  points: number;
  student_answer: string;
  comment: string;
  confidence: Confidence;
  needs_review: number;
  review_reason: string;
  reviewed_at: string | null;
  changed_by_teacher: number;
}

function toItem(row: ItemRow): EvaluationItemInfo {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    label: row.label,
    maxPoints: row.max_points,
    aiPoints: row.ai_points,
    points: row.points,
    studentAnswer: row.student_answer,
    comment: row.comment,
    confidence: row.confidence,
    needsReview: row.needs_review === 1,
    reviewReason: row.review_reason,
    reviewed: row.reviewed_at !== null,
    changedByTeacher: row.changed_by_teacher === 1,
  };
}

// The evaluation of an upload with its items in barem order. Null when the
// upload has none. The caller checks that the upload is the teacher's.
export async function getEvaluation(db: D1Database, submissionId: number): Promise<EvaluationInfo | null> {
  const [evaluations, items] = await db.batch<EvaluationRow | ItemRow>([
    db
      .prepare(
        `SELECT ev.id, ev.max_total, ev.office_points, ev.total, ev.grade, ev.summary, ev.strengths_json,
           ev.recommendations_json, ev.unreadable_json, ev.pages_reviewed_at, ${flagCountSql('ev')} AS flag_count
         FROM evaluations ev WHERE ev.submission_id = ?`,
      )
      .bind(submissionId),
    db
      .prepare(
        `SELECT i.id, i.exercise_id, i.label, i.max_points, i.ai_points, i.points, i.student_answer, i.comment, i.confidence,
           i.needs_review, i.review_reason, i.reviewed_at, i.changed_by_teacher
         FROM evaluation_items i JOIN evaluations ev ON ev.id = i.evaluation_id
         WHERE ev.submission_id = ?
         ORDER BY i.position, i.id`,
      )
      .bind(submissionId),
  ]);
  const row = evaluations?.results[0] as EvaluationRow | undefined;
  if (!row) return null;
  return {
    maxTotal: row.max_total,
    officePoints: row.office_points,
    total: row.total,
    grade: row.grade,
    summary: row.summary,
    strengths: JSON.parse(row.strengths_json) as string[],
    recommendations: JSON.parse(row.recommendations_json) as string[],
    unreadable: JSON.parse(row.unreadable_json) as string[],
    pagesReviewed: row.pages_reviewed_at !== null,
    flagCount: row.flag_count,
    items: ((items?.results ?? []) as ItemRow[]).map(toItem),
  };
}
```

- [ ] **Step 19: Edit `server/db/submissions.ts`**

Find this block:

```ts
import type { SubmissionDetail, SubmissionFile, UploadStatus } from '../../shared/api.ts';
import type { StoredFile } from './tests.ts';
```

Replace it with:

```ts
import type { SubmissionDetail, SubmissionFile, UploadStatus } from '../../shared/api.ts';
import type { TestStatus } from '../../shared/tests.ts';
import { getEvaluation } from './evaluations.ts';
import type { StoredFile } from './tests.ts';
```

- [ ] **Step 20: Edit `server/db/submissions.ts`**

Find this block:

```ts

// One upload as the teacher sees it, with its files. Null when it is not an
// upload of one of the teacher's tests.
export async function getTeacherSubmission(
```

Replace it with:

```ts

// One upload as the teacher sees it, with its files and its graded result.
// Null when it is not an upload of one of the teacher's tests.
export async function getTeacherSubmission(
```

- [ ] **Step 21: Edit `server/db/submissions.ts`**

Find this block:

```ts
    .prepare(
      `SELECT s.id, s.status, s.auto_submitted, s.started_at, s.submitted_at, s.student_id, st.full_name, t.code, t.title
       FROM submissions s
```

Replace it with:

```ts
    .prepare(
      `SELECT s.id, s.status, s.auto_submitted, s.started_at, s.submitted_at, s.last_error, s.student_id, st.full_name,
         t.code, t.title, t.status AS test_status
       FROM submissions s
```

- [ ] **Step 22: Edit `server/db/submissions.ts`**

Find this block:

```ts
      submitted_at: string | null;
      student_id: number;
```

Replace it with:

```ts
      submitted_at: string | null;
      last_error: string | null;
      student_id: number;
```

- [ ] **Step 23: Edit `server/db/submissions.ts`**

Find this block:

```ts
      title: string;
    }>();
```

Replace it with:

```ts
      title: string;
      test_status: TestStatus;
    }>();
```

- [ ] **Step 24: Edit `server/db/submissions.ts`**

Find this block:

```ts
      testTitle: row.title,
      studentId: row.student_id,
```

Replace it with:

```ts
      testTitle: row.title,
      testStatus: row.test_status,
      studentId: row.student_id,
```

- [ ] **Step 25: Edit `server/db/submissions.ts`**

Find this block:

```ts
      submittedAt: row.submitted_at,
      files: files.map(publicFile),
    },
```

Replace it with:

```ts
      submittedAt: row.submitted_at,
      lastError: row.last_error,
      files: files.map(publicFile),
      evaluation: await getEvaluation(db, row.id),
    },
```

- [ ] **Step 26: Edit `server/db/tests.ts`**

Find this block:

```ts
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';

```

Replace it with:

```ts
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
import { flagCountSql } from './evaluations.ts';

```

- [ ] **Step 27: Edit `server/db/tests.ts`**

Find this block:

```ts
  graded_count: number;
}
```

Replace it with:

```ts
  graded_count: number;
  flag_count: number;
}
```

- [ ] **Step 28: Edit `server/db/tests.ts`**

Find this block:

```ts
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status <> 'uploading') AS submitted_count,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status = 'graded') AS graded_count
  FROM tests t JOIN classes c ON c.id = t.class_id`;
```

Replace it with:

```ts
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status <> 'uploading') AS submitted_count,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status = 'graded') AS graded_count,
    (SELECT COALESCE(SUM(${flagCountSql('ev')}), 0)
       FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id WHERE s.test_id = t.id) AS flag_count
  FROM tests t JOIN classes c ON c.id = t.class_id`;
```

- [ ] **Step 29: Edit `server/db/tests.ts`**

Find this block:

```ts
      gradedCount: row.graded_count,
    },
```

Replace it with:

```ts
      gradedCount: row.graded_count,
      flagCount: row.flag_count,
    },
```

- [ ] **Step 30: Edit `server/db/tests.ts`**

Find this block:

```ts
         (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count,
         (SELECT COUNT(*) FROM evaluation_items i WHERE i.evaluation_id = ev.id AND i.needs_review = 1 AND i.reviewed_at IS NULL)
           + CASE WHEN json_array_length(ev.unreadable_json) > 0 THEN 1 ELSE 0 END AS flag_count
       FROM enrollments e
```

Replace it with:

```ts
         (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count,
         ${flagCountSql('ev')} AS flag_count
       FROM enrollments e
```

- [ ] **Step 31: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      gradedCount: uploads.filter((row) => row.status === 'graded').length,
      uploadToken: null,
```

Replace it with:

```ts
      gradedCount: uploads.filter((row) => row.status === 'graded').length,
      flagCount: uploads.reduce((sum, row) => sum + row.flagCount, 0),
      uploadToken: null,
```

- [ ] **Step 32: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  58 passed (58)`, `Tests  699 passed (699)`.

- [ ] **Step 33: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 34: Commit**

```bash
git add migrations server shared src
git commit -m "Return the graded result of an upload, and count the items to check of a test"
```

---

### Task 2: The teacher's corrections

`PATCH /api/admin/evaluation-items/:id` changes an item's points or comment and checks it; the total and the grade follow. `PATCH /api/admin/submissions/:id/evaluation` checks the pages that the robot could not read. Both answer with the whole upload.

**Files:**
- Create: `server/routes/evaluations.ts`
- Replace: `server/db/evaluations.ts`
- Modify: `shared/scoring.ts`, `shared/api.ts`, `server/routes/submissions.ts`, `server/routes/admin.ts`
- Test: `server/routes/corrections.test.ts` (new), `shared/scoring.test.ts` (modified)

**Interfaces:**
- Consumes: `flagCountSql`, `getEvaluation` (Task 1); `getTeacherSubmission`; `round2`, `formatPoints`; `TEXT_LIMITS` (`shared/schemas.ts`).
- Produces:
  - `POINTS_STEP_CENTS = 5`, `toCents(points): number | null`, `isValidCorrection(points, maxPoints): boolean` in `shared/scoring.ts`.
  - `correctItemBody` (zod: `points?`, `comment?` trimmed, at most `TEXT_LIMITS.comment`, `reviewed?`; at least one) and `type ItemCorrection`; `reviewPagesBody` (`{ pagesReviewed: boolean }`) in `shared/api.ts`.
  - `gradeSql(total, maxTotal): string`, `findTeacherItem(db, teacherId, itemId)`, `correctItem(db, teacherId, itemId, change, now): Promise<boolean>`, `reviewPages(db, teacherId, submissionId, reviewed, now): Promise<boolean>` in `server/db/evaluations.ts`.
  - `evaluationItemRoutes()` and `notGraded()` (409 `not_graded`) in `server/routes/evaluations.ts`, mounted at `/api/admin/evaluation-items`.
  - Errors: 400 `invalid_points` ("Punctajul este între 0 și X, din 0,05 în 0,05."), 409 `not_graded`, 404.

- [ ] **Step 1: Create `server/routes/corrections.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EvaluationItemInfo } from '../../shared/api.ts';
import { gradeOf } from '../../shared/scoring.ts';
import { gradeSql } from '../db/evaluations.ts';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let code: string;
let submissionId: number;
let items: Record<string, number>;

const GRADED_AT = '2026-10-07T09:00:00.000Z';

// A graded upload of a test out of 10 with 1 point "din oficiu": I.1 is worth
// 4.5 (the robot gave 4), II.1 4.17 (gave 2, and asks the teacher to check
// it), III.1 0.33 (gave 0). Total 7, grade 7.
async function gradedUpload(studentId: number): Promise<{ submissionId: number; items: Record<string, number> }> {
  const id = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
  const evaluation = await api.db
    .prepare(
      `INSERT INTO evaluations (submission_id, max_total, office_points, total, grade, needs_review, summary,
         strengths_json, recommendations_json, unreadable_json, raw_json, created_at, updated_at)
       VALUES (?, 10, 1, 7, 7, 1, 'Rezumat.', '[]', '[]', '[]', '{}', ?, ?) RETURNING id`,
    )
    .bind(id, GRADED_AT, GRADED_AT)
    .first<{ id: number }>();
  const rows: [string, number, number, number, string][] = [
    ['I.1', 4.5, 4, 0, ''],
    ['II.1', 4.17, 2, 1, 'Scrisul nu se citește.'],
    ['III.1', 0.33, 0, 0, ''],
  ];
  const ids: Record<string, number> = {};
  for (const [position, [exerciseId, maxPoints, points, needsReview, reason]] of rows.entries()) {
    const item = await api.db
      .prepare(
        `INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'r', 'Comentariu.', 'high', ?, ?) RETURNING id`,
      )
      .bind(evaluation!.id, exerciseId, position + 1, `Exercițiul ${exerciseId}`, maxPoints, points, points, needsReview, reason)
      .first<{ id: number }>();
    ids[exerciseId] = item!.id;
  }
  return { submissionId: id, items: ids };
}

const correct = (itemId: number, body: unknown) => api.request('PATCH', `/api/admin/evaluation-items/${itemId}`, body);
const itemOf = (body: { submission: { evaluation: { items: EvaluationItemInfo[] } } }, exerciseId: string) =>
  body.submission.evaluation.items.find((item) => item.exerciseId === exerciseId)!;
const evaluationRow = () =>
  api.db.prepare('SELECT total, grade, updated_at FROM evaluations WHERE submission_id = ?').bind(submissionId).first<{
    total: number;
    grade: number;
    updated_at: string;
  }>();

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Stan Eva']);
  code = await makeTest(api, cls.id, 'Fracții');
  ({ submissionId, items } = await gradedUpload(cls.studentIds[0]!));
});

afterEach(async () => {
  await api.dispose();
});

describe('PATCH /api/admin/evaluation-items/:id', () => {
  it('changes the points, and the total and the grade follow', async () => {
    const res = await correct(items['II.1']!, { points: 3.5 });
    expect(res.status).toBe(200);
    expect(res.body.submission.evaluation).toMatchObject({ total: 8.5, grade: 8.5 });
    expect(itemOf(res.body, 'II.1')).toMatchObject({ aiPoints: 2, points: 3.5, changedByTeacher: true, reviewed: false });
    expect(itemOf(res.body, 'I.1')).toMatchObject({ points: 4, changedByTeacher: false });
    expect((await evaluationRow())!.updated_at).not.toBe(GRADED_AT);

    const second = await correct(items['I.1']!, { points: 2.35 });
    expect(second.body.submission.evaluation).toMatchObject({ total: 6.85, grade: 6.85 });
  });

  it('gives the full points of a maximum that is off the 0.05 steps', async () => {
    const res = await correct(items['III.1']!, { points: 0.33 });
    expect(res.status).toBe(200);
    expect(res.body.submission.evaluation).toMatchObject({ total: 7.33, grade: 7.33 });
  });

  it('changes the comment without changing the points', async () => {
    const res = await correct(items['I.1']!, { comment: '  Calcul bun, dar lipsește unitatea de măsură.  ' });
    expect(res.status).toBe(200);
    expect(itemOf(res.body, 'I.1')).toMatchObject({
      points: 4,
      comment: 'Calcul bun, dar lipsește unitatea de măsură.',
      changedByTeacher: true,
    });
    expect(res.body.submission.evaluation).toMatchObject({ total: 7, grade: 7 });
  });

  it('marks an item as checked, keeps the first time, and takes the check back', async () => {
    const res = await correct(items['II.1']!, { reviewed: true });
    expect(res.status).toBe(200);
    expect(itemOf(res.body, 'II.1')).toMatchObject({ points: 2, reviewed: true, changedByTeacher: false });
    expect(res.body.submission.evaluation.flagCount).toBe(0);
    // A check changes no points: the result keeps its time.
    expect((await evaluationRow())!.updated_at).toBe(GRADED_AT);

    await api.db.prepare("UPDATE evaluation_items SET reviewed_at = '2026-10-08T07:00:00.000Z' WHERE id = ?").bind(items['II.1']).run();
    await correct(items['II.1']!, { reviewed: true });
    const row = await api.db.prepare('SELECT reviewed_at FROM evaluation_items WHERE id = ?').bind(items['II.1']).first<{ reviewed_at: string }>();
    expect(row!.reviewed_at).toBe('2026-10-08T07:00:00.000Z');

    const back = await correct(items['II.1']!, { reviewed: false });
    expect(itemOf(back.body, 'II.1').reviewed).toBe(false);
    expect(back.body.submission.evaluation.flagCount).toBe(1);
  });

  it('saves new points and the check in one request', async () => {
    const res = await correct(items['II.1']!, { points: 4.15, reviewed: true });
    expect(itemOf(res.body, 'II.1')).toMatchObject({ points: 4.15, reviewed: true, changedByTeacher: true });
    expect(res.body.submission.evaluation).toMatchObject({ total: 9.15, grade: 9.15, flagCount: 0 });
  });

  it('refuses points off the 0.05 steps, below 0, or above the maximum, and changes nothing', async () => {
    for (const points of [2.53, 2.555, -0.05, 4.2]) {
      const res = await correct(items['II.1']!, { points });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_points', message: 'Punctajul este între 0 și 4,17, din 0,05 în 0,05.' });
    }
    const row = await api.db.prepare('SELECT points, changed_by_teacher FROM evaluation_items WHERE id = ?').bind(items['II.1']).first();
    expect(row).toEqual({ points: 2, changed_by_teacher: 0 });
    expect(await evaluationRow()).toMatchObject({ total: 7, grade: 7 });
  });

  it('refuses a body that changes nothing or is not valid', async () => {
    expect((await correct(items['I.1']!, {})).body).toEqual({ error: 'invalid', message: 'Nu ai schimbat nimic.' });
    expect((await correct(items['I.1']!, { points: '3' })).body).toEqual({
      error: 'invalid',
      message: 'Scrie punctajul ca număr, de exemplu 2,5.',
    });
    expect((await correct(items['I.1']!, { comment: 'x'.repeat(1001) })).body).toEqual({
      error: 'invalid',
      message: 'Comentariul are cel mult 1000 de caractere.',
    });
  });

  it('answers 404 for an unknown item and for an item of another teacher', async () => {
    expect((await correct(99999, { points: 1 })).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    const foreignUpload = await addSubmission(api, foreign.code, foreign.studentId, { status: 'graded', files: 1 });
    const foreignEvaluation = await addEvaluation(api, foreignUpload);
    const foreignItem = await api.db
      .prepare('SELECT id FROM evaluation_items WHERE evaluation_id = ?')
      .bind(foreignEvaluation)
      .first<{ id: number }>();
    expect((await correct(foreignItem!.id, { points: 0 })).status).toBe(404);
    const row = await api.db.prepare('SELECT points FROM evaluation_items WHERE id = ?').bind(foreignItem!.id).first();
    expect(row).toEqual({ points: 1 });
  });

  it('answers 409 when the upload is not graded any more', async () => {
    await api.db.prepare("UPDATE submissions SET status = 'submitted' WHERE id = ?").bind(submissionId).run();
    const res = await correct(items['I.1']!, { points: 3 });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_graded', message: 'Lucrarea se corectează din nou. Reîncarcă pagina.' });
    const row = await api.db.prepare('SELECT points FROM evaluation_items WHERE id = ?').bind(items['I.1']).first();
    expect(row).toEqual({ points: 4 });
  });

  it('marks a ready class analysis as out of date when points or comments change', async () => {
    await api.db.prepare("UPDATE tests SET analysis_status = 'ready' WHERE code = ?").bind(code).run();
    const stale = async () =>
      (await api.db.prepare('SELECT analysis_stale FROM tests WHERE code = ?').bind(code).first<{ analysis_stale: number }>())!.analysis_stale;
    await correct(items['II.1']!, { reviewed: true });
    expect(await stale()).toBe(0);
    await correct(items['I.1']!, { comment: 'Alt comentariu.' });
    expect(await stale()).toBe(1);
  });

  it('computes the grade in SQL like gradeOf, for every amount in cents', async () => {
    const cases: [number, number][] = [];
    for (const maxTotal of [10, 9, 100, 4.5, 30]) {
      for (let cents = 0; cents <= Math.round(maxTotal * 100); cents += 1) cases.push([cents / 100, maxTotal]);
    }
    const { results } = await api.db
      .prepare(`SELECT ${gradeSql("json_extract(value, '$[0]')", "json_extract(value, '$[1]')")} AS grade FROM json_each(?) ORDER BY key`)
      .bind(JSON.stringify(cases))
      .all<{ grade: number }>();
    expect(results.map((row) => row.grade)).toEqual(cases.map(([total, maxTotal]) => gradeOf(total, maxTotal)));
  });
});

describe('PATCH /api/admin/submissions/:id/evaluation', () => {
  const reviewPages = (id: number, body: unknown) => api.request('PATCH', `/api/admin/submissions/${id}/evaluation`, body);

  it('marks the unreadable pages as checked, and takes the check back', async () => {
    await api.db.prepare(`UPDATE evaluations SET unreadable_json = '["student/page-01.jpg"]' WHERE submission_id = ?`).bind(submissionId).run();
    const res = await reviewPages(submissionId, { pagesReviewed: true });
    expect(res.status).toBe(200);
    // II.1 still waits for a check.
    expect(res.body.submission.evaluation).toMatchObject({ pagesReviewed: true, flagCount: 1 });
    const back = await reviewPages(submissionId, { pagesReviewed: false });
    expect(back.body.submission.evaluation).toMatchObject({ pagesReviewed: false, flagCount: 2 });
  });

  it('refuses a bad body, an upload that is not graded, and uploads of other teachers', async () => {
    expect((await reviewPages(submissionId, { pagesReviewed: 'da' })).status).toBe(400);
    const cls = await makeClass(api, '7E2', ['Marin Dan']);
    const otherCode = await makeTest(api, cls.id);
    const waiting = await addSubmission(api, otherCode, cls.studentIds[0]!, { status: 'submitted', files: 1 });
    expect((await reviewPages(waiting, { pagesReviewed: true })).body).toEqual({
      error: 'not_graded',
      message: 'Lucrarea se corectează din nou. Reîncarcă pagina.',
    });
    expect((await reviewPages(99999, { pagesReviewed: true })).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    const foreignUpload = await addSubmission(api, foreign.code, foreign.studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, foreignUpload, { unreadable: ['student/page-01.jpg'] });
    expect((await reviewPages(foreignUpload, { pagesReviewed: true })).status).toBe(404);
    const row = await api.db.prepare('SELECT pages_reviewed_at FROM evaluations WHERE submission_id = ?').bind(foreignUpload).first();
    expect(row).toEqual({ pages_reviewed_at: null });
  });
});
```

- [ ] **Step 2: Edit `shared/scoring.test.ts`**

Find this block:

```ts
import { describe, expect, it } from 'vitest';
import { formatPoints, gradeOf, round2 } from './scoring.ts';

```

Replace it with:

```ts
import { describe, expect, it } from 'vitest';
import { formatPoints, gradeOf, isValidCorrection, round2, toCents } from './scoring.ts';

```

- [ ] **Step 3: Edit `shared/scoring.test.ts`**

Find this block:

```ts

describe('formatPoints', () => {
```

Replace it with:

```ts

describe('toCents', () => {
  it('turns points with at most 2 decimals into whole cents', () => {
    expect(toCents(2.55)).toBe(255);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(10)).toBe(1000);
    expect(toCents(0)).toBe(0);
  });

  it('refuses more than 2 decimals', () => {
    expect(toCents(2.555)).toBeNull();
    expect(toCents(1 / 3)).toBeNull();
  });
});

describe('isValidCorrection', () => {
  it('takes points from 0 to the maximum in steps of 0.05', () => {
    expect(isValidCorrection(0, 4.5)).toBe(true);
    expect(isValidCorrection(2.35, 4.5)).toBe(true);
    expect(isValidCorrection(4.5, 4.5)).toBe(true);
  });

  it('refuses points off the 0.05 steps, below 0, or above the maximum', () => {
    expect(isValidCorrection(2.33, 4.5)).toBe(false);
    expect(isValidCorrection(2.555, 4.5)).toBe(false);
    expect(isValidCorrection(-0.05, 4.5)).toBe(false);
    expect(isValidCorrection(4.55, 4.5)).toBe(false);
  });

  it('takes a maximum that is off the steps, but nothing between it and the step below', () => {
    expect(isValidCorrection(0.33, 0.33)).toBe(true);
    expect(isValidCorrection(0.3, 0.33)).toBe(true);
    expect(isValidCorrection(0.32, 0.33)).toBe(false);
    expect(isValidCorrection(0.35, 0.33)).toBe(false);
  });
});

describe('formatPoints', () => {
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run server/routes/corrections.test.ts shared/scoring.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  17 failed | 4 passed (21)`. In `shared/scoring.test.ts` the 5 new tests fail with `toCents is not a function` and `isValidCorrection is not a function`. In `server/routes/corrections.test.ts` 12 tests fail: the routes do not exist yet (`Cannot read properties of undefined (reading 'evaluation')`, `expected 404 to be 200`, `gradeSql is not a function`). The 404 test of another teacher's item passes already: it guards against a route that would answer for it.

- [ ] **Step 5: Edit `shared/scoring.ts`**

Find this block:

```ts

const POINTS = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });
```

Replace it with:

```ts

// The teacher corrects points in steps of 0.05 (spec §11.1).
export const POINTS_STEP_CENTS = 5;

// The points in whole cents, or null when they have more than 2 decimals.
export function toCents(points: number): number | null {
  const cents = Math.round(points * 100);
  return Math.abs(points * 100 - cents) < 1e-6 ? cents : null;
}

// Points the teacher may give for an item worth `maxPoints`: from 0 to the
// maximum in steps of 0.05, and the maximum itself, which a barem can set to
// a value like 0.33.
export function isValidCorrection(points: number, maxPoints: number): boolean {
  const cents = toCents(points);
  const max = Math.round(maxPoints * 100);
  return cents !== null && cents >= 0 && cents <= max && (cents % POINTS_STEP_CENTS === 0 || cents === max);
}

const POINTS = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });
```

- [ ] **Step 6: Edit `shared/api.ts`**

Find this block:

```ts
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
import type { Confidence } from './schemas.ts';
import { isValidSchoolYear } from './schoolYear.ts';
```

Replace it with:

```ts
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
import { TEXT_LIMITS, type Confidence } from './schemas.ts';
import { isValidSchoolYear } from './schoolYear.ts';
```

- [ ] **Step 7: Edit `shared/api.ts`**

Find this block:

```ts
    .max(MAX_PARALLEL_AGENTS, { message: PARALLEL_MESSAGE }),
});

// The student app: start or resume an upload for one student of the class.
```

Replace it with:

```ts
    .max(MAX_PARALLEL_AGENTS, { message: PARALLEL_MESSAGE }),
});

const POINTS_MESSAGE = 'Scrie punctajul ca număr, de exemplu 2,5.';

// The teacher's correction of one graded item (spec §14.1). The server checks
// the points against the item's maximum with isValidCorrection().
export const correctItemBody = z
  .object({
    points: z.number({ message: POINTS_MESSAGE }).optional(),
    comment: z
      .string()
      .transform((raw) => raw.trim())
      .pipe(z.string().max(TEXT_LIMITS.comment, { message: `Comentariul are cel mult ${TEXT_LIMITS.comment} de caractere.` }))
      .optional(),
    // True: the teacher checked the item. False takes the check back.
    reviewed: z.boolean().optional(),
  })
  .refine((body) => body.points !== undefined || body.comment !== undefined || body.reviewed !== undefined, {
    message: 'Nu ai schimbat nimic.',
  });

export type ItemCorrection = z.output<typeof correctItemBody>;

// The teacher checked the pages that the robot could not read (or takes it back).
export const reviewPagesBody = z.object({ pagesReviewed: z.boolean() });

// The student app: start or resume an upload for one student of the class.
```

- [ ] **Step 8: Replace `server/db/evaluations.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { EvaluationInfo, EvaluationItemInfo, ItemCorrection } from '../../shared/api.ts';
import type { Confidence } from '../../shared/schemas.ts';
import { round2 } from '../../shared/scoring.ts';

// Graded results and the teacher's checks of them (spec §14.1). Each write
// checks in its SQL that the upload is graded and belongs to the teacher: a
// regrade can delete the evaluation at any time.

// Evaluations that the teacher may change: of graded uploads of the teacher's tests.
const TEACHERS_GRADED = `SELECT ev.id FROM evaluations ev
  JOIN submissions s ON s.id = ev.submission_id JOIN tests t ON t.id = s.test_id
  WHERE s.status = 'graded' AND t.teacher_id = ?`;

// The grade in SQL, for amounts in cents: total * 10 / maximum in whole
// hundredths, rounded half up, as gradeOf() does.
export function gradeSql(total: string, maxTotal: string): string {
  return `((CAST(ROUND(${total} * 100) AS INTEGER) * 2000 + CAST(ROUND(${maxTotal} * 100) AS INTEGER))
    / (2 * CAST(ROUND(${maxTotal} * 100) AS INTEGER)) / 100.0)`;
}

// Items to check of the evaluation `ev` that the teacher has not checked yet,
// plus one while pages that the robot could not read are not checked. The
// uploads table, the test list, and the result page count the same way.
export function flagCountSql(ev: string): string {
  return `((SELECT COUNT(*) FROM evaluation_items i WHERE i.evaluation_id = ${ev}.id AND i.needs_review = 1 AND i.reviewed_at IS NULL)
    + CASE WHEN json_array_length(${ev}.unreadable_json) > 0 AND ${ev}.pages_reviewed_at IS NULL THEN 1 ELSE 0 END)`;
}

interface EvaluationRow {
  id: number;
  max_total: number;
  office_points: number;
  total: number;
  grade: number;
  summary: string;
  strengths_json: string;
  recommendations_json: string;
  unreadable_json: string;
  pages_reviewed_at: string | null;
  flag_count: number;
}

interface ItemRow {
  id: number;
  exercise_id: string;
  label: string;
  max_points: number;
  ai_points: number;
  points: number;
  student_answer: string;
  comment: string;
  confidence: Confidence;
  needs_review: number;
  review_reason: string;
  reviewed_at: string | null;
  changed_by_teacher: number;
}

function toItem(row: ItemRow): EvaluationItemInfo {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    label: row.label,
    maxPoints: row.max_points,
    aiPoints: row.ai_points,
    points: row.points,
    studentAnswer: row.student_answer,
    comment: row.comment,
    confidence: row.confidence,
    needsReview: row.needs_review === 1,
    reviewReason: row.review_reason,
    reviewed: row.reviewed_at !== null,
    changedByTeacher: row.changed_by_teacher === 1,
  };
}

// The evaluation of an upload with its items in barem order. Null when the
// upload has none. The caller checks that the upload is the teacher's.
export async function getEvaluation(db: D1Database, submissionId: number): Promise<EvaluationInfo | null> {
  const [evaluations, items] = await db.batch<EvaluationRow | ItemRow>([
    db
      .prepare(
        `SELECT ev.id, ev.max_total, ev.office_points, ev.total, ev.grade, ev.summary, ev.strengths_json,
           ev.recommendations_json, ev.unreadable_json, ev.pages_reviewed_at, ${flagCountSql('ev')} AS flag_count
         FROM evaluations ev WHERE ev.submission_id = ?`,
      )
      .bind(submissionId),
    db
      .prepare(
        `SELECT i.id, i.exercise_id, i.label, i.max_points, i.ai_points, i.points, i.student_answer, i.comment, i.confidence,
           i.needs_review, i.review_reason, i.reviewed_at, i.changed_by_teacher
         FROM evaluation_items i JOIN evaluations ev ON ev.id = i.evaluation_id
         WHERE ev.submission_id = ?
         ORDER BY i.position, i.id`,
      )
      .bind(submissionId),
  ]);
  const row = evaluations?.results[0] as EvaluationRow | undefined;
  if (!row) return null;
  return {
    maxTotal: row.max_total,
    officePoints: row.office_points,
    total: row.total,
    grade: row.grade,
    summary: row.summary,
    strengths: JSON.parse(row.strengths_json) as string[],
    recommendations: JSON.parse(row.recommendations_json) as string[],
    unreadable: JSON.parse(row.unreadable_json) as string[],
    pagesReviewed: row.pages_reviewed_at !== null,
    flagCount: row.flag_count,
    items: ((items?.results ?? []) as ItemRow[]).map(toItem),
  };
}

// An item of a graded result of the teacher: its upload and its maximum,
// which never changes. Null when it is not the teacher's.
export async function findTeacherItem(
  db: D1Database,
  teacherId: number,
  itemId: number,
): Promise<{ submissionId: number; maxPoints: number } | null> {
  const row = await db
    .prepare(
      `SELECT ev.submission_id, i.max_points FROM evaluation_items i
       JOIN evaluations ev ON ev.id = i.evaluation_id JOIN submissions s ON s.id = ev.submission_id JOIN tests t ON t.id = s.test_id
       WHERE i.id = ? AND t.teacher_id = ?`,
    )
    .bind(itemId, teacherId)
    .first<{ submission_id: number; max_points: number }>();
  return row ? { submissionId: row.submission_id, maxPoints: row.max_points } : null;
}

// The teacher's correction: new points or a new comment, and the check mark.
// New points or a new comment mark the item as changed by the teacher, and
// the total, the grade, and the freshness of the class analysis follow. The
// total is summed again from the items, so two corrections at once still
// leave the right total. The points must be checked first with
// isValidCorrection(). False when the upload is no longer graded.
export async function correctItem(db: D1Database, teacherId: number, itemId: number, change: ItemCorrection, now: string): Promise<boolean> {
  const changed = change.points !== undefined || change.comment !== undefined;
  const reviewed = change.reviewed === undefined ? null : change.reviewed ? 1 : 0;
  const item = await db
    .prepare(
      `UPDATE evaluation_items SET points = COALESCE(?, points), comment = COALESCE(?, comment),
         changed_by_teacher = CASE WHEN ? = 1 THEN 1 ELSE changed_by_teacher END,
         reviewed_at = CASE WHEN ? IS NULL THEN reviewed_at WHEN ? = 1 THEN COALESCE(reviewed_at, ?) ELSE NULL END
       WHERE id = ? AND evaluation_id IN (${TEACHERS_GRADED})
       RETURNING evaluation_id`,
    )
    .bind(
      change.points === undefined ? null : round2(change.points),
      change.comment ?? null,
      changed ? 1 : 0,
      reviewed,
      reviewed,
      now,
      itemId,
      teacherId,
    )
    .first<{ evaluation_id: number }>();
  if (!item) return false;
  if (!changed) return true;
  await db.batch([
    db
      .prepare(
        `UPDATE evaluations
         SET total = ROUND((SELECT SUM(i.points) FROM evaluation_items i WHERE i.evaluation_id = evaluations.id) + office_points, 2),
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, item.evaluation_id),
    db.prepare(`UPDATE evaluations SET grade = ${gradeSql('total', 'max_total')} WHERE id = ?`).bind(item.evaluation_id),
    db
      .prepare(
        `UPDATE tests SET analysis_stale = 1
         WHERE analysis_status = 'ready'
           AND id = (SELECT s.test_id FROM evaluations ev JOIN submissions s ON s.id = ev.submission_id WHERE ev.id = ?)`,
      )
      .bind(item.evaluation_id),
  ]);
  return true;
}

// The teacher checked the pages that the robot could not read: they no
// longer count as an item to check. False when the upload is not graded.
export async function reviewPages(db: D1Database, teacherId: number, submissionId: number, reviewed: boolean, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE evaluations SET pages_reviewed_at = CASE WHEN ? = 1 THEN COALESCE(pages_reviewed_at, ?) ELSE NULL END
       WHERE submission_id = ? AND id IN (${TEACHERS_GRADED})
       RETURNING id`,
    )
    .bind(reviewed ? 1 : 0, now, submissionId, teacherId)
    .first<{ id: number }>();
  return row !== null;
}
```

- [ ] **Step 9: Create `server/routes/evaluations.ts`**

```ts
import { Hono } from 'hono';
import { correctItemBody } from '../../shared/api.ts';
import { formatPoints, isValidCorrection } from '../../shared/scoring.ts';
import { correctItem, findTeacherItem } from '../db/evaluations.ts';
import { getTeacherSubmission } from '../db/submissions.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';

// The teacher may not change a result while the robot grades the upload again.
export const notGraded = () => new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.');

// /api/admin/evaluation-items: the teacher's corrections of graded items
// (spec §14.1). Answers with the whole upload, so the page shows the new
// total and grade.
export function evaluationItemRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.patch('/:id', async (c) => {
    const teacherId = c.var.teacher.id;
    const itemId = parseId(c.req.param('id'));
    const body = await readJson(c, correctItemBody);
    const item = await findTeacherItem(c.env.DB, teacherId, itemId);
    if (!item) throw notFound();
    if (body.points !== undefined && !isValidCorrection(body.points, item.maxPoints)) {
      throw new ApiError(400, 'invalid_points', `Punctajul este între 0 și ${formatPoints(item.maxPoints)}, din 0,05 în 0,05.`);
    }
    if (!(await correctItem(c.env.DB, teacherId, itemId, body, nowIso()))) throw notGraded();
    const found = await getTeacherSubmission(c.env.DB, teacherId, item.submissionId);
    if (!found) throw notFound();
    return c.json({ submission: found.detail });
  });

  return routes;
}
```

- [ ] **Step 10: Edit `server/routes/submissions.ts`**

Find this block:

```ts
import { Hono } from 'hono';
import { retrySubmission } from '../db/lifecycle.ts';
```

Replace it with:

```ts
import { Hono } from 'hono';
import { reviewPagesBody } from '../../shared/api.ts';
import { reviewPages } from '../db/evaluations.ts';
import { retrySubmission } from '../db/lifecycle.ts';
```

- [ ] **Step 11: Edit `server/routes/submissions.ts`**

Find this block:

```ts
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId } from '../http.ts';
import { deleteFilesQuietly, fileResponse } from '../uploads.ts';

```

Replace it with:

```ts
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';
import { deleteFilesQuietly, fileResponse } from '../uploads.ts';
import { notGraded } from './evaluations.ts';

```

- [ ] **Step 12: Edit `server/routes/submissions.ts`**

Find this block:

```ts
    if (!found) throw notFound();
    return c.json({ submission: found.detail });
```

Replace it with:

```ts
    if (!found) throw notFound();
    return c.json({ submission: found.detail });
  });

  // The teacher checked the pages that the robot could not read.
  routes.patch('/:id/evaluation', async (c) => {
    const teacherId = c.var.teacher.id;
    const submissionId = parseId(c.req.param('id'));
    const body = await readJson(c, reviewPagesBody);
    const reviewed = await reviewPages(c.env.DB, teacherId, submissionId, body.pagesReviewed, nowIso());
    const found = await getTeacherSubmission(c.env.DB, teacherId, submissionId);
    if (!found) throw notFound();
    if (!reviewed) throw notGraded();
    return c.json({ submission: found.detail });
```

- [ ] **Step 13: Edit `server/routes/admin.ts`**

Find this block:

```ts
import { classRoutes } from './classes.ts';
import { settingsRoutes } from './settings.ts';
```

Replace it with:

```ts
import { classRoutes } from './classes.ts';
import { evaluationItemRoutes } from './evaluations.ts';
import { settingsRoutes } from './settings.ts';
```

- [ ] **Step 14: Edit `server/routes/admin.ts`**

Find this block:

```ts
  routes.route('/submissions', submissionRoutes(options));
  routes.route('/settings', settingsRoutes());
```

Replace it with:

```ts
  routes.route('/submissions', submissionRoutes(options));
  routes.route('/evaluation-items', evaluationItemRoutes());
  routes.route('/settings', settingsRoutes());
```

- [ ] **Step 15: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  59 passed (59)`, `Tests  717 passed (717)`.

- [ ] **Step 16: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 17: Commit**

```bash
git add server shared
git commit -m "Let the teacher correct points and comments, and check items and unreadable pages"
```

---

### Task 3: Regrade one upload or a whole test

`POST /api/admin/submissions/:id/regrade` sends a graded upload back to the robot. `POST /api/admin/tests/:code/regrade` does it for every graded and every failed upload of the test. A finished test goes back to evaluation, and the robot is started.

**Files:**
- Modify: `shared/api.ts`, `server/db/lifecycle.ts`, `server/routes/submissions.ts`, `server/routes/tests.ts`
- Test: `server/routes/regrade.test.ts` (new)

**Interfaces:**
- Consumes: `ASK_FOR_ANALYSIS` (`server/db/lifecycle.ts`); `robotStarter` (`server/dispatch.ts`); `setRobotKey()`, `robotRequest()`.
- Produces:
  - `RegradeAnswer { count: number; testStatus: TestStatus; robot: RobotStart | null }` in `shared/api.ts`.
  - `regradeSubmission(db, teacherId, submissionId, now): Promise<TestStatus | null>` and `regradeTest(db, teacherId, testId, now): Promise<{ count; status } | null>` in `server/db/lifecycle.ts`.
  - Errors: 409 `not_graded` ("Lucrarea nu este corectată acum."), 409 `nothing_to_regrade` ("Testul nu are lucrări corectate."), 404.

- [ ] **Step 1: Create `server/routes/regrade.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, robotRequest, setRobotKey } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// "Recorectează" (spec §8.5): one graded upload, or all of a test.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let studentIds: number[];

const setTest = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(code).run();
const testRow = () => api.db.prepare('SELECT status, analysis_status, analysis_attempts FROM tests WHERE code = ?').bind(code).first();
const uploadRow = (id: number) =>
  api.db.prepare('SELECT status, attempts, last_error, run_id, graded_at FROM submissions WHERE id = ?').bind(id).first();
const evaluationCount = async (id: number) =>
  (await api.db.prepare('SELECT COUNT(*) AS n FROM evaluations WHERE submission_id = ?').bind(id).first<{ n: number }>())!.n;

// A graded upload with a result that the teacher checked.
async function graded(index: number): Promise<number> {
  const id = await addSubmission(api, code, studentIds[index]!, { status: 'graded', files: 1 });
  await api.db.prepare("UPDATE submissions SET attempts = 1, graded_at = '2026-10-07T09:00:00.000Z' WHERE id = ?").bind(id).run();
  await addEvaluation(api, id, { items: [{ needsReview: true, reviewed: true }, {}] });
  return id;
}

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => false);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva', 'Marin Dan']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/submissions/:id/regrade', () => {
  it('deletes the result, takes a finished test back to evaluation, and starts the robot', async () => {
    const id = await graded(0);
    await setTest("status = 'done', exercise_list_status = 'ready', analysis_status = 'ready'");
    dispatchRobot.mockResolvedValueOnce(true);

    const res = await api.request('POST', `/api/admin/submissions/${id}/regrade`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 1, testStatus: 'evaluating', robot: 'dispatched' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(await uploadRow(id)).toEqual({ status: 'submitted', attempts: 0, last_error: null, run_id: null, graded_at: null });
    expect(await evaluationCount(id)).toBe(0);
    const items = await api.db.prepare('SELECT COUNT(*) AS n FROM evaluation_items').first<{ n: number }>();
    expect(items!.n).toBe(0);
    // The class analysis is asked for again, after the new grades.
    expect(await testRow()).toEqual({ status: 'evaluating', analysis_status: 'requested', analysis_attempts: 0 });

    // The robot finds the upload at its next check.
    await setRobotKey(api);
    const check = await robotRequest(api)('POST', '/check');
    expect(check.body).toMatchObject({ hasWork: true, pendingGrading: 1 });
  });

  it('says so when GitHub does not take the request to start the robot', async () => {
    const id = await graded(0);
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    const res = await api.request('POST', `/api/admin/submissions/${id}/regrade`);
    expect(res.body).toEqual({ count: 1, testStatus: 'evaluating', robot: 'next_check' });
  });

  it('leaves an open test open: the upload is graded after Start evaluation', async () => {
    const id = await graded(0);
    await setTest("status = 'open'");
    const res = await api.request('POST', `/api/admin/submissions/${id}/regrade`);
    expect(res.body).toEqual({ count: 1, testStatus: 'open', robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();
    expect(await uploadRow(id)).toMatchObject({ status: 'submitted' });
  });

  it('answers 409 for an upload that is not graded, and changes nothing', async () => {
    await setTest("status = 'done'");
    const failed = await addSubmission(api, code, studentIds[0]!, { status: 'failed', files: 1 });
    await api.db.prepare("UPDATE submissions SET attempts = 3, last_error = 'Robotul s-a oprit cu o eroare.' WHERE id = ?").bind(failed).run();
    const res = await api.request('POST', `/api/admin/submissions/${failed}/regrade`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_graded', message: 'Lucrarea nu este corectată acum.' });
    expect(await uploadRow(failed)).toMatchObject({ status: 'failed', attempts: 3 });
    expect(await testRow()).toMatchObject({ status: 'done' });
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown upload and for an upload of another teacher', async () => {
    expect((await api.request('POST', '/api/admin/submissions/99999/regrade')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, foreignId);
    expect((await api.request('POST', `/api/admin/submissions/${foreignId}/regrade`)).status).toBe(404);
    expect(await uploadRow(foreignId)).toMatchObject({ status: 'graded' });
    expect(await evaluationCount(foreignId)).toBe(1);
  });
});

describe('POST /api/admin/tests/:code/regrade', () => {
  it('regrades every graded upload and every failed one, and leaves the others', async () => {
    const first = await graded(0);
    const second = await graded(1);
    const failed = await addSubmission(api, code, studentIds[2]!, { status: 'failed', files: 1 });
    await api.db.prepare("UPDATE submissions SET attempts = 3, last_error = 'Robotul nu a terminat la timp.' WHERE id = ?").bind(failed).run();
    const empty = await addSubmission(api, code, studentIds[3]!, { status: 'uploading' });
    await setTest("status = 'done', exercise_list_status = 'ready'");
    dispatchRobot.mockResolvedValueOnce(true);

    const res = await api.request('POST', `/api/admin/tests/${code}/regrade`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 3, testStatus: 'evaluating', robot: 'dispatched' });
    for (const id of [first, second, failed]) {
      expect(await uploadRow(id)).toEqual({ status: 'submitted', attempts: 0, last_error: null, run_id: null, graded_at: null });
      expect(await evaluationCount(id)).toBe(0);
    }
    expect(await uploadRow(empty)).toMatchObject({ status: 'uploading' });
  });

  it('leaves an upload that the robot is grading now', async () => {
    const id = await graded(0);
    const busy = await addSubmission(api, code, studentIds[1]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = 'run-1' WHERE id = ?").bind(busy).run();
    await setTest("status = 'evaluating'");
    const res = await api.request('POST', `/api/admin/tests/${code}/regrade`);
    expect(res.body).toMatchObject({ count: 1, testStatus: 'evaluating' });
    expect(await uploadRow(id)).toMatchObject({ status: 'submitted' });
    expect(await uploadRow(busy)).toMatchObject({ status: 'grading', run_id: 'run-1' });
  });

  it('leaves an open test open and does not start the robot', async () => {
    await graded(0);
    await setTest("status = 'open'");
    const res = await api.request('POST', `/api/admin/tests/${code}/regrade`);
    expect(res.body).toEqual({ count: 1, testStatus: 'open', robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('answers 409 when no upload is graded', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'open'");
    const res = await api.request('POST', `/api/admin/tests/${code}/regrade`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'nothing_to_regrade', message: 'Testul nu are lucrări corectate.' });
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('answers 404 for a test of another teacher and changes nothing', async () => {
    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, foreignId);
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/regrade`)).status).toBe(404);
    expect(await uploadRow(foreignId)).toMatchObject({ status: 'graded' });
    expect(await evaluationCount(foreignId)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run server/routes/regrade.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  8 failed | 2 passed (10)`. The routes do not exist yet: `expected { error: 'not_found', …(1) } to deeply equal { count: 1, …(2) }` and the like. The two 404 tests (an unknown upload, another teacher's test) pass already: they guard the new routes.

- [ ] **Step 3: Edit `shared/api.ts`**

Find this block:

```ts

// A new test or barem file: `robot` is set when a new barem needs a new
```

Replace it with:

```ts

// "Recorectează": how many uploads wait for the robot again. `robot` is null
// while the test is open: they are graded after Start evaluation.
export interface RegradeAnswer {
  count: number;
  testStatus: TestStatus;
  robot: RobotStart | null;
}

// A new test or barem file: `robot` is set when a new barem needs a new
```

- [ ] **Step 4: Edit `server/db/lifecycle.ts`**

Find this block:

```ts

// failed → submitted with 0 attempts, so the robot grades the upload again. A
```

Replace it with:

```ts

// A regraded upload waits for the robot again, as if just sent.
const GRADE_AGAIN = "status = 'submitted', attempts = 0, last_error = NULL, run_id = NULL, graded_at = NULL";

// "Recorectează" (spec §8.5): the robot grades a graded upload again. Its
// result goes, with the teacher's corrections. A finished test goes back to
// evaluation; an open test grades it after Start evaluation. Returns the
// test's status, or null when the upload was not graded.
export async function regradeSubmission(db: D1Database, teacherId: number, submissionId: number, now: string): Promise<TestStatus | null> {
  const GRADED = `id = ? AND status = 'graded' AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)`;
  const [, regraded, , test] = await db.batch<{ test_id?: number; status?: TestStatus }>([
    db.prepare(`DELETE FROM evaluations WHERE submission_id IN (SELECT id FROM submissions WHERE ${GRADED})`).bind(submissionId, teacherId),
    db.prepare(`UPDATE submissions SET ${GRADE_AGAIN} WHERE ${GRADED} RETURNING test_id`).bind(submissionId, teacherId),
    db
      .prepare(
        `UPDATE tests SET status = 'evaluating', updated_at = ?, ${ASK_FOR_ANALYSIS}
         WHERE status = 'done' AND teacher_id = ?
           AND id = (SELECT test_id FROM submissions WHERE id = ? AND status = 'submitted')`,
      )
      .bind(now, teacherId, submissionId),
    db.prepare('SELECT t.status FROM tests t JOIN submissions s ON s.test_id = t.id WHERE s.id = ?').bind(submissionId),
  ]);
  if (!regraded?.results.length) return null;
  return test?.results[0]?.status ?? null;
}

// "Recorectează tot": every graded upload of the test, and every upload whose
// grading failed, waits for the robot again. Results and corrections go. A
// finished test goes back to evaluation. Returns how many uploads wait, and
// the test's status; null when the test is gone.
export async function regradeTest(
  db: D1Database,
  teacherId: number,
  testId: number,
  now: string,
): Promise<{ count: number; status: TestStatus } | null> {
  const AGAIN = `test_id = ? AND status IN ('graded', 'failed') AND EXISTS (SELECT 1 FROM tests t WHERE t.id = ? AND t.teacher_id = ?)`;
  const [, regraded, , test] = await db.batch<{ id?: number; status?: TestStatus }>([
    db.prepare(`DELETE FROM evaluations WHERE submission_id IN (SELECT id FROM submissions WHERE ${AGAIN})`).bind(testId, testId, teacherId),
    db.prepare(`UPDATE submissions SET ${GRADE_AGAIN} WHERE ${AGAIN} RETURNING id`).bind(testId, testId, teacherId),
    db
      .prepare(
        `UPDATE tests SET status = 'evaluating', updated_at = ?, ${ASK_FOR_ANALYSIS}
         WHERE id = ? AND teacher_id = ? AND status = 'done'
           AND EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.status = 'submitted')`,
      )
      .bind(now, testId, teacherId),
    db.prepare('SELECT status FROM tests WHERE id = ? AND teacher_id = ?').bind(testId, teacherId),
  ]);
  const status = test?.results[0]?.status;
  return status ? { count: regraded?.results.length ?? 0, status } : null;
}

// failed → submitted with 0 attempts, so the robot grades the upload again. A
```

- [ ] **Step 5: Edit `server/routes/submissions.ts`**

Find this block:

```ts
import { Hono } from 'hono';
import { reviewPagesBody } from '../../shared/api.ts';
import { reviewPages } from '../db/evaluations.ts';
import { retrySubmission } from '../db/lifecycle.ts';
import { deleteSubmissionRow, findTeacherFile, getTeacherSubmission } from '../db/submissions.ts';
```

Replace it with:

```ts
import { Hono } from 'hono';
import { reviewPagesBody, type RegradeAnswer } from '../../shared/api.ts';
import { reviewPages } from '../db/evaluations.ts';
import { regradeSubmission, retrySubmission } from '../db/lifecycle.ts';
import { deleteSubmissionRow, findTeacherFile, getTeacherSubmission } from '../db/submissions.ts';
```

- [ ] **Step 6: Edit `server/routes/submissions.ts`**

Find this block:

```ts

  return routes;
```

Replace it with:

```ts

  // "Recorectează": the robot grades a graded upload again; its result and the
  // teacher's corrections go.
  routes.post('/:id/regrade', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    const testStatus = await regradeSubmission(c.env.DB, c.var.teacher.id, found.detail.id, nowIso());
    if (testStatus === null) throw new ApiError(409, 'not_graded', 'Lucrarea nu este corectată acum.');
    const robot = testStatus === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ count: 1, testStatus, robot } satisfies RegradeAnswer);
  });

  return routes;
```

- [ ] **Step 7: Edit `server/routes/tests.ts`**

Find this block:

```ts
  type ExerciseListAnswer,
  type RobotStartAnswer,
```

Replace it with:

```ts
  type ExerciseListAnswer,
  type RegradeAnswer,
  type RobotStartAnswer,
```

- [ ] **Step 8: Edit `server/routes/tests.ts`**

Find this block:

```ts
  hasUploadedFiles,
  retryExerciseList,
```

Replace it with:

```ts
  hasUploadedFiles,
  regradeTest,
  retryExerciseList,
```

- [ ] **Step 9: Edit `server/routes/tests.ts`**

Find this block:

```ts

  // Start evaluation (spec §8.4): now, or at a later time. Now: the uploads
```

Replace it with:

```ts

  // "Recorectează tot": the robot grades every graded upload again, and every
  // upload whose grading failed; results and corrections go.
  routes.post('/:code/regrade', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const regraded = await regradeTest(c.env.DB, c.var.teacher.id, test.id, nowIso());
    if (!regraded) throw notFound();
    if (regraded.count === 0) throw new ApiError(409, 'nothing_to_regrade', 'Testul nu are lucrări corectate.');
    const robot = regraded.status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ count: regraded.count, testStatus: regraded.status, robot } satisfies RegradeAnswer);
  });

  // Start evaluation (spec §8.4): now, or at a later time. Now: the uploads
```

- [ ] **Step 10: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  60 passed (60)`, `Tests  727 passed (727)`.

- [ ] **Step 11: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 12: Commit**

```bash
git add server shared
git commit -m "Regrade one graded upload or every graded and failed upload of a test"
```

---

### Task 4: The student's history in the API

`GET /api/admin/students/:id/history` returns the student, the student's classes, and every graded test, newest first.

**Files:**
- Modify: `shared/api.ts`, `server/db/students.ts`, `server/routes/students.ts`
- Test: `server/routes/studentHistory.test.ts` (new)

**Interfaces:**
- Consumes: `flagCountSql` (Task 1).
- Produces: `StudentClass { id, name, schoolYear, active }`, `StudentResult { submissionId, testCode, testTitle, className, schoolYear, date, grade, flagCount }`, `StudentHistory { student: { id, fullName }, classes, results }` in `shared/api.ts`; `getStudentHistory(db, teacherId, studentId): Promise<StudentHistory | null>` in `server/db/students.ts`.

- [ ] **Step 1: Create `server/routes/studentHistory.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let studentId: number;
let classmateId: number;
let classId: number;

const started = (code: string, at: string) => api.db.prepare('UPDATE tests SET started_at = ? WHERE code = ?').bind(at, code).run();

beforeEach(async () => {
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  classId = cls.id;
  [studentId, classmateId] = cls.studentIds as [number, number];
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/admin/students/:id/history', () => {
  it('lists every graded test of the student in every class and year, newest first', async () => {
    // The student moves on to 7E2 in the next school year.
    const next = await makeClass(api, '7E2', [], 2027);
    await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(next.id, studentId).run();
    await api.request('PATCH', `/api/admin/classes/${classId}/students/${studentId}`, { active: false });

    const first = await makeTest(api, classId, 'Fracții');
    const second = await makeTest(api, classId, 'Ecuații');
    const later = await makeTest(api, next.id, 'Funcții');
    await started(first, '2026-10-06T07:15:00.000Z');
    await started(second, '2026-11-10T08:00:00.000Z');
    await started(later, '2027-10-05T07:00:00.000Z');
    const firstUpload = await addSubmission(api, first, studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, firstUpload, { grade: 7.5, items: [{ needsReview: true }, {}] });
    const laterUpload = await addSubmission(api, later, studentId, { status: 'graded', files: 1 });
    await addEvaluation(api, laterUpload, { grade: 9.25 });
    // Not graded yet: not in the history.
    await addSubmission(api, second, studentId, { status: 'submitted', files: 1 });
    // A classmate's grade stays out.
    const other = await addSubmission(api, first, classmateId, { status: 'graded', files: 1 });
    await addEvaluation(api, other, { grade: 4 });

    const res = await api.request('GET', `/api/admin/students/${studentId}/history`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      student: { id: studentId, fullName: 'Pop Ion' },
      classes: [
        { id: next.id, name: '7E2', schoolYear: 2027, active: true },
        { id: classId, name: '6E2', schoolYear: 2026, active: false },
      ],
      results: [
        {
          submissionId: laterUpload,
          testCode: '7E2-27T1',
          testTitle: 'Funcții',
          className: '7E2',
          schoolYear: 2027,
          date: '2027-10-05T07:00:00.000Z',
          grade: 9.25,
          flagCount: 0,
        },
        {
          submissionId: firstUpload,
          testCode: '6E2-26T1',
          testTitle: 'Fracții',
          className: '6E2',
          schoolYear: 2026,
          date: '2026-10-06T07:15:00.000Z',
          grade: 7.5,
          flagCount: 1,
        },
      ],
    });
  });

  it('returns an empty list for a student without grades', async () => {
    const res = await api.request('GET', `/api/admin/students/${classmateId}/history`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ student: { fullName: 'Ionescu Ana' }, results: [] });
  });

  it('answers 404 for an unknown student and for a student of another teacher', async () => {
    expect((await api.request('GET', '/api/admin/students/99999/history')).status).toBe(404);
    expect((await api.request('GET', '/api/admin/students/abc/history')).status).toBe(404);
    const foreign = await otherTeacherTest(api);
    expect((await api.request('GET', `/api/admin/students/${foreign.studentId}/history`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run server/routes/studentHistory.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  2 failed | 1 passed (3)`. The route does not exist yet (404). The 404 test passes already: it guards the new route.

- [ ] **Step 3: Edit `shared/api.ts`**

Find this block:

```ts
  tests: TestSummary[];
}
```

Replace it with:

```ts
  tests: TestSummary[];
}

// A class the student is in, or was in (`active` false: the student left).
export interface StudentClass {
  id: number;
  name: string;
  schoolYear: number;
  active: boolean;
}

// One graded test of a student.
export interface StudentResult {
  submissionId: number;
  testCode: string;
  testTitle: string;
  className: string;
  schoolYear: number;
  // The date and hour of the test.
  date: string;
  // Out of 10.
  grade: number;
  // Items of the result that the teacher has not checked yet.
  flagCount: number;
}

// The student page (spec §9): every graded test of the student, in every
// class and school year, newest first.
export interface StudentHistory {
  student: { id: number; fullName: string };
  classes: StudentClass[];
  results: StudentResult[];
}
```

- [ ] **Step 4: Edit `server/db/students.ts`**

Find this block:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { StudentRow } from '../../shared/api.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';

```

Replace it with:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { StudentClass, StudentHistory, StudentResult, StudentRow } from '../../shared/api.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
import { flagCountSql } from './evaluations.ts';

```

- [ ] **Step 5: Edit `server/db/students.ts`**

Find this block:

```ts
  return row ? { id: row.id, fullName } : null;
}
```

Replace it with:

```ts
  return row ? { id: row.id, fullName } : null;
}

// The student page: the student, the student's classes, and every graded test,
// newest first. Null when the student is not the teacher's.
export async function getStudentHistory(db: D1Database, teacherId: number, studentId: number): Promise<StudentHistory | null> {
  const [student, classes, results] = await db.batch<Record<string, unknown>>([
    db.prepare('SELECT id, full_name FROM students WHERE id = ? AND teacher_id = ?').bind(studentId, teacherId),
    db
      .prepare(
        `SELECT c.id, c.name, c.school_year, e.active FROM enrollments e JOIN classes c ON c.id = e.class_id
         WHERE e.student_id = ? AND c.teacher_id = ?
         ORDER BY c.school_year DESC, c.name`,
      )
      .bind(studentId, teacherId),
    db
      .prepare(
        `SELECT s.id AS submission_id, t.code, t.title, c.name AS class_name, c.school_year,
           COALESCE(t.started_at, t.created_at) AS date, ev.grade, ${flagCountSql('ev')} AS flag_count
         FROM submissions s
         JOIN tests t ON t.id = s.test_id
         JOIN classes c ON c.id = t.class_id
         JOIN evaluations ev ON ev.submission_id = s.id
         WHERE s.student_id = ? AND t.teacher_id = ? AND s.status = 'graded'
         ORDER BY date DESC, t.id DESC`,
      )
      .bind(studentId, teacherId),
  ]);
  const row = student?.results[0] as { id: number; full_name: string } | undefined;
  if (!row) return null;
  return {
    student: { id: row.id, fullName: row.full_name },
    classes: ((classes?.results ?? []) as { id: number; name: string; school_year: number; active: number }[]).map(
      (cls): StudentClass => ({ id: cls.id, name: cls.name, schoolYear: cls.school_year, active: cls.active === 1 }),
    ),
    results: (
      (results?.results ?? []) as {
        submission_id: number;
        code: string;
        title: string;
        class_name: string;
        school_year: number;
        date: string;
        grade: number;
        flag_count: number;
      }[]
    ).map(
      (result): StudentResult => ({
        submissionId: result.submission_id,
        testCode: result.code,
        testTitle: result.title,
        className: result.class_name,
        schoolYear: result.school_year,
        date: result.date,
        grade: result.grade,
        flagCount: result.flag_count,
      }),
    ),
  };
}
```

- [ ] **Step 6: Edit `server/routes/students.ts`**

Find this block:

```ts
import { renameStudentBody } from '../../shared/api.ts';
import { renameStudent } from '../db/students.ts';
import type { AppEnv } from '../env.ts';
```

Replace it with:

```ts
import { renameStudentBody } from '../../shared/api.ts';
import { getStudentHistory, renameStudent } from '../db/students.ts';
import type { AppEnv } from '../env.ts';
```

- [ ] **Step 7: Edit `server/routes/students.ts`**

Find this block:

```ts

  return routes;
```

Replace it with:

```ts

  // The student page: every graded test of the student, in every class and year.
  routes.get('/:id/history', async (c) => {
    const history = await getStudentHistory(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!history) throw notFound();
    return c.json(history);
  });

  return routes;
```

- [ ] **Step 8: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  61 passed (61)`, `Tests  730 passed (730)`.

- [ ] **Step 9: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add server shared
git commit -m "Return every graded test of a student"
```

---

### Task 5: The student result page

`/teste/:code/elevi/:submissionId` shows the pages beside the result: the grade, the items to check, a table of the exercises with Verificat and Modifică, the unreadable pages with their check, the summary, strengths, and recommendations, and Recorectează. A failed grading shows its error and Reîncearcă.

**Files:**
- Create: `src/admin/submissionPage/PageFiles.tsx`, `src/admin/submissionPage/GradedResult.tsx`
- Replace: `src/admin/pages/SubmissionPage.tsx`, `src/admin/pages/SubmissionPage.test.tsx`
- Modify: `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/ui/format.ts`, `src/ui/brand.css`
- Test: `src/admin/pages/SubmissionPage.test.tsx` (replaced), `src/admin/api.test.ts`, `src/ui/format.test.ts` (modified)

**Interfaces:**
- Consumes: the API of Tasks 1-3; `isValidCorrection`, `formatPoints`; `TEXT_LIMITS`; `robotStartMessage`.
- Produces:
  - `AdminApi`: `regradeSubmission(submissionId): Promise<RegradeAnswer>`, `correctItem(itemId, change: ItemCorrection): Promise<SubmissionDetail>`, `reviewPages(submissionId, pagesReviewed): Promise<SubmissionDetail>`.
  - Fake data helpers in `src/test/fakeApi.ts`: `fakeItem(overrides)` and `fakeEvaluation(items, overrides)` (they compute the total, the grade, and the items to check, as the server does).
  - `confidenceLabel(confidence)`, `pageLabel(name)` ("student/page-02.jpg" → "Pagina 2"), `parsePoints(raw)` ("2,5" or "2.5") in `src/ui/format.ts`.
  - `resultRefreshInterval(submission)` in `src/admin/pages/SubmissionPage.tsx`.
  - CSS: `.pdf-frame`, `.result-layout`, `.result-files`, `.grade-line`, `table.items`, `tr.is-flagged`, `.edit-row`, `.item-note`, `.review-reason`, `.points-input`; `.table-wrap` is `position: relative`.

- [ ] **Step 1: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  ClassSummary,
  EvaluationStart,
  RobotStart,
```

Replace it with:

```ts
  ClassSummary,
  EvaluationInfo,
  EvaluationItemInfo,
  EvaluationStart,
  ItemCorrection,
  RegradeAnswer,
  RobotStart,
```

- [ ] **Step 2: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
import { uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
import { buildTestCode } from '../../shared/tests.ts';
```

Replace it with:

```ts
import { uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../shared/scoring.ts';
import { buildTestCode } from '../../shared/tests.ts';
```

- [ ] **Step 3: Edit `src/test/fakeApi.ts`**

Find this block:

```ts

export function createFakeApi(data: FakeData = { classes: [], students: {} }) {
```

Replace it with:

```ts

// One graded item, for building fake data in tests.
export function fakeItem(overrides: Partial<EvaluationItemInfo> & Pick<EvaluationItemInfo, 'id' | 'exerciseId'>): EvaluationItemInfo {
  return {
    label: `Exercițiul ${overrides.exerciseId}`,
    maxPoints: 4.5,
    aiPoints: overrides.points ?? 4.5,
    points: 4.5,
    studentAnswer: '3/4',
    comment: 'Corect.',
    confidence: 'high',
    needsReview: false,
    reviewReason: '',
    reviewed: false,
    changedByTeacher: false,
    ...overrides,
  };
}

// Like the server: the total, the grade, and the items to check follow the items.
function recount(evaluation: EvaluationInfo): EvaluationInfo {
  evaluation.total = round2(evaluation.items.reduce((sum, item) => sum + item.points, 0) + evaluation.officePoints);
  evaluation.grade = gradeOf(evaluation.total, evaluation.maxTotal);
  evaluation.flagCount =
    evaluation.items.filter((item) => item.needsReview && !item.reviewed).length +
    (evaluation.unreadable.length > 0 && !evaluation.pagesReviewed ? 1 : 0);
  return evaluation;
}

// A graded result out of 10 with 1 point "din oficiu", for building fake data in tests.
export function fakeEvaluation(items: EvaluationItemInfo[], overrides: Partial<EvaluationInfo> = {}): EvaluationInfo {
  return recount({
    maxTotal: 10,
    officePoints: 1,
    total: 0,
    grade: 0,
    summary: 'Ai lucrat bine.',
    strengths: [],
    recommendations: [],
    unreadable: [],
    pagesReviewed: false,
    flagCount: 0,
    items,
    ...overrides,
  });
}

export function createFakeApi(data: FakeData = { classes: [], students: {} }) {
```

- [ ] **Step 4: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  const countActive = (classId: number) => (data.students[classId] ?? []).filter((s) => s.active).length;
  const findTest = (code: string) => {
```

Replace it with:

```ts
  const countActive = (classId: number) => (data.students[classId] ?? []).filter((s) => s.active).length;
  const findSubmission = (submissionId: number) => {
    const found = submissions.find((s) => s.id === submissionId);
    if (!found) throw notFound();
    return found;
  };
  // The uploads table shows the grade and the items to check of the upload.
  const syncRow = (submission: SubmissionDetail) => {
    for (const detail of tests) {
      const row = detail.uploads.find((u) => u.submissionId === submission.id);
      if (row) {
        Object.assign(row, {
          status: submission.status,
          grade: submission.evaluation?.grade ?? null,
          flagCount: submission.evaluation?.flagCount ?? 0,
        });
      }
    }
  };
  const findTest = (code: string) => {
```

- [ ] **Step 5: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    getSubmission: vi.fn(async (submissionId: number) => {
      const found = submissions.find((s) => s.id === submissionId);
      if (!found) throw notFound();
      return structuredClone(found);
    }),
    resetSubmission: vi.fn(async (submissionId: number) => {
```

Replace it with:

```ts
    }),
    getSubmission: vi.fn(async (submissionId: number) => structuredClone(findSubmission(submissionId))),
    resetSubmission: vi.fn(async (submissionId: number) => {
```

- [ ] **Step 6: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      }
      return 'next_check';
    }),
```

Replace it with:

```ts
      }
      const found = submissions.find((s) => s.id === submissionId);
      if (found) Object.assign(found, { status: 'submitted', lastError: null });
      return 'next_check';
    }),
    // Like the server: a finished test goes back to evaluation.
    regradeSubmission: vi.fn(async (submissionId: number): Promise<RegradeAnswer> => {
      const found = findSubmission(submissionId);
      if (found.status !== 'graded') throw new ApiError(409, 'not_graded', 'Lucrarea nu este corectată acum.');
      if (found.testStatus === 'done') found.testStatus = 'evaluating';
      Object.assign(found, { status: 'submitted', evaluation: null });
      syncRow(found);
      const test = tests.find((t) => t.test.code === found.testCode);
      if (test) test.test.status = found.testStatus;
      return { count: 1, testStatus: found.testStatus, robot: found.testStatus === 'evaluating' ? 'next_check' : null };
    }),
    correctItem: vi.fn(async (itemId: number, change: ItemCorrection) => {
      const found = submissions.find((s) => s.evaluation?.items.some((item) => item.id === itemId));
      if (!found?.evaluation) throw notFound();
      const item = found.evaluation.items.find((i) => i.id === itemId)!;
      if (change.points !== undefined && !isValidCorrection(change.points, item.maxPoints)) {
        throw new ApiError(400, 'invalid_points', `Punctajul este între 0 și ${formatPoints(item.maxPoints)}, din 0,05 în 0,05.`);
      }
      if (change.points !== undefined) item.points = change.points;
      if (change.comment !== undefined) item.comment = change.comment;
      if (change.points !== undefined || change.comment !== undefined) item.changedByTeacher = true;
      if (change.reviewed !== undefined) item.reviewed = change.reviewed;
      recount(found.evaluation);
      syncRow(found);
      return structuredClone(found);
    }),
    reviewPages: vi.fn(async (submissionId: number, pagesReviewed: boolean) => {
      const found = findSubmission(submissionId);
      if (!found.evaluation) throw new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.');
      found.evaluation.pagesReviewed = pagesReviewed;
      recount(found.evaluation);
      syncRow(found);
      return structuredClone(found);
    }),
```

- [ ] **Step 7: Replace `src/admin/pages/SubmissionPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { ApiError } from '../api.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeTest, fakeUpload } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';
import { resultRefreshInterval } from './SubmissionPage.tsx';

const submission: SubmissionDetail = {
  id: 5,
  testCode: '6E2-26T1',
  testTitle: 'Fracții',
  testStatus: 'open',
  studentId: 10,
  studentName: 'Pop Ion',
  status: 'submitted',
  autoSubmitted: false,
  startedAt: '2026-10-06T07:20:00.000Z',
  submittedAt: '2026-10-06T07:40:00.000Z',
  lastError: null,
  files: [
    { id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 1 },
    { id: 22, name: 'scan.pdf', contentType: 'application/pdf', size: 1.5 * 1024 * 1024, position: 2 },
  ],
  evaluation: null,
};

// A graded upload: I.1 full points; II.1 flagged by the robot; the second
// page could not be read. Total 6,5 of 10 (4,5 + 1 + 1 din oficiu).
const graded: SubmissionDetail = {
  ...submission,
  testStatus: 'done',
  status: 'graded',
  evaluation: fakeEvaluation(
    [
      fakeItem({ id: 31, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 4.5 }),
      fakeItem({
        id: 32,
        exerciseId: 'II.1',
        label: 'Subiectul II, ex. 1',
        points: 1,
        studentAnswer: 'x = 3',
        comment: 'Verifică semnul.',
        confidence: 'low',
        needsReview: true,
        reviewReason: 'Scrisul nu se citește.',
      }),
    ],
    {
      summary: 'Ai lucrat bine la fracții.',
      strengths: ['Fracții echivalente'],
      recommendations: ['Exersează ecuațiile.'],
      unreadable: ['student/page-02.pdf'],
    },
  ),
};

const apiWith = (detail: SubmissionDetail = submission) =>
  createFakeApi({
    classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 1 }],
    students: {},
    tests: [
      fakeTest({ status: detail.testStatus }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: detail.status, fileCount: 2 }),
      ]),
    ],
    submissions: [structuredClone(detail)],
  });

const page = '/teste/6E2-26T1/elevi/5';
const row = (label: string) => screen.getByRole('row', { name: new RegExp(label) });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SubmissionPage', () => {
  it('shows the student, the upload state, and the times', async () => {
    renderAdmin(page, apiWith());
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(screen.getByText(/6E2-26T1 · Fracții · Trimis/)).toBeInTheDocument();
    expect(screen.getByText('Început 6 oct. 2026, 10:20 · trimis 6 oct. 2026, 10:40')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← 6E2-26T1' })).toHaveAttribute('href', '/teste/6E2-26T1');
  });

  it('shows photos inline and PDFs in a frame with a link, in upload order', async () => {
    renderAdmin(page, apiWith());
    const photo = await screen.findByRole('img', { name: 'Pagina 1' });
    expect(photo).toHaveAttribute('src', '/api/admin/submissions/5/files/21');
    expect(screen.getByText('Pagina 1: IMG_0001.jpg · 820 KB')).toBeInTheDocument();
    expect(screen.getByTitle('Pagina 2')).toHaveAttribute('src', '/api/admin/submissions/5/files/22');
    expect(screen.getByRole('link', { name: 'Deschide PDF-ul' })).toHaveAttribute('href', '/api/admin/submissions/5/files/22');
    expect(screen.getByText('Pagina 2: scan.pdf · 1,5 MB')).toBeInTheDocument();
  });

  it('numbers the pages in order, without a gap where a page was deleted', async () => {
    const files = [
      { id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 1 },
      { id: 23, name: 'IMG_0003.jpg', contentType: 'image/jpeg', size: 820 * 1024, position: 3 },
    ];
    renderAdmin(page, apiWith({ ...submission, files }));
    expect(await screen.findByRole('img', { name: 'Pagina 2' })).toHaveAttribute('src', '/api/admin/submissions/5/files/23');
    expect(screen.getByText('Pagina 2: IMG_0003.jpg · 820 KB')).toBeInTheDocument();
  });

  it('says where an upload without a result is', async () => {
    const { unmount } = renderAdmin(page, apiWith({ ...submission, status: 'uploading', submittedAt: null, files: [] }));
    expect(await screen.findByText('Elevul nu a încărcat încă niciun fișier.')).toBeInTheDocument();
    expect(screen.getByText('Elevul nu a trimis încă lucrarea.')).toBeInTheDocument();
    unmount();
    renderAdmin(page, apiWith());
    expect(await screen.findByText('Lucrarea se corectează după ce pornești evaluarea.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează' })).not.toBeInTheDocument();
  });

  it('asks for news every 10 seconds only while the robot grades the upload', () => {
    expect(resultRefreshInterval({ ...submission, testStatus: 'evaluating' })).toBe(10_000);
    expect(resultRefreshInterval({ ...submission, status: 'grading', testStatus: 'evaluating' })).toBe(10_000);
    expect(resultRefreshInterval(submission)).toBe(false);
    expect(resultRefreshInterval(graded)).toBe(false);
    expect(resultRefreshInterval(undefined)).toBe(false);
  });

  it('shows the grade, the points of each exercise, and the words to the student', async () => {
    renderAdmin(page, apiWith(graded));
    expect(await screen.findByText(/Nota/)).toHaveTextContent('Nota 6,5 · 6,5 puncte din 10, cu 1 din oficiu');
    // II.1 waits for a check, and the unreadable page counts once.
    expect(screen.getByText('De verificat: 2')).toBeInTheDocument();
    expect(within(row('Subiectul I, ex. 1')).getByText('4,5 din 4,5')).toBeInTheDocument();
    const flagged = row('Subiectul II, ex. 1');
    expect(flagged).toHaveClass('is-flagged');
    expect(within(flagged).getByText('x = 3')).toBeInTheDocument();
    expect(within(flagged).getByText('De verificat: Scrisul nu se citește.')).toBeInTheDocument();
    expect(within(flagged).getByText('Mică')).toBeInTheDocument();
    expect(row('Subiectul I, ex. 1')).not.toHaveClass('is-flagged');
    expect(screen.getByText('Ai lucrat bine la fracții.')).toBeInTheDocument();
    expect(screen.getByText('Fracții echivalente')).toBeInTheDocument();
    expect(screen.getByText('Exersează ecuațiile.')).toBeInTheDocument();
  });

  it('marks an item as checked', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Verificat Subiectul II, ex. 1' }));
    expect(api.correctItem).toHaveBeenCalledWith(32, { reviewed: true });
    expect(await within(row('Subiectul II, ex. 1')).findByText('Verificat')).toBeInTheDocument();
    expect(row('Subiectul II, ex. 1')).not.toHaveClass('is-flagged');
    expect(screen.getByText('De verificat: 1')).toBeInTheDocument();
  });

  it('changes the points and the comment of an item, and checks it', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică Subiectul II, ex. 1' }));
    const points = screen.getByLabelText('Puncte pentru Subiectul II, ex. 1 (din 4,5)');
    expect(points).toHaveValue('1');
    await userEvent.clear(points);
    await userEvent.type(points, '3,5');
    const comment = screen.getByLabelText('Comentariul pentru elev');
    await userEvent.clear(comment);
    await userEvent.type(comment, 'Bine, dar verifică semnul.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.correctItem).toHaveBeenCalledWith(32, { points: 3.5, comment: 'Bine, dar verifică semnul.', reviewed: true });
    expect(await screen.findByText(/Nota/)).toHaveTextContent('Nota 9 · 9 puncte din 10');
    const changed = row('Subiectul II, ex. 1');
    expect(within(changed).getByText('3,5 din 4,5')).toBeInTheDocument();
    expect(within(changed).getByText('Robotul: 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Comentariul pentru elev')).not.toBeInTheDocument();
  });

  it('sends only what changed for an item that waits for no check', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică Subiectul I, ex. 1' }));
    const points = screen.getByLabelText('Puncte pentru Subiectul I, ex. 1 (din 4,5)');
    await userEvent.clear(points);
    await userEvent.type(points, '4');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.correctItem).toHaveBeenCalledWith(31, { points: 4 });
  });

  it('refuses points off the 0.05 steps or above the maximum without asking the server', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică Subiectul I, ex. 1' }));
    const points = screen.getByLabelText('Puncte pentru Subiectul I, ex. 1 (din 4,5)');
    for (const typed of ['4,6', '2,33', 'patru']) {
      await userEvent.clear(points);
      await userEvent.type(points, typed);
      await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Punctajul este între 0 și 4,5, din 0,05 în 0,05.');
    }
    expect(api.correctItem).not.toHaveBeenCalled();
  });

  it('closes the form without a request on Renunță, or when nothing changed', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifică Subiectul I, ex. 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    expect(screen.queryByLabelText(/Puncte pentru/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Modifică Subiectul I, ex. 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(screen.queryByLabelText(/Puncte pentru/)).not.toBeInTheDocument();
    expect(api.correctItem).not.toHaveBeenCalled();
  });

  it('shows the server message when a correction fails', async () => {
    const api = apiWith(graded);
    api.correctItem.mockRejectedValueOnce(new ApiError(409, 'not_graded', 'Lucrarea se corectează din nou. Reîncarcă pagina.'));
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Verificat Subiectul II, ex. 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Lucrarea se corectează din nou. Reîncarcă pagina.');
  });

  it('names the pages that the robot could not read, until the teacher checks them', async () => {
    const api = apiWith(graded);
    renderAdmin(page, api);
    expect(await screen.findByText(/Robotul nu a putut citi: Pagina 2\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat paginile' }));
    expect(api.reviewPages).toHaveBeenCalledWith(5, true);
    expect(await screen.findByText('Robotul nu a putut citi: Pagina 2. Ai verificat aceste pagini.')).toBeInTheDocument();
    expect(screen.getByText('De verificat: 1')).toBeInTheDocument();
  });

  it('regrades the upload after the teacher confirms', async () => {
    const api = apiWith(graded);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează' }));
    expect(confirm).toHaveBeenCalledWith('Recorectezi lucrarea elevului Pop Ion? Corecturile tale se pierd.');
    expect(api.regradeSubmission).toHaveBeenCalledWith(5);
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul.');
    expect(await screen.findByText('Lucrarea așteaptă robotul.')).toBeInTheDocument();
    expect(screen.queryByText(/Nota/)).not.toBeInTheDocument();
  });

  it('keeps the result when the teacher does not confirm the regrade', async () => {
    const api = apiWith(graded);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează' }));
    expect(api.regradeSubmission).not.toHaveBeenCalled();
  });

  it('says that an open test grades the upload after Start evaluation', async () => {
    const api = apiWith({ ...graded, testStatus: 'open' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(page, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Lucrarea se corectează din nou după ce pornești evaluarea.');
  });

  it('shows why grading failed and retries it', async () => {
    const api = apiWith({ ...submission, testStatus: 'done', status: 'failed', lastError: 'Robotul nu a terminat la timp.' });
    renderAdmin(page, api);
    expect(await screen.findByText('Corectarea a eșuat. Robotul nu a terminat la timp.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reîncearcă' }));
    expect(api.retrySubmission).toHaveBeenCalledWith(5);
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul.');
  });

  it('resets the upload after the teacher confirms and goes back to the test', async () => {
    const api = apiWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin(page, api, <LocationProbe />);
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

- [ ] **Step 8: Edit `src/admin/api.test.ts`**

Find this block:

```ts
      ['POST', '/api/admin/tests/6E2-26T1/robot', undefined],
    ]);
```

Replace it with:

```ts
      ['POST', '/api/admin/tests/6E2-26T1/robot', undefined],
    ]);
  });
});

describe('createApiClient results', () => {
  it('calls the result routes', async () => {
    const submission = { id: 5, status: 'graded' };
    const regraded = { count: 1, testStatus: 'evaluating', robot: 'dispatched' };
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, String(url).endsWith('/regrade') ? regraded : { submission }),
    );
    const api = createApiClient({ fetchImpl });
    expect(await api.correctItem(31, { points: 3.5, reviewed: true })).toEqual(submission);
    expect(await api.reviewPages(5, true)).toEqual(submission);
    expect(await api.regradeSubmission(5)).toEqual(regraded);
    expect(fetchImpl.mock.calls.map(([url, init]) => [init!.method, url, init!.body])).toEqual([
      ['PATCH', '/api/admin/evaluation-items/31', '{"points":3.5,"reviewed":true}'],
      ['PATCH', '/api/admin/submissions/5/evaluation', '{"pagesReviewed":true}'],
      ['POST', '/api/admin/submissions/5/regrade', undefined],
    ]);
```

- [ ] **Step 9: Edit `src/ui/format.test.ts`**

Find this block:

```ts
import {
  countLabel,
```

Replace it with:

```ts
import {
  confidenceLabel,
  countLabel,
```

- [ ] **Step 10: Edit `src/ui/format.test.ts`**

Find this block:

```ts
  formatFileSize,
  robotStartMessage,
```

Replace it with:

```ts
  formatFileSize,
  pageLabel,
  parsePoints,
  robotStartMessage,
```

- [ ] **Step 11: Edit `src/ui/format.test.ts`**

Find this block:

```ts
    expect(robotStartMessage('next_check')).toBe('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
  });
});
```

Replace it with:

```ts
    expect(robotStartMessage('next_check')).toBe('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
  });
});

describe('result labels', () => {
  it('names how sure the robot is', () => {
    expect(confidenceLabel('high')).toBe('Mare');
    expect(confidenceLabel('medium')).toBe('Medie');
    expect(confidenceLabel('low')).toBe('Mică');
  });

  it('names the pages that the robot could not read as the page numbers them', () => {
    expect(pageLabel('student/page-02.jpg')).toBe('Pagina 2');
    expect(pageLabel('page-11.pdf')).toBe('Pagina 11');
    expect(pageLabel('ceva.jpg')).toBe('ceva.jpg');
  });
});

describe('parsePoints', () => {
  it('reads points with a comma or a point', () => {
    expect(parsePoints('2,5')).toBe(2.5);
    expect(parsePoints(' 3.25 ')).toBe(3.25);
    expect(parsePoints('0')).toBe(0);
  });

  it('refuses anything that is not a number', () => {
    expect(parsePoints('')).toBeNull();
    expect(parsePoints('-1')).toBeNull();
    expect(parsePoints('2,5,1')).toBeNull();
    expect(parsePoints('doi')).toBeNull();
  });
});
```

- [ ] **Step 12: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/SubmissionPage.test.tsx src/admin/api.test.ts src/ui/format.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  20 failed | 31 passed (51)`. In `src/ui/format.test.ts` 4 tests fail (`confidenceLabel is not a function`, `pageLabel is not a function`, `parsePoints is not a function`). In `src/admin/api.test.ts` 1 test fails (`api.correctItem is not a function`). In `src/admin/pages/SubmissionPage.test.tsx` 15 tests fail: no PDF frame (`Unable to find an element with the title: Pagina 2`), no result (`Unable to find an element with the text: /Nota/`), no Verificat, Modifică, or Recorectează buttons, no waiting texts, and `resultRefreshInterval is not a function`. Its other tests pass already: the header, the photos, the numbering, the reset, and the not-found pages work as before.

- [ ] **Step 13: Edit `src/admin/api.ts`**

Find this block:

```ts
  ExerciseListAnswer,
  RobotStart,
```

Replace it with:

```ts
  ExerciseListAnswer,
  ItemCorrection,
  RegradeAnswer,
  RobotStart,
```

- [ ] **Step 14: Edit `src/admin/api.ts`**

Find this block:

```ts
  retrySubmission(submissionId: number): Promise<RobotStart | null>;
  getSettings(): Promise<Settings>;
```

Replace it with:

```ts
  retrySubmission(submissionId: number): Promise<RobotStart | null>;
  regradeSubmission(submissionId: number): Promise<RegradeAnswer>;
  // The teacher's corrections answer with the whole upload: new total and grade.
  correctItem(itemId: number, change: ItemCorrection): Promise<SubmissionDetail>;
  reviewPages(submissionId: number, pagesReviewed: boolean): Promise<SubmissionDetail>;
  getSettings(): Promise<Settings>;
```

- [ ] **Step 15: Edit `src/admin/api.ts`**

Find this block:

```ts
      (await request<{ robot: RobotStart | null }>('POST', `/submissions/${submissionId}/retry`)).robot,
    getSettings: async () => (await request<{ settings: Settings }>('GET', '/settings')).settings,
```

Replace it with:

```ts
      (await request<{ robot: RobotStart | null }>('POST', `/submissions/${submissionId}/retry`)).robot,
    regradeSubmission: (submissionId) => request<RegradeAnswer>('POST', `/submissions/${submissionId}/regrade`),
    correctItem: async (itemId, change) =>
      (await request<{ submission: SubmissionDetail }>('PATCH', `/evaluation-items/${itemId}`, change)).submission,
    reviewPages: async (submissionId, pagesReviewed) =>
      (await request<{ submission: SubmissionDetail }>('PATCH', `/submissions/${submissionId}/evaluation`, { pagesReviewed })).submission,
    getSettings: async () => (await request<{ settings: Settings }>('GET', '/settings')).settings,
```

- [ ] **Step 16: Edit `src/ui/format.ts`**

Find this block:

```ts
import type { RobotStart, UploadStatus } from '../../shared/api.ts';
import type { TestStatus } from '../../shared/tests.ts';
```

Replace it with:

```ts
import type { RobotStart, UploadStatus } from '../../shared/api.ts';
import type { Confidence } from '../../shared/schemas.ts';
import type { TestStatus } from '../../shared/tests.ts';
```

- [ ] **Step 17: Edit `src/ui/format.ts`**

Find this block:

```ts
  return ROBOT_START[robot];
}
```

Replace it with:

```ts
  return ROBOT_START[robot];
}

const CONFIDENCE: Record<Confidence, string> = { high: 'Mare', medium: 'Medie', low: 'Mică' };

// How sure the robot is of an item's points.
export function confidenceLabel(confidence: Confidence): string {
  return CONFIDENCE[confidence];
}

// The robot names the pages of an upload "student/page-02.jpg", in upload
// order, as the result page numbers them: "Pagina 2".
export function pageLabel(name: string): string {
  const match = /page-(\d+)\.[a-z]+$/.exec(name);
  return match ? `Pagina ${Number(match[1])}` : name;
}

// Points as the teacher types them: "2,5" or "2.5". Null for anything else.
export function parsePoints(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}
```

- [ ] **Step 18: Edit `src/ui/brand.css`**

Find this block:

```css

.table-wrap {
  max-width: 100%;
```

Replace it with:

```css

/* Relative: the hidden column names stay inside the scrolling box. */
.table-wrap {
  position: relative;
  max-width: 100%;
```

- [ ] **Step 19: Edit `src/ui/brand.css`**

Find this block:

```css
  overflow-wrap: anywhere;
}
```

Replace it with:

```css
  overflow-wrap: anywhere;
}

.pdf-frame {
  display: block;
  width: 100%;
  height: 32rem;
  margin-bottom: 0.35rem;
  border: 0;
  border-radius: 0.4rem;
  background: var(--paper);
}

/* A student's result: the pages left of the grades on a wide screen */

.result-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0 2rem;
}

/* The pages stay in view while the teacher checks the exercises. */
@media (min-width: 64rem) {
  .result-layout {
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    align-items: start;
  }

  .result-files {
    position: sticky;
    top: 0.75rem;
    max-height: calc(100vh - 1.5rem);
    overflow-y: auto;
  }
}

.grade-line {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}

.grade-line strong {
  font-size: 1.6rem;
}

table.items {
  width: 100%;
  min-width: 40rem;
  margin-block: 0.75rem;
  border-collapse: collapse;
  background: var(--sheet);
}

table.items th,
table.items td {
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  vertical-align: top;
}

table.items thead th {
  color: var(--muted);
  font-size: 0.9rem;
}

/* An item to check: a highlighter mark */
table.items tr.is-flagged > * {
  background: var(--marker);
}

table.items tr.edit-row > td {
  background: var(--paper);
}

.item-note {
  display: block;
  margin-top: 0.3rem;
}

.review-reason {
  font-weight: 700;
}

.points-input {
  max-width: 8rem;
}
```

- [ ] **Step 20: Create `src/admin/submissionPage/PageFiles.tsx`**

```tsx
import type { SubmissionFile } from '../../../shared/api.ts';
import { formatFileSize } from '../../ui/format.ts';
import { submissionFileUrl } from '../api.ts';

// A student's pages in upload order, numbered as the robot numbers them:
// photos inline (a click opens them full size, to zoom), PDFs in a frame with
// a link that opens them.
export function PageFiles({ submissionId, files }: { submissionId: number; files: SubmissionFile[] }) {
  if (files.length === 0) return <p className="hint">Elevul nu a încărcat încă niciun fișier.</p>;
  return (
    <ol className="page-files">
      {files.map((file, index) => (
        <PageFile key={file.id} submissionId={submissionId} file={file} number={index + 1} />
      ))}
    </ol>
  );
}

function PageFile({ submissionId, file, number }: { submissionId: number; file: SubmissionFile; number: number }) {
  const url = submissionFileUrl(submissionId, file.id);
  const caption = `Pagina ${number}: ${file.name} · ${formatFileSize(file.size)}`;
  if (file.contentType.startsWith('image/')) {
    return (
      <li>
        <a href={url} target="_blank" rel="noopener">
          <img src={url} alt={`Pagina ${number}`} loading="lazy" />
        </a>
        <p className="hint">{caption}</p>
      </li>
    );
  }
  return (
    <li>
      <iframe className="pdf-frame" src={url} title={`Pagina ${number}`} loading="lazy" />
      <a href={url} target="_blank" rel="noopener">
        Deschide PDF-ul
      </a>
      <p className="hint">{caption}</p>
    </li>
  );
}
```

- [ ] **Step 21: Create `src/admin/submissionPage/GradedResult.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { EvaluationInfo, EvaluationItemInfo, ItemCorrection, SubmissionDetail } from '../../../shared/api.ts';
import { TEXT_LIMITS } from '../../../shared/schemas.ts';
import { formatPoints, isValidCorrection } from '../../../shared/scoring.ts';
import { confidenceLabel, pageLabel, parsePoints } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

type Saved = (submission: SubmissionDetail) => Promise<void>;

// The graded result of an upload (spec §14.1): the grade, the pages the robot
// could not read, the points of each exercise with the items to check, and
// the robot's words to the student. Each change answers with the whole
// upload, so the total and the grade follow at once.
export function GradedResult({ submissionId, evaluation, onSaved }: { submissionId: number; evaluation: EvaluationInfo; onSaved: Saved }) {
  return (
    <>
      <p className="grade-line">
        Nota <strong>{formatPoints(evaluation.grade)}</strong> · {formatPoints(evaluation.total)} puncte din {formatPoints(evaluation.maxTotal)}
        {evaluation.officePoints > 0 && `, cu ${formatPoints(evaluation.officePoints)} din oficiu`}
      </p>
      {evaluation.flagCount > 0 && <p className="hint">De verificat: {evaluation.flagCount}</p>}
      <UnreadablePages submissionId={submissionId} evaluation={evaluation} onSaved={onSaved} />

      <div className="table-wrap">
        <table className="items">
          <caption className="sr-only">Punctajele pe exerciții</caption>
          <thead>
            <tr>
              <th scope="col">Exercițiul</th>
              <th scope="col">Puncte</th>
              <th scope="col">Răspunsul elevului</th>
              <th scope="col">Comentariu</th>
              <th scope="col">Siguranța robotului</th>
              <th scope="col">
                <span className="sr-only">Acțiuni</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {evaluation.items.map((item) => (
              <ItemRow key={item.id} item={item} onSaved={onSaved} />
            ))}
          </tbody>
        </table>
      </div>

      <h3>Rezumat</h3>
      <p>{evaluation.summary}</p>
      {evaluation.strengths.length > 0 && (
        <>
          <h3>Ce a lucrat bine</h3>
          <ul>
            {evaluation.strengths.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </>
      )}
      {evaluation.recommendations.length > 0 && (
        <>
          <h3>Recomandări</h3>
          <ul>
            {evaluation.recommendations.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// Pages that the robot could not read count as one item to check, until the
// teacher has looked at them.
function UnreadablePages({ submissionId, evaluation, onSaved }: { submissionId: number; evaluation: EvaluationInfo; onSaved: Saved }) {
  const api = useApi();
  const review = useMutation({ mutationFn: () => api.reviewPages(submissionId, true), onSuccess: onSaved });
  if (evaluation.unreadable.length === 0) return null;
  const pages = evaluation.unreadable.map(pageLabel).join(', ');
  if (evaluation.pagesReviewed) return <p className="hint">Robotul nu a putut citi: {pages}. Ai verificat aceste pagini.</p>;
  return (
    <div className="warning">
      <p>Robotul nu a putut citi: {pages}. Verifică pozele și punctajele exercițiilor de pe ele.</p>
      <button type="button" className="button-quiet button-small" disabled={review.isPending} onClick={() => review.mutate()}>
        Am verificat paginile
      </button>
      {review.error && <ErrorMessage error={review.error} />}
    </div>
  );
}

function ItemRow({ item, onSaved }: { item: EvaluationItemInfo; onSaved: Saved }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const check = useMutation({ mutationFn: () => api.correctItem(item.id, { reviewed: true }), onSuccess: onSaved });
  const toCheck = item.needsReview && !item.reviewed;

  return (
    <>
      <tr className={toCheck ? 'is-flagged' : undefined}>
        <th scope="row">{item.label}</th>
        <td>
          {formatPoints(item.points)} din {formatPoints(item.maxPoints)}
          {item.points !== item.aiPoints && <span className="hint item-note">Robotul: {formatPoints(item.aiPoints)}</span>}
        </td>
        <td>{item.studentAnswer}</td>
        <td>
          {item.comment}
          {item.needsReview && (
            <span className="item-note review-reason">{item.reviewed ? 'Verificat' : `De verificat: ${item.reviewReason}`}</span>
          )}
        </td>
        <td>{confidenceLabel(item.confidence)}</td>
        <td>
          <span className="row-actions">
            {toCheck && (
              <button
                type="button"
                className="button-quiet button-small"
                aria-label={`Verificat ${item.label}`}
                disabled={check.isPending}
                onClick={() => check.mutate()}
              >
                Verificat
              </button>
            )}
            <button
              type="button"
              className="button-quiet button-small"
              aria-label={`Modifică ${item.label}`}
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
            >
              Modifică
            </button>
          </span>
          {check.error && <ErrorMessage error={check.error} />}
        </td>
      </tr>
      {editing && (
        <tr className="edit-row">
          <td colSpan={6}>
            <ItemForm
              item={item}
              onCancel={() => setEditing(false)}
              onDone={async (submission) => {
                setEditing(false);
                await onSaved(submission);
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// New points or a new comment for one item. Saving an item that waits for a
// check also checks it: the teacher has looked at it.
function ItemForm({ item, onCancel, onDone }: { item: EvaluationItemInfo; onCancel: () => void; onDone: Saved }) {
  const api = useApi();
  const [points, setPoints] = useState(formatPoints(item.points));
  const [comment, setComment] = useState(item.comment);
  const [problem, setProblem] = useState<string | null>(null);
  const save = useMutation({ mutationFn: (change: ItemCorrection) => api.correctItem(item.id, change), onSuccess: onDone });
  const id = `item-${item.id}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = parsePoints(points);
    if (value === null || !isValidCorrection(value, item.maxPoints)) {
      setProblem(`Punctajul este între 0 și ${formatPoints(item.maxPoints)}, din 0,05 în 0,05.`);
      return;
    }
    setProblem(null);
    const change: ItemCorrection = {};
    if (value !== item.points) change.points = value;
    if (comment.trim() !== item.comment) change.comment = comment.trim();
    if (item.needsReview && !item.reviewed) change.reviewed = true;
    if (Object.keys(change).length === 0) onCancel();
    else save.mutate(change);
  };

  return (
    <form className="form-stack" onSubmit={submit}>
      <label htmlFor={`${id}-points`}>Puncte pentru {item.label} (din {formatPoints(item.maxPoints)})</label>
      <input
        id={`${id}-points`}
        type="text"
        inputMode="decimal"
        className="points-input"
        value={points}
        onChange={(event) => setPoints(event.target.value)}
        required
      />
      <label htmlFor={`${id}-comment`}>Comentariul pentru elev</label>
      <textarea
        id={`${id}-comment`}
        rows={3}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={TEXT_LIMITS.comment}
      />
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
      <div className="form-row">
        <button className="button button-small" type="submit" disabled={save.isPending}>
          Salvează
        </button>
        <button type="button" className="button-quiet button-small" onClick={onCancel}>
          Renunță
        </button>
      </div>
      {save.error && <ErrorMessage error={save.error} />}
    </form>
  );
}
```

- [ ] **Step 22: Replace `src/admin/pages/SubmissionPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { SubmissionDetail } from '../../../shared/api.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
import { formatDateTime, robotStartMessage, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { GradedResult } from '../submissionPage/GradedResult.tsx';
import { PageFiles } from '../submissionPage/PageFiles.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// While the robot grades the upload, the page asks for news every 10 seconds.
export function resultRefreshInterval(submission: SubmissionDetail | undefined): number | false {
  if (!submission) return false;
  const waits = submission.status === 'grading' || (submission.status === 'submitted' && submission.testStatus === 'evaluating');
  return waits ? 10_000 : false;
}

// /teste/:code/elevi/:submissionId: one student's pages and the graded result
// (spec §14.1). On a wide screen the pages stand left of the result.
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
  // What happened after Recorectează or Reîncearcă.
  const [notice, setNotice] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ['submission', submissionId],
    queryFn: () => api.getSubmission(submissionId),
    refetchInterval: (query) => resultRefreshInterval(query.state.data),
  });
  // The test page and the test list count grades and items to check.
  const refreshLists = async () => {
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
    await queryClient.invalidateQueries({ queryKey: ['tests'] });
  };
  const saved = async (submission: SubmissionDetail) => {
    queryClient.setQueryData(['submission', submissionId], submission);
    await refreshLists();
  };
  const gradeAgain = async (message: string | null) => {
    setNotice(message);
    await queryClient.invalidateQueries({ queryKey: ['submission', submissionId] });
    await refreshLists();
  };
  const reset = useMutation({
    mutationFn: () => api.resetSubmission(submissionId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ['submission', submissionId] });
      await refreshLists();
      navigate(`/teste/${code}`);
    },
  });
  const regrade = useMutation({
    mutationFn: () => api.regradeSubmission(submissionId),
    onSuccess: (answer) =>
      gradeAgain(answer.robot ? robotStartMessage(answer.robot) : 'Lucrarea se corectează din nou după ce pornești evaluarea.'),
  });
  const retry = useMutation({
    mutationFn: () => api.retrySubmission(submissionId),
    onSuccess: (robot) => gradeAgain(robot ? robotStartMessage(robot) : null),
  });

  if (detail.isPending) return <p>Se încarcă…</p>;
  // A failed refresh keeps the page and says why above it.
  if (detail.data === undefined) return <ErrorMessage error={detail.error} />;
  const submission = detail.data;
  // The address names another test than the upload belongs to.
  if (submission.testCode !== code) return <NotFoundPage />;

  return (
    <section>
      <p>
        <Link to={`/teste/${code}`}>← {code}</Link>
      </p>
      {detail.isRefetchError && <ErrorMessage error={detail.error} />}
      <h1>{submission.studentName}</h1>
      <p className="lead-line">
        {submission.testCode} · {submission.testTitle} · {uploadStatusLabel(submission.status)}
        {submission.autoSubmitted && <span className="tag">Fără confirmare</span>}
      </p>
      <p className="hint">
        Început {formatDateTime(submission.startedAt)}
        {submission.submittedAt && ` · trimis ${formatDateTime(submission.submittedAt)}`}
      </p>
      {notice && <p role="status">{notice}</p>}

      <div className="result-layout">
        <div className="result-files">
          <h2>Fișiere ({submission.files.length})</h2>
          <PageFiles submissionId={submissionId} files={submission.files} />
        </div>
        <div>
          <h2>Rezultatul</h2>
          {submission.status === 'graded' && submission.evaluation ? (
            <GradedResult submissionId={submissionId} evaluation={submission.evaluation} onSaved={saved} />
          ) : submission.status === 'failed' ? (
            <div className="warning">
              <p>Corectarea a eșuat. {submission.lastError}</p>
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
                Reîncearcă
              </button>
              {retry.error && <ErrorMessage error={retry.error} />}
            </div>
          ) : (
            <p className="hint">{waitingText(submission)}</p>
          )}
        </div>
      </div>

      {submission.status === 'graded' && (
        <>
          <h2>Recorectează</h2>
          <p className="hint">Robotul corectează lucrarea din nou. Punctajele și comentariile schimbate de tine se pierd.</p>
          <button
            type="button"
            className="button-quiet"
            disabled={regrade.isPending}
            onClick={() => {
              if (window.confirm(`Recorectezi lucrarea elevului ${submission.studentName}? Corecturile tale se pierd.`)) regrade.mutate();
            }}
          >
            Recorectează
          </button>
          {regrade.error && <ErrorMessage error={regrade.error} />}
        </>
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

// Where an upload without a result is.
function waitingText(submission: SubmissionDetail): string {
  if (submission.status === 'uploading') return 'Elevul nu a trimis încă lucrarea.';
  if (submission.status === 'grading') return 'Robotul corectează acum lucrarea.';
  if (submission.testStatus === 'evaluating') return 'Lucrarea așteaptă robotul.';
  return 'Lucrarea se corectează după ce pornești evaluarea.';
}
```

- [ ] **Step 23: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  61 passed (61)`, `Tests  748 passed (748)`.

- [ ] **Step 24: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 25: Commit**

```bash
git add src
git commit -m "Show a student's graded result beside the pages, with the teacher's checks and corrections"
```

---

### Task 6: Recorectează on the test page, and the items to check on Teste

The test page gets "Recorectează tot" (every graded and failed upload) and a "Recorectează" button on each graded row; its row link reads "Vezi lucrarea". The test page heading and the Teste cards show the items to check.

**Files:**
- Create: `src/admin/testPage/RegradeAllButton.tsx`
- Modify: `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/admin/pages/TestPage.tsx`, `src/admin/pages/TestsPage.tsx`, `src/admin/testPage/UploadsTable.tsx`
- Test: `src/admin/pages/TestPage.test.tsx`, `src/admin/pages/TestsPage.test.tsx`, `src/admin/api.test.ts` (modified)

**Interfaces:**
- Consumes: `POST /api/admin/tests/:code/regrade` and `POST /api/admin/submissions/:id/regrade` (Task 3); `regradeSubmission` (Task 5); `TestSummary.flagCount` (Task 1); `countLabel`.
- Produces: `AdminApi.regradeTest(code): Promise<RegradeAnswer>`; `RegradeAllButton({ code, uploads, onChanged, onRobot })`.

- [ ] **Step 1: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    startRobot: vi.fn(async (code: string): Promise<RobotStart> => {
```

Replace it with:

```ts
    }),
    // Like the server: graded and failed uploads wait for the robot again.
    regradeTest: vi.fn(async (code: string): Promise<RegradeAnswer> => {
      const found = findTest(code);
      const again = (status: string) => status === 'graded' || status === 'failed';
      const rows = found.uploads.filter((row) => again(row.status));
      if (rows.length === 0) throw new ApiError(409, 'nothing_to_regrade', 'Testul nu are lucrări corectate.');
      for (const row of rows) Object.assign(row, { status: 'submitted', grade: null, flagCount: 0, lastError: null });
      if (found.test.status === 'done') found.test.status = 'evaluating';
      for (const detail of submissions) {
        if (detail.testCode === code && again(detail.status)) {
          Object.assign(detail, { status: 'submitted', testStatus: found.test.status, evaluation: null, lastError: null });
        }
      }
      return { count: rows.length, testStatus: found.test.status, robot: found.test.status === 'evaluating' ? 'next_check' : null };
    }),
    startRobot: vi.fn(async (code: string): Promise<RobotStart> => {
```

- [ ] **Step 2: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    // Like the server: a finished test goes back to evaluation.
    regradeSubmission: vi.fn(async (submissionId: number): Promise<RegradeAnswer> => {
      const found = findSubmission(submissionId);
      if (found.status !== 'graded') throw new ApiError(409, 'not_graded', 'Lucrarea nu este corectată acum.');
      if (found.testStatus === 'done') found.testStatus = 'evaluating';
      Object.assign(found, { status: 'submitted', evaluation: null });
      syncRow(found);
      const test = tests.find((t) => t.test.code === found.testCode);
      if (test) test.test.status = found.testStatus;
      return { count: 1, testStatus: found.testStatus, robot: found.testStatus === 'evaluating' ? 'next_check' : null };
    }),
```

Replace it with:

```ts
    }),
    // Like the server: a finished test goes back to evaluation. The upload is
    // a row of a test's uploads table, a detailed upload, or both.
    regradeSubmission: vi.fn(async (submissionId: number): Promise<RegradeAnswer> => {
      const found = submissions.find((s) => s.id === submissionId);
      const test = tests.find((t) => t.uploads.some((u) => u.submissionId === submissionId) || t.test.code === found?.testCode);
      const row = test?.uploads.find((u) => u.submissionId === submissionId);
      const status = found?.status ?? row?.status;
      if (status === undefined) throw notFound();
      if (status !== 'graded') throw new ApiError(409, 'not_graded', 'Lucrarea nu este corectată acum.');
      const before = test?.test.status ?? found!.testStatus;
      const testStatus = before === 'done' ? 'evaluating' : before;
      if (found) Object.assign(found, { status: 'submitted', testStatus, evaluation: null });
      if (row) Object.assign(row, { status: 'submitted', grade: null, flagCount: 0 });
      if (test) test.test.status = testStatus;
      return { count: 1, testStatus, robot: testStatus === 'evaluating' ? 'next_check' : null };
    }),
```

- [ ] **Step 3: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(within(pop).getByText('6 oct. 2026, 10:40')).toBeInTheDocument();
    expect(within(pop).getByRole('link', { name: 'Vezi fișierele' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/5');
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
```

Replace it with:

```tsx
    expect(within(pop).getByText('6 oct. 2026, 10:40')).toBeInTheDocument();
    expect(within(pop).getByRole('link', { name: 'Vezi lucrarea' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/5');
    const marin = screen.getByRole('rowheader', { name: 'Marin Dan' }).closest('tr')!;
```

- [ ] **Step 4: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByRole('heading', { name: 'Încărcări · trimise 2 din 2 · corectate 1' })).toBeInTheDocument();
    expect(screen.getByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
```

Replace it with:

```tsx
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByRole('heading', { name: 'Încărcări · trimise 2 din 2 · corectate 1 · de verificat 2' })).toBeInTheDocument();
    expect(screen.getByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
```

- [ ] **Step 5: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
  });
```

Replace it with:

```tsx
    expect(screen.getByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
  });

  const gradedAndFailed = () => [
    fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 4, grade: 8.75, flagCount: 2 }),
    fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1, lastError: 'Robotul nu a terminat la timp.' }),
    fakeUpload({ studentId: 12, studentName: 'Marin Dan' }),
  ];

  it('regrades every graded and failed upload after the teacher confirms', async () => {
    const api = evaluationApi({ status: 'done' }, gradedAndFailed());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează tot' }));
    expect(api.regradeTest).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Recorectează tot' }));
    expect(confirm).toHaveBeenLastCalledWith('Recorectezi 2 lucrări? Punctajele și comentariile schimbate de tine se pierd.');
    expect(api.regradeTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(await within(pop).findByText('Trimis')).toBeInTheDocument();
    expect(within(screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!).getByText('Trimis')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează tot' })).not.toBeInTheDocument();
  });

  it('says that an open test grades the uploads again after Start evaluation', async () => {
    const api = evaluationApi({ status: 'open' }, gradedAndFailed());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/teste/6E2-26T1', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Recorectează tot' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Lucrările se corectează din nou după ce pornești evaluarea.');
  });

  it('offers no regrade while nothing is graded', async () => {
    renderAdmin('/teste/6E2-26T1', evaluationApi({ status: 'evaluating' }));
    expect(await screen.findByRole('heading', { name: 'Evaluarea' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează tot' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recorectează' })).not.toBeInTheDocument();
  });

  it('regrades one graded upload from its row', async () => {
    const api = evaluationApi({ status: 'done' }, gradedAndFailed());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdmin('/teste/6E2-26T1', api);
    const pop = (await screen.findByRole('rowheader', { name: 'Pop Ion' })).closest('tr')!;
    expect(within(screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!).queryByRole('button', { name: 'Recorectează' })).toBeNull();
    await userEvent.click(within(pop).getByRole('button', { name: 'Recorectează' }));
    expect(confirm).toHaveBeenCalledWith('Recorectezi lucrarea elevului Pop Ion? Corecturile tale se pierd.');
    expect(api.regradeSubmission).toHaveBeenCalledWith(5);
    expect(await within(pop).findByText('Trimis')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
  });
```

- [ ] **Step 6: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', startedAt: '2026-10-06T07:15:00.000Z' }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9 }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva' }),
```

Replace it with:

```tsx
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', startedAt: '2026-10-06T07:15:00.000Z' }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9, flagCount: 2 }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva' }),
```

- [ ] **Step 7: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx
    expect(within(card).getByText('Deschis')).toBeInTheDocument();
    expect(within(card).getByText('Trimise: 1 din 2 · corectate: 1')).toBeInTheDocument();

```

Replace it with:

```tsx
    expect(within(card).getByText('Deschis')).toBeInTheDocument();
    expect(within(card).getByText('Trimise: 1 din 2 · corectate: 1 · de verificat: 2')).toBeInTheDocument();

```

- [ ] **Step 8: Edit `src/admin/api.test.ts`**

Find this block:

```ts
    expect(await api.regradeSubmission(5)).toEqual(regraded);
    expect(fetchImpl.mock.calls.map(([url, init]) => [init!.method, url, init!.body])).toEqual([
```

Replace it with:

```ts
    expect(await api.regradeSubmission(5)).toEqual(regraded);
    expect(await api.regradeTest('6E2-26T1')).toEqual(regraded);
    expect(fetchImpl.mock.calls.map(([url, init]) => [init!.method, url, init!.body])).toEqual([
```

- [ ] **Step 9: Edit `src/admin/api.test.ts`**

Find this block:

```ts
      ['POST', '/api/admin/submissions/5/regrade', undefined],
    ]);
```

Replace it with:

```ts
      ['POST', '/api/admin/submissions/5/regrade', undefined],
      ['POST', '/api/admin/tests/6E2-26T1/regrade', undefined],
    ]);
```

- [ ] **Step 10: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx src/admin/pages/TestsPage.test.tsx src/admin/api.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  7 failed | 58 passed (65)`. `api.regradeTest is not a function`; no "Recorectează tot" or row "Recorectează" button; no "Vezi lucrarea" link; no "de verificat" in the test page heading and on the Teste card. "offers no regrade while nothing is graded" passes already: it guards against a button shown too early.

- [ ] **Step 11: Edit `src/admin/api.ts`**

Find this block:

```ts
  startRobot(code: string): Promise<RobotStart>;
  getSubmission(submissionId: number): Promise<SubmissionDetail>;
```

Replace it with:

```ts
  startRobot(code: string): Promise<RobotStart>;
  // "Recorectează tot": graded and failed uploads wait for the robot again.
  regradeTest(code: string): Promise<RegradeAnswer>;
  getSubmission(submissionId: number): Promise<SubmissionDetail>;
```

- [ ] **Step 12: Edit `src/admin/api.ts`**

Find this block:

```ts
    startRobot: async (code) => (await request<RobotStartAnswer>('POST', `${test(code)}/robot`)).robot,
    getSubmission: async (submissionId) =>
```

Replace it with:

```ts
    startRobot: async (code) => (await request<RobotStartAnswer>('POST', `${test(code)}/robot`)).robot,
    regradeTest: (code) => request<RegradeAnswer>('POST', `${test(code)}/regrade`),
    getSubmission: async (submissionId) =>
```

- [ ] **Step 13: Create `src/admin/testPage/RegradeAllButton.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import type { RobotStart, UploadRow } from '../../../shared/api.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// "Recorectează tot" (spec §8.5): the robot grades again every graded upload
// and every upload whose grading failed, for example after a new barem. The
// teacher's corrections go, so the button asks first.
export function RegradeAllButton({
  code,
  uploads,
  onChanged,
  onRobot,
}: {
  code: string;
  uploads: UploadRow[];
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  // An open test grades the uploads after Start evaluation.
  const [waits, setWaits] = useState(false);
  const regrade = useMutation({
    mutationFn: () => api.regradeTest(code),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      setWaits(answer.robot === null);
      await onChanged();
    },
  });
  const count = uploads.filter((row) => row.status === 'graded' || row.status === 'failed').length;
  if (count === 0 && !waits) return null;

  return (
    <>
      {count > 0 && (
        <p>
          <button
            type="button"
            className="button-quiet"
            disabled={regrade.isPending}
            onClick={() => {
              const what = countLabel(count, 'lucrare', 'lucrări');
              if (window.confirm(`Recorectezi ${what}? Punctajele și comentariile schimbate de tine se pierd.`)) regrade.mutate();
            }}
          >
            Recorectează tot
          </button>
        </p>
      )}
      {waits && <p role="status">Lucrările se corectează din nou după ce pornești evaluarea.</p>}
      {regrade.error && <ErrorMessage error={regrade.error} />}
    </>
  );
}
```

- [ ] **Step 14: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
import { ExerciseListBanner } from '../testPage/ExerciseListBanner.tsx';
import { RobotLine } from '../testPage/RobotLine.tsx';
```

Replace it with:

```tsx
import { ExerciseListBanner } from '../testPage/ExerciseListBanner.tsx';
import { RegradeAllButton } from '../testPage/RegradeAllButton.tsx';
import { RobotLine } from '../testPage/RobotLine.tsx';
```

- [ ] **Step 15: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
          )}
        </>
```

Replace it with:

```tsx
          )}
          <RegradeAllButton code={code} uploads={uploads} onChanged={refresh} onRobot={onRobot} />
        </>
```

- [ ] **Step 16: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
        {test.gradedCount > 0 && ` · corectate ${test.gradedCount}`}
      </h2>
```

Replace it with:

```tsx
        {test.gradedCount > 0 && ` · corectate ${test.gradedCount}`}
        {test.flagCount > 0 && ` · de verificat ${test.flagCount}`}
      </h2>
```

- [ ] **Step 17: Edit `src/admin/pages/TestsPage.tsx`**

Find this block:

```tsx
                  {test.gradedCount > 0 && ` · corectate: ${test.gradedCount}`}
                </span>
```

Replace it with:

```tsx
                  {test.gradedCount > 0 && ` · corectate: ${test.gradedCount}`}
                  {test.flagCount > 0 && ` · de verificat: ${test.flagCount}`}
                </span>
```

- [ ] **Step 18: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
  });
  const time = row.submittedAt ?? row.startedAt;
```

Replace it with:

```tsx
  });
  const regrade = useMutation({
    mutationFn: (submissionId: number) => api.regradeSubmission(submissionId),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
  });
  const time = row.submittedAt ?? row.startedAt;
```

- [ ] **Step 19: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
          <span className="row-actions">
            <Link to={`/teste/${code}/elevi/${submissionId}`}>Vezi fișierele</Link>
            {row.status === 'failed' && (
```

Replace it with:

```tsx
          <span className="row-actions">
            <Link to={`/teste/${code}/elevi/${submissionId}`}>Vezi lucrarea</Link>
            {row.status === 'failed' && (
```

- [ ] **Step 20: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
                Reîncearcă
              </button>
```

Replace it with:

```tsx
                Reîncearcă
              </button>
            )}
            {row.status === 'graded' && (
              <button
                type="button"
                className="button-quiet button-small"
                disabled={regrade.isPending}
                onClick={() => {
                  if (window.confirm(`Recorectezi lucrarea elevului ${row.studentName}? Corecturile tale se pierd.`)) {
                    regrade.mutate(submissionId);
                  }
                }}
              >
                Recorectează
              </button>
```

- [ ] **Step 21: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
        {retry.error && <ErrorMessage error={retry.error} />}
      </td>
```

Replace it with:

```tsx
        {retry.error && <ErrorMessage error={retry.error} />}
        {regrade.error && <ErrorMessage error={regrade.error} />}
      </td>
```

- [ ] **Step 22: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  61 passed (61)`, `Tests  752 passed (752)`.

- [ ] **Step 23: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 24: Commit**

```bash
git add src
git commit -m "Regrade from the test page, and show the items to check on the test list"
```

---

### Task 7: The student page

`/elevi/:id` shows a student's classes and every graded test with its grade, date, and items to check, each linked to its result. The class page links each student's name to it, and the result page links to it.

**Files:**
- Create: `src/admin/pages/StudentPage.tsx`
- Modify: `src/admin/AppRoutes.tsx`, `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/admin/pages/ClassPage.tsx`, `src/admin/pages/SubmissionPage.tsx`
- Test: `src/admin/pages/StudentPage.test.tsx` (new), `src/admin/pages/ClassPage.test.tsx`, `src/admin/pages/SubmissionPage.test.tsx`, `src/admin/api.test.ts` (modified)

**Interfaces:**
- Consumes: `GET /api/admin/students/:id/history` and `StudentHistory` (Task 4).
- Produces: `AdminApi.getStudentHistory(studentId): Promise<StudentHistory>`; `FakeData.histories?: StudentHistory[]`; the route `elevi/:id`.

- [ ] **Step 1: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  Settings,
  StudentRow,
```

Replace it with:

```ts
  Settings,
  StudentHistory,
  StudentRow,
```

- [ ] **Step 2: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  settings?: Settings;
}
```

Replace it with:

```ts
  settings?: Settings;
  histories?: StudentHistory[];
}
```

- [ ] **Step 3: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    listTests: vi.fn(async (schoolYear: number) =>
```

Replace it with:

```ts
    }),
    getStudentHistory: vi.fn(async (studentId: number) => {
      const found = data.histories?.find((history) => history.student.id === studentId);
      if (!found) throw notFound();
      return structuredClone(found);
    }),
    listTests: vi.fn(async (schoolYear: number) =>
```

- [ ] **Step 4: Create `src/admin/pages/StudentPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StudentHistory } from '../../../shared/api.ts';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

const history: StudentHistory = {
  student: { id: 10, fullName: 'Pop Ion' },
  classes: [
    { id: 2, name: '7E2', schoolYear: 2027, active: true },
    { id: 1, name: '6E2', schoolYear: 2026, active: false },
  ],
  results: [
    {
      submissionId: 8,
      testCode: '7E2-27T1',
      testTitle: 'Funcții',
      className: '7E2',
      schoolYear: 2027,
      date: '2027-10-05T07:00:00.000Z',
      grade: 9.25,
      flagCount: 0,
    },
    {
      submissionId: 5,
      testCode: '6E2-26T1',
      testTitle: 'Fracții',
      className: '6E2',
      schoolYear: 2026,
      date: '2026-10-06T07:15:00.000Z',
      grade: 7.5,
      flagCount: 2,
    },
  ],
};

const apiWith = (histories: StudentHistory[] = [history]) => createFakeApi({ classes: [], students: {}, histories });

describe('StudentPage', () => {
  it('shows the student, the classes, and every graded test with a link to its result', async () => {
    const api = apiWith();
    renderAdmin('/elevi/10', api);
    expect(await screen.findByRole('heading', { name: 'Pop Ion' })).toBeInTheDocument();
    expect(api.getStudentHistory).toHaveBeenCalledWith(10);
    expect(screen.getByRole('link', { name: 'Clasa 7E2, 2027-2028' })).toHaveAttribute('href', '/clase/2');
    const left = screen.getByRole('link', { name: 'Clasa 6E2, 2026-2027' });
    expect(left).toHaveAttribute('href', '/clase/1');
    expect(left.parentElement).toHaveTextContent('a plecat');

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['7E2-27T1 · Funcții', '6E2-26T1 · Fracții']);
    const first = rows[1]!;
    expect(within(first).getByRole('link', { name: '6E2-26T1 · Fracții' })).toHaveAttribute('href', '/teste/6E2-26T1/elevi/5');
    expect(within(first).getByText('Clasa 6E2, 2026-2027')).toBeInTheDocument();
    expect(within(first).getByText('6 oct. 2026, 10:15')).toBeInTheDocument();
    expect(within(first).getByText('7,5')).toBeInTheDocument();
    expect(within(first).getByText('2')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('9,25')).toBeInTheDocument();
  });

  it('says so when the student has no graded test', async () => {
    renderAdmin('/elevi/10', apiWith([{ ...history, classes: [], results: [] }]));
    expect(await screen.findByText('Elevul nu are încă nicio lucrare corectată.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the not-found page for an id that is not a number', async () => {
    renderAdmin('/elevi/abc', apiWith());
    expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeInTheDocument();
  });

  it('shows the server message for a student that does not exist', async () => {
    renderAdmin('/elevi/99', apiWith());
    expect(await screen.findByRole('alert')).toHaveTextContent('Nu am găsit ce cauți.');
  });
});
```

- [ ] **Step 5: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('heading', { name: 'Elevi (1 elev)' })).toBeInTheDocument();
    const left = screen.getByText('Ionescu Ana').closest('li')!;
```

Replace it with:

```tsx
    expect(screen.getByRole('heading', { name: 'Elevi (1 elev)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pop Ion' })).toHaveAttribute('href', '/elevi/10');
    const left = screen.getByText('Ionescu Ana').closest('li')!;
```

- [ ] **Step 6: Edit `src/admin/pages/SubmissionPage.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('link', { name: '← 6E2-26T1' })).toHaveAttribute('href', '/teste/6E2-26T1');
  });
```

Replace it with:

```tsx
    expect(screen.getByRole('link', { name: '← 6E2-26T1' })).toHaveAttribute('href', '/teste/6E2-26T1');
    expect(screen.getByRole('link', { name: 'Toate notele elevului' })).toHaveAttribute('href', '/elevi/10');
  });
```

- [ ] **Step 7: Edit `src/admin/api.test.ts`**

Find this block:

```ts
    expect(await api.regradeTest('6E2-26T1')).toEqual(regraded);
    expect(fetchImpl.mock.calls.map(([url, init]) => [init!.method, url, init!.body])).toEqual([
```

Replace it with:

```ts
    expect(await api.regradeTest('6E2-26T1')).toEqual(regraded);
    expect(await api.getStudentHistory(10)).toEqual({ submission });
    expect(fetchImpl.mock.calls.map(([url, init]) => [init!.method, url, init!.body])).toEqual([
```

- [ ] **Step 8: Edit `src/admin/api.test.ts`**

Find this block:

```ts
      ['POST', '/api/admin/tests/6E2-26T1/regrade', undefined],
    ]);
```

Replace it with:

```ts
      ['POST', '/api/admin/tests/6E2-26T1/regrade', undefined],
      ['GET', '/api/admin/students/10/history', undefined],
    ]);
```

- [ ] **Step 9: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/StudentPage.test.tsx src/admin/pages/ClassPage.test.tsx src/admin/pages/SubmissionPage.test.tsx src/admin/api.test.ts`
Expected: FAIL. `Test Files  4 failed (4)`, `Tests  6 failed | 51 passed (57)`. `api.getStudentHistory is not a function`; the class page has no link named "Pop Ion"; the result page has no "Toate notele elevului"; `/elevi/10` shows the not-found page, so 3 of the 4 student page tests fail (`Unable to find role="heading" and name "Pop Ion"`, `Unable to find role="alert"`, and the empty list). The test of an id that is not a number passes already: the not-found page shows for any unknown path.

- [ ] **Step 10: Edit `src/admin/api.ts`**

Find this block:

```ts
  StartedTest,
  StudentRow,
```

Replace it with:

```ts
  StartedTest,
  StudentHistory,
  StudentRow,
```

- [ ] **Step 11: Edit `src/admin/api.ts`**

Find this block:

```ts
  renameStudent(studentId: number, fullName: string): Promise<{ id: number; fullName: string }>;
  listTests(schoolYear: number): Promise<TestSummary[]>;
```

Replace it with:

```ts
  renameStudent(studentId: number, fullName: string): Promise<{ id: number; fullName: string }>;
  getStudentHistory(studentId: number): Promise<StudentHistory>;
  listTests(schoolYear: number): Promise<TestSummary[]>;
```

- [ ] **Step 12: Edit `src/admin/api.ts`**

Find this block:

```ts
      (await request<{ student: { id: number; fullName: string } }>('PATCH', `/students/${studentId}`, { fullName })).student,
    listTests: async (schoolYear) => (await request<{ tests: TestSummary[] }>('GET', `/tests?year=${schoolYear}`)).tests,
```

Replace it with:

```ts
      (await request<{ student: { id: number; fullName: string } }>('PATCH', `/students/${studentId}`, { fullName })).student,
    getStudentHistory: (studentId) => request<StudentHistory>('GET', `/students/${studentId}/history`),
    listTests: async (schoolYear) => (await request<{ tests: TestSummary[] }>('GET', `/tests?year=${schoolYear}`)).tests,
```

- [ ] **Step 13: Create `src/admin/pages/StudentPage.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { displayClassName } from '../../../shared/classes.ts';
import { parsePositiveId } from '../../../shared/ids.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

// /elevi/:id: a student's history (spec §9): every graded test in every class
// and school year, newest first, each with a link to its result.
export function StudentPage() {
  const studentId = parsePositiveId(useParams().id);
  if (studentId === null) return <NotFoundPage />;
  return <StudentHistoryView key={studentId} studentId={studentId} />;
}

function StudentHistoryView({ studentId }: { studentId: number }) {
  const api = useApi();
  const history = useQuery({ queryKey: ['student', studentId], queryFn: () => api.getStudentHistory(studentId) });

  if (history.isPending) return <p>Se încarcă…</p>;
  if (history.error) return <ErrorMessage error={history.error} />;
  const { student, classes, results } = history.data;

  return (
    <section>
      <h1>{student.fullName}</h1>
      {classes.length > 0 && (
        <p className="lead-line">
          {classes.map((cls, index) => (
            <span key={cls.id}>
              {index > 0 && ' · '}
              <Link to={`/clase/${cls.id}`}>
                {displayClassName(cls.name)}, {formatSchoolYear(cls.schoolYear)}
              </Link>
              {!cls.active && <span className="tag">a plecat</span>}
            </span>
          ))}
        </p>
      )}

      <h2>Note</h2>
      {results.length === 0 ? (
        <p className="hint">Elevul nu are încă nicio lucrare corectată.</p>
      ) : (
        <div className="table-wrap">
          <table className="uploads">
            <caption className="sr-only">Notele elevului</caption>
            <thead>
              <tr>
                <th scope="col">Testul</th>
                <th scope="col">Clasa</th>
                <th scope="col">Data</th>
                <th scope="col">Nota</th>
                <th scope="col">De verificat</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.submissionId}>
                  <th scope="row">
                    <Link to={`/teste/${result.testCode}/elevi/${result.submissionId}`}>
                      {result.testCode} · {result.testTitle}
                    </Link>
                  </th>
                  <td>
                    {displayClassName(result.className)}, {formatSchoolYear(result.schoolYear)}
                  </td>
                  <td>{formatDateTime(result.date)}</td>
                  <td>{formatPoints(result.grade)}</td>
                  <td>{result.flagCount > 0 ? result.flagCount : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 14: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SubmissionPage } from './pages/SubmissionPage.tsx';
```

Replace it with:

```tsx
import { SettingsPage } from './pages/SettingsPage.tsx';
import { StudentPage } from './pages/StudentPage.tsx';
import { SubmissionPage } from './pages/SubmissionPage.tsx';
```

- [ ] **Step 15: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="setari" element={<SettingsPage />} />
```

Replace it with:

```tsx
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="elevi/:id" element={<StudentPage />} />
        <Route path="setari" element={<SettingsPage />} />
```

- [ ] **Step 16: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```tsx
    <li className={student.active ? undefined : 'is-muted'}>
      <span className="row-name">{student.fullName}</span>
      {!student.active && <span className="tag">a plecat</span>}
```

Replace it with:

```tsx
    <li className={student.active ? undefined : 'is-muted'}>
      <Link className="row-name" to={`/elevi/${student.id}`}>
        {student.fullName}
      </Link>
      {!student.active && <span className="tag">a plecat</span>}
```

- [ ] **Step 17: Edit `src/admin/pages/SubmissionPage.tsx`**

Find this block:

```tsx
      <h1>{submission.studentName}</h1>
      <p className="lead-line">
```

Replace it with:

```tsx
      <h1>{submission.studentName}</h1>
      <p>
        <Link to={`/elevi/${submission.studentId}`}>Toate notele elevului</Link>
      </p>
      <p className="lead-line">
```

- [ ] **Step 18: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  62 passed (62)`, `Tests  756 passed (756)`.

- [ ] **Step 19: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 20: Commit**

```bash
git add src
git commit -m "Add the student page with every graded test, and link to it"
```

---

### Task 8: Docs, follow-ups, and the smoke test

The spec records this plan's rulings and cuts §19 item 4 into 4a and 4b. `AGENTS.md` and its nested files describe the new parts and rules. The follow-up files say what is done and what Plan 4b must do. The smoke test reads a result, corrects a point, reads the student's history, and regrades the test.

**Files:**
- Create: `docs/superpowers/plans/plan-4a-followups.md`
- Modify: `docs/superpowers/specs/2026-10-06-quickeval-design.md`, `AGENTS.md`, `server/AGENTS.md`, `src/AGENTS.md`, `docs/superpowers/plans/plan-3a-followups.md`, `docs/superpowers/plans/plan-3b-followups.md`, `scripts/smoke.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: docs only, and four smoke checks.

- [ ] **Step 1: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
  unreadable_json TEXT NOT NULL,           -- string[] of work-dir file names
  raw_json TEXT NOT NULL,                  -- the AI output as received
```

Replace it with:

```markdown
  unreadable_json TEXT NOT NULL,           -- string[] of work-dir file names
  pages_reviewed_at TEXT,                  -- set when the teacher checked the unreadable pages
  raw_json TEXT NOT NULL,                  -- the AI output as received
```

- [ ] **Step 2: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown

Migrations add the tables in the plan that needs them: Plan 1 adds `teachers`, `classes`, `students`, and `enrollments`. Plan 2 adds `tests`, `submissions`, and `submission_files`. Plan 3a adds `evaluations`, `evaluation_items`, `settings`, and `runner_state`. Plan 3b adds `tests.files_version`.

```

Replace it with:

```markdown

Migrations add the tables in the plan that needs them: Plan 1 adds `teachers`, `classes`, `students`, and `enrollments`. Plan 2 adds `tests`, `submissions`, and `submission_files`. Plan 3a adds `evaluations`, `evaluation_items`, `settings`, and `runner_state`. Plan 3b adds `tests.files_version`. Plan 4a adds `evaluations.pages_reviewed_at`.

```

- [ ] **Step 3: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
- The robot makes the exercise list, grades each submitted upload, then writes the class analysis (§12).
- `evaluating → done`: no submission is `submitted` or `grading`, and `analysis_status` is not `requested`. (Plan 4 decides when the first class analysis is asked for.)
- **Reopen uploads** (from evaluating or done): sets `status = 'open'` and clears `evaluation_at`. Graded results stay. New uploads get graded at the next **Start evaluation**. The analysis is then marked stale. An upload that the robot is grading goes back to `submitted`: the robot's result for it is refused, and a later robot run grades it after the next **Start evaluation**, with the files of that time.
- **Replace the test file or the barem**: allowed in any status except `evaluating`. While evaluating, it is allowed when the exercise list is `problem` or `failed`: the robot then reads neither file. A new barem clears the exercise list (`exercise_list_status = 'none'`). It does not regrade old results. Each new file adds 1 to `files_version`, so an exercise list that the robot made from the old files is refused (§11.3). The teacher uses Regrade for that.
- **Regrade** (one submission, or all graded submissions of the test): deletes their evaluations and sets them to `submitted`. If the test is `done`, it goes back to `evaluating`. If the test is `open`, the regrade waits for Start evaluation. The UI warns that teacher corrections will be lost.
- **Retry** (a `failed` submission): sets it to `submitted` with 0 attempts. If the test is `done`, it goes back to `evaluating`. Like Start evaluation, it asks GitHub to start the robot (§12.6); so does **Încearcă din nou** on a failed exercise list.
```

Replace it with:

```markdown
- The robot makes the exercise list, grades each submitted upload, then writes the class analysis (§12).
- `evaluating → done`: no submission is `submitted` or `grading`, and `analysis_status` is not `requested`. (Plan 4b decides when the first class analysis is asked for.)
- **Reopen uploads** (from evaluating or done): sets `status = 'open'` and clears `evaluation_at`. Graded results stay. New uploads get graded at the next **Start evaluation**. The analysis is then marked stale. An upload that the robot is grading goes back to `submitted`: the robot's result for it is refused, and a later robot run grades it after the next **Start evaluation**, with the files of that time.
- **Replace the test file or the barem**: allowed in any status except `evaluating`. While evaluating, it is allowed when the exercise list is `problem` or `failed`: the robot then reads neither file. A new barem clears the exercise list (`exercise_list_status = 'none'`). It does not regrade old results. Each new file adds 1 to `files_version`, so an exercise list that the robot made from the old files is refused (§11.3). The teacher uses Regrade for that.
- **Regrade** (one graded submission, or all of a test: every graded submission and every failed one): deletes their evaluations and sets them to `submitted` with 0 attempts. If the test is `done`, it goes back to `evaluating`. While the test is `evaluating`, the API asks GitHub to start the robot (§12.6). If the test is `open`, the regrade waits for Start evaluation. The UI warns that teacher corrections will be lost.
- **Retry** (a `failed` submission): sets it to `submitted` with 0 attempts. If the test is `done`, it goes back to `evaluating`. Like Start evaluation, it asks GitHub to start the robot (§12.6); so does **Încearcă din nou** on a failed exercise list.
```

- [ ] **Step 4: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `/admin/clase` | Clase | Classes of the selected school year. Add a class (name, school year). Archive a class. |
| `/admin/clase/:id` | Clasa | Students: add one, paste many (one name per line), rename, mark as left. Tests of the class. |
| `/admin/elevi/:id` | Elev | History: every graded test of this student in every class and year, with grade and link. |
```

Replace it with:

```markdown
| `/admin/clase` | Clase | Classes of the selected school year. Add a class (name, school year). Archive a class. |
| `/admin/clase/:id` | Clasa | Students: add one, paste many (one name per line), rename, mark as left. Each name links to the student's history. Tests of the class. |
| `/admin/elevi/:id` | Elev | History: every graded test of this student in every class and year, with grade and link. |
```

- [ ] **Step 5: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
  - open: link with Copy button, QR code (full-screen view), **Pornește evaluarea** (now), **Programează** (pick a time), cancel the schedule.
  - evaluating/done: **Redeschide încărcarea** (Reopen uploads), **Recorectează tot** (Regrade all).
- Exercise-list banner, only when there is a problem:
```

Replace it with:

```markdown
  - open: link with Copy button, QR code (full-screen view), **Pornește evaluarea** (now), **Programează** (pick a time), cancel the schedule.
  - evaluating/done: **Redeschide încărcarea** (Reopen uploads).
  - any status with a graded or failed upload: **Recorectează tot** (Regrade all).
- Exercise-list banner, only when there is a problem:
```

- [ ] **Step 6: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
  - `failed`: shows the message and a **Încearcă din nou** button (sets `none` and resets the attempts).
- Uploads table, refreshed every 10 s while the status is open or evaluating. One row per active student of the class: name, status (Nu a trimis / Încarcă… / Trimis / Se corectează / Corectat / Eroare), file count, time, grade, flag count. "Fără confirmare" marks `auto_submitted`. Row actions: view files and result, **Resetează** (delete the upload so the student can start again), **Reîncearcă** (failed → submitted), **Recorectează** (regrade).
- Robot line: "Robotul a verificat acum 3 min" from `runner_state.last_check_at`, while the test is evaluating or has a scheduled evaluation. It shows a warning after 30 min without a check. With the warning, a test in evaluation whose uploads wait for the robot shows "Pornește robotul": it starts the robot like "Evaluate now".
```

Replace it with:

```markdown
  - `failed`: shows the message and a **Încearcă din nou** button (sets `none` and resets the attempts).
- Uploads table, refreshed every 10 s while the status is open or evaluating. One row per active student of the class: name, status (Nu a trimis / Încarcă… / Trimis / Se corectează / Corectat / Eroare), file count, time, grade, flag count. "Fără confirmare" marks `auto_submitted`. Row actions: **Vezi lucrarea** (files and result), **Resetează** (delete the upload so the student can start again), **Reîncearcă** (failed → submitted), **Recorectează** (regrade a graded upload).
- Robot line: "Robotul a verificat acum 3 min" from `runner_state.last_check_at`, while the test is evaluating or has a scheduled evaluation. It shows a warning after 30 min without a check. With the warning, a test in evaluation whose uploads wait for the robot shows "Pornește robotul": it starts the robot like "Evaluate now".
```

- [ ] **Step 7: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `PATCH /students/:id` `{ fullName }` | Rename a student. |
| `GET /students/:id/history` | The student and all graded results (test code, title, class, date, grade). |
| `GET /tests?year=2026` | Tests list with counts. |
| `POST /tests` `{ classId, title }` | Create a draft test; returns the code. |
| `GET /tests/:code` | Test detail, uploads table, exercise-list status, robot line. (The analysis status comes with Plan 4.) |
| `PATCH /tests/:code` `{ title }` | Rename. |
```

Replace it with:

```markdown
| `PATCH /students/:id` `{ fullName }` | Rename a student. |
| `GET /students/:id/history` | The student, the student's classes, and all graded results, newest first (test code, title, class, date, grade, items to check). |
| `GET /tests?year=2026` | Tests list with counts. |
| `POST /tests` `{ classId, title }` | Create a draft test; returns the code. |
| `GET /tests/:code` | Test detail, uploads table, exercise-list status, robot line. (The analysis status comes with Plan 4b.) |
| `PATCH /tests/:code` `{ title }` | Rename. |
```

- [ ] **Step 8: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `POST /tests/:code/reopen` | Reopen uploads. |
| `POST /tests/:code/regrade` | Regrade all graded submissions. |
| `POST /tests/:code/exercise-list/accept` | problem → accepted. |
```

Replace it with:

```markdown
| `POST /tests/:code/reopen` | Reopen uploads. |
| `POST /tests/:code/regrade` | Regrade every graded and every failed submission (§8.5). 409 when there is none. |
| `POST /tests/:code/exercise-list/accept` | problem → accepted. |
```

- [ ] **Step 9: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `GET /tests/:code/report` | Rows for the class report: students, items, totals, analysis. Statistics are computed in the browser with `shared/stats.ts`. |
| `GET /submissions/:id` | Submission, files, evaluation, and items. |
| `GET /submissions/:id/files/:fileId` | Stream a student file. |
```

Replace it with:

```markdown
| `GET /tests/:code/report` | Rows for the class report: students, items, totals, analysis. Statistics are computed in the browser with `shared/stats.ts`. |
| `GET /submissions/:id` | Submission, test status, last error, files, evaluation, and items. |
| `PATCH /submissions/:id/evaluation` `{ pagesReviewed }` | The teacher checked the pages that the robot could not read: they stop counting as an item to check. Only for a graded submission. |
| `GET /submissions/:id/files/:fileId` | Stream a student file. |
```

- [ ] **Step 10: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `POST /submissions/:id/regrade` | Regrade one submission. A `done` test goes back to `evaluating` (§8.5). |
| `PATCH /evaluation-items/:id` `{ points?, comment?, reviewed? }` | Teacher correction. `0 ≤ points ≤ max_points`, in steps of 0.05. Sets `changed_by_teacher`, recomputes the total and grade, and sets `analysis_stale = 1` when the analysis is ready. |
| `GET /settings` | Parallel agents, whether a robot key exists, `runner_state`, and the time of the last successful grading (`MAX(submissions.graded_at)`). |
```

Replace it with:

```markdown
| `POST /submissions/:id/regrade` | Regrade one submission. A `done` test goes back to `evaluating` (§8.5). |
| `PATCH /evaluation-items/:id` `{ points?, comment?, reviewed? }` | Teacher correction of a graded submission. `0 ≤ points ≤ max_points`, in steps of 0.05, or exactly `max_points` (a barem can give 0.33). New points or a new comment set `changed_by_teacher`, recompute the total from all items and the grade in the same write, and set `analysis_stale = 1` when the analysis is ready. `reviewed` sets or clears the check. Answers with the whole submission. |
| `GET /settings` | Parallel agents, whether a robot key exists, `runner_state`, and the time of the last successful grading (`MAX(submissions.graded_at)`). |
```

- [ ] **Step 11: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `POST /submissions/:id/result` `{ runId, ok: true, result, model } \| { runId, ok: false, error }` | Accepted only when the submission is `grading` and its `run_id` equals `runId`. Otherwise 409 `taken_over` (404 for a deleted submission), and the robot drops the result (another run took the work over). Save a result (§12.5): the API validates it (a broken result: 422 `invalid_result`), computes totals, and stores the evaluation and its items in one batch. `error` is `timeout`, `invalid_output`, `crash`, or `usage_limit`. On `usage_limit` the submission goes back to `submitted` with no attempt counted; else attempts + 1, and `failed` at 3. |
| `GET /tests/:id/results` | (Plan 4.) Anonymized class data for the analysis: "Elev 1..n", items, points, comments. No names. |
| `POST /tests/:id/analysis` `{ runId, ok: true, analysis } \| { runId, ok: false, error }` | (Plan 4.) Save the analysis (`ready`, `analysis_stale = 0`). On an error, attempts + 1, and `failed` at 3. Then the API checks whether the test is `done`. |

```

Replace it with:

```markdown
| `POST /submissions/:id/result` `{ runId, ok: true, result, model } \| { runId, ok: false, error }` | Accepted only when the submission is `grading` and its `run_id` equals `runId`. Otherwise 409 `taken_over` (404 for a deleted submission), and the robot drops the result (another run took the work over). Save a result (§12.5): the API validates it (a broken result: 422 `invalid_result`), computes totals, and stores the evaluation and its items in one batch. `error` is `timeout`, `invalid_output`, `crash`, or `usage_limit`. On `usage_limit` the submission goes back to `submitted` with no attempt counted; else attempts + 1, and `failed` at 3. |
| `GET /tests/:id/results` | (Plan 4b.) Anonymized class data for the analysis: "Elev 1..n", items, points, comments. No names. |
| `POST /tests/:id/analysis` `{ runId, ok: true, analysis } \| { runId, ok: false, error }` | (Plan 4b.) Save the analysis (`ready`, `analysis_stale = 0`). On an error, attempts + 1, and `failed` at 3. Then the API checks whether the test is `done`. |

```

- [ ] **Step 12: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
     When /claim returns 204 and no task is running, grading is done.
  3. analyses: for each test id in tasks.analyses, run the task "class-report"  (Plan 4)
  until a round starts no new task, the budget is used, or the run stops taking work
```

Replace it with:

```markdown
     When /claim returns 204 and no task is running, grading is done.
  3. analyses: for each test id in tasks.analyses, run the task "class-report"  (Plan 4b)
  until a round starts no new task, the budget is used, or the run stops taking work
```

- [ ] **Step 13: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown

- Left (on a phone: top): the student's files. Photos show inline with zoom. PDFs show in a frame, with a download link.
- Right: a table of the exercises (label, max, AI points, final points, student answer, comment, confidence). A flagged row has a yellow highlighter background, the review reason, an input to change the points, and a **Verificat** button. The total and the grade update after each change.
- Below: summary, strengths, recommendations.
- Buttons:
  - **Descarcă PDF** (pdfmake, in the browser).
  - **Trimite**: Web Share API with the PDF file. If sharing is not possible, the PDF is downloaded.
  - **Recorectează**.
- The student PDF contains: test code and title, student name, date, grade, exercise table, summary, strengths, and recommendations. An item that is flagged and not yet checked shows "în verificare". Review reasons are for the teacher only and never go into the PDF.
```

Replace it with:

```markdown

- Left (on a phone: top; on a wide screen it stays in view while the page scrolls): the student's files, numbered in upload order as the robot numbers them. Photos show inline; a click opens one full size, to zoom. PDFs show in a frame, with a link that opens them.
- Right: the grade, the total, and the items to check; then a table of the exercises (label, final points out of the maximum, the robot's points when the teacher changed them, student answer, comment, the robot's confidence). A flagged row that is not checked yet has a yellow highlighter background, the review reason, and a **Verificat** button. **Modifică** opens the points (steps of 0.05) and the comment; saving a flagged row also checks it. The total and the grade update after each change.
- Pages that the robot could not read are named above the table ("Pagina 2"). They count as one item to check until the teacher clicks **Am verificat paginile**.
- Below: summary, strengths, recommendations.
- Buttons:
  - **Descarcă PDF** (pdfmake, in the browser). (Plan 4b.)
  - **Trimite**: Web Share API with the PDF file. If sharing is not possible, the PDF is downloaded. (Plan 4b.)
  - **Recorectează**, for a graded submission. A failed one shows its error and **Reîncearcă**.
- The student PDF contains: test code and title, student name, date, grade, exercise table, summary, strengths, and recommendations. An item that is flagged and not yet checked shows "în verificare". Review reasons are for the teacher only and never go into the PDF.
```

- [ ] **Step 14: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown

pdfmake gets a font with full Romanian letters (ă â î ș ț, comma-below forms U+0219 and U+021B). Plan 4 checks this with a test that builds a PDF with these letters.

```

Replace it with:

```markdown

pdfmake gets a font with full Romanian letters (ă â î ș ț, comma-below forms U+0219 and U+021B). Plan 4b checks this with a test that builds a PDF with these letters.

```

- [ ] **Step 15: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
   - **3b**: the spike (§12.4); the JSON Schemas; `runner/` with the pool, work folders, pandoc, Claude runs, and checks; the first grading skill and the `npm run try:skill` script (§13); `evaluate.yml`. It also does the 3a follow-ups that the robot needs: `files_version`, a reopen sends uploads in grading back to the queue, exercise-list points in cents, and a 1 MB limit on robot bodies. Result: tests are graded automatically.
4. **Review and reports**:
   - the student result page (flags, corrections, Verificat, Regrade);
   - the class analysis task in the robot (the `ClassAnalysis` contract, `GET /tests/:id/results`, `POST /tests/:id/analysis`, Regenerează);
   - the class report (table, statistics, analysis);
   - PDFs (Romanian font), CSV, Share;
   - the student history page;
   - the operations notes in `docs/deploy.md`.
   - Result: v1 is complete.

```

Replace it with:

```markdown
   - **3b**: the spike (§12.4); the JSON Schemas; `runner/` with the pool, work folders, pandoc, Claude runs, and checks; the first grading skill and the `npm run try:skill` script (§13); `evaluate.yml`. It also does the 3a follow-ups that the robot needs: `files_version`, a reopen sends uploads in grading back to the queue, exercise-list points in cents, and a 1 MB limit on robot bodies. Result: tests are graded automatically.
4. **Review and reports**, in two plans:
   - **4a**: the student result page (flags, corrections, Verificat, the check of unreadable pages, Regrade one or all), the student history page, and the items to check on Teste. It changes no robot code. Result: the teacher checks and corrects the grades.
   - **4b**: the class analysis task in the robot (the `ClassAnalysis` contract, `GET /tests/:id/results`, `POST /tests/:id/analysis`, Regenerează); the class report (table, statistics, analysis); PDFs (Romanian font), CSV, Share; the operations notes in `docs/deploy.md`. Result: v1 is complete.

```

- [ ] **Step 16: Edit `AGENTS.md`**

Find this block:

```markdown
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`, test codes through `parseTestCode`.
- Student and robot writes check their own rules inside their SQL statement (`server/db/links.ts`, `server/db/runner.ts`), never in a check before the write.
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
```

Replace it with:

```markdown
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`, test codes through `parseTestCode`.
- Student and robot writes, and the teacher's corrections, check their own rules inside their SQL statement (`server/db/links.ts`, `server/db/runner.ts`, `server/db/evaluations.ts`), never in a check before the write.
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
```

- [ ] **Step 17: Edit `server/AGENTS.md`**

Find this block:

```markdown
- `routes/`: HTTP. `admin.ts` and its parts, `upload.ts` for students, `runner.ts` for the robot.
- `db/`: D1 queries. `lifecycle.ts` starts, schedules, promotes, and ends evaluations; `links.ts` holds the student writes; `runner.ts` holds the robot's queries.
- `auth/`: Cloudflare Access login, and `robotAuth.ts` for the robot key.
```

Replace it with:

```markdown
- `routes/`: HTTP. `admin.ts` and its parts, `upload.ts` for students, `runner.ts` for the robot.
- `db/`: D1 queries. `lifecycle.ts` starts, schedules, promotes, and ends evaluations, and regrades; `links.ts` holds the student writes; `runner.ts` holds the robot's queries; `evaluations.ts` reads graded results and holds the teacher's corrections (`flagCountSql` counts the items to check the same way everywhere).
- `auth/`: Cloudflare Access login, and `robotAuth.ts` for the robot key.
```

- [ ] **Step 18: Edit `server/AGENTS.md`**

Find this block:

```markdown
- The same holds for the robot (`db/runner.ts`): a claim, an exercise list, and a result check the lease or the run inside their SQL. `/check` and `/lease` send uploads left in grading by a dead run back to the queue. An exercise list is saved only while the test's `files_version` is the one the robot read before the files. A run never claims again an upload that a reopen took from it (`reopenTest` keeps that run's id): the next run grades it.
- The database is the truth: R2 keys come from rows, never from listing R2.
```

Replace it with:

```markdown
- The same holds for the robot (`db/runner.ts`): a claim, an exercise list, and a result check the lease or the run inside their SQL. `/check` and `/lease` send uploads left in grading by a dead run back to the queue. An exercise list is saved only while the test's `files_version` is the one the robot read before the files. A run never claims again an upload that a reopen took from it (`reopenTest` keeps that run's id): the next run grades it.
- The teacher's corrections and Regrade check in their SQL that the upload is graded and the test is the teacher's: a regrade can delete a result at any time. A correction sums the total again from all items, so two corrections at once leave the right total. The grade comes from `gradeSql`, which a test compares with `gradeOf` for every amount in cents.
- The database is the truth: R2 keys come from rows, never from listing R2.
```

- [ ] **Step 19: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (colours from the Laura Miron site), brand mark, theme switch, Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time).
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`), the uploads table). `pages/SettingsPage.tsx` is Setări.
- `upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone).
```

Replace it with:

```markdown
- `ui/`: brand CSS (colours from the Laura Miron site), brand mark, theme switch, Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time).
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări.
- `upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone).
```

- [ ] **Step 20: Edit `docs/superpowers/plans/plan-3a-followups.md`**

Find this block:

```markdown
## For Plan 4

```

Replace it with:

```markdown
## For Plan 4

Plan 4a did the result page and the flag count on Teste. The class analysis is Plan 4b (`plan-4a-followups.md`).

```

- [ ] **Step 21: Edit `docs/superpowers/plans/plan-3b-followups.md`**

Find this block:

```markdown

## For Plan 4

```

Replace it with:

```markdown

## For Plan 4b

```

- [ ] **Step 22: Create `docs/superpowers/plans/plan-4a-followups.md`**

```markdown
# Plan 4a follow-ups

Plan 4a built the review of the grades: the result page (corrections, Verificat, the check of unreadable pages, Recorectează), Recorectează tot, the student history page, and the items to check on Teste. Plan 4 is cut in two (spec §19). Older open points are in `plan-3b-followups.md`. Write Plan 4b from the repo and the spec.

## For Plan 4b

- The class analysis: the `ClassAnalysis` contract, the robot's third task (`runner/tasks.ts`), the `class-report` mode of the skill, `GET /api/runner/tests/:id/results`, `POST /api/runner/tests/:id/analysis`, Regenerează, and when the first analysis is asked for. Today only a `ready` or `failed` analysis is asked for again, and nothing makes one: `analysis_status` stays `none`.
- The GitHub schedule does not fire (`docs/deploy.md`): every new path that makes work for the robot must start it, and "Pornește robotul" (`testHasRobotWork`) must count a waiting analysis. The test page must show the analysis state, or a test waits in "Se corectează" with every upload graded and no reason shown.
- The class report (spec §14.2) with `shared/stats.ts`, and its link from the test page.
- PDFs (student and class), CSV, Share. The student PDF never names the robot or AI, and never shows review reasons. CSV cells that start with `=`, `+`, `-`, or `@` are escaped: the texts come from Claude.
- The operations notes in `docs/deploy.md`.

## Still open

- The API can take a check back (`reviewed: false`, `pagesReviewed: false`); the page has no button for it.
- "Recorectează" on a row of the uploads table says nothing when the test is open; the row shows "Trimis". The result page and "Recorectează tot" say that the grading waits for Start evaluation.
- On a phone, the test page is a little wider than the screen: the file field of the test files list does not shrink (from Plan 2).
```

- [ ] **Step 23: Edit `scripts/smoke.mjs`**

Find this block:

```js
// grading by a pretend robot (robot key, schedule, start evaluation, check,
// lease, exercise list, claim, page, result, release), then deletes the test.
// Runs every check, then exits with code 1 if any failed.
```

Replace it with:

```js
// grading by a pretend robot (robot key, schedule, start evaluation, check,
// lease, exercise list, claim, page, result, release), the teacher's review
// (read the result, correct a point, the student's history, regrade all),
// then deletes the test.
// Runs every check, then exits with code 1 if any failed.
```

- [ ] **Step 24: Edit `scripts/smoke.mjs`**

Find this block:

```js

const removed = await api('DELETE', `/api/admin/tests/${code}`);
```

Replace it with:

```js

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
```

- [ ] **Step 25: Run all tests, the typecheck, and the build**

Run: `npm test`, then `npm run typecheck`, then `npm run build`
Expected: `Test Files  62 passed (62)`, `Tests  756 passed (756)`. No typecheck output. The build ends with `✓ built in …`.

- [ ] **Step 26: Commit**

```bash
git add docs AGENTS.md server/AGENTS.md src/AGENTS.md scripts
git commit -m "Document the review of grades in the spec, AGENTS.md, and the follow-ups, and smoke-test it"
```

---

### Task 9: Go live (main session)

Migration 0006 runs on the live database before the code that reads it reaches `main`. Every push to `main` deploys. This plan changes no robot code: the robot keeps running as it is.

Ask the user before each step marked "ask first", and wait for a clear yes. Steps marked "(user)" are done by the user alone. The auto-mode classifier refuses `wrangler … --remote` and `gh workflow run` from Claude: the user runs those in a separate terminal and pastes the output. curl to the live site is denied: use the browser pane. Read GitHub checks once each time the user asks or after other work; do not poll in a loop.

**Files:**
- Modify: nothing, unless a check fails.

- [ ] **Step 1: Check the branch and run the smoke test**

Run: `git status --short`, `npm test`, `npm run build`
Expected: a clean tree on the Plan 4a branch, all tests pass, the build ends with `✓ built in …`.
Then run the smoke test **in the branch's checkout** (the worktree, when there is one):
1. If `.dev.vars` is missing in that checkout, copy it from `D:\Projects\QuickEval\.dev.vars` (git-ignored; it holds only `DEV_TEACHER_EMAIL`).
2. Run `npm run db:local` in that checkout.
3. Start its production build with `preview_start`. When the session's folder is not the branch's checkout, add a temporary entry `{ "name": "preview-branch", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "<the checkout's path>", "run", "preview"], "port": 8788 }` to `.claude/launch.json`, start that one, and remove the entry afterwards.
4. In `preview_logs`, `env.CF_PAGES_COMMIT_SHA` must start with the checkout's `git rev-parse HEAD`.
5. Run `npm run smoke` in that checkout.
Expected: 46 lines that start with `PASS`, then `All smoke checks passed.` Stop the preview and check that nothing listens on port 8788 (`netstat -ano | findstr :8788`; on a leftover, use the PowerShell command in `AGENTS.md`).

- [ ] **Step 2: Run the Linux CI (ask first)**

Push the Plan 4a branch and open a pull request into `main`, so `ci.yml` runs on Linux in UTC. Preview deployments are off, so nothing deploys. After `gh pr create`, use the ccd_pr tools (`get_status`, and `bind_pr` if needed). Wait until the check `test` passes. Without pandoc on the runner, the real-pandoc test is skipped: `Test Files  62 passed (62)`, `Tests  755 passed | 1 skipped (756)`.

- [ ] **Step 3: Apply the migration to the live database (user)**

The user runs, in a separate terminal: `npx wrangler d1 migrations list quickeval --remote`
Expected: only `0006_pages_reviewed.sql` is waiting (if `0005_robot_start_failed.sql` waits too, the live site already misses a column: stop and report). Then the user runs `npx wrangler d1 migrations apply quickeval --remote` and answers yes. Expected: `0006_pages_reviewed.sql` with ✅. Then `npx wrangler d1 execute quickeval --remote --json --command "SELECT COUNT(*) AS evaluations, COUNT(pages_reviewed_at) AS checked FROM evaluations"` gives the number of graded uploads and `checked` 0. A transient error 7403 goes away on a retry. The live site keeps working: the old code does not read the new column.

- [ ] **Step 4: Merge and deploy (ask first)**

Merge the pull request into `main` (the finishing-a-development-branch skill). Wait for the GitHub check `test` of the merge commit and the Cloudflare check `Cloudflare Pages`: read `gh api repos/parameciul/quickeval/commits/<sha>/check-suites` once the user asks.

- [ ] **Step 5: Check the live site (user, with the browser pane)**

The user opens https://quickeval.pages.dev/admin/ (the Access login is the user's). Then, read-only, with `get_page_text` in the browser pane:
1. Teste: a test with graded uploads shows "corectate: N", and "de verificat: M" when items wait.
2. The test page of a graded test: "Vezi lucrarea" on each row, "Recorectează" on graded rows, and "Recorectează tot". Do not click them.
3. A graded upload's page: the grade, the table of exercises, the items to check, the pages beside them, and "Toate notele elevului".
4. That link: the student page lists the grade.
Checks, corrections, and regrades of real uploads are the teacher's work: do not make them now.

- [ ] **Step 6: Report**

Tell the user what is live and what the checks showed. Tell the user and Laura:
- Each student's result opens from "Vezi lucrarea" on the test page. Yellow rows need a look: **Verificat** accepts the robot's points; **Modifică** changes the points (steps of 0,05) or the comment, and also marks the row as checked.
- Pages the robot could not read are named above the table; **Am verificat paginile** clears that mark after a look at the photos.
- **Recorectează** (one student) and **Recorectează tot** (the whole test, also the failed ones) send the work back to the robot; the teacher's changes are lost, and the page asks first.
- The student's name on the class page opens all of the student's grades.
- Plan 4b brings the class analysis, the class report, PDFs, CSV, and Share.
