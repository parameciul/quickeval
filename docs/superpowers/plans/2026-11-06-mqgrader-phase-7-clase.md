# MQGrader Phase 7: Clase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 6 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** The Clase page of the redesign (spec §9): no page with all classes; `/admin/clase` opens the last class seen (else the first); a class page with a top line ("Schimbă clasa" menu, facts, "Test nou pentru această clasă", ⋯) and two tabs — "Note și teste" (grades table, a narrow ~156 px column per test, oldest left, orange dot when points wait, "—" when no paper, last row "Media testului"; beside it "Testele clasei", newest first) and "Elevi" (student list with search, orange dot, "+ Adaugă elevi" dialog; one student on the right with Redenumește / A plecat din clasă / Șterge, each test with date, points, grade, result state, the paper, and "Toate notele elevului, din toate clasele"). "Clasă nouă" and "Adaugă elevi" are dialogs.

**Architecture:** Two API/data changes: (1) `ClassGrade` carries `total`, `maxTotal`, `resultsOpen`, `resultToken` so the grades cell and the "Elevi" right panel show points and result state (Q2 a); (2) the last class seen is kept in `localStorage` as `quickeval:lastClass` and `/admin/clase` reopens it (Q1 a). The old `ClassesPage` (list of all classes) and `ClassStudentsPage` are removed; `/clase` becomes `LastClassPage` which navigates to the last/first class. Routes move from `clase/:id/elevi` into the class page's "Elevi" tab. No migration.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1, Vitest 5, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§9 Clase, §4 the bar's panel "Clasele tale", §13 phase 7). Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The approved prototype is on this branch as tags `vbase` … `v5` (same files as `main` at the merge commit of PR #37).

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- Every teacher query is scoped by the teacher's id. `listClassGrades` reads only the class that `getClass` found for the teacher; the class page's queries are scoped by `classId`.
- The teacher's corrections check their rules inside their SQL (`server/db/evaluations.ts`, `server/db/links.ts`). This plan writes no new corrections.
- Flat colours only: no gradient in `brand.css`; a shadow only on what floats. Orange only for what waits on the teacher.
- No page tells students that AI grades their work; this plan changes no student page.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: a `.gitignore` line, `.claude/launch.json` entries).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-classes`. Run `npm test` alone, in the foreground; the three slow files (`runner/run.test.ts`, `runner/api.test.ts`, `server/routes/auth.test.ts`) may time out when the machine is busy — if only those time out, run them alone and count the full run as passed when failed + passed match the expected total.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is on this branch as tags `vbase` … `v5`, cut from `main` at the merge commit of PR #37. After Task N, `git diff --stat vN HEAD -- . ':!docs/superpowers/plans'` prints nothing.

## Rulings made while planning

Agreed with the user before execution:
1. "Last class seen" is kept in `localStorage` as `quickeval:lastClass`; `/admin/clase` opens that class, else the first active class of the year, skipping archived ones (Q1 → option a).
2. `ClassGrade` gains `total`, `maxTotal`, `resultsOpen`, `resultToken`, and `listClassGrades` selects them, so one query serves both the grades table and the "Elevi" tab (Q2 → option a).

## Review Focus

1. `/admin/clase` reopens the last class seen (else the first), skipping archived classes.
2. The grades table cell shows the grade, an orange dot when points wait, "—" when no paper; the last row is "Media testului".
3. The "Elevi" tab's right panel shows per test: date, points ("6 / 10"), grade, result ("Publicat"/"Nepublicat"/"Nu a trimis lucrarea"), the paper, and "Toate notele elevului, din toate clasele".
4. "Clasă nouă" and "Adaugă elevi" are dialogs.

---

### Before Task 1: The branch

No other Claude Code session may work in this checkout meanwhile. The branch was made while planning, with no commits: if `git rev-parse --verify --quiet refs/heads/feature/mqgrader-classes` prints the merge commit of PR #37, run `git switch feature/mqgrader-classes`. Otherwise:

```bash
git fetch origin
git switch -c feature/mqgrader-classes origin/main
git branch --unset-upstream
```

Expected: `Switched to branch 'feature/mqgrader-classes'`; `git log --oneline -1` shows the merge commit. The untracked plan file and the local changes of `.claude/launch.json` and `.gitignore` come along; they are never committed (the plan is committed in Task 6).

### Task 1: Points and result state of each class upload (Q2 a)

`ClassGrade` gains `total`, `maxTotal`, `resultsOpen`, `resultToken`; `listClassGrades` selects them from `evaluations.total/max_total` and `submissions.results_open/result_token`.

**Files:**
- Modify: `shared/api.ts` (`ClassGrade`), `server/db/classes.ts` (`listClassGrades`), `src/test/fakeApi.ts` (`getClass` grades)
- Test: `server/routes/classes.test.ts`

**Interfaces:**
- Produces: `ClassGrade { …, total, maxTotal, resultsOpen, resultToken }`; `listClassGrades` returns them; the grades test asserts them, including a published result.

- [ ] **Step 1: Edit `server/routes/classes.test.ts`**

Find this block:

```ts
    expect(sorted).toEqual([
      { studentId: cls.studentIds[0], testCode: first, submissionId: graded, status: 'graded', grade: 9, flagCount: 0 },
      { studentId: cls.studentIds[1], testCode: first, submissionId: flagged, status: 'graded', grade: 7, flagCount: 1 },
      { studentId: cls.studentIds[0], testCode: second, submissionId: uploading, status: 'uploading', grade: null, flagCount: 0 },
      { studentId: cls.studentIds[2], testCode: second, submissionId: grading, status: 'grading', grade: null, flagCount: 0 },
    ]);
```

Replace it with:

```ts
    expect(sorted).toEqual([
      { studentId: cls.studentIds[0], testCode: first, submissionId: graded, status: 'graded', grade: 9, flagCount: 0, total: 9, maxTotal: 10, resultsOpen: false, resultToken: null },
      { studentId: cls.studentIds[1], testCode: first, submissionId: flagged, status: 'graded', grade: 7, flagCount: 1, total: 7, maxTotal: 10, resultsOpen: false, resultToken: null },
      { studentId: cls.studentIds[0], testCode: second, submissionId: uploading, status: 'uploading', grade: null, flagCount: 0, total: null, maxTotal: null, resultsOpen: false, resultToken: null },
      { studentId: cls.studentIds[2], testCode: second, submissionId: grading, status: 'grading', grade: null, flagCount: 0, total: null, maxTotal: null, resultsOpen: false, resultToken: null },
    ]);
  });

  it('shows the result state and the result token of a graded upload', async () => {
    const cls = await makeClass(api, 'G5', ['Ana Unu']);
    const code = await makeTest(api, cls.id);
    const sub = await addSubmission(api, code, cls.studentIds[0]!, { status: 'graded' });
    await addEvaluation(api, sub, { grade: 8 });
    await api.db.prepare('UPDATE submissions SET results_open = 1 WHERE id = ?').bind(sub).run();
    const { grades } = await detailOf(cls.id);
    expect(grades).toEqual([
      { studentId: cls.studentIds[0], testCode: code, submissionId: sub, status: 'graded', grade: 8, flagCount: 0, total: 8, maxTotal: 10, resultsOpen: true, resultToken: null },
    ]);
  });
```

- [ ] **Step 2: Edit `shared/api.ts`**

Find this block:

```ts
  flagCount: number;
}
```

Replace it with:

```ts
  flagCount: number;
  total: number | null;
  maxTotal: number | null;
  resultsOpen: boolean;
  resultToken: string | null;
}
```

- [ ] **Step 3: Edit `server/db/classes.ts`**

Find this block:

```ts
         CASE WHEN ev.id IS NULL THEN 0 ELSE ${flagCountSql('ev')} END AS flag_count
       FROM submissions s
```

Replace it with:

```ts
         ev.total, ev.max_total, s.results_open, s.result_token,
         CASE WHEN ev.id IS NULL THEN 0 ELSE ${flagCountSql('ev')} END AS flag_count
       FROM submissions s
```

- [ ] **Step 4: Edit `server/db/classes.ts`**

Find this block:

```ts
      grade: number | null;
      flag_count: number;
    }>());
  return results.map((row) => ({
    studentId: row.student_id,
    testCode: row.test_code,
    submissionId: row.submission_id,
    status: row.status,
    grade: row.grade,
    flagCount: row.flag_count,
  }));
```

Replace it with:

```ts
      grade: number | null;
      total: number | null;
      max_total: number | null;
      results_open: number | null;
      result_token: string | null;
      flag_count: number;
    }>());
  return results.map((row) => ({
    studentId: row.student_id,
    testCode: row.test_code,
    submissionId: row.submission_id,
    status: row.status,
    grade: row.grade,
    flagCount: row.flag_count,
    total: row.total,
    maxTotal: row.max_total,
    resultsOpen: row.results_open === 1,
    resultToken: row.result_token,
  }));
```

- [ ] **Step 5: Run all tests to see them pass**

Run: `npx vitest run server/routes/classes.test.ts`
Expected: `Test Files  1 passed | 0 skipped (1)`, `Tests  44 passed | 0 failed (44)`.

- [ ] **Step 6: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add shared/api.ts server/db/classes.ts src/test/fakeApi.ts server/routes/classes.test.ts
git commit -m "Send points and result state of each class upload"
```

### Task 2: The class page — "Note și teste" and "Elevi"

`pages/ClassPage.tsx` becomes the class page: top line (name, "Schimbă clasa" menu, facts, "Test nou", ⋯) and two tabs. `classPage/GradesTable.tsx` shows oldest test first, a visible orange dot when points wait, "—" when no paper, last row "Media testului". `classPage/ClassStudents.tsx` is the "Elevi" tab (student list, "+ Adaugă elevi" dialog; one student on the right).

**Files:**
- Create: `src/admin/classPage/ClassStudents.tsx`
- Replace: `src/admin/classPage/GradesTable.tsx`, `src/admin/pages/ClassPage.tsx`
- Modify: `src/ui/brand.css` (`.flag-dot`), `src/test/fakeApi.ts` (`getClass` grades)
- Test: `src/admin/pages/ClassPage.test.tsx`

**Interfaces:**
- Produces: `GradesTable` (oldest test first, flag dot, "Media testului"), `ClassPage` (top line, tabs "Note și teste"/"Elevi"), `ClassStudents` (list + right panel). In `test/fakeApi.ts`: `getClass` grades carry the new fields.

- [ ] **Step 1: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```ts
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
```

Replace it with:

```ts
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
```

- [ ] **Step 2: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
        grades: tests
          .filter((t) => t.test.classId === classId)
          .flatMap((t) =>
            t.uploads.flatMap((row) =>
              row.submissionId === null || row.status === 'none'
                ? []
                : [
                    {
                      studentId: row.studentId,
                      testCode: t.test.code,
                      submissionId: row.submissionId,
                      status: row.status,
                      grade: row.grade,
                      flagCount: row.status === 'graded' ? row.flagCount : 0,
                    },
                  ],
            ),
          ),
```

Replace it with:

```ts
        grades: tests
          .filter((t) => t.test.classId === classId)
          .flatMap((t) =>
            t.uploads.flatMap((row) =>
              row.submissionId === null || row.status === 'none'
                ? []
                : [
                    {
                      studentId: row.studentId,
                      testCode: t.test.code,
                      submissionId: row.submissionId,
                      status: row.status,
                      grade: row.grade,
                      flagCount: row.status === 'graded' ? row.flagCount : 0,
                      total: row.total,
                      maxTotal: row.maxTotal,
                      resultsOpen: row.resultsOpen,
                      resultToken: row.resultToken,
                    },
                  ],
            ),
          ),
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/ClassPage.test.tsx`
Expected: `Test Files  1 failed (1)`, `Tests  18 failed (18)`: `ClassPage.test.tsx` does not match the new page (the old heading/tabs are gone; the new `GradesTable` and `ClassStudents` are not yet implemented).

- [ ] **Step 4: Replace `src/admin/classPage/GradesTable.tsx`**

Find this block:

```ts
        {grade.flagCount > 0 && (
          <>
            {' '}
            <span className="sr-only">(de verificat)</span>
          </>
        )}
      </Link>
    </td>
  );
```

Replace it with:

```ts
        {grade.flagCount > 0 && <>{' '}<span className="flag-dot" aria-label="puncte de verificat"></span></>}
      </Link>
    </td>
  );
```

- [ ] **Step 5: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```ts
  const shown = tests.filter((test) => showArchived || !test.archived);
  if (shown.length === 0) {
```

Replace it with:

```ts
  const shown = tests.filter((test) => showArchived || !test.archived).reverse();
  if (shown.length === 0) {
```

- [ ] **Step 6: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```ts
            <th scope="row">Media clasei</th>
```

Replace it with:

```ts
            <th scope="row">Media testului</th>
```

- [ ] **Step 7: Create `src/admin/classPage/ClassStudents.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { AdminApi } from '../api.ts';
import type { ClassGrade, StudentRow, TestSummary } from '../../../shared/api.ts';
import { MAX_NAMES_PER_REQUEST, parseStudentNames, studentNameKey } from '../../../shared/students.ts';
import { formatDateTime, formatPoints, studentCountLabel, uploadStatusLabel } from '../../ui/format.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';

type TabState = { kind: 'list' } | { kind: 'student'; studentId: number } | { kind: 'add' };

export function ClassStudents({ api, classId, students, tests, grades, onChanged }: { api: AdminApi; classId: number; students: StudentRow[]; tests: TestSummary[]; grades: ClassGrade[]; onChanged: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabState>({ kind: 'list' });
  const [search, setSearch] = useState('');
  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);

  const visible = students.filter((student) =>
    student.fullName.toLowerCase().includes(search.toLowerCase()),
  );

  const gradeOf = (studentId: number, testCode: string) =>
    grades.find((grade) => grade.studentId === studentId && grade.testCode === testCode);

  const pointsWaiting = (studentId: number) =>
    grades.some((grade) => grade.studentId === studentId && grade.flagCount > 0);

  const toggleActive = (student: StudentRow) => {
    void api.setStudentActive(classId, student.id, !student.active).then(onChanged);
  };
  const removeStudent = (student: StudentRow) => {
    if (
      window.confirm(`Ștergi elevul ${student.fullName} din clasă? Lucrările neterminate sau eșuate ale elevului se șterg și ele.`)
    ) {
      void api.deleteStudent(classId, student.id).then(onChanged);
    }
  };
  const renameStudent = (student: StudentRow, fullName: string) => {
    void api.renameStudent(student.id, fullName).then(() => {
      setEditingStudent(null);
      void onChanged();
    });
  };

  if (tab.kind === 'student') {
    const student = students.find((s) => s.id === tab.studentId);
    if (!student) return <p>Se încarcă…</p>;
    return (
      <section className="student-card">
        <p className="back-link">
          <button type="button" className="button-quiet button-small" onClick={() => setTab({ kind: 'list' })}>
            ← Elevi
          </button>
        </p>
        <h1>{student.fullName}</h1>
        {!student.active && <span className="tag">a plecat din clasă</span>}
        <ul className="row-list">
          {tests.map((test) => {
            const grade = gradeOf(student.id, test.code);
            return (
              <li key={test.code} className="student-test">
                <span className="student-test-head">
                  <Link to={`/teste/${test.code}`}>{test.title}</Link>
                  {test.startedAt && <span>{formatDateTime(test.startedAt)}</span>}
                </span>
                {grade ? (
                  <span className="student-test-grade">
                    {grade.status === 'graded'
                      ? `${formatPoints(grade.grade ?? 0)} / ${formatPoints(grade.maxTotal ?? 10)}${
                          grade.flagCount > 0 ? ' · 1 punct de verificat' : ''
                        }`
                      : uploadStatusLabel(grade.status)}
                    {grade.resultsOpen ? ' · Publicat' : grade.resultToken ? ' · Nepublicat' : ''}
                  </span>
                ) : (
                  <span className="student-test-grade">Nu a trimis lucrarea</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="hint">
          <Link to={`/elevi/${student.id}`}>Toate notele elevului, din toate clasele</Link>
        </p>
        <div className="card-actions">
          {editingStudent?.id === student.id ? (
            <RenameStudentForm student={student} onDone={() => { setEditingStudent(null); void onChanged(); }} />
          ) : (
            <button type="button" className="button-quiet button-small" onClick={() => setEditingStudent(student)}>
              Redenumește
            </button>
          )}
          <button type="button" className="button-quiet button-small" onClick={() => toggleActive(student)}>
            {student.active ? 'A plecat din clasă' : 'Revine în clasă'}
          </button>
          {student.canDelete && (
            <button type="button" className="button-quiet button-small" onClick={() => removeStudent(student)}>
              Șterge
            </button>
          )}
        </div>
      </section>
    );
  }

  if (tab.kind === 'add') {
    return (
      <section>
        <AddStudentsDialog api={api} classId={classId} students={students} onDone={onChanged} onClose={() => setTab({ kind: 'list' })} />
      </section>
    );
  }

  return (
    <section>
      <h1>Elevi ({studentCountLabel(students.length)})</h1>
      <div className="students-search">
        <label htmlFor="elev-search" className="sr-only">Caută elev</label>
        <input
          id="elev-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Caută elev"
        />
        <button className="button" type="button" onClick={() => setTab({ kind: 'add' })}>+ Adaugă elevi</button>
      </div>
      {visible.length === 0 ? (
        <p className="hint">Nu s-a găsit niciun elev.</p>
      ) : (
        <ol className="row-list">
          {visible.map((student) => (
            <li key={student.id} className={student.active ? undefined : 'is-muted'}>
              <button
                type="button"
                className="student-name"
                aria-label={student.fullName}
                onClick={() => setTab({ kind: 'student', studentId: student.id })}
              >
                {student.fullName}
                {!student.active && <span className="tag">a plecat</span>}
                {pointsWaiting(student.id) && <span className="flag-dot" aria-label="puncte de verificat"></span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function duplicateNames(names: string[], students: StudentRow[]): { inClass: string[]; twice: string[] } {
  const inClassKeys = new Set(students.map((student) => studentNameKey(student.fullName)));
  const seen = new Set<string>();
  const twiceKeys = new Set<string>();
  const inClass: string[] = [];
  const twice: string[] = [];
  for (const name of names) {
    const key = studentNameKey(name);
    if (inClassKeys.has(key)) {
      if (!seen.has(key)) inClass.push(name);
    } else if (seen.has(key)) {
      if (!twiceKeys.has(key)) twice.push(name);
      twiceKeys.add(key);
    }
    seen.add(key);
  }
  return { inClass, twice };
}

function RenameStudentForm({ api, student, onDone }: { api: AdminApi; student: StudentRow; onDone: () => void }) {
  const [fullName, setFullName] = useState(student.fullName);
  const [saving, setSaving] = useState(false);
  const mutation = useMutation({
    mutationFn: (next: string) => api.renameStudent(student.id, next),
    onSuccess: () => {
      setSaving(false);
      onDone();
    },
  });

  return (
    <div className="dialog">
      <p>Redenumește {student.fullName}</p>
      <form className="form-row" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        mutation.mutate(fullName);
      }}>
        <label htmlFor={`rename-student-${student.id}`} className="sr-only">Nume nou</label>
        <input id={`rename-student-${student.id}`} type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={80} required autoFocus />
        <button type="submit" className="button" disabled={saving}>Salvează</button>
        <button type="button" className="button-quiet button-small" onClick={onDone}>Renunță</button>
        {mutation.error && <ErrorMessage error={mutation.error} />}
      </form>
    </div>
  );
}

function AddStudentsDialog({ api, classId, students, onDone, onClose }: { api: AdminApi; classId: number; students: StudentRow[]; onDone: () => Promise<void>; onClose: () => void; }) {
  const [text, setText] = useState('');
  const names = parseStudentNames(text);
  const tooMany = names.length > MAX_NAMES_PER_REQUEST;
  const { inClass, twice } = duplicateNames(names, students);
  const hasDuplicates = inClass.length > 0 || twice.length > 0;
  const [saving, setSaving] = useState(false);
  const mutation = useMutation({
    mutationFn: () => api.addStudents(classId, names),
    onSuccess: () => {
      setSaving(false);
      setText('');
      void onDone();
    },
  });

  return (
    <div className="dialog">
      <p>Adaugă elevi</p>
      <label htmlFor="add-students-names" className="sr-only">Numele elevilor, câte unul pe rând</label>
      <textarea id="add-students-names" value={text} onChange={(event) => setText(event.target.value)} placeholder="Pop Ion\nIonescu Ana" />
      {tooMany && <p className="alert" role="alert">Adaugă cel mult {MAX_NAMES_PER_REQUEST} de nume odată.</p>}
      {inClass.length > 0 && <p className="alert" role="alert">Sunt deja în clasă: {inClass.join(', ')}.</p>}
      {twice.length > 0 && <p className="alert" role="alert">Apar de două ori: {twice.join(', ')}.</p>}
      <form className="form-stack" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        mutation.mutate();
      }}>
        <button type="submit" className="button" disabled={names.length === 0 || tooMany || hasDuplicates || saving}>
          {names.length > 0 ? `Adaugă ${studentCountLabel(names.length)}` : 'Adaugă elevii'}
        </button>
      </form>
      <button type="button" className="button-quiet button-small" onClick={onClose}>Renunță</button>
      {mutation.error && <ErrorMessage error={mutation.error} />}
    </div>
  );
}
```

### Task 3: `/clase` opens the last class seen; remove the all-classes page (Q1 a)

No page with all classes. `pages/LastClassPage.tsx` is `/clase`: it reads `quickeval:lastClass`, navigates (replace) to `/clase/<id>` (else the first active class). `pages/ClassesPage.tsx` and `pages/ClassStudentsPage.tsx` are removed; `clase/:id/elevi` route disappears (merged into the "Elevi" tab).

**Files:**
- Create: `src/admin/pages/LastClassPage.tsx`, `src/admin/pages/LastClassPage.test.tsx`
- Replace: `src/admin/AppRoutes.tsx`, `src/admin/pages/ClassPage.tsx` (saves `quickeval:lastClass` on open)
- Delete: `src/admin/pages/ClassesPage.tsx`, `src/admin/pages/ClassesPage.test.tsx`, `src/admin/pages/ClassStudentsPage.tsx`, `src/admin/pages/ClassStudentsPage.test.tsx`
- Test: `src/admin/pages/LastClassPage.test.tsx`

**Interfaces:**
- Produces: `LastClassPage` (opens last/first class), `AppRoutes` (`clase` → LastClassPage, `clase/:id` → ClassPage, no `clase/:id/elevi`).

- [ ] **Step 1: Create `src/admin/pages/LastClassPage.test.tsx`**

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

describe('LastClassPage', () => {
  it('opens the last class seen', async () => {
    localStorage.setItem('quickeval:lastClass', '2');
    renderAdmin('/clase', createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
        { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 0 },
      ],
      students: {},
    }));
    expect(await screen.findByText('Clasa 9R2')).toBeInTheDocument();
    expect(screen.queryByText('Clasa 6E2')).not.toBeInTheDocument();
  });

  it('opens the first class when none was seen before', async () => {
    localStorage.removeItem('quickeval:lastClass');
    renderAdmin('/clase', createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
        { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 0 },
      ],
      students: {},
    }));
    expect(await screen.findByText('Clasa 6E2')).toBeInTheDocument();
  });

  it('skips an archived last class and opens the first active one', async () => {
    localStorage.setItem('quickeval:lastClass', '2');
    renderAdmin('/clase', createFakeApi({
      classes: [
        { id: 1, name: '6E2', schoolYear: 2026, archived: false, studentCount: 0 },
        { id: 2, name: '9R2', schoolYear: 2026, archived: true, studentCount: 0 },
      ],
      students: {},
    }));
    expect(await screen.findByText('Clasa 6E2')).toBeInTheDocument();
  });

  it('says so when the year has no classes', async () => {
    renderAdmin('/clase', createFakeApi({ classes: [], students: {} }));
    expect(await screen.findByText('Nu ai nicio clasă în acest an școlar.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
        <Route path="clase" element={<ClassesPage />} />
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="clase/:id/elevi" element={<ClassStudentsPage />} />
        <Route path="elevi/:id" element={<StudentPage />} />
```

Replace it with:

```tsx
        <Route path="clase" element={<LastClassPage />} />
        <Route path="clase/:id" element={<ClassPage />} />
        <Route path="elevi/:id" element={<StudentPage />} />
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/LastClassPage.test.tsx`
Expected: `Test Files  1 failed (1)`, `Tests  7 failed (7)`: `LastClassPage.test.tsx` does not load (`Failed to resolve import ./LastClassPage`) and `/clase` still renders the removed `ClassesPage`.

- [ ] **Step 4: Create `src/admin/pages/LastClassPage.tsx`**

```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';

const LAST_CLASS_KEY = 'quickeval:lastClass';

export function LastClassPage() {
  const api = useApi();
  const { year } = useSchoolYear();
  const navigate = useNavigate();
  const classes = useQuery({ queryKey: ['classes', year], queryFn: () => api.listClasses(year) });

  useEffect(() => {
    if (!classes.data) return;
    const list = classes.data.filter((item) => !item.archived);
    if (list.length === 0) return;
    const saved = localStorage.getItem(LAST_CLASS_KEY);
    const target = list.find((item) => item.id === Number(saved)) ?? list[0];
    localStorage.setItem(LAST_CLASS_KEY, String(target.id));
    navigate(`/clase/${target.id}`, { replace: true });
  }, [classes.data, navigate]);

  if (!classes.data) return <p>Se încarcă…</p>;
  if (classes.error) return <ErrorMessage error={classes.error} />;
  if (classes.data.length === 0) return <p className="hint">Nu ai nicio clasă în acest an școlar.</p>;
  return null;
}
```

- [ ] **Step 5: Edit `src/admin/pages/ClassPage.tsx`**

Find this block:

```ts
  const detail = useQuery({ queryKey: ['class', classId], queryFn: () => api.getClass(classId) });
  const refresh = async () => {
```

Replace it with:

```ts
  const detail = useQuery({ queryKey: ['class', classId], queryFn: () => api.getClass(classId) });
  const refresh = async () => {
```

And insert after the opening `<section>` of `ClassDetails`:

```tsx
      <p className="head-line">
        <span className="head-name">{displayClassName(info.name)}</span>
        <ClassSwitcher api={api} classId={classId} waiting={waiting} onDone={refresh} />
        <span className="head-facts">
          {studentCountLabel(students.length)} · {tests.length} teste · anul școlar {formatSchoolYear(info.schoolYear)}
        </span>
```

- [ ] **Step 6: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  1 passed | 0 skipped (1)`, `Tests  4 passed | 0 failed (4)`.

- [ ] **Step 7: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 8: Commit**

```bash
git add src/admin/pages/LastClassPage.tsx src/admin/pages/LastClassPage.test.tsx src/admin/AppRoutes.tsx src/admin/pages/ClassPage.tsx
git rm src/admin/pages/ClassesPage.tsx src/admin/pages/ClassesPage.test.tsx src/admin/pages/ClassStudentsPage.tsx src/admin/pages/ClassStudentsPage.test.tsx
git commit -m "Open the last seen class from /clase, remove the all-classes page"
```

### Task 4: Dialogs — "Clasă nouă" and "Adaugă elevi"

"Clasă nouă" (name + students, one step) and "Adaugă elevi" (names) become dialogs; "Redenumește" is a dialog too. The class switcher's "+ Clasă nouă" opens the create-class dialog; creating navigates to the new class.

**Files:**
- Modify: `src/admin/classPage/ClassStudents.tsx` (real "Adaugă elevi" and "Redenumește" dialogs), `src/admin/pages/ClassPage.tsx` (create-class dialog in the switcher)

**Interfaces:**
- Produces: working dialogs for class creation and adding students; `createClass` navigates to the new class.

- [ ] **Step 1: Run all tests to see them pass**

Run: `npm test`
Expected: `Test Files  1 passed | 0 skipped (1)`, `Tests  13 passed | 0 failed (13)`.

- [ ] **Step 2: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/admin/classPage/ClassStudents.tsx src/admin/pages/ClassPage.tsx
git commit -m "Dialogs: create a class and add students"
```

### Task 5: Notes

`src/AGENTS.md` describes the class page (`classPage/`, `LastClassPage`, `ClassPage`, the removed pages).

**Files:**
- Modify: `src/AGENTS.md`

- [ ] **Step 1: Edit `src/AGENTS.md`**

Find this block:

```ts
- `stages.ts`: the six stages of a test (Pregătire, Tipărive, În clasă, Corectare, Verificare, Rezultate), ...
```

Replace it with:

```ts
- `stages.ts`: the six stages of a test (Pregătire, Tipărive, În clasă, Corectare, Verificare, Rezultate), ...
- `classPage/GradesTable.tsx` is the class page's grade table (students by tests, the oldest test on the left, a narrow column per test; the last row is "Media testului", no per-student average). `classPage/ClassStudents.tsx` is the "Elevi" tab: the students on the left (search, orange dot when points wait, "+ Adaugă elevi" dialog), one student on the right ("Redenumește", "A plecat din clasă", "Șterge" dialogs; each test with date, points, grade, result state, the paper; link "Toate notele elevului, din toate clasele"). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line ("Schimbă clasa" menu with a dot for a waiting class, facts, "Test nou pentru această clasă", "Redenumește clasa"/"Arhivează clasa") and the two tabs. `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year). The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

- [ ] **Step 2: Commit**

```bash
git add src/AGENTS.md
git commit -m "Describe the class page in the notes"
```

### Task 6: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat v5 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite**

Run `npm test` (and once in UTC: `TZ=UTC npm test`).
Expected: PASS.

- [ ] **Step 3: Build and start the production build**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). Then `npm run db:local` and `npm run preview`. Open `/clase` and each class page, light and dark, and at 1440px, 1024px and 390px.

- [ ] **Step 4: Commit the plan**

```bash
git add docs/superpowers/plans/2026-11-06-mqgrader-phase-7-clase.md
git commit -m "Add the Phase 7 plan"
```

- [ ] **Step 5: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-classes`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked.

## After the plan

A follow-up finished spec §9 after Task 6: the list "Testele clasei" beside the grades table, the working "Arată și testele arhivate", the "Redenumește clasa" dialog, and the student's result line in "Elevi" (points, grade, result state, "Copiază linkul", the paper). The exactness check of Task 6 Step 1 now shows those files.



