# MQGrader Phase 8f: Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Task 7 must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (push, pull request) needs the user's explicit yes.

**Goal:** Search as the user picked it in round 7 (spec §11.10, page A): a box after the lockup in the top bar finds the teacher's students, classes and tests of the school year, diacritics aside ("stef" finds "Ștefan"); a list under the box, a results page, and on a phone the search over the whole screen.

**Architecture:** A new `shared/search.ts` folds text (NFD, no marks, one case, single spaces) for the server and the browser, and finds where a search sits in a name. A new route `GET /api/admin/search?q=&year=` (`server/routes/search.ts`, `server/db/search.ts`) reads the year's students (one batch: the enrollments and a window query for the latest grade), classes (`listClasses`) and tests (`listTests`) whole and matches them in the Worker. **No migration:** the roadmap's folded-name column is not needed, because one teacher has a few hundred names in a year. In the browser, `src/admin/search/` holds the box (`SearchBox.tsx`, an ARIA combobox), the bold part (`Highlight.tsx`), the query (`useSearch.ts`) and the phone's layer (`SearchLayer.tsx`); `pages/SearchPage.tsx` is the results page at `/cautare`.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1, Vitest 5, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md` (§11.10). Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules. The approved prototype: round 7 https://claude.ai/artifact/NTc1cfWBhUF4EkkCZN2uNm, page "Căutare" A.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- No migration. Every teacher query is scoped by the teacher's id. At most 15 D1 queries and 10 ms of CPU per request. Every `/api/admin` route keeps the `promoteDue` middleware (a router mounted in `server/routes/admin.ts` has it).
- Flat colours only: no gradient anywhere in `brand.css`; a shadow only on what floats. Orange only for what waits on the teacher.
- No page tells students that AI grades their work; this plan changes no student page.
- Do not run Prettier or any formatter: the repo has no formatter configuration, and its defaults rewrite the quotes of whole files.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A` (the checkout holds local files that must not be committed: `.claude/launch.json` entries, untracked plan files).
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root `D:\Projects\QuickEval`, on the branch `feature/mqgrader-search`. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy, on `main` too. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone. Then the full run counts as passed when its failed and passed tests add up to the expected passed number; say so in the task report.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; overwrite all of it with exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/proto16/f1` … `refs/proto16/f6`, one per task, on `refs/proto16/fbase` (the same files as `main` at `1339b2b`). After Task N, `git diff --stat refs/proto16/fN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`). Four tests run the real pandoc (`runner/baremDocx.test.ts`, `runner/baremTask.test.ts`, `runner/workdir.test.ts`): without pandoc they skip too, so every total shows 4 fewer passed and 4 more skipped.

## Rulings made while planning

Settled while building the prototype on 2026-11-08. Every action that works today stays.

1. **No migration.** The API reads the school year's students, classes and tests of the teacher whole and matches their names in the Worker. SQLite's `LIKE` folds only ASCII letters; folding in SQL with a `replace()` chain would need a list of letters to keep up. The fold is the Unicode one: NFD, then no marks, then lower case (ł, ß, đ, ø, æ, œ, which keep no mark to strip, get their plain letters), and single spaces.
2. The search needs two letters once folded (`MIN_SEARCH_LENGTH`) and at most 80 characters; the API answers 400 otherwise, and the box opens no list for one letter. It matches anywhere in a name. A class matches by its own name ("10B"), not by "Clasa 10B": typing "clasa" would find every class. Round 7's line "Teorema lui Stewart" under "stef" was a mistake of the mock: "stew" is not "stef".
3. Everything of the school year counts: archived classes ("arhivată") and archived tests ("arhivat") are found and marked. A student in two classes of the year is one line, with the classes the student is in; a student who left every class of the year shows with those classes. "Ultima notă" is the grade of the student's latest graded paper of the year (by the test's start), published or not, as the class page shows grades.
4. The list under the box shows at most five of each group (`SHOWN_PER_GROUP`), then "Toate rezultatele pentru „stef”". The arrows move through every line, round; Enter opens the chosen line or, with none chosen, the results page. A chosen line empties the box; the results page keeps the search in it. With nothing found the list says "Nimic găsit în acest an școlar." and has no line. Esc closes the list first and marks it with `preventDefault()`, so an open panel stays (as the QR code on the whole screen does); the focus leaving the box closes the list, and the focus coming back opens it.
5. The box asks the API 200 ms after the typing stops (`SEARCH_WAIT_MS`); two searches that fold to the same text share one answer; the last answer stays on screen while a new one comes. Every change the teacher makes reads the search again (the shell's invalidation, as for the tests).
6. The results page lives at `/cautare?q=stef&arata=elevi`: the search and the chip are in the address. A chip of an empty group is disabled; an old link to one shows all. A student shows the classes and "ultima notă 7,1" or "nicio notă încă"; a class its students; a test its class, its date and its stage (`stagesOf`, as on the Teste page). The page's last line says how to search another year: "Cauți în alt an școlar? Alege anul școlar, apoi caută din nou." (on a phone the year is under ☰, so the line names no place).
7. On a phone (below 900px) the box gives way to a magnifier "Caută" beside ☰. It opens the search over the whole screen, a dialog: ← "Închide căutarea", the box with the focus, and the list always open under it. ←, Esc, a new page and a screen grown past a phone close it; the page, the top bar and the bar under it are `inert` (the review's fix, see Task 7); the focus goes back to the magnifier. It is one of the shell's panels (`PanelName` `search`), so it closes the menu under ☰ and the other panels.
8. The class page's own student search ("Elevi" tab) now uses the same fold (`searchMatcher`), so both searches agree.

## Review Focus

1. Scope: every statement of `/api/admin/search` reads only the teacher's rows and only the chosen school year (test in Task 2: "keeps to the school year and to the teacher").
2. The query budget: one request stays within 15 D1 queries (test in Task 2: "stays within 15 D1 queries").
3. The bold part lands on the original letters, with a decomposed "Ș" and a letter that folds into two (tests in Task 1).
4. The combobox: `aria-expanded`, `aria-controls`, `aria-activedescendant`, the option names ("Ștefan Radu, Clasa 10B"), and Esc before a panel (tests in Task 3).
5. The phone layer gives the focus back to the magnifier, and closes on ←, Esc and a new page (tests in Task 5).

---

### Before Task 1: The branch

- [ ] **Step 1: Check the branch**

No other Claude Code session may work in this checkout meanwhile (in the desktop app: `list_sessions {"linked": true}` shows none running). Run `git switch -c feature/mqgrader-search 1339b2b`, then `git log --oneline -1`.

Expected: `1339b2b Merge pull request #52 from parameciul/feature/mqgrader-empty-states`. The untracked plan files and the local changes of `.claude/launch.json` come along; they are never committed (this plan is committed in Task 7).

### Task 1: The search fold

`shared/search.ts`: the fold that ignores case and diacritics, the test for a name, and where the search sits in a name. The class page's student search uses it.

**Files:**
- Create: `shared/search.ts`
- Modify: `src/admin/classPage/ClassStudents.tsx`
- Test: `shared/search.test.ts` (new)

**Interfaces:**
- Produces: `MIN_SEARCH_LENGTH`, `MAX_SEARCH_LENGTH`, `foldForSearch(text)`, `isSearchable(query)`, `searchMatcher(query)`, `matchRange(text, query)` from `shared/search.ts`.

- [ ] **Step 1: Create `shared/search.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { foldForSearch, isSearchable, matchRange, searchMatcher } from './search.ts';

describe('foldForSearch', () => {
  it('drops the Romanian diacritics, comma and cedilla forms alike', () => {
    expect(foldForSearch('Ștefan Țăran Îonescu Ânca')).toBe('stefan taran ionescu anca');
    expect(foldForSearch('Ştefan Ţăran')).toBe('stefan taran');
  });

  it('drops the accents of other languages and folds the letters with none', () => {
    expect(foldForSearch('Éva Öztürk Łukasz Groß')).toBe('eva ozturk lukasz gross');
  });

  it('reads a decomposed letter as the plain one', () => {
    expect(foldForSearch('Ștefan')).toBe('stefan');
  });

  it('trims and joins the spaces', () => {
    expect(foldForSearch('  Ana \t  Pop ')).toBe('ana pop');
  });
});

describe('isSearchable', () => {
  it('needs two letters', () => {
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable(' ș ')).toBe(false);
    expect(isSearchable('șt')).toBe(true);
  });
});

describe('searchMatcher', () => {
  it('finds the search anywhere in the text, folded', () => {
    const matches = searchMatcher('stef');
    expect(matches('Ștefan Radu')).toBe(true);
    expect(matches('Ioana Stefănescu')).toBe(true);
    expect(matches('Teorema lui Stewart')).toBe(false);
  });

  it('finds nothing for an empty search', () => {
    expect(searchMatcher('  ')('Ana')).toBe(false);
  });
});

describe('matchRange', () => {
  it('marks the letters of the original text', () => {
    expect(matchRange('Ștefan Radu', 'stef')).toEqual({ start: 0, end: 4 });
    expect(matchRange('Ioana Stefănescu', 'ȘTEFĂ')).toEqual({ start: 6, end: 11 });
  });

  it('keeps the accent of a decomposed letter inside the mark', () => {
    const text = 'Ștefan';
    const range = matchRange(text, 'st');
    expect(range).toEqual({ start: 0, end: 3 });
    expect(text.slice(range!.start, range!.end)).toBe('Șt');
    expect(matchRange('Ana Ș', 's')).toEqual({ start: 4, end: 6 });
  });

  it('maps a letter that folds into two', () => {
    expect(matchRange('Groß Ana', 'ana')).toEqual({ start: 5, end: 8 });
  });

  it('gives null when the search is not there', () => {
    expect(matchRange('Ana', 'pop')).toBeNull();
    expect(matchRange('Ana', '')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run shared/search.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  no tests`: `search.test.ts` cannot load (`Cannot find module './search.ts'`).

- [ ] **Step 3: Create `shared/search.ts`**

```ts
// Search (redesign spec §11.10) folds text the same way on the server and in
// the browser: one case, no diacritics ("stef" finds "Ștefan", "Ştefan" with a
// cedilla and a decomposed "Ș"), and single spaces.

export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 80;

// Letters that keep no diacritic to strip: their plain form.
const PLAIN_LETTERS: Readonly<Record<string, string>> = { ł: 'l', ß: 'ss', đ: 'd', ø: 'o', æ: 'ae', œ: 'oe' };

interface Folded {
  text: string;
  // For each UTF-16 unit of `text`, where its letter starts in the original.
  starts: number[];
}

// Folds one letter at a time, so a match in the folded text can be mapped
// back onto the original (for the bold part of a result).
function foldWithMap(text: string): Folded {
  let out = '';
  const starts: number[] = [];
  let index = 0;
  for (const letter of text) {
    let folded = letter.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    folded = PLAIN_LETTERS[folded] ?? folded;
    if (/^\s+$/u.test(folded)) folded = out === '' || out.endsWith(' ') ? '' : ' ';
    out += folded;
    for (let unit = 0; unit < folded.length; unit++) starts.push(index);
    index += letter.length;
  }
  return { text: out, starts };
}

export function foldForSearch(text: string): string {
  return foldWithMap(text).text.trim();
}

// Whether a search is long enough to run: at least two letters once folded.
export function isSearchable(query: string): boolean {
  return foldForSearch(query).length >= MIN_SEARCH_LENGTH;
}

// A test for each text: does it hold the search, folded?
export function searchMatcher(query: string): (text: string) => boolean {
  const folded = foldForSearch(query);
  return (text) => folded.length > 0 && foldForSearch(text).includes(folded);
}

// Where the search sits in the original text (the end is after any accent of
// the last letter), or null when it is not there.
export function matchRange(text: string, query: string): { start: number; end: number } | null {
  const folded = foldForSearch(query);
  if (folded.length === 0) return null;
  const map = foldWithMap(text);
  const at = map.text.indexOf(folded);
  if (at < 0) return null;
  const after = at + folded.length;
  return { start: map.starts[at]!, end: after < map.starts.length ? map.starts[after]! : text.length };
}
```

- [ ] **Step 4: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
import { formatPoints } from '../../../shared/scoring.ts';
import { countLabel, formatDayMonth, uploadStatusLabel } from '../../ui/format.ts';
```

Replace it with:

```tsx
import { formatPoints } from '../../../shared/scoring.ts';
import { foldForSearch, searchMatcher } from '../../../shared/search.ts';
import { countLabel, formatDayMonth, uploadStatusLabel } from '../../ui/format.ts';
```

- [ ] **Step 5: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
import type { StudentLinkState } from '../pages/StudentPage.tsx';

// A name as the search compares it: no case, no diacritics ("stef" finds
// "Ștefan").
function searchKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

```

Replace it with:

```tsx
import type { StudentLinkState } from '../pages/StudentPage.tsx';

```

- [ ] **Step 6: Edit `src/admin/classPage/ClassStudents.tsx`**

Find this block:

```tsx
  const ordered = orderedStudents(students);
  const needle = searchKey(search);
  const visible = needle === '' ? ordered : ordered.filter((student) => searchKey(student.fullName).includes(needle));
  const chosen = ordered.find((student) => student.id === chosenId) ?? ordered[0] ?? null;
```

Replace it with:

```tsx
  const ordered = orderedStudents(students);
  // No case, no diacritics: "stef" finds "Ștefan".
  const matches = searchMatcher(search);
  const visible = foldForSearch(search) === '' ? ordered : ordered.filter((student) => matches(student.fullName));
  const chosen = ordered.find((student) => student.id === chosenId) ?? ordered[0] ?? null;
```

- [ ] **Step 7: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  126 passed | 1 skipped (127)`, `Tests  2036 passed | 3 skipped (2039)`.

- [ ] **Step 8: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add shared/search.ts shared/search.test.ts src/admin/classPage/ClassStudents.tsx
git commit -m "Add the search fold that ignores diacritics"
```

### Task 2: The search API

`GET /api/admin/search?q=stef&year=2026`: the teacher's students, classes and tests of the school year whose name holds the search.

**Files:**
- Create: `server/db/search.ts`, `server/routes/search.ts`
- Modify: `shared/api.ts`, `server/routes/admin.ts`
- Test: `server/routes/search.test.ts` (new)

**Interfaces:**
- Consumes: `searchMatcher`, `isSearchable`, `MAX_SEARCH_LENGTH` (Task 1); `listClasses` (`server/db/classes.ts`), `listTests` (`server/db/tests.ts`), `parseSchoolYear` (`server/http.ts`).
- Produces: the types `SearchStudent` and `SearchResults` in `shared/api.ts`; `search(db, teacherId, schoolYear, query)` from `server/db/search.ts`; `searchRoutes()` from `server/routes/search.ts`, mounted at `/api/admin/search`.

- [ ] **Step 1: Create `server/routes/search.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addEvaluation, addSubmission, makeClass, makeTest, otherTeacherTest } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

let api: TestApi;

const search = (q: string, year = 2026) => api.request('GET', `/api/admin/search?q=${encodeURIComponent(q)}&year=${year}`);
const started = (code: string, at: string) => api.db.prepare('UPDATE tests SET started_at = ? WHERE code = ?').bind(at, code).run();

beforeEach(async () => {
  api = await startTestApi();
});

afterEach(async () => {
  await api.dispose();
});

describe('GET /api/admin/search', () => {
  it('finds students, classes and tests of the year, diacritics aside', async () => {
    const tenth = await makeClass(api, '10B', ['Ștefan Radu', 'Pop Ana']);
    const ninth = await makeClass(api, '9A', ['Ştefania Pop', 'Ioana Stefănescu']);
    await makeClass(api, '12STE');
    const code = await makeTest(api, tenth.id, 'Ștergerea fracțiilor');
    await makeTest(api, ninth.id, 'Teorema lui Stewart');

    const res = await search('stef');
    expect(res.status).toBe(200);
    expect(res.body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Ioana Stefănescu', 'Ștefan Radu', 'Ştefania Pop']);
    expect(res.body.students[1]).toEqual({ id: tenth.studentIds[0], fullName: 'Ștefan Radu', classes: [{ id: tenth.id, name: '10B' }], lastGrade: null });
    expect(res.body.classes).toEqual([]);
    expect(res.body.tests).toEqual([]);

    const more = (await search('  STE ')).body;
    expect(more.classes.map((c: { name: string }) => c.name)).toEqual(['12STE']);
    expect(more.tests.map((t: { code: string; title: string }) => [t.code, t.title])).toEqual([
      [expect.any(String), 'Teorema lui Stewart'],
      [code, 'Ștergerea fracțiilor'],
    ]);
    // A test row is the Teste page's row, so the results page draws its stage.
    expect(more.tests[1]).toMatchObject({ className: '10B', status: 'draft', studentCount: 2 });
  });

  it('keeps to the school year and to the teacher', async () => {
    await makeClass(api, '9A', ['Ștefan Radu']);
    await makeClass(api, '10A', ['Ștefan Matei'], 2027);
    await otherTeacherTest(api);
    const other = await api.addTeacher('al.treilea@example.com', 'Al Treilea');
    await api.db.prepare("INSERT INTO students (teacher_id, full_name, created_at) VALUES (?, 'Ștefan Străin', '2026-10-06')").bind(other).run();

    expect((await search('stef')).body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Ștefan Radu']);
    expect((await search('stef', 2027)).body.students.map((s: { fullName: string }) => s.fullName)).toEqual(['Ștefan Matei']);
    expect((await search('strain')).body).toEqual({ students: [], classes: [], tests: [] });
    expect((await search('9z')).body.classes).toEqual([]);
  });

  it('lists a student in two classes of the year once, with the classes the student is in', async () => {
    const first = await makeClass(api, '9A', ['Ștefan Radu']);
    const second = await makeClass(api, '9B');
    const third = await makeClass(api, '9C');
    const [id] = first.studentIds as [number];
    for (const cls of [second, third]) {
      await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(cls.id, id).run();
    }
    await api.request('PATCH', `/api/admin/classes/${first.id}/students/${id}`, { active: false });

    const [student] = (await search('stef')).body.students;
    expect(student.classes.map((c: { name: string }) => c.name).sort()).toEqual(['9B', '9C']);

    // A student who left every class of the year still shows, with those classes.
    for (const cls of [second, third]) await api.request('PATCH', `/api/admin/classes/${cls.id}/students/${id}`, { active: false });
    const [left] = (await search('stef')).body.students;
    expect(left.classes.map((c: { name: string }) => c.name).sort()).toEqual(['9A', '9B', '9C']);
  });

  it("gives each student the grade of the latest graded paper of the year", async () => {
    const cls = await makeClass(api, '9A', ['Ștefan Radu', 'Ștefania Pop']);
    const [stefan, stefania] = cls.studentIds as [number, number];
    const older = await makeTest(api, cls.id, 'Fracții');
    const newer = await makeTest(api, cls.id, 'Ecuații');
    const ungraded = await makeTest(api, cls.id, 'Funcții');
    await started(older, '2026-10-06T07:00:00.000Z');
    await started(newer, '2026-11-03T07:00:00.000Z');
    await started(ungraded, '2026-11-20T07:00:00.000Z');
    await addEvaluation(api, await addSubmission(api, newer, stefan, { status: 'graded', files: 1 }), { grade: 7.1 });
    await addEvaluation(api, await addSubmission(api, older, stefan, { status: 'graded', files: 1 }), { grade: 9 });
    await addSubmission(api, ungraded, stefan, { status: 'submitted', files: 1 });
    // A paper of last year does not count.
    const last = await makeClass(api, '8A', [], 2025);
    await api.db.prepare('INSERT INTO enrollments (class_id, student_id) VALUES (?, ?)').bind(last.id, stefania).run();
    const old = await makeTest(api, last.id, 'Vechi');
    await started(old, '2025-10-06T07:00:00.000Z');
    await addEvaluation(api, await addSubmission(api, old, stefania, { status: 'graded', files: 1 }), { grade: 5 });

    const students = (await search('stef')).body.students;
    expect(students.map((s: { fullName: string; lastGrade: number | null }) => [s.fullName, s.lastGrade])).toEqual([
      ['Ștefan Radu', 7.1],
      ['Ștefania Pop', null],
    ]);
  });

  it('asks for two letters and at most 80 characters', async () => {
    await makeClass(api, '9A', ['Ana Pop']);
    for (const q of ['', ' a ', 'ș']) {
      const res = await search(q);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid', message: 'Scrie cel puțin două litere.' });
    }
    expect((await search('a'.repeat(81))).body.message).toBe('Caută cel mult 80 de caractere.');
    expect((await search('a'.repeat(80))).status).toBe(200);
    expect((await api.request('GET', '/api/admin/search?q=ana&year=1990')).status).toBe(400);
  });

  it('stays within 15 D1 queries', async () => {
    const cls = await makeClass(api, '9A', ['Ștefan Radu']);
    await makeTest(api, cls.id, 'Ștergeri');
    const db = api.env.DB;
    let queries = 0;
    api.env.DB = new Proxy(db, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key === 'prepare') return (sql: string) => ((queries += 1), target.prepare(sql));
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      expect((await search('ste')).status).toBe(200);
    } finally {
      api.env.DB = db;
    }
    expect(queries).toBeGreaterThan(3);
    expect(queries).toBeLessThanOrEqual(15);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run server/routes/search.test.ts`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  6 failed (6)`: the route does not exist (`expected 404 to be 200`, `expected 404 to be 400`, and `Cannot read properties of undefined (reading 'map')` on the missing answer).

- [ ] **Step 3: Edit `shared/api.ts`**

Find this block:

```ts
  tests: StudentHistoryTest[];
  grades: ClassGrade[];
}

```

Replace it with:

```ts
  tests: StudentHistoryTest[];
  grades: ClassGrade[];
}

// A student the search found: the classes of the school year the student is
// in (the ones the student left, when none is left), and the grade of the
// student's latest graded paper of the year.
export interface SearchStudent {
  id: number;
  fullName: string;
  classes: { id: number; name: string }[];
  lastGrade: number | null;
}

// What /api/admin/search found in one school year: names of students, classes
// and tests that hold the search, diacritics aside (shared/search.ts).
export interface SearchResults {
  students: SearchStudent[];
  classes: ClassSummary[];
  tests: TestSummary[];
}

```

- [ ] **Step 4: Create `server/db/search.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { SearchResults, SearchStudent } from '../../shared/api.ts';
import { searchMatcher } from '../../shared/search.ts';
import { compareStudentNames } from '../../shared/students.ts';
import { listClasses } from './classes.ts';
import { listTests } from './tests.ts';

interface EnrolledRow {
  id: number;
  full_name: string;
  class_id: number;
  class_name: string;
  active: number;
}

// The students of the teacher's classes of one school year, with their
// classes, and the grade of each one's latest graded paper of the year, in one
// batch. A student in two classes of the year is one student.
async function listYearStudents(db: D1Database, teacherId: number, schoolYear: number): Promise<SearchStudent[]> {
  const [enrolled, latest] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT s.id, s.full_name, c.id AS class_id, c.name AS class_name, e.active
         FROM enrollments e
         JOIN classes c ON c.id = e.class_id AND c.teacher_id = ? AND c.school_year = ?
         JOIN students s ON s.id = e.student_id AND s.teacher_id = c.teacher_id`,
      )
      .bind(teacherId, schoolYear),
    db
      .prepare(
        `SELECT student_id, grade FROM (
           SELECT s.student_id, ev.grade,
             ROW_NUMBER() OVER (PARTITION BY s.student_id ORDER BY t.started_at DESC, t.id DESC) AS n
           FROM submissions s
           JOIN tests t ON t.id = s.test_id AND t.teacher_id = ?
           JOIN classes c ON c.id = t.class_id AND c.school_year = ?
           JOIN evaluations ev ON ev.submission_id = s.id
           WHERE s.status = 'graded' AND ev.grade IS NOT NULL
         ) WHERE n = 1`,
      )
      .bind(teacherId, schoolYear),
  ]);
  const grades = new Map(((latest?.results ?? []) as { student_id: number; grade: number }[]).map((row) => [row.student_id, row.grade]));
  const students = new Map<number, { fullName: string; active: SearchStudent['classes']; left: SearchStudent['classes'] }>();
  for (const row of (enrolled?.results ?? []) as unknown as EnrolledRow[]) {
    const student = students.get(row.id) ?? { fullName: row.full_name, active: [], left: [] };
    (row.active === 1 ? student.active : student.left).push({ id: row.class_id, name: row.class_name });
    students.set(row.id, student);
  }
  return [...students]
    .map(([id, student]) => ({
      id,
      fullName: student.fullName,
      classes: student.active.length > 0 ? student.active : student.left,
      lastGrade: grades.get(id) ?? null,
    }))
    .sort((a, b) => compareStudentNames(a.fullName, b.fullName));
}

// The students, classes and tests of the school year whose name holds the
// search, diacritics aside. One teacher has a few hundred names in a year, so
// they are read whole and matched here: SQLite's LIKE folds only ASCII letters.
export async function search(db: D1Database, teacherId: number, schoolYear: number, query: string): Promise<SearchResults> {
  const matches = searchMatcher(query);
  const [students, classes, tests] = await Promise.all([
    listYearStudents(db, teacherId, schoolYear),
    listClasses(db, teacherId, schoolYear),
    listTests(db, teacherId, schoolYear),
  ]);
  return {
    students: students.filter((student) => matches(student.fullName)),
    classes: classes.filter((cls) => matches(cls.name)),
    tests: tests.filter((test) => matches(test.title)),
  };
}
```

- [ ] **Step 5: Create `server/routes/search.ts`**

```ts
import { Hono } from 'hono';
import { isSearchable, MAX_SEARCH_LENGTH } from '../../shared/search.ts';
import { search } from '../db/search.ts';
import type { AppEnv } from '../env.ts';
import { ApiError } from '../errors.ts';
import { parseSchoolYear } from '../http.ts';

// /api/admin/search?q=stef&year=2026: the teacher's students, classes and
// tests of the school year whose name holds the search (redesign spec §11.10).
export function searchRoutes(): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const year = parseSchoolYear(c.req.query('year'));
    const query = (c.req.query('q') ?? '').trim();
    if (query.length > MAX_SEARCH_LENGTH) throw new ApiError(400, 'invalid', 'Caută cel mult 80 de caractere.');
    if (!isSearchable(query)) throw new ApiError(400, 'invalid', 'Scrie cel puțin două litere.');
    return c.json(await search(c.env.DB, c.var.teacher.id, year, query));
  });

  return routes;
}
```

- [ ] **Step 6: Edit `server/routes/admin.ts`**

Find this block:

```ts
import { adminPaymentRoutes } from './payments.ts';
import { settingsRoutes } from './settings.ts';
```

Replace it with:

```ts
import { adminPaymentRoutes } from './payments.ts';
import { searchRoutes } from './search.ts';
import { settingsRoutes } from './settings.ts';
```

- [ ] **Step 7: Edit `server/routes/admin.ts`**

Find this block:

```ts
  routes.route('/tests', testRoutes(options));
  routes.route('/submissions', submissionRoutes(options));
```

Replace it with:

```ts
  routes.route('/tests', testRoutes(options));
  routes.route('/search', searchRoutes());
  routes.route('/submissions', submissionRoutes(options));
```

- [ ] **Step 8: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  127 passed | 1 skipped (128)`, `Tests  2042 passed | 3 skipped (2045)`.

- [ ] **Step 9: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add shared/api.ts server/db/search.ts server/routes/search.ts server/routes/search.test.ts server/routes/admin.ts
git commit -m "Add the search API for students, classes and tests"
```

### Task 3: The search box

The box after the lockup in the top bar, and its list.

**Files:**
- Create: `src/admin/search/useSearch.ts`, `src/admin/search/Highlight.tsx`, `src/admin/search/SearchBox.tsx`
- Modify: `src/admin/api.ts`, `src/test/fakeApi.ts`, `src/admin/shell/icons.tsx`, `src/admin/testsPage/TestGroup.tsx`, `src/admin/Layout.tsx`, `src/ui/brand.css`
- Test: `src/admin/search/SearchBox.test.tsx` (new)

**Interfaces:**
- Consumes: `/api/admin/search` and its types (Task 2); `foldForSearch`, `isSearchable`, `matchRange` (Task 1).
- Produces: `AdminApi.search(query, schoolYear)` (and its fake); `useSearch(text, wait?)` and `SEARCH_WAIT_MS` from `search/useSearch.ts`; `Highlight({ text, query })`; `SearchBox({ id, always? })`, `resultsPath(text)`, `SHOWN_PER_GROUP`, `SEARCH_LABEL` from `search/SearchBox.tsx`; `IconSearch`, `IconBack` from `shell/icons.tsx`; `startedText` is now exported from `testsPage/TestGroup.tsx`.

- [ ] **Step 1: Create `src/admin/search/SearchBox.test.tsx`**

```tsx
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StudentRow } from '../../../shared/api.ts';
import { createFakeApi, fakeTest } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

const student = (id: number, fullName: string): StudentRow => ({ id, fullName, active: true, canDelete: true });

function searchApi() {
  return createFakeApi({
    classes: [
      { id: 1, name: '10B', schoolYear: 2026, archived: false, studentCount: 2 },
      { id: 2, name: '9A', schoolYear: 2026, archived: false, studentCount: 2 },
      { id: 3, name: '12STE', schoolYear: 2026, archived: true, studentCount: 0 },
    ],
    students: {
      1: [student(10, 'Ștefan Radu'), student(11, 'Pop Ana')],
      2: [student(20, 'Ştefania Pop'), student(21, 'Ioana Stefănescu')],
    },
    tests: [
      fakeTest({ code: '10B-26T1', title: 'Ștergerea fracțiilor', classId: 1, className: '10B' }),
      fakeTest({ code: '9A-26T1', title: 'Teorema lui Stewart', classId: 2, className: '9A' }),
    ],
  });
}

async function openSearch(api = searchApi()) {
  const { queryClient } = renderAdmin('/', api, <LocationProbe />);
  await screen.findByRole('navigation', { name: 'Meniu' });
  return Object.assign(screen.getByRole('combobox', { name: 'Caută elevi, clase și teste' }), { queryClient });
}

describe('the search box', () => {
  it('lists what it finds under the box, grouped, with the match in bold and the results page last', async () => {
    const api = searchApi();
    const box = await openSearch(api);
    await userEvent.type(box, 's');
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await userEvent.type(box, 'tef');
    const list = await screen.findByRole('listbox', { name: 'Rezultate pentru „stef”' });
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(box).toHaveAttribute('aria-controls', list.id);
    const students = await within(list).findByRole('group', { name: 'Elevi' });
    expect(within(students).getAllByRole('option')).toHaveLength(3);
    expect(within(students).getByRole('option', { name: 'Ștefan Radu, Clasa 10B' })).toBeInTheDocument();
    expect(within(students).getByRole('option', { name: 'Ioana Stefănescu, Clasa 9A' }).querySelector('mark')).toHaveTextContent('Stef');
    expect(within(students).getByRole('option', { name: 'Ştefania Pop, Clasa 9A' }).querySelector('mark')).toHaveTextContent('Ştef');
    expect(within(list).queryByRole('group', { name: 'Clase' })).not.toBeInTheDocument();
    expect(within(list).queryByRole('group', { name: 'Teste' })).not.toBeInTheDocument();
    const options = within(list).getAllByRole('option');
    expect(options[options.length - 1]).toHaveAccessibleName('Toate rezultatele pentru „stef”');
    expect(api.search).toHaveBeenLastCalledWith('stef', 2026);

    await userEvent.clear(box);
    await userEvent.type(box, 'ste');
    const next = await screen.findByRole('listbox', { name: 'Rezultate pentru „ste”' });
    expect(await within(next).findByRole('option', { name: 'Clasa 12STE, niciun elev · arhivată' })).toBeInTheDocument();
    const tests = within(next).getByRole('group', { name: 'Teste' });
    expect(within(tests).getByRole('option', { name: 'Teorema lui Stewart, Clasa 9A · ciornă' })).toBeInTheDocument();
  });

  it('asks the API once the typing stops', async () => {
    const api = searchApi();
    const box = await openSearch(api);
    await userEvent.type(box, 'stefan');
    await screen.findByRole('option', { name: 'Ștefan Radu, Clasa 10B' });
    expect(api.search).toHaveBeenCalledTimes(1);
    expect(api.search).toHaveBeenCalledWith('stefan', 2026);
  });

  it('moves with the arrows and opens the chosen line with Enter', async () => {
    const box = await openSearch();
    await userEvent.type(box, 'stef');
    const first = await screen.findByRole('option', { name: 'Ioana Stefănescu, Clasa 9A' });
    await userEvent.keyboard('{ArrowDown}');
    expect(box).toHaveAttribute('aria-activedescendant', first.id);
    expect(first).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowUp}');
    const all = screen.getByRole('option', { name: 'Toate rezultatele pentru „stef”' });
    expect(box).toHaveAttribute('aria-activedescendant', all.id);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(box).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Ștefan Radu, Clasa 10B' }).id);
    await userEvent.keyboard('{Enter}');
    await expectLocation('/elevi/10');
    expect(box).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens the results page with Enter when no line is chosen, and keeps the search in the box', async () => {
    const box = await openSearch();
    await userEvent.type(box, ' stef {Enter}');
    await expectLocation('/cautare?q=stef');
    expect(box).toHaveValue(' stef ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens a line with a click', async () => {
    const box = await openSearch();
    await userEvent.type(box, 'stew');
    await userEvent.click(await screen.findByRole('option', { name: 'Teorema lui Stewart, Clasa 9A · ciornă' }));
    await expectLocation('/teste/9A-26T1');
  });

  it('says when it finds nothing, with no line to choose', async () => {
    const box = await openSearch();
    await userEvent.type(box, 'zzz');
    expect(await screen.findByText('Nimic găsit în acest an școlar.')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(box).not.toHaveAttribute('aria-controls');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expectLocation('/cautare?q=zzz');
  });

  it('searches again after a change the teacher made', async () => {
    const api = searchApi();
    const box = await openSearch(api);
    await userEvent.type(box, 'stef');
    await screen.findByRole('option', { name: 'Ștefan Radu, Clasa 10B' });
    await api.renameStudent(10, 'Ștefan Radu-Pop');
    await act(() => box.queryClient.getMutationCache().build(box.queryClient, { mutationFn: async () => {} }).execute(undefined));
    expect(await screen.findByRole('option', { name: 'Ștefan Radu-Pop, Clasa 10B' })).toBeInTheDocument();
  });

  it('shows at most five of a group', async () => {
    const api = createFakeApi({
      classes: [{ id: 1, name: '10B', schoolYear: 2026, archived: false, studentCount: 7 }],
      students: { 1: Array.from({ length: 7 }, (_, index) => student(index + 1, `Ana ${String.fromCharCode(65 + index)}`)) },
    });
    const box = await openSearch(api);
    await userEvent.type(box, 'ana');
    const students = await screen.findByRole('group', { name: 'Elevi' });
    expect(within(students).getAllByRole('option')).toHaveLength(5);
  });

  it('closes the list with Esc before a panel closes', async () => {
    const box = await openSearch();
    await userEvent.click(screen.getByRole('button', { name: 'Clase' }));
    expect(screen.getByRole('complementary', { name: 'Clasele tale' })).toBeInTheDocument();
    await userEvent.type(box, 'stef');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Clasele tale' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Clasele tale' })).not.toBeInTheDocument();
  });

  it('closes the list when the focus leaves the box, and opens it again on focus', async () => {
    const box = await openSearch();
    await userEvent.type(box, 'stef');
    await screen.findByRole('listbox');
    await userEvent.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.click(box);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  RobotStart,
  Settings,
```

Replace it with:

```ts
  RobotStart,
  SearchResults,
  Settings,
```

- [ ] **Step 3: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../shared/scoring.ts';
import { averageGrade } from '../../shared/stats.ts';
```

Replace it with:

```ts
import { formatPoints, gradeOf, isValidCorrection, round2 } from '../../shared/scoring.ts';
import { searchMatcher } from '../../shared/search.ts';
import { averageGrade } from '../../shared/stats.ts';
```

- [ ] **Step 4: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    }),
    listTests: vi.fn(async (schoolYear: number) =>
```

Replace it with:

```ts
    }),
    // As the API: the active students of the year's classes (no grades), its
    // classes and its tests whose name holds the search.
    search: vi.fn(async (query: string, schoolYear: number): Promise<SearchResults> => {
      const matches = searchMatcher(query);
      const classes = data.classes.filter((c) => c.schoolYear === schoolYear);
      const students = new Map<number, SearchResults['students'][number]>();
      for (const cls of classes) {
        for (const student of (data.students[cls.id] ?? []).filter((s) => s.active && matches(s.fullName))) {
          const found = students.get(student.id) ?? { id: student.id, fullName: student.fullName, classes: [], lastGrade: null };
          found.classes.push({ id: cls.id, name: cls.name });
          students.set(student.id, found);
        }
      }
      return {
        students: [...students.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'ro')),
        classes: classes.filter((c) => matches(c.name)).map((c) => ({ ...c, studentCount: countActive(c.id) })),
        tests: tests.filter((t) => t.test.schoolYear === schoolYear && matches(t.test.title)).map(summaryOf),
      };
    }),
    listTests: vi.fn(async (schoolYear: number) =>
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run src/admin/search/SearchBox.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  10 failed (10)`: the top bar has no box (`Unable to find an accessible element with the role "combobox" and name "Caută elevi, clase și teste"`).

- [ ] **Step 6: Edit `src/admin/api.ts`**

Find this block:

```ts
  RobotStartAnswer,
  Settings,
```

Replace it with:

```ts
  RobotStartAnswer,
  SearchResults,
  Settings,
```

- [ ] **Step 7: Edit `src/admin/api.ts`**

Find this block:

```ts
  getStudentHistory(studentId: number): Promise<StudentHistory>;
  listTests(schoolYear: number): Promise<TestSummary[]>;
```

Replace it with:

```ts
  getStudentHistory(studentId: number): Promise<StudentHistory>;
  // The students, classes and tests of the year whose name holds the search.
  search(query: string, schoolYear: number): Promise<SearchResults>;
  listTests(schoolYear: number): Promise<TestSummary[]>;
```

- [ ] **Step 8: Edit `src/admin/api.ts`**

Find this block:

```ts
    getStudentHistory: (studentId) => request<StudentHistory>('GET', `/students/${studentId}/history`),
    listTests: async (schoolYear) => (await request<{ tests: TestSummary[] }>('GET', `/tests?year=${schoolYear}`)).tests,
```

Replace it with:

```ts
    getStudentHistory: (studentId) => request<StudentHistory>('GET', `/students/${studentId}/history`),
    search: (query, schoolYear) => request<SearchResults>('GET', `/search?q=${encodeURIComponent(query)}&year=${schoolYear}`),
    listTests: async (schoolYear) => (await request<{ tests: TestSummary[] }>('GET', `/tests?year=${schoolYear}`)).tests,
```

- [ ] **Step 9: Edit `src/admin/shell/icons.tsx`**

Find this block:

```tsx
      <path d="M10 6v4l2.5 2" />
    </svg>
  );
}
```

Replace it with:

```tsx
      <path d="M10 6v4l2.5 2" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg {...LINE} strokeWidth={1.7}>
      <circle cx="8.75" cy="8.75" r="5.25" />
      <path d="m12.75 12.75 4 4" />
    </svg>
  );
}

export function IconBack() {
  return (
    <svg {...LINE} strokeWidth={1.8}>
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </svg>
  );
}
```

- [ ] **Step 10: Edit `src/admin/testsPage/TestGroup.tsx`**

Find this block:

```tsx
// a draft again.
function startedText(test: TestSummary): string {
  if (test.status === 'draft') return 'ciornă';
```

Replace it with:

```tsx
// a draft again.
export function startedText(test: TestSummary): string {
  if (test.status === 'draft') return 'ciornă';
```

- [ ] **Step 11: Create `src/admin/search/useSearch.ts`**

```ts
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { foldForSearch, isSearchable } from '../../../shared/search.ts';
import { useApi } from '../ApiContext.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';

// How long the box waits after a key before it asks the API.
export const SEARCH_WAIT_MS = 200;

// The value, once it stopped changing for `wait` milliseconds.
function useSettled(value: string, wait: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (wait === 0) return setSettled(value);
    const timer = setTimeout(() => setSettled(value), wait);
    return () => clearTimeout(timer);
  }, [value, wait]);
  return wait === 0 ? value : settled;
}

// What the search finds in the selected school year. Two searches that fold
// to the same text share their answer; while a new one is on its way, the
// last answer stays on screen.
export function useSearch(text: string, wait = SEARCH_WAIT_MS) {
  const api = useApi();
  const { year } = useSchoolYear();
  const query = useSettled(text.trim(), wait);
  return useQuery({
    queryKey: ['search', year, foldForSearch(query)],
    queryFn: () => api.search(query, year),
    enabled: isSearchable(query),
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 12: Create `src/admin/search/Highlight.tsx`**

```tsx
import { matchRange } from '../../../shared/search.ts';

// The text with the part that holds the search in bold, diacritics aside.
export function Highlight({ text, query }: { text: string; query: string }) {
  const range = matchRange(text, query);
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range.start)}
      <mark>{text.slice(range.start, range.end)}</mark>
      {text.slice(range.end)}
    </>
  );
}
```

- [ ] **Step 13: Create `src/admin/search/SearchBox.tsx`**

```tsx
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { SearchResults } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { isSearchable } from '../../../shared/search.ts';
import { studentCountLabel } from '../../ui/format.ts';
import { IconSearch } from '../shell/icons.tsx';
import { startedText } from '../testsPage/TestGroup.tsx';
import { Highlight } from './Highlight.tsx';
import { useSearch } from './useSearch.ts';

// How many of each group the list under the box shows; the results page
// shows them all.
export const SHOWN_PER_GROUP = 5;

export const SEARCH_LABEL = 'Caută elevi, clase și teste';

interface Option {
  to: string;
  name: ReactNode;
  meta?: string;
}

interface Group {
  title: string;
  options: Option[];
}

// The address of the results page for a search.
export function resultsPath(text: string): string {
  return `/cautare?q=${encodeURIComponent(text.trim())}`;
}

function groupsOf(results: SearchResults, text: string): Group[] {
  const groups: Group[] = [
    {
      title: 'Elevi',
      options: results.students.slice(0, SHOWN_PER_GROUP).map((student) => ({
        to: `/elevi/${student.id}`,
        name: <Highlight text={student.fullName} query={text} />,
        meta: student.classes.map((cls) => displayClassName(cls.name)).join(', '),
      })),
    },
    {
      title: 'Clase',
      options: results.classes.slice(0, SHOWN_PER_GROUP).map((cls) => ({
        to: `/clase/${cls.id}`,
        name: (
          <>
            Clasa <Highlight text={cls.name} query={text} />
          </>
        ),
        meta: cls.archived ? `${studentCountLabel(cls.studentCount)} · arhivată` : studentCountLabel(cls.studentCount),
      })),
    },
    {
      title: 'Teste',
      options: results.tests.slice(0, SHOWN_PER_GROUP).map((test) => ({
        to: `/teste/${test.code}`,
        name: <Highlight text={test.title} query={text} />,
        meta: `${displayClassName(test.className)} · ${test.archived ? 'arhivat' : startedText(test)}`,
      })),
    },
  ];
  return groups.filter((group) => group.options.length > 0);
}

// The search box (redesign spec §11.10): typing opens a list under it,
// grouped "Elevi", "Clase", "Teste", and "Toate rezultatele" last. The arrows
// move, Enter opens the chosen line or, with none chosen, the results page.
// In the phone's search over the whole screen (`always`) the list stays open.
export function SearchBox({ id, always = false }: { id: string; always?: boolean }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const search = useSearch(text);
  const ready = isSearchable(text);
  const shown = ready && (always || open);
  const groups = ready && search.data ? groupsOf(search.data, text) : [];
  // With nothing found the list says so, and has no line to choose.
  const empty = search.data !== undefined && groups.length === 0;
  const all: Option = { to: resultsPath(text), name: `Toate rezultatele pentru „${text.trim()}”` };
  const options: Option[] = ready && !empty ? [...groups.flatMap((group) => group.options), all] : [];
  const listed = shown && options.length > 0;
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  const go = (to: string) => {
    setOpen(false);
    setActive(-1);
    if (!to.startsWith('/cautare')) setText('');
    void navigate(to);
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const last = options.length - 1;
      if (event.key === 'ArrowDown') setActive(active >= last ? 0 : active + 1);
      else setActive(active <= 0 ? last : active - 1);
    } else if (event.key === 'Enter') {
      if (!ready) return;
      event.preventDefault();
      go(options[active]?.to ?? resultsPath(text));
    } else if (event.key === 'Escape' && shown && !always) {
      // The list closes first; the next Esc reaches the page (a panel).
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  let index = -1;
  const optionOf = (option: Option, className = 'search-item') => {
    index += 1;
    const at = index;
    return (
      <div
        key={option.to}
        id={optionId(at)}
        role="option"
        aria-selected={at === active}
        className={at === active ? `${className} is-active` : className}
        // The focus stays in the box; the click opens the line.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => go(option.to)}
      >
        <span className="search-item-name">{option.name}</span>
        {option.meta && (
          <>
            <span className="sr-only">,</span> <span className="search-item-meta">{option.meta}</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div
      ref={box}
      className={always ? 'search search-always' : 'search'}
      role="search"
      onBlur={(event) => {
        if (!box.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <IconSearch />
      <input
        type="text"
        role="combobox"
        aria-label={SEARCH_LABEL}
        placeholder={SEARCH_LABEL}
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listed ? listId : undefined}
        aria-activedescendant={listed && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        maxLength={80}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {shown && (
        <div className="search-pop">
          {empty && <p className="search-none">Nimic găsit în acest an școlar.</p>}
          {search.error && !search.data && <p className="search-none">Căutarea nu a mers. Încearcă din nou.</p>}
          {listed && (
            <div id={listId} role="listbox" aria-label={`Rezultate pentru „${text.trim()}”`}>
              {groups.map((group) => (
                <div key={group.title} role="group" aria-labelledby={`${id}-${group.title}`} className="search-group">
                  <div id={`${id}-${group.title}`} role="presentation" className="search-group-title">
                    {group.title}
                  </div>
                  {group.options.map((option) => optionOf(option))}
                </div>
              ))}
              {optionOf(all, 'search-item search-all')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 14: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
import { useSchoolYear } from './SchoolYearContext.tsx';
import { ClassesPanel } from './shell/ClassesPanel.tsx';
```

Replace it with:

```tsx
import { useSchoolYear } from './SchoolYearContext.tsx';
import { SearchBox } from './search/SearchBox.tsx';
import { ClassesPanel } from './shell/ClassesPanel.tsx';
```

- [ ] **Step 15: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
  // a change can end or add a thing in "De făcut": every change a logged-in
  // teacher makes reads the account and the tests of the year again. Only
  // what was not read since the change started, and joining a read already on
```

Replace it with:

```tsx
  // a change can end or add a thing in "De făcut": every change a logged-in
  // teacher makes reads the account and the tests of the year again, and what
  // the search found (a new name, a new test). Only
  // what was not read since the change started, and joining a read already on
```

- [ ] **Step 16: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
        void queryClient.invalidateQueries({ queryKey: ['accounts'], predicate }, { cancelRefetch: false });
      }),
```

Replace it with:

```tsx
        void queryClient.invalidateQueries({ queryKey: ['accounts'], predicate }, { cancelRefetch: false });
        void queryClient.invalidateQueries({ queryKey: ['search'], predicate }, { cancelRefetch: false });
      }),
```

- [ ] **Step 17: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
        </Link>
        <div className="topbar-tools">
```

Replace it with:

```tsx
        </Link>
        {/* On a phone the search opens over the whole screen instead. */}
        {me.data && !phone && <SearchBox id="search" />}
        <div className="topbar-tools">
```

- [ ] **Step 18: Edit `src/ui/brand.css`**

Find this block:

```css
  padding-block: 0.25rem;
  font-size: 0.875rem;
```

Replace it with:

```css
  padding-block: 0.25rem;
  font-size: 0.875rem;
}

/* Search (redesign spec §11.10): the box after the lockup, and the list under
   it. On a phone it opens over the whole screen (the media query below). */
.search {
  position: relative;
  flex: 0 1 26rem;
  min-width: 0;
  margin-left: 0.5rem;
}

.search > svg {
  position: absolute;
  top: 50%;
  left: 0.75rem;
  width: 1rem;
  height: 1rem;
  color: var(--muted);
  transform: translateY(-50%);
  pointer-events: none;
}

.search input[type="text"] {
  width: 100%;
  min-height: 2.25rem;
  padding-block: 0.25rem;
  padding-left: 2.25rem;
  background: var(--raised);
  font-size: 0.875rem;
}

.search-pop {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  left: 0;
  z-index: 40;
  min-width: 24rem;
  max-height: calc(100dvh - var(--top) - 2rem);
  overflow-y: auto;
  padding: 0.5rem 0;
  border: 1px solid var(--rule);
  border-radius: var(--radius-panel);
  background: var(--sheet);
  box-shadow: var(--float);
}

.search-group {
  padding: 0.375rem 0;
}

.search-group + .search-group {
  border-top: 1px solid var(--line);
}

.search-group-title {
  padding: 0.25rem 1rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.search-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.45rem 1rem;
  color: var(--text);
  font-size: 0.875rem;
  cursor: pointer;
}

.search-item:hover,
.search-item.is-active {
  background: var(--ink-tint);
}

.search-item-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.search-item-meta {
  flex-shrink: 0;
  max-width: 60%;
  color: var(--muted);
  font-size: 0.8125rem;
  text-align: right;
}

/* The part that holds the search, in bold. */
.search mark,
.search-results mark {
  background: none;
  color: inherit;
  font-weight: 700;
}

.search-all {
  margin-top: 0.25rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--line);
  color: var(--ink);
  font-weight: 600;
}

.search-none {
  margin: 0;
  padding: 0.5rem 1rem;
  color: var(--muted);
  font-size: 0.875rem;
```

- [ ] **Step 19: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  128 passed | 1 skipped (129)`, `Tests  2052 passed | 3 skipped (2055)`.

- [ ] **Step 20: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 21: Commit**

```bash
git add src/admin/api.ts src/test/fakeApi.ts src/admin/shell/icons.tsx src/admin/testsPage/TestGroup.tsx src/admin/search/useSearch.ts src/admin/search/Highlight.tsx src/admin/search/SearchBox.tsx src/admin/search/SearchBox.test.tsx src/admin/Layout.tsx src/ui/brand.css
git commit -m "Add the search box to the top bar"
```

### Task 4: The results page

`/cautare?q=stef&arata=elevi`: everything the search found, one card per group, and the chips.

**Files:**
- Create: `src/admin/pages/SearchPage.tsx`
- Modify: `src/admin/AppRoutes.tsx`, `src/ui/brand.css`
- Test: `src/admin/pages/SearchPage.test.tsx` (new)

**Interfaces:**
- Consumes: `useSearch`, `Highlight` (Task 3); `stagesOf` (`admin/stages.ts`), `startedText` (Task 3).
- Produces: `SearchPage()` at the route `cautare`.

- [ ] **Step 1: Create `src/admin/pages/SearchPage.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StudentRow } from '../../../shared/api.ts';
import { createFakeApi, fakeTest } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

const student = (id: number, fullName: string): StudentRow => ({ id, fullName, active: true, canDelete: true });

function searchApi() {
  const api = createFakeApi({
    classes: [
      { id: 1, name: '10B', schoolYear: 2026, archived: false, studentCount: 2 },
      { id: 2, name: '9A', schoolYear: 2026, archived: false, studentCount: 2 },
      { id: 3, name: '12STE', schoolYear: 2026, archived: true, studentCount: 0 },
    ],
    students: {
      1: [student(10, 'Ștefan Radu'), student(11, 'Pop Ana')],
      2: [student(20, 'Ştefania Pop'), student(21, 'Ioana Stefănescu')],
    },
    tests: [
      fakeTest({ code: '9A-26T1', title: 'Teorema lui Stewart', classId: 2, className: '9A', status: 'done', resultsOpen: true, archived: true }),
      fakeTest({ code: '10B-26T1', title: 'Ștergerea fracțiilor', classId: 1, className: '10B' }),
    ],
  });
  return api;
}

async function openPage(path: string, api = searchApi()) {
  renderAdmin(path, api, <LocationProbe />);
  return screen.findByRole('heading', { level: 1 });
}

describe('the search results page', () => {
  it('shows every group the search found, with counts, the match in bold and each line a link', async () => {
    // The fake API gives no grades; the API gives the latest one.
    const api = searchApi();
    const real = api.search.getMockImplementation()!;
    api.search.mockImplementation(async (query, year) => {
      const found = await real(query, year);
      return { ...found, students: found.students.map((s) => (s.id === 10 ? { ...s, lastGrade: 7.1 } : s)) };
    });
    expect(await openPage('/cautare?q=stef', api)).toHaveTextContent('Rezultate pentru „stef”');
    expect(await screen.findByText('3 rezultate în anul școlar 2026-2027. Diacriticele nu contează.')).toBeInTheDocument();
    const chips = screen.getByRole('group', { name: 'Arată' });
    expect(within(chips).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Toate 3', 'Elevi 3', 'Clase 0', 'Teste 0']);
    expect(within(chips).getByRole('button', { name: 'Toate 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(chips).getByRole('button', { name: 'Clase 0' })).toBeDisabled();

    const students = screen.getByRole('table', { name: 'Elevi' });
    const rows = within(students).getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Ioana StefănescuClasa 9Anicio notă încă',
      'Ștefan RaduClasa 10Bultima notă 7,1',
      'Ştefania PopClasa 9Anicio notă încă',
    ]);
    expect(within(rows[1]!).getByRole('link', { name: 'Ștefan Radu' })).toHaveAttribute('href', '/elevi/10');
    expect(within(rows[0]!).getByText('Stef', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Clase' })).not.toBeInTheDocument();
    expect(api.search).toHaveBeenCalledWith('stef', 2026);
  });

  it('shows the classes and the tests with their state', async () => {
    await openPage('/cautare?q=ste');
    const classes = await screen.findByRole('table', { name: 'Clase' });
    expect(within(classes).getByRole('row').textContent).toBe('Clasa 12STEniciun elevarhivată');
    expect(within(classes).getByRole('link', { name: 'Clasa 12STE' })).toHaveAttribute('href', '/clase/3');
    const tests = screen.getByRole('table', { name: 'Teste' });
    expect(within(tests).getAllByRole('row').map((row) => row.textContent)).toEqual([
      'Teorema lui StewartClasa 9A · arhivatRezultate · publicate',
      'Ștergerea fracțiilorClasa 10B · ciornăPregătire · lipsește testul',
    ]);
    expect(within(tests).getByRole('link', { name: 'Teorema lui Stewart' })).toHaveAttribute('href', '/teste/9A-26T1');
  });

  it('shows one group with its chip, kept in the address', async () => {
    await openPage('/cautare?q=ste');
    await screen.findByRole('table', { name: 'Clase' });
    await userEvent.click(screen.getByRole('button', { name: 'Teste 2' }));
    await expectLocation('/cautare?q=ste&arata=teste');
    expect(screen.getByRole('button', { name: 'Teste 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('table', { name: 'Teste' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Elevi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Clase' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Toate 6' }));
    await expectLocation('/cautare?q=ste');
    expect(screen.getByRole('table', { name: 'Elevi' })).toBeInTheDocument();
  });

  it('shows every group for a chip of an empty group in the address', async () => {
    await openPage('/cautare?q=stef&arata=clase');
    expect(await screen.findByRole('table', { name: 'Elevi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toate 3' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says when it finds nothing', async () => {
    await openPage('/cautare?q=zzz');
    expect(await screen.findByText('Niciun rezultat în anul școlar 2026-2027. Diacriticele nu contează.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Arată' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('asks for two letters with no search, or a search too short', async () => {
    const api = searchApi();
    for (const path of ['/cautare', '/cautare?q=%20s%20']) {
      const { unmount } = renderAdmin(path, api);
      expect(await screen.findByRole('heading', { level: 1, name: 'Caută' })).toBeInTheDocument();
      expect(screen.getByText('Scrie cel puțin două litere în caseta de căutare.')).toBeInTheDocument();
      unmount();
    }
    expect(api.search).not.toHaveBeenCalled();
  });

  it('shows the error when the search fails', async () => {
    const api = searchApi();
    api.search.mockRejectedValue(new Error('network'));
    await openPage('/cautare?q=stef', api);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Se încarcă…')).not.toBeInTheDocument();
  });

  it('opens from the box with Enter and searches again from there', async () => {
    const api = searchApi();
    renderAdmin('/', api, <LocationProbe />);
    await screen.findByRole('navigation', { name: 'Meniu' });
    const box = screen.getByRole('combobox', { name: 'Caută elevi, clase și teste' });
    await userEvent.type(box, 'stef{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Rezultate pentru „stef”' })).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'stew{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Rezultate pentru „stew”' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Teste' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/admin/pages/SearchPage.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  8 failed (8)`: `/cautare` is the page "not found" (no heading "Rezultate pentru „stef”", no chips, no tables).

- [ ] **Step 3: Create `src/admin/pages/SearchPage.tsx`**

```tsx
import { useId, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { SearchResults } from '../../../shared/api.ts';
import { displayClassName } from '../../../shared/classes.ts';
import { formatSchoolYear } from '../../../shared/schoolYear.ts';
import { formatPoints } from '../../../shared/scoring.ts';
import { isSearchable } from '../../../shared/search.ts';
import { countLabel, studentCountLabel } from '../../ui/format.ts';
import { ErrorMessage } from '../ErrorMessage.tsx';
import { useSchoolYear } from '../SchoolYearContext.tsx';
import { Highlight } from '../search/Highlight.tsx';
import { useSearch } from '../search/useSearch.ts';
import { stagesOf } from '../stages.ts';
import { startedText } from '../testsPage/TestGroup.tsx';

const GROUPS = { elevi: 'Elevi', clase: 'Clase', teste: 'Teste' } as const;
type GroupName = keyof typeof GROUPS;

function countsOf(results: SearchResults): Record<GroupName, number> {
  return { elevi: results.students.length, clase: results.classes.length, teste: results.tests.length };
}

// The results page (redesign spec §11.10): everything the search found in the
// school year, one card per group, and chips that show one group. The search
// and the chip live in the address (?q=stef&arata=elevi), so a link or a
// reload keeps them.
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const { year } = useSchoolYear();
  const text = (params.get('q') ?? '').trim();
  const search = useSearch(text, 0);

  if (!isSearchable(text)) {
    return (
      <section className="search-results">
        <h1>Caută</h1>
        <p className="hint">Scrie cel puțin două litere în caseta de căutare.</p>
      </section>
    );
  }

  const results = search.data;
  const counts = results ? countsOf(results) : null;
  const total = counts ? counts.elevi + counts.clase + counts.teste : 0;
  // A chip whose group is empty cannot be chosen; an old link to one shows all.
  const asked = params.get('arata');
  const show = asked && asked in GROUPS && counts && counts[asked as GroupName] > 0 ? (asked as GroupName) : null;
  const choose = (name: GroupName | null) => {
    const next = new URLSearchParams(params);
    if (name === null) next.delete('arata');
    else next.set('arata', name);
    setParams(next, { replace: true });
  };
  const shows = (name: GroupName) => (show === null || show === name) && counts !== null && counts[name] > 0;

  return (
    <section className="search-results">
      <h1>Rezultate pentru „{text}”</h1>
      {search.error && <ErrorMessage error={search.error} />}
      {!results && !search.error && <p>Se încarcă…</p>}
      {results && counts && (
        <>
          <p className="hint">
            {total === 0 ? 'Niciun rezultat' : countLabel(total, 'rezultat', 'rezultate')} în anul școlar {formatSchoolYear(year)}. Diacriticele nu contează.
          </p>
          {total > 0 && (
            <div className="chips" role="group" aria-label="Arată">
              <button type="button" className="chip" aria-pressed={show === null} onClick={() => choose(null)}>
                Toate <span className="chip-count">{total}</span>
              </button>
              {(Object.keys(GROUPS) as GroupName[]).map((name) => (
                <button key={name} type="button" className="chip" aria-pressed={show === name} disabled={counts[name] === 0} onClick={() => choose(name)}>
                  {GROUPS[name]} <span className="chip-count">{counts[name]}</span>
                </button>
              ))}
            </div>
          )}
          {shows('elevi') && (
            <ResultsCard title="Elevi" count={counts.elevi}>
              {results.students.map((student) => (
                <tr key={student.id}>
                  <th scope="row">
                    <Link to={`/elevi/${student.id}`}>
                      <Highlight text={student.fullName} query={text} />
                    </Link>
                  </th>
                  <td>{student.classes.map((cls) => displayClassName(cls.name)).join(', ')}</td>
                  <td className={student.lastGrade === null ? 'num is-muted' : 'num'}>
                    {student.lastGrade === null ? 'nicio notă încă' : `ultima notă ${formatPoints(student.lastGrade)}`}
                  </td>
                </tr>
              ))}
            </ResultsCard>
          )}
          {shows('clase') && (
            <ResultsCard title="Clase" count={counts.clase}>
              {results.classes.map((cls) => (
                <tr key={cls.id}>
                  <th scope="row">
                    <Link to={`/clase/${cls.id}`}>
                      Clasa <Highlight text={cls.name} query={text} />
                    </Link>
                  </th>
                  <td>{studentCountLabel(cls.studentCount)}</td>
                  <td className="num is-muted">{cls.archived ? 'arhivată' : ''}</td>
                </tr>
              ))}
            </ResultsCard>
          )}
          {shows('teste') && (
            <ResultsCard title="Teste" count={counts.teste}>
              {results.tests.map((test) => {
                const { current } = stagesOf(test);
                return (
                  <tr key={test.code}>
                    <th scope="row">
                      <Link to={`/teste/${test.code}`}>
                        <Highlight text={test.title} query={text} />
                      </Link>
                    </th>
                    <td>
                      {displayClassName(test.className)} · {test.archived ? 'arhivat' : startedText(test)}
                    </td>
                    <td className="num">
                      <b>{current.name}</b>
                      {current.note && ` · ${current.note}`}
                    </td>
                  </tr>
                );
              })}
            </ResultsCard>
          )}
          <p className="hint">Cauți în alt an școlar? Alege anul școlar, apoi caută din nou.</p>
        </>
      )}
    </section>
  );
}

function ResultsCard({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const id = useId();
  return (
    <section className="class-card" aria-labelledby={id}>
      <div className="class-card-head">
        <h2 id={id}>{title}</h2>
        <span>{count}</span>
      </div>
      <div className="table-wrap">
        <table className="search-table" aria-labelledby={id}>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
import { ReviewPage } from './pages/ReviewPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
```

Replace it with:

```tsx
import { ReviewPage } from './pages/ReviewPage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
```

- [ ] **Step 5: Edit `src/admin/AppRoutes.tsx`**

Find this block:

```tsx
        <Route path="elevi/:id" element={<StudentPage />} />
        <Route path="setari" element={<SettingsPage />} />
```

Replace it with:

```tsx
        <Route path="elevi/:id" element={<StudentPage />} />
        <Route path="cautare" element={<SearchPage />} />
        <Route path="setari" element={<SettingsPage />} />
```

- [ ] **Step 6: Edit `src/ui/brand.css`**

Find this block:

```css
  padding: 0.5rem 1rem;
  color: var(--muted);
  font-size: 0.875rem;
}

.rail {
```

Replace it with:

```css
  padding: 0.5rem 1rem;
  color: var(--muted);
  font-size: 0.875rem;
}

/* The results page: the chips, then one card per group. */
.search-results h1 + .hint {
  margin: -0.25rem 0 1rem;
}

.search-results .chips {
  margin-bottom: 1rem;
}

.search-results .class-card + .class-card {
  margin-top: 1rem;
}

.search-results .class-card + .hint {
  margin-top: 1rem;
}

.chip-count {
  margin-left: 0.25rem;
  opacity: 0.75;
}

table.search-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.search-table th,
.search-table td {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: baseline;
}

.search-table tr:last-child > * {
  border-bottom: 0;
}

.search-table th {
  padding-left: 1.25rem;
  font-weight: 600;
}

.search-table td:last-child {
  padding-right: 1.25rem;
}

.search-table .num {
  text-align: right;
  white-space: nowrap;
}

.search-table .is-muted {
  color: var(--muted);
}

.rail {
```

- [ ] **Step 7: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  129 passed | 1 skipped (130)`, `Tests  2060 passed | 3 skipped (2063)`.

- [ ] **Step 8: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add src/admin/pages/SearchPage.tsx src/admin/pages/SearchPage.test.tsx src/admin/AppRoutes.tsx src/ui/brand.css
git commit -m "Add the search results page"
```

### Task 5: The search on a phone

The magnifier beside ☰ and the search over the whole screen.

**Files:**
- Create: `src/admin/search/SearchLayer.tsx`
- Modify: `src/admin/shell/Rail.tsx`, `src/admin/Layout.tsx`, `src/ui/brand.css`
- Test: `src/admin/search/SearchLayer.test.tsx` (new)

**Interfaces:**
- Consumes: `SearchBox` with `always` (Task 3); `useFocusBack` (`shell/useFocusBack.ts`).
- Produces: `SearchLayer({ onClose })`; `PanelName` gains `'search'`.

- [ ] **Step 1: Create `src/admin/search/SearchLayer.test.tsx`**

```tsx
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../../test/fakeApi.ts';
import { expectLocation, LocationProbe, renderAdmin } from '../../test/renderAdmin.tsx';

function searchApi() {
  return createFakeApi({
    classes: [{ id: 1, name: '10B', schoolYear: 2026, archived: false, studentCount: 1 }],
    students: { 1: [{ id: 10, fullName: 'Ștefan Radu', active: true, canDelete: true }] },
  });
}

async function openPhone() {
  renderAdmin('/', searchApi(), <LocationProbe />);
  await screen.findByRole('navigation', { name: 'Meniu' });
  return screen.getByRole('button', { name: 'Caută' });
}

describe('the search on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 56.25rem)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('has a magnifier beside ☰ in place of the box', async () => {
    const magnifier = await openPhone();
    expect(screen.queryByRole('combobox', { name: 'Caută elevi, clase și teste' })).not.toBeInTheDocument();
    expect(magnifier).toHaveAttribute('aria-expanded', 'false');
    expect(magnifier.nextElementSibling).toBe(screen.getByRole('button', { name: 'Mai mult' }));
  });

  it('opens the search over the whole screen, with the box ready, and ← closes it', async () => {
    const magnifier = await openPhone();
    await userEvent.click(magnifier);
    const layer = screen.getByRole('dialog', { name: 'Caută' });
    expect(magnifier).toHaveAttribute('aria-expanded', 'true');
    expect(magnifier).toHaveAttribute('aria-controls', layer.id);
    const box = within(layer).getByRole('combobox', { name: 'Caută elevi, clase și teste' });
    expect(box).toHaveFocus();
    expect(screen.getByRole('main', { hidden: true })).toHaveAttribute('inert');
    await userEvent.type(box, 'stef');
    expect(await within(layer).findByRole('option', { name: 'Ștefan Radu, Clasa 10B' })).toBeInTheDocument();
    // The list stays open while the focus moves inside the layer.
    await userEvent.click(within(layer).getByRole('button', { name: 'Închide căutarea' }));
    expect(screen.queryByRole('dialog', { name: 'Caută' })).not.toBeInTheDocument();
    expect(magnifier).toHaveFocus();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  });

  it('closes with Esc, even with the list open', async () => {
    const magnifier = await openPhone();
    await userEvent.click(magnifier);
    await userEvent.type(screen.getByRole('combobox', { name: 'Caută elevi, clase și teste' }), 'stef');
    await screen.findByRole('option', { name: 'Ștefan Radu, Clasa 10B' });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Caută' })).not.toBeInTheDocument();
    expect(magnifier).toHaveFocus();
  });

  it('closes when a line opens its page', async () => {
    const magnifier = await openPhone();
    await userEvent.click(magnifier);
    await userEvent.type(screen.getByRole('combobox', { name: 'Caută elevi, clase și teste' }), 'stef');
    await userEvent.click(await screen.findByRole('option', { name: 'Ștefan Radu, Clasa 10B' }));
    await expectLocation('/elevi/10');
    expect(screen.queryByRole('dialog', { name: 'Caută' })).not.toBeInTheDocument();
  });

  it('closes the menu under ☰ when it opens', async () => {
    const magnifier = await openPhone();
    await userEvent.click(screen.getByRole('button', { name: 'Mai mult' }));
    expect(screen.getByRole('region', { name: 'Mai mult' })).toBeInTheDocument();
    await userEvent.click(magnifier);
    expect(screen.queryByRole('region', { name: 'Mai mult' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Caută' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/admin/search/SearchLayer.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  5 failed (5)`: the phone's top bar has no magnifier (`Unable to find an accessible element with the role "button" and name "Caută"`).

- [ ] **Step 3: Create `src/admin/search/SearchLayer.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { IconBack } from '../shell/icons.tsx';
import { useFocusBack } from '../shell/useFocusBack.ts';
import { SearchBox } from './SearchBox.tsx';

// On a phone the magnifier beside ☰ opens the search over the whole screen
// (redesign spec §11.10): ← and Esc close it, and so does a new page (the
// Layout). The focus then goes back to the magnifier.
export function SearchLayer({ onClose }: { onClose(): void }) {
  const box = useRef<HTMLDivElement>(null);
  useFocusBack(box);
  // After useFocusBack noted the magnifier: the box is ready for typing.
  useEffect(() => box.current?.querySelector('input')?.focus(), []);
  return (
    <div ref={box} className="search-full" id="search-full" role="dialog" aria-modal="true" aria-label="Caută">
      <div className="search-full-head">
        <button type="button" className="search-back" aria-label="Închide căutarea" onClick={onClose}>
          <IconBack />
        </button>
        <SearchBox id="search-phone" always />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Edit `src/admin/shell/Rail.tsx`**

Find this block:

```tsx

// The side panels, and the phone menu under ☰: one open at a time.
export type PanelName = 'clase' | 'todo' | 'menu';

```

Replace it with:

```tsx

// The side panels, the phone menu under ☰ and the phone's search over the
// whole screen: one open at a time.
export type PanelName = 'clase' | 'todo' | 'menu' | 'search';

```

- [ ] **Step 5: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
import { DemoButton } from './shell/DemoButton.tsx';
import { IconClose, IconMenu } from './shell/icons.tsx';
import { PhoneMenu } from './shell/PhoneMenu.tsx';
```

Replace it with:

```tsx
import { DemoButton } from './shell/DemoButton.tsx';
import { SearchLayer } from './search/SearchLayer.tsx';
import { IconClose, IconMenu, IconSearch } from './shell/icons.tsx';
import { PhoneMenu } from './shell/PhoneMenu.tsx';
```

- [ ] **Step 6: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
        </div>
        {me.data && (
```

Replace it with:

```tsx
        </div>
        {me.data && phone && (
          <button
            type="button"
            className="search-button"
            aria-label="Caută"
            aria-expanded={open === 'search'}
            aria-controls={open === 'search' ? 'search-full' : undefined}
            onClick={() => toggle('search')}
          >
            <IconSearch />
          </button>
        )}
        {me.data && (
```

- [ ] **Step 7: Edit `src/admin/Layout.tsx`**

Find this block:

```tsx
      )}
      {/* On a phone a panel covers the page: the page under it is out of reach. */}
      <main className={wayIn ? 'page page-way-in' : 'page'} inert={phone && (open === 'clase' || open === 'todo')}>
        {openPage ? (
```

Replace it with:

```tsx
      )}
      {me.data && phone && open === 'search' && <SearchLayer onClose={close} />}
      {/* On a phone a panel covers the page: the page under it is out of reach. */}
      <main className={wayIn ? 'page page-way-in' : 'page'} inert={phone && (open === 'clase' || open === 'todo' || open === 'search')}>
        {openPage ? (
```

- [ ] **Step 8: Edit `src/ui/brand.css`**

Find this block:

```css
  padding: 0.5rem 1rem;
  color: var(--muted);
  font-size: 0.875rem;
}

/* The results page: the chips, then one card per group. */
```

Replace it with:

```css
  padding: 0.5rem 1rem;
  color: var(--muted);
  font-size: 0.875rem;
}

/* The magnifier beside ☰, and the search over the whole screen, on a phone
   only (the Layout draws them there). The list fills the screen under the box. */
.search-button,
.search-back {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  border: 1px solid var(--control);
  border-radius: var(--radius);
  background: var(--sheet);
  color: var(--text);
  cursor: pointer;
}

.search-button {
  margin-left: auto;
}

.search-button + .menu-button {
  margin-left: -0.5rem;
}

.search-back {
  flex-shrink: 0;
  border-color: transparent;
}

.search-button svg,
.search-back svg {
  width: 1.25rem;
  height: 1.25rem;
}

.search-full {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--sheet);
}

.search-full-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 3.5rem;
  padding: 0 max(1rem, env(safe-area-inset-right, 0px)) 0 max(0.5rem, env(safe-area-inset-left, 0px));
  border-bottom: 1px solid var(--rule);
}

.search-full .search {
  flex: 1;
  margin-left: 0;
}

.search-full .search input[type="text"] {
  min-height: 2.5rem;
  font-size: 1rem;
}

.search-full .search-pop {
  position: fixed;
  top: 3.5rem;
  right: 0;
  bottom: 0;
  left: 0;
  min-width: 0;
  max-height: none;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.search-full .search-item {
  padding-block: 0.65rem;
  font-size: 1rem;
}

/* The results page: the chips, then one card per group. */
```

- [ ] **Step 9: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  130 passed | 1 skipped (131)`, `Tests  2065 passed | 3 skipped (2068)`.

- [ ] **Step 10: Run the typecheck**

Run: `npm run typecheck`
Expected: no output after the command line, exit code 0.

- [ ] **Step 11: Commit**

```bash
git add src/admin/search/SearchLayer.tsx src/admin/search/SearchLayer.test.tsx src/admin/shell/Rail.tsx src/admin/Layout.tsx src/ui/brand.css
git commit -m "Open the search over the whole screen on a phone"
```

### Task 6: The notes

The notes and the spec describe search.

**Files:**
- Modify: `AGENTS.md`, `src/AGENTS.md`, `server/AGENTS.md`, `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`

- [ ] **Step 1: Edit `AGENTS.md`**

Find this block:

```markdown
- `server/`: the API (routes, D1 queries, auth, R2 files, secrets, emails).
- `shared/`: code for the API, the browser, and the robot: zod request schemas and response types (`api.ts`), roles and the demo paper limit (`accounts.ts`), school year, class and student names, ids, test codes (`tests.ts`), file rules and R2 keys (`files.ts`), the robot's output contracts and their JSON Schemas (`schemas.ts`), points and grades (`scoring.ts`), robot API bodies (`runner.ts`).
- Payments with Stripe Checkout: `docs/payments.md`.
```

Replace it with:

```markdown
- `server/`: the API (routes, D1 queries, auth, R2 files, secrets, emails).
- `shared/`: code for the API, the browser, and the robot: zod request schemas and response types (`api.ts`), roles and the demo paper limit (`accounts.ts`), school year, class and student names, ids, test codes (`tests.ts`), file rules and R2 keys (`files.ts`), the robot's output contracts and their JSON Schemas (`schemas.ts`), points and grades (`scoring.ts`), robot API bodies (`runner.ts`), the search fold that ignores case and diacritics (`search.ts`).
- Payments with Stripe Checkout: `docs/payments.md`.
```

- [ ] **Step 2: Edit `src/AGENTS.md`**

Find this block:

```markdown
- `pages/SettingsPage.tsx` is Setări (redesign spec §11.8, administrators only): three tabs, with the tab in the address (`?tab=corectarea`, `?tab=robotul`; none, or one it does not know, is "Conturi", and a click replaces the address). The three panels stay drawn, the others `hidden`, so a new key or password shown once survives a look at another tab. "Conturi" (`settingsPage/AccountsSection.tsx`) holds a red-edged card of the accounts that wait (gone when none waits; "Refuză toate" from two up) and "Toate conturile", with ⋯ (`shell/useSmallMenu.ts`) on a teacher's row only: "Fă cont complet" or "Fă cont demo", "Parolă nouă", "Închide contul", and for a closed account "Redeschide contul". An item closes the menu and gives the focus back to ⋯ before it asks or acts; the new password and an error show in a row under the account. The red count of "Conturi" reads `['accounts']` on every tab. "Corectarea" saves each control as it changes: the new value shows at once, the control stays on while it saves, and a refusal puts back the saved value. "Robotul" holds "Starea robotului" (a tag: "lucrează acum" or "nu lucrează acum") and "Cheia robotului" with the day it was made (`robotKeyAt`; a key made before that was kept has none). Below 40rem each account row is a block (CSS).
- `EmptyState.tsx` is an empty place of the teacher app (redesign spec §11.9): an icon (`shell/icons.tsx`), a heading at the level of its place (`level`: an h3 under a panel's or a card's title, an h2 in a card with none, an h1 on a page with no other heading), one sentence, and at most one button, its one next step. It is used by "Clasele tale" with no class (its "+ Clasă nouă", and "Nu ai nicio clasă activă" when archived ones exist; the panel's own foot then shows only "Arhivate (n)"), "Ce ai de făcut" with nothing, `/clase` with no active class, a class with no students or no tests (`NoStudents` in `classPage/GradesTable.tsx`, on both tabs; an archived class gets the same headings and no button), În clasă while the test is open and no student has started an upload (`submissionId` null on every row; the QR code on the whole screen, `QrOverlay` of `UploadLink.tsx`, belongs to the panel, so it stays open when the first paper arrives; closing it gives the focus to its button, or to the panel's heading), and Rezultate with nothing to publish (`NoResultsYet` in `ResultsAccess.tsx`, "Mergi la Corectare"; the students' links stay under it). A new teacher (no test in the year, and `testsEvaluated` 0) sees on the Teste page (after "Se încarcă…" while the tests load, not the other greeting) "Bun venit, …" and `testsPage/FirstSteps.tsx` ("Primii pași": a class, a test, the print) in place of the filters and the lists; the card goes once a test exists.
```

Replace it with:

```markdown
- `pages/SettingsPage.tsx` is Setări (redesign spec §11.8, administrators only): three tabs, with the tab in the address (`?tab=corectarea`, `?tab=robotul`; none, or one it does not know, is "Conturi", and a click replaces the address). The three panels stay drawn, the others `hidden`, so a new key or password shown once survives a look at another tab. "Conturi" (`settingsPage/AccountsSection.tsx`) holds a red-edged card of the accounts that wait (gone when none waits; "Refuză toate" from two up) and "Toate conturile", with ⋯ (`shell/useSmallMenu.ts`) on a teacher's row only: "Fă cont complet" or "Fă cont demo", "Parolă nouă", "Închide contul", and for a closed account "Redeschide contul". An item closes the menu and gives the focus back to ⋯ before it asks or acts; the new password and an error show in a row under the account. The red count of "Conturi" reads `['accounts']` on every tab. "Corectarea" saves each control as it changes: the new value shows at once, the control stays on while it saves, and a refusal puts back the saved value. "Robotul" holds "Starea robotului" (a tag: "lucrează acum" or "nu lucrează acum") and "Cheia robotului" with the day it was made (`robotKeyAt`; a key made before that was kept has none). Below 40rem each account row is a block (CSS).
- `admin/search/` is search (redesign spec §11.10). `SearchBox.tsx` is the box after the lockup in the top bar ("Caută elevi, clase și teste", an ARIA combobox): from two letters, the list under it shows at most five of each group, "Elevi" (the classes on the right), "Clase" (the students, "arhivată"), "Teste" (the class and the date), with the match in bold (`Highlight.tsx`, `matchRange` of `shared/search.ts`), and "Toate rezultatele pentru „stef”" last. The arrows move (`aria-activedescendant`), Enter opens the chosen line or, with none chosen, the results page; a chosen line empties the box. Esc closes the list first and marks it with `preventDefault()`, so a panel stays open. `useSearch.ts` asks `/api/admin/search` 200 ms after the typing stops, keyed by the year and the folded text, and keeps the last answer on screen meanwhile; the shell reads `['search']` again after every change. `pages/SearchPage.tsx` is the results page at `/cautare?q=stef&arata=elevi`: "Rezultate pentru „stef”", how many in the school year, the chips "Toate", "Elevi", "Clase", "Teste" with their counts (an empty group's chip is disabled; an old link to it shows all), and one card per group: a student with the classes and "ultima notă" or "nicio notă încă", a class with its students, a test with its class, date and stage (`stagesOf`). On a phone the box gives way to a magnifier beside ☰ (`Layout.tsx`, the panel `search`): `SearchLayer.tsx` is the search over the whole screen, a dialog with ← "Închide căutarea" and the list always open; ←, Esc and a new page close it, the page under it is `inert`, and the focus goes back to the magnifier. The class page's student search uses the same fold.
- `EmptyState.tsx` is an empty place of the teacher app (redesign spec §11.9): an icon (`shell/icons.tsx`), a heading at the level of its place (`level`: an h3 under a panel's or a card's title, an h2 in a card with none, an h1 on a page with no other heading), one sentence, and at most one button, its one next step. It is used by "Clasele tale" with no class (its "+ Clasă nouă", and "Nu ai nicio clasă activă" when archived ones exist; the panel's own foot then shows only "Arhivate (n)"), "Ce ai de făcut" with nothing, `/clase` with no active class, a class with no students or no tests (`NoStudents` in `classPage/GradesTable.tsx`, on both tabs; an archived class gets the same headings and no button), În clasă while the test is open and no student has started an upload (`submissionId` null on every row; the QR code on the whole screen, `QrOverlay` of `UploadLink.tsx`, belongs to the panel, so it stays open when the first paper arrives; closing it gives the focus to its button, or to the panel's heading), and Rezultate with nothing to publish (`NoResultsYet` in `ResultsAccess.tsx`, "Mergi la Corectare"; the students' links stay under it). A new teacher (no test in the year, and `testsEvaluated` 0) sees on the Teste page (after "Se încarcă…" while the tests load, not the other greeting) "Bun venit, …" and `testsPage/FirstSteps.tsx` ("Primii pași": a class, a test, the print) in place of the filters and the lists; the card goes once a test exists.
```

- [ ] **Step 3: Edit `server/AGENTS.md`**

Find this block:

```markdown
- The student's history (`getStudentHistory`, one batch of four statements) lists the started tests of the student's classes; an archived test, or a test of a class the student left, only when the student sent a paper to it. Its papers use the grades table's columns (`GRADE_COLUMNS` and `gradeOf` in `db/students.ts`, shared with `listClassGrades`).
- Deleting a student from a class (`DELETE /classes/:id/students/:studentId`) checks in its SQL that no upload of the student in this class's tests is `submitted`, `grading` or `graded`. It deletes this class's enrollment and the student's `uploading` and `failed` uploads there (and their R2 files), never the `students` row: `addStudentsToClass` takes `MAX(id) + 1`, so a deleted row would hand its id to the next student, and a stale page names a student by id. When a guard `EXISTS` reads a row that the same batch deletes, the guarded statement runs first.
```

Replace it with:

```markdown
- The student's history (`getStudentHistory`, one batch of four statements) lists the started tests of the student's classes; an archived test, or a test of a class the student left, only when the student sent a paper to it. Its papers use the grades table's columns (`GRADE_COLUMNS` and `gradeOf` in `db/students.ts`, shared with `listClassGrades`).
- Search (`routes/search.ts`, `db/search.ts`, `GET /api/admin/search?q=&year=`): the students of the year's classes (one batch of two statements: their enrollments, with the classes they are in or the ones they left when they are in none, and a window query for the grade of each one's latest graded paper of the year), the year's classes (`listClasses`) and its tests (`listTests`, the Teste page's rows) are read whole, at once, and matched in the Worker with `searchMatcher` of `shared/search.ts` (NFD, no marks, one case). No folded column: one teacher has a few hundred names in a year, and SQLite's `LIKE` folds only ASCII. A class matches by its stored name ("10B"), not by "Clasa 10B". The search needs two letters once folded and at most 80 characters (400 otherwise); a test counts the queries of one request against the 15 allowed.
- Deleting a student from a class (`DELETE /classes/:id/students/:studentId`) checks in its SQL that no upload of the student in this class's tests is `submitted`, `grading` or `graded`. It deletes this class's enrollment and the student's `uploading` and `failed` uploads there (and their R2 files), never the `students` row: `addStudentsToClass` takes `MAX(id) + 1`, so a deleted row would hand its id to the next student, and a stale page names a student by id. When a guard `EXISTS` reads a row that the same batch deletes, the guarded statement runs first.
```

- [ ] **Step 4: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
- On a phone a magnifier beside ☰ opens the search over the whole screen, with ← to close.
- The API `/api/admin/search` is scoped by the teacher and stays within 15 D1 queries. A folded-name column may need a migration.

```

Replace it with:

```markdown
- On a phone a magnifier beside ☰ opens the search over the whole screen, with ← to close.
- The API `/api/admin/search` is scoped by the teacher and stays within 15 D1 queries. No migration: it reads the year's students, classes and tests whole and matches their names in the Worker (`shared/search.ts`), because SQLite's `LIKE` folds only ASCII letters.
- Built (8f): the search needs two letters. It matches anywhere in a name, a class by its own name ("10B"); archived classes and tests of the year are found and marked. A student in two classes of the year is one line, with both classes. The list under the box shows at most five of each group. A chosen line empties the box; the results page keeps the search in it.

```

- [ ] **Step 5: Run all tests to see them pass**

Run: `npm test`
Expected: PASS. `Test Files  130 passed | 1 skipped (131)`, `Tests  2065 passed | 3 skipped (2068)`.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md src/AGENTS.md server/AGENTS.md docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md
git commit -m "Describe search in the notes and the spec"
```

### Task 7: Look at it, then the pull request (main session)

Not a subagent task. Nothing here changes code unless a check fails; a fix found here is prototyped, tested and committed like the tasks above, and named to the user.

The Opus review of Tasks 1–6 (2026-11-08) found nothing critical and two Important findings, both fixed test-first in one commit, "Fix the review findings of search" (`refs/proto16/f7`): the matcher now folds a whole name at once (measured on this PC with 600 student names, 300 titles and 30 classes: about 8.5 ms warm and 20 ms cold before, about 2.5 ms warm and 9 ms cold after; folding one letter at a time is kept only for the bold part) and matches the students before sorting them; and under the phone's search the top bar and the bar are `inert` too, so the focus cannot leave the dialog. The same commit fixes four minors: the list opens with the first answer (no empty box, `aria-expanded` follows the listbox, "Nimic găsit" in a `role="status"`), an older answer never says "Nimic găsit" and a new answer forgets the chosen line, the results page shows no older answer under a new search, a student's classes come in class order, and a wider screen closes the phone's search. Left as is: iOS Safari does not focus a tapped button, so the focus may not return to the magnifier there.

- [ ] **Step 1: Check the exactness of the branch**

Run: `git diff --stat refs/proto16/f7 HEAD -- . ':!docs/superpowers/plans'`
Expected: no output.

- [ ] **Step 2: Run the whole suite three times, and once in UTC**

Run `npm test` three times, then once with `TZ=UTC` (Git Bash: `TZ=UTC npm test`).
Expected: PASS every time. `Test Files  130 passed | 1 skipped (131)`, `Tests  2070 passed | 3 skipped (2073)`.

- [ ] **Step 3: Build and start the production build**

Check port 8788 first (`netstat -ano | findstr :8788`; end a leftover `workerd.exe` as `AGENTS.md` says). Run `npm run db:local`, then the Claude Code preview server `preview` (`npm run preview`, http://127.0.0.1:8788). The development login of `.dev.vars` logs in the local teacher. Choose the school year 2026-2027, which holds the local sample classes.
Expected: `Ready on http://127.0.0.1:8788`.

- [ ] **Step 4: Look at the pages at 1440px, 1024px and 390px, light and dark**

The box in the top bar (at 1024px it must leave room for the year, the theme and the initials, and a demo account's button); its list for a search with students, classes and tests, with a line chosen by the arrows; "Nimic găsit"; the results page with its chips; on a phone the magnifier, the search over the whole screen and the results page. Measure `document.documentElement.scrollWidth <= innerWidth` on each. While the browser pane is hidden, focus and clicks do not reach the page: type with `javascript_tool` (the value setter and an `input` event) and measure there.
Expected: the look of round 7, page "Căutare" A; no sideways scroll.

- [ ] **Step 5: Run the smoke test**

Run `npm run smoke` in a second terminal.
Expected: every check passes.

- [ ] **Step 6: Commit the plan**

```bash
git add docs/superpowers/plans/2026-11-08-mqgrader-phase-8f-search.md
git commit -m "Add the Phase 8f plan"
```

- [ ] **Step 7: Ask the user, then push and open the pull request**

Ask the user before pushing. On a yes: `git push -u origin feature/mqgrader-search`, then a ready pull request into `main` that lists what changed, the rulings above, and what was checked. It needs no migration.
