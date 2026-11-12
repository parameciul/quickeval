# MQGrader: any subject, Plan A (the subject, the robot, the skill, the math check) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The last task (the math comparison, the live database, push) must run in the main session, not in a subagent:** it needs the user's Claude token and Wrangler login, and every outward step (the live migration, push) needs the user's explicit yes.

**Goal:** The robot finds a test's subject once (with the exercise list, or with a generated barem), keeps it on the test, grades each of seven subjects by its own rules (math exactly as before), stops a test of any other subject before any paper is graded, and a tool proves on real math tests of the live site that math is graded as before.

**Architecture:** Migration 0028 adds `tests.subject`, `subject_name` and `subject_by`; every test made before it is `matematica`, set by the teacher. The robot gets the subject with the test, a barem job and the class results, and writes it to `subject.md` in its work folder; with none, Claude finds it in the modes `exercise-list` and `barem` and answers `subject` and `subjectName`, which the API saves in the SQL of the list or barem save, only while the test has none. A subject the robot does not grade (`alta`) ends the class list as `failed` with a message that names it, keeps the test out of every start, and holds no demo place. The skill gets one rules file per subject (`references/subjects/`); `matematica.md` changes nothing. `npm run compare:skills` grades real math tests with the old and the new skill and writes a report against the teacher's final points.

**Tech Stack:** Node 24, TypeScript, React 19, Hono on Cloudflare Pages with D1 and R2, Vitest, Testing Library, Claude Code (the robot), Wrangler (the comparison reads the live site). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-any-subject-design.md` (approved by the user on 2026-11-11). This is Plan A of three (the user's choice): Plan B is the teacher's "Schimbă" and the subject on the test page; Plan C is the public site's text. Root `AGENTS.md`, `server/AGENTS.md`, `runner/AGENTS.md` and `src/AGENTS.md` hold the project rules.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English. The skill's files are English instructions; the texts Claude writes stay Romanian, except the texts for the student on a limba engleză test (spec: they are in English).
- The supported subjects, in this order: `matematica`, `fizica`, `chimie`, `biologie`, `stiinte`, `romana`, `engleza`; any other is `alta` (spec, "The subjects").
- The first barem note becomes, word for word: "Nu puncta rezolvările care nu se bazează pe enunțul problemei sau care nu au legătură cu cerințele problemei." (spec, "The barem note").
- Math is graded exactly as before: `grading-rules.md`, `barem-writing.md` and `barem-example.md` do not change, and a math test (or one with no subject) is checked by `checkGrading` as before (spec, "Quality: math first").
- One migration, `migrations/0028_test_subject.sql`. It runs on the live database **before** the code reaches `main` (`docs/deploy.md`): the last task asks the user first.
- Every teacher query is scoped by the teacher's id. A write checks its own rules inside its SQL. Every path that makes robot work starts the robot. At most 15 D1 queries and 10 ms of CPU per request.
- No student page, student PDF or student-visible text says how the work was graded, in Romanian or in English (`expectNoGradingWords()`).
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch that holds this plan. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone; the full run then counts as passed when its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact for the branch alone. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protoany/s1` … `refs/protoany/s4`, one per task, on `refs/protoany/sbase` (the same files as the commit `bd5c9a8` that added the spec). After Task N, `git diff --stat refs/protoany/sN HEAD -- . ':!docs/superpowers'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building the prototype on 2026-11-11. They refine the spec's "builder's call" parts; the user checks them when reading.

1. **A subject that is not graded ends the list as `failed`, not as a new status.** The column `exercise_list_status` has a CHECK with five states; a sixth would need the `tests` table rebuilt on the live database. So the list is `failed`, its message is `unsupportedMessage(name)`, and the test's `subject = 'alta'` tells it apart: the banner then says "Nu corectăm încă această materie." and offers no retry, only "Înlocuiește testul". A Quick Try needs nothing more: a failed list already ends the try and gives its place back.
2. **The math rules stay where they are.** The spec said the math rules move into `subjects/matematica.md`; instead `grading-rules.md`, `barem-writing.md` and `barem-example.md` stay word for word, and `matematica.md` says to follow them as they are. A math test then gets the very same rule files as today; only the frame of `SKILL.md` changes ("a teacher in Romania", the subject section). Each other subject's file says what it changes.
3. **The robot may replace only its own `alta`.** A list or a barem saves the subject while the test has none, or has the robot's own `alta` (`SUBJECT_OPEN`): after the teacher changes a file, the robot's new look counts. A subject the teacher set is never overwritten.
4. **A generated barem with `alta` is saved** (the spec), the test keeps its uploads open, and only the start is refused (409 `subject_unsupported`, also for a schedule; a due schedule is dropped). In a Quick Try the barem with `alta` ends the try (its list `failed`).
5. **A new test file of a test whose list failed with `alta`** forgets the robot's subject and resets the list in the same UPDATE; the route starts the robot. Plan B adds "Schimbă" for a wrong guess on the same file.
6. **The subject reaches Claude as `subject.md`.** A grading and a class analysis of a test with no subject get `matematica` (the spec: null is math). An exercise list or a barem with no subject, or with `alta`, gets no file, and Claude finds the subject.
7. **The barem's subject travels in headers** (`X-Subject`, and `X-Subject-Name` URI-encoded), because the barem is a Word file body. An unreadable header saves no subject; the barem is still saved.
8. **The PDF arrows of chemistry**: `⇌` becomes `<=>`, `↑` ` (gaz)` and `↓` ` (precipitat)` (the font lacks them). Subscripts, `⁺ ⁻ ° Ω μ Δ λ ρ π · × ≈` are drawn as they are; a test checks the font.
9. **The comparison's old side** is the skill folder of `--ref` (default `origin/main`, what the live site runs, taken with `git archive`), the old barem note (`OLD_BAREM_NOTES`), the old answer schemas (no subject) and no `subject.md`, through this branch's work-folder code: Plan A changes nothing else in the work folder or in the Claude command, so this is what `main` runs. Its verdict: the new skill finds `matematica` with the list and the barem; the lists have the same ids and points; the barems the same structure and points; the new side's mean distance from the teacher's totals is at most 0.1 points per paper larger; the number of flags differs by at most `ceil(10 % of the larger count)`. Only class papers, by default 10 per test.

## Review Focus

1. A math test is graded as before: no `subject.md` change for math beyond `matematica`, no medium-confidence flag for math or a null subject (tests in Task 3, "keeps math as it was", and the server's "leaves it to the robot in a math test"), and the comparison of Task 5.
2. A test of a subject that is not graded never sends a paper to the robot: the list ends failed, no claim, no start, no schedule (tests in Task 2, "stops the grading at a subject that is not graded", "does not start or get a schedule").
3. A subject the teacher set is never overwritten by the robot (Task 2, "keeps the subject the teacher set").
4. A demo account keeps its one test and its papers when its first test is of a subject that is not graded (Task 2, "a demo account").
5. An older robot (no `subject` in its answers) and an older API (no `subject` in the test) keep working: nothing is saved, and a grading counts as math (Tasks 1 and 2).

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch and the prototype**

Run: `git status --short` and `git log --oneline -2`
Expected: nothing changed; HEAD is the commit that adds this plan, on top of `bd5c9a8 Add the design spec for grading tests of any subject`.

Run: `git rev-parse --verify refs/protoany/s4`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

### Task 1: The subject on the test, given to the robot

Migration 0028, the list of subjects (`shared/subjects.ts`), `TestInfo.subject`, the subject in the robot's test, barem job and class results, `subject.md` in the work folder, the new barem note, and a new class test file that forgets the robot's subject.

**Files:**
- Create: `shared/subjects.ts`, `shared/subjects.test.ts`, `migrations/0028_test_subject.sql`, `server/routes/subject.test.ts`
- Modify: `shared/api.ts`, `shared/runner.ts`, `server/db/tests.ts`, `server/db/runner.ts`, `runner/workdir.ts`, `runner/tasks.ts`, `runner/baremTask.ts`, `src/test/fakeApi.ts`, `AGENTS.md`, `runner/AGENTS.md`, `server/AGENTS.md`
- Test: `shared/subjects.test.ts`, `server/routes/subject.test.ts`, `runner/workdir.test.ts`, `runner/tasks.test.ts`, `runner/baremTask.test.ts`, `runner/api.test.ts`, `server/routes/baremJob.test.ts`, `server/routes/runner.test.ts`, `server/routes/runnerCes.test.ts`

**Interfaces:**
- Produces: `SUBJECTS`, `Subject`, `DETECTED_SUBJECTS`, `DetectedSubject`, `SUBJECT_NAMES`, `SubjectInfo { value; name; by }`, `MAX_SUBJECT_NAME` (60), `SUPPORTED_SUBJECTS_TEXT`, `unsupportedMessage(name)`, `isDetectedSubject(value)` in `shared/subjects.ts`; `TestInfo.subject: SubjectInfo | null`; `TestRecord.subject`; `RobotTest.subject?`, `BaremJob.subject?`, `ClassResults.subject?` (`DetectedSubject | null`); `WorkFolderInput.subject?: DetectedSubject | null`.

- [ ] **Step 1: Create `shared/subjects.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DETECTED_SUBJECTS, isDetectedSubject, SUBJECT_NAMES, SUBJECTS, unsupportedMessage } from './subjects.ts';

describe('subjects', () => {
  it('lists the seven subjects in order, each with its name, and alta for any other', () => {
    expect(SUBJECTS).toEqual(['matematica', 'fizica', 'chimie', 'biologie', 'stiinte', 'romana', 'engleza']);
    expect(SUBJECTS.map((subject) => SUBJECT_NAMES[subject])).toEqual([
      'Matematică',
      'Fizică',
      'Chimie',
      'Biologie',
      'Științe',
      'Limba română',
      'Limba engleză',
    ]);
    expect(DETECTED_SUBJECTS).toEqual([...SUBJECTS, 'alta']);
  });

  it('tells a value of the list or alta from anything else', () => {
    expect(isDetectedSubject('fizica')).toBe(true);
    expect(isDetectedSubject('alta')).toBe(true);
    expect(isDetectedSubject('istorie')).toBe(false);
    expect(isDetectedSubject(undefined)).toBe(false);
    expect(isDetectedSubject(3)).toBe(false);
  });

  it('names the subject that is not graded, and the ones that are', () => {
    expect(unsupportedMessage('istorie')).toBe(
      'Testul pare să fie de istorie. MQGrader corectează acum: matematică, fizică, chimie, biologie, științe, limba română și limba engleză.',
    );
    expect(unsupportedMessage('  ')).toBe(
      'Testul nu pare să fie de o materie pe care o corectăm. MQGrader corectează acum: matematică, fizică, chimie, biologie, științe, limba română și limba engleză.',
    );
  });
});
```

- [ ] **Step 2: Create `server/routes/subject.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addSubmission, addTestFiles, makeClass, makeTest, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The subject of a test (spec: any subject): what the teacher app and the
// robot read of it, and when it is forgotten.

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let studentIds: number[];

const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const subjectRow = () =>
  api.db.prepare('SELECT subject, subject_name, subject_by FROM tests WHERE code = ?').bind(code).first<{
    subject: string | null;
    subject_name: string;
    subject_by: string | null;
  }>();
const detail = async () => (await api.request('GET', `/api/admin/tests/${code}`)).body.test;
const putFile = (kind: string, text: string) =>
  api.fetch(`/api/admin/tests/${code}/files/${kind}`, {
    method: 'PUT',
    body: new TextEncoder().encode(`%PDF-1.7 ${text}`),
    headers: { 'Content-Type': 'application/pdf', 'X-File-Name': `${kind}.pdf` },
  });

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  await startTest(api, code);
  await addTestFiles(api, code);
  testId = await testIdOf(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('the subject of a test', () => {
  it('is unknown on a new test, then shows what the robot found or the teacher set', async () => {
    expect(await subjectRow()).toEqual({ subject: null, subject_name: '', subject_by: null });
    expect((await detail()).subject).toBeNull();
    await setTest("subject = 'fizica', subject_by = 'robot'");
    expect((await detail()).subject).toEqual({ value: 'fizica', name: '', by: 'robot' });
    await setTest("subject = 'alta', subject_name = 'istorie', subject_by = 'robot'");
    expect((await detail()).subject).toEqual({ value: 'alta', name: 'istorie', by: 'robot' });
  });

  it('refuses a value outside the list in the database', async () => {
    await expect(setTest("subject = 'istorie'")).rejects.toThrow();
    await expect(setTest("subject_by = 'elev'")).rejects.toThrow();
  });

  it('goes to the robot with the test in evaluation, and with the class results', async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', subject = 'chimie', subject_by = 'teacher'");
    expect((await robot('GET', `/tests/${testId}`)).body.test.subject).toBe('chimie');
    expect((await robot('GET', `/tests/${testId}?variant=ces`)).body.test.subject).toBe('chimie');
    expect((await robot('GET', `/tests/${testId}/results`)).body.results.subject).toBe('chimie');
  });

  it('goes to the robot with a barem job, null while it is not known', async () => {
    await setTest("barem_file_key = NULL, barem_file_name = NULL, barem_file_type = NULL, barem_request = 'requested'");
    expect((await robot('GET', `/tests/${testId}/barem-job`)).body.job.subject).toBeNull();
    await setTest("subject = 'biologie', subject_by = 'robot'");
    expect((await robot('GET', `/tests/${testId}/barem-job`)).body.job.subject).toBe('biologie');
  });

  it('is forgotten when the teacher replaces the test file, if the robot found it', async () => {
    await setTest("subject = 'alta', subject_name = 'istorie', subject_by = 'robot'");
    expect((await putFile('test', 'alt test')).status).toBe(200);
    expect(await subjectRow()).toEqual({ subject: null, subject_name: '', subject_by: null });
  });

  it('stays when the teacher set it, and when only the barem changes', async () => {
    await setTest("subject = 'romana', subject_by = 'teacher'");
    expect((await putFile('test', 'alt test')).status).toBe(200);
    expect(await subjectRow()).toEqual({ subject: 'romana', subject_name: '', subject_by: 'teacher' });
    await setTest("subject = 'fizica', subject_by = 'robot'");
    expect((await putFile('barem', 'alt barem')).status).toBe(200);
    expect(await subjectRow()).toEqual({ subject: 'fizica', subject_name: '', subject_by: 'robot' });
  });
});
```

- [ ] **Step 3: Edit `runner/workdir.test.ts`**

Find this block:

```ts

  it('writes the teacher notes for a barem task and no barem folder', async () => {
```

Replace it with:

```ts

  it('starts every barem with the rule about the statement of the problem', () => {
    expect(DEFAULT_BAREM_NOTES.split('\n')[0]).toBe(
      'Nu puncta rezolvările care nu se bazează pe enunțul problemei sau care nu au legătură cu cerințele problemei.',
    );
  });

  it('writes the subject in subject.md, and nothing for no subject or a subject the robot does not grade', async () => {
    const physics = await makeWorkFolder(root, 'subject-physics', { test: pdf('test'), barem: pdf('barem'), subject: 'fizica' }, { skillDir });
    expect(readFileSync(path.join(physics, 'subject.md'), 'utf8')).toBe('fizica\n');
    const none = await makeWorkFolder(root, 'subject-none', { test: pdf('test'), barem: pdf('barem'), subject: null }, { skillDir });
    expect(filesIn(none)).not.toContain('subject.md');
    const other = await makeWorkFolder(root, 'subject-other', { test: pdf('test'), subject: 'alta' }, { skillDir });
    expect(filesIn(other)).not.toContain('subject.md');
  });

  it('writes the teacher notes for a barem task and no barem folder', async () => {
```

- [ ] **Step 4: Edit `runner/tasks.test.ts`**

Find this block:

```ts
describe('makeExerciseList', () => {
  it('saves the list that Claude made from the test and the barem, and removes the work folder', async () => {
```

Replace it with:

```ts
describe('makeExerciseList', () => {
  it('gives Claude the subject of a test that has one, so that it looks for none', async () => {
    await world.api.db.prepare("UPDATE tests SET subject = 'fizica', subject_by = 'teacher' WHERE id = ?").bind(world.testId).run();
    let subject = '';
    const claude = scriptedClaude((task) => {
      subject = readFileSync(path.join(task.cwd, 'subject.md'), 'utf8');
      return answer(LIST);
    });
    expect(await makeExerciseList(await context(claude), world.testId)).toBe('saved');
    expect(subject).toBe('fizica\n');
  });

  it('saves the list that Claude made from the test and the barem, and removes the work folder', async () => {
```

- [ ] **Step 5: Edit `runner/tasks.test.ts`**

Find this block:

```ts
      expect(JSON.parse(readFileSync(path.join(task.cwd, 'exercises.json'), 'utf8'))).toEqual(LIST);
      return answer(GRADING);
```

Replace it with:

```ts
      expect(JSON.parse(readFileSync(path.join(task.cwd, 'exercises.json'), 'utf8'))).toEqual(LIST);
      // A test with no subject is a math test.
      expect(readFileSync(path.join(task.cwd, 'subject.md'), 'utf8')).toBe('matematica\n');
      return answer(GRADING);
```

- [ ] **Step 6: Edit `runner/tasks.test.ts`**

Find this block:

```ts
      'student/page-02.jpg',
      'test/test.pdf',
```

Replace it with:

```ts
      'student/page-02.jpg',
      'subject.md',
      'test/test.pdf',
```

- [ ] **Step 7: Edit `runner/tasks.test.ts`**

Find this block:

```ts
    expect(claude.calls[0]!.task.jsonSchema).toMatchObject({ $schema: 'http://json-schema.org/draft-07/schema#' });
    expect(claude.calls[0]!.files).toEqual([...SKILL_FILES, 'class-results.json']);
    const row = await testRow();
```

Replace it with:

```ts
    expect(claude.calls[0]!.task.jsonSchema).toMatchObject({ $schema: 'http://json-schema.org/draft-07/schema#' });
    expect(claude.calls[0]!.files).toEqual([...SKILL_FILES, 'class-results.json', 'subject.md']);
    const row = await testRow();
```

- [ ] **Step 8: Edit `runner/baremTask.test.ts`**

Find this block:

```ts
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
```

Replace it with:

```ts
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
```

- [ ] **Step 9: Edit `runner/baremTask.test.ts`**

Find this block:

```ts
    expect(claude.calls[0]!.files).toEqual(['.claude/skills/evaluate-test/SKILL.md', 'notes.md', 'test/test.pdf']);
  });
```

Replace it with:

```ts
    expect(claude.calls[0]!.files).toEqual(['.claude/skills/evaluate-test/SKILL.md', 'notes.md', 'test/test.pdf']);
  });

  it("gives Claude the test's subject when it is known", async () => {
    await setUp('pdf');
    await api!.db.prepare("UPDATE tests SET subject = 'chimie', subject_by = 'teacher' WHERE id = ?").bind(open.testId).run();
    let subject = '';
    const claude = scriptedClaude((task) => {
      subject = readFileSync(path.join(task.cwd, 'subject.md'), 'utf8');
      return answer(BAREM);
    });
    expect(await makeBarem(context(claude), open.testId)).toBe('saved');
    expect(subject).toBe('chimie\n');
  });
```

- [ ] **Step 10: Edit `runner/api.test.ts`**

Find this block:

```ts
      baremNotes: '',
    });
```

Replace it with:

```ts
      baremNotes: '',
      subject: null,
    });
```

- [ ] **Step 11: Edit `runner/api.test.ts`**

Find this block:

```ts
      baremNotes: 'Acordă punct parțial.',
    });
```

Replace it with:

```ts
      baremNotes: 'Acordă punct parțial.',
      subject: null,
    });
```

- [ ] **Step 12: Edit `server/routes/baremJob.test.ts`**

Find this block:

```ts
    expect(job.body).toEqual({
      job: { testId, createdAt: await createdAt(), filesVersion: await version(), contentType: 'application/pdf', baremNotes: 'Acordă punct parțial.' },
    });
```

Replace it with:

```ts
    expect(job.body).toEqual({
      job: { testId, createdAt: await createdAt(), filesVersion: await version(), contentType: 'application/pdf', baremNotes: 'Acordă punct parțial.', subject: null },
    });
```

- [ ] **Step 13: Edit `server/routes/runner.test.ts`**

Find this block:

```ts
        baremNotes: '',
      },
```

Replace it with:

```ts
        baremNotes: '',
        subject: null,
      },
```

- [ ] **Step 14: Edit `server/routes/runnerCes.test.ts`**

Find this block:

```ts
      baremNotes: 'N',
      variant: 'ces',
```

Replace it with:

```ts
      baremNotes: 'N',
      subject: null,
      variant: 'ces',
```

- [ ] **Step 15: Run the new tests and see them fail**

Run: `npx vitest run shared/subjects.test.ts server/routes/subject.test.ts runner/workdir.test.ts runner/tasks.test.ts runner/baremTask.test.ts runner/api.test.ts server/routes/baremJob.test.ts server/routes/runner.test.ts server/routes/runnerCes.test.ts`
Expected: FAIL. `Test Files  9 failed (9)`, `Tests  16 failed | 144 passed (160)`: `shared/subjects.ts` does not exist (`Cannot find module './subjects.ts'`), the database has no `subject` column (`no such column: subject`), the robot's test and barem job have no `subject` (`expected { …(5) } to deeply equal { …(6) }`), the work folder has no `subject.md` (`ENOENT … subject.md`), and the barem note still says "ipoteza". The tests that pass at RED are the files' older tests.

- [ ] **Step 16: Create `shared/subjects.ts`**

```ts
// The subjects MQGrader grades (spec: any subject). The robot finds a test's
// subject once, with its exercise list or its generated barem; `alta` is a
// subject it does not grade, kept with its Romanian name for the message.

export const SUBJECTS = ['matematica', 'fizica', 'chimie', 'biologie', 'stiinte', 'romana', 'engleza'] as const;

export type Subject = (typeof SUBJECTS)[number];

// What the robot may answer: a subject of the list, or another one.
export const DETECTED_SUBJECTS = [...SUBJECTS, 'alta'] as const;

export type DetectedSubject = (typeof DETECTED_SUBJECTS)[number];

// The names the pages show, in the order of SUBJECTS.
export const SUBJECT_NAMES: Record<Subject, string> = {
  matematica: 'Matematică',
  fizica: 'Fizică',
  chimie: 'Chimie',
  biologie: 'Biologie',
  stiinte: 'Științe',
  romana: 'Limba română',
  engleza: 'Limba engleză',
};

// The subject of a test as the teacher app sees it. `name` is the Romanian
// name of an `alta` subject ("istorie"), "" otherwise; `by` says who set it.
export interface SubjectInfo {
  value: DetectedSubject;
  name: string;
  by: 'robot' | 'teacher';
}

// The longest name of an `alta` subject that is kept.
export const MAX_SUBJECT_NAME = 60;

export const SUPPORTED_SUBJECTS_TEXT = 'matematică, fizică, chimie, biologie, științe, limba română și limba engleză';

// What the teacher reads when the robot found a subject it does not grade.
export function unsupportedMessage(name: string): string {
  const found = name.trim() ? `Testul pare să fie de ${name.trim()}.` : 'Testul nu pare să fie de o materie pe care o corectăm.';
  return `${found} MQGrader corectează acum: ${SUPPORTED_SUBJECTS_TEXT}.`;
}

export function isDetectedSubject(value: unknown): value is DetectedSubject {
  return typeof value === 'string' && (DETECTED_SUBJECTS as readonly string[]).includes(value);
}
```

- [ ] **Step 17: Create `migrations/0028_test_subject.sql`**

```sql
-- The subject of a test (spec: any subject). The robot finds it once, with
-- the exercise list or a generated barem, and saves it only while the test
-- has none; the teacher may set it. NULL: not found yet. 'alta': a subject
-- the robot does not grade, with its Romanian name in subject_name.
-- subject_by: who set it, 'robot' or 'teacher'. Every test made before this
-- migration is a math test that the teacher set, so the robot never looks for
-- its subject again. One statement per ";" line end, and no ";" inside strings.

ALTER TABLE tests ADD COLUMN subject TEXT CHECK (subject IS NULL OR subject IN ('matematica', 'fizica', 'chimie', 'biologie', 'stiinte', 'romana', 'engleza', 'alta'));

ALTER TABLE tests ADD COLUMN subject_name TEXT NOT NULL DEFAULT '';

ALTER TABLE tests ADD COLUMN subject_by TEXT CHECK (subject_by IS NULL OR subject_by IN ('robot', 'teacher'));

UPDATE tests SET subject = 'matematica', subject_by = 'teacher';
```

- [ ] **Step 18: Edit `shared/api.ts`**

Find this block:

```ts
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST, studentNameKey } from './students.ts';
import { type AnalysisStatus, cleanTitle, MAX_TITLE_LENGTH, type ExerciseListStatus, type TestStatus } from './tests.ts';
```

Replace it with:

```ts
import { cleanStudentName, MAX_NAME_LENGTH, MAX_NAMES_PER_REQUEST, studentNameKey } from './students.ts';
import type { SubjectInfo } from './subjects.ts';
import { type AnalysisStatus, cleanTitle, MAX_TITLE_LENGTH, type ExerciseListStatus, type TestStatus } from './tests.ts';
```

- [ ] **Step 19: Edit `shared/api.ts`**

Find this block:

```ts
  print: { status: PrintStatus; fromWord: boolean };
  ces: CesVariantInfo;
```

Replace it with:

```ts
  print: { status: PrintStatus; fromWord: boolean };
  // The test's subject: found by the robot with the exercise list or a
  // generated barem, or set by the teacher. Null until then.
  subject: SubjectInfo | null;
  ces: CesVariantInfo;
```

- [ ] **Step 20: Edit `shared/runner.ts`**

Find this block:

```ts
import type { ExerciseList } from './schemas.ts';

```

Replace it with:

```ts
import type { ExerciseList } from './schemas.ts';
import type { DetectedSubject } from './subjects.ts';

```

- [ ] **Step 21: Edit `shared/runner.ts`**

Find this block:

```ts
  version: string;
  maxTotal: number;
```

Replace it with:

```ts
  version: string;
  // The test's subject; null or missing (an older API): a math test.
  subject?: DetectedSubject | null;
  maxTotal: number;
```

- [ ] **Step 22: Edit `shared/runner.ts`**

Find this block:

```ts
  classBarem?: { contentType: string } | null;
  classExerciseList?: ExerciseList | null;
}

```

Replace it with:

```ts
  classBarem?: { contentType: string } | null;
  classExerciseList?: ExerciseList | null;
  // The test's subject, when known: the robot then looks for none. An older
  // API sends none.
  subject?: DetectedSubject | null;
}

```

- [ ] **Step 23: Edit `shared/runner.ts`**

Find this block:

```ts
  classExerciseList?: ExerciseList | null;
}
```

Replace it with:

```ts
  classExerciseList?: ExerciseList | null;
  // The test's subject (one for both variants). Null: not found yet; the
  // exercise list finds it, and a grading then counts it as math. An older
  // API sends none.
  subject?: DetectedSubject | null;
}
```

- [ ] **Step 24: Edit `server/db/tests.ts`**

Find this block:

```ts
import { compareStudentNames } from '../../shared/students.ts';
import { type AnalysisStatus, buildTestCode, type ExerciseListStatus, type TestStatus } from '../../shared/tests.ts';
```

Replace it with:

```ts
import { compareStudentNames } from '../../shared/students.ts';
import type { DetectedSubject, SubjectInfo } from '../../shared/subjects.ts';
import { type AnalysisStatus, buildTestCode, type ExerciseListStatus, type TestStatus } from '../../shared/tests.ts';
```

- [ ] **Step 25: Edit `server/db/tests.ts`**

Find this block:

```ts
  analysis: AnalysisInfo;
  ces: VariantRecord & {
```

Replace it with:

```ts
  analysis: AnalysisInfo;
  // Null until the robot finds it or the teacher sets it.
  subject: SubjectInfo | null;
  ces: VariantRecord & {
```

- [ ] **Step 26: Edit `server/db/tests.ts`**

Find this block:

```ts
  print_file_key: string | null;
  ces_test_file_key: string | null;
```

Replace it with:

```ts
  print_file_key: string | null;
  subject: DetectedSubject | null;
  subject_name: string;
  subject_by: 'robot' | 'teacher' | null;
  ces_test_file_key: string | null;
```

- [ ] **Step 27: Edit `server/db/tests.ts`**

Find this block:

```ts
    t.results_open, t.archived, t.analysis_status, t.analysis_stale, t.analysis_attempts,
    t.print_status, t.print_file_key,
    t.ces_test_file_key, t.ces_test_file_name, t.ces_test_file_type,
```

Replace it with:

```ts
    t.results_open, t.archived, t.analysis_status, t.analysis_stale, t.analysis_attempts,
    t.print_status, t.print_file_key, t.subject, t.subject_name, t.subject_by,
    t.ces_test_file_key, t.ces_test_file_name, t.ces_test_file_type,
```

- [ ] **Step 28: Edit `server/db/tests.ts`**

Find this block:

```ts
    print: { status: row.print_status, key: row.print_file_key, fromWord: row.test_file_type === DOCX_TYPE },
    ces: {
```

Replace it with:

```ts
    print: { status: row.print_status, key: row.print_file_key, fromWord: row.test_file_type === DOCX_TYPE },
    subject: row.subject === null ? null : { value: row.subject, name: row.subject_name, by: row.subject_by ?? 'robot' },
    ces: {
```

- [ ] **Step 29: Edit `server/db/tests.ts`**

Find this block:

```ts
    print: { status: record.print.status, fromWord: record.print.fromWord },
    ces: toCesInfo(record.ces),
```

Replace it with:

```ts
    print: { status: record.print.status, fromWord: record.print.fromWord },
    subject: record.subject,
    ces: toCesInfo(record.ces),
```

- [ ] **Step 30: Edit `server/db/tests.ts`**

Find this block:

```ts

export async function saveTestFile(
```

Replace it with:

```ts

// The SET part that forgets a subject the robot found; the teacher's stays.
// SQLite reads every right side before it writes, so the three see the old row.
const SUBJECT_FROM_ROBOT_CLEARED = `subject = CASE WHEN subject_by = 'robot' THEN NULL ELSE subject END,
           subject_name = CASE WHEN subject_by = 'robot' THEN '' ELSE subject_name END,
           subject_by = CASE WHEN subject_by = 'robot' THEN NULL ELSE subject_by END, `;

export async function saveTestFile(
```

- [ ] **Step 31: Edit `server/db/tests.ts`**

Find this block:

```ts
  const on = variant === 'ces' ? 'ces_off = 0, ' : '';
  const sql =
    kind === 'test'
      ? `UPDATE tests SET ${on}${c('test_file_key')} = ?, ${c('test_file_name')} = ?, ${c('test_file_type')} = ?, updated_at = ?,
           ${c('files_version')} = ${c('files_version')} + 1,
```

Replace it with:

```ts
  const on = variant === 'ces' ? 'ces_off = 0, ' : '';
  // A new class test file is read again for its subject, unless the teacher set it.
  const subject = variant === 'class' ? SUBJECT_FROM_ROBOT_CLEARED : '';
  const sql =
    kind === 'test'
      ? `UPDATE tests SET ${on}${subject}${c('test_file_key')} = ?, ${c('test_file_name')} = ?, ${c('test_file_type')} = ?, updated_at = ?,
           ${c('files_version')} = ${c('files_version')} + 1,
```

- [ ] **Step 32: Edit `server/db/runner.ts`**

Find this block:

```ts
import { compareStudentNames } from '../../shared/students.ts';
import type { TestVariant } from '../../shared/files.ts';
```

Replace it with:

```ts
import { compareStudentNames } from '../../shared/students.ts';
import type { DetectedSubject } from '../../shared/subjects.ts';
import type { TestVariant } from '../../shared/files.ts';
```

- [ ] **Step 33: Edit `server/db/runner.ts`**

Find this block:

```ts
         ${c('barem_file_key')} AS barem_file_key, ${c('barem_file_type')} AS barem_file_type, ${c('barem_notes')} AS barem_notes,
         ${c('exercise_list_json')} AS exercise_list_json, exercise_list_json AS class_list_json
       FROM tests WHERE id = ? AND status = 'evaluating'`,
```

Replace it with:

```ts
         ${c('barem_file_key')} AS barem_file_key, ${c('barem_file_type')} AS barem_file_type, ${c('barem_notes')} AS barem_notes,
         ${c('exercise_list_json')} AS exercise_list_json, exercise_list_json AS class_list_json, subject
       FROM tests WHERE id = ? AND status = 'evaluating'`,
```

- [ ] **Step 34: Edit `server/db/runner.ts`**

Find this block:

```ts
      exercise_list_json: string | null;
      class_list_json: string | null;
    }>();
  if (!row) return null;
```

Replace it with:

```ts
      exercise_list_json: string | null;
      class_list_json: string | null;
      subject: DetectedSubject | null;
    }>();
  if (!row) return null;
```

- [ ] **Step 35: Edit `server/db/runner.ts`**

Find this block:

```ts
      baremNotes: row.barem_notes ?? '',
      ...(variant === 'ces' ? { variant, classExerciseList: list(row.class_list_json) } : {}),
```

Replace it with:

```ts
      baremNotes: row.barem_notes ?? '',
      subject: row.subject,
      ...(variant === 'ces' ? { variant, classExerciseList: list(row.class_list_json) } : {}),
```

- [ ] **Step 36: Edit `server/db/runner.ts`**

Find this block:

```ts
         t.${v('test_file_type')} AS test_file_type, t.${v('barem_notes')} AS barem_notes, t.teacher_id, t.code, c.school_year,
         t.barem_file_key AS class_barem_key, t.barem_file_type AS class_barem_type, t.exercise_list_json AS class_list_json
       FROM tests t JOIN classes c ON c.id = t.class_id
```

Replace it with:

```ts
         t.${v('test_file_type')} AS test_file_type, t.${v('barem_notes')} AS barem_notes, t.teacher_id, t.code, c.school_year,
         t.barem_file_key AS class_barem_key, t.barem_file_type AS class_barem_type, t.exercise_list_json AS class_list_json, t.subject
       FROM tests t JOIN classes c ON c.id = t.class_id
```

- [ ] **Step 37: Edit `server/db/runner.ts`**

Find this block:

```ts
      class_list_json: string | null;
    }>();
```

Replace it with:

```ts
      class_list_json: string | null;
      subject: DetectedSubject | null;
    }>();
```

- [ ] **Step 38: Edit `server/db/runner.ts`**

Find this block:

```ts
    baremNotes: row.barem_notes ?? '',
  };
```

Replace it with:

```ts
    baremNotes: row.barem_notes ?? '',
    subject: row.subject,
  };
```

- [ ] **Step 39: Edit `server/db/runner.ts`**

Find this block:

```ts
    ces_exercise_list_json?: string | null;
    variant?: string | null;
```

Replace it with:

```ts
    ces_exercise_list_json?: string | null;
    subject?: DetectedSubject | null;
    variant?: string | null;
```

- [ ] **Step 40: Edit `server/db/runner.ts`**

Find this block:

```ts
      .prepare(
        `SELECT t.exercise_list_json, t.ces_exercise_list_json, ${gradesVersionSql('t')} AS version FROM tests t WHERE t.id = ? AND t.status = 'evaluating'`,
      )
```

Replace it with:

```ts
      .prepare(
        `SELECT t.exercise_list_json, t.ces_exercise_list_json, t.subject, ${gradesVersionSql('t')} AS version FROM tests t WHERE t.id = ? AND t.status = 'evaluating'`,
      )
```

- [ ] **Step 41: Edit `server/db/runner.ts`**

Find this block:

```ts
    version: head.version!,
    maxTotal: list?.totalPoints ?? latest?.maxTotal ?? 0,
```

Replace it with:

```ts
    version: head.version!,
    subject: head.subject ?? null,
    maxTotal: list?.totalPoints ?? latest?.maxTotal ?? 0,
```

- [ ] **Step 42: Edit `runner/workdir.ts`**

Find this block:

```ts
import type { ExerciseList } from '../shared/schemas.ts';

```

Replace it with:

```ts
import type { ExerciseList } from '../shared/schemas.ts';
import type { DetectedSubject } from '../shared/subjects.ts';

```

- [ ] **Step 43: Edit `runner/workdir.ts`**

Find this block:

```ts
//   class-results.json              (class-report) the graded class, anonymized; no test, no barem
//   ces.md                          (CES variant) says that test/ and barem/ are the CES variant's
```

Replace it with:

```ts
//   class-results.json              (class-report) the graded class, anonymized; no test, no barem
//   subject.md                      the test's subject (matematica, fizica, …), when it is known;
//                                   without it, the exercise-list and barem modes find it
//   ces.md                          (CES variant) says that test/ and barem/ are the CES variant's
```

- [ ] **Step 44: Edit `runner/workdir.ts`**

Find this block:

```ts
  classBarem?: TaskFile | null;
}
```

Replace it with:

```ts
  classBarem?: TaskFile | null;
  // The test's subject, written to subject.md. None, or `alta` (a subject the
  // robot does not grade): no file, and Claude finds the subject.
  subject?: DetectedSubject | null;
}
```

- [ ] **Step 45: Edit `runner/workdir.ts`**

Find this block:

```ts
export const DEFAULT_BAREM_NOTES = [
  'Nu puncta rezolvările care nu se bazează pe ipoteza problemei sau care nu au legătură cu cerințele problemei.',
  'Punctează și rezolvările corecte, parțiale sau totale, care nu se potrivesc cu rezultatele parțiale din barem.',
```

Replace it with:

```ts
export const DEFAULT_BAREM_NOTES = [
  'Nu puncta rezolvările care nu se bazează pe enunțul problemei sau care nu au legătură cu cerințele problemei.',
  'Punctează și rezolvările corecte, parțiale sau totale, care nu se potrivesc cu rezultatele parțiale din barem.',
```

- [ ] **Step 46: Edit `runner/workdir.ts`**

Find this block:

```ts
  }
  if (input.variant === 'ces') await writeFile(path.join(folder, 'ces.md'), `${CES_NOTE}\n`);
```

Replace it with:

```ts
  }
  if (input.subject && input.subject !== 'alta') await writeFile(path.join(folder, 'subject.md'), `${input.subject}\n`);
  if (input.variant === 'ces') await writeFile(path.join(folder, 'ces.md'), `${CES_NOTE}\n`);
```

- [ ] **Step 47: Edit `runner/tasks.ts`**

Find this block:

```ts
    if (!files) return sendOutcome({ ok: false, problem: 'crash', detail: 'missing file' }, async () => undefined, sendError);
    const cwd = await makeFolder({
```

Replace it with:

```ts
    if (!files) return sendOutcome({ ok: false, problem: 'crash', detail: 'missing file' }, async () => undefined, sendError);
    // A test with no subject yet: Claude finds it with the list.
    const cwd = await makeFolder({
```

- [ ] **Step 48: Edit `runner/tasks.ts`**

Find this block:

```ts
      baremNotes: test.baremNotes,
      ...(ces ? { variant, classExerciseList: test.classExerciseList ?? null } : {}),
```

Replace it with:

```ts
      baremNotes: test.baremNotes,
      subject: test.subject ?? null,
      ...(ces ? { variant, classExerciseList: test.classExerciseList ?? null } : {}),
```

- [ ] **Step 49: Edit `runner/tasks.ts`**

Find this block:

```ts
    const classResults = await ctx.api.classResults(testId);
    const cwd = await makeFolder({ classResults });
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
```

Replace it with:

```ts
    const classResults = await ctx.api.classResults(testId);
    const cwd = await makeFolder({ classResults, subject: classResults.subject ?? 'matematica' });
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
```

- [ ] **Step 50: Edit `runner/tasks.ts`**

Find this block:

```ts
    }
    const cwd = await makeFolder({ ...files, baremNotes: test.baremNotes, exerciseList: list, pages, ...(variant === 'ces' ? { variant } : {}) });
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
```

Replace it with:

```ts
    }
    // A test with no subject (an older API, or a list made before subjects) is a math test.
    const subject = test.subject ?? 'matematica';
    const cwd = await makeFolder({ ...files, baremNotes: test.baremNotes, exerciseList: list, pages, subject, ...(variant === 'ces' ? { variant } : {}) });
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
```

- [ ] **Step 51: Edit `runner/baremTask.ts`**

Find this block:

```ts
      try {
        const input = { test: { bytes: source, contentType: job.contentType }, requestNotes: job.baremNotes };
        cwd = await makeWorkFolder(
```

Replace it with:

```ts
      try {
        const input = { test: { bytes: source, contentType: job.contentType }, requestNotes: job.baremNotes, subject: job.subject ?? null };
        cwd = await makeWorkFolder(
```

- [ ] **Step 52: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      print: { status: 'none', fromWord: false },
      ces: noCesVariant(),
```

Replace it with:

```ts
      print: { status: 'none', fromWord: false },
      subject: null,
      ces: noCesVariant(),
```

- [ ] **Step 53: Edit `AGENTS.md`**

Find this block:

```markdown
- `server/`: the API (routes, D1 queries, auth, R2 files, secrets, emails).
- `shared/`: code for the API, the browser, and the robot: zod request schemas and response types (`api.ts`), roles and the demo paper limit (`accounts.ts`), school year, class and student names, ids, test codes (`tests.ts`), file rules and R2 keys (`files.ts`), the robot's output contracts and their JSON Schemas (`schemas.ts`), points and grades (`scoring.ts`), robot API bodies (`runner.ts`), the search fold that ignores case and diacritics (`search.ts`).
- Payments with Stripe Checkout: `docs/payments.md`.
```

Replace it with:

```markdown
- `server/`: the API (routes, D1 queries, auth, R2 files, secrets, emails).
- `shared/`: code for the API, the browser, and the robot: zod request schemas and response types (`api.ts`), roles and the demo paper limit (`accounts.ts`), school year, class and student names, ids, test codes (`tests.ts`), file rules and R2 keys (`files.ts`), the robot's output contracts and their JSON Schemas (`schemas.ts`), points and grades (`scoring.ts`), robot API bodies (`runner.ts`), the search fold that ignores case and diacritics (`search.ts`), the subjects the robot grades and the message for one it does not (`subjects.ts`).
- Payments with Stripe Checkout: `docs/payments.md`.
```

- [ ] **Step 54: Edit `runner/AGENTS.md`**

Find this block:

```markdown
- The CES variant: the print, the barem, the exercise list and the grading take a `variant`; "ces" asks the API with `?variant=ces` and puts `ces.md` in the work folder (`CES_NOTE`), and the CES barem and list jobs also get `class/exercises.json` (and `class/barem.*` for a barem), so the CES list reuses the class exercise ids. A claim names the paper's variant. Each kind of CES work is tried by the same rules as the class work, after it, in the same round.
- `printTask.ts` makes the print PDF through the Docker image in `print/`. The image pins LibreOffice and installs only Liberation, Carlito, and Caladea fonts: other fonts (Noto, DejaVu) change "∖" into "∣" and move the layout. `QE_PRINT_IMAGE_TESTS=1` runs the container tests (`print/container.test.ts`, slow the first time). Never log the upload token or a script's output.
```

Replace it with:

```markdown
- The CES variant: the print, the barem, the exercise list and the grading take a `variant`; "ces" asks the API with `?variant=ces` and puts `ces.md` in the work folder (`CES_NOTE`), and the CES barem and list jobs also get `class/exercises.json` (and `class/barem.*` for a barem), so the CES list reuses the class exercise ids. A claim names the paper's variant. Each kind of CES work is tried by the same rules as the class work, after it, in the same round.
- The subject (`shared/subjects.ts`): the robot gets the test's `subject` with the test, a barem job and the class results, and writes it to `subject.md` in the work folder (`makeWorkFolder`). A grading and a class analysis of a test with none get `matematica`; an exercise list or a barem with none (or with `alta`) gets no `subject.md`, and Claude finds the subject.
- `printTask.ts` makes the print PDF through the Docker image in `print/`. The image pins LibreOffice and installs only Liberation, Carlito, and Caladea fonts: other fonts (Noto, DejaVu) change "∖" into "∣" and move the layout. `QE_PRINT_IMAGE_TESTS=1` runs the container tests (`print/container.test.ts`, slow the first time). Never log the upload token or a script's output.
```

- [ ] **Step 55: Edit `server/AGENTS.md`**

Find this block:

```markdown
- The CES variant (migration 0024): every column of the test file, the barem, its comments and request, the exercise list and the print PDF has a `ces_` twin, with its own `ces_files_version`; the queries that serve both take a `variant` and name their columns with `columns(variant)` (`db/variant.ts`, also `needsPrintSql`, `needsBaremSql`, `baremActiveSql`, `paperVariantSql`). The teacher's CES routes are `/api/admin/tests/:code/ces/…` (`routes/cesVariant.ts`); a CES file or comment change is refused only while a CES paper is in grading, and a CES barem may be generated until the test is done. The robot's routes take `?variant=ces` (none: the class test, as an older robot asks); `/tasks` lists `cesPrints`, `cesBarems` and `cesExerciseLists`. The CES list waits for an active CES barem, the class list and a CES paper (`NEEDS_CES_EXERCISE_LIST`). `GRADABLE` holds a CES paper back until its CES barem is active and its CES list usable, and the claim checks it again and writes `submissions.variant` in the same UPDATE; `findGrading` checks a result against the list of the paper's variant. "Șterge varianta CES" (`removeCesVariant`) checks in its SQL that no paper has the variant `ces`. The CES switch (migration 0025, `tests.ces_off`, stored as "off" so that every test asks for the CES files until the teacher says no): Test nou sends `cesOff`; `PUT /:code/ces/off` (`setCesOff`) turns it off in the same guarded write as the removal (and starts the robot during the evaluation), or on; a CES file sets `ces_off = 0` in its own UPDATE. `TestSummary.prepared.ces` gives the tests list what the CES variant has (`wanted`: an active CES student and the switch on). The CES barem job (`needsBaremSql('ces')`) waits while the class barem is being generated. The report gives the CES columns apart (`cesExercises`) only when they are not the class ones (`sameExercises` in `shared/stats.ts`); the class analysis gets each paper's `variant` and the CES exercises.
- A test gets its `upload_token` in its INSERT (`createTest`), so a draft has its print PDF; Start test keeps it (`COALESCE`, for a draft made before that). A draft made before that gets one at Start, with a new test file (`saveTestFile`), or with "Pregătește testul cu cod QR" (`retryPrint`). Stop test (`stopTest`: open → draft, clears `started_at` and `evaluation_at`) checks in its SQL that the test was never evaluated (`evaluation_started_at IS NULL`) and that no upload of the test has a file or is past `uploading` (`NO_STUDENT_FILES`); a student file that lands at the same moment checks the open test in its own SQL (`OPEN_UPLOAD`), so one of the two is refused. Student writes on a draft answer 409 `not_started`.
```

Replace it with:

```markdown
- The CES variant (migration 0024): every column of the test file, the barem, its comments and request, the exercise list and the print PDF has a `ces_` twin, with its own `ces_files_version`; the queries that serve both take a `variant` and name their columns with `columns(variant)` (`db/variant.ts`, also `needsPrintSql`, `needsBaremSql`, `baremActiveSql`, `paperVariantSql`). The teacher's CES routes are `/api/admin/tests/:code/ces/…` (`routes/cesVariant.ts`); a CES file or comment change is refused only while a CES paper is in grading, and a CES barem may be generated until the test is done. The robot's routes take `?variant=ces` (none: the class test, as an older robot asks); `/tasks` lists `cesPrints`, `cesBarems` and `cesExerciseLists`. The CES list waits for an active CES barem, the class list and a CES paper (`NEEDS_CES_EXERCISE_LIST`). `GRADABLE` holds a CES paper back until its CES barem is active and its CES list usable, and the claim checks it again and writes `submissions.variant` in the same UPDATE; `findGrading` checks a result against the list of the paper's variant. "Șterge varianta CES" (`removeCesVariant`) checks in its SQL that no paper has the variant `ces`. The CES switch (migration 0025, `tests.ces_off`, stored as "off" so that every test asks for the CES files until the teacher says no): Test nou sends `cesOff`; `PUT /:code/ces/off` (`setCesOff`) turns it off in the same guarded write as the removal (and starts the robot during the evaluation), or on; a CES file sets `ces_off = 0` in its own UPDATE. `TestSummary.prepared.ces` gives the tests list what the CES variant has (`wanted`: an active CES student and the switch on). The CES barem job (`needsBaremSql('ces')`) waits while the class barem is being generated. The report gives the CES columns apart (`cesExercises`) only when they are not the class ones (`sameExercises` in `shared/stats.ts`); the class analysis gets each paper's `variant` and the CES exercises.
- The subject of a test (migration 0028: `tests.subject`, `subject_name`, `subject_by`; `shared/subjects.ts`): null until the robot finds it or the teacher sets it; every test made before the migration is `matematica`, set by the teacher. `TestInfo.subject` shows it; `findRobotTest`, `findBaremJob` and `findClassResults` give it to the robot. A new class test file forgets a subject the robot found, in the UPDATE of `saveTestFile`, never one the teacher set.
- A test gets its `upload_token` in its INSERT (`createTest`), so a draft has its print PDF; Start test keeps it (`COALESCE`, for a draft made before that). A draft made before that gets one at Start, with a new test file (`saveTestFile`), or with "Pregătește testul cu cod QR" (`retryPrint`). Stop test (`stopTest`: open → draft, clears `started_at` and `evaluation_at`) checks in its SQL that the test was never evaluated (`evaluation_started_at IS NULL`) and that no upload of the test has a file or is past `uploading` (`NO_STUDENT_FILES`); a student file that lands at the same moment checks the open test in its own SQL (`OPEN_UPLOAD`), so one of the two is refused. Student writes on a draft answer 409 `not_started`.
```

- [ ] **Step 56: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  172 passed | 1 skipped (173)`, `Tests  2547 passed | 3 skipped (2550)`.

- [ ] **Step 57: Commit**

```bash
git add shared/subjects.ts shared/subjects.test.ts migrations/0028_test_subject.sql server/routes/subject.test.ts shared/api.ts shared/runner.ts server/db/tests.ts server/db/runner.ts runner/workdir.ts runner/workdir.test.ts runner/tasks.ts runner/tasks.test.ts runner/baremTask.ts runner/baremTask.test.ts runner/api.test.ts server/routes/baremJob.test.ts server/routes/runner.test.ts server/routes/runnerCes.test.ts src/test/fakeApi.ts AGENTS.md runner/AGENTS.md server/AGENTS.md
git commit -m "Keep the subject of a test and give it to the robot"
```

### Task 2: The robot finds the subject; a subject not graded stops the grading

Claude answers `subject` and `subjectName` in the modes `exercise-list` and `barem`; the API saves the subject with the class list and the generated barem; `alta` ends the list as failed, keeps the test out of every start and out of a demo account's counts; the banner and the Quick Try page say so.

**Files:**
- Create: `server/routes/subjectDetection.test.ts`
- Modify: `shared/schemas.ts`, `server/db/runner.ts`, `server/db/lifecycle.ts`, `server/db/tests.ts`, `server/routes/runner.ts`, `server/routes/tests.ts`, `runner/api.ts`, `runner/tasks.ts`, `runner/baremTask.ts`, `runner/trySkill.ts`, `src/admin/testPage/ExerciseListBanner.tsx`, `src/try/Working.tsx`, `runner/AGENTS.md`, `server/AGENTS.md`
- Test: `server/routes/subjectDetection.test.ts`, `shared/schemas.test.ts`, `runner/tasks.test.ts`, `runner/baremTask.test.ts`, `src/admin/pages/TestPage.test.tsx`, `src/try/Working.test.tsx`

**Interfaces:**
- Consumes: Task 1's `DetectedSubject`, `DETECTED_SUBJECTS`, `MAX_SUBJECT_NAME`, `unsupportedMessage`, `TestInfo.subject`, `TestRecord.subject`.
- Produces: `subjectAnswerSchema`, `exerciseListAnswerSchema`, `generatedBaremAnswerSchema`, `FoundSubject { value; name }`, `subjectOf(raw): FoundSubject | null`, `CheckedExerciseList.subject` in `shared/schemas.ts`; `SUBJECT_OPEN` and `saveGeneratedBarem(…, variant, found)` in `server/db/runner.ts`; `SUBJECT_GRADED` in `server/db/lifecycle.ts`; `RobotApi.sendBarem(…, variant, subject?)`; the 409 `subject_unsupported`.

- [ ] **Step 1: Create `server/routes/subjectDetection.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_PAPER_LIMIT } from '../../shared/accounts.ts';
import { DOCX_TYPE } from '../../shared/files.ts';
import { unsupportedMessage } from '../../shared/subjects.ts';
import { addSubmission, addTestFiles, makeClass, makeTest, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The subject that the robot finds (spec: any subject): saved with the
// exercise list or a generated barem, and a subject it does not grade, which
// stops the grading before any paper.

const RUN = 'run-subject-0001';
const PAST = '2026-10-06T08:00:00.000Z';
const LIST = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 9, answer: '3', scoringNotes: '', topic: 'Ecuații' }],
  notes: '',
};
const HISTORY = unsupportedMessage('istorie');

let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
const dispatchRobot = vi.fn(async () => true);
let code: string;
let testId: number;
let classId: number;
let studentIds: number[];

const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(...params, testId).run();
const row = () =>
  api.db
    .prepare('SELECT subject, subject_name, subject_by, exercise_list_status, exercise_list_message, status, evaluation_at FROM tests WHERE id = ?')
    .bind(testId)
    .first<Record<string, unknown>>();
const saveList = (extra: object) => robot('POST', `/tests/${testId}/exercise-list`, { runId: RUN, filesVersion: 0, ok: true, exerciseList: { ...LIST, ...extra } });
const putBarem = (headers: Record<string, string> = {}) =>
  api.fetch(`/api/runner/tests/${testId}/barem`, {
    method: 'PUT',
    body: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]),
    headers: { Authorization: `Bearer ${ROBOT_KEY}`, 'Content-Type': DOCX_TYPE, 'X-Run-Id': RUN, 'X-Files-Version': '0', ...headers },
  });
const evaluate = (testCode: string, body: object = {}) => api.request('POST', `/api/admin/tests/${testCode}/evaluate`, body);
const putTestFile = () =>
  api.fetch(`/api/admin/tests/${code}/files/test`, {
    method: 'PUT',
    body: new TextEncoder().encode('%PDF-1.7 testul bun'),
    headers: { 'Content-Type': 'application/pdf', 'X-File-Name': 'test.pdf' },
  });

beforeEach(async () => {
  dispatchRobot.mockClear();
  api = await startTestApi({ app: { dispatchRobot } });
  await setRobotKey(api);
  robot = robotRequest(api);
  const cls = await makeClass(api, '6E2', ['Pop Ion', 'Ionescu Ana']);
  classId = cls.id;
  studentIds = cls.studentIds;
  code = await makeTest(api, cls.id);
  await startTest(api, code);
  await addTestFiles(api, code);
  testId = await testIdOf(api, code);
});

afterEach(async () => {
  await api.dispose();
});

describe('the subject found with the exercise list', () => {
  beforeEach(async () => {
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating'");
    await robot('POST', '/lease', { runId: RUN });
  });

  it('is saved as the robot found it, and the papers are graded', async () => {
    const res = await saveList({ subject: 'fizica', subjectName: '' });
    expect(res.body).toEqual({ exerciseList: { status: 'ready', message: null } });
    expect(await row()).toMatchObject({ subject: 'fizica', subject_name: '', subject_by: 'robot' });
    expect((await robot('POST', '/claim', { runId: RUN })).status).toBe(200);
  });

  it('stops the grading at a subject that is not graded, and says which', async () => {
    const res = await saveList({ subject: 'alta', subjectName: 'istorie' });
    expect(res.body).toEqual({ exerciseList: { status: 'failed', message: HISTORY } });
    expect(await row()).toMatchObject({ subject: 'alta', subject_name: 'istorie', subject_by: 'robot', status: 'evaluating' });
    expect((await robot('POST', '/claim', { runId: RUN })).status).toBe(204);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: false, exerciseLists: 0, pendingGrading: 0 });
  });

  it('keeps the subject the teacher set, whatever the robot found', async () => {
    await setTest("subject = 'romana', subject_by = 'teacher'");
    const res = await saveList({ subject: 'alta', subjectName: 'istorie' });
    expect(res.body.exerciseList.status).toBe('ready');
    expect(await row()).toMatchObject({ subject: 'romana', subject_name: '', subject_by: 'teacher' });
  });

  it('changes nothing about the subject in an older robot’s list', async () => {
    expect((await saveList({})).body.exerciseList.status).toBe('ready');
    expect(await row()).toMatchObject({ subject: null, subject_by: null });
  });

  it('takes a new answer of the robot after a list that ended at a subject not graded', async () => {
    await setTest("subject = 'alta', subject_name = 'istorie', subject_by = 'robot'");
    expect((await saveList({ subject: 'matematica', subjectName: '' })).body.exerciseList.status).toBe('ready');
    expect(await row()).toMatchObject({ subject: 'matematica', subject_name: '', subject_by: 'robot' });
  });

  it('ends a Quick Try whose subject is not graded as failed, with the message', async () => {
    await setTest('quick_try = 1');
    expect((await saveList({ subject: 'alta', subjectName: 'istorie' })).body).toEqual({ exerciseList: { status: 'failed', message: HISTORY } });
  });
});

describe('the subject found with a generated barem', () => {
  beforeEach(async () => {
    await setTest("barem_file_key = NULL, barem_file_name = NULL, barem_file_type = NULL, barem_request = 'requested'");
    await robot('POST', '/lease', { runId: RUN });
  });

  it('is saved with the barem, also a subject that is not graded', async () => {
    expect((await putBarem({ 'X-Subject': 'alta', 'X-Subject-Name': encodeURIComponent('istorie') })).status).toBe(200);
    expect(await row()).toMatchObject({ subject: 'alta', subject_name: 'istorie', subject_by: 'robot', exercise_list_status: 'none' });
  });

  it('is not saved from an older robot or from headers that cannot be read, and the barem is', async () => {
    expect((await putBarem({ 'X-Subject': 'istorie' })).status).toBe(200);
    expect(await row()).toMatchObject({ subject: null, subject_by: null });
  });

  it('cannot be read from a broken name', async () => {
    expect((await putBarem({ 'X-Subject': 'alta', 'X-Subject-Name': '%E0%A4%A' })).status).toBe(200);
    expect(await row()).toMatchObject({ subject: null });
  });

  it('ends a Quick Try whose subject is not graded', async () => {
    await setTest('quick_try = 1');
    expect((await putBarem({ 'X-Subject': 'alta', 'X-Subject-Name': encodeURIComponent('istorie') })).status).toBe(200);
    expect(await row()).toMatchObject({ subject: 'alta', exercise_list_status: 'failed', exercise_list_message: HISTORY });
  });
});

describe('a test whose subject is not graded', () => {
  beforeEach(async () => {
    await setTest("subject = 'alta', subject_name = 'istorie', subject_by = 'robot'");
    await addSubmission(api, code, studentIds[0]!, { files: 1 });
  });

  it('does not start or get a schedule, and says why', async () => {
    for (const body of [{}, { at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }]) {
      const res = await evaluate(code, body);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'subject_unsupported', message: HISTORY });
    }
    expect(await row()).toMatchObject({ status: 'open', evaluation_at: null });
  });

  it('loses a schedule that comes due, so its students can upload again', async () => {
    await setTest('evaluation_at = ?', PAST);
    await api.request('GET', `/api/admin/tests/${code}`);
    expect(await row()).toMatchObject({ status: 'open', evaluation_at: null });
  });

  it('takes a new test file during its evaluation, and the robot reads it again', async () => {
    // A sent paper keeps the test in evaluation.
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'failed', exercise_list_message = ?", HISTORY);
    const res = await putTestFile();
    expect(res.status).toBe(200);
    expect((await res.json()).robot).not.toBeNull();
    expect(dispatchRobot).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({ subject: null, subject_by: null, exercise_list_status: 'none', exercise_list_message: null });
  });
});

describe('a demo account', () => {
  it('keeps neither its one test nor its papers for a test whose subject is not graded', async () => {
    await api.db.prepare("UPDATE teachers SET role = 'teacher', demo = 1, papers_graded = ? WHERE id = ?").bind(DEMO_PAPER_LIMIT - 1, api.teacherId).run();
    await addSubmission(api, code, studentIds[0]!, { status: 'submitted', files: 1 });
    await setTest(
      "status = 'evaluating', evaluation_started_at = ?, subject = 'alta', subject_name = 'istorie', subject_by = 'robot', exercise_list_status = 'failed'",
      PAST,
    );
    const other = await makeTest(api, classId, 'Alt test');
    await startTest(api, other);
    await addTestFiles(api, other);
    await addSubmission(api, other, studentIds[1]!, { files: 1 });
    expect((await evaluate(other)).status).toBe(200);
  });
});
```

- [ ] **Step 2: Edit `shared/schemas.test.ts`**

Find this block:

```ts
  type ExerciseList,
  exerciseListSchema,
  generatedBaremSchema,
```

Replace it with:

```ts
  type ExerciseList,
  exerciseListAnswerSchema,
  exerciseListSchema,
  generatedBaremAnswerSchema,
  generatedBaremSchema,
```

- [ ] **Step 3: Edit `shared/schemas.test.ts`**

Find this block:

```ts
  OUT_OF_RANGE,
} from './schemas.ts';
```

Replace it with:

```ts
  OUT_OF_RANGE,
  subjectOf,
} from './schemas.ts';
```

- [ ] **Step 4: Edit `shared/schemas.test.ts`**

Find this block:

```ts
    const checked = checkExerciseList(LIST);
    expect(checked).toEqual({ ok: true, value: { list: LIST, status: 'ready', message: null } });
  });
```

Replace it with:

```ts
    const checked = checkExerciseList(LIST);
    expect(checked).toEqual({ ok: true, value: { list: LIST, status: 'ready', message: null, subject: null } });
  });
```

- [ ] **Step 5: Edit `shared/schemas.test.ts`**

Find this block:

```ts
    expect(Object.keys(json.properties)).toEqual(['title', 'subtitle', 'notes', 'total', 'officePoints', 'parts']);
  });
});
```

Replace it with:

```ts
    expect(Object.keys(json.properties)).toEqual(['title', 'subtitle', 'notes', 'total', 'officePoints', 'parts']);
  });
});

describe('the subject in the answers of the modes exercise-list and barem', () => {
  it('reads the subject, and the name only of a subject that is not graded, cut to 60 characters', () => {
    expect(subjectOf({ subject: 'fizica', subjectName: 'fizică' })).toEqual({ value: 'fizica', name: '' });
    expect(subjectOf({ subject: 'alta', subjectName: ' istorie ' })).toEqual({ value: 'alta', name: 'istorie' });
    expect(Array.from(subjectOf({ subject: 'alta', subjectName: 'x'.repeat(100) })!.name)).toHaveLength(60);
  });

  it('reads no subject from an older answer or a value outside the list', () => {
    expect(subjectOf(LIST)).toBeNull();
    expect(subjectOf({ subject: 'istorie', subjectName: '' })).toBeNull();
    expect(subjectOf(null)).toBeNull();
  });

  it('keeps the subject beside the checked list, and stores the list without it', () => {
    const checked = checkExerciseList({ ...LIST, subject: 'chimie', subjectName: '' });
    expect(checked.ok && checked.value.subject).toEqual({ value: 'chimie', name: '' });
    expect(checked.ok && checked.value.list).toEqual(LIST);
    const older = checkExerciseList(LIST);
    expect(older.ok && older.value.subject).toBeNull();
  });

  it('asks Claude for the subject and its name in both modes', () => {
    for (const schema of [exerciseListAnswerSchema, generatedBaremAnswerSchema]) {
      const json = claudeJsonSchema(schema) as { required: string[]; properties: Record<string, { enum?: string[] }> };
      expect(json.required).toEqual(expect.arrayContaining(['subject', 'subjectName']));
      expect(json.properties.subject!.enum).toEqual(['matematica', 'fizica', 'chimie', 'biologie', 'stiinte', 'romana', 'engleza', 'alta']);
    }
  });
});
```

- [ ] **Step 6: Edit `runner/tasks.test.ts`**

Find this block:

```ts
    expect(subject).toBe('fizica\n');
  });
```

Replace it with:

```ts
    expect(subject).toBe('fizica\n');
  });

  it('asks Claude for the subject, and the API keeps the one it found', async () => {
    const claude = scriptedClaude(answer({ ...LIST, subject: 'biologie', subjectName: '' }));
    expect(await makeExerciseList(await context(claude), world.testId)).toBe('saved');
    expect(claude.calls[0]!.files).not.toContain('subject.md');
    expect(claude.calls[0]!.task.jsonSchema).toMatchObject({ required: expect.arrayContaining(['subject', 'subjectName']) });
    const row = await world.api.db.prepare('SELECT subject, subject_by FROM tests WHERE id = ?').bind(world.testId).first();
    expect(row).toEqual({ subject: 'biologie', subject_by: 'robot' });
  });
```

- [ ] **Step 7: Edit `runner/baremTask.test.ts`**

Find this block:

```ts

  it('turns a Word test into Markdown for Claude, and writes no notes without comments', async () => {
```

Replace it with:

```ts

  it('sends the subject that Claude found with the barem, also one that is not graded', async () => {
    await setUp('pdf');
    const claude = scriptedClaude(answer({ ...BAREM, subject: 'alta', subjectName: 'geografie' }));
    expect(await makeBarem(context(claude), open.testId)).toBe('saved');
    expect(claude.calls[0]!.task.jsonSchema).toMatchObject({ required: expect.arrayContaining(['subject', 'subjectName']) });
    const saved = await api!.db.prepare('SELECT subject, subject_name, subject_by FROM tests WHERE id = ?').bind(open.testId).first();
    expect(saved).toEqual({ subject: 'alta', subject_name: 'geografie', subject_by: 'robot' });
  });

  it('turns a Word test into Markdown for Claude, and writes no notes without comments', async () => {
```

- [ ] **Step 8: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
import type { UploadRow } from '../../../shared/api.ts';
import { robotStartMessage } from '../../ui/format.ts';
```

Replace it with:

```tsx
import type { UploadRow } from '../../../shared/api.ts';
import { unsupportedMessage } from '../../../shared/subjects.ts';
import { robotStartMessage } from '../../ui/format.ts';
```

- [ ] **Step 9: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx

  it('gives the focus to the panel Pregătire when the barem warning opens it', async () => {
```

Replace it with:

```tsx

  it('says in Corectare that the subject is not graded, with no retry, and opens the test file in Pregătire', async () => {
    const message = unsupportedMessage('istorie');
    const api = evaluationApi({
      status: 'evaluating',
      exerciseList: { status: 'failed', message },
      subject: { value: 'alta', name: 'istorie', by: 'robot' },
    });
    renderAdmin(`${PAGE}#corectare`, api);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText('Nu corectăm încă această materie.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Încearcă din nou' })).not.toBeInTheDocument();
    expect(screen.queryByText('Robotul nu a putut citi testul și baremul.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Înlocuiește testul' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
    expect(screen.getByLabelText('Înlocuiește testul')).toBeEnabled();
  });

  it('gives the focus to the panel Pregătire when the barem warning opens it', async () => {
```

- [ ] **Step 10: Edit `src/try/Working.test.tsx`**

Find this block:

```tsx
import { PDF_TYPE } from '../../shared/files.ts';
import { createFakeApi } from '../test/fakeApi.ts';
```

Replace it with:

```tsx
import { PDF_TYPE } from '../../shared/files.ts';
import { unsupportedMessage } from '../../shared/subjects.ts';
import { createFakeApi } from '../test/fakeApi.ts';
```

- [ ] **Step 11: Edit `src/try/Working.test.tsx`**

Find this block:

```tsx

  it('says the robot could not grade the paper', async () => {
```

Replace it with:

```tsx

  it('says that the subject of the test is not graded, and names the subjects that are', async () => {
    const message = unsupportedMessage('istorie');
    setup(
      { status: 'evaluating', files, exerciseList: { status: 'failed', message }, subject: { value: 'alta', name: 'istorie', by: 'robot' } },
      { status: 'submitted' },
    );
    expect(await screen.findByText('Nu corectăm încă materia acestui test.')).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText('Robotul nu a putut citi testul și baremul.')).not.toBeInTheDocument();
  });

  it('says the robot could not grade the paper', async () => {
```

- [ ] **Step 12: Run the new tests and see them fail**

Run: `npx vitest run server/routes/subjectDetection.test.ts shared/schemas.test.ts runner/tasks.test.ts runner/baremTask.test.ts src/admin/pages/TestPage.test.tsx src/try/Working.test.tsx`
Expected: FAIL. `Test Files  6 failed (6)`, `Tests  19 failed | 242 passed (261)`: `subjectOf is not a function`, the checked list has no `subject`, the API saves no subject (`expected { subject: null, … } to match object { subject: 'fizica', … }`), a test with `alta` still starts (`expected 200 to be 409`) and holds the demo place (`expected 403 to be 200`), Claude is not asked for the subject (`required` without `subject`), and the pages do not say "Nu corectăm încă …".

- [ ] **Step 13: Edit `shared/schemas.ts`**

Find this block:

```ts
import { formatPoints, gradeOf, round2 } from './scoring.ts';

```

Replace it with:

```ts
import { formatPoints, gradeOf, round2 } from './scoring.ts';
import { DETECTED_SUBJECTS, type DetectedSubject, MAX_SUBJECT_NAME } from './subjects.ts';

```

- [ ] **Step 14: Edit `shared/schemas.ts`**

Find this block:

```ts
export type ExerciseList = z.infer<typeof exerciseListSchema>;

```

Replace it with:

```ts
export type ExerciseList = z.infer<typeof exerciseListSchema>;

// The subject that the robot found, in the answer of the modes "exercise-list"
// and "barem" (spec: any subject). It is not part of the stored list or barem.
export const subjectAnswerSchema = z.object({
  subject: z.enum(DETECTED_SUBJECTS).describe('The value of the subject, or "alta" for a subject that is not in the list.'),
  subjectName: z.string().describe('For "alta", the Romanian name of the subject in lower case, for example "istorie". An empty string otherwise.'),
});

// What Claude answers in the mode "exercise-list".
export const exerciseListAnswerSchema = exerciseListSchema.extend(subjectAnswerSchema.shape);

export interface FoundSubject {
  value: DetectedSubject;
  // The name of an `alta` subject, cut to MAX_SUBJECT_NAME; "" otherwise.
  name: string;
}

// The subject in an answer, or null for an answer without one (an older robot).
export function subjectOf(raw: unknown): FoundSubject | null {
  const parsed = subjectAnswerSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { subject, subjectName } = parsed.data;
  return { value: subject, name: subject === 'alta' ? cutText(subjectName, MAX_SUBJECT_NAME) : '' };
}

```

- [ ] **Step 15: Edit `shared/schemas.ts`**

Find this block:

```ts
  message: string | null;
}
```

Replace it with:

```ts
  message: string | null;
  // The subject the robot found; null in an older robot's answer.
  subject: FoundSubject | null;
}
```

- [ ] **Step 16: Edit `shared/schemas.ts`**

Find this block:

```ts
  };
  const sum = round2(list.exercises.reduce((total, exercise) => total + exercise.maxPoints, list.officePoints));
```

Replace it with:

```ts
  };
  const subject = subjectOf(raw);
  const sum = round2(list.exercises.reduce((total, exercise) => total + exercise.maxPoints, list.officePoints));
```

- [ ] **Step 17: Edit `shared/schemas.ts`**

Find this block:

```ts
    const message = `Punctajele din barem dau ${formatPoints(sum)}, dar totalul este ${formatPoints(list.totalPoints)}.`;
    return { ok: true, value: { list, status: 'problem', message } };
  }
  return { ok: true, value: { list, status: 'ready', message: null } };
}
```

Replace it with:

```ts
    const message = `Punctajele din barem dau ${formatPoints(sum)}, dar totalul este ${formatPoints(list.totalPoints)}.`;
    return { ok: true, value: { list, status: 'problem', message, subject } };
  }
  return { ok: true, value: { list, status: 'ready', message: null, subject } };
}
```

- [ ] **Step 18: Edit `shared/schemas.ts`**

Find this block:

```ts
export type GeneratedBarem = z.infer<typeof generatedBaremSchema>;

```

Replace it with:

```ts
export type GeneratedBarem = z.infer<typeof generatedBaremSchema>;

// What Claude answers in the mode "barem".
export const generatedBaremAnswerSchema = generatedBaremSchema.extend(subjectAnswerSchema.shape);

```

- [ ] **Step 19: Edit `server/db/runner.ts`**

Find this block:

```ts
} from '../../shared/runner.ts';
import type { CheckedExerciseList, ClassAnalysis, ExerciseList, Grading } from '../../shared/schemas.ts';
import type { ExerciseListStatus } from '../../shared/tests.ts';
import { compareStudentNames } from '../../shared/students.ts';
import type { DetectedSubject } from '../../shared/subjects.ts';
import type { TestVariant } from '../../shared/files.ts';
```

Replace it with:

```ts
} from '../../shared/runner.ts';
import type { CheckedExerciseList, ClassAnalysis, ExerciseList, FoundSubject, Grading } from '../../shared/schemas.ts';
import type { ExerciseListStatus } from '../../shared/tests.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { type DetectedSubject, unsupportedMessage } from '../../shared/subjects.ts';
import type { TestVariant } from '../../shared/files.ts';
```

- [ ] **Step 20: Edit `server/db/runner.ts`**

Find this block:

```ts
// The list of the CES variant names its own files version.
const waitsForList = (variant: TestVariant) => {
  const c = columns(variant);
  return `id = ? AND ${c('files_version')} = ? AND (? IS NULL OR created_at = ?) AND status = 'evaluating' AND ${c('exercise_list_status')} = 'none' AND ${HOLDS_LEASE}`;
```

Replace it with:

```ts
// The list of the CES variant names its own files version.
// With `first`, the parameters are numbered from it (id, files version,
// creation time once, run id), for a statement that numbers its own.
const waitsForList = (variant: TestVariant, first?: number) => {
  const c = columns(variant);
  if (first !== undefined) {
    const [id, version, made, run] = [first, first + 1, first + 2, first + 3].map((n) => `?${n}`);
    return `id = ${id} AND ${c('files_version')} = ${version} AND (${made} IS NULL OR created_at = ${made}) AND status = 'evaluating'
      AND ${c('exercise_list_status')} = 'none' AND EXISTS (SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = ${run})`;
  }
  return `id = ? AND ${c('files_version')} = ? AND (? IS NULL OR created_at = ?) AND status = 'evaluating' AND ${c('exercise_list_status')} = 'none' AND ${HOLDS_LEASE}`;
```

- [ ] **Step 21: Edit `server/db/runner.ts`**

Find this block:

```ts

// Null when the list was not saved.
export async function saveExerciseList(
```

Replace it with:

```ts

// The robot may write the subject it found while the test has none, or has
// only the `alta` of an earlier look (the teacher then changed a file). A
// subject the teacher set is never overwritten.
export const SUBJECT_OPEN = "(subject IS NULL OR (subject = 'alta' AND subject_by = 'robot'))";

// The SET part that saves the subject `?1` (a value, or NULL for an older
// robot's answer) and its name `?2`, under SUBJECT_OPEN. SQLite reads every
// right side before it writes, so all of them see the old row.
const SAVE_SUBJECT = `subject = CASE WHEN ${SUBJECT_OPEN} AND ?1 IS NOT NULL THEN ?1 ELSE subject END,
  subject_name = CASE WHEN ${SUBJECT_OPEN} AND ?1 IS NOT NULL THEN ?2 ELSE subject_name END,
  subject_by = CASE WHEN ${SUBJECT_OPEN} AND ?1 IS NOT NULL THEN 'robot' ELSE subject_by END`;

// The test's subject after SAVE_SUBJECT is `alta`: nothing is graded.
const ENDS_UNSUPPORTED = `(CASE WHEN ${SUBJECT_OPEN} AND ?1 IS NOT NULL THEN ?1 ELSE subject END) = 'alta'`;

// Null when the list was not saved. The class list also saves the subject
// that the robot found: one that is not graded (`alta`) ends the list as
// failed, with the message that names it, so nothing is graded and a Quick
// Try gives its place back (the column's CHECK has no other state for it).
// The CES list leaves the subject alone.
export async function saveExerciseList(
```

- [ ] **Step 22: Edit `server/db/runner.ts`**

Find this block:

```ts
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('exercise_list_json')} = ?, ${c('exercise_list_status')} = ?, ${c('exercise_list_message')} = ?, updated_at = ?
       WHERE ${waitsForList(variant)}
       RETURNING ${c('exercise_list_status')} AS exercise_list_status, ${c('exercise_list_message')} AS exercise_list_message`,
    )
    .bind(JSON.stringify(checked.list), checked.status, checked.message, now, testId, filesVersion, createdAt, createdAt, runId)
    .first<{ exercise_list_status: ExerciseListStatus; exercise_list_message: string | null }>();
```

Replace it with:

```ts
  const c = columns(variant);
  const found = variant === 'class' ? checked.subject : null;
  const ending =
    variant === 'class'
      ? `${c('exercise_list_status')} = CASE WHEN ${ENDS_UNSUPPORTED} THEN 'failed' ELSE ?3 END,
         ${c('exercise_list_message')} = CASE WHEN ${ENDS_UNSUPPORTED} THEN ?4 ELSE ?5 END,
         ${SAVE_SUBJECT},`
      : `${c('exercise_list_status')} = ?3, ${c('exercise_list_message')} = ?5,`;
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('exercise_list_json')} = ?6, ${ending} updated_at = ?7
       WHERE ${waitsForList(variant, 8)}
       RETURNING ${c('exercise_list_status')} AS exercise_list_status, ${c('exercise_list_message')} AS exercise_list_message`,
    )
    .bind(
      found?.value ?? null,
      found?.name ?? '',
      checked.status,
      unsupportedMessage(found?.name ?? ''),
      checked.message,
      JSON.stringify(checked.list),
      now,
      testId,
      filesVersion,
      createdAt,
      runId,
    )
    .first<{ exercise_list_status: ExerciseListStatus; exercise_list_message: string | null }>();
```

- [ ] **Step 23: Edit `server/db/runner.ts`**

Find this block:

```ts
// files_version and clears the request).
const waitsForBarem = (variant: TestVariant) =>
  `tests.id = ? AND tests.${columns(variant)('files_version')} = ? AND (? IS NULL OR tests.created_at = ?) AND ${needsBaremSql(variant, 'tests')} AND ${HOLDS_LEASE}`;

// The new barem waits for the teacher's check (barem_unchecked), and the
// exercise list made from the old barem is cleared. Returns the key of the
// barem it replaced, or null when nothing was saved.
export async function saveGeneratedBarem(
```

Replace it with:

```ts
// files_version and clears the request).
// With `first`, the parameters are numbered from it, as in waitsForList.
const waitsForBarem = (variant: TestVariant, first?: number) => {
  if (first !== undefined) {
    const [id, version, made, run] = [first, first + 1, first + 2, first + 3].map((n) => `?${n}`);
    return `tests.id = ${id} AND tests.${columns(variant)('files_version')} = ${version} AND (${made} IS NULL OR tests.created_at = ${made})
      AND ${needsBaremSql(variant, 'tests')} AND EXISTS (SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = ${run})`;
  }
  return `tests.id = ? AND tests.${columns(variant)('files_version')} = ? AND (? IS NULL OR tests.created_at = ?) AND ${needsBaremSql(variant, 'tests')} AND ${HOLDS_LEASE}`;
};

// The new barem waits for the teacher's check (barem_unchecked), and the
// exercise list made from the old barem is cleared. The class barem also
// saves the subject that the robot found (`found`; null from an older robot),
// as the exercise list does; a Quick Try whose subject is not graded ends
// there, its list failed with the message, so the try gives its place back.
// Returns the key of the barem it replaced, or null when nothing was saved.
export async function saveGeneratedBarem(
```

- [ ] **Step 24: Edit `server/db/runner.ts`**

Find this block:

```ts
  variant: TestVariant = 'class',
): Promise<{ oldKey: string | null } | null> {
  const c = columns(variant);
  const [before, written] = await db.batch<{ barem_file_key?: string | null; id?: number }>([
```

Replace it with:

```ts
  variant: TestVariant = 'class',
  found: FoundSubject | null = null,
): Promise<{ oldKey: string | null } | null> {
  const c = columns(variant);
  const tryEnds = `quick_try = 1 AND ${ENDS_UNSUPPORTED}`;
  const list =
    variant === 'class'
      ? `exercise_list_status = CASE WHEN ${tryEnds} THEN 'failed' ELSE 'none' END, exercise_list_json = NULL,
           exercise_list_message = CASE WHEN ${tryEnds} THEN ?6 ELSE NULL END, exercise_list_attempts = 0, ${SAVE_SUBJECT},`
      : `${c('exercise_list_status')} = 'none', ${c('exercise_list_json')} = NULL, ${c('exercise_list_message')} = NULL, ${c('exercise_list_attempts')} = 0,`;
  const subject = variant === 'class' ? found : null;
  const [before, written] = await db.batch<{ barem_file_key?: string | null; id?: number }>([
```

- [ ] **Step 25: Edit `server/db/runner.ts`**

Find this block:

```ts
      .prepare(
        `UPDATE tests SET ${c('barem_file_key')} = ?, ${c('barem_file_name')} = ?, ${c('barem_file_type')} = ?, ${c('barem_unchecked')} = 1,
           ${c('barem_request')} = 'none', ${c('barem_request_attempts')} = 0, ${c('files_version')} = ${c('files_version')} + 1,
           ${c('exercise_list_status')} = 'none', ${c('exercise_list_json')} = NULL, ${c('exercise_list_message')} = NULL, ${c('exercise_list_attempts')} = 0,
           updated_at = ?
         WHERE ${waitsForBarem(variant)}
         RETURNING id`,
      )
      .bind(key, name, DOCX_TYPE, now, testId, filesVersion, createdAt, createdAt, runId),
  ]);
```

Replace it with:

```ts
      .prepare(
        `UPDATE tests SET ${c('barem_file_key')} = ?3, ${c('barem_file_name')} = ?4, ${c('barem_file_type')} = ?5, ${c('barem_unchecked')} = 1,
           ${c('barem_request')} = 'none', ${c('barem_request_attempts')} = 0, ${c('files_version')} = ${c('files_version')} + 1,
           ${list}
           updated_at = ?7
         WHERE ${waitsForBarem(variant, 8)}
         RETURNING id`,
      )
      .bind(subject?.value ?? null, subject?.name ?? '', key, name, DOCX_TYPE, unsupportedMessage(subject?.name ?? ''), now, testId, filesVersion, createdAt, runId),
  ]);
```

- [ ] **Step 26: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
export const BAREM_ACTIVE = baremActiveSql('class');

```

Replace it with:

```ts
export const BAREM_ACTIVE = baremActiveSql('class');

// Test t is not of a subject the robot does not grade: every path that moves an
// open test into evaluation checks it, like BAREM_ACTIVE. Null (not found yet)
// may start: the exercise list finds it.
export const SUBJECT_GRADED = "COALESCE(t.subject, '') <> 'alta'";

```

- [ ] **Step 27: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
// of `waiting`. The trigger submissions_count_paper (migration 0019) counts a
// paper when its result arrives, so these use the demo limit too.
export const papersWaitingSql = (teacherId: string, waiting = "x.status = 'evaluating'") =>
  `(SELECT COUNT(*) FROM submissions w JOIN tests x ON x.id = w.test_id
    WHERE x.teacher_id = ${teacherId} AND w.status IN ('submitted', 'grading') AND ${waiting})`;

```

Replace it with:

```ts
// of `waiting`. The trigger submissions_count_paper (migration 0019) counts a
// paper when its result arrives, so these use the demo limit too. The papers
// of a test whose subject is not graded wait for nothing and count for nothing.
export const papersWaitingSql = (teacherId: string, waiting = "x.status = 'evaluating'") =>
  `(SELECT COUNT(*) FROM submissions w JOIN tests x ON x.id = w.test_id
    WHERE x.teacher_id = ${teacherId} AND w.status IN ('submitted', 'grading') AND COALESCE(x.subject, '') <> 'alta' AND ${waiting})`;

```

- [ ] **Step 28: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
// a test whose evaluation started). A test that ended at once with nothing to
// grade does not use the place. The place stays used when the papers are reset
// (teachers.graded_test_id, set when a paper is first graded). A regrade or
```

Replace it with:

```ts
// a test whose evaluation started). A test that ended at once with nothing to
// grade does not use the place, nor does a test whose subject the robot does
// not grade (its papers were never graded). The place stays used when the papers are reset
// (teachers.graded_test_id, set when a paper is first graded). A regrade or
```

- [ ] **Step 29: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
    WHEN EXISTS (SELECT 1 FROM tests o JOIN submissions os ON os.test_id = o.id
      WHERE o.teacher_id = q.id AND o.id <> t.id AND o.evaluation_started_at IS NOT NULL
        AND os.status IN ('submitted', 'grading', 'graded', 'failed')) THEN 0
```

Replace it with:

```ts
    WHEN EXISTS (SELECT 1 FROM tests o JOIN submissions os ON os.test_id = o.id
      WHERE o.teacher_id = q.id AND o.id <> t.id AND o.evaluation_started_at IS NOT NULL AND COALESCE(o.subject, '') <> 'alta'
        AND os.status IN ('submitted', 'grading', 'graded', 'failed')) THEN 0
```

- [ ] **Step 30: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
// limit, or a barem that is not active, keeps the test open.
const DUE = `t.status = 'open' AND t.evaluation_at IS NOT NULL AND t.evaluation_at <= ?1 AND ${BAREM_ACTIVE} AND ${WITHIN_PAPER_LIMIT}`;

```

Replace it with:

```ts
// limit, or a barem that is not active, keeps the test open.
const DUE = `t.status = 'open' AND t.evaluation_at IS NOT NULL AND t.evaluation_at <= ?1 AND ${BAREM_ACTIVE} AND ${SUBJECT_GRADED} AND ${WITHIN_PAPER_LIMIT}`;

```

- [ ] **Step 31: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
    finishTests(db, now),
    // A due test that the demo account's one test keeps out has no schedule
    // left, so its students can upload again.
    db
```

Replace it with:

```ts
    finishTests(db, now),
    // A due test that the demo account's one test keeps out, or whose subject
    // the robot does not grade, has no schedule left, so its students can
    // upload again.
    db
```

- [ ] **Step 32: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
        `UPDATE tests AS t SET evaluation_at = NULL, updated_at = ?1
         WHERE t.status = 'open' AND t.evaluation_at IS NOT NULL AND t.evaluation_at <= ?1 AND NOT ${ONLY_TEST}`,
      )
```

Replace it with:

```ts
        `UPDATE tests AS t SET evaluation_at = NULL, updated_at = ?1
         WHERE t.status = 'open' AND t.evaluation_at IS NOT NULL AND t.evaluation_at <= ?1 AND (NOT ${ONLY_TEST} OR NOT ${SUBJECT_GRADED})`,
      )
```

- [ ] **Step 33: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
const READY = `t.id = ?1 AND t.teacher_id = ?2 AND t.status = 'open'
  AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE} AND ${WITHIN_PAPER_LIMIT}
  AND EXISTS (SELECT 1 FROM submissions s JOIN submission_files f ON f.submission_id = s.id WHERE s.test_id = t.id)`;
```

Replace it with:

```ts
const READY = `t.id = ?1 AND t.teacher_id = ?2 AND t.status = 'open'
  AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE} AND ${SUBJECT_GRADED} AND ${WITHIN_PAPER_LIMIT}
  AND EXISTS (SELECT 1 FROM submissions s JOIN submission_files f ON f.submission_id = s.id WHERE s.test_id = t.id)`;
```

- [ ] **Step 34: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
  const READY_SELECTED = `t.id = ?1 AND t.teacher_id = ?2 AND t.status = 'open'
    AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE} AND ${WITHIN_PAPER_LIMIT}
    AND EXISTS (SELECT 1 FROM submissions s JOIN submission_files f ON f.submission_id = s.id
```

Replace it with:

```ts
  const READY_SELECTED = `t.id = ?1 AND t.teacher_id = ?2 AND t.status = 'open'
    AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE} AND ${SUBJECT_GRADED} AND ${WITHIN_PAPER_LIMIT}
    AND EXISTS (SELECT 1 FROM submissions s JOIN submission_files f ON f.submission_id = s.id
```

- [ ] **Step 35: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
  const OPEN_WITH_FILES = `t.id = ?1 AND t.teacher_id = ?2 AND t.status = 'open'
    AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE} AND ${WITHIN_PAPER_LIMIT}`;
  const TO_SEND = papersToSend(OPEN_WITH_FILES, `s.id IN (${placeholders})`);
```

Replace it with:

```ts
  const OPEN_WITH_FILES = `t.id = ?1 AND t.teacher_id = ?2 AND t.status = 'open'
    AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE} AND ${SUBJECT_GRADED} AND ${WITHIN_PAPER_LIMIT}`;
  const TO_SEND = papersToSend(OPEN_WITH_FILES, `s.id IN (${placeholders})`);
```

- [ ] **Step 36: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
      `UPDATE tests AS t SET evaluation_at = ?, updated_at = ?
       WHERE t.id = ? AND t.teacher_id = ? AND t.status = 'open' AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE}
         AND ${WITHIN_PAPER_LIMIT} AND NOT ${SCHEDULED_ELSEWHERE}
```

Replace it with:

```ts
      `UPDATE tests AS t SET evaluation_at = ?, updated_at = ?
       WHERE t.id = ? AND t.teacher_id = ? AND t.status = 'open' AND t.test_file_key IS NOT NULL AND ${BAREM_ACTIVE} AND ${SUBJECT_GRADED}
         AND ${WITHIN_PAPER_LIMIT} AND NOT ${SCHEDULED_ELSEWHERE}
```

- [ ] **Step 37: Edit `server/db/tests.ts`**

Find this block:

```ts
// The SET part that forgets a subject the robot found; the teacher's stays.
// SQLite reads every right side before it writes, so the three see the old row.
const SUBJECT_FROM_ROBOT_CLEARED = `subject = CASE WHEN subject_by = 'robot' THEN NULL ELSE subject END,
           subject_name = CASE WHEN subject_by = 'robot' THEN '' ELSE subject_name END,
           subject_by = CASE WHEN subject_by = 'robot' THEN NULL ELSE subject_by END, `;

```

Replace it with:

```ts
// The SET part that forgets a subject the robot found; the teacher's stays.
// A list that failed because the subject is not graded (`alta`) waits again,
// so the robot reads the new file. SQLite reads every right side before it
// writes, so all of them see the old row.
const ENDED_UNSUPPORTED = "exercise_list_status = 'failed' AND subject = 'alta'";
const SUBJECT_FROM_ROBOT_CLEARED = `subject = CASE WHEN subject_by = 'robot' THEN NULL ELSE subject END,
           subject_name = CASE WHEN subject_by = 'robot' THEN '' ELSE subject_name END,
           subject_by = CASE WHEN subject_by = 'robot' THEN NULL ELSE subject_by END,
           exercise_list_json = CASE WHEN ${ENDED_UNSUPPORTED} THEN NULL ELSE exercise_list_json END,
           exercise_list_message = CASE WHEN ${ENDED_UNSUPPORTED} THEN NULL ELSE exercise_list_message END,
           exercise_list_attempts = CASE WHEN ${ENDED_UNSUPPORTED} THEN 0 ELSE exercise_list_attempts END,
           exercise_list_status = CASE WHEN ${ENDED_UNSUPPORTED} THEN 'none' ELSE exercise_list_status END, `;

```

- [ ] **Step 38: Edit `server/routes/runner.ts`**

Find this block:

```ts
} from '../../shared/runner.ts';
import { checkClassAnalysis, checkExerciseList, checkGrading } from '../../shared/schemas.ts';
import { robotAuth } from '../auth/robotAuth.ts';
```

Replace it with:

```ts
} from '../../shared/runner.ts';
import { checkClassAnalysis, checkExerciseList, checkGrading, type FoundSubject, subjectOf } from '../../shared/schemas.ts';
import { robotAuth } from '../auth/robotAuth.ts';
```

- [ ] **Step 39: Edit `server/routes/runner.ts`**

Find this block:

```ts
  throw notFound();
}
```

Replace it with:

```ts
  throw notFound();
}

// The subject that the robot sends with a generated barem: X-Subject (a value)
// and X-Subject-Name (URI-encoded). Null when there is none (an older robot) or
// it cannot be read: the barem is still saved.
function subjectHeaders(c: Context<AppEnv>): FoundSubject | null {
  let name = '';
  try {
    name = decodeURIComponent(c.req.header('X-Subject-Name') ?? '');
  } catch {
    return null;
  }
  return subjectOf({ subject: c.req.header('X-Subject'), subjectName: name });
}
```

- [ ] **Step 40: Edit `server/routes/runner.ts`**

Find this block:

```ts
    const name = variant === 'ces' ? `${found.code} - barem CES generat.docx` : `${found.code} - barem generat.docx`;
    const saved = await saveGeneratedBarem(c.env.DB, testId, runId.data, version, createdAt, key, name, nowIso(), variant);
    if (!saved) {
```

Replace it with:

```ts
    const name = variant === 'ces' ? `${found.code} - barem CES generat.docx` : `${found.code} - barem generat.docx`;
    const saved = await saveGeneratedBarem(c.env.DB, testId, runId.data, version, createdAt, key, name, nowIso(), variant, subjectHeaders(c));
    if (!saved) {
```

- [ ] **Step 41: Edit `server/routes/tests.ts`**

Find this block:

```ts
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';
import { MAX_SCHEDULE_DAYS } from '../../shared/tests.ts';
```

Replace it with:

```ts
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';
import { unsupportedMessage } from '../../shared/subjects.ts';
import { MAX_SCHEDULE_DAYS } from '../../shared/tests.ts';
```

- [ ] **Step 42: Edit `server/routes/tests.ts`**

Find this block:

```ts
  if (test.barem.unchecked) return new ApiError(409, 'barem_unchecked', 'Verifică baremul generat înainte de evaluare.');
  if (await blockedByDemoLimit(db, test.id, scheduling)) return demoLimit();
```

Replace it with:

```ts
  if (test.barem.unchecked) return new ApiError(409, 'barem_unchecked', 'Verifică baremul generat înainte de evaluare.');
  if (test.subject?.value === 'alta') return new ApiError(409, 'subject_unsupported', unsupportedMessage(test.subject.name));
  if (await blockedByDemoLimit(db, test.id, scheduling)) return demoLimit();
```

- [ ] **Step 43: Edit `server/routes/tests.ts`**

Find this block:

```ts
    // While the robot grades, it reads both files. It reads neither while the
    // exercise list has a problem or failed: the teacher may then fix the barem.
    const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
```

Replace it with:

```ts
    // While the robot grades, it reads both files. It reads neither while the
    // exercise list has a problem or failed (also for a subject that is not
    // graded): the teacher may then fix the barem or the test.
    const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
```

- [ ] **Step 44: Edit `server/routes/tests.ts`**

Find this block:

```ts
    if (kind === 'barem') robotWork = saved?.status === 'evaluating';
    else robotWork = (await needsPrint(c.env.DB, test.id)) || (await needsBarem(c.env.DB, test.id));
```

Replace it with:

```ts
    if (kind === 'barem') robotWork = saved?.status === 'evaluating';
    // A new test file of a test whose subject was not graded is read again (saveTestFile resets its list).
    else if (saved?.status === 'evaluating' && test.subject?.value === 'alta' && test.exerciseList.status === 'failed') robotWork = true;
    else robotWork = (await needsPrint(c.env.DB, test.id)) || (await needsBarem(c.env.DB, test.id));
```

- [ ] **Step 45: Edit `runner/api.ts`**

Find this block:

```ts
} from '../shared/runner.ts';

```

Replace it with:

```ts
} from '../shared/runner.ts';
import type { FoundSubject } from '../shared/schemas.ts';

```

- [ ] **Step 46: Edit `runner/api.ts`**

Find this block:

```ts
  // The barem as a Word file, written from the test file of `filesVersion`.
  sendBarem(testId: number, runId: string, filesVersion: number, docx: Uint8Array, createdAt?: string, variant?: TestVariant): Promise<void>;
  // "failed": the last attempt failed. "none": the barem waits for another try.
```

Replace it with:

```ts
  // The barem as a Word file, written from the test file of `filesVersion`.
  // `subject`: what Claude found, sent as X-Subject and X-Subject-Name (URI-encoded: a header holds no ș).
  sendBarem(
    testId: number,
    runId: string,
    filesVersion: number,
    docx: Uint8Array,
    createdAt?: string,
    variant?: TestVariant,
    subject?: FoundSubject | null,
  ): Promise<void>;
  // "failed": the last attempt failed. "none": the barem waits for another try.
```

- [ ] **Step 47: Edit `runner/api.ts`**

Find this block:

```ts
    baremClassBarem: (testId) => bytes(`/tests/${testId}/barem-job/class-barem`),
    sendBarem: (testId, runId, filesVersion, docx, createdAt, variant) =>
      send(
```

Replace it with:

```ts
    baremClassBarem: (testId) => bytes(`/tests/${testId}/barem-job/class-barem`),
    sendBarem: (testId, runId, filesVersion, docx, createdAt, variant, subject) =>
      send(
```

- [ ] **Step 48: Edit `runner/api.ts`**

Find this block:

```ts
          'Content-Type': DOCX_TYPE,
          'X-Run-Id': runId,
          'X-Files-Version': String(filesVersion),
          ...(createdAt ? { 'X-Created-At': createdAt } : {}),
        }),
        nothing,
      ),
    sendBaremFailed: async (testId, body, variant) =>
```

Replace it with:

```ts
          'Content-Type': DOCX_TYPE,
          'X-Run-Id': runId,
          'X-Files-Version': String(filesVersion),
          ...(createdAt ? { 'X-Created-At': createdAt } : {}),
          ...(subject ? { 'X-Subject': subject.value, 'X-Subject-Name': encodeURIComponent(subject.name) } : {}),
        }),
        nothing,
      ),
    sendBaremFailed: async (testId, body, variant) =>
```

- [ ] **Step 49: Edit `runner/tasks.ts`**

Find this block:

```ts
  classAnalysisSchema,
  exerciseListSchema,
  generatedBaremSchema,
  gradingResultSchema,
```

Replace it with:

```ts
  classAnalysisSchema,
  exerciseListAnswerSchema,
  generatedBaremAnswerSchema,
  gradingResultSchema,
```

- [ ] **Step 50: Edit `runner/tasks.ts`**

Find this block:

```ts

const JSON_SCHEMAS: Record<ClaudeMode, object> = {
  'exercise-list': claudeJsonSchema(exerciseListSchema),
  grade: claudeJsonSchema(gradingResultSchema),
  'class-report': claudeJsonSchema(classAnalysisSchema),
  barem: claudeJsonSchema(generatedBaremSchema),
};
```

Replace it with:

```ts

// The modes "exercise-list" and "barem" also name the subject they found.
const JSON_SCHEMAS: Record<ClaudeMode, object> = {
  'exercise-list': claudeJsonSchema(exerciseListAnswerSchema),
  grade: claudeJsonSchema(gradingResultSchema),
  'class-report': claudeJsonSchema(classAnalysisSchema),
  barem: claudeJsonSchema(generatedBaremAnswerSchema),
};
```

- [ ] **Step 51: Edit `runner/baremTask.ts`**

Find this block:

```ts
import type { RobotError } from '../shared/runner.ts';
import { checkGeneratedBarem } from '../shared/schemas.ts';
import { RobotApiError } from './api.ts';
```

Replace it with:

```ts
import type { RobotError } from '../shared/runner.ts';
import { checkGeneratedBarem, subjectOf } from '../shared/schemas.ts';
import { RobotApiError } from './api.ts';
```

- [ ] **Step 52: Edit `runner/baremTask.ts`**

Find this block:

```ts
      try {
        await ctx.api.sendBarem(testId, ctx.runId, job.filesVersion, docx, job.createdAt, variant);
        return 'saved';
```

Replace it with:

```ts
      try {
        await ctx.api.sendBarem(testId, ctx.runId, job.filesVersion, docx, job.createdAt, variant, subjectOf(outcome.output));
        return 'saved';
```

- [ ] **Step 53: Edit `runner/trySkill.ts`**

Find this block:

```ts
import type { ExerciseList } from '../shared/schemas.ts';
import { checkExerciseList, checkGeneratedBarem, checkGrading, claudeJsonSchema, exerciseListSchema, generatedBaremSchema, gradingResultSchema } from '../shared/schemas.ts';
import type { ClaudeOutcome, ClaudeRunner } from './claude.ts';
```

Replace it with:

```ts
import type { ExerciseList } from '../shared/schemas.ts';
import { checkExerciseList, checkGeneratedBarem, checkGrading, claudeJsonSchema, exerciseListAnswerSchema, generatedBaremAnswerSchema, gradingResultSchema } from '../shared/schemas.ts';
import type { ClaudeOutcome, ClaudeRunner } from './claude.ts';
```

- [ ] **Step 54: Edit `runner/trySkill.ts`**

Find this block:

```ts
    }
    const jsonSchema = claudeJsonSchema(mode === 'grade' ? gradingResultSchema : mode === 'barem' ? generatedBaremSchema : exerciseListSchema);
    print(`Claude lucrează (${mode})…`);
```

Replace it with:

```ts
    }
    const jsonSchema = claudeJsonSchema(mode === 'grade' ? gradingResultSchema : mode === 'barem' ? generatedBaremAnswerSchema : exerciseListAnswerSchema);
    print(`Claude lucrează (${mode})…`);
```

- [ ] **Step 55: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
// exercises (spec §9). Shown only when that list needs the teacher: its
// points do not add up, or the robot could not make it. It shows in the panel
// Corectare; the barem is replaced in the panel Pregătire. With `variant`
```

Replace it with:

```tsx
// exercises (spec §9). Shown only when that list needs the teacher: its
// points do not add up, or the robot could not make it. A list that failed
// because the test's subject is one the robot does not grade (`alta`) says so
// and offers no retry (only the class list: a CES test has its class test's
// subject). It shows in the panel
// Corectare; the barem is replaced in the panel Pregătire. With `variant`
```

- [ ] **Step 56: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
  }
  if (status === 'failed') {
```

Replace it with:

```tsx
  }
  if (status === 'failed' && !ces && test.subject?.value === 'alta') {
    return (
      <div className="warning">
        <p>
          <strong>Nu corectăm încă această materie.</strong> {message}
        </p>
        <p>Dacă ai încărcat alt test din greșeală, înlocuiește testul la Pregătire: lucrările se corectează apoi cu testul nou.</p>
        <MoveOnLink className="button-quiet button-small" stage="Pregătire">
          Înlocuiește testul
        </MoveOnLink>
      </div>
    );
  }
  if (status === 'failed') {
```

- [ ] **Step 57: Edit `src/try/Working.tsx`**

Find this block:

```tsx
  const { test } = detail;
  const what =
    test.barem.request === 'failed'
      ? 'Robotul nu a putut face baremul din test.'
      : test.exerciseList.status === 'failed'
        ? 'Robotul nu a putut citi testul și baremul.'
        : 'Robotul nu a putut corecta lucrarea.';
  const detailText = test.exerciseList.status === 'failed' ? test.exerciseList.message : null;
```

Replace it with:

```tsx
  const { test } = detail;
  // A subject the robot does not grade ends the try with the list's message.
  const what =
    test.subject?.value === 'alta'
      ? 'Nu corectăm încă materia acestui test.'
      : test.barem.request === 'failed'
        ? 'Robotul nu a putut face baremul din test.'
        : test.exerciseList.status === 'failed'
          ? 'Robotul nu a putut citi testul și baremul.'
          : 'Robotul nu a putut corecta lucrarea.';
  const detailText = test.exerciseList.status === 'failed' ? test.exerciseList.message : null;
```

- [ ] **Step 58: Edit `runner/AGENTS.md`**

Find this block:

```markdown
- The CES variant: the print, the barem, the exercise list and the grading take a `variant`; "ces" asks the API with `?variant=ces` and puts `ces.md` in the work folder (`CES_NOTE`), and the CES barem and list jobs also get `class/exercises.json` (and `class/barem.*` for a barem), so the CES list reuses the class exercise ids. A claim names the paper's variant. Each kind of CES work is tried by the same rules as the class work, after it, in the same round.
- The subject (`shared/subjects.ts`): the robot gets the test's `subject` with the test, a barem job and the class results, and writes it to `subject.md` in the work folder (`makeWorkFolder`). A grading and a class analysis of a test with none get `matematica`; an exercise list or a barem with none (or with `alta`) gets no `subject.md`, and Claude finds the subject.
- `printTask.ts` makes the print PDF through the Docker image in `print/`. The image pins LibreOffice and installs only Liberation, Carlito, and Caladea fonts: other fonts (Noto, DejaVu) change "∖" into "∣" and move the layout. `QE_PRINT_IMAGE_TESTS=1` runs the container tests (`print/container.test.ts`, slow the first time). Never log the upload token or a script's output.
```

Replace it with:

```markdown
- The CES variant: the print, the barem, the exercise list and the grading take a `variant`; "ces" asks the API with `?variant=ces` and puts `ces.md` in the work folder (`CES_NOTE`), and the CES barem and list jobs also get `class/exercises.json` (and `class/barem.*` for a barem), so the CES list reuses the class exercise ids. A claim names the paper's variant. Each kind of CES work is tried by the same rules as the class work, after it, in the same round.
- The subject (`shared/subjects.ts`): the robot gets the test's `subject` with the test, a barem job and the class results, and writes it to `subject.md` in the work folder (`makeWorkFolder`). A grading and a class analysis of a test with none get `matematica`; an exercise list or a barem with none (or with `alta`) gets no `subject.md`, and Claude finds the subject. Claude answers those two modes with `subject` and `subjectName` (`exerciseListAnswerSchema`, `generatedBaremAnswerSchema`); the list sends them in its body, the barem in `X-Subject` and `X-Subject-Name` (`subjectOf`).
- `printTask.ts` makes the print PDF through the Docker image in `print/`. The image pins LibreOffice and installs only Liberation, Carlito, and Caladea fonts: other fonts (Noto, DejaVu) change "∖" into "∣" and move the layout. `QE_PRINT_IMAGE_TESTS=1` runs the container tests (`print/container.test.ts`, slow the first time). Never log the upload token or a script's output.
```

- [ ] **Step 59: Edit `server/AGENTS.md`**

Find this block:

```markdown
- The subject of a test (migration 0028: `tests.subject`, `subject_name`, `subject_by`; `shared/subjects.ts`): null until the robot finds it or the teacher sets it; every test made before the migration is `matematica`, set by the teacher. `TestInfo.subject` shows it; `findRobotTest`, `findBaremJob` and `findClassResults` give it to the robot. A new class test file forgets a subject the robot found, in the UPDATE of `saveTestFile`, never one the teacher set.
- A test gets its `upload_token` in its INSERT (`createTest`), so a draft has its print PDF; Start test keeps it (`COALESCE`, for a draft made before that). A draft made before that gets one at Start, with a new test file (`saveTestFile`), or with "Pregătește testul cu cod QR" (`retryPrint`). Stop test (`stopTest`: open → draft, clears `started_at` and `evaluation_at`) checks in its SQL that the test was never evaluated (`evaluation_started_at IS NULL`) and that no upload of the test has a file or is past `uploading` (`NO_STUDENT_FILES`); a student file that lands at the same moment checks the open test in its own SQL (`OPEN_UPLOAD`), so one of the two is refused. Student writes on a draft answer 409 `not_started`.
```

Replace it with:

```markdown
- The subject of a test (migration 0028: `tests.subject`, `subject_name`, `subject_by`; `shared/subjects.ts`): null until the robot finds it or the teacher sets it; every test made before the migration is `matematica`, set by the teacher. `TestInfo.subject` shows it; `findRobotTest`, `findBaremJob` and `findClassResults` give it to the robot. A new class test file forgets a subject the robot found, in the UPDATE of `saveTestFile`, never one the teacher set.
- The robot's subject: the class exercise list (`saveExerciseList`) and a generated class barem (`saveGeneratedBarem`, from the headers `X-Subject` and `X-Subject-Name`) save the subject it found in their own UPDATE, only while the test has none or only the robot's `alta` (`SUBJECT_OPEN`); an older robot's answer saves none. A subject the robot does not grade (`alta`) ends the class list as `failed` with `unsupportedMessage()` (the column's CHECK has no other state, and a Quick Try then gives its place back); a Quick Try's generated barem with `alta` ends its list the same way. `SUBJECT_GRADED` (`db/lifecycle.ts`) is in the SQL of every path that moves an open test into evaluation, beside `BAREM_ACTIVE`, and `evaluationBlocker` answers 409 `subject_unsupported`; a due test with `alta` loses its schedule. A test with `alta` does not hold a demo account's one test (`ONLY_TEST`), and its papers do not count among those on their way to the robot (`papersWaitingSql`). A new class test file of a test whose list failed with `alta` resets the list in the same UPDATE, and the route starts the robot.
- A test gets its `upload_token` in its INSERT (`createTest`), so a draft has its print PDF; Start test keeps it (`COALESCE`, for a draft made before that). A draft made before that gets one at Start, with a new test file (`saveTestFile`), or with "Pregătește testul cu cod QR" (`retryPrint`). Stop test (`stopTest`: open → draft, clears `started_at` and `evaluation_at`) checks in its SQL that the test was never evaluated (`evaluation_started_at IS NULL`) and that no upload of the test has a file or is past `uploading` (`NO_STUDENT_FILES`); a student file that lands at the same moment checks the open test in its own SQL (`OPEN_UPLOAD`), so one of the two is refused. Student writes on a draft answer 409 `not_started`.
```

- [ ] **Step 60: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  173 passed | 1 skipped (174)`, `Tests  2569 passed | 3 skipped (2572)`.

- [ ] **Step 61: Commit**

```bash
git add server/routes/subjectDetection.test.ts shared/schemas.ts shared/schemas.test.ts server/db/runner.ts server/db/lifecycle.ts server/db/tests.ts server/routes/runner.ts server/routes/tests.ts runner/api.ts runner/tasks.ts runner/tasks.test.ts runner/baremTask.ts runner/baremTask.test.ts runner/trySkill.ts src/admin/testPage/ExerciseListBanner.tsx src/admin/pages/TestPage.test.tsx src/try/Working.tsx src/try/Working.test.tsx runner/AGENTS.md server/AGENTS.md
git commit -m "Let the robot find the subject, and stop a test of a subject it does not grade"
```

### Task 3: The skill grades each subject by its own rules

`SKILL.md` gets the subject section; one rules file per subject in `references/subjects/`; medium confidence is flagged in every subject but math; `try:skill` keeps the subject in `subject.md`; the PDF draws the chemistry arrows as text; a generated barem takes 60 items in one subject; `expectNoGradingWords()` knows the English words.

**Files:**
- Create: `.claude/skills/evaluate-test/references/subjects/matematica.md`, `fizica.md`, `chimie.md`, `biologie.md`, `stiinte.md`, `romana.md`, `engleza.md` (same folder)
- Modify: `.claude/skills/evaluate-test/SKILL.md`, `shared/schemas.ts`, `server/db/runner.ts`, `server/routes/runner.ts`, `runner/tasks.ts`, `runner/trySkill.ts`, `src/admin/pdf/pdfSymbols.ts`, `src/test/gradingWords.ts`, `runner/AGENTS.md`
- Test: `runner/skill.test.ts`, `shared/schemas.test.ts`, `server/routes/runnerGrading.test.ts`, `runner/trySkill.test.ts`, `src/admin/pdf/pdf.test.ts`, `src/test/gradingWords.test.ts`

**Interfaces:**
- Consumes: Task 1's `SUBJECTS`, `DetectedSubject`, `isDetectedSubject`; Task 2's `subjectAnswerSchema`.
- Produces: `checkGrading(raw, list, subject: DetectedSubject | null = null)`; `findGrading(…).subject`; `MAX_BAREM_ITEMS` 60.

- [ ] **Step 1: Edit `runner/skill.test.ts`**

Find this block:

```ts
import { describe, expect, it } from 'vitest';
import { answerAreaSchema, classAnalysisSchema, exerciseListSchema, generatedBaremSchema, gradingResultSchema } from '../shared/schemas.ts';
import { SKILL_DIR } from './workdir.ts';
```

Replace it with:

```ts
import { describe, expect, it } from 'vitest';
import { answerAreaSchema, classAnalysisSchema, exerciseListSchema, generatedBaremSchema, gradingResultSchema, subjectAnswerSchema } from '../shared/schemas.ts';
import { SUBJECTS } from '../shared/subjects.ts';
import { SKILL_DIR } from './workdir.ts';
```

- [ ] **Step 2: Edit `runner/skill.test.ts`**

Find this block:

```ts

  it('names the barem mode and its references', () => {
```

Replace it with:

```ts

  it('names every subject, its rules file, and the subject fields of both answers', () => {
    for (const subject of [...SUBJECTS, 'alta']) expect(skill).toContain(`\`${subject}\``);
    for (const subject of SUBJECTS) {
      expect(existsSync(path.join(SKILL_DIR, 'references', 'subjects', `${subject}.md`)), subject).toBe(true);
    }
    expect(skill).toContain('`subject.md`');
    expect(skill).toContain('`references/subjects/<value>.md`');
    for (const field of Object.keys(subjectAnswerSchema.shape)) expect(skill).toContain(`\`${field}\``);
  });

  it('keeps the math rules as they were, and the English texts for the student in English', () => {
    const math = readFileSync(path.join(SKILL_DIR, 'references', 'subjects', 'matematica.md'), 'utf8');
    expect(math).toContain('Follow them exactly as they are');
    const english = readFileSync(path.join(SKILL_DIR, 'references', 'subjects', 'engleza.md'), 'utf8');
    expect(english).toContain('The texts that the student reads are in English');
    expect(english).toContain('never a word about how the work was graded');
  });

  it('names the barem mode and its references', () => {
```

- [ ] **Step 3: Edit `shared/schemas.test.ts`**

Find this block:

```ts
    expect(checkGeneratedBarem({ ...sample, total: 70, officePoints: 0, parts: [{ title: '', sections: manySections }] }).ok).toBe(false);
    const manyItems = { title: 'I', points: 31, items: Array.from({ length: 31 }, () => ({ label: '1.', steps: [{ text: 'x', points: 1 }] })) };
    expect(checkGeneratedBarem({ ...sample, total: 31, officePoints: 0, parts: [{ title: '', sections: [manyItems] }] }).ok).toBe(false);
    const manySteps = section('I', 13, Array.from({ length: 13 }, () => 1));
```

Replace it with:

```ts
    expect(checkGeneratedBarem({ ...sample, total: 70, officePoints: 0, parts: [{ title: '', sections: manySections }] }).ok).toBe(false);
    const manyItems = { title: 'I', points: 61, items: Array.from({ length: 61 }, () => ({ label: '1.', steps: [{ text: 'x', points: 1 }] })) };
    expect(checkGeneratedBarem({ ...sample, total: 61, officePoints: 0, parts: [{ title: '', sections: [manyItems] }] }).ok).toBe(false);
    const manySteps = section('I', 13, Array.from({ length: 13 }, () => 1));
```

- [ ] **Step 4: Edit `shared/schemas.test.ts`**

Find this block:

```ts
    }
  });
});
```

Replace it with:

```ts
    }
  });
});

describe('the confidence flag by subject', () => {
  const medium = () => grading([item('I.1', 4, { confidence: 'medium' }), item('I.2', 2), item('II.1', 2)]);

  it('flags medium confidence in a subject other than math, with the reason', () => {
    for (const subject of ['fizica', 'romana', 'engleza'] as const) {
      const checked = checkGrading(medium(), LIST, subject);
      if (!checked.ok) throw new Error(checked.reason);
      expect(checked.value.items[0]).toMatchObject({ needsReview: true, reviewReason: LOW_CONFIDENCE });
      expect(checked.value.items[1]!.needsReview).toBe(false);
    }
  });

  it('keeps math as it was: medium confidence is not flagged, with or without a subject', () => {
    for (const subject of ['matematica', null] as const) {
      const checked = checkGrading(medium(), LIST, subject);
      if (!checked.ok) throw new Error(checked.reason);
      expect(checked.value.items[0]!.needsReview).toBe(false);
    }
  });
});

describe('the generated barem of a language test', () => {
  it('takes up to 60 items in one subject', () => {
    const items = (count: number) => Array.from({ length: count }, (_, index) => ({ label: `${index + 1}.`, steps: [{ text: 'Răspuns', points: 1 }] }));
    const barem = (count: number) => ({
      title: 'Test de evaluare – Limba engleză',
      subtitle: 'Limba engleză – clasa a VIII-a',
      notes: [],
      total: count + 10,
      officePoints: 10,
      parts: [{ title: '', sections: [{ title: 'SUBIECTUL I', points: count, items: items(count) }] }],
    });
    expect(checkGeneratedBarem(barem(60)).ok).toBe(true);
    expect(checkGeneratedBarem(barem(61))).toEqual({ ok: false, reason: 'needs 1 to 60 items in a section' });
  });
});
```

- [ ] **Step 5: Edit `server/routes/runnerGrading.test.ts`**

Find this block:

```ts
    }
  });
});
```

Replace it with:

```ts
    }
  });
});

describe('the confidence flag of a subject other than math', () => {
  const medium = () => {
    const graded = result([4.5, 4.5]);
    graded.items[0]!.confidence = 'medium';
    graded.items[1]!.confidence = 'high';
    return graded;
  };
  const flags = async (id: number) =>
    (
      await api.db
        .prepare('SELECT i.exercise_id, i.needs_review FROM evaluation_items i JOIN evaluations ev ON ev.id = i.evaluation_id WHERE ev.submission_id = ? ORDER BY i.position')
        .bind(id)
        .all<{ exercise_id: string; needs_review: number }>()
    ).results;

  it('flags an item of medium confidence in a physics test', async () => {
    await api.db.prepare("UPDATE tests SET subject = 'fizica', subject_by = 'robot' WHERE id = ?").bind(testId).run();
    const id = await upload(0, '2026-10-06T08:30:00.000Z');
    await claim();
    expect((await sendResult(id, { ok: true, result: medium(), model: 'm' })).status).toBe(200);
    expect(await flags(id)).toEqual([
      { exercise_id: 'I.1', needs_review: 1 },
      { exercise_id: 'II.1', needs_review: 0 },
    ]);
  });

  it('leaves it to the robot in a math test, and in a test with no subject', async () => {
    const id = await upload(0, '2026-10-06T08:30:00.000Z');
    await claim();
    expect((await sendResult(id, { ok: true, result: medium(), model: 'm' })).status).toBe(200);
    expect((await flags(id)).map((row) => row.needs_review)).toEqual([0, 0]);
  });
});
```

- [ ] **Step 6: Edit `runner/trySkill.test.ts`**

Find this block:

```ts

  it('says when the points do not add up', async () => {
```

Replace it with:

```ts

  it('keeps the subject that Claude found in subject.md, and gives a known one to Claude', async () => {
    expect(await run('exercise-list', scriptedClaude(answer({ ...LIST, subject: 'fizica', subjectName: '' })))).toBe(0);
    expect(readFileSync(path.join(folder, 'subject.md'), 'utf8')).toBe('fizica\n');
    expect(lines).toContain('Materia: fizica.');
    let given = '';
    const again = scriptedClaude((task) => {
      given = readFileSync(path.join(task.cwd, 'subject.md'), 'utf8');
      return answer({ ...LIST, subject: 'chimie', subjectName: '' });
    });
    expect(await run('exercise-list', again)).toBe(0);
    expect(given).toBe('fizica\n');
    expect(readFileSync(path.join(folder, 'subject.md'), 'utf8')).toBe('fizica\n');
  });

  it('says when Claude found a subject that the robot does not grade', async () => {
    expect(await run('exercise-list', scriptedClaude(answer({ ...LIST, subject: 'alta', subjectName: 'istorie' })))).toBe(0);
    expect(lines).toContain('Materia: alta (istorie). Robotul nu o corectează.');
  });

  it('says when the points do not add up', async () => {
```

- [ ] **Step 7: Edit `runner/trySkill.test.ts`**

Find this block:

```ts
    expect(lines).toContain('II.1: 2 din 4,5 (de verificat: Scris neclar.)');
  });
```

Replace it with:

```ts
    expect(lines).toContain('II.1: 2 din 4,5 (de verificat: Scris neclar.)');
  });

  it('grades with the subject of subject.md, or as math without one', async () => {
    const medium = { ...GRADING, items: [{ ...GRADING.items[0]!, confidence: 'medium' as const }, GRADING.items[1]!] };
    let subject = '';
    const claude = scriptedClaude((task) => {
      subject = readFileSync(path.join(task.cwd, 'subject.md'), 'utf8');
      return answer(medium);
    });
    expect(await run('grade', claude)).toBe(0);
    expect(subject).toBe('matematica\n');
    expect(lines).toContain('I.1: 4,5 din 4,5');
    writeFileSync(path.join(folder, 'subject.md'), 'fizica\n');
    expect(await run('grade', scriptedClaude(answer(medium)))).toBe(0);
    expect(lines).toContain('I.1: 4,5 din 4,5 (de verificat: Robotul nu este sigur de acest punctaj.)');
  });
```

- [ ] **Step 8: Edit `src/admin/pdf/pdf.test.ts`**

Find this block:

```ts
describe('pdfText', () => {
  const LACKING = '∈∉ℝℕℤℚ⇒⇔→∠⊥∪∩∥⊂∅∡';

```

Replace it with:

```ts
describe('pdfText', () => {
  const LACKING = '∈∉ℝℕℤℚ⇒⇔→∠⊥∪∩∥⊂∅∡⇌↑↓';

```

- [ ] **Step 9: Edit `src/admin/pdf/pdf.test.ts`**

Find this block:

```ts
    expect(pdfText('A⇒B, B⇔C, f: ℝ→ℝ')).toBe('A=>B, B<=>C, f: R->R');
  });
```

Replace it with:

```ts
    expect(pdfText('A⇒B, B⇔C, f: ℝ→ℝ')).toBe('A=>B, B<=>C, f: R->R');
    expect(pdfText('N₂ + 3H₂ ⇌ 2NH₃, CO₂↑, AgCl↓')).toBe('N₂ + 3H₂ <=> 2NH₃, CO₂ (gaz), AgCl (precipitat)');
  });

  it('keeps the signs of physics and chemistry that the font draws', () => {
    const has = glyphChecker();
    for (const char of '₀₁₂₃₄₅₆₇₈₉⁺⁻°ΩμΔλρπ·×≈') expect(has(char.codePointAt(0)!), char).toBe(true);
    const text = 'v = Δx/Δt, ρ = 1000 kg/m³, 20 °C, R = 10 Ω, SO₄²⁻';
    expect(pdfText(text)).toBe(text);
  });
```

- [ ] **Step 10: Edit `src/test/gradingWords.test.ts`**

Find this block:

```ts
    expect(() => expectNoGradingWords('Succes! PROCESUL de lucru.')).not.toThrow();
  });
```

Replace it with:

```ts
    expect(() => expectNoGradingWords('Succes! PROCESUL de lucru.')).not.toThrow();
    expect(() => expectNoGradingWords('You used the past simple well. Check the spelling of "necessary".')).not.toThrow();
  });
```

- [ ] **Step 11: Edit `src/test/gradingWords.test.ts`**

Find this block:

```ts
    'Testul adaptat',
  ])('catches "%s"', (text) => {
```

Replace it with:

```ts
    'Testul adaptat',
    'Graded by artificial intelligence.',
    'Your answers were checked automatically.',
  ])('catches "%s"', (text) => {
```

- [ ] **Step 12: Run the new tests and see them fail**

Run: `npx vitest run runner/skill.test.ts shared/schemas.test.ts server/routes/runnerGrading.test.ts runner/trySkill.test.ts src/admin/pdf/pdf.test.ts src/test/gradingWords.test.ts`
Expected: FAIL. `Test Files  6 failed (6)`, `Tests  11 failed | 161 passed (172)`: the skill names no subject and has no `references/subjects/`, medium confidence is not flagged in physics, a barem section of 60 items is refused, `⇌` has no mapping, "artificial intelligence" passes the words check, and `try:skill` writes no `subject.md`.

- [ ] **Step 13: Edit `.claude/skills/evaluate-test/SKILL.md`**

Find this block:

```markdown
name: evaluate-test
description: Grades a Romanian math test for QuickEval. Modes "exercise-list" (read the test and the barem, list the exercises), "grade" (grade one student's pages), "class-report" (analyze the graded class), and "barem" (write the barem of a test).
argument-hint: exercise-list | grade | class-report | barem
```

Replace it with:

```markdown
name: evaluate-test
description: Grades a Romanian school test (matematică, fizică, chimie, biologie, științe, limba română, limba engleză) for QuickEval. Modes "exercise-list" (read the test and the barem, list the exercises), "grade" (grade one student's pages), "class-report" (analyze the graded class), and "barem" (write the barem of a test).
argument-hint: exercise-list | grade | class-report | barem
```

- [ ] **Step 14: Edit `.claude/skills/evaluate-test/SKILL.md`**

Find this block:

```markdown

# Evaluate a math test

You work for a math teacher in Romania. The mode of this task is: **$ARGUMENTS**.

Read `references/grading-rules.md` first. It holds the teacher's rules, and they apply to every mode. The mode `barem` is the exception: it says below which of them it uses.

```

Replace it with:

```markdown

# Evaluate a test

You work for a teacher in Romania. The mode of this task is: **$ARGUMENTS**.

Read `references/grading-rules.md` first. It holds the teacher's rules, and they apply to every mode. The mode `barem` is the exception: it says below which of them it uses.

## The subject

Each test has one subject. These are the subjects you can work with, and the value that names each one:

- `matematica`: Matematică
- `fizica`: Fizică
- `chimie`: Chimie
- `biologie`: Biologie
- `stiinte`: Științe (a test that mixes physics, chemistry and biology, for example "Științe ale naturii")
- `romana`: Limba și literatura română
- `engleza`: Limba engleză

When `subject.md` is in the folder, it holds the value of the subject. Use it, and do not look for another subject.

When there is no `subject.md` (only in the modes `exercise-list` and `barem`), find the subject before anything else. Read the test's heading first: it usually names the subject. Then read its exercises. A test of any other subject (history, geography, …) is `alta`. Do not stretch a subject of the list to fit it.

Then read `references/subjects/<value>.md` (there is none for `alta`) and follow it. It says what is different in that subject; where it differs from the general rules, it wins. For `alta`, do the task as well as you can with the general rules.

In the modes `exercise-list` and `barem` the answer also has:

- `subject`: the value of the subject, or `alta`;
- `subjectName`: for `alta`, the subject's Romanian name in lower case, for example "istorie"; "" for a subject of the list.

```

- [ ] **Step 15: Edit `.claude/skills/evaluate-test/SKILL.md`**

Find this block:

```markdown
  - `studentAnswer`: what the student wrote as the final answer, short and in plain text; "" if nothing.
  - `comment`: to the student, in Romanian, as "tu": what is right, what is wrong, and why. One to three short sentences.
  - `confidence`: "very_high", "high", "medium", "low", or "very_low": how sure you are of the points, from 5 (very sure) to 1 (a guess).
```

Replace it with:

```markdown
  - `studentAnswer`: what the student wrote as the final answer, short and in plain text; "" if nothing.
  - `comment`: to the student, in Romanian (or in the language that the subject's file names), as "tu": what is right, what is wrong, and why. One to three short sentences.
  - `confidence`: "very_high", "high", "medium", "low", or "very_low": how sure you are of the points, from 5 (very sure) to 1 (a guess).
```

- [ ] **Step 16: Edit `.claude/skills/evaluate-test/SKILL.md`**

Find this block:

```markdown

Read `references/barem-writing.md` and `references/barem-example.md` first. The example is a real test and barem from the teacher: copy its style.

```

Replace it with:

```markdown

Read `references/barem-writing.md` and `references/barem-example.md` first. The example is a real test and barem from the teacher: copy its style. They are a math test and barem: for another subject, copy their form, and write the steps as the subject's file says.

```

- [ ] **Step 17: Create `.claude/skills/evaluate-test/references/subjects/matematica.md`**

```markdown
# Matematică

The general rules (`references/grading-rules.md`) and, in the mode `barem`, `references/barem-writing.md` and `references/barem-example.md` were written for math tests. Follow them exactly as they are: this file adds nothing to them and changes nothing in them.
```

- [ ] **Step 18: Create `.claude/skills/evaluate-test/references/subjects/fizica.md`**

```markdown
# Fizică

The general rules hold. This file says what is different in a physics test. There is no real physics barem of the teacher yet: when the barem says something else, the barem wins.

## How the tests are built

- A test often follows the Bacalaureat: up to four areas (A. Mecanică, B. Elemente de termodinamică, C. Producerea și utilizarea curentului continuu, D. Optică), each with Subiectul I (multiple choice), Subiectul al II-lea and Subiectul al III-lea (problems with parts a, b, c, d). A school test may have one area, or subjects of its own.
- A multiple-choice item ("Răspunsul corect este: …") gets its points only for the correct letter. There are no partial points for it.

## Points in a problem

- The barem usually gives points for the formula, for the calculation, and for the result with its unit. Give each step that the student did right its own points.
- A correct formula written in another but equivalent form gets the points of the formula.
- A result without its unit, or with a wrong unit, does not get the points of the result when the barem gives points for the result. The other steps keep theirs.
- A wrong result that comes only from a wrong value of an earlier part of the same problem: give the points of the correct steps of this part, as the general rules say.
- A drawing (forces, a circuit, the path of a ray) gets its points only when what the barem asks is in it. When you cannot judge the drawing from the photo, flag the item.

## The texts

- Write physics in plain Unicode, as the general rules ask for math: v = Δx/Δt, a = 2 m/s², ρ = 1000 kg/m³, t = 20 °C, R = 10 Ω, λ = 500 nm.
- Write units with a space after the number ("5 m/s"), and SI units, as the school does.

## The mode `barem`

- `references/barem-example.md` is a math barem: copy its form (the header, the four "Precizări", the subjects with their points, the steps with whole points on the right), not its contents.
- A multiple-choice item is one step: the letter of the correct answer, with all the points of the item.
- In a problem, the steps are usually: the formula, the calculation, the result with its unit. Give the real values of each step.
- Write physics as inline TeX between single `$`, as the barem mode asks: `$v = \frac{\Delta x}{\Delta t}$`, `$a = 2\ \mathrm{m/s^2}$`.
```

- [ ] **Step 19: Create `.claude/skills/evaluate-test/references/subjects/chimie.md`**

```markdown
# Chimie

The general rules hold. This file says what is different in a chemistry test. There is no real chemistry barem of the teacher yet: when the barem says something else, the barem wins.

## How the tests are built

- A test often follows the Bacalaureat: Subiectul A (statements to complete, true or false, multiple choice), Subiectul B and C (exercises and problems), in one area (chimie organică or chimie anorganică). A school test may have subjects of its own.
- A multiple-choice item, or a true/false item, gets its points only for the correct answer. A false statement that the barem asks the student to correct gets the points of the correction only when the correction is right.

## Points

- A chemical equation gets the points the barem gives for it only when the formulas of every substance are right. The barem often gives separate points for the formulas and for the coefficients: give each part its own points.
- A calculation (amount of substance, mass, volume, concentration, yield) gets its points by steps, as in physics: the relation, the calculation, the result with its unit (mol, g, L, %).
- A wrong result that comes only from an earlier mistake in the same problem: give the points of the correct steps.
- A structural formula or a name of a substance gets its points only when it is the one the barem asks for. Accept the names the Romanian school uses (IUPAC or the usual name), unless the barem asks for one of them.

## The texts

- Write formulas in plain Unicode: H₂SO₄, Ca(OH)₂, NH₄⁺, SO₄²⁻, CH₃–CH₂–OH. Write arrows as →, ⇌, ↑ (a gas that leaves) and ↓ (a precipitate).
- Never use LaTeX in the texts of the grading.

## The mode `barem`

- `references/barem-example.md` is a math barem: copy its form (the header, the four "Precizări", the subjects with their points, the steps with whole points on the right), not its contents.
- For an equation, a step for the formulas and a step for the coefficients, when its points allow two steps.
- Write chemistry as inline TeX between single `$`: `$\mathrm{H_2SO_4}$`, `$\mathrm{2H_2 + O_2 \rightarrow 2H_2O}$`.
```

- [ ] **Step 20: Create `.claude/skills/evaluate-test/references/subjects/biologie.md`**

```markdown
# Biologie

The general rules hold. This file says what is different in a biology test. There is no real biology barem of the teacher yet: when the barem says something else, the barem wins.

## How the tests are built

- A test often follows the Bacalaureat or the school's own tests: Subiectul I (A: complete the statement; B: give examples or name; C: multiple choice; D: true or false, with the correction of a false statement), Subiectul al II-lea (an exercise, often genetics, and a problem), Subiectul al III-lea (a structured essay or a text with questions).
- A multiple-choice item, or a true/false item, gets its points only for the correct answer. The correction of a false statement gets its points only when it is right and keeps the rest of the statement.

## Points

- An answer that says what the barem says in other words gets the points, unless the barem asks for a precise term. A term with a spelling mistake that leaves no doubt about the term still counts.
- A list ("numiți două …") gets the points of each correct element, up to the number the item asks for. Extra wrong elements do not take points off unless the barem says so.
- A genetics problem gets its points by steps: the genotypes of the parents, the gametes, the crossing (the table), the genotypes and phenotypes of the offspring, the ratios or the percentages.
- A structured essay gets the points the barem gives for each required idea, and the points for the order and the logic of the text when the barem gives them. When the points of the logic depend on your judgment, flag the item.

## The texts

- Write genotypes as the school writes them (AaBb), and ratios as 9:3:3:1 or as percentages.

## The mode `barem`

- `references/barem-example.md` is a math barem: copy its form (the header, the four "Precizări", the subjects with their points, the steps with whole points on the right), not its contents.
- For a list item, one step for each element the item asks for. For an essay, one step for each required idea, and a step for the logic of the text.
```

- [ ] **Step 21: Create `.claude/skills/evaluate-test/references/subjects/stiinte.md`**

```markdown
# Științe

A test that mixes physics, chemistry and biology (for example "Științe ale naturii" in middle school). The general rules hold.

- Read `fizica.md`, `chimie.md` and `biologie.md` in this folder too.
- Grade each item by the file of its own area: a problem about forces or a circuit by `fizica.md`, a reaction or a substance by `chimie.md`, a living thing or the human body by `biologie.md`.
- In the mode `barem`, write the steps of each item by the file of its area, in the form of `references/barem-example.md`.
```

- [ ] **Step 22: Create `.claude/skills/evaluate-test/references/subjects/romana.md`**

```markdown
# Limba română

The general rules hold, except where this file says otherwise. There is no real Romanian barem of the teacher yet: when the barem says something else, the barem wins.

## How the tests are built

- A test often follows the Evaluare Națională or the Bacalaureat: Subiectul I (questions on a text: the meaning of words, the ideas of the text, grammar), Subiectul al II-lea (a short text: an argument, a characterization, a comment), Subiectul al III-lea (an essay or a composition). A school test may have subjects of its own.
- Grammar items (the part of speech, the function, a sentence to build) and short answers get their points as the barem gives them.
- A text the student writes is graded by criteria: the content (what it must say) and the writing ("redactare": the organization of the ideas, the expression, the spelling, the punctuation, the number of words). The barem gives the points of each criterion.

## Points

- An answer that keeps the meaning that the barem asks for gets the points, also in other words, unless the barem asks for a precise form.
- Spelling, punctuation and grammar take points only where the barem gives points for them (usually in "redactare"). They do not take points off a short answer whose meaning is right, unless the barem says so.
- In an essay, judge each criterion on its own and give it the points the barem allows. When the points of a criterion depend on your judgment (the originality, the coherence, the fluency of the expression), give your best points and flag the item, with a short reason for the teacher.
- A text shorter than the number of words that the barem asks for gets what the barem says for that case.
- When the barem gives points for the layout or for how easy the writing is to read ("așezarea în pagină", "lizibilitatea"), do not judge it from a photo: give your best points and flag the item.

## The texts

- `studentAnswer` of an essay: not the essay itself. Write a short description, for example "Eseu de aproximativ 300 de cuvinte despre …".
- The comments name a spelling or punctuation mistake with its correction ("Scrie „niciun”, nu „nici un”.").
- The rule about Unicode math does not matter here; write normal Romanian text.

## The CES variant

The general rule for CES papers ("no points taken off for spelling") holds only where the CES barem does not give points for spelling. Where it does, follow the CES barem.

## The mode `barem`

- `references/barem-example.md` is a math barem: copy its form (the header, the four "Precizări", the subjects with their points, the steps with whole points on the right), not its contents.
- For a question on the text, one step for each idea or element the answer must have.
- For an essay, one step for each criterion of the content and one for each criterion of the writing, with whole points, as the usual barems of the Evaluare Națională and the Bacalaureat do.
- The "Precizări" keep the din oficiu points and how the grade is found; the rule about the full points for any correct solution becomes: an answer that keeps the meaning gets the points, also in other words.
```

- [ ] **Step 23: Create `.claude/skills/evaluate-test/references/subjects/engleza.md`**

```markdown
# Limba engleză

The general rules hold, except where this file says otherwise. There is no real English barem of the teacher yet: when the barem says something else, the barem wins.

## The language of the texts

- The texts that the student reads are in English: `comment`, `summary`, `strengths` and `recommendations`. Write to the student as "you", kind, short and specific, what is right first, then what to fix, as the general rules ask.
- Every other text stays in Romanian: `reviewReason`, the exercise list (`label`, `topic`, `answer`, `scoringNotes`, `notes`), the barem, and the whole class analysis.
- The English texts follow the same rules as the Romanian ones: never the student's name, nothing about the handwriting as a fault, and never a word about how the work was graded (no "AI", "artificial intelligence", "robot", "Claude", "program", "automatic").

## How the tests are built

- A test often follows the school's tests and the national exams: reading (multiple choice, true or false, gap filling, questions on a text), use of English (grammar, vocabulary, word formation, sentence transformation), and writing (an email, a letter, an article, an essay).
- A closed item (multiple choice, true or false, matching) gets its points only for the correct answer.

## Points

- A gap-filling or word-formation item gets its points only for the right word, spelled right, unless the barem accepts other words or forms. Accept every answer the barem lists.
- A sentence transformation gets its points as the barem splits them; a wrong word elsewhere in the sentence costs only the points of its part.
- A written text is graded by criteria (usually: the task and the content, the organization, the vocabulary, the grammar, the spelling and the number of words). Judge each criterion on its own. When the points of a criterion depend on your judgment, give your best points and flag the item, with a short reason for the teacher in Romanian.
- A contraction ("don't") is right unless the barem asks for the full form.

## The texts

- `studentAnswer` of a written text: not the text itself. Write a short description, for example "Email of about 120 words".
- The rule about Unicode math does not matter here.

## The mode `barem`

- `references/barem-example.md` is a math barem: copy its form (the header, the four "Precizări", the subjects with their points, the steps with whole points on the right), not its contents. The barem is in Romanian; the answers it quotes are in English.
- For a closed item, one step with the correct answer. For a written text, one step for each criterion.
```

- [ ] **Step 24: Edit `shared/schemas.ts`**

Find this block:

```ts
const MAX_BAREM_SECTIONS = 6;
const MAX_BAREM_ITEMS = 30;
const MAX_BAREM_STEPS = 12;
```

Replace it with:

```ts
const MAX_BAREM_SECTIONS = 6;
// A language test can have many small items in one subject.
const MAX_BAREM_ITEMS = 60;
const MAX_BAREM_STEPS = 12;
```

- [ ] **Step 25: Edit `shared/schemas.ts`**

Find this block:

```ts
// exactly once, points inside [0, max] (outside: clamped and flagged), very
// low and low confidence always flagged. Code computes the total and the grade.
export function checkGrading(raw: unknown, list: ExerciseList): Checked<Grading> {
  const parsed = gradingResultSchema.safeParse(raw);
```

Replace it with:

```ts
// exactly once, points inside [0, max] (outside: clamped and flagged), very
// low and low confidence always flagged, and medium confidence too in every
// subject but math, while the robot has no real barem of those subjects (a
// null subject is math). Code computes the total and the grade.
export function checkGrading(raw: unknown, list: ExerciseList, subject: DetectedSubject | null = null): Checked<Grading> {
  const newSubject = subject !== null && subject !== 'matematica';
  const parsed = gradingResultSchema.safeParse(raw);
```

- [ ] **Step 26: Edit `shared/schemas.ts`**

Find this block:

```ts
    if (points !== given) reasons.push(OUT_OF_RANGE);
    const unsure = item.confidence === 'low' || item.confidence === 'very_low';
    if (item.needsReview || unsure) {
```

Replace it with:

```ts
    if (points !== given) reasons.push(OUT_OF_RANGE);
    const unsure = item.confidence === 'low' || item.confidence === 'very_low' || (newSubject && item.confidence === 'medium');
    if (item.needsReview || unsure) {
```

- [ ] **Step 27: Edit `server/db/runner.ts`**

Find this block:

```ts
  submissionId: number,
): Promise<{ status: string; runId: string | null; startedAt: string; exerciseList: ExerciseList | null } | null> {
  const row = await db
    .prepare(
      `SELECT s.status, s.run_id, s.started_at,
         CASE WHEN s.variant = 'ces' THEN t.ces_exercise_list_json ELSE t.exercise_list_json END AS exercise_list_json
```

Replace it with:

```ts
  submissionId: number,
): Promise<{ status: string; runId: string | null; startedAt: string; exerciseList: ExerciseList | null; subject: DetectedSubject | null } | null> {
  const row = await db
    .prepare(
      `SELECT s.status, s.run_id, s.started_at, t.subject,
         CASE WHEN s.variant = 'ces' THEN t.ces_exercise_list_json ELSE t.exercise_list_json END AS exercise_list_json
```

- [ ] **Step 28: Edit `server/db/runner.ts`**

Find this block:

```ts
    .bind(submissionId)
    .first<{ status: string; run_id: string | null; started_at: string; exercise_list_json: string | null }>();
  if (!row) return null;
  const exerciseList = row.exercise_list_json ? (JSON.parse(row.exercise_list_json) as ExerciseList) : null;
  return { status: row.status, runId: row.run_id, startedAt: row.started_at, exerciseList };
}
```

Replace it with:

```ts
    .bind(submissionId)
    .first<{ status: string; run_id: string | null; started_at: string; exercise_list_json: string | null; subject: DetectedSubject | null }>();
  if (!row) return null;
  const exerciseList = row.exercise_list_json ? (JSON.parse(row.exercise_list_json) as ExerciseList) : null;
  return { status: row.status, runId: row.run_id, startedAt: row.started_at, exerciseList, subject: row.subject };
}
```

- [ ] **Step 29: Edit `server/routes/runner.ts`**

Find this block:

```ts
      if (!current.exerciseList) throw takenOver();
      const checked = checkGrading(body.result, current.exerciseList);
      if (!checked.ok) throw invalidResult();
```

Replace it with:

```ts
      if (!current.exerciseList) throw takenOver();
      const checked = checkGrading(body.result, current.exerciseList, current.subject);
      if (!checked.ok) throw invalidResult();
```

- [ ] **Step 30: Edit `runner/tasks.ts`**

Find this block:

```ts
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
    const outcome = await askClaude(ctx, 'grade', cwd, (output) => checkGrading(output, list).ok);
    return sendOutcome(outcome, (result, model, effort) => ctx.api.sendResult(submissionId, { runId: ctx.runId, startedAt, ok: true, result, model, effort }),
```

Replace it with:

```ts
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
    const outcome = await askClaude(ctx, 'grade', cwd, (output) => checkGrading(output, list, subject).ok);
    return sendOutcome(outcome, (result, model, effort) => ctx.api.sendResult(submissionId, { runId: ctx.runId, startedAt, ok: true, result, model, effort }),
```

- [ ] **Step 31: Edit `runner/trySkill.ts`**

Find this block:

```ts
import { formatPoints } from '../shared/scoring.ts';
import type { ExerciseList } from '../shared/schemas.ts';
```

Replace it with:

```ts
import { formatPoints } from '../shared/scoring.ts';
import { type DetectedSubject, isDetectedSubject } from '../shared/subjects.ts';
import type { ExerciseList } from '../shared/schemas.ts';
```

- [ ] **Step 32: Edit `runner/trySkill.ts`**

Find this block:

```ts
//   exercises.json      (grade) written by the exercise-list mode
//   notes.md            (barem) the teacher's comments for the barem; the barem mode needs no barem file
```

Replace it with:

```ts
//   exercises.json      (grade) written by the exercise-list mode
//   subject.md          the subject (matematica, fizica, …): written by the exercise-list mode, read by
//                       the grade mode (none: math); put it there by hand to skip the detection
//   notes.md            (barem) the teacher's comments for the barem; the barem mode needs no barem file
```

- [ ] **Step 33: Edit `runner/trySkill.ts`**

Find this block:

```ts
    return null;
  }
}

```

Replace it with:

```ts
    return null;
  }
}

// The subject in the folder's subject.md, or null without one.
async function readSubject(folder: string): Promise<DetectedSubject | null> {
  const file = path.join(folder, 'subject.md');
  if (!existsSync(file)) return null;
  const value = (await readFile(file, 'utf8')).trim();
  return isDetectedSubject(value) ? value : null;
}

```

- [ ] **Step 34: Edit `runner/trySkill.ts`**

Find this block:

```ts
    try {
      const input: WorkFolderInput = mode === 'barem' ? { test: test!, requestNotes: await readNotes(folder) } : { test: test!, barem: barem!, exerciseList: list, pages };
      cwd = await makeWorkFolder(root, mode, input, options.workdir);
```

Replace it with:

```ts
    try {
      const known = await readSubject(folder);
      const input: WorkFolderInput =
        mode === 'barem'
          ? { test: test!, requestNotes: await readNotes(folder), subject: known }
          : { test: test!, barem: barem!, exerciseList: list, pages, subject: mode === 'grade' ? (known ?? 'matematica') : known };
      cwd = await makeWorkFolder(root, mode, input, options.workdir);
```

- [ ] **Step 35: Edit `runner/trySkill.ts`**

Find this block:

```ts
      await writeFile(path.join(folder, 'exercises.json'), `${JSON.stringify(checked.value.list, null, 2)}\n`);
      const { list: saved, message } = checked.value;
      print(`${saved.exercises.length} exerciții, ${formatPoints(saved.totalPoints)} puncte, din oficiu ${formatPoints(saved.officePoints)}.`);
```

Replace it with:

```ts
      await writeFile(path.join(folder, 'exercises.json'), `${JSON.stringify(checked.value.list, null, 2)}\n`);
      const { list: saved, message, subject } = checked.value;
      if (subject && !(await readSubject(folder))) {
        await writeFile(path.join(folder, 'subject.md'), `${subject.value}\n`);
        print(subject.value === 'alta' ? `Materia: alta (${subject.name}). Robotul nu o corectează.` : `Materia: ${subject.value}.`);
      }
      print(`${saved.exercises.length} exerciții, ${formatPoints(saved.totalPoints)} puncte, din oficiu ${formatPoints(saved.officePoints)}.`);
```

- [ ] **Step 36: Edit `runner/trySkill.ts`**

Find this block:

```ts
    }
    const checked = checkGrading(outcome.output, list!);
    if (!checked.ok) {
```

Replace it with:

```ts
    }
    const checked = checkGrading(outcome.output, list!, (await readSubject(folder)) ?? 'matematica');
    if (!checked.ok) {
```

- [ ] **Step 37: Edit `src/admin/pdf/pdfSymbols.ts`**

Find this block:

```ts
  '→': '->',
};
```

Replace it with:

```ts
  '→': '->',
  '⇌': '<=>',
  // Chemistry: a gas that leaves, a precipitate. They follow a formula (CO₂↑).
  '↑': ' (gaz)',
  '↓': ' (precipitat)',
};
```

- [ ] **Step 38: Edit `src/test/gradingWords.ts`**

Find this block:

```ts
  expect(text).not.toMatch(/\b(AI|IA|CES)\b|\bA\.I\.|\bI\.A\./);
  expect(text.toLowerCase()).not.toMatch(/inteligen|claude|robot|automat|adaptat/);
}
```

Replace it with:

```ts
  expect(text).not.toMatch(/\b(AI|IA|CES)\b|\bA\.I\.|\bI\.A\./);
  expect(text.toLowerCase()).not.toMatch(/inteligen|intellig|artificial|claude|robot|automat|adaptat/);
}
```

- [ ] **Step 39: Edit `runner/AGENTS.md`**

Find this block:

```markdown
- `printTask.ts` makes the print PDF through the Docker image in `print/`. The image pins LibreOffice and installs only Liberation, Carlito, and Caladea fonts: other fonts (Noto, DejaVu) change "∖" into "∣" and move the layout. `QE_PRINT_IMAGE_TESTS=1` runs the container tests (`print/container.test.ts`, slow the first time). Never log the upload token or a script's output.
- `.claude/skills/evaluate-test/` (repo root): the grading skill (spec §13). The teacher may change its words; the robot copies it into every work folder. `skill.test.ts` checks the file and field names that the code needs.

```

Replace it with:

```markdown
- `printTask.ts` makes the print PDF through the Docker image in `print/`. The image pins LibreOffice and installs only Liberation, Carlito, and Caladea fonts: other fonts (Noto, DejaVu) change "∖" into "∣" and move the layout. `QE_PRINT_IMAGE_TESTS=1` runs the container tests (`print/container.test.ts`, slow the first time). Never log the upload token or a script's output.
- `.claude/skills/evaluate-test/` (repo root): the grading skill (spec §13). The teacher may change its words; the robot copies it into every work folder. `skill.test.ts` checks the file and field names that the code needs. `SKILL.md` says how to find the subject; `references/subjects/<value>.md` holds what each subject changes (`matematica.md` changes nothing: the general rules, `barem-writing.md` and `barem-example.md` are the math ones, word for word). The other subjects' files are written from the public exam formats, with no real barem of the teacher yet; `engleza.md` asks for the texts of the student in English. In every subject but math, `checkGrading` also flags medium confidence.

```

- [ ] **Step 40: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  173 passed | 1 skipped (174)`, `Tests  2582 passed | 3 skipped (2585)`.

- [ ] **Step 41: Commit**

```bash
git add .claude/skills/evaluate-test/SKILL.md .claude/skills/evaluate-test/references/subjects runner/skill.test.ts shared/schemas.ts shared/schemas.test.ts server/db/runner.ts server/routes/runner.ts server/routes/runnerGrading.test.ts runner/tasks.ts runner/trySkill.ts runner/trySkill.test.ts src/admin/pdf/pdfSymbols.ts src/admin/pdf/pdf.test.ts src/test/gradingWords.ts src/test/gradingWords.test.ts runner/AGENTS.md
git commit -m "Grade each subject by its own rules, and keep math as it was"
```

### Task 4: Compare the old and the new skill on real math tests

`npm run compare:skills`: `runner/compareReport.ts` (the rules of the verdict and the Romanian report) and `runner/compareSkills.ts` (reads the live site through Wrangler, runs Claude like the robot on both sides, writes the report); `WorkFolderOptions.defaultNotes` carries the old barem note.

**Files:**
- Create: `runner/compareReport.ts`, `runner/compareReport.test.ts`, `runner/compareSkills.ts`, `runner/compareSkills.test.ts`
- Modify: `runner/workdir.ts`, `package.json`, `AGENTS.md`, `runner/AGENTS.md`
- Test: `runner/compareReport.test.ts`, `runner/compareSkills.test.ts`, `runner/workdir.test.ts`

**Interfaces:**
- Consumes: Task 2's answer schemas and `subjectOf`; Task 3's `checkGrading(…, subject)`; `makeWorkFolder`, `runFolder`, `removeFolder`, `SKILL_DIR`, `DEFAULT_BAREM_NOTES`; `claudeRunner`, `claudeSettings`.
- Produces: `compareSkills(args, env, options)`, `Live`, `wranglerLive()`, `oldSkill(ref, into)`, `insideRepo(folder)`, `OLD_BAREM_NOTES`, `REPO_DIR`; `TestRun`, `PaperRun`, `verdict`, `reportMarkdown`, `listShape`, `baremShape`, `meanDistance`, `flagCount`, `differences`; `WorkFolderOptions.defaultNotes?: string`.

- [ ] **Step 1: Create `runner/compareReport.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { ExerciseList, GeneratedBarem, Grading } from '../shared/schemas.ts';
import { baremShape, differences, flagCount, listShape, meanDistance, reportMarkdown, type TestRun, verdict } from './compareReport.ts';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: '', topic: 'Fracții' },
    { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

const BAREM: GeneratedBarem = {
  title: 'Test de evaluare – Fracții',
  subtitle: 'Matematică – clasa a VI-a',
  notes: [],
  total: 100,
  officePoints: 10,
  parts: [{ title: '', sections: [{ title: 'SUBIECTUL I', points: 90, items: [{ label: '1.', steps: [{ text: 'Calcul', points: 90 }] }] }] }],
};

function grading(points: [number, number], flagged: [boolean, boolean] = [false, false], comment = 'Corect.'): Grading {
  const items = (['I.1', 'II.1'] as const).map((exerciseId, index) => ({
    exerciseId,
    position: index + 1,
    label: exerciseId,
    maxPoints: 4.5,
    points: points[index]!,
    studentAnswer: '',
    comment,
    confidence: 'high' as const,
    needsReview: flagged[index]!,
    reviewReason: flagged[index] ? 'Verifică.' : '',
    page: 1,
    areas: [],
  }));
  const total = 1 + points[0] + points[1];
  return { maxTotal: 10, officePoints: 1, total, grade: total, needsReview: flagged.some(Boolean), summary: '', strengths: [], recommendations: [], unreadable: [], items };
}

function run(overrides: Partial<TestRun> = {}): TestRun {
  return {
    code: '6E2-26T1',
    liveList: LIST,
    lists: { old: LIST, new: LIST },
    barems: { old: BAREM, new: BAREM },
    subjects: { list: { value: 'matematica', name: '' }, barem: { value: 'matematica', name: '' } },
    papers: [
      { paper: 1, old: grading([4, 2]), new: grading([4, 2]), teacher: { 'I.1': 4, 'II.1': 2.5 } },
      { paper: 2, old: grading([4.5, 4.5], [false, true]), new: grading([4.5, 4.5], [false, true]), teacher: { 'I.1': 4.5, 'II.1': 4.5 } },
    ],
    ...overrides,
  };
}

describe('the comparison of the two skills', () => {
  it('writes a list and a barem as comparable shapes', () => {
    expect(listShape(LIST)).toBe('total 10 | oficiu 1 | I.1:4,5 | II.1:4,5');
    expect(baremShape(BAREM)).toBe('total 100 | oficiu 10 | —: SUBIECTUL I (90p): 1. 90p');
  });

  it('measures the mean distance from the teacher and counts the flags', () => {
    expect(meanDistance(run(), 'old')).toBe(0.25);
    expect(flagCount(run(), 'new')).toBe(1);
  });

  it('passes when nothing changed', () => {
    expect(verdict(run())).toEqual({ pass: true, reasons: [] });
  });

  it('fails when the new skill does not find math', () => {
    const result = verdict(run({ subjects: { list: { value: 'fizica', name: '' }, barem: null } }));
    expect(result.pass).toBe(false);
    expect(result.reasons).toEqual([
      'Materia găsită cu lista de exerciții nu este matematica (fizica).',
      'Materia găsită cu baremul generat nu este matematica (niciuna).',
    ]);
  });

  it('fails when the lists or the barems differ', () => {
    const other = { ...LIST, exercises: [LIST.exercises[0]!, { ...LIST.exercises[1]!, maxPoints: 4 }], totalPoints: 9.5 };
    const shorter = { ...BAREM, parts: [{ title: '', sections: [{ ...BAREM.parts[0]!.sections[0]!, title: 'SUBIECTUL II' }] }] };
    expect(verdict(run({ lists: { old: LIST, new: other }, barems: { old: BAREM, new: shorter } })).reasons).toEqual([
      'Listele de exerciții au alte exerciții sau alte punctaje.',
      'Baremele generate au altă structură sau alte punctaje.',
    ]);
  });

  it('allows the new skill 0.1 points more distance per paper, and no more', () => {
    const closer = run();
    closer.papers[0]!.new = grading([4, 2.3]);
    expect(meanDistance(closer, 'new')).toBe(0.1);
    expect(verdict(closer).pass).toBe(true);
    const farther = run();
    farther.papers[0]!.new = grading([4, 1.5]);
    expect(verdict(farther).reasons).toEqual(['Noua corectare se depărtează mai mult de punctajele profesorului: 0,5 față de 0,25 puncte pe lucrare.']);
  });

  it('allows one flag more or less on a few, and fails on more', () => {
    const one = run();
    one.papers[0]!.new = grading([4, 2], [true, false]);
    expect(verdict(one).pass).toBe(true);
    const many = run();
    many.papers[0]!.new = grading([4, 2], [true, true]);
    expect(verdict(many).reasons).toEqual(['Numărul de puncte de verificat s-a schimbat prea mult: 3 față de 1.']);
  });

  it('fails when a side could not grade a paper', () => {
    const missing = run();
    missing.papers[1]!.new = null;
    expect(verdict(missing).reasons).toEqual(['1 lucrări nu au fost corectate de ambele părți.']);
  });

  it('lists the items that differ, with both comments and the teacher’s points', () => {
    const paper = { paper: 1, old: grading([4, 2], [false, false], 'Vechi.'), new: grading([4, 3], [false, true], 'Nou.'), teacher: { 'I.1': 4, 'II.1': 2.5 } };
    expect(differences(paper)).toEqual([
      { exerciseId: 'II.1', teacher: 2.5, old: { points: 2, flagged: false, comment: 'Vechi.' }, new: { points: 3, flagged: true, comment: 'Nou.' } },
    ]);
  });

  it('writes a Romanian report that numbers the papers and names no student', () => {
    const changed = run();
    changed.papers[0]!.new = grading([4, 2.5], [false, false], 'Bine.');
    const text = reportMarkdown([changed]);
    expect(text).toContain('# Comparația corectării la matematică');
    expect(text).toContain('Rezultat: **trece** pe toate testele.');
    expect(text).toContain('## Testul 6E2-26T1');
    expect(text).toContain('| Lucrarea 1 | 7 | 7,5 | 7,5 |');
    expect(text).toContain('### Lucrarea 1: ce diferă');
    expect(text).toContain('  - nouă: 2,5. Bine.');
    expect(reportMarkdown([run({ subjects: { list: null, barem: null } })])).toContain('Rezultat: **nu trece**.');
  });
});
```

- [ ] **Step 2: Create `runner/compareSkills.test.ts`**

```ts
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExerciseList, GeneratedBarem, GradingResult } from '../shared/schemas.ts';
import type { ClaudeOutcome, ClaudeTask } from './claude.ts';
import { compareSkills, insideRepo, type Live, OLD_BAREM_NOTES, oldSkill as skillOfRef, REPO_DIR } from './compareSkills.ts';
import { answer } from './test/scriptedClaude.ts';
import { DEFAULT_BAREM_NOTES } from './workdir.ts';

const LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5, answer: '3/4', scoringNotes: '', topic: 'Fracții' },
    { id: 'II.1', label: 'Subiectul II, exercițiul 1', maxPoints: 4.5, answer: 'x = 2', scoringNotes: '', topic: 'Ecuații' },
  ],
  notes: '',
};

const BAREM: GeneratedBarem = {
  title: 'Test de evaluare – Fracții',
  subtitle: 'Matematică – clasa a VI-a',
  notes: [],
  total: 100,
  officePoints: 10,
  parts: [{ title: '', sections: [{ title: 'SUBIECTUL I', points: 90, items: [{ label: '1.', steps: [{ text: 'Calcul', points: 90 }] }] }] }],
};

const GRADING: GradingResult = {
  items: [
    { exerciseId: 'I.1', points: 4.5, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '', page: 1, areas: [] },
    { exerciseId: 'II.1', points: 2, studentAnswer: 'x = 3', comment: 'Verifică semnul.', confidence: 'high', needsReview: false, reviewReason: '', page: 1, areas: [] },
  ],
  unreadable: [],
  summary: 'Ai lucrat bine.',
  strengths: [],
  recommendations: [],
};

// What the live site holds: one math test with two graded papers.
function fakeLive(): Live & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    query: async <T,>(sql: string) => {
      queries.push(sql);
      let rows: unknown[] = [];
      if (sql.includes('ORDER BY corrected DESC')) rows = [{ code: '6E2-26T1', title: 'Fracții', graded: 2, corrected: 3 }];
      else if (sql.includes("WHERE code = '6E2-26T1'")) {
        rows = [
          {
            id: 7,
            test_file_key: 't/1/2026/6E2-26T1/test.pdf',
            test_file_type: 'application/pdf',
            barem_file_key: 't/1/2026/6E2-26T1/barem.pdf',
            barem_file_type: 'application/pdf',
            barem_notes: 'Acceptă și metoda grafică.',
            exercise_list_json: JSON.stringify(LIST),
          },
        ];
      } else if (sql.includes('FROM submissions WHERE test_id = 7')) rows = [{ id: 11 }, { id: 12 }];
      else if (sql.includes('FROM submission_files')) {
        rows = [
          { submission_id: 11, r2_key: 's/11/a.jpg', content_type: 'image/jpeg' },
          { submission_id: 11, r2_key: 's/11/b.jpg', content_type: 'image/jpeg' },
          { submission_id: 12, r2_key: 's/12/a.jpg', content_type: 'image/jpeg' },
        ];
      } else if (sql.includes('FROM evaluations ev JOIN evaluation_items')) {
        rows = [
          { submission_id: 11, exercise_id: 'I.1', points: 4.5 },
          { submission_id: 11, exercise_id: 'II.1', points: 2 },
          { submission_id: 12, exercise_id: 'I.1', points: 4.5 },
          { submission_id: 12, exercise_id: 'II.1', points: 2 },
        ];
      }
      return rows as T[];
    },
    download: async (key, file) => {
      writeFileSync(file, `bytes of ${key}`);
    },
  };
}

interface Call {
  side: string;
  mode: string;
  notes: string | null;
  subject: string | null;
  required: string[];
  files: string[];
}

// A Claude that answers by mode, and notes which skill and which files each run saw.
function fakeClaude(subject = 'matematica') {
  const calls: Call[] = [];
  const read = (cwd: string, file: string) => (existsSync(path.join(cwd, file)) ? readFileSync(path.join(cwd, file), 'utf8') : null);
  const run = async (task: ClaudeTask): Promise<ClaudeOutcome> => {
    calls.push({
      side: read(task.cwd, '.claude/skills/evaluate-test/SKILL.md')!.trim(),
      mode: task.mode,
      notes: read(task.cwd, 'barem/notes.md'),
      subject: read(task.cwd, 'subject.md'),
      required: (task.jsonSchema as { required: string[] }).required,
      files: readdirSync(task.cwd, { recursive: true }).map(String),
    });
    if (task.mode === 'grade') return answer(GRADING);
    const found = { subject, subjectName: '' };
    return answer(task.mode === 'barem' ? { ...BAREM, ...found } : { ...LIST, ...found });
  };
  return { run, calls };
}

let folder: string;
let temp: string;
let oldSkill: string;
let newSkill: string;
let lines: string[];

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'qe-compare-'));
  temp = mkdtempSync(path.join(tmpdir(), 'qe-compare-temp-'));
  oldSkill = mkdtempSync(path.join(tmpdir(), 'qe-old-skill-'));
  newSkill = mkdtempSync(path.join(tmpdir(), 'qe-new-skill-'));
  writeFileSync(path.join(oldSkill, 'SKILL.md'), 'old');
  writeFileSync(path.join(newSkill, 'SKILL.md'), 'new');
  lines = [];
});

afterEach(() => {
  for (const dir of [folder, temp, oldSkill, newSkill]) rmSync(dir, { recursive: true, force: true });
});

const compare = (args: string[], claude = fakeClaude(), live = fakeLive()) =>
  compareSkills(args, { RUNNER_TEMP: temp }, { claude: claude.run, live, oldSkillDir: oldSkill, workdir: { skillDir: newSkill }, print: (line) => lines.push(line) });

describe('compare:skills', () => {
  it('lists the tests that can be compared, with no student in them', async () => {
    expect(await compare(['list'])).toBe(0);
    expect(lines).toEqual(['6E2-26T1 · Fracții · 2 lucrări corectate · 3 punctaje schimbate de profesor']);
  });

  it('grades the same test with both skills, the way the robot does, and writes a report that passes', async () => {
    const claude = fakeClaude();
    expect(await compare(['run', folder, '6e2-26t1', '--papers', '2'], claude)).toBe(0);
    // A list, a barem and two papers on each side.
    expect(claude.calls.filter((call) => call.side === 'old')).toHaveLength(4);
    expect(claude.calls.filter((call) => call.side === 'new')).toHaveLength(4);
    const list = (side: string) => claude.calls.find((call) => call.side === side && call.mode === 'exercise-list')!;
    expect(list('old').notes).toBe(`${OLD_BAREM_NOTES}\nAcceptă și metoda grafică.\n`);
    expect(list('new').notes).toBe(`${DEFAULT_BAREM_NOTES}\nAcceptă și metoda grafică.\n`);
    expect(list('old').required).not.toContain('subject');
    expect(list('new').required).toContain('subject');
    const grades = claude.calls.filter((call) => call.mode === 'grade');
    expect(grades.filter((call) => call.side === 'old').map((call) => call.subject)).toEqual([null, null]);
    expect(grades.filter((call) => call.side === 'new').map((call) => call.subject)).toEqual(['matematica\n', 'matematica\n']);
    expect(grades.map((call) => call.files.filter((file) => file.startsWith('student')).length).sort()).toEqual([2, 2, 3, 3]);
    const report = readFileSync(path.join(folder, 'report.md'), 'utf8');
    expect(report).toContain('Rezultat: **trece** pe toate testele.');
    expect(report).toContain('| Lucrarea 2 | 7,5 | 7,5 | 7,5 |');
    expect(existsSync(path.join(folder, '6E2-26T1', 'papers', '1', 'page-02.jpg'))).toBe(true);
    expect(existsSync(path.join(folder, '6E2-26T1', 'new', 'grading-2.json'))).toBe(true);
    expect(lines.at(-1)).toContain('Șterge dosarul după ce citești raportul');
    expect(readdirSync(path.join(temp, 'qe'))).toEqual([]);
  });

  it('fails when the new skill does not find math', async () => {
    expect(await compare(['run', folder, '6E2-26T1'], fakeClaude('fizica'))).toBe(2);
    expect(readFileSync(path.join(folder, 'report.md'), 'utf8')).toContain('Materia găsită cu lista de exerciții nu este matematica (fizica).');
  });

  it('reads only: every query is a SELECT', async () => {
    const live = fakeLive();
    await compare(['run', folder, '6E2-26T1'], fakeClaude(), live);
    expect(live.queries.length).toBeGreaterThan(0);
    for (const sql of live.queries) expect(sql.trim()).toMatch(/^SELECT /);
  });

  it('refuses a folder inside the repo: the papers of the students must not land there', async () => {
    expect(insideRepo(path.join(REPO_DIR, 'compare'))).toBe(true);
    expect(insideRepo(REPO_DIR)).toBe(true);
    expect(insideRepo(folder)).toBe(false);
    expect(await compare(['run', path.join(REPO_DIR, 'compare'), '6E2-26T1'])).toBe(1);
    expect(lines.at(-1)).toBe('Alege un dosar în afara proiectului: în el ajung lucrările elevilor.');
  });

  it('shows how to use it, and needs the Claude token', async () => {
    expect(await compare(['run', folder])).toBe(1);
    expect(lines.at(-1)).toMatch(/^Folosire:/);
    expect(await compare(['run', folder, 'not-a-code'])).toBe(1);
    const noClaude = await compareSkills(['run', folder, '6E2-26T1'], {}, { live: fakeLive(), print: (line) => lines.push(line) });
    expect(noClaude).toBe(1);
    expect(lines.at(-1)).toMatch(/CLAUDE_CODE_OAUTH_TOKEN/);
  });
});

describe('the old side', () => {
  it('has the barem note from before the change, and the rest of the notes as now', () => {
    expect(OLD_BAREM_NOTES.split('\n')[0]).toBe(
      'Nu puncta rezolvările care nu se bazează pe ipoteza problemei sau care nu au legătură cu cerințele problemei.',
    );
    expect(OLD_BAREM_NOTES.split('\n').slice(1)).toEqual(DEFAULT_BAREM_NOTES.split('\n').slice(1));
  });

  it('takes the skill of a git ref', async () => {
    const dir = await skillOfRef('HEAD', path.join(temp, 'old-skill'));
    expect(readFileSync(path.join(dir, 'SKILL.md'), 'utf8')).toMatch(/^---\nname: evaluate-test\n/);
    expect(existsSync(path.join(dir, 'references', 'grading-rules.md'))).toBe(true);
  });
});
```

- [ ] **Step 3: Edit `runner/workdir.test.ts`**

Find this block:

```ts

  it('writes the subject in subject.md, and nothing for no subject or a subject the robot does not grade', async () => {
```

Replace it with:

```ts

  it('can carry other barem rules than the default ones, for the skills comparison', async () => {
    const folder = await makeWorkFolder(root, 'other-notes', { test: pdf('test'), barem: pdf('barem'), baremNotes: 'Notă.' }, { skillDir, defaultNotes: 'Regula veche.' });
    expect(readFileSync(path.join(folder, 'barem', 'notes.md'), 'utf8')).toBe('Regula veche.\nNotă.\n');
  });

  it('writes the subject in subject.md, and nothing for no subject or a subject the robot does not grade', async () => {
```

- [ ] **Step 4: Run the new tests and see them fail**

Run: `npx vitest run runner/compareReport.test.ts runner/compareSkills.test.ts runner/workdir.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  1 failed | 15 passed (16)`: `Cannot find module './compareReport.ts'` and `'./compareSkills.ts'`, and the work folder ignores `defaultNotes` (`expected 'Nu puncta …' to be 'Regula veche.\nNotă.\n'`).

- [ ] **Step 5: Create `runner/compareReport.ts`**

```ts
import type { ExerciseList, FoundSubject, GeneratedBarem, Grading } from '../shared/schemas.ts';
import { formatPoints, round2 } from '../shared/scoring.ts';

// The report of `npm run compare:skills` (spec: any subject, "The math
// comparison"): the old grading skill against the new one on real math tests,
// and both against the teacher's final points. Pure functions, so the rules of
// the verdict are tested. Papers are numbered, never named.

export type Side = 'old' | 'new';

export interface PaperRun {
  // 1, 2, … in the order the tool read the papers.
  paper: number;
  // The checked grading of each side; null when that side could not grade it.
  old: Grading | null;
  new: Grading | null;
  // The teacher's final points of each exercise (evaluation_items.points).
  teacher: Record<string, number>;
}

export interface TestRun {
  code: string;
  // The exercise list that the live test uses: both sides grade against it.
  liveList: ExerciseList;
  lists: Record<Side, ExerciseList | null>;
  barems: Record<Side, GeneratedBarem | null>;
  // What the new skill found, with the list and with the barem.
  subjects: { list: FoundSubject | null; barem: FoundSubject | null };
  papers: PaperRun[];
}

export interface Verdict {
  pass: boolean;
  // Romanian, one line per rule that failed.
  reasons: string[];
}

// The largest rise of the mean distance from the teacher's points, per paper.
export const MAX_DISTANCE_RISE = 0.1;
// The share of flags by which the two skills may differ.
export const MAX_FLAG_CHANGE = 0.1;

// The ids and points of a list, with its totals, as one comparable text.
export function listShape(list: ExerciseList): string {
  const items = list.exercises.map((exercise) => `${exercise.id}:${formatPoints(exercise.maxPoints)}`);
  return [`total ${formatPoints(list.totalPoints)}`, `oficiu ${formatPoints(list.officePoints)}`, ...items].join(' | ');
}

// The variants, subjects and items of a barem with their points, as one comparable text.
export function baremShape(barem: GeneratedBarem): string {
  const parts = barem.parts.map((part) => {
    const sections = part.sections.map((section) => {
      const items = section.items.map((item) => `${item.label} ${item.steps.reduce((sum, step) => sum + step.points, 0)}p`);
      return `${section.title} (${section.points}p): ${items.join(', ')}`;
    });
    return `${part.title || '—'}: ${sections.join('; ')}`;
  });
  return [`total ${barem.total}`, `oficiu ${barem.officePoints}`, ...parts].join(' | ');
}

function teacherTotal(paper: PaperRun, grading: Grading): number {
  return round2(grading.items.reduce((sum, item) => sum + (paper.teacher[item.exerciseId] ?? 0), grading.officePoints));
}

// The mean distance between a side's totals and the teacher's, over the papers
// both sides graded; null when there is none.
export function meanDistance(run: TestRun, side: Side): number | null {
  const both = run.papers.filter((paper) => paper.old && paper.new);
  if (both.length === 0) return null;
  const sum = both.reduce((total, paper) => total + Math.abs(paper[side]!.total - teacherTotal(paper, paper[side]!)), 0);
  return round2(sum / both.length);
}

// The items a side flagged, over the papers both sides graded.
export function flagCount(run: TestRun, side: Side): number {
  return run.papers
    .filter((paper) => paper.old && paper.new)
    .reduce((count, paper) => count + paper[side]!.items.filter((item) => item.needsReview).length, 0);
}

export interface ItemDifference {
  exerciseId: string;
  teacher: number | null;
  old: { points: number; flagged: boolean; comment: string };
  new: { points: number; flagged: boolean; comment: string };
}

// The items whose points or flag differ between the two sides.
export function differences(paper: PaperRun): ItemDifference[] {
  if (!paper.old || !paper.new) return [];
  const newer = new Map(paper.new.items.map((item) => [item.exerciseId, item]));
  return paper.old.items.flatMap((before) => {
    const after = newer.get(before.exerciseId);
    if (!after || (after.points === before.points && after.needsReview === before.needsReview)) return [];
    return [
      {
        exerciseId: before.exerciseId,
        teacher: paper.teacher[before.exerciseId] ?? null,
        old: { points: before.points, flagged: before.needsReview, comment: before.comment },
        new: { points: after.points, flagged: after.needsReview, comment: after.comment },
      },
    ];
  });
}

// The rules of the spec, for one test.
export function verdict(run: TestRun): Verdict {
  const reasons: string[] = [];
  for (const [where, found] of [['lista de exerciții', run.subjects.list], ['baremul generat', run.subjects.barem]] as const) {
    if (found?.value !== 'matematica') reasons.push(`Materia găsită cu ${where} nu este matematica (${found ? found.value : 'niciuna'}).`);
  }
  if (!run.lists.old || !run.lists.new) reasons.push('O parte nu a făcut lista de exerciții.');
  else if (listShape(run.lists.old) !== listShape(run.lists.new)) reasons.push('Listele de exerciții au alte exerciții sau alte punctaje.');
  if (!run.barems.old || !run.barems.new) reasons.push('O parte nu a generat baremul.');
  else if (baremShape(run.barems.old) !== baremShape(run.barems.new)) reasons.push('Baremele generate au altă structură sau alte punctaje.');
  const graded = run.papers.filter((paper) => paper.old && paper.new).length;
  if (graded < run.papers.length) reasons.push(`${run.papers.length - graded} lucrări nu au fost corectate de ambele părți.`);
  const [before, after] = [meanDistance(run, 'old'), meanDistance(run, 'new')];
  if (before !== null && after !== null && after > round2(before + MAX_DISTANCE_RISE)) {
    reasons.push(`Noua corectare se depărtează mai mult de punctajele profesorului: ${formatPoints(after)} față de ${formatPoints(before)} puncte pe lucrare.`);
  }
  const [flagsBefore, flagsAfter] = [flagCount(run, 'old'), flagCount(run, 'new')];
  if (Math.abs(flagsAfter - flagsBefore) > Math.ceil(MAX_FLAG_CHANGE * Math.max(flagsBefore, flagsAfter))) {
    reasons.push(`Numărul de puncte de verificat s-a schimbat prea mult: ${flagsAfter} față de ${flagsBefore}.`);
  }
  return { pass: reasons.length === 0, reasons };
}

const points = (value: number | null) => (value === null ? '—' : formatPoints(value));

// The whole report, in Romanian Markdown.
export function reportMarkdown(runs: TestRun[]): string {
  const lines = ['# Comparația corectării la matematică', ''];
  const verdicts = runs.map(verdict);
  lines.push(verdicts.every((one) => one.pass) ? 'Rezultat: **trece** pe toate testele.' : 'Rezultat: **nu trece**. Motivele sunt la fiecare test.', '');
  runs.forEach((run, index) => {
    const result = verdicts[index]!;
    lines.push(`## Testul ${run.code}`, '');
    lines.push(result.pass ? 'Trece.' : 'Nu trece:', ...result.reasons.map((reason) => `- ${reason}`), '');
    lines.push(`- Materia găsită: cu lista ${run.subjects.list?.value ?? '—'}, cu baremul ${run.subjects.barem?.value ?? '—'}.`);
    lines.push(`- Lista folosită pe site: ${listShape(run.liveList)}`);
    lines.push(`- Lista veche: ${run.lists.old ? listShape(run.lists.old) : '—'}`);
    lines.push(`- Lista nouă: ${run.lists.new ? listShape(run.lists.new) : '—'}`);
    lines.push(`- Baremul vechi: ${run.barems.old ? baremShape(run.barems.old) : '—'}`);
    lines.push(`- Baremul nou: ${run.barems.new ? baremShape(run.barems.new) : '—'}`);
    lines.push(
      `- Distanța medie față de profesor, pe lucrare: veche ${points(meanDistance(run, 'old'))}, nouă ${points(meanDistance(run, 'new'))}.`,
      `- Puncte de verificat: vechi ${flagCount(run, 'old')}, noi ${flagCount(run, 'new')}.`,
      '',
      '| Lucrarea | Veche | Nouă | Profesor |',
      '| --- | --- | --- | --- |',
    );
    for (const paper of run.papers) {
      const teacher = paper.old ? teacherTotal(paper, paper.old) : paper.new ? teacherTotal(paper, paper.new) : null;
      lines.push(`| Lucrarea ${paper.paper} | ${points(paper.old?.total ?? null)} | ${points(paper.new?.total ?? null)} | ${points(teacher)} |`);
    }
    lines.push('');
    for (const paper of run.papers) {
      const changed = differences(paper);
      if (changed.length === 0) continue;
      lines.push(`### Lucrarea ${paper.paper}: ce diferă`, '');
      for (const item of changed) {
        const flag = (flagged: boolean) => (flagged ? ', de verificat' : '');
        lines.push(
          `- ${item.exerciseId} (profesor: ${points(item.teacher)})`,
          `  - veche: ${formatPoints(item.old.points)}${flag(item.old.flagged)}. ${item.old.comment}`,
          `  - nouă: ${formatPoints(item.new.points)}${flag(item.new.flagged)}. ${item.new.comment}`,
        );
      }
      lines.push('');
    }
  });
  return `${lines.join('\n').trimEnd()}\n`;
}
```

- [ ] **Step 6: Create `runner/compareSkills.ts`**

```ts
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extensionFor } from '../shared/files.ts';
import {
  checkExerciseList,
  checkGeneratedBarem,
  checkGrading,
  claudeJsonSchema,
  type ExerciseList,
  exerciseListAnswerSchema,
  exerciseListSchema,
  generatedBaremAnswerSchema,
  generatedBaremSchema,
  gradingResultSchema,
  subjectOf,
} from '../shared/schemas.ts';
import { normalizeTestCode } from '../shared/tests.ts';
import type { ClaudeMode, ClaudeOutcome, ClaudeRunner } from './claude.ts';
import { claudeRunner, claudeSettings } from './claude.ts';
import { type PaperRun, reportMarkdown, type Side, type TestRun, verdict } from './compareReport.ts';
import type { TaskFile, WorkFolderInput, WorkFolderOptions } from './workdir.ts';
import { DEFAULT_BAREM_NOTES, makeWorkFolder, removeFolder, runFolder, SKILL_DIR } from './workdir.ts';

// `npm run compare:skills` (spec: any subject, "The math comparison"): grades
// real math tests of the live site with the old grading skill (from `main`)
// and the new one, the way the robot does, and writes a report that compares
// both with the teacher's final points. It only reads the live database and
// R2, through Wrangler and the user's own login. Everything it reads lands in
// a folder outside the repo, and the papers are numbered, never named.
//
//   npm run compare:skills -- list
//   npm run compare:skills -- run <folder> <code> <code> [--papers 10] [--parallel 2] [--ref origin/main]

const USAGE =
  'Folosire: npm run compare:skills -- list   sau   npm run compare:skills -- run <dosar> <cod test> <cod test> [--papers 10] [--parallel 2] [--ref origin/main]';

export const REPO_DIR = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

// The first barem note before the change (spec: "ipoteza problemei"): the old
// side grades with the old note, the new side with DEFAULT_BAREM_NOTES.
export const OLD_BAREM_NOTES = [
  'Nu puncta rezolvările care nu se bazează pe ipoteza problemei sau care nu au legătură cu cerințele problemei.',
  ...DEFAULT_BAREM_NOTES.split('\n').slice(1),
].join('\n');

// The live site, read only.
export interface Live {
  query<T>(sql: string): Promise<T[]>;
  // Saves the R2 object to the file.
  download(key: string, file: string): Promise<void>;
}

function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout),
    );
  });
}

// The live D1 and R2 through Wrangler, with the user's Wrangler login.
export function wranglerLive(): Live {
  const wrangler = (args: string[]) => run(process.execPath, [WRANGLER, ...args], REPO_DIR);
  return {
    query: async <T,>(sql: string) => {
      const out = await wrangler(['d1', 'execute', 'quickeval', '--remote', '--json', '--command', sql]);
      const parsed = JSON.parse(out) as { results: T[] }[];
      return parsed[0]?.results ?? [];
    },
    download: async (key, file) => {
      await wrangler(['r2', 'object', 'get', `quickeval-files/${key}`, '--remote', '--file', file]);
    },
  };
}

export interface CompareOptions {
  claude?: ClaudeRunner;
  live?: Live;
  print?: (line: string) => void;
  // The old skill's folder; by default taken from `git archive <ref>`.
  oldSkillDir?: string;
  workdir?: WorkFolderOptions;
}

interface Candidate {
  code: string;
  title: string;
  graded: number;
  corrected: number;
}

const CANDIDATES = `SELECT t.code, t.title,
  (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status = 'graded') AS graded,
  (SELECT COUNT(*) FROM evaluation_items i JOIN evaluations ev ON ev.id = i.evaluation_id JOIN submissions s ON s.id = ev.submission_id
     WHERE s.test_id = t.id AND i.changed_by_teacher = 1) AS corrected
  FROM tests t
  WHERE t.quick_try = 0 AND t.test_file_key IS NOT NULL AND t.barem_file_key IS NOT NULL AND t.exercise_list_json IS NOT NULL
  ORDER BY corrected DESC, graded DESC LIMIT 20`;

// One live test with its files and graded papers, in the folder.
interface TestData {
  code: string;
  test: TaskFile;
  barem: TaskFile;
  baremNotes: string;
  liveList: ExerciseList;
  papers: { pages: TaskFile[]; teacher: Record<string, number> }[];
}

async function fetchTest(live: Live, code: string, dir: string, papers: number): Promise<TestData> {
  // The code is checked by normalizeTestCode: safe inside the SQL text.
  const rows = await live.query<{
    id: number;
    test_file_key: string;
    test_file_type: string;
    barem_file_key: string;
    barem_file_type: string;
    barem_notes: string | null;
    exercise_list_json: string;
  }>(
    `SELECT id, test_file_key, test_file_type, barem_file_key, barem_file_type, barem_notes, exercise_list_json FROM tests
     WHERE code = '${code}' AND quick_try = 0 AND test_file_key IS NOT NULL AND barem_file_key IS NOT NULL AND exercise_list_json IS NOT NULL`,
  );
  if (rows.length !== 1) throw new Error(rows.length === 0 ? `Testul ${code} nu există sau nu are testul, baremul și lista.` : `Codul ${code} este la mai mulți profesori.`);
  const row = rows[0]!;
  await mkdir(path.join(dir, 'papers'), { recursive: true });
  const teacherFile = async (kind: 'test' | 'barem', key: string, type: string): Promise<TaskFile> => {
    const file = path.join(dir, `${kind}.${extensionFor(type)}`);
    await live.download(key, file);
    return { bytes: await readFile(file), contentType: type };
  };
  const test = await teacherFile('test', row.test_file_key, row.test_file_type);
  const barem = await teacherFile('barem', row.barem_file_key, row.barem_file_type);
  // The class papers only: a CES paper has another list.
  const ids = (
    await live.query<{ id: number }>(
      `SELECT id FROM submissions WHERE test_id = ${Number(row.id)} AND status = 'graded' AND COALESCE(variant, 'class') <> 'ces' ORDER BY id LIMIT ${papers}`,
    )
  ).map((paper) => Number(paper.id));
  const files = ids.length
    ? await live.query<{ submission_id: number; r2_key: string; content_type: string }>(
        `SELECT submission_id, r2_key, content_type FROM submission_files WHERE submission_id IN (${ids.join(',')}) ORDER BY submission_id, position`,
      )
    : [];
  const items = ids.length
    ? await live.query<{ submission_id: number; exercise_id: string; points: number }>(
        `SELECT ev.submission_id, i.exercise_id, i.points FROM evaluations ev JOIN evaluation_items i ON i.evaluation_id = ev.id
         WHERE ev.submission_id IN (${ids.join(',')})`,
      )
    : [];
  const result: TestData['papers'] = [];
  for (const [index, id] of ids.entries()) {
    const pages: TaskFile[] = [];
    for (const [page, file] of files.filter((one) => Number(one.submission_id) === id).entries()) {
      const name = path.join(dir, 'papers', String(index + 1), `page-${String(page + 1).padStart(2, '0')}.${extensionFor(file.content_type)}`);
      await mkdir(path.dirname(name), { recursive: true });
      await live.download(file.r2_key, name);
      pages.push({ bytes: await readFile(name), contentType: file.content_type });
    }
    const teacher = Object.fromEntries(items.filter((item) => Number(item.submission_id) === id).map((item) => [item.exercise_id, Number(item.points)]));
    result.push({ pages, teacher });
  }
  return { code, test, barem, baremNotes: row.barem_notes ?? '', liveList: JSON.parse(row.exercise_list_json) as ExerciseList, papers: result };
}

// At most `size` tasks at once.
async function pool(tasks: (() => Promise<void>)[], size: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]!();
  };
  await Promise.all(Array.from({ length: Math.max(1, size) }, worker));
}

// The old skill's folder, from `git archive <ref>`.
export async function oldSkill(ref: string, into: string): Promise<string> {
  await mkdir(into, { recursive: true });
  const tar = path.join(into, 'skill.tar');
  await run('git', ['archive', '--format=tar', `--output=${tar}`, ref, '.claude/skills/evaluate-test'], REPO_DIR);
  // A relative name: GNU tar (Git for Windows) reads "C:" in a path as a remote host.
  await run('tar', ['-xf', 'skill.tar'], into);
  return path.join(into, '.claude', 'skills', 'evaluate-test');
}

function option(args: string[], name: string, fallback: string): string {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1]! : fallback;
}

// Whether `folder` is inside the repo: student pages must never land there.
export function insideRepo(folder: string, repo = REPO_DIR): boolean {
  const relative = path.relative(path.resolve(repo), path.resolve(folder));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function compareSkills(args: string[], env: Record<string, string | undefined>, options: CompareOptions = {}): Promise<number> {
  const print = options.print ?? ((line: string) => console.log(line));
  const live = options.live ?? wranglerLive();
  if (args[0] === 'list') {
    const candidates = await live.query<Candidate>(CANDIDATES);
    if (candidates.length === 0) print('Nu am găsit niciun test cu test, barem și lucrări corectate.');
    for (const one of candidates) print(`${one.code} · ${one.title} · ${one.graded} lucrări corectate · ${one.corrected} punctaje schimbate de profesor`);
    return 0;
  }
  const [mode, folderArg, ...rest] = args;
  const codes = rest.filter((arg, index) => !arg.startsWith('--') && !rest[index - 1]?.startsWith('--')).map(normalizeTestCode);
  const papers = Number(option(rest, '--papers', '10'));
  const parallel = Number(option(rest, '--parallel', '2'));
  if (mode !== 'run' || !folderArg || codes.length === 0 || codes.some((code) => code === null) || !(papers >= 1) || !(parallel >= 1)) {
    print(USAGE);
    return 1;
  }
  const folder = path.resolve(folderArg);
  if (insideRepo(folder)) {
    print('Alege un dosar în afara proiectului: în el ajung lucrările elevilor.');
    return 1;
  }
  if (!options.claude && !env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {
    print('Lipsește CLAUDE_CODE_OAUTH_TOKEN. Fă tokenul cu „claude setup-token” și pune-l în această variabilă.');
    return 1;
  }
  const root = runFolder(env, `compare-${randomBytes(4).toString('hex')}`);
  try {
    const configDir = path.join(root, 'claude-config');
    await mkdir(configDir, { recursive: true });
    const claude = options.claude ?? claudeRunner(claudeSettings(env, configDir));
    const skills: Record<Side, string> = {
      old: options.oldSkillDir ?? (await oldSkill(option(rest, '--ref', 'origin/main'), path.join(folder, 'old-skill'))),
      new: options.workdir?.skillDir ?? SKILL_DIR,
    };
    const notes: Record<Side, string> = { old: OLD_BAREM_NOTES, new: DEFAULT_BAREM_NOTES };
    // The old robot asked for no subject; the new one asks in two modes.
    const schemas: Record<Side, Record<'exercise-list' | 'barem', object>> = {
      old: { 'exercise-list': claudeJsonSchema(exerciseListSchema), barem: claudeJsonSchema(generatedBaremSchema) },
      new: { 'exercise-list': claudeJsonSchema(exerciseListAnswerSchema), barem: claudeJsonSchema(generatedBaremAnswerSchema) },
    };
    let task = 0;
    const ask = async (side: Side, mode: ClaudeMode, input: WorkFolderInput, keep: string): Promise<ClaudeOutcome> => {
      const taskId = `${mode}-${side}-${task++}`;
      try {
        const cwd = await makeWorkFolder(root, taskId, input, { ...options.workdir, skillDir: skills[side], defaultNotes: notes[side] });
        const jsonSchema = mode === 'grade' ? claudeJsonSchema(gradingResultSchema) : schemas[side][mode as 'exercise-list' | 'barem'];
        const outcome = await claude({ mode, cwd, jsonSchema });
        await writeFile(keep, `${JSON.stringify(outcome.ok ? outcome.output : { problem: outcome.problem, detail: outcome.detail }, null, 2)}\n`);
        if (!outcome.ok) print(`${path.basename(keep)}: Claude nu a reușit (${outcome.problem}).`);
        return outcome;
      } finally {
        await removeFolder(path.join(root, taskId));
      }
    };
    const runs: TestRun[] = [];
    for (const code of codes as string[]) {
      const dir = path.join(folder, code);
      print(`Citesc testul ${code}…`);
      const data = await fetchTest(live, code, dir, papers);
      for (const side of ['old', 'new'] as const) await mkdir(path.join(dir, side), { recursive: true });
      const testRun: TestRun = {
        code,
        liveList: data.liveList,
        lists: { old: null, new: null },
        barems: { old: null, new: null },
        subjects: { list: null, barem: null },
        papers: data.papers.map((paper, index): PaperRun => ({ paper: index + 1, old: null, new: null, teacher: paper.teacher })),
      };
      const tasks: (() => Promise<void>)[] = [];
      for (const side of ['old', 'new'] as const) {
        tasks.push(async () => {
          const outcome = await ask(side, 'exercise-list', { test: data.test, barem: data.barem, baremNotes: data.baremNotes }, path.join(dir, side, 'exercises.json'));
          const checked = outcome.ok ? checkExerciseList(outcome.output) : null;
          testRun.lists[side] = checked?.ok ? checked.value.list : null;
          if (side === 'new' && outcome.ok) testRun.subjects.list = subjectOf(outcome.output);
        });
        tasks.push(async () => {
          const outcome = await ask(side, 'barem', { test: data.test }, path.join(dir, side, 'barem.json'));
          const checked = outcome.ok ? checkGeneratedBarem(outcome.output) : null;
          testRun.barems[side] = checked?.ok ? checked.value : null;
          if (side === 'new' && outcome.ok) testRun.subjects.barem = subjectOf(outcome.output);
        });
        data.papers.forEach((paper, index) => {
          tasks.push(async () => {
            // Both sides grade against the list the live test uses; only the new side is told the subject.
            const subject = side === 'new' ? ('matematica' as const) : undefined;
            const input = { test: data.test, barem: data.barem, baremNotes: data.baremNotes, exerciseList: data.liveList, pages: paper.pages, subject };
            const outcome = await ask(side, 'grade', input, path.join(dir, side, `grading-${index + 1}.json`));
            const checked = outcome.ok ? checkGrading(outcome.output, data.liveList, subject ?? null) : null;
            testRun.papers[index]![side] = checked?.ok ? checked.value : null;
          });
        });
      }
      print(`Claude lucrează la testul ${code}: ${tasks.length} sarcini…`);
      await pool(tasks, parallel);
      runs.push(testRun);
    }
    await writeFile(path.join(folder, 'report.md'), reportMarkdown(runs));
    await writeFile(path.join(folder, 'results.json'), `${JSON.stringify(runs, null, 2)}\n`);
    const passed = runs.every((one) => verdict(one).pass);
    print(passed ? 'Rezultat: trece.' : 'Rezultat: nu trece.');
    print(`Am scris ${path.join(folder, 'report.md')}. Șterge dosarul după ce citești raportul: are lucrările elevilor.`);
    return passed ? 0 : 2;
  } finally {
    await removeFolder(root);
  }
}

if (import.meta.main) {
  process.exitCode = await compareSkills(process.argv.slice(2), process.env);
}
```

- [ ] **Step 7: Edit `runner/workdir.ts`**

Find this block:

```ts
  pandoc?: Pandoc;
}
```

Replace it with:

```ts
  pandoc?: Pandoc;
  // The rules every barem carries; DEFAULT_BAREM_NOTES unless the skills comparison asks for the old ones.
  defaultNotes?: string;
}
```

- [ ] **Step 8: Edit `runner/workdir.ts`**

Find this block:

```ts
    const teacherNotes = input.baremNotes?.trim();
    const notes = teacherNotes ? `${DEFAULT_BAREM_NOTES}\n${teacherNotes}` : DEFAULT_BAREM_NOTES;
    await writeFile(path.join(folder, 'barem', 'notes.md'), `${notes}\n`);
```

Replace it with:

```ts
    const teacherNotes = input.baremNotes?.trim();
    const base = options.defaultNotes ?? DEFAULT_BAREM_NOTES;
    const notes = teacherNotes ? `${base}\n${teacherNotes}` : base;
    await writeFile(path.join(folder, 'barem', 'notes.md'), `${notes}\n`);
```

- [ ] **Step 9: Edit `package.json`**

Find this block:

```json
    "try:skill": "node runner/trySkill.ts",
    "set-password": "node scripts/setPassword.ts"
```

Replace it with:

```json
    "try:skill": "node runner/trySkill.ts",
    "compare:skills": "node runner/compareSkills.ts",
    "set-password": "node scripts/setPassword.ts"
```

- [ ] **Step 10: Edit `AGENTS.md`**

Find this block:

```markdown
- `npm run db:local`, then `npm run preview`, then `npm run smoke` in a second terminal: the production build on http://127.0.0.1:8788 and its smoke test. Each smoke run leaves one class with one student in the local database, and makes a new local robot key.
- `npm run try:skill`: try the grading skill on this PC (see `runner/AGENTS.md`).
- Claude Code preview servers (`.claude/launch.json`): `api` (8788) and `web` (5173) for development, `preview` (8788) for the production build.
```

Replace it with:

```markdown
- `npm run db:local`, then `npm run preview`, then `npm run smoke` in a second terminal: the production build on http://127.0.0.1:8788 and its smoke test. Each smoke run leaves one class with one student in the local database, and makes a new local robot key.
- `npm run try:skill`: try the grading skill on this PC (see `runner/AGENTS.md`). `npm run compare:skills`: the old grading skill against the new one on real math tests of the live site (see `runner/AGENTS.md`).
- Claude Code preview servers (`.claude/launch.json`): `api` (8788) and `web` (5173) for development, `preview` (8788) for the production build.
```

- [ ] **Step 11: Edit `runner/AGENTS.md`**

Find this block:

```markdown

## Rules
```

Replace it with:

```markdown

## Compare the skills

`npm run compare:skills -- list`, then `npm run compare:skills -- run <folder> <code> <code> [--papers 10] [--parallel 2] [--ref origin/main]`: grades real math tests of the live site with the grading skill of `--ref` (default `origin/main`, what the live site runs; run `git fetch` first) (the old side, with the barem note it had, `OLD_BAREM_NOTES`, and no `subject.md`) and with this checkout's skill (the new side), exactly as the robot runs Claude, and writes `report.md` and `results.json` in the folder (spec: any subject, "The math comparison"; `compareReport.ts` holds the rules of the verdict). It reads the live D1 and R2 through Wrangler with the user's own login, with SELECTs only, and needs `CLAUDE_CODE_OAUTH_TOKEN` like `try:skill`. The folder must be outside the repo: it gets the test, the barem and the students' pages (numbered, never named). Delete it after reading the report. Exit code 0: it passes; 2: it does not.

## Rules
```

- [ ] **Step 12: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  175 passed | 1 skipped (176)`, `Tests  2601 passed | 3 skipped (2604)`.

- [ ] **Step 13: Commit**

```bash
git add runner/compareReport.ts runner/compareReport.test.ts runner/compareSkills.ts runner/compareSkills.test.ts runner/workdir.ts runner/workdir.test.ts package.json AGENTS.md runner/AGENTS.md
git commit -m "Compare the old and the new grading skill on real math tests"
```

### Task 5: The math comparison, the live database, push (main session only)

- [ ] **Step 1: Run every test once more, in UTC**

Run (Git Bash): `TZ=UTC npm test`
Expected: `Test Files  175 passed | 1 skipped (176)`, `Tests  2601 passed | 3 skipped (2604)`.

- [ ] **Step 2: Check that the old side is what the live site runs**

Run: `git fetch origin`, then `git diff --stat origin/main...HEAD -- .claude/skills/evaluate-test runner/workdir.ts`
Expected: only the files of this plan (`SKILL.md`, `references/subjects/*.md`, `runner/workdir.ts`). If other changes show, rebase the branch on `origin/main` first, so the report does not blame this plan for them.

- [ ] **Step 3: Pick the two math tests — with the user**

The user runs, in a terminal with their Wrangler login: `npm run compare:skills -- list`
Expected: up to 20 lines `<code> · <title> · N lucrări corectate · M punctaje schimbate de profesor`. The user picks two codes (the spec: math tests of Laura Miron's account, with teacher corrections if possible).

- [ ] **Step 4: Run the comparison — the user runs it**

The user runs, with `CLAUDE_CODE_OAUTH_TOKEN` set and a folder outside the repo: `npm run compare:skills -- run <folder> <code> <code>`
Expected: `Rezultat: trece.` and `<folder>/report.md`. It runs Claude about 2 × (2 + 2 × 10) = 44 times; with the plan's usage limit it may need to be run again later (a failed side shows as "nu a reușit" and counts as a failure).

- [ ] **Step 5: Read the report with the user**

Read `<folder>/report.md` with the user: every item that differs. The spec: a failure stops the merge until the math rules are fixed. Two runs of Claude differ a little by nature: when the only failure is the generated barems' structure (a test that prints no points, where Claude shares the 90 points itself), run the comparison once more before you count it as a failure. Then the user deletes the folder (it holds the students' pages).

- [ ] **Step 6: Run the migration on the live database — ask the user first**

Run: `npx wrangler d1 migrations list quickeval --remote`
Expected: only `0028_test_subject.sql` to apply. If another migration is listed, stop and ask the user.

Ask the user, then run: `npx wrangler d1 migrations apply quickeval --remote`
Expected: `0028_test_subject.sql` applied. Only then may the code reach `main`.

- [ ] **Step 7: Push — ask the user first**

Ask the user, then push the branch and open a pull request named "Any subject, part A: the subject, the robot, the skill". Its body names migration 0028 (already live), the seven subjects, the rulings of this plan, and the comparison's result.
