# MQGrader: the CES variant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The last task (Check, live database, push) must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (the live migration, push, pull request) needs the user's explicit yes.

**Goal:** A teacher marks a student as CES; a test may get an optional CES variant (its own test file, its own barem, uploaded or generated for grading only, its own print PDF with the same QR code); the robot grades a CES student's paper with the CES barem; the CES papers stay in the class's results, report and analysis, with a separate table when their exercises differ.

**Architecture:** One migration (0024) adds `students.ces`, a `ces_` twin of every column of `tests` that the test file, the barem, the exercise list and the print PDF use, and `submissions.variant`. The queries that serve both variants take a `variant` and name their columns with `columns(variant)` (`server/db/variant.ts`). The teacher's CES routes are `/api/admin/tests/:code/ces/…` (`server/routes/cesVariant.ts`); the robot's routes take `?variant=ces`, and `/tasks` lists the CES print PDFs, barems and exercise lists. A paper's variant is written by the claim that first sends it to grading; a CES paper waits, sent, until the CES barem is active. The grading skill learns the CES rules from a new reference built from the teacher's sample. The test page gets "Varianta CES"; the class report, its CSV and its PDF split the CES papers into their own table when their exercises are not the class ones (`reportTables` in `shared/stats.ts`).

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1 and R2, Vitest 5, Testing Library, the robot in `runner/` with Claude Code. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-09-ces-variant-design.md` (approved by the user on 2026-11-09). Root `AGENTS.md`, `server/AGENTS.md`, `runner/AGENTS.md` and `src/AGENTS.md` hold the project rules. The teacher's sample: `D:\Projects\Test\Test adaptat - Modul, parte intreaga, parte fractionara.docx` and its `- barem.docx`.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- One migration, `migrations/0024_ces_variant.sql`. It runs on the live database **before** the code reaches `main` (`docs/deploy.md`): the last task asks the user first.
- Every teacher query is scoped by the teacher's id. A write checks its own rules inside its SQL. Every path that makes robot work starts the robot. At most 15 D1 queries and 10 ms of CPU per request.
- No student page, student PDF, robot text that the student reads, or CSV says "CES": the CES mark is for the teacher only. Student pages do not change.
- The robot's Claude reads only its work folder; the work folder and the robot's logs carry no names.
- Flat colours only; orange only for what waits on the teacher.
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: `.claude/launch.json` entries, untracked plan files).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/ces-variant`. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone. Then the full run counts as passed when its failed and passed tests add up to the expected passed number; say so in the task report.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protoces/g1` … `refs/protoces/g8`, one per task, on `refs/protoces/gbase` (the same files as `feature/ces-variant` at `08a5db1`). After Task N, `git diff --stat refs/protoces/gN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

Settled while building the prototype on 2026-11-09. Every action that works today stays.

1. **Columns, not a table.** The CES variant is a `ces_` twin of 18 columns of `tests` (the files, the barem comments and request, `barem_unchecked`, the exercise list, the print PDF, and `ces_files_version`), so every gate that reads a test row (`t.`) reads its variant in the same row. `columns(variant)` names them; `needsPrintSql`, `needsBaremSql`, `baremActiveSql` and `paperVariantSql` are the shared conditions (`server/db/variant.ts`). A test "has a CES variant" while `ces_test_file_key` is set.
2. **The variant is written by the claim.** `paperVariantSql` gives a paper's variant: the one written on it, else CES when the student is marked CES and the test has a CES test file, else the class test. The robot's claim writes it (`submissions.variant`) in the same UPDATE that takes the paper, and checks `GRADABLE` again in that UPDATE. A regrade and a retry keep it; a reset deletes the paper, so the next one gets its variant when it goes to grading (the spec said "a reset keeps it": Task 8 corrects the spec).
3. **A CES paper waits, sent.** `GRADABLE` holds a CES paper (status `submitted`) until its CES barem is active (`baremActiveSql('ces')`) and its CES list is usable. The test then stays in evaluation (`finishTests` waits for every sent paper), and the class analysis waits too (`fullyChecked`). A CES barem checked during the evaluation starts the robot. The CES list waits for an active CES barem, the class list, and a CES paper (`NEEDS_CES_EXERCISE_LIST`); it gets the class list beside the CES files, so it reuses the class exercise ids.
4. **The CES files may change during the evaluation.** The API refuses a new CES file or CES comment only while a CES paper is in grading (`ces_grading`, 409); the class files keep their rule. A CES barem may be generated in draft, open or evaluating (`baremStatuses`), and its request does not clear a schedule. "Șterge varianta CES" checks in its SQL that no paper has the variant `ces` (409 `ces_papers`).
5. **The robot names the variant in the query** (`?variant=ces`), so an older robot's requests mean the class test; an unknown variant is 404. The work folder gets `ces.md` (`CES_NOTE`), and the CES barem and list jobs get `class/exercises.json` (and `class/barem.*` for the barem, read from `GET /tests/:id/barem-job/class-barem`).
6. **The skill's CES reference** (`references/barem-example-ces.md`) is built from the teacher's two Word files with pandoc: the whole test without the class letter and the date, and only the barem's "Reguli de notare" and table (with the "Observații"), without the student's name; the rule "dacă elevul îl clarifică oral" is dropped (the robot cannot hear the student). The plan gives the file whole.
7. **Totals.** A CES barem always totals 90 + 10 (the user's answer). The CES block warns when the CES list's total differs from the class list's (100 when the class list is not made yet); it does not block grading.
8. **Tables.** The CES mark (`CesTag`) shows in every teacher table that lists students; the student mark or a paper of the CES variant shows it. Tables of the final score only (the class page) keep one column. The class report splits the CES papers into their own table only when their exercises are not the class ones (`sameExercises`: the same ids, each with the same maximum); its per-exercise statistics follow the tables; the grades (average, median, groups) stay the whole class's. The CSV puts the CES rows in a block of their own after an empty line, with their own header, and never writes "CES".
9. **Not built yet** (the user is asked before this plan runs): the CES mark in the review queue (`/teste/:code/verificare`), in the search results and on the student page's header (the spec asks for it in every teacher table that lists students); the CES files in Fișa testului; and a generated CES barem that waits for its check in "De făcut" (the class barem is there).
10. **The paper's pages need no variant.** The paper page, the review and the student's PDF show the graded items and the pages, never the test or the barem file, so a CES paper shows nothing of the class test there.

## Review Focus

1. A CES paper never reaches the robot before its CES barem is active (test in Task 4: "waits while the CES barem is not active, and the test stays in evaluation"). The claim's UPDATE checks `GRADABLE` again, for a mark or a CES barem that changes between the claim's look and its write; no test makes that race: read it in `claimSubmission`.
2. A paper keeps its variant through a regrade whatever happens to the mark, and that blocks the removal of the variant (test in Task 4).
3. A CES result is checked against the CES list, not the class list (test in Task 4: "is saved against the CES list").
4. The CES and class files never share an R2 key, and deleting a test deletes the CES files (tests in Task 2).
5. No "CES" word reaches a student text or the CSV (the skill's rule, tested in Task 5; the CSV, tested in Task 7).

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch and fetch the prototype**

Run: `git status --short --branch` and `git log --oneline -1`
Expected: `## feature/ces-variant`, HEAD `08a5db1 Add the design of the CES variant: an adapted test with its own barem` (or a later commit that only adds this plan), and no change to a tracked file but `.claude/launch.json`.

Run: `git rev-parse --verify refs/protoces/g8`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan's commit.

### Task 1: Mark a student as CES

The migration for the whole feature, the CES mark on a student (`PUT /api/admin/students/:id/ces`), and the mark on the class page: in the student list, in the chosen student's header with "Marchează CES" / "Scoate marcajul CES", and in the grades table.

**Files:**
- Create: `migrations/0024_ces_variant.sql`, `src/admin/CesTag.tsx`
- Modify: `shared/api.ts`, `server/db/students.ts`, `server/db/classes.ts`, `server/routes/students.ts`, `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/admin/classPage/ClassStudents.tsx`, `src/admin/classPage/GradesTable.tsx`
- Test: `server/routes/students.test.ts`, `server/routes/classes.test.ts`, `src/admin/pages/ClassPage.test.tsx`, `src/admin/Layout.test.tsx`, `src/admin/pages/NewTestPage.test.tsx`, `src/admin/pages/SearchPage.test.tsx`, `src/admin/search/SearchBox.test.tsx`, `src/admin/search/SearchLayer.test.tsx` (the student rows of the fixtures get `ces: false`)

**Interfaces:**
- Produces: `StudentRow.ces: boolean`; `studentCesBody` (`{ ces: boolean }`); `setStudentCes(db, teacherId, studentId, ces): Promise<{ id: number; ces: boolean } | null>` in `server/db/students.ts`; `AdminApi.setStudentCes(studentId: number, ces: boolean): Promise<{ id: number; ces: boolean }>`; `CesTag()` in `src/admin/CesTag.tsx` (`<span className="tag tag-ces" title="Cerințe educaționale speciale">CES</span>`).

- [ ] **Step 1: Edit `server/routes/students.test.ts`**

Find this block:

```ts
  });
});
```

Replace it with:

```ts
  });
});

describe('PUT /api/admin/students/:id/ces', () => {
  it('marks a student as CES and the class list shows it, then takes the mark away', async () => {
    const created = await api.request('POST', '/api/admin/classes', { name: '9R2', schoolYear: 2026 });
    const classId = created.body.class.id as number;
    const added = await api.request('POST', `/api/admin/classes/${classId}/students`, { names: ['Bursașiu Teodor', 'Ene Ana'] });
    expect(added.body.students.map((s: { ces: boolean }) => s.ces)).toEqual([false, false]);
    const id = added.body.students[0].id as number;

    const marked = await api.request('PUT', `/api/admin/students/${id}/ces`, { ces: true });
    expect(marked.status).toBe(200);
    expect(marked.body.student).toEqual({ id, ces: true });
    const detail = await api.request('GET', `/api/admin/classes/${classId}`);
    const ces = Object.fromEntries(detail.body.students.map((s: { fullName: string; ces: boolean }) => [s.fullName, s.ces]));
    expect(ces).toEqual({ 'Bursașiu Teodor': true, 'Ene Ana': false });

    // Leaving the class keeps the mark.
    const left = await api.request('PATCH', `/api/admin/classes/${classId}/students/${id}`, { active: false });
    expect(left.body.student.ces).toBe(true);

    const unmarked = await api.request('PUT', `/api/admin/students/${id}/ces`, { ces: false });
    expect(unmarked.body.student).toEqual({ id, ces: false });
  });

  it('refuses a body without the mark', async () => {
    const res = await api.request('PUT', `/api/admin/students/${studentId}/ces`, { ces: 'da' });
    expect(res.status).toBe(400);
  });

  it('answers 404 for a student of another teacher', async () => {
    const otherId = await api.addTeacher('other-ces@example.com', 'Alt Profesor');
    const row = await api.db
      .prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Alt Elev', '2026-10-06') RETURNING id")
      .bind(otherId)
      .first<{ id: number }>();
    const res = await api.request('PUT', `/api/admin/students/${row!.id}/ces`, { ces: true });
    expect(res.status).toBe(404);
    const kept = await api.db.prepare('SELECT ces FROM students WHERE id = ?').bind(row!.id).first<{ ces: number }>();
    expect(kept!.ces).toBe(0);
  });
});
```

- [ ] **Step 2: Edit `server/routes/classes.test.ts`**

Find this block:

```ts
    expect(left.status).toBe(200);
    expect(left.body.student).toEqual({ id: studentId, fullName: 'Pop Ion', active: false, canDelete: true });

```

Replace it with:

```ts
    expect(left.status).toBe(200);
    expect(left.body.student).toEqual({ id: studentId, fullName: 'Pop Ion', active: false, canDelete: true, ces: false });

```

- [ ] **Step 3: Edit `server/routes/classes.test.ts`**

Find this block:

```ts
    expect(detail.body.class.studentCount).toBe(0);
    expect(detail.body.students).toEqual([{ id: studentId, fullName: 'Pop Ion', active: false, canDelete: true }]);

```

Replace it with:

```ts
    expect(detail.body.class.studentCount).toBe(0);
    expect(detail.body.students).toEqual([{ id: studentId, fullName: 'Pop Ion', active: false, canDelete: true, ces: false }]);

```

- [ ] **Step 4: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx
  const students = [
    { id: 10, fullName: 'Pop Ion', active: true, canDelete: false },
    { id: 11, fullName: 'Ionescu Ana', active: false, canDelete: false },
    { id: 12, fullName: 'Albu Dan', active: true, canDelete: false },
  ];
```

Replace it with:

```tsx
  const students = [
    { id: 10, fullName: 'Pop Ion', active: true, canDelete: false, ces: false },
    { id: 11, fullName: 'Ionescu Ana', active: false, canDelete: false, ces: false },
    { id: 12, fullName: 'Albu Dan', active: true, canDelete: false, ces: false },
  ];
```

- [ ] **Step 5: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx
        classes: [...data.classes, { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 1 }],
        students: { ...data.students, 2: [{ id: 20, fullName: 'Radu Ema', active: true, canDelete: false }] },
        tests: [...data.tests, waiting],
```

Replace it with:

```tsx
        classes: [...data.classes, { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 1 }],
        students: { ...data.students, 2: [{ id: 20, fullName: 'Radu Ema', active: true, canDelete: false, ces: false }] },
        tests: [...data.tests, waiting],
```

- [ ] **Step 6: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx
        classes: [...data.classes, { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 0 }],
        students: { ...data.students, 2: [{ id: 20, fullName: 'Radu Ema', active: true, canDelete: false }] },
      }),
```

Replace it with:

```tsx
        classes: [...data.classes, { id: 2, name: '9R2', schoolYear: 2026, archived: false, studentCount: 0 }],
        students: { ...data.students, 2: [{ id: 20, fullName: 'Radu Ema', active: true, canDelete: false, ces: false }] },
      }),
```

- [ ] **Step 7: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx
        ...data,
        students: { 1: [...data.students[1]!, { id: 13, fullName: 'Ștefănescu Ioana', active: true, canDelete: true }] },
      }),
```

Replace it with:

```tsx
        ...data,
        students: { 1: [...data.students[1]!, { id: 13, fullName: 'Ștefănescu Ioana', active: true, canDelete: true, ces: false }] },
      }),
```

- [ ] **Step 8: Edit `src/admin/pages/ClassPage.test.tsx`**

Find this block:

```tsx
    expect(api.setStudentActive).toHaveBeenCalledWith(1, 12, false);
  });
```

Replace it with:

```tsx
    expect(api.setStudentActive).toHaveBeenCalledWith(1, 12, false);
  });

  it('marks the chosen student as CES, shows the mark in both tabs, and takes it away', async () => {
    const api = gradedClass();
    renderAdmin('/clase/1', api);
    await openStudents();
    const before = await detail();
    expect(before.queryByText('CES')).not.toBeInTheDocument();
    await userEvent.click(before.getByRole('button', { name: 'Marchează CES' }));
    expect(api.setStudentCes).toHaveBeenCalledWith(12, true);

    const after = await detail();
    expect(await after.findByText('Primește varianta CES a testelor care au una.')).toBeInTheDocument();
    expect(after.getByText('CES')).toHaveAttribute('title', 'Cerințe educaționale speciale');
    const list = within(screen.getByRole('list', { name: 'Elevii clasei' }));
    expect(within(list.getByRole('button', { name: /Albu Dan/ })).getByText('CES')).toBeInTheDocument();
    expect(within(list.getByRole('button', { name: /Pop Ion/ })).queryByText('CES')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Note și teste' }));
    const row = (await screen.findByRole('rowheader', { name: /Albu Dan/ })).closest('tr')!;
    expect(within(row).getByText('CES')).toBeInTheDocument();
    expect(within(screen.getByRole('rowheader', { name: /Pop Ion/ })).queryByText('CES')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /^Elevi/ }));
    await userEvent.click((await detail()).getByRole('button', { name: 'Scoate marcajul CES' }));
    expect(api.setStudentCes).toHaveBeenLastCalledWith(12, false);
    await waitFor(async () => expect((await detail()).queryByText('CES')).not.toBeInTheDocument());
  });

  it('offers no CES button in an archived class', async () => {
    const data = classData();
    renderAdmin('/clase/1', createFakeApi({ ...data, classes: [{ ...data.classes[0]!, archived: true }] }));
    await openStudents();
    expect((await detail()).queryByRole('button', { name: 'Marchează CES' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 9: Edit `src/admin/Layout.test.tsx`**

Find this block:

```tsx
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true }] },
    tests: [
```

Replace it with:

```tsx
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true, ces: false }] },
    tests: [
```

- [ ] **Step 10: Edit `src/admin/pages/NewTestPage.test.tsx`**

Find this block:

```tsx
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true }] },
  });
```

Replace it with:

```tsx
    ],
    students: { 1: [{ id: 10, fullName: 'Pop Ion', active: true, canDelete: true, ces: false }] },
  });
```

- [ ] **Step 11: Edit `src/admin/pages/SearchPage.test.tsx`**

Find this block:

```tsx

const student = (id: number, fullName: string): StudentRow => ({ id, fullName, active: true, canDelete: true });

```

Replace it with:

```tsx

const student = (id: number, fullName: string): StudentRow => ({ id, fullName, active: true, canDelete: true, ces: false });

```

- [ ] **Step 12: Edit `src/admin/search/SearchBox.test.tsx`**

Find this block:

```tsx

const student = (id: number, fullName: string): StudentRow => ({ id, fullName, active: true, canDelete: true });

```

Replace it with:

```tsx

const student = (id: number, fullName: string): StudentRow => ({ id, fullName, active: true, canDelete: true, ces: false });

```

- [ ] **Step 13: Edit `src/admin/search/SearchLayer.test.tsx`**

Find this block:

```tsx
    classes: [{ id: 1, name: '10B', schoolYear: 2026, archived: false, studentCount: 1 }],
    students: { 1: [{ id: 10, fullName: 'Ștefan Radu', active: true, canDelete: true }] },
  });
```

Replace it with:

```tsx
    classes: [{ id: 1, name: '10B', schoolYear: 2026, archived: false, studentCount: 1 }],
    students: { 1: [{ id: 10, fullName: 'Ștefan Radu', active: true, canDelete: true, ces: false }] },
  });
```

- [ ] **Step 14: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      }
      const added = names.map((fullName) => ({ id: nextId++, fullName, active: true, canDelete: true }));
      data.students[classId] = [...(data.students[classId] ?? []), ...added];
```

Replace it with:

```ts
      }
      const added = names.map((fullName) => ({ id: nextId++, fullName, active: true, canDelete: true, ces: false }));
      data.students[classId] = [...(data.students[classId] ?? []), ...added];
```

- [ ] **Step 15: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      return { id: studentId, fullName };
    }),
```

Replace it with:

```ts
      return { id: studentId, fullName };
    }),
    // The mark goes with the student, in every class. New rows, as the API
    // answers with: the page sees the change.
    setStudentCes: vi.fn(async (studentId: number, ces: boolean) => {
      let found = false;
      for (const list of Object.values(data.students)) {
        const index = list.findIndex((s) => s.id === studentId);
        if (index >= 0) {
          list[index] = { ...list[index]!, ces };
          found = true;
        }
      }
      if (!found) throw notFound();
      return { id: studentId, ces };
    }),
```

- [ ] **Step 16: Run the new tests to see them fail**

Run: `npx vitest run server/routes/students.test.ts server/routes/classes.test.ts src/admin/pages/ClassPage.test.tsx`
Expected: FAIL. `Test Files  3 failed | 5 passed (8)`, `Tests  5 failed | 188 passed (193)`: the student rows have no `ces` (`expected [ undefined, undefined ] to deeply equal [ false, false ]`, and the left-and-back row of `classes.test.ts`), the route does not exist (`expected 404 to be 400`), the column does not exist yet (`no such column: ces`), and the class page has no "Marchează CES".

- [ ] **Step 17: Create `migrations/0024_ces_variant.sql`**

```sql
-- The CES variant (spec: docs/superpowers/specs/2026-11-09-ces-variant-design.md).
-- students.ces: the teacher marked the student as CES ("cerințe educaționale
-- speciale"); the mark goes with the student, not with one test.
-- tests.ces_*: the CES variant of a test, with its own copy of every column
-- that the test file, the barem, the exercise list and the print PDF use. A
-- test has a CES variant while ces_test_file_key is set.
-- submissions.variant: the barem a paper is graded with, written when the
-- paper first goes to grading (NULL until then); a regrade keeps it.
-- One statement per ";" line end (the test helper splits on that), and no ";"
-- inside strings.

ALTER TABLE students ADD COLUMN ces INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tests ADD COLUMN ces_test_file_key TEXT;
ALTER TABLE tests ADD COLUMN ces_test_file_name TEXT;
ALTER TABLE tests ADD COLUMN ces_test_file_type TEXT;
ALTER TABLE tests ADD COLUMN ces_barem_file_key TEXT;
ALTER TABLE tests ADD COLUMN ces_barem_file_name TEXT;
ALTER TABLE tests ADD COLUMN ces_barem_file_type TEXT;
ALTER TABLE tests ADD COLUMN ces_barem_notes TEXT;
ALTER TABLE tests ADD COLUMN ces_barem_request TEXT NOT NULL DEFAULT 'none' CHECK (ces_barem_request IN ('none', 'requested', 'failed'));
ALTER TABLE tests ADD COLUMN ces_barem_request_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN ces_barem_unchecked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN ces_exercise_list_json TEXT;
ALTER TABLE tests ADD COLUMN ces_exercise_list_status TEXT NOT NULL DEFAULT 'none' CHECK (ces_exercise_list_status IN ('none', 'ready', 'problem', 'accepted', 'failed'));
ALTER TABLE tests ADD COLUMN ces_exercise_list_message TEXT;
ALTER TABLE tests ADD COLUMN ces_exercise_list_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN ces_print_status TEXT NOT NULL DEFAULT 'none' CHECK (ces_print_status IN ('none', 'ready', 'failed'));
ALTER TABLE tests ADD COLUMN ces_print_file_key TEXT;
ALTER TABLE tests ADD COLUMN ces_print_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tests ADD COLUMN ces_files_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE submissions ADD COLUMN variant TEXT CHECK (variant IN ('class', 'ces'));
```

- [ ] **Step 18: Edit `shared/api.ts`**

Find this block:

```ts
export const renameStudentBody = z.object({ fullName: studentNameSchema });

```

Replace it with:

```ts
export const renameStudentBody = z.object({ fullName: studentNameSchema });

// The CES mark of a student ("cerințe educaționale speciale"): such a student
// gets the CES variant of a test that has one.
export const studentCesBody = z.object({ ces: z.boolean() });

```

- [ ] **Step 19: Edit `shared/api.ts`**

Find this block:

```ts
  canDelete: boolean;
}
```

Replace it with:

```ts
  canDelete: boolean;
  // The teacher marked the student as CES: the student gets the CES variant of
  // a test that has one. For the teacher only.
  ces: boolean;
}
```

- [ ] **Step 20: Edit `server/db/students.ts`**

Find this block:

```ts
  if (inserted === 0) throw await refusedAdd(db, teacherId, classId, names);
  return rows.map((row) => ({ id: row.id, fullName: row.fullName, active: true, canDelete: true }));
}
```

Replace it with:

```ts
  if (inserted === 0) throw await refusedAdd(db, teacherId, classId, names);
  return rows.map((row) => ({ id: row.id, fullName: row.fullName, active: true, canDelete: true, ces: false }));
}
```

- [ ] **Step 21: Edit `server/db/students.ts`**

Find this block:

```ts
  const student = await db
    .prepare(`SELECT st.full_name, ${noWorkSql('st.id', '?')} AS can_delete FROM students st WHERE st.id = ? AND st.teacher_id = ?`)
    .bind(classId, studentId, teacherId)
    .first<{ full_name: string; can_delete: number }>();
  return { id: studentId, fullName: student!.full_name, active, canDelete: student!.can_delete === 1 };
}
```

Replace it with:

```ts
  const student = await db
    .prepare(`SELECT st.full_name, st.ces, ${noWorkSql('st.id', '?')} AS can_delete FROM students st WHERE st.id = ? AND st.teacher_id = ?`)
    .bind(classId, studentId, teacherId)
    .first<{ full_name: string; ces: number; can_delete: number }>();
  return { id: studentId, fullName: student!.full_name, active, canDelete: student!.can_delete === 1, ces: student!.ces === 1 };
}

// Marks the student as CES, or takes the mark away. The mark goes with the
// student, in every class: it decides the variant of a paper only when the
// paper first goes to grading, so papers already graded keep theirs. Null when
// the student is not the teacher's.
export async function setStudentCes(db: D1Database, teacherId: number, studentId: number, ces: boolean): Promise<{ id: number; ces: boolean } | null> {
  const row = await db
    .prepare('UPDATE students SET ces = ? WHERE id = ? AND teacher_id = ? RETURNING id, ces')
    .bind(ces ? 1 : 0, studentId, teacherId)
    .first<{ id: number; ces: number }>();
  return row ? { id: row.id, ces: row.ces === 1 } : null;
}
```

- [ ] **Step 22: Edit `server/db/classes.ts`**

Find this block:

```ts
    .prepare(
      `SELECT s.id, s.full_name, e.active,
         ${noWorkSql('s.id', 'e.class_id')} AS can_delete
```

Replace it with:

```ts
    .prepare(
      `SELECT s.id, s.full_name, e.active, s.ces,
         ${noWorkSql('s.id', 'e.class_id')} AS can_delete
```

- [ ] **Step 23: Edit `server/db/classes.ts`**

Find this block:

```ts
    .bind(teacherId, classId)
    .all<{ id: number; full_name: string; active: number; can_delete: number }>();
  return results
    .map((row) => ({ id: row.id, fullName: row.full_name, active: row.active === 1, canDelete: row.can_delete === 1 }))
    .sort((a, b) => compareStudentNames(a.fullName, b.fullName));
```

Replace it with:

```ts
    .bind(teacherId, classId)
    .all<{ id: number; full_name: string; active: number; ces: number; can_delete: number }>();
  return results
    .map((row) => ({ id: row.id, fullName: row.full_name, active: row.active === 1, canDelete: row.can_delete === 1, ces: row.ces === 1 }))
    .sort((a, b) => compareStudentNames(a.fullName, b.fullName));
```

- [ ] **Step 24: Edit `server/routes/students.ts`**

Find this block:

```ts
import { Hono } from 'hono';
import { renameStudentBody } from '../../shared/api.ts';
import { getStudentHistory, renameClashMessage, renameStudent } from '../db/students.ts';
import type { AppEnv } from '../env.ts';
```

Replace it with:

```ts
import { Hono } from 'hono';
import { renameStudentBody, studentCesBody } from '../../shared/api.ts';
import { getStudentHistory, renameClashMessage, renameStudent, setStudentCes } from '../db/students.ts';
import type { AppEnv } from '../env.ts';
```

- [ ] **Step 25: Edit `server/routes/students.ts`**

Find this block:

```ts

  // The student page: every graded test of the student, in every class and year.
```

Replace it with:

```ts

  // The CES mark: the student gets the CES variant of the tests that have one.
  routes.put('/:id/ces', async (c) => {
    const body = await readJson(c, studentCesBody);
    const student = await setStudentCes(c.env.DB, c.var.teacher.id, parseId(c.req.param('id')), body.ces);
    if (!student) throw notFound();
    return c.json({ student });
  });

  // The student page: every graded test of the student, in every class and year.
```

- [ ] **Step 26: Create `src/admin/CesTag.tsx`**

```tsx
// The mark of a CES student ("cerințe educaționale speciale") next to the
// name, in every teacher table that lists students. For the teacher only: no
// student page shows it.
export function CesTag() {
  return (
    <span className="tag tag-ces" title="Cerințe educaționale speciale">
      CES
    </span>
  );
}
```

- [ ] **Step 27: Edit `src/admin/api.ts`**

Find this block:

```ts
  renameStudent(studentId: number, fullName: string): Promise<{ id: number; fullName: string }>;
  getStudentHistory(studentId: number): Promise<StudentHistory>;
```

Replace it with:

```ts
  renameStudent(studentId: number, fullName: string): Promise<{ id: number; fullName: string }>;
  // Marks the student as CES, or takes the mark away.
  setStudentCes(studentId: number, ces: boolean): Promise<{ id: number; ces: boolean }>;
  getStudentHistory(studentId: number): Promise<StudentHistory>;
```

- [ ] **Step 28: Edit `src/admin/api.ts`**

Find this block:

```ts
      (await request<{ student: { id: number; fullName: string } }>('PATCH', `/students/${studentId}`, { fullName })).student,
    getStudentHistory: (studentId) => request<StudentHistory>('GET', `/students/${studentId}/history`),
```

Replace it with:

```ts
      (await request<{ student: { id: number; fullName: string } }>('PATCH', `/students/${studentId}`, { fullName })).student,
    setStudentCes: async (studentId, ces) =>
      (await request<{ student: { id: number; ces: boolean } }>('PUT', `/students/${studentId}/ces`, { ces })).student,
    getStudentHistory: (studentId) => request<StudentHistory>('GET', `/students/${studentId}/history`),
```

- [ ] **Step 29: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
import { countLabel, formatDayMonth, uploadStatusLabel } from '../../ui/format.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

Replace it with:

```tsx
import { countLabel, formatDayMonth, uploadStatusLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

- [ ] **Step 30: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
                  <span>{student.fullName}</span>
                  {waits(student.id) && <span className="flag-dot" role="img" aria-label="puncte de verificat"></span>}
```

Replace it with:

```tsx
                  <span>{student.fullName}</span>
                  {student.ces && <CesTag />}
                  {waits(student.id) && <span className="flag-dot" role="img" aria-label="puncte de verificat"></span>}
```

- [ ] **Step 31: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
  });
  const remove = useMutation({
```

Replace it with:

```tsx
  });
  const ces = useMutation({
    mutationFn: () => api.setStudentCes(student.id, !student.ces),
    onSuccess: onChanged,
  });
  const remove = useMutation({
```

- [ ] **Step 32: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
            {student.fullName}
            {!student.active && (
```

Replace it with:

```tsx
            {student.fullName}
            {student.ces && (
              <>
                {' '}
                <CesTag />
              </>
            )}
            {!student.active && (
```

- [ ] **Step 33: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
          </p>
        </div>
```

Replace it with:

```tsx
          </p>
          {student.ces && <p className="hint">Primește varianta CES a testelor care au una.</p>}
        </div>
```

- [ ] **Step 34: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
              Redenumește
            </button>
```

Replace it with:

```tsx
              Redenumește
            </button>
            <button type="button" className="text-button is-quiet" disabled={ces.isPending} onClick={() => ces.mutate()}>
              {student.ces ? 'Scoate marcajul CES' : 'Marchează CES'}
            </button>
```

- [ ] **Step 35: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
      {toggle.error && <ErrorMessage error={toggle.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
```

Replace it with:

```tsx
      {toggle.error && <ErrorMessage error={toggle.error} />}
      {ces.error && <ErrorMessage error={ces.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
```

- [ ] **Step 36: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
import { countLabel, formatDayMonth, uploadStatusLabel } from '../../ui/format.ts';
import { EmptyState } from '../EmptyState.tsx';
```

Replace it with:

```tsx
import { countLabel, formatDayMonth, uploadStatusLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';
import { EmptyState } from '../EmptyState.tsx';
```

- [ ] **Step 37: Edit `src/admin/classPage/GradesTable.tsx`**

Find this block:

```tsx
                  </Link>
                  {!student.active && (
```

Replace it with:

```tsx
                  </Link>
                  {student.ces && (
                    <>
                      {' '}
                      <CesTag />
                    </>
                  )}
                  {!student.active && (
```

- [ ] **Step 38: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type error; `Test Files  130 passed | 1 skipped (131)`, `Tests  2080 passed | 3 skipped (2083)`.

- [ ] **Step 39: Commit**

```bash
git add migrations/0024_ces_variant.sql shared/api.ts server/db/students.ts server/db/classes.ts server/routes/students.ts server/routes/students.test.ts server/routes/classes.test.ts src/admin/CesTag.tsx src/admin/api.ts src/admin/classPage/ClassStudents.tsx src/admin/classPage/GradesTable.tsx src/test/fakeApi.ts src/admin/pages/ClassPage.test.tsx src/admin/Layout.test.tsx src/admin/pages/NewTestPage.test.tsx src/admin/pages/SearchPage.test.tsx src/admin/search/SearchBox.test.tsx src/admin/search/SearchLayer.test.tsx
git commit -m "Mark a student as CES"
```

### Task 2: Keep the CES variant's files, barem and print PDF on the test

The `ces_` columns behind the teacher's routes: upload, read and remove the CES files, the CES barem comments, "Generează baremul" and "Am verificat baremul" for the CES barem, the CES print PDF and its retry, and the CES exercise list's accept and retry. `TestInfo.ces` tells the page all of it. The class routes, and the job conditions the robot uses, go through the same column helpers.

**Files:**
- Create: `server/db/variant.ts`, `server/routes/cesVariant.ts`
- Modify: `shared/files.ts`, `shared/api.ts`, `server/db/runner.ts`, `server/db/lifecycle.ts`, `server/db/tests.ts`, `server/routes/tests.ts`, `server/test/fixtures.ts`, `src/test/fakeApi.ts`
- Test: `shared/variantKeys.test.ts`, `server/routes/cesVariant.test.ts`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces: `TestVariant = 'class' | 'ces'` (`shared/files.ts`); `testFileKey(…, variant?)`, `printFileKey(…, variant?)`, `generatedBaremKey(…, variant?)` (CES keys under `ces/`); `CesVariantInfo` and `TestInfo.ces`; `BaremCheckedAnswer.robot?`; `CesRemovedAnswer`; in `server/db/variant.ts`: `VariantColumn`, `columns(variant)`, `baremStatuses(variant)`, `needsPrintSql(variant, t?)`, `needsBaremSql(variant, t?)`, `baremActiveSql(variant, t?)`, `paperVariantSql(s?, t?)`; in `server/db/tests.ts`: `VariantRecord`, `TestRecord.ces` (with `studentCount`, `papers`, `waiting`, `grading`, `totalPoints`, `classTotalPoints`), `variantOf(record, variant)`, `toCesInfo(ces)`, and a last `variant` parameter (default `'class'`) on `saveTestFile`, `saveBaremNotes`, `needsPrint`, `needsBarem`, `requestBarem`, `confirmBarem` (now returns the test's status or null), `retryPrint`; `removeCesVariant(db, teacherId, testId, now): Promise<string[] | null>`; `acceptExerciseList(…, variant?)`, `retryExerciseList(…, variant?)` in `server/db/lifecycle.ts`; `cesVariantRoutes(routes, startRobot)`; fixtures `addCesFiles(api, code, kinds?)` and `markCes(api, ...studentIds)`; `noCesVariant(overrides?)` in `src/test/fakeApi.ts`.

- [ ] **Step 1: Create `shared/variantKeys.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DOCX_TYPE, generatedBaremKey, PDF_TYPE, printFileKey, testFileKey } from './files.ts';

describe('the R2 keys of the CES variant', () => {
  it('puts every CES file under ces/ in the test folder, and leaves the class keys as they were', () => {
    expect(testFileKey(1, 2026, '9R2-26T1', 'test', 'Test adaptat.docx', DOCX_TYPE, 'ces')).toBe('t/1/2026/9R2-26T1/ces/test/test-adaptat.docx');
    expect(testFileKey(1, 2026, '9R2-26T1', 'barem', 'barem.pdf', PDF_TYPE)).toBe('t/1/2026/9R2-26T1/barem/barem.pdf');
    expect(testFileKey(1, 2026, '9R2-26T1', 'barem', 'barem.pdf', PDF_TYPE, 'ces')).toBe('t/1/2026/9R2-26T1/ces/barem/barem.pdf');
    expect(printFileKey(1, 2026, '9R2-26T1', 'Test adaptat.docx', 3, 'ces')).toBe('t/1/2026/9R2-26T1/ces/print/test-adaptat-v3-qr.pdf');
    expect(printFileKey(1, 2026, '9R2-26T1', 'Test.docx', 3)).toBe('t/1/2026/9R2-26T1/print/test-v3-qr.pdf');
    expect(generatedBaremKey(1, 2026, '9R2-26T1', 4, 'ces')).toBe('t/1/2026/9R2-26T1/ces/barem/generat_v4.docx');
  });
});
```

- [ ] **Step 2: Edit `server/test/fixtures.ts`**

Find this block:

```ts

// Start test through the teacher API; returns the upload token of the link.
```

Replace it with:

```ts

// Marks the CES test file and the CES barem as uploaded (rows only; nothing in R2).
export async function addCesFiles(api: TestApi, code: string, kinds: ('test' | 'barem')[] = ['test', 'barem']): Promise<void> {
  for (const kind of kinds) {
    await api.db
      .prepare(`UPDATE tests SET ces_${kind}_file_key = ?, ces_${kind}_file_name = ?, ces_${kind}_file_type = 'application/pdf' WHERE code = ?`)
      .bind(`fixture/${code}/ces/${kind}.pdf`, `ces-${kind}.pdf`, code)
      .run();
  }
}

// Marks students as CES, straight in the database.
export async function markCes(api: TestApi, ...studentIds: number[]): Promise<void> {
  for (const id of studentIds) await api.db.prepare('UPDATE students SET ces = 1 WHERE id = ?').bind(id).run();
}

// Start test through the teacher API; returns the upload token of the link.
```

- [ ] **Step 3: Create `server/routes/cesVariant.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { addCesFiles, addSubmission, addTestFiles, makeClass, makeTest, markCes, otherTeacherTest, startTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The CES variant of a test, as the teacher sees and changes it (spec: CES
// variant). The robot's side is in runnerCes.test.ts.

let api: TestApi;
let dispatchRobot: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
let code: string;
let students: number[];

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7 ${text}`);
const putCesFile = async (kind: 'test' | 'barem', name: string, text: string, target = code) => {
  const res = await api.fetch(`/api/admin/tests/${target}/ces/files/${kind}`, {
    method: 'PUT',
    body: pdf(text),
    headers: { 'Content-Type': PDF_TYPE, 'X-File-Name': encodeURIComponent(name) },
  });
  return { status: res.status, body: await res.json() };
};
const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE code = ?`).bind(...params, code).run();
const row = () =>
  api.db
    .prepare(
      `SELECT files_version, ces_files_version, ces_test_file_key, ces_barem_file_key, ces_barem_request, ces_barem_unchecked,
         ces_exercise_list_status, exercise_list_status, ces_print_status, evaluation_at, test_file_key
       FROM tests WHERE code = ?`,
    )
    .bind(code)
    .first<Record<string, string | number | null>>();
const info = async () => (await api.request('GET', `/api/admin/tests/${code}`)).body.test.ces;

beforeEach(async () => {
  dispatchRobot = vi.fn(async () => true);
  api = await startTestApi({ app: { dispatchRobot } });
  const cls = await makeClass(api, '9R2', ['Bursașiu Teodor', 'Ene Ana']);
  students = cls.studentIds;
  code = await makeTest(api, cls.id);
});

afterEach(async () => {
  await api.dispose();
});

describe('the CES variant of a test page', () => {
  it('is empty on a new test, and counts the active CES students of the class', async () => {
    expect(await info()).toEqual({
      studentCount: 0,
      files: { test: null, barem: null },
      baremNotes: '',
      barem: { request: 'none', unchecked: false },
      filesVersion: 0,
      exerciseList: { status: 'none', message: null },
      print: { status: 'none', fromWord: false },
      papers: 0,
      waiting: 0,
      totalPoints: null,
      classTotalPoints: null,
    });
    await markCes(api, students[0]!);
    expect((await info()).studentCount).toBe(1);
    // A CES student who left the class does not count.
    await api.db.prepare('UPDATE enrollments SET active = 0 WHERE student_id = ?').bind(students[0]).run();
    expect((await info()).studentCount).toBe(0);
  });

  it('counts the CES papers that wait for grading, by the student mark until a paper goes to grading', async () => {
    await startTest(api, code);
    await addCesFiles(api, code, ['test']);
    await markCes(api, students[0]!);
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    await addSubmission(api, code, students[1]!, { status: 'submitted', files: 1 });
    expect(await info()).toMatchObject({ waiting: 1, papers: 0 });
    // Fixed as a class paper when it went to grading: the mark no longer moves it.
    await api.db.prepare("UPDATE submissions SET variant = 'class' WHERE student_id = ?").bind(students[0]).run();
    expect(await info()).toMatchObject({ waiting: 0, papers: 0 });
  });

  it('gives the totals of the CES and the class exercise lists', async () => {
    await setTest(
      `exercise_list_json = '{"totalPoints":100}', ces_exercise_list_json = '{"totalPoints":90}'`,
    );
    expect(await info()).toMatchObject({ totalPoints: 90, classTotalPoints: 100 });
  });
});

describe('PUT /ces/files/:kind', () => {
  it('stores the CES test under ces/, apart from the class files, and starts the robot for its print PDF', async () => {
    await addTestFiles(api, code, ['test']);
    const before = await row();
    const res = await putCesFile('test', 'Test adaptat.pdf', 'ces');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ file: { name: 'Test adaptat.pdf', type: PDF_TYPE }, robot: 'dispatched' });
    const after = await row();
    expect(after).toMatchObject({ ces_test_file_key: `t/1/2026/${code}/ces/test/test-adaptat.pdf`, ces_files_version: 1, ces_print_status: 'none' });
    // The class test is not touched.
    expect(after!.files_version).toBe(before!.files_version);
    expect(after!.test_file_key).toBe(before!.test_file_key);
    expect((await info()).files.test).toEqual({ name: 'Test adaptat.pdf', type: PDF_TYPE });

    const file = await api.fetch(`/api/admin/tests/${code}/ces/files/test`);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe('%PDF-1.7 ces');
  });

  it('clears the CES exercise list for a new CES barem, and keeps the class list', async () => {
    await setTest("exercise_list_status = 'ready', ces_exercise_list_status = 'ready', ces_barem_unchecked = 1");
    const res = await putCesFile('barem', 'barem CES.pdf', 'b');
    expect(res.status).toBe(200);
    // A draft: no exercise list to make yet.
    expect(res.body.robot).toBeNull();
    expect(await row()).toMatchObject({ ces_exercise_list_status: 'none', exercise_list_status: 'ready', ces_barem_unchecked: 0 });
  });

  it('starts the robot for a CES barem during the evaluation: the CES papers wait for it', async () => {
    await startTest(api, code);
    await setTest("status = 'evaluating'");
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    const res = await putCesFile('barem', 'barem CES.pdf', 'b');
    expect(res.status).toBe(200);
    expect(res.body.robot).toBe('dispatched');
  });

  it('refuses a new CES file while the robot grades a CES paper', async () => {
    await startTest(api, code);
    await setTest("status = 'evaluating'");
    const id = await addSubmission(api, code, students[0]!, { status: 'grading', files: 1 });
    await api.db.prepare("UPDATE submissions SET variant = 'ces' WHERE id = ?").bind(id).run();
    const res = await putCesFile('barem', 'barem CES.pdf', 'b');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ces_grading');
    const notes = await api.request('PUT', `/api/admin/tests/${code}/ces/barem-notes`, { notes: 'Altfel.' });
    expect(notes.body.error).toBe('ces_grading');
  });

  it('answers 404 for the test of another teacher', async () => {
    const other = await otherTeacherTest(api);
    const res = await putCesFile('test', 't.pdf', 'x', other.code);
    expect(res.status).toBe(404);
  });
});

describe('PUT /ces/barem-notes', () => {
  it('saves the CES notes, counts a new CES files version and clears the CES list only', async () => {
    await setTest("exercise_list_status = 'ready', ces_exercise_list_status = 'ready'");
    const res = await api.request('PUT', `/api/admin/tests/${code}/ces/barem-notes`, { notes: 'Punctează pe pași.' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ baremNotes: 'Punctează pe pași.', robot: null });
    expect(await row()).toMatchObject({ ces_files_version: 1, files_version: 0, ces_exercise_list_status: 'none', exercise_list_status: 'ready' });
    expect((await info()).baremNotes).toBe('Punctează pe pași.');
  });
});

describe('POST /ces/barem/generate and /ces/barem/checked', () => {
  it('refuses without a CES test file', async () => {
    const res = await api.request('POST', `/api/admin/tests/${code}/ces/barem/generate`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('missing_test_file');
  });

  it('generates the CES barem during the evaluation and keeps the schedule of an open test', async () => {
    await startTest(api, code);
    await addCesFiles(api, code, ['test']);
    await setTest("evaluation_at = '2099-01-01T10:00:00.000Z'");
    const open = await api.request('POST', `/api/admin/tests/${code}/ces/barem/generate`);
    expect(open.status).toBe(200);
    expect(open.body).toEqual({ barem: { request: 'requested', unchecked: false }, robot: 'dispatched' });
    expect(await row()).toMatchObject({ ces_barem_request: 'requested', evaluation_at: '2099-01-01T10:00:00.000Z' });

    // A test in evaluation with nothing to grade would end at the next request.
    await addSubmission(api, code, students[1]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', ces_barem_request = 'none'");
    const evaluating = await api.request('POST', `/api/admin/tests/${code}/ces/barem/generate`);
    expect(evaluating.status).toBe(200);
    // The class barem cannot be generated then.
    await addTestFiles(api, code, ['test']);
    expect((await api.request('POST', `/api/admin/tests/${code}/barem/generate`)).status).toBe(409);
  });

  it('refuses a CES barem once the test is done', async () => {
    await addCesFiles(api, code, ['test']);
    await setTest("status = 'done'");
    const res = await api.request('POST', `/api/admin/tests/${code}/ces/barem/generate`);
    expect(res.body.error).toBe('not_editable');
  });

  it('confirms the CES barem as the page showed it, and starts the robot during the evaluation', async () => {
    await addCesFiles(api, code, ['test', 'barem']);
    await setTest("ces_barem_unchecked = 1, ces_files_version = 3");
    const stale = await api.request('POST', `/api/admin/tests/${code}/ces/barem/checked`, { filesVersion: 2 });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('stale');

    const draft = await api.request('POST', `/api/admin/tests/${code}/ces/barem/checked`, { filesVersion: 3 });
    expect(draft.body).toEqual({ barem: { request: 'none', unchecked: false }, robot: null });
    expect(dispatchRobot).not.toHaveBeenCalled();

    await setTest("status = 'evaluating', ces_barem_unchecked = 1");
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    const evaluating = await api.request('POST', `/api/admin/tests/${code}/ces/barem/checked`, { filesVersion: 3 });
    expect(evaluating.body.robot).toBe('dispatched');
    // The class barem's check is apart.
    expect((await api.request('POST', `/api/admin/tests/${code}/barem/checked`, { filesVersion: 0 })).status).toBe(409);
  });
});

describe('DELETE /ces', () => {
  it('removes the CES files, from the database and from R2', async () => {
    await putCesFile('test', 'Test adaptat.pdf', 'ces');
    await putCesFile('barem', 'Barem adaptat.pdf', 'b');
    await setTest("ces_print_status = 'ready', ces_print_file_key = 'x/ces-print.pdf', ces_barem_notes = 'N'");
    await api.env.FILES.put('x/ces-print.pdf', 'p');
    const res = await api.request('DELETE', `/api/admin/tests/${code}/ces`);
    expect(res.status).toBe(200);
    expect(res.body.ces).toMatchObject({ files: { test: null, barem: null }, baremNotes: '', filesVersion: 3, print: { status: 'none', fromWord: false } });
    expect(await api.env.FILES.get(`t/1/2026/${code}/ces/test/test-adaptat.pdf`)).toBeNull();
    expect(await api.env.FILES.get(`t/1/2026/${code}/ces/barem/barem-adaptat.pdf`)).toBeNull();
    expect(await api.env.FILES.get('x/ces-print.pdf')).toBeNull();
  });

  it('refuses once a paper went to grading with the CES variant', async () => {
    await addCesFiles(api, code);
    const id = await addSubmission(api, code, students[0]!, { status: 'graded', files: 1 });
    await api.db.prepare("UPDATE submissions SET variant = 'ces' WHERE id = ?").bind(id).run();
    const res = await api.request('DELETE', `/api/admin/tests/${code}/ces`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ces_papers');
    expect((await row())!.ces_test_file_key).not.toBeNull();
  });

  it('allows it while the CES papers only wait, and says when there is nothing to remove', async () => {
    await addCesFiles(api, code, ['test']);
    await markCes(api, students[0]!);
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    expect((await api.request('DELETE', `/api/admin/tests/${code}/ces`)).status).toBe(200);
    const again = await api.request('DELETE', `/api/admin/tests/${code}/ces`);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('no_ces');
  });
});

describe('the CES print PDF and exercise list', () => {
  it('tries a failed CES print PDF again', async () => {
    await addCesFiles(api, code, ['test']);
    await setTest("ces_print_status = 'failed', ces_print_attempts = 3");
    const res = await api.request('POST', `/api/admin/tests/${code}/ces/print/retry`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ print: { status: 'none', fromWord: false }, robot: 'dispatched' });
    expect((await row())!.ces_print_status).toBe('none');
    expect((await api.request('POST', `/api/admin/tests/${code}/ces/print/retry`)).status).toBe(409);
  });

  it('serves the CES print PDF once it is ready', async () => {
    expect((await api.fetch(`/api/admin/tests/${code}/ces/print`)).status).toBe(404);
    await setTest("ces_print_status = 'ready', ces_print_file_key = 'x/ces-print.pdf'");
    await api.env.FILES.put('x/ces-print.pdf', '%PDF-1.7 qr');
    const res = await api.fetch(`/api/admin/tests/${code}/ces/print`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('-CES-cu-cod-qr.pdf');
  });

  it('accepts a CES list with a problem and tries a failed one again, apart from the class list', async () => {
    await setTest("status = 'evaluating', exercise_list_status = 'problem', ces_exercise_list_status = 'problem'");
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    const accepted = await api.request('POST', `/api/admin/tests/${code}/ces/exercise-list/accept`);
    expect(accepted.body).toMatchObject({ exerciseList: { status: 'accepted' }, robot: 'dispatched' });
    expect(await row()).toMatchObject({ ces_exercise_list_status: 'accepted', exercise_list_status: 'problem' });
    await setTest("ces_exercise_list_status = 'failed'");
    const retried = await api.request('POST', `/api/admin/tests/${code}/ces/exercise-list/retry`);
    expect(retried.body).toMatchObject({ exerciseList: { status: 'none', message: null } });
    expect((await api.request('POST', `/api/admin/tests/${code}/ces/exercise-list/retry`)).status).toBe(409);
  });
});

describe('deleting a test', () => {
  it('deletes the CES files too', async () => {
    await putCesFile('test', 'Test adaptat.pdf', 'ces');
    expect((await api.request('DELETE', `/api/admin/tests/${code}`)).status).toBe(200);
    expect(await api.env.FILES.get(`t/1/2026/${code}/ces/test/test-adaptat.pdf`)).toBeNull();
  });
});
```

- [ ] **Step 4: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  BaremNotesAnswer,
  ClassReport,
```

Replace it with:

```ts
  BaremNotesAnswer,
  CesVariantInfo,
  ClassReport,
```

- [ ] **Step 5: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
// A test as the API returns it, for building fake data in tests.
export function fakeTest(overrides: Partial<TestInfo> = {}, uploads: UploadRow[] = []): TestDetail {
```

Replace it with:

```ts
// A test as the API returns it, for building fake data in tests.
// A test with no CES variant, in a class with no CES student.
export function noCesVariant(overrides: Partial<CesVariantInfo> = {}): CesVariantInfo {
  return {
    studentCount: 0,
    files: { test: null, barem: null },
    baremNotes: '',
    barem: { request: 'none', unchecked: false },
    filesVersion: 0,
    exerciseList: { status: 'none', message: null },
    print: { status: 'none', fromWord: false },
    papers: 0,
    waiting: 0,
    totalPoints: null,
    classTotalPoints: null,
    ...overrides,
  };
}

export function fakeTest(overrides: Partial<TestInfo> = {}, uploads: UploadRow[] = []): TestDetail {
```

- [ ] **Step 6: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
      print: { status: 'none', fromWord: false },
      // Made again from the files and the uploads (withDerived).
```

Replace it with:

```ts
      print: { status: 'none', fromWord: false },
      ces: noCesVariant(),
      // Made again from the files and the uploads (withDerived).
```

- [ ] **Step 7: Run the new tests to see them fail**

Run: `npx vitest run shared/variantKeys.test.ts server/routes/cesVariant.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  19 failed | 2 passed (21)`: the CES keys are the class keys (`'t/1/2026/9R2-26T1/test/test-adaptat.d…'`), the test page has no `ces` (`expected undefined to deeply equal { studentCount: +0, …(10) }`), and the CES routes answer 404. The two that pass are guards: "answers 404 for the test of another teacher" and "deletes the CES files too".

- [ ] **Step 8: Edit `shared/files.ts`**

Find this block:

```ts
export type TestFileKind = 'test' | 'barem';

```

Replace it with:

```ts
export type TestFileKind = 'test' | 'barem';

// Which version of a test a file or a paper belongs to: the class test, or its
// CES variant ("cerințe educaționale speciale"), an adapted test with its own
// barem for the CES students of the class.
export type TestVariant = 'class' | 'ces';

```

- [ ] **Step 9: Edit `shared/files.ts`**

Find this block:

```ts

// t/1/2026/6E2-26T1/print/test-final-v3-qr.pdf: the test file with the QR code,
// named after the test file and the files version it was made from.
export function printFileKey(teacherId: number, schoolYear: number, code: string, testFileName: string, filesVersion: number): string {
  return `${testFolder(teacherId, schoolYear, code)}print/${slugify(withoutExtension(testFileName))}-v${filesVersion}-qr.pdf`;
}
```

Replace it with:

```ts

// The files of a variant: the CES variant's under ces/ in the test's folder, so
// a CES file never takes the key of a class file with the same name.
function variantFolder(teacherId: number, schoolYear: number, code: string, variant: TestVariant): string {
  return `${testFolder(teacherId, schoolYear, code)}${variant === 'ces' ? 'ces/' : ''}`;
}

// t/1/2026/6E2-26T1/print/test-final-v3-qr.pdf: the test file with the QR code,
// named after the test file and the files version it was made from.
export function printFileKey(
  teacherId: number,
  schoolYear: number,
  code: string,
  testFileName: string,
  filesVersion: number,
  variant: TestVariant = 'class',
): string {
  return `${variantFolder(teacherId, schoolYear, code, variant)}print/${slugify(withoutExtension(testFileName))}-v${filesVersion}-qr.pdf`;
}
```

- [ ] **Step 10: Edit `shared/files.ts`**

Find this block:

```ts
// slugify never writes, so no teacher upload gets this key.
export function generatedBaremKey(teacherId: number, schoolYear: number, code: string, filesVersion: number): string {
  return `${testFolder(teacherId, schoolYear, code)}barem/generat_v${filesVersion}.docx`;
}
```

Replace it with:

```ts
// slugify never writes, so no teacher upload gets this key.
export function generatedBaremKey(teacherId: number, schoolYear: number, code: string, filesVersion: number, variant: TestVariant = 'class'): string {
  return `${variantFolder(teacherId, schoolYear, code, variant)}barem/generat_v${filesVersion}.docx`;
}
```

- [ ] **Step 11: Edit `shared/files.ts`**

Find this block:

```ts
  contentType: string,
): string {
  return `${testFolder(teacherId, schoolYear, code)}${kind}/${slugify(withoutExtension(originalName))}.${extensionFor(contentType)}`;
}
```

Replace it with:

```ts
  contentType: string,
  variant: TestVariant = 'class',
): string {
  return `${variantFolder(teacherId, schoolYear, code, variant)}${kind}/${slugify(withoutExtension(originalName))}.${extensionFor(contentType)}`;
}
```

- [ ] **Step 12: Create `server/db/variant.ts`**

```ts
import type { TestVariant } from '../../shared/files.ts';

// The CES variant of a test (migration 0024) has its own copy of every column
// that the test file, the barem, the exercise list and the print PDF use: the
// same name with "ces_" in front. The queries that work on either variant
// name their columns through columns(variant).
export type VariantColumn =
  | 'test_file_key'
  | 'test_file_name'
  | 'test_file_type'
  | 'barem_file_key'
  | 'barem_file_name'
  | 'barem_file_type'
  | 'barem_notes'
  | 'barem_request'
  | 'barem_request_attempts'
  | 'barem_unchecked'
  | 'exercise_list_json'
  | 'exercise_list_status'
  | 'exercise_list_message'
  | 'exercise_list_attempts'
  | 'print_status'
  | 'print_file_key'
  | 'print_attempts'
  | 'files_version';

export function columns(variant: TestVariant): (column: VariantColumn) => string {
  return (column) => (variant === 'ces' ? `ces_${column}` : column);
}

// The test statuses in which the robot may generate a barem. A class barem
// only before the evaluation (an unchecked barem must not change one that is
// grading); a CES barem also during it: the CES papers wait for it, and the
// class papers are graded meanwhile.
export function baremStatuses(variant: TestVariant): string {
  return variant === 'ces' ? "'draft', 'open', 'evaluating'" : "'draft', 'open'";
}

// A draft or open test (alias `t`) with an upload link and a test file of the
// variant whose print PDF is not made yet. A flat condition: the print writes
// pass the table name for `t`.
export function needsPrintSql(variant: TestVariant, t = 't'): string {
  const c = columns(variant);
  return `${t}.status IN ('draft', 'open') AND ${t}.upload_token IS NOT NULL AND ${t}.${c('test_file_key')} IS NOT NULL AND ${t}.${c('print_status')} = 'none'`;
}

// A test (alias `t`) with a test file of the variant whose barem the teacher
// asked the robot to generate. A flat condition, like needsPrintSql.
export function needsBaremSql(variant: TestVariant, t = 't'): string {
  const c = columns(variant);
  return `${t}.status IN (${baremStatuses(variant)}) AND ${t}.${c('test_file_key')} IS NOT NULL AND ${t}.${c('barem_request')} = 'requested'`;
}

// The barem of the variant can be graded against: it exists, the teacher
// checked it when the robot generated it, and no generation is running.
export function baremActiveSql(variant: TestVariant, t = 't'): string {
  const c = columns(variant);
  return `${t}.${c('barem_file_key')} IS NOT NULL AND ${t}.${c('barem_unchecked')} = 0 AND ${t}.${c('barem_request')} <> 'requested'`;
}

// The variant a paper (alias `s`) of test `t` is graded with: the one written
// on it when it first went to grading; before that, CES when the student is
// marked CES and the test has a CES test file, the class test otherwise.
export function paperVariantSql(s = 's', t = 't'): string {
  return `COALESCE(${s}.variant, CASE WHEN ${t}.ces_test_file_key IS NOT NULL
    AND EXISTS (SELECT 1 FROM students pv WHERE pv.id = ${s}.student_id AND pv.ces = 1) THEN 'ces' ELSE 'class' END)`;
}
```

- [ ] **Step 13: Edit `server/db/runner.ts`**

Find this block:

```ts
import { exerciseColumns, type StoredItem } from './exerciseColumns.ts';

```

Replace it with:

```ts
import { exerciseColumns, type StoredItem } from './exerciseColumns.ts';
import { needsBaremSql, needsPrintSql } from './variant.ts';

```

- [ ] **Step 14: Edit `server/db/runner.ts`**

Find this block:

```ts
// t. to tests.
export const NEEDS_PRINT =
  "t.status IN ('draft', 'open') AND t.upload_token IS NOT NULL AND t.test_file_key IS NOT NULL AND t.print_status = 'none'";
// A draft or open test with a test file whose barem the teacher asked the robot
// to generate. Keep it a flat condition on the alias t.
export const NEEDS_BAREM = "t.status IN ('draft', 'open') AND t.test_file_key IS NOT NULL AND t.barem_request = 'requested'";

```

Replace it with:

```ts
// t. to tests.
export const NEEDS_PRINT = needsPrintSql('class');
// A draft or open test with a test file whose barem the teacher asked the robot
// to generate. Keep it a flat condition on the alias t.
export const NEEDS_BAREM = needsBaremSql('class');

```

- [ ] **Step 15: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
import type { AnalysisStatus, TestStatus } from '../../shared/tests.ts';
import { flagCountSql, type ShownResult } from './evaluations.ts';
import type { ShownUpload } from './submissions.ts';

```

Replace it with:

```ts
import type { AnalysisStatus, TestStatus } from '../../shared/tests.ts';
import type { TestVariant } from '../../shared/files.ts';
import { flagCountSql, type ShownResult } from './evaluations.ts';
import type { ShownUpload } from './submissions.ts';
import { baremActiveSql, columns } from './variant.ts';

```

- [ ] **Step 16: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
// when the robot generated it, and no generation is running.
export const BAREM_ACTIVE = "t.barem_file_key IS NOT NULL AND t.barem_unchecked = 0 AND t.barem_request <> 'requested'";

```

Replace it with:

```ts
// when the robot generated it, and no generation is running.
export const BAREM_ACTIVE = baremActiveSql('class');

```

- [ ] **Step 17: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
// not add up. Returns the test's status, or null when the list had no problem.
export async function acceptExerciseList(db: D1Database, teacherId: number, testId: number, now: string): Promise<TestStatus | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_status = 'accepted', updated_at = ?
       WHERE id = ? AND teacher_id = ? AND exercise_list_status = 'problem'
       RETURNING status`,
```

Replace it with:

```ts
// not add up. Returns the test's status, or null when the list had no problem.
export async function acceptExerciseList(
  db: D1Database,
  teacherId: number,
  testId: number,
  now: string,
  variant: TestVariant = 'class',
): Promise<TestStatus | null> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('exercise_list_status')} = 'accepted', updated_at = ?
       WHERE id = ? AND teacher_id = ? AND ${c('exercise_list_status')} = 'problem'
       RETURNING status`,
```

- [ ] **Step 18: Edit `server/db/lifecycle.ts`**

Find this block:

```ts
// Returns the test's status, or null when the list had not failed.
export async function retryExerciseList(db: D1Database, teacherId: number, testId: number, now: string): Promise<TestStatus | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_status = 'none', exercise_list_message = NULL, exercise_list_attempts = 0, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND exercise_list_status = 'failed'
       RETURNING status`,
```

Replace it with:

```ts
// Returns the test's status, or null when the list had not failed.
export async function retryExerciseList(
  db: D1Database,
  teacherId: number,
  testId: number,
  now: string,
  variant: TestVariant = 'class',
): Promise<TestStatus | null> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('exercise_list_status')} = 'none', ${c('exercise_list_message')} = NULL, ${c('exercise_list_attempts')} = 0, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND ${c('exercise_list_status')} = 'failed'
       RETURNING status`,
```

- [ ] **Step 19: Edit `shared/api.ts`**

Find this block:

```ts

export interface TestInfo extends TestSummary {
```

Replace it with:

```ts

// The CES variant of a test (spec: CES variant), for the teacher only: the
// adapted test that the CES students of the class get, with its own barem,
// exercise list and print PDF. The test has a CES variant while `files.test`
// is set.
export interface CesVariantInfo {
  // Active students of the class marked CES: the page offers the variant only
  // when there is one (or the test already has a variant).
  studentCount: number;
  files: Record<TestFileKind, TestFileInfo | null>;
  baremNotes: string;
  barem: { request: BaremRequest; unchecked: boolean };
  // Goes up with every new CES file or CES barem comments.
  filesVersion: number;
  exerciseList: ExerciseListInfo;
  print: { status: PrintStatus; fromWord: boolean };
  // Papers that went to grading with the CES variant: while there is one, the
  // variant cannot be removed.
  papers: number;
  // CES papers sent and not graded yet: they wait for an active CES barem.
  waiting: number;
  // The highest total of the CES exercise list and of the class list, once the
  // robot made them. The CES barem should total as much as the class barem.
  totalPoints: number | null;
  classTotalPoints: number | null;
}

export interface TestInfo extends TestSummary {
```

- [ ] **Step 20: Edit `shared/api.ts`**

Find this block:

```ts
  print: { status: PrintStatus; fromWord: boolean };
}
```

Replace it with:

```ts
  print: { status: PrintStatus; fromWord: boolean };
  ces: CesVariantInfo;
}
```

- [ ] **Step 21: Edit `shared/api.ts`**

Find this block:

```ts

// The teacher checked the generated barem.
export interface BaremCheckedAnswer {
  barem: TestInfo['barem'];
}
```

Replace it with:

```ts

// The teacher checked the generated barem. `robot`: only for the CES barem,
// set when CES papers that waited for it go to the robot now.
export interface BaremCheckedAnswer {
  barem: TestInfo['barem'];
  robot?: RobotStart | null;
}

// "Șterge varianta CES".
export interface CesRemovedAnswer {
  ces: CesVariantInfo;
}
```

- [ ] **Step 22: Edit `server/db/tests.ts`**

Find this block:

```ts
  BaremRequest,
  ExerciseListInfo,
```

Replace it with:

```ts
  BaremRequest,
  CesVariantInfo,
  ExerciseListInfo,
```

- [ ] **Step 23: Edit `server/db/tests.ts`**

Find this block:

```ts
} from '../../shared/api.ts';
import { DOCX_TYPE, type TestFileKind } from '../../shared/files.ts';
import { averageGrade } from '../../shared/stats.ts';
```

Replace it with:

```ts
} from '../../shared/api.ts';
import { DOCX_TYPE, type TestFileKind, type TestVariant } from '../../shared/files.ts';
import { averageGrade } from '../../shared/stats.ts';
```

- [ ] **Step 24: Edit `server/db/tests.ts`**

Find this block:

```ts
import { flagCountSql } from './evaluations.ts';
import { NEEDS_BAREM, NEEDS_PRINT } from './runner.ts';

```

Replace it with:

```ts
import { flagCountSql } from './evaluations.ts';
import { baremStatuses, columns, needsBaremSql, needsPrintSql, paperVariantSql } from './variant.ts';

```

- [ ] **Step 25: Edit `server/db/tests.ts`**

Find this block:

```ts

// A test as the API works with it: the summary the browser sees, plus its
// database id and the R2 keys of its files.
export interface TestRecord {
  id: number;
  summary: TestSummary;
  uploadToken: string | null;
  multiUploadToken: string | null;
  files: Record<TestFileKind, StoredFile | null>;
```

Replace it with:

```ts

// What each variant of a test has of its own: the files, the barem comments,
// the barem's state, the exercise list and the print PDF, with their R2 keys.
export interface VariantRecord {
  files: Record<TestFileKind, StoredFile | null>;
```

- [ ] **Step 26: Edit `server/db/tests.ts`**

Find this block:

```ts
  filesVersion: number;
  analysis: AnalysisInfo;
  print: { status: PrintStatus; key: string | null; fromWord: boolean };
}
```

Replace it with:

```ts
  filesVersion: number;
  print: { status: PrintStatus; key: string | null; fromWord: boolean };
}

// A test as the API works with it: the summary the browser sees, plus its
// database id and the R2 keys of its files. The class variant's parts are at
// the top; the CES variant's are in `ces`.
export interface TestRecord extends VariantRecord {
  id: number;
  summary: TestSummary;
  uploadToken: string | null;
  multiUploadToken: string | null;
  analysis: AnalysisInfo;
  ces: VariantRecord & {
    studentCount: number;
    papers: number;
    waiting: number;
    // CES papers the robot is grading now: their files must not change.
    grading: number;
    totalPoints: number | null;
    classTotalPoints: number | null;
  };
}

// The parts of one variant of a test.
export function variantOf(record: TestRecord, variant: TestVariant): VariantRecord {
  return variant === 'ces' ? record.ces : record;
}
```

- [ ] **Step 27: Edit `server/db/tests.ts`**

Find this block:

```ts
  print_file_key: string | null;
  student_count: number;
```

Replace it with:

```ts
  print_file_key: string | null;
  ces_test_file_key: string | null;
  ces_test_file_name: string | null;
  ces_test_file_type: string | null;
  ces_barem_file_key: string | null;
  ces_barem_file_name: string | null;
  ces_barem_file_type: string | null;
  ces_barem_notes: string | null;
  ces_barem_request: BaremRequest;
  ces_barem_unchecked: number;
  ces_files_version: number;
  ces_exercise_list_status: ExerciseListStatus;
  ces_exercise_list_message: string | null;
  ces_print_status: PrintStatus;
  ces_print_file_key: string | null;
  ces_total_points: number | null;
  class_total_points: number | null;
  ces_student_count: number;
  ces_papers: number;
  ces_waiting: number;
  ces_grading: number;
  student_count: number;
```

- [ ] **Step 28: Edit `server/db/tests.ts`**

Find this block:

```ts
    t.print_status, t.print_file_key,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = t.class_id AND e.active = 1) AS student_count,
```

Replace it with:

```ts
    t.print_status, t.print_file_key,
    t.ces_test_file_key, t.ces_test_file_name, t.ces_test_file_type,
    t.ces_barem_file_key, t.ces_barem_file_name, t.ces_barem_file_type, t.ces_barem_notes, t.ces_barem_request, t.ces_barem_unchecked,
    t.ces_files_version, t.ces_exercise_list_status, t.ces_exercise_list_message, t.ces_print_status, t.ces_print_file_key,
    json_extract(t.ces_exercise_list_json, '$.totalPoints') AS ces_total_points,
    json_extract(t.exercise_list_json, '$.totalPoints') AS class_total_points,
    (SELECT COUNT(*) FROM enrollments e JOIN students st ON st.id = e.student_id
       WHERE e.class_id = t.class_id AND e.active = 1 AND st.ces = 1) AS ces_student_count,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.variant = 'ces') AS ces_papers,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status IN ('submitted', 'grading') AND ${paperVariantSql('s', 't')} = 'ces') AS ces_waiting,
    (SELECT COUNT(*) FROM submissions s WHERE s.test_id = t.id AND s.status = 'grading' AND s.variant = 'ces') AS ces_grading,
    (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = t.class_id AND e.active = 1) AS student_count,
```

- [ ] **Step 29: Edit `server/db/tests.ts`**

Find this block:

```ts
    print: { status: row.print_status, key: row.print_file_key, fromWord: row.test_file_type === DOCX_TYPE },
  };
```

Replace it with:

```ts
    print: { status: row.print_status, key: row.print_file_key, fromWord: row.test_file_type === DOCX_TYPE },
    ces: {
      files: {
        test: storedFile(row.ces_test_file_key, row.ces_test_file_name, row.ces_test_file_type),
        barem: storedFile(row.ces_barem_file_key, row.ces_barem_file_name, row.ces_barem_file_type),
      },
      exerciseList: { status: row.ces_exercise_list_status, message: row.ces_exercise_list_message },
      baremNotes: row.ces_barem_notes ?? '',
      barem: { request: row.ces_barem_request, unchecked: row.ces_barem_unchecked === 1 },
      filesVersion: row.ces_files_version,
      print: { status: row.ces_print_status, key: row.ces_print_file_key, fromWord: row.ces_test_file_type === DOCX_TYPE },
      studentCount: row.ces_student_count,
      papers: row.ces_papers,
      waiting: row.ces_waiting,
      grading: row.ces_grading,
      totalPoints: row.ces_total_points,
      classTotalPoints: row.class_total_points,
    },
  };
}

const fileInfo = (file: StoredFile | null) => (file ? { name: file.name, type: file.type } : null);

// What the teacher app sees of the CES variant: no R2 keys.
export function toCesInfo(ces: TestRecord['ces']): CesVariantInfo {
  return {
    studentCount: ces.studentCount,
    files: { test: fileInfo(ces.files.test), barem: fileInfo(ces.files.barem) },
    baremNotes: ces.baremNotes,
    barem: ces.barem,
    filesVersion: ces.filesVersion,
    exerciseList: ces.exerciseList,
    print: { status: ces.print.status, fromWord: ces.print.fromWord },
    papers: ces.papers,
    waiting: ces.waiting,
    totalPoints: ces.totalPoints,
    classTotalPoints: ces.classTotalPoints,
  };
```

- [ ] **Step 30: Edit `server/db/tests.ts`**

Find this block:

```ts
export function toTestInfo(record: TestRecord): TestInfo {
  const info = (file: StoredFile | null) => (file ? { name: file.name, type: file.type } : null);
  return {
```

Replace it with:

```ts
export function toTestInfo(record: TestRecord): TestInfo {
  return {
```

- [ ] **Step 31: Edit `server/db/tests.ts`**

Find this block:

```ts
    multiUploadToken: record.multiUploadToken,
    files: { test: info(record.files.test), barem: info(record.files.barem) },
    exerciseList: record.exerciseList,
```

Replace it with:

```ts
    multiUploadToken: record.multiUploadToken,
    files: { test: fileInfo(record.files.test), barem: fileInfo(record.files.barem) },
    exerciseList: record.exerciseList,
```

- [ ] **Step 32: Edit `server/db/tests.ts`**

Find this block:

```ts
    print: { status: record.print.status, fromWord: record.print.fromWord },
  };
```

Replace it with:

```ts
    print: { status: record.print.status, fromWord: record.print.fromWord },
    ces: toCesInfo(record.ces),
  };
```

- [ ] **Step 33: Edit `server/db/tests.ts`**

Find this block:

```ts

// Points the test at a new test or barem file, and counts the change in
// files_version. A new test file also clears the print PDF made from the old
// one, and gives `uploadToken` to a draft made before tests got their link at
// once (every other test has its link), so its print PDF waits for the robot. A new barem also clears the exercise list, which the robot made from
// the old one (spec §8.5). Returns the test's status, the key of the print
// PDF the change cleared, and the key of the file it replaced (the caller
// deletes their objects), or null when the test is gone. The keys are read in
// the same batch as the write, so a print or a generated barem the robot
// saves meanwhile is not left in R2.
export async function saveTestFile(
```

Replace it with:

```ts

// Points the test at a new test or barem file of the variant, and counts the
// change in the variant's files_version. A new test file also clears the print
// PDF made from the old one, and gives `uploadToken` to a draft made before
// tests got their link at once (every other test has its link), so its print
// PDF waits for the robot. A new barem also clears the exercise list, which
// the robot made from the old one (spec §8.5). Returns the test's status, the
// key of the print PDF the change cleared, and the key of the file it replaced
// (the caller deletes their objects), or null when the test is gone. The keys
// are read in the same batch as the write, so a print or a generated barem the
// robot saves meanwhile is not left in R2.
export async function saveTestFile(
```

- [ ] **Step 34: Edit `server/db/tests.ts`**

Find this block:

```ts
  uploadToken: string,
): Promise<{ status: TestStatus; clearedPrintKey: string | null; replacedKey: string | null } | null> {
  const sql =
    kind === 'test'
      ? `UPDATE tests SET test_file_key = ?, test_file_name = ?, test_file_type = ?, updated_at = ?, files_version = files_version + 1,
           print_status = 'none', print_attempts = 0, print_file_key = NULL, upload_token = COALESCE(upload_token, ?),
           barem_request = CASE WHEN barem_unchecked = 1 AND status IN ('draft', 'open') THEN 'requested' ELSE barem_request END,
           barem_request_attempts = CASE WHEN barem_unchecked = 1 AND status IN ('draft', 'open') THEN 0 ELSE barem_request_attempts END
         WHERE id = ? AND teacher_id = ?
         RETURNING status`
      : `UPDATE tests SET barem_file_key = ?, barem_file_name = ?, barem_file_type = ?, updated_at = ?, files_version = files_version + 1,
           exercise_list_status = 'none', exercise_list_json = NULL, exercise_list_message = NULL, exercise_list_attempts = 0,
           barem_unchecked = 0, barem_request = 'none', barem_request_attempts = 0
         WHERE id = ? AND teacher_id = ?
```

Replace it with:

```ts
  uploadToken: string,
  variant: TestVariant = 'class',
): Promise<{ status: TestStatus; clearedPrintKey: string | null; replacedKey: string | null } | null> {
  const c = columns(variant);
  const statuses = baremStatuses(variant);
  const sql =
    kind === 'test'
      ? `UPDATE tests SET ${c('test_file_key')} = ?, ${c('test_file_name')} = ?, ${c('test_file_type')} = ?, updated_at = ?,
           ${c('files_version')} = ${c('files_version')} + 1,
           ${c('print_status')} = 'none', ${c('print_attempts')} = 0, ${c('print_file_key')} = NULL, upload_token = COALESCE(upload_token, ?),
           ${c('barem_request')} = CASE WHEN ${c('barem_unchecked')} = 1 AND status IN (${statuses}) THEN 'requested' ELSE ${c('barem_request')} END,
           ${c('barem_request_attempts')} = CASE WHEN ${c('barem_unchecked')} = 1 AND status IN (${statuses}) THEN 0 ELSE ${c('barem_request_attempts')} END
         WHERE id = ? AND teacher_id = ?
         RETURNING status`
      : `UPDATE tests SET ${c('barem_file_key')} = ?, ${c('barem_file_name')} = ?, ${c('barem_file_type')} = ?, updated_at = ?,
           ${c('files_version')} = ${c('files_version')} + 1,
           ${c('exercise_list_status')} = 'none', ${c('exercise_list_json')} = NULL, ${c('exercise_list_message')} = NULL, ${c('exercise_list_attempts')} = 0,
           ${c('barem_unchecked')} = 0, ${c('barem_request')} = 'none', ${c('barem_request_attempts')} = 0
         WHERE id = ? AND teacher_id = ?
```

- [ ] **Step 35: Edit `server/db/tests.ts`**

Find this block:

```ts
    db
      .prepare(`SELECT print_file_key, ${kind === 'test' ? 'test_file_key' : 'barem_file_key'} AS replaced_key FROM tests WHERE id = ? AND teacher_id = ?`)
      .bind(testId, teacherId),
```

Replace it with:

```ts
    db
      .prepare(
        `SELECT ${c('print_file_key')} AS print_file_key, ${kind === 'test' ? c('test_file_key') : c('barem_file_key')} AS replaced_key
         FROM tests WHERE id = ? AND teacher_id = ?`,
      )
      .bind(testId, teacherId),
```

- [ ] **Step 36: Edit `server/db/tests.ts`**

Find this block:

```ts

// Points the test at new barem comments, as if the barem file changed (spec
// §8.5): the exercise list is cleared and files_version goes up, so a list the
// robot made from the old notes is refused. Returns the test's status, or null
// when the test is gone.
export async function saveBaremNotes(
```

Replace it with:

```ts

// Points the variant at new barem comments, as if its barem file changed (spec
// §8.5): its exercise list is cleared and its files_version goes up, so a list
// the robot made from the old notes is refused. Returns the test's status, or
// null when the test is gone.
export async function saveBaremNotes(
```

- [ ] **Step 37: Edit `server/db/tests.ts`**

Find this block:

```ts
  now: string,
): Promise<TestStatus | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET barem_notes = ?, updated_at = ?, files_version = files_version + 1,
         exercise_list_status = 'none', exercise_list_json = NULL, exercise_list_message = NULL, exercise_list_attempts = 0
       WHERE id = ? AND teacher_id = ?
```

Replace it with:

```ts
  now: string,
  variant: TestVariant = 'class',
): Promise<TestStatus | null> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('barem_notes')} = ?, updated_at = ?, ${c('files_version')} = ${c('files_version')} + 1,
         ${c('exercise_list_status')} = 'none', ${c('exercise_list_json')} = NULL, ${c('exercise_list_message')} = NULL, ${c('exercise_list_attempts')} = 0
       WHERE id = ? AND teacher_id = ?
```

- [ ] **Step 38: Edit `server/db/tests.ts`**

Find this block:

```ts
  const keys = results.map((row) => row.r2_key);
  for (const file of [record.files.test, record.files.barem]) if (file) keys.push(file.key);
  if (record.print.key) keys.push(record.print.key);
  return keys;
```

Replace it with:

```ts
  const keys = results.map((row) => row.r2_key);
  for (const variant of [record, record.ces]) {
    for (const file of [variant.files.test, variant.files.barem]) if (file) keys.push(file.key);
    if (variant.print.key) keys.push(variant.print.key);
  }
  return keys;
```

- [ ] **Step 39: Edit `server/db/tests.ts`**

Find this block:

```ts

// True when the test still waits for its print PDF.
export async function needsPrint(db: D1Database, testId: number): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS found FROM tests t WHERE t.id = ? AND ${NEEDS_PRINT}`).bind(testId).first();
  return row !== null;
```

Replace it with:

```ts

// True when the variant still waits for its print PDF.
export async function needsPrint(db: D1Database, testId: number, variant: TestVariant = 'class'): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS found FROM tests t WHERE t.id = ? AND ${needsPrintSql(variant)}`).bind(testId).first();
  return row !== null;
```

- [ ] **Step 40: Edit `server/db/tests.ts`**

Find this block:

```ts

// True when the robot has a barem to generate for the test.
export async function needsBarem(db: D1Database, testId: number): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS found FROM tests t WHERE t.id = ? AND ${NEEDS_BAREM}`).bind(testId).first();
  return row !== null;
```

Replace it with:

```ts

// True when the robot has a barem of the variant to generate for the test.
export async function needsBarem(db: D1Database, testId: number, variant: TestVariant = 'class'): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS found FROM tests t WHERE t.id = ? AND ${needsBaremSql(variant)}`).bind(testId).first();
  return row !== null;
```

- [ ] **Step 41: Edit `server/db/tests.ts`**

Find this block:

```ts

// "Generează baremul": the robot is asked to write the barem from the test
// file. A scheduled evaluation is cleared, because the barem must be checked
// first. False when the test is gone, is not the teacher's, is past
// uploads, or has no test file.
export async function requestBarem(db: D1Database, teacherId: number, testId: number, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET barem_request = 'requested', barem_request_attempts = 0, evaluation_at = NULL, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status IN ('draft', 'open') AND test_file_key IS NOT NULL
       RETURNING id`,
```

Replace it with:

```ts

// "Generează baremul": the robot is asked to write the barem of the variant
// from its test file. For the class barem a scheduled evaluation is cleared,
// because the barem must be checked first; the CES barem holds back only the
// CES papers, so the schedule stays. False when the test is gone, is not the
// teacher's, is past the statuses of baremStatuses, or has no test file of the
// variant.
export async function requestBarem(db: D1Database, teacherId: number, testId: number, now: string, variant: TestVariant = 'class'): Promise<boolean> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('barem_request')} = 'requested', ${c('barem_request_attempts')} = 0,
         ${variant === 'class' ? 'evaluation_at = NULL,' : ''} updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status IN (${baremStatuses(variant)}) AND ${c('test_file_key')} IS NOT NULL
       RETURNING id`,
```

- [ ] **Step 42: Edit `server/db/tests.ts`**

Find this block:

```ts

// The teacher checked the generated barem as the page showed it. False when
// the test is gone, is not the teacher's, the barem is not waiting for a check,
// a new barem is being generated or its generation failed (the barem is then
// the old test's), or a file changed since the page was read.
export async function confirmBarem(
```

Replace it with:

```ts

// The teacher checked the generated barem of the variant as the page showed
// it. Returns the test's status, or null when the test is gone, is not the
// teacher's, the barem is not waiting for a check, a new barem is being
// generated or its generation failed (the barem is then the old test's), or a
// file of the variant changed since the page was read.
export async function confirmBarem(
```

- [ ] **Step 43: Edit `server/db/tests.ts`**

Find this block:

```ts
  now: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET barem_unchecked = 0, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND files_version = ? AND barem_unchecked = 1 AND barem_request = 'none'
       RETURNING id`,
    )
    .bind(now, testId, teacherId, filesVersion)
    .first<{ id: number }>();
  return row !== null;
}

// "Încearcă din nou": a failed print PDF goes back to the queue. Also
// "Pregătește testul cu cod QR" for a draft made before tests got their link
// at once: it gets `uploadToken`, and its print PDF waits for the robot. False
// when the test is gone, is not the teacher's, is past uploads, or its print
// neither failed nor lacks a link (with a test file to print).
export async function retryPrint(db: D1Database, teacherId: number, testId: number, uploadToken: string, now: string): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET print_status = 'none', print_attempts = 0, upload_token = COALESCE(upload_token, ?), updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status IN ('draft', 'open')
         AND (print_status = 'failed' OR (upload_token IS NULL AND test_file_key IS NOT NULL))
       RETURNING id`,
```

Replace it with:

```ts
  now: string,
  variant: TestVariant = 'class',
): Promise<TestStatus | null> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('barem_unchecked')} = 0, updated_at = ?
       WHERE id = ? AND teacher_id = ? AND ${c('files_version')} = ? AND ${c('barem_unchecked')} = 1 AND ${c('barem_request')} = 'none'
       RETURNING status`,
    )
    .bind(now, testId, teacherId, filesVersion)
    .first<{ status: TestStatus }>();
  return row?.status ?? null;
}

// "Încearcă din nou": a failed print PDF of the variant goes back to the
// queue. Also "Pregătește testul cu cod QR" for a draft made before tests got
// their link at once: it gets `uploadToken`, and its print PDF waits for the
// robot. False when the test is gone, is not the teacher's, is past uploads,
// or its print neither failed nor lacks a link (with a test file to print).
export async function retryPrint(
  db: D1Database,
  teacherId: number,
  testId: number,
  uploadToken: string,
  now: string,
  variant: TestVariant = 'class',
): Promise<boolean> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('print_status')} = 'none', ${c('print_attempts')} = 0, upload_token = COALESCE(upload_token, ?), updated_at = ?
       WHERE id = ? AND teacher_id = ? AND status IN ('draft', 'open')
         AND (${c('print_status')} = 'failed' OR (upload_token IS NULL AND ${c('test_file_key')} IS NOT NULL))
       RETURNING id`,
```

- [ ] **Step 44: Edit `server/db/tests.ts`**

Find this block:

```ts

// Deletes the test row; its uploads and file rows go with it (ON DELETE CASCADE).
```

Replace it with:

```ts

// "Șterge varianta CES": every CES column goes back to empty, and the CES files
// version goes up, so a robot job on the old files is refused. Only while no
// paper went to grading with the CES variant, checked in the write: such a
// paper keeps its variant (a regrade reads the CES files). Returns the R2 keys
// of the CES files (read in the same batch, so a print or barem the robot
// saves meanwhile is not left), or null when nothing was removed.
export async function removeCesVariant(db: D1Database, teacherId: number, testId: number, now: string): Promise<string[] | null> {
  const [before, removed] = await db.batch<{ ces_test_file_key?: string | null; ces_barem_file_key?: string | null; ces_print_file_key?: string | null; id?: number }>([
    db.prepare('SELECT ces_test_file_key, ces_barem_file_key, ces_print_file_key FROM tests WHERE id = ? AND teacher_id = ?').bind(testId, teacherId),
    db
      .prepare(
        `UPDATE tests SET ces_test_file_key = NULL, ces_test_file_name = NULL, ces_test_file_type = NULL,
           ces_barem_file_key = NULL, ces_barem_file_name = NULL, ces_barem_file_type = NULL, ces_barem_notes = NULL,
           ces_barem_request = 'none', ces_barem_request_attempts = 0, ces_barem_unchecked = 0,
           ces_exercise_list_json = NULL, ces_exercise_list_status = 'none', ces_exercise_list_message = NULL, ces_exercise_list_attempts = 0,
           ces_print_status = 'none', ces_print_file_key = NULL, ces_print_attempts = 0,
           ces_files_version = ces_files_version + 1, updated_at = ?
         WHERE id = ? AND teacher_id = ? AND (ces_test_file_key IS NOT NULL OR ces_barem_file_key IS NOT NULL)
           AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = tests.id AND s.variant = 'ces')
         RETURNING id`,
      )
      .bind(now, testId, teacherId),
  ]);
  if (!removed?.results[0]) return null;
  const row = before?.results[0];
  return [row?.ces_test_file_key, row?.ces_barem_file_key, row?.ces_print_file_key].filter((key): key is string => typeof key === 'string');
}

// Deletes the test row; its uploads and file rows go with it (ON DELETE CASCADE).
```

- [ ] **Step 45: Create `server/routes/cesVariant.ts`**

```ts
import type { Hono } from 'hono';
import {
  baremCheckedBody,
  baremNotesBody,
  type BaremCheckedAnswer,
  type BaremGenerateAnswer,
  type BaremNotesAnswer,
  type CesRemovedAnswer,
  type ExerciseListAnswer,
  type PrintRetryAnswer,
  type TestFileAnswer,
} from '../../shared/api.ts';
import { isTestFileKind, PDF_TYPE, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE, testFileKey, type TestFileKind } from '../../shared/files.ts';
import { acceptExerciseList, retryExerciseList } from '../db/lifecycle.ts';
import {
  confirmBarem,
  needsBarem,
  needsPrint,
  removeCesVariant,
  requestBarem,
  requireTest,
  retryPrint,
  saveBaremNotes,
  saveTestFile,
  toCesInfo,
  type TestRecord,
} from '../db/tests.ts';
import type { robotStarter } from '../dispatch.ts';
import type { AppEnv } from '../env.ts';
import { ApiError, notFound } from '../errors.ts';
import { nowIso, parseTestCode, readJson } from '../http.ts';
import { newUploadToken } from '../secrets.ts';
import { deleteFilesQuietly, fileResponse, readUpload } from '../uploads.ts';

function parseFileKind(raw: string | undefined): TestFileKind {
  if (raw === undefined || !isTestFileKind(raw)) throw notFound();
  return raw;
}

// While the robot grades a CES paper, it reads the CES files: they stay as they
// are until it ends. The class files have their own rule (the test's routes).
function refuseWhileCesGrading(test: TestRecord): void {
  if (test.ces.grading > 0) {
    throw new ApiError(409, 'ces_grading', 'Robotul corectează acum o lucrare CES. Poți schimba varianta CES după ce termină.');
  }
}

// /api/admin/tests/:code/ces/…: the CES variant of a test (spec: CES variant),
// its own test file, barem, barem comments, exercise list and print PDF. Like
// the class routes, but a CES barem may change while the class papers are
// graded: the CES papers wait for an active CES barem.
export function cesVariantRoutes(routes: Hono<AppEnv>, startRobot: ReturnType<typeof robotStarter>): void {
  routes.put('/:code/ces/files/:kind', async (c) => {
    const kind = parseFileKind(c.req.param('kind'));
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    refuseWhileCesGrading(test);
    const file = await readUpload(c, TEACHER_FILE_TYPES, TEACHER_WRONG_TYPE);
    const key = testFileKey(teacherId, test.summary.schoolYear, test.summary.code, kind, file.name, file.contentType, 'ces');
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
    const stored = { key, name: file.name, type: file.contentType };
    const saved = await saveTestFile(c.env.DB, teacherId, test.id, kind, stored, nowIso(), newUploadToken(), 'ces');
    if (!saved) throw notFound();
    const replaced = saved.replacedKey;
    const stale = [replaced !== key ? replaced : null, saved.clearedPrintKey].filter((k) => k !== null);
    if (stale.length > 0) await deleteFilesQuietly(c.env.FILES, stale);
    // A CES barem during the evaluation: the CES papers that waited for it need
    // their exercise list. A CES test file: its print PDF, or its barem to generate.
    const robotWork =
      kind === 'barem'
        ? saved.status === 'evaluating'
        : (await needsPrint(c.env.DB, test.id, 'ces')) || (await needsBarem(c.env.DB, test.id, 'ces'));
    const robot = robotWork ? await startRobot(c.env) : null;
    return c.json({ file: { name: file.name, type: file.contentType }, robot } satisfies TestFileAnswer);
  });

  routes.get('/:code/ces/files/:kind', async (c) => {
    const kind = parseFileKind(c.req.param('kind'));
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const stored = test.ces.files[kind];
    const object = stored ? await c.env.FILES.get(stored.key) : null;
    if (!stored || !object) throw notFound();
    return fileResponse(object, stored.name, stored.type);
  });

  // "Șterge varianta CES": only while no paper went to grading with it. Its
  // students then get the class test again.
  routes.delete('/:code/ces', async (c) => {
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    const keys = await removeCesVariant(c.env.DB, teacherId, test.id, nowIso());
    if (keys === null) {
      if (test.ces.papers > 0) {
        throw new ApiError(409, 'ces_papers', 'Varianta CES are lucrări corectate, așa că nu mai poate fi ștearsă. Poți înlocui fișierele ei.');
      }
      throw new ApiError(409, 'no_ces', 'Testul nu are o variantă CES.');
    }
    await deleteFilesQuietly(c.env.FILES, keys);
    const current = await requireTest(c.env.DB, teacherId, test.summary.code);
    return c.json({ ces: toCesInfo(current.ces) } satisfies CesRemovedAnswer);
  });

  // The teacher's comments for the CES barem, read by the robot as part of it.
  routes.put('/:code/ces/barem-notes', async (c) => {
    const teacherId = c.var.teacher.id;
    const test = await requireTest(c.env.DB, teacherId, parseTestCode(c.req.param('code')));
    refuseWhileCesGrading(test);
    const body = await readJson(c, baremNotesBody);
    const status = await saveBaremNotes(c.env.DB, teacherId, test.id, body.notes, nowIso(), 'ces');
    if (status === null) throw notFound();
    const robot = status === 'evaluating' || (await needsBarem(c.env.DB, test.id, 'ces')) ? await startRobot(c.env) : null;
    return c.json({ baremNotes: body.notes, robot } satisfies BaremNotesAnswer);
  });

  // "Generează baremul" for the CES test: the robot writes a barem for grading
  // only, from the CES test and the class barem.
  routes.post('/:code/ces/barem/generate', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (!(await requestBarem(c.env.DB, c.var.teacher.id, test.id, nowIso(), 'ces'))) {
      if (!test.ces.files.test) throw new ApiError(409, 'missing_test_file', 'Încarcă testul CES înainte să generezi baremul CES.');
      throw new ApiError(409, 'not_editable', 'Baremul CES nu se mai poate genera după ce s-a terminat corectarea.');
    }
    const barem = { request: 'requested', unchecked: test.ces.barem.unchecked } as const;
    return c.json({ barem, robot: await startRobot(c.env) } satisfies BaremGenerateAnswer);
  });

  // The teacher checked the generated CES barem. CES papers that waited for it
  // go to the robot now.
  routes.post('/:code/ces/barem/checked', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const body = await readJson(c, baremCheckedBody);
    const status = await confirmBarem(c.env.DB, c.var.teacher.id, test.id, body.filesVersion, nowIso(), 'ces');
    if (status === null) throw new ApiError(409, 'stale', 'Baremul CES s-a schimbat. Reîncarcă pagina.');
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ barem: { request: test.ces.barem.request, unchecked: false }, robot } satisfies BaremCheckedAnswer);
  });

  // The CES test with the QR code: the same link as the class test.
  routes.get('/:code/ces/print', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const object = test.ces.print.status === 'ready' && test.ces.print.key ? await c.env.FILES.get(test.ces.print.key) : null;
    if (!object) throw notFound();
    return fileResponse(object, `${test.summary.code}-CES-cu-cod-qr.pdf`, PDF_TYPE);
  });

  routes.post('/:code/ces/print/retry', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    if (!(await retryPrint(c.env.DB, c.var.teacher.id, test.id, newUploadToken(), nowIso(), 'ces'))) {
      throw new ApiError(409, 'not_failed', 'Testul CES cu cod QR nu poate fi încercat din nou.');
    }
    return c.json({ print: { status: 'none', fromWord: test.ces.print.fromWord }, robot: await startRobot(c.env) } satisfies PrintRetryAnswer);
  });

  routes.post('/:code/ces/exercise-list/accept', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const status = await acceptExerciseList(c.env.DB, c.var.teacher.id, test.id, nowIso(), 'ces');
    if (status === null) throw new ApiError(409, 'no_problem', 'Lista de exerciții CES nu are nicio problemă.');
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ exerciseList: { status: 'accepted', message: test.ces.exerciseList.message }, robot } satisfies ExerciseListAnswer);
  });

  routes.post('/:code/ces/exercise-list/retry', async (c) => {
    const test = await requireTest(c.env.DB, c.var.teacher.id, parseTestCode(c.req.param('code')));
    const status = await retryExerciseList(c.env.DB, c.var.teacher.id, test.id, nowIso(), 'ces');
    if (status === null) throw new ApiError(409, 'not_failed', 'Lista de exerciții CES nu a eșuat.');
    const robot = status === 'evaluating' ? await startRobot(c.env) : null;
    return c.json({ exerciseList: { status: 'none', message: null }, robot } satisfies ExerciseListAnswer);
  });
}
```

- [ ] **Step 46: Edit `server/routes/tests.ts`**

Find this block:

```ts
import { robotStarter } from '../dispatch.ts';
import type { AppEnv, AppOptions } from '../env.ts';
```

Replace it with:

```ts
import { robotStarter } from '../dispatch.ts';
import { cesVariantRoutes } from './cesVariant.ts';
import type { AppEnv, AppOptions } from '../env.ts';
```

- [ ] **Step 47: Edit `server/routes/tests.ts`**

Find this block:

```ts
  const startRobot = robotStarter(options);

```

Replace it with:

```ts
  const startRobot = robotStarter(options);
  cesVariantRoutes(routes, startRobot);

```

- [ ] **Step 48: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type error; `Test Files  132 passed | 1 skipped (133)`, `Tests  2101 passed | 3 skipped (2104)`.

- [ ] **Step 49: Commit**

```bash
git add shared/files.ts shared/api.ts shared/variantKeys.test.ts server/db/variant.ts server/db/runner.ts server/db/lifecycle.ts server/db/tests.ts server/routes/cesVariant.ts server/routes/cesVariant.test.ts server/routes/tests.ts server/test/fixtures.ts src/test/fakeApi.ts
git commit -m "Keep the CES variant's files, barem and print PDF on the test"
```

### Task 3: Let the robot make the CES print PDF, barem and exercise list

The robot API's `?variant=ces` on the test read, its files, the print job, the barem job (with the class barem and list) and the exercise list; `/check` counts the CES work (`ces`) and `/tasks` lists it (`cesPrints`, `cesBarems`, `cesExerciseLists`). The robot does each kind of CES work after the class work of the same kind, with `ces.md` and `class/` in its work folder.

**Files:**
- Modify: `shared/runner.ts`, `server/db/runner.ts`, `server/routes/runner.ts`, `runner/api.ts`, `runner/workdir.ts`, `runner/tasks.ts`, `runner/baremTask.ts`, `runner/printTask.ts`, `runner/run.ts`
- Test: `server/routes/runnerCes.test.ts`, `runner/cesTasks.test.ts`, `runner/run.test.ts`, `server/routes/runner.test.ts`, `server/routes/runnerPrint.test.ts`, `runner/api.test.ts`

**Interfaces:**
- Consumes: Task 2's `columns`, `needsPrintSql`, `needsBaremSql`, `baremActiveSql`, `paperVariantSql`, `printFileKey`, `generatedBaremKey`, `markCes`, `addCesFiles`.
- Produces: `CheckResult.ces?`; `TasksResult.cesPrints?`, `cesBarems?`, `cesExerciseLists?`; `BaremJob.variant?`, `classBarem?`, `classExerciseList?`; `RobotTest.variant?`, `classExerciseList?`; `NEEDS_CES_PRINT`, `NEEDS_CES_BAREM`, `NEEDS_CES_EXERCISE_LIST`; a last `variant` parameter on `findRobotTest`, `saveExerciseList`, `failExerciseList`, `findPrintJob`, `savePrint`, `printKeyIs`, `failPrint`, `findBaremJob` (which also returns `classBaremKey`), `saveGeneratedBarem`, `baremKeyIs`, `failBaremJob`; route `GET /api/runner/tests/:id/barem-job/class-barem`; `RobotApi`'s optional last `variant` on `test`, `testFile`, `sendExerciseList`, `printJob`, `printSource`, `sendPrint`, `sendPrintFailed`, `baremJob`, `baremSource`, `sendBarem`, `sendBaremFailed`, and `baremClassBarem(testId)`; `WorkFolderInput.variant?`, `classExerciseList?`, `classBarem?`; `CES_NOTE`; a last `variant` on `makeExerciseList`, `makeBarem`, `makePrint`.

- [ ] **Step 1: Create `server/routes/runnerCes.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { addCesFiles, addSubmission, addTestFiles, makeClass, makeTest, markCes, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// The robot API's side of the CES variant: which CES work waits, and the jobs
// and answers named with ?variant=ces.

const RUN = 'run-ces-api-0001';
let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let students: number[];

const CLASS_LIST = { totalPoints: 10, officePoints: 1, exercises: [{ id: 'I.1', label: 'Ex. 1', maxPoints: 9, answer: '1', scoringNotes: '', topic: 'T' }], notes: '' };
const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(...params, testId).run();
const tasks = async () => (await robot('GET', '/tasks')).body;

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api, ROBOT_KEY);
  const cls = await makeClass(api, '9R2', ['Bursașiu Teodor', 'Ene Ana']);
  students = cls.studentIds;
  code = await makeTest(api, cls.id);
  testId = await testIdOf(api, code);
  expect((await robot('POST', '/lease', { runId: RUN })).body.granted).toBe(true);
});

afterEach(async () => {
  await api.dispose();
});

describe('CES print and barem jobs', () => {
  it('lists the CES print PDF of a draft with a CES test file, apart from the class print', async () => {
    await addCesFiles(api, code, ['test']);
    expect(await tasks()).toMatchObject({ prints: [], cesPrints: [testId] });
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, prints: 0, ces: 1 });
    const job = await robot('GET', `/tests/${testId}/print-job?variant=ces`);
    expect(job.body.job).toMatchObject({ testId, filesVersion: 0, contentType: PDF_TYPE });
    // The class test has no file: no class print job.
    expect((await robot('GET', `/tests/${testId}/print-job`)).status).toBe(404);
  });

  it('refuses a variant it does not know', async () => {
    await addCesFiles(api, code, ['test']);
    expect((await robot('GET', `/tests/${testId}/print-job?variant=altceva`)).status).toBe(404);
  });

  it('saves a CES print failure on the CES columns only', async () => {
    await addCesFiles(api, code, ['test']);
    const res = await robot('POST', `/tests/${testId}/print-failed?variant=ces`, { runId: RUN, filesVersion: 0, error: 'crash' });
    expect(res.body).toEqual({ status: 'none' });
    const row = await api.db.prepare('SELECT print_attempts, ces_print_attempts FROM tests WHERE id = ?').bind(testId).first();
    expect(row).toEqual({ print_attempts: 0, ces_print_attempts: 1 });
    // An answer made from an older CES file is refused.
    const stale = await robot('POST', `/tests/${testId}/print-failed?variant=ces`, { runId: RUN, filesVersion: 5, error: 'crash' });
    expect(stale.status).toBe(409);
  });

  it('gives a CES barem job with the class barem and the class list, during the evaluation too', async () => {
    await startTest(api, code);
    await addTestFiles(api, code);
    await api.env.FILES.put(`fixture/${code}/barem.pdf`, '%PDF-1.7 barem');
    await addCesFiles(api, code, ['test']);
    await addSubmission(api, code, students[1]!, { status: 'submitted', files: 1 });
    await setTest(`status = 'evaluating', exercise_list_json = ?, ces_barem_request = 'requested', ces_barem_notes = 'N'`, JSON.stringify(CLASS_LIST));
    expect(await tasks()).toMatchObject({ barems: [], cesBarems: [testId] });
    const job = await robot('GET', `/tests/${testId}/barem-job?variant=ces`);
    expect(job.body.job).toEqual({
      testId,
      createdAt: expect.any(String),
      filesVersion: 0,
      contentType: PDF_TYPE,
      baremNotes: 'N',
      variant: 'ces',
      classBarem: { contentType: PDF_TYPE },
      classExerciseList: CLASS_LIST,
    });
    const classBarem = await api.fetch(`/api/runner/tests/${testId}/barem-job/class-barem`, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } });
    expect(await classBarem.text()).toBe('%PDF-1.7 barem');
    // The class barem job, which does not wait, shows nothing.
    expect((await robot('GET', `/tests/${testId}/barem-job`)).status).toBe(404);
  });

  it('gives no class barem to a job of the class test', async () => {
    await addTestFiles(api, code, ['test', 'barem']);
    await setTest("barem_request = 'requested'");
    expect((await robot('GET', `/tests/${testId}/barem-job/class-barem`)).status).toBe(404);
  });
});

describe('the CES exercise list', () => {
  // A test in evaluation with a CES paper waiting.
  async function evaluating(): Promise<void> {
    await startTest(api, code);
    await addTestFiles(api, code);
    await addCesFiles(api, code);
    await markCes(api, students[0]!);
    await addSubmission(api, code, students[0]!, { status: 'submitted', files: 1 });
    await setTest("status = 'evaluating', exercise_list_status = 'ready', exercise_list_json = ?", JSON.stringify(CLASS_LIST));
  }

  it('waits for the CES papers, an active CES barem and the class list', async () => {
    await evaluating();
    expect((await tasks()).cesExerciseLists).toEqual([testId]);
    expect((await robot('POST', '/check')).body).toMatchObject({ hasWork: true, ces: 1 });

    await setTest('ces_barem_unchecked = 1');
    expect((await tasks()).cesExerciseLists).toEqual([]);
    await setTest("ces_barem_unchecked = 0, exercise_list_status = 'none'");
    expect((await tasks()).cesExerciseLists).toEqual([]);
    await setTest("exercise_list_status = 'accepted'");
    expect((await tasks()).cesExerciseLists).toEqual([testId]);
    // A paper fixed as a class paper when it went to grading does not wait for it.
    await api.db.prepare("UPDATE submissions SET variant = 'class'").run();
    expect((await tasks()).cesExerciseLists).toEqual([]);
  });

  it('gives the CES files and the class list, and saves the CES list on its own columns', async () => {
    await evaluating();
    const read = await robot('GET', `/tests/${testId}?variant=ces`);
    expect(read.body.test).toMatchObject({
      id: testId,
      filesVersion: 0,
      files: { test: { contentType: PDF_TYPE }, barem: { contentType: PDF_TYPE } },
      exerciseList: null,
      variant: 'ces',
      classExerciseList: CLASS_LIST,
    });
    await api.env.FILES.put(`fixture/${code}/ces/test.pdf`, '%PDF-1.7 ces');
    const file = await api.fetch(`/api/runner/tests/${testId}/files/test?variant=ces`, { headers: { Authorization: `Bearer ${ROBOT_KEY}` } });
    expect(await file.text()).toBe('%PDF-1.7 ces');

    const saved = await robot('POST', `/tests/${testId}/exercise-list?variant=ces`, { runId: RUN, filesVersion: 0, ok: true, exerciseList: CLASS_LIST });
    expect(saved.body.exerciseList).toEqual({ status: 'ready', message: null });
    const row = await api.db.prepare('SELECT exercise_list_status, ces_exercise_list_status, ces_exercise_list_json FROM tests WHERE id = ?').bind(testId).first<Record<string, string>>();
    expect(row).toMatchObject({ exercise_list_status: 'ready', ces_exercise_list_status: 'ready' });
    expect(JSON.parse(row!.ces_exercise_list_json!)).toEqual(CLASS_LIST);
    // Saved once: a second answer is no longer needed.
    const again = await robot('POST', `/tests/${testId}/exercise-list?variant=ces`, { runId: RUN, filesVersion: 0, ok: true, exerciseList: CLASS_LIST });
    expect(again.status).toBe(409);
  });

  it('refuses a CES list made from older CES files', async () => {
    await evaluating();
    await setTest('ces_files_version = 2');
    const res = await robot('POST', `/tests/${testId}/exercise-list?variant=ces`, { runId: RUN, filesVersion: 1, ok: false, error: 'crash' });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Create `runner/cesTasks.test.ts`**

```ts
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markCes } from '../server/test/fixtures.ts';
import type { TestApi } from '../server/test/testApi.ts';
import { DOCX_TYPE, PDF_TYPE } from '../shared/files.ts';
import type { ExerciseList, GeneratedBarem } from '../shared/schemas.ts';
import { robotApi } from './api.ts';
import { makeBarem } from './baremTask.ts';
import type { PrintTools } from './printTask.ts';
import { makePrint } from './printTask.ts';
import type { TaskContext } from './tasks.ts';
import { makeExerciseList } from './tasks.ts';
import { addOpenTest, API_URL, evaluatingTest, fetchFrom, ROBOT_KEY } from './test/robotWorld.ts';
import { answer, scriptedClaude } from './test/scriptedClaude.ts';
import { CES_NOTE, type Pandoc } from './workdir.ts';

// The robot's work on the CES variant of a test: its print PDF, its generated
// barem and its exercise list, each from the CES files (spec: CES variant).

const RUN = 'run-ces-tasks-0001';

const CLASS_LIST: ExerciseList = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 5, answer: '1', scoringNotes: '', topic: 'Partea întreagă' },
    { id: 'I.2', label: 'Subiectul I, exercițiul 2', maxPoints: 4, answer: '-2', scoringNotes: '', topic: 'Modulul' },
  ],
  notes: '',
};

const CES_BAREM: GeneratedBarem = {
  title: 'Test adaptat – Modulul',
  subtitle: 'Matematică – clasa a IX-a',
  notes: ['Se acordă 1 punct din oficiu.'],
  total: 10,
  officePoints: 1,
  parts: [
    {
      title: '',
      sections: [
        {
          title: 'SUBIECTUL I',
          points: 9,
          items: [
            { label: '1.', steps: [{ text: 'Spațiile: $-3$ și $-2$.', points: 5 }] },
            { label: '2.', steps: [{ text: '$a = -2$.', points: 4 }] },
          ],
        },
      ],
    },
  ],
};

let api: TestApi | undefined;
let root: string;
let skillDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'qe-ces-'));
  skillDir = mkdtempSync(path.join(tmpdir(), 'qe-ces-skill-'));
  writeFileSync(path.join(skillDir, 'SKILL.md'), '# skill');
});

afterEach(async () => {
  await api?.dispose();
  api = undefined;
  rmSync(root, { recursive: true, force: true });
  rmSync(skillDir, { recursive: true, force: true });
});

// A pandoc that writes a Word file (a zip).
const fakePandoc: Pandoc = async (args, cwd) => {
  if (args.includes('docx')) writeFileSync(path.join(cwd, 'barem.docx'), 'PK\u0003\u0004 fake word');
};

function context(claude: ReturnType<typeof scriptedClaude>, print?: { tools: PrintTools; siteUrl: string }): TaskContext {
  const robot = robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(api!), retryDelayMs: 0 });
  return { api: robot, claude: claude.run, runId: RUN, root, workdir: { skillDir, pandoc: fakePandoc }, print };
}

const lease = () => api!.request('POST', '/api/runner/lease', { runId: RUN }, { Authorization: `Bearer ${ROBOT_KEY}` });
const setTest = (testId: number, sql: string, ...params: unknown[]) =>
  api!.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(...params, testId).run();
const read = async (key: string) => new TextDecoder().decode(new Uint8Array(await (await api!.env.FILES.get(key))!.arrayBuffer()));

// An open test with a class test and its CES variant's test file in R2.
async function openWithCesTest(): Promise<{ testId: number; code: string; uploadToken: string }> {
  const world = await evaluatingTest({ uploads: 0 });
  api = world.api;
  const open = await addOpenTest(api, 'pdf');
  const key = `fixture/${open.code}/ces/test.pdf`;
  await setTest(open.testId, "ces_test_file_key = ?, ces_test_file_name = 'Test adaptat.pdf', ces_test_file_type = ?", key, PDF_TYPE);
  await api.env.FILES.put(key, '%PDF-1.7 test adaptat');
  await lease();
  return open;
}

describe('makePrint for the CES variant', () => {
  it('stamps the CES test with the class link and saves it as the CES print PDF', async () => {
    const open = await openWithCesTest();
    // The class print PDF is made already: only the CES one waits.
    await setTest(open.testId, "print_status = 'ready', print_file_key = 'x/class-print.pdf'");
    const calls: string[][] = [];
    const tools: PrintTools = {
      prepare: async () => undefined,
      run: async (args, folder) => {
        calls.push(args);
        expect(readFileSync(path.join(folder, 'in.pdf'), 'utf8')).toBe('%PDF-1.7 test adaptat');
        writeFileSync(path.join(folder, 'out.pdf'), '%PDF-1.7 stamped');
      },
    };
    const end = await makePrint(context(scriptedClaude(), { tools, siteUrl: API_URL }), { tools, siteUrl: API_URL }, open.testId, 'ces');
    expect(end).toBe('saved');
    expect(calls[0]).toContain(`${API_URL}/u/${open.uploadToken}`);
    const row = await api!.db
      .prepare('SELECT print_status, print_file_key, ces_print_status, ces_print_file_key FROM tests WHERE id = ?')
      .bind(open.testId)
      .first<Record<string, string>>();
    expect(row).toMatchObject({ print_status: 'ready', print_file_key: 'x/class-print.pdf', ces_print_status: 'ready' });
    expect(row!.ces_print_file_key).toBe(`t/1/2026/${open.code}/ces/print/test-adaptat-v0-qr.pdf`);
    expect(await read(row!.ces_print_file_key!)).toBe('%PDF-1.7 stamped');
  });
});

describe('makeBarem for the CES variant', () => {
  it('writes the CES barem from the CES test, with the class barem and list beside it', async () => {
    const open = await openWithCesTest();
    await setTest(
      open.testId,
      "barem_file_key = ?, barem_file_name = 'barem.pdf', barem_file_type = ?, exercise_list_json = ?, exercise_list_status = 'ready', ces_barem_request = 'requested', ces_barem_notes = 'Fără indicații pentru profesor.'",
      `fixture/${open.code}/barem.pdf`,
      PDF_TYPE,
      JSON.stringify(CLASS_LIST),
    );
    await api!.env.FILES.put(`fixture/${open.code}/barem.pdf`, '%PDF-1.7 barem clasă');
    let ces = '';
    let classList = '';
    const claude = scriptedClaude((task) => {
      ces = readFileSync(path.join(task.cwd, 'ces.md'), 'utf8');
      classList = readFileSync(path.join(task.cwd, 'class', 'exercises.json'), 'utf8');
      return answer(CES_BAREM);
    });
    expect(await makeBarem(context(claude), open.testId, 'ces')).toBe('saved');
    expect(claude.calls[0]!.task.mode).toBe('barem');
    expect(claude.calls[0]!.files).toEqual([
      '.claude/skills/evaluate-test/SKILL.md',
      'ces.md',
      'class/barem.pdf',
      'class/exercises.json',
      'notes.md',
      'test/test.pdf',
    ]);
    expect(ces).toBe(`${CES_NOTE}\n`);
    expect(JSON.parse(classList)).toEqual(CLASS_LIST);
    const row = await api!.db
      .prepare('SELECT barem_file_key, ces_barem_file_key, ces_barem_file_name, ces_barem_file_type, ces_barem_unchecked, ces_barem_request, ces_files_version FROM tests WHERE id = ?')
      .bind(open.testId)
      .first<Record<string, string | number>>();
    expect(row).toMatchObject({
      barem_file_key: `fixture/${open.code}/barem.pdf`,
      ces_barem_file_key: `t/1/2026/${open.code}/ces/barem/generat_v0.docx`,
      ces_barem_file_name: `${open.code} - barem CES generat.docx`,
      ces_barem_file_type: DOCX_TYPE,
      ces_barem_unchecked: 1,
      ces_barem_request: 'none',
      ces_files_version: 1,
    });
  });

  it('writes a CES barem without a class barem, and says it is for the CES variant', async () => {
    const open = await openWithCesTest();
    await setTest(open.testId, "ces_barem_request = 'requested'");
    const claude = scriptedClaude(answer(CES_BAREM));
    expect(await makeBarem(context(claude), open.testId, 'ces')).toBe('saved');
    expect(claude.calls[0]!.files).toEqual(['.claude/skills/evaluate-test/SKILL.md', 'ces.md', 'test/test.pdf']);
  });
});

describe('makeExerciseList for the CES variant', () => {
  it('makes the CES list from the CES files, with the class list beside them, and keeps the class list', async () => {
    const world = await evaluatingTest({ uploads: 1 });
    api = world.api;
    const studentId = (await api.db.prepare('SELECT student_id FROM submissions WHERE id = ?').bind(world.submissionIds[0]).first<{ student_id: number }>())!
      .student_id;
    await markCes(api, studentId);
    await setTest(
      world.testId,
      `exercise_list_json = ?, exercise_list_status = 'ready',
       ces_test_file_key = 'fixture/ces/test.pdf', ces_test_file_name = 't.pdf', ces_test_file_type = ?,
       ces_barem_file_key = 'fixture/ces/barem.pdf', ces_barem_file_name = 'b.pdf', ces_barem_file_type = ?, ces_files_version = 2`,
      JSON.stringify(CLASS_LIST),
      PDF_TYPE,
      PDF_TYPE,
    );
    await api.env.FILES.put('fixture/ces/test.pdf', '%PDF-1.7 test CES');
    await api.env.FILES.put('fixture/ces/barem.pdf', '%PDF-1.7 barem CES');
    await lease();
    const tasks = await api.request('GET', '/api/runner/tasks', undefined, { Authorization: `Bearer ${ROBOT_KEY}` });
    expect(tasks.body).toMatchObject({ exerciseLists: [], cesExerciseLists: [world.testId] });

    const cesList = { ...CLASS_LIST, exercises: [CLASS_LIST.exercises[0]!, { ...CLASS_LIST.exercises[1]!, answer: '−2' }] };
    let test = '';
    const claude = scriptedClaude((task) => {
      test = readFileSync(path.join(task.cwd, 'test', 'test.pdf'), 'utf8');
      return answer(cesList);
    });
    expect(await makeExerciseList(context(claude), world.testId, 'ces')).toBe('saved');
    expect(test).toBe('%PDF-1.7 test CES');
    expect(claude.calls[0]!.files).toEqual([
      '.claude/skills/evaluate-test/SKILL.md',
      'barem/barem.pdf',
      'barem/notes.md',
      'ces.md',
      'class/exercises.json',
      'test/test.pdf',
    ]);
    const row = await api.db
      .prepare('SELECT exercise_list_json, ces_exercise_list_json, ces_exercise_list_status FROM tests WHERE id = ?')
      .bind(world.testId)
      .first<Record<string, string>>();
    expect(JSON.parse(row!.exercise_list_json!)).toEqual(CLASS_LIST);
    expect(JSON.parse(row!.ces_exercise_list_json!).exercises[1].answer).toBe('−2');
    expect(row!.ces_exercise_list_status).toBe('ready');
    expect(readdirSync(root)).toEqual([]);
  });
});
```

- [ ] **Step 3: Edit `runner/run.test.ts`**

Find this block:

```ts
    expect((await runRobot({ ...run, api: older })).summary).toMatchObject({ graded: 1, barems: 0, stop: 'done' });
  });
});

```

Replace it with:

```ts
    expect((await runRobot({ ...run, api: older })).summary).toMatchObject({ graded: 1, barems: 0, stop: 'done' });
  });

  it('makes the CES print PDF and the CES barem after the class ones', async () => {
    await setUp(1, 1, false);
    const open = await addOpenTest(world!.api, 'pdf');
    await requestBarem(world!.api, open.testId);
    await world!.api.db
      .prepare(
        "UPDATE tests SET ces_test_file_key = 'fixture/ces.pdf', ces_test_file_name = 'ces.pdf', ces_test_file_type = 'application/pdf', ces_barem_request = 'requested' WHERE id = ?",
      )
      .bind(open.testId)
      .run();
    await world!.api.env.FILES.put('fixture/ces.pdf', '%PDF-1.7 ces');
    const claude = scriptedClaude(answer(BAREM), answer(BAREM), answer(LIST), answer(GRADING));
    const { run, requests } = recordedRun(claude);
    const tools = {
      prepare: async () => undefined,
      run: async (args: string[], dir: string) => {
        if (args[1] === '/app/stamp_qr.py') writeFileSync(path.join(dir, 'out.pdf'), '%PDF-1.7 stamped');
      },
    };
    const report = await runRobot({ ...run, print: { tools, siteUrl: API_URL } });
    expect(report.summary).toMatchObject({ prints: 2, barems: 2, stop: 'done' });
    const puts = requests.filter((line) => line.startsWith('PUT '));
    expect(puts).toEqual([
      `PUT /tests/${open.testId}/print`,
      `PUT /tests/${open.testId}/print?variant=ces`,
      `PUT /tests/${open.testId}/barem`,
      `PUT /tests/${open.testId}/barem?variant=ces`,
    ]);
    const row = await world!.api.db
      .prepare('SELECT ces_print_status, ces_barem_unchecked, barem_unchecked FROM tests WHERE id = ?')
      .bind(open.testId)
      .first();
    expect(row).toEqual({ ces_print_status: 'ready', ces_barem_unchecked: 1, barem_unchecked: 1 });
  });
});

```

- [ ] **Step 4: Edit `server/routes/runner.test.ts`**

Find this block:

```ts
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasWork: false, exerciseLists: 0, pendingGrading: 0, analyses: 0, prints: 0, barems: 0 });
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
```

Replace it with:

```ts
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasWork: false, exerciseLists: 0, pendingGrading: 0, analyses: 0, prints: 0, barems: 0, ces: 0 });
    const detail = await api.request('GET', `/api/admin/tests/${code}`);
```

- [ ] **Step 5: Edit `server/routes/runner.test.ts`**

Find this block:

```ts
    await setTest("status = 'evaluating'");
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 1, pendingGrading: 0, analyses: 0, prints: 0, barems: 0 });

```

Replace it with:

```ts
    await setTest("status = 'evaluating'");
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 1, pendingGrading: 0, analyses: 0, prints: 0, barems: 0, ces: 0 });

```

- [ ] **Step 6: Edit `server/routes/runner.test.ts`**

Find this block:

```ts
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 2, analyses: 0, prints: 0, barems: 0 });

```

Replace it with:

```ts
    await addSubmission(api, code, studentIds[1]!, { status: 'submitted', files: 1 });
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 2, analyses: 0, prints: 0, barems: 0, ces: 0 });

```

- [ ] **Step 7: Edit `server/routes/runner.test.ts`**

Find this block:

```ts
    await setTest("analysis_status = 'requested'");
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 0, analyses: 1, prints: 0, barems: 0 });
  });
```

Replace it with:

```ts
    await setTest("analysis_status = 'requested'");
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 0, analyses: 1, prints: 0, barems: 0, ces: 0 });
  });
```

- [ ] **Step 8: Edit `server/routes/runner.test.ts`**

Find this block:

```ts
    await setRunner("run_id = 'run-1', heartbeat_at = ?", new Date().toISOString());
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: false, exerciseLists: 0, pendingGrading: 0, analyses: 0, prints: 0, barems: 0 });
    expect(await uploadStatus(id)).toEqual({ status: 'grading', run_id: 'run-1' });
```

Replace it with:

```ts
    await setRunner("run_id = 'run-1', heartbeat_at = ?", new Date().toISOString());
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: false, exerciseLists: 0, pendingGrading: 0, analyses: 0, prints: 0, barems: 0, ces: 0 });
    expect(await uploadStatus(id)).toEqual({ status: 'grading', run_id: 'run-1' });
```

- [ ] **Step 9: Edit `server/routes/runner.test.ts`**

Find this block:

```ts
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exerciseLists: [await testIdOf(api, code)], pendingGrading: 1, analyses: [], prints: [], barems: [] });
  });
```

Replace it with:

```ts
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exerciseLists: [await testIdOf(api, code)], pendingGrading: 1, analyses: [], prints: [], barems: [], cesPrints: [], cesBarems: [], cesExerciseLists: [] });
  });
```

- [ ] **Step 10: Edit `server/routes/runner.test.ts`**

Find this block:

```ts
  it('has work with only a barem job', async () => {
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 0, analyses: 0, prints: 0, barems: 1 });
  });
```

Replace it with:

```ts
  it('has work with only a barem job', async () => {
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 0, analyses: 0, prints: 0, barems: 1, ces: 0 });
  });
```

- [ ] **Step 11: Edit `server/routes/runnerPrint.test.ts`**

Find this block:

```ts
  it('lists an open test with a test file as a print job', async () => {
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 0, analyses: 0, prints: 1, barems: 0 });
    expect((await robot('GET', '/tasks')).body).toEqual({ exerciseLists: [], pendingGrading: 0, analyses: [], prints: [testId], barems: [] });
  });
```

Replace it with:

```ts
  it('lists an open test with a test file as a print job', async () => {
    expect((await robot('POST', '/check')).body).toEqual({ hasWork: true, exerciseLists: 0, pendingGrading: 0, analyses: 0, prints: 1, barems: 0, ces: 0 });
    expect((await robot('GET', '/tasks')).body).toEqual({ exerciseLists: [], pendingGrading: 0, analyses: [], prints: [testId], barems: [], cesPrints: [], cesBarems: [], cesExerciseLists: [] });
  });
```

- [ ] **Step 12: Edit `runner/api.test.ts`**

Find this block:

```ts

    expect(await robot.check()).toEqual({ hasWork: true, exerciseLists: 1, pendingGrading: 0, analyses: 0, prints: 0, barems: 0 });
    expect(await robot.lease(RUN)).toEqual({ granted: true, maxParallel: 1 });
    await robot.heartbeat(RUN);
    expect(await robot.tasks()).toEqual({ exerciseLists: [testId], pendingGrading: 0, analyses: [], prints: [], barems: [] });
    expect(await robot.test(testId)).toEqual({
```

Replace it with:

```ts

    expect(await robot.check()).toEqual({ hasWork: true, exerciseLists: 1, pendingGrading: 0, analyses: 0, prints: 0, barems: 0, ces: 0 });
    expect(await robot.lease(RUN)).toEqual({ granted: true, maxParallel: 1 });
    await robot.heartbeat(RUN);
    expect(await robot.tasks()).toEqual({ exerciseLists: [testId], pendingGrading: 0, analyses: [], prints: [], barems: [], cesPrints: [], cesBarems: [], cesExerciseLists: [] });
    expect(await robot.test(testId)).toEqual({
```

- [ ] **Step 13: Run the new tests to see them fail**

Run: `npx vitest run server/routes/runnerCes.test.ts runner/cesTasks.test.ts runner/run.test.ts server/routes/runner.test.ts server/routes/runnerPrint.test.ts runner/api.test.ts`
Expected: FAIL. `Test Files  6 failed (6)`, `Tests  17 failed | 110 passed (127)`: `/check` and `/tasks` have no CES counts or lists (`expected { hasWork: false, …(5) } to deeply equal { hasWork: false, …(6) }`), `?variant=ces` is not read (`expected { error: 'not_needed', …(1) } to deeply equal { status: 'none' }`), and the robot makes no CES work.

- [ ] **Step 14: Edit `shared/runner.ts`**

Find this block:

```ts
import { z } from 'zod';
import type { ExerciseList } from './schemas.ts';
```

Replace it with:

```ts
import { z } from 'zod';
import type { TestVariant } from './files.ts';
import type { ExerciseList } from './schemas.ts';
```

- [ ] **Step 15: Edit `shared/runner.ts`**

Find this block:

```ts
  barems: number;
}
```

Replace it with:

```ts
  barems: number;
  // The CES variants' print PDFs, barems and exercise lists. An older API sends none.
  ces?: number;
}
```

- [ ] **Step 16: Edit `shared/runner.ts`**

Find this block:

```ts

// GET /tasks: test ids, and how many uploads wait for grading.
export interface TasksResult {
```

Replace it with:

```ts

// GET /tasks: test ids, and how many uploads wait for grading. The ces…
// lists are the tests whose CES variant waits for that work; the robot asks
// for it with ?variant=ces. An older API sends none.
export interface TasksResult {
```

- [ ] **Step 17: Edit `shared/runner.ts`**

Find this block:

```ts
  barems: number[];
}
```

Replace it with:

```ts
  barems: number[];
  cesPrints?: number[];
  cesBarems?: number[];
  cesExerciseLists?: number[];
}
```

- [ ] **Step 18: Edit `shared/runner.ts`**

Find this block:

```ts
// One barem to write from the test file: the file's type and version, and the
// teacher's comments for the barem.
export interface BaremJob {
```

Replace it with:

```ts
// One barem to write from the test file: the file's type and version, and the
// teacher's comments for the barem. For a CES barem (`variant` "ces") also the
// class barem's type (it is read from GET /tests/:id/barem-job/class-barem)
// and the class exercise list, when they exist: the CES barem reuses their
// exercise names and points.
export interface BaremJob {
```

- [ ] **Step 19: Edit `shared/runner.ts`**

Find this block:

```ts
  contentType: string;
  baremNotes: string;
}

```

Replace it with:

```ts
  contentType: string;
  baremNotes: string;
  variant?: TestVariant;
  classBarem?: { contentType: string } | null;
  classExerciseList?: ExerciseList | null;
}

```

- [ ] **Step 20: Edit `shared/runner.ts`**

Find this block:

```ts
  baremNotes: string;
}
```

Replace it with:

```ts
  baremNotes: string;
  // GET /tests/:id?variant=ces: the CES variant's files, list and comments,
  // and the class exercise list, whose exercise ids the CES list reuses.
  variant?: TestVariant;
  classExerciseList?: ExerciseList | null;
}
```

- [ ] **Step 21: Edit `server/db/runner.ts`**

Find this block:

```ts
import { compareStudentNames } from '../../shared/students.ts';
import { askForAnalysis, finishTests, promoteStatements } from './lifecycle.ts';
import { exerciseColumns, type StoredItem } from './exerciseColumns.ts';
import { needsBaremSql, needsPrintSql } from './variant.ts';

```

Replace it with:

```ts
import { compareStudentNames } from '../../shared/students.ts';
import type { TestVariant } from '../../shared/files.ts';
import { askForAnalysis, finishTests, promoteStatements } from './lifecycle.ts';
import { exerciseColumns, type StoredItem } from './exerciseColumns.ts';
import { baremActiveSql, columns, needsBaremSql, needsPrintSql, paperVariantSql } from './variant.ts';

```

- [ ] **Step 22: Edit `server/db/runner.ts`**

Find this block:

```ts

// The state of the grades of a test: how many graded results there are and
```

Replace it with:

```ts

// The CES variant's print PDF and generated barem, as NEEDS_PRINT and NEEDS_BAREM.
export const NEEDS_CES_PRINT = needsPrintSql('ces');
export const NEEDS_CES_BAREM = needsBaremSql('ces');
// A test in evaluation whose CES papers wait for the CES exercise list: the
// CES barem is active, and the class list is made (the CES list reuses its
// exercise ids).
export const NEEDS_CES_EXERCISE_LIST = `t.status = 'evaluating' AND t.ces_exercise_list_status = 'none' AND ${baremActiveSql('ces')}
  AND t.exercise_list_status IN ('ready', 'accepted')
  AND EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status = 'submitted' AND ${paperVariantSql('s', 't')} = 'ces')`;

// The state of the grades of a test: how many graded results there are and
```

- [ ] **Step 23: Edit `server/db/runner.ts`**

Find this block:

```ts
         OR (${NEEDS_BAREM})
         OR EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND ${GRADABLE})
```

Replace it with:

```ts
         OR (${NEEDS_BAREM})
         OR (${NEEDS_CES_PRINT})
         OR (${NEEDS_CES_BAREM})
         OR (${NEEDS_CES_EXERCISE_LIST})
         OR EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND ${GRADABLE})
```

- [ ] **Step 24: Edit `server/db/runner.ts`**

Find this block:

```ts
): Promise<CheckResult> {
  const results = await db.batch<{ exercise_lists: number; pending_grading: number; analyses: number; prints: number; barems: number }>([
    db
```

Replace it with:

```ts
): Promise<CheckResult> {
  const results = await db.batch<{ exercise_lists: number; pending_grading: number; analyses: number; prints: number; barems: number; ces: number }>([
    db
```

- [ ] **Step 25: Edit `server/db/runner.ts`**

Find this block:

```ts
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_PRINT}) AS prints,
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_BAREM}) AS barems`,
    ),
```

Replace it with:

```ts
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_PRINT}) AS prints,
         (SELECT COUNT(*) FROM tests t WHERE ${NEEDS_BAREM}) AS barems,
         (SELECT COUNT(*) FROM tests t WHERE (${NEEDS_CES_PRINT}) OR (${NEEDS_CES_BAREM}) OR (${NEEDS_CES_EXERCISE_LIST})) AS ces`,
    ),
```

- [ ] **Step 26: Edit `server/db/runner.ts`**

Find this block:

```ts
  const barems = counts?.barems ?? 0;
  return { hasWork: exerciseLists + pendingGrading + analyses + prints + barems > 0, exerciseLists, pendingGrading, analyses, prints, barems };
}
```

Replace it with:

```ts
  const barems = counts?.barems ?? 0;
  const ces = counts?.ces ?? 0;
  return {
    hasWork: exerciseLists + pendingGrading + analyses + prints + barems + ces > 0,
    exerciseLists,
    pendingGrading,
    analyses,
    prints,
    barems,
    ces,
  };
}
```

- [ ] **Step 27: Edit `server/db/runner.ts`**

Find this block:

```ts
export async function listTasks(db: D1Database): Promise<TasksResult> {
  const [lists, grading, analyses, prints, barems] = await db.batch<{ id?: number; count?: number }>([
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_EXERCISE_LIST} ORDER BY t.evaluation_started_at, t.id`),
```

Replace it with:

```ts
export async function listTasks(db: D1Database): Promise<TasksResult> {
  const [lists, grading, analyses, prints, barems, cesPrints, cesBarems, cesLists] = await db.batch<{ id?: number; count?: number }>([
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_EXERCISE_LIST} ORDER BY t.evaluation_started_at, t.id`),
```

- [ ] **Step 28: Edit `server/db/runner.ts`**

Find this block:

```ts
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_BAREM} ORDER BY t.updated_at, t.id`),
  ]);
```

Replace it with:

```ts
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_BAREM} ORDER BY t.updated_at, t.id`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_CES_PRINT} ORDER BY t.created_at, t.id`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_CES_BAREM} ORDER BY t.updated_at, t.id`),
    db.prepare(`SELECT t.id FROM tests t WHERE ${NEEDS_CES_EXERCISE_LIST} ORDER BY t.evaluation_started_at, t.id`),
  ]);
```

- [ ] **Step 29: Edit `server/db/runner.ts`**

Find this block:

```ts
    barems: ids(barems?.results),
  };
```

Replace it with:

```ts
    barems: ids(barems?.results),
    cesPrints: ids(cesPrints?.results),
    cesBarems: ids(cesBarems?.results),
    cesExerciseLists: ids(cesLists?.results),
  };
```

- [ ] **Step 30: Edit `server/db/runner.ts`**

Find this block:

```ts
// A test in evaluation, the only kind the robot reads: a leaked robot key
// shows nothing of an open test or of one that is done.
export async function findRobotTest(db: D1Database, testId: number): Promise<RobotTestRecord | null> {
  const row = await db
    .prepare(
      `SELECT id, created_at, files_version, test_file_key, test_file_type, barem_file_key, barem_file_type, barem_notes, exercise_list_json
       FROM tests WHERE id = ? AND status = 'evaluating'`,
```

Replace it with:

```ts
// A test in evaluation, the only kind the robot reads: a leaked robot key
// shows nothing of an open test or of one that is done. With `variant` "ces":
// the CES variant's files, list and comments, and the class list.
export async function findRobotTest(db: D1Database, testId: number, variant: TestVariant = 'class'): Promise<RobotTestRecord | null> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `SELECT id, created_at, ${c('files_version')} AS files_version, ${c('test_file_key')} AS test_file_key, ${c('test_file_type')} AS test_file_type,
         ${c('barem_file_key')} AS barem_file_key, ${c('barem_file_type')} AS barem_file_type, ${c('barem_notes')} AS barem_notes,
         ${c('exercise_list_json')} AS exercise_list_json, exercise_list_json AS class_list_json
       FROM tests WHERE id = ? AND status = 'evaluating'`,
```

- [ ] **Step 31: Edit `server/db/runner.ts`**

Find this block:

```ts
      exercise_list_json: string | null;
    }>();
```

Replace it with:

```ts
      exercise_list_json: string | null;
      class_list_json: string | null;
    }>();
```

- [ ] **Step 32: Edit `server/db/runner.ts`**

Find this block:

```ts
  const file = (key: string | null, type: string | null) => (key && type ? { contentType: type } : null);
  return {
```

Replace it with:

```ts
  const file = (key: string | null, type: string | null) => (key && type ? { contentType: type } : null);
  const list = (json: string | null) => (json ? (JSON.parse(json) as ExerciseList) : null);
  return {
```

- [ ] **Step 33: Edit `server/db/runner.ts`**

Find this block:

```ts
      files: { test: file(row.test_file_key, row.test_file_type), barem: file(row.barem_file_key, row.barem_file_type) },
      exerciseList: row.exercise_list_json ? (JSON.parse(row.exercise_list_json) as ExerciseList) : null,
      baremNotes: row.barem_notes ?? '',
    },
```

Replace it with:

```ts
      files: { test: file(row.test_file_key, row.test_file_type), barem: file(row.barem_file_key, row.barem_file_type) },
      exerciseList: list(row.exercise_list_json),
      baremNotes: row.barem_notes ?? '',
      ...(variant === 'ces' ? { variant, classExerciseList: list(row.class_list_json) } : {}),
    },
```

- [ ] **Step 34: Edit `server/db/runner.ts`**

Find this block:

```ts
// `(? IS NULL OR created_at = ?)` takes the time twice; an older robot sends none.
const WAITS_FOR_LIST = `id = ? AND files_version = ? AND (? IS NULL OR created_at = ?) AND status = 'evaluating' AND exercise_list_status = 'none' AND ${HOLDS_LEASE}`;

```

Replace it with:

```ts
// `(? IS NULL OR created_at = ?)` takes the time twice; an older robot sends none.
// The list of the CES variant names its own files version.
const waitsForList = (variant: TestVariant) => {
  const c = columns(variant);
  return `id = ? AND ${c('files_version')} = ? AND (? IS NULL OR created_at = ?) AND status = 'evaluating' AND ${c('exercise_list_status')} = 'none' AND ${HOLDS_LEASE}`;
};

```

- [ ] **Step 35: Edit `server/db/runner.ts`**

Find this block:

```ts
  now: string,
): Promise<ExerciseListInfo | null> {
  const row = await db
    .prepare(
      `UPDATE tests SET exercise_list_json = ?, exercise_list_status = ?, exercise_list_message = ?, updated_at = ?
       WHERE ${WAITS_FOR_LIST}
       RETURNING exercise_list_status, exercise_list_message`,
    )
```

Replace it with:

```ts
  now: string,
  variant: TestVariant = 'class',
): Promise<ExerciseListInfo | null> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('exercise_list_json')} = ?, ${c('exercise_list_status')} = ?, ${c('exercise_list_message')} = ?, updated_at = ?
       WHERE ${waitsForList(variant)}
       RETURNING ${c('exercise_list_status')} AS exercise_list_status, ${c('exercise_list_message')} AS exercise_list_message`,
    )
```

- [ ] **Step 36: Edit `server/db/runner.ts`**

Find this block:

```ts
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
```

Replace it with:

```ts
  now: string,
  variant: TestVariant = 'class',
): Promise<ExerciseListInfo | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('exercise_list_attempts')} = ${c('exercise_list_attempts')} + ?,
         ${c('exercise_list_status')} = CASE WHEN ${c('exercise_list_attempts')} + ? >= ? THEN 'failed' ELSE 'none' END,
         ${c('exercise_list_message')} = CASE WHEN ${c('exercise_list_attempts')} + ? >= ? THEN ? ELSE NULL END,
         updated_at = ?
       WHERE ${waitsForList(variant)}
       RETURNING ${c('exercise_list_status')} AS exercise_list_status, ${c('exercise_list_message')} AS exercise_list_message`,
    )
```

- [ ] **Step 37: Edit `server/db/runner.ts`**

Find this block:

```ts
// needs to read the test file and name the result. Null for any other test:
// the robot sees a draft or open test only through this job.
export async function findPrintJob(
```

Replace it with:

```ts
// needs to read the test file and name the result. Null for any other test:
// the robot sees a draft or open test only through this job. The CES print
// carries the same upload link as the class print.
export async function findPrintJob(
```

- [ ] **Step 38: Edit `server/db/runner.ts`**

Find this block:

```ts
  testId: number,
): Promise<{ job: PrintJob; testFileKey: string; teacherId: number; schoolYear: number; code: string; testFileName: string } | null> {
  const row = await db
    .prepare(
      `SELECT t.id, t.created_at, t.files_version, t.test_file_key, t.test_file_type, t.test_file_name, t.upload_token, t.teacher_id, t.code, c.school_year
       FROM tests t JOIN classes c ON c.id = t.class_id
       WHERE t.id = ? AND ${NEEDS_PRINT}`,
    )
```

Replace it with:

```ts
  testId: number,
  variant: TestVariant = 'class',
): Promise<{ job: PrintJob; testFileKey: string; teacherId: number; schoolYear: number; code: string; testFileName: string } | null> {
  const v = columns(variant);
  const row = await db
    .prepare(
      `SELECT t.id, t.created_at, t.${v('files_version')} AS files_version, t.${v('test_file_key')} AS test_file_key,
         t.${v('test_file_type')} AS test_file_type, t.${v('test_file_name')} AS test_file_name, t.upload_token, t.teacher_id, t.code, c.school_year
       FROM tests t JOIN classes c ON c.id = t.class_id
       WHERE t.id = ? AND ${needsPrintSql(variant)}`,
    )
```

- [ ] **Step 39: Edit `server/db/runner.ts`**

Find this block:

```ts
// Like the list, a print names the test by the time it was made.
const WAITS_FOR_PRINT = `tests.id = ? AND tests.files_version = ? AND (? IS NULL OR tests.created_at = ?) AND ${NEEDS_PRINT.replace(/\bt\./g, 'tests.')} AND ${HOLDS_LEASE}`;

```

Replace it with:

```ts
// Like the list, a print names the test by the time it was made.
const waitsForPrint = (variant: TestVariant) =>
  `tests.id = ? AND tests.${columns(variant)('files_version')} = ? AND (? IS NULL OR tests.created_at = ?) AND ${needsPrintSql(variant, 'tests')} AND ${HOLDS_LEASE}`;

```

- [ ] **Step 40: Edit `server/db/runner.ts`**

Find this block:

```ts
  now: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `UPDATE tests SET print_status = 'ready', print_file_key = ?, updated_at = ?
       WHERE ${WAITS_FOR_PRINT}
       RETURNING id`,
```

Replace it with:

```ts
  now: string,
  variant: TestVariant = 'class',
): Promise<boolean> {
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('print_status')} = 'ready', ${c('print_file_key')} = ?, updated_at = ?
       WHERE ${waitsForPrint(variant)}
       RETURNING id`,
```

- [ ] **Step 41: Edit `server/db/runner.ts`**

Find this block:

```ts

// Whether the test's print PDF is stored under this key.
export async function printKeyIs(db: D1Database, testId: number, key: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS found FROM tests WHERE id = ? AND print_file_key = ?').bind(testId, key).first<{ found: number }>();
  return row !== null;
```

Replace it with:

```ts

// Whether the variant's print PDF is stored under this key.
export async function printKeyIs(db: D1Database, testId: number, key: string, variant: TestVariant = 'class'): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS found FROM tests WHERE id = ? AND ${columns(variant)('print_file_key')} = ?`)
    .bind(testId, key)
    .first<{ found: number }>();
  return row !== null;
```

- [ ] **Step 42: Edit `server/db/runner.ts`**

Find this block:

```ts
  now: string,
): Promise<'none' | 'failed' | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const row = await db
    .prepare(
      `UPDATE tests SET print_attempts = print_attempts + ?,
         print_status = CASE WHEN print_attempts + ? >= ? THEN 'failed' ELSE 'none' END,
         updated_at = ?
       WHERE ${WAITS_FOR_PRINT}
       RETURNING print_status`,
    )
```

Replace it with:

```ts
  now: string,
  variant: TestVariant = 'class',
): Promise<'none' | 'failed' | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('print_attempts')} = ${c('print_attempts')} + ?,
         ${c('print_status')} = CASE WHEN ${c('print_attempts')} + ? >= ? THEN 'failed' ELSE 'none' END,
         updated_at = ?
       WHERE ${waitsForPrint(variant)}
       RETURNING ${c('print_status')} AS print_status`,
    )
```

- [ ] **Step 43: Edit `server/db/runner.ts`**

Find this block:

```ts
// The barem job of a test that waits for its generated barem, with what the
// route needs to read the test file. Null for any other test.
export async function findBaremJob(
```

Replace it with:

```ts
// The barem job of a test that waits for its generated barem, with what the
// route needs to read the test file. Null for any other test. A CES job also
// names the class barem (its key stays here) and the class exercise list.
export async function findBaremJob(
```

- [ ] **Step 44: Edit `server/db/runner.ts`**

Find this block:

```ts
  testId: number,
): Promise<{ job: BaremJob; testFileKey: string; teacherId: number; schoolYear: number; code: string } | null> {
  const row = await db
    .prepare(
      `SELECT t.id, t.created_at, t.files_version, t.test_file_key, t.test_file_type, t.barem_notes, t.teacher_id, t.code, c.school_year
       FROM tests t JOIN classes c ON c.id = t.class_id
       WHERE t.id = ? AND ${NEEDS_BAREM}`,
    )
```

Replace it with:

```ts
  testId: number,
  variant: TestVariant = 'class',
): Promise<{ job: BaremJob; testFileKey: string; classBaremKey: string | null; teacherId: number; schoolYear: number; code: string } | null> {
  const v = columns(variant);
  const row = await db
    .prepare(
      `SELECT t.id, t.created_at, t.${v('files_version')} AS files_version, t.${v('test_file_key')} AS test_file_key,
         t.${v('test_file_type')} AS test_file_type, t.${v('barem_notes')} AS barem_notes, t.teacher_id, t.code, c.school_year,
         t.barem_file_key AS class_barem_key, t.barem_file_type AS class_barem_type, t.exercise_list_json AS class_list_json
       FROM tests t JOIN classes c ON c.id = t.class_id
       WHERE t.id = ? AND ${needsBaremSql(variant)}`,
    )
```

- [ ] **Step 45: Edit `server/db/runner.ts`**

Find this block:

```ts
      test_file_type: string | null;
      barem_notes: string;
      teacher_id: number;
```

Replace it with:

```ts
      test_file_type: string | null;
      barem_notes: string | null;
      teacher_id: number;
```

- [ ] **Step 46: Edit `server/db/runner.ts`**

Find this block:

```ts
      school_year: number;
    }>();
  if (!row || !row.test_file_type) return null;
  return {
    job: { testId: row.id, createdAt: row.created_at, filesVersion: row.files_version, contentType: row.test_file_type, baremNotes: row.barem_notes },
    testFileKey: row.test_file_key,
    teacherId: row.teacher_id,
```

Replace it with:

```ts
      school_year: number;
      class_barem_key: string | null;
      class_barem_type: string | null;
      class_list_json: string | null;
    }>();
  if (!row || !row.test_file_type) return null;
  const job: BaremJob = {
    testId: row.id,
    createdAt: row.created_at,
    filesVersion: row.files_version,
    contentType: row.test_file_type,
    baremNotes: row.barem_notes ?? '',
  };
  const ces = variant === 'ces';
  if (ces) {
    job.variant = 'ces';
    job.classBarem = row.class_barem_key && row.class_barem_type ? { contentType: row.class_barem_type } : null;
    job.classExerciseList = row.class_list_json ? (JSON.parse(row.class_list_json) as ExerciseList) : null;
  }
  return {
    job,
    testFileKey: row.test_file_key,
    classBaremKey: ces ? row.class_barem_key : null,
    teacherId: row.teacher_id,
```

- [ ] **Step 47: Edit `server/db/runner.ts`**

Find this block:

```ts
// files_version and clears the request).
const WAITS_FOR_BAREM = `tests.id = ? AND tests.files_version = ? AND (? IS NULL OR tests.created_at = ?) AND ${NEEDS_BAREM.replace(/\bt\./g, 'tests.')} AND ${HOLDS_LEASE}`;

```

Replace it with:

```ts
// files_version and clears the request).
const waitsForBarem = (variant: TestVariant) =>
  `tests.id = ? AND tests.${columns(variant)('files_version')} = ? AND (? IS NULL OR tests.created_at = ?) AND ${needsBaremSql(variant, 'tests')} AND ${HOLDS_LEASE}`;

```

- [ ] **Step 48: Edit `server/db/runner.ts`**

Find this block:

```ts
  now: string,
): Promise<{ oldKey: string | null } | null> {
  const [before, written] = await db.batch<{ barem_file_key?: string | null; id?: number }>([
    db.prepare('SELECT barem_file_key FROM tests WHERE id = ?').bind(testId),
    db
      .prepare(
        `UPDATE tests SET barem_file_key = ?, barem_file_name = ?, barem_file_type = ?, barem_unchecked = 1,
           barem_request = 'none', barem_request_attempts = 0, files_version = files_version + 1,
           exercise_list_status = 'none', exercise_list_json = NULL, exercise_list_message = NULL, exercise_list_attempts = 0,
           updated_at = ?
         WHERE ${WAITS_FOR_BAREM}
         RETURNING id`,
```

Replace it with:

```ts
  now: string,
  variant: TestVariant = 'class',
): Promise<{ oldKey: string | null } | null> {
  const c = columns(variant);
  const [before, written] = await db.batch<{ barem_file_key?: string | null; id?: number }>([
    db.prepare(`SELECT ${c('barem_file_key')} AS barem_file_key FROM tests WHERE id = ?`).bind(testId),
    db
      .prepare(
        `UPDATE tests SET ${c('barem_file_key')} = ?, ${c('barem_file_name')} = ?, ${c('barem_file_type')} = ?, ${c('barem_unchecked')} = 1,
           ${c('barem_request')} = 'none', ${c('barem_request_attempts')} = 0, ${c('files_version')} = ${c('files_version')} + 1,
           ${c('exercise_list_status')} = 'none', ${c('exercise_list_json')} = NULL, ${c('exercise_list_message')} = NULL, ${c('exercise_list_attempts')} = 0,
           updated_at = ?
         WHERE ${waitsForBarem(variant)}
         RETURNING id`,
```

- [ ] **Step 49: Edit `server/db/runner.ts`**

Find this block:

```ts

// Whether the test's barem is stored under this key.
export async function baremKeyIs(db: D1Database, testId: number, key: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS found FROM tests WHERE id = ? AND barem_file_key = ?').bind(testId, key).first<{ found: number }>();
  return row !== null;
```

Replace it with:

```ts

// Whether the variant's barem is stored under this key.
export async function baremKeyIs(db: D1Database, testId: number, key: string, variant: TestVariant = 'class'): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS found FROM tests WHERE id = ? AND ${columns(variant)('barem_file_key')} = ?`)
    .bind(testId, key)
    .first<{ found: number }>();
  return row !== null;
```

- [ ] **Step 50: Edit `server/db/runner.ts`**

Find this block:

```ts
  now: string,
): Promise<'none' | 'failed' | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const row = await db
    .prepare(
      `UPDATE tests SET barem_request_attempts = barem_request_attempts + ?,
         barem_request = CASE WHEN barem_request_attempts + ? >= ? THEN 'failed' ELSE 'requested' END,
         updated_at = ?
       WHERE ${WAITS_FOR_BAREM}
       RETURNING barem_request`,
    )
```

Replace it with:

```ts
  now: string,
  variant: TestVariant = 'class',
): Promise<'none' | 'failed' | null> {
  const counted = error === 'usage_limit' ? 0 : 1;
  const c = columns(variant);
  const row = await db
    .prepare(
      `UPDATE tests SET ${c('barem_request_attempts')} = ${c('barem_request_attempts')} + ?,
         ${c('barem_request')} = CASE WHEN ${c('barem_request_attempts')} + ? >= ? THEN 'failed' ELSE 'requested' END,
         updated_at = ?
       WHERE ${waitsForBarem(variant)}
       RETURNING ${c('barem_request')} AS barem_request`,
    )
```

- [ ] **Step 51: Edit `server/routes/runner.ts`**

Find this block:

```ts
import type { ExerciseListInfo } from '../../shared/api.ts';
import { DOCX_TYPE, generatedBaremKey, isTestFileKind, PDF_TYPE, printFileKey } from '../../shared/files.ts';
import {
```

Replace it with:

```ts
import type { ExerciseListInfo } from '../../shared/api.ts';
import { DOCX_TYPE, generatedBaremKey, isTestFileKind, PDF_TYPE, printFileKey, type TestVariant } from '../../shared/files.ts';
import {
```

- [ ] **Step 52: Edit `server/routes/runner.ts`**

Find this block:

```ts

// Why a robot write changed nothing: the test is gone (404, the robot drops
```

Replace it with:

```ts

// ?variant=ces names the CES variant of a test (its own files, barem, list and
// print PDF); none names the class test, as an older robot asks.
function parseVariant(raw: string | undefined): TestVariant {
  if (raw === undefined) return 'class';
  if (raw === 'ces') return 'ces';
  throw notFound();
}

// Why a robot write changed nothing: the test is gone (404, the robot drops
```

- [ ] **Step 53: Edit `server/routes/runner.ts`**

Find this block:

```ts
  routes.get('/tests/:id', async (c) => {
    const found = await findRobotTest(c.env.DB, parseId(c.req.param('id')));
    if (!found) throw notFound();
```

Replace it with:

```ts
  routes.get('/tests/:id', async (c) => {
    const found = await findRobotTest(c.env.DB, parseId(c.req.param('id')), parseVariant(c.req.query('variant')));
    if (!found) throw notFound();
```

- [ ] **Step 54: Edit `server/routes/runner.ts`**

Find this block:

```ts
    if (!isTestFileKind(kind)) throw notFound();
    const found = await findRobotTest(c.env.DB, testId);
    if (!found) throw notFound();
```

Replace it with:

```ts
    if (!isTestFileKind(kind)) throw notFound();
    const found = await findRobotTest(c.env.DB, testId, parseVariant(c.req.query('variant')));
    if (!found) throw notFound();
```

- [ ] **Step 55: Edit `server/routes/runner.ts`**

Find this block:

```ts
  routes.get('/tests/:id/print-job', async (c) => {
    const found = await findPrintJob(c.env.DB, parseId(c.req.param('id')));
    if (!found) throw notFound();
```

Replace it with:

```ts
  routes.get('/tests/:id/print-job', async (c) => {
    const found = await findPrintJob(c.env.DB, parseId(c.req.param('id')), parseVariant(c.req.query('variant')));
    if (!found) throw notFound();
```

- [ ] **Step 56: Edit `server/routes/runner.ts`**

Find this block:

```ts
  routes.get('/tests/:id/print-job/file', async (c) => {
    const found = await findPrintJob(c.env.DB, parseId(c.req.param('id')));
    const object = found ? await c.env.FILES.get(found.testFileKey) : null;
```

Replace it with:

```ts
  routes.get('/tests/:id/print-job/file', async (c) => {
    const found = await findPrintJob(c.env.DB, parseId(c.req.param('id')), parseVariant(c.req.query('variant')));
    const object = found ? await c.env.FILES.get(found.testFileKey) : null;
```

- [ ] **Step 57: Edit `server/routes/runner.ts`**

Find this block:

```ts
  routes.put('/tests/:id/print', async (c) => {
    const testId = parseId(c.req.param('id'));
    const runId = runIdSchema.safeParse(c.req.header('X-Run-Id'));
    if (!runId.success) throw new ApiError(400, 'invalid', runId.error.issues[0]?.message ?? 'Datele trimise nu sunt valide.');
```

Replace it with:

```ts
  routes.put('/tests/:id/print', async (c) => {
    const testId = parseId(c.req.param('id'));
    const variant = parseVariant(c.req.query('variant'));
    const runId = runIdSchema.safeParse(c.req.header('X-Run-Id'));
    if (!runId.success) throw new ApiError(400, 'invalid', runId.error.issues[0]?.message ?? 'Datele trimise nu sunt valide.');
```

- [ ] **Step 58: Edit `server/routes/runner.ts`**

Find this block:

```ts
    if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(version)) throw new ApiError(400, 'invalid', 'Versiunea fișierelor nu este validă.');
    const found = await findPrintJob(c.env.DB, testId);
    if (!found) throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), printNotNeeded);
```

Replace it with:

```ts
    if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(version)) throw new ApiError(400, 'invalid', 'Versiunea fișierelor nu este validă.');
    const found = await findPrintJob(c.env.DB, testId, variant);
    if (!found) throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), printNotNeeded);
```

- [ ] **Step 59: Edit `server/routes/runner.ts`**

Find this block:

```ts
    const file = await readUpload(c, [PDF_TYPE], 'Fișierul trebuie să fie un PDF.');
    const key = printFileKey(found.teacherId, found.schoolYear, found.code, found.testFileName, version);
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: PDF_TYPE } });
    if (!(await savePrint(c.env.DB, testId, runId.data, version, createdAt, key, nowIso()))) {
      if (!(await printKeyIs(c.env.DB, testId, key))) await deleteFilesQuietly(c.env.FILES, [key]);
      throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), printNotNeeded);
```

Replace it with:

```ts
    const file = await readUpload(c, [PDF_TYPE], 'Fișierul trebuie să fie un PDF.');
    const key = printFileKey(found.teacherId, found.schoolYear, found.code, found.testFileName, version, variant);
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: PDF_TYPE } });
    if (!(await savePrint(c.env.DB, testId, runId.data, version, createdAt, key, nowIso(), variant))) {
      if (!(await printKeyIs(c.env.DB, testId, key, variant))) await deleteFilesQuietly(c.env.FILES, [key]);
      throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), printNotNeeded);
```

- [ ] **Step 60: Edit `server/routes/runner.ts`**

Find this block:

```ts
    const body = await readJson(c, printFailedBody);
    const status = await failPrint(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, body.error, nowIso());
    if (!status) throw await refusedWrite(c, body.runId, await testExists(c.env.DB, testId), printNotNeeded);
```

Replace it with:

```ts
    const body = await readJson(c, printFailedBody);
    const variant = parseVariant(c.req.query('variant'));
    const status = await failPrint(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, body.error, nowIso(), variant);
    if (!status) throw await refusedWrite(c, body.runId, await testExists(c.env.DB, testId), printNotNeeded);
```

- [ ] **Step 61: Edit `server/routes/runner.ts`**

Find this block:

```ts
  routes.get('/tests/:id/barem-job', async (c) => {
    const found = await findBaremJob(c.env.DB, parseId(c.req.param('id')));
    if (!found) throw notFound();
```

Replace it with:

```ts
  routes.get('/tests/:id/barem-job', async (c) => {
    const found = await findBaremJob(c.env.DB, parseId(c.req.param('id')), parseVariant(c.req.query('variant')));
    if (!found) throw notFound();
```

- [ ] **Step 62: Edit `server/routes/runner.ts`**

Find this block:

```ts
  routes.get('/tests/:id/barem-job/file', async (c) => {
    const found = await findBaremJob(c.env.DB, parseId(c.req.param('id')));
    const object = found ? await c.env.FILES.get(found.testFileKey) : null;
```

Replace it with:

```ts
  routes.get('/tests/:id/barem-job/file', async (c) => {
    const found = await findBaremJob(c.env.DB, parseId(c.req.param('id')), parseVariant(c.req.query('variant')));
    const object = found ? await c.env.FILES.get(found.testFileKey) : null;
```

- [ ] **Step 63: Edit `server/routes/runner.ts`**

Find this block:

```ts
    const object = found ? await c.env.FILES.get(found.testFileKey) : null;
    if (!found || !object) throw notFound();
    return fileResponse(object, 'test', found.job.contentType);
  });

  // The generated barem, a Word file. Like the print PDF, the object is
```

Replace it with:

```ts
    const object = found ? await c.env.FILES.get(found.testFileKey) : null;
    if (!found || !object) throw notFound();
    return fileResponse(object, 'test', found.job.contentType);
  });

  // The class barem, for a CES barem job only: the CES barem reuses its
  // exercise names and points.
  routes.get('/tests/:id/barem-job/class-barem', async (c) => {
    const found = await findBaremJob(c.env.DB, parseId(c.req.param('id')), 'ces');
    const type = found?.job.classBarem?.contentType;
    const object = found?.classBaremKey ? await c.env.FILES.get(found.classBaremKey) : null;
    if (!found || !object || !type) throw notFound();
    return fileResponse(object, 'barem', type);
  });

  // The generated barem, a Word file. Like the print PDF, the object is
```

- [ ] **Step 64: Edit `server/routes/runner.ts`**

Find this block:

```ts
    const testId = parseId(c.req.param('id'));
    const runId = runIdSchema.safeParse(c.req.header('X-Run-Id'));
```

Replace it with:

```ts
    const testId = parseId(c.req.param('id'));
    const variant = parseVariant(c.req.query('variant'));
    const runId = runIdSchema.safeParse(c.req.header('X-Run-Id'));
```

- [ ] **Step 65: Edit `server/routes/runner.ts`**

Find this block:

```ts
    if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(version)) throw new ApiError(400, 'invalid', 'Versiunea fișierelor nu este validă.');
    const found = await findBaremJob(c.env.DB, testId);
    if (!found) throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), baremNotNeeded);
```

Replace it with:

```ts
    if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(version)) throw new ApiError(400, 'invalid', 'Versiunea fișierelor nu este validă.');
    const found = await findBaremJob(c.env.DB, testId, variant);
    if (!found) throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), baremNotNeeded);
```

- [ ] **Step 66: Edit `server/routes/runner.ts`**

Find this block:

```ts
    const file = await readUpload(c, [DOCX_TYPE], 'Fișierul trebuie să fie un document Word.');
    const key = generatedBaremKey(found.teacherId, found.schoolYear, found.code, version);
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: DOCX_TYPE } });
    const saved = await saveGeneratedBarem(c.env.DB, testId, runId.data, version, createdAt, key, `${found.code} - barem generat.docx`, nowIso());
    if (!saved) {
      if (!(await baremKeyIs(c.env.DB, testId, key))) await deleteFilesQuietly(c.env.FILES, [key]);
      throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), baremNotNeeded);
```

Replace it with:

```ts
    const file = await readUpload(c, [DOCX_TYPE], 'Fișierul trebuie să fie un document Word.');
    const key = generatedBaremKey(found.teacherId, found.schoolYear, found.code, version, variant);
    await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: DOCX_TYPE } });
    const name = variant === 'ces' ? `${found.code} - barem CES generat.docx` : `${found.code} - barem generat.docx`;
    const saved = await saveGeneratedBarem(c.env.DB, testId, runId.data, version, createdAt, key, name, nowIso(), variant);
    if (!saved) {
      if (!(await baremKeyIs(c.env.DB, testId, key, variant))) await deleteFilesQuietly(c.env.FILES, [key]);
      throw await refusedWrite(c, runId.data, await testExists(c.env.DB, testId), baremNotNeeded);
```

- [ ] **Step 67: Edit `server/routes/runner.ts`**

Find this block:

```ts
    const body = await readJson(c, baremFailedBody);
    const status = await failBaremJob(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, body.error, nowIso());
    if (!status) throw await refusedWrite(c, body.runId, await testExists(c.env.DB, testId), baremNotNeeded);
```

Replace it with:

```ts
    const body = await readJson(c, baremFailedBody);
    const variant = parseVariant(c.req.query('variant'));
    const status = await failBaremJob(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, body.error, nowIso(), variant);
    if (!status) throw await refusedWrite(c, body.runId, await testExists(c.env.DB, testId), baremNotNeeded);
```

- [ ] **Step 68: Edit `server/routes/runner.ts`**

Find this block:

```ts
    const testId = parseId(c.req.param('id'));
    const body = await readJson(c, exerciseListBody, MAX_ROBOT_BODY_BYTES);
```

Replace it with:

```ts
    const testId = parseId(c.req.param('id'));
    const variant = parseVariant(c.req.query('variant'));
    const body = await readJson(c, exerciseListBody, MAX_ROBOT_BODY_BYTES);
```

- [ ] **Step 69: Edit `server/routes/runner.ts`**

Find this block:

```ts
      if (!checked.ok) throw invalidResult();
      saved = await saveExerciseList(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, checked.value, now);
    } else {
      saved = await failExerciseList(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, body.error, now);
    }
```

Replace it with:

```ts
      if (!checked.ok) throw invalidResult();
      saved = await saveExerciseList(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, checked.value, now, variant);
    } else {
      saved = await failExerciseList(c.env.DB, testId, body.runId, body.filesVersion, body.createdAt ?? null, body.error, now, variant);
    }
```

- [ ] **Step 70: Edit `runner/api.ts`**

Find this block:

```ts
import type { ExerciseListInfo } from '../shared/api.ts';
import { DOCX_TYPE } from '../shared/files.ts';
import type {
```

Replace it with:

```ts
import type { ExerciseListInfo } from '../shared/api.ts';
import { DOCX_TYPE, type TestVariant } from '../shared/files.ts';
import type {
```

- [ ] **Step 71: Edit `runner/api.ts`**

Find this block:

```ts
  tasks(): Promise<TasksResult>;
  test(testId: number): Promise<RobotTest>;
  testFile(testId: number, kind: 'test' | 'barem'): Promise<Uint8Array>;
  sendExerciseList(testId: number, body: ExerciseListPost): Promise<ExerciseListInfo>;
  // Null when nothing can be graded now.
```

Replace it with:

```ts
  tasks(): Promise<TasksResult>;
  // `variant` "ces": the CES variant of the test (?variant=ces); none: the class test.
  test(testId: number, variant?: TestVariant): Promise<RobotTest>;
  testFile(testId: number, kind: 'test' | 'barem', variant?: TestVariant): Promise<Uint8Array>;
  sendExerciseList(testId: number, body: ExerciseListPost, variant?: TestVariant): Promise<ExerciseListInfo>;
  // Null when nothing can be graded now.
```

- [ ] **Step 72: Edit `runner/api.ts`**

Find this block:

```ts
  // An open test that waits for its print PDF; 404 for any other test.
  printJob(testId: number): Promise<PrintJob>;
  printSource(testId: number): Promise<Uint8Array>;
  // The test with the QR code, made from the test file of `filesVersion`.
  sendPrint(testId: number, runId: string, filesVersion: number, pdf: Uint8Array, createdAt?: string): Promise<void>;
  // "failed": the last attempt failed. "none": the print waits for another try.
  sendPrintFailed(testId: number, body: PrintFailedPost): Promise<'none' | 'failed'>;
  // A draft or open test that waits for its generated barem; 404 for any other test.
  baremJob(testId: number): Promise<BaremJob>;
  baremSource(testId: number): Promise<Uint8Array>;
  // The barem as a Word file, written from the test file of `filesVersion`.
  sendBarem(testId: number, runId: string, filesVersion: number, docx: Uint8Array, createdAt?: string): Promise<void>;
  // "failed": the last attempt failed. "none": the barem waits for another try.
  sendBaremFailed(testId: number, body: BaremFailedPost): Promise<'none' | 'failed'>;
}
```

Replace it with:

```ts
  // An open test that waits for its print PDF; 404 for any other test.
  printJob(testId: number, variant?: TestVariant): Promise<PrintJob>;
  printSource(testId: number, variant?: TestVariant): Promise<Uint8Array>;
  // The test with the QR code, made from the test file of `filesVersion`.
  sendPrint(testId: number, runId: string, filesVersion: number, pdf: Uint8Array, createdAt?: string, variant?: TestVariant): Promise<void>;
  // "failed": the last attempt failed. "none": the print waits for another try.
  sendPrintFailed(testId: number, body: PrintFailedPost, variant?: TestVariant): Promise<'none' | 'failed'>;
  // A draft or open test that waits for its generated barem; 404 for any other test.
  baremJob(testId: number, variant?: TestVariant): Promise<BaremJob>;
  baremSource(testId: number, variant?: TestVariant): Promise<Uint8Array>;
  // The class barem of a CES barem job (BaremJob.classBarem).
  baremClassBarem(testId: number): Promise<Uint8Array>;
  // The barem as a Word file, written from the test file of `filesVersion`.
  sendBarem(testId: number, runId: string, filesVersion: number, docx: Uint8Array, createdAt?: string, variant?: TestVariant): Promise<void>;
  // "failed": the last attempt failed. "none": the barem waits for another try.
  sendBaremFailed(testId: number, body: BaremFailedPost, variant?: TestVariant): Promise<'none' | 'failed'>;
}

// The query of a request about one variant: none for the class test, so an
// older API still understands it.
function ofVariant(variant: TestVariant | undefined): string {
  return variant === 'ces' ? '?variant=ces' : '';
}
```

- [ ] **Step 73: Edit `runner/api.ts`**

Find this block:

```ts
    tasks: () => json<TasksResult>('GET', '/tasks'),
    test: async (testId) => (await json<{ test: RobotTest }>('GET', `/tests/${testId}`)).test,
    testFile: (testId, kind) => bytes(`/tests/${testId}/files/${kind}`),
    sendExerciseList: async (testId, body) =>
      (await json<{ exerciseList: ExerciseListInfo }>('POST', `/tests/${testId}/exercise-list`, body)).exerciseList,
    claim: (runId) => send('POST', '/claim', { runId }, async (res) => (res.status === 204 ? null : ((await res.json()) as ClaimResult))),
```

Replace it with:

```ts
    tasks: () => json<TasksResult>('GET', '/tasks'),
    test: async (testId, variant) => (await json<{ test: RobotTest }>('GET', `/tests/${testId}${ofVariant(variant)}`)).test,
    testFile: (testId, kind, variant) => bytes(`/tests/${testId}/files/${kind}${ofVariant(variant)}`),
    sendExerciseList: async (testId, body, variant) =>
      (await json<{ exerciseList: ExerciseListInfo }>('POST', `/tests/${testId}/exercise-list${ofVariant(variant)}`, body)).exerciseList,
    claim: (runId) => send('POST', '/claim', { runId }, async (res) => (res.status === 204 ? null : ((await res.json()) as ClaimResult))),
```

- [ ] **Step 74: Edit `runner/api.ts`**

Find this block:

```ts
      (await json<{ status: 'ready' | 'requested' | 'failed' }>('POST', `/tests/${testId}/analysis`, body)).status,
    printJob: async (testId) => (await json<{ job: PrintJob }>('GET', `/tests/${testId}/print-job`)).job,
    printSource: (testId) => bytes(`/tests/${testId}/print-job/file`),
    sendPrint: (testId, runId, filesVersion, pdf, createdAt) =>
      send(
        'PUT',
        `/tests/${testId}/print`,
        new Raw(pdf, {
```

Replace it with:

```ts
      (await json<{ status: 'ready' | 'requested' | 'failed' }>('POST', `/tests/${testId}/analysis`, body)).status,
    printJob: async (testId, variant) => (await json<{ job: PrintJob }>('GET', `/tests/${testId}/print-job${ofVariant(variant)}`)).job,
    printSource: (testId, variant) => bytes(`/tests/${testId}/print-job/file${ofVariant(variant)}`),
    sendPrint: (testId, runId, filesVersion, pdf, createdAt, variant) =>
      send(
        'PUT',
        `/tests/${testId}/print${ofVariant(variant)}`,
        new Raw(pdf, {
```

- [ ] **Step 75: Edit `runner/api.ts`**

Find this block:

```ts
      ),
    sendPrintFailed: async (testId, body) =>
      (await json<{ status: 'none' | 'failed' }>('POST', `/tests/${testId}/print-failed`, body)).status,
    baremJob: async (testId) => (await json<{ job: BaremJob }>('GET', `/tests/${testId}/barem-job`)).job,
    baremSource: (testId) => bytes(`/tests/${testId}/barem-job/file`),
    sendBarem: (testId, runId, filesVersion, docx, createdAt) =>
      send(
        'PUT',
        `/tests/${testId}/barem`,
        new Raw(docx, {
```

Replace it with:

```ts
      ),
    sendPrintFailed: async (testId, body, variant) =>
      (await json<{ status: 'none' | 'failed' }>('POST', `/tests/${testId}/print-failed${ofVariant(variant)}`, body)).status,
    baremJob: async (testId, variant) => (await json<{ job: BaremJob }>('GET', `/tests/${testId}/barem-job${ofVariant(variant)}`)).job,
    baremSource: (testId, variant) => bytes(`/tests/${testId}/barem-job/file${ofVariant(variant)}`),
    baremClassBarem: (testId) => bytes(`/tests/${testId}/barem-job/class-barem`),
    sendBarem: (testId, runId, filesVersion, docx, createdAt, variant) =>
      send(
        'PUT',
        `/tests/${testId}/barem${ofVariant(variant)}`,
        new Raw(docx, {
```

- [ ] **Step 76: Edit `runner/api.ts`**

Find this block:

```ts
      ),
    sendBaremFailed: async (testId, body) =>
      (await json<{ status: 'none' | 'failed' }>('POST', `/tests/${testId}/barem-failed`, body)).status,
  };
```

Replace it with:

```ts
      ),
    sendBaremFailed: async (testId, body, variant) =>
      (await json<{ status: 'none' | 'failed' }>('POST', `/tests/${testId}/barem-failed${ofVariant(variant)}`, body)).status,
  };
```

- [ ] **Step 77: Edit `runner/workdir.ts`**

Find this block:

```ts
import { DOCX_TYPE, extensionFor, PDF_TYPE } from '../shared/files.ts';
import type { TestFileKind } from '../shared/files.ts';
import type { ClassResults } from '../shared/runner.ts';
```

Replace it with:

```ts
import { DOCX_TYPE, extensionFor, PDF_TYPE } from '../shared/files.ts';
import type { TestFileKind, TestVariant } from '../shared/files.ts';
import type { ClassResults } from '../shared/runner.ts';
```

- [ ] **Step 78: Edit `runner/workdir.ts`**

Find this block:

```ts
//   class-results.json              (class-report) the graded class, anonymized; no test, no barem

```

Replace it with:

```ts
//   class-results.json              (class-report) the graded class, anonymized; no test, no barem
//   ces.md                          (CES variant) says that test/ and barem/ are the CES variant's
//   class/exercises.json            (CES exercise list, CES barem) the class list, whose ids the CES list reuses
//   class/barem.pdf                 or class/barem.md and class/media/… (CES barem) the class barem

```

- [ ] **Step 79: Edit `runner/workdir.ts`**

Find this block:

```ts
  classResults?: ClassResults;
}

```

Replace it with:

```ts
  classResults?: ClassResults;
  // "ces": the task is for the CES variant of the test; ces.md says so.
  variant?: TestVariant;
  // The CES variant's tasks: the class exercise list and the class barem.
  classExerciseList?: ExerciseList | null;
  classBarem?: TaskFile | null;
}

// What ces.md says, for the skill: the files are the CES variant's.
export const CES_NOTE = [
  'This task is for the CES variant of the test: an adapted test for the students of the class',
  'with special educational needs (CES, "cerințe educaționale speciale"). test/ (and barem/, when it is here)',
  'are the CES variant\'s files. Follow the CES notes of your mode in SKILL.md.',
].join('\n');

```

- [ ] **Step 80: Edit `runner/workdir.ts`**

Find this block:

```ts
  }
  if (input.pages) {
```

Replace it with:

```ts
  }
  if (input.variant === 'ces') await writeFile(path.join(folder, 'ces.md'), `${CES_NOTE}\n`);
  if (input.classBarem) await writeTeacherFile(folder, 'barem', input.classBarem, pandoc, 'class');
  if (input.classExerciseList) {
    await mkdir(path.join(folder, 'class'), { recursive: true });
    await writeFile(path.join(folder, 'class', 'exercises.json'), `${JSON.stringify(input.classExerciseList, null, 2)}\n`);
  }
  if (input.pages) {
```

- [ ] **Step 81: Edit `runner/workdir.ts`**

Find this block:

```ts
// A PDF stays as it is: Claude reads PDFs. A Word file becomes pandoc's
// Markdown, with TeX math between $ and its pictures in <kind>/media/. Not
// GitHub's Markdown: it turns "a)" and "b)" into "1)" and "2)", and the
// exercise names are lost.
async function writeTeacherFile(folder: string, kind: TestFileKind, file: TaskFile, pandoc: Pandoc): Promise<void> {
  await mkdir(path.join(folder, kind));
  if (file.contentType === PDF_TYPE) {
    await writeFile(path.join(folder, kind, `${kind}.pdf`), file.bytes);
    return;
```

Replace it with:

```ts
// A PDF stays as it is: Claude reads PDFs. A Word file becomes pandoc's
// Markdown, with TeX math between $ and its pictures in <dir>/media/. Not
// GitHub's Markdown: it turns "a)" and "b)" into "1)" and "2)", and the
// exercise names are lost. The folder is the kind's own, or `class` for the
// class barem of a CES task.
async function writeTeacherFile(folder: string, kind: TestFileKind, file: TaskFile, pandoc: Pandoc, dir: string = kind): Promise<void> {
  await mkdir(path.join(folder, dir), { recursive: true });
  if (file.contentType === PDF_TYPE) {
    await writeFile(path.join(folder, dir, `${kind}.pdf`), file.bytes);
    return;
```

- [ ] **Step 82: Edit `runner/workdir.ts`**

Find this block:

```ts
  if (file.contentType !== DOCX_TYPE) throw new Error(`unknown ${kind} file type`);
  const source = `${kind}/source.docx`;
  await writeFile(path.join(folder, source), file.bytes);
  // Relative paths with "/", run in the work folder: the picture links then work from it.
  await pandoc(['--sandbox', source, '-t', 'markdown', `--extract-media=${kind}`, '-o', `${kind}/${kind}.md`], folder);
  await rm(path.join(folder, source));
```

Replace it with:

```ts
  if (file.contentType !== DOCX_TYPE) throw new Error(`unknown ${kind} file type`);
  const source = `${dir}/source.docx`;
  await writeFile(path.join(folder, source), file.bytes);
  // Relative paths with "/", run in the work folder: the picture links then work from it.
  await pandoc(['--sandbox', source, '-t', 'markdown', `--extract-media=${dir}`, '-o', `${dir}/${kind}.md`], folder);
  await rm(path.join(folder, source));
```

- [ ] **Step 83: Edit `runner/tasks.ts`**

Find this block:

```ts
import path from 'node:path';
import type { ClaimResult, RobotError } from '../shared/runner.ts';
```

Replace it with:

```ts
import path from 'node:path';
import type { TestVariant } from '../shared/files.ts';
import type { ClaimResult, RobotError } from '../shared/runner.ts';
```

- [ ] **Step 84: Edit `runner/tasks.ts`**

Find this block:

```ts

async function teacherFiles(ctx: TaskContext, testId: number, files: { test: { contentType: string } | null; barem: { contentType: string } | null }) {
  if (!files.test || !files.barem) return null;
  const [test, barem] = await Promise.all([ctx.api.testFile(testId, 'test'), ctx.api.testFile(testId, 'barem')]);
  return { test: { bytes: test, contentType: files.test.contentType }, barem: { bytes: barem, contentType: files.barem.contentType } };
```

Replace it with:

```ts

async function teacherFiles(
  ctx: TaskContext,
  testId: number,
  files: { test: { contentType: string } | null; barem: { contentType: string } | null },
  variant: TestVariant = 'class',
) {
  if (!files.test || !files.barem) return null;
  const [test, barem] = await Promise.all([ctx.api.testFile(testId, 'test', variant), ctx.api.testFile(testId, 'barem', variant)]);
  return { test: { bytes: test, contentType: files.test.contentType }, barem: { bytes: barem, contentType: files.barem.contentType } };
```

- [ ] **Step 85: Edit `runner/tasks.ts`**

Find this block:

```ts

export async function makeExerciseList(ctx: TaskContext, testId: number): Promise<TaskEnd> {
  const end = await inWorkFolder(ctx, `exercise-list-${testId}`, async (makeFolder) => {
    // The files' version is read before the files: a file replaced after this
    // read makes the API refuse the list.
    const test = await ctx.api.test(testId);
    const post = { runId: ctx.runId, filesVersion: test.filesVersion, createdAt: test.createdAt };
    const sendError = async (error: RobotError) => (await ctx.api.sendExerciseList(testId, { ...post, ok: false, error })).status === 'failed';
    const files = await teacherFiles(ctx, testId, test.files);
    if (!files) return sendOutcome({ ok: false, problem: 'crash', detail: 'missing file' }, async () => undefined, sendError);
    const cwd = await makeFolder({ ...files, baremNotes: test.baremNotes });
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
    const outcome = await askClaude(ctx, 'exercise-list', cwd, (output) => checkExerciseList(output).ok);
    return sendOutcome(outcome, (exerciseList) => ctx.api.sendExerciseList(testId, { ...post, ok: true, exerciseList }), sendError);
  });
  log('exercise list', { test: testId, end });
  return end;
```

Replace it with:

```ts

// The exercise list of a test, or of its CES variant: the CES list is made
// from the CES files, with the class list beside them (class/exercises.json),
// so it reuses the class exercise ids.
export async function makeExerciseList(ctx: TaskContext, testId: number, variant: TestVariant = 'class'): Promise<TaskEnd> {
  const ces = variant === 'ces';
  const end = await inWorkFolder(ctx, `exercise-list-${ces ? 'ces-' : ''}${testId}`, async (makeFolder) => {
    // The files' version is read before the files: a file replaced after this
    // read makes the API refuse the list.
    const test = await ctx.api.test(testId, variant);
    const post = { runId: ctx.runId, filesVersion: test.filesVersion, createdAt: test.createdAt };
    const sendError = async (error: RobotError) =>
      (await ctx.api.sendExerciseList(testId, { ...post, ok: false, error }, variant)).status === 'failed';
    const files = await teacherFiles(ctx, testId, test.files, variant);
    if (!files) return sendOutcome({ ok: false, problem: 'crash', detail: 'missing file' }, async () => undefined, sendError);
    const cwd = await makeFolder({
      ...files,
      baremNotes: test.baremNotes,
      ...(ces ? { variant, classExerciseList: test.classExerciseList ?? null } : {}),
    });
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
    const outcome = await askClaude(ctx, 'exercise-list', cwd, (output) => checkExerciseList(output).ok);
    return sendOutcome(outcome, (exerciseList) => ctx.api.sendExerciseList(testId, { ...post, ok: true, exerciseList }, variant), sendError);
  });
  log('exercise list', ces ? { test: testId, variant, end } : { test: testId, end });
  return end;
```

- [ ] **Step 86: Edit `runner/baremTask.ts`**

Find this block:

```ts
import path from 'node:path';
import { DOCX_TYPE, PDF_TYPE } from '../shared/files.ts';
import type { RobotError } from '../shared/runner.ts';
```

Replace it with:

```ts
import path from 'node:path';
import { DOCX_TYPE, PDF_TYPE, type TestVariant } from '../shared/files.ts';
import type { RobotError } from '../shared/runner.ts';
```

- [ ] **Step 87: Edit `runner/baremTask.ts`**

Find this block:

```ts

// Makes the barem of a test and sends it, or sends why it failed. A missing
// pandoc goes up to the run loop, with nothing sent.
export async function makeBarem(ctx: TaskContext, testId: number): Promise<TaskEnd> {
  const started = Date.now();
  const taskId = `barem-${testId}`;
  let end: TaskEnd;
```

Replace it with:

```ts

// Makes the barem of a test, or of its CES variant, and sends it, or sends why
// it failed. A CES barem is written from the CES test, with the class barem and
// the class exercise list beside it (class/), so it reuses their exercise
// names. A missing pandoc goes up to the run loop, with nothing sent.
export async function makeBarem(ctx: TaskContext, testId: number, variant: TestVariant = 'class'): Promise<TaskEnd> {
  const started = Date.now();
  const ces = variant === 'ces';
  const taskId = `barem-${ces ? 'ces-' : ''}${testId}`;
  let end: TaskEnd;
```

- [ ] **Step 88: Edit `runner/baremTask.ts`**

Find this block:

```ts
    end = await (async (): Promise<TaskEnd> => {
      const job = await ctx.api.baremJob(testId);
      const sendError = async (error: RobotError) =>
        (await ctx.api.sendBaremFailed(testId, { runId: ctx.runId, filesVersion: job.filesVersion, createdAt: job.createdAt, error })) === 'failed';
      const crash = (detail: string) => sendOutcome({ ok: false, problem: 'crash', detail }, async () => undefined, sendError);
      if (job.contentType !== PDF_TYPE && job.contentType !== DOCX_TYPE) return crash('file type');
      const source = await ctx.api.baremSource(testId);
      let cwd: string;
      try {
        cwd = await makeWorkFolder(ctx.root, taskId, { test: { bytes: source, contentType: job.contentType }, requestNotes: job.baremNotes }, ctx.workdir);
      } catch (err) {
```

Replace it with:

```ts
    end = await (async (): Promise<TaskEnd> => {
      const job = await ctx.api.baremJob(testId, variant);
      const sendError = async (error: RobotError) =>
        (await ctx.api.sendBaremFailed(testId, { runId: ctx.runId, filesVersion: job.filesVersion, createdAt: job.createdAt, error }, variant)) === 'failed';
      const crash = (detail: string) => sendOutcome({ ok: false, problem: 'crash', detail }, async () => undefined, sendError);
      if (job.contentType !== PDF_TYPE && job.contentType !== DOCX_TYPE) return crash('file type');
      const source = await ctx.api.baremSource(testId, variant);
      const classBarem = ces && job.classBarem ? { bytes: await ctx.api.baremClassBarem(testId), contentType: job.classBarem.contentType } : null;
      let cwd: string;
      try {
        const input = { test: { bytes: source, contentType: job.contentType }, requestNotes: job.baremNotes };
        cwd = await makeWorkFolder(
          ctx.root,
          taskId,
          ces ? { ...input, variant, classBarem, classExerciseList: job.classExerciseList ?? null } : input,
          ctx.workdir,
        );
      } catch (err) {
```

- [ ] **Step 89: Edit `runner/baremTask.ts`**

Find this block:

```ts
      try {
        await ctx.api.sendBarem(testId, ctx.runId, job.filesVersion, docx, job.createdAt);
        return 'saved';
```

Replace it with:

```ts
      try {
        await ctx.api.sendBarem(testId, ctx.runId, job.filesVersion, docx, job.createdAt, variant);
        return 'saved';
```

- [ ] **Step 90: Edit `runner/baremTask.ts`**

Find this block:

```ts
  }
  log('barem', { test: testId, end, seconds: Math.round((Date.now() - started) / 1000) });
  return end;
```

Replace it with:

```ts
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  log('barem', ces ? { test: testId, variant, end, seconds } : { test: testId, end, seconds });
  return end;
```

- [ ] **Step 91: Edit `runner/printTask.ts`**

Find this block:

```ts
import { fileURLToPath } from 'node:url';
import { DOCX_TYPE, PDF_TYPE } from '../shared/files.ts';
import type { RobotError } from '../shared/runner.ts';
```

Replace it with:

```ts
import { fileURLToPath } from 'node:url';
import { DOCX_TYPE, PDF_TYPE, type TestVariant } from '../shared/files.ts';
import type { RobotError } from '../shared/runner.ts';
```

- [ ] **Step 92: Edit `runner/printTask.ts`**

Find this block:

```ts

// Makes the print PDF of a test and sends it, or sends why it failed. A
// PrintSetupError goes up to the run loop, with nothing sent.
export async function makePrint(ctx: TaskContext, print: { tools: PrintTools; siteUrl: string }, testId: number): Promise<TaskEnd> {
  const started = Date.now();
  const folder = path.join(ctx.root, `print-${testId}`);
  let type: 'pdf' | 'docx' | null = null;
```

Replace it with:

```ts

// Makes the print PDF of a test, or of its CES variant, and sends it, or sends
// why it failed. The CES test gets the same QR code: the CES students upload on
// the class link. A PrintSetupError goes up to the run loop, with nothing sent.
export async function makePrint(
  ctx: TaskContext,
  print: { tools: PrintTools; siteUrl: string },
  testId: number,
  variant: TestVariant = 'class',
): Promise<TaskEnd> {
  const started = Date.now();
  const ces = variant === 'ces';
  const folder = path.join(ctx.root, `print-${ces ? 'ces-' : ''}${testId}`);
  let type: 'pdf' | 'docx' | null = null;
```

- [ ] **Step 93: Edit `runner/printTask.ts`**

Find this block:

```ts
    end = await (async (): Promise<TaskEnd> => {
      const job = await ctx.api.printJob(testId);
      const sendError = async (error: RobotError): Promise<TaskEnd> =>
        (await ctx.api.sendPrintFailed(testId, { runId: ctx.runId, filesVersion: job.filesVersion, createdAt: job.createdAt, error })) === 'failed' ? 'failed' : 'retry';
      const fileType = job.contentType === PDF_TYPE ? 'pdf' : job.contentType === DOCX_TYPE ? 'docx' : null;
```

Replace it with:

```ts
    end = await (async (): Promise<TaskEnd> => {
      const job = await ctx.api.printJob(testId, variant);
      const sendError = async (error: RobotError): Promise<TaskEnd> =>
        (await ctx.api.sendPrintFailed(testId, { runId: ctx.runId, filesVersion: job.filesVersion, createdAt: job.createdAt, error }, variant)) === 'failed'
          ? 'failed'
          : 'retry';
      const fileType = job.contentType === PDF_TYPE ? 'pdf' : job.contentType === DOCX_TYPE ? 'docx' : null;
```

- [ ] **Step 94: Edit `runner/printTask.ts`**

Find this block:

```ts
      if (!fileType) return sendError('crash');
      const source = await ctx.api.printSource(testId);
      await mkdir(folder, { recursive: true });
```

Replace it with:

```ts
      if (!fileType) return sendError('crash');
      const source = await ctx.api.printSource(testId, variant);
      await mkdir(folder, { recursive: true });
```

- [ ] **Step 95: Edit `runner/printTask.ts`**

Find this block:

```ts
      try {
        await ctx.api.sendPrint(testId, ctx.runId, job.filesVersion, pdf, job.createdAt);
        return 'saved';
```

Replace it with:

```ts
      try {
        await ctx.api.sendPrint(testId, ctx.runId, job.filesVersion, pdf, job.createdAt, variant);
        return 'saved';
```

- [ ] **Step 96: Edit `runner/printTask.ts`**

Find this block:

```ts
  const seconds = Math.round((Date.now() - started) / 1000);
  log('print', type ? { test: testId, type, end, seconds } : { test: testId, end, seconds });
  return end;
```

Replace it with:

```ts
  const seconds = Math.round((Date.now() - started) / 1000);
  const fields: Record<string, string | number> = ces ? { test: testId, variant } : { test: testId };
  log('print', type ? { ...fields, type, end, seconds } : { ...fields, end, seconds });
  return end;
```

- [ ] **Step 97: Edit `runner/run.ts`**

Find this block:

```ts
    const baremsTried = new Set<number>();
    const print = options.print;
```

Replace it with:

```ts
    const baremsTried = new Set<number>();
    // The CES variants' work, tried by the same rules as the class work.
    const cesPrintsTried = new Set<number>();
    const cesBaremsTried = new Set<number>();
    const cesListsTried = new Set<number>();
    const print = options.print;
```

- [ ] **Step 98: Edit `runner/run.ts`**

Find this block:

```ts
      // The print PDFs first: the teacher waits for them, and they are quick.
      // An older API sends no print jobs.
      for (const testId of tasks.prints ?? []) {
        if (!print || printsOff || printsTried.has(testId) || !canTake()) continue;
        started += 1;
        try {
          const end = await makePrint(ctx, print, testId);
          if (end !== 'retry') printsTried.add(testId);
          record(end, 'prints');
```

Replace it with:

```ts
      // The print PDFs first: the teacher waits for them, and they are quick.
      // An older API sends no print jobs, and no CES work.
      const prints = [
        ...(tasks.prints ?? []).map((testId) => ({ testId, variant: 'class' as const, tried: printsTried })),
        ...(tasks.cesPrints ?? []).map((testId) => ({ testId, variant: 'ces' as const, tried: cesPrintsTried })),
      ];
      for (const { testId, variant, tried } of prints) {
        if (!print || printsOff || tried.has(testId) || !canTake()) continue;
        started += 1;
        try {
          const end = await makePrint(ctx, print, testId, variant);
          if (end !== 'retry') tried.add(testId);
          record(end, 'prints');
```

- [ ] **Step 99: Edit `runner/run.ts`**

Find this block:

```ts
      // The generated barems next: the teacher waits for them too.
      for (const testId of tasks.barems ?? []) {
        if (baremsTried.has(testId) || !canTake()) continue;
        started += 1;
        const end = await makeBarem(ctx, testId);
        if (end !== 'retry') baremsTried.add(testId);
        record(end, 'barems');
      }
      for (const testId of tasks.exerciseLists) {
        if (listsTried.has(testId) || !canTake()) continue;
        listsTried.add(testId);
        started += 1;
        record(await makeExerciseList(ctx, testId), 'exerciseLists');
      }
```

Replace it with:

```ts
      // The generated barems next: the teacher waits for them too.
      const barems = [
        ...(tasks.barems ?? []).map((testId) => ({ testId, variant: 'class' as const, tried: baremsTried })),
        ...(tasks.cesBarems ?? []).map((testId) => ({ testId, variant: 'ces' as const, tried: cesBaremsTried })),
      ];
      for (const { testId, variant, tried } of barems) {
        if (tried.has(testId) || !canTake()) continue;
        started += 1;
        const end = await makeBarem(ctx, testId, variant);
        if (end !== 'retry') tried.add(testId);
        record(end, 'barems');
      }
      const lists = [
        ...tasks.exerciseLists.map((testId) => ({ testId, variant: 'class' as const, tried: listsTried })),
        ...(tasks.cesExerciseLists ?? []).map((testId) => ({ testId, variant: 'ces' as const, tried: cesListsTried })),
      ];
      for (const { testId, variant, tried } of lists) {
        if (tried.has(testId) || !canTake()) continue;
        tried.add(testId);
        started += 1;
        record(await makeExerciseList(ctx, testId, variant), 'exerciseLists');
      }
```

- [ ] **Step 100: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type error; `Test Files  134 passed | 1 skipped (135)`, `Tests  2114 passed | 3 skipped (2117)`.

- [ ] **Step 101: Commit**

```bash
git add shared/runner.ts server/db/runner.ts server/routes/runner.ts server/routes/runnerCes.test.ts server/routes/runner.test.ts server/routes/runnerPrint.test.ts runner/api.ts runner/api.test.ts runner/workdir.ts runner/tasks.ts runner/baremTask.ts runner/printTask.ts runner/run.ts runner/run.test.ts runner/cesTasks.test.ts
git commit -m "Let the robot make the CES print PDF, barem and exercise list"
```

### Task 4: Grade a CES paper with the CES barem

`GRADABLE` holds a CES paper until its CES barem is active and its CES list usable; the claim writes the paper's variant and checks `GRADABLE` again in its UPDATE; the claim answer names the variant, and the robot reads the CES files and list for a CES paper; the result is checked against the list of the paper's variant.

**Files:**
- Modify: `server/db/runner.ts`, `shared/runner.ts`, `runner/tasks.ts`
- Test: `server/routes/runnerCesGrading.test.ts`, `runner/cesTasks.test.ts`, `server/routes/runnerGrading.test.ts`

**Interfaces:**
- Consumes: Task 2's `paperVariantSql`, `baremActiveSql`; Task 3's `findRobotTest(…, variant)` and `RobotApi.test(…, variant)`.
- Produces: `ClaimResult.variant?: TestVariant` (the API always sends it); `GRADABLE` built by `gradableSql(s)`.

- [ ] **Step 1: Create `server/routes/runnerCesGrading.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addCesFiles, addSubmission, addTestFiles, makeClass, makeTest, markCes, ROBOT_KEY, robotRequest, setRobotKey, startTest, testIdOf } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// Grading a CES paper (spec: CES variant): the paper's variant is fixed when
// it first goes to grading, it is graded with the CES list, and it waits while
// the CES barem is not active.

const RUN = 'run-ces-grading-01';
let api: TestApi;
let robot: ReturnType<typeof robotRequest>;
let code: string;
let testId: number;
let ces: number;
let other: number;
let cesPaper: number;
let classPaper: number;

const CLASS_LIST = { totalPoints: 10, officePoints: 1, exercises: [{ id: 'I.1', label: 'Ex. 1', maxPoints: 9, answer: '1', scoringNotes: '', topic: 'T' }], notes: '' };
const CES_LIST = {
  totalPoints: 10,
  officePoints: 1,
  exercises: [
    { id: 'I.1', label: 'Ex. 1', maxPoints: 5, answer: '1', scoringNotes: '', topic: 'T' },
    { id: 'I.2', label: 'Ex. 2', maxPoints: 4, answer: '2', scoringNotes: '', topic: 'T' },
  ],
  notes: '',
};
const item = (exerciseId: string, points: number) => ({
  exerciseId,
  points,
  studentAnswer: 'r',
  comment: 'Bine.',
  confidence: 'high',
  needsReview: false,
  reviewReason: '',
  page: 1,
});
const grading = (items: ReturnType<typeof item>[]) => ({ items, unreadable: [], summary: 'Bine.', strengths: [], recommendations: ['Exersează.'] });

const setTest = (sql: string, ...params: unknown[]) => api.db.prepare(`UPDATE tests SET ${sql} WHERE id = ?`).bind(...params, testId).run();
const variantOf = async (id: number) =>
  (await api.db.prepare('SELECT variant, status FROM submissions WHERE id = ?').bind(id).first<{ variant: string | null; status: string }>())!;
const claim = async () => (await robot('POST', '/claim', { runId: RUN })).body as { submissionId: number; variant: string; startedAt: string } | '';
const testStatus = async () => (await api.db.prepare('SELECT status, analysis_status FROM tests WHERE id = ?').bind(testId).first<{ status: string; analysis_status: string }>())!;

beforeEach(async () => {
  api = await startTestApi();
  await setRobotKey(api);
  robot = robotRequest(api, ROBOT_KEY);
  const cls = await makeClass(api, '9R2', ['Bursașiu Teodor', 'Ene Ana']);
  [ces, other] = cls.studentIds as [number, number];
  code = await makeTest(api, cls.id);
  testId = await testIdOf(api, code);
  await startTest(api, code);
  await addTestFiles(api, code);
  await addCesFiles(api, code);
  await markCes(api, ces);
  cesPaper = await addSubmission(api, code, ces, { status: 'submitted', files: 1 });
  classPaper = await addSubmission(api, code, other, { status: 'submitted', files: 1 });
  await setTest(
    "status = 'evaluating', exercise_list_status = 'ready', exercise_list_json = ?, ces_exercise_list_status = 'ready', ces_exercise_list_json = ?",
    JSON.stringify(CLASS_LIST),
    JSON.stringify(CES_LIST),
  );
  expect((await robot('POST', '/lease', { runId: RUN })).body.granted).toBe(true);
});

afterEach(async () => {
  await api.dispose();
});

describe('a CES paper', () => {
  it('goes to grading as a CES paper and is saved against the CES list', async () => {
    // Alphabetical: Bursașiu (CES) first.
    const claimed = await claim();
    expect(claimed).toMatchObject({ submissionId: cesPaper, variant: 'ces' });
    expect(await variantOf(cesPaper)).toEqual({ variant: 'ces', status: 'grading' });

    const read = await robot('GET', `/tests/${testId}?variant=ces`);
    expect(read.body.test.exerciseList).toEqual(CES_LIST);

    // A grading made against the class list is refused for a CES paper.
    const wrong = await robot('POST', `/submissions/${cesPaper}/result`, {
      runId: RUN,
      startedAt: (claimed as { startedAt: string }).startedAt,
      ok: true,
      result: grading([item('I.1', 9)]),
      model: 'claude-test',
    });
    expect(wrong.status).toBe(422);
    const saved = await robot('POST', `/submissions/${cesPaper}/result`, {
      runId: RUN,
      startedAt: (claimed as { startedAt: string }).startedAt,
      ok: true,
      result: grading([item('I.1', 5), item('I.2', 3)]),
      model: 'claude-test',
    });
    expect(saved.status).toBe(200);
    const evaluation = await api.db.prepare('SELECT total, max_total, grade FROM evaluations WHERE submission_id = ?').bind(cesPaper).first();
    expect(evaluation).toEqual({ total: 9, max_total: 10, grade: 9 });

    // The class paper goes with the class variant.
    expect(await claim()).toMatchObject({ submissionId: classPaper, variant: 'class' });
  });

  it('waits while the CES barem is not active, and the test stays in evaluation', async () => {
    await setTest('ces_barem_unchecked = 1');
    expect((await robot('GET', '/tasks')).body.pendingGrading).toBe(1);
    expect(await claim()).toMatchObject({ submissionId: classPaper, variant: 'class' });
    const res = await robot('POST', '/claim', { runId: RUN });
    expect(res.status).toBe(204);
    expect(await variantOf(cesPaper)).toEqual({ variant: null, status: 'submitted' });

    await robot('POST', `/submissions/${classPaper}/result`, {
      runId: RUN,
      ok: true,
      result: grading([item('I.1', 8)]),
      model: 'claude-test',
    });
    // The CES paper still waits: no end, no class analysis yet.
    expect(await testStatus()).toEqual({ status: 'evaluating', analysis_status: 'none' });
    const page = await api.request('GET', `/api/admin/tests/${code}`);
    expect(page.body.test.ces).toMatchObject({ waiting: 1, papers: 0 });

    // The teacher checks the CES barem: the paper goes.
    await setTest('ces_barem_unchecked = 0');
    expect(await claim()).toMatchObject({ submissionId: cesPaper, variant: 'ces' });
  });

  it('waits for its CES exercise list, not for the class one', async () => {
    await setTest("ces_exercise_list_status = 'none', ces_exercise_list_json = NULL");
    expect((await robot('GET', '/tasks')).body).toMatchObject({ pendingGrading: 1, cesExerciseLists: [testId] });
    expect(await claim()).toMatchObject({ submissionId: classPaper, variant: 'class' });
    expect((await robot('POST', '/claim', { runId: RUN })).status).toBe(204);
  });

  it('is a class paper when the mark goes before the paper goes to grading', async () => {
    await api.db.prepare('UPDATE students SET ces = 0 WHERE id = ?').bind(ces).run();
    expect(await claim()).toMatchObject({ submissionId: cesPaper, variant: 'class' });
  });

  it('is a class paper when the test has no CES test file', async () => {
    await setTest('ces_test_file_key = NULL');
    expect(await claim()).toMatchObject({ submissionId: cesPaper, variant: 'class' });
  });

  it('keeps its variant through a regrade, whatever happens to the mark', async () => {
    await claim();
    await robot('POST', `/submissions/${cesPaper}/result`, { runId: RUN, ok: true, result: grading([item('I.1', 5), item('I.2', 4)]), model: 'claude-test' });
    await api.db.prepare('UPDATE students SET ces = 0 WHERE id = ?').bind(ces).run();
    const gradedAt = (await api.db.prepare('SELECT created_at FROM evaluations WHERE submission_id = ?').bind(cesPaper).first<{ created_at: string }>())!.created_at;
    const regraded = await api.request('POST', `/api/admin/submissions/${cesPaper}/regrade`, { gradedAt });
    expect(regraded.status).toBe(200);
    expect(await variantOf(cesPaper)).toEqual({ variant: 'ces', status: 'submitted' });
    expect(await claim()).toMatchObject({ submissionId: cesPaper, variant: 'ces' });
    // Its variant blocks the removal of the CES variant.
    expect((await api.request('DELETE', `/api/admin/tests/${code}/ces`)).body.error).toBe('ces_papers');
  });
});
```

- [ ] **Step 2: Edit `runner/cesTasks.test.ts`**

Find this block:

```ts
import type { TaskContext } from './tasks.ts';
import { makeExerciseList } from './tasks.ts';
import { addOpenTest, API_URL, evaluatingTest, fetchFrom, ROBOT_KEY } from './test/robotWorld.ts';
```

Replace it with:

```ts
import type { TaskContext } from './tasks.ts';
import { gradeSubmission, makeExerciseList } from './tasks.ts';
import { addOpenTest, API_URL, evaluatingTest, fetchFrom, ROBOT_KEY } from './test/robotWorld.ts';
```

- [ ] **Step 3: Edit `runner/cesTasks.test.ts`**

Find this block:

```ts

describe('makeExerciseList for the CES variant', () => {
```

Replace it with:

```ts

describe('gradeSubmission of a CES paper', () => {
  it('grades the paper with the CES test, barem and list, and says so in ces.md', async () => {
    const world = await evaluatingTest({ uploads: 1, pages: 1 });
    api = world.api;
    const studentId = (await api.db.prepare('SELECT student_id FROM submissions WHERE id = ?').bind(world.submissionIds[0]).first<{ student_id: number }>())!
      .student_id;
    await markCes(api, studentId);
    const cesList = { ...CLASS_LIST, exercises: [{ ...CLASS_LIST.exercises[0]!, maxPoints: 9 }] };
    await setTest(
      world.testId,
      `exercise_list_json = ?, exercise_list_status = 'ready', ces_exercise_list_json = ?, ces_exercise_list_status = 'ready',
       ces_test_file_key = 'fixture/ces/test.pdf', ces_test_file_name = 't.pdf', ces_test_file_type = ?,
       ces_barem_file_key = 'fixture/ces/barem.pdf', ces_barem_file_name = 'b.pdf', ces_barem_file_type = ?, ces_barem_notes = 'Scrisul nu se depunctează.'`,
      JSON.stringify(CLASS_LIST),
      JSON.stringify(cesList),
      PDF_TYPE,
      PDF_TYPE,
    );
    await api.env.FILES.put('fixture/ces/test.pdf', '%PDF-1.7 test CES');
    await api.env.FILES.put('fixture/ces/barem.pdf', '%PDF-1.7 barem CES');
    await lease();
    const claimed = await robotApi(API_URL, ROBOT_KEY, { fetch: fetchFrom(api), retryDelayMs: 0 }).claim(RUN);
    expect(claimed).toMatchObject({ submissionId: world.submissionIds[0], variant: 'ces' });

    let seen = { test: '', barem: '', notes: '', list: '' };
    const claude = scriptedClaude((task) => {
      seen = {
        test: readFileSync(path.join(task.cwd, 'test', 'test.pdf'), 'utf8'),
        barem: readFileSync(path.join(task.cwd, 'barem', 'barem.pdf'), 'utf8'),
        notes: readFileSync(path.join(task.cwd, 'barem', 'notes.md'), 'utf8'),
        list: readFileSync(path.join(task.cwd, 'exercises.json'), 'utf8'),
      };
      return answer({
        items: [{ exerciseId: 'I.1', points: 7, studentAnswer: '1', comment: 'Bine.', confidence: 'high', needsReview: false, reviewReason: '', page: 1 }],
        unreadable: [],
        summary: 'Bine.',
        strengths: [],
        recommendations: ['Exersează.'],
      });
    });
    expect(await gradeSubmission(context(claude), claimed!)).toBe('saved');
    expect(claude.calls[0]!.files).toContain('ces.md');
    expect(seen.test).toBe('%PDF-1.7 test CES');
    expect(seen.barem).toBe('%PDF-1.7 barem CES');
    expect(seen.notes).toContain('Scrisul nu se depunctează.');
    expect(JSON.parse(seen.list)).toEqual(cesList);
    const evaluation = await api.db.prepare('SELECT total, max_total FROM evaluations WHERE submission_id = ?').bind(world.submissionIds[0]).first();
    expect(evaluation).toEqual({ total: 8, max_total: 10 });
  });
});

describe('makeExerciseList for the CES variant', () => {
```

- [ ] **Step 4: Edit `server/routes/runnerGrading.test.ts`**

Find this block:

```ts
      startedAt: await startedAtOf(api, oldest),
      files: [
```

Replace it with:

```ts
      startedAt: await startedAtOf(api, oldest),
      variant: 'class',
      files: [
```

- [ ] **Step 5: Run the new tests to see them fail**

Run: `npx vitest run server/routes/runnerCesGrading.test.ts runner/cesTasks.test.ts server/routes/runnerGrading.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  8 failed | 30 passed (38)`: the claim names no variant (`expected { submissionId: 1, testId: 1, …(2) } to match object { submissionId: 1, variant: 'ces' }`), a CES paper does not wait (`expected 2 to be 1`), and a regrade finds no grading (`Cannot read properties of null (reading 'created_at')`).

- [ ] **Step 6: Edit `server/db/runner.ts`**

Find this block:

```ts
  AND EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status = 'submitted')`;
// An upload (s) that can be graded: its test (t) is in evaluation with a usable exercise list.
export const GRADABLE = `s.status = 'submitted' AND t.status = 'evaluating' AND t.exercise_list_status IN ('ready', 'accepted')`;
// A test whose class analysis was asked for, with nothing left to grade and at
```

Replace it with:

```ts
  AND EXISTS (SELECT 1 FROM submissions s WHERE s.test_id = t.id AND s.status = 'submitted')`;
// An upload (alias `s`) of test `t` that can be graded: the test is in
// evaluation with a usable exercise list of the paper's variant. A CES paper
// also needs an active CES barem: until then it waits, sent, and the class
// papers are graded meanwhile.
function gradableSql(s: string): string {
  return `${s}.status = 'submitted' AND t.status = 'evaluating' AND CASE ${paperVariantSql(s, 't')}
    WHEN 'ces' THEN (${baremActiveSql('ces')} AND t.ces_exercise_list_status IN ('ready', 'accepted'))
    ELSE t.exercise_list_status IN ('ready', 'accepted') END`;
}
export const GRADABLE = gradableSql('s');
// A test whose class analysis was asked for, with nothing left to grade and at
```

- [ ] **Step 7: Edit `server/db/runner.ts`**

Find this block:

```ts
           WHERE s.test_id = t.id AND s.status = 'grading' AND t.status = 'evaluating'
             AND t.exercise_list_status IN ('ready', 'accepted')
             AND NOT EXISTS (SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = s.run_id AND r.heartbeat_at >= ?)))`,
```

Replace it with:

```ts
           WHERE s.test_id = t.id AND s.status = 'grading' AND t.status = 'evaluating'
             AND CASE s.variant WHEN 'ces' THEN t.ces_exercise_list_status ELSE t.exercise_list_status END IN ('ready', 'accepted')
             AND NOT EXISTS (SELECT 1 FROM runner_state r WHERE r.id = 1 AND r.run_id = s.run_id AND r.heartbeat_at >= ?)))`,
```

- [ ] **Step 8: Edit `server/db/runner.ts`**

Find this block:

```ts
// run's old grading of it may still send a result, which must be refused.
export async function claimSubmission(db: D1Database, runId: string): Promise<ClaimResult | null> {
  let claimed: { id: number; test_id: number; started_at: string } | null = null;
  for (let tries = 0; tries < 5 && !claimed; tries++) {
```

Replace it with:

```ts
// run's old grading of it may still send a result, which must be refused.
// The claim writes the paper's variant (paperVariantSql) when it has none yet:
// from then on the paper keeps it, through a regrade or a retry, whatever
// happens to the student's CES mark. The claim checks GRADABLE again in its
// SQL, so a mark that changed since the look still sends no CES paper to the
// robot before its CES barem is active.
export async function claimSubmission(db: D1Database, runId: string): Promise<ClaimResult | null> {
  let claimed: { id: number; test_id: number; started_at: string; variant: TestVariant } | null = null;
  for (let tries = 0; tries < 5 && !claimed; tries++) {
```

- [ ] **Step 9: Edit `server/db/runner.ts`**

Find this block:

```ts
      .prepare(
        `UPDATE submissions SET status = 'grading', run_id = ?
         WHERE id = ? AND status = 'submitted' AND ${HOLDS_LEASE}
         RETURNING id, test_id, started_at`,
      )
      .bind(runId, next.id, runId)
      .first<{ id: number; test_id: number; started_at: string }>();
    // No row: another claim took it, or the run lost the lease.
```

Replace it with:

```ts
      .prepare(
        `UPDATE submissions SET status = 'grading', run_id = ?,
           variant = (SELECT ${paperVariantSql('submissions', 't')} FROM tests t WHERE t.id = submissions.test_id)
         WHERE id = ? AND status = 'submitted' AND ${HOLDS_LEASE}
           AND EXISTS (SELECT 1 FROM tests t WHERE t.id = submissions.test_id AND ${gradableSql('submissions')})
         RETURNING id, test_id, started_at, variant`,
      )
      .bind(runId, next.id, runId)
      .first<{ id: number; test_id: number; started_at: string; variant: TestVariant }>();
    // No row: another claim took it, or the run lost the lease.
```

- [ ] **Step 10: Edit `server/db/runner.ts`**

Find this block:

```ts
    startedAt: claimed.started_at,
    files: results.map((row) => ({ id: row.id, contentType: row.content_type, position: row.position })),
```

Replace it with:

```ts
    startedAt: claimed.started_at,
    variant: claimed.variant,
    files: results.map((row) => ({ id: row.id, contentType: row.content_type, position: row.position })),
```

- [ ] **Step 11: Edit `server/db/runner.ts`**

Find this block:

```ts

// An upload as the result route sees it, with the exercise list of its test.
export async function findGrading(
```

Replace it with:

```ts

// An upload as the result route sees it, with the exercise list of its test,
// the CES variant's for a CES paper.
export async function findGrading(
```

- [ ] **Step 12: Edit `server/db/runner.ts`**

Find this block:

```ts
  const row = await db
    .prepare('SELECT s.status, s.run_id, s.started_at, t.exercise_list_json FROM submissions s JOIN tests t ON t.id = s.test_id WHERE s.id = ?')
    .bind(submissionId)
```

Replace it with:

```ts
  const row = await db
    .prepare(
      `SELECT s.status, s.run_id, s.started_at,
         CASE WHEN s.variant = 'ces' THEN t.ces_exercise_list_json ELSE t.exercise_list_json END AS exercise_list_json
       FROM submissions s JOIN tests t ON t.id = s.test_id WHERE s.id = ?`,
    )
    .bind(submissionId)
```

- [ ] **Step 13: Edit `shared/runner.ts`**

Find this block:

```ts
  startedAt: string;
  files: { id: number; contentType: string; position: number }[];
```

Replace it with:

```ts
  startedAt: string;
  // "ces": grade the paper with the CES variant's files and list
  // (GET /tests/:id?variant=ces). An older API sends none: the class test.
  variant?: TestVariant;
  files: { id: number; contentType: string; position: number }[];
```

- [ ] **Step 14: Edit `runner/tasks.ts`**

Find this block:

```ts

export async function gradeSubmission(ctx: TaskContext, claim: ClaimResult): Promise<TaskEnd> {
  const { submissionId, testId, startedAt } = claim;
  const end = await inWorkFolder(ctx, `grade-${submissionId}`, async (makeFolder) => {
    const sendError = async (error: RobotError) => (await ctx.api.sendResult(submissionId, { runId: ctx.runId, startedAt, ok: false, error })) === 'failed';
    const test = await ctx.api.test(testId);
    const list: ExerciseList | null = test.exerciseList;
    const files = await teacherFiles(ctx, testId, test.files);
    if (!list || !files) return sendOutcome({ ok: false, problem: 'crash', detail: 'missing list or file' }, async () => undefined, sendError);
```

Replace it with:

```ts

// Grades one paper with the files of its variant: a CES paper with the CES
// test, the CES barem and the CES list, and ces.md in the work folder.
export async function gradeSubmission(ctx: TaskContext, claim: ClaimResult): Promise<TaskEnd> {
  const { submissionId, testId, startedAt } = claim;
  const variant: TestVariant = claim.variant ?? 'class';
  const end = await inWorkFolder(ctx, `grade-${submissionId}`, async (makeFolder) => {
    const sendError = async (error: RobotError) => (await ctx.api.sendResult(submissionId, { runId: ctx.runId, startedAt, ok: false, error })) === 'failed';
    const test = await ctx.api.test(testId, variant);
    const list: ExerciseList | null = test.exerciseList;
    const files = await teacherFiles(ctx, testId, test.files, variant);
    if (!list || !files) return sendOutcome({ ok: false, problem: 'crash', detail: 'missing list or file' }, async () => undefined, sendError);
```

- [ ] **Step 15: Edit `runner/tasks.ts`**

Find this block:

```ts
    }
    const cwd = await makeFolder({ ...files, baremNotes: test.baremNotes, exerciseList: list, pages });
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
```

Replace it with:

```ts
    }
    const cwd = await makeFolder({ ...files, baremNotes: test.baremNotes, exerciseList: list, pages, ...(variant === 'ces' ? { variant } : {}) });
    if (!cwd) return sendOutcome({ ok: false, problem: 'crash', detail: 'work folder' }, async () => undefined, sendError);
```

- [ ] **Step 16: Edit `runner/tasks.ts`**

Find this block:

```ts
  });
  log('grade', { submission: submissionId, test: testId, pages: claim.files.length, end });
  return end;
```

Replace it with:

```ts
  });
  const fields = { submission: submissionId, test: testId, pages: claim.files.length, end };
  log('grade', variant === 'ces' ? { ...fields, variant } : fields);
  return end;
```

- [ ] **Step 17: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type error; `Test Files  135 passed | 1 skipped (136)`, `Tests  2121 passed | 3 skipped (2124)`.

- [ ] **Step 18: Commit**

```bash
git add server/db/runner.ts shared/runner.ts runner/tasks.ts server/routes/runnerCesGrading.test.ts server/routes/runnerGrading.test.ts runner/cesTasks.test.ts
git commit -m "Grade a CES paper with the CES barem"
```

### Task 5: Teach the grading skill the CES variant

The skill reads `ces.md` in every mode: the CES list reuses the class ids, a CES paper is graded by the CES rules and its texts never say "CES", the class analysis counts the CES papers with their own exercises, and the CES barem is written for grading only, after the new reference built from the teacher's sample. `GET /tests/:id/results` gives each paper's `variant` and the `cesExercises`.

**Files:**
- Create: `.claude/skills/evaluate-test/references/barem-example-ces.md`
- Modify: `.claude/skills/evaluate-test/SKILL.md`, `.claude/skills/evaluate-test/references/barem-writing.md`, `shared/runner.ts`, `server/db/runner.ts`
- Test: `runner/skill.test.ts`, `runner/workdir.test.ts`, `server/routes/runnerCesGrading.test.ts`

**Interfaces:**
- Produces: `ClassResults.cesExercises: ClassResultsExercise[] | null`, `ClassResults.students[].variant: TestVariant`, `ClassResultsExercise`.

- [ ] **Step 1: Edit `runner/skill.test.ts`**

Find this block:

```ts

  it('names the barem mode and its references', () => {
```

Replace it with:

```ts

  it('tells Claude what the CES variant changes in each mode', () => {
    for (const file of ['ces.md', 'class/exercises.json', 'class/barem.pdf', 'references/barem-example-ces.md']) {
      expect(skill).toContain(`\`${file}\``);
    }
    expect(skill).toContain('copy that item\'s `id` and `label` from `class/exercises.json`');
    expect(skill).toContain('Never write "CES", "adaptat", "variantă", or any word about special needs in a text the student sees');
    expect(skill).toContain('`cesExercises`');
    const writing = readFileSync(path.join(SKILL_DIR, 'references', 'barem-writing.md'), 'utf8');
    expect(writing).toContain('## Barem pentru varianta CES');
    expect(writing).toContain('The total is always 90 + 10 "din oficiu" (100)');
  });

  it('keeps the CES example to what grading needs, with no name, class or date', () => {
    const example = readFileSync(path.join(SKILL_DIR, 'references', 'barem-example-ces.md'), 'utf8');
    expect(example).toContain('**Reguli de notare**');
    expect(example).toContain('**Observații.**');
    for (const left of ['Ce s-a adaptat', 'Cum se administrează', 'Competențe evaluate', 'confidențial', 'Bursașiu', 'R2', 'octombrie', 'clarifică oral']) {
      expect(example).not.toContain(left);
    }
  });

  it('names the barem mode and its references', () => {
```

- [ ] **Step 2: Edit `runner/workdir.test.ts`**

Find this block:

```ts
      exercises: [],
      students: [{ label: 'Elev 1', total: 8, grade: 8, items: [] }],
    };
```

Replace it with:

```ts
      exercises: [],
      cesExercises: null,
      students: [{ label: 'Elev 1', total: 8, grade: 8, variant: 'class' as const, items: [] }],
    };
```

- [ ] **Step 3: Edit `server/routes/runnerCesGrading.test.ts`**

Find this block:

```ts

  it('keeps its variant through a regrade, whatever happens to the mark', async () => {
```

Replace it with:

```ts

  it('goes to the class analysis with its variant and the CES exercises, without a name', async () => {
    for (const expected of [cesPaper, classPaper]) {
      const claimed = (await claim()) as { submissionId: number };
      expect(claimed.submissionId).toBe(expected);
      const items = expected === cesPaper ? [item('I.1', 4), item('I.2', 4)] : [item('I.1', 7)];
      await robot('POST', `/submissions/${expected}/result`, { runId: RUN, ok: true, result: grading(items), model: 'claude-test' });
    }
    expect(await testStatus()).toEqual({ status: 'evaluating', analysis_status: 'requested' });
    const results = (await robot('GET', `/tests/${testId}/results`)).body.results;
    expect(results.students.map((s: { label: string; variant: string; total: number }) => [s.label, s.variant, s.total])).toEqual([
      ['Elev 1', 'ces', 9],
      ['Elev 2', 'class', 8],
    ]);
    expect(results.exercises.map((e: { id: string; maxPoints: number }) => [e.id, e.maxPoints])).toEqual([['I.1', 9]]);
    expect(results.cesExercises.map((e: { id: string; maxPoints: number }) => [e.id, e.maxPoints])).toEqual([
      ['I.1', 5],
      ['I.2', 4],
    ]);
    expect(JSON.stringify(results)).not.toMatch(/Bursașiu|Ene/);
  });

  it('keeps its variant through a regrade, whatever happens to the mark', async () => {
```

- [ ] **Step 4: Run the new tests to see them fail**

Run: `npx vitest run runner/skill.test.ts runner/workdir.test.ts server/routes/runnerCesGrading.test.ts`
Expected: FAIL. `Test Files  2 failed | 1 passed (3)`, `Tests  3 failed | 28 passed (31)`: the skill does not name `ces.md`, the CES example does not exist (`ENOENT … barem-example-ces.md`), and the class results have no `variant` (`[ 'Elev 1', undefined, 9 ]`).

- [ ] **Step 5: Create `.claude/skills/evaluate-test/references/barem-example-ces.md`**

```markdown
# A real example of a CES test and its barem

This is a real adapted test from the teacher, made for the students of a class with special educational needs (CES, "cerințe educaționale speciale"), and the part of its barem that grading needs. It is used with her permission. The test keeps the contents, the order of the items and the points of the class test, but it guides the student: short requests in the second person, blanks to fill in (`\_\_\_\_`), a box of useful formulas, and fewer exercises to write in full (II.2 has two absolute values instead of three).

The teacher's own barem had more parts: what was adapted and why, how to give the test, and the competences assessed. They are for the teacher, not for grading, and they are left out here: never write them. The class letter, the date and the student's name are left out too. One rule was changed: the teacher's barem lets the student explain a hard-to-read answer orally after the test; the robot cannot hear the student, so hard-to-read writing is simply not penalized, and an answer that cannot be read is marked for the teacher to check.

In the barem, the math is shown the way pandoc writes Word equations; you write math as plain inline TeX between single `$`.

## Testul

**TEST DE EVALUARE**

**Modulul, partea întreagă și partea fracționară a unui număr real**

Matematică -- clasa a IX-a

Numele și prenumele:

+-----------------------------------------------------------------------+
| **Cum lucrezi**                                                       |
|                                                                       |
| - Ai **50 de minute**. Dacă ai nevoie, primești încă **15 minute**.   |
|                                                                       |
| - Completează spațiile libere \_\_\_\_\_\_. Pe liniile punctate scrie |
|   calculele.                                                          |
|                                                                       |
| - Poți rezolva și altfel decât pe pași. Orice rezolvare corectă       |
|   primește punctaj.                                                   |
|                                                                       |
| - Dacă te blochezi la un exercițiu, treci la următorul. Revii la      |
|   final.                                                              |
|                                                                       |
| - Poți cere oricând să-ți citesc cerința.                             |
|                                                                       |
| - Contează raționamentul. Greșelile de ortografie nu se depunctează.  |
|                                                                       |
| - La final, verifică dacă ai completat toate spațiile libere.         |
|                                                                       |
| - Primești **10 puncte din oficiu**.                                  |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Formule utile**                                                     |
|                                                                       |
| - $|a| = \left\{ \begin{array}{r}                                     |
|   a,\ \text{dacă }a \geq 0 \\                                         |
|    - a,\ \text{dacă }a < 0                                            |
|   \end{array} \right.\$                                               |
|                                                                       |
| - $\sqrt{a^{2}} = |a|$                                                |
|                                                                       |
| - $|E| \leq b \Leftrightarrow - b \leq E \leq b$                      |
|                                                                       |
| - $\lbrack a\rbrack = k \Leftrightarrow k \leq a < k + 1$, unde $k$   |
|   este număr întreg                                                   |
|                                                                       |
| - $\left\{ a \right\} = a - \lbrack a\rbrack$ și                      |
|   $0 \leq \left\{ a \right\} < 1$                                     |
|                                                                       |
| $\lbrack a\rbrack$ = partea întreagă a lui $a$; $\left\{ a \right\}$  |
| = partea fracționară a lui $a$                                        |
+-----------------------------------------------------------------------+

Te poți uita oricând la această pagină, cât lucrezi.

**SUBIECTUL I** (40 de puncte)

------------------------------------------------------------------------

**1.** Calculează.

> a\) $\lbrack - 2,4\rbrack + \left\lbrack \sqrt{17} \right\rbrack$
> **5p**
>
> Numărul $- 2,4$ se află între numerele întregi \_\_\_\_\_ și
> \_\_\_\_\_.
>
> Deci $\lbrack - 2,4\rbrack = \text{\_\_\_\_\_}$.
>
> $16 < 17 < 25 \Rightarrow \text{\_\_\_\_} < \sqrt{17} < \text{\_\_\_\_} \Rightarrow \left\lbrack \sqrt{17} \right\rbrack = \text{\_\_\_\_}$.
>
> $\lbrack - 2,4\rbrack + \left\lbrack \sqrt{17} \right\rbrack = \text{\_\_\_\_} + \text{\_\_\_\_} = \text{\_\_\_\_}$.
>
> b\) $\left\{ - 1,25 \right\} + \left\{ \frac{7}{2} \right\}$ **5p**
>
> $\left\{ - 1,25 \right\} = - 1,25 - \lbrack - 1,25\rbrack = - 1,25 - \left( \text{\_\_\_\_\_} \right) = \text{\_\_\_\_\_\_}$.
>
> $\left\{ \frac{7}{2} \right\} = \frac{7}{2} - \left\lbrack \frac{7}{2} \right\rbrack = \frac{7}{2} - \text{\_\_\_\_} = \text{\_\_\_\_\_\_}$.
>
> $\left\{ - 1,25 \right\} + \left\{ \frac{7}{2} \right\} = \text{\_\_\_\_\_\_} + \text{\_\_\_\_\_\_} = \text{\_\_\_\_\_\_}$.

**2.** Arată că numărul
$a = \left| 2\sqrt{2} - 3 \right| + \sqrt{\left( 1 - \sqrt{2} \right)^{2}} - \left| \sqrt{2} - 4 \right|$
este număr întreg. **10p**

> **Pasul 1.** Compară $2\sqrt{2}$ cu $3$:
> $\left( 2\sqrt{2} \right)^{2} = \text{\_\_\_\_}$ și
> $3^{2} = \text{\_\_\_\_}$.
>
> Numărul $2\sqrt{2} - 3$ este (încercuiește): **pozitiv** / **negativ**
>
> Deci $\left| 2\sqrt{2} - 3 \right| = \text{\_\_\_\_\_\_\_\_\_\_}$.
>
> **Pasul 2.**
> $\sqrt{\left( 1 - \sqrt{2} \right)^{2}} = \left| 1 - \sqrt{2} \right| = \text{\_\_\_\_\_\_\_\_\_\_}$,
> pentru că $\sqrt{2} > 1$.
>
> **Pasul 3.** $\sqrt{2} < 4$, deci
> $\left| \sqrt{2} - 4 \right| = \text{\_\_\_\_\_\_\_\_\_\_}$.
>
> **Pasul 4.**
> $a = \text{\_\_\_\_\_\_\_\_} + \text{\_\_\_\_\_\_\_\_} - \left( \text{\_\_\_\_\_\_\_\_} \right) = \text{\_\_\_\_\_}$

**3.** Se consideră un număr real $x \in \lbrack - 1;\ 0)$. Așadar
$- 1 \leq x < 0$.

> a\) Arată că $|x + 1| + |x - 2| = 3$. **5p**
>
> În spațiile mici scrie semnul potrivit: **≥** sau **\<**.
>
> $x \geq - 1 \Rightarrow x + 1\text{\_\_\_}0 \Rightarrow |x + 1| = \text{\_\_\_\_\_\_\_\_}$
>
> $x < 0 \Rightarrow x - 2\text{\_\_\_}0 \Rightarrow |x - 2| = \text{\_\_\_\_\_\_\_\_}$
>
> $|x + 1| + |x - 2| = \text{\_\_\_\_\_\_\_\_} + \text{\_\_\_\_\_\_\_\_} = 3$
>
> b\) Determină $\lbrack x\rbrack$ și arată că
> $\left\{ x \right\} = x + 1$. **5p**
>
> $- 1 \leq x < 0 \Rightarrow \lbrack x\rbrack = \text{\_\_\_\_\_}$
>
> $\left\{ x \right\} = x - \lbrack x\rbrack = x - \left( \text{\_\_\_\_\_} \right) = \text{\_\_\_\_\_\_\_\_}$
>
> c\) Scrie $\left\{ 2x \right\}$ ca expresie de $x$, fără acolade.
> Lucrează pe cele două cazuri de mai jos. **10p**
>
> $- 1 \leq x < 0 \Rightarrow \text{\_\_\_\_} \leq 2x < \text{\_\_\_\_}$
>
> **Cazul 1.** Dacă $x \in \left\lbrack - 1;\  - \frac{1}{2} \right)$,
> atunci
> $2x \in \left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right)$.
>
> $\lbrack 2x\rbrack = \text{\_\_\_\_}$, deci
> $\left\{ 2x \right\} = 2x - \lbrack 2x\rbrack = \text{\_\_\_\_\_\_\_\_\_\_}$.
>
> **Cazul 2.** Dacă $x \in \left\lbrack - \frac{1}{2};\ 0 \right)$,
> atunci
> $2x \in \left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right)$.
>
> $\lbrack 2x\rbrack = \text{\_\_\_\_}$, deci
> $\left\{ 2x \right\} = 2x - \lbrack 2x\rbrack = \text{\_\_\_\_\_\_\_\_\_\_}$.

**SUBIECTUL al II-lea** (50 de puncte)

------------------------------------------------------------------------

**1.** Rezolvă în $\mathbb{R}$ inecuația $|2x - 3| \leq 5$. **10p**

> $|2x - 3| \leq 5 \Leftrightarrow \text{\_\_\_\_} \leq 2x - 3 \leq \text{\_\_\_\_}$
>
> Adun 3 în toate părțile:
> $\text{\_\_\_\_} \leq 2x \leq \text{\_\_\_\_}$
>
> Împart la 2: $\text{\_\_\_\_} \leq x \leq \text{\_\_\_\_}$
>
> Mulțimea soluțiilor:
> $S = \left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right\rbrack$.

**2.** Rezolvă în $\mathbb{R}$ ecuația $|x + 1| + |x - 2| = x + 3$.
**15p**

> **Pasul 1.** $x + 1 = 0$ pentru $x = \text{\_\_\_\_}$; $x - 2 = 0$
> pentru $x = \text{\_\_\_\_}$.
>
> **Pasul 2.** Completează tabelul. Pe fiecare interval scrie modulele
> fără bare. Apoi rezolvă ecuația.

  ---------------- --------------------------------------------- ---------------------------------------------------------- ----------------------------------------------------
   **Intervalul**  $\left( - \infty;\ \text{\_\_\_\_} \right)$   $\left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right)$   $\left\lbrack \text{\_\_\_\_};\  + \infty \right)$

    $|x + 1|$ =                                                                                                             

    $|x - 2|$ =                                                                                                             

     **Ecuația                                                                                                              
      devine**                                                                                                              
    (rezolv-o):                                                                                                             

  Soluția găsită:  $x$ =                                         $x$ =                                                      $x$ =

      Este în      **DA / NU**                                   **DA / NU**                                                **DA / NU**
     interval?                                                                                                              
   (încercuiește)                                                                                                           
  ---------------- --------------------------------------------- ---------------------------------------------------------- ----------------------------------------------------

> **Pasul 3.** Mulțimea soluțiilor:
> $S = \left\{ \text{\_\_\_\_\_\_\_\_\_\_} \right\}$.

**3.** Rezolvă în $\mathbb{R}$:

> a\) ecuația $\left\lbrack \frac{2x - 1}{3} \right\rbrack = 2$. **5p**
>
> $\text{\_\_\_\_} \leq \frac{2x - 1}{3} < \text{\_\_\_\_}$
>
> Înmulțesc cu 3: $\text{\_\_\_\_} \leq 2x - 1 < \text{\_\_\_\_}$
>
> Adun 1: $\text{\_\_\_\_} \leq 2x < \text{\_\_\_\_}$
>
> Împart la 2: $\text{\_\_\_\_} \leq x < \text{\_\_\_\_}$. Deci
> $S = \text{\_\_\_\_\_\_\_\_\_\_}$.
>
> b\) inecuația $\left\lbrack \frac{x + 1}{2} \right\rbrack \leq 1$.
> **5p**
>
> Notez $a = \frac{x + 1}{2}$. Atunci $\lbrack a\rbrack \leq 1$.
>
> Asta înseamnă că $\lbrack a\rbrack$ poate fi
> $1,\ 0,\  - 1,\  - 2,\ \ldots$ Deci $a < \text{\_\_\_\_}$.
>
> $\frac{x + 1}{2} < \text{\_\_\_\_} \Rightarrow x + 1 < \text{\_\_\_\_} \Rightarrow x < \text{\_\_\_\_}$
>
> Mulțimea soluțiilor: $S = \text{\_\_\_\_\_\_\_\_\_\_}$.

**4.** Rezolvă în $\mathbb{R}$ ecuația $\left\{ 3x \right\} = x - 1$.
**15p**

> **Pasul 1.** Știm că $0 \leq \left\{ 3x \right\} < 1$. Atunci
> $0 \leq x - 1 < 1$, deci
> $x \in \left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right)$.
>
> **Pasul 2.**
> $\lbrack 3x\rbrack = 3x - \left\{ 3x \right\} = \text{\_\_\_\_\_\_\_\_\_\_\_\_}$.
> Acest număr este întreg.
>
> **Pasul 3.** Pentru $x$ din intervalul de la Pasul 1, numărul de la
> Pasul 2 este în intervalul
> $\left\lbrack \text{\_\_\_\_};\ \text{\_\_\_\_} \right)$. Numerele
> întregi posibile sunt: \_\_\_\_ și \_\_\_\_.
>
> **Pasul 4.** Află $x$ în fiecare caz și verifică în ecuație:

  ----------------------------------------------------------------

  ----------------------------------------------------------------

> Mulțimea soluțiilor:
> $S = \left\{ \text{\_\_\_\_\_\_\_\_\_\_} \right\}$.

## Baremul (doar partea pentru notare)

**Reguli de notare**

------------------------------------------------------------------------

- Se acordă 10 puncte din oficiu. Nota finală = punctajul total : 10.

- Orice rezolvare corectă primește punctajul maxim, chiar dacă nu
  urmează pașii din test.

- Un spațiu completat corect se punctează ca etapa corespunzătoare din
  barem, fără alte justificări scrise.

- Nu se depunctează: greșelile de ortografie, scrisul greu lizibil,
  inversările de cifre sau de semne la
  copiere, atunci când calculele următoare arată că a lucrat cu valoarea
  corectă.

- Nu se acordă fracțiuni de punct. Punctajele parțiale se acordă pe
  etape, în limitele din barem.

**Barem**

------------------------------------------------------------------------

+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **Item**                | **Răspuns așteptat / etape**                                                            | **Punctaj**             |
+:=======================:+=========================================================================================+========================:+
| **SUBIECTUL I (40 de puncte)**                                                                                                              |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.1.a** (5p)          | $- 3 \leq - 2,4 < - 2$ (spațiile: $- 3$ și $- 2$), deci $\lbrack - 2,4\rbrack = - 3$    | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $4 < \sqrt{17} < 5 \Rightarrow \left\lbrack \sqrt{17} \right\rbrack = 4$                | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\lbrack - 2,4\rbrack + \left\lbrack \sqrt{17} \right\rbrack = - 3 + 4 = 1$             | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.1.b** (5p)          | $\left\{ - 1,25 \right\} = - 1,25 - ( - 2) = 0,75$                                      | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\left\{ \frac{7}{2} \right\} = \frac{7}{2} - 3 = \frac{1}{2}$                          | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\left\{ - 1,25 \right\} + \left\{ \frac{7}{2} \right\} = 0,75 + 0,5 = 1,25$            | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.2** (10p)           | $\left( 2\sqrt{2} \right)^{2} = 8 < 9 = 3^{2}$; numărul $2\sqrt{2} - 3$ este negativ,   | 3p                      |
|                         | deci $\left| 2\sqrt{2} - 3 \right| = 3 - 2\sqrt{2}$                                     |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\sqrt{\left( 1 - \sqrt{2} \right)^{2}} = \left| 1 - \sqrt{2} \right| = \sqrt{2} - 1$   | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\left| \sqrt{2} - 4 \right| = 4 - \sqrt{2}$                                            | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $a = 3 - 2\sqrt{2} + \sqrt{2} - 1 - \left( 4 - \sqrt{2} \right) = - 2 \in {\mathbb{Z}}$ | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.3.a** (5p)          | $x + 1 \geq 0 \Rightarrow |x + 1| = x + 1$                                              | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $x - 2 < 0 \Rightarrow |x - 2| = 2 - x$                                                 | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $|x + 1| + |x - 2| = x + 1 + 2 - x = 3$                                                 | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.3.b** (5p)          | $\lbrack x\rbrack = - 1$                                                                | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\left\{ x \right\} = x - ( - 1) = x + 1$                                               | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **I.3.c** (10p)         | $- 2 \leq 2x < 0$                                                                       | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | Cazul 1: $2x \in \lbrack - 2;\  - 1)$, $\lbrack 2x\rbrack = - 2$,                       | 4p                      |
|                         | $\left\{ 2x \right\} = 2x + 2$                                                          |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | Cazul 2: $2x \in \lbrack - 1;\ 0)$, $\lbrack 2x\rbrack = - 1$,                          | 4p                      |
|                         | $\left\{ 2x \right\} = 2x + 1$                                                          |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **SUBIECTUL al II-lea (50 de puncte)**                                                                                                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **II.1** (10p)          | $- 5 \leq 2x - 3 \leq 5$                                                                | 4p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $- 2 \leq 2x \leq 8$ și $- 1 \leq x \leq 4$                                             | 4p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $S = \lbrack - 1;\ 4\rbrack$                                                            | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **II.2** (15p)          | Pasul 1: $x = - 1$ și $x = 2$; intervalele $( - \infty;\  - 1)$, $\lbrack - 1;\ 2)$,    | 2p                      |
|                         | $\lbrack 2;\  + \infty)$                                                                |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $( - \infty;\  - 1)$: $|x + 1| = - x - 1$, $|x - 2| = 2 - x$;                           | 4p                      |
|                         | $- 2x + 1 = x + 3 \Rightarrow x = - \frac{2}{3}$; NU                                    |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\lbrack - 1;\ 2)$: $|x + 1| = x + 1$, $|x - 2| = 2 - x$;                               | 4p                      |
|                         | $3 = x + 3 \Rightarrow x = 0$; DA                                                       |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\lbrack 2;\  + \infty)$: $|x + 1| = x + 1$, $|x - 2| = x - 2$;                         | 4p                      |
|                         | $2x - 1 = x + 3 \Rightarrow x = 4$; DA                                                  |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $S = \left\{ 0;\ 4 \right\}$                                                            | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **II.3.a** (5p)         | $2 \leq \frac{2x - 1}{3} < 3$                                                           | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $6 \leq 2x - 1 < 9$, $7 \leq 2x < 10$, $\frac{7}{2} \leq x < 5$                         | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $S = \left\lbrack \frac{7}{2};\ 5 \right)$                                              | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **II.3.b** (5p)         | $a < 2$, deci $\frac{x + 1}{2} < 2$                                                     | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $x + 1 < 4 \Rightarrow x < 3$, $S = ( - \infty;\ 3)$                                    | 2p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
| **II.4** (15p)          | $x \in \lbrack 1;\ 2)$                                                                  | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $\lbrack 3x\rbrack = 3x - (x - 1) = 2x + 1 \in {\mathbb{Z}}$                            | 4p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $2x + 1 \in \lbrack 3;\ 5)$, numerele întregi posibile: $3$ și $4$                      | 3p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $x = 1$ și $x = \frac{3}{2}$; verificare: $\left\{ 3 \right\} = 0 = 1 - 1$,             | 4p                      |
|                         | $\left\{ \frac{9}{2} \right\} = \frac{1}{2} = \frac{3}{2} - 1$                          |                         |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+
|                         | $S = \left\{ 1;\ \frac{3}{2} \right\}$                                                  | 1p                      |
+-------------------------+-----------------------------------------------------------------------------------------+-------------------------+

**Observații.** II.2: în fiecare interval, 2p pentru scrierea corectă a
modulelor și 2p pentru rezolvarea ecuației cu verificarea apartenenței.
II.4: se punctează integral și rezolvarea pe cazuri
($\lbrack 3x\rbrack \in \left\{ 3;\ 4;\ 5 \right\}$, cu eliminarea lui
$x = 2$, care nu aparține intervalului).
```

- [ ] **Step 6: Edit `.claude/skills/evaluate-test/SKILL.md`**

Find this block:

```markdown
Read both. A Markdown file shows math as TeX between `$` signs, and links its pictures: open every picture that an exercise needs. Make the list of the exercises that get points, in barem order.

```

Replace it with:

```markdown
Read both. A Markdown file shows math as TeX between `$` signs, and links its pictures: open every picture that an exercise needs. Make the list of the exercises that get points, in barem order.

When `ces.md` is in the folder, the test and the barem are the CES variant's: an adapted test for the students with special educational needs. `class/exercises.json` is then the exercise list of the class test. For each item of the CES test that is the same item as one of the class test (the same subject, number and letter), copy that item's `id` and `label` from `class/exercises.json`, so the teacher sees both in the same column. Give a new `id` only to an item that the class test does not have. The points, the answers and the scoring notes are always the CES barem's, even when they differ from the class list.

```

- [ ] **Step 7: Edit `.claude/skills/evaluate-test/SKILL.md`**

Find this block:

```markdown

## Mode `class-report`
```

Replace it with:

```markdown

When `ces.md` is in the folder, the student has special educational needs and wrote the CES variant of the test: the test, the barem and `exercises.json` are the CES variant's. Grade by its barem, which often has blanks to fill in and guided steps. A blank filled in correctly earns the points of its step, with no other justification. Do not take points off for spelling, for hard-to-read writing, or for digits or signs swapped while copying, when the next calculations show that the student worked with the correct value. When you cannot read an answer at all, set `needsReview` to true and say so in `reviewReason`: the teacher reads it. Never write "CES", "adaptat", "variantă", or any word about special needs in a text the student sees (`comment`, `summary`, `strengths`, `recommendations`): the student's result looks like everyone else's.

## Mode `class-report`
```

- [ ] **Step 8: Edit `.claude/skills/evaluate-test/SKILL.md`**

Find this block:

```markdown
  - `maxTotal` and `officePoints`;
  - `students`: one entry for each graded student, named "Elev 1", "Elev 2", …, with `total`, `grade`, and `items`. Each item has the `exerciseId`, the final `points`, the `studentAnswer`, and the `comment` that the student got.

There are no pages and no test files in this mode. Read `class-results.json` and write the analysis for the teacher. Base every statement on the data: do not invent a mistake that no student made. Name an exercise by its `label` or its `topic`, and say how many students (or about what share of them) it concerns. Do not name or describe a single student, and do not write "Elev 3": write "mai mulți elevi" or "doi elevi".

```

Replace it with:

```markdown
  - `maxTotal` and `officePoints`;
  - `students`: one entry for each graded student, named "Elev 1", "Elev 2", …, with `total`, `grade`, `variant`, and `items`. Each item has the `exerciseId`, the final `points`, the `studentAnswer`, and the `comment` that the student got.
  - `variant`: "class" for a paper of the class test, "ces" for a paper of the CES variant (an adapted test for the students with special educational needs, graded out of the same total);
  - `cesExercises`: the exercise list of the CES variant, when a CES paper is graded; `null` otherwise. The items of a CES paper name these exercises.

There are no pages and no test files in this mode. Read `class-results.json` and write the analysis for the teacher. Base every statement on the data: do not invent a mistake that no student made. Name an exercise by its `label` or its `topic`, and say how many students (or about what share of them) it concerns. Do not name or describe a single student, and do not write "Elev 3": write "mai mulți elevi" or "doi elevi".

The CES papers belong to the class: count them in the grades and in the topics, by the exercise they answered (an exercise of `cesExercises` with the same `id` is the same exercise as in the class list). A CES exercise was guided, so a point lost there weighs more than the same point lost on the class test. Speak of the CES papers apart only when there are at least two of them, and never so that one student can be told apart.

```

- [ ] **Step 9: Edit `.claude/skills/evaluate-test/SKILL.md`**

Find this block:

```markdown
Read `references/barem-writing.md` and `references/barem-example.md` first. The example is a real test and barem from the teacher: copy its style.

```

Replace it with:

```markdown
Read `references/barem-writing.md` and `references/barem-example.md` first. The example is a real test and barem from the teacher: copy its style.

When `ces.md` is in the folder, the test is the CES variant: an adapted test for the students with special educational needs. Then also read `references/barem-example-ces.md`, a real CES test and the part of its barem that grading needs, and follow the section "Barem pentru varianta CES" of `references/barem-writing.md`. Two more files may be here: `class/barem.pdf` (or `class/barem.md` with its pictures in `class/media/`), the barem of the class test, and `class/exercises.json`, its exercise list. Use them to keep the class test's subjects, numbering and points.

```

- [ ] **Step 10: Edit `.claude/skills/evaluate-test/references/barem-writing.md`**

Find this block:

```markdown

## Check before you answer
```

Replace it with:

```markdown

## Barem pentru varianta CES

When `ces.md` is in the folder, the test is the CES variant of a class test: an adapted test for the students with special educational needs, with guided steps, blanks to fill in, and sometimes fewer exercises. `references/barem-example-ces.md` is a real one. Its barem is only for grading: the robot grades the CES papers with it.

- Write only what grading needs: the grading rules, and the steps with their points. Never write what was adapted and why, how to give the test, the competences assessed, or any word for the teacher only, and never a student's name.
- The total is always 90 + 10 "din oficiu" (100), like the class barem. When the CES test drops an exercise, its points go to the other exercises, as the CES test shows them.
- Keep the subjects, the numbering and the letters of the CES test. `class/barem.*` and `class/exercises.json`, when they are here, show the class test: an item with the same number is the same item, so keep its points when the CES test shows no others.
- The "Precizări" are the CES rules, in four short bullets (from the example's "Reguli de notare"):
  1. The 10 "din oficiu" points, and the grade is the total points divided by 10.
  2. Any correct solution gets the full points, even if it does not follow the steps of the test; a blank filled in correctly gets the points of its step, with no other written justification.
  3. No points are taken off for spelling, for hard-to-read writing, or for digits or signs swapped while copying, when the next calculations show that the student worked with the correct value.
  4. No fractions of a point; partial points are given by steps only, inside the points of the barem.
- Do not write the rule of the class barem that a correct result without its justifications gets at most half of the points: in a guided test, the blanks are the justifications.
- The steps follow the blanks of the test: one step is one blank, or a few blanks that make one result. Give the real values of each blank ("spațiile: $-3$ și $-2$").
- When an item needs a note (how the points of a table are shared, or another correct way to solve it), add it to the end of the step it concerns, as the example's "Observații" do, in one line.

## Check before you answer
```

- [ ] **Step 11: Edit `shared/runner.ts`**

Find this block:

```ts
// (spec §11.3). Students are "Elev 1" … "Elev n" in grading order: no names, and
// the points are the final ones, with the teacher's corrections.
export interface ClassResults {
```

Replace it with:

```ts
// (spec §11.3). Students are "Elev 1" … "Elev n" in grading order: no names, and
// the points are the final ones, with the teacher's corrections. A paper of
// the CES variant has `variant` "ces", and its items name the exercises of
// `cesExercises` (null while no CES paper is graded).
export interface ClassResults {
```

- [ ] **Step 12: Edit `shared/runner.ts`**

Find this block:

```ts
  officePoints: number;
  exercises: { id: string; label: string; maxPoints: number; topic: string; answer: string; scoringNotes: string }[];
  students: {
```

Replace it with:

```ts
  officePoints: number;
  exercises: ClassResultsExercise[];
  cesExercises: ClassResultsExercise[] | null;
  students: {
```

- [ ] **Step 13: Edit `shared/runner.ts`**

Find this block:

```ts
    grade: number;
    items: { exerciseId: string; points: number; studentAnswer: string; comment: string }[];
  }[];
}
```

Replace it with:

```ts
    grade: number;
    variant: TestVariant;
    items: { exerciseId: string; points: number; studentAnswer: string; comment: string }[];
  }[];
}

export interface ClassResultsExercise {
  id: string;
  label: string;
  maxPoints: number;
  topic: string;
  answer: string;
  scoringNotes: string;
}
```

- [ ] **Step 14: Edit `server/db/runner.ts`**

Find this block:

```ts
// The graded class for the analysis (spec §11.3). Null unless the test is in
// evaluation, like the rest of what the robot reads.
export async function findClassResults(db: D1Database, testId: number): Promise<ClassResults | null> {
```

Replace it with:

```ts
// The graded class for the analysis (spec §11.3). Null unless the test is in
// evaluation, like the rest of what the robot reads. The CES papers come with
// their variant, and their exercises in `cesExercises`, made the same way as
// the class columns from the CES list and the CES papers' items.
export async function findClassResults(db: D1Database, testId: number): Promise<ClassResults | null> {
```

- [ ] **Step 15: Edit `server/db/runner.ts`**

Find this block:

```ts
    exercise_list_json?: string | null;
    version?: string;
```

Replace it with:

```ts
    exercise_list_json?: string | null;
    ces_exercise_list_json?: string | null;
    variant?: string | null;
    version?: string;
```

- [ ] **Step 16: Edit `server/db/runner.ts`**

Find this block:

```ts
    db
      .prepare(`SELECT t.exercise_list_json, ${gradesVersionSql('t')} AS version FROM tests t WHERE t.id = ? AND t.status = 'evaluating'`)
      .bind(testId),
```

Replace it with:

```ts
    db
      .prepare(
        `SELECT t.exercise_list_json, t.ces_exercise_list_json, ${gradesVersionSql('t')} AS version FROM tests t WHERE t.id = ? AND t.status = 'evaluating'`,
      )
      .bind(testId),
```

- [ ] **Step 17: Edit `server/db/runner.ts`**

Find this block:

```ts
      .prepare(
        `SELECT s.id AS submission_id, ev.total, ev.grade, ev.id AS evaluation_id, ev.created_at AS graded_at,
           ev.max_total, ev.office_points, i.exercise_id, i.label, i.max_points, i.position, i.points,
```

Replace it with:

```ts
      .prepare(
        `SELECT s.id AS submission_id, s.variant, ev.total, ev.grade, ev.id AS evaluation_id, ev.created_at AS graded_at,
           ev.max_total, ev.office_points, i.exercise_id, i.label, i.max_points, i.position, i.points,
```

- [ ] **Step 18: Edit `server/db/runner.ts`**

Find this block:

```ts
  const list = head.exercise_list_json ? (JSON.parse(head.exercise_list_json) as ExerciseList) : null;
  const students: ClassResults['students'] = [];
  const stored: StoredItem[] = [];
  let latest: { gradedAt: string; evaluationId: number; maxTotal: number; officePoints: number } | null = null;
```

Replace it with:

```ts
  const list = head.exercise_list_json ? (JSON.parse(head.exercise_list_json) as ExerciseList) : null;
  const cesList = head.ces_exercise_list_json ? (JSON.parse(head.ces_exercise_list_json) as ExerciseList) : null;
  const students: ClassResults['students'] = [];
  const stored: StoredItem[] = [];
  const cesStored: StoredItem[] = [];
  let latest: { gradedAt: string; evaluationId: number; maxTotal: number; officePoints: number } | null = null;
```

- [ ] **Step 19: Edit `server/db/runner.ts`**

Find this block:

```ts
  for (const row of rows?.results ?? []) {
    stored.push({
      evaluationId: row.evaluation_id!,
```

Replace it with:

```ts
  for (const row of rows?.results ?? []) {
    const ces = row.variant === 'ces';
    (ces ? cesStored : stored).push({
      evaluationId: row.evaluation_id!,
```

- [ ] **Step 20: Edit `server/db/runner.ts`**

Find this block:

```ts
      current = row.submission_id!;
      students.push({ label: `Elev ${students.length + 1}`, total: row.total!, grade: row.grade!, items: [] });
    }
```

Replace it with:

```ts
      current = row.submission_id!;
      students.push({ label: `Elev ${students.length + 1}`, total: row.total!, grade: row.grade!, variant: ces ? 'ces' : 'class', items: [] });
    }
```

- [ ] **Step 21: Edit `server/db/runner.ts`**

Find this block:

```ts
    exercises: exerciseColumns(list, stored),
    students,
```

Replace it with:

```ts
    exercises: exerciseColumns(list, stored),
    cesExercises: cesStored.length > 0 ? exerciseColumns(cesList, cesStored) : null,
    students,
```

- [ ] **Step 22: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type error; `Test Files  135 passed | 1 skipped (136)`, `Tests  2124 passed | 3 skipped (2127)`.

- [ ] **Step 23: Commit**

```bash
git add .claude/skills/evaluate-test/SKILL.md .claude/skills/evaluate-test/references/barem-writing.md .claude/skills/evaluate-test/references/barem-example-ces.md shared/runner.ts server/db/runner.ts runner/skill.test.ts runner/workdir.test.ts server/routes/runnerCesGrading.test.ts
git commit -m "Teach the grading skill the CES variant"
```

### Task 6: Show the CES variant on the test page

"Varianta CES" in Pregătire (shown while a CES student is in the class or the variant has a file: the CES files with their own buttons, the CES barem's generation and check, its comments, the total warning, "Șterge varianta CES"); the CES print PDF in Tipărire; the waiting CES papers and the CES list's problems in Corectare; the CES mark in the papers table and the links table (`UploadRow.ces`, `UploadRow.variant`).

**Files:**
- Create: `src/admin/testPage/variant.ts`, `src/admin/testPage/CesVariant.tsx`
- Modify: `shared/api.ts`, `server/db/tests.ts`, `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/admin/testPage/StartRobotButton.tsx`, `src/admin/testPage/TestFiles.tsx`, `src/admin/testPage/GeneratedBarem.tsx`, `src/admin/testPage/PrintTest.tsx`, `src/admin/testPage/ExerciseListBanner.tsx`, `src/admin/testPage/StagePanel.tsx`, `src/admin/testPage/UploadsTable.tsx`, `src/admin/testPage/ResultLinksTable.tsx`, `src/ui/brand.css`
- Test: `src/admin/pages/TestPageCes.test.tsx`, `server/routes/cesVariant.test.ts`, `server/routes/tests.test.ts`, `src/admin/pages/TestPage.test.tsx`, `src/admin/testPage/GeneratedBarem.test.tsx`, `src/admin/testPage/PrintTest.test.tsx` (the class calls now name the variant `'class'`)

**Interfaces:**
- Consumes: Task 1's `CesTag`; Task 2's `CesVariantInfo`, `CesRemovedAnswer`, `noCesVariant`, `TestVariant`.
- Produces: `UploadRow.ces: boolean`, `UploadRow.variant: TestVariant | null`; `VariantParts`, `partsOf(test, variant)`, `showsCes(test)`, `cesBaremActive(test)` (`src/admin/testPage/variant.ts`); `CesVariant`, `CesWaiting`; the optional `variant` prop of `TestFiles`, `useGeneratedBarem`, `PrintTest`, `ExerciseListBanner`; `AdminApi`'s optional last `variant` on `uploadTestFile`, `saveBaremNotes`, `generateBarem`, `confirmBarem`, `retryPrint`, `acceptExerciseList`, `retryExerciseList`, and `removeCesVariant(code)`; `testFileUrl(code, kind, variant?)`, `printFileUrl(code, variant?)`.

- [ ] **Step 1: Create `src/admin/pages/TestPageCes.test.tsx`**

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../../shared/files.ts';
import { createFakeApi, FAKE_TOKEN, fakeTest, fakeUpload, noCesVariant } from '../../test/fakeApi.ts';
import { renderAdmin } from '../../test/renderAdmin.tsx';

// The CES variant on the test page (spec: CES variant): its block in
// Pregătire, its print PDF in Tipărire, the CES papers that wait in Corectare,
// and the CES mark in the tables.

const FILES = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };
const uploads = [
  fakeUpload({ studentId: 10, studentName: 'Bursașiu Teodor', submissionId: 5, status: 'submitted', fileCount: 2, ces: true }),
  fakeUpload({ studentId: 11, studentName: 'Ene Ana', submissionId: 6, status: 'submitted', fileCount: 2 }),
];

function apiWith(overrides: Parameters<typeof fakeTest>[0] = {}) {
  return createFakeApi({
    classes: [{ id: 1, name: '9R2', schoolYear: 2026, archived: false, studentCount: 2 }],
    students: {},
    tests: [fakeTest({ code: '9R2-26T1', files: FILES, uploadToken: FAKE_TOKEN, ...overrides }, uploads)],
  });
}

const PAGE = '/teste/9R2-26T1';
const block = async () => within(await screen.findByRole('region', { name: 'Varianta CES' }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Varianta CES in Pregătire', () => {
  it('is not offered while the class has no CES student', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith());
    expect(await screen.findByLabelText('Înlocuiește testul')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Varianta CES' })).not.toBeInTheDocument();
  });

  it('uploads the CES test and barem apart from the class files', async () => {
    const api = apiWith({ ces: noCesVariant({ studentCount: 1 }) });
    renderAdmin(`${PAGE}#pregatire`, api);
    const ces = await block();
    expect(ces.getByText(/1 elev cu CES primește acest test, corectat cu baremul lui\./)).toBeInTheDocument();
    const file = new File(['%PDF-1.7'], 'Test adaptat.pdf', { type: PDF_TYPE });
    await userEvent.upload(ces.getByLabelText('Încarcă testul CES'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('9R2-26T1', 'test', file, 'ces');
    expect(await ces.findByRole('link', { name: 'Test adaptat.pdf' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/ces/files/test');
    // The class test is still the class test.
    expect(screen.getByRole('link', { name: 'test.pdf' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/files/test');
    const barem = new File(['%PDF-1.7'], 'Barem adaptat.pdf', { type: PDF_TYPE });
    await userEvent.upload(ces.getByLabelText('Încarcă baremul CES'), barem);
    expect(api.uploadTestFile).toHaveBeenLastCalledWith('9R2-26T1', 'barem', barem, 'ces');
  });

  it('generates the CES barem during the evaluation and checks it', async () => {
    const api = apiWith({ status: 'evaluating', ces: noCesVariant({ studentCount: 1, files: { test: FILES.test, barem: null }, waiting: 1 }) });
    renderAdmin(`${PAGE}#pregatire`, api);
    const ces = await block();
    await userEvent.click(ces.getByRole('button', { name: 'Generează baremul CES' }));
    expect(api.generateBarem).toHaveBeenCalledWith('9R2-26T1', 'ces');
    expect(await ces.findByText('Se generează baremul CES… Durează câteva minute.')).toBeInTheDocument();
  });

  it('checks a generated CES barem with its own files version', async () => {
    const api = apiWith({
      status: 'evaluating',
      ces: noCesVariant({ studentCount: 1, files: FILES, filesVersion: 4, barem: { request: 'none', unchecked: true } }),
    });
    renderAdmin(`${PAGE}#pregatire`, api);
    const ces = await block();
    expect(ces.getByText('Barem CES generat automat, doar pentru notare. Verifică-l și corectează-l în Word dacă e nevoie.')).toBeInTheDocument();
    await userEvent.click(ces.getByRole('button', { name: 'Am verificat baremul CES' }));
    expect(api.confirmBarem).toHaveBeenCalledWith('9R2-26T1', 4, 'ces');
    expect(await screen.findByText('Robotul pornește în aproximativ un minut.')).toBeInTheDocument();
  });

  it('saves the CES barem comments apart', async () => {
    const api = apiWith({ ces: noCesVariant({ studentCount: 1, files: FILES }) });
    renderAdmin(`${PAGE}#pregatire`, api);
    const ces = await block();
    await userEvent.click(ces.getByRole('button', { name: 'Adaugă comentarii' }));
    await userEvent.type(ces.getByLabelText('Comentarii la baremul CES'), 'Fără depunctări pentru scris.');
    await userEvent.click(ces.getByRole('button', { name: 'Salvează comentariile' }));
    expect(api.saveBaremNotes).toHaveBeenCalledWith('9R2-26T1', 'Fără depunctări pentru scris.', 'ces');
  });

  it('warns when the CES barem does not total as much as the class barem', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ ces: noCesVariant({ studentCount: 1, files: FILES, totalPoints: 90, classTotalPoints: 100 }) }));
    expect((await block()).getByText('Baremul CES are 90 puncte, iar baremul clasei 100. Baremul CES ar trebui să aibă tot atâtea puncte.')).toBeInTheDocument();
  });

  it('removes the variant after asking, and keeps it once a CES paper was graded', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = apiWith({ ces: noCesVariant({ studentCount: 1, files: FILES }) });
    renderAdmin(`${PAGE}#pregatire`, api);
    await userEvent.click((await block()).getByRole('button', { name: 'Șterge varianta CES' }));
    expect(window.confirm).toHaveBeenCalledWith('Ștergi varianta CES? Elevii cu CES primesc atunci testul clasei.');
    expect(api.removeCesVariant).toHaveBeenCalledWith('9R2-26T1');
    await waitFor(async () => expect((await block()).queryByRole('link', { name: 'test.pdf' })).not.toBeInTheDocument());
  });

  it('says why a variant with graded CES papers cannot be removed', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ status: 'done', ces: noCesVariant({ studentCount: 1, files: FILES, papers: 1 }) }));
    const ces = await block();
    expect(ces.getByText('Varianta CES are lucrări corectate, așa că nu mai poate fi ștearsă. Poți înlocui fișierele ei.')).toBeInTheDocument();
    expect(ces.queryByRole('button', { name: 'Șterge varianta CES' })).not.toBeInTheDocument();
  });

  it('stays while it has files, even with no CES student left', async () => {
    renderAdmin(`${PAGE}#pregatire`, apiWith({ ces: noCesVariant({ files: { test: FILES.test, barem: null } }) }));
    expect((await block()).getByText(/Nu mai e niciun elev cu CES în clasă\./)).toBeInTheDocument();
  });
});

describe('the CES print PDF in Tipărire', () => {
  it('downloads the CES test with the same QR code', async () => {
    renderAdmin(`${PAGE}#tiparire`, apiWith({ print: { status: 'ready', fromWord: false }, ces: noCesVariant({ studentCount: 1, files: FILES, print: { status: 'ready', fromWord: false } }) }));
    expect(await screen.findByRole('link', { name: 'Descarcă testul CES cu cod QR' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/ces/print');
    expect(screen.getByRole('link', { name: 'Descarcă testul cu cod QR' })).toHaveAttribute('href', '/api/admin/tests/9R2-26T1/print');
    expect(screen.getByText('Același cod QR ca pe testul clasei: elevii cu CES încarcă pe același link.')).toBeInTheDocument();
  });

  it('tries a failed CES print PDF again', async () => {
    const api = apiWith({ print: { status: 'ready', fromWord: false }, ces: noCesVariant({ studentCount: 1, files: FILES, print: { status: 'failed', fromWord: false } }) });
    renderAdmin(`${PAGE}#tiparire`, api);
    expect(await screen.findByText('Nu am putut pregăti testul CES cu cod QR.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryPrint).toHaveBeenCalledWith('9R2-26T1', 'ces');
  });
});

describe('the CES papers in Corectare', () => {
  it('says that the CES papers wait for the CES barem, and leads to Pregătire', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'evaluating', ces: noCesVariant({ studentCount: 1, files: { test: FILES.test, barem: null }, waiting: 1 }) }));
    const notice = (await screen.findByText(/1 lucrare CES așteaptă baremul CES\./)).closest('.warning') as HTMLElement;
    expect(notice).toHaveTextContent('Încarcă sau generează baremul CES la Pregătire. Celelalte lucrări se corectează între timp.');
    await userEvent.click(within(notice).getByRole('link', { name: 'Mergi la varianta CES' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Pregătire' })).toBeInTheDocument();
  });

  it('shows no waiting notice once the CES barem is active', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'evaluating', ces: noCesVariant({ studentCount: 1, files: FILES, waiting: 1 }) }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Corectare' })).toBeInTheDocument();
    expect(screen.queryByText(/așteaptă baremul CES/)).not.toBeInTheDocument();
  });

  it('accepts a CES list with a problem, apart from the class list', async () => {
    const api = apiWith({ status: 'evaluating', ces: noCesVariant({ studentCount: 1, files: FILES, exerciseList: { status: 'problem', message: 'Punctele fac 95.' } }) });
    renderAdmin(`${PAGE}#corectare`, api);
    const banner = (await screen.findByText('Baremul CES are o problemă.')).closest('.warning') as HTMLElement;
    expect(banner).toHaveTextContent('Punctele fac 95.');
    await userEvent.click(within(banner).getByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('9R2-26T1', 'ces');
  });

  it('marks the CES student in the papers table', async () => {
    renderAdmin(`${PAGE}#corectare`, apiWith({ status: 'evaluating', ces: noCesVariant({ studentCount: 1, files: FILES }) }));
    const row = (await screen.findByRole('rowheader', { name: /Bursașiu Teodor/ })).closest('tr')!;
    expect(within(row).getByText('CES')).toHaveAttribute('title', 'Cerințe educaționale speciale');
    expect(within(screen.getByRole('rowheader', { name: /Ene Ana/ })).queryByText('CES')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Edit `server/routes/cesVariant.test.ts`**

Find this block:

```ts
    expect(await info()).toMatchObject({ waiting: 0, papers: 0 });
  });
```

Replace it with:

```ts
    expect(await info()).toMatchObject({ waiting: 0, papers: 0 });
  });

  it('marks the CES students in the uploads table, with the variant their paper went to grading with', async () => {
    await markCes(api, students[0]!);
    const id = await addSubmission(api, code, students[0]!, { status: 'graded', files: 1 });
    await api.db.prepare("UPDATE submissions SET variant = 'ces' WHERE id = ?").bind(id).run();
    const rows = (await api.request('GET', `/api/admin/tests/${code}`)).body.uploads as { studentName: string; ces: boolean; variant: string | null }[];
    expect(rows.map((r) => [r.studentName, r.ces, r.variant])).toEqual([
      ['Bursașiu Teodor', true, 'ces'],
      ['Ene Ana', false, null],
    ]);
  });
```

- [ ] **Step 3: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
        effort: null,
        lastError: null,
      },
      {
```

Replace it with:

```ts
        effort: null,
        lastError: null,
        ces: false,
        variant: null,
      },
      {
```

- [ ] **Step 4: Edit `server/routes/tests.test.ts`**

Find this block:

```ts
        lastError: null,
      },
```

Replace it with:

```ts
        lastError: null,
        ces: false,
        variant: null,
      },
```

- [ ] **Step 5: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(await screen.findByRole('button', { name: 'Pregătește testul cu cod QR' }));
    expect(api.retryPrint).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(await screen.findByRole('button', { name: 'Pregătește testul cu cod QR' }));
    expect(api.retryPrint).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
```

- [ ] **Step 6: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.upload(await screen.findByLabelText('Încarcă testul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', file);
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
```

Replace it with:

```tsx
    await userEvent.upload(await screen.findByLabelText('Încarcă testul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'test', file, 'class');
    expect(await screen.findByRole('link', { name: 'Test.pdf' })).toHaveAttribute('href', '/api/admin/tests/6E2-26T1/files/test');
```

- [ ] **Step 7: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Salvează comentariile' }));
    expect(api.saveBaremNotes).toHaveBeenCalledWith('6E2-26T1', 'Acceptă și metoda cu proporții.');
    expect(await screen.findByText(/Acceptă și metoda cu proporții/)).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Salvează comentariile' }));
    expect(api.saveBaremNotes).toHaveBeenCalledWith('6E2-26T1', 'Acceptă și metoda cu proporții.', 'class');
    expect(await screen.findByText(/Acceptă și metoda cu proporții/)).toBeInTheDocument();
```

- [ ] **Step 8: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
```

Replace it with:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
```

- [ ] **Step 9: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', file);
  });
```

Replace it with:

```tsx
    expect(api.uploadTestFile).toHaveBeenCalledTimes(1);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', file, 'class');
  });
```

- [ ] **Step 10: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', file);
    expect(await screen.findByText('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.')).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.upload(await screen.findByLabelText('Înlocuiește baremul'), file);
    expect(api.uploadTestFile).toHaveBeenCalledWith('6E2-26T1', 'barem', file, 'class');
    expect(await screen.findByText('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.')).toBeInTheDocument();
```

- [ ] **Step 11: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(await screen.findByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1');
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
```

Replace it with:

```tsx
    await userEvent.click(await screen.findByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith('6E2-26T1', 'class');
    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
```

- [ ] **Step 12: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryExerciseList).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
```

Replace it with:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryExerciseList).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(await screen.findByRole('status')).toHaveTextContent('Nu am putut porni robotul. Corectarea așteaptă până îl pornește cel care se ocupă de site.');
```

- [ ] **Step 13: Edit `src/admin/pages/TestPage.test.tsx`**

Find this block:

```tsx
    await userEvent.click(await screen.findByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryExerciseList).toHaveBeenCalledWith('6E2-26T1');
    await waitFor(() => expect(screen.queryByText(failed)).not.toBeInTheDocument());
```

Replace it with:

```tsx
    await userEvent.click(await screen.findByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryExerciseList).toHaveBeenCalledWith('6E2-26T1', 'class');
    await waitFor(() => expect(screen.queryByText(failed)).not.toBeInTheDocument());
```

- [ ] **Step 14: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1');
    expect(confirm).not.toHaveBeenCalled();
```

Replace it with:

```tsx
    await userEvent.click(await screen.findByRole('button', { name: 'Generează baremul' }));
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(confirm).not.toHaveBeenCalled();
```

- [ ] **Step 15: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
    expect(confirm).toHaveBeenLastCalledWith(REPLACE);
    expect(api.generateBarem).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1');
  });

  it('says that a scheduled evaluation is cancelled, with or without a barem', async () => {
```

Replace it with:

```tsx
    expect(confirm).toHaveBeenLastCalledWith(REPLACE);
    expect(api.generateBarem).not.toHaveBeenCalled();
    await userEvent.click(button);
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1', 'class');
  });

  it('says that a scheduled evaluation is cancelled, with or without a barem', async () => {
```

- [ ] **Step 16: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Se generează baremul… Durează câteva minute.')).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(await screen.findByText('Se generează baremul… Durează câteva minute.')).toBeInTheDocument();
```

- [ ] **Step 17: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
    await userEvent.click(button);
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1');
  });
```

Replace it with:

```tsx
    await userEvent.click(button);
    expect(api.generateBarem).toHaveBeenCalledWith('6E2-26T1', 'class');
  });
```

- [ ] **Step 18: Edit `src/admin/testPage/GeneratedBarem.test.tsx`**

Find this block:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat baremul' }));
    expect(api.confirmBarem).toHaveBeenCalledWith('6E2-26T1', 7);
    expect(await screen.findByRole('button', { name: 'Generează baremul' })).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Am verificat baremul' }));
    expect(api.confirmBarem).toHaveBeenCalledWith('6E2-26T1', 7, 'class');
    expect(await screen.findByRole('button', { name: 'Generează baremul' })).toBeInTheDocument();
```

- [ ] **Step 19: Edit `src/admin/testPage/PrintTest.test.tsx`**

Find this block:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryPrint).toHaveBeenCalledWith('6E2-26T1');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
```

Replace it with:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(api.retryPrint).toHaveBeenCalledWith('6E2-26T1', 'class');
    expect(await screen.findByText('Se pregătește testul cu cod QR…')).toBeInTheDocument();
```

- [ ] **Step 20: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  BaremNotesAnswer,
  CesVariantInfo,
```

Replace it with:

```ts
  BaremNotesAnswer,
  CesRemovedAnswer,
  CesVariantInfo,
```

- [ ] **Step 21: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
import { normalizeClassName } from '../../shared/classes.ts';
import { DOCX_TYPE, uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
import type { CheckoutInput, PaymentRow } from '../../shared/payments.ts';
```

Replace it with:

```ts
import { normalizeClassName } from '../../shared/classes.ts';
import { DOCX_TYPE, uploadTypeOf, type TestFileKind, type TestVariant } from '../../shared/files.ts';
import type { CheckoutInput, PaymentRow } from '../../shared/payments.ts';
```

- [ ] **Step 22: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    lastError: null,
    ...overrides,
```

Replace it with:

```ts
    lastError: null,
    ces: false,
    variant: null,
    ...overrides,
```

- [ ] **Step 23: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    // evaluation the robot makes it again.
    uploadTestFile: vi.fn(async (code: string, kind: TestFileKind, file: File): Promise<TestFileAnswer> => {
      const found = findTest(code).test;
      const info = { name: file.name, type: uploadTypeOf(file) };
      found.files[kind] = info;
```

Replace it with:

```ts
    // evaluation the robot makes it again.
    uploadTestFile: vi.fn(async (code: string, kind: TestFileKind, file: File, variant: TestVariant = 'class'): Promise<TestFileAnswer> => {
      const found = findTest(code).test;
      const info = { name: file.name, type: uploadTypeOf(file) };
      if (variant === 'ces') {
        // Like the server: the CES variant's own files, print PDF and list.
        found.ces.files[kind] = info;
        found.ces.filesVersion += 1;
        if (kind === 'test') found.ces.print = { status: 'none', fromWord: info.type === DOCX_TYPE };
        else found.ces = { ...found.ces, exerciseList: { status: 'none', message: null }, barem: { request: 'none', unchecked: false } };
        return { file: info, robot: kind === 'barem' && found.status === 'evaluating' ? 'next_check' : null };
      }
      found.files[kind] = info;
```

- [ ] **Step 24: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    // evaluation the robot makes it again.
    saveBaremNotes: vi.fn(async (code: string, notes: string): Promise<BaremNotesAnswer> => {
      const found = findTest(code).test;
      found.baremNotes = notes.trim();
      found.exerciseList = { status: 'none', message: null };
      return { baremNotes: found.baremNotes, robot: found.status === 'evaluating' ? 'next_check' : null };
    }),
    // Like the server: only a draft or open test with a test file asks the robot.
    generateBarem: vi.fn(async (code: string): Promise<BaremGenerateAnswer> => {
      const found = findTest(code).test;
      if (!found.files.test) throw new ApiError(409, 'no_test_file', 'Încarcă întâi testul.');
      found.barem = { ...found.barem, request: 'requested' };
      return { barem: found.barem, robot: 'dispatched' };
    }),
    // Like the server: a stale files version is refused.
    confirmBarem: vi.fn(async (code: string, filesVersion: number): Promise<BaremCheckedAnswer> => {
      const found = findTest(code).test;
      if (found.filesVersion !== filesVersion) throw new ApiError(409, 'stale', 'Baremul s-a schimbat. Reîncarcă pagina.');
      found.barem = { ...found.barem, unchecked: false };
      return { barem: found.barem };
    }),
```

Replace it with:

```ts
    // evaluation the robot makes it again.
    saveBaremNotes: vi.fn(async (code: string, notes: string, variant: TestVariant = 'class'): Promise<BaremNotesAnswer> => {
      const found = findTest(code).test;
      const parts = variant === 'ces' ? found.ces : found;
      parts.baremNotes = notes.trim();
      parts.exerciseList = { status: 'none', message: null };
      return { baremNotes: parts.baremNotes, robot: found.status === 'evaluating' ? 'next_check' : null };
    }),
    // Like the server: only a draft or open test with a test file asks the robot.
    generateBarem: vi.fn(async (code: string, variant: TestVariant = 'class'): Promise<BaremGenerateAnswer> => {
      const found = findTest(code).test;
      const parts = variant === 'ces' ? found.ces : found;
      if (!parts.files.test) throw new ApiError(409, 'no_test_file', 'Încarcă întâi testul.');
      parts.barem = { ...parts.barem, request: 'requested' };
      return { barem: parts.barem, robot: 'dispatched' };
    }),
    // Like the server: a stale files version is refused; a checked CES barem
    // sends the CES papers that waited to the robot.
    confirmBarem: vi.fn(async (code: string, filesVersion: number, variant: TestVariant = 'class'): Promise<BaremCheckedAnswer> => {
      const found = findTest(code).test;
      const parts = variant === 'ces' ? found.ces : found;
      if (parts.filesVersion !== filesVersion) throw new ApiError(409, 'stale', 'Baremul s-a schimbat. Reîncarcă pagina.');
      parts.barem = { ...parts.barem, unchecked: false };
      if (variant === 'ces') return { barem: parts.barem, robot: found.status === 'evaluating' ? 'dispatched' : null };
      return { barem: parts.barem };
    }),
    // Like the server: only while no paper went to grading with the CES variant.
    removeCesVariant: vi.fn(async (code: string): Promise<CesRemovedAnswer> => {
      const found = findTest(code).test;
      if (found.ces.papers > 0) throw new ApiError(409, 'ces_papers', 'Varianta CES are lucrări corectate, așa că nu mai poate fi ștearsă.');
      found.ces = noCesVariant({ studentCount: found.ces.studentCount, filesVersion: found.ces.filesVersion + 1 });
      return { ces: found.ces };
    }),
```

- [ ] **Step 25: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    // draft without a link gets one and its print PDF.
    retryPrint: vi.fn(async (code: string): Promise<PrintRetryAnswer> => {
      const found = findTest(code).test;
      const beforeEvaluation = found.status === 'draft' || found.status === 'open';
```

Replace it with:

```ts
    // draft without a link gets one and its print PDF.
    retryPrint: vi.fn(async (code: string, variant: TestVariant = 'class'): Promise<PrintRetryAnswer> => {
      const found = findTest(code).test;
      if (variant === 'ces') {
        if (found.ces.print.status !== 'failed') throw new ApiError(409, 'not_failed', 'Testul CES cu cod QR nu poate fi încercat din nou.');
        found.ces.print = { status: 'none', fromWord: found.ces.print.fromWord };
        return { print: found.ces.print, robot: 'dispatched' };
      }
      const beforeEvaluation = found.status === 'draft' || found.status === 'open';
```

- [ ] **Step 26: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    acceptExerciseList: vi.fn(async (code: string): Promise<RobotStart | null> => {
      const found = findTest(code).test;
      found.exerciseList.status = 'accepted';
      return found.status === 'evaluating' ? 'next_check' : null;
    }),
    retryExerciseList: vi.fn(async (code: string): Promise<RobotStart | null> => {
      const found = findTest(code).test;
      found.exerciseList = { status: 'none', message: null };
      return found.status === 'evaluating' ? 'next_check' : null;
```

Replace it with:

```ts
    }),
    acceptExerciseList: vi.fn(async (code: string, variant: TestVariant = 'class'): Promise<RobotStart | null> => {
      const found = findTest(code).test;
      (variant === 'ces' ? found.ces : found).exerciseList.status = 'accepted';
      return found.status === 'evaluating' ? 'next_check' : null;
    }),
    retryExerciseList: vi.fn(async (code: string, variant: TestVariant = 'class'): Promise<RobotStart | null> => {
      const found = findTest(code).test;
      (variant === 'ces' ? found.ces : found).exerciseList = { status: 'none', message: null };
      return found.status === 'evaluating' ? 'next_check' : null;
```

- [ ] **Step 27: Run the new tests to see them fail**

Run: `npx vitest run src/admin/pages/TestPageCes.test.tsx server/routes/cesVariant.test.ts server/routes/tests.test.ts src/admin/pages/TestPage.test.tsx src/admin/testPage/GeneratedBarem.test.tsx src/admin/testPage/PrintTest.test.tsx`
Expected: FAIL. `Test Files  6 failed (6)`, `Tests  30 failed | 161 passed (191)`: the upload rows have no `ces` and `variant`, the class calls do not name the variant `'class'`, and the test page has no "Varianta CES" (its tests time out after 3 s each).

- [ ] **Step 28: Edit `shared/api.ts`**

Find this block:

```ts
import { normalizeClassName } from './classes.ts';
import type { TestFileKind } from './files.ts';
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
```

Replace it with:

```ts
import { normalizeClassName } from './classes.ts';
import type { TestFileKind, TestVariant } from './files.ts';
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
```

- [ ] **Step 29: Edit `shared/api.ts`**

Find this block:

```ts
  lastError: string | null;
}
```

Replace it with:

```ts
  lastError: string | null;
  // The student is marked CES (the page shows the mark), and the variant the
  // paper went to grading with (null until then).
  ces: boolean;
  variant: TestVariant | null;
}
```

- [ ] **Step 30: Edit `server/db/tests.ts`**

Find this block:

```ts
  active: number;
  submission_id: number | null;
```

Replace it with:

```ts
  active: number;
  ces: number;
  variant: TestVariant | null;
  submission_id: number | null;
```

- [ ] **Step 31: Edit `server/db/tests.ts`**

Find this block:

```ts
      .prepare(
        `SELECT st.id AS student_id, st.full_name, e.active,
           s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted, s.last_error, ev.grade, ev.total, ev.max_total, ev.created_at AS graded_at, ev.model, ev.effort,
```

Replace it with:

```ts
      .prepare(
        `SELECT st.id AS student_id, st.full_name, e.active, st.ces, s.variant,
           s.id AS submission_id, s.status, s.started_at, s.submitted_at, s.auto_submitted, s.last_error, ev.grade, ev.total, ev.max_total, ev.created_at AS graded_at, ev.model, ev.effort,
```

- [ ] **Step 32: Edit `server/db/tests.ts`**

Find this block:

```ts
      lastError: row.last_error,
    }))
```

Replace it with:

```ts
      lastError: row.last_error,
      ces: row.ces === 1,
      variant: row.variant,
    }))
```

- [ ] **Step 33: Create `src/admin/testPage/variant.ts`**

```ts
import type { TestInfo } from '../../../shared/api.ts';
import type { TestVariant } from '../../../shared/files.ts';

// What each variant of a test has of its own, as the test page shows it: the
// class test's parts are on the test, the CES variant's in `test.ces`.
export type VariantParts = Pick<TestInfo, 'files' | 'barem' | 'baremNotes' | 'filesVersion' | 'exerciseList' | 'print'>;

export function partsOf(test: TestInfo, variant: TestVariant): VariantParts {
  return variant === 'ces' ? test.ces : test;
}

// The test page shows "Varianta CES" when a student of the class is marked CES,
// or when the variant already has a file (so the teacher can see and remove it).
export function showsCes(test: TestInfo): boolean {
  return test.ces.studentCount > 0 || test.ces.files.test !== null || test.ces.files.barem !== null;
}

// The CES barem can be graded against: it exists, it is checked, and no new
// one is being generated.
export function cesBaremActive(test: TestInfo): boolean {
  const { files, barem } = test.ces;
  return files.barem !== null && !barem.unchecked && barem.request !== 'requested';
}
```

- [ ] **Step 34: Edit `src/admin/testPage/StartRobotButton.tsx`**

Find this block:

```tsx
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
```

Replace it with:

```tsx
import type { RobotStart, TestInfo, UploadRow } from '../../../shared/api.ts';
import { cesBaremActive } from './variant.ts';
import { useApi } from '../ApiContext.tsx';
```

- [ ] **Step 35: Edit `src/admin/testPage/StartRobotButton.tsx`**

Find this block:

```tsx
export function waitsForPrint(test: TestInfo): boolean {
  return (
    (test.status === 'draft' || test.status === 'open') && test.uploadToken !== null && test.files.test !== null && test.print.status === 'none'
  );
}
```

Replace it with:

```tsx
export function waitsForPrint(test: TestInfo): boolean {
  const open = (test.status === 'draft' || test.status === 'open') && test.uploadToken !== null;
  return open && ((test.files.test !== null && test.print.status === 'none') || (test.ces.files.test !== null && test.ces.print.status === 'none'));
}
```

- [ ] **Step 36: Edit `src/admin/testPage/StartRobotButton.tsx`**

Find this block:

```tsx
// The barem the teacher asked for waits for the robot: the test is a draft or
// open, has its test file, and the request is neither answered nor failed.
export function waitsForBarem(test: TestInfo): boolean {
  return (test.status === 'draft' || test.status === 'open') && test.files.test !== null && test.barem.request === 'requested';
}
```

Replace it with:

```tsx
// The barem the teacher asked for waits for the robot: the test is a draft or
// open, has its test file, and the request is neither answered nor failed. The
// CES barem may also wait during the evaluation.
export function waitsForBarem(test: TestInfo): boolean {
  const classBarem = (test.status === 'draft' || test.status === 'open') && test.files.test !== null && test.barem.request === 'requested';
  const cesBarem = test.status !== 'done' && test.ces.files.test !== null && test.ces.barem.request === 'requested';
  return classBarem || cesBarem;
}
```

- [ ] **Step 37: Edit `src/admin/testPage/StartRobotButton.tsx`**

Find this block:

```tsx
  if (test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed') return false;
  if (uploads.some((row) => row.status === 'submitted' || row.status === 'grading')) return true;
  return test.analysis.status === 'requested' && test.gradedCount > 0;
```

Replace it with:

```tsx
  if (test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed') return false;
  // The CES papers that wait for an active CES barem are no work for the robot.
  const held = cesBaremActive(test) ? 0 : test.ces.waiting;
  if (uploads.filter((row) => row.status === 'submitted' || row.status === 'grading').length > held) return true;
  return test.analysis.status === 'requested' && test.gradedCount > 0;
```

- [ ] **Step 38: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
import { MAX_BAREM_NOTES_LENGTH, type RobotStart, type TestInfo } from '../../../shared/api.ts';
import type { TestFileKind } from '../../../shared/files.ts';
import { testFileUrl } from '../api.ts';
```

Replace it with:

```tsx
import { MAX_BAREM_NOTES_LENGTH, type RobotStart, type TestInfo } from '../../../shared/api.ts';
import type { TestFileKind, TestVariant } from '../../../shared/files.ts';
import { testFileUrl } from '../api.ts';
```

- [ ] **Step 39: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
import { useGeneratedBarem } from './GeneratedBarem.tsx';

const NAMES: Record<TestFileKind, { title: string; upload: string; replace: string }> = {
  test: { title: 'Testul', upload: 'Încarcă testul', replace: 'Înlocuiește testul' },
  barem: { title: 'Baremul', upload: 'Încarcă baremul', replace: 'Înlocuiește baremul' },
};
```

Replace it with:

```tsx
import { useGeneratedBarem } from './GeneratedBarem.tsx';
import { partsOf } from './variant.ts';

const NAMES: Record<TestVariant, Record<TestFileKind, { title: string; upload: string; replace: string }>> = {
  class: {
    test: { title: 'Testul', upload: 'Încarcă testul', replace: 'Înlocuiește testul' },
    barem: { title: 'Baremul', upload: 'Încarcă baremul', replace: 'Înlocuiește baremul' },
  },
  ces: {
    test: { title: 'Testul CES', upload: 'Încarcă testul CES', replace: 'Înlocuiește testul CES' },
    barem: { title: 'Baremul CES', upload: 'Încarcă baremul CES', replace: 'Înlocuiește baremul CES' },
  },
};
```

- [ ] **Step 40: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
// teacher may fix them. A new barem during evaluation starts the robot, which
// makes the exercise list again.
export function TestFiles({
  test,
  onChanged,
```

Replace it with:

```tsx
// teacher may fix them. A new barem during evaluation starts the robot, which
// makes the exercise list again. With `variant` "ces": the CES variant's own
// test and barem, which may change during the evaluation (the API refuses
// only while the robot grades a CES paper), and whose barem can be generated
// until the test is done.
export function TestFiles({
  test,
  variant = 'class',
  onChanged,
```

- [ ] **Step 41: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  test: TestInfo;
  onChanged: () => Promise<void>;
```

Replace it with:

```tsx
  test: TestInfo;
  variant?: TestVariant;
  onChanged: () => Promise<void>;
```

- [ ] **Step 42: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
}) {
  const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
  const locked = test.status === 'evaluating' && !listBlocked;
  const generated = useGeneratedBarem({ test, onChanged, onRobot });
  // Before the uploads close: the barem can be generated.
  const beforeClose = test.status === 'draft' || test.status === 'open';
  return (
```

Replace it with:

```tsx
}) {
  const parts = partsOf(test, variant);
  const listBlocked = test.exerciseList.status === 'problem' || test.exerciseList.status === 'failed';
  const locked = variant === 'class' && test.status === 'evaluating' && !listBlocked;
  const generated = useGeneratedBarem({ test, variant, onChanged, onRobot });
  // Before the uploads close (and, for the CES barem, until the test is done): the barem can be generated.
  const canGenerate = test.status === 'draft' || test.status === 'open' || (variant === 'ces' && test.status === 'evaluating');
  return (
```

- [ ] **Step 43: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
      <ul className="file-list">
        <TestFileRow code={test.code} kind="test" file={test.files.test} locked={locked} onChanged={onChanged} onRobot={onRobot} />
        <TestFileRow
          code={test.code}
          kind="barem"
          file={test.files.barem}
          locked={locked}
```

Replace it with:

```tsx
      <ul className="file-list">
        <TestFileRow code={test.code} variant={variant} kind="test" file={parts.files.test} locked={locked} onChanged={onChanged} onRobot={onRobot} />
        <TestFileRow
          code={test.code}
          variant={variant}
          kind="barem"
          file={parts.files.barem}
          locked={locked}
```

- [ ] **Step 44: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
          onRobot={onRobot}
          baremNotes={test.baremNotes}
          actions={beforeClose ? generated.buttons : undefined}
          status={beforeClose ? generated.status : undefined}
        />
```

Replace it with:

```tsx
          onRobot={onRobot}
          baremNotes={parts.baremNotes}
          actions={canGenerate ? generated.buttons : undefined}
          status={canGenerate ? generated.status : undefined}
        />
```

- [ ] **Step 45: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  code,
  kind,
```

Replace it with:

```tsx
  code,
  variant,
  kind,
```

- [ ] **Step 46: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  code: string;
  kind: TestFileKind;
```

Replace it with:

```tsx
  code: string;
  variant: TestVariant;
  kind: TestFileKind;
```

- [ ] **Step 47: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  const upload = useMutation({
    mutationFn: (picked: File) => api.uploadTestFile(code, kind, picked),
    onSuccess: async (answer) => {
```

Replace it with:

```tsx
  const upload = useMutation({
    mutationFn: (picked: File) => api.uploadTestFile(code, kind, picked, variant),
    onSuccess: async (answer) => {
```

- [ ] **Step 48: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  });
  const names = NAMES[kind];

```

Replace it with:

```tsx
  });
  const names = NAMES[variant][kind];

```

- [ ] **Step 49: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
        {file ? (
          <a href={testFileUrl(code, kind)} target="_blank" rel="noopener">
            {file.name}
```

Replace it with:

```tsx
        {file ? (
          <a href={testFileUrl(code, kind, variant)} target="_blank" rel="noopener">
            {file.name}
```

- [ ] **Step 50: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
        key={round}
        id={`file-${kind}`}
        label={file ? names.replace : names.upload}
```

Replace it with:

```tsx
        key={round}
        id={variant === 'ces' ? `file-ces-${kind}` : `file-${kind}`}
        label={file ? names.replace : names.upload}
```

- [ ] **Step 51: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
          kind === 'barem' && file
            ? (picked) => window.confirm(`Înlocuiești baremul existent cu ${picked.name}?`)
            : undefined
```

Replace it with:

```tsx
          kind === 'barem' && file
            ? (picked) => window.confirm(`Înlocuiești ${variant === 'ces' ? 'baremul CES' : 'baremul'} existent cu ${picked.name}?`)
            : undefined
```

- [ ] **Step 52: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
      {kind === 'barem' && (
        <BaremNotesEditor code={code} notes={baremNotes ?? ''} locked={locked} onChanged={onChanged} onRobot={onRobot} />
      )}
```

Replace it with:

```tsx
      {kind === 'barem' && (
        <BaremNotesEditor code={code} variant={variant} notes={baremNotes ?? ''} locked={locked} onChanged={onChanged} onRobot={onRobot} />
      )}
```

- [ ] **Step 53: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  code,
  notes,
```

Replace it with:

```tsx
  code,
  variant,
  notes,
```

- [ ] **Step 54: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  code: string;
  notes: string;
```

Replace it with:

```tsx
  code: string;
  variant: TestVariant;
  notes: string;
```

- [ ] **Step 55: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
  const [text, setText] = useState(notes);
  const save = useMutation({
    mutationFn: () => api.saveBaremNotes(code, text),
    onSuccess: async (answer) => {
```

Replace it with:

```tsx
  const [text, setText] = useState(notes);
  const ces = variant === 'ces';
  const save = useMutation({
    mutationFn: () => api.saveBaremNotes(code, text, variant),
    onSuccess: async (answer) => {
```

- [ ] **Step 56: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
      <>
        {notes && <p className="hint">Comentarii la barem: {notes}</p>}
        <button
```

Replace it with:

```tsx
      <>
        {notes && (
          <p className="hint">
            {ces ? 'Comentarii la baremul CES' : 'Comentarii la barem'}: {notes}
          </p>
        )}
        <button
```

- [ ] **Step 57: Edit `src/admin/testPage/TestFiles.tsx`**

Find this block:

```tsx
    >
      <label htmlFor="barem-notes">Comentarii la barem</label>
      <textarea
        id="barem-notes"
        value={text}
```

Replace it with:

```tsx
    >
      <label htmlFor={ces ? 'ces-barem-notes' : 'barem-notes'}>{ces ? 'Comentarii la baremul CES' : 'Comentarii la barem'}</label>
      <textarea
        id={ces ? 'ces-barem-notes' : 'barem-notes'}
        value={text}
```

- [ ] **Step 58: Edit `src/admin/testPage/GeneratedBarem.tsx`**

Find this block:

```tsx
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';

```

Replace it with:

```tsx
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import type { TestVariant } from '../../../shared/files.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { partsOf } from './variant.ts';

```

- [ ] **Step 59: Edit `src/admin/testPage/GeneratedBarem.tsx`**

Find this block:

```tsx
// clearing a scheduled evaluation; the old barem stays until the new one arrives. The buttons go on the file button's line, the status
// lines and errors below the row.
export function useGeneratedBarem({
  test,
  onChanged,
```

Replace it with:

```tsx
// clearing a scheduled evaluation; the old barem stays until the new one arrives. The buttons go on the file button's line, the status
// lines and errors below the row. With `variant` "ces": the CES barem, written
// for grading only; it cancels no schedule, and once checked during the
// evaluation, the CES papers that waited for it go to the robot.
export function useGeneratedBarem({
  test,
  variant = 'class',
  onChanged,
```

- [ ] **Step 60: Edit `src/admin/testPage/GeneratedBarem.tsx`**

Find this block:

```tsx
  test: TestInfo;
  onChanged: () => Promise<void>;
```

Replace it with:

```tsx
  test: TestInfo;
  variant?: TestVariant;
  onChanged: () => Promise<void>;
```

- [ ] **Step 61: Edit `src/admin/testPage/GeneratedBarem.tsx`**

Find this block:

```tsx
  const api = useApi();
  const generate = useMutation({
    mutationFn: () => api.generateBarem(test.code),
    onSuccess: async (answer) => {
```

Replace it with:

```tsx
  const api = useApi();
  const parts = partsOf(test, variant);
  const ces = variant === 'ces';
  const generate = useMutation({
    mutationFn: () => api.generateBarem(test.code, variant),
    onSuccess: async (answer) => {
```

- [ ] **Step 62: Edit `src/admin/testPage/GeneratedBarem.tsx`**

Find this block:

```tsx
  const confirm = useMutation({
    mutationFn: () => api.confirmBarem(test.code, test.filesVersion),
    onSuccess: onChanged,
    // A stale version means the page is old: show the new state, keep the error.
```

Replace it with:

```tsx
  const confirm = useMutation({
    mutationFn: () => api.confirmBarem(test.code, parts.filesVersion, variant),
    onSuccess: async (answer) => {
      if (answer.robot !== undefined) onRobot(answer.robot);
      await onChanged();
    },
    // A stale version means the page is old: show the new state, keep the error.
```

- [ ] **Step 63: Edit `src/admin/testPage/GeneratedBarem.tsx`**

Find this block:

```tsx

  const { request, unchecked } = test.barem;
  const waiting = request === 'requested';
  const failed = request === 'failed';
  const hasTest = test.files.test !== null;

  const onGenerate = () => {
    const cancelled = test.evaluationAt ? ' Programarea evaluării se anulează.' : '';
    const question =
      test.files.barem !== null
        ? `Înlocuiești baremul existent cu unul generat? Baremul de acum rămâne până vine cel nou.${cancelled}`
        : cancelled
```

Replace it with:

```tsx

  const { request, unchecked } = parts.barem;
  const waiting = request === 'requested';
  const failed = request === 'failed';
  const hasTest = parts.files.test !== null;

  const onGenerate = () => {
    const cancelled = !ces && test.evaluationAt ? ' Programarea evaluării se anulează.' : '';
    const question =
      parts.files.barem !== null
        ? `Înlocuiești ${ces ? 'baremul CES' : 'baremul'} existent cu unul generat? Baremul de acum rămâne până vine cel nou.${cancelled}`
        : cancelled
```

- [ ] **Step 64: Edit `src/admin/testPage/GeneratedBarem.tsx`**

Find this block:

```tsx
      <button type="button" className="button-quiet button-small" disabled={!hasTest || waiting || generate.isPending} onClick={onGenerate}>
        {failed ? 'Încearcă din nou' : 'Generează baremul'}
      </button>
```

Replace it with:

```tsx
      <button type="button" className="button-quiet button-small" disabled={!hasTest || waiting || generate.isPending} onClick={onGenerate}>
        {failed ? 'Încearcă din nou' : ces ? 'Generează baremul CES' : 'Generează baremul'}
      </button>
```

- [ ] **Step 65: Edit `src/admin/testPage/GeneratedBarem.tsx`**

Find this block:

```tsx
        <button type="button" className="button button-small" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
          Am verificat baremul
        </button>
```

Replace it with:

```tsx
        <button type="button" className="button button-small" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
          {ces ? 'Am verificat baremul CES' : 'Am verificat baremul'}
        </button>
```

- [ ] **Step 66: Edit `src/admin/testPage/GeneratedBarem.tsx`**

Find this block:

```tsx
    <>
      {!hasTest && <p className="hint">Încarcă întâi testul.</p>}
      {waiting && <p role="status">Se generează baremul… Durează câteva minute.</p>}
      {failed && <p className="alert">Nu am putut genera baremul.</p>}
      {unchecked && request === 'none' && <p className="warning">Barem generat automat. Verifică-l și corectează-l în Word dacă e nevoie.</p>}
      {generate.error && <ErrorMessage error={generate.error} />}
```

Replace it with:

```tsx
    <>
      {!hasTest && <p className="hint">{ces ? 'Încarcă întâi testul CES.' : 'Încarcă întâi testul.'}</p>}
      {waiting && <p role="status">{ces ? 'Se generează baremul CES… Durează câteva minute.' : 'Se generează baremul… Durează câteva minute.'}</p>}
      {failed && <p className="alert">{ces ? 'Nu am putut genera baremul CES.' : 'Nu am putut genera baremul.'}</p>}
      {unchecked && request === 'none' && (
        <p className="warning">
          {ces
            ? 'Barem CES generat automat, doar pentru notare. Verifică-l și corectează-l în Word dacă e nevoie.'
            : 'Barem generat automat. Verifică-l și corectează-l în Word dacă e nevoie.'}
        </p>
      )}
      {generate.error && <ErrorMessage error={generate.error} />}
```

- [ ] **Step 67: Edit `src/admin/testPage/PrintTest.tsx`**

Find this block:

```tsx
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { printFileUrl } from '../api.ts';
```

Replace it with:

```tsx
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import type { TestVariant } from '../../../shared/files.ts';
import { printFileUrl } from '../api.ts';
```

- [ ] **Step 68: Edit `src/admin/testPage/PrintTest.tsx`**

Find this block:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';

```

Replace it with:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';
import { partsOf } from './variant.ts';

```

- [ ] **Step 69: Edit `src/admin/testPage/PrintTest.tsx`**

Find this block:

```tsx
// their link at once asks for the link with "Pregătește testul cu cod QR".
export function PrintTest({
  test,
  onChanged,
```

Replace it with:

```tsx
// their link at once asks for the link with "Pregătește testul cu cod QR".
// With `variant` "ces": the CES test, with the same QR code as the class test.
export function PrintTest({
  test,
  variant = 'class',
  onChanged,
```

- [ ] **Step 70: Edit `src/admin/testPage/PrintTest.tsx`**

Find this block:

```tsx
  test: TestInfo;
  onChanged: () => Promise<void>;
```

Replace it with:

```tsx
  test: TestInfo;
  variant?: TestVariant;
  onChanged: () => Promise<void>;
```

- [ ] **Step 71: Edit `src/admin/testPage/PrintTest.tsx`**

Find this block:

```tsx
  const retry = useMutation({
    mutationFn: () => api.retryPrint(test.code),
    onSuccess: async (answer) => {
```

Replace it with:

```tsx
  const retry = useMutation({
    mutationFn: () => api.retryPrint(test.code, variant),
    onSuccess: async (answer) => {
```

- [ ] **Step 72: Edit `src/admin/testPage/PrintTest.tsx`**

Find this block:

```tsx
  });
  const { status, fromWord } = test.print;

```

Replace it with:

```tsx
  });
  const parts = partsOf(test, variant);
  const ces = variant === 'ces';
  const { status, fromWord } = parts.print;

```

- [ ] **Step 73: Edit `src/admin/testPage/PrintTest.tsx`**

Find this block:

```tsx
    <div className="print-test">
      <strong>Testul pentru tipărit:</strong>
      {test.files.test === null ? (
        <p className="hint">Încarcă testul ca să primești varianta cu cod QR.</p>
      ) : test.uploadToken === null ? (
```

Replace it with:

```tsx
    <div className="print-test">
      <strong>{ces ? 'Testul CES pentru tipărit:' : 'Testul pentru tipărit:'}</strong>
      {parts.files.test === null ? (
        <p className="hint">{ces ? 'Încarcă testul CES ca să primești varianta cu cod QR.' : 'Încarcă testul ca să primești varianta cu cod QR.'}</p>
      ) : test.uploadToken === null ? (
```

- [ ] **Step 74: Edit `src/admin/testPage/PrintTest.tsx`**

Find this block:

```tsx
          <p>
            <a className="button button-small" href={printFileUrl(test.code)} download>
              Descarcă testul cu cod QR
            </a>
          </p>
          <p className="hint">Codul QR apare în colțul fiecărei pagini.</p>
          {test.status === 'draft' && (
```

Replace it with:

```tsx
          <p>
            <a className={ces ? 'button-quiet button-small' : 'button button-small'} href={printFileUrl(test.code, variant)} download>
              {ces ? 'Descarcă testul CES cu cod QR' : 'Descarcă testul cu cod QR'}
            </a>
          </p>
          <p className="hint">
            {ces ? 'Același cod QR ca pe testul clasei: elevii cu CES încarcă pe același link.' : 'Codul QR apare în colțul fiecărei pagini.'}
          </p>
          {test.status === 'draft' && (
```

- [ ] **Step 75: Edit `src/admin/testPage/PrintTest.tsx`**

Find this block:

```tsx
        <>
          <p>Nu am putut pregăti testul cu cod QR.</p>
          <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
```

Replace it with:

```tsx
        <>
          <p>{ces ? 'Nu am putut pregăti testul CES cu cod QR.' : 'Nu am putut pregăti testul cu cod QR.'}</p>
          <button type="button" className="button-quiet button-small" disabled={retry.isPending} onClick={() => retry.mutate()}>
```

- [ ] **Step 76: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { useApi } from '../ApiContext.tsx';
```

Replace it with:

```tsx
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import type { TestVariant } from '../../../shared/files.ts';
import { useApi } from '../ApiContext.tsx';
```

- [ ] **Step 77: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
import { MoveOnLink } from './MoveOnLink.tsx';

```

Replace it with:

```tsx
import { MoveOnLink } from './MoveOnLink.tsx';
import { partsOf } from './variant.ts';

```

- [ ] **Step 78: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
// points do not add up, or the robot could not make it. It shows in the panel
// Corectare; the barem is replaced in the panel Pregătire.
export function ExerciseListBanner({
  test,
  onChanged,
```

Replace it with:

```tsx
// points do not add up, or the robot could not make it. It shows in the panel
// Corectare; the barem is replaced in the panel Pregătire. With `variant`
// "ces": the CES variant's list.
export function ExerciseListBanner({
  test,
  variant = 'class',
  onChanged,
```

- [ ] **Step 79: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
  test: TestInfo;
  onChanged: () => Promise<void>;
```

Replace it with:

```tsx
  test: TestInfo;
  variant?: TestVariant;
  onChanged: () => Promise<void>;
```

- [ ] **Step 80: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
  };
  const accept = useMutation({ mutationFn: () => api.acceptExerciseList(test.code), onSuccess: onStarted });
  const retry = useMutation({ mutationFn: () => api.retryExerciseList(test.code), onSuccess: onStarted });
  const { status, message } = test.exerciseList;

```

Replace it with:

```tsx
  };
  const accept = useMutation({ mutationFn: () => api.acceptExerciseList(test.code, variant), onSuccess: onStarted });
  const retry = useMutation({ mutationFn: () => api.retryExerciseList(test.code, variant), onSuccess: onStarted });
  const { status, message } = partsOf(test, variant).exerciseList;
  const ces = variant === 'ces';

```

- [ ] **Step 81: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
        <p>
          <strong>Baremul are o problemă.</strong> {message}
        </p>
        <p>Înlocuiește baremul la Pregătire, sau corectează cu baremul așa cum este.</p>
        <span className="row-actions">
```

Replace it with:

```tsx
        <p>
          <strong>{ces ? 'Baremul CES are o problemă.' : 'Baremul are o problemă.'}</strong> {message}
        </p>
        <p>{ces ? 'Înlocuiește baremul CES la Pregătire, sau corectează cu el așa cum este.' : 'Înlocuiește baremul la Pregătire, sau corectează cu baremul așa cum este.'}</p>
        <span className="row-actions">
```

- [ ] **Step 82: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
          <MoveOnLink className="button-quiet button-small" stage="Pregătire">
            Înlocuiește baremul
          </MoveOnLink>
```

Replace it with:

```tsx
          <MoveOnLink className="button-quiet button-small" stage="Pregătire">
            {ces ? 'Înlocuiește baremul CES' : 'Înlocuiește baremul'}
          </MoveOnLink>
```

- [ ] **Step 83: Edit `src/admin/testPage/ExerciseListBanner.tsx`**

Find this block:

```tsx
        <p>
          <strong>Robotul nu a putut citi testul și baremul.</strong> {message}
        </p>
```

Replace it with:

```tsx
        <p>
          <strong>{ces ? 'Robotul nu a putut citi testul CES și baremul CES.' : 'Robotul nu a putut citi testul și baremul.'}</strong> {message}
        </p>
```

- [ ] **Step 84: Create `src/admin/testPage/CesVariant.tsx`**

```tsx
import { useMutation } from '@tanstack/react-query';
import type { RobotStart, TestInfo } from '../../../shared/api.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel } from '../../ui/format.ts';
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { MoveOnLink } from './MoveOnLink.tsx';
import { TestFiles } from './TestFiles.tsx';
import { cesBaremActive, showsCes } from './variant.ts';

// "Varianta CES" in the panel Pregătire (spec: CES variant): the adapted test
// that the CES students of the class get, with its own barem. Optional: without
// it, they get the class test. Shown while the class has a CES student, or
// while the variant has a file.
export function CesVariant({
  test,
  onChanged,
  onRobot,
}: {
  test: TestInfo;
  onChanged: () => Promise<void>;
  onRobot: (robot: RobotStart | null) => void;
}) {
  const api = useApi();
  const remove = useMutation({ mutationFn: () => api.removeCesVariant(test.code), onSuccess: onChanged });
  if (!showsCes(test)) return null;
  const { ces } = test;
  const hasFiles = ces.files.test !== null || ces.files.barem !== null;
  const expected = ces.classTotalPoints ?? 100;
  const askRemove = () => {
    if (window.confirm('Ștergi varianta CES? Elevii cu CES primesc atunci testul clasei.')) remove.mutate();
  };

  return (
    <section className="ces-variant" aria-labelledby="ces-variant-title">
      <h3 id="ces-variant-title">Varianta CES</h3>
      <p className="hint">
        {ces.studentCount > 0
          ? `${countLabel(ces.studentCount, 'elev cu CES primește', 'elevi cu CES primesc')} acest test, corectat cu baremul lui.`
          : 'Nu mai e niciun elev cu CES în clasă.'}{' '}
        Varianta e opțională: fără ea, elevii cu CES primesc testul clasei.
      </p>
      <TestFiles test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />
      {ces.totalPoints !== null && ces.totalPoints !== expected && (
        <p className="warning">
          Baremul CES are {formatPoints(ces.totalPoints)} puncte, iar baremul clasei {formatPoints(expected)}. Baremul CES ar trebui să aibă tot atâtea
          puncte.
        </p>
      )}
      {hasFiles &&
        (ces.papers > 0 ? (
          <p className="hint">Varianta CES are lucrări corectate, așa că nu mai poate fi ștearsă. Poți înlocui fișierele ei.</p>
        ) : (
          <p>
            <button type="button" className="text-button is-danger" disabled={remove.isPending} onClick={askRemove}>
              Șterge varianta CES
            </button>
          </p>
        ))}
      {remove.error && <ErrorMessage error={remove.error} />}
    </section>
  );
}

// In the panel Corectare: the CES papers wait while the CES barem is not active
// (missing, generating, or not checked yet). The class papers are graded
// meanwhile, and the class analysis waits for the CES papers.
export function CesWaiting({ test }: { test: TestInfo }) {
  const { ces } = test;
  if (ces.waiting === 0 || ces.files.test === null || cesBaremActive(test)) return null;
  const why =
    ces.files.barem === null
      ? 'Încarcă sau generează baremul CES la Pregătire.'
      : ces.barem.request === 'requested'
        ? 'Baremul CES se generează.'
        : 'Verifică baremul CES generat la Pregătire.';
  return (
    <div className="warning">
      <p>
        <strong>{countLabel(ces.waiting, 'lucrare CES așteaptă', 'lucrări CES așteaptă')} baremul CES.</strong> {why} Celelalte lucrări se corectează
        între timp.
      </p>
      <MoveOnLink className="button-quiet button-small" stage="Pregătire">
        Mergi la varianta CES
      </MoveOnLink>
    </div>
  );
}
```

- [ ] **Step 85: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
import { EvaluationControls } from './EvaluationControls.tsx';
import { ExerciseListBanner } from './ExerciseListBanner.tsx';
```

Replace it with:

```tsx
import { EvaluationControls } from './EvaluationControls.tsx';
import { CesVariant, CesWaiting } from './CesVariant.tsx';
import { ExerciseListBanner } from './ExerciseListBanner.tsx';
```

- [ ] **Step 86: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
      <TestFiles test={test} onChanged={onChanged} onRobot={onRobot} />
      {waitsForBarem(test) && (
```

Replace it with:

```tsx
      <TestFiles test={test} onChanged={onChanged} onRobot={onRobot} />
      <CesVariant test={test} onChanged={onChanged} onRobot={onRobot} />
      {waitsForBarem(test) && (
```

- [ ] **Step 87: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
      <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />
      {waitsForPrint(test) && (
```

Replace it with:

```tsx
      <PrintTest test={test} onChanged={onChanged} onRobot={onRobot} />
      {test.ces.files.test !== null && <PrintTest test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />}
      {waitsForPrint(test) && (
```

- [ ] **Step 88: Edit `src/admin/testPage/StagePanel.tsx`**

Find this block:

```tsx
      <ExerciseListBanner test={test} onChanged={onChanged} onRobot={onRobot} />
      {test.status === 'open' ? (
```

Replace it with:

```tsx
      <ExerciseListBanner test={test} onChanged={onChanged} onRobot={onRobot} />
      <ExerciseListBanner test={test} variant="ces" onChanged={onChanged} onRobot={onRobot} />
      <CesWaiting test={test} />
      {test.status === 'open' ? (
```

- [ ] **Step 89: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { CesTag } from '../CesTag.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

- [ ] **Step 90: Edit `src/admin/testPage/UploadsTable.tsx`**

Find this block:

```tsx
        {row.studentName}
        {!row.active && <span className="tag">a plecat</span>}
```

Replace it with:

```tsx
        {row.studentName}
        {(row.ces || row.variant === 'ces') && <CesTag />}
        {!row.active && <span className="tag">a plecat</span>}
```

- [ ] **Step 91: Edit `src/admin/testPage/ResultLinksTable.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { CesTag } from '../CesTag.tsx';
import { ErrorMessage } from '../ErrorMessage.tsx';
```

- [ ] **Step 92: Edit `src/admin/testPage/ResultLinksTable.tsx`**

Find this block:

```tsx
        {row.submissionId === null ? row.studentName : <Link to={`/teste/${code}/elevi/${row.submissionId}`}>{row.studentName}</Link>}
        {!row.active && <span className="tag">a plecat</span>}
```

Replace it with:

```tsx
        {row.submissionId === null ? row.studentName : <Link to={`/teste/${code}/elevi/${row.submissionId}`}>{row.studentName}</Link>}
        {(row.ces || row.variant === 'ces') && <CesTag />}
        {!row.active && <span className="tag">a plecat</span>}
```

- [ ] **Step 93: Edit `src/admin/api.ts`**

Find this block:

```ts
  BaremNotesAnswer,
  ClassDetail,
```

Replace it with:

```ts
  BaremNotesAnswer,
  CesRemovedAnswer,
  ClassDetail,
```

- [ ] **Step 94: Edit `src/admin/api.ts`**

Find this block:

```ts
} from '../../shared/api.ts';
import { uploadTypeOf, type TestFileKind } from '../../shared/files.ts';
import type { CheckoutAnswer, CheckoutInput, PaymentRow } from '../../shared/payments.ts';
```

Replace it with:

```ts
} from '../../shared/api.ts';
import { uploadTypeOf, type TestFileKind, type TestVariant } from '../../shared/files.ts';
import type { CheckoutAnswer, CheckoutInput, PaymentRow } from '../../shared/payments.ts';
```

- [ ] **Step 95: Edit `src/admin/api.ts`**

Find this block:

```ts
  deleteTest(code: string): Promise<void>;
  uploadTestFile(code: string, kind: TestFileKind, file: File): Promise<TestFileAnswer>;
  // Extra teacher comments for the barem, read by the robot as part of it.
  saveBaremNotes(code: string, notes: string): Promise<BaremNotesAnswer>;
  // "Generează baremul": the robot writes a barem from the test file.
  generateBarem(code: string): Promise<BaremGenerateAnswer>;
  // "Am verificat baremul": names the files version the page showed.
  confirmBarem(code: string, filesVersion: number): Promise<BaremCheckedAnswer>;
  startTest(code: string): Promise<StartedTest>;
```

Replace it with:

```ts
  deleteTest(code: string): Promise<void>;
  // `variant` "ces": the CES variant's file, comments, barem, print PDF or exercise list.
  uploadTestFile(code: string, kind: TestFileKind, file: File, variant?: TestVariant): Promise<TestFileAnswer>;
  // Extra teacher comments for the barem, read by the robot as part of it.
  saveBaremNotes(code: string, notes: string, variant?: TestVariant): Promise<BaremNotesAnswer>;
  // "Generează baremul": the robot writes a barem from the test file.
  generateBarem(code: string, variant?: TestVariant): Promise<BaremGenerateAnswer>;
  // "Am verificat baremul": names the files version the page showed.
  confirmBarem(code: string, filesVersion: number, variant?: TestVariant): Promise<BaremCheckedAnswer>;
  // "Șterge varianta CES": only while no paper went to grading with it.
  removeCesVariant(code: string): Promise<CesRemovedAnswer>;
  startTest(code: string): Promise<StartedTest>;
```

- [ ] **Step 96: Edit `src/admin/api.ts`**

Find this block:

```ts
  // cod QR" on a draft made before tests got their link at once.
  retryPrint(code: string): Promise<PrintRetryAnswer>;
  // Puts a finished test in the archive, or takes it out. Resolves to the new mark.
```

Replace it with:

```ts
  // cod QR" on a draft made before tests got their link at once.
  retryPrint(code: string, variant?: TestVariant): Promise<PrintRetryAnswer>;
  // Puts a finished test in the archive, or takes it out. Resolves to the new mark.
```

- [ ] **Step 97: Edit `src/admin/api.ts`**

Find this block:

```ts
  // The robot answers are null when the robot was not needed.
  acceptExerciseList(code: string): Promise<RobotStart | null>;
  retryExerciseList(code: string): Promise<RobotStart | null>;
  // "Pornește robotul": work that a stopped run left in the test.
```

Replace it with:

```ts
  // The robot answers are null when the robot was not needed.
  acceptExerciseList(code: string, variant?: TestVariant): Promise<RobotStart | null>;
  retryExerciseList(code: string, variant?: TestVariant): Promise<RobotStart | null>;
  // "Pornește robotul": work that a stopped run left in the test.
```

- [ ] **Step 98: Edit `src/admin/api.ts`**

Find this block:

```ts

// Files open straight from the API: the browser sends the login cookie.
export function testFileUrl(code: string, kind: TestFileKind): string {
  return `/api/admin/tests/${encodeURIComponent(code)}/files/${kind}`;
}
```

Replace it with:

```ts

// The part of a test's address that names its variant: the CES variant's
// routes are under /ces.
function variantPath(code: string, variant: TestVariant | undefined): string {
  return `/tests/${encodeURIComponent(code)}${variant === 'ces' ? '/ces' : ''}`;
}

// Files open straight from the API: the browser sends the login cookie.
export function testFileUrl(code: string, kind: TestFileKind, variant?: TestVariant): string {
  return `/api/admin${variantPath(code, variant)}/files/${kind}`;
}
```

- [ ] **Step 99: Edit `src/admin/api.ts`**

Find this block:

```ts
// The test with the QR code, made for printing.
export function printFileUrl(code: string): string {
  return `/api/admin/tests/${encodeURIComponent(code)}/print`;
}
```

Replace it with:

```ts
// The test with the QR code, made for printing.
export function printFileUrl(code: string, variant?: TestVariant): string {
  return `/api/admin${variantPath(code, variant)}/print`;
}
```

- [ ] **Step 100: Edit `src/admin/api.ts`**

Find this block:

```ts
    },
    uploadTestFile: (code, kind, file) => request<TestFileAnswer>('PUT', `${test(code)}/files/${kind}`, undefined, file),
    saveBaremNotes: (code, notes) => request<BaremNotesAnswer>('PUT', `${test(code)}/barem-notes`, { notes }),
    generateBarem: (code) => request<BaremGenerateAnswer>('POST', `${test(code)}/barem/generate`),
    confirmBarem: (code, filesVersion) => request<BaremCheckedAnswer>('POST', `${test(code)}/barem/checked`, { filesVersion }),
    startTest: (code) => request<StartedTest>('POST', `${test(code)}/start`),
```

Replace it with:

```ts
    },
    uploadTestFile: (code, kind, file, variant) => request<TestFileAnswer>('PUT', `${variantPath(code, variant)}/files/${kind}`, undefined, file),
    saveBaremNotes: (code, notes, variant) => request<BaremNotesAnswer>('PUT', `${variantPath(code, variant)}/barem-notes`, { notes }),
    generateBarem: (code, variant) => request<BaremGenerateAnswer>('POST', `${variantPath(code, variant)}/barem/generate`),
    confirmBarem: (code, filesVersion, variant) =>
      request<BaremCheckedAnswer>('POST', `${variantPath(code, variant)}/barem/checked`, { filesVersion }),
    removeCesVariant: (code) => request<CesRemovedAnswer>('DELETE', `${test(code)}/ces`),
    startTest: (code) => request<StartedTest>('POST', `${test(code)}/start`),
```

- [ ] **Step 101: Edit `src/admin/api.ts`**

Find this block:

```ts
    finishTest: (code) => request<FinishedTest>('POST', `${test(code)}/finish`),
    retryPrint: (code) => request<PrintRetryAnswer>('POST', `${test(code)}/print/retry`),
    setTestArchived: async (code, archived) =>
```

Replace it with:

```ts
    finishTest: (code) => request<FinishedTest>('POST', `${test(code)}/finish`),
    retryPrint: (code, variant) => request<PrintRetryAnswer>('POST', `${variantPath(code, variant)}/print/retry`),
    setTestArchived: async (code, archived) =>
```

- [ ] **Step 102: Edit `src/admin/api.ts`**

Find this block:

```ts
    },
    acceptExerciseList: async (code) =>
      (await request<ExerciseListAnswer>('POST', `${test(code)}/exercise-list/accept`)).robot,
    retryExerciseList: async (code) =>
      (await request<ExerciseListAnswer>('POST', `${test(code)}/exercise-list/retry`)).robot,
    startRobot: async (code) => (await request<RobotStartAnswer>('POST', `${test(code)}/robot`)).robot,
```

Replace it with:

```ts
    },
    acceptExerciseList: async (code, variant) =>
      (await request<ExerciseListAnswer>('POST', `${variantPath(code, variant)}/exercise-list/accept`)).robot,
    retryExerciseList: async (code, variant) =>
      (await request<ExerciseListAnswer>('POST', `${variantPath(code, variant)}/exercise-list/retry`)).robot,
    startRobot: async (code) => (await request<RobotStartAnswer>('POST', `${test(code)}/robot`)).robot,
```

- [ ] **Step 103: Edit `src/ui/brand.css`**

Find this block:

```css
  border: 1.5px solid var(--rule);
  border-radius: 0.75rem;
  background: var(--sheet);
}

.button-danger {
```

Replace it with:

```css
  border: 1.5px solid var(--rule);
  border-radius: 0.75rem;
  background: var(--sheet);
}

/* "Varianta CES" in Pregătire: the adapted test's own files, under the class files. */
.ces-variant {
  max-width: 44rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1.5px solid var(--rule);
}

.ces-variant > h3 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

/* The mark of a CES student next to the name. */
.tag-ces {
  margin-left: 0.4rem;
}

.button-danger {
```

- [ ] **Step 104: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type error; `Test Files  136 passed | 1 skipped (137)`, `Tests  2140 passed | 3 skipped (2143)`.

- [ ] **Step 105: Commit**

```bash
git add shared/api.ts server/db/tests.ts server/routes/cesVariant.test.ts server/routes/tests.test.ts src/admin/api.ts src/test/fakeApi.ts src/admin/testPage/variant.ts src/admin/testPage/CesVariant.tsx src/admin/testPage/StartRobotButton.tsx src/admin/testPage/TestFiles.tsx src/admin/testPage/GeneratedBarem.tsx src/admin/testPage/PrintTest.tsx src/admin/testPage/ExerciseListBanner.tsx src/admin/testPage/StagePanel.tsx src/admin/testPage/UploadsTable.tsx src/admin/testPage/ResultLinksTable.tsx src/ui/brand.css src/admin/pages/TestPageCes.test.tsx src/admin/pages/TestPage.test.tsx src/admin/testPage/GeneratedBarem.test.tsx src/admin/testPage/PrintTest.test.tsx
git commit -m "Show the CES variant on the test page"
```

### Task 7: Give the CES papers their own table in the class report when their exercises differ

The report carries `cesExercises` (null while the CES papers share the class columns), each row's `ces` and `variant`, each missing student's `ces`. `reportTables` splits the rows; `classStats` gives each table its own per-exercise statistics and keeps the grades together. The report page, the CSV and the class PDF draw the tables.

**Files:**
- Modify: `shared/api.ts`, `shared/stats.ts`, `server/db/report.ts`, `shared/csv.ts`, `src/admin/reportPage/ReportTables.tsx`, `src/admin/pages/ReportPage.tsx`, `src/admin/pdf/classPdf.ts`, `src/ui/brand.css`
- Test: `server/routes/report.test.ts`, `shared/stats.test.ts`, `shared/csv.test.ts`, `src/admin/pages/ReportPage.test.tsx`, `src/admin/pdf/pdf.test.ts`, `src/admin/testPage/ResultsPanel.test.tsx` (the report fixtures get the new fields)

**Interfaces:**
- Consumes: Task 1's `CesTag`; Task 2's `TestVariant`.
- Produces: `ReportRow.ces`, `ReportRow.variant`, `ReportMissing.ces`, `ClassReport.cesExercises`; in `shared/stats.ts`: `sameExercises(a, b)`, `ReportTable`, `reportTables(report)`, `ClassStats.cesPerExercise`; `ResultsTable({ code, table, missing, caption? })` and `ExerciseStatsTable({ perExercise, caption? })`.

- [ ] **Step 1: Edit `server/routes/report.test.ts`**

Find this block:

```ts

describe('GET /api/admin/tests/:code/report', () => {
```

Replace it with:

```ts

describe('the CES papers in the class report', () => {
  // Avram Dan wrote the CES variant; Pop Ion the class test.
  async function gradeBoth(cesList: ExerciseList): Promise<void> {
    await api.db.prepare('UPDATE tests SET ces_exercise_list_json = ? WHERE id = ?').bind(JSON.stringify(cesList), testId).run();
    await api.db.prepare('UPDATE students SET ces = 1 WHERE id = ?').bind(studentIds[1]).run();
    const pop = await addSubmission(api, code, studentIds[2]!, { status: 'graded', files: 1 });
    await addEvaluation(api, pop, { grade: 8, items: [{}, {}] });
    const avram = await addSubmission(api, code, studentIds[1]!, { status: 'graded', files: 1 });
    await addEvaluation(api, avram, { grade: 9, items: [{}, {}] });
    await api.db.prepare("UPDATE submissions SET variant = 'ces' WHERE id = ?").bind(avram).run();
  }

  it('keeps one table when the CES exercises are the class ones, and marks the CES row', async () => {
    await gradeBoth(LIST);
    const { report: body } = (await report()).body;
    expect(body.cesExercises).toBeNull();
    expect(body.exercises.map((e: { id: string }) => e.id)).toEqual(['E1', 'E2']);
    expect(body.rows.map((row: { studentName: string; ces: boolean; variant: string }) => [row.studentName, row.ces, row.variant])).toEqual([
      ['Avram Dan', true, 'ces'],
      ['Pop Ion', false, 'class'],
    ]);
  });

  it('gives the CES exercises apart when their ids or maximums differ', async () => {
    await gradeBoth({ ...LIST, exercises: [{ ...LIST.exercises[0]!, maxPoints: 9 }] });
    const { report: body } = (await report()).body;
    expect(body.exercises.map((e: { id: string; maxPoints: number }) => [e.id, e.maxPoints])).toEqual([
      ['E1', 4.5],
      ['E2', 4.5],
    ]);
    // The CES list first, then what only the CES papers' items name.
    expect(body.cesExercises.map((e: { id: string; maxPoints: number }) => [e.id, e.maxPoints])).toEqual([
      ['E1', 9],
      ['E2', 1],
    ]);
    expect(body.missing.map((m: { studentName: string; ces: boolean }) => [m.studentName, m.ces])).toEqual([
      ['Ionescu Ana', false],
      ['Stan Eva', false],
    ]);
  });
});

describe('GET /api/admin/tests/:code/report', () => {
```

- [ ] **Step 2: Edit `server/routes/report.test.ts`**

Find this block:

```ts
    expect(body.missing).toEqual([
      { studentId: studentIds[3], studentName: 'Ionescu Ana', status: 'none' },
      { studentId: studentIds[0], studentName: 'Stan Eva', status: 'failed' },
    ]);
```

Replace it with:

```ts
    expect(body.missing).toEqual([
      { studentId: studentIds[3], studentName: 'Ionescu Ana', status: 'none', ces: false },
      { studentId: studentIds[0], studentName: 'Stan Eva', status: 'failed', ces: false },
    ]);
```

- [ ] **Step 3: Edit `shared/stats.test.ts`**

Find this block:

```ts
import type { ReportRow } from './api.ts';
import { averageGrade, classStats, GRADE_GROUPS } from './stats.ts';

```

Replace it with:

```ts
import type { ReportRow } from './api.ts';
import { averageGrade, classStats, GRADE_GROUPS, reportTables, sameExercises } from './stats.ts';

```

- [ ] **Step 4: Edit `shared/stats.test.ts`**

Find this block:

```ts
    grade,
    flagCount,
    items: [
```

Replace it with:

```ts
    grade,
    flagCount, ces: false, variant: 'class',
    items: [
```

- [ ] **Step 5: Edit `shared/stats.test.ts`**

Find this block:

```ts
    const rows = grades.map((grade, index) => row(index + 1, grade, [0, 0]));
    expect(averageGrade(grades)).toBe(classStats({ exercises, rows, missing: [] }).average);
    expect(averageGrade([...grades].reverse())).toBe(averageGrade(grades));
```

Replace it with:

```ts
    const rows = grades.map((grade, index) => row(index + 1, grade, [0, 0]));
    expect(averageGrade(grades)).toBe(classStats({ cesExercises: null, exercises, rows, missing: [] }).average);
    expect(averageGrade([...grades].reverse())).toBe(averageGrade(grades));
```

- [ ] **Step 6: Edit `shared/stats.test.ts`**

Find this block:

```ts
  it('has no numbers for a class without results', () => {
    const stats = classStats({ exercises, rows: [], missing: [{ studentId: 1, studentName: 'Pop Ion', status: 'none' }] });
    expect(stats).toMatchObject({ gradedCount: 0, activeCount: 1, average: null, median: null, min: null, max: null, flaggedCount: 0 });
```

Replace it with:

```ts
  it('has no numbers for a class without results', () => {
    const stats = classStats({ cesExercises: null, exercises, rows: [], missing: [{ studentId: 1, studentName: 'Pop Ion', status: 'none', ces: false }] });
    expect(stats).toMatchObject({ gradedCount: 0, activeCount: 1, average: null, median: null, min: null, max: null, flaggedCount: 0 });
```

- [ ] **Step 7: Edit `shared/stats.test.ts`**

Find this block:

```ts
    const rows = [row(1, 10, [4, 5]), row(2, 7.5, [3, 4]), row(3, 4.99, [1, 3]), row(4, 9, [4, 4])];
    const stats = classStats({ exercises, rows, missing: [] });
    expect(stats).toMatchObject({ gradedCount: 4, activeCount: 4, average: 7.87, median: 8.25, min: 4.99, max: 10 });
```

Replace it with:

```ts
    const rows = [row(1, 10, [4, 5]), row(2, 7.5, [3, 4]), row(3, 4.99, [1, 3]), row(4, 9, [4, 4])];
    const stats = classStats({ cesExercises: null, exercises, rows, missing: [] });
    expect(stats).toMatchObject({ gradedCount: 4, activeCount: 4, average: 7.87, median: 8.25, min: 4.99, max: 10 });
```

- [ ] **Step 8: Edit `shared/stats.test.ts`**

Find this block:

```ts
  it('takes the middle grade of an odd class as the median', () => {
    const stats = classStats({ exercises, rows: [row(1, 3, [0, 0]), row(2, 9, [4, 5]), row(3, 6, [2, 2])], missing: [] });
    expect(stats.median).toBe(6);
```

Replace it with:

```ts
  it('takes the middle grade of an odd class as the median', () => {
    const stats = classStats({ cesExercises: null, exercises, rows: [row(1, 3, [0, 0]), row(2, 9, [4, 5]), row(3, 6, [2, 2])], missing: [] });
    expect(stats.median).toBe(6);
```

- [ ] **Step 9: Edit `shared/stats.test.ts`**

Find this block:

```ts
    const grades = [0, 4.99, 5, 6.99, 7, 8.99, 9, 10];
    const stats = classStats({ exercises, rows: grades.map((grade, index) => row(index + 1, grade, [0, 0])), missing: [] });
    expect(GRADE_GROUPS.map((group) => group.label)).toEqual(['1-4,99', '5-6,99', '7-8,99', '9-10']);
```

Replace it with:

```ts
    const grades = [0, 4.99, 5, 6.99, 7, 8.99, 9, 10];
    const stats = classStats({ cesExercises: null, exercises, rows: grades.map((grade, index) => row(index + 1, grade, [0, 0])), missing: [] });
    expect(GRADE_GROUPS.map((group) => group.label)).toEqual(['1-4,99', '5-6,99', '7-8,99', '9-10']);
```

- [ ] **Step 10: Edit `shared/stats.test.ts`**

Find this block:

```ts
    const rows = [row(1, 9, [4, 5]), row(2, 5, [2, 0]), row(3, 1, [0, 0.33]), row(4, 9, [4, 4.65])];
    const stats = classStats({ exercises, rows, missing: [] });
    expect(stats.perExercise[0]).toMatchObject({ exerciseId: 'E1', count: 4, averagePoints: 2.5, averagePercent: 63, full: 2, partial: 1, zero: 1 });
```

Replace it with:

```ts
    const rows = [row(1, 9, [4, 5]), row(2, 5, [2, 0]), row(3, 1, [0, 0.33]), row(4, 9, [4, 4.65])];
    const stats = classStats({ cesExercises: null, exercises, rows, missing: [] });
    expect(stats.perExercise[0]).toMatchObject({ exerciseId: 'E1', count: 4, averagePoints: 2.5, averagePercent: 63, full: 2, partial: 1, zero: 1 });
```

- [ ] **Step 11: Edit `shared/stats.test.ts`**

Find this block:

```ts
    const rows = [{ ...row(1, 10, [0, 0]), items: [{ exerciseId: 'E1', points: 0.33, maxPoints: 0.33, flagged: false }] }];
    expect(classStats({ exercises: odd, rows, missing: [] }).perExercise[0]).toMatchObject({ full: 1, partial: 0, zero: 0 });
  });
```

Replace it with:

```ts
    const rows = [{ ...row(1, 10, [0, 0]), items: [{ exerciseId: 'E1', points: 0.33, maxPoints: 0.33, flagged: false }] }];
    expect(classStats({ cesExercises: null, exercises: odd, rows, missing: [] }).perExercise[0]).toMatchObject({ full: 1, partial: 0, zero: 0 });
  });
```

- [ ] **Step 12: Edit `shared/stats.test.ts`**

Find this block:

```ts
    const rows = [row(1, 8, [3, 3], 2), { ...row(2, 6, [2, 2], 1), items: [{ exerciseId: 'E1', points: 2, maxPoints: 4, flagged: true }] }];
    const stats = classStats({ exercises, rows, missing: [] });
    expect(stats.perExercise[0]!.count).toBe(2);
```

Replace it with:

```ts
    const rows = [row(1, 8, [3, 3], 2), { ...row(2, 6, [2, 2], 1), items: [{ exerciseId: 'E1', points: 2, maxPoints: 4, flagged: true }] }];
    const stats = classStats({ cesExercises: null, exercises, rows, missing: [] });
    expect(stats.perExercise[0]!.count).toBe(2);
```

- [ ] **Step 13: Edit `shared/stats.test.ts`**

Find this block:

```ts
  it('counts the active students that have no result', () => {
    const stats = classStats({
      exercises,
      rows: [row(1, 8, [3, 3])],
```

Replace it with:

```ts
  it('counts the active students that have no result', () => {
    const stats = classStats({
      cesExercises: null,
      exercises,
      rows: [row(1, 8, [3, 3])],
```

- [ ] **Step 14: Edit `shared/stats.test.ts`**

Find this block:

```ts
      missing: [
        { studentId: 2, studentName: 'Ionescu Ana', status: 'none' },
        { studentId: 3, studentName: 'Stan Eva', status: 'failed' },
      ],
```

Replace it with:

```ts
      missing: [
        { studentId: 2, studentName: 'Ionescu Ana', status: 'none', ces: false },
        { studentId: 3, studentName: 'Stan Eva', status: 'failed', ces: false },
      ],
```

- [ ] **Step 15: Edit `shared/stats.test.ts`**

Find this block:

```ts
    const stats = classStats({
      exercises,
      rows: [row(1, 8, [3, 3]), left],
      missing: [{ studentId: 3, studentName: 'Stan Eva', status: 'none' }],
    });
```

Replace it with:

```ts
    const stats = classStats({
      cesExercises: null,
      exercises,
      rows: [row(1, 8, [3, 3]), left],
      missing: [{ studentId: 3, studentName: 'Stan Eva', status: 'none', ces: false }],
    });
```

- [ ] **Step 16: Edit `shared/stats.test.ts`**

Find this block:

```ts
    expect(stats).toMatchObject({ gradedCount: 1, activeCount: 2, average: 8.5 });
  });
});
```

Replace it with:

```ts
    expect(stats).toMatchObject({ gradedCount: 1, activeCount: 2, average: 8.5 });
  });
});

describe('the CES table', () => {
  const cesRow = (id: number, grade: number, points: number): ReportRow => ({
    ...row(id, grade, [0, 0]),
    variant: 'ces',
    ces: true,
    items: [{ exerciseId: 'C1', points, maxPoints: 9, flagged: false }],
  });

  it('tells lists that the same columns can show', () => {
    const a = [
      { id: 'E1', label: 'a', maxPoints: 4 },
      { id: 'E2', label: 'b', maxPoints: 5 },
    ];
    expect(sameExercises(a, [a[1]!, a[0]!])).toBe(true);
    expect(sameExercises(a, [a[0]!])).toBe(false);
    expect(sameExercises(a, [a[0]!, { ...a[1]!, maxPoints: 6 }])).toBe(false);
    expect(sameExercises(a, [a[0]!, { ...a[1]!, id: 'E3' }])).toBe(false);
  });

  it('is one table while the CES papers share the class columns', () => {
    const rows = [row(1, 8, [4, 3]), { ...row(2, 9, [4, 4]), variant: 'ces' as const }];
    expect(reportTables({ exercises, cesExercises: null, rows })).toEqual([{ variant: 'class', exercises, rows }]);
  });

  it('puts the CES papers in their own table, with their own exercise statistics, and keeps every grade together', () => {
    const cesExercises = [{ id: 'C1', label: 'CES 1', maxPoints: 9 }];
    const rows = [row(1, 6, [4, 1]), cesRow(2, 10, 9), row(3, 8, [2, 5])];
    const tables = reportTables({ exercises, cesExercises, rows });
    expect(tables.map((table) => [table.variant, table.rows.map((r) => r.submissionId)])).toEqual([
      ['class', [1, 3]],
      ['ces', [2]],
    ]);
    const stats = classStats({ exercises, cesExercises, rows, missing: [] });
    expect(stats.average).toBe(8);
    expect(stats.perExercise[0]).toMatchObject({ exerciseId: 'E1', count: 2, averagePoints: 3 });
    expect(stats.cesPerExercise).toEqual([expect.objectContaining({ exerciseId: 'C1', count: 1, averagePoints: 9, full: 1 })]);
    expect(classStats({ exercises, cesExercises: null, rows: [row(1, 6, [4, 1])], missing: [] }).cesPerExercise).toBeNull();
  });
});
```

- [ ] **Step 17: Edit `shared/csv.test.ts`**

Find this block:

```ts
    test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: null },
    exercises: [
```

Replace it with:

```ts
    test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: null },
    cesExercises: null,
    exercises: [
```

- [ ] **Step 18: Edit `shared/csv.test.ts`**

Find this block:

```ts
        grade: 7.25,
        flagCount: 0,
        items: [
```

Replace it with:

```ts
        grade: 7.25,
        flagCount: 0, ces: false, variant: 'class',
        items: [
```

- [ ] **Step 19: Edit `shared/csv.test.ts`**

Find this block:

```ts
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none' }],
    analysis: { status: 'none', stale: false, attempts: 0, content: null },
```

Replace it with:

```ts
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none', ces: false }],
    analysis: { status: 'none', stale: false, attempts: 0, content: null },
```

- [ ] **Step 20: Edit `shared/csv.test.ts`**

Find this block:

```ts
      rows: [{ ...base.rows[0]!, items: [{ exerciseId: '=A1', points: 1, maxPoints: 1, flagged: false }] }],
      missing: [{ studentId: 1, studentName: 'Ion', status: 'failed' }],
    });
```

Replace it with:

```ts
      rows: [{ ...base.rows[0]!, items: [{ exerciseId: '=A1', points: 1, maxPoints: 1, flagged: false }] }],
      missing: [{ studentId: 1, studentName: 'Ion', status: 'failed', ces: false }],
    });
```

- [ ] **Step 21: Edit `shared/csv.test.ts`**

Find this block:

```ts
  });
});
```

Replace it with:

```ts
  });
});

describe('classCsv with CES papers', () => {
  const cesRow = {
    ...report().rows[0]!,
    submissionId: 7,
    studentId: 13,
    studentName: 'Bursașiu Teodor',
    ces: true,
    variant: 'ces' as const,
    total: 9,
    grade: 9,
    items: [{ exerciseId: 'C1', points: 8, maxPoints: 9, flagged: false }],
  };

  it('keeps the CES rows in the class block while they share its columns, and never names CES', () => {
    const csv = classCsv(report({ rows: [...report().rows, { ...cesRow, items: report().rows[0]!.items }] }), label);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Elev;I.1;II.1;Total;Nota;Observații');
    expect(lines.filter((line) => line.startsWith('Elev;'))).toHaveLength(1);
    expect(csv).not.toContain('CES');
  });

  it('puts the CES rows in a block of their own, after an empty line, with their own header', () => {
    const csv = classCsv(report({ cesExercises: [{ id: 'C1', label: 'CES', maxPoints: 9 }], rows: [...report().rows, cesRow] }), label);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Elev;I.1;II.1;Total;Nota;Observații',
      'Ștefănescu Ana;4,5;1,75;7,25;7,25;',
      'Stan Eva;;;;;Nu a trimis',
      '',
      'Elev;C1;Total;Nota;Observații',
      'Bursașiu Teodor;8;9;9;',
      '',
    ]);
    expect(csv).not.toContain('CES');
  });
});
```

- [ ] **Step 22: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    exercises: [
```

Replace it with:

```tsx
    test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
    cesExercises: null,
    exercises: [
```

- [ ] **Step 23: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
        grade: 10,
        flagCount: 0,
        items: [
```

Replace it with:

```tsx
        grade: 10,
        flagCount: 0, ces: false, variant: 'class',
        items: [
```

- [ ] **Step 24: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
        grade: 5.5,
        flagCount: 2,
        items: [
```

Replace it with:

```tsx
        grade: 5.5,
        flagCount: 2, ces: false, variant: 'class',
        items: [
```

- [ ] **Step 25: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none' }],
    analysis: { status: 'ready', stale: false, attempts: 0, content: ANALYSIS },
```

Replace it with:

```tsx
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none', ces: false }],
    analysis: { status: 'ready', stale: false, attempts: 0, content: ANALYSIS },
```

- [ ] **Step 26: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
    reports: { '6E2-26T1': value },
  });

describe('ReportPage', () => {
```

Replace it with:

```tsx
    reports: { '6E2-26T1': value },
  });

describe('ReportPage with CES papers', () => {
  const cesRow = {
    ...report().rows[0]!,
    submissionId: 7,
    studentId: 13,
    studentName: 'Bursașiu Teodor',
    ces: true,
    variant: 'ces' as const,
    total: 9,
    grade: 9,
    items: [{ exerciseId: 'C1', points: 8, maxPoints: 9, flagged: false }],
  };

  it('shows the CES papers in a table of their own, with the mark, when their exercises differ', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ cesExercises: [{ id: 'C1', label: 'Exercițiul CES 1', maxPoints: 9 }], rows: [...report().rows, cesRow] })));
    const results = within(await screen.findByRole('region', { name: 'Rezultatele elevilor' }));
    const tables = results.getAllByRole('table');
    expect(tables).toHaveLength(2);
    expect(within(tables[0]!).queryByText('Bursașiu Teodor')).not.toBeInTheDocument();
    expect(results.getByRole('heading', { level: 3, name: 'Varianta CES' })).toBeInTheDocument();
    const ces = within(tables[1]!);
    expect(ces.getByRole('columnheader', { name: /C1/ })).toBeInTheDocument();
    const row = ces.getByRole('rowheader', { name: /Bursașiu Teodor/ });
    expect(within(row).getByText('CES')).toBeInTheDocument();
    const exercises = within(screen.getByRole('region', { name: 'Pe exerciții' }));
    expect(exercises.getAllByRole('table')).toHaveLength(2);
    expect(exercises.getByRole('rowheader', { name: 'Exercițiul CES 1' })).toBeInTheDocument();
  });

  it('keeps one table, with the mark, when the CES papers share the class columns', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ rows: [...report().rows, { ...cesRow, items: report().rows[0]!.items }] })));
    const results = within(await screen.findByRole('region', { name: 'Rezultatele elevilor' }));
    expect(results.getAllByRole('table')).toHaveLength(1);
    expect(results.queryByRole('heading', { name: 'Varianta CES' })).not.toBeInTheDocument();
    expect(within(results.getByRole('rowheader', { name: /Bursașiu Teodor/ })).getByText('CES')).toBeInTheDocument();
  });
});

describe('ReportPage', () => {
```

- [ ] **Step 27: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
  it('says why a student with a paper has no result yet', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'submitted' }] })));
    const table = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții' });
```

Replace it with:

```tsx
  it('says why a student with a paper has no result yet', async () => {
    renderAdmin('/teste/6E2-26T1/raport', apiWith(report({ missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'submitted', ces: false }] })));
    const table = await screen.findByRole('table', { name: 'Punctajele elevilor pe exerciții' });
```

- [ ] **Step 28: Edit `src/admin/pages/ReportPage.test.tsx`**

Find this block:

```tsx
          grade: 10,
          flagCount: 0,
          items: exercises.map((exercise) => ({ exerciseId: exercise.id, points: 1, maxPoints: 1, flagged: false })),
```

Replace it with:

```tsx
          grade: 10,
          flagCount: 0, ces: false, variant: 'class',
          items: exercises.map((exercise) => ({ exerciseId: exercise.id, points: 1, maxPoints: 1, flagged: false })),
```

- [ ] **Step 29: Edit `src/admin/pdf/pdf.test.ts`**

Find this block:

```ts
    exercises,
    rows: [
      { submissionId: 5, studentId: 10, studentName: 'Ștefănescu Țicu', active: true, total: 12, maxTotal: exerciseCount, grade: 8, flagCount: 1, items: items(1) },
      { submissionId: 6, studentId: 11, studentName: 'Avram Dan', active: true, total: 10, maxTotal: exerciseCount, grade: 7, flagCount: 0, items: items(-1) },
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none' }],
    analysis: {
```

Replace it with:

```ts
    exercises,
    cesExercises: null,
    rows: [
      { submissionId: 5, studentId: 10, studentName: 'Ștefănescu Țicu', active: true, total: 12, maxTotal: exerciseCount, grade: 8, flagCount: 1, ces: false, variant: 'class', items: items(1) },
      { submissionId: 6, studentId: 11, studentName: 'Avram Dan', active: true, total: 10, maxTotal: exerciseCount, grade: 7, flagCount: 0, ces: false, variant: 'class', items: items(-1) },
    ],
    missing: [{ studentId: 12, studentName: 'Stan Eva', status: 'none', ces: false }],
    analysis: {
```

- [ ] **Step 30: Edit `src/admin/pdf/pdf.test.ts`**

Find this block:

```ts
  };
}

describe('classPdf', () => {
```

Replace it with:

```ts
  };
}

describe('classPdf with CES papers', () => {
  it('adds the CES table and its exercises under "Varianta CES"', () => {
    const base = report(2);
    const ces = { ...base.rows[1]!, submissionId: 7, studentName: 'Bursașiu Teodor', variant: 'ces' as const, ces: true, items: [{ exerciseId: 'C1', points: 8, maxPoints: 9, flagged: false }] };
    const text = textsOf(classPdf({ ...base, cesExercises: [{ id: 'C1', label: 'Exercițiul CES', maxPoints: 9 }], rows: [...base.rows, ces] }).content).join('\n');
    expect(text.match(/Varianta CES/g)).toHaveLength(2);
    expect(text).toContain('C1 · Exercițiul CES');
    expect(text).toContain('Bursașiu Teodor');
    expect(textsOf(classPdf(base).content).join('\n')).not.toContain('Varianta CES');
  });
});

describe('classPdf', () => {
```

- [ ] **Step 31: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
      test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
      exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5 }],
```

Replace it with:

```tsx
      test: { code: '6E2-26T1', title: 'Fracții', classId: 1, className: '6E2', status: 'done', startedAt: '2026-10-06T07:15:00.000Z' },
      cesExercises: null,
      exercises: [{ id: 'I.1', label: 'Subiectul I, exercițiul 1', maxPoints: 4.5 }],
```

- [ ] **Step 32: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
          grade: 9,
          flagCount: 0,
          items: [{ exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false }],
```

Replace it with:

```tsx
          grade: 9,
          flagCount: 0, ces: false, variant: 'class',
          items: [{ exerciseId: 'I.1', points: 4.5, maxPoints: 4.5, flagged: false }],
```

- [ ] **Step 33: Edit `src/admin/testPage/ResultsPanel.test.tsx`**

Find this block:

```tsx
      ],
      missing: [{ studentId: 12, studentName: 'Marin Dan', status: 'none' }],
      analysis: { status: 'none', stale: false, attempts: 0, content: null },
```

Replace it with:

```tsx
      ],
      missing: [{ studentId: 12, studentName: 'Marin Dan', status: 'none', ces: false }],
      analysis: { status: 'none', stale: false, attempts: 0, content: null },
```

- [ ] **Step 34: Run the new tests to see them fail**

Run: `npx vitest run server/routes/report.test.ts shared/stats.test.ts shared/csv.test.ts src/admin/pages/ReportPage.test.tsx src/admin/pdf/pdf.test.ts src/admin/testPage/ResultsPanel.test.tsx`
Expected: FAIL. `Test Files  5 failed | 1 passed (6)`, `Tests  10 failed | 91 passed (101)`: `sameExercises is not a function`, `reportTables is not a function`, the report has no `cesExercises` (`expected undefined to be null`), the missing students have no `ces`, the CSV has no CES block, and the report page and the PDF draw one table with no mark.

- [ ] **Step 35: Edit `shared/api.ts`**

Find this block:

```ts
  items: ReportItem[];
}
```

Replace it with:

```ts
  items: ReportItem[];
  // The student is marked CES (the report shows the mark), and the variant
  // the paper was graded with.
  ces: boolean;
  variant: TestVariant;
}
```

- [ ] **Step 36: Edit `shared/api.ts`**

Find this block:

```ts
  status: UploadStatus;
}
```

Replace it with:

```ts
  status: UploadStatus;
  ces: boolean;
}
```

- [ ] **Step 37: Edit `shared/api.ts`**

Find this block:

```ts
  exercises: { id: string; label: string; maxPoints: number }[];
  rows: ReportRow[];
```

Replace it with:

```ts
  exercises: { id: string; label: string; maxPoints: number }[];
  // The CES variant's exercises, when CES papers are graded and their
  // exercises differ from the class test's (other ids, or another maximum):
  // the CES papers then go in a table of their own (reportTables in
  // shared/stats.ts). Null when there is no CES paper or the exercises are
  // the same: the CES rows then share the class columns.
  cesExercises: { id: string; label: string; maxPoints: number }[] | null;
  rows: ReportRow[];
```

- [ ] **Step 38: Edit `shared/stats.ts`**

Find this block:

```ts
import type { ClassReport } from './api.ts';
import { round2, toCents } from './scoring.ts';
```

Replace it with:

```ts
import type { ClassReport, ReportRow } from './api.ts';
import type { TestVariant } from './files.ts';
import { round2, toCents } from './scoring.ts';
```

- [ ] **Step 39: Edit `shared/stats.ts`**

Find this block:

```ts
  groups: { label: string; count: number }[];
  perExercise: ExerciseStats[];
  // Items to check that the teacher has not checked yet, in all the results.
  flaggedCount: number;
}
```

Replace it with:

```ts
  groups: { label: string; count: number }[];
  // The exercises of the class table, from its papers only.
  perExercise: ExerciseStats[];
  // The exercises of the CES table, when the report has one (reportTables).
  cesPerExercise: ExerciseStats[] | null;
  // Items to check that the teacher has not checked yet, in all the results.
  flaggedCount: number;
}

type ReportExercise = ClassReport['exercises'][number];

// Two exercise lists that the same columns can show: the same ids, each with
// the same maximum, in any order.
export function sameExercises(a: readonly ReportExercise[], b: readonly ReportExercise[]): boolean {
  if (a.length !== b.length) return false;
  const max = new Map(a.map((exercise) => [exercise.id, Math.round(exercise.maxPoints * 100)]));
  return b.every((exercise) => max.get(exercise.id) === Math.round(exercise.maxPoints * 100));
}

// One table of points per exercise in the class report, the CSV and the
// class PDF.
export interface ReportTable {
  variant: TestVariant;
  exercises: ReportExercise[];
  rows: ReportRow[];
}

// The tables of the report: one for the whole class while the CES papers
// share the class columns; else the class papers, then the CES papers with
// the CES exercises. The final scores and grades stay together in the tiles.
export function reportTables(report: Pick<ClassReport, 'exercises' | 'cesExercises' | 'rows'>): ReportTable[] {
  if (report.cesExercises === null) return [{ variant: 'class', exercises: report.exercises, rows: report.rows }];
  return [
    { variant: 'class', exercises: report.exercises, rows: report.rows.filter((row) => row.variant !== 'ces') },
    { variant: 'ces', exercises: report.cesExercises, rows: report.rows.filter((row) => row.variant === 'ces') },
  ];
}
```

- [ ] **Step 40: Edit `shared/stats.ts`**

Find this block:

```ts

export function classStats(report: Pick<ClassReport, 'exercises' | 'rows' | 'missing'>): ClassStats {
  const grades = report.rows.map((row) => row.grade).sort((a, b) => a - b);
  const groups = GRADE_GROUPS.map((group, index) => {
    const until = GRADE_GROUPS[index + 1]?.from ?? Infinity;
    return { label: group.label, count: grades.filter((grade) => grade >= group.from && grade < until).length };
  });
  const perExercise = report.exercises.map((exercise): ExerciseStats => {
    const points = report.rows.flatMap((row) => row.items.filter((item) => item.exerciseId === exercise.id).map((item) => item.points));
    const maxCents = Math.round(exercise.maxPoints * 100);
```

Replace it with:

```ts

// The statistics of each exercise of one table, from the papers of that table.
function exerciseStats(table: Pick<ReportTable, 'exercises' | 'rows'>): ExerciseStats[] {
  return table.exercises.map((exercise): ExerciseStats => {
    const points = table.rows.flatMap((row) => row.items.filter((item) => item.exerciseId === exercise.id).map((item) => item.points));
    const maxCents = Math.round(exercise.maxPoints * 100);
```

- [ ] **Step 41: Edit `shared/stats.ts`**

Find this block:

```ts
  });
  const activeGraded = report.rows.filter((row) => row.active).length;
```

Replace it with:

```ts
  });
}

// The grades are the whole class's, CES papers included; the exercises are
// each table's own.
export function classStats(report: Pick<ClassReport, 'exercises' | 'cesExercises' | 'rows' | 'missing'>): ClassStats {
  const grades = report.rows.map((row) => row.grade).sort((a, b) => a - b);
  const groups = GRADE_GROUPS.map((group, index) => {
    const until = GRADE_GROUPS[index + 1]?.from ?? Infinity;
    return { label: group.label, count: grades.filter((grade) => grade >= group.from && grade < until).length };
  });
  const [classTable, cesTable] = reportTables(report);
  const perExercise = exerciseStats(classTable!);
  const activeGraded = report.rows.filter((row) => row.active).length;
```

- [ ] **Step 42: Edit `shared/stats.ts`**

Find this block:

```ts
    perExercise,
    flaggedCount: report.rows.reduce((total, row) => total + row.flagCount, 0),
```

Replace it with:

```ts
    perExercise,
    cesPerExercise: cesTable ? exerciseStats(cesTable) : null,
    flaggedCount: report.rows.reduce((total, row) => total + row.flagCount, 0),
```

- [ ] **Step 43: Edit `server/db/report.ts`**

Find this block:

```ts
import type { ClassReport, ReportMissing, ReportRow, UploadStatus } from '../../shared/api.ts';
import type { ClassAnalysis, ExerciseList } from '../../shared/schemas.ts';
import { compareStudentNames } from '../../shared/students.ts';
```

Replace it with:

```ts
import type { ClassReport, ReportMissing, ReportRow, UploadStatus } from '../../shared/api.ts';
import type { TestVariant } from '../../shared/files.ts';
import type { ClassAnalysis, ExerciseList } from '../../shared/schemas.ts';
import { sameExercises } from '../../shared/stats.ts';
import { compareStudentNames } from '../../shared/students.ts';
```

- [ ] **Step 44: Edit `server/db/report.ts`**

Find this block:

```ts
// of the class: the test, the graded results, their items, and the active
// students that have no graded result.
export async function getClassReport(db: D1Database, teacherId: number, testId: number): Promise<ClassReport | null> {
```

Replace it with:

```ts
// of the class: the test, the graded results, their items, and the active
// students that have no graded result. The CES papers' columns come from the
// CES list and their own items; when they are not the class columns, the
// report gives them apart (cesExercises).
export async function getClassReport(db: D1Database, teacherId: number, testId: number): Promise<ClassReport | null> {
```

- [ ] **Step 45: Edit `server/db/report.ts`**

Find this block:

```ts
      .prepare(
        `SELECT t.code, t.title, t.status, t.started_at, t.class_id, c.name AS class_name, t.exercise_list_json,
           t.analysis_status, t.analysis_stale, t.analysis_attempts, t.analysis_json
```

Replace it with:

```ts
      .prepare(
        `SELECT t.code, t.title, t.status, t.started_at, t.class_id, c.name AS class_name, t.exercise_list_json, t.ces_exercise_list_json,
           t.analysis_status, t.analysis_stale, t.analysis_attempts, t.analysis_json
```

- [ ] **Step 46: Edit `server/db/report.ts`**

Find this block:

```ts
      .prepare(
        `SELECT s.id AS submission_id, st.id AS student_id, st.full_name, ev.total, ev.max_total, ev.grade,
           ${flagCountSql('ev')} AS flag_count,
```

Replace it with:

```ts
      .prepare(
        `SELECT s.id AS submission_id, st.id AS student_id, st.full_name, st.ces, s.variant, ev.total, ev.max_total, ev.grade,
           ${flagCountSql('ev')} AS flag_count,
```

- [ ] **Step 47: Edit `server/db/report.ts`**

Find this block:

```ts
      .prepare(
        `SELECT s.id AS submission_id, i.exercise_id, i.points, i.max_points, i.label, i.position,
           ev.id AS evaluation_id, ev.created_at AS graded_at,
```

Replace it with:

```ts
      .prepare(
        `SELECT s.id AS submission_id, s.variant, i.exercise_id, i.points, i.max_points, i.label, i.position,
           ev.id AS evaluation_id, ev.created_at AS graded_at,
```

- [ ] **Step 48: Edit `server/db/report.ts`**

Find this block:

```ts
      .prepare(
        `SELECT st.id AS student_id, st.full_name, s.status
         FROM tests t
```

Replace it with:

```ts
      .prepare(
        `SELECT st.id AS student_id, st.full_name, st.ces, s.status
         FROM tests t
```

- [ ] **Step 49: Edit `server/db/report.ts`**

Find this block:

```ts
        exercise_list_json: string | null;
        analysis_status: AnalysisStatus;
```

Replace it with:

```ts
        exercise_list_json: string | null;
        ces_exercise_list_json: string | null;
        analysis_status: AnalysisStatus;
```

- [ ] **Step 50: Edit `server/db/report.ts`**

Find this block:

```ts
  const list = head.exercise_list_json ? (JSON.parse(head.exercise_list_json) as ExerciseList) : null;

```

Replace it with:

```ts
  const list = head.exercise_list_json ? (JSON.parse(head.exercise_list_json) as ExerciseList) : null;
  const cesList = head.ces_exercise_list_json ? (JSON.parse(head.ces_exercise_list_json) as ExerciseList) : null;

```

- [ ] **Step 51: Edit `server/db/report.ts`**

Find this block:

```ts
  const storedItems: StoredItem[] = [];
  for (const row of (items?.results ?? []) as {
    submission_id: number;
    exercise_id: string;
```

Replace it with:

```ts
  const storedItems: StoredItem[] = [];
  const cesItems: StoredItem[] = [];
  for (const row of (items?.results ?? []) as {
    submission_id: number;
    variant: TestVariant | null;
    exercise_id: string;
```

- [ ] **Step 52: Edit `server/db/report.ts`**

Find this block:

```ts
  }[]) {
    storedItems.push({
      evaluationId: row.evaluation_id,
```

Replace it with:

```ts
  }[]) {
    (row.variant === 'ces' ? cesItems : storedItems).push({
      evaluationId: row.evaluation_id,
```

- [ ] **Step 53: Edit `server/db/report.ts`**

Find this block:

```ts
    full_name: string;
    total: number;
```

Replace it with:

```ts
    full_name: string;
    ces: number;
    variant: TestVariant | null;
    total: number;
```

- [ ] **Step 54: Edit `server/db/report.ts`**

Find this block:

```ts
        items: itemsBySubmission.get(row.submission_id) ?? [],
      }),
```

Replace it with:

```ts
        items: itemsBySubmission.get(row.submission_id) ?? [],
        ces: row.ces === 1,
        variant: row.variant === 'ces' ? 'ces' : 'class',
      }),
```

- [ ] **Step 55: Edit `server/db/report.ts`**

Find this block:

```ts
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));
  const notGraded = ((missing?.results ?? []) as { student_id: number; full_name: string; status: UploadStatus | null }[])
    .map((row): ReportMissing => ({ studentId: row.student_id, studentName: row.full_name, status: row.status ?? 'none' }))
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));

```

Replace it with:

```ts
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));
  const notGraded = ((missing?.results ?? []) as { student_id: number; full_name: string; ces: number; status: UploadStatus | null }[])
    .map((row): ReportMissing => ({ studentId: row.student_id, studentName: row.full_name, status: row.status ?? 'none', ces: row.ces === 1 }))
    .sort((a, b) => compareStudentNames(a.studentName, b.studentName));
  const shown = ({ id, label, maxPoints }: { id: string; label: string; maxPoints: number }) => ({ id, label, maxPoints });
  const classColumns = exerciseColumns(list, storedItems).map(shown);
  const cesColumns = cesItems.length > 0 ? exerciseColumns(cesList, cesItems).map(shown) : null;
  // The same columns: one table, from the items of every paper.
  const together = cesColumns === null || sameExercises(classColumns, cesColumns);

```

- [ ] **Step 56: Edit `server/db/report.ts`**

Find this block:

```ts
    },
    exercises: exerciseColumns(list, storedItems).map(({ id, label, maxPoints }) => ({ id, label, maxPoints })),
    rows,
```

Replace it with:

```ts
    },
    exercises: together ? exerciseColumns(list, [...storedItems, ...cesItems]).map(shown) : classColumns,
    cesExercises: together ? null : cesColumns,
    rows,
```

- [ ] **Step 57: Edit `shared/csv.ts`**

Find this block:

```ts
import type { ClassReport, UploadStatus } from './api.ts';
import { round2 } from './scoring.ts';

```

Replace it with:

```ts
import type { ClassReport, ReportRow, UploadStatus } from './api.ts';
import { round2 } from './scoring.ts';
import { reportTables } from './stats.ts';

```

- [ ] **Step 58: Edit `shared/csv.ts`**

Find this block:

```ts

// `statusLabel` names why a student has no result ("Nu a trimis"), in the words of the app.
export function classCsv(report: ClassReport, statusLabel: (status: UploadStatus) => string): string {
  const header = ['Elev', ...report.exercises.map((exercise) => exercise.id), 'Total', 'Nota', 'Observații'].map(csvText);
  const lines = [header.join(SEPARATOR)];
  for (const row of report.rows) {
    const cells = [
      csvText(row.studentName),
      ...report.exercises.map((exercise) => {
        const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
```

Replace it with:

```ts

// The header and the rows of one table of exercises.
function tableLines(exercises: ClassReport['exercises'], rows: ReportRow[]): string[] {
  const header = ['Elev', ...exercises.map((exercise) => exercise.id), 'Total', 'Nota', 'Observații'].map(csvText);
  const lines = [header.join(SEPARATOR)];
  for (const row of rows) {
    const cells = [
      csvText(row.studentName),
      ...exercises.map((exercise) => {
        const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
```

- [ ] **Step 59: Edit `shared/csv.ts`**

Find this block:

```ts
  }
  for (const student of report.missing) {
    const cells = [csvText(student.studentName), ...report.exercises.map(() => ''), '', '', csvText(statusLabel(student.status))];
    lines.push(cells.join(SEPARATOR));
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
```

Replace it with:

```ts
  }
  return lines;
}

// `statusLabel` names why a student has no result ("Nu a trimis"), in the words of the app.
// The CSV is often shared, so it says nothing of the CES mark: when the CES
// papers have their own exercises, they come in a block of their own, after an
// empty line, with their own exercise header.
export function classCsv(report: ClassReport, statusLabel: (status: UploadStatus) => string): string {
  const [classTable, cesTable] = reportTables(report);
  const lines = tableLines(classTable!.exercises, classTable!.rows);
  for (const student of report.missing) {
    const cells = [csvText(student.studentName), ...classTable!.exercises.map(() => ''), '', '', csvText(statusLabel(student.status))];
    lines.push(cells.join(SEPARATOR));
  }
  if (cesTable) lines.push('', ...tableLines(cesTable.exercises, cesTable.rows));
  return `${BOM}${lines.join('\r\n')}\r\n`;
```

- [ ] **Step 60: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
import { formatPoints } from '../../../shared/scoring.ts';
import type { ClassStats } from '../../../shared/stats.ts';
import { pointsLevel, uploadStatusLabel } from '../../ui/format.ts';

```

Replace it with:

```tsx
import { formatPoints } from '../../../shared/scoring.ts';
import type { ExerciseStats, ClassStats, ReportTable } from '../../../shared/stats.ts';
import { pointsLevel, uploadStatusLabel } from '../../ui/format.ts';
import { CesTag } from '../CesTag.tsx';

```

- [ ] **Step 61: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx

// One row for each graded student: the points of each exercise (an item that
// waits for the teacher's check is marked), the total and the grade. An active
// student with no graded paper has a row that says why.
export function ResultsTable({ code, report }: { code: string; report: ClassReport }) {
  return (
```

Replace it with:

```tsx

// One row for each graded student of one table: the points of each exercise
// (an item that waits for the teacher's check is marked), the total and the
// grade. An active student with no graded paper has a row that says why (in the
// class table: `missing` is empty for the CES table).
export function ResultsTable({
  code,
  table,
  missing,
  caption = 'Punctajele elevilor pe exerciții',
}: {
  code: string;
  table: ReportTable;
  missing: ClassReport['missing'];
  caption?: string;
}) {
  const { exercises, rows } = table;
  return (
```

- [ ] **Step 62: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
      <table className="report-table results-table">
        <caption className="sr-only">Punctajele elevilor pe exerciții</caption>
        <thead>
```

Replace it with:

```tsx
      <table className="report-table results-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
```

- [ ] **Step 63: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
            <th scope="col">Elev</th>
            {report.exercises.map((exercise) => (
              <th key={exercise.id} scope="col" className="num" title={exercise.label}>
```

Replace it with:

```tsx
            <th scope="col">Elev</th>
            {exercises.map((exercise) => (
              <th key={exercise.id} scope="col" className="num" title={exercise.label}>
```

- [ ] **Step 64: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
        <tbody>
          {report.rows.map((row) => (
            <tr key={row.submissionId}>
```

Replace it with:

```tsx
        <tbody>
          {rows.map((row) => (
            <tr key={row.submissionId}>
```

- [ ] **Step 65: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
                <Link to={`/teste/${code}/elevi/${row.submissionId}`}>{row.studentName}</Link>
              </th>
              {report.exercises.map((exercise) => {
                const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
```

Replace it with:

```tsx
                <Link to={`/teste/${code}/elevi/${row.submissionId}`}>{row.studentName}</Link>
                {(row.ces || row.variant === 'ces') && <CesTag />}
              </th>
              {exercises.map((exercise) => {
                const item = row.items.find((candidate) => candidate.exerciseId === exercise.id);
```

- [ ] **Step 66: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
          ))}
          {report.missing.map((student) => (
            <tr key={`missing-${student.studentId}`} className="is-muted">
              <th scope="row">{student.studentName}</th>
              <td colSpan={report.exercises.length + 2}>
                {student.status === 'none' ? 'Nu a trimis lucrarea.' : uploadStatusLabel(student.status)}
```

Replace it with:

```tsx
          ))}
          {missing.map((student) => (
            <tr key={`missing-${student.studentId}`} className="is-muted">
              <th scope="row">
                {student.studentName}
                {student.ces && <CesTag />}
              </th>
              <td colSpan={exercises.length + 2}>
                {student.status === 'none' ? 'Nu a trimis lucrarea.' : uploadStatusLabel(student.status)}
```

- [ ] **Step 67: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
// Average points, the share of the maximum (with a bar), and how many students
// got all, some, and none of the points.
export function ExerciseStatsTable({ stats }: { stats: ClassStats }) {
  return (
```

Replace it with:

```tsx
// Average points, the share of the maximum (with a bar), and how many students
// got all, some, and none of the points: of the class table, or of the CES one.
export function ExerciseStatsTable({ perExercise, caption = 'Statistici pe exerciții' }: { perExercise: ExerciseStats[]; caption?: string }) {
  return (
```

- [ ] **Step 68: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
      <table className="report-table">
        <caption className="sr-only">Statistici pe exerciții</caption>
        <thead>
```

Replace it with:

```tsx
      <table className="report-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
```

- [ ] **Step 69: Edit `src/admin/reportPage/ReportTables.tsx`**

Find this block:

```tsx
        <tbody>
          {stats.perExercise.map((exercise) => (
            <tr key={exercise.exerciseId}>
```

Replace it with:

```tsx
        <tbody>
          {perExercise.map((exercise) => (
            <tr key={exercise.exerciseId}>
```

- [ ] **Step 70: Edit `src/admin/pages/ReportPage.tsx`**

Find this block:

```tsx
import { displayClassName } from '../../../shared/classes.ts';
import { classStats } from '../../../shared/stats.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
```

Replace it with:

```tsx
import { displayClassName } from '../../../shared/classes.ts';
import { classStats, reportTables } from '../../../shared/stats.ts';
import { normalizeTestCode } from '../../../shared/tests.ts';
```

- [ ] **Step 71: Edit `src/admin/pages/ReportPage.tsx`**

Find this block:

```tsx
  const stats = classStats(report);
  const counts: Partial<Record<PartId, string>> = {
```

Replace it with:

```tsx
  const stats = classStats(report);
  const [classTable, cesTable] = reportTables(report);
  const counts: Partial<Record<PartId, string>> = {
```

- [ ] **Step 72: Edit `src/admin/pages/ReportPage.tsx`**

Find this block:

```tsx
              </div>
              <ResultsTable code={code} report={report} />
            </section>
```

Replace it with:

```tsx
              </div>
              <ResultsTable code={code} table={classTable!} missing={report.missing} />
              {cesTable && (
                <>
                  <h3 className="report-subhead">Varianta CES</h3>
                  <p className="hint report-subhead-line">Lucrările variantei CES, cu exercițiile ei. Notele lor intră în media clasei.</p>
                  <ResultsTable code={code} table={cesTable} missing={[]} caption="Punctajele elevilor pe exerciții, varianta CES" />
                </>
              )}
            </section>
```

- [ ] **Step 73: Edit `src/admin/pages/ReportPage.tsx`**

Find this block:

```tsx
              </div>
              <ExerciseStatsTable stats={stats} />
            </section>
```

Replace it with:

```tsx
              </div>
              <ExerciseStatsTable perExercise={stats.perExercise} />
              {stats.cesPerExercise && (
                <>
                  <h3 className="report-subhead">Varianta CES</h3>
                  <ExerciseStatsTable perExercise={stats.cesPerExercise} caption="Statistici pe exerciții, varianta CES" />
                </>
              )}
            </section>
```

- [ ] **Step 74: Edit `src/admin/pdf/classPdf.ts`**

Find this block:

```ts
import { formatPoints } from '../../../shared/scoring.ts';
import { classStats } from '../../../shared/stats.ts';
import { formatDate, uploadStatusLabel } from '../../ui/format.ts';
```

Replace it with:

```ts
import { formatPoints } from '../../../shared/scoring.ts';
import { classStats, type ExerciseStats, reportTables, type ReportTable } from '../../../shared/stats.ts';
import { formatDate, uploadStatusLabel } from '../../ui/format.ts';
```

- [ ] **Step 75: Edit `src/admin/pdf/classPdf.ts`**

Find this block:

```ts

// One block of the results table: the students and a part of the exercises.
// The last block also holds the total and the grade.
function resultsTable(report: ClassReport, exerciseIds: string[], last: boolean): Content {
  const exercises = report.exercises.filter((exercise) => exerciseIds.includes(exercise.id));
  const header: TableCell[] = [headerCell('Elev'), ...exercises.map((exercise) => ({ ...headerCell(exercise.id), alignment: 'center' as const }))];
  if (last) header.push(headerCell('Total'), headerCell('Nota'));
  const body: TableCell[][] = report.rows.map((row) => {
    const cells: TableCell[] = [{ text: row.studentName, fontSize: 9 }];
```

Replace it with:

```ts

// One block of a results table: the students and a part of the exercises.
// The last block also holds the total and the grade.
function resultsTable(table: ReportTable, exerciseIds: string[], last: boolean): Content {
  const exercises = table.exercises.filter((exercise) => exerciseIds.includes(exercise.id));
  const header: TableCell[] = [headerCell('Elev'), ...exercises.map((exercise) => ({ ...headerCell(exercise.id), alignment: 'center' as const }))];
  if (last) header.push(headerCell('Total'), headerCell('Nota'));
  const body: TableCell[][] = table.rows.map((row) => {
    const cells: TableCell[] = [{ text: row.studentName, fontSize: 9 }];
```

- [ ] **Step 76: Edit `src/admin/pdf/classPdf.ts`**

Find this block:

```ts

const list = (title: string, entries: string[]): Content[] =>
```

Replace it with:

```ts

// A results table in blocks of at most BLOCK exercises.
function resultsBlocks(table: ReportTable): Content[] {
  const blocks = chunks(
    table.exercises.map((exercise) => exercise.id),
    BLOCK,
  );
  if (blocks.length === 0) return [resultsTable(table, [], true)];
  return blocks.map((ids, index) => resultsTable(table, ids, index === blocks.length - 1));
}

// The statistics of each exercise of one table.
function exerciseTable(perExercise: ExerciseStats[]): Content {
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
      body: [
        ['Exercițiul', 'Media', '% din maxim', 'Tot', 'Parțial', 'Nimic'].map(headerCell),
        ...perExercise.map((exercise): TableCell[] => [
          { text: `${exercise.exerciseId} · ${exercise.label}`, fontSize: 9 },
          { text: exercise.averagePoints === null ? dash : `${formatPoints(exercise.averagePoints)} din ${formatPoints(exercise.maxPoints)}`, fontSize: 9 },
          { text: exercise.averagePercent === null ? dash : `${exercise.averagePercent}%`, fontSize: 9 },
          { text: String(exercise.full), fontSize: 9 },
          { text: String(exercise.partial), fontSize: 9 },
          { text: String(exercise.zero), fontSize: 9 },
        ]),
      ],
    },
    layout: 'lightHorizontalLines',
  };
}

const list = (title: string, entries: string[]): Content[] =>
```

- [ ] **Step 77: Edit `src/admin/pdf/classPdf.ts`**

Find this block:

```ts
    exercises: source.exercises.map((exercise) => ({ ...exercise, id: pdfText(exercise.id), label: pdfText(exercise.label) })),
    rows: source.rows.map((row) => ({ ...row, items: row.items.map((item) => ({ ...item, exerciseId: pdfText(item.exerciseId) })) })),
```

Replace it with:

```ts
    exercises: source.exercises.map((exercise) => ({ ...exercise, id: pdfText(exercise.id), label: pdfText(exercise.label) })),
    cesExercises: source.cesExercises && source.cesExercises.map((exercise) => ({ ...exercise, id: pdfText(exercise.id), label: pdfText(exercise.label) })),
    rows: source.rows.map((row) => ({ ...row, items: row.items.map((item) => ({ ...item, exerciseId: pdfText(item.exerciseId) })) })),
```

- [ ] **Step 78: Edit `src/admin/pdf/classPdf.ts`**

Find this block:

```ts

export function classPdf(source: ClassReport): TDocumentDefinitions {
```

Replace it with:

```ts

// With CES papers that have their own exercises, their table and statistics
// come after the class ones, under "Varianta CES": the class PDF is for the
// teacher only.
export function classPdf(source: ClassReport): TDocumentDefinitions {
```

- [ ] **Step 79: Edit `src/admin/pdf/classPdf.ts`**

Find this block:

```ts
  const stats = classStats(report);
  const blocks = chunks(
    report.exercises.map((exercise) => exercise.id),
    BLOCK,
  );
  const anyFlagged = report.rows.some((row) => row.items.some((item) => item.flagged));
```

Replace it with:

```ts
  const stats = classStats(report);
  const [classTable, cesTable] = reportTables(report);
  const anyFlagged = report.rows.some((row) => row.items.some((item) => item.flagged));
```

- [ ] **Step 80: Edit `src/admin/pdf/classPdf.ts`**

Find this block:

```ts
    { text: 'Rezultatele elevilor', style: 'h2' },
    ...blocks.map((ids, index) => resultsTable(report, ids, index === blocks.length - 1)),
    ...(blocks.length === 0 ? [resultsTable(report, [], true)] : []),
    ...(anyFlagged ? [{ text: 'Fundalul galben marchează punctajele încă în verificare.', color: MUTED, fontSize: 9 } as Content] : []),
    { text: 'Pe exerciții', style: 'h2' },
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
        body: [
          ['Exercițiul', 'Media', '% din maxim', 'Tot', 'Parțial', 'Nimic'].map(headerCell),
          ...stats.perExercise.map((exercise): TableCell[] => [
            { text: `${exercise.exerciseId} · ${exercise.label}`, fontSize: 9 },
            { text: exercise.averagePoints === null ? dash : `${formatPoints(exercise.averagePoints)} din ${formatPoints(exercise.maxPoints)}`, fontSize: 9 },
            { text: exercise.averagePercent === null ? dash : `${exercise.averagePercent}%`, fontSize: 9 },
            { text: String(exercise.full), fontSize: 9 },
            { text: String(exercise.partial), fontSize: 9 },
            { text: String(exercise.zero), fontSize: 9 },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    },
  ];
```

Replace it with:

```ts
    { text: 'Rezultatele elevilor', style: 'h2' },
    ...resultsBlocks(classTable!),
    ...(cesTable ? [{ text: 'Varianta CES', style: 'h3' } as Content, ...resultsBlocks(cesTable)] : []),
    ...(anyFlagged ? [{ text: 'Fundalul galben marchează punctajele încă în verificare.', color: MUTED, fontSize: 9 } as Content] : []),
    { text: 'Pe exerciții', style: 'h2' },
    exerciseTable(stats.perExercise),
    ...(stats.cesPerExercise ? [{ text: 'Varianta CES', style: 'h3' } as Content, exerciseTable(stats.cesPerExercise)] : []),
  ];
```

- [ ] **Step 81: Edit `src/ui/brand.css`**

Find this block:

```css
   line. */
table.results-table {
```

Replace it with:

```css
   line. */
/* "Varianta CES" in the class report: the CES papers' own table, under the class one. */
.report-subhead {
  margin: 1.25rem 0 0.25rem;
  font-size: 1rem;
}

.report-subhead-line {
  margin: 0 0 0.5rem;
}

table.results-table {
```

- [ ] **Step 82: Typecheck and run every test**

Run: `npm run typecheck`, then `npm test`
Expected: no type error; `Test Files  136 passed | 1 skipped (137)`, `Tests  2150 passed | 3 skipped (2153)`.

- [ ] **Step 83: Commit**

```bash
git add shared/api.ts shared/stats.ts shared/stats.test.ts shared/csv.ts shared/csv.test.ts server/db/report.ts server/routes/report.test.ts src/admin/reportPage/ReportTables.tsx src/admin/pages/ReportPage.tsx src/admin/pages/ReportPage.test.tsx src/admin/pdf/classPdf.ts src/admin/pdf/pdf.test.ts src/admin/testPage/ResultsPanel.test.tsx src/ui/brand.css
git commit -m "Give the CES papers their own table in the class report when their exercises differ"
```

### Task 8: Write down the CES variant

The rules of the four `AGENTS.md` files, and the spec's line about a reset (ruling 2).

**Files:**
- Modify: `AGENTS.md`, `server/AGENTS.md`, `runner/AGENTS.md`, `src/AGENTS.md`, `docs/superpowers/specs/2026-11-09-ces-variant-design.md`

- [ ] **Step 1: Edit `AGENTS.md`**

Find this block:

```markdown
- A generated barem ("Generează baremul", a robot job) is unchecked until the teacher confirms it; `BAREM_ACTIVE` (`server/db/lifecycle.ts`) keeps an unchecked or generating barem out of every evaluation start. A barem the teacher uploads is always active.
- Every path that makes work for the robot starts it (`startRobot`): the GitHub schedule does not fire. This includes "Regenerează" (the class analysis).
```

Replace it with:

```markdown
- A generated barem ("Generează baremul", a robot job) is unchecked until the teacher confirms it; `BAREM_ACTIVE` (`server/db/lifecycle.ts`) keeps an unchecked or generating barem out of every evaluation start. A barem the teacher uploads is always active.
- The CES variant (`docs/superpowers/specs/2026-11-09-ces-variant-design.md`, migration 0024): a student marked CES (`students.ces`) gets the test's CES variant when it has one, an adapted test with its own barem, list and print PDF (the `ces_*` columns of `tests`, named through `columns(variant)` in `server/db/variant.ts`). A paper's variant is written when it first goes to grading (`submissions.variant`, `paperVariantSql`) and never changes after. A CES paper waits, sent, until the CES barem is active; the class papers are graded meanwhile. No student page, student PDF, robot text for the student or CSV says "CES".
- Every path that makes work for the robot starts it (`startRobot`): the GitHub schedule does not fire. This includes "Regenerează" (the class analysis).
```

- [ ] **Step 2: Edit `server/AGENTS.md`**

Find this block:

```markdown
- The robot reads a draft or open test only while it is a print job (`NEEDS_PRINT` in `db/runner.ts`), checked in SQL, and the print PDF is stored only with the run's lease and the current `files_version`.
- A test gets its `upload_token` in its INSERT (`createTest`), so a draft has its print PDF; Start test keeps it (`COALESCE`, for a draft made before that). A draft made before that gets one at Start, with a new test file (`saveTestFile`), or with "Pregătește testul cu cod QR" (`retryPrint`). Stop test (`stopTest`: open → draft, clears `started_at` and `evaluation_at`) checks in its SQL that the test was never evaluated (`evaluation_started_at IS NULL`) and that no upload of the test has a file or is past `uploading` (`NO_STUDENT_FILES`); a student file that lands at the same moment checks the open test in its own SQL (`OPEN_UPLOAD`), so one of the two is refused. Student writes on a draft answer 409 `not_started`.
```

Replace it with:

```markdown
- The robot reads a draft or open test only while it is a print job (`NEEDS_PRINT` in `db/runner.ts`), checked in SQL, and the print PDF is stored only with the run's lease and the current `files_version`.
- The CES variant (migration 0024): every column of the test file, the barem, its comments and request, the exercise list and the print PDF has a `ces_` twin, with its own `ces_files_version`; the queries that serve both take a `variant` and name their columns with `columns(variant)` (`db/variant.ts`, also `needsPrintSql`, `needsBaremSql`, `baremActiveSql`, `paperVariantSql`). The teacher's CES routes are `/api/admin/tests/:code/ces/…` (`routes/cesVariant.ts`); a CES file or comment change is refused only while a CES paper is in grading, and a CES barem may be generated until the test is done. The robot's routes take `?variant=ces` (none: the class test, as an older robot asks); `/tasks` lists `cesPrints`, `cesBarems` and `cesExerciseLists`. The CES list waits for an active CES barem, the class list and a CES paper (`NEEDS_CES_EXERCISE_LIST`). `GRADABLE` holds a CES paper back until its CES barem is active and its CES list usable, and the claim checks it again and writes `submissions.variant` in the same UPDATE; `findGrading` checks a result against the list of the paper's variant. "Șterge varianta CES" (`removeCesVariant`) checks in its SQL that no paper has the variant `ces`. The report gives the CES columns apart (`cesExercises`) only when they are not the class ones (`sameExercises` in `shared/stats.ts`); the class analysis gets each paper's `variant` and the CES exercises.
- A test gets its `upload_token` in its INSERT (`createTest`), so a draft has its print PDF; Start test keeps it (`COALESCE`, for a draft made before that). A draft made before that gets one at Start, with a new test file (`saveTestFile`), or with "Pregătește testul cu cod QR" (`retryPrint`). Stop test (`stopTest`: open → draft, clears `started_at` and `evaluation_at`) checks in its SQL that the test was never evaluated (`evaluation_started_at IS NULL`) and that no upload of the test has a file or is past `uploading` (`NO_STUDENT_FILES`); a student file that lands at the same moment checks the open test in its own SQL (`OPEN_UPLOAD`), so one of the two is refused. Student writes on a draft answer 409 `not_started`.
```

- [ ] **Step 3: Edit `runner/AGENTS.md`**

Find this block:

```markdown
- `baremTask.ts` writes a barem from the test file (Claude in mode `barem`, then `baremDocx.ts` and pandoc make the Word file). A pandoc failure or a file the API refuses counts a crash; a missing pandoc stops the run. A barem that ended other than `retry` is tried once per run, and a failed one counts in the failures in a row.
- `printTask.ts` makes the print PDF through the Docker image in `print/`. The image pins LibreOffice and installs only Liberation, Carlito, and Caladea fonts: other fonts (Noto, DejaVu) change "∖" into "∣" and move the layout. `QE_PRINT_IMAGE_TESTS=1` runs the container tests (`print/container.test.ts`, slow the first time). Never log the upload token or a script's output.
```

Replace it with:

```markdown
- `baremTask.ts` writes a barem from the test file (Claude in mode `barem`, then `baremDocx.ts` and pandoc make the Word file). A pandoc failure or a file the API refuses counts a crash; a missing pandoc stops the run. A barem that ended other than `retry` is tried once per run, and a failed one counts in the failures in a row.
- The CES variant: the print, the barem, the exercise list and the grading take a `variant`; "ces" asks the API with `?variant=ces` and puts `ces.md` in the work folder (`CES_NOTE`), and the CES barem and list jobs also get `class/exercises.json` (and `class/barem.*` for a barem), so the CES list reuses the class exercise ids. A claim names the paper's variant. Each kind of CES work is tried by the same rules as the class work, after it, in the same round.
- `printTask.ts` makes the print PDF through the Docker image in `print/`. The image pins LibreOffice and installs only Liberation, Carlito, and Caladea fonts: other fonts (Noto, DejaVu) change "∖" into "∣" and move the layout. `QE_PRINT_IMAGE_TESTS=1` runs the container tests (`print/container.test.ts`, slow the first time). Never log the upload token or a script's output.
```

- [ ] **Step 4: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded. `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa") and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

Replace it with:

```markdown
- `classPage/GradesTable.tsx` is the class page's grade table, in a card (students by tests, the oldest test on the left, a 156px column per test headed by its name and "date · state", orange when the test waits; a cell shows the grade, orange with a dot when points wait, the upload's state, or "—" when no paper was sent; the last row is "Media testului", no per-student average; draft and open tests keep a column; archived tests show only when asked). `classPage/ClassTests.tsx` is "Testele clasei", beside the table (under it below 1180px): the newest test first, each with its date, the papers sent, its stage (orange when it waits) and its one next step (from `testsPage/nextStep.ts`, the button that publishes the results included; filled blue when it waits), and the toggle "Arată și testele arhivate (n)" that reveals the archived tests in the table too. `classPage/ClassStudents.tsx` is the "Elevi" tab, one card split in two (stacked below 760px): the students on the left (search that ignores case and diacritics, orange dot when points wait, "+ Adaugă elevi"), the chosen student on the right (the first one at first; "Redenumește", "A plecat din clasă", "Șterge"; a table of the class's tests with the date, the points, the grade and "N puncte de verificat", the result ("Publicat", "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea."), and "Lucrarea"; link "Toate notele elevului, din toate clasele"). An archived class is the same page, read only (`readOnly` on `GradesTable`, `ClassTests` and `ClassStudents`): a strip "Clasă arhivată." with "Scoate din arhivă" above the head (one write with ⋯'s item), the tag "Arhivată" first in the facts, no "Test nou pentru această clasă", no "+ Adaugă elevi", no "Redenumește", "A plecat din clasă" or "Șterge" for a student, nothing orange, and "Raportul clasei" as each test's one step once a paper is graded. `classPage/ClassDialogs.tsx` holds the class page's dialogs: "Clasă nouă" (the name and the students, one per line, in one step; a class made before its students failed is not made twice), "Adaugă elevi" (early warnings for names already in the class or pasted twice), and the rename of a class or a student. They use `Modal.tsx`, the app's dialog: a title, ×, a dimmed backdrop, the focus on the first field and kept inside, Esc (in the capture phase, before a panel), and the focus back to the opener (or to `returnFocus` when the opener closed with its menu). `pages/ClassPage.tsx` is the class page (`/clase/:id`): the top line (the name, "Schimbă clasa" with the classes of the year, the current one marked, a dot for one that waits, the archived classes last in their muted group "Arhivate" (the only list that leads to them; an archived class's ⋯ has "Scoate din arhivă"), and "+ Clasă nouă"; the facts; "Test nou pentru această clasă"; ⋯ with "Redenumește clasa"/"Arhivează clasa") and the two tabs ("Elevi" with its count). `pages/LastClassPage.tsx` is `/clase`: it opens the last class the teacher saw (kept in `localStorage` as `quickeval:lastClass`, else the first active one of the year), or, with no active class, offers "+ Clasă nouă" and links the archived classes. A link's state (`ClassLinkState`) goes on to that class page: `{ newClass: true }` (the panel's "+ Clasă nouă") opens that dialog on arrival, `{ archived: true }` (the panel's "Arhivate (n)") opens "Schimbă clasa" at "Arhivate". The old "page with all classes" (`ClassesPage`) and `ClassStudentsPage` no longer exist.
- The CES variant: `CesTag.tsx` is the mark next to a CES student's name in every teacher table that lists students (the class page's two tabs, the papers table, the links table, the class report); `testPage/CesVariant.tsx` holds "Varianta CES" in Pregătire (shown while the class has a CES student or the variant has a file: its own `TestFiles` with `variant="ces"`, the total warning, "Șterge varianta CES") and the notice of the CES papers that wait for their barem in Corectare (`CesWaiting`); `testPage/variant.ts` picks a variant's parts of a test. `TestFiles`, `useGeneratedBarem`, `PrintTest` and `ExerciseListBanner` take `variant`. The class report, its CSV and the class PDF draw the tables of `reportTables` (`shared/stats.ts`): one, or the class papers then the CES papers with their own exercises; the CSV never names CES.
- `testPage/PrintTest.tsx` shows the test with the QR code ("Testul pentru tipărit") on a draft and an open test, its failure and retry, and "Pregătește testul cu cod QR" for a draft made before tests got their link at once. `TestActions` in `testPage/StagePanel.tsx` (the panel În clasă) holds "Începe testul" and "Oprește testul" (only while no upload has a file and the test was never evaluated). The student app also shows that screen when a name pick answers `not_started` (the test was stopped meanwhile). The student app shows "Testul nu a început încă." for a draft's link (the printed QR code is scanned before the start).
```

- [ ] **Step 5: Edit `docs/superpowers/specs/2026-11-09-ces-variant-design.md`**

Find this block:

```markdown
- A paper's variant is fixed when the paper first goes to grading: a CES paper if the student is marked CES and the test has a CES variant at that moment, a class paper otherwise. It is written on the submission.
- A regrade, a retry and a reset keep the paper's variant. Removing or adding the CES mark later does not change papers that already went to grading; it changes only papers that have not yet gone.
- A CES student on a test with no CES variant is graded as a class paper, with the class test and barem. (Teacher's choice: the variant is optional.)
```

Replace it with:

```markdown
- A paper's variant is fixed when the paper first goes to grading: a CES paper if the student is marked CES and the test has a CES variant at that moment, a class paper otherwise. It is written on the submission.
- A regrade and a retry keep the paper's variant. A reset deletes the paper, so the student's next paper gets its variant when it goes to grading. Removing or adding the CES mark later does not change papers that already went to grading; it changes only papers that have not yet gone.
- A CES student on a test with no CES variant is graded as a class paper, with the class test and barem. (Teacher's choice: the variant is optional.)
```

- [ ] **Step 6: Run every test**

Run: `npm test`
Expected: `Test Files  136 passed | 1 skipped (137)`, `Tests  2150 passed | 3 skipped (2153)`.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md server/AGENTS.md runner/AGENTS.md src/AGENTS.md docs/superpowers/specs/2026-11-09-ces-variant-design.md
git commit -m "Write down the CES variant in the AGENTS.md files and the spec"
```

### Task 9: Check, live database, push (main session only)

- [ ] **Step 1: Run every test once more, in UTC**

Run (Git Bash): `TZ=UTC npm test`
Expected: `Test Files  136 passed | 1 skipped (137)`, `Tests  2150 passed | 3 skipped (2153)`.

- [ ] **Step 2: Look at the pages in the browser**

Run `npm run db:local` and `npm run build`; load the sample of the prototype check (a class with a CES student, a done test whose CES papers have their own exercises, an evaluating test whose CES paper waits for its barem, a draft with a generated CES barem to check) into the local database with `npx wrangler d1 execute quickeval --local --file <sample.sql>`, start `npm run preview`, and look at: the class page (both tabs, the CES mark), Pregătire of the draft ("Varianta CES", "Am verificat baremul CES"), Tipărire (the CES download), Corectare of the evaluating test (the waiting notice), and the class report of the done test (the CES table and its statistics), at desktop width and at 375 px (no sideways scroll). Stop the preview and end the leftover `workerd.exe` (root `AGENTS.md`, Gotchas).

- [ ] **Step 3: Run the migration on the live database — ask the user first**

Run: `npx wrangler d1 migrations list quickeval --remote`
Expected: only `0024_ces_variant.sql` to apply. If another migration is listed, stop and ask the user.

Ask the user, then run: `npx wrangler d1 migrations apply quickeval --remote`
Expected: `0024_ces_variant.sql` applied. Only then may the code reach `main`.

- [ ] **Step 4: Push and open the pull request — ask the user first**

Ask the user, then push `feature/ces-variant` and open a pull request to `main` with a body that lists the eight commits, the migration, and the deferred items of ruling 9.
