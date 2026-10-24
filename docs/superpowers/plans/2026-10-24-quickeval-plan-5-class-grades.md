# Plan 5: class grade table, students page, test archive, Teste filters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task (the user chose subagent-driven execution on 2026-10-24). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the class page a grade table (students × tests, newest test on the left), move the rare student actions to their own page, let the teacher delete a student added by mistake and archive finished tests, refuse duplicate student names, and make the Teste page filterable by class, coloured by class, and able to publish results.

**Architecture:** The API gains one class-grades query (inside `GET /classes/:id`), a guarded student delete, a guarded test archive (migration `0013`), and name-duplicate guards inside the two student writes. The teacher app gains `pages/ClassStudentsPage.tsx`, `classPage/GradesTable.tsx`, a class colour helper, and new controls on `TestsPage.tsx`, `TestPage.tsx` and the report table. Every rule is checked inside its own SQL statement, as the rest of the API does.

**Tech Stack:** Hono on Cloudflare Pages Functions, D1 (SQLite), React 19 + React Router + TanStack Query, zod, Vitest (projects "web" and "node").

**Spec:** `docs/superpowers/specs/2026-10-06-quickeval-design.md` (§7.1, §9, §11.1, §14.2). Task 1 writes this plan's behaviour into the spec first.

**How this plan was made:** from the code at `main` 837691c, with no prototype. Plans 1–4b were built from a tested scratchpad prototype and a byte-exact replay (memory: plan-writing-method). Do that pass before execution if you want exact Edit steps; this plan gives interfaces, SQL guards, tests and copy, and leaves the bodies to the implementer.

## Global Constraints

- All user-facing text is Romanian; code, comments and docs are English. The API reports errors as `{ error, message }`; the UI shows `message`.
- Every teacher query is scoped by the teacher's id. Ids from URLs go through `parseId`, test codes through `parseTestCode`.
- Each write checks its own rules inside its SQL statement, never in a read before the write. When a guard `EXISTS` reads a row that the same batch deletes, the guarded statement runs first.
- Ids come back after a delete (`INTEGER PRIMARY KEY`, no `AUTOINCREMENT`; `addStudentsToClass` takes `MAX(id) + 1`). A by-id write from a page names what the page showed and checks it in its SQL.
- At most 15 D1 queries and 10 ms CPU per request. Group writes with `db.batch()`.
- Every `/api/admin` router keeps the `promoteDue` middleware (new routes go inside the existing routers).
- Migrations: numbered, one statement per `;` at a line end, no `;` inside strings. A new migration runs on the live database before the code that needs it reaches `main` (`docs/deploy.md`).
- Times are ISO 8601 UTC strings, shown in Europe/Bucharest time.
- Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no parameter properties.
- Dark colours in `src/ui/brand.css` are written twice (the `[data-theme="dark"]` block and the `prefers-color-scheme` block); keep both copies equal.
- Code comments name no ticket or issue numbers. Commits carry no AI attribution lines.
- The class PDF (`src/admin/pdf/classPdf.ts`) and the CSV (`shared/csv.ts`) keep their column order. Only the report page table changes order.

## Decisions taken in this plan (the user can flip them)

- **Delete a student**: allowed when the student has no upload in this class's tests that is `submitted`, `grading` or `graded`. The student's `uploading` and `failed` uploads in this class go with the student (rows and R2 files), and so does this class's enrollment. The `students` row is never deleted: `addStudentsToClass` takes `MAX(id) + 1`, so a deleted row would hand its id to the next student, and rename, "A plecat", the upload name picker and `/elevi/:id` all name a student by plain id. The left-over row shows nowhere: every list and check goes through `enrollments`.
- **Duplicate names**: compared after `cleanStudentName`, ignoring letter case (ASCII and the Romanian letters Ă Â Î Ș Ț) and treating the cedilla forms Ş Ţ as Ș Ț. Diacritics still count: "Stefan" and "Ștefan" are two names. Students who left ("a plecat") count. No UNIQUE index: the live database already holds duplicates.
- **Archive a test**: only a `done` test. Every status change away from `done` clears the mark (Reopen, Recorectează tot, the regrade of one upload), so an archived test is never open or being graded. Archiving does not change published results.
- **Report table**: Elev, Nota, Total, then the exercises.
- **Class colour**: `classId % 8`, stable for the life of the class.

## Review Focus

1. **Uppercase Romanian letters**: "ȘTEFAN ANA" must be refused when "Ștefan Ana" is in the class. SQLite `lower()` folds ASCII only. Pinned in Task 2 (JS and SQL agree on every letter) and Task 3.
2. **A reused student id**: delete the newest student, then add one. The new student must get a higher id than the deleted one, or a stale page (rename, "A plecat", the student app's name picker) would act on the wrong child. Pinned in Task 4.
3. **A paste that holds one duplicate among 30 names**: nothing is added, and the message names the duplicate. A half-added list would be worse. Pinned in Task 3.
4. **Draft and open tests in the class table**: they have no grades but must keep a column (with the status chip), or the class page loses its way to them. Pinned in Task 7.
5. **Phone width**: the grade table and the report table scroll inside `.table-wrap`, and the name column stays in view. Checked in Task 10 in the browser pane.

---

### Task 1: Spec and AGENTS.md

**Files:**
- Modify: `docs/superpowers/specs/2026-10-06-quickeval-design.md` (§7.1 tests table, §9 pages table and text, §11.1 routes table, §14.2)
- Modify: `src/AGENTS.md` (Structure: `classPage/`, `pages/ClassStudentsPage.tsx`, `ui/classTone.ts`), `server/AGENTS.md` (Rules: student delete and name guards)

- [ ] **Step 1: Write the spec changes**
  - §7.1 `tests`: add `archived INTEGER NOT NULL DEFAULT 0` (migration 0013) with one line: only a `done` test is archived; Start and Reopen clear it.
  - §9 pages table:
    - `/admin/` Teste: class filter (`?clasa=<id>`), "Arată și testele arhivate" (`?arhivate=1`), a colour stripe per class, a results line with "Publică rezultatele" / "Oprește accesul", a "Raportul clasei" link when a result is graded.
    - `/admin/clase/:id`: the grade table (rows = students, columns = tests, newest on the left, archived tests hidden unless shown), buttons "Redenumește clasa", "Elevii clasei", "Test nou pentru această clasă".
    - new row `/admin/clase/:id/elevi` "Elevii clasei": add students, rename, "A plecat" / "Revine în clasă", "Șterge".
    - Test page: "Raportul clasei" button in the head when a result is graded; "Arhivează testul" / "Scoate din arhivă".
  - §11.1 routes: `GET /classes/:id` answers `grades` too; `DELETE /classes/:id/students/:studentId` (removes the enrollment, never the student row); `POST /tests/:code/archive`, `POST /tests/:code/unarchive`; add-students and rename refuse a name already in the class (409 `student_exists`).
  - §14.2: the page's students table shows Elev, Nota, Total, then the exercises; the PDF and CSV keep their order.
- [ ] **Step 2: Update the two AGENTS.md files** with the new files and the rules above (delete guard, name key, archive rule).
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-06-quickeval-design.md src/AGENTS.md server/AGENTS.md
git commit -m "Describe the class grade table, the students page, test archive and Teste filters in the spec"
```

---

### Task 2: Student name key (JS and SQL twins)

**Files:**
- Modify: `shared/students.ts`
- Test: `shared/students.test.ts`, `server/db/students.test.ts`

**Interfaces:**
- Produces:
  - `studentNameKey(name: string): string` in `shared/students.ts`.
  - `studentNameKeySql(column: string): string` in `shared/students.ts`: an SQL expression that gives the same key for a column holding a cleaned name.
  - `cleanStudentName` now also applies `normalize('NFC')` first (so a pasted decomposed "Ș" is one letter).

**Approach:** both functions are built from ONE table, so they agree by construction:

```ts
// Uppercase letters that SQLite's lower() does not fold, with their key form,
// and the cedilla forms that Romanian lists still use for ș and ț.
const NAME_KEY_FOLDS: readonly (readonly [string, string])[] = [
  ['Ă', 'ă'], ['Â', 'â'], ['Î', 'î'], ['Ș', 'ș'], ['Ț', 'ț'],
  ['Ş', 'ș'], ['ş', 'ș'], ['Ţ', 'ț'], ['ţ', 'ț'],
];
```

- JS: ASCII `A-Z` to lowercase (`/[A-Z]/g`), then each fold pair. Do NOT use `toLocaleLowerCase` (it folds letters SQL cannot).
- SQL: `lower(column)` wrapped in one `replace(…, 'X', 'y')` per pair. The letters are fixed literals from the table, never user text.

- [ ] **Step 1: Write the failing tests**

In `shared/students.test.ts`:

```ts
describe('studentNameKey', () => {
  it('ignores case, also for Romanian letters', () => {
    expect(studentNameKey('ȘTEFAN ĂNA ÎON ȚICU ÂRON')).toBe(studentNameKey('ștefan ăna îon țicu âron'));
    expect(studentNameKey('Pop Ion')).toBe('pop ion');
  });
  it('treats the cedilla letters as comma letters', () => {
    expect(studentNameKey('Şerban Ţuţu')).toBe(studentNameKey('Șerban Țuțu'));
  });
  it('keeps diacritics apart from plain letters', () => {
    expect(studentNameKey('Stefan')).not.toBe(studentNameKey('Ștefan'));
  });
});

it('cleanStudentName joins a decomposed letter into one', () => {
  expect(cleanStudentName('Ștefan')).toBe('Ștefan');
});
```

In `server/db/students.test.ts` (it already runs against the local D1): for every string in `['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'ĂÂÎȘȚŞŢ', 'ăâîșțşţ', 'BANU G.A. DANIEL', 'Ștefan-Țuțu']`, `SELECT ${studentNameKeySql('?1')} AS key` (bind the string) equals `studentNameKey(string)`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run shared/students.test.ts server/db/students.test.ts`
Expected: FAIL, `studentNameKey is not a function` / `studentNameKeySql is not a function`.

- [ ] **Step 3: Implement** `studentNameKey`, `studentNameKeySql` and the NFC step in `cleanStudentName`, as above.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run shared/students.test.ts server/db/students.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/students.ts shared/students.test.ts server/db/students.test.ts
git commit -m "Add a student name key that ignores case, with an SQL twin"
```

---

### Task 3: Refuse duplicate names on add and rename

**Files:**
- Modify: `shared/api.ts` (`addStudentsBody`), `server/db/students.ts` (`addStudentsToClass`, `renameStudent`), `server/routes/classes.ts`, `server/routes/students.ts`
- Modify: `src/test/fakeApi.ts` (`addStudents`, `renameStudent` refuse like the server)
- Test: `shared/api.test.ts`, `server/routes/classes.test.ts`, `server/routes/students.test.ts`

**Interfaces:**
- Consumes: `studentNameKey`, `studentNameKeySql` (Task 2).
- Produces:
  - Error `409 student_exists`. Message for one name: `Elevul „<nume>” este deja în clasă.` For more: `Elevii „<n1>”, „<n2>” sunt deja în clasă.` (at most 3 names, then `și încă <k>`).
  - Error `409 student_exists` on rename: `Există deja un elev cu numele „<nume>” în clasa <displayClassName>.` (the first class found).
  - `addStudentsBody` refuses a name twice in one list: `Numele „<nume>” apare de două ori în listă.` (400).
  - `renameStudent(db, teacherId, studentId, fullName)` returns `{ id, fullName } | null | 'duplicate'`; the route maps `'duplicate'` to the 409 (read the class name for the message after the write changed nothing).

**SQL guards** (the algorithm the tests do not fix):
- `addStudentsToClass`: each JSON row carries `key: studentNameKey(fullName)`. BOTH inserts get the same extra guard, so either both insert or neither does:
  `AND NOT EXISTS (SELECT 1 FROM json_each(?) n JOIN enrollments e ON e.class_id = ? JOIN students s ON s.id = e.student_id WHERE ${studentNameKeySql('s.full_name')} = json_extract(n.value, '$.key'))`.
  When `inserted === 0`: if the class is not the teacher's, 404 as now; else read the class's names, find the duplicates with `studentNameKey`, and throw `student_exists` (this read only builds the message).
- `renameStudent`: `UPDATE … WHERE id = ? AND teacher_id = ? AND NOT EXISTS (SELECT 1 FROM enrollments mine JOIN enrollments other ON other.class_id = mine.class_id JOIN students s ON s.id = other.student_id WHERE mine.student_id = ? AND s.id <> ? AND ${studentNameKeySql('s.full_name')} = ?) RETURNING id`. A student may change the case of their own name.

- [ ] **Step 1: Write the failing tests**
  - `shared/api.test.ts`: `addStudentsBody.safeParse({ names: ['Pop Ion', 'POP  ION'] })` fails with `Numele „POP ION” apare de două ori în listă.`
  - `server/routes/classes.test.ts`:
    - `refuses a name already in the class, whatever its case`: class with `Ștefan Ana`; POST `{ names: ['Marin Dan', 'ȘTEFAN ANA'] }` → 409, `error: 'student_exists'`, message `Elevul „ȘTEFAN ANA” este deja în clasă.`; then GET the class: still 1 student (Marin Dan was not added).
    - `refuses a name of a student who left`: mark the student left, add the same name → 409.
    - `allows the same name in another class`: → 201.
    - `refuses a cedilla twin`: class with `Șerban Ion`, add `Şerban Ion` → 409.
  - `server/routes/students.test.ts`:
    - `refuses a rename to a name already in one of the student's classes` → 409 `student_exists`, message names the class (`Clasa 6E2`).
    - `allows a student to change the case of their own name` → 200.
- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run shared/api.test.ts server/routes/classes.test.ts server/routes/students.test.ts`
Expected: FAIL on the new cases (201/200 instead of 409; the zod case passes the parse).

- [ ] **Step 3: Implement** the zod `superRefine`, both SQL guards, the messages, and the same checks in `fakeApi.ts` (throw `new ApiError(409, 'student_exists', …)`).
- [ ] **Step 4: Run them to see them pass** (same command). Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add shared/api.ts shared/api.test.ts server/db/students.ts server/routes/classes.ts server/routes/students.ts server/routes/classes.test.ts server/routes/students.test.ts src/test/fakeApi.ts
git commit -m "Refuse a student name already in the class, whatever its case"
```

---

### Task 4: Delete a student from a class

**Files:**
- Modify: `shared/api.ts` (`StudentRow`), `server/db/classes.ts` (`listClassStudents`), `server/db/students.ts` (new `deleteStudentFromClass`), `server/routes/classes.ts`, `src/admin/api.ts`, `src/test/fakeApi.ts`
- Test: `server/routes/classes.test.ts` (new `describe('delete student')`), `src/admin/api.test.ts`

**Interfaces:**
- Produces:
  - `StudentRow` gains `canDelete: boolean` (no `submitted`/`grading`/`graded` upload in this class's tests). `addStudentsToClass` and `setEnrollmentActive` fill it (`true` for new students).
  - `deleteStudentFromClass(db, teacherId, classId, studentId): Promise<{ keys: string[] } | 'not_found' | 'has_work'>` in `server/db/students.ts`.
  - Route `DELETE /api/admin/classes/:id/students/:studentId` (no body) → `200 { deleted: true }`; 404 `not_found`; 409 `student_has_work` with `Elevul are lucrări trimise sau corectate în această clasă. Îl poți marca „A plecat”.`
  - `AdminApi.deleteStudent(classId: number, studentId: number): Promise<void>`.

**Algorithm** (one read of R2 keys, then one batch, then the files):
1. Read the R2 keys of the student's uploads in this class's tests (only `uploading`/`failed` can exist if the delete will pass).
2. `db.batch` in this order. Both statements carry the guard `G` =
   `EXISTS (SELECT 1 FROM classes WHERE id = ? AND teacher_id = ?)`
   `AND NOT EXISTS (SELECT 1 FROM submissions s JOIN tests t ON t.id = s.test_id WHERE s.student_id = ? AND t.class_id = ? AND s.status IN ('submitted', 'grading', 'graded'))`:
   a. `DELETE FROM submissions WHERE student_id = ? AND test_id IN (SELECT id FROM tests WHERE class_id = ?) AND G` (files and evaluations cascade).
   b. `DELETE FROM enrollments WHERE class_id = ? AND student_id = ? AND G RETURNING student_id`.
   `G` reads only uploads that (a) never deletes, so the order a → b is safe. The `students` row stays (see "Decisions").
3. If (b) returned no row: read why (student enrolled in this class? → `has_work`, else `not_found`). Otherwise `deleteFilesQuietly(c.env.FILES, keys)` after the batch.

- [ ] **Step 1: Write the failing tests** (`server/routes/classes.test.ts`, fixtures `makeClass`, `makeTest`, `addSubmission`, `addEvaluation`):
  - `lists canDelete for each student`: a student with a graded upload has `canDelete: false`; a new one `true`.
  - `deletes a student with no uploads`: 200; GET class no longer lists them; the enrollment row is gone; the class's `studentCount` drops by 1.
  - `deletes a student who left`: mark left, delete → 200.
  - `deletes the student's unsent and failed uploads with them`: `uploading` with 2 files and `failed` upload → 200; their `submissions` and `submission_files` rows are gone.
  - `refuses a student with a graded upload` → 409 `student_has_work`, the enrollment stays. Same for `submitted` and `grading`.
  - `keeps the student in another class`: enroll the same student id in a second class (`INSERT INTO enrollments`), delete from the first → 200; the second class still lists them.
  - `never gives a deleted student's id to a new student`: delete the newest student (id N), add one name → its id is greater than N.
  - `refuses a student who is not in the class` → 404; a second delete of the same student → 404.
  - `refuses another teacher's class` → 404 (use `otherTeacherTest`).
  - `src/admin/api.test.ts`: `deleteStudent(1, 10)` sends `DELETE /api/admin/classes/1/students/10`.
- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run server/routes/classes.test.ts src/admin/api.test.ts`
Expected: FAIL (404 route not found, missing fields).

- [ ] **Step 3: Implement** the fields, `deleteStudentFromClass`, the route, the client call, and `fakeApi.deleteStudent` (removes the student from `data.students[classId]`; throws `student_has_work` when a test of the class has a `submitted`/`grading`/`graded` row for them).
- [ ] **Step 4: Run them to see them pass** (same command). Expected: PASS. Then `npm run typecheck`: the new `StudentRow` field may break fakes in page tests; fill it in `fakeApi` (`canDelete: true` by default).
- [ ] **Step 5: Commit**

```bash
git add shared/api.ts server/db/classes.ts server/db/students.ts server/routes/classes.ts server/routes/classes.test.ts src/admin/api.ts src/admin/api.test.ts src/test/fakeApi.ts
git commit -m "Delete a student from a class when the student has no sent or graded work there"
```

---

### Task 5: Test archive and the new TestSummary fields

**Files:**
- Create: `migrations/0013_test_archive.sql`
- Modify: `shared/api.ts` (`TestSummary`), `server/db/tests.ts` (`SELECT_TEST`, `toRecord`, `startTest`, `reopenTest`, new `setTestArchived`), `server/db/lifecycle.ts` (`regradeTest`, `regradeSubmission`), `server/routes/tests.ts`, `src/admin/api.ts`, `src/test/fakeApi.ts` (`fakeTest`, `summaryOf`, `archiveTest`)
- Modify: `src/admin/pages/TestPage.tsx` (head chip, archive button in `.final-actions`)
- Test: `server/routes/lifecycle.test.ts` (or new `server/routes/archive.test.ts`), `server/routes/tests.test.ts`, `src/admin/pages/TestPage.test.tsx`

**Interfaces:**
- Produces:
  - Migration: `ALTER TABLE tests ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;` with a header comment in the style of 0011/0012.
  - `TestSummary.archived: boolean` and `TestSummary.publishedCount: number` (uploads of the test with `submissions.results_open = 1`; the same count `ResultsAccess` shows as "publicate individual").
  - `setTestArchived(db, teacherId, testId, archived: boolean, now): Promise<boolean | null>`: archive SQL `UPDATE tests SET archived = 1, updated_at = ? WHERE id = ? AND teacher_id = ? AND status = 'done' RETURNING archived`; unarchive has no status condition. `null` when nothing changed.
  - Routes `POST /tests/:code/archive` → `{ archived: true }`, or 409 `not_done` `Poți arhiva un test după ce s-a terminat corectarea.`; `POST /tests/:code/unarchive` → `{ archived: false }`.
  - Every status change away from `done` also sets `archived = 0`, in its own UPDATE: `startTest`, `reopenTest`, `regradeTest` and `regradeSubmission` (`server/db/lifecycle.ts`).
  - `AdminApi.setTestArchived(code: string, archived: boolean): Promise<boolean>`.
  - Test page: chip `<span className="tag">Arhivat</span>` next to the status chip when archived. In `.final-actions`, before "Șterge testul": button `Arhivează testul` (only when `status === 'done' && !archived`) with hint `Testul nu mai apare în lista clasei și în Teste. Îl găsești cu „Arată și testele arhivate”.`; `Scoate din arhivă` when archived.

- [ ] **Step 1: Write the failing tests**
  - API: `archives a done test` → 200 and `GET /tests?year=2026` shows `archived: true`; `refuses to archive an open test` → 409 `not_done`; `unarchives`; `reopen clears the archive mark` (archive a done test, reopen, `archived: false`); `Recorectează tot clears the archive mark` (archive a done test with a graded upload, POST `/regrade`, `archived: false`); `publishedCount counts single published results` (publish one upload via `/submissions/:id/results/open`, list shows `publishedCount: 1`); `refuses another teacher's test` → 404.
  - Page: `archives a finished test` (fake test `status: 'done'`, click `Arhivează testul`, `api.setTestArchived` called with `('6E2-26T1', true)`, then `Arhivat` and `Scoate din arhivă` show); `offers no archive while the test is open`.
- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run server/routes/tests.test.ts server/routes/lifecycle.test.ts src/admin/pages/TestPage.test.tsx`
Expected: FAIL (404 route, missing button). The migration is applied by the test helper from `migrations/`.

- [ ] **Step 3: Implement** the migration, fields, SQL, routes, client, fake, and the test page controls.
- [ ] **Step 4: Run `npm test` and `npm run typecheck`.** Expected: PASS. `fakeTest`/`summaryOf` defaults (`archived: false`, `publishedCount: 0`) keep older page tests green.
- [ ] **Step 5: Commit**

```bash
git add migrations/0013_test_archive.sql shared/api.ts server/db/tests.ts server/db/lifecycle.ts server/routes/tests.ts server/routes/*.test.ts src/admin/api.ts src/test/fakeApi.ts src/admin/pages/TestPage.tsx src/admin/pages/TestPage.test.tsx
git commit -m "Archive a finished test, and count the results published one by one"
```

---

### Task 6: The students page `/clase/:id/elevi`

**Files:**
- Create: `src/admin/pages/ClassStudentsPage.tsx`, `src/admin/pages/ClassStudentsPage.test.tsx`
- Modify: `src/admin/AppRoutes.tsx` (route `clase/:id/elevi`; no clash with `elevi/:id`), `src/admin/pages/ClassPage.tsx` (remove `StudentItem`, `AddStudentsForm`; add the "Elevii clasei" link), `src/admin/pages/ClassPage.test.tsx` (move the student tests out)

**Interfaces:**
- Consumes: `api.getClass`, `addStudents`, `renameStudent`, `setStudentActive`, `deleteStudent` (Task 4), `studentNameKey` (Task 2).
- Produces: `ClassStudentsPage()` (default route component; keyed by class id like `ClassPage`).

**Page content (Romanian copy is fixed):**
- Back link `← Clasa <displayClassName>` to `/clase/:id`. `<h1>Elevii clasei <name> · <year></h1>`.
- `<h2>Adaugă elevi</h2>` with the current `AddStudentsForm` (moved as is) plus a live preview: names whose `studentNameKey` matches a student of the class, or another line of the paste, show in an alert `Sunt deja în clasă: <n1>, <n2>.` / `Apar de două ori: <n>.` and the submit button is disabled. The server stays the truth (Task 3).
- `<h2>Elevi (<studentCountLabel>)</h2>` with the current `StudentItem` list (rename, "A plecat" / "Revine în clasă"), plus button `Șterge` when `student.canDelete`, after `window.confirm('Ștergi elevul <nume> din clasă?')`. When `!canDelete` no button; the row title explains nothing extra.
- After any change invalidate `['class', classId]` and `['classes']`.
- Class page: in the head, next to "Redenumește clasa", a link styled `button-quiet button-small`: `Elevii clasei`, to `/clase/:id/elevi`.

- [ ] **Step 1: Write the failing tests** (`ClassStudentsPage.test.tsx`, moving the add/rename/left tests from `ClassPage.test.tsx`):
  - `adds pasted names, one per line, without list numbers` (moved; path `/clase/1/elevi`).
  - `marks names already in the class and blocks the add`: class has `Pop Ion`; type `POP ION` → alert `Sunt deja în clasă: POP ION.`, button `Adaugă 1 elev` disabled.
  - `marks a name typed twice`.
  - `deletes a student after a confirm` (`vi.spyOn(window, 'confirm').mockReturnValue(true)`; `api.deleteStudent` called with `(1, 10)`; the name is gone).
  - `offers no delete for a student with graded work` (`canDelete: false`).
  - `shows a refused delete` (fake throws `student_has_work`; the message shows).
  - `ClassPage.test.tsx`: `links to the students page` (`Elevii clasei` → `/clase/1/elevi`).
- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/admin/pages/ClassStudentsPage.test.tsx src/admin/pages/ClassPage.test.tsx`
Expected: FAIL (module not found / link missing).

- [ ] **Step 3: Implement** the page, the route, and the class page link.
- [ ] **Step 4: Run them to see them pass** (same command). Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/admin/pages/ClassStudentsPage.tsx src/admin/pages/ClassStudentsPage.test.tsx src/admin/AppRoutes.tsx src/admin/pages/ClassPage.tsx src/admin/pages/ClassPage.test.tsx
git commit -m "Move adding, renaming and deleting students to their own page"
```

---

### Task 7: The class grade table

**Files:**
- Modify: `shared/api.ts` (`ClassGrade`, `ClassDetail.grades`), `server/db/classes.ts` (new `listClassGrades`), `server/routes/classes.ts` (`GET /:id` adds `grades`), `src/test/fakeApi.ts` (`getClass` builds `grades` from the fake uploads)
- Create: `src/admin/classPage/GradesTable.tsx`
- Modify: `src/admin/pages/ClassPage.tsx`, `src/ui/brand.css` (`table.grades-table`)
- Test: `server/routes/classes.test.ts`, `src/admin/pages/ClassPage.test.tsx`

**Interfaces:**
- Produces:

```ts
// One upload of a student in a test of the class, for the class grade table.
export interface ClassGrade {
  studentId: number;
  testCode: string;
  submissionId: number;
  status: Exclude<UploadStatus, 'none'>;
  // Out of 10, once graded.
  grade: number | null;
  flagCount: number;
}
// ClassDetail gains: grades: ClassGrade[];
```

  - `listClassGrades(db, teacherId, classId): Promise<ClassGrade[]>`: one query, `submissions s JOIN tests t ON t.id = s.test_id AND t.class_id = ? AND t.teacher_id = ? LEFT JOIN evaluations ev ON ev.submission_id = s.id AND s.status = 'graded'`, `flagCountSql('ev')` for flags (0 when not graded). All tests of the class, archived ones too (the page hides them). `GET /classes/:id` then makes 4 queries.
  - `GradesTable({ students, tests, grades, showArchived }: { students: StudentRow[]; tests: TestSummary[]; grades: ClassGrade[]; showArchived: boolean })`.

**Table rules:**
- `<div className="table-wrap"><table className="report-table grades-table">`, caption (sr-only) `Notele elevilor la teste`.
- Columns: `Elev` (sticky, from `report-table th:first-child`), then one per test in `tests` order (already `number DESC`: newest left), skipping `archived` unless `showArchived`.
- Header cell: `<Link to="/teste/<code>">` showing `T<number>` (the part after the last `T` of the code), `title` attribute and an sr-only span with `<code> · <title>`; below it the date of `startedAt` (`dd.mm`, Bucharest time) or the `StatusChip` for `draft`/`open`/`evaluating`; and when `gradedCount > 0` a small link `raport` to `/teste/<code>/raport`. An archived column header is muted and carries `Arhivat` (sr-only).
- Rows: active students first, then students who left (muted row, `a plecat` tag), each group sorted with `compareStudentNames`. Name links to `/elevi/<id>`.
- Cell: graded → `<Link to="/teste/<code>/elevi/<submissionId>">` with `formatPoints(grade)` in `points points-${pointsLevel(grade, 10)}`; `flagCount > 0` adds `flagged-cell` and sr-only ` (de verificat)`. Not graded → `uploadStatusLabel(status)` in a `hint` span. No upload → `—`.
- Empty: no tests → `<p className="hint">Clasa nu are încă teste.</p>`; no students → `Clasa nu are încă elevi.` with a link `Adaugă elevi` to `/clase/:id/elevi`.

**Class page layout** (`ClassPage.tsx`): back link; h1; a `head-actions` row: `Redenumește clasa`, `Elevii clasei` (Task 6), `Test nou pentru această clasă` (only when the class is not archived); `<h2>Note (<studentCountLabel>)</h2>`; the grade table; when archived tests exist, a toggle button `Arată și testele arhivate (<n>)` / `Ascunde testele arhivate` (`aria-pressed`).

**CSS:** `table.grades-table` reuses the narrow centred cells of `table.results-table` (centre, `nowrap`, small padding), with the first column left-aligned; header cells stack code, date and link (`display: block` spans).

- [ ] **Step 1: Write the failing tests**
  - API `GET /classes/:id` → `grades` holds one row per upload: a graded upload with `grade: 9`, a flagged one with `flagCount: 1`, an uploading one with `grade: null`; another teacher's class → 404.
  - Page (`ClassPage.test.tsx`), with a fake class of 2 tests (T1 done with grades, T2 open) and 3 students (one left):
    - `shows one column per test, newest first`: column headers in order `T2`, `T1` (`within(table).getAllByRole('columnheader')`).
    - `links a grade to the student's result`: cell link `9` → `/teste/6E2-26T1/elevi/<id>`.
    - `shows a status for an upload that is not graded, and a dash for none`.
    - `keeps a column for an open test, with its status`.
    - `links the report from a test with graded work` (`raport` → `/teste/6E2-26T1/raport`); no report link on T2.
    - `lists students who left after the others, marked`.
    - `hides archived tests until asked`: archive T1 in the fake; only T2 shows; click `Arată și testele arhivate (1)` → T1 shows.
    - Keep `lists the tests of the class and offers a new one for it` (adapt to the table) and the rename-class tests.
- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run server/routes/classes.test.ts src/admin/pages/ClassPage.test.tsx`
Expected: FAIL (`grades` undefined, no table).

- [ ] **Step 3: Implement** the type, the query, the route field, the fake, `GradesTable`, the page and the CSS.
- [ ] **Step 4: Run them to see them pass** (same command), then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add shared/api.ts server/db/classes.ts server/routes/classes.ts server/routes/classes.test.ts src/test/fakeApi.ts src/admin/classPage/GradesTable.tsx src/admin/pages/ClassPage.tsx src/admin/pages/ClassPage.test.tsx src/ui/brand.css
git commit -m "Show the class as a table of students and test grades, newest test first"
```

---

### Task 8: Report table order and a visible way to the report

**Files:**
- Modify: `src/admin/reportPage/ReportTables.tsx` (`ResultsTable`), `src/ui/brand.css` (`table.results-table td:nth-last-child(-n + 2)` → the 2nd and 3rd columns), `src/admin/pages/TestPage.tsx` (head), `src/admin/testPage/AnalysisState.tsx` (drop its plain link)
- Test: `src/admin/pages/ReportPage.test.tsx`, `src/admin/pages/TestPage.test.tsx`

**Interfaces:**
- `ResultsTable` columns: `Elev`, `Nota`, `Total`, then the exercises. Same cell content as now.
- CSS: replace the `td:nth-last-child(-n + 2)` rule with `table.results-table td:nth-child(2), table.results-table td:nth-child(3)` (same padding).
- Test page head (`head-actions`): when `test.gradedCount > 0`, `<Link className="button button-small" to="/teste/<code>/raport">Raportul clasei</Link>`. Remove the bare link at the end of `AnalysisState` (its failure text keeps pointing at the report).

- [ ] **Step 1: Write the failing tests**
  - `ReportPage.test.tsx`: `puts the grade right after the name`: column headers start `['Elev', 'Nota', 'Total', 'I.1', …]`.
  - `TestPage.test.tsx`: `shows the class report button in the head once a result is graded` (link `Raportul clasei` → `/teste/6E2-26T1/raport`, inside the heading row); `has no report button before any grading`. Update tests that found the old link in `AnalysisState` so exactly one `Raportul clasei` link exists.
- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/admin/pages/ReportPage.test.tsx src/admin/pages/TestPage.test.tsx`
Expected: FAIL (header order; link not in the head).

- [ ] **Step 3: Implement** the order, the CSS rule, the head button, and remove the old link.
- [ ] **Step 4: Run them to see them pass** (same command), then `npx vitest run src/admin/pdf` (PDF and CSV untouched). Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/admin/reportPage/ReportTables.tsx src/ui/brand.css src/admin/pages/TestPage.tsx src/admin/testPage/AnalysisState.tsx src/admin/pages/ReportPage.test.tsx src/admin/pages/TestPage.test.tsx
git commit -m "Put the grade next to the name in the report table, and the report button in the test page head"
```

---

### Task 9: Teste page: class filter, archived toggle, class colours, results publishing

**Files:**
- Create: `src/ui/classTone.ts`, `src/ui/classTone.test.ts`
- Modify: `src/admin/pages/TestsPage.tsx`, `src/admin/pages/ClassesPage.tsx` (stripe), `src/admin/pages/TestPage.tsx` (class link tone), `src/ui/brand.css` (tones), `src/test/fakeApi.ts` (`listTests` returns `archived`, `publishedCount`)
- Test: `src/admin/pages/TestsPage.test.tsx`, `src/admin/pages/ClassesPage.test.tsx`

**Interfaces:**
- Consumes: `api.listTests`, `api.listClasses`, `api.setResultsOpen` (exists), `TestSummary.archived`, `publishedCount` (Task 5).
- Produces: `classTone(classId: number): number` → `classId % 8` (0–7) and `classToneClass(classId: number): string` → `class-tone-<n>`.

**Colour tokens** (`brand.css`): `--tone-0` … `--tone-7`, light pastel hues (for example blue `#cfe0ff`, green `#cdeedd`, yellow `#fff0a0`, orange `#ffdcc2`, pink `#ffd6e5`, violet `#e2d8ff`, teal `#c9eef0`, grey-blue `#dde3ec`), and darker translucent versions in BOTH dark blocks (keep them equal). `.class-tone-N { --tone: var(--tone-N); }`. Card: `.card.has-tone { border-left: 6px solid var(--tone); }`. Badge: `.class-badge { background: var(--tone); }` with `color: var(--text)` (contrast ≥ 4.5:1 with `--text` in both themes; the class name text is always shown, so colour is never the only cue).

**Teste page:**
- Filter row under the head (`form-row`): `<label for="test-class">Clasa</label>` + `<select>` with `Toate clasele` and the classes of the year from `listClasses(year)` (display names); checkbox `Arată și testele arhivate`. Both kept in the URL with `useSearchParams`: `?clasa=<id>` and `?arhivate=1`. A `clasa` that is not in the year's list counts as "all". Filtering happens in the browser on the `listTests` answer.
- Card: `card has-tone class-tone-N`; the class name shows as `<span className="class-badge">`; archived cards get `is-muted` and the tag `Arhivat`.
- Results line (only when `status !== 'draft'` and `gradedCount > 0`):
  - `resultsOpen` → tag-like status `Rezultate publicate` and button `Oprește accesul` (`button-quiet button-small`).
  - not open, `publishedCount > 0` → `Publicate pentru <countLabel(publishedCount, 'elev', 'elevi')>` and button `Publică pentru toți`.
  - not open, 0 → `Rezultate nepublicate` and button `Publică rezultatele`.
  - Click → `api.setResultsOpen(code, !resultsOpen)`, then invalidate `['tests']` and `['test', code]`. One mutation per card; its error shows under the card. No confirm (as on the test page).
- Link `Raportul clasei` on the card when `gradedCount > 0`.
- Empty filter result: `<p className="hint">Nu ai teste pentru această alegere.</p>`.
- Classes page cards and the class link on the test page get the same tone class.

- [ ] **Step 1: Write the failing tests**
  - `classTone.test.ts`: `classTone(1) === 1`, `classTone(8) === 0`, `classTone(13) === 5`.
  - `TestsPage.test.tsx`:
    - `filters the tests by class and keeps the choice in the address` (choose `Clasa 6E3` → only its card; location search `?clasa=2`).
    - `opens with the class from the address` (`renderAdmin('/?clasa=2', …)`).
    - `hides archived tests until asked`.
    - `colours each card by its class` (card has class `class-tone-1` for class id 1).
    - `publishes results from the list` (button `Publică rezultatele` → `api.setResultsOpen('6E2-26T1', true)`, then `Rezultate publicate` shows).
    - `stops access from the list`.
    - `shows results published for some students` (`publishedCount: 2` → `Publicate pentru 2 elevi`).
    - `offers no results control for a draft or an ungraded test`.
    - `links the class report when a result is graded`.
  - `ClassesPage.test.tsx`: `colours each class card`.
- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/ui/classTone.test.ts src/admin/pages/TestsPage.test.tsx src/admin/pages/ClassesPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** `classTone.ts`, the tokens, the Teste page, and the tone on the classes page and test page.
- [ ] **Step 4: Run them to see them pass** (same command), then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/ui/classTone.ts src/ui/classTone.test.ts src/ui/brand.css src/admin/pages/TestsPage.tsx src/admin/pages/TestsPage.test.tsx src/admin/pages/ClassesPage.tsx src/admin/pages/ClassesPage.test.tsx src/admin/pages/TestPage.tsx src/test/fakeApi.ts
git commit -m "Filter the tests by class, colour them by class, and publish results from the list"
```

---

### Task 10: Whole check, browser check, go-live

**Files:**
- Modify: `scripts/smoke.mjs` only if the smoke test reads the class page answer (check; add `grades` to its expectations if it does).

- [ ] **Step 1: Full suite and build**

Run: `npm run typecheck`, then `npm test`, then (Linux CI runs in UTC) `TZ=UTC npm test` in Git Bash, then `npm run build`.
Expected: all PASS, build writes `dist/`.

- [ ] **Step 2: Smoke test on the production build**

Check port 8788 first (`netstat -ano | findstr :8788`; end leftovers as `AGENTS.md` says). Then `npm run db:local`, `npm run preview` (Claude preview `preview`), and `npm run smoke` in a second terminal.
Expected: the smoke test ends OK.

- [ ] **Step 3: Look at every changed page in the browser pane**, with sample rows (one class of 24 students, 3 tests: done with grades, done archived, open):
  - `/admin/clase/<id>`: newest test on the left; grades link to results; the archived toggle works.
  - `/admin/clase/<id>/elevi`: add with a duplicate is blocked; delete works on a student who left.
  - `/admin/`: filter, archived toggle, colours in light AND dark theme, publish / stop.
  - `/admin/teste/<code>/raport`: Nota is the 2nd column.
  - At 375 px width (`resize_window` preset mobile): no page-wide horizontal scroll (`document.documentElement.scrollWidth <= innerWidth` via `javascript_tool`); the tables scroll inside `.table-wrap`.
- [ ] **Step 4: Go-live order** (`docs/deploy.md`):
  1. Run migration 0013 on the live database before the code reaches `main`: `npx wrangler d1 migrations apply <db> --remote` (from the branch folder).
  2. Open the PR, let CI pass, merge.
  3. On the live site: delete the duplicate "a plecat" students of 8E2 from `Elevii clasei`.
- [ ] **Step 5: Commit** any smoke or doc fix with its own message.
