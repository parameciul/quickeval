# MQGrader: any subject, Plan B (the teacher's "Schimbă" and the subject on the test page) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The last task (the live database, push) must run in the main session, not in a subagent:** every outward step needs the user's explicit yes.

**Goal:** The teacher sees the test's subject in Fișa testului and sets or changes it ("Alege materia", "Schimbă materia"); a change after the exercise list exists makes the lists again and grades the papers again, once for free in a demo account; a subject the robot does not grade says so in Pregătire and in Corectare, with "Schimbă materia" next to it.

**Architecture:** One route, `PUT /api/admin/tests/<code>/subject`, with one of the seven subjects (never `alta`). `setSubject` (`server/db/lifecycle.ts`) does it in one batch whose first write saves the test and checks every rule on the row as it was: only while the robot reads neither file and no paper is being graded, never in a Quick Try, a test that ended at `alta` only when it is a demo account's one test, and a paid regrade only within the demo limit. Migration 0028 (not live yet) gets `tests.subject_regraded` and `submissions.free_regrade`, and makes the paper-count trigger of migration 0019 again so a free regrade's papers do not count. The teacher app gets `SubjectForm.tsx` (the seven subjects as radio buttons, in place of the button) in Fișa testului, in the barem warning of Corectare and in a notice in Pregătire.

**Tech Stack:** Node 24, TypeScript, React 19, Hono on Cloudflare Pages with D1, Vitest, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-any-subject-design.md` (approved by the user on 2026-11-11), sections "The teacher can fix it", "A subject that is not supported" and "The demo account". This is Plan B of three; Plan A (`docs/superpowers/plans/2026-11-11-any-subject-a.md`) is built on this branch, and the user chose to ship A and B together (2026-11-12). Root `AGENTS.md`, `server/AGENTS.md` and `src/AGENTS.md` hold the project rules.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- The subjects the teacher may choose, in this order: `matematica`, `fizica`, `chimie`, `biologie`, `stiinte`, `romana`, `engleza` (`SUBJECTS`, `SUBJECT_NAMES` in `shared/subjects.ts`, from Plan A).
- One migration, `migrations/0028_test_subject.sql`: this plan adds to it, because it is not on the live database yet. It runs on the live database **before** the code reaches `main` (`docs/deploy.md`): the last task asks the user first.
- Every teacher query is scoped by the teacher's id. A write checks its own rules inside its SQL. Every path that makes robot work starts the robot. At most 15 D1 queries and 10 ms of CPU per request.
- No student page, student PDF or student-visible text changes: the subject shows only on the teacher's pages.
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch that holds this plan. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone; the full run then counts as passed when its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact for the branch alone. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protoanyb/b1` and `refs/protoanyb/b2`, one per task, on `refs/protoanyb/bbase` (the same files as the commit `bcb1e46`, the end of Plan A). After Task N, `git diff --stat refs/protoanyb/bN HEAD -- . ':!docs/superpowers'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building the prototype on 2026-11-12. They refine the spec's "builder's call" parts; the user checks them when reading.

1. **The teacher chooses only a subject the robot grades.** The list has the seven subjects, never "altă materie": choosing one the robot does not grade would only stop the grading. A value outside the seven is refused (400).
2. **When the subject can change** is the rule of the files (the file route's 409 `evaluating`): a draft, open or finished test, or one in evaluation whose class list has a problem or failed (this includes a list that ended at `alta`), and never while a paper is being graded. Otherwise 409 `evaluating`: "Testul se corectează acum. Poți schimba materia după ce se termină corectarea." So no grading or list in flight ever reads an old subject.
3. **A new subject after a list exists** (the test in evaluation or done, and its class or CES list not `none`) resets both lists, sends the graded and failed papers to the robot again (results and corrections go), sends a finished test back to evaluation, clears a ready class analysis, and the route starts the robot. Choosing the subject the test already has changes nothing but `subject_by`. No subject counts as math.
4. **The free regrade.** The first such regrade of a test sends its **graded** papers for free: they get `free_regrade = 1`, the paper-count trigger skips them and a second trigger clears the mark when the paper is graded; `papersWaitingSql` skips them, so they take no paper from the limit while they wait. The test gets `subject_regraded = 1`. Its failed papers (never counted) go within the demo limit, the failed first, as "Recorectează tot" sends them; so does every paper of a later change. A change that can send none of the test's graded or failed papers is refused (403 `demo_limit`). A free paper whose grading fails and is tried again stays free until it is graded; "Resetează" deletes the paper's row, so no mark outlives it.
5. **A test that ended at `alta`** is read again on "Schimbă" only when it is the demo account's one test (`onlyTestSql`, Plan A's review fix); otherwise 403 `demo_limit`. Its waiting papers start to count then, so the ones past the demo limit go back to uploading, as unselected uploads do.
6. **One batch, rules on the row as it was.** The batch's first write saves the test and checks every rule; it marks a remade test with `subject_regraded + 2` (2: free now, 3: paid), the later writes (hold back, regrade, delete the results) act only on a marked test, and the last write sets the mark back to 0 or 1 and sends a finished test back to evaluation. So no rule is read after another write of the batch changed what it reads.
7. **The subject is in the test's detail only**, not in `TestSummary`: no page of the teacher app lists the subject (the spec's "detail and summary"). It is a one-line change when a list needs it.
8. **The words.** Fișa testului: "Materia", with "Se stabilește la corectare" before the robot found it, the Romanian name after, and "<name> (nu o corectăm)" for `alta`; the buttons are "Alege materia" and "Schimbă materia"; the form's group is "Materia testului", with "Salvează" and "Renunță", and the line "Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou." when the choice regrades. Pregătire shows the notice "Nu corectăm încă această materie." with `unsupportedMessage(name)` while the subject is `alta`.
9. **A CES list being made** while the class list waits for the teacher is not saved after a change: the change bumps `ces_files_version` (the robot's list save checks it). The class list is never being made then.
10. **Plan A's last steps move here.** Plan A's Task 5 ran its comparison (accepted by the user on 2026-11-12); its live migration and push run in Task 3 of this plan, for both plans together.

## Review Focus

1. A demo account cannot get gradings past its limit by changing the subject: the free regrade sends only graded papers, once per test; a failed paper and a later change keep to the limit; and a test of a subject not graded is read again only as its one test (Task 1, the "a demo account" tests).
2. The robot never grades with an old subject: no change while a paper is being graded or the list is being made (Task 1, "waits while the robot reads the test and the barem").
3. Choosing the current subject changes no result and uses no free regrade (Task 1, "changes nothing for the subject the test already has").
4. A Quick Try has no "Schimbă": the route refuses it in its SQL, and its link's allow-list does not have the route (Task 1, "is not for a Quick Try"; `ALLOWED` is unchanged).
5. Every remade test starts the robot, from what the batch returned (Task 1, the robot checks in "makes the list again…" and "makes both lists again…").

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch and the prototype**

Run: `git status --short` and `git log --oneline -2`
Expected: nothing changed; HEAD is the commit that adds this plan, on top of `bcb1e46 Compare two papers of each test by default`.

Run: `git rev-parse --verify refs/protoanyb/b2`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

Run: `npx wrangler d1 migrations list quickeval --local`
Expected: `0028_test_subject.sql` is in the list of migrations to apply (never applied to the local database). If it was applied, run `npm run db:local` again after Task 1 only on a fresh local database: an applied migration does not run again.

### Task 1: "Schimbă" in the API

Migration 0028's free regrade, `testSubjectBody` and `SubjectAnswer`, `setSubject`, and the route.

**Files:**
- Create: `server/routes/subjectChange.test.ts`
- Modify: `migrations/0028_test_subject.sql`, `shared/api.ts`, `server/db/lifecycle.ts`, `server/routes/tests.ts`, `server/AGENTS.md`
- Test: `server/routes/subjectChange.test.ts`

**Interfaces:**
- Consumes: Plan A's `SUBJECTS`, `SubjectInfo`, `unsupportedMessage` (`shared/subjects.ts`), `onlyTestSql`, `papersWaitingSql`, `PAPERS_LEFT_TO_REGRADE`, `HOLD_BACK`, `GRADE_AGAIN`, `STATUS_BEFORE`, `countGradingAgain` (`server/db/lifecycle.ts`).
- Produces: `testSubjectBody` (zod: `{ subject }`, one of `SUBJECTS`) and `SubjectAnswer { subject: SubjectInfo; count: number; testStatus: TestStatus; robot: RobotStart | null }` in `shared/api.ts`; `setSubject(db, teacherId, testId, subject, now): Promise<SubjectChange | null>` and `SubjectChange` in `server/db/lifecycle.ts`; `PUT /api/admin/tests/<code>/subject` (200 `SubjectAnswer`, 400, 403 `demo_limit`, 404, 409 `evaluating`).

- [ ] **Step 1: Create `server/routes/subjectChange.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_PAPER_LIMIT } from '../../shared/accounts.ts';
import { unsupportedMessage } from '../../shared/subjects.ts';
import { addEvaluation, addSubmission, addTestFiles, makeClass, makeTest, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// "Schimbă" (spec: any subject, "The teacher can fix it"): the teacher sets the
// subject of a test; after the exercise list exists, the list is made again
// and the graded papers are graded again, once for free in a demo account.

const PAST = '2026-10-06T08:00:00.000Z';
const HISTORY = unsupportedMessage('istorie');

let api: TestApi;
const dispatchRobot = vi.fn(async () => true);
let code: string;
let testId: number;
let classId: number;
let studentIds: number[];

const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(...params, testId).run();
const row = () =>
  api.db
    .prepare(
      `SELECT subject, subject_name, subject_by, subject_regraded, status, exercise_list_status, exercise_list_message, ces_exercise_list_status,
         ces_files_version
       FROM tests WHERE id = ?`,
    )
    .bind(testId)
    .first<Record<string, unknown>>();
const papers = async () =>
  (await api.db.prepare('SELECT status, free_regrade FROM submissions WHERE test_id = ? ORDER BY id').bind(testId).all<{ status: string; free_regrade: number }>())
    .results;
const papersGraded = async () =>
  (await api.db.prepare('SELECT papers_graded FROM teachers WHERE id = ?').bind(api.teacherId).first<{ papers_graded: number }>())!.papers_graded;
const change = (subject: string, testCode = code) => api.request('PUT', `/api/admin/tests/${testCode}/subject`, { subject });
// The robot's results arrive: every waiting paper of the test is graded, and
// the test is done with its new list.
async function graded(): Promise<void> {
  await api.db.prepare("UPDATE submissions SET status = 'graded' WHERE test_id = ? AND status = 'submitted'").bind(testId).run();
  await setTest("status = 'done', exercise_list_status = 'ready', exercise_list_json = '{}'");
}
const demo = (used: number) =>
  api.db.prepare("UPDATE teachers SET role = 'teacher', demo = 1, papers_graded = ? WHERE id = ?").bind(used, api.teacherId).run();

// A finished math test with two graded papers.
async function finished(): Promise<void> {
  for (const studentId of studentIds) await addEvaluation(api, await addSubmission(api, code, studentId, { status: 'graded', files: 1 }));
  await setTest(
    "status = 'done', evaluation_started_at = ?, exercise_list_status = 'ready', exercise_list_json = '{}', subject = 'matematica', subject_by = 'robot'",
    PAST,
  );
}

// A test in evaluation whose list ended at a subject not graded, with sent papers.
async function endedAtHistory(sent = 1): Promise<void> {
  for (const studentId of studentIds.slice(0, sent)) await addSubmission(api, code, studentId, { status: 'submitted', files: 1 });
  await setTest(
    "status = 'evaluating', evaluation_started_at = ?, subject = 'alta', subject_name = 'istorie', subject_by = 'robot', exercise_list_status = 'failed', exercise_list_message = ?",
    PAST,
    HISTORY,
  );
}

beforeEach(async () => {
  dispatchRobot.mockClear();
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  classId = cls.id;
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  await addTestFiles(api, code);
  testId = await testIdOf(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('the teacher sets the subject', () => {
  it('saves it on a draft or open test as the teacher’s, and starts nothing', async () => {
    const res = await change('fizica');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subject: { value: 'fizica', name: '', by: 'teacher' }, count: 0, testStatus: 'draft', robot: null });
    await startTest(api, code);
    // Starting the test asks for its print PDF.
    dispatchRobot.mockClear();
    expect((await change('chimie')).body).toMatchObject({ subject: { value: 'chimie', by: 'teacher' }, testStatus: 'open', robot: null });
    expect(await row()).toMatchObject({ subject: 'chimie', subject_by: 'teacher', exercise_list_status: 'none' });
    expect(dispatchRobot).not.toHaveBeenCalled();
  });

  it('takes only a subject the robot grades', async () => {
    for (const subject of ['istorie', 'alta', '']) {
      const res = await change(subject);
      expect(res.status).toBe(400);
    }
    expect(await row()).toMatchObject({ subject: null, subject_by: null });
  });

  it('waits while the robot reads the test and the barem', async () => {
    await startTest(api, code);
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'ready', exercise_list_json = '{}', subject = 'matematica', subject_by = 'robot'");
    const res = await change('fizica');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('evaluating');
    // A list with a problem leaves the files to the teacher, but not while a paper is being graded.
    await api.db.prepare("UPDATE submissions SET status = 'grading' WHERE test_id = ?").bind(testId).run();
    await setTest("exercise_list_status = 'problem'");
    expect((await change('fizica')).status).toBe(409);
    expect(await row()).toMatchObject({ subject: 'matematica', subject_by: 'robot' });
  });

  it('makes the list again for a test that ended at a subject not graded, and its papers are graded', async () => {
    await startTest(api, code);
    await endedAtHistory();
    dispatchRobot.mockClear();
    const res = await change('fizica');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ subject: { value: 'fizica', by: 'teacher' }, count: 0, testStatus: 'evaluating' });
    expect(res.body.robot).not.toBeNull();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({ subject: 'fizica', subject_name: '', exercise_list_status: 'none', exercise_list_message: null });
    expect(await papers()).toEqual([{ status: 'submitted', free_regrade: 0 }]);
  });

  it('makes both lists again on a finished test, and grades every paper again', async () => {
    await finished();
    await setTest("ces_exercise_list_status = 'ready', ces_exercise_list_json = '{}'");
    const res = await change('fizica');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ count: 2, testStatus: 'evaluating' });
    expect(res.body.robot).not.toBeNull();
    // A CES list being made with the old subject is not saved.
    expect(await row()).toMatchObject({ subject: 'fizica', status: 'evaluating', exercise_list_status: 'none', ces_exercise_list_status: 'none', ces_files_version: 1 });
    expect((await papers()).map((paper) => paper.status)).toEqual(['submitted', 'submitted']);
    const left = await api.db.prepare('SELECT COUNT(*) AS n FROM evaluations e JOIN submissions s ON s.id = e.submission_id WHERE s.test_id = ?').bind(testId).first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  it('changes nothing for the subject the test already has, only who set it', async () => {
    await finished();
    const res = await change('matematica');
    expect(res.body).toEqual({ subject: { value: 'matematica', name: '', by: 'teacher' }, count: 0, testStatus: 'done', robot: null });
    expect(await row()).toMatchObject({ status: 'done', exercise_list_status: 'ready', subject_regraded: 0 });
    expect((await papers()).map((paper) => paper.status)).toEqual(['graded', 'graded']);
  });

  it('grades again on every change in a complete account', async () => {
    await finished();
    expect((await change('fizica')).body.count).toBe(2);
    await graded();
    expect(await papersGraded()).toBe(0);
    expect((await change('chimie')).body.count).toBe(2);
    await graded();
    expect(await papersGraded()).toBe(2);
  });

  it('is not for a Quick Try', async () => {
    await setTest('quick_try = 1');
    expect((await change('fizica')).status).toBe(404);
    expect(await row()).toMatchObject({ subject: null });
  });

  it('is not for another teacher’s test', async () => {
    expect((await change('fizica', '6E2-26T9')).status).toBe(404);
  });
});

describe('a demo account', () => {
  it('grades the papers again once for free after a change of subject, even at its limit', async () => {
    await finished();
    await demo(DEMO_PAPER_LIMIT);
    expect((await change('fizica')).body).toMatchObject({ count: 2, testStatus: 'evaluating' });
    expect(await papers()).toEqual([
      { status: 'submitted', free_regrade: 1 },
      { status: 'submitted', free_regrade: 1 },
    ]);
    await graded();
    expect(await papersGraded()).toBe(DEMO_PAPER_LIMIT);
    expect(await papers()).toEqual([
      { status: 'graded', free_regrade: 0 },
      { status: 'graded', free_regrade: 0 },
    ]);
    // The second change is a normal regrade: the limit is reached.
    const res = await change('chimie');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('demo_limit');
    expect(await row()).toMatchObject({ subject: 'fizica', status: 'done', exercise_list_status: 'ready', subject_regraded: 1 });
  });

  it('grades for free only the papers that were graded: a failed one keeps to the limit', async () => {
    await finished();
    await api.db.prepare("UPDATE submissions SET status = 'failed' WHERE id = (SELECT MAX(id) FROM submissions WHERE test_id = ?)").bind(testId).run();
    await demo(DEMO_PAPER_LIMIT);
    expect((await change('fizica')).body).toMatchObject({ count: 1, testStatus: 'evaluating' });
    expect(await papers()).toEqual([
      { status: 'submitted', free_regrade: 1 },
      { status: 'failed', free_regrade: 0 },
    ]);
    await graded();
    expect(await papersGraded()).toBe(DEMO_PAPER_LIMIT);
  });

  it('refuses a change that would grade nothing again at its limit', async () => {
    await finished();
    await api.db.prepare("UPDATE submissions SET status = 'failed' WHERE test_id = ?").bind(testId).run();
    await demo(DEMO_PAPER_LIMIT);
    const res = await change('fizica');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('demo_limit');
    expect(await row()).toMatchObject({ subject: 'matematica', status: 'done', exercise_list_status: 'ready', subject_regraded: 0 });
  });

  it('does not count the papers of the free regrade among those on their way to the robot', async () => {
    await finished();
    await demo(DEMO_PAPER_LIMIT - 1);
    await change('fizica');
    // One grading fails; the paper left of the limit lets it be tried again.
    const [failed] = (await api.db.prepare('SELECT id, started_at FROM submissions WHERE test_id = ? ORDER BY id').bind(testId).all<{ id: number; started_at: string }>()).results;
    await api.db.prepare("UPDATE submissions SET status = 'failed' WHERE id = ?").bind(failed!.id).run();
    const res = await api.request('POST', `/api/admin/submissions/${failed!.id}/retry`, { startedAt: failed!.started_at });
    expect(res.status).toBe(200);
  });

  it('cannot read again a test of a subject not graded once another test holds its one place', async () => {
    await demo(0);
    await startTest(api, code);
    await endedAtHistory();
    const other = await makeTest(api, classId, 'Alt test');
    await startTest(api, other);
    await addTestFiles(api, other);
    await addSubmission(api, other, studentIds[1]!, { files: 1 });
    expect((await api.request('POST', `/api/admin/tests/${other}/evaluate`, {})).status).toBe(200);
    const res = await change('fizica');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('demo_limit');
    expect(await row()).toMatchObject({ subject: 'alta', exercise_list_status: 'failed', exercise_list_message: HISTORY });
  });

  it('holds back the papers past its limit when a test of a subject not graded is read again', async () => {
    await demo(DEMO_PAPER_LIMIT - 1);
    await startTest(api, code);
    await endedAtHistory(2);
    expect((await change('fizica')).status).toBe(200);
    expect((await papers()).map((paper) => paper.status)).toEqual(['submitted', 'uploading']);
  });
});
```

- [ ] **Step 2: Run the new tests and see them fail**

Run: `npx vitest run server/routes/subjectChange.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  13 failed | 2 passed (15)`: the route does not exist (`expected 404 to be 200`, `expected 404 to be 400`, `expected 404 to be 409`, `expected 404 to be 403`), and the database has no `subject_regraded` (`no such column: subject_regraded`). The two tests that pass at RED are guards: another teacher's test is 404, and a free regrade's failed paper can be tried again (it matters once the route exists).

- [ ] **Step 3: Edit `migrations/0028_test_subject.sql`**

Find this block:

```sql
UPDATE tests SET subject = 'matematica', subject_by = 'teacher';
```

Replace it with:

```sql
UPDATE tests SET subject = 'matematica', subject_by = 'teacher';

-- The first change of subject after the exercise list exists grades the test's
-- graded papers again for free (spec: "The demo account"): subject_regraded
-- marks the test that used it, free_regrade each paper of it until its new
-- result arrives. Such a paper does not count in papers_graded: the trigger of
-- migration 0019 is made again with that condition, and a second trigger
-- clears the mark once the paper is graded.
ALTER TABLE tests ADD COLUMN subject_regraded INTEGER NOT NULL DEFAULT 0;

ALTER TABLE submissions ADD COLUMN free_regrade INTEGER NOT NULL DEFAULT 0;

DROP TRIGGER submissions_count_paper;

CREATE TRIGGER submissions_count_paper AFTER UPDATE OF status ON submissions
WHEN NEW.status = 'graded' AND OLD.status <> 'graded' AND NEW.free_regrade = 0
BEGIN
  UPDATE teachers SET papers_graded = papers_graded + 1 WHERE id = (SELECT teacher_id FROM tests WHERE id = NEW.test_id); END;

CREATE TRIGGER submissions_free_regrade_done AFTER UPDATE OF status ON submissions
WHEN NEW.status = 'graded' AND NEW.free_regrade = 1
BEGIN
  UPDATE submissions SET free_regrade = 0 WHERE id = NEW.id; END;
```

- [ ] **Step 4: Edit `shared/api.ts`**

Find this block:

```ts
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST, studentNameKey } from './students.ts';
import type { SubjectInfo } from './subjects.ts';
import { type AnalysisStatus, cleanTitle, MAX_TITLE_LENGTH, type ExerciseListStatus, type TestStatus } from './tests.ts';
```

Replace it with:

```ts
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST, studentNameKey } from './students.ts';
import { SUBJECTS, type SubjectInfo } from './subjects.ts';
import { type AnalysisStatus, cleanTitle, MAX_TITLE_LENGTH, type ExerciseListStatus, type TestStatus } from './tests.ts';
```

- [ ] **Step 5: Edit `shared/api.ts`**

Find this block:

```ts
export const renameTestBody = z.object({ title: testTitleSchema });

```

Replace it with:

```ts
export const renameTestBody = z.object({ title: testTitleSchema });

// "Schimbă": the teacher sets the test's subject, one the robot grades.
export const testSubjectBody = z.object({ subject: z.enum(SUBJECTS, { message: 'Alege o materie din listă.' }) });

```

- [ ] **Step 6: Edit `shared/api.ts`**

Find this block:

```ts

// New barem comments: `robot` is set when new notes need a new exercise
```

Replace it with:

```ts

// "Schimbă": the subject as saved; `count`: the papers that wait for the
// robot again (the list is made again after a change of subject). `robot` is
// set when the robot has work in the test.
export interface SubjectAnswer {
  subject: SubjectInfo;
  count: number;
  testStatus: TestStatus;
  robot: RobotStart | null;
}

// New barem comments: `robot` is set when new notes need a new exercise
```

- [ ] **Step 7: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
// paper when its result arrives, so these use the demo limit too. The papers
// of a test whose subject is not graded wait for nothing and count for nothing.
export const papersWaitingSql = (teacherId: string, waiting = "x.status = 'evaluating'") =>
  `(SELECT COUNT(*) FROM submissions w JOIN tests x ON x.id = w.test_id
    WHERE x.teacher_id = ${teacherId} AND w.status IN ('submitted', 'grading') AND COALESCE(x.subject, '') <> 'alta' AND ${waiting})`;

```

Replace it with:

```ts
// paper when its result arrives, so these use the demo limit too. The papers
// of a test whose subject is not graded wait for nothing and count for nothing,
// and so do the papers of a free regrade after a change of subject (the
// trigger does not count them).
export const papersWaitingSql = (teacherId: string, waiting = "x.status = 'evaluating'") =>
  `(SELECT COUNT(*) FROM submissions w JOIN tests x ON x.id = w.test_id
    WHERE x.teacher_id = ${teacherId} AND w.status IN ('submitted', 'grading') AND w.free_regrade = 0 AND COALESCE(x.subject, '') <> 'alta' AND ${waiting})`;

```

- [ ] **Step 8: Edit `server/db/lifecycle.ts`**

Find this block:

```ts

// "Regenerează": the class analysis is asked for again, from any analysis
```

Replace it with:

```ts

// "Schimbă" (spec: any subject). The conditions on the test row `t`, read
// before the batch writes: ?1 is the new subject.
// The teacher changes the subject while the robot reads neither file: a draft,
// open or finished test, or one in evaluation whose list waits for the teacher
// (a problem, or failed), and never while a paper is being graded. Not in a
// Quick Try: its robot work stays bounded.
const subjectEditable = (t: string) => `(${t}.quick_try = 0
  AND (${t}.status IN ('draft', 'open', 'done') OR (${t}.status = 'evaluating' AND ${t}.exercise_list_status IN ('problem', 'failed')))
  AND NOT EXISTS (SELECT 1 FROM submissions g WHERE g.test_id = ${t}.id AND g.status = 'grading'))`;
// A new subject after an exercise list exists makes both lists again and
// grades the test's papers again. No subject is math.
const remakeSql = (t: string) => `(${t}.status IN ('evaluating', 'done') AND COALESCE(${t}.subject, 'matematica') <> ?1
  AND (${t}.exercise_list_status <> 'none' OR ${t}.ces_exercise_list_status <> 'none'))`;
// The list that ended at a subject not graded is read again only when the demo
// account's one test is this one: its waiting papers then go to the robot.
const reviveAllowed = (t: string) => `(NOT (${t}.subject = 'alta' AND ${t}.exercise_list_status = 'failed') OR ${onlyTestSql(t)})`;
// The first change of subject grades the graded papers again for free; a
// failed paper, and every paper of a later change, is a regrade within the
// demo limit. A change that would send none of the test's graded or failed
// papers is refused. (Its writes name the test `t`, as PAPERS_LEFT_TO_REGRADE does.)
const REGRADE_ALLOWED = `NOT (${remakeSql('t')}
  AND EXISTS (SELECT 1 FROM submissions r WHERE r.test_id = t.id AND r.status IN ('graded', 'failed'))
  AND NOT (t.subject_regraded = 0 AND EXISTS (SELECT 1 FROM submissions r WHERE r.test_id = t.id AND r.status = 'graded'))
  AND ${PAPERS_LEFT_TO_REGRADE} <= 0)`;
const SUBJECT_CHANGE_ALLOWED = `(${subjectEditable('t')} AND ${reviveAllowed('t')} AND ${REGRADE_ALLOWED})`;

export type SubjectChange =
  | { outcome: 'saved'; status: TestStatus; count: number; remade: boolean }
  | { outcome: 'busy' }
  | { outcome: 'demo_limit' };

// The teacher sets the subject, in one batch. Its first write saves the test
// and checks every rule on the row as it was; it marks a test whose lists it
// remade with subject_regraded + 2 (2: the free regrade is used now, 3: it was
// used before), which the later writes read and the last one sets back to 0
// or 1. A demo account's waiting papers past its limit go back to uploading,
// as unselected uploads do (a test of a subject not graded had them wait for
// nothing). Null: no such test.
export async function setSubject(db: D1Database, teacherId: number, testId: number, subject: string, now: string): Promise<SubjectChange | null> {
  const remade = remakeSql('t');
  const lists = ['exercise_list', 'ces_exercise_list']
    .map(
      (list) => `${list}_status = CASE WHEN ${remade} THEN 'none' ELSE ${list}_status END,
         ${list}_json = CASE WHEN ${remade} THEN NULL ELSE ${list}_json END,
         ${list}_message = CASE WHEN ${remade} THEN NULL ELSE ${list}_message END,
         ${list}_attempts = CASE WHEN ${remade} THEN 0 ELSE ${list}_attempts END`,
    )
    .join(', ');
  const thisTest = 't.id = ?1 AND t.teacher_id = ?2 AND t.subject_regraded >= 2';
  // The papers already waiting in the test count against the limit of the others.
  const heldBack = `SELECT p.id FROM (
    SELECT s.id, ${papersLeft("x.status = 'evaluating' AND x.id <> t.id")} AS allowed, ROW_NUMBER() OVER (ORDER BY s.submitted_at, s.id) AS place
    FROM submissions s JOIN tests t ON t.id = s.test_id
    WHERE ${thisTest} AND s.status = 'submitted' AND s.free_regrade = 0) p
  WHERE p.place > p.allowed`;
  const again = `SELECT p.id FROM (
    SELECT s.id, s.status, t.subject_regraded AS mark, ${PAPERS_LEFT_TO_REGRADE} AS allowed, ROW_NUMBER() OVER (ORDER BY s.status <> 'failed', s.id) AS place
    FROM submissions s JOIN tests t ON t.id = s.test_id
    WHERE ${thisTest} AND s.status IN ('graded', 'failed')) p
  WHERE (p.mark = 2 AND p.status = 'graded') OR p.place <= p.allowed`;
  const marked = 'id = ?1 AND teacher_id = ?2 AND subject_regraded >= 2';
  const [before, saved, , regraded, , after] = await db.batch<{
    editable?: number;
    remade?: number;
    id?: number;
    test_status?: TestStatus;
    status?: TestStatus;
  }>([
    db
      .prepare(`SELECT ${subjectEditable('t')} AS editable, ${remakeSql('t')} AS remade FROM tests t WHERE t.id = ?2 AND t.teacher_id = ?3 AND t.quick_try = 0`)
      .bind(subject, testId, teacherId),
    db
      .prepare(
        `UPDATE tests AS t SET subject = ?1, subject_name = '', subject_by = 'teacher', updated_at = ?4,
         ${lists},
         analysis_status = CASE WHEN ${remade} AND analysis_status IN ('ready', 'failed') THEN 'none' ELSE analysis_status END,
         analysis_attempts = CASE WHEN ${remade} THEN 0 ELSE analysis_attempts END,
         ces_files_version = CASE WHEN ${remade} THEN ces_files_version + 1 ELSE ces_files_version END,
         subject_regraded = CASE WHEN ${remade} THEN subject_regraded + 2 ELSE subject_regraded END
         WHERE t.id = ?2 AND t.teacher_id = ?3 AND ${SUBJECT_CHANGE_ALLOWED}
         RETURNING status`,
      )
      .bind(subject, testId, teacherId, now),
    db.prepare(`UPDATE submissions SET ${HOLD_BACK} WHERE id IN (${heldBack})`).bind(testId, teacherId),
    db
      .prepare(
        `UPDATE submissions SET ${GRADE_AGAIN},
           free_regrade = CASE WHEN status = 'graded' AND (SELECT t.subject_regraded FROM tests t WHERE t.id = submissions.test_id) = 2 THEN 1 ELSE 0 END
         WHERE id IN (${again}) RETURNING id, ${STATUS_BEFORE}`,
      )
      .bind(testId, teacherId),
    db
      .prepare(
        `DELETE FROM evaluations WHERE submission_id IN (SELECT s.id FROM submissions s JOIN tests t ON t.id = s.test_id WHERE ${thisTest} AND s.status = 'submitted')`,
      )
      .bind(testId, teacherId),
    // A finished test goes back to evaluation when it has papers to grade. The
    // free regrade counts as used only when it sent a graded paper again.
    db
      .prepare(
        `UPDATE tests SET
           archived = CASE WHEN status = 'done' AND EXISTS (SELECT 1 FROM submissions w WHERE w.test_id = tests.id AND w.status = 'submitted') THEN 0 ELSE archived END,
           status = CASE WHEN status = 'done' AND EXISTS (SELECT 1 FROM submissions w WHERE w.test_id = tests.id AND w.status = 'submitted') THEN 'evaluating' ELSE status END,
           subject_regraded = CASE WHEN subject_regraded = 3 OR EXISTS (SELECT 1 FROM submissions f WHERE f.test_id = tests.id AND f.free_regrade = 1) THEN 1 ELSE 0 END
         WHERE ${marked}
         RETURNING status`,
      )
      .bind(testId, teacherId),
  ]);
  const row = before?.results[0];
  if (!row) return null;
  const status = after?.results[0]?.status ?? saved?.results[0]?.status;
  if (!status) return row.editable === 1 ? { outcome: 'demo_limit' } : { outcome: 'busy' };
  await countGradingAgain(db, teacherId, regraded?.results);
  return { outcome: 'saved', status, count: regraded?.results.length ?? 0, remade: row.remade === 1 };
}

// "Regenerează": the class analysis is asked for again, from any analysis
```

- [ ] **Step 9: Edit `server/routes/tests.ts`**

Find this block:

```ts
  renameTestBody,
  type AnalysisAnswer,
```

Replace it with:

```ts
  renameTestBody,
  testSubjectBody,
  type AnalysisAnswer,
```

- [ ] **Step 10: Edit `server/routes/tests.ts`**

Find this block:

```ts
  type StoppedTest,
  type TestFileAnswer,
```

Replace it with:

```ts
  type StoppedTest,
  type SubjectAnswer,
  type TestFileAnswer,
```

- [ ] **Step 11: Edit `server/routes/tests.ts`**

Find this block:

```ts
  regradeTest,
  requestAnalysis,
```

Replace it with:

```ts
  regradeTest,
  setSubject,
  requestAnalysis,
```

- [ ] **Step 12: Edit `server/routes/tests.ts`**

Find this block:

```ts
    return c.json({ code, title: body.title });
  });
```

Replace it with:

```ts
    return c.json({ code, title: body.title });
  });

  // "Schimbă" (spec: any subject): the teacher sets the test's subject. After
  // the exercise list exists, both lists are made again and the papers are
  // graded again; the robot starts.
  routes.put('/:code/subject', async (c) => {
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    const body = await readJson(c, testSubjectBody);
    const changed = await setSubject(c.env.DB, teacherId, test.id, body.subject, nowIso());
    if (changed === null) throw notFound();
    if (changed.outcome === 'demo_limit') throw demoLimit();
    if (changed.outcome === 'busy') {
      throw new ApiError(409, 'evaluating', 'Testul se corectează acum. Poți schimba materia după ce se termină corectarea.');
    }
    const robot = changed.status === 'evaluating' && changed.remade ? await startRobot(c.env) : null;
    return c.json({
      subject: { value: body.subject, name: '', by: 'teacher' },
      count: changed.count,
      testStatus: changed.status,
      robot,
    } satisfies SubjectAnswer);
  });
```

- [ ] **Step 13: Edit `server/AGENTS.md`**

Find this block:

```markdown
- The robot's subject: the class exercise list (`saveExerciseList`) and a generated class barem (`saveGeneratedBarem`, from the headers `X-Subject` and `X-Subject-Name`) save the subject it found in their own UPDATE, only while the test has none or only the robot's `alta` (`SUBJECT_OPEN`); an older robot's answer saves none. A subject the robot does not grade (`alta`) ends the class list as `failed` with `unsupportedMessage()` (the column's CHECK has no other state, and a Quick Try then gives its place back); a Quick Try's generated barem with `alta` ends its list the same way. `SUBJECT_GRADED` (`db/lifecycle.ts`) is in the SQL of every path that moves an open test into evaluation, beside `BAREM_ACTIVE`, and `evaluationBlocker` answers 409 `subject_unsupported`; a due test with `alta` loses its schedule. A test with `alta` does not hold a demo account's one test (`ONLY_TEST`), and its papers do not count among those on their way to the robot (`papersWaitingSql`). A new class test file of a test whose list failed with the robot's `alta` resets the list in the same UPDATE, and the route starts the robot when that write reset it (`readAgain`); the list stays failed, as it does for a new barem, when the teacher set `alta`, in a Quick Try (it ended and gave its place back), and in a demo account whose one test is now another (`onlyTestSql`), since its papers would be graded with no start. `retryExerciseList` never retries a class list that ended at `alta`.
- A test gets its `upload_token` in its INSERT (`createTest`), so a draft has its print PDF; Start test keeps it (`COALESCE`, for a draft made before that). A draft made before that gets one at Start, with a new test file (`saveTestFile`), or with "Pregătește testul cu cod QR" (`retryPrint`). Stop test (`stopTest`: open → draft, clears `started_at` and `evaluation_at`) checks in its SQL that the test was never evaluated (`evaluation_started_at IS NULL`) and that no upload of the test has a file or is past `uploading` (`NO_STUDENT_FILES`); a student file that lands at the same moment checks the open test in its own SQL (`OPEN_UPLOAD`), so one of the two is refused. Student writes on a draft answer 409 `not_started`.
```

Replace it with:

```markdown
- The robot's subject: the class exercise list (`saveExerciseList`) and a generated class barem (`saveGeneratedBarem`, from the headers `X-Subject` and `X-Subject-Name`) save the subject it found in their own UPDATE, only while the test has none or only the robot's `alta` (`SUBJECT_OPEN`); an older robot's answer saves none. A subject the robot does not grade (`alta`) ends the class list as `failed` with `unsupportedMessage()` (the column's CHECK has no other state, and a Quick Try then gives its place back); a Quick Try's generated barem with `alta` ends its list the same way. `SUBJECT_GRADED` (`db/lifecycle.ts`) is in the SQL of every path that moves an open test into evaluation, beside `BAREM_ACTIVE`, and `evaluationBlocker` answers 409 `subject_unsupported`; a due test with `alta` loses its schedule. A test with `alta` does not hold a demo account's one test (`ONLY_TEST`), and its papers do not count among those on their way to the robot (`papersWaitingSql`). A new class test file of a test whose list failed with the robot's `alta` resets the list in the same UPDATE, and the route starts the robot when that write reset it (`readAgain`); the list stays failed, as it does for a new barem, when the teacher set `alta`, in a Quick Try (it ended and gave its place back), and in a demo account whose one test is now another (`onlyTestSql`), since its papers would be graded with no start. `retryExerciseList` never retries a class list that ended at `alta`.
- "Schimbă" (`PUT /api/admin/tests/<code>/subject`, `setSubject` in `db/lifecycle.ts`): the teacher sets one of the seven subjects (never `alta`), as the teacher's. Only while the robot reads neither file (a draft, open or finished test, or one in evaluation whose class list has a problem or failed) and no paper is being graded, never in a Quick Try (not on `ALLOWED`, and `quick_try = 0` in the SQL). A new subject after a list exists makes both lists again and grades the graded and failed papers again (a finished test goes back to evaluation) and the route starts the robot. The first such regrade of a test sends its graded papers for free in a demo account (`tests.subject_regraded`, `submissions.free_regrade`: the trigger of migration 0028 does not count these papers, `papersWaitingSql` skips them); its failed papers, and every paper of a later change, are a regrade within the demo limit, and a change that can send none of the test's graded or failed papers is refused. The change bumps `ces_files_version`, so a CES list being made with the old subject is not saved. A test that ended at `alta` is read again only when it is the demo account's one test (`onlyTestSql`), and its waiting papers past the limit go back to uploading. All of it is checked in the batch's first write, on the row as it was.
- A test gets its `upload_token` in its INSERT (`createTest`), so a draft has its print PDF; Start test keeps it (`COALESCE`, for a draft made before that). A draft made before that gets one at Start, with a new test file (`saveTestFile`), or with "Pregătește testul cu cod QR" (`retryPrint`). Stop test (`stopTest`: open → draft, clears `started_at` and `evaluation_at`) checks in its SQL that the test was never evaluated (`evaluation_started_at IS NULL`) and that no upload of the test has a file or is past `uploading` (`NO_STUDENT_FILES`); a student file that lands at the same moment checks the open test in its own SQL (`OPEN_UPLOAD`), so one of the two is refused. Student writes on a draft answer 409 `not_started`.
```

- [ ] **Step 14: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  176 passed | 1 skipped (177)`, `Tests  2625 passed | 3 skipped (2628)`.

- [ ] **Step 15: Commit**

```bash
git add server/routes/subjectChange.test.ts migrations/0028_test_subject.sql shared/api.ts server/db/lifecycle.ts server/routes/tests.ts server/AGENTS.md
git commit -m "Let the teacher set the subject, and grade again once for free"
```

### Task 2: The subject on the test page

Fișa testului shows the subject with "Alege materia" or "Schimbă materia"; the barem warning of Corectare and a notice in Pregătire offer the same form for a subject not graded.

**Files:**
- Create: `src/admin/testPage/SubjectForm.tsx`
- Modify: `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/admin/testPage/TestSheet.tsx`, `src/admin/pages/TestPage.tsx`, `src/admin/testPage/ExerciseListBanner.tsx`, `src/admin/testPage/StagePanel.tsx`, `src/ui/brand.css`, `src/AGENTS.md`
- Test: `src/admin/pages/TestPage.test.tsx`

**Interfaces:**
- Consumes: Task 1's `SubjectAnswer` and the route; Plan A's `SUBJECTS`, `SUBJECT_NAMES`, `Subject`, `unsupportedMessage`, `TestInfo.subject`.
- Produces: `Api.setSubject(code, subject): Promise<SubjectAnswer>`; `subjectLine(test)`, `SubjectForm`, `SubjectChange` in `src/admin/testPage/SubjectForm.tsx`; `TestSheet` takes `onRobot`.

- [ ] **Step 1: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(screen.queryByText('Robotul nu a putut citi testul și baremul.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Înlocuiește testul' }));
```

Replace it with:

```tsx
    expect(screen.queryByText('Robotul nu a putut citi testul și baremul.')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Corectare' })).getByRole('button', { name: 'Schimbă materia' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Înlocuiește testul' }));
```

- [ ] **Step 2: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toBeInTheDocument();
  });
});
```

Replace it with:

```tsx
    expect(screen.getByRole('link', { name: 'Deschide raportul' })).toBeInTheDocument();
  });
});

describe('TestPage subject', () => {
  const subjects = () => within(sheet()).getByRole('group', { name: 'Materia testului' });

  it('shows in Fișa testului that the robot finds the subject, and the teacher can choose it', async () => {
    const api = apiWith();
    renderAdmin(PAGE, api);
    expect(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByText('Se stabilește la corectare')).toBeInTheDocument();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Alege materia' }));
    expect(within(subjects()).getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual([
      'Matematică',
      'Fizică',
      'Chimie',
      'Biologie',
      'Științe',
      'Limba română',
      'Limba engleză',
    ]);
    expect(within(sheet()).getByRole('button', { name: 'Salvează' })).toBeDisabled();
    // A draft has no exercise list: nothing is graded again.
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Fizică' }));
    expect(within(sheet()).queryByText(/se corectează din nou/)).not.toBeInTheDocument();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Salvează' }));
    expect(api.setSubject).toHaveBeenCalledWith('6E2-26T1', 'fizica');
    expect(await within(sheet()).findByText('Fizică')).toBeInTheDocument();
    expect(within(sheet()).getByRole('button', { name: 'Schimbă materia' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says that a finished test is graded again with a new subject, and that the robot starts', async () => {
    const api = apiWith({
      status: 'done',
      exerciseList: { status: 'ready', message: null },
      subject: { value: 'matematica', name: '', by: 'robot' },
    });
    renderAdmin(PAGE, api);
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByRole('button', { name: 'Schimbă materia' }));
    expect(within(subjects()).getByRole('radio', { name: 'Matematică' })).toBeChecked();
    expect(within(sheet()).queryByText(/se corectează din nou/)).not.toBeInTheDocument();
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Fizică' }));
    expect(within(sheet()).getByText('Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.')).toBeInTheDocument();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Salvează' }));
    expect(await screen.findByRole('status')).toHaveTextContent(robotStartMessage('next_check'));
    expect(await within(sheet()).findByText('Fizică')).toBeInTheDocument();
  });

  it('keeps the form open with the reason when the subject cannot change now', async () => {
    const api = apiWith({ status: 'evaluating', exerciseList: { status: 'ready', message: null }, subject: { value: 'matematica', name: '', by: 'robot' } });
    api.setSubject.mockRejectedValueOnce(new ApiError(409, 'evaluating', 'Testul se corectează acum. Poți schimba materia după ce se termină corectarea.'));
    renderAdmin(PAGE, api);
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Fișa testului' })).findByRole('button', { name: 'Schimbă materia' }));
    await userEvent.click(within(subjects()).getByRole('radio', { name: 'Chimie' }));
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Salvează' }));
    expect(await within(sheet()).findByText('Testul se corectează acum. Poți schimba materia după ce se termină corectarea.')).toBeInTheDocument();
    await userEvent.click(within(sheet()).getByRole('button', { name: 'Renunță' }));
    expect(within(sheet()).getByText('Matematică')).toBeInTheDocument();
  });

  it('says in Pregătire that a subject the generated barem found is not graded, and the teacher changes it there', async () => {
    const api = apiWith({ subject: { value: 'alta', name: 'istorie', by: 'robot' } });
    renderAdmin(`${PAGE}#pregatire`, api);
    const panel = await screen.findByRole('region', { name: 'Pregătire' });
    expect(within(panel).getByText(unsupportedMessage('istorie'))).toBeInTheDocument();
    expect(within(sheet()).getByText('istorie (nu o corectăm)')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Schimbă materia' }));
    // No subject is chosen yet: the robot's guess is not one of the list.
    expect(within(panel).getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked)).toEqual([]);
    await userEvent.click(within(panel).getByRole('radio', { name: 'Limba română' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    expect(api.setSubject).toHaveBeenCalledWith('6E2-26T1', 'romana');
    await waitFor(() => expect(within(panel).queryByText(unsupportedMessage('istorie'))).not.toBeInTheDocument());
    expect(within(sheet()).getByText('Limba română')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  RegradeAnswer,
  ReviewPoint,
```

Replace it with:

```ts
  RegradeAnswer,
  SubjectAnswer,
  ReviewPoint,
```

- [ ] **Step 4: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
import type { CheckoutInput, PaymentRow } from '../../shared/payments.ts';
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../shared/scoring.ts';
```

Replace it with:

```ts
import type { CheckoutInput, PaymentRow } from '../../shared/payments.ts';
import type { Subject } from '../../shared/subjects.ts';
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../shared/scoring.ts';
```

- [ ] **Step 5: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    deleteTest: vi.fn(async (code: string) => {
```

Replace it with:

```ts
    }),
    // Like the server: a new subject after the exercise list exists makes the
    // lists again and sends the graded and failed uploads to the robot again.
    setSubject: vi.fn(async (code: string, subject: Subject): Promise<SubjectAnswer> => {
      const found = findTest(code);
      const test = found.test;
      const listMade = test.exerciseList.status !== 'none' || test.ces.exerciseList.status !== 'none';
      const remade = (test.status === 'evaluating' || test.status === 'done') && listMade && (test.subject?.value ?? 'matematica') !== subject;
      test.subject = { value: subject, name: '', by: 'teacher' };
      let count = 0;
      if (remade) {
        test.exerciseList = { status: 'none', message: null };
        test.ces.exerciseList = { status: 'none', message: null };
        for (const row of found.uploads) {
          if (row.status !== 'graded' && row.status !== 'failed') continue;
          Object.assign(row, { status: 'submitted', grade: null, gradedAt: null, flagCount: 0, lastError: null });
          count += 1;
        }
        if (test.status === 'done' && found.uploads.some((row) => row.status === 'submitted')) test.status = 'evaluating';
      }
      return { subject: test.subject, count, testStatus: test.status, robot: remade && test.status === 'evaluating' ? 'next_check' : null };
    }),
    deleteTest: vi.fn(async (code: string) => {
```

- [ ] **Step 6: Run the new tests and see them fail**

Run: `npx vitest run src/admin/pages/TestPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  5 failed | 113 passed (118)`: Fișa testului has no subject (`Unable to find an element with the text: Se stabilește la corectare`), there is no "Schimbă materia" (`Unable to find role="button" and name "Schimbă materia"`), and Pregătire has no notice for a subject not graded. The other tests of the file pass.

- [ ] **Step 7: Create `src/admin/testPage/SubjectForm.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { SUBJECT_NAMES, SUBJECTS, type Subject } from '../../../shared/subjects.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

// The subject in a few words, for Fișa testului.
export function subjectLine(test: Pick<TestInfo, 'subject'>): string {
  const { subject } = test;
  if (subject === null) return 'Se stabilește la corectare';
  if (subject.value === 'alta') return `${subject.name || 'altă materie'} (nu o corectăm)`;
  return SUBJECT_NAMES[subject.value];
}

// A new subject after the exercise list exists makes the list again and
// grades the graded papers again (the API does it; spec: any subject).
function remakes(test: TestInfo): boolean {
  const listMade = test.exerciseList.status !== 'none' || test.ces.exerciseList.status !== 'none';
  return (test.status === 'evaluating' || test.status === 'done') && listMade;
}

// "Schimbă" (spec: any subject, "The teacher can fix it"): the teacher picks
// one of the subjects the robot grades. It opens in place of its button.
export function SubjectForm({
  test,
  onDone,
  onRobot,
  onClose,
}: {
  test: TestInfo;
  onDone: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
  onClose: () => void;
}) {
  const api = useApi();
  const id = useId();
  const current = test.subject !== null && test.subject.value !== 'alta' ? test.subject.value : null;
  const [chosen, setChosen] = useState<Subject | null>(current);
  const save = useMutation({
    mutationFn: (subject: Subject) => api.setSubject(test.code, subject),
    onSuccess: async (answer) => {
      if (answer.robot !== null) onRobot(answer.robot);
      onClose();
      await onDone();
    },
  });
  const changes = chosen !== null && chosen !== (test.subject?.value ?? 'matematica');

  return (
    <form
      className="rename-form subject-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (chosen !== null) save.mutate(chosen);
      }}
    >
      <fieldset className="subject-choices">
        <legend>Materia testului</legend>
        {SUBJECTS.map((subject) => (
          <label key={subject} htmlFor={`${id}-${subject}`}>
            <input
              id={`${id}-${subject}`}
              type="radio"
              name={`${id}-subject`}
              value={subject}
              checked={chosen === subject}
              onChange={() => setChosen(subject)}
            />
            {SUBJECT_NAMES[subject]}
          </label>
        ))}
      </fieldset>
      {changes && remakes(test) && <p className="hint">Lista de exerciții se face din nou, iar lucrările corectate se corectează din nou.</p>}
      <span className="row-actions">
        <button className="button button-small" type="submit" disabled={chosen === null || save.isPending}>
          Salvează
        </button>
        <button type="button" className="button-quiet button-small" onClick={onClose}>
          Renunță
        </button>
      </span>
      {save.error && <ErrorMessage error={save.error} />}
    </form>
  );
}

// The subject with its button: "Alege materia" before the robot found it,
// "Schimbă materia" after. The form opens in place of the button.
export function SubjectChange({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (open) return <SubjectForm test={test} onDone={onChanged} onRobot={onRobot} onClose={() => setOpen(false)} />;
  return (
    <button type="button" className="button-quiet button-small" onClick={() => setOpen(true)}>
      {test.subject === null ? 'Alege materia' : 'Schimbă materia'}
    </button>
  );
}
```

- [ ] **Step 8: Edit `src/admin/api.ts`**

Find this block:

```ts
  RegradeAnswer,
  FinishedTest,
```

Replace it with:

```ts
  RegradeAnswer,
  SubjectAnswer,
  FinishedTest,
```

- [ ] **Step 9: Edit `src/admin/api.ts`**

Find this block:

```ts
import type { CheckoutAnswer, CheckoutInput, PaymentRow } from '../../shared/payments.ts';
import { studentResultPath } from '../../shared/api.ts';
```

Replace it with:

```ts
import type { CheckoutAnswer, CheckoutInput, PaymentRow } from '../../shared/payments.ts';
import type { Subject } from '../../shared/subjects.ts';
import { studentResultPath } from '../../shared/api.ts';
```

- [ ] **Step 10: Edit `src/admin/api.ts`**

Find this block:

```ts
  renameTest(code: string, title: string): Promise<{ code: string; title: string }>;
  deleteTest(code: string): Promise<void>;
```

Replace it with:

```ts
  renameTest(code: string, title: string): Promise<{ code: string; title: string }>;
  // "Schimbă": the test's subject, set by the teacher.
  setSubject(code: string, subject: Subject): Promise<SubjectAnswer>;
  deleteTest(code: string): Promise<void>;
```

- [ ] **Step 11: Edit `src/admin/api.ts`**

Find this block:

```ts
    renameTest: (code, title) => request<{ code: string; title: string }>('PATCH', test(code), { title }),
    deleteTest: async (code) => {
```

Replace it with:

```ts
    renameTest: (code, title) => request<{ code: string; title: string }>('PATCH', test(code), { title }),
    setSubject: (code, subject) => request<SubjectAnswer>('PUT', `${test(code)}/subject`, { subject }),
    deleteTest: async (code) => {
```

- [ ] **Step 12: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
import { useNavigate } from 'react-router';
import type { TestInfo } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
```

Replace it with:

```tsx
import { useNavigate } from 'react-router';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
```

- [ ] **Step 13: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
import { StatusChip } from '../StatusChip.tsx';
import { UploadLink } from './UploadLink.tsx';
```

Replace it with:

```tsx
import { StatusChip } from '../StatusChip.tsx';
import { SubjectChange, subjectLine } from './SubjectForm.tsx';
import { UploadLink } from './UploadLink.tsx';
```

- [ ] **Step 14: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx

// "Fișa testului" (redesign spec §6): the facts and files of the test, the
// students' link while they may still need it, and renaming, archiving and
// deleting the test. It shows beside every stage.
export function TestSheet({ test, onChanged }: { test: TestInfo; onChanged: () => Promise<void> }) {
  const api = useApi();
```

Replace it with:

```tsx

// "Fișa testului" (redesign spec §6): the facts and files of the test, its
// subject (spec: any subject), the students' link while they may still need
// it, and renaming, archiving and deleting the test. It shows beside every stage.
export function TestSheet({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
```

- [ ] **Step 15: Edit `src/admin/testPage/TestSheet.tsx`**

Find this block:

```tsx
        <dd>{test.code}</dd>
        <dt>Starea</dt>
```

Replace it with:

```tsx
        <dd>{test.code}</dd>
        <dt>Materia</dt>
        <dd className="sheet-subject">
          {subjectLine(test)}
          <SubjectChange test={test} onChanged={onChanged} onRobot={onRobot} />
        </dd>
        <dt>Starea</dt>
```

- [ ] **Step 16: Edit `src/admin/pages/TestPage.tsx`**

Find this block:

```tsx
        />
        <TestSheet test={test} onChanged={refresh} />
      </div>
```

Replace it with:

```tsx
        />
        <TestSheet test={test} onChanged={refresh} onRobot={onRobot} />
      </div>
```

- [ ] **Step 17: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
import { MoveOnLink } from './MoveOnLink.tsx';
import { partsOf } from './variant.ts';
```

Replace it with:

```tsx
import { MoveOnLink } from './MoveOnLink.tsx';
import { SubjectChange } from './SubjectForm.tsx';
import { partsOf } from './variant.ts';
```

- [ ] **Step 18: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
// because the test's subject is one the robot does not grade (`alta`) says so
// and offers no retry (only the class list: a CES test has its class test's
// subject). It shows in the panel
// Corectare; the barem is replaced in the panel Pregătire. With `variant`
```

Replace it with:

```tsx
// because the test's subject is one the robot does not grade (`alta`) says so
// and offers no retry, only "Schimbă materia" for a wrong guess and a new test
// file (only the class list: a CES test has its class test's subject). It
// shows in the panel
// Corectare; the barem is replaced in the panel Pregătire. With `variant`
```

- [ ] **Step 19: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
        </p>
        <p>Dacă ai încărcat alt test din greșeală, înlocuiește testul la Pregătire: lucrările se corectează apoi cu testul nou.</p>
        <MoveOnLink className="button-quiet button-small" stage="Pregătire">
          Înlocuiește testul
        </MoveOnLink>
      </div>
```

Replace it with:

```tsx
        </p>
        <p>Dacă materia e alta, schimb-o. Dacă ai încărcat alt test din greșeală, înlocuiește testul la Pregătire: lucrările se corectează apoi cu testul nou.</p>
        <span className="row-actions">
          <SubjectChange test={test} onChanged={onChanged} onRobot={onRobot} />
          <MoveOnLink className="button-quiet button-small" stage="Pregătire">
            Înlocuiește testul
          </MoveOnLink>
        </span>
      </div>
```

- [ ] **Step 20: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import type { RobotStart, TestDetail, TestInfo, UploadRow } from '../../../shared/api.ts';
import type { TestStatus } from '../../../shared/tests.ts';
```

Replace it with:

```tsx
import type { RobotStart, TestDetail, TestInfo, UploadRow } from '../../../shared/api.ts';
import { unsupportedMessage } from '../../../shared/subjects.ts';
import type { TestStatus } from '../../../shared/tests.ts';
```

- [ ] **Step 21: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { ExerciseListBanner } from './ExerciseListBanner.tsx';
import { PrintTest } from './PrintTest.tsx';
```

Replace it with:

```tsx
import { ExerciseListBanner } from './ExerciseListBanner.tsx';
import { SubjectChange } from './SubjectForm.tsx';
import { PrintTest } from './PrintTest.tsx';
```

- [ ] **Step 22: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
    <>
      <TestFiles test={test} onChanged={onChanged} onRobot={onRobot} />
```

Replace it with:

```tsx
    <>
      {test.subject?.value === 'alta' && (
        // Found with a generated barem, before the test is given (spec: any
        // subject). The students may still upload; the grading does not start.
        <div className="warning">
          <p>
            <strong>Nu corectăm încă această materie.</strong> {unsupportedMessage(test.subject.name)}
          </p>
          <p>Dacă materia e alta, schimb-o. Dacă ai ales alt test din greșeală, înlocuiește-l mai jos.</p>
          <SubjectChange test={test} onChanged={onChanged} onRobot={onRobot} />
        </div>
      )}
      <TestFiles test={test} onChanged={onChanged} onRobot={onRobot} />
```

- [ ] **Step 23: Edit `src/ui/brand.css`**

Find this block:

```css
.rename-form input {
  width: 100%;
}

```

Replace it with:

```css
.rename-form input {
  width: 100%;
}

.sheet-subject {
  display: grid;
  gap: 0.375rem;
  justify-items: start;
}

.subject-choices {
  display: grid;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.subject-choices legend {
  margin-bottom: 0.25rem;
  padding: 0;
  font-weight: 600;
}

.subject-choices label {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

```

- [ ] **Step 24: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; once results are published (for all, or one alone), `StudentAccessCard.tsx`: where students find their results (the students' link with its QR code and "Descarcă codul QR", a PNG; the multi-upload link named "Doar pentru profesor", with no QR code; and the help text); the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off), "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). The page (`pages/SubmissionPage.tsx`) has a head (`.submission-head`: the name, the test and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right), then the strips of the result link and of the files, and the result. "Alte acțiuni" (`PaperActions`, `useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. An exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds only the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

Replace it with:

```markdown
- `ui/`: brand CSS (the look of the redesign spec §2; the names are older than it: `--paper` is the ground, `--sheet` a surface, `--rule` a border, `--ink` the blue, `--marker` the tint of what waits on the teacher), the MQGrader mark (`BrandMark.tsx`: "Trei subiecte", three arcs coloured by `--mk-a` and `--mk-b`; `public/favicon.svg` draws the same arcs), the theme button and the phone menu's switch (`ThemeButton.tsx`; `useTheme.ts` keeps them in step), Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time), `classTone.ts` (a class's colour: a hue stepped by the golden angle from the class id, so every class differs; the page sets `--tone-hue` and `--tone-light` with `classToneStyle()` and the class `class-tone`; used by the Clase cards and the test page's class link), `tabKeys.ts` (the arrows, Home and End of a tab list; the chosen tab alone has `tabIndex` 0; the class page and Setări use it). `MathText.tsx` draws the grading's Unicode math like on paper (`mathText.ts` finds √15, √(x + 1) and (x + 1)/3, and leaves intervals and words such as și/sau as text); every grading text a page shows (answers, comments, review reasons, summary, lists, the class analysis) goes through it, and the page text stays the same for copying and screen readers. A label (`.tag`, `.status`, `.class-badge`) is a flat tinted block, grey by default and orange (`.tag-wait`) only for what waits on the teacher; a button or link that acts is an 8px rounded outline (`.button-quiet`), filled blue (`.button`) for the one main action of a screen, and a card keeps its actions together in `.card-actions`.
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (redesign spec §6): the list of the six stages (`StageList.tsx`), the panel of the chosen stage (`StagePanel.tsx`: the controls of each stage, `TestActions`, and the papers table of În clasă, Corectare and Verificare, with its checkboxes only in Corectare), the panel Rezultate (redesign spec §8: "Publică toate rezultatele" and "Oprește accesul la rezultate" in `ResultsAccess.tsx`; once results are published (for all, or one alone), `StudentAccessCard.tsx`: where students find their results (the students' link with its QR code and "Descarcă codul QR", a PNG; the multi-upload link named "Doar pentru profesor", with no QR code; and the help text); the students' result links in `ResultLinksTable.tsx`, with the points, the grade, "Copiază linkul" ("Fă linkul" first for an older paper with no link) and the publishing of one result; "Pentru tine" in `ResultFiles.tsx`: the class report and its CSV; the result link and the publishing are only there, not in the papers table), Fișa testului (`TestSheet.tsx`: the facts, the subject (`SubjectForm.tsx`: "Se stabilește la corectare" until the robot finds it, "Alege materia" or "Schimbă materia" opening the seven subjects in place, with a line when the list is made again and the papers graded again), the files, the students' link while the test is a draft or open, rename, archive (it asks first in `ArchiveDialog.tsx` when results are open: `hasOpenResults`), delete), the points to check in Verificare (`ReviewList.tsx`: a row per point with its reason, each opening the review), the files of Pregătire (`TestFiles.tsx`), the evaluation controls, the barem warning in Corectare (`ExerciseListBanner.tsx`, with a link to Pregătire; for a subject not graded, "Schimbă materia" too, and the same notice in Pregătire while the test's subject is `alta`), a link in a panel to another stage (`MoveOnLink.tsx`: "Următoarea etapă", "Înlocuiește baremul"; the new panel's heading takes the focus), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`, in the panel of the robot's work: Pregătire for a barem, Tipărire for the print PDF, Corectare for the grading), the generated barem's button, waiting line and "Am verificat baremul" (`GeneratedBarem.tsx`, on the barem row; the page also refreshes every 10 s while a request waits), the uploads table (`UploadsTable.tsx`: "Vezi lucrarea" and "Reîncearcă" on the row, "Recorectează" and "Resetează" under the row's ⋯, a menu fixed to the screen so the table's sideways scroll does not cut it off), "Recorectează tot"). `pages/ReviewPage.tsx` and `reviewPage/` are the review of the points to check (redesign spec §7, `/teste/:code/verificare`): the papers and their points (`ReviewQueue.tsx`), one page of the paper at a time (`ReviewPhoto.tsx`; no marks on the photo, because the robot does not say where an answer is), and the decision (`ReviewDecision.tsx`: "Accept", the stepper and "Salvează", "Am verificat paginile", the paper's exercises). `points.ts` orders the points (`reviewPoints` of the uploads list, as many as `flagCount`; the pages first), steps between them, and writes the address (`?lucrare=&punct=`, replaced, never a new step in the history). A decision names the grading it was made on, takes the point out of the cached test at once, and opens the next point; a refused one reads the paper and the test again. An address that names no paper of the test is rewritten first (`ReviewLoader` draws `<Navigate replace>` to `firstSpot()`), before any paper is drawn: a refresh never moves the spot, and no decision is made on a spot the address does not hold. The next point opens only if the teacher is still at the decided one (a call-level `onSuccess` of `mutate`, which does not run once the page is gone), and its heading takes the focus (`focus({ preventScroll: true })`). An address of a paper with no result now (graded again) shows that paper with the reason (`submissionPage/waitingText.ts`, shared with the paper page); when the uploads list has another `gradedAt` than the paper read, the page reads the paper again. The keys A, J, K and 1–9 act unless the focus is in a field or in what opened from the bars (`.panel`, `.phone-menu`, `.user-menu`, or a button with `aria-expanded="true"`), never with Ctrl, Alt or Meta, and once for a key held down (`event.repeat`). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). The page (`pages/SubmissionPage.tsx`) has a head (`.submission-head`: the name, the test and the times on the left; "Toate notele elevului", the PDF buttons and "Alte acțiuni" on the right), then the strips of the result link and of the files, and the result. "Alte acțiuni" (`PaperActions`, `useSmallMenu`) is a menu of the rare actions that undo work, Recorectează (only for a graded result) and Resetează (red): each item shows what it deletes under its name (its accessible description), and choosing it still asks with `window.confirm`. On a phone the menu is as wide as the row of buttons. `GradedResult` draws everything inside `.graded-result`, so its look and its phone cards are the same on a Quick Try's page: the grade strip ("De verificat: N" orange, or "Nimic de verificat"), the exercises table in a card (below 48rem one card per exercise: the label, the points, the confidence and the pencil on the first line), and the three texts for the student as cards. An exercise to check shows its reason and the "Verificat" button together in a note (`.review-note`) in the comment cell; the actions cell holds only the pencil, or Salvează and Renunță while editing. `pages/StudentPage.tsx` is a student's history (redesign spec §11.2, `/elevi/:id`): "←" to the class the teacher came from (`StudentLinkState`, `{ fromClass }`, passed by the grades table's names and "Toate notele elevului, din toate clasele"; else the active class, else the newest), the name with "Redenumește" (the class page's `RenameDialog`), the line of the classes ("Clasa 10B în 2026-2027 · înainte în …"), and one card per school year and class with a row per started test: the points, the grade drawn by the grades table's `GradeCell`, the result drawn by the "Elevi" tab's `ResultCell`, "Lucrarea", and the grades table's legend. On a phone its tables scroll inside their cards. `pages/SettingsPage.tsx` is Setări (administrators only; `settingsPage/AccountsSection.tsx` approves and changes accounts). `wayIn/WayIn.tsx` is the way in (redesign spec §11.4): two halves under the top bar, the form on the left, and on the right the landing page's heading, line and six stages, word for word (`WayIn.test.tsx` reads `index.html` to check them); `State` draws a state's icon (mail, done, waiting), its heading (which takes the focus when the state changes) and its line. `pages/LoginPage.tsx` is the login and sign-up: `Layout.tsx` shows it in place of every page when `/me` answers 401 `login_required`, and the pages wait for `/me` before they ask the API. Its states: "Intră în cont", "Cont nou de profesor", "Am uitat parola", "Verifică-ți emailul" (after the sign-up or the link asked for), and "Contul tău așteaptă aprobarea" when the login answers 403 `account_pending` (no session: its "Ieși" only goes back to the login); every other refusal shows under the form. `pages/NewPasswordPage.tsx` (`/parola-noua#<token>`) sets the new password, with no login. `pages/ConfirmEmailPage.tsx` (`/confirma-email#<token>`) confirms a new account's email, without a login, and only on its button (mail programs open links to check them). Both use `WayIn`. `pages/AccountPage.tsx` is Contul meu (redesign spec §11.5): "Contul tău" (the tag, the counts, or a demo account's meters), "Parola" and "Ieși din cont"; no pay button while nothing is on sale. `account/DemoMeters.tsx` holds what a demo account has used (`demoUsage`: the one test is used once `testsEvaluated` is 1 or more, whatever the regrades; the papers on their way to the robot count, never over `DEMO_PAPER_LIMIT`), its line and its two meters, for Contul meu and the demo button. `pages/NewTestPage.tsx` is "Test nou" (redesign spec §11.7, `/teste/nou`; `?clasa=<id>` chooses the class): three numbered steps (the class and the title, the test, the barem) and beside them the card "După ce creezi testul". "Nu e în listă? Clasă nouă" (only without `?clasa`) opens `NewClassDialog` on the page; its `onCreated` chooses the new class instead of opening the class page. The files come through `newTest/FileDrop.tsx` (a click, or a file dragged onto it; checked as `TestFileInput` does). The barem is "Încarc baremul acum" (its file is sent only with this choice, and kept while another is chosen), "Generează baremul din test" (off until a test file is chosen; a refused test file moves the choice to "Mai târziu") or "Mai târziu". "Creează testul" makes the test, sends the test file, then the barem file, or asks for the generated barem only once the test file was sent; what fails after the test exists reaches the test page as a notice. A class with an active CES student shows them and the CES switch (on) after the first step; on, "Testul CES" and "Baremul CES" sit beside the class ones (`.step-pair`, stacked below 768px), sent after the class files, and the CES barem asked for after the class one; `createTest` gets `cesOff` only for such a class. Under the button, `MissingList` says what the test would still miss. `pages/ReportPage.tsx` and `reportPage/` are the class report (redesign spec §11.3; `shared/stats.ts` makes its numbers): one page, with the list of its parts (marked as the teacher scrolls: `currentPart` measures the parts on every scroll and resize; "Pe scurt" stays marked while nothing is laid out) and "Notele pe grupe" on the left, sticky under the top bar; on the right "Pe scurt" (the tiles), "Rezultatele elevilor" (the points of each exercise, then "Total" and "Nota"; an active student with no graded paper is a row that says why), "Pe exerciții" (with a bar for "% din maxim") and "Analiza clasei" (`AnalysisSection.tsx`). Below 56.25rem: one column, without the list of parts. `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`; a student's PDF is made only on the paper's page, one student at a time), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `admin/shell/`: the teacher app's shell (redesign spec §4), drawn by `Layout.tsx`. The 80px bar (`Rail.tsx`, the menu "Meniu": Test nou, Teste, Clase, De făcut with its number, and Setări only for an administrator); the top bar (the lockup "MQGrader by Laura Miron", a demo account's button (`DemoButton.tsx`, redesign spec §11.6: a ring of the papers used and "Demo · 15 lucrări rămase", orange when none are left; it opens "Cont demo" with the meters of Contul meu), the school year (`YearSelect.tsx`), the theme, and the initials (`UserMenu.tsx`: "Contul meu", "Ieși din cont" through `useLogout.ts`); logged out, only the lockup and the theme); the small menus of the top bar share `useSmallMenu.ts` (closed by Esc with the focus back on their button, a click outside, a new page); one panel open at a time (`Panel.tsx`: "Clasele tale" in `ClassesPanel.tsx`, "Ce ai de făcut" in `TodoPanel.tsx`, and on a phone the menu under ☰ in `PhoneMenu.tsx`), closed by Esc, ×, or a new page, and still closed after Back to the page it was opened on; `useFocusBack.ts` gives the focus back to the button that opened it. A panel comes right after the bar in the page; on a phone the page under it is `inert` (`ui/useMediaQuery.ts`). A layer above a panel (a small menu of the top bar, the QR code on the whole screen) takes Esc first, in the capture phase, and marks it with `preventDefault()`, so the panel stays open. The shell reads the tests of the year after every change: a page that reads them again itself does not wait for that read (`void`, not `await`), so a save is not slowed down; only a row of the Teste page waits, because its buttons come from the list. For an administrator, "De făcut" also holds an urgent first card (red, "Urgent") when accounts that confirmed their email wait for approval (`Layout.tsx` reads `['accounts']`, the list Setări uses); it counts as one thing in the bar, whose number turns red, and its button opens Setări. `todo.ts` decides "De făcut" from the tests list: the four cases of spec §5 (the fourth: what a draft or open test misses, `missingOf` in `admin/missing.ts`), and before them the one case of an archived test: its results open for all or for some students (`archivedPublished`), "Rezultate publicate pe un test arhivat" at Rezultate, whose next step is the link "Oprește accesul" (the archive closes the results, so publishing there is an exception; nothing else of an archived test waits); `todoPath()` sends the points to check to the review, the rest to the test page. Below 900px the bar moves to the bottom of the screen and Setări, the school year, the theme, a demo account's papers and the account move under ☰ (CSS and `PhoneMenu.tsx`).
```

- [ ] **Step 25: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  176 passed | 1 skipped (177)`, `Tests  2629 passed | 3 skipped (2632)`.

- [ ] **Step 26: Commit**

```bash
git add src/admin/testPage/SubjectForm.tsx src/admin/api.ts src/test/fakeApi.ts src/admin/testPage/TestSheet.tsx src/admin/pages/TestPage.tsx src/admin/pages/TestPage.test.tsx src/admin/testPage/ExerciseListBanner.tsx src/admin/testPage/StagePanel.tsx src/ui/brand.css src/AGENTS.md
git commit -m "Show the subject on the test page, with Schimbă"
```

### Task 3: A look in the browser, the live database, push (main session only)

- [ ] **Step 1: Run every test once more, in UTC**

Run (Git Bash): `TZ=UTC npm test`
Expected: `Test Files  176 passed | 1 skipped (177)`, `Tests  2629 passed | 3 skipped (2632)`.

- [ ] **Step 2: Look at the test page in the browser**

The preview servers of `.claude/launch.json` run the main checkout, not this branch: start this branch's servers yourself. From the repo root of this branch, run `npm run db:local` (it applies migration 0028 to this checkout's local database), then `npm run dev:api` and `npm run dev:web` in two terminals whose folder is this checkout (in Claude Code: `run_in_terminal` with `cwd` set to it). Open a test of the local teacher at http://localhost:5173/teacher/ in the browser pane. Check, on a desktop width and at 375 px:
- Fișa testului: "Materia" with "Se stabilește la corectare" (a new test) or "Matematică" (a test made before the migration), and "Alege materia" / "Schimbă materia" opening the seven subjects in place, with no sideways scroll.
- After (run from this checkout) `npx wrangler d1 execute quickeval --local --command "UPDATE tests SET subject = 'alta', subject_name = 'istorie', subject_by = 'robot' WHERE code = '<code>'"`: the notice in Pregătire, and "istorie (nu o corectăm)" in Fișa testului.
Expected: the texts of ruling 8, and the page's layout unchanged around them. Stop the servers after.

- [ ] **Step 3: Run the migration on the live database — ask the user first**

Run: `npx wrangler d1 migrations list quickeval --remote`
Expected: only `0028_test_subject.sql` to apply. If another migration is listed, stop and ask the user.

Ask the user, then run: `npx wrangler d1 migrations apply quickeval --remote`
Expected: `0028_test_subject.sql` applied. Only then may the code reach `main`.

- [ ] **Step 4: Push — ask the user first**

Ask the user, then push the branch and open a pull request named "Any subject: the subject, the robot, the skill and Schimbă". Its body names migration 0028 (already live), the seven subjects, the rulings of Plans A and B, and the math comparison's result (accepted by the user on 2026-11-12).
