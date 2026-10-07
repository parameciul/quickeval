# QuickEval Plan 3a: Close Tests on Time, the Robot API, and Setări — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 10 must run in the main session, not in a subagent:** every outward step needs the user's explicit yes, and some steps are checks the user makes on the live site.

**Goal:** The teacher closes a test now or at a time she picks, sees the robot's state on the test page and on Setări, and makes the robot's key; the API has every route the grading robot needs (lease, work list, exercise list, claim, pages, results), on the live site. The robot itself comes with Plan 3b.

**Architecture:** The same repo and stack as Plans 1 and 2. A third migration adds the `evaluations`, `evaluation_items`, `settings`, and `runner_state` tables. The teacher API gets Start evaluation (now or scheduled), the answers to the robot's problems (accept a barem, try again), and Setări. A new robot API at `/api/runner` takes a Bearer key; every robot write checks the lease or the run inside its SQL. Every teacher and student request first starts the evaluations whose time has come, so a scheduled test closes on time without the robot.

**Tech Stack:** Node 24, TypeScript 7, React 19, React Router 8, TanStack Query 5, Vite 8, Vitest 5 (jsdom + Testing Library), Hono 4, zod 4, wrangler 4 (Pages, D1, R2, `getPlatformProxy`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-06-quickeval-design.md`. This plan implements the first half of §19 item 3 (Task 9 splits it into 3a and 3b in the spec): §7.1 (the four tables), §8.3–§8.5 (promotion, Start evaluation, the `done` rule, Retry, the analysis refresh rule), the Start-evaluation, robot-line, exercise-list and Setări parts of §9, the evaluation, exercise-list, retry and settings routes of §11.1, §11.3 without the class analysis, the contracts and code checks of §12.5 without `ClassAnalysis`, §12.6 (robot key, "Evaluate now"), and the robot-key parts of §15. Read `docs/superpowers/plans/plan-2-followups.md` too: the code in the repo is the source of truth, not the Plan 2 text.

## Global Constraints

- Node 24 (`.node-version`), npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments, and docs are English. **No page tells students that AI grades their work.** Teacher pages may name the robot; student pages and `/api/u` answers never carry a grade, a comment, or a review reason.
- API errors are `{ "error": "<code>", "message": "<Romanian text>" }`, made with `ApiError(status, code, message)`.
- Every teacher query is scoped by the logged-in teacher's id. Each new teacher route gets an "another teacher's → 404" test. Settings are the exception: they are system-wide (spec §7.1).
- Each student write and each robot write checks its own rules inside its SQL statement (or one `db.batch()`), never in a check before the write: two requests at once would get past it.
- Robot answers carry ids, counts, and file types, never names or file names. The robot's logs are public.
- Times are stored as ISO 8601 UTC strings written by `toISOString()` (SQL compares them as text) and shown in Europe/Bucharest time ("6 oct. 2026, 10:15").
- Functions do no heavy CPU work and make at most 15 D1 queries per request. Saving a grading takes a fixed number of queries, whatever the number of exercises.
- API tests use wrangler's `getPlatformProxy`. No direct `miniflare` dependency.
- Only `/admin` and `/api/admin` are behind Cloudflare Access; `/u`, `/api/u`, and `/api/runner` must stay outside it.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers.
- Development happens on Windows (commands below work in Git Bash and in PowerShell unless a step says otherwise). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- Tests that start wrangler's local engine leave nothing running when they pass. If a run is stopped halfway on Windows, check for a leftover `workerd.exe` as `AGENTS.md` describes.

## Rulings made while planning

These decisions were made while the plan was built and tested. They are binding for the implementers and reviewers. Task 9 writes the ones that change the spec into the spec.

1. **Plan 3 is split.** The user chose two plans: 3a (this plan) closes tests and builds the robot API; 3b builds the robot (the spike, `runner/`, the skill, `try:skill`, `evaluate.yml`, the GitHub and Claude secrets). Cost if wrong: one more plan to review.
2. **The `done` rule.** `evaluating → done` when no upload of the test is `submitted` or `grading` and `analysis_status` is not `requested`. As written, the spec needed `ready` or `failed`, which a test without an analysis never reaches; Plan 4 decides when the first analysis is asked for. `finishTests` runs with every promotion, after Start evaluation, and after each result. Cost if wrong: a test shows "Corectat" before its analysis exists.
3. **The analysis refresh rule as written.** Entering an evaluation turns a `ready` or `failed` analysis into `requested` with 0 attempts. Nothing makes an analysis before Plan 4, so `GET /tasks` returns `analyses: []` in practice. Cost if wrong: none until Plan 4.
4. **Promotion runs on every request.** The `promoteDue` middleware runs `promoteDueTests` before every `/api/admin` and `/api/u` handler, and `/check` runs it too: three statements in one batch. A promoted test closed its uploads at `evaluation_at`: that is its `evaluation_started_at`, and the `submitted_at` of the uploads it sends without a confirm. Cost if wrong: three cheap writes per request.
5. **Start now and schedule.** Start now needs the test file, the barem, and an uploaded file; the check is inside the `UPDATE`, and the uploads with files are sent in the same batch. A schedule needs only the two files, because the uploads may still come. At the scheduled time the uploads close even if nobody uploaded; a test with nothing to grade then ends at once. Cost if wrong: a scheduled test with no uploads shows "Corectat".
6. **Times compare as text.** `at` is a zod ISO datetime (UTC, `Z`), stored as `new Date(at).toISOString()`, at most 60 days ahead; a time that has passed starts now. Tests fake the clock with `vi.useFakeTimers({ toFake: ['Date'] })`, which leaves the local engine working.
7. **"Evaluate now".** After Start now, Retry, or an exercise-list retry on a test in evaluation, the API asks GitHub for a `repository_dispatch` (`server/dispatch.ts`, 5-second timeout, never throws) when the Pages settings `GITHUB_REPO` and `GITHUB_DISPATCH_TOKEN` exist; Plan 3b sets them. Tests replace the call through `createApp({ dispatchRobot })`. Cost if wrong: the robot starts up to 10 minutes later.
8. **The robot key.** `Authorization: Bearer <key>`; 32 random bytes in base64url; only its SHA-256 is stored in `settings.runner_key_hash` and compared in constant time. No stored key: every robot request gets 401 `robot_denied`. A new key replaces the old one at once.
9. **The lease.** `/lease` is granted when the lease is free, stale (no heartbeat for 15 minutes), or already this run's, and sends the other runs' `grading` uploads back to `submitted`. `/heartbeat` and `/release` answer 409 `lease_lost` to another run. `/check` also sends back uploads left in `grading` by a run that is not alive (stale or released), so an upload is never stuck when no run takes the lease.
10. **Claim is one statement.** `UPDATE … WHERE id = (oldest gradable) AND status = 'submitted' AND <lease held> RETURNING`. D1 runs one statement at a time, so two parallel claims never take the same upload. The parallel-claims test passes either way on the local engine: reviewers check the SQL, not only the test.
11. **Results.** `POST /submissions/:id/result` reads the upload first (404 when deleted, 409 `taken_over` when not `grading` by this run), checks the result with `checkGrading` (422 `invalid_result` when it cannot be used), then saves in one 5-statement batch: old evaluation out, evaluation in, items in through `json_each`, the upload `graded`, `finishTests`. Each write repeats the guard. The spec's `retryable` flag is gone: `error` is `timeout`, `invalid_output`, `crash`, or `usage_limit`, and only `usage_limit` counts no attempt. At 3 attempts the upload fails, with a Romanian `last_error` for the teacher.
12. **Text limits cut, not refuse.** The zod schemas check only the shape (and convert with `z.toJSONSchema` for Plan 3b); `checkExerciseList` and `checkGrading` cut long texts with "…" and keep at most 5 strengths and recommendations. One long comment never throws away a grading.
13. **A broken barem can be replaced during grading.** Replacing a file while `evaluating` is allowed when the exercise list is `problem` or `failed`: the robot then reads neither file, and the warning tells the teacher to replace the barem. A new barem sets the list back to `none`.
14. **Settings are system-wide** (spec §7.1): any teacher may change them; v1 has one teacher. The last grading time is scoped to the teacher.
15. **The robot line** shows while a test is in evaluation or has a schedule. It warns when the robot never checked or did not check for 30 minutes. Until Plan 3b, the warning shows on every closed test: that is true.
16. **Regrade waits for Plan 4**, with the result page. Retry comes now, because the robot makes failed uploads.
17. **Grades in the uploads table.** The table shows the grade, the items to check (flagged items not yet checked, plus one for pages that could not be read), and the error of a failed grading, so Plan 3b's grades are visible before Plan 4.
18. **The schedule input is Romania's time.** `src/ui/bucharestTime.ts` converts with an explicit Europe/Bucharest offset, so the tests pass in any time zone (CI runs in UTC). In the hour that repeats when the clocks go back, the later instant; a time skipped when the clocks go forward moves forward by an hour.
19. **No names to the robot.** `GET /api/runner/tests/:id` gives the id, the file types, and the exercise list (not the test code); files go out named `test`, `barem`, or `file-<id>`.
20. **Students see a graded upload as sent.** The student app already treats every status after `uploading` as "done"; a test checks that `/api/u` answers carry no grading data.

## Not in this plan

The robot (the spike, `runner/`, the skill, `npm run try:skill`, `evaluate.yml`, the GitHub and Claude secrets) is Plan 3b. The class analysis, the result page (items, corrections, Verificat), Regrade, the reports, PDFs, CSV, and the student history page are Plan 4.

---

### Task 1: Tables for gradings, settings, and the robot; checks of the robot's answers

The third migration adds the four tables of spec §7.1. `shared/schemas.ts` holds the shapes of the robot's answers and the checks that code makes on them; `shared/scoring.ts` computes points and grades.

**Files:**
- Create: `migrations/0003_robot.sql`, `shared/scoring.ts`, `shared/schemas.ts`
- Test: `shared/scoring.test.ts`, `shared/schemas.test.ts` (new); `server/app.test.ts` (modified)

**Interfaces:**
- Consumes: the `submissions` and `tests` tables of Plan 2.
- Produces:
  - Tables `evaluations`, `evaluation_items`, `settings`, `runner_state` (one row, `id = 1`), and the indexes `tests_by_status`, `submissions_by_status`.
  - `round2(value)`, `gradeOf(total, maxTotal)`, `formatPoints(value)` in `shared/scoring.ts`.
  - In `shared/schemas.ts`: `exerciseListSchema`, `gradingResultSchema` (shape only), the types `ExerciseList`, `GradingResult`, `Confidence`, `GradedItem`, `Grading`, `CheckedExerciseList`, `Checked<T>`; `MAX_EXERCISES`, `TEXT_LIMITS`, `OUT_OF_RANGE`, `LOW_CONFIDENCE`, `CHECK_THIS`; `cutText(text, max)`; `checkExerciseList(raw): Checked<CheckedExerciseList>`; `checkGrading(raw, list): Checked<Grading>`.

- [ ] **Step 1: Create `shared/scoring.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatPoints, gradeOf, round2 } from './scoring.ts';

describe('round2', () => {
  it('rounds to 2 decimals, halves up', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.344)).toBe(2.34);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(7)).toBe(7);
  });
});

describe('gradeOf', () => {
  it('turns a total into a grade out of 10', () => {
    expect(gradeOf(10, 10)).toBe(10);
    expect(gradeOf(7.5, 10)).toBe(7.5);
    expect(gradeOf(87, 100)).toBe(8.7);
    expect(gradeOf(2, 3)).toBe(6.67);
  });
});

describe('formatPoints', () => {
  it('writes Romanian numbers', () => {
    expect(formatPoints(9.5)).toBe('9,5');
    expect(formatPoints(10)).toBe('10');
    expect(formatPoints(0.25)).toBe('0,25');
  });
});
```

- [ ] **Step 2: Create `shared/schemas.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CHECK_THIS,
  checkExerciseList,
  checkGrading,
  cutText,
  type ExerciseList,
  exerciseListSchema,
  gradingResultSchema,
  LOW_CONFIDENCE,
  OUT_OF_RANGE,
} from './schemas.ts';

function exercise(id: string, maxPoints: number) {
  return { id, label: `Exercițiul ${id}`, maxPoints, answer: '3/4', scoringNotes: '', topic: 'Fracții' };
}

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [exercise('I.1', 4), exercise('I.2', 2.5), exercise('II.1', 2.5)],
  notes: '',
};

function item(exerciseId: string, points: number, extra: Record<string, unknown> = {}) {
  return {
    exerciseId,
    points,
    studentAnswer: '3/4',
    comment: 'Bine.',
    confidence: 'high',
    needsReview: false,
    reviewReason: '',
    ...extra,
  };
}

function grading(items: unknown[], extra: Record<string, unknown> = {}) {
  return { items, unreadable: [], summary: 'Ai lucrat bine.', strengths: ['Fracții'], recommendations: ['Exersează.'], ...extra };
}

describe('cutText', () => {
  it('trims and keeps short texts', () => {
    expect(cutText('  bine  ', 10)).toBe('bine');
  });

  it('cuts long texts and ends them with an ellipsis', () => {
    expect(cutText('abcdefghij', 5)).toBe('abcd…');
    expect(cutText('abcdefghij', 5)).toHaveLength(5);
  });

  it('never splits a character outside the basic plane', () => {
    expect(cutText('ab😀😀😀', 4)).toBe('ab😀…');
  });
});

describe('checkExerciseList', () => {
  it('accepts a list whose points add up', () => {
    const checked = checkExerciseList(LIST);
    expect(checked).toEqual({ ok: true, value: { list: LIST, status: 'ready', message: null } });
  });

  it('marks a list whose points do not add up as a problem, with the sums', () => {
    const checked = checkExerciseList({ ...LIST, exercises: [exercise('I.1', 4), exercise('I.2', 4.5)] });
    expect(checked.ok && checked.value.status).toBe('problem');
    expect(checked.ok && checked.value.message).toBe('Punctajele din barem dau 9,5, dar totalul este 10.');
  });

  it('accepts sums inside the tolerance', () => {
    const checked = checkExerciseList({ ...LIST, exercises: [exercise('I.1', 4.0004), exercise('I.2', 2.5), exercise('II.1', 2.5)] });
    expect(checked.ok && checked.value.status).toBe('ready');
  });

  it('trims ids and cuts long texts', () => {
    const long = { ...exercise(' I.1 ', 9), label: 'x'.repeat(200) };
    const checked = checkExerciseList({ ...LIST, exercises: [long] });
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.list.exercises[0]!.id).toBe('I.1');
    expect(checked.value.list.exercises[0]!.label).toHaveLength(120);
  });

  it.each([
    ['not an object', 'nimic'],
    ['no exercises', { ...LIST, exercises: [] }],
    ['61 exercises', { ...LIST, totalPoints: 62, exercises: Array.from({ length: 61 }, (_, i) => exercise(`E${i}`, 1)) }],
    ['a repeated id', { ...LIST, exercises: [exercise('I.1', 4.5), exercise('I.1', 4.5)] }],
    ['an empty id', { ...LIST, exercises: [exercise(' ', 9)] }],
    ['an exercise without points', { ...LIST, exercises: [exercise('I.1', 9), exercise('I.2', 0)] }],
    ['a zero total', { ...LIST, totalPoints: 0 }],
    ['office points as big as the total', { ...LIST, officePoints: 10 }],
    ['negative office points', { ...LIST, officePoints: -1 }],
  ])('refuses %s', (_name, raw) => {
    expect(checkExerciseList(raw).ok).toBe(false);
  });
});

describe('checkGrading', () => {
  it('computes the total and the grade, in the order of the list', () => {
    const checked = checkGrading(grading([item('II.1', 2), item('I.1', 4), item('I.2', 1.5)]), LIST);
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value).toMatchObject({ maxTotal: 10, officePoints: 1, total: 8.5, grade: 8.5, needsReview: false });
    expect(checked.value.items.map((graded) => [graded.exerciseId, graded.position, graded.label, graded.maxPoints])).toEqual([
      ['I.1', 1, 'Exercițiul I.1', 4],
      ['I.2', 2, 'Exercițiul I.2', 2.5],
      ['II.1', 3, 'Exercițiul II.1', 2.5],
    ]);
  });

  it('rounds points to 2 decimals', () => {
    const checked = checkGrading(grading([item('I.1', 3.333), item('I.2', 1), item('II.1', 1)]), LIST);
    expect(checked.ok && checked.value.items[0]!.points).toBe(3.33);
    expect(checked.ok && checked.value.total).toBe(6.33);
  });

  it('clamps points outside [0, max] and flags them', () => {
    const checked = checkGrading(grading([item('I.1', 5), item('I.2', -1), item('II.1', 2)]), LIST);
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items[0]).toMatchObject({ points: 4, needsReview: true, reviewReason: OUT_OF_RANGE });
    expect(checked.value.items[1]).toMatchObject({ points: 0, needsReview: true, reviewReason: OUT_OF_RANGE });
    expect(checked.value.needsReview).toBe(true);
  });

  it('always flags low confidence, with a reason', () => {
    const checked = checkGrading(
      grading([item('I.1', 4, { confidence: 'low' }), item('I.2', 2, { needsReview: true }), item('II.1', 2, { reviewReason: 'ignorat' })]),
      LIST,
    );
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items.map((graded) => [graded.needsReview, graded.reviewReason])).toEqual([
      [true, LOW_CONFIDENCE],
      [true, CHECK_THIS],
      [false, ''],
    ]);
  });

  it('keeps the robot reason and adds the range reason', () => {
    const checked = checkGrading(
      grading([item('I.1', 7, { needsReview: true, reviewReason: 'Scris greu de citit' }), item('I.2', 2), item('II.1', 2)]),
      LIST,
    );
    expect(checked.ok && checked.value.items[0]!.reviewReason).toBe(`Scris greu de citit; ${OUT_OF_RANGE}`);
  });

  it('flags the whole grading when a page could not be read', () => {
    const checked = checkGrading(grading([item('I.1', 4), item('I.2', 2), item('II.1', 2)], { unreadable: ['page-02.jpg'] }), LIST);
    expect(checked.ok && checked.value.needsReview).toBe(true);
    expect(checked.ok && checked.value.unreadable).toEqual(['page-02.jpg']);
  });

  it('cuts long texts and keeps at most 5 strengths and recommendations', () => {
    const checked = checkGrading(
      grading([item('I.1', 4, { comment: 'c'.repeat(1200) }), item('I.2', 2), item('II.1', 2)], {
        summary: 's'.repeat(2000),
        strengths: ['a', 'b', 'c', 'd', 'e', 'f', ' '],
        recommendations: ['r'.repeat(400)],
      }),
      LIST,
    );
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items[0]!.comment).toHaveLength(1000);
    expect(checked.value.summary).toHaveLength(1500);
    expect(checked.value.strengths).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(checked.value.recommendations[0]).toHaveLength(300);
  });

  it.each([
    ['not an object', null],
    ['a missing exercise', grading([item('I.1', 4), item('I.2', 2)])],
    ['an unknown exercise', grading([item('I.1', 4), item('I.2', 2), item('II.9', 2)])],
    ['a repeated exercise', grading([item('I.1', 4), item('I.2', 2), item('II.1', 2), item('I.1', 1)])],
    ['a wrong confidence', grading([item('I.1', 4, { confidence: 'sure' }), item('I.2', 2), item('II.1', 2)])],
  ])('refuses %s', (_name, raw) => {
    expect(checkGrading(raw, LIST).ok).toBe(false);
  });
});

describe('JSON Schemas for the robot', () => {
  it('can be made from both schemas', () => {
    for (const schema of [exerciseListSchema, gradingResultSchema]) {
      const json = z.toJSONSchema(schema) as { type: string; required: string[] };
      expect(json.type).toBe('object');
      expect(json.required.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Edit `server/app.test.ts`**

Find this block:

```ts
    expect(tables.results.map((table) => table.name)).toEqual(
      expect.arrayContaining(['teachers', 'classes', 'students', 'enrollments', 'tests', 'submissions', 'submission_files']),
    );
```

Replace it with:

```ts
    expect(tables.results.map((table) => table.name)).toEqual(
      expect.arrayContaining([
        'teachers',
        'classes',
        'students',
        'enrollments',
        'tests',
        'submissions',
        'submission_files',
        'evaluations',
        'evaluation_items',
        'settings',
        'runner_state',
      ]),
    );
```

- [ ] **Step 4: Edit `server/app.test.ts`**

Find this block:

```ts

  it('has a file bucket', async () => {
```

Replace it with:

```ts

  it('deletes a grading and its items together with the upload', async () => {
    const db = api.db;
    const cls = await db
      .prepare("INSERT INTO classes (teacher_id, name, school_year, created_at) VALUES (?, 'C3', 2026, 't') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const student = await db
      .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Pop Ana', 't') RETURNING id")
      .bind(api.teacherId)
      .first<{ id: number }>();
    const test = await db
      .prepare(
        "INSERT INTO tests (teacher_id, class_id, number, code, title, created_at, updated_at) VALUES (?, ?, 1, 'C3-26T1', 'T', 't', 't') RETURNING id",
      )
      .bind(api.teacherId, cls!.id)
      .first<{ id: number }>();
    const submission = await db
      .prepare("INSERT INTO submissions (test_id, student_id, status, started_at) VALUES (?, ?, 'graded', 't') RETURNING id")
      .bind(test!.id, student!.id)
      .first<{ id: number }>();
    const evaluation = await db
      .prepare(
        `INSERT INTO evaluations (submission_id, max_total, office_points, total, grade, needs_review, summary,
           strengths_json, recommendations_json, unreadable_json, raw_json, created_at, updated_at)
         VALUES (?, 10, 1, 9, 9, 0, 'S', '[]', '[]', '[]', '{}', 't', 't') RETURNING id`,
      )
      .bind(submission!.id)
      .first<{ id: number }>();
    await db
      .prepare(
        `INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason)
         VALUES (?, 'I.1', 1, 'L', 9, 8, 8, 'a', 'c', 'high', 0, '')`,
      )
      .bind(evaluation!.id)
      .run();

    await db.prepare('DELETE FROM submissions WHERE id = ?').bind(submission!.id).run();
    const left = await db
      .prepare('SELECT (SELECT COUNT(*) FROM evaluations) AS evaluations, (SELECT COUNT(*) FROM evaluation_items) AS items')
      .first<{ evaluations: number; items: number }>();
    expect(left).toEqual({ evaluations: 0, items: 0 });
  });

  it('has exactly one robot state row', async () => {
    const rows = await api.db.prepare('SELECT id, run_id FROM runner_state').all<{ id: number; run_id: string | null }>();
    expect(rows.results).toEqual([{ id: 1, run_id: null }]);
    await expect(api.db.prepare('INSERT INTO runner_state (id) VALUES (2)').run()).rejects.toThrow(/CHECK constraint failed/);
  });

  it('has a file bucket', async () => {
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run server/app.test.ts shared/schemas.test.ts shared/scoring.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  3 failed | 10 passed (13)`. `shared/schemas.test.ts` and `shared/scoring.test.ts` fail with `Cannot find module './schemas.ts'` and `Cannot find module './scoring.ts'`. In `server/app.test.ts` three checks fail: the table list (`expected [ 'teachers', 'classes', …(6) ] to deeply equal ArrayContaining{…}`), `no such table: evaluations`, and `no such table: runner_state`.

- [ ] **Step 6: Create `migrations/0003_robot.sql`**

```sql
-- Grading results, the system settings, and the robot's lease (spec §7.1).
-- Times are ISO 8601 UTC strings. One statement per ";" line end (the test
-- helper splits on that), and no ";" inside strings.

CREATE TABLE evaluations (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  max_total REAL NOT NULL,
  office_points REAL NOT NULL,
  total REAL NOT NULL,
  grade REAL NOT NULL,
  needs_review INTEGER NOT NULL,
  summary TEXT NOT NULL,
  strengths_json TEXT NOT NULL,
  recommendations_json TEXT NOT NULL,
  unreadable_json TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE evaluation_items (
  id INTEGER PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  max_points REAL NOT NULL,
  ai_points REAL NOT NULL,
  points REAL NOT NULL,
  student_answer TEXT NOT NULL,
  comment TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  needs_review INTEGER NOT NULL,
  review_reason TEXT NOT NULL,
  reviewed_at TEXT,
  changed_by_teacher INTEGER NOT NULL DEFAULT 0,
  UNIQUE (evaluation_id, exercise_id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE runner_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  run_id TEXT,
  lease_acquired_at TEXT,
  heartbeat_at TEXT,
  last_check_at TEXT,
  last_run_finished_at TEXT,
  last_run_summary TEXT
);

INSERT INTO runner_state (id) VALUES (1);

CREATE INDEX tests_by_status ON tests (status, evaluation_at);

CREATE INDEX submissions_by_status ON submissions (status, submitted_at);
```

- [ ] **Step 7: Create `shared/scoring.ts`**

```ts
// Points and grades are computed by code, never by Claude (spec §7.3).

// Rounds to 2 decimals; 1.005 becomes 1.01.
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// The grade out of 10: total * 10 / max_total, 2 decimals.
export function gradeOf(total: number, maxTotal: number): number {
  return round2((total * 10) / maxTotal);
}

const POINTS = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });

// Romanian numbers in messages: "9,5", "10".
export function formatPoints(value: number): string {
  return POINTS.format(value);
}
```

- [ ] **Step 8: Create `shared/schemas.ts`**

```ts
import { z } from 'zod';
import { formatPoints, gradeOf, round2 } from './scoring.ts';

// What the robot's Claude runs return (spec §12.5), and the checks that code
// makes on it. The schemas check only the shape, so the robot can give Claude
// their JSON Schema (z.toJSONSchema). The checks below refuse what cannot be
// used and cut long texts to size: one long comment never throws away a
// whole grading.

// Mode "exercise-list": made once per test from the test and the barem.
export const exerciseListSchema = z.object({
  totalPoints: z.number(),
  officePoints: z.number(),
  exercises: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      maxPoints: z.number(),
      answer: z.string(),
      scoringNotes: z.string(),
      topic: z.string(),
    }),
  ),
  notes: z.string(),
});

export type ExerciseList = z.infer<typeof exerciseListSchema>;

// Mode "grade": one student's work, graded against the exercise list.
export const gradingResultSchema = z.object({
  items: z.array(
    z.object({
      exerciseId: z.string(),
      points: z.number(),
      studentAnswer: z.string(),
      comment: z.string(),
      confidence: z.enum(['high', 'medium', 'low']),
      needsReview: z.boolean(),
      reviewReason: z.string(),
    }),
  ),
  unreadable: z.array(z.string()),
  summary: z.string(),
  strengths: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export type GradingResult = z.infer<typeof gradingResultSchema>;
export type Confidence = GradingResult['items'][number]['confidence'];

export const MAX_EXERCISES = 60;
const MAX_EXERCISE_ID = 20;
const MAX_TOTAL_POINTS = 1000;
const MAX_LIST_ENTRIES = 5;
const MAX_UNREADABLE = 20;

// Longest texts, in characters. A longer text is cut and ends with "…".
export const TEXT_LIMITS = {
  label: 120,
  answer: 500,
  scoringNotes: 1000,
  topic: 80,
  notes: 1000,
  studentAnswer: 500,
  comment: 1000,
  reviewReason: 500,
  summary: 1500,
  listEntry: 300,
  fileName: 100,
} as const;

// Review reasons that code adds. The teacher reads them; students never do.
export const OUT_OF_RANGE = 'Punctaj în afara intervalului';
export const LOW_CONFIDENCE = 'Robotul nu este sigur de acest punctaj.';
export const CHECK_THIS = 'Verifică acest punctaj.';

// Trims the text and cuts it to `max` characters. Counts whole characters,
// so a letter outside the basic plane is never split.
export function cutText(text: string, max: number): string {
  const trimmed = text.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= max) return trimmed;
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

function cutList(list: string[], entries: number, max: number): string[] {
  return list
    .map((entry) => cutText(entry, max))
    .filter((entry) => entry !== '')
    .slice(0, entries);
}

// Not ok: the output cannot be used, and `reason` says why (for the robot's
// own log; it holds no student data).
export type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface CheckedExerciseList {
  list: ExerciseList;
  // "problem": the points of the exercises and "din oficiu" do not add up to the total.
  status: 'ready' | 'problem';
  message: string | null;
}

export function checkExerciseList(raw: unknown): Checked<CheckedExerciseList> {
  const parsed = exerciseListSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'not an exercise list' };
  const input = parsed.data;
  if (input.exercises.length === 0 || input.exercises.length > MAX_EXERCISES) {
    return { ok: false, reason: `needs 1 to ${MAX_EXERCISES} exercises` };
  }
  if (!(input.totalPoints > 0 && input.totalPoints <= MAX_TOTAL_POINTS)) {
    return { ok: false, reason: 'total points out of range' };
  }
  if (!(input.officePoints >= 0 && input.officePoints < input.totalPoints)) {
    return { ok: false, reason: 'office points out of range' };
  }
  const ids = new Set<string>();
  for (const exercise of input.exercises) {
    const id = exercise.id.trim();
    if (id === '' || id.length > MAX_EXERCISE_ID || ids.has(id)) return { ok: false, reason: 'empty, long, or repeated exercise id' };
    if (!(exercise.maxPoints > 0)) return { ok: false, reason: 'exercise without points' };
    ids.add(id);
  }

  const list: ExerciseList = {
    totalPoints: input.totalPoints,
    officePoints: input.officePoints,
    exercises: input.exercises.map((exercise) => ({
      id: exercise.id.trim(),
      label: cutText(exercise.label, TEXT_LIMITS.label),
      maxPoints: exercise.maxPoints,
      answer: cutText(exercise.answer, TEXT_LIMITS.answer),
      scoringNotes: cutText(exercise.scoringNotes, TEXT_LIMITS.scoringNotes),
      topic: cutText(exercise.topic, TEXT_LIMITS.topic),
    })),
    notes: cutText(input.notes, TEXT_LIMITS.notes),
  };
  const sum = round2(list.exercises.reduce((total, exercise) => total + exercise.maxPoints, list.officePoints));
  if (Math.abs(sum - list.totalPoints) > 0.001) {
    const message = `Punctajele din barem dau ${formatPoints(sum)}, dar totalul este ${formatPoints(list.totalPoints)}.`;
    return { ok: true, value: { list, status: 'problem', message } };
  }
  return { ok: true, value: { list, status: 'ready', message: null } };
}

export interface GradedItem {
  exerciseId: string;
  // 1-based, in the order of the exercise list.
  position: number;
  label: string;
  maxPoints: number;
  points: number;
  studentAnswer: string;
  comment: string;
  confidence: Confidence;
  needsReview: boolean;
  reviewReason: string;
}

export interface Grading {
  maxTotal: number;
  officePoints: number;
  total: number;
  grade: number;
  // An item to check, or a page that could not be read.
  needsReview: boolean;
  summary: string;
  strengths: string[];
  recommendations: string[];
  unreadable: string[];
  items: GradedItem[];
}

// Checks one student's grading against the exercise list: every exercise
// exactly once, points inside [0, max] (outside: clamped and flagged), low
// confidence always flagged. Code computes the total and the grade.
export function checkGrading(raw: unknown, list: ExerciseList): Checked<Grading> {
  const parsed = gradingResultSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'not a grading result' };
  const byId = new Map<string, GradingResult['items'][number]>();
  for (const item of parsed.data.items) {
    const id = item.exerciseId.trim();
    if (byId.has(id)) return { ok: false, reason: 'repeated exercise id' };
    byId.set(id, item);
  }
  if (byId.size !== list.exercises.length || list.exercises.some((exercise) => !byId.has(exercise.id))) {
    return { ok: false, reason: 'exercise ids do not match the exercise list' };
  }

  const items = list.exercises.map((exercise, index): GradedItem => {
    const item = byId.get(exercise.id)!;
    const given = round2(item.points);
    const points = round2(Math.min(Math.max(given, 0), exercise.maxPoints));
    const reasons: string[] = [];
    if (item.needsReview || item.confidence === 'low') {
      reasons.push(item.reviewReason.trim() || (item.confidence === 'low' ? LOW_CONFIDENCE : CHECK_THIS));
    }
    if (points !== given) reasons.push(OUT_OF_RANGE);
    return {
      exerciseId: exercise.id,
      position: index + 1,
      label: exercise.label,
      maxPoints: exercise.maxPoints,
      points,
      studentAnswer: cutText(item.studentAnswer, TEXT_LIMITS.studentAnswer),
      comment: cutText(item.comment, TEXT_LIMITS.comment),
      confidence: item.confidence,
      needsReview: reasons.length > 0,
      reviewReason: cutText(reasons.join('; '), TEXT_LIMITS.reviewReason),
    };
  });
  const unreadable = cutList(parsed.data.unreadable, MAX_UNREADABLE, TEXT_LIMITS.fileName);
  const total = round2(items.reduce((sum, item) => sum + item.points, list.officePoints));
  return {
    ok: true,
    value: {
      maxTotal: list.totalPoints,
      officePoints: list.officePoints,
      total,
      grade: gradeOf(total, list.totalPoints),
      needsReview: unreadable.length > 0 || items.some((item) => item.needsReview),
      summary: cutText(parsed.data.summary, TEXT_LIMITS.summary),
      strengths: cutList(parsed.data.strengths, MAX_LIST_ENTRIES, TEXT_LIMITS.listEntry),
      recommendations: cutList(parsed.data.recommendations, MAX_LIST_ENTRIES, TEXT_LIMITS.listEntry),
      unreadable,
      items,
    },
  };
}
```

- [ ] **Step 9: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  40 passed (40)`, `Tests  390 passed (390)`.

- [ ] **Step 10: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 11: Commit**

```bash
git add migrations shared server/app.test.ts
git commit -m "Add the grading, settings, and robot tables, and the checks of the robot's answers"
```

---

### Task 2: Start the evaluation now or at a set time

The teacher API gets Start evaluation (now, or at a time up to 60 days ahead) and Cancel schedule. Every teacher and student request first starts the evaluations whose time has come, and ends the tests that have nothing left to grade. Start now asks GitHub to start the robot when the settings for it exist.

**Files:**
- Create: `server/db/lifecycle.ts`, `server/dispatch.ts`
- Modify: `shared/tests.ts`, `shared/api.ts`, `server/env.ts`, `server/app.ts`, `server/http.ts`, `server/db/tests.ts`, `server/routes/admin.ts`, `server/routes/tests.ts`, `server/routes/upload.ts`, `server/test/testApi.ts`, `server/test/fixtures.ts`, `src/test/fakeApi.ts`
- Test: `server/dispatch.test.ts`, `server/routes/evaluation.test.ts` (new); `server/routes/testFiles.test.ts`, `server/routes/upload.test.ts` (modified)

**Interfaces:**
- Consumes: `requireTest`, the Plan 2 test routes, the fixtures `makeClass`, `makeTest`, `startTest`, `addSubmission`, `otherTeacherTest`.
- Produces:
  - `MAX_SCHEDULE_DAYS = 60` in `shared/tests.ts`.
  - In `shared/api.ts`: `evaluateTestBody` (`{ at?: string }`, an ISO datetime), `RobotStart = 'dispatched' | 'next_check'`, `EvaluationStart { status, evaluationAt, robot: RobotStart | null }`; `TestSummary` gains `evaluationAt` and `evaluationStartedAt`.
  - `Env` gains `GITHUB_REPO?` and `GITHUB_DISPATCH_TOKEN?`; `AppOptions { dispatchRobot?: (env) => Promise<boolean> }` in `server/env.ts`; `createApp(options?)`, `adminRoutes(options?)`, `testRoutes(options?)`.
  - `dispatchRobot(env, fetchImpl?)` and `robotStarter(options): (env) => Promise<RobotStart>` in `server/dispatch.ts`.
  - In `server/db/lifecycle.ts`: `finishTests(db, now)` (a statement), `promoteDueTests(db, now)`, `startEvaluationNow(db, teacherId, testId, now): Promise<'evaluating' | 'done' | null>`, `scheduleEvaluation(db, teacherId, testId, at, now)`, `cancelSchedule(db, teacherId, testId, now)`, `hasUploadedFiles(db, testId)`.
  - `promoteDue` middleware in `server/http.ts`, on the `/api/admin` and `/api/u` routers.
  - `POST /api/admin/tests/:code/evaluate` `{ at? }` → `EvaluationStart`; errors 409 `not_started`, `already_evaluating`, `missing_test_file`, `missing_barem`, `no_uploads`, `busy`, 400 `invalid`. `DELETE /api/admin/tests/:code/schedule` → `{ status: 'open', evaluationAt: null }`; 409 `not_scheduled`.
  - Test helpers: `startTestApi({ env?, app? })`; the fixture `addTestFiles(api, code, kinds?)`.

- [ ] **Step 1: Create `server/dispatch.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { dispatchRobot } from './dispatch.ts';
import type { Env } from './env.ts';

const ENV = { GITHUB_REPO: 'parameciul/quickeval', GITHUB_DISPATCH_TOKEN: 'secret-token' } as Env;

describe('dispatchRobot', () => {
  it('sends the evaluate-now event to the repository', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await dispatchRobot(ENV, fetchImpl)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/parameciul/quickeval/dispatches');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"event_type":"evaluate-now"}');
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer secret-token');
    expect(headers.get('User-Agent')).toBe('QuickEval');
  });

  it('does nothing without the settings or with a wrong repository name', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await dispatchRobot({} as Env, fetchImpl)).toBe(false);
    expect(await dispatchRobot({ ...ENV, GITHUB_DISPATCH_TOKEN: ' ' }, fetchImpl)).toBe(false);
    expect(await dispatchRobot({ ...ENV, GITHUB_REPO: 'https://github.com/x/y' }, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('answers false when GitHub refuses or does not answer', async () => {
    expect(await dispatchRobot(ENV, async () => new Response('{}', { status: 401 }))).toBe(false);
    expect(
      await dispatchRobot(ENV, async () => {
        throw new TypeError('network down');
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Create `server/routes/evaluation.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addSubmission, addTestFiles, makeClass, makeTest, otherTeacherTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let token: string;
let classId: number;
let studentIds: number[];

const PAST = '2026-10-06T08:00:00.000Z';

const testRow = () =>
  api.db
    .prepare('SELECT status, evaluation_at, evaluation_started_at, analysis_status, analysis_attempts FROM tests WHERE code = ?')
    .bind(code)
    .first<{ status: string; evaluation_at: string | null; evaluation_started_at: string | null; analysis_status: string; analysis_attempts: number }>();
const uploadRow = (id: number) =>
  api.db
    .prepare('SELECT status, auto_submitted, submitted_at FROM submissions WHERE id = ?')
    .bind(id)
    .first<{ status: string; auto_submitted: number; submitted_at: string | null }>();
const setTest = (sql: string, ...params: unknown[]) =>
  api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const evaluate = (body: object = {}) => api.request('POST', `/api/admin/tests/${code}/evaluate`, body);

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => false);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Maria', 'Avram Dan']);
  classId = cls.id;
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  token = await startTest(api, code);
});

afterEach(async () => {
  vi.useRealTimers();
  await api.dispose();
});

describe('POST /api/admin/tests/:code/evaluate (now)', () => {
  it('closes the uploads, sends the uploads that have files, and starts the robot', async () => {
    await addTestFiles(api, code);
    const sent = await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 2 });
    const withFiles = await addSubmission(api, code, studentIds[1]!, { files: 1 });
    const empty = await addSubmission(api, code, studentIds[2]!);
    dispatchRobot.mockResolvedValueOnce(true);

    const res = await evaluate();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'evaluating', evaluationAt: null, robot: 'dispatched' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);

    const row = await testRow();
    expect(row).toMatchObject({ status: 'evaluating', evaluation_at: null });
    expect(Date.parse(row!.evaluation_started_at!)).not.toBeNaN();
    expect(await uploadRow(sent)).toMatchObject({ status: 'submitted', auto_submitted: 0 });
    expect(await uploadRow(withFiles)).toEqual({ status: 'submitted', auto_submitted: 1, submitted_at: row!.evaluation_started_at });
    expect(await uploadRow(empty)).toMatchObject({ status: 'uploading', auto_submitted: 0, submitted_at: null });

    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test).toMatchObject({ status: 'evaluating', evaluationAt: null, evaluationStartedAt: row!.evaluation_started_at });
  });

  it('says when the robot starts only at its next check', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { files: 1 });
    const res = await evaluate();
    expect(res.body).toEqual({ status: 'evaluating', evaluationAt: null, robot: 'next_check' });
  });

  it('starts now when the chosen time has passed', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { files: 1 });
    const res = await evaluate({ at: PAST });
    expect(res.body.status).toBe('evaluating');
    expect((await testRow())?.evaluation_at).toBeNull();
  });

  it('ends at once a test with nothing new to grade', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    const res = await evaluate();
    expect(res.body).toEqual({ status: 'done', evaluationAt: null, robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();
    expect((await testRow())?.status).toBe('done');
  });

  it('asks again for a class analysis that was ready', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { files: 1 });
    await setTest("analysis_status = 'ready', analysis_attempts = 2");
    await evaluate();
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested', analysis_attempts: 0 });
  });

  it.each([
    ['the test file', ['barem'] as const, 'Încarcă testul înainte de evaluare.'],
    ['the barem', ['test'] as const, 'Încarcă baremul înainte de evaluare.'],
  ])('refuses without %s and changes nothing', async (_name, kinds, message) => {
    await addTestFiles(api, code, [...kinds]);
    const upload = await addSubmission(api, code, studentIds[0]!, { files: 1 });
    const res = await evaluate();
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(message);
    expect((await testRow())?.status).toBe('open');
    expect((await uploadRow(upload))?.status).toBe('uploading');
  });

  it('refuses while no student uploaded a file', async () => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!);
    const res = await evaluate();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'no_uploads', message: 'Niciun elev nu a încărcat încă fișiere.' });
  });

  it('refuses a draft and a test that is already being graded', async () => {
    const draft = await makeTest(api, classId);
    const res = await api.request('POST', `/api/admin/tests/${draft}/evaluate`, {});
    expect(res.body).toEqual({ error: 'not_started', message: 'Testul nu a început încă.' });
    await setTest("status = 'evaluating'");
    expect((await evaluate()).body).toEqual({ error: 'already_evaluating', message: 'Evaluarea a pornit deja.' });
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/evaluate`, {})).status).toBe(404);
  });
});

describe('POST /api/admin/tests/:code/evaluate (scheduled)', () => {
  it('schedules a later time and keeps the uploads open', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T07:00:00.000Z'));
    await addTestFiles(api, code);
    const res = await evaluate({ at: '2026-10-07T08:30:00Z' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'open', evaluationAt: '2026-10-07T08:30:00.000Z', robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test).toMatchObject({ status: 'open', evaluationAt: '2026-10-07T08:30:00.000Z' });
  });

  it('schedules before any student uploaded', async () => {
    await addTestFiles(api, code);
    const res = await evaluate({ at: new Date(Date.now() + 3_600_000).toISOString() });
    expect(res.body.status).toBe('open');
  });

  it('refuses a time more than 60 days ahead, and a time that is not one', async () => {
    await addTestFiles(api, code);
    const far = await evaluate({ at: new Date(Date.now() + 61 * 86_400_000).toISOString() });
    expect(far.status).toBe(400);
    expect(far.body.message).toBe('Alege o oră din următoarele 60 de zile.');
    const wrong = await evaluate({ at: 'mâine' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toBe('Ora aleasă nu este validă.');
  });

  it('refuses a schedule without the barem', async () => {
    await addTestFiles(api, code, ['test']);
    const res = await evaluate({ at: new Date(Date.now() + 3_600_000).toISOString() });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Încarcă baremul înainte de evaluare.');
    expect((await testRow())?.evaluation_at).toBeNull();
  });
});

describe('DELETE /api/admin/tests/:code/schedule', () => {
  it('cancels the schedule', async () => {
    await addTestFiles(api, code);
    await evaluate({ at: new Date(Date.now() + 3_600_000).toISOString() });
    const res = await api.request('DELETE', `/api/admin/tests/${code}/schedule`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'open', evaluationAt: null });
    expect((await testRow())?.evaluation_at).toBeNull();
  });

  it('refuses when nothing is scheduled', async () => {
    const res = await api.request('DELETE', `/api/admin/tests/${code}/schedule`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Evaluarea nu este programată.');
  });

  it('answers 404 for a test of another teacher', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare('UPDATE tests SET evaluation_at = ? WHERE code = ?').bind('2026-12-01T08:00:00.000Z', foreign.code).run();
    expect((await api.request('DELETE', `/api/admin/tests/${foreign.code}/schedule`)).status).toBe(404);
  });
});

describe('a scheduled evaluation', () => {
  it('starts exactly at its time, also for a time sent without milliseconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T07:00:00.000Z'));
    await addTestFiles(api, code);
    const upload = await addSubmission(api, code, studentIds[0]!, { files: 1 });
    await evaluate({ at: '2026-10-07T08:30:00Z' });

    vi.setSystemTime(new Date('2026-10-07T08:29:59.999Z'));
    expect((await api.request('GET', `/api/admin/tests/${code}`)).body.test.status).toBe('open');
    vi.setSystemTime(new Date('2026-10-07T08:30:00.000Z'));
    expect((await api.request('GET', `/api/admin/tests/${code}`)).body.test).toMatchObject({
      status: 'evaluating',
      evaluationAt: null,
      evaluationStartedAt: '2026-10-07T08:30:00.000Z',
    });
    expect(await uploadRow(upload)).toEqual({ status: 'submitted', auto_submitted: 1, submitted_at: '2026-10-07T08:30:00.000Z' });
  });

  it.each([
    ['the tests list', () => api.request('GET', '/api/admin/tests?year=2026')],
    ['the class page', () => api.request('GET', `/api/admin/classes/${classId}`)],
    ['the student page', () => api.request('GET', `/api/u/${token}`)],
  ])('has started when %s is read', async (_name, read) => {
    await addTestFiles(api, code);
    await addSubmission(api, code, studentIds[0]!, { files: 1 });
    await setTest('evaluation_at = ?', PAST);
    await read();
    expect(await testRow()).toMatchObject({ status: 'evaluating', evaluation_at: null, evaluation_started_at: PAST });
  });

  it('closes the uploads before a student write', async () => {
    await addTestFiles(api, code);
    await setTest('evaluation_at = ?', PAST);
    const res = await api.request('POST', `/api/u/${token}/sessions`, { studentId: studentIds[0] });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'closed', message: 'Încărcarea s-a închis.' });
  });

  it('closes a test with no uploads and ends it, since nothing waits for grading', async () => {
    await addTestFiles(api, code);
    await setTest('evaluation_at = ?', PAST);
    await api.request('GET', `/api/admin/tests/${code}`);
    expect((await testRow())?.status).toBe('done');
  });
});

describe('the end of an evaluation', () => {
  it('comes when no upload waits for grading and no class analysis waits', async () => {
    const graded = await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    await addSubmission(api, code, studentIds[1]!, { status: 'failed', files: 1 });
    await setTest("status = 'evaluating'");
    await api.db.prepare("UPDATE submissions SET status = 'grading' WHERE id = ?").bind(graded).run();
    await api.request('GET', '/api/admin/tests?year=2026');
    expect((await testRow())?.status).toBe('evaluating');

    await api.db.prepare("UPDATE submissions SET status = 'graded' WHERE id = ?").bind(graded).run();
    await setTest("analysis_status = 'requested'");
    await api.request('GET', '/api/admin/tests?year=2026');
    expect((await testRow())?.status).toBe('evaluating');

    await setTest("analysis_status = 'ready'");
    await api.request('GET', '/api/admin/tests?year=2026');
    expect((await testRow())?.status).toBe('done');
  });
});
```

- [ ] **Step 3: Edit `server/routes/testFiles.test.ts`**

Find this block:

```ts
import { DOCX_TYPE, PDF_TYPE } from '../../shared/files.ts';
import { makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

Replace it with:

```ts
import { DOCX_TYPE, PDF_TYPE } from '../../shared/files.ts';
import { addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

- [ ] **Step 4: Edit `server/routes/testFiles.test.ts`**

Find this block:

```ts
let code: string;

```

Replace it with:

```ts
let code: string;
let studentId: number;

```

- [ ] **Step 5: Edit `server/routes/testFiles.test.ts`**

Find this block:

```ts
  api = await startTestApi();
  const cls = await makeClass(api, '6E2');
  code = await makeTest(api, cls.id);
```

Replace it with:

```ts
  api = await startTestApi();
  const cls = await makeClass(api, '6E2', ['Pop Ion']);
  studentId = cls.studentIds[0]!;
  code = await makeTest(api, cls.id);
```

- [ ] **Step 6: Edit `server/routes/testFiles.test.ts`**

Find this block:

```ts
  it('refuses a new file while the test is being graded', async () => {
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(code).run();
```

Replace it with:

```ts
  it('refuses a new file while the test is being graded', async () => {
    // An upload waits for grading, so the test stays in evaluation.
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(code).run();
```

- [ ] **Step 7: Edit `server/routes/upload.test.ts`**

Find this block:

```ts
  it('shows no names once the uploads are closed', async () => {
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(code).run();
    const res = await api.request('GET', `/api/u/${token}`);
    expect(res.body).toEqual({ test: { code, title: 'Fracții', className: '6E2', status: 'evaluating' }, students: [] });
  });
```

Replace it with:

```ts
  it('shows no names once the uploads are closed', async () => {
    await api.db.prepare("UPDATE tests SET status = 'done' WHERE code = ?").bind(code).run();
    const res = await api.request('GET', `/api/u/${token}`);
    expect(res.body).toEqual({ test: { code, title: 'Fracții', className: '6E2', status: 'done' }, students: [] });
  });
```

- [ ] **Step 8: Edit `server/test/testApi.ts`**

Find this block:

```ts
import { createApp } from '../app.ts';
import type { Env } from '../env.ts';

```

Replace it with:

```ts
import { createApp } from '../app.ts';
import type { AppOptions, Env } from '../env.ts';

```

- [ ] **Step 9: Edit `server/test/testApi.ts`**

Find this block:

```ts

export async function startTestApi(options: { env?: Partial<Env> } = {}): Promise<TestApi> {
  const platform = await getPlatformProxy<Pick<Env, 'DB' | 'FILES'>>({
```

Replace it with:

```ts

export async function startTestApi(options: { env?: Partial<Env>; app?: AppOptions } = {}): Promise<TestApi> {
  const platform = await getPlatformProxy<Pick<Env, 'DB' | 'FILES'>>({
```

- [ ] **Step 10: Edit `server/test/testApi.ts`**

Find this block:

```ts
  const env: Env = { DB: db, FILES: platform.env.FILES, DEV_TEACHER_EMAIL: TEACHER_EMAIL, ...options.env };
  const app = createApp();
  const send = (path: string, init: RequestInit = {}) => Promise.resolve(app.request(`http://localhost${path}`, init, env));
```

Replace it with:

```ts
  const env: Env = { DB: db, FILES: platform.env.FILES, DEV_TEACHER_EMAIL: TEACHER_EMAIL, ...options.env };
  const app = createApp(options.app);
  const send = (path: string, init: RequestInit = {}) => Promise.resolve(app.request(`http://localhost${path}`, init, env));
```

- [ ] **Step 11: Edit `server/test/fixtures.ts`**

Find this block:

```ts

// Start test through the teacher API; returns the upload token of the link.
```

Replace it with:

```ts

// Marks the test file and the barem as uploaded (rows only; nothing in R2).
export async function addTestFiles(api: TestApi, code: string, kinds: ('test' | 'barem')[] = ['test', 'barem']): Promise<void> {
  for (const kind of kinds) {
    await api.db
      .prepare(`UPDATE tests SET ${kind}_file_key = ?, ${kind}_file_name = ?, ${kind}_file_type = 'application/pdf' WHERE code = ?`)
      .bind(`fixture/${code}/${kind}.pdf`, `${kind}.pdf`, code)
      .run();
  }
}

// Start test through the teacher API; returns the upload token of the link.
```

- [ ] **Step 12: Run the tests to see them fail**

Run: `npx vitest run server/dispatch.test.ts server/routes/evaluation.test.ts server/routes/testFiles.test.ts server/routes/upload.test.ts`
Expected: FAIL. `Test Files  2 failed | 2 passed (4)`, `Tests  22 failed | 38 passed (60)`. `server/dispatch.test.ts` fails with `Cannot find module './dispatch.ts'`. In `server/routes/evaluation.test.ts` 22 tests fail: the routes do not exist yet (`expected 404 to be 200`), and nothing starts a due test. Its two "another teacher" tests pass already, because a missing route also answers 404. `testFiles.test.ts` and `upload.test.ts` pass.

- [ ] **Step 13: Edit `shared/tests.ts`**

Find this block:

```ts
export const MAX_TITLE_LENGTH = 120;

```

Replace it with:

```ts
export const MAX_TITLE_LENGTH = 120;

// An evaluation can be scheduled at most this many days ahead.
export const MAX_SCHEDULE_DAYS = 60;

```

- [ ] **Step 14: Edit `shared/api.ts`**

Find this block:

```ts

// The student app: start or resume an upload for one student of the class.
```

Replace it with:

```ts

// Start evaluation: now (no `at`, or a time that has passed) or at a later time.
export const evaluateTestBody = z.object({
  at: z.iso.datetime({ message: 'Ora aleasă nu este validă.' }).optional(),
});

// The student app: start or resume an upload for one student of the class.
```

- [ ] **Step 15: Edit `shared/api.ts`**

Find this block:

```ts
  startedAt: string | null;
  // Active students of the class, and uploads that were sent (confirmed or included).
```

Replace it with:

```ts
  startedAt: string | null;
  // While open: when the evaluation starts by itself. Null when not scheduled.
  evaluationAt: string | null;
  // When the uploads closed and the evaluation started.
  evaluationStartedAt: string | null;
  // Active students of the class, and uploads that were sent (confirmed or included).
```

- [ ] **Step 16: Edit `shared/api.ts`**

Find this block:

```ts
  startedAt: string;
}
```

Replace it with:

```ts
  startedAt: string;
}

// "dispatched": the robot was asked to start at once. "next_check": it starts
// at its next regular check.
export type RobotStart = 'dispatched' | 'next_check';

// Start evaluation: `robot` is null when the evaluation was only scheduled.
export interface EvaluationStart {
  status: TestStatus;
  evaluationAt: string | null;
  robot: RobotStart | null;
}
```

- [ ] **Step 17: Edit `server/env.ts`**

Find this block:

```ts
  DEV_TEACHER_EMAIL?: string;
}
```

Replace it with:

```ts
  DEV_TEACHER_EMAIL?: string;
  // "Evaluate now" (spec §12.6): the repository as owner/name, and a GitHub
  // token that may send it a repository_dispatch event.
  GITHUB_REPO?: string;
  GITHUB_DISPATCH_TOKEN?: string;
}

// Parts of the app that tests replace.
export interface AppOptions {
  // Asks the robot to start at once; true when the request was taken.
  dispatchRobot?: (env: Env) => Promise<boolean>;
}
```

- [ ] **Step 18: Create `server/dispatch.ts`**

```ts
import type { RobotStart } from '../shared/api.ts';
import type { AppOptions, Env } from './env.ts';

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// "Evaluate now" (spec §12.6): asks GitHub to start the robot at once with a
// repository_dispatch event. True when GitHub took the request. Without the
// settings, or when GitHub does not answer in 5 seconds, the robot starts at
// its next regular check. Never throws.
export async function dispatchRobot(env: Env, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const repo = env.GITHUB_REPO?.trim() ?? '';
  const token = env.GITHUB_DISPATCH_TOKEN?.trim() ?? '';
  if (!REPO.test(repo) || token === '') return false;
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // GitHub refuses requests without a User-Agent.
        'User-Agent': 'QuickEval',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ event_type: 'evaluate-now' }),
      signal: AbortSignal.timeout(5000),
    });
    return res.status === 204;
  } catch {
    return false;
  }
}

// What the teacher is told when grading (re)starts: the robot was asked to
// start at once, or it starts at its next regular check.
export function robotStarter(options: AppOptions): (env: Env) => Promise<RobotStart> {
  const dispatch = options.dispatchRobot ?? ((env: Env) => dispatchRobot(env));
  return async (env) => ((await dispatch(env)) ? 'dispatched' : 'next_check');
}
```

- [ ] **Step 19: Create `server/db/lifecycle.ts`**

```ts
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

// The test lifecycle after Start test (spec §8.3-§8.5). Each write checks its
// own rules in its SQL, so two requests at once cannot both pass a check.

// Entering an evaluation asks for a new class analysis when the old one is
// ready or failed (spec §8.5).
const ASK_FOR_ANALYSIS = `
  analysis_status = CASE WHEN analysis_status IN ('ready', 'failed') THEN 'requested' ELSE analysis_status END,
  analysis_attempts = CASE WHEN analysis_status IN ('ready', 'failed') THEN 0 ELSE analysis_attempts END`;

const HAS_FILES = 'EXISTS (SELECT 1 FROM submission_files f WHERE f.submission_id = submissions.id)';

// evaluating → done: no upload waits for grading or is being graded, and no
// class analysis is waiting (spec §8.5). Returns the ids of the finished tests.
export function finishTests(db: D1Database, now: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE tests SET status = 'done', updated_at = ?
       WHERE status = 'evaluating' AND analysis_status <> 'requested'
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.status IN ('submitted', 'grading'))
       RETURNING id`,
    )
    .bind(now);
}

// An open test whose scheduled evaluation time has come.
const DUE = "t.status = 'open' AND t.evaluation_at IS NOT NULL AND t.evaluation_at <= ?";

// Starts the evaluation of every test whose scheduled time has come, so a
// scheduled test closes on time even when the robot is late (spec §8.3). For
// those tests the uploads closed at the scheduled time: uploads with files
// are sent as they are ("Fără confirmare"); uploads without files stay. Also
// finishes the tests that have nothing left to grade.
export async function promoteDueTests(db: D1Database, now: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE submissions
         SET status = 'submitted', auto_submitted = 1,
           submitted_at = (SELECT t.evaluation_at FROM tests t WHERE t.id = submissions.test_id)
         WHERE status = 'uploading' AND ${HAS_FILES}
           AND test_id IN (SELECT t.id FROM tests t WHERE ${DUE})`,
      )
      .bind(now),
    db
      .prepare(
        `UPDATE tests
         SET status = 'evaluating', evaluation_started_at = evaluation_at, evaluation_at = NULL, updated_at = ?, ${ASK_FOR_ANALYSIS}
         WHERE id IN (SELECT t.id FROM tests t WHERE ${DUE})`,
      )
      .bind(now, now),
    finishTests(db, now),
  ]);
}

// An open test of this teacher with the test file, the barem, and at least one
// uploaded file (spec §8.4).
const READY = `t.id = ? AND t.teacher_id = ? AND t.status = 'open'
  AND t.test_file_key IS NOT NULL AND t.barem_file_key IS NOT NULL
  AND EXISTS (SELECT 1 FROM submissions s JOIN submission_files f ON f.submission_id = s.id WHERE s.test_id = t.id)`;

// open → evaluating now. Null when the test is not ready; "done" when it has
// nothing to grade (every upload was graded before).
export async function startEvaluationNow(
  db: D1Database,
  teacherId: number,
  testId: number,
  now: string,
): Promise<'evaluating' | 'done' | null> {
  const [, started, finished] = await db.batch<{ id: number }>([
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', auto_submitted = 1, submitted_at = ?
         WHERE status = 'uploading' AND ${HAS_FILES}
           AND test_id IN (SELECT t.id FROM tests t WHERE ${READY})`,
      )
      .bind(now, testId, teacherId),
    db
      .prepare(
        `UPDATE tests
         SET status = 'evaluating', evaluation_started_at = ?, evaluation_at = NULL, updated_at = ?, ${ASK_FOR_ANALYSIS}
         WHERE id IN (SELECT t.id FROM tests t WHERE ${READY})
         RETURNING id`,
      )
      .bind(now, now, testId, teacherId),
    finishTests(db, now),
  ]);
  if (!started?.results.length) return null;
  return finished?.results.some((row) => row.id === testId) ? 'done' : 'evaluating';
}

// Schedules the evaluation of an open test that has the test file and the
// barem. The uploads may still come. False when the test is not ready.
export async function scheduleEvaluation(db: D1Database, teacherId: number, testId: number, at: string, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET evaluation_at = ?, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status = 'open' AND test_file_key IS NOT NULL AND barem_file_key IS NOT NULL
       RETURNING id`,
    )
    .bind(at, now, testId, teacherId)
    .first<{ id: number }>();
  return row !== null;
}

// False when the test had no schedule, or its evaluation already started.
export async function cancelSchedule(db: D1Database, teacherId: number, testId: number, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET evaluation_at = NULL, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status = 'open' AND evaluation_at IS NOT NULL
       RETURNING id`,
    )
    .bind(now, testId, teacherId)
    .first<{ id: number }>();
  return row !== null;
}

// Whether any student of the test uploaded a file.
export async function hasUploadedFiles(db: D1Database, testId: number): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS found FROM submissions s JOIN submission_files f ON f.submission_id = s.id WHERE s.test_id = ? LIMIT 1')
    .bind(testId)
    .first<{ found: number }>();
  return row !== null;
}
```

- [ ] **Step 20: Edit `server/http.ts`**

Find this block:

```ts
import { normalizeTestCode } from '../shared/tests.ts';
import { ApiError, notFound } from './errors.ts';
```

Replace it with:

```ts
import { normalizeTestCode } from '../shared/tests.ts';
import { promoteDueTests } from './db/lifecycle.ts';
import type { AppEnv } from './env.ts';
import { ApiError, notFound } from './errors.ts';
```

- [ ] **Step 21: Edit `server/http.ts`**

Find this block:

```ts
  return new Date().toISOString();
}
```

Replace it with:

```ts
  return new Date().toISOString();
}

// Teacher and student requests first start the evaluations whose scheduled
// time has come, so every page shows a scheduled test closed on time (spec §8.3).
export const promoteDue: MiddlewareHandler<AppEnv> = async (c, next) => {
  await promoteDueTests(c.env.DB, nowIso());
  await next();
};
```

- [ ] **Step 22: Edit `server/db/tests.ts`**

Find this block:

```ts
  started_at: string | null;
  upload_token: string | null;
```

Replace it with:

```ts
  started_at: string | null;
  evaluation_at: string | null;
  evaluation_started_at: string | null;
  upload_token: string | null;
```

- [ ] **Step 23: Edit `server/db/tests.ts`**

Find this block:

```ts
  SELECT t.id, t.code, t.title, t.status, t.class_id, c.name AS class_name, c.school_year,
    t.created_at, t.started_at, t.upload_token,
    t.test_file_key, t.test_file_name, t.test_file_type,
```

Replace it with:

```ts
  SELECT t.id, t.code, t.title, t.status, t.class_id, c.name AS class_name, c.school_year,
    t.created_at, t.started_at, t.evaluation_at, t.evaluation_started_at, t.upload_token,
    t.test_file_key, t.test_file_name, t.test_file_type,
```

- [ ] **Step 24: Edit `server/db/tests.ts`**

Find this block:

```ts
      startedAt: row.started_at,
      studentCount: row.student_count,
```

Replace it with:

```ts
      startedAt: row.started_at,
      evaluationAt: row.evaluation_at,
      evaluationStartedAt: row.evaluation_started_at,
      studentCount: row.student_count,
```

- [ ] **Step 25: Replace `server/routes/tests.ts`**

```ts
import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { createTestBody, evaluateTestBody, renameTestBody, type EvaluationStart } from '../../shared/api.ts';
import { isTestFileKind, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE, testFileKey, type TestFileKind } from '../../shared/files.ts';
import { MAX_SCHEDULE_DAYS } from '../../shared/tests.ts';
import { cancelSchedule, hasUploadedFiles, scheduleEvaluation, startEvaluationNow } from '../db/lifecycle.ts';
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
import { robotStarter } from '../dispatch.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseSchoolYear, parseTestCode, readJson } from '../http.ts';
import { newUploadToken } from '../secrets.ts';
import { deleteFilesQuietly, fileResponse, readUpload } from '../uploads.ts';

function parseFileKind(raw: string | undefined): TestFileKind {
  if (raw === undefined || !isTestFileKind(raw)) throw notFound();
  return raw;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Why an evaluation could not start or be scheduled. Read after the write
// changed nothing, so it describes the test as it is now.
async function evaluationBlocker(db: D1Database, teacherId: number, code: string, needsUploads: boolean): Promise<ApiError> {
  const test = await requireTest(db, teacherId, code);
  if (test.summary.status === 'draft') return new ApiError(409, 'not_started', 'Testul nu a început încă.');
  if (test.summary.status !== 'open') return new ApiError(409, 'already_evaluating', 'Evaluarea a pornit deja.');
  if (!test.files.test) return new ApiError(409, 'missing_test_file', 'Încarcă testul înainte de evaluare.');
  if (!test.files.barem) return new ApiError(409, 'missing_barem', 'Încarcă baremul înainte de evaluare.');
  if (needsUploads && !(await hasUploadedFiles(db, test.id))) {
    return new ApiError(409, 'no_uploads', 'Niciun elev nu a încărcat încă fișiere.');
  }
  return new ApiError(409, 'busy', 'Testul s-a schimbat între timp. Încearcă din nou.');
}

// /api/admin/tests
export function testRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const startRobot = robotStarter(options);

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

  // Start evaluation (spec §8.4): now, or at a later time. Now: the uploads
  // close and the robot is asked to start at once.
  routes.post('/:code/evaluate', async (c) => {
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    const body = await readJson(c, evaluateTestBody);
    const now = nowIso();
    // Stored the way nowIso() writes times, so the times compare as text.
    const at = body.at === undefined ? null : new Date(body.at).toISOString();
    if (at !== null && at > now) {
      if (Date.parse(at) - Date.parse(now) > MAX_SCHEDULE_DAYS * DAY_MS) {
        throw new ApiError(400, 'invalid', `Alege o oră din următoarele ${MAX_SCHEDULE_DAYS} de zile.`);
      }
      if (!(await scheduleEvaluation(c.env.DB, teacherId, test.id, at, now))) {
        throw await evaluationBlocker(c.env.DB, teacherId, test.summary.code, false);
      }
      return c.json({ status: 'open', evaluationAt: at, robot: null } satisfies EvaluationStart);
    }
    const status = await startEvaluationNow(c.env.DB, teacherId, test.id, now);
    if (status === null) throw await evaluationBlocker(c.env.DB, teacherId, test.summary.code, true);
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ status, evaluationAt: null, robot } satisfies EvaluationStart);
  });

  routes.delete('/:code/schedule', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (!(await cancelSchedule(c.env.DB, c.var.teacher.id, test.id, nowIso()))) {
      throw new ApiError(409, 'not_scheduled', 'Evaluarea nu este programată.');
    }
    return c.json({ status: 'open', evaluationAt: null });
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

- [ ] **Step 26: Replace `server/routes/admin.ts`**

```ts
import { Hono } from 'hono';
import { teacherAuth } from '../auth/teacherAuth.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { promoteDue, sameOriginWrites } from '../http.ts';
import { classRoutes } from './classes.ts';
import { studentRoutes } from './students.ts';
import { submissionRoutes } from './submissions.ts';
import { testRoutes } from './tests.ts';

// /api/admin: everything the teacher app calls. Every route needs a teacher login.
export function adminRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites, teacherAuth(), promoteDue);
  routes.get('/me', (c) => c.json({ teacher: c.var.teacher }));
  routes.route('/classes', classRoutes());
  routes.route('/students', studentRoutes());
  routes.route('/tests', testRoutes(options));
  routes.route('/submissions', submissionRoutes());
  return routes;
}
```

- [ ] **Step 27: Edit `server/routes/upload.ts`**

Find this block:

```ts
import { ApiError, isUniqueViolation } from '../errors.ts';
import { nowIso, parseId, readJson, sameOriginWrites } from '../http.ts';
import { newDeviceSecret, randomBase32, sha256Hex } from '../secrets.ts';
```

Replace it with:

```ts
import { ApiError, isUniqueViolation } from '../errors.ts';
import { nowIso, parseId, promoteDue, readJson, sameOriginWrites } from '../http.ts';
import { newDeviceSecret, randomBase32, sha256Hex } from '../secrets.ts';
```

- [ ] **Step 28: Edit `server/routes/upload.ts`**

Find this block:

```ts
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites);

```

Replace it with:

```ts
  const routes = new Hono<AppEnv>();
  routes.use('*', sameOriginWrites, promoteDue);

```

- [ ] **Step 29: Replace `server/app.ts`**

```ts
import { Hono } from 'hono';
import type { AppEnv, AppOptions } from './env.ts';
import { ApiError } from './errors.ts';
import { adminRoutes } from './routes/admin.ts';
import { uploadRoutes } from './routes/upload.ts';

// The whole API. functions/api/[[route]].ts serves it on Cloudflare Pages.
export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>().basePath('/api');

  // public/_headers does not reach Function responses, so the API sets its own:
  // browsers must not guess content types, and nothing private is cached.
  // A route that sets its own Cache-Control keeps it.
  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
  });

  app.route('/admin', adminRoutes(options));
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

- [ ] **Step 30: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      startedAt: null,
      studentCount: uploads.filter((row) => row.active).length,
```

Replace it with:

```ts
      startedAt: null,
      evaluationAt: null,
      evaluationStartedAt: null,
      studentCount: uploads.filter((row) => row.active).length,
```

- [ ] **Step 31: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  42 passed (42)`, `Tests  417 passed (417)`.

- [ ] **Step 32: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 33: Commit**

```bash
git add shared server src/test/fakeApi.ts
git commit -m "Start the evaluation now or at a set time, and close scheduled tests on time"
```

---

### Task 3: Answers to the robot's problems, and grades in the uploads table

The robot can report an exercise list whose points do not add up, an exercise list it could not make, and an upload it could not grade. The teacher API gets the answers: accept the list, let the robot try the list again, and grade a failed upload again. A broken barem may be replaced during grading. The test detail shows the exercise-list status, and the uploads table the grade, the items to check, and the grading error.

**Files:**
- Modify: `shared/tests.ts`, `shared/api.ts`, `server/db/lifecycle.ts`, `server/db/tests.ts`, `server/routes/tests.ts`, `server/routes/submissions.ts`, `server/routes/admin.ts`, `server/test/fixtures.ts`, `src/test/fakeApi.ts`
- Test: `server/routes/robotProblems.test.ts` (new); `server/routes/tests.test.ts`, `server/routes/testFiles.test.ts` (modified)

**Interfaces:**
- Consumes: `robotStarter` and `AppOptions` (Task 2); in `server/db/lifecycle.ts`, its private SQL fragment `ASK_FOR_ANALYSIS` (Task 2).
- Produces:
  - `ExerciseListStatus` in `shared/tests.ts`; `ExerciseListInfo { status, message }` in `shared/api.ts`; `TestInfo.exerciseList`; `TestSummary.gradedCount`; `UploadRow` gains `grade: number | null`, `flagCount: number`, `lastError: string | null`.
  - `acceptExerciseList(db, teacherId, testId, now)`, `retryExerciseList(...)` and `retrySubmission(db, teacherId, submissionId, now)` (both return the test's status or null) in `server/db/lifecycle.ts`.
  - `POST /api/admin/tests/:code/exercise-list/accept` → `{ exerciseList }` (409 `no_problem`); `POST /api/admin/tests/:code/exercise-list/retry` → `{ exerciseList, robot }` (409 `not_failed`); `POST /api/admin/submissions/:id/retry` → `{ status: 'submitted', robot }` (409 `not_failed`). `submissionRoutes(options?)`.
  - The fixture `addEvaluation(api, submissionId, { grade?, items?, unreadable? })`.

- [ ] **Step 1: Create `server/routes/robotProblems.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The teacher's answers to what the robot reports: an exercise list with a
// problem or an error, and an upload whose grading failed.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let studentId: number;
let classmateId: number;

const setTest = (sql: string) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(code).run();
const testRow = () =>
  api.db
    .prepare('SELECT status, exercise_list_status, exercise_list_message, exercise_list_attempts, analysis_status FROM tests WHERE code = ?')
    .bind(code)
    .first();

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => false);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  studentId = cls.studentIds[0]!;
  classmateId = cls.studentIds[1]!;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/admin/tests/:code/exercise-list/accept', () => {
  it('accepts a list whose points do not add up and keeps the message', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'problem', exercise_list_message = 'Punctajele din barem dau 9, dar totalul este 10.'");
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/accept`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exerciseList: { status: 'accepted', message: 'Punctajele din barem dau 9, dar totalul este 10.' } });
    expect(await testRow()).toMatchObject({ exercise_list_status: 'accepted' });
  });

  it('refuses a list without a problem', async () => {
    await setTest("exercise_list_status = 'ready'");
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/accept`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Lista de exerciții nu are nicio problemă.');
  });

  it('answers 404 for a test of another teacher and keeps it', async () => {
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET exercise_list_status = 'problem' WHERE code = ?").bind(foreign.code).run();
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/exercise-list/accept`)).status).toBe(404);
    const row = await api.db.prepare('SELECT exercise_list_status FROM tests WHERE code = ?').bind(foreign.code).first();
    expect(row).toEqual({ exercise_list_status: 'problem' });
  });
});

describe('POST /api/admin/tests/:code/exercise-list/retry', () => {
  it('lets the robot make the list again and starts it', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'failed', exercise_list_message = 'Eroare', exercise_list_attempts = 3");
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    dispatchRobot.mockResolvedValueOnce(true);
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/retry`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exerciseList: { status: 'none', message: null }, robot: 'dispatched' });
    expect(await testRow()).toMatchObject({ exercise_list_status: 'none', exercise_list_message: null, exercise_list_attempts: 0 });
  });

  it('does not start the robot for a test whose uploads are open', async () => {
    await setTest("status = 'open', exercise_list_status = 'failed'");
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/retry`);
    expect(res.body.robot).toBeNull();
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('refuses a list that did not fail, and a test of another teacher', async () => {
    const res = await api.request('POST', `/api/admin/tests/${code}/exercise-list/retry`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Lista de exerciții nu a eșuat.');
    const foreign = await otherTeacherTest(api);
    await api.db.prepare("UPDATE tests SET exercise_list_status = 'failed' WHERE code = ?").bind(foreign.code).run();
    expect((await api.request('POST', `/api/admin/tests/${foreign.code}/exercise-list/retry`)).status).toBe(404);
  });
});

describe('POST /api/admin/submissions/:id/retry', () => {
  const uploadRow = (id: number) =>
    api.db.prepare('SELECT status, attempts, last_error, run_id FROM submissions WHERE id = ?').bind(id).first();

  async function failedUpload(): Promise<number> {
    const id = await addSubmission(api, code, studentId, { status: 'failed', files: 1 });
    await api.db.prepare("UPDATE submissions SET attempts = 3, last_error = 'Eroare', run_id = 'run-1' WHERE id = ?").bind(id).run();
    return id;
  }

  it('sends a failed upload back to grading and starts the robot', async () => {
    await setTest("status = 'evaluating'");
    const id = await failedUpload();
    await addSubmission(api, code, classmateId, { status: 'submitted', files: 1 });
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'submitted', robot: 'next_check' });
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(await uploadRow(id)).toEqual({ status: 'submitted', attempts: 0, last_error: null, run_id: null });
  });

  it('takes a finished test back to evaluation and asks again for its class analysis', async () => {
    await setTest("status = 'done', analysis_status = 'ready'");
    const id = await failedUpload();
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.body.status).toBe('submitted');
    expect(await testRow()).toMatchObject({ status: 'evaluating', analysis_status: 'requested' });
  });

  it('leaves an open test open and does not start the robot', async () => {
    await setTest("status = 'open'");
    const id = await failedUpload();
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.body).toEqual({ status: 'submitted', robot: null });
    expect(await testRow()).toMatchObject({ status: 'open' });
  });

  it('refuses an upload that did not fail', async () => {
    const id = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
    const res = await api.request('POST', `/api/admin/submissions/${id}/retry`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Corectarea acestei lucrări nu a eșuat.');
    expect(await uploadRow(id)).toMatchObject({ status: 'graded' });
  });

  it('answers 404 for an upload of another teacher and keeps it', async () => {
    const foreign = await otherTeacherTest(api);
    const id = await addSubmission(api, foreign.code, foreign.studentId, { status: 'failed', files: 1 });
    expect((await api.request('POST', `/api/admin/submissions/${id}/retry`)).status).toBe(404);
    expect(await uploadRow(id)).toMatchObject({ status: 'failed' });
  });
});
```

- [ ] **Step 2: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSubmission, makeClass, makeTest, otherTeacherTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

Replace it with:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';
```

- [ ] **Step 3: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
    expect(res.body.tests.map((t: { title: string }) => t.title)).toEqual(['Al doilea', 'Primul']);
    expect(res.body.tests[1]).toMatchObject({ code: '6E2-26T1', studentCount: 3, submittedCount: 1, startedAt: null });
  });
```

Replace it with:

```ts
    expect(res.body.tests.map((t: { title: string }) => t.title)).toEqual(['Al doilea', 'Primul']);
    expect(res.body.tests[1]).toMatchObject({ code: '6E2-26T1', studentCount: 3, submittedCount: 1, gradedCount: 0, startedAt: null });
  });
```

- [ ] **Step 4: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
    expect(res.status).toBe(200);
    expect(res.body.test).toMatchObject({ code, uploadToken: null, files: { test: null, barem: null }, studentCount: 2, submittedCount: 1 });
    expect(res.body.uploads).toEqual([
```

Replace it with:

```ts
    expect(res.status).toBe(200);
    expect(res.body.test).toMatchObject({
      code,
      uploadToken: null,
      files: { test: null, barem: null },
      exerciseList: { status: 'none', message: null },
      studentCount: 2,
      submittedCount: 1,
    });
    expect(res.body.uploads).toEqual([
```

- [ ] **Step 5: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
        autoSubmitted: false,
      },
```

Replace it with:

```ts
        autoSubmitted: false,
        grade: null,
        flagCount: 0,
        lastError: null,
      },
```

- [ ] **Step 6: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
        autoSubmitted: true,
      },
```

Replace it with:

```ts
        autoSubmitted: true,
        grade: null,
        flagCount: 0,
        lastError: null,
      },
```

- [ ] **Step 7: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
    ]);
  });
```

Replace it with:

```ts
    ]);
  });

  it('shows grades, the items to check, and grading errors', async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
    const [pop, ionescu, stan] = cls.studentIds as [number, number, number];
    const code = await makeTest(api, cls.id);
    const graded = await addSubmission(api, code, pop, { status: 'graded', files: 1 });
    await addEvaluation(api, graded, {
      grade: 8.75,
      items: [{ needsReview: true }, { needsReview: true, reviewed: true }, {}, { needsReview: true }],
      unreadable: ['page-02.jpg'],
    });
    const clean = await addSubmission(api, code, ionescu, { status: 'graded', files: 1 });
    await addEvaluation(api, clean, { grade: 10 });
    const failed = await addSubmission(api, code, stan, { status: 'failed', files: 1 });
    await api.db.prepare("UPDATE submissions SET last_error = 'Corectarea a durat prea mult.' WHERE id = ?").bind(failed).run();
    await api.db
      .prepare("UPDATE tests SET exercise_list_status = 'problem', exercise_list_message = 'Punctajele din barem dau 9, dar totalul este 10.' WHERE code = ?")
      .bind(code)
      .run();

    const res = await api.request('GET', `/api/admin/tests/${code}`);
    expect(res.body.test).toMatchObject({
      gradedCount: 2,
      exerciseList: { status: 'problem', message: 'Punctajele din barem dau 9, dar totalul este 10.' },
    });
    const byName = Object.fromEntries(res.body.uploads.map((row: { studentName: string }) => [row.studentName, row]));
    expect(byName['Pop Ion']).toMatchObject({ status: 'graded', grade: 8.75, flagCount: 3, lastError: null });
    expect(byName['Ionescu Ana']).toMatchObject({ status: 'graded', grade: 10, flagCount: 0 });
    expect(byName['Stan Eva']).toMatchObject({ status: 'failed', grade: null, flagCount: 0, lastError: 'Corectarea a durat prea mult.' });
  });
```

- [ ] **Step 8: Edit `server/routes/testFiles.test.ts`**

Find this block:

```ts

  it('refuses a new file while the test is being graded', async () => {
    // An upload waits for grading, so the test stays in evaluation.
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await api.db.prepare("UPDATE tests SET status = 'evaluating' WHERE code = ?").bind(code).run();
    const res = await putFile(code, 'test', pdf('x'), PDF_TYPE, 'test.pdf');
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('evaluating');
  });
```

Replace it with:

```ts

  it.each(['none', 'ready', 'accepted'])('refuses a new file while the robot works with an exercise list "%s"', async (list) => {
    // An upload waits for grading, so the test stays in evaluation.
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await api.db.prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = ? WHERE code = ?").bind(list, code).run();
    const res = await putFile(code, 'barem', pdf('x'), PDF_TYPE, 'barem.pdf');
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('evaluating');
  });

  it.each(['problem', 'failed'])('takes a new barem while the exercise list is "%s", and asks for a new list', async (list) => {
    await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
    await api.db
      .prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = ?, exercise_list_message = 'x', exercise_list_attempts = 3 WHERE code = ?")
      .bind(list, code)
      .run();
    const res = await putFile(code, 'barem', pdf('nou'), PDF_TYPE, 'barem.pdf');
    expect(res.status).toBe(200);
    const row = await api.db
      .prepare('SELECT status, exercise_list_status, exercise_list_message, exercise_list_attempts FROM tests WHERE code = ?')
      .bind(code)
      .first();
    expect(row).toEqual({ status: 'evaluating', exercise_list_status: 'none', exercise_list_message: null, exercise_list_attempts: 0 });
  });
```

- [ ] **Step 9: Edit `server/test/fixtures.ts`**

Find this block:

```ts

// Marks the test file and the barem as uploaded (rows only; nothing in R2).
```

Replace it with:

```ts

// A grading of an upload, straight in the database: one item per entry of
// `items`, flagged when `needsReview`, checked by the teacher when `reviewed`.
export async function addEvaluation(
  api: TestApi,
  submissionId: number,
  options: { grade?: number; items?: { needsReview?: boolean; reviewed?: boolean }[]; unreadable?: string[] } = {},
): Promise<number> {
  const items = options.items ?? [{}];
  const unreadable = options.unreadable ?? [];
  const needsReview = unreadable.length > 0 || items.some((item) => item.needsReview);
  const row = await api.db
    .prepare(
      `INSERT INTO evaluations (submission_id, max_total, office_points, total, grade, needs_review, summary,
         strengths_json, recommendations_json, unreadable_json, raw_json, created_at, updated_at)
       VALUES (?, 10, 1, ?, ?, ?, 'Rezumat.', '[]', '[]', ?, '{}', '2026-10-07T09:00:00.000Z', '2026-10-07T09:00:00.000Z')
       RETURNING id`,
    )
    .bind(submissionId, options.grade ?? 9, options.grade ?? 9, needsReview ? 1 : 0, JSON.stringify(unreadable))
    .first<{ id: number }>();
  for (const [index, item] of items.entries()) {
    await api.db
      .prepare(
        `INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason, reviewed_at)
         VALUES (?, ?, ?, 'Exercițiu', 1, 1, 1, 'r', 'c', 'high', ?, ?, ?)`,
      )
      .bind(
        row!.id,
        `E${index + 1}`,
        index + 1,
        item.needsReview ? 1 : 0,
        item.needsReview ? 'Verifică' : '',
        item.reviewed ? '2026-10-07T10:00:00.000Z' : null,
      )
      .run();
  }
  return row!.id;
}

// Marks the test file and the barem as uploaded (rows only; nothing in R2).
```

- [ ] **Step 10: Run the tests to see them fail**

Run: `npx vitest run server/routes/robotProblems.test.ts server/routes/tests.test.ts server/routes/testFiles.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  14 failed | 27 passed (41)`. In `server/routes/robotProblems.test.ts` 9 tests fail: the routes do not exist yet (`expected 404 to be 200`, `expected 404 to be 409`); its two "another teacher" tests pass already. In `testFiles.test.ts` the two new barem tests fail (`expected 409 to be 200`). In `tests.test.ts` three tests fail: the answers have no `gradedCount`, `exerciseList`, `grade`, `flagCount`, or `lastError` yet.

- [ ] **Step 11: Edit `shared/tests.ts`**

Find this block:

```ts
export type TestStatus = 'draft' | 'open' | 'evaluating' | 'done';

```

Replace it with:

```ts
export type TestStatus = 'draft' | 'open' | 'evaluating' | 'done';

// The robot's list of the test's exercises (spec §12.5). "problem": the points
// do not add up; "accepted": the teacher said to use it anyway; "failed": the
// robot could not make it after 3 tries.
export type ExerciseListStatus = 'none' | 'ready' | 'problem' | 'accepted' | 'failed';

```

- [ ] **Step 12: Edit `shared/api.ts`**

Find this block:

```ts
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST } from './students.ts';
import { cleanTitle, MAX_TITLE_LENGTH, type TestStatus } from './tests.ts';

```

Replace it with:

```ts
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST } from './students.ts';
import { cleanTitle, MAX_TITLE_LENGTH, type ExerciseListStatus, type TestStatus } from './tests.ts';

```

- [ ] **Step 13: Edit `shared/api.ts`**

Find this block:

```ts
  evaluationStartedAt: string | null;
  // Active students of the class, and uploads that were sent (confirmed or included).
  studentCount: number;
  submittedCount: number;
}
```

Replace it with:

```ts
  evaluationStartedAt: string | null;
  // Active students of the class, uploads that were sent (confirmed or
  // included), and uploads that were graded.
  studentCount: number;
  submittedCount: number;
  gradedCount: number;
}
```

- [ ] **Step 14: Edit `shared/api.ts`**

Find this block:

```ts

export interface TestInfo extends TestSummary {
```

Replace it with:

```ts

export interface ExerciseListInfo {
  status: ExerciseListStatus;
  // Why the list needs the teacher: points that do not add up, or an error.
  message: string | null;
}

export interface TestInfo extends TestSummary {
```

- [ ] **Step 15: Edit `shared/api.ts`**

Find this block:

```ts
  files: Record<TestFileKind, TestFileInfo | null>;
}
```

Replace it with:

```ts
  files: Record<TestFileKind, TestFileInfo | null>;
  exerciseList: ExerciseListInfo;
}
```

- [ ] **Step 16: Edit `shared/api.ts`**

Find this block:

```ts
  autoSubmitted: boolean;
}
```

Replace it with:

```ts
  autoSubmitted: boolean;
  // Out of 10, once graded.
  grade: number | null;
  // Items to check that the teacher has not checked yet, plus one for pages
  // that could not be read.
  flagCount: number;
  // Why grading failed, for the teacher.
  lastError: string | null;
}
```

- [ ] **Step 17: Edit `server/db/tests.ts`**

Find this block:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { TestInfo, TestSummary, UploadRow, UploadStatus } from '../../shared/api.ts';
import type { TestFileKind } from '../../shared/files.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { buildTestCode, type TestStatus } from '../../shared/tests.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
```

Replace it with:

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { ExerciseListInfo, TestInfo, TestSummary, UploadRow, UploadStatus } from '../../shared/api.ts';
import type { TestFileKind } from '../../shared/files.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { buildTestCode, type ExerciseListStatus, type TestStatus } from '../../shared/tests.ts';
import { ApiError, isUniqueViolation, notFound } from '../errors.ts';
```

- [ ] **Step 18: Edit `server/db/tests.ts`**

Find this block:

```ts
  files: Record<TestFileKind, StoredFile | null>;
}
```

Replace it with:

```ts
  files: Record<TestFileKind, StoredFile | null>;
  exerciseList: ExerciseListInfo;
}
```

- [ ] **Step 19: Edit `server/db/tests.ts`**

Find this block:

```ts
  barem_file_type: string | null;
  student_count: number;
  submitted_count: number;
}
```

Replace it with:

```ts
  barem_file_type: string | null;
  exercise_list_status: ExerciseListStatus;
  exercise_list_message: string | null;
  student_count: number;
  submitted_count: number;
  graded_count: number;
}
```

- [ ] **Step 20: Edit `server/db/tests.ts`**

Find this block:

```ts
    t.test_file_key, t.test_file_name, t.test_file_type,
    t.barem_file_key, t.barem_file_name, t.barem_file_type,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = t.class_id AND e.active = 1) AS student_count,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status <> 'uploading') AS submitted_count
  FROM tests t JOIN classes c ON c.id = t.class_id`;
```

Replace it with:

```ts
    t.test_file_key, t.test_file_name, t.test_file_type,
    t.barem_file_key, t.barem_file_name, t.barem_file_type, t.exercise_list_status, t.exercise_list_message,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = t.class_id AND e.active = 1) AS student_count,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status <> 'uploading') AS submitted_count,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status = 'graded') AS graded_count
  FROM tests t JOIN classes c ON c.id = t.class_id`;
```

- [ ] **Step 21: Edit `server/db/tests.ts`**

Find this block:

```ts
      submittedCount: row.submitted_count,
    },
```

Replace it with:

```ts
      submittedCount: row.submitted_count,
      gradedCount: row.graded_count,
    },
```

- [ ] **Step 22: Edit `server/db/tests.ts`**

Find this block:

```ts
    },
  };
```

Replace it with:

```ts
    },
    exerciseList: { status: row.exercise_list_status, message: row.exercise_list_message },
  };
```

- [ ] **Step 23: Edit `server/db/tests.ts`**

Find this block:

```ts
    files: { test: info(record.files.test), barem: info(record.files.barem) },
  };
```

Replace it with:

```ts
    files: { test: info(record.files.test), barem: info(record.files.barem) },
    exerciseList: record.exerciseList,
  };
```

- [ ] **Step 24: Edit `server/db/tests.ts`**

Find this block:

```ts
      `SELECT st.id AS student_id, st.full_name, e.active,
         s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted,
         (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count
       FROM enrollments e
```

Replace it with:

```ts
      `SELECT st.id AS student_id, st.full_name, e.active,
         s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted, s.last_error, ev.grade,
         (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id = s.id) AS file_count,
         (SELECT COUNT(*) FROM evaluation_items i WHERE i.evaluation_id = ev.id AND i.needs_review = 1 AND i.reviewed_at IS NULL)
           + CASE WHEN json_array_length(ev.unreadable_json) > 0 THEN 1 ELSE 0 END AS flag_count
       FROM enrollments e
```

- [ ] **Step 25: Edit `server/db/tests.ts`**

Find this block:

```ts
       LEFT JOIN submissions s ON s.test_id = ? AND s.student_id = e.student_id
       WHERE e.class_id = ? AND (e.active = 1 OR s.id IS NOT NULL)`,
```

Replace it with:

```ts
       LEFT JOIN submissions s ON s.test_id = ? AND s.student_id = e.student_id
       LEFT JOIN evaluations ev ON ev.submission_id = s.id
       WHERE e.class_id = ? AND (e.active = 1 OR s.id IS NOT NULL)`,
```

- [ ] **Step 26: Edit `server/db/tests.ts`**

Find this block:

```ts
      auto_submitted: number | null;
      file_count: number;
    }>();
```

Replace it with:

```ts
      auto_submitted: number | null;
      last_error: string | null;
      grade: number | null;
      file_count: number;
      flag_count: number;
    }>();
```

- [ ] **Step 27: Edit `server/db/tests.ts`**

Find this block:

```ts
      autoSubmitted: row.auto_submitted === 1,
    }))
```

Replace it with:

```ts
      autoSubmitted: row.auto_submitted === 1,
      grade: row.grade,
      flagCount: row.flag_count,
      lastError: row.last_error,
    }))
```

- [ ] **Step 28: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';

```

Replace it with:

```ts
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { TestStatus } from '../../shared/tests.ts';

```

- [ ] **Step 29: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
    .first<{ found: number }>();
  return row !== null;
}
```

Replace it with:

```ts
    .first<{ found: number }>();
  return row !== null;
}

// "Folosește oricum": the teacher accepts an exercise list whose points do
// not add up. False when the list had no problem.
export async function acceptExerciseList(db: D1Database, teacherId: number, testId: number, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_status = 'accepted', updated_at = ?
       WHERE id = ? AND teacher_id = ? AND exercise_list_status = 'problem'
       RETURNING id`,
    )
    .bind(now, testId, teacherId)
    .first<{ id: number }>();
  return row !== null;
}

// Lets the robot try again to make an exercise list it failed to make.
// Returns the test's status, or null when the list had not failed.
export async function retryExerciseList(db: D1Database, teacherId: number, testId: number, now: string): Promise<TestStatus | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_status = 'none', exercise_list_message = NULL, exercise_list_attempts = 0, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND exercise_list_status = 'failed'
       RETURNING status`,
    )
    .bind(now, testId, teacherId)
    .first<{ status: TestStatus }>();
  return row?.status ?? null;
}

// failed → submitted with 0 attempts, so the robot grades the upload again. A
// finished test goes back to evaluation (spec §8.5). Returns the test's
// status, or null when the upload had not failed.
export async function retrySubmission(db: D1Database, teacherId: number, submissionId: number, now: string): Promise<TestStatus | null> {
  const [retried, , test] = await db.batch<{ test_id?: number; status?: TestStatus }>([
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', attempts = 0, last_error = NULL, run_id = NULL
         WHERE id = ? AND status = 'failed'
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND t.teacher_id = ?)
         RETURNING test_id`,
      )
      .bind(submissionId, teacherId),
    db
      .prepare(
        `UPDATE tests SET status = 'evaluating', updated_at = ?, ${ASK_FOR_ANALYSIS}
         WHERE status = 'done' AND teacher_id = ?
           AND id = (SELECT test_id FROM submissions WHERE id = ? AND status = 'submitted')`,
      )
      .bind(now, teacherId, submissionId),
    db.prepare('SELECT t.status FROM tests t JOIN submissions s ON s.test_id = t.id WHERE s.id = ?').bind(submissionId),
  ]);
  if (!retried?.results.length) return null;
  return test?.results[0]?.status ?? null;
}
```

- [ ] **Step 30: Edit `server/routes/tests.ts`**

Find this block:

```ts
import { MAX_SCHEDULE_DAYS } from '../../shared/tests.ts';
import { cancelSchedule, hasUploadedFiles, scheduleEvaluation, startEvaluationNow } from '../db/lifecycle.ts';
import {
```

Replace it with:

```ts
import { MAX_SCHEDULE_DAYS } from '../../shared/tests.ts';
import {
  acceptExerciseList,
  cancelSchedule,
  hasUploadedFiles,
  retryExerciseList,
  scheduleEvaluation,
  startEvaluationNow,
} from '../db/lifecycle.ts';
import {
```

- [ ] **Step 31: Edit `server/routes/tests.ts`**

Find this block:

```ts

  // Upload or replace the test or the barem: PDF or Word, at most 25 MB.
```

Replace it with:

```ts

  // "Folosește oricum": grade with an exercise list whose points do not add up.
  routes.post('/:code/exercise-list/accept', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (!(await acceptExerciseList(c.env.DB, c.var.teacher.id, test.id, nowIso()))) {
      throw new ApiError(409, 'no_problem', 'Lista de exerciții nu are nicio problemă.');
    }
    return c.json({ exerciseList: { status: 'accepted', message: test.exerciseList.message } });
  });

  // "Încearcă din nou": the robot makes the exercise list again.
  routes.post('/:code/exercise-list/retry', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const status = await retryExerciseList(c.env.DB, c.var.teacher.id, test.id, nowIso());
    if (status === null) throw new ApiError(409, 'not_failed', 'Lista de exerciții nu a eșuat.');
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ exerciseList: { status: 'none', message: null }, robot });
  });

  // Upload or replace the test or the barem: PDF or Word, at most 25 MB.
```

- [ ] **Step 32: Edit `server/routes/tests.ts`**

Find this block:

```ts
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    if (test.summary.status === 'evaluating') {
      throw new ApiError(409, 'evaluating', 'Testul se corectează acum. Poți schimba fișierul după ce se termină corectarea.');
```

Replace it with:

```ts
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    // While the robot grades, it reads both files. It reads neither while the
    // exercise list has a problem or failed: the teacher may then fix the barem.
    const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
    if (test.summary.status === 'evaluating' && !listBlocked) {
      throw new ApiError(409, 'evaluating', 'Testul se corectează acum. Poți schimba fișierul după ce se termină corectarea.');
```

- [ ] **Step 33: Replace `server/routes/submissions.ts`**

```ts
import { Hono } from 'hono';
import { retrySubmission } from '../db/lifecycle.ts';
import { deleteSubmissionRow, findTeacherFile, getTeacherSubmission } from '../db/submissions.ts';
import { robotStarter } from '../dispatch.ts';
import type { AppEnv, AppOptions } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId } from '../http.ts';
import { deleteFilesQuietly, fileResponse } from '../uploads.ts';

// /api/admin/submissions: one student's upload for one test.
export function submissionRoutes(options: AppOptions = {}): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const startRobot = robotStarter(options);

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

  // "Reîncearcă": the robot grades a failed upload again.
  routes.post('/:id/retry', async (c) => {
    const found = await getTeacherSubmission(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')));
    if (!found) throw notFound();
    const testStatus = await retrySubmission(c.env.DB, c.var.teacher.id, found.detail.id, nowIso());
    if (testStatus === null) throw new ApiError(409, 'not_failed', 'Corectarea acestei lucrări nu a eșuat.');
    const robot = testStatus === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ status: 'submitted', robot });
  });

  return routes;
}
```

- [ ] **Step 34: Edit `server/routes/admin.ts`**

Find this block:

```ts
  routes.route('/tests', testRoutes(options));
  routes.route('/submissions', submissionRoutes());
  return routes;
```

Replace it with:

```ts
  routes.route('/tests', testRoutes(options));
  routes.route('/submissions', submissionRoutes(options));
  return routes;
```

- [ ] **Step 35: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      submittedCount: uploads.filter((row) => row.status !== 'none' && row.status !== 'uploading').length,
      uploadToken: null,
      files: { test: null, barem: null },
      ...overrides,
```

Replace it with:

```ts
      submittedCount: uploads.filter((row) => row.status !== 'none' && row.status !== 'uploading').length,
      gradedCount: uploads.filter((row) => row.status === 'graded').length,
      uploadToken: null,
      files: { test: null, barem: null },
      exerciseList: { status: 'none', message: null },
      ...overrides,
```

- [ ] **Step 36: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    autoSubmitted: false,
    ...overrides,
```

Replace it with:

```ts
    autoSubmitted: false,
    grade: null,
    flagCount: 0,
    lastError: null,
    ...overrides,
```

- [ ] **Step 37: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
        const row = detail.uploads.find((u) => u.submissionId === submissionId);
        if (row) Object.assign(row, { submissionId: null, status: 'none', fileCount: 0, startedAt: null, submittedAt: null });
      }
```

Replace it with:

```ts
        const row = detail.uploads.find((u) => u.submissionId === submissionId);
        if (row) {
          const cleared = { submissionId: null, status: 'none', fileCount: 0, startedAt: null, submittedAt: null, autoSubmitted: false };
          Object.assign(row, { ...cleared, grade: null, flagCount: 0, lastError: null });
        }
      }
```

- [ ] **Step 38: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  43 passed (43)`, `Tests  433 passed (433)`.

- [ ] **Step 39: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 40: Commit**

```bash
git add shared server src/test/fakeApi.ts
git commit -m "Let the teacher answer the robot's problems, and show grades in the uploads table"
```

---

### Task 4: Settings, the robot key, and the robot's check

Setări gets its API: how many uploads the robot grades at the same time, a new robot key (shown once), and the robot's state. The robot API starts at `/api/runner` with its key check and the 10-minute check, which also sends back to the queue the uploads that a dead run left in grading. The test detail gets the robot line's time.

**Files:**
- Create: `shared/runner.ts`, `server/db/settings.ts`, `server/db/runner.ts`, `server/auth/robotAuth.ts`, `server/routes/settings.ts`, `server/routes/runner.ts`
- Modify: `shared/api.ts`, `server/secrets.ts`, `server/db/lifecycle.ts`, `server/app.ts`, `server/routes/admin.ts`, `server/routes/tests.ts`, `server/test/fixtures.ts`, `src/test/fakeApi.ts`
- Test: `server/routes/settings.test.ts`, `server/routes/runner.test.ts` (new); `server/secrets.test.ts` (modified)

**Interfaces:**
- Consumes: `promoteDueTests` (Task 2), `sha256Hex`.
- Produces:
  - In `shared/runner.ts`: `LEASE_STALE_MS` (15 minutes), `MAX_PARALLEL_AGENTS = 4`, `runSummarySchema` and `RunSummary` (`{ exerciseLists, graded, failed, analyses, stop }`), `CheckResult`.
  - In `shared/api.ts`: `updateSettingsBody`, `RobotStatus`, `Settings`; `TestDetail.robot: { lastCheckAt }`.
  - `newRobotKey()` and `constantTimeEqual(a, b)` in `server/secrets.ts`; `promoteStatements(db, now)` in `server/db/lifecycle.ts`.
  - In `server/db/settings.ts`: `DEFAULT_PARALLEL_AGENTS`, `getSettings(db, teacherId, now)`, `getMaxParallel(db)`, `setMaxParallel(db, n)`, `getRobotKeyHash(db)`, `setRobotKeyHash(db, hash)`, `lastCheckAt(db)`.
  - In `server/db/runner.ts`: `staleBefore(now)`, the SQL conditions `NEEDS_EXERCISE_LIST`, `GRADABLE`, `NEEDS_ANALYSIS`, and `runCheck(db, now): Promise<CheckResult>`.
  - `robotAuth()` middleware; `runnerRoutes()` at `/api/runner` with `POST /check`; 401 `robot_denied`.
  - `GET /api/admin/settings` → `{ settings }`; `PATCH /api/admin/settings` `{ maxParallelAgents }` → `{ settings }`; `POST /api/admin/settings/robot-key` → 201 `{ key }`.
  - Fixtures `ROBOT_KEY`, `setRobotKey(api, key?)`, `robotRequest(api, key?)`.

- [ ] **Step 1: Replace `server/secrets.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { isUploadToken } from '../shared/tests.ts';
import { constantTimeEqual, newDeviceSecret, newRobotKey, newUploadToken, randomBase32, sha256Hex } from './secrets.ts';

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

  it('makes 256-bit robot keys in base64url', () => {
    const key = newRobotKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newRobotKey()).not.toBe(key);
  });

  it('compares strings without stopping at the first difference', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('hashes text with SHA-256 as lowercase hex', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
```

- [ ] **Step 2: Create `server/routes/settings.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../secrets.ts';
import { addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

const setRunner = (sql: string, ...params: unknown[]) =>
  api.db.prepare(`UPDATE runner_state SET ${sql} WHERE id = 1`).bind(...params).run();

beforeEach(async () => {
  api = await startTestApi();
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/admin/settings', () => {
  it('starts with one upload at a time, no robot key, and a robot that never ran', async () => {
    const res = await api.request('GET', '/api/admin/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      settings: {
        maxParallelAgents: 1,
        hasRobotKey: false,
        robot: { running: false, lastCheckAt: null, lastRunFinishedAt: null, lastRunSummary: null },
        lastGradedAt: null,
      },
    });
  });

  it('shows a run as running only while its heartbeat is fresh', async () => {
    const fresh = new Date(Date.now() - 60_000).toISOString();
    await setRunner("run_id = 'run-1', heartbeat_at = ?, last_check_at = ?", fresh, fresh);
    expect((await api.request('GET', '/api/admin/settings')).body.settings.robot).toMatchObject({ running: true, lastCheckAt: fresh });
    await setRunner("heartbeat_at = '2026-10-06T08:00:00.000Z'");
    expect((await api.request('GET', '/api/admin/settings')).body.settings.robot.running).toBe(false);
  });

  it('shows the summary of the last run, and none for a broken one', async () => {
    const summary = { exerciseLists: 1, graded: 25, failed: 2, analyses: 0, stop: 'done' };
    await setRunner("last_run_finished_at = '2026-10-07T09:00:00.000Z', last_run_summary = ?", JSON.stringify(summary));
    const robot = (await api.request('GET', '/api/admin/settings')).body.settings.robot;
    expect(robot).toMatchObject({ lastRunFinishedAt: '2026-10-07T09:00:00.000Z', lastRunSummary: summary });
    await setRunner("last_run_summary = '{nu'");
    expect((await api.request('GET', '/api/admin/settings')).body.settings.robot.lastRunSummary).toBeNull();
  });

  it("shows when one of this teacher's uploads was last graded", async () => {
    const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
    const code = await makeTest(api, cls.id);
    for (const [index, studentId] of cls.studentIds.entries()) {
      const id = await addSubmission(api, code, studentId, { status: 'graded', files: 1 });
      await api.db.prepare('UPDATE submissions SET graded_at = ? WHERE id = ?').bind(`2026-10-0${index + 7}T09:00:00.000Z`, id).run();
    }
    const foreign = await otherTeacherTest(api);
    const foreignId = await addSubmission(api, foreign.code, foreign.studentId, { status: 'graded', files: 1 });
    await api.db.prepare("UPDATE submissions SET graded_at = '2026-12-01T09:00:00.000Z' WHERE id = ?").bind(foreignId).run();
    expect((await api.request('GET', '/api/admin/settings')).body.settings.lastGradedAt).toBe('2026-10-08T09:00:00.000Z');
  });
});

describe('PATCH /api/admin/settings', () => {
  it('sets how many uploads the robot grades at the same time', async () => {
    const res = await api.request('PATCH', '/api/admin/settings', { maxParallelAgents: 3 });
    expect(res.status).toBe(200);
    expect(res.body.settings.maxParallelAgents).toBe(3);
    expect((await api.request('GET', '/api/admin/settings')).body.settings.maxParallelAgents).toBe(3);
  });

  it.each([0, 5, 1.5, '2'])('refuses %j', async (value) => {
    const res = await api.request('PATCH', '/api/admin/settings', { maxParallelAgents: value });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Alege între 1 și 4 lucrări corectate deodată.');
  });
});

describe('POST /api/admin/settings/robot-key', () => {
  it('shows a new key once and keeps only its hash', async () => {
    const res = await api.request('POST', '/api/admin/settings/robot-key');
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await api.db.prepare("SELECT value FROM settings WHERE key = 'runner_key_hash'").first<{ value: string }>();
    expect(stored?.value).toBe(await sha256Hex(res.body.key));
    expect((await api.request('GET', '/api/admin/settings')).body.settings.hasRobotKey).toBe(true);
  });

  it('replaces the old key', async () => {
    const first = (await api.request('POST', '/api/admin/settings/robot-key')).body.key;
    const second = (await api.request('POST', '/api/admin/settings/robot-key')).body.key;
    expect(second).not.toBe(first);
    const rows = await api.db.prepare("SELECT value FROM settings WHERE key = 'runner_key_hash'").all<{ value: string }>();
    expect(rows.results).toEqual([{ value: await sha256Hex(second) }]);
  });
});
```

- [ ] **Step 3: Create `server/routes/runner.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSubmission, addTestFiles, makeClass, makeTest, robotRequest, setRobotKey, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let studentIds: number[];

const PAST = '2026-10-06T08:00:00.000Z';

const setTest = (sql: string, ...params: unknown[]) =>
  api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const setRunner = (sql: string, ...params: unknown[]) =>
  api.db.prepare(`UPDATE runner_state SET ${sql} WHERE id = 1`).bind(...params).run();
const uploadStatus = async (id: number) =>
  (await api.db.prepare('SELECT status, run_id FROM submissions WHERE id = ?').bind(id).first()) as { status: string; run_id: string | null };

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  await startTest(api, code);
  await addTestFiles(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('robot key', () => {
  it('refuses a request without a key, with a wrong key, or with an old key', async () => {
    const attempts: Record<string, string>[] = [{}, { Authorization: 'Bearer wrong-key-0123456789abcdef' }, { Authorization: 'Basic abc' }];
    for (const headers of attempts) {
      const res = await api.request('POST', '/api/runner/check', undefined, headers);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'robot_denied', message: 'Cheia robotului lipsește sau este greșită.' });
    }
    await setRobotKey(api, 'a-newer-robot-key-0123456789');
    expect((await robot('POST', '/check')).status).toBe(401);
    expect((await robotRequest(api, 'a-newer-robot-key-0123456789')('POST', '/check')).status).toBe(200);
  });

  it('refuses every key while none is stored', async () => {
    await api.db.prepare('DELETE FROM settings').run();
    expect((await robot('POST', '/check')).status).toBe(401);
  });

  it('needs no teacher login', async () => {
    const outside = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined } });
    try {
      await setRobotKey(outside);
      expect((await robotRequest(outside)('POST', '/check')).status).toBe(200);
      expect((await outside.request('GET', '/api/admin/me')).status).toBe(500);
    } finally {
      await outside.dispose();
    }
  });
});

describe('POST /api/runner/check', () => {
  it('says there is no work and saves the time of the check', async () => {
    const res = await robot('POST', '/check');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasWork: false, exerciseLists: 0, pendingGrading: 0, analyses: 0 });
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(Date.parse(detail.body.robot.lastCheckAt)).not.toBeNaN();
  });

  it('counts the exercise lists, the uploads to grade, and the analyses that wait', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 1, pendingGrading: 0, analyses: 0 });

    await setTest("exercise_list_status = 'ready'");
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 2, analyses: 0 });

    await api.db.prepare("UPDATE submissions SET status = 'graded'").run();
    await setTest("analysis_status = 'requested'");
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 0, analyses: 1 });
  });

  it('gives no work from a test whose exercise list has a problem or failed', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    for (const list of ['problem', 'failed']) {
      await setTest("status = 'evaluating', exercise_list_status = ?", list);
      expect((await robot('POST', '/check')).body.hasWork).toBe(false);
    }
  });

  it('starts a scheduled evaluation whose time has come', async () => {
    const id = await addSubmission(api, code, studentIds[0]!, { files: 1 });
    await setTest('evaluation_at = ?', PAST);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, exerciseLists: 1 });
    expect((await uploadStatus(id)).status).toBe('submitted');
  });

  it('sends back to the queue an upload left in grading by a run that died', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = 'run-1' WHERE id = ?").bind(id).run();
    await setRunner("run_id = 'run-1', heartbeat_at = ?", PAST);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, pendingGrading: 1 });
    expect(await uploadStatus(id)).toEqual({ status: 'submitted', run_id: null });
  });

  it('sends back to the queue an upload left in grading after its run ended', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = 'run-1' WHERE id = ?").bind(id).run();
    await robot('POST', '/check');
    expect(await uploadStatus(id)).toEqual({ status: 'submitted', run_id: null });
  });

  it('leaves alone the uploads that a live run is grading', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = 'run-1' WHERE id = ?").bind(id).run();
    await setRunner("run_id = 'run-1', heartbeat_at = ?", new Date().toISOString());
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: false, exerciseLists: 0, pendingGrading: 0, analyses: 0 });
    expect(await uploadStatus(id)).toEqual({ status: 'grading', run_id: 'run-1' });
  });

  it('ends a test with nothing left to grade', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    await robot('POST', '/check');
    const row = await api.db.prepare('SELECT status FROM tests WHERE code = ?').bind(code).first();
    expect(row).toEqual({ status: 'done' });
  });
});
```

- [ ] **Step 4: Edit `server/test/fixtures.ts`**

Find this block:

```ts
import type { UploadStatus } from '../../shared/api.ts';
import type { TestApi } from './testApi.ts';

```

Replace it with:

```ts
import type { UploadStatus } from '../../shared/api.ts';
import { sha256Hex } from '../secrets.ts';
import type { TestApi, TestResponse } from './testApi.ts';

```

- [ ] **Step 5: Edit `server/test/fixtures.ts`**

Find this block:

```ts
  return { code: '9Z-26T1', studentId: student!.id };
}
```

Replace it with:

```ts
  return { code: '9Z-26T1', studentId: student!.id };
}

export const ROBOT_KEY = 'test-robot-key-0123456789abcdef';

// Stores the hash of a robot key straight in the database; returns the key.
export async function setRobotKey(api: TestApi, key = ROBOT_KEY): Promise<string> {
  await api.db
    .prepare("INSERT INTO settings (key, value) VALUES ('runner_key_hash', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(await sha256Hex(key))
    .run();
  return key;
}

// A request to the robot API with a robot key.
export function robotRequest(api: TestApi, key = ROBOT_KEY) {
  return (method: string, path: string, body?: unknown): Promise<TestResponse> =>
    api.request(method, `/api/runner${path}`, body, { Authorization: `Bearer ${key}` });
}
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run server/secrets.test.ts server/routes/settings.test.ts server/routes/runner.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  24 failed | 4 passed (28)`. `server/secrets.test.ts`: `newRobotKey is not a function` and `constantTimeEqual is not a function`. Every test of `server/routes/settings.test.ts` and `server/routes/runner.test.ts` fails: the routes do not exist yet (`expected 404 to be 200`, `expected 404 to be 401`).

- [ ] **Step 7: Create `shared/runner.ts`**

```ts
import { z } from 'zod';

// The robot API (/api/runner, spec §11.3): request bodies and answers, shared
// by the API and the robot.

// A run that sent no heartbeat for this long is taken as dead (spec §11.3).
export const LEASE_STALE_MS = 15 * 60 * 1000;

export const MAX_PARALLEL_AGENTS = 4;

// What a run did, saved when it ends. Counts only: the repo and its logs are
// public, so nothing here may name a student.
export const runSummarySchema = z.object({
  exerciseLists: z.number().int().min(0),
  graded: z.number().int().min(0),
  failed: z.number().int().min(0),
  analyses: z.number().int().min(0),
  // Why the run stopped taking new work.
  stop: z.enum(['done', 'budget', 'usage_limit', 'lease_lost']),
});

export type RunSummary = z.infer<typeof runSummarySchema>;

// POST /check: what waits for the robot.
export interface CheckResult {
  hasWork: boolean;
  exerciseLists: number;
  pendingGrading: number;
  analyses: number;
}
```

- [ ] **Step 8: Edit `shared/api.ts`**

Find this block:

```ts
import type { TestFileKind } from './files.ts';
import { isValidSchoolYear } from './schoolYear.ts';
```

Replace it with:

```ts
import type { TestFileKind } from './files.ts';
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
import { isValidSchoolYear } from './schoolYear.ts';
```

- [ ] **Step 9: Edit `shared/api.ts`**

Find this block:

```ts
  at: z.iso.datetime({ message: 'Ora aleasă nu este validă.' }).optional(),
});
```

Replace it with:

```ts
  at: z.iso.datetime({ message: 'Ora aleasă nu este validă.' }).optional(),
});

const PARALLEL_MESSAGE = `Alege între 1 și ${MAX_PARALLEL_AGENTS} lucrări corectate deodată.`;

export const updateSettingsBody = z.object({
  maxParallelAgents: z
    .number({ message: PARALLEL_MESSAGE })
    .int({ message: PARALLEL_MESSAGE })
    .min(1, { message: PARALLEL_MESSAGE })
    .max(MAX_PARALLEL_AGENTS, { message: PARALLEL_MESSAGE }),
});
```

- [ ] **Step 10: Edit `shared/api.ts`**

Find this block:

```ts
  uploads: UploadRow[];
}
```

Replace it with:

```ts
  uploads: UploadRow[];
  // For the robot line: when the robot last looked for work.
  robot: { lastCheckAt: string | null };
}

// The robot as the teacher sees it on Setări.
export interface RobotStatus {
  // A run holds the lease and sent a heartbeat in the last 15 minutes.
  running: boolean;
  lastCheckAt: string | null;
  lastRunFinishedAt: string | null;
  lastRunSummary: RunSummary | null;
}

export interface Settings {
  // How many uploads the robot grades at the same time.
  maxParallelAgents: number;
  hasRobotKey: boolean;
  robot: RobotStatus;
  // When one of this teacher's uploads was last graded.
  lastGradedAt: string | null;
}
```

- [ ] **Step 11: Replace `server/secrets.ts`**

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

function randomBase64Url(bytes: number): string {
  let binary = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(bytes))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// The secret that ties an upload to one phone: 24 bytes (192 bits), base64url.
export function newDeviceSecret(): string {
  return randomBase64Url(24);
}

// The robot's key: 32 bytes (256 bits), base64url. Only its hash is stored.
export function newRobotKey(): string {
  return randomBase64Url(32);
}

// Compares two strings in a time that does not depend on where they differ.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 12: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
export async function promoteDueTests(db: D1Database, now: string): Promise<void> {
  await db.batch([
    db
```

Replace it with:

```ts
export async function promoteDueTests(db: D1Database, now: string): Promise<void> {
  await db.batch(promoteStatements(db, now));
}

// The writes of promoteDueTests, for a batch with more writes.
export function promoteStatements(db: D1Database, now: string): D1PreparedStatement[] {
  return [
    db
```

- [ ] **Step 13: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
    finishTests(db, now),
  ]);
}
```

Replace it with:

```ts
    finishTests(db, now),
  ];
}
```

- [ ] **Step 14: Create `server/db/settings.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { Settings } from '../../shared/api.ts';
import { LEASE_STALE_MS, MAX_PARALLEL_AGENTS, runSummarySchema, type RunSummary } from '../../shared/runner.ts';

// System-wide settings (spec §7.1). v1 has one teacher, so any teacher may
// change them.

const PARALLEL = 'max_parallel_agents';
const ROBOT_KEY_HASH = 'runner_key_hash';

export const DEFAULT_PARALLEL_AGENTS = 1;

function parseParallel(raw: string | null): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= MAX_PARALLEL_AGENTS ? value : DEFAULT_PARALLEL_AGENTS;
}

function parseSummary(raw: string | null): RunSummary | null {
  if (raw === null) return null;
  try {
    const parsed = runSummarySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function setValue(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .bind(key, value)
    .run();
}

export async function getSettings(db: D1Database, teacherId: number, now: string): Promise<Settings> {
  const row = await db
    .prepare(
      `SELECT (SELECT value FROM settings WHERE key = ?) AS parallel,
         EXISTS (SELECT 1 FROM settings WHERE key = ?) AS has_key,
         r.run_id, r.heartbeat_at, r.last_check_at, r.last_run_finished_at, r.last_run_summary,
         (SELECT MAX(s.graded_at) FROM submissions s JOIN tests t ON t.id = s.test_id WHERE t.teacher_id = ?) AS last_graded_at
       FROM runner_state r WHERE r.id = 1`,
    )
    .bind(PARALLEL, ROBOT_KEY_HASH, teacherId)
    .first<{
      parallel: string | null;
      has_key: number;
      run_id: string | null;
      heartbeat_at: string | null;
      last_check_at: string | null;
      last_run_finished_at: string | null;
      last_run_summary: string | null;
      last_graded_at: string | null;
    }>();
  const heartbeat = row?.heartbeat_at ? Date.parse(row.heartbeat_at) : Number.NaN;
  return {
    maxParallelAgents: parseParallel(row?.parallel ?? null),
    hasRobotKey: row?.has_key === 1,
    robot: {
      running: Boolean(row?.run_id) && Date.parse(now) - heartbeat < LEASE_STALE_MS,
      lastCheckAt: row?.last_check_at ?? null,
      lastRunFinishedAt: row?.last_run_finished_at ?? null,
      lastRunSummary: parseSummary(row?.last_run_summary ?? null),
    },
    lastGradedAt: row?.last_graded_at ?? null,
  };
}

export async function getMaxParallel(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(PARALLEL).first<{ value: string }>();
  return parseParallel(row?.value ?? null);
}

export async function setMaxParallel(db: D1Database, value: number): Promise<void> {
  await setValue(db, PARALLEL, String(value));
}

export async function getRobotKeyHash(db: D1Database): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(ROBOT_KEY_HASH).first<{ value: string }>();
  return row?.value ?? null;
}

// A new key replaces the old one at once: the old key stops working.
export async function setRobotKeyHash(db: D1Database, hash: string): Promise<void> {
  await setValue(db, ROBOT_KEY_HASH, hash);
}

export async function lastCheckAt(db: D1Database): Promise<string | null> {
  const row = await db.prepare('SELECT last_check_at FROM runner_state WHERE id = 1').first<{ last_check_at: string | null }>();
  return row?.last_check_at ?? null;
}
```

- [ ] **Step 15: Create `server/db/runner.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import { LEASE_STALE_MS, type CheckResult } from '../../shared/runner.ts';
import { promoteStatements } from './lifecycle.ts';

// Queries of the robot API (spec §11.3). Each write checks its own rules in
// its SQL: runs can overlap, and parallel tasks of one run call at once.

// The time before which a heartbeat is stale.
export function staleBefore(now: string): string {
  return new Date(Date.parse(now) - LEASE_STALE_MS).toISOString();
}

// Work the robot can take now, as SQL conditions.
// A test in evaluation that waits for its exercise list.
export const NEEDS_EXERCISE_LIST = `t.status = 'evaluating' AND t.exercise_list_status = 'none'
  AND EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status = 'submitted')`;
// An upload (s) that can be graded: its test (t) is in evaluation with a usable exercise list.
export const GRADABLE = `s.status = 'submitted' AND t.status = 'evaluating' AND t.exercise_list_status IN ('ready', 'accepted')`;
// A test whose class analysis was asked for, with nothing left to grade.
export const NEEDS_ANALYSIS = `t.status = 'evaluating' AND t.analysis_status = 'requested'
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status IN ('submitted', 'grading'))`;

// The robot's regular check, in one transaction:
// - an upload left in grading by a run that died or ended goes back to the
//   queue, so no upload is lost when no new run takes the lease;
// - scheduled evaluations whose time has come start, and finished tests end;
// - the time of the check is saved for the robot line;
// - the counts say whether a run has work.
export async function runCheck(db: D1Database, now: string): Promise<CheckResult> {
  const results = await db.batch<{ exercise_lists: number; pending_grading: number; analyses: number }>([
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', run_id = NULL
         WHERE status = 'grading' AND NOT EXISTS (
           SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = submissions.run_id AND r.heartbeat_at >= ?)`,
      )
      .bind(staleBefore(now)),
    ...promoteStatements(db, now),
    db.prepare('UPDATE runner_state SET last_check_at = ? WHERE id = 1').bind(now),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_EXERCISE_LIST}) AS exercise_lists,
         (SELECT COUNT(*) FROM submissions s JOIN tests t ON t.id = s.test_id WHERE ${GRADABLE}) AS pending_grading,
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_ANALYSIS}) AS analyses`,
    ),
  ]);
  const counts = results.at(-1)?.results[0];
  const exerciseLists = counts?.exercise_lists ?? 0;
  const pendingGrading = counts?.pending_grading ?? 0;
  const analyses = counts?.analyses ?? 0;
  return { hasWork: exerciseLists + pendingGrading + analyses > 0, exerciseLists, pendingGrading, analyses };
}
```

- [ ] **Step 16: Create `server/auth/robotAuth.ts`**

```ts
import type { MiddlewareHandler } from 'hono';
import { getRobotKeyHash } from '../db/settings.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { constantTimeEqual, sha256Hex } from '../secrets.ts';

const BEARER = /^Bearer ([A-Za-z0-9_-]{20,200})$/;

// The robot sends Authorization: Bearer <key>. The API keeps only the key's
// SHA-256 and compares the hashes in constant time (spec §11.3). Without a
// stored key, every robot request is refused.
export function robotAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = BEARER.exec(c.req.header('Authorization') ?? '')?.[1];
    const stored = await getRobotKeyHash(c.env.DB);
    if (!key || !stored || !constantTimeEqual(await sha256Hex(key), stored)) {
      throw new ApiError(401, 'robot_denied', 'Cheia robotului lipsește sau este greșită.');
    }
    await next();
  };
}
```

- [ ] **Step 17: Create `server/routes/settings.ts`**

```ts
import { Hono } from 'hono';
import { updateSettingsBody } from '../../shared/api.ts';
import { getSettings, setMaxParallel, setRobotKeyHash } from '../db/settings.ts';
import type { AppEnv } from '../env.ts';
import { nowIso, readJson } from '../http.ts';
import { newRobotKey, sha256Hex } from '../secrets.ts';

// /api/admin/settings: the Setări page.
export function settingsRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => c.json({ settings: await getSettings(c.env.DB, c.var.teacher.id, nowIso()) }));

  routes.patch('/', async (c) => {
    const body = await readJson(c, updateSettingsBody);
    await setMaxParallel(c.env.DB, body.maxParallelAgents);
    return c.json({ settings: await getSettings(c.env.DB, c.var.teacher.id, nowIso()) });
  });

  // A new robot key, shown this once. The teacher copies it into the GitHub
  // secret QUICKEVAL_RUNNER_KEY; the old key stops working.
  routes.post('/robot-key', async (c) => {
    const key = newRobotKey();
    await setRobotKeyHash(c.env.DB, await sha256Hex(key));
    return c.json({ key }, 201);
  });

  return routes;
}
```

- [ ] **Step 18: Create `server/routes/runner.ts`**

```ts
import { Hono } from 'hono';
import { robotAuth } from '../auth/robotAuth.ts';
import { runCheck } from '../db/runner.ts';
import type { AppEnv } from '../env.ts';
import { nowIso } from '../http.ts';

// /api/runner: the evaluation robot (spec §11.3). Every route needs the robot
// key. Answers carry ids and counts, never student names.
export function runnerRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', robotAuth());

  // The 10-minute check: is there work for a run?
  routes.post('/check', async (c) => c.json(await runCheck(c.env.DB, nowIso())));

  return routes;
}
```

- [ ] **Step 19: Edit `server/app.ts`**

Find this block:

```ts
import { adminRoutes } from './routes/admin.ts';
import { uploadRoutes } from './routes/upload.ts';
```

Replace it with:

```ts
import { adminRoutes } from './routes/admin.ts';
import { runnerRoutes } from './routes/runner.ts';
import { uploadRoutes } from './routes/upload.ts';
```

- [ ] **Step 20: Edit `server/app.ts`**

Find this block:

```ts
  app.route('/u', uploadRoutes());

```

Replace it with:

```ts
  app.route('/u', uploadRoutes());
  app.route('/runner', runnerRoutes());

```

- [ ] **Step 21: Edit `server/routes/admin.ts`**

Find this block:

```ts
import { classRoutes } from './classes.ts';
import { studentRoutes } from './students.ts';
```

Replace it with:

```ts
import { classRoutes } from './classes.ts';
import { settingsRoutes } from './settings.ts';
import { studentRoutes } from './students.ts';
```

- [ ] **Step 22: Edit `server/routes/admin.ts`**

Find this block:

```ts
  routes.route('/submissions', submissionRoutes(options));
  return routes;
```

Replace it with:

```ts
  routes.route('/submissions', submissionRoutes(options));
  routes.route('/settings', settingsRoutes());
  return routes;
```

- [ ] **Step 23: Edit `server/routes/tests.ts`**

Find this block:

```ts
} from '../db/lifecycle.ts';
import {
```

Replace it with:

```ts
} from '../db/lifecycle.ts';
import { lastCheckAt } from '../db/settings.ts';
import {
```

- [ ] **Step 24: Edit `server/routes/tests.ts`**

Find this block:

```ts
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    return c.json({ test: toTestInfo(test), uploads: await listUploads(c.env.DB, test.id, test.summary.classId) });
  });
```

Replace it with:

```ts
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    return c.json({
      test: toTestInfo(test),
      uploads: await listUploads(c.env.DB, test.id, test.summary.classId),
      robot: { lastCheckAt: await lastCheckAt(c.env.DB) },
    });
  });
```

- [ ] **Step 25: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    uploads,
  };
```

Replace it with:

```ts
    uploads,
    robot: { lastCheckAt: null },
  };
```

- [ ] **Step 26: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  45 passed (45)`, `Tests  457 passed (457)`.

- [ ] **Step 27: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 28: Commit**

```bash
git add shared server src/test/fakeApi.ts
git commit -m "Add the settings, the robot key, and the robot's check"
```

---

### Task 5: The robot's lease, work list, test files, and exercise list

Only one robot run works at a time: it takes the lease, keeps it with a heartbeat, and frees it with a summary. The robot reads its work list, a test's file types and exercise list, and the test and barem files, and saves the exercise list it made (or why it could not).

**Files:**
- Modify: `shared/runner.ts`, `server/db/runner.ts`, `server/routes/runner.ts`
- Test: `server/routes/runner.test.ts` (modified)

**Interfaces:**
- Consumes: `checkExerciseList` (Task 1), `staleBefore`, `NEEDS_EXERCISE_LIST`, `GRADABLE`, `NEEDS_ANALYSIS`, `getMaxParallel` (Task 4).
- Produces:
  - In `shared/runner.ts`: `runIdSchema`, `runBody`, `releaseBody`, `robotErrorSchema` and `RobotError` (`timeout | invalid_output | crash | usage_limit`), `exerciseListBody`, `LeaseResult`, `TasksResult`, `RobotTest`.
  - In `server/db/runner.ts`: `ROBOT_ERROR_TEXT`, `MAX_ATTEMPTS = 3`, `takeLease`, `heartbeat`, `releaseLease`, `listTasks`, `findRobotTest` (with the R2 keys), `saveExerciseList`, `failExerciseList`, `holdsLease`.
  - `POST /lease` `{ runId }` → `{ granted, maxParallel }`; `POST /heartbeat` and `POST /release` `{ runId, summary }` (409 `lease_lost`); `GET /tasks`; `GET /tests/:id` → `{ test: RobotTest }`; `GET /tests/:id/files/:kind`; `POST /tests/:id/exercise-list` → `{ exerciseList }` (422 `invalid_result`, 409 `lease_lost`, 409 `not_needed`, 404).

- [ ] **Step 1: Replace `server/routes/runner.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSubmission, addTestFiles, makeClass, makeTest, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let studentIds: number[];

const PAST = '2026-10-06T08:00:00.000Z';

const setTest = (sql: string, ...params: unknown[]) =>
  api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const setRunner = (sql: string, ...params: unknown[]) =>
  api.db.prepare(`UPDATE runner_state SET ${sql} WHERE id = 1`).bind(...params).run();
const uploadStatus = async (id: number) =>
  (await api.db.prepare('SELECT status, run_id FROM submissions WHERE id = ?').bind(id).first()) as { status: string; run_id: string | null };

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  await startTest(api, code);
  await addTestFiles(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('robot key', () => {
  it('refuses a request without a key, with a wrong key, or with an old key', async () => {
    const attempts: Record<string, string>[] = [{}, { Authorization: 'Bearer wrong-key-0123456789abcdef' }, { Authorization: 'Basic abc' }];
    for (const headers of attempts) {
      const res = await api.request('POST', '/api/runner/check', undefined, headers);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'robot_denied', message: 'Cheia robotului lipsește sau este greșită.' });
    }
    await setRobotKey(api, 'a-newer-robot-key-0123456789');
    expect((await robot('POST', '/check')).status).toBe(401);
    expect((await robotRequest(api, 'a-newer-robot-key-0123456789')('POST', '/check')).status).toBe(200);
  });

  it('refuses every key while none is stored', async () => {
    await api.db.prepare('DELETE FROM settings').run();
    expect((await robot('POST', '/check')).status).toBe(401);
  });

  it('needs no teacher login', async () => {
    const outside = await startTestApi({ env: { DEV_TEACHER_EMAIL: undefined } });
    try {
      await setRobotKey(outside);
      expect((await robotRequest(outside)('POST', '/check')).status).toBe(200);
      expect((await outside.request('GET', '/api/admin/me')).status).toBe(500);
    } finally {
      await outside.dispose();
    }
  });
});

describe('POST /api/runner/check', () => {
  it('says there is no work and saves the time of the check', async () => {
    const res = await robot('POST', '/check');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasWork: false, exerciseLists: 0, pendingGrading: 0, analyses: 0 });
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(Date.parse(detail.body.robot.lastCheckAt)).not.toBeNaN();
  });

  it('counts the exercise lists, the uploads to grade, and the analyses that wait', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 1, pendingGrading: 0, analyses: 0 });

    await setTest("exercise_list_status = 'ready'");
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 2, analyses: 0 });

    await api.db.prepare("UPDATE submissions SET status = 'graded'").run();
    await setTest("analysis_status = 'requested'");
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 0, analyses: 1 });
  });

  it('gives no work from a test whose exercise list has a problem or failed', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    for (const list of ['problem', 'failed']) {
      await setTest("status = 'evaluating', exercise_list_status = ?", list);
      expect((await robot('POST', '/check')).body.hasWork).toBe(false);
    }
  });

  it('starts a scheduled evaluation whose time has come', async () => {
    const id = await addSubmission(api, code, studentIds[0]!, { files: 1 });
    await setTest('evaluation_at = ?', PAST);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, exerciseLists: 1 });
    expect((await uploadStatus(id)).status).toBe('submitted');
  });

  it('sends back to the queue an upload left in grading by a run that died', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = 'run-1' WHERE id = ?").bind(id).run();
    await setRunner("run_id = 'run-1', heartbeat_at = ?", PAST);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, pendingGrading: 1 });
    expect(await uploadStatus(id)).toEqual({ status: 'submitted', run_id: null });
  });

  it('sends back to the queue an upload left in grading after its run ended', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = 'run-1' WHERE id = ?").bind(id).run();
    await robot('POST', '/check');
    expect(await uploadStatus(id)).toEqual({ status: 'submitted', run_id: null });
  });

  it('leaves alone the uploads that a live run is grading', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET run_id = 'run-1' WHERE id = ?").bind(id).run();
    await setRunner("run_id = 'run-1', heartbeat_at = ?", new Date().toISOString());
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: false, exerciseLists: 0, pendingGrading: 0, analyses: 0 });
    expect(await uploadStatus(id)).toEqual({ status: 'grading', run_id: 'run-1' });
  });

  it('ends a test with nothing left to grade', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'graded', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    await robot('POST', '/check');
    const row = await api.db.prepare('SELECT status FROM tests WHERE code = ?').bind(code).first();
    expect(row).toEqual({ status: 'done' });
  });
});

const RUN = 'run-0001';
const OTHER_RUN = 'run-0002';
const SUMMARY = { exerciseLists: 1, graded: 3, failed: 0, analyses: 0, stop: 'done' };

const LIST = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: '', topic: 'Fracții' },
    { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

const runner = () =>
  api.db.prepare('SELECT run_id, lease_acquired_at, heartbeat_at, last_run_finished_at, last_run_summary FROM runner_state').first<{
    run_id: string | null;
    lease_acquired_at: string | null;
    heartbeat_at: string | null;
    last_run_finished_at: string | null;
    last_run_summary: string | null;
  }>();

describe('POST /api/runner/lease', () => {
  it('gives a free lease with the number of parallel gradings', async () => {
    await api.request('PATCH', '/api/admin/settings', { maxParallelAgents: 2 });
    const res = await robot('POST', '/lease', { runId: RUN });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ granted: true, maxParallel: 2 });
    expect(await runner()).toMatchObject({ run_id: RUN });
  });

  it('refuses while another run is alive, and gives it again to the same run', async () => {
    await robot('POST', '/lease', { runId: RUN });
    expect((await robot('POST', '/lease', { runId: OTHER_RUN })).body).toEqual({ granted: false, maxParallel: 1 });
    expect((await robot('POST', '/lease', { runId: RUN })).body.granted).toBe(true);
    expect((await runner())?.run_id).toBe(RUN);
  });

  it('takes over a stale lease and sends its uploads back to the queue', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'ready'");
    const id = await addSubmission(api, code, studentIds[0]!, { status: 'grading', files: 1 });
    await api.db.prepare('UPDATE submissions SET run_id = ? WHERE id = ?').bind(RUN, id).run();
    await setRunner('run_id = ?, heartbeat_at = ?', RUN, PAST);
    expect((await robot('POST', '/lease', { runId: OTHER_RUN })).body.granted).toBe(true);
    expect(await uploadStatus(id)).toEqual({ status: 'submitted', run_id: null });
  });

  it('refuses a bad run id', async () => {
    const res = await robot('POST', '/lease', { runId: 'a b' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Id-ul rulării nu este valid.');
  });
});

describe('POST /api/runner/heartbeat and /release', () => {
  it('keeps the lease alive', async () => {
    await robot('POST', '/lease', { runId: RUN });
    await setRunner('heartbeat_at = ?', PAST);
    expect((await robot('POST', '/heartbeat', { runId: RUN })).status).toBe(200);
    expect((await runner())!.heartbeat_at! > PAST).toBe(true);
  });

  it('answers 409 to a run that lost the lease', async () => {
    await robot('POST', '/lease', { runId: RUN });
    const res = await robot('POST', '/heartbeat', { runId: OTHER_RUN });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('lease_lost');
    expect((await robot('POST', '/release', { runId: OTHER_RUN, summary: SUMMARY })).status).toBe(409);
    expect((await runner())?.run_id).toBe(RUN);
  });

  it('frees the lease and keeps the summary', async () => {
    await robot('POST', '/lease', { runId: RUN });
    const res = await robot('POST', '/release', { runId: RUN, summary: SUMMARY });
    expect(res.status).toBe(200);
    const row = await runner();
    expect(row).toMatchObject({ run_id: null, lease_acquired_at: null, heartbeat_at: null, last_run_summary: JSON.stringify(SUMMARY) });
    expect(Date.parse(row!.last_run_finished_at!)).not.toBeNaN();
    expect((await robot('POST', '/lease', { runId: OTHER_RUN })).body.granted).toBe(true);
  });

  it('refuses a summary with more than counts', async () => {
    await robot('POST', '/lease', { runId: RUN });
    const res = await robot('POST', '/release', { runId: RUN, summary: { ...SUMMARY, stop: 'tired' } });
    expect(res.status).toBe(400);
    expect((await runner())?.run_id).toBe(RUN);
  });
});

describe('GET /api/runner/tasks', () => {
  it('lists the tests that wait for an exercise list and counts the uploads to grade', async () => {
    const cls = await makeClass(api, '7A', ['Elev Unu']);
    const second = await makeTest(api, cls.id);
    await addSubmission(api, second, cls.studentIds[0]!, { status: 'submitted', files: 1 });
    await api.db.prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = 'ready' WHERE code = ?").bind(second).run();
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    const res = await robot('GET', '/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exerciseLists: [await testIdOf(api, code)], pendingGrading: 1, analyses: [] });
  });
});

describe('GET /api/runner/tests/:id', () => {
  it('gives the file types and the exercise list, without names or keys', async () => {
    const testId = await testIdOf(api, code);
    await setTest("exercise_list_json = ?, exercise_list_status = 'ready'", JSON.stringify(LIST));
    const res = await robot('GET', `/tests/${testId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      test: { id: testId, files: { test: { contentType: 'application/pdf' }, barem: { contentType: 'application/pdf' } }, exerciseList: LIST },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Pop Ion|fixture|\.pdf"/);
  });

  it('streams the test and the barem files', async () => {
    const testId = await testIdOf(api, code);
    await api.env.FILES.put(`fixture/${code}/barem.pdf`, '%PDF-1.7 barem');
    const res = await api.fetch(`/api/runner/tests/${testId}/files/barem`, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(await res.text()).toBe('%PDF-1.7 barem');
  });

  it('answers 404 for an unknown test, kind, or missing file', async () => {
    const testId = await testIdOf(api, code);
    expect((await robot('GET', '/tests/99999')).status).toBe(404);
    expect((await robot('GET', `/tests/${testId}/files/answers`)).status).toBe(404);
    expect((await robot('GET', `/tests/${testId}/files/test`)).status).toBe(404);
  });
});

describe('POST /api/runner/tests/:id/exercise-list', () => {
  let testId: number;
  const saveList = (body: object) => robot('POST', `/tests/${testId}/exercise-list`, { runId: RUN, ...body });
  const listRow = () =>
    api.db.prepare('SELECT exercise_list_status, exercise_list_message, exercise_list_attempts, exercise_list_json FROM tests WHERE id = ?').bind(testId).first<{
      exercise_list_status: string;
      exercise_list_message: string | null;
      exercise_list_attempts: number;
      exercise_list_json: string | null;
    }>();

  beforeEach(async () => {
    testId = await testIdOf(api, code);
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    await robot('POST', '/lease', { runId: RUN });
  });

  it('saves a list whose points add up as ready', async () => {
    const res = await saveList({ ok: true, exerciseList: LIST });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exerciseList: { status: 'ready', message: null } });
    const row = await listRow();
    expect(JSON.parse(row!.exercise_list_json!)).toEqual(LIST);
    expect((await robot('POST', '/check')).body).toMatchObject({ exerciseLists: 0, pendingGrading: 1 });
  });

  it('saves a list whose points do not add up as a problem for the teacher', async () => {
    const res = await saveList({ ok: true, exerciseList: { ...LIST, totalPoints: 12 } });
    expect(res.body).toEqual({ exerciseList: { status: 'problem', message: 'Punctajele din barem dau 10, dar totalul este 12.' } });
    expect((await robot('POST', '/check')).body.pendingGrading).toBe(0);
  });

  it('refuses a broken list and changes nothing', async () => {
    const res = await saveList({ ok: true, exerciseList: { ...LIST, exercises: [] } });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_result');
    expect(await listRow()).toMatchObject({ exercise_list_status: 'none', exercise_list_attempts: 0 });
  });

  it('counts failed attempts and fails the list at the third', async () => {
    for (const expected of ['none', 'none', 'failed']) {
      const res = await saveList({ ok: false, error: 'timeout' });
      expect(res.body.exerciseList.status).toBe(expected);
    }
    expect(await listRow()).toMatchObject({
      exercise_list_status: 'failed',
      exercise_list_attempts: 3,
      exercise_list_message: 'Robotul nu a terminat la timp.',
    });
  });

  it('counts no attempt for a usage limit', async () => {
    await saveList({ ok: false, error: 'usage_limit' });
    expect(await listRow()).toMatchObject({ exercise_list_status: 'none', exercise_list_attempts: 0 });
  });

  it('refuses a run without the lease, a list no longer needed, and a deleted test', async () => {
    const other = await robot('POST', `/tests/${testId}/exercise-list`, { runId: OTHER_RUN, ok: true, exerciseList: LIST });
    expect(other.status).toBe(409);
    expect(other.body.error).toBe('lease_lost');

    await setTest("exercise_list_status = 'accepted'");
    const late = await saveList({ ok: true, exerciseList: LIST });
    expect(late.status).toBe(409);
    expect(late.body.error).toBe('not_needed');

    await api.request('DELETE', `/api/admin/tests/${code}`);
    expect((await saveList({ ok: true, exerciseList: LIST })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run server/routes/runner.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  16 failed | 13 passed (29)`. 16 of the 18 new tests fail: the routes do not exist yet (`expected 404 to be 200`, `to be 409`, `to be 400`, `to be 422`). Two new tests pass already: the 404 checks, and the usage-limit test (nothing changes either way). The 11 tests of Task 4 pass.

- [ ] **Step 3: Replace `shared/runner.ts`**

```ts
import { z } from 'zod';
import type { ExerciseList } from './schemas.ts';

// The robot API (/api/runner, spec §11.3): request bodies and answers, shared
// by the API and the robot.

// A run that sent no heartbeat for this long is taken as dead (spec §11.3).
export const LEASE_STALE_MS = 15 * 60 * 1000;

export const MAX_PARALLEL_AGENTS = 4;

// What a run did, saved when it ends. Counts only: the repo and its logs are
// public, so nothing here may name a student.
export const runSummarySchema = z.object({
  exerciseLists: z.number().int().min(0),
  graded: z.number().int().min(0),
  failed: z.number().int().min(0),
  analyses: z.number().int().min(0),
  // Why the run stopped taking new work.
  stop: z.enum(['done', 'budget', 'usage_limit', 'lease_lost']),
});

export type RunSummary = z.infer<typeof runSummarySchema>;

// POST /check: what waits for the robot.
export interface CheckResult {
  hasWork: boolean;
  exerciseLists: number;
  pendingGrading: number;
  analyses: number;
}

// A run's id, made by the robot: 8-64 characters from A-Z, a-z, 0-9, "_" and "-".
export const runIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, { message: 'Id-ul rulării nu este valid.' });

export const runBody = z.object({ runId: runIdSchema });

export const releaseBody = z.object({ runId: runIdSchema, summary: runSummarySchema });

// Why a robot task failed. "usage_limit": the Claude plan reached its limit;
// the task is tried again later and counts no attempt.
export const robotErrorSchema = z.enum(['timeout', 'invalid_output', 'crash', 'usage_limit']);

export type RobotError = z.infer<typeof robotErrorSchema>;

// The exercise list is checked by checkExerciseList (shared/schemas.ts).
export const exerciseListBody = z.discriminatedUnion('ok', [
  z.object({ runId: runIdSchema, ok: z.literal(true), exerciseList: z.unknown() }),
  z.object({ runId: runIdSchema, ok: z.literal(false), error: robotErrorSchema }),
]);

// POST /lease.
export interface LeaseResult {
  granted: boolean;
  maxParallel: number;
}

// GET /tasks: test ids, and how many uploads wait for grading.
export interface TasksResult {
  exerciseLists: number[];
  pendingGrading: number;
  analyses: number[];
}

// GET /tests/:id: what the robot needs to know of a test. No names.
export interface RobotTest {
  id: number;
  files: { test: { contentType: string } | null; barem: { contentType: string } | null };
  exerciseList: ExerciseList | null;
}
```

- [ ] **Step 4: Replace `server/db/runner.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { ExerciseListInfo } from '../../shared/api.ts';
import { LEASE_STALE_MS, type CheckResult, type RobotError, type RobotTest, type RunSummary, type TasksResult } from '../../shared/runner.ts';
import type { CheckedExerciseList, ExerciseList } from '../../shared/schemas.ts';
import type { ExerciseListStatus } from '../../shared/tests.ts';
import { promoteStatements } from './lifecycle.ts';

// Queries of the robot API (spec §11.3). Each write checks its own rules in
// its SQL: runs can overlap, and parallel tasks of one run call at once.

// The time before which a heartbeat is stale.
export function staleBefore(now: string): string {
  return new Date(Date.parse(now) - LEASE_STALE_MS).toISOString();
}

// Work the robot can take now, as SQL conditions.
// A test in evaluation that waits for its exercise list.
export const NEEDS_EXERCISE_LIST = `t.status = 'evaluating' AND t.exercise_list_status = 'none'
  AND EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status = 'submitted')`;
// An upload (s) that can be graded: its test (t) is in evaluation with a usable exercise list.
export const GRADABLE = `s.status = 'submitted' AND t.status = 'evaluating' AND t.exercise_list_status IN ('ready', 'accepted')`;
// A test whose class analysis was asked for, with nothing left to grade.
export const NEEDS_ANALYSIS = `t.status = 'evaluating' AND t.analysis_status = 'requested'
  AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status IN ('submitted', 'grading'))`;

// The robot's regular check, in one transaction:
// - an upload left in grading by a run that died or ended goes back to the
//   queue, so no upload is lost when no new run takes the lease;
// - scheduled evaluations whose time has come start, and finished tests end;
// - the time of the check is saved for the robot line;
// - the counts say whether a run has work.
export async function runCheck(db: D1Database, now: string): Promise<CheckResult> {
  const results = await db.batch<{ exercise_lists: number; pending_grading: number; analyses: number }>([
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', run_id = NULL
         WHERE status = 'grading' AND NOT EXISTS (
           SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = submissions.run_id AND r.heartbeat_at >= ?)`,
      )
      .bind(staleBefore(now)),
    ...promoteStatements(db, now),
    db.prepare('UPDATE runner_state SET last_check_at = ? WHERE id = 1').bind(now),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_EXERCISE_LIST}) AS exercise_lists,
         (SELECT COUNT(*) FROM submissions s JOIN tests t ON t.id = s.test_id WHERE ${GRADABLE}) AS pending_grading,
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_ANALYSIS}) AS analyses`,
    ),
  ]);
  const counts = results.at(-1)?.results[0];
  const exerciseLists = counts?.exercise_lists ?? 0;
  const pendingGrading = counts?.pending_grading ?? 0;
  const analyses = counts?.analyses ?? 0;
  return { hasWork: exerciseLists + pendingGrading + analyses > 0, exerciseLists, pendingGrading, analyses };
}

// The run holds the lease.
const HOLDS_LEASE = 'EXISTS (SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = ?)';

// What the teacher reads when the robot gave up on a task.
export const ROBOT_ERROR_TEXT: Record<RobotError, string> = {
  timeout: 'Robotul nu a terminat la timp.',
  invalid_output: 'Robotul a dat un răspuns care nu poate fi folosit.',
  crash: 'Robotul s-a oprit cu o eroare.',
  usage_limit: 'Robotul a atins limita planului Claude.',
};

// A task fails for good after this many attempts.
export const MAX_ATTEMPTS = 3;

// Takes the lease when it is free, stale, or already this run's. A new lease
// means no other run is alive, so uploads left in grading by another run go
// back to the queue.
export async function takeLease(db: D1Database, runId: string, now: string): Promise<boolean> {
  const [taken] = await db.batch<{ run_id: string }>([
    db
      .prepare(
        `UPDATE runner_state SET run_id = ?, lease_acquired_at = ?, heartbeat_at = ?
         WHERE id = 1 AND (run_id IS NULL OR run_id = ? OR heartbeat_at IS NULL OR heartbeat_at < ?)
         RETURNING run_id`,
      )
      .bind(runId, now, now, runId, staleBefore(now)),
    db
      .prepare(
        `UPDATE submissions SET status = 'submitted', run_id = NULL
         WHERE status = 'grading' AND (run_id IS NULL OR run_id <> ?) AND ${HOLDS_LEASE}`,
      )
      .bind(runId, runId),
  ]);
  return Boolean(taken?.results.length);
}

// False when another run holds the lease now.
export async function heartbeat(db: D1Database, runId: string, now: string): Promise<boolean> {
  const row = await db
    .prepare('UPDATE runner_state SET heartbeat_at = ? WHERE id = 1 AND run_id = ? RETURNING id')
    .bind(now, runId)
    .first<{ id: number }>();
  return row !== null;
}

// Frees the lease and keeps the run's summary. False when the run no longer
// held the lease.
export async function releaseLease(db: D1Database, runId: string, summary: RunSummary, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE runner_state
       SET run_id = NULL, lease_acquired_at = NULL, heartbeat_at = NULL, last_run_finished_at = ?, last_run_summary = ?
       WHERE id = 1 AND run_id = ?
       RETURNING id`,
    )
    .bind(now, JSON.stringify(summary), runId)
    .first<{ id: number }>();
  return row !== null;
}

export async function listTasks(db: D1Database): Promise<TasksResult> {
  const [lists, grading, analyses] = await db.batch<{ id?: number; count?: number }>([
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_EXERCISE_LIST} ORDER BY t.evaluation_started_at, t.id`),
    db.prepare(`SELECT COUNT(*) AS count FROM submissions s JOIN tests t ON t.id = s.test_id WHERE ${GRADABLE}`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_ANALYSIS} ORDER BY t.id`),
  ]);
  const ids = (rows: { id?: number }[] | undefined) => (rows ?? []).map((row) => row.id!);
  return { exerciseLists: ids(lists?.results), pendingGrading: grading?.results[0]?.count ?? 0, analyses: ids(analyses?.results) };
}

export interface RobotTestRecord {
  test: RobotTest;
  // R2 keys: the robot never sees them.
  keys: { test: string | null; barem: string | null };
}

export async function findRobotTest(db: D1Database, testId: number): Promise<RobotTestRecord | null> {
  const row = await db
    .prepare('SELECT id, test_file_key, test_file_type, barem_file_key, barem_file_type, exercise_list_json FROM tests WHERE id = ?')
    .bind(testId)
    .first<{
      id: number;
      test_file_key: string | null;
      test_file_type: string | null;
      barem_file_key: string | null;
      barem_file_type: string | null;
      exercise_list_json: string | null;
    }>();
  if (!row) return null;
  const file = (key: string | null, type: string | null) => (key && type ? { contentType: type } : null);
  return {
    test: {
      id: row.id,
      files: { test: file(row.test_file_key, row.test_file_type), barem: file(row.barem_file_key, row.barem_file_type) },
      exerciseList: row.exercise_list_json ? (JSON.parse(row.exercise_list_json) as ExerciseList) : null,
    },
    keys: { test: row.test_file_key, barem: row.barem_file_key },
  };
}

// The exercise list is saved only for a test in evaluation that waits for
// it, and only from the run that holds the lease.
const WAITS_FOR_LIST = `id = ? AND status = 'evaluating' AND exercise_list_status = 'none' AND ${HOLDS_LEASE}`;

function listInfo(row: { exercise_list_status: ExerciseListStatus; exercise_list_message: string | null } | null): ExerciseListInfo | null {
  return row ? { status: row.exercise_list_status, message: row.exercise_list_message } : null;
}

// Null when the list was not saved.
export async function saveExerciseList(
  db: D1Database,
  testId: number,
  runId: string,
  checked: CheckedExerciseList,
  now: string,
): Promise<ExerciseListInfo | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_json = ?, exercise_list_status = ?, exercise_list_message = ?, updated_at = ?
       WHERE ${WAITS_FOR_LIST}
       RETURNING exercise_list_status, exercise_list_message`,
    )
    .bind(JSON.stringify(checked.list), checked.status, checked.message, now, testId, runId)
    .first<{ exercise_list_status: ExerciseListStatus; exercise_list_message: string | null }>();
  return listInfo(row);
}

// The robot could not make the list: one more attempt is counted (none for a
// usage limit), and at MAX_ATTEMPTS the list fails with a message for the
// teacher. Null when nothing was saved.
export async function failExerciseList(
  db: D1Database,
  testId: number,
  runId: string,
  error: RobotError,
  now: string,
): Promise<ExerciseListInfo | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_attempts = exercise_list_attempts + ?,
         exercise_list_status = CASE WHEN exercise_list_attempts + ? >= ? THEN 'failed' ELSE 'none' END,
         exercise_list_message = CASE WHEN exercise_list_attempts + ? >= ? THEN ? ELSE NULL END,
         updated_at = ?
       WHERE ${WAITS_FOR_LIST}
       RETURNING exercise_list_status, exercise_list_message`,
    )
    .bind(counted, counted, MAX_ATTEMPTS, counted, MAX_ATTEMPTS, ROBOT_ERROR_TEXT[error], now, testId, runId)
    .first<{ exercise_list_status: ExerciseListStatus; exercise_list_message: string | null }>();
  return listInfo(row);
}

// Whether the run holds the lease now.
export async function holdsLease(db: D1Database, runId: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS held FROM runner_state WHERE id = 1 AND run_id = ?').bind(runId).first<{ held: number }>();
  return row !== null;
}
```

- [ ] **Step 5: Replace `server/routes/runner.ts`**

```ts
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { ExerciseListInfo } from '../../shared/api.ts';
import { isTestFileKind } from '../../shared/files.ts';
import { exerciseListBody, releaseBody, runBody } from '../../shared/runner.ts';
import { checkExerciseList } from '../../shared/schemas.ts';
import { robotAuth } from '../auth/robotAuth.ts';
import {
  failExerciseList,
  findRobotTest,
  heartbeat,
  holdsLease,
  listTasks,
  releaseLease,
  runCheck,
  saveExerciseList,
  takeLease,
} from '../db/runner.ts';
import { getMaxParallel } from '../db/settings.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseId, readJson } from '../http.ts';
import { fileResponse } from '../uploads.ts';

const leaseLost = () => new ApiError(409, 'lease_lost', 'Altă rulare a robotului lucrează acum.');
// A broken output: the robot counts it as invalid_output.
const invalidResult = () => new ApiError(422, 'invalid_result', 'Rezultatul robotului nu poate fi folosit.');

// Why a robot write changed nothing: the test is gone (404, the robot drops
// the result), another run holds the lease, or the work is no longer needed.
async function refusedWrite(c: Context<AppEnv>, runId: string, exists: boolean, notNeeded: () => ApiError): Promise<ApiError> {
  if (!exists) return notFound();
  if (!(await holdsLease(c.env.DB, runId))) return leaseLost();
  return notNeeded();
}

// /api/runner: the evaluation robot (spec §11.3). Every route needs the robot
// key. Answers carry ids and counts, never student names.
export function runnerRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  routes.use('*', robotAuth());

  // The 10-minute check: is there work for a run?
  routes.post('/check', async (c) => c.json(await runCheck(c.env.DB, nowIso())));

  // Only one run works at a time (spec §12.2).
  routes.post('/lease', async (c) => {
    const { runId } = await readJson(c, runBody);
    const granted = await takeLease(c.env.DB, runId, nowIso());
    return c.json({ granted, maxParallel: await getMaxParallel(c.env.DB) });
  });

  routes.post('/heartbeat', async (c) => {
    const { runId } = await readJson(c, runBody);
    if (!(await heartbeat(c.env.DB, runId, nowIso()))) throw leaseLost();
    return c.json({ ok: true });
  });

  routes.post('/release', async (c) => {
    const { runId, summary } = await readJson(c, releaseBody);
    if (!(await releaseLease(c.env.DB, runId, summary, nowIso()))) throw leaseLost();
    return c.json({ released: true });
  });

  routes.get('/tasks', async (c) => c.json(await listTasks(c.env.DB)));

  routes.get('/tests/:id', async (c) => {
    const found = await findRobotTest(c.env.DB, parseId(c.req.param('id')));
    if (!found) throw notFound();
    return c.json({ test: found.test });
  });

  routes.get('/tests/:id/files/:kind', async (c) => {
    const kind = c.req.param('kind');
    const found = await findRobotTest(c.env.DB, parseId(c.req.param('id')));
    if (!found || !isTestFileKind(kind)) throw notFound();
    const key = found.keys[kind];
    const type = found.test.files[kind]?.contentType;
    const object = key ? await c.env.FILES.get(key) : null;
    if (!object || !type) throw notFound();
    return fileResponse(object, kind, type);
  });

  // The exercise list of a test, or why the robot could not make it.
  routes.post('/tests/:id/exercise-list', async (c) => {
    const testId = parseId(c.req.param('id'));
    const body = await readJson(c, exerciseListBody);
    const now = nowIso();
    let saved: ExerciseListInfo | null;
    if (body.ok) {
      const checked = checkExerciseList(body.exerciseList);
      if (!checked.ok) throw invalidResult();
      saved = await saveExerciseList(c.env.DB, testId, body.runId, checked.value, now);
    } else {
      saved = await failExerciseList(c.env.DB, testId, body.runId, body.error, now);
    }
    if (!saved) {
      const exists = (await findRobotTest(c.env.DB, testId)) !== null;
      throw await refusedWrite(c, body.runId, exists, () => new ApiError(409, 'not_needed', 'Lista de exerciții nu mai este cerută.'));
    }
    return c.json({ exerciseList: saved });
  });

  return routes;
}
```

- [ ] **Step 6: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  45 passed (45)`, `Tests  475 passed (475)`.

- [ ] **Step 7: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add shared/runner.ts server/db/runner.ts server/routes/runner.ts server/routes/runner.test.ts
git commit -m "Add the robot's lease, work list, test files, and exercise list"
```

---

### Task 6: Claim, pages, and results

The robot claims the oldest upload it can grade, reads its pages by id, and saves the grading, which code checks and scores; or it reports why it could not grade. A graded upload stays "done" for the student, and the student API shows nothing of the grading.

**Files:**
- Modify: `shared/runner.ts`, `server/db/runner.ts`, `server/routes/runner.ts`
- Test: `server/routes/runnerGrading.test.ts` (new)

**Interfaces:**
- Consumes: `checkGrading` (Task 1), `finishTests` (Task 2); `HOLDS_LEASE`, `GRADABLE`, `ROBOT_ERROR_TEXT`, `MAX_ATTEMPTS`, `holdsLease` in `server/db/runner.ts` and the private `leaseLost` and `invalidResult` in `server/routes/runner.ts` (Tasks 4–5).
- Produces:
  - In `shared/runner.ts`: `resultBody` and `ClaimResult { submissionId, testId, files: { id, contentType, position }[] }`.
  - In `server/db/runner.ts`: `claimSubmission(db, runId)`, `findRobotFile(db, submissionId, fileId)`, `findGrading(db, submissionId)`, `saveGrading(db, submissionId, runId, grading, raw, model, now)`, `failGrading(db, submissionId, runId, error, now)`.
  - `POST /claim` `{ runId }` → `ClaimResult` or 204 (409 `lease_lost`); `GET /submissions/:id/files/:fileId` (named `file-<id>`); `POST /submissions/:id/result` → `{ status }` (404, 409 `taken_over`, 422 `invalid_result`).

- [ ] **Step 1: Create `server/routes/runnerGrading.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseList } from '../../shared/schemas.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { sha256Hex } from '../secrets.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let studentIds: number[];

const RUN = 'run-0001';
const OTHER_RUN = 'run-0002';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: '', topic: 'Fracții' },
    { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

function result(points: [number, number], extra: object = {}) {
  return {
    items: [
      { exerciseId: 'I.1', points: points[0], studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '' },
      { exerciseId: 'II.1', points: points[1], studentAnswer: 'x = 3', comment: 'Verifică semnul.', confidence: 'low', needsReview: false, reviewReason: '' },
    ],
    unreadable: [],
    summary: 'Ai lucrat bine.',
    strengths: ['Fracții'],
    recommendations: ['Exersează ecuațiile.'],
    ...extra,
  };
}

const uploadRow = (id: number) =>
  api.db.prepare('SELECT status, run_id, attempts, last_error, graded_at FROM submissions WHERE id = ?').bind(id).first<{
    status: string;
    run_id: string | null;
    attempts: number;
    last_error: string | null;
    graded_at: string | null;
  }>();
const testStatus = async () =>
  (await api.db.prepare('SELECT status FROM tests WHERE id = ?').bind(testId).first<{ status: string }>())?.status;
const claim = (runId = RUN) => robot('POST', '/claim', { runId });
const sendResult = (id: number, body: object) => robot('POST', `/submissions/${id}/result`, { runId: RUN, ...body });

async function upload(index: number, submittedAt: string, files = 1): Promise<number> {
  const id = await addSubmission(api, code, studentIds[index]!, { status: 'submitted', files });
  await api.db.prepare('UPDATE submissions SET submitted_at = ? WHERE id = ?').bind(submittedAt, id).run();
  return id;
}

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana', 'Stan Eva']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  testId = await testIdOf(api, code);
  await startTest(api, code);
  await addTestFiles(api, code);
  await api.db
    .prepare("UPDATE tests SET status = 'evaluating', exercise_list_status = 'ready', exercise_list_json = ? WHERE id = ?")
    .bind(JSON.stringify(LIST), testId)
    .run();
  await robot('POST', '/lease', { runId: RUN });
});

afterEach(async () => {
  await api.dispose();
});

describe('POST /api/runner/claim', () => {
  it('takes the oldest upload and gives its files in upload order, without names', async () => {
    await upload(0, '2026-10-07T08:20:00.000Z');
    const oldest = await upload(1, '2026-10-07T08:10:00.000Z', 2);
    const res = await claim();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      submissionId: oldest,
      testId,
      files: [
        { id: expect.any(Number), contentType: 'image/jpeg', position: 1 },
        { id: expect.any(Number), contentType: 'image/jpeg', position: 2 },
      ],
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Ionescu|poza/);
    expect(await uploadRow(oldest)).toMatchObject({ status: 'grading', run_id: RUN });
  });

  it('never gives one upload to two parallel claims', async () => {
    const ids = [await upload(0, '2026-10-07T08:10:00.000Z'), await upload(1, '2026-10-07T08:11:00.000Z')];
    const answers = await Promise.all([claim(), claim(), claim()]);
    const claimed = answers.filter((res) => res.status === 200).map((res) => res.body.submissionId);
    expect(claimed.sort()).toEqual(ids.sort());
    expect(answers.filter((res) => res.status === 204)).toHaveLength(1);
  });

  it('answers 204 when nothing can be graded', async () => {
    await upload(0, '2026-10-07T08:10:00.000Z');
    await api.db.prepare("UPDATE tests SET exercise_list_status = 'problem' WHERE id = ?").bind(testId).run();
    const res = await claim();
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it('refuses a run without the lease', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    const res = await claim(OTHER_RUN);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('lease_lost');
    expect(await uploadRow(id)).toMatchObject({ status: 'submitted', run_id: null });
  });
});

describe('GET /api/runner/submissions/:id/files/:fileId', () => {
  it("streams a student's page without its name", async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await api.env.FILES.put(`fixture/${id}/1.jpg`, 'page one');
    const { files } = (await claim()).body;
    const res = await api.fetch(`/api/runner/submissions/${id}/files/${files[0].id}`, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Content-Disposition')).toBe(`inline; filename*=UTF-8''file-${files[0].id}`);
    expect(await res.text()).toBe('page one');
  });

  it('answers 404 for a file of another upload', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    const other = await upload(1, '2026-10-07T08:11:00.000Z');
    const row = await api.db.prepare('SELECT id FROM submission_files WHERE submission_id = ?').bind(other).first<{ id: number }>();
    expect((await robot('GET', `/submissions/${id}/files/${row!.id}`)).status).toBe(404);
  });
});

describe('POST /api/runner/submissions/:id/result', () => {
  it('saves the grading, computes the grade, and shows it to the teacher', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await claim();
    const res = await sendResult(id, { ok: true, result: result([4, 2.5]), model: 'claude-opus' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'graded' });

    expect(await uploadRow(id)).toMatchObject({ status: 'graded', run_id: null, last_error: null });
    const evaluation = await api.db
      .prepare('SELECT max_total, office_points, total, grade, needs_review, summary, model, raw_json FROM evaluations WHERE submission_id = ?')
      .bind(id)
      .first<Record<string, unknown>>();
    expect(evaluation).toMatchObject({ max_total: 10, office_points: 1, total: 7.5, grade: 7.5, needs_review: 1, summary: 'Ai lucrat bine.', model: 'claude-opus' });
    expect(JSON.parse(evaluation!.raw_json as string)).toEqual(result([4, 2.5]));
    const items = await api.db
      .prepare(
        `SELECT exercise_id, position, label, max_points, ai_points, points, confidence, needs_review, review_reason
         FROM evaluation_items ORDER BY position`,
      )
      .all();
    expect(items.results).toEqual([
      { exercise_id: 'I.1', position: 1, label: 'Subiectul I, exercițiul 1', max_points: 4.5, ai_points: 4, points: 4, confidence: 'high', needs_review: 0, review_reason: '' },
      {
        exercise_id: 'II.1',
        position: 2,
        label: 'Subiectul II, exercițiul 1',
        max_points: 4.5,
        ai_points: 2.5,
        points: 2.5,
        confidence: 'low',
        needs_review: 1,
        review_reason: 'Robotul nu este sigur de acest punctaj.',
      },
    ]);

    const detail = await api.request('GET', `/api/admin/tests/${code}`);
    expect(detail.body.test).toMatchObject({ status: 'done', gradedCount: 1 });
    expect(detail.body.uploads.find((row: { submissionId: number }) => row.submissionId === id)).toMatchObject({ grade: 7.5, flagCount: 1 });
  });

  it('saves a grading of 60 exercises', async () => {
    const exercises = Array.from({ length: 60 }, (_, i) => ({ id: `E${i + 1}`, label: `Ex ${i + 1}`, maxPoints: 0.15, answer: '', scoringNotes: '', topic: '' }));
    await api.db
      .prepare('UPDATE tests SET exercise_list_json = ? WHERE id = ?')
      .bind(JSON.stringify({ totalPoints: 10, officePoints: 1, exercises, notes: '' }), testId)
      .run();
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await claim();
    const items = exercises.map((exercise) => ({
      exerciseId: exercise.id,
      points: 0.15,
      studentAnswer: '',
      comment: '',
      confidence: 'high',
      needsReview: false,
      reviewReason: '',
    }));
    const res = await sendResult(id, { ok: true, result: { ...result([0, 0]), items }, model: 'm' });
    expect(res.body).toEqual({ status: 'graded' });
    const count = await api.db.prepare('SELECT COUNT(*) AS n FROM evaluation_items').first<{ n: number }>();
    expect(count?.n).toBe(60);
    const grade = await api.db.prepare('SELECT grade FROM evaluations WHERE submission_id = ?').bind(id).first<{ grade: number }>();
    expect(grade?.grade).toBe(10);
  });

  it('refuses a broken grading and keeps the upload in grading', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await claim();
    const res = await sendResult(id, { ok: true, result: { ...result([4, 4]), items: [] }, model: 'm' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_result');
    expect(await uploadRow(id)).toMatchObject({ status: 'grading', run_id: RUN });
    expect(await api.db.prepare('SELECT COUNT(*) AS n FROM evaluations').first()).toEqual({ n: 0 });
  });

  it('refuses a result from another run, for an upload not in grading, and for a deleted upload', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    const waiting = await upload(1, '2026-10-07T08:20:00.000Z');
    await claim();
    const other = await robot('POST', `/submissions/${id}/result`, { runId: OTHER_RUN, ok: true, result: result([4, 4]), model: 'm' });
    expect(other.status).toBe(409);
    expect(other.body.error).toBe('taken_over');
    expect((await sendResult(waiting, { ok: true, result: result([4, 4]), model: 'm' })).status).toBe(409);

    await api.request('POST', `/api/admin/submissions/${id}/reset`);
    expect((await sendResult(id, { ok: true, result: result([4, 4]), model: 'm' })).status).toBe(404);
  });

  it('refuses the result of a run whose uploads a new run took over', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await claim();
    await api.db.prepare("UPDATE runner_state SET heartbeat_at = '2026-10-06T08:00:00.000Z' WHERE id = 1").run();
    expect((await robot('POST', '/lease', { runId: OTHER_RUN })).body.granted).toBe(true);
    const res = await sendResult(id, { ok: true, result: result([4, 4]), model: 'm' });
    expect(res.status).toBe(409);
    expect(await uploadRow(id)).toMatchObject({ status: 'submitted', run_id: null });
  });

  it('counts failed attempts, fails the upload at the third, and then ends the test', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    for (const expected of ['submitted', 'submitted', 'failed']) {
      expect((await claim()).body.submissionId).toBe(id);
      const res = await sendResult(id, { ok: false, error: 'crash' });
      expect(res.body).toEqual({ status: expected });
    }
    expect(await uploadRow(id)).toMatchObject({ status: 'failed', attempts: 3, last_error: 'Robotul s-a oprit cu o eroare.', run_id: null });
    expect(await testStatus()).toBe('done');
  });

  it('counts no attempt for a usage limit', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await claim();
    expect((await sendResult(id, { ok: false, error: 'usage_limit' })).body).toEqual({ status: 'submitted' });
    expect(await uploadRow(id)).toMatchObject({ status: 'submitted', attempts: 0, last_error: null });
    expect(await testStatus()).toBe('evaluating');
  });
});

describe('the student app after grading', () => {
  it('shows a graded student as done and tells the phone nothing of the grading', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z');
    await api.db.prepare('UPDATE submissions SET session_hash = ? WHERE id = ?').bind(await sha256Hex('phone-secret'), id).run();
    await claim();
    await sendResult(id, { ok: true, result: result([4, 2.5]), model: 'm' });
    await api.request('POST', `/api/admin/tests/${code}/reopen`);
    const token = (await api.db.prepare('SELECT upload_token FROM tests WHERE id = ?').bind(testId).first<{ upload_token: string }>())!.upload_token;

    const link = await api.request('GET', `/api/u/${token}`);
    expect(link.body.students.find((student: { id: number }) => student.id === studentIds[0])).toEqual({
      id: studentIds[0],
      name: 'Pop Ion',
      state: 'done',
    });
    const again = await api.request('POST', `/api/u/${token}/sessions`, { studentId: studentIds[0] }, { 'X-Upload-Session': 'phone-secret' });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('already_submitted');
    const files = await api.request('GET', `/api/u/${token}/files`, undefined, { 'X-Upload-Session': 'phone-secret' });
    expect(files.status).toBe(200);
    for (const answer of [link.body, again.body, files.body]) {
      expect(JSON.stringify(answer)).not.toMatch(/"grade"|Corect\.|Verifică semnul|Ai lucrat bine|Robotul|Exersează/);
    }
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run server/routes/runnerGrading.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  12 failed | 2 passed (14)`. The claim, page, and result routes do not exist yet (`expected 404 to be 200`, `expected 404 to be 409`, `expected [] to deeply equal [ 1, 2 ]`). Two tests pass already: the 404 for a file of another upload, and the student-app test, which guards what students see: that already holds before this task.

- [ ] **Step 3: Edit `shared/runner.ts`**

Find this block:

```ts
  exerciseList: ExerciseList | null;
}
```

Replace it with:

```ts
  exerciseList: ExerciseList | null;
}

// A grading, checked by checkGrading (shared/schemas.ts), or why the robot
// could not grade. Only a usage limit is tried again without an attempt.
export const resultBody = z.discriminatedUnion('ok', [
  z.object({ runId: runIdSchema, ok: z.literal(true), result: z.unknown(), model: z.string().max(100) }),
  z.object({ runId: runIdSchema, ok: z.literal(false), error: robotErrorSchema }),
]);

// POST /claim: an upload to grade, its test, and its files in upload order.
// No names: the robot names the pages by their order.
export interface ClaimResult {
  submissionId: number;
  testId: number;
  files: { id: number; contentType: string; position: number }[];
}
```

- [ ] **Step 4: Edit `server/db/runner.ts`**

Find this block:

```ts
import type { ExerciseListInfo } from '../../shared/api.ts';
import { LEASE_STALE_MS, type CheckResult, type RobotError, type RobotTest, type RunSummary, type TasksResult } from '../../shared/runner.ts';
import type { CheckedExerciseList, ExerciseList } from '../../shared/schemas.ts';
import type { ExerciseListStatus } from '../../shared/tests.ts';
import { promoteStatements } from './lifecycle.ts';

```

Replace it with:

```ts
import type { ExerciseListInfo } from '../../shared/api.ts';
import {
  LEASE_STALE_MS,
  type CheckResult,
  type ClaimResult,
  type RobotError,
  type RobotTest,
  type RunSummary,
  type TasksResult,
} from '../../shared/runner.ts';
import type { CheckedExerciseList, ExerciseList, Grading } from '../../shared/schemas.ts';
import type { ExerciseListStatus } from '../../shared/tests.ts';
import { finishTests, promoteStatements } from './lifecycle.ts';

```

- [ ] **Step 5: Edit `server/db/runner.ts`**

Find this block:

```ts
  const row = await db.prepare('SELECT 1 AS held FROM runner_state WHERE id = 1 AND run_id = ?').bind(runId).first<{ held: number }>();
  return row !== null;
}
```

Replace it with:

```ts
  const row = await db.prepare('SELECT 1 AS held FROM runner_state WHERE id = 1 AND run_id = ?').bind(runId).first<{ held: number }>();
  return row !== null;
}

// Takes the oldest upload that can be graded and marks it as this run's. One
// statement, so parallel claims never take the same upload. Null when there
// is none, or when the run does not hold the lease.
export async function claimSubmission(db: D1Database, runId: string): Promise<ClaimResult | null> {
  const claimed = await db
    .prepare(
      `UPDATE submissions SET status = 'grading', run_id = ?
       WHERE id = (SELECT s.id FROM submissions s JOIN tests t ON t.id = s.test_id WHERE ${GRADABLE} ORDER BY s.submitted_at, s.id LIMIT 1)
         AND status = 'submitted' AND ${HOLDS_LEASE}
       RETURNING id, test_id`,
    )
    .bind(runId, runId)
    .first<{ id: number; test_id: number }>();
  if (!claimed) return null;
  const { results } = await db
    .prepare('SELECT id, content_type, position FROM submission_files WHERE submission_id = ? ORDER BY position, id')
    .bind(claimed.id)
    .all<{ id: number; content_type: string; position: number }>();
  return {
    submissionId: claimed.id,
    testId: claimed.test_id,
    files: results.map((row) => ({ id: row.id, contentType: row.content_type, position: row.position })),
  };
}

// A student file for the robot: its key and type, never its name.
export async function findRobotFile(db: D1Database, submissionId: number, fileId: number): Promise<{ key: string; contentType: string } | null> {
  const row = await db
    .prepare('SELECT r2_key, content_type FROM submission_files WHERE id = ? AND submission_id = ?')
    .bind(fileId, submissionId)
    .first<{ r2_key: string; content_type: string }>();
  return row ? { key: row.r2_key, contentType: row.content_type } : null;
}

// An upload as the result route sees it, with the exercise list of its test.
export async function findGrading(
  db: D1Database,
  submissionId: number,
): Promise<{ status: string; runId: string | null; exerciseList: ExerciseList | null } | null> {
  const row = await db
    .prepare('SELECT s.status, s.run_id, t.exercise_list_json FROM submissions s JOIN tests t ON t.id = s.test_id WHERE s.id = ?')
    .bind(submissionId)
    .first<{ status: string; run_id: string | null; exercise_list_json: string | null }>();
  if (!row) return null;
  const exerciseList = row.exercise_list_json ? (JSON.parse(row.exercise_list_json) as ExerciseList) : null;
  return { status: row.status, runId: row.run_id, exerciseList };
}

// This run is grading the upload.
const GRADED_BY_RUN = "EXISTS (SELECT 1 FROM submissions s WHERE s.id = ? AND s.status = 'grading' AND s.run_id = ?)";

// Saves the grading, its items, and the graded upload in one transaction,
// with a fixed number of queries whatever the number of items. False when
// the upload is no longer this run's.
export async function saveGrading(
  db: D1Database,
  submissionId: number,
  runId: string,
  grading: Grading,
  raw: unknown,
  model: string,
  now: string,
): Promise<boolean> {
  const items = JSON.stringify(
    grading.items.map((item) => ({ ...item, needsReview: item.needsReview ? 1 : 0 })),
  );
  const results = await db.batch([
    db.prepare(`DELETE FROM evaluations WHERE submission_id = ? AND ${GRADED_BY_RUN}`).bind(submissionId, submissionId, runId),
    db
      .prepare(
        `INSERT INTO evaluations (submission_id, max_total, office_points, total, grade, needs_review, summary,
           strengths_json, recommendations_json, unreadable_json, raw_json, model, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${GRADED_BY_RUN}`,
      )
      .bind(
        submissionId,
        grading.maxTotal,
        grading.officePoints,
        grading.total,
        grading.grade,
        grading.needsReview ? 1 : 0,
        grading.summary,
        JSON.stringify(grading.strengths),
        JSON.stringify(grading.recommendations),
        JSON.stringify(grading.unreadable),
        JSON.stringify(raw),
        model,
        now,
        now,
        submissionId,
        runId,
      ),
    db
      .prepare(
        `INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason)
         SELECT e.id, json_extract(j.value, '$.exerciseId'), json_extract(j.value, '$.position'), json_extract(j.value, '$.label'),
           json_extract(j.value, '$.maxPoints'), json_extract(j.value, '$.points'), json_extract(j.value, '$.points'),
           json_extract(j.value, '$.studentAnswer'), json_extract(j.value, '$.comment'), json_extract(j.value, '$.confidence'),
           json_extract(j.value, '$.needsReview'), json_extract(j.value, '$.reviewReason')
         FROM json_each(?) j JOIN evaluations e ON e.submission_id = ?
         WHERE ${GRADED_BY_RUN}`,
      )
      .bind(items, submissionId, submissionId, runId),
    db
      .prepare(
        `UPDATE submissions SET status = 'graded', graded_at = ?, run_id = NULL, last_error = NULL
         WHERE id = ? AND status = 'grading' AND run_id = ?
         RETURNING id`,
      )
      .bind(now, submissionId, runId),
    finishTests(db, now),
  ]);
  return Boolean(results[3]?.results.length);
}

// The robot could not grade: the upload goes back to the queue with one more
// attempt (none for a usage limit), and fails at MAX_ATTEMPTS with a message
// for the teacher. Null when the upload is no longer this run's.
export async function failGrading(
  db: D1Database,
  submissionId: number,
  runId: string,
  error: RobotError,
  now: string,
): Promise<'submitted' | 'failed' | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const [updated] = await db.batch<{ status: 'submitted' | 'failed' }>([
    db
      .prepare(
        `UPDATE submissions SET attempts = attempts + ?,
           status = CASE WHEN attempts + ? >= ? THEN 'failed' ELSE 'submitted' END,
           last_error = CASE WHEN attempts + ? >= ? THEN ? ELSE last_error END,
           run_id = NULL
         WHERE id = ? AND status = 'grading' AND run_id = ?
         RETURNING status`,
      )
      .bind(counted, counted, MAX_ATTEMPTS, counted, MAX_ATTEMPTS, ROBOT_ERROR_TEXT[error], submissionId, runId),
    finishTests(db, now),
  ]);
  return updated?.results[0]?.status ?? null;
}
```

- [ ] **Step 6: Edit `server/routes/runner.ts`**

Find this block:

```ts
import { isTestFileKind } from '../../shared/files.ts';
import { exerciseListBody, releaseBody, runBody } from '../../shared/runner.ts';
import { checkExerciseList } from '../../shared/schemas.ts';
import { robotAuth } from '../auth/robotAuth.ts';
import {
  failExerciseList,
  findRobotTest,
```

Replace it with:

```ts
import { isTestFileKind } from '../../shared/files.ts';
import { exerciseListBody, releaseBody, resultBody, runBody } from '../../shared/runner.ts';
import { checkExerciseList, checkGrading } from '../../shared/schemas.ts';
import { robotAuth } from '../auth/robotAuth.ts';
import {
  claimSubmission,
  failExerciseList,
  failGrading,
  findGrading,
  findRobotFile,
  findRobotTest,
```

- [ ] **Step 7: Edit `server/routes/runner.ts`**

Find this block:

```ts
  saveExerciseList,
  takeLease,
```

Replace it with:

```ts
  saveExerciseList,
  saveGrading,
  takeLease,
```

- [ ] **Step 8: Edit `server/routes/runner.ts`**

Find this block:

```ts

  return routes;
```

Replace it with:

```ts

  // The oldest upload that can be graded, now this run's; 204 when none.
  routes.post('/claim', async (c) => {
    const { runId } = await readJson(c, runBody);
    const claimed = await claimSubmission(c.env.DB, runId);
    if (claimed) return c.json(claimed);
    if (!(await holdsLease(c.env.DB, runId))) throw leaseLost();
    return c.body(null, 204);
  });

  // A student's page. Its name stays out: the student may have typed a name in it.
  routes.get('/submissions/:id/files/:fileId', async (c) => {
    const fileId = parseId(c.req.param('fileId'));
    const file = await findRobotFile(c.env.DB, parseId(c.req.param('id')), fileId);
    const object = file ? await c.env.FILES.get(file.key) : null;
    if (!file || !object) throw notFound();
    return fileResponse(object, `file-${fileId}`, file.contentType);
  });

  // A grading, or why the robot could not grade. Accepted only from the run
  // that is grading the upload; otherwise 409 and the robot drops it (spec §11.3).
  routes.post('/submissions/:id/result', async (c) => {
    const submissionId = parseId(c.req.param('id'));
    const body = await readJson(c, resultBody);
    const takenOver = () => new ApiError(409, 'taken_over', 'Lucrarea nu mai este corectată de această rulare.');
    const current = await findGrading(c.env.DB, submissionId);
    if (!current) throw notFound();
    if (current.status !== 'grading' || current.runId !== body.runId) throw takenOver();
    const now = nowIso();
    if (body.ok) {
      if (!current.exerciseList) throw takenOver();
      const checked = checkGrading(body.result, current.exerciseList);
      if (!checked.ok) throw invalidResult();
      if (!(await saveGrading(c.env.DB, submissionId, body.runId, checked.value, body.result, body.model, now))) {
        throw (await findGrading(c.env.DB, submissionId)) ? takenOver() : notFound();
      }
      return c.json({ status: 'graded' });
    }
    const status = await failGrading(c.env.DB, submissionId, body.runId, body.error, now);
    if (!status) throw (await findGrading(c.env.DB, submissionId)) ? takenOver() : notFound();
    return c.json({ status });
  });

  return routes;
```

- [ ] **Step 9: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  46 passed (46)`, `Tests  489 passed (489)`.

- [ ] **Step 10: Run the typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0.

- [ ] **Step 11: Commit**

```bash
git add shared/runner.ts server/db/runner.ts server/routes/runner.ts server/routes/runnerGrading.test.ts
git commit -m "Let the robot claim uploads, read their pages, and save gradings"
```

---

### Task 7: The test page: start or schedule the evaluation, the robot's problems, and grades

The test page gets an "Evaluarea" section: start now (after a confirm), schedule in Romania's time, cancel the schedule, the barem warning with its buttons, and the robot line. The uploads table shows the grade, the items to check, and a failed grading with "Reîncearcă". The tests list shows how many uploads are graded.

**Files:**
- Create: `src/ui/bucharestTime.ts`, `src/admin/testPage/EvaluationControls.tsx`, `src/admin/testPage/ExerciseListBanner.tsx`, `src/admin/testPage/RobotLine.tsx`
- Modify: `src/ui/format.ts`, `src/ui/brand.css`, `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/admin/testPage/UploadsTable.tsx`, `src/admin/testPage/TestFiles.tsx`, `src/admin/pages/TestPage.tsx`, `src/admin/pages/TestsPage.tsx`
- Test: `src/ui/bucharestTime.test.ts`, `src/admin/testPage/RobotLine.test.tsx` (new); `src/ui/format.test.ts`, `src/admin/api.test.ts`, `src/admin/pages/TestPage.test.tsx`, `src/admin/pages/TestsPage.test.tsx` (modified)

**Interfaces:**
- Consumes: the routes and types of Tasks 2–4 (`EvaluationStart`, `RobotStart`, `ExerciseListInfo`, `TestDetail.robot`, the new `UploadRow` fields), `formatPoints` (Task 1), `MAX_SCHEDULE_DAYS` (Task 2).
- Produces:
  - `bucharestInputValue(iso)` and `bucharestInputToIso(value): string | null` in `src/ui/bucharestTime.ts`.
  - `robotStartMessage(robot)` in `src/ui/format.ts`; the CSS class `warning`.
  - `AdminApi` gains `evaluateTest(code, at?)`, `cancelSchedule(code)`, `acceptExerciseList(code)`, `retryExerciseList(code)`, `retrySubmission(submissionId)`; the fake has the same.
  - `EvaluationControls`, `ExerciseListBanner`, `RobotLine` and `robotLine(lastCheckAt, now)`; `UploadsTable` takes `onRobot`.

- [ ] **Step 1: Create `src/ui/bucharestTime.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { bucharestInputToIso, bucharestInputValue } from './bucharestTime.ts';

describe('bucharestInputToIso', () => {
  it('reads summer and winter times', () => {
    expect(bucharestInputToIso('2026-10-20T10:15')).toBe('2026-10-20T07:15:00.000Z');
    expect(bucharestInputToIso('2026-12-01T08:00')).toBe('2026-12-01T06:00:00.000Z');
  });

  it('takes the later instant in the hour that repeats on 25 Oct 2026', () => {
    expect(bucharestInputToIso('2026-10-25T02:59')).toBe('2026-10-24T23:59:00.000Z');
    expect(bucharestInputToIso('2026-10-25T03:30')).toBe('2026-10-25T01:30:00.000Z');
    expect(bucharestInputToIso('2026-10-25T04:00')).toBe('2026-10-25T02:00:00.000Z');
  });

  it('moves a time skipped on 29 Mar 2026 forward by an hour', () => {
    expect(bucharestInputToIso('2026-03-29T02:30')).toBe('2026-03-29T00:30:00.000Z');
    expect(bucharestInputToIso('2026-03-29T03:30')).toBe('2026-03-29T01:30:00.000Z');
    expect(bucharestInputToIso('2026-03-29T04:30')).toBe('2026-03-29T01:30:00.000Z');
  });

  it.each(['', 'mâine', '2026-02-31T10:00', '2026-10-20T25:00', '2026-10-20 10:15'])('refuses %j', (value) => {
    expect(bucharestInputToIso(value)).toBeNull();
  });
});

describe('bucharestInputValue', () => {
  it('shows an instant on the Bucharest clock', () => {
    expect(bucharestInputValue('2026-10-20T07:15:00.000Z')).toBe('2026-10-20T10:15');
    expect(bucharestInputValue('2026-12-01T06:00:00.000Z')).toBe('2026-12-01T08:00');
  });

  it('shows both instants of the repeated hour as the same clock time', () => {
    expect(bucharestInputValue('2026-10-25T00:30:00.000Z')).toBe('2026-10-25T03:30');
    expect(bucharestInputValue('2026-10-25T01:30:00.000Z')).toBe('2026-10-25T03:30');
  });
});
```

- [ ] **Step 2: Create `src/admin/testPage/RobotLine.test.tsx`**

```tsx
import { describe, expect, it } from 'vitest';
import { robotLine } from './RobotLine.tsx';

const NOW = Date.parse('2026-10-08T07:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

describe('robotLine', () => {
  it('warns while the robot never checked', () => {
    expect(robotLine(null, NOW)).toEqual({ text: 'Robotul nu a verificat încă dacă are lucrări de corectat.', late: true });
  });

  it('says how long ago the robot checked', () => {
    expect(robotLine(ago(0.5), NOW)).toEqual({ text: 'Robotul a verificat acum mai puțin de un minut.', late: false });
    expect(robotLine(ago(3), NOW)).toEqual({ text: 'Robotul a verificat acum 3 min.', late: false });
    expect(robotLine(ago(29.9), NOW).late).toBe(false);
  });

  it('warns after 30 minutes without a check', () => {
    expect(robotLine(ago(30), NOW)).toEqual({ text: 'Robotul a verificat acum 30 min.', late: true });
    expect(robotLine(ago(120), NOW)).toEqual({ text: 'Robotul a verificat ultima dată la 8 oct. 2026, 08:00.', late: true });
  });
});
```

- [ ] **Step 3: Edit `src/ui/format.test.ts`**

Find this block:

```ts
import { describe, expect, it } from 'vitest';
import { formatDateTime, formatFileSize, studentCountLabel, testStatusLabel, uploadStatusLabel } from './format.ts';

```

Replace it with:

```ts
import { describe, expect, it } from 'vitest';
import { formatDateTime, formatFileSize, robotStartMessage, studentCountLabel, testStatusLabel, uploadStatusLabel } from './format.ts';

```

- [ ] **Step 4: Edit `src/ui/format.test.ts`**

Find this block:

```ts
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25 MB');
  });
});
```

Replace it with:

```ts
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25 MB');
  });
});

describe('robotStartMessage', () => {
  it('says when the robot starts', () => {
    expect(robotStartMessage('dispatched')).toBe('Robotul pornește în aproximativ un minut.');
    expect(robotStartMessage('next_check')).toBe('Robotul pornește la următoarea lui verificare.');
  });
});
```

- [ ] **Step 5: Edit `src/admin/api.test.ts`**

Find this block:

```ts
    await expect(api.me()).rejects.toMatchObject({ code: 'bad_response' });
    expect(onLoginExpired).not.toHaveBeenCalled();
  });
});
```

Replace it with:

```ts
    await expect(api.me()).rejects.toMatchObject({ code: 'bad_response' });
    expect(onLoginExpired).not.toHaveBeenCalled();
  });
});

describe('createApiClient evaluation', () => {
  it('calls the evaluation routes', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { status: 'evaluating', evaluationAt: null, robot: 'dispatched' }),
    );
    const api = createApiClient({ fetchImpl });
    expect(await api.evaluateTest('6E2-26T1')).toEqual({ status: 'evaluating', evaluationAt: null, robot: 'dispatched' });
    await api.evaluateTest('6E2-26T1', '2026-10-20T07:15:00.000Z');
    await api.cancelSchedule('6E2-26T1');
    await api.acceptExerciseList('6E2-26T1');
    expect(await api.retryExerciseList('6E2-26T1')).toBe('dispatched');
    expect(await api.retrySubmission(5)).toBe('dispatched');
    expect(fetchImpl.mock.calls.map(([url, init]) => [init!.method, url, init!.body])).toEqual([
      ['POST', '/api/admin/tests/6E2-26T1/evaluate', '{}'],
      ['POST', '/api/admin/tests/6E2-26T1/evaluate', '{"at":"2026-10-20T07:15:00.000Z"}'],
      ['DELETE', '/api/admin/tests/6E2-26T1/schedule', undefined],
      ['POST', '/api/admin/tests/6E2-26T1/exercise-list/accept', undefined],
      ['POST', '/api/admin/tests/6E2-26T1/exercise-list/retry', undefined],
      ['POST', '/api/admin/submissions/5/retry', undefined],
    ]);
  });
});
```

- [ ] **Step 6: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
```

Replace it with:

```tsx
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.ts';
```

- [ ] **Step 7: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(refreshInterval(undefined)).toBe(false);
  });
});
```

Replace it with:

```tsx
    expect(refreshInterval(undefined)).toBe(false);
  });
});

describe('TestPage evaluation', () => {
  const FILES = { test: { name: 'Test.pdf', type: PDF_TYPE }, barem: { name: 'Barem.pdf', type: PDF_TYPE } };
  const NOW = new Date('2026-10-08T07:00:00.000Z');

  function evaluationApi(overrides: Parameters<typeof fakeTest>[0], rows = uploads) {
    return createFakeApi({
      classes: [{ id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 3 }],
      students: {},
      tests: [fakeTest({ status: 'open', uploadToken: FAKE_TOKEN, files: FILES, ...overrides }, structuredClone(rows))],
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts the evaluation now, after the teacher confirms', async () => {
    const api = evaluationApi({});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAdmin('/teste/6E2-26T1', api);
    const start = await screen.findByRole('button', { name: 'Pornește evaluarea acum' });
    await userEvent.click(start);
    expect(api.evaluateTest).not.toHaveBeenCalled();
    await userEvent.click(start);
    expect(confirm).toHaveBeenLastCalledWith('Pornești evaluarea acum? Elevii nu mai pot încărca după asta.');
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Se corectează', { selector: '.status' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Robotul pornește la următoarea lui verificare.');
    expect(screen.getByText(/^Robotul corectează lucrările trimise\. Evaluarea a pornit la 8 oct\. 2026, 10:00\.$/)).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a verificat încă dacă are lucrări de corectat.')).toBeInTheDocument();
    expect(screen.getByText('Corectarea poate întârzia.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Linkul pentru elevi')).not.toBeInTheDocument();
  });

  it('says what the evaluation still needs', async () => {
    const empty = [fakeUpload({ studentId: 12, studentName: 'Marin Dan' })];
    renderAdmin('/teste/6E2-26T1', evaluationApi({ files: { test: FILES.test, barem: null } }, empty));
    expect(await screen.findByRole('button', { name: 'Pornește evaluarea acum' })).toBeDisabled();
    expect(screen.getByText('Ca să pornești evaluarea: Încarcă baremul. Niciun elev nu a încărcat încă fișiere.')).toBeInTheDocument();
    expect(screen.getByLabelText('Sau pornește evaluarea automat la')).toBeDisabled();
  });

  it("schedules the evaluation in Romania's time, and cancels the schedule", async () => {
    const api = evaluationApi({});
    renderAdmin('/teste/6E2-26T1', api);
    const input = await screen.findByLabelText('Sau pornește evaluarea automat la');
    expect(input).toHaveAttribute('min', '2026-10-08T10:00');
    expect(input).toHaveAttribute('max', '2026-12-07T09:00');
    fireEvent.change(input, { target: { value: '2026-10-20T10:15' } });
    await userEvent.click(screen.getByRole('button', { name: 'Programează' }));
    expect(api.evaluateTest).toHaveBeenCalledWith('6E2-26T1', '2026-10-20T07:15:00.000Z');
    expect(await screen.findByText(/^Evaluarea pornește automat la 20 oct\. 2026, 10:15\./)).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a verificat încă dacă are lucrări de corectat.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Anulează programarea' }));
    expect(api.cancelSchedule).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByLabelText('Sau pornește evaluarea automat la')).toHaveValue('');
    expect(screen.queryByText(/Robotul nu a verificat/)).not.toBeInTheDocument();
  });

  it('shows a problem of the barem, takes a new barem, and grades anyway', async () => {
    const message = 'Punctajele din barem dau 9, dar totalul este 10.';
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'problem', message } });
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1');
    await screen.findByLabelText('Înlocuiește baremul');
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Înlocuiește baremul')).toBeDisabled();
  });

  it('lets the robot try the barem again', async () => {
    const api = evaluationApi({ status: 'evaluating', exerciseList: { status: 'failed', message: 'Robotul nu a terminat la timp.' } });
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByText('Robotul nu a terminat la timp.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryExerciseList).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent('Robotul pornește la următoarea lui verificare.');
  });

  it('shows the grades, the items to check, and a failed grading to try again', async () => {
    const rows = [
      fakeUpload({ studentId: 10, studentName: 'Pop Ion', submissionId: 5, status: 'graded', fileCount: 4, grade: 8.75, flagCount: 2 }),
      fakeUpload({ studentId: 11, studentName: 'Stan Eva', submissionId: 6, status: 'failed', fileCount: 1, lastError: 'Robotul nu a terminat la timp.' }),
    ];
    const api = evaluationApi({ status: 'done', evaluationStartedAt: '2026-10-07T08:00:00.000Z' }, rows);
    renderAdmin('/teste/6E2-26T1', api);
    expect(await screen.findByRole('heading', { name: 'Încărcări · trimise 2 din 2 · corectate 1' })).toBeInTheDocument();
    expect(screen.getByText('Corectarea s-a terminat. Evaluarea a pornit la 7 oct. 2026, 11:00.')).toBeInTheDocument();
    const pop = screen.getByRole('rowheader', { name: 'Pop Ion' }).closest('tr')!;
    expect(within(pop).getByText('8,75')).toBeInTheDocument();
    expect(within(pop).getByText('2')).toBeInTheDocument();
    expect(within(pop).queryByRole('button', { name: 'Reîncearcă' })).not.toBeInTheDocument();
    const stan = screen.getByRole('rowheader', { name: 'Stan Eva' }).closest('tr')!;
    expect(within(stan).getByText('Robotul nu a terminat la timp.')).toBeInTheDocument();
    await userEvent.click(within(stan).getByRole('button', { name: 'Reîncearcă' }));
    expect(api.retrySubmission).toHaveBeenCalledWith(6);
    expect(await within(stan).findByText('Trimis')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Robotul pornește la următoarea lui verificare.');
  });
});
```

- [ ] **Step 8: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', startedAt: '2026-10-06T07:15:00.000Z' }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'submitted', submissionId: 5 }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva' }),
```

Replace it with:

```tsx
      fakeTest({ code: '6E2-26T2', title: 'Ecuații', status: 'open', startedAt: '2026-10-06T07:15:00.000Z' }, [
        fakeUpload({ studentId: 10, studentName: 'Pop Ion', status: 'graded', submissionId: 5, grade: 9 }),
        fakeUpload({ studentId: 11, studentName: 'Stan Eva' }),
```

- [ ] **Step 9: Edit `src/admin/pages/TestsPage.test.tsx`**

Find this block:

```tsx
    expect(within(card).getByText('Deschis')).toBeInTheDocument();
    expect(within(card).getByText('Trimise: 1 din 2')).toBeInTheDocument();

```

Replace it with:

```tsx
    expect(within(card).getByText('Deschis')).toBeInTheDocument();
    expect(within(card).getByText('Trimise: 1 din 2 · corectate: 1')).toBeInTheDocument();

```

- [ ] **Step 10: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  ClassSummary,
  StudentRow,
```

Replace it with:

```ts
  ClassSummary,
  EvaluationStart,
  RobotStart,
  StudentRow,
```

- [ ] **Step 11: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    getSubmission: vi.fn(async (submissionId: number) => {
```

Replace it with:

```ts
    }),
    // Like the server: a time that has passed starts now.
    evaluateTest: vi.fn(async (code: string, at?: string): Promise<EvaluationStart> => {
      const found = findTest(code).test;
      if (at !== undefined && at > new Date().toISOString()) {
        found.evaluationAt = at;
        return { status: 'open', evaluationAt: at, robot: null };
      }
      Object.assign(found, { status: 'evaluating', evaluationAt: null, evaluationStartedAt: new Date().toISOString() });
      return { status: 'evaluating', evaluationAt: null, robot: 'next_check' };
    }),
    cancelSchedule: vi.fn(async (code: string) => {
      findTest(code).test.evaluationAt = null;
    }),
    acceptExerciseList: vi.fn(async (code: string) => {
      findTest(code).test.exerciseList.status = 'accepted';
    }),
    retryExerciseList: vi.fn(async (code: string): Promise<RobotStart | null> => {
      const found = findTest(code).test;
      found.exerciseList = { status: 'none', message: null };
      return found.status === 'evaluating' ? 'next_check' : null;
    }),
    getSubmission: vi.fn(async (submissionId: number) => {
```

- [ ] **Step 12: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
  } satisfies AdminApi;
```

Replace it with:

```ts
    }),
    retrySubmission: vi.fn(async (submissionId: number): Promise<RobotStart | null> => {
      for (const detail of tests) {
        const row = detail.uploads.find((u) => u.submissionId === submissionId);
        if (row) Object.assign(row, { status: 'submitted', lastError: null });
      }
      return 'next_check';
    }),
  } satisfies AdminApi;
```

- [ ] **Step 13: Run the tests to see them fail**

Run: `npx vitest run src/ui/bucharestTime.test.ts src/admin/testPage/RobotLine.test.tsx src/ui/format.test.ts src/admin/api.test.ts src/admin/pages/TestPage.test.tsx src/admin/pages/TestsPage.test.tsx`
Expected: FAIL. `Test Files  6 failed (6)`, `Tests  9 failed | 40 passed (49)`. `bucharestTime.test.ts` and `RobotLine.test.tsx` fail with `Failed to resolve import`. `api.test.ts`: `api.evaluateTest is not a function`. `format.test.ts`: `robotStartMessage is not a function`. `TestsPage.test.tsx`: no text `Trimise: 1 din 2 · corectate: 1`. In `TestPage.test.tsx` the six new tests fail: the page has no evaluation controls, barem warning, or grade columns yet (`Unable to find role="button" and name "Pornește evaluarea acum"`, `Unable to find a label with the text of: Sau pornește evaluarea automat la`).

- [ ] **Step 14: Create `src/ui/bucharestTime.ts`**

```ts
// A date-and-time input ("2026-10-20T10:15") in Romania's local time, whatever
// the time zone of the computer, and the UTC instant it means.

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Bucharest',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// The Bucharest clock at an instant, written as if it were UTC.
function bucharestClock(ms: number): number {
  const part = Object.fromEntries(PARTS.formatToParts(new Date(ms)).map((p) => [p.type, Number(p.value)]));
  return Date.UTC(part.year!, part.month! - 1, part.day!, part.hour!, part.minute!, part.second!);
}

// The input value for an instant.
export function bucharestInputValue(iso: string): string {
  return new Date(bucharestClock(Date.parse(iso))).toISOString().slice(0, 16);
}

const INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// The instant an input value means, as an ISO string; null for a value that
// is not a date and time. In the hour that repeats when the clocks go back,
// the later of the two instants. A time skipped when the clocks go forward
// moves forward by the skipped hour.
export function bucharestInputToIso(value: string): string | null {
  const match = INPUT.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const clock = Date.UTC(year, month - 1, day, hour, minute);
  // Date.UTC rolls over impossible dates (31 Feb): those are not valid.
  if (new Date(clock).toISOString().slice(0, 16) !== value) return null;
  // Guess with the offset at the clock time, then correct with the offset at the guess.
  let instant = clock - (bucharestClock(clock) - clock);
  instant = clock - (bucharestClock(instant) - instant);
  return new Date(instant).toISOString();
}
```

- [ ] **Step 15: Edit `src/ui/format.ts`**

Find this block:

```ts
import type { UploadStatus } from '../../shared/api.ts';
import type { TestStatus } from '../../shared/tests.ts';
```

Replace it with:

```ts
import type { RobotStart, UploadStatus } from '../../shared/api.ts';
import type { TestStatus } from '../../shared/tests.ts';
```

- [ ] **Step 16: Edit `src/ui/format.ts`**

Find this block:

```ts
  return `${ONE_DECIMAL.format(bytes / (1024 * 1024))} MB`;
}
```

Replace it with:

```ts
  return `${ONE_DECIMAL.format(bytes / (1024 * 1024))} MB`;
}

const ROBOT_START: Record<RobotStart, string> = {
  dispatched: 'Robotul pornește în aproximativ un minut.',
  next_check: 'Robotul pornește la următoarea lui verificare.',
};

// What the teacher reads after she starts grading.
export function robotStartMessage(robot: RobotStart): string {
  return ROBOT_START[robot];
}
```

- [ ] **Step 17: Edit `src/ui/brand.css`**

Find this block:

```css
  object-fit: contain;
}
```

Replace it with:

```css
  object-fit: contain;
}

/* Something for the teacher to look at: a highlighter mark, not an error. */
.warning {
  max-width: 40rem;
  margin-block: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-left: 4px solid var(--marker-edge);
  border-radius: 0.35rem;
  background: var(--marker);
  color: var(--text);
}

.warning > p {
  margin: 0 0 0.5rem;
}

.warning > :last-child {
  margin-bottom: 0;
}
```

- [ ] **Step 18: Edit `src/admin/api.ts`**

Find this block:

```ts
  CreateTestInput,
  StartedTest,
```

Replace it with:

```ts
  CreateTestInput,
  EvaluationStart,
  RobotStart,
  StartedTest,
```

- [ ] **Step 19: Edit `src/admin/api.ts`**

Find this block:

```ts
  reopenTest(code: string): Promise<void>;
  getSubmission(submissionId: number): Promise<SubmissionDetail>;
  resetSubmission(submissionId: number): Promise<void>;
}
```

Replace it with:

```ts
  reopenTest(code: string): Promise<void>;
  // Now without `at`, or at that ISO time.
  evaluateTest(code: string, at?: string): Promise<EvaluationStart>;
  cancelSchedule(code: string): Promise<void>;
  acceptExerciseList(code: string): Promise<void>;
  // The robot answers are null when the robot was not needed.
  retryExerciseList(code: string): Promise<RobotStart | null>;
  getSubmission(submissionId: number): Promise<SubmissionDetail>;
  resetSubmission(submissionId: number): Promise<void>;
  retrySubmission(submissionId: number): Promise<RobotStart | null>;
}
```

- [ ] **Step 20: Edit `src/admin/api.ts`**

Find this block:

```ts
    },
    getSubmission: async (submissionId) =>
```

Replace it with:

```ts
    },
    evaluateTest: (code, at) => request<EvaluationStart>('POST', `${test(code)}/evaluate`, at === undefined ? {} : { at }),
    cancelSchedule: async (code) => {
      await request('DELETE', `${test(code)}/schedule`);
    },
    acceptExerciseList: async (code) => {
      await request('POST', `${test(code)}/exercise-list/accept`);
    },
    retryExerciseList: async (code) =>
      (await request<{ robot: RobotStart | null }>('POST', `${test(code)}/exercise-list/retry`)).robot,
    getSubmission: async (submissionId) =>
```

- [ ] **Step 21: Edit `src/admin/api.ts`**

Find this block:

```ts
    },
  };
```

Replace it with:

```ts
    },
    retrySubmission: async (submissionId) =>
      (await request<{ robot: RobotStart | null }>('POST', `/submissions/${submissionId}/retry`)).robot,
  };
```

- [ ] **Step 22: Create `src/admin/testPage/EvaluationControls.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { MAX_SCHEDULE_DAYS } from '../../../shared/tests.ts';
import { bucharestInputToIso, bucharestInputValue } from '../../ui/bucharestTime.ts';
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

const DAY_MS = 24 * 60 * 60 * 1000;

// The files the evaluation needs, as steps for the teacher.
function missingFiles(test: TestInfo): string[] {
  const missing: string[] = [];
  if (!test.files.test) missing.push('Încarcă testul.');
  if (!test.files.barem) missing.push('Încarcă baremul.');
  return missing;
}

// Start evaluation while the uploads are open (spec §8.4): now, or at a time
// the teacher picks in Romania's local time. Scheduling needs only the files:
// the students may still upload until then.
export function EvaluationControls({
  test,
  uploads,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  uploads: UploadRow[];
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const [when, setWhen] = useState('');
  const [badTime, setBadTime] = useState(false);
  const start = useMutation({
    mutationFn: () => api.evaluateTest(test.code),
    onSuccess: async (answer) => {
      onRobot(answer.robot);
      await onChanged();
    },
  });
  const schedule = useMutation({
    mutationFn: (at: string) => api.evaluateTest(test.code, at),
    onSuccess: async () => {
      setWhen('');
      await onChanged();
    },
  });
  const cancel = useMutation({ mutationFn: () => api.cancelSchedule(test.code), onSuccess: onChanged });

  const fileSteps = missingFiles(test);
  const startSteps = uploads.some((row) => row.fileCount > 0) ? fileSteps : [...fileSteps, 'Niciun elev nu a încărcat încă fișiere.'];
  const now = Date.now();

  const submitSchedule = (event: FormEvent) => {
    event.preventDefault();
    const at = bucharestInputToIso(when);
    setBadTime(at === null);
    if (at !== null) schedule.mutate(at);
  };

  return (
    <>
      <p className="hint">După ce pornește evaluarea, elevii nu mai pot încărca. Lucrările începute care au fișiere se trimit așa cum sunt.</p>
      <p>
        <button
          type="button"
          className="button"
          disabled={startSteps.length > 0 || start.isPending}
          onClick={() => {
            if (window.confirm('Pornești evaluarea acum? Elevii nu mai pot încărca după asta.')) start.mutate();
          }}
        >
          Pornește evaluarea acum
        </button>
      </p>
      {startSteps.length > 0 && <p className="hint">Ca să pornești evaluarea: {startSteps.join(' ')}</p>}
      {start.error && <ErrorMessage error={start.error} />}

      {test.evaluationAt ? (
        <p>
          Evaluarea pornește automat la {formatDateTime(test.evaluationAt)}.{' '}
          <button type="button" className="button-quiet button-small" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Anulează programarea
          </button>
        </p>
      ) : (
        <form className="form-row" onSubmit={submitSchedule}>
          <label htmlFor="evaluation-at">Sau pornește evaluarea automat la</label>
          <input
            id="evaluation-at"
            type="datetime-local"
            value={when}
            min={bucharestInputValue(new Date(now).toISOString())}
            max={bucharestInputValue(new Date(now + MAX_SCHEDULE_DAYS * DAY_MS).toISOString())}
            onChange={(event) => setWhen(event.target.value)}
            disabled={fileSteps.length > 0}
            required
          />
          <button className="button-quiet button-small" type="submit" disabled={fileSteps.length > 0 || schedule.isPending}>
            Programează
          </button>
        </form>
      )}
      {badTime && (
        <p className="alert" role="alert">
          Alege data și ora.
        </p>
      )}
      {schedule.error && <ErrorMessage error={schedule.error} />}
      {cancel.error && <ErrorMessage error={cancel.error} />}
    </>
  );
}
```

- [ ] **Step 23: Create `src/admin/testPage/ExerciseListBanner.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The robot reads the test and the barem first and makes a list of the
// exercises (spec §9). Shown only when that list needs the teacher: its
// points do not add up, or the robot could not make it.
export function ExerciseListBanner({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const accept = useMutation({ mutationFn: () => api.acceptExerciseList(test.code), onSuccess: onChanged });
  const retry = useMutation({
    mutationFn: () => api.retryExerciseList(test.code),
    onSuccess: async (robot) => {
      onRobot(robot);
      await onChanged();
    },
  });
  const { status, message } = test.exerciseList;

  if (status === 'problem') {
    return (
      <div className="warning">
        <p>
          <strong>Baremul are o problemă.</strong> {message}
        </p>
        <p>Înlocuiește baremul mai sus, sau corectează cu baremul așa cum este.</p>
        <button type="button" className="button-quiet button-small" disabled={accept.isPending} onClick={() => accept.mutate()}>
          Folosește oricum
        </button>
        {accept.error && <ErrorMessage error={accept.error} />}
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="warning">
        <p>
          <strong>Robotul nu a putut citi testul și baremul.</strong> {message}
        </p>
        <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
          Încearcă din nou
        </button>
        {retry.error && <ErrorMessage error={retry.error} />}
      </div>
    );
  }
  return null;
}
```

- [ ] **Step 24: Create `src/admin/testPage/RobotLine.tsx`**

```tsx
import { formatDateTime } from '../../ui/format.ts';

const LATE_MINUTES = 30;

// When the robot last looked for work (spec §9). The robot checks every 10
// minutes, but GitHub can run the check late or stop it: after 30 minutes
// without a check, grading may be late.
export function robotLine(lastCheckAt: string | null, now: number): { text: string; late: boolean } {
  if (lastCheckAt === null) return { text: 'Robotul nu a verificat încă dacă are lucrări de corectat.', late: true };
  const minutes = Math.floor((now - Date.parse(lastCheckAt)) / 60_000);
  const text =
    minutes < 1
      ? 'Robotul a verificat acum mai puțin de un minut.'
      : minutes < 60
        ? `Robotul a verificat acum ${minutes} min.`
        : `Robotul a verificat ultima dată la ${formatDateTime(lastCheckAt)}.`;
  return { text, late: minutes >= LATE_MINUTES };
}

export function RobotLine({ lastCheckAt }: { lastCheckAt: string | null }) {
  const { text, late } = robotLine(lastCheckAt, Date.now());
  if (!late) return <p className="hint">{text}</p>;
  return (
    <div className="warning">
      <p>{text}</p>
      <p>Corectarea poate întârzia.</p>
    </div>
  );
}
```

- [ ] **Step 25: Replace `src/admin/testPage/UploadsTable.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { RobotStart, UploadRow } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { formatDateTime, uploadStatusLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// Who uploaded what: one row per student of the class, with the grade once
// the robot graded it.
export function UploadsTable({
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
            <th scope="col">Nota</th>
            <th scope="col">De verificat</th>
            <th scope="col">
              <span className="sr-only">Acțiuni</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((row) => (
            <UploadTableRow key={row.studentId} code={code} row={row} onChanged={onChanged} onRobot={onRobot} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadTableRow({
  code,
  row,
  onChanged,
  onRobot,
}: {
  code: string;
  row: UploadRow;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const reset = useMutation({
    mutationFn: (submissionId: number) => api.resetSubmission(submissionId),
    onSuccess: onChanged,
  });
  const retry = useMutation({
    mutationFn: (submissionId: number) => api.retrySubmission(submissionId),
    onSuccess: async (robot) => {
      onRobot(robot);
      await onChanged();
    },
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
        {row.status === 'failed' && row.lastError && <p className="hint">{row.lastError}</p>}
      </td>
      <td>{row.fileCount}</td>
      <td>{time ? formatDateTime(time) : '—'}</td>
      <td>{row.grade === null ? '—' : formatPoints(row.grade)}</td>
      <td>{row.flagCount > 0 ? row.flagCount : '—'}</td>
      <td>
        {submissionId !== null && (
          <span className="row-actions">
            <Link to={`/teste/${code}/elevi/${submissionId}`}>Vezi fișierele</Link>
            {row.status === 'failed' && (
              <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate(submissionId)}>
                Reîncearcă
              </button>
            )}
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
        {retry.error && <ErrorMessage error={retry.error} />}
      </td>
    </tr>
  );
}
```

- [ ] **Step 26: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
// The test and the barem: open them, upload them, or replace them. Not while
// the test is being graded.
export function TestFiles({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const locked = test.status === 'evaluating';
  return (
```

Replace it with:

```tsx
// The test and the barem: open them, upload them, or replace them. Not while
// the robot grades with them; while their exercise list has a problem or
// failed, the robot uses neither, and the teacher may fix them.
export function TestFiles({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
  const locked = test.status === 'evaluating' && !listBlocked;
  return (
```

- [ ] **Step 27: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { TestInfo } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { MAX_TITLE_LENGTH, normalizeTestCode, type TestStatus } from '../../../shared/tests.ts';
import { formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
```

Replace it with:

```tsx
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { MAX_TITLE_LENGTH, normalizeTestCode, type TestStatus } from '../../../shared/tests.ts';
import { formatDateTime, robotStartMessage } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
```

- [ ] **Step 28: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
import { StatusChip } from '../StatusChip.tsx';
import { TestFiles } from '../testPage/TestFiles.tsx';
```

Replace it with:

```tsx
import { StatusChip } from '../StatusChip.tsx';
import { EvaluationControls } from '../testPage/EvaluationControls.tsx';
import { ExerciseListBanner } from '../testPage/ExerciseListBanner.tsx';
import { RobotLine } from '../testPage/RobotLine.tsx';
import { TestFiles } from '../testPage/TestFiles.tsx';
```

- [ ] **Step 29: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const detail = useQuery({
```

Replace it with:

```tsx
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  // When the robot starts, after the teacher started or restarted grading.
  const [robotNotice, setRobotNotice] = useState<string | null>(null);
  const onRobot = (robot: RobotStart | null) => setRobotNotice(robot ? robotStartMessage(robot) : null);
  const detail = useQuery({
```

- [ ] **Step 30: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx

  const { test, uploads } = detail.data;
  return (
```

Replace it with:

```tsx

  const { test, uploads, robot } = detail.data;
  return (
```

- [ ] **Step 31: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx

      <h2>
        Încărcări · trimise {test.submittedCount} din {test.studentCount}
      </h2>
      <UploadsTable code={code} uploads={uploads} onChanged={refresh} />

```

Replace it with:

```tsx

      {test.status !== 'draft' && (
        <>
          <h2>Evaluarea</h2>
          <ExerciseListBanner test={test} onChanged={refresh} onRobot={onRobot} />
          {test.status === 'open' ? (
            <EvaluationControls test={test} uploads={uploads} onChanged={refresh} onRobot={onRobot} />
          ) : (
            <EvaluationState test={test} />
          )}
          {robotNotice && <p role="status">{robotNotice}</p>}
          {(test.status === 'evaluating' || test.evaluationAt) && <RobotLine lastCheckAt={robot.lastCheckAt} />}
        </>
      )}

      <h2>
        Încărcări · trimise {test.submittedCount} din {test.studentCount}
        {test.gradedCount > 0 && ` · corectate ${test.gradedCount}`}
      </h2>
      <UploadsTable code={code} uploads={uploads} onChanged={refresh} onRobot={onRobot} />

```

- [ ] **Step 32: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
    </>
  );
}

```

Replace it with:

```tsx
    </>
  );
}

// A test whose uploads closed: grading goes on, or has ended.
function EvaluationState({ test }: { test: TestInfo }) {
  const since = test.evaluationStartedAt ? ` Evaluarea a pornit la ${formatDateTime(test.evaluationStartedAt)}.` : '';
  return <p>{test.status === 'done' ? `Corectarea s-a terminat.${since}` : `Robotul corectează lucrările trimise.${since}`}</p>;
}

```

- [ ] **Step 33: Edit `src/admin/pages/TestsPage.tsx`**

Find this block:

```tsx
                  Trimise: {test.submittedCount} din {test.studentCount}
                </span>
```

Replace it with:

```tsx
                  Trimise: {test.submittedCount} din {test.studentCount}
                  {test.gradedCount > 0 && ` · corectate: ${test.gradedCount}`}
                </span>
```

- [ ] **Step 34: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  48 passed (48)`, `Tests  510 passed (510)`.

- [ ] **Step 35: Run the typecheck and the build**

Run: `npm run build`
Expected: the typecheck passes and the build ends with `✓ built in …`.

- [ ] **Step 36: Commit**

```bash
git add src
git commit -m "Start or schedule the evaluation on the test page, and show the robot's problems and the grades"
```

---

### Task 8: The Setări page

A new "Setări" page in the menu: how many uploads the robot grades at the same time, the robot key (made and shown once, with a Copy button), and the robot's state (running, last check, last run, last grading, and a note about the yearly Claude token).

**Files:**
- Create: `src/admin/pages/SettingsPage.tsx`
- Modify: `src/ui/format.ts`, `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/admin/AppRoutes.tsx`, `src/admin/Layout.tsx`
- Test: `src/admin/pages/SettingsPage.test.tsx` (new); `src/ui/format.test.ts`, `src/admin/api.test.ts` (modified)

**Interfaces:**
- Consumes: `Settings`, `RobotStatus`, `RunSummary`, `MAX_PARALLEL_AGENTS` (Task 4); `RobotLine` (Task 7).
- Produces:
  - `countLabel(count, one, many)` in `src/ui/format.ts` (`studentCountLabel` uses it).
  - `AdminApi` gains `getSettings()`, `updateSettings(maxParallelAgents)`, `newRobotKey()`; the fake gets `fakeSettings(overrides?)`, `FAKE_ROBOT_KEY`, and `FakeData.settings`.
  - The route `/setari` and `lastRunText(robot)` in `src/admin/pages/SettingsPage.tsx`.

- [ ] **Step 1: Create `src/admin/pages/SettingsPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, FAKE_ROBOT_KEY, fakeSettings } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';
import { lastRunText } from './SettingsPage.tsx';

const withSettings = (settings = fakeSettings()) => createFakeApi({ classes: [], students: {}, settings });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SettingsPage', () => {
  it('is in the menu', async () => {
    renderAdmin('/setari', withSettings());
    const menu = await screen.findByRole('navigation', { name: 'Meniu' });
    expect(within(menu).getByRole('link', { name: 'Setări' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { name: 'Setări' })).toBeInTheDocument();
  });

  it('changes how many uploads the robot grades at the same time', async () => {
    const api = withSettings();
    renderAdmin('/setari', api);
    const select = await screen.findByLabelText('Lucrări corectate deodată');
    expect(select).toHaveValue('1');
    await userEvent.selectOptions(select, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    expect(api.updateSettings).toHaveBeenCalledWith(3);
    expect(await screen.findByRole('status')).toHaveTextContent('Salvat.');
  });

  it('makes the first robot key and shows it once, to copy', async () => {
    const user = userEvent.setup();
    const api = withSettings();
    renderAdmin('/setari', api);
    expect(await screen.findByText('Robotul nu are încă o cheie.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fă cheia robotului' }));
    expect(api.newRobotKey).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('Cheia nouă a robotului')).toHaveValue(FAKE_ROBOT_KEY);
    expect(await screen.findByText('Robotul are o cheie.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiază cheia' }));
    expect(await navigator.clipboard.readText()).toBe(FAKE_ROBOT_KEY);
  });

  it('asks before it replaces a key', async () => {
    const api = withSettings(fakeSettings({ hasRobotKey: true }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdmin('/setari', api);
    await userEvent.click(await screen.findByRole('button', { name: 'Fă o cheie nouă' }));
    expect(confirm).toHaveBeenCalledWith('Faci o cheie nouă? Cheia de acum nu va mai funcționa.');
    expect(api.newRobotKey).not.toHaveBeenCalled();
  });

  it('shows what the robot did last', async () => {
    const settings = fakeSettings({
      robot: {
        running: true,
        lastCheckAt: new Date(Date.now() - 3 * 60_000).toISOString(),
        lastRunFinishedAt: '2026-10-07T09:00:00.000Z',
        lastRunSummary: { exerciseLists: 1, graded: 25, failed: 0, analyses: 0, stop: 'usage_limit' },
      },
      lastGradedAt: '2026-10-07T08:55:00.000Z',
    });
    renderAdmin('/setari', withSettings(settings));
    expect(await screen.findByText('Robotul lucrează acum.')).toBeInTheDocument();
    expect(screen.getByText('Robotul a verificat acum 3 min.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ultima rulare s-a încheiat la 7 oct. 2026, 12:00: 1 listă de exerciții, 25 de lucrări corectate, 0 lucrări eșuate. S-a oprit la limita planului Claude; continuă mai târziu.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Ultima lucrare corectată: 7 oct. 2026, 11:55.')).toBeInTheDocument();
  });

  it('says when the robot never ran', async () => {
    renderAdmin('/setari', withSettings());
    expect(await screen.findByText('Robotul nu a terminat încă nicio rulare.')).toBeInTheDocument();
    expect(screen.getByText('Nicio lucrare nu a fost corectată încă.')).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a verificat încă dacă are lucrări de corectat.')).toBeInTheDocument();
  });
});

describe('lastRunText', () => {
  it('counts the class analyses only when there were some', () => {
    const robot = fakeSettings().robot;
    const summary = { exerciseLists: 0, graded: 2, failed: 1, analyses: 1, stop: 'done' } as const;
    expect(lastRunText({ ...robot, lastRunFinishedAt: '2026-10-07T09:00:00.000Z', lastRunSummary: summary })).toBe(
      'Ultima rulare s-a încheiat la 7 oct. 2026, 12:00: 0 liste de exerciții, 2 lucrări corectate, 1 lucrare eșuată, 1 analiză de clasă. A terminat toată munca.',
    );
    expect(lastRunText(robot)).toBeNull();
  });
});
```

- [ ] **Step 2: Edit `src/ui/format.test.ts`**

Find this block:

```ts
import { describe, expect, it } from 'vitest';
import { formatDateTime, formatFileSize, robotStartMessage, studentCountLabel, testStatusLabel, uploadStatusLabel } from './format.ts';

```

Replace it with:

```ts
import { describe, expect, it } from 'vitest';
import {
  countLabel,
  formatDateTime,
  formatFileSize,
  robotStartMessage,
  studentCountLabel,
  testStatusLabel,
  uploadStatusLabel,
} from './format.ts';

```

- [ ] **Step 3: Edit `src/ui/format.test.ts`**

Find this block:

```ts
    expect(studentCountLabel(200)).toBe('200 de elevi');
  });
```

Replace it with:

```ts
    expect(studentCountLabel(200)).toBe('200 de elevi');
  });
});

describe('countLabel', () => {
  it('counts any noun the Romanian way', () => {
    expect(countLabel(0, 'lucrare', 'lucrări')).toBe('0 lucrări');
    expect(countLabel(1, 'lucrare', 'lucrări')).toBe('1 lucrare');
    expect(countLabel(3, 'lucrare', 'lucrări')).toBe('3 lucrări');
    expect(countLabel(25, 'lucrare', 'lucrări')).toBe('25 de lucrări');
  });
```

- [ ] **Step 4: Edit `src/admin/api.test.ts`**

Find this block:

```ts
      ['POST', '/api/admin/submissions/5/retry', undefined],
    ]);
```

Replace it with:

```ts
      ['POST', '/api/admin/submissions/5/retry', undefined],
    ]);
  });
});

describe('createApiClient settings', () => {
  it('reads and changes the settings and makes a robot key', async () => {
    const settings = { maxParallelAgents: 2 };
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { settings, key: 'k'.repeat(43) }));
    const api = createApiClient({ fetchImpl });
    expect(await api.getSettings()).toEqual(settings);
    expect(await api.updateSettings(2)).toEqual(settings);
    expect(await api.newRobotKey()).toBe('k'.repeat(43));
    expect(fetchImpl.mock.calls.map(([url, init]) => [init!.method, url, init!.body])).toEqual([
      ['GET', '/api/admin/settings', undefined],
      ['PATCH', '/api/admin/settings', '{"maxParallelAgents":2}'],
      ['POST', '/api/admin/settings/robot-key', undefined],
    ]);
```

- [ ] **Step 5: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  RobotStart,
  StudentRow,
```

Replace it with:

```ts
  RobotStart,
  Settings,
  StudentRow,
```

- [ ] **Step 6: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  submissions?: SubmissionDetail[];
}

```

Replace it with:

```ts
  submissions?: SubmissionDetail[];
  settings?: Settings;
}

// The settings of a new installation, for building fake data in tests.
export function fakeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    maxParallelAgents: 1,
    hasRobotKey: false,
    robot: { running: false, lastCheckAt: null, lastRunFinishedAt: null, lastRunSummary: null },
    lastGradedAt: null,
    ...overrides,
  };
}

export const FAKE_ROBOT_KEY = 'fake-robot-key-0123456789abcdefghijklmnopqr';

```

- [ ] **Step 7: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  const submissions = (data.submissions ??= []);
  const countActive = (classId: number) => (data.students[classId] ?? []).filter((s) => s.active).length;
```

Replace it with:

```ts
  const submissions = (data.submissions ??= []);
  const settings = (data.settings ??= fakeSettings());
  const countActive = (classId: number) => (data.students[classId] ?? []).filter((s) => s.active).length;
```

- [ ] **Step 8: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
  } satisfies AdminApi;
```

Replace it with:

```ts
    }),
    getSettings: vi.fn(async () => structuredClone(settings)),
    updateSettings: vi.fn(async (maxParallelAgents: number) => {
      settings.maxParallelAgents = maxParallelAgents;
      return structuredClone(settings);
    }),
    newRobotKey: vi.fn(async () => {
      settings.hasRobotKey = true;
      return FAKE_ROBOT_KEY;
    }),
  } satisfies AdminApi;
```

- [ ] **Step 9: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/SettingsPage.test.tsx src/ui/format.test.ts src/admin/api.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  2 failed | 23 passed (25)`. `SettingsPage.test.tsx` fails with `Failed to resolve import "./SettingsPage.tsx"`. `format.test.ts`: `countLabel is not a function`. `api.test.ts`: `api.getSettings is not a function`.

- [ ] **Step 10: Edit `src/ui/format.ts`**

Find this block:

```ts

// Romanian counts: "1 elev", "2 elevi", "20 de elevi" (20 or more, and round
// hundreds, take "de").
export function studentCountLabel(count: number): string {
  if (count === 0) return 'niciun elev';
  if (count === 1) return '1 elev';
  const lastTwo = count % 100;
  return lastTwo >= 20 || lastTwo === 0 ? `${count} de elevi` : `${count} elevi`;
}
```

Replace it with:

```ts

// Romanian counts: "1 lucrare", "2 lucrări", "20 de lucrări" (20 or more,
// and round hundreds, take "de").
export function countLabel(count: number, one: string, many: string): string {
  if (count === 1) return `1 ${one}`;
  const lastTwo = count % 100;
  return count > 0 && (lastTwo >= 20 || lastTwo === 0) ? `${count} de ${many}` : `${count} ${many}`;
}

export function studentCountLabel(count: number): string {
  return count === 0 ? 'niciun elev' : countLabel(count, 'elev', 'elevi');
}
```

- [ ] **Step 11: Edit `src/admin/api.ts`**

Find this block:

```ts
  RobotStart,
  StartedTest,
```

Replace it with:

```ts
  RobotStart,
  Settings,
  StartedTest,
```

- [ ] **Step 12: Edit `src/admin/api.ts`**

Find this block:

```ts
  retrySubmission(submissionId: number): Promise<RobotStart | null>;
}
```

Replace it with:

```ts
  retrySubmission(submissionId: number): Promise<RobotStart | null>;
  getSettings(): Promise<Settings>;
  updateSettings(maxParallelAgents: number): Promise<Settings>;
  // A new robot key: the only time the app sees it.
  newRobotKey(): Promise<string>;
}
```

- [ ] **Step 13: Edit `src/admin/api.ts`**

Find this block:

```ts
      (await request<{ robot: RobotStart | null }>('POST', `/submissions/${submissionId}/retry`)).robot,
  };
```

Replace it with:

```ts
      (await request<{ robot: RobotStart | null }>('POST', `/submissions/${submissionId}/retry`)).robot,
    getSettings: async () => (await request<{ settings: Settings }>('GET', '/settings')).settings,
    updateSettings: async (maxParallelAgents) =>
      (await request<{ settings: Settings }>('PATCH', '/settings', { maxParallelAgents })).settings,
    newRobotKey: async () => (await request<{ key: string }>('POST', '/settings/robot-key')).key,
  };
```

- [ ] **Step 14: Create `src/admin/pages/SettingsPage.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { RobotStatus, Settings } from '../../../shared/api.ts';
import { MAX_PARALLEL_AGENTS, type RunSummary } from '../../../shared/runner.ts';
import { countLabel, formatDateTime } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { RobotLine } from '../testPage/RobotLine.tsx';

const PARALLEL_OPTIONS = Array.from({ length: MAX_PARALLEL_AGENTS }, (_, index) => index + 1);

// Setări (spec §9): how many uploads the robot grades at the same time, the
// robot's key, and what the robot did last.
export function SettingsPage() {
  const api = useApi();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() });

  return (
    <section>
      <h1>Setări</h1>
      {settings.isPending && <p>Se încarcă…</p>}
      {settings.error && <ErrorMessage error={settings.error} />}
      {settings.data && (
        <>
          <ParallelForm current={settings.data.maxParallelAgents} />
          <RobotKey hasKey={settings.data.hasRobotKey} />
          <RobotState settings={settings.data} />
        </>
      )}
    </section>
  );
}

function ParallelForm({ current }: { current: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(current);
  const save = useMutation({
    mutationFn: () => api.updateSettings(value),
    onSuccess: (saved) => queryClient.setQueryData(['settings'], saved),
  });

  return (
    <>
      <h2>Corectarea</h2>
      <form
        className="form-row"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label htmlFor="parallel">Lucrări corectate deodată</label>
        <select id="parallel" value={value} onChange={(event) => setValue(Number(event.target.value))}>
          {PARALLEL_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button className="button button-small" type="submit" disabled={save.isPending}>
          Salvează
        </button>
        {save.isSuccess && <span role="status">Salvat.</span>}
      </form>
      <p className="hint">Mai multe lucrări deodată termină mai repede, dar ajung mai repede la limita planului Claude.</p>
      {save.error && <ErrorMessage error={save.error} />}
    </>
  );
}

// The key is shown once, right after it is made: only its hash is stored.
function RobotKey({ hasKey }: { hasKey: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const create = useMutation({
    mutationFn: () => api.newRobotKey(),
    onSuccess: async () => {
      setCopied(null);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
  const key = create.data;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(key ?? '');
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  };

  return (
    <>
      <h2>Cheia robotului</h2>
      <p>{hasKey ? 'Robotul are o cheie.' : 'Robotul nu are încă o cheie.'}</p>
      <button
        type="button"
        className="button-quiet"
        disabled={create.isPending}
        onClick={() => {
          if (!hasKey || window.confirm('Faci o cheie nouă? Cheia de acum nu va mai funcționa.')) create.mutate();
        }}
      >
        {hasKey ? 'Fă o cheie nouă' : 'Fă cheia robotului'}
      </button>
      {create.error && <ErrorMessage error={create.error} />}
      {key && (
        <div className="warning">
          <p>
            Copiaz-o acum în GitHub, în secretul <code>QUICKEVAL_RUNNER_KEY</code>. După ce pleci de pe pagină, nu o mai vezi.
          </p>
          <div className="form-row">
            <label className="sr-only" htmlFor="robot-key">
              Cheia nouă a robotului
            </label>
            <input id="robot-key" type="text" value={key} readOnly onFocus={(event) => event.target.select()} />
            <button type="button" className="button button-small" onClick={copy}>
              Copiază cheia
            </button>
            {copied === 'yes' && <span role="status">Copiat!</span>}
            {copied === 'failed' && <span role="status">Nu am putut copia. Selectează cheia și copiaz-o de mână.</span>}
          </div>
        </div>
      )}
    </>
  );
}

const STOP: Record<RunSummary['stop'], string> = {
  done: 'A terminat toată munca.',
  budget: 'S-a oprit după 2 ore; continuă la următoarea verificare.',
  usage_limit: 'S-a oprit la limita planului Claude; continuă mai târziu.',
  lease_lost: 'S-a oprit pentru că a pornit altă rulare.',
};

// "Ultima rulare s-a încheiat la …: 1 listă de exerciții, 25 de lucrări corectate, 0 lucrări eșuate."
export function lastRunText(robot: RobotStatus): string | null {
  const summary = robot.lastRunSummary;
  if (!robot.lastRunFinishedAt || !summary) return null;
  const parts = [
    countLabel(summary.exerciseLists, 'listă de exerciții', 'liste de exerciții'),
    countLabel(summary.graded, 'lucrare corectată', 'lucrări corectate'),
    countLabel(summary.failed, 'lucrare eșuată', 'lucrări eșuate'),
  ];
  if (summary.analyses > 0) parts.push(countLabel(summary.analyses, 'analiză de clasă', 'analize de clasă'));
  return `Ultima rulare s-a încheiat la ${formatDateTime(robot.lastRunFinishedAt)}: ${parts.join(', ')}. ${STOP[summary.stop]}`;
}

function RobotState({ settings }: { settings: Settings }) {
  const lastRun = lastRunText(settings.robot);
  return (
    <>
      <h2>Starea robotului</h2>
      {settings.robot.running && <p>Robotul lucrează acum.</p>}
      <RobotLine lastCheckAt={settings.robot.lastCheckAt} />
      <p>{lastRun ?? 'Robotul nu a terminat încă nicio rulare.'}</p>
      <p>
        {settings.lastGradedAt
          ? `Ultima lucrare corectată: ${formatDateTime(settings.lastGradedAt)}.`
          : 'Nicio lucrare nu a fost corectată încă.'}
      </p>
      <p className="hint">
        Robotul corectează cu planul Claude prin tokenul din secretul GitHub <code>CLAUDE_CODE_OAUTH_TOKEN</code>. Tokenul ține un an: dacă
        lucrările nu se mai corectează, fă unul nou.
      </p>
    </>
  );
}
```

- [ ] **Step 15: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { SubmissionPage } from './pages/SubmissionPage.tsx';
```

Replace it with:

```tsx
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SubmissionPage } from './pages/SubmissionPage.tsx';
```

- [ ] **Step 16: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="*" element={<NotFoundPage />} />
```

Replace it with:

```tsx
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="setari" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
```

- [ ] **Step 17: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
            <NavLink to="/clase">Clase</NavLink>
          </nav>
```

Replace it with:

```tsx
            <NavLink to="/clase">Clase</NavLink>
            <NavLink to="/setari">Setări</NavLink>
          </nav>
```

- [ ] **Step 18: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  49 passed (49)`, `Tests  519 passed (519)`.

- [ ] **Step 19: Run the typecheck and the build**

Run: `npm run build`
Expected: the typecheck passes and the build ends with `✓ built in …`.

- [ ] **Step 20: Commit**

```bash
git add src
git commit -m "Add the Setări page"
```

---

### Task 9: The smoke test plays the robot; docs and spec

The smoke test now also grades one upload as a pretend robot, through the real Pages runtime. `AGENTS.md` describes the new parts and rules, the spec records this plan's rulings and the 3a/3b split, and the follow-up files say what is done and what Plan 3b must do.

**Files:**
- Create: `docs/superpowers/plans/plan-3a-followups.md`
- Modify: `scripts/smoke.mjs`, `AGENTS.md`, `docs/superpowers/specs/2026-10-06-quickeval-design.md`, `docs/superpowers/plans/plan-2-followups.md`

**Interfaces:**
- Consumes: every route of Tasks 2–6.
- Produces: `npm run smoke` checks the pages, the headers, one upload, and one grading by a pretend robot.

- [ ] **Step 1: Replace `scripts/smoke.mjs`**

```js
// Smoke test against a running local server: `npm run preview` in one
// terminal, then `npm run smoke` in another. Checks the pages, the /admin and
// /u rewrites, the security headers, one full upload with the local login
// (class, student, test, barem, start, a student's photo, confirm), and one
// grading by a pretend robot (robot key, schedule, start evaluation, check,
// lease, exercise list, claim, page, result, release), then deletes the test.
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
const savedList = await robot('POST', `/tests/${testId}/exercise-list`, { runId, ok: true, exerciseList });
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
Expected: 41 lines that start with `PASS`, then `All smoke checks passed.` Stop the preview afterwards and check that nothing still listens on port 8788 (`netstat -ano | findstr :8788`; on a leftover, use the PowerShell command in `AGENTS.md`).

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
- `src/ui/`: brand CSS (colours from the Laura Miron site), brand mark, theme switch, Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time).
- `src/admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning, the robot line, the uploads table). `pages/SettingsPage.tsx` is Setări.
- `src/upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone).
- `src/test/`: test setup, the fake APIs (`fakeApi.ts`, `fakeUploadApi.ts`), `renderAdmin()`, `expectNoGradingWords()`.
- `functions/api/[[route]].ts`: the Cloudflare Pages entry for `/api/*`. It serves the Hono app from `server/app.ts`.
- `server/`: the API. `routes/` (HTTP: `admin.ts` and its parts, `upload.ts` for students, `runner.ts` for the robot), `db/` (D1 queries; `lifecycle.ts` starts, schedules, promotes, and ends evaluations; `runner.ts` holds the robot's queries), `auth/` (Cloudflare Access login, and `robotAuth.ts` for the robot key), `http.ts` (JSON bodies, ids, codes, same-origin writes, the `promoteDue` middleware), `errors.ts` (`ApiError`), `uploads.ts` (file bodies in and out of R2), `secrets.ts` (tokens, keys, and hashes), `dispatch.ts` ("Evaluate now": GitHub's repository_dispatch), `test/` (API test helper and fixtures).
- `shared/`: code for the API, the browser, and the robot: zod request schemas and response types (`api.ts`), school year, class names, student names, ids, test codes (`tests.ts`), file rules and R2 keys (`files.ts`), the robot's output contracts and their checks (`schemas.ts`), points and grades (`scoring.ts`), the robot API bodies (`runner.ts`).
- `migrations/`: D1 SQL migrations, numbered. One statement per `;` at a line end (the test helper splits on that), and no `;` inside strings.
- `public/`: copied as-is into `dist/`: `_routes.json` (only `/api/*` runs Functions), `_redirects`, `_headers`, `theme.js`, `favicon.svg`, `robots.txt`.
- `scripts/`: `seed-local.sql` (the local teacher), `smoke.mjs` (checks a running local server, including one full upload).

## Commands

- `npm test`: all tests (Vitest projects "web" and "node").
- `npm run typecheck`: TypeScript, one strict config for everything.
- `npm run build`: typecheck, then the Vite build into `dist/`.
- `npm run db:local`: apply the migrations to the local D1 and add the local teacher.
- `npm run dev:api` and `npm run dev:web` (two terminals): develop with hot reload at http://localhost:5173/admin/. A started test's student page is at `http://localhost:5173/u/<token>`.
- `npm run db:local`, then `npm run preview`, then `npm run smoke` in a second terminal: the production build on http://127.0.0.1:8788 and its smoke test, which also plays the robot. Each smoke run leaves one class with one student in the local database, and makes a new local robot key.

## Rules

- All user-facing text is Romanian. The API reports errors as `{ error, message }`; the UI shows `message`.
- No page tells students that AI grades their work. Student-app tests check every screen with `expectNoGradingWords()`.
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`, test codes through `parseTestCode`.
- Student calls are scoped by the test of the link's token, and an upload by the hash of the phone's secret (`X-Upload-Session`) within that test. Only hashes of secrets are stored.
- Each student write checks its own rules inside its SQL statement (`server/db/links.ts`: the test is open, the upload is not sent yet, at most 20 files; confirm is one `db.batch()`). Never turn these into a check before the write: two requests at once would get past it.
- The same holds for the robot (`server/db/runner.ts`): a claim, an exercise list, and a result check the lease or the run inside their SQL. `/check` and `/lease` send uploads left in grading by a dead run back to the queue.
- Robot answers carry ids, counts, and file types, never names: a student's page goes out as `file-<id>`. The robot's logs are public.
- Every `/api/admin` and `/api/u` request first runs `promoteDueTests` (the `promoteDue` middleware), so a scheduled test closes on time. A router added under them keeps it.
- R2 is private: every file goes through the API with an ownership check. The database is the truth: R2 keys come from rows, never from listing R2.
- Times are stored as ISO 8601 UTC strings and shown in Europe/Bucharest time. Write them with `nowIso()` or `new Date(x).toISOString()`: SQL compares them as text. The schedule input takes Romania's time (`src/ui/bucharestTime.ts`). School year Y runs from September of Y to August of Y+1.
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
- In an API test, a test set straight to `evaluating` with no upload `submitted` or `grading` turns `done` on the next request: every request ends the tests that have nothing left to grade. Add a waiting upload first.
- API tests may fake the clock with `vi.useFakeTimers({ toFake: ['Date'] })`: only Node's clock changes, and the local engine keeps working. `startTestApi({ app: { dispatchRobot } })` replaces the GitHub call; `setRobotKey()` and `robotRequest()` in `server/test/fixtures.ts` call the robot API.
- Development happens on Windows. CI runs on Linux.
- On Windows, stopping a background `npm run preview` or `npm run dev:api` job can leave `workerd.exe` listening on its port. A new server then seems to start but answers with old data, or requests hang. Check with `netstat -ano | findstr :8788` and end the leftovers in PowerShell:

  ```powershell
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*\Projects\QuickEval\node_modules*' -or $_.CommandLine -like '*npm-cli.js*run preview*' -or $_.CommandLine -like '*npm-cli.js*run dev:*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ```

## Deploy

- Cloudflare Pages project `quickeval`, connected to the GitHub repo. Every push to `main` deploys. Build command `npm run build`, output `dist`, Node version from `.node-version`. Preview deployments are off: they would share the production database and bucket.
- `wrangler.toml` is the source of truth for bindings: D1 `DB` → database `quickeval`, R2 `FILES` → bucket `quickeval-files`.
- Settings `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are Pages secrets: `npx wrangler pages secret put <NAME> --project-name quickeval`. A new secret applies from the next deployment. `GITHUB_REPO` and `GITHUB_DISPATCH_TOKEN` (spec §12.6) let "Pornește evaluarea" start the robot at once; without them, the robot starts at its next check.
- A new migration runs on the live database before the code that needs it: `npx wrangler d1 migrations apply quickeval --remote`. A new binding's resource (a bucket, a database) exists before the code that binds it reaches `main`.
- Cloudflare Access ("QuickEval admin") protects only `/admin` and `/api/admin`. Student pages (`/u`, `/api/u`) and the robot (`/api/runner`) must stay outside it.
- CI (`.github/workflows/ci.yml`) runs the typecheck, the tests, and the build on every push and pull request.
````

- [ ] **Step 4: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
- Students can upload only while `status = 'open'`. At other times the student page shows a message.
- Every API call that reads a test (robot check, teacher page, student page) first runs `promoteDueTests(now)`. This starts the evaluation of open tests whose `evaluation_at` has passed. So a scheduled test closes on time, even when the robot is late. (Plan 3 adds it, together with scheduling: before Plan 3 nothing sets `evaluation_at`.)

```

Replace it with:

```markdown
- Students can upload only while `status = 'open'`. At other times the student page shows a message.
- Every teacher and student API request, and the robot check, first runs `promoteDueTests(now)`. This starts the evaluation of open tests whose `evaluation_at` has passed: their uploads close at that time. So a scheduled test closes on time, even when the robot is late. It also ends the tests that have nothing left to grade (§8.5).

```

- [ ] **Step 5: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown

- Needs: a test file, a barem file, and at least one submission with at least one file. Otherwise the button is off and shows the reason.
- "Now": sets `status = 'evaluating'`, `evaluation_started_at = now`, and clears `evaluation_at`. Submissions in `uploading` that have at least one file become `submitted` with `auto_submitted = 1`. Uploading submissions with no files are left as they are. Then the API sends `repository_dispatch` with `event_type: "evaluate-now"`, so the robot starts in about 1 minute. If the GitHub token is missing, the robot starts at the next 10-minute check, and the UI says so.
```

Replace it with:

```markdown

- Needs: a test file, a barem file, and at least one submission with at least one file. Otherwise the button is off and shows the reason. A schedule needs only the two files, because the uploads may still come. At the scheduled time the uploads close even if nobody uploaded; a test with nothing to grade then ends at once.
- "Now": sets `status = 'evaluating'`, `evaluation_started_at = now`, and clears `evaluation_at`. Submissions in `uploading` that have at least one file become `submitted` with `auto_submitted = 1`. Uploading submissions with no files are left as they are. Then the API sends `repository_dispatch` with `event_type: "evaluate-now"`, so the robot starts in about 1 minute. If the GitHub token is missing, the robot starts at the next 10-minute check, and the UI says so.
```

- [ ] **Step 6: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
- The robot makes the exercise list, grades each submitted upload, then writes the class analysis (§12).
- `evaluating → done`: no submission is `submitted` or `grading`, and `analysis_status` is `ready` or `failed`.
- **Reopen uploads** (from evaluating or done): sets `status = 'open'` and clears `evaluation_at`. Graded results stay. New uploads get graded at the next **Start evaluation**. The analysis is then marked stale.
- **Replace the test file or the barem**: allowed in any status except `evaluating`. A new barem clears the exercise list (`exercise_list_status = 'none'`). It does not regrade old results. The teacher uses Regrade for that.
- **Regrade** (one submission, or all graded submissions of the test): deletes their evaluations and sets them to `submitted`. If the test is `done`, it goes back to `evaluating`. If the test is `open`, the regrade waits for Start evaluation. The UI warns that teacher corrections will be lost.
```

Replace it with:

```markdown
- The robot makes the exercise list, grades each submitted upload, then writes the class analysis (§12).
- `evaluating → done`: no submission is `submitted` or `grading`, and `analysis_status` is not `requested`. (Plan 4 decides when the first class analysis is asked for.)
- **Reopen uploads** (from evaluating or done): sets `status = 'open'` and clears `evaluation_at`. Graded results stay. New uploads get graded at the next **Start evaluation**. The analysis is then marked stale.
- **Replace the test file or the barem**: allowed in any status except `evaluating`. While evaluating, it is allowed when the exercise list is `problem` or `failed`: the robot then reads neither file. A new barem clears the exercise list (`exercise_list_status = 'none'`). It does not regrade old results. The teacher uses Regrade for that.
- **Regrade** (one submission, or all graded submissions of the test): deletes their evaluations and sets them to `submitted`. If the test is `done`, it goes back to `evaluating`. If the test is `open`, the regrade waits for Start evaluation. The UI warns that teacher corrections will be lost.
```

- [ ] **Step 7: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
- Uploads table, refreshed every 10 s while the status is open or evaluating. One row per active student of the class: name, status (Nu a trimis / Încarcă… / Trimis / Se corectează / Corectat / Eroare), file count, time, grade, flag count. "Fără confirmare" marks `auto_submitted`. Row actions: view files and result, **Resetează** (delete the upload so the student can start again), **Reîncearcă** (failed → submitted), **Recorectează** (regrade).
- Robot line: "Robotul a verificat acum 3 min" from `runner_state.last_check_at`. It shows a warning after 30 min without a check.
- Link to the class report when at least one submission is graded.
```

Replace it with:

```markdown
- Uploads table, refreshed every 10 s while the status is open or evaluating. One row per active student of the class: name, status (Nu a trimis / Încarcă… / Trimis / Se corectează / Corectat / Eroare), file count, time, grade, flag count. "Fără confirmare" marks `auto_submitted`. Row actions: view files and result, **Resetează** (delete the upload so the student can start again), **Reîncearcă** (failed → submitted), **Recorectează** (regrade).
- Robot line: "Robotul a verificat acum 3 min" from `runner_state.last_check_at`, while the test is evaluating or has a scheduled evaluation. It shows a warning after 30 min without a check.
- Link to the class report when at least one submission is graded.
```

- [ ] **Step 8: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `POST /tests` `{ classId, title }` | Create a draft test; returns the code. |
| `GET /tests/:code` | Test detail, uploads table, exercise-list and analysis status, robot line. |
| `PATCH /tests/:code` `{ title }` | Rename. |
```

Replace it with:

```markdown
| `POST /tests` `{ classId, title }` | Create a draft test; returns the code. |
| `GET /tests/:code` | Test detail, uploads table, exercise-list status, robot line. (The analysis status comes with Plan 4.) |
| `PATCH /tests/:code` `{ title }` | Rename. |
```

- [ ] **Step 9: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
|---|---|
| `POST /check` | Runs `promoteDueTests`, sets `last_check_at`, returns `{ hasWork, exerciseLists, pendingGrading, analyses }` (counts). |
| `POST /lease` `{ runId }` | Takes the robot lease if it is free or stale (no heartbeat for 15 min). It then sets every `grading` submission back to `submitted`, because a stale lease means the old run died. Returns `{ granted, maxParallel }`. |
| `POST /heartbeat` `{ runId }` | Keeps the lease. 409 if the lease belongs to another run. |
```

Replace it with:

```markdown
|---|---|
| `POST /check` | Sends uploads left in `grading` by a run that is not alive back to `submitted`, runs `promoteDueTests`, sets `last_check_at`, returns `{ hasWork, exerciseLists, pendingGrading, analyses }` (counts). |
| `POST /lease` `{ runId }` | Takes the robot lease if it is free, stale (no heartbeat for 15 min), or already this run's. It then sets every `grading` submission of another run back to `submitted`, because a stale lease means the old run died. Returns `{ granted, maxParallel }`. |
| `POST /heartbeat` `{ runId }` | Keeps the lease. 409 if the lease belongs to another run. |
```

- [ ] **Step 10: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
| `GET /tasks` | `{ exerciseLists: number[], pendingGrading: number, analyses: number[] }` (test ids). |
| `GET /tests/:id` | Code, file metadata (test, barem), exercise list. |
| `GET /tests/:id/files/:kind` | Stream the test or barem file. |
| `POST /tests/:id/exercise-list` `{ runId, ok: true, exerciseList } \| { runId, ok: false, error }` | Save the list. The API validates it and sets `ready` or `problem`. On an error it adds 1 to the attempts and sets `failed` at 3. |
| `POST /claim` `{ runId }` | Takes the oldest `submitted` submission of an `evaluating` test whose exercise list is `ready` or `accepted`, and sets it to `grading`. Returns `{ submissionId, testId, files: [{ id, contentType, position }] }`, or 204 when there is none. |
| `GET /submissions/:id/files/:fileId` | Stream a student file. |
| `POST /submissions/:id/result` `{ runId, ok: true, result, model } \| { runId, ok: false, error, retryable }` | Accepted only when the submission is `grading` and its `run_id` equals `runId`. Otherwise 409, and the robot drops the result (another run took the work over). Save a result (§12.5): the API validates it, computes totals, and stores the evaluation and its items in one batch. On an error: if `retryable`, the submission goes back to `submitted`; else attempts + 1, and `failed` at 3. |
| `GET /tests/:id/results` | Anonymized class data for the analysis: "Elev 1..n", items, points, comments. No names. |
| `POST /tests/:id/analysis` `{ runId, ok: true, analysis } \| { runId, ok: false, error }` | Save the analysis (`ready`, `analysis_stale = 0`). On an error, attempts + 1, and `failed` at 3. Then the API checks whether the test is `done`. |

```

Replace it with:

```markdown
| `GET /tasks` | `{ exerciseLists: number[], pendingGrading: number, analyses: number[] }` (test ids). |
| `GET /tests/:id` | Id, file types (test, barem), exercise list. |
| `GET /tests/:id/files/:kind` | Stream the test or barem file. |
| `POST /tests/:id/exercise-list` `{ runId, ok: true, exerciseList } \| { runId, ok: false, error }` | Save the list, only from the run that holds the lease (else 409 `lease_lost`) and only while the list is waited for (else 409 `not_needed`). The API validates it (a broken list: 422 `invalid_result`) and sets `ready` or `problem`. On an error it adds 1 to the attempts (none for `usage_limit`) and sets `failed` at 3. |
| `POST /claim` `{ runId }` | Takes the oldest `submitted` submission of an `evaluating` test whose exercise list is `ready` or `accepted`, and sets it to `grading`, in one statement. Needs the lease (else 409 `lease_lost`). Returns `{ submissionId, testId, files: [{ id, contentType, position }] }`, or 204 when there is none. |
| `GET /submissions/:id/files/:fileId` | Stream a student file. |
| `POST /submissions/:id/result` `{ runId, ok: true, result, model } \| { runId, ok: false, error }` | Accepted only when the submission is `grading` and its `run_id` equals `runId`. Otherwise 409 `taken_over` (404 for a deleted submission), and the robot drops the result (another run took the work over). Save a result (§12.5): the API validates it (a broken result: 422 `invalid_result`), computes totals, and stores the evaluation and its items in one batch. `error` is `timeout`, `invalid_output`, `crash`, or `usage_limit`. On `usage_limit` the submission goes back to `submitted` with no attempt counted; else attempts + 1, and `failed` at 3. |
| `GET /tests/:id/results` | (Plan 4.) Anonymized class data for the analysis: "Elev 1..n", items, points, comments. No names. |
| `POST /tests/:id/analysis` `{ runId, ok: true, analysis } \| { runId, ok: false, error }` | (Plan 4.) Save the analysis (`ready`, `analysis_stale = 0`). On an error, attempts + 1, and `failed` at 3. Then the API checks whether the test is `done`. |

```

- [ ] **Step 11: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
  - Code computes the total and the grade (§7.3).
- All text fields are limited in length: comment ≤ 1000 chars, summary ≤ 1500 chars, list entries ≤ 300 chars.

```

Replace it with:

```markdown
  - Code computes the total and the grade (§7.3).
- All text fields are limited in length: comment ≤ 1000 chars, summary ≤ 1500 chars, list entries ≤ 300 chars. Code cuts a longer text (it ends with "…") instead of refusing the result, so one long comment never wastes a grading.

```

- [ ] **Step 12: Edit `docs/superpowers/specs/2026-10-06-quickeval-design.md`**

Find this block:

```markdown
   - Result: students upload from phones, and the teacher sees who did.
3. **Evaluation robot**:
   - the spike (§12.4);
   - zod contracts and JSON Schemas;
   - the robot API with lease, claim, and results;
   - `runner/` with the pool, work folders, pandoc, Claude runs, checks, and scoring;
   - the first grading skill and the `npm run try:skill` script (§13);
   - `evaluate.yml`;
   - Start evaluation (now or scheduled), Evaluate now, and Setări (parallel agents, robot key, robot status).
   - Result: tests are graded automatically.
4. **Review and reports**:
   - the student result page (flags, corrections, Verificat, Regrade);
   - the class analysis task in the robot;
   - the class report (table, statistics, analysis);
```

Replace it with:

```markdown
   - Result: students upload from phones, and the teacher sees who did.
3. **Evaluation robot**, in two plans:
   - **3a**: zod contracts and their checks; the robot API with lease, claim, and results; Start evaluation (now or scheduled), Evaluate now, and Setări (parallel agents, robot key, robot status). Result: the teacher closes tests on time, and the API is ready for the robot.
   - **3b**: the spike (§12.4); the JSON Schemas; `runner/` with the pool, work folders, pandoc, Claude runs, and checks; the first grading skill and the `npm run try:skill` script (§13); `evaluate.yml`. Result: tests are graded automatically.
4. **Review and reports**:
   - the student result page (flags, corrections, Verificat, Regrade);
   - the class analysis task in the robot (the `ClassAnalysis` contract, `GET /tests/:id/results`, `POST /tests/:id/analysis`, Regenerează);
   - the class report (table, statistics, analysis);
```

- [ ] **Step 13: Edit `docs/superpowers/plans/plan-2-followups.md`**

Find this block:

```markdown

## For Plan 3

- `GET /api/u/<token>` must call `promoteDueTests` (spec §8.3).
- Resetting an upload has no status guard: the robot must treat a result for a deleted submission as 404.
- Until Plan 3, a started test cannot be closed: start works only from `draft`, reopen only from `evaluating` or `done`. The link keeps working until the test is deleted, and deleting the test deletes the uploads.
- `GET /api/admin/tests/:code` does not yet return the exercise-list and analysis status or the robot line (spec §11.1).

```

Replace it with:

```markdown

## For Plan 3 (done in Plan 3a)

- Every `/api/u` request runs `promoteDueTests` (spec §8.3).
- A result for a deleted submission answers 404, and the robot drops it.
- A started test can be closed: Start evaluation, now or scheduled.
- `GET /api/admin/tests/:code` returns the exercise-list status and the robot line. The analysis status comes with Plan 4.

```

- [ ] **Step 14: Create `docs/superpowers/plans/plan-3a-followups.md`**

```markdown
# Plan 3a follow-ups

Plan 3a built the closing of tests (now or at a set time), the robot API, and Setări. The robot itself comes with Plan 3b. Write Plan 3b from the repo and the spec (the spec has Plan 3a's changes).

## For Plan 3b

- Tests that the teacher closed during Plan 3a sit in `evaluating` with `submitted` uploads. The robot grades them all as soon as it runs. Before the robot's secrets are set, list the `evaluating` tests and ask the user which ones to grade; reopen or delete the others.
- The robot checks every output with `checkExerciseList` and `checkGrading` (`shared/schemas.ts`) before it sends it, and gives Claude `z.toJSONSchema()` of `exerciseListSchema` and `gradingResultSchema`. The API answers 422 `invalid_result` to an output those checks refuse: the robot counts it as `invalid_output`.
- Error codes the robot handles: 409 `lease_lost` (stop taking work), 409 `taken_over` and 404 (drop the result), 409 `not_needed` (drop the exercise list), 401 `robot_denied` (stop the run).
- A page goes to the robot as `file-<id>`; the robot names its work files by upload order.
- Set the Pages settings `GITHUB_REPO` and `GITHUB_DISPATCH_TOKEN`, and the GitHub secrets `QUICKEVAL_RUNNER_KEY` (Setări) and `CLAUDE_CODE_OAUTH_TOKEN`.

## For Plan 4

- The class analysis: the `ClassAnalysis` contract, `GET /api/runner/tests/:id/results`, `POST /api/runner/tests/:id/analysis`, Regenerează, and when the first analysis is asked for (today only a ready or failed analysis is asked for again).
- The result page: the items, corrections, Verificat, and Regrade (one upload, or all of a test).

## Still open

- An exercise list made from a barem that the teacher replaced while the robot worked is still saved, when the replace set the list back to `none` in between. Fix: send the barem's key hash with the list, and save only if it matches.
- Every `/api/u` request runs the promotion writes, also one with an unknown token. They change nothing when nothing is due.
- A student who is still uploading when a scheduled evaluation starts gets "Încărcarea s-a închis." with a retry button that cannot work; after a reload the phone says "Dacă nu ai trimis lucrarea, spune-i profesorului", although the pages with files were sent without a confirm. Fix in the student app: say that the pages were sent.
- The robot line counts minutes from the browser's clock.
- `runner_state.last_run_summary` keeps only the last run.
```

- [ ] **Step 15: Run all tests**

Run: `npm test`
Expected: PASS. `Test Files  49 passed (49)`, `Tests  519 passed (519)`.

- [ ] **Step 16: Commit**

```bash
git add scripts/smoke.mjs AGENTS.md docs
git commit -m "Let the smoke test play the robot, and document Plan 3a"
```

---

### Task 10: Go live (main session)

The new tables exist in the live database before the code that reads them reaches `main`. Every push to `main` deploys. Ask the user before each step marked "ask first", and wait for a clear yes. Steps marked "(user)" are checks the user makes. curl to the live site is denied in this environment: use `fetch` in the browser pane.

**Files:**
- Modify: nothing, unless a check fails.

- [ ] **Step 1: Check the branch**

Run: `git status --short`, `npm test`, `npm run build`
Expected: a clean tree on the Plan 3a branch, all tests pass, the build ends with `✓ built in …`.

- [ ] **Step 2: Check the teacher pages in a browser (controller)**

The controller does this check in the browser pane on the production build: `npm run db:local`, then the `preview` server from `.claude/launch.json`. Make the data with `fetch` calls in the page (the local teacher login works on localhost): a class with three students, a test with a PDF test and barem, and Start test; make the two students' uploads (sessions, a JPEG each, confirm) after item 2. Before clicking a button that asks for a confirm, run `window.confirm = () => true` in the page, and move between pages with the menu links: a full page load drops that override. Then, on the test page:
1. Before the uploads: "Pornește evaluarea acum" is off and says "Ca să pornești evaluarea: Niciun elev nu a încărcat încă fișiere."
2. Schedule a time tomorrow in the input "Sau pornește evaluarea automat la" and click **Programează**. Expected: "Evaluarea pornește automat la …" with the same clock time, and the robot line. Click **Anulează programarea**: the form comes back.
3. After the uploads: click **Pornește evaluarea acum** and confirm. Expected: "Se corectează", "Robotul pornește la următoarea lui verificare.", the robot line, and **Redeschide încărcarea**.
4. On Setări (menu), click **Fă cheia robotului** (or **Fă o cheie nouă**, when the smoke test already made a local key): a 43-character key shows once.
5. As a pretend robot with that local key (`fetch` with `Authorization: Bearer <key>`): `/api/runner/check`, `/lease`, `/tasks`, then an exercise list whose points add to 10 with `totalPoints: 12`. Expected on the test page: "Baremul are o problemă. Punctajele din barem dau 10, dar totalul este 12." and **Folosește oricum**, and the barem can be replaced. Click **Folosește oricum**.
6. Claim one upload and send a grading (one low-confidence item); claim the other and send `{ ok: false, error: 'timeout' }` three times; release. Expected: one row with a grade (for points 4 and 2.5 out of 12 with 1 office point: "6,25") and 1 item to check, one row "Eroare" with "Robotul nu a terminat la timp." and **Reîncearcă**; the test "Corectat". Click **Reîncearcă**: the row shows "Trimis", the test "Se corectează".
7. No console errors.
8. Delete the test with **Șterge testul**. A test left in evaluation with a waiting upload would be claimed by a later smoke run instead of the smoke run's own upload.
Stop the preview and check that nothing listens on port 8788.

- [ ] **Step 3: Run the Linux CI (ask first)**

Push the Plan 3a branch and open a pull request into `main`, so `ci.yml` runs on Linux in UTC. Preview deployments are off, so nothing deploys. After `gh pr create`, use the ccd_pr tools (`get_status`, and `bind_pr` if needed). Wait until the check `test` passes.

- [ ] **Step 4: Apply the migration to the live database (ask first)**

Run: `npx wrangler d1 migrations list quickeval --remote`
Expected: only `0003_robot.sql` is waiting. Then run `npx wrangler d1 migrations apply quickeval --remote`. Expected: `0003_robot.sql` with ✅. Then:
`npx wrangler d1 execute quickeval --remote --json --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('evaluations', 'evaluation_items', 'settings', 'runner_state')"` lists the four tables, and `npx wrangler d1 execute quickeval --remote --json --command "SELECT id, run_id FROM runner_state"` gives one row with `id` 1. The live site keeps working: the old code does not read the new tables.

- [ ] **Step 5: Merge and deploy (ask first)**

Merge the Plan 3a branch into `main` (the finishing-a-development-branch skill), push `main`, and wait for the GitHub check `test` of the `main` push and the Cloudflare check `Cloudflare Pages`. A fast-forward pushes a commit that already has a green `test` run from the branch: read `gh api repos/parameciul/quickeval/commits/<sha>/check-suites` and take the GitHub Actions suite whose `head_branch` is `main`. Read the checks once each time the user asks or after other work; do not poll in a loop.

- [ ] **Step 6: Check the open and closed routes from outside Access**

In the browser pane, open https://quickeval.pages.dev/ and run in the page:
- `fetch('/api/runner/check', { method: 'POST', cache: 'no-store' })` → 401 with `{"error":"robot_denied", …}` (JSON, not an Access login page);
- `fetch('/api/admin/settings', { cache: 'no-store', redirect: 'manual', credentials: 'omit' })` → type `opaqueredirect` (Access still protects the teacher API);
- `fetch('/api/u/abcdefghijkmnop2', { cache: 'no-store' })` → 404 `unknown_link`.

- [ ] **Step 7: Check closing on time on the live site (user)**

The user logs in at https://quickeval.pages.dev/admin/ with the **test account** (not Laura's account) and:
1. Makes a test for class 6E2 with a PDF as the test and a PDF as the barem, and clicks **Începe testul**.
2. Opens the link on a phone and uploads one photo (no confirm needed).
3. On the test page, schedules the evaluation 3 minutes ahead and waits until that time passes. Expected: after a reload, the test shows "Se corectează", the upload "Trimis" with "Fără confirmare", and the robot warning; the phone shows "Încărcarea s-a închis." after a reload.
4. Opens Setări: the page shows "Robotul nu are încă o cheie." Do not make a live robot key now: it shows once, and nothing uses it before Plan 3b.
5. Deletes the test.
Ask the user what they saw, and confirm on the teacher page.

- [ ] **Step 8: Report**

Tell the user what is live and what the checks showed. Tell Laura: **Pornește evaluarea** and **Programează** close the uploads now, but the grading starts only with Plan 3b; until then, a closed test shows the robot warning, and the robot grades it when Plan 3b goes live (Plan 3b asks first which closed tests to grade).
