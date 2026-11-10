# Archived tests close their results

Date: 2026-11-10. Status: design, waiting for approval.

## Why

The teacher wants a moment to cut the students' access to old results. She
already archives a test once it stops being relevant, to keep her lists short.
That is the right moment to close its results too, so she does not have to
remember a second step.

## What changes

### 1. Archiving a test closes its results

- "Arhivează testul" (Fișa testului) archives the test **and** closes every
  result page of it: the class-wide publish (`tests.results_open = 0`) and the
  results published for single students (`submissions.results_open = 0`).
  This is the same effect as "Oprește accesul la rezultate" today.
- It is one write on the server (`setTestArchived` with `archived = true`):
  one `db.batch()` that archives the test and closes the pages. The closing
  statements check in their SQL that the test is the teacher's and is now
  archived, so a refused archive (the test is not `done`) closes nothing.
- "Scoate din arhivă" does **not** publish again. The results stay closed
  until the teacher publishes them.
- A test that leaves `done` (Start, Reopen, a regrade…) already leaves the
  archive. Its results stay as they are (closed, if the archive closed them).

### 2. Archiving a class closes the results of all its tests

- "Arhivează clasa" (class page, ⋯) archives the class and closes every
  result page of every test of the class (class-wide and single students).
  The tests themselves are **not** archived: only their results close.
- One `db.batch()` in `updateClass`, only when the change archives the class.
  A rename, or "Scoate din arhivă", touches no results. The closing
  statements check the class is the teacher's in their SQL.
- Un-archiving the class publishes nothing.

### 3. A warning before the archive

- When the archive would close open results, the app asks first, in a
  `Modal` dialog. With nothing published, it archives at once, as today.
  - Test: open results means `resultsOpen` or `publishedCount > 0`.
  - Class: any test of the class has open results by the same rule.
- Dialog text (my call, Romanian, to be checked by the teacher):
  - Title: "Arhivezi testul?" / "Arhivezi clasa?"
  - Line: "Elevii nu își vor mai putea vedea rezultatele. Le poți publica din
    nou oricând." (for a class: "…rezultatele testelor acestei clase…")
  - Buttons: "Arhivează" (main) and "Renunță".

### 4. "Nepublicate" is the normal state of an archived test

- On an archived, `done` test with no open result, the stage Rezultate is
  **done** (blue), not "later" (grey) and not waiting (orange). Note (my
  call): "închise · test arhivat". This is what the stage bar shows on the
  Teste page, the class page and the test page.
- The Teste page row of such a test offers "Raportul clasei" when a paper is
  graded, as for any finished test.

### 5. Publishing on an archived test is allowed, and shows in "De făcut"

- The teacher can publish on an archived test, for all or for one student,
  from the panel Rezultate, without un-archiving. The server already allows
  it; nothing changes there.
- While an archived test has any open result (`resultsOpen` or
  `publishedCount > 0`), `todoOf()` returns one item for it:
  - stage: Rezultate
  - task: "Rezultate publicate pe un test arhivat"
  - text: "Elevii își văd rezultatele. Oprește accesul sau scoate testul din
    arhivă."
  - action: "Deschide", to the test page at `#rezultate`
  - short: "publicate · test arhivat"
  (texts are my call.)
- So the stage Rezultate waits (orange) on that test, by the existing rule
  that a stage waits exactly when "De făcut" has the test at that stage.
- The item goes away when the teacher stops access (all pages closed) or
  takes the test out of the archive.
- The Teste page row's next step for this case is a link "Oprește accesul"
  to `#rezultate`, **not** the publish button that the Rezultate wait shows
  today (`nextStep.ts` must tell the two apart).
- The archived test stays in the archive: it does not move to "În lucru",
  and it shows in the groups only with "Arată și testele arhivate", as
  today (`inWork()` keeps returning false for archived tests). It does count
  in the bar's "De făcut" number and in "N lucruri te așteaptă".
- A test of an archived class that is not itself archived follows the
  normal rules (no special item).
- **An archived test with open results in an archived class** (the teacher
  chose this): the warning wins over the read-only calm of the archived
  class page. In `ClassTests` and `GradesTable` that test is orange, its
  step is "Oprește accesul", and the class gets its waiting dot in
  "Schimbă clasa". Every other test of an archived class stays calm, as
  today. Update the "nothing orange" line of `src/AGENTS.md` to name this
  one exception.
- **An archived test with open results and unsure points** (my call): only
  the item of this section counts. The check for it replaces the early
  `return null` for archived tests at the top of `todoOf()`, so the points
  keep showing as "now" in Verificare and never wait, as today.

### 6. Tests already archived with open results

No data change when this goes live. Those tests show in "De făcut" with the
item of §5 from the first load (the teacher chose this).

## Non-goals

- No automatic closing at a date or after some time.
- No change to what a student sees on a closed result page (the existing
  closed-page screen stays).
- No archive of the tests when a class is archived.
- No migration.

## Tests

- Server: archive closes the test-wide and single-student pages; a refused
  archive (not done, another teacher's test) closes nothing; unarchive opens
  nothing; class archive closes the pages of all its tests and of no other
  class; rename and class unarchive close nothing; publishing on an archived
  test still works.
- Web: `todoOf` returns the new item for an archived test with open results
  (class-wide, and single students only) and null once closed;
  `stagesOf` shows Rezultate done with the note for an archived closed test,
  and waiting for an archived open one; `nextStep` gives the stop-access
  link; the test and class archive ask first only when results are open,
  and "Renunță" changes nothing.
- Update `server/AGENTS.md` ("Archiving does not touch published results")
  and `src/AGENTS.md` (todo cases, stages) to the new rules.

## Left to the builder

- Exact component split for the warning dialog (shared or one per page).
- Query shape of the closing statements, within the rules above.
