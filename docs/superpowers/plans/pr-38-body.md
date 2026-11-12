## What changes

A follow-up to PR 38 (Phase 7, the class page). The class page now looks like design Z3.1 (round 5) and spec §9, and four faults found in review are fixed.

- The top line: the name, "Schimbă clasa" and the facts on the left; "Test nou pentru această clasă" and ⋯ on the right. "Schimbă clasa" lists every class of the year: the current one is marked, a class that waits has a dot, and the archived classes come last in a muted group "Arhivate". "+ Clasă nouă" is at the end.
- Tab "Note și teste":
  - The grades table is a card as wide as its columns. Each column is headed by the test's name and "date · state", orange when the test waits. A grade is plain; it is orange with a dot only when points wait. "—" means no paper. "Media testului" and a legend close the card.
  - "Testele clasei" is a card beside the table (under it below 1180 px), each test with its next step on the right.
- Tab "Elevi" (with its count): one card in two halves (stacked on a phone). The students are on the left, with a search that ignores diacritics. The chosen student is on the right (the first one at first), with a table of the class's tests: points, grade, result, "Copiază linkul" and "Lucrarea".
- Dialogs: "Clasă nouă" (the name and the students in one step), "Adaugă elevi", and the rename of a class or a student are real dialogs (`Modal.tsx`). Each has a title, ×, a dimmed backdrop, the focus kept inside, Esc, and the focus back to the opener.
- The panel "Clasele tale": "+ Clasă nouă" opens the dialog; "Arhivate (n)" opens "Schimbă clasa" at the archived classes. `/clase` with no active class offers "+ Clasă nouă" and links the archived classes.

## Fixes

- After "Publică toate rezultatele", the "Elevi" tab still said "Nepublicat": `listClassGrades` read only the upload's own flag. It now reads the test's flag too, as the student's page does.
- No list led to an archived class after the all-classes page went.
- The orange dot used the pale tint and could not be seen.
- A class made before its students failed to save did not show in the lists.
- The paper count of a student counted uploads still under way or failed.

## Checks

- `npm test`: 1879 tests, 1876 passed, 3 skipped. Also with `TZ=UTC` (1869 of 1872 before the last commit).
- `npm run typecheck` and `npm run build`: clean.
- `npm run smoke` on the production build: all checks passed.
- Looked at in the browser at 1440, 1024 and 375 px, in light and dark mode: the grades, the tests, the student split, the menus, the dialogs and the archived group.

## Deferred

- The archived class page itself keeps the normal layout (roadmap 8a: "an archived class").
- The tabs have no arrow-key navigation.
- When a result has no `startedAt`, the "Elevi" tab shows no "Copiază linkul" and no reason.
- "Șterge" (a student) still asks with `window.confirm`.
- The diacritic fold of the student search is a third copy (`pdf/fileName.ts` and `shared/files.ts` have it too).

## Notes

- No migration.
