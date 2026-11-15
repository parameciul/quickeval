# Class report: aligned with the test page, readable on a phone

Date: 2026-11-15. Size: a small change (front end only, no API, no migration).

## Intent

The class report (`/teste/:code/raport`, `src/admin/pages/ReportPage.tsx`,
`src/admin/reportPage/ReportTables.tsx`) looks heavier than the test page:
names, exercise titles, points and grades are bold, and its "Notele pe grupe"
does not look like the grade statistics of the test page ("Raportul clasei"
card, `src/admin/testPage/ReportCard.tsx`). On a phone the grades sit at the
far right of a wide table and are hard to find.

Goals:

- The report reads like the test page: the same weights, the same grade chip,
  the same "de verificat" pill, the same coloured grade groups.
- On a phone the teacher sees every student's grade without scrolling sideways,
  and still has every exercise's points.

Non-goals: the PDF and the CSV of the report, the "Pe exerciții" table's
content, the "Analiza clasei" part, any API or data change.

Anti-goal: a grade's colour that says something waits. The colour is the
grade's level only; points to check stay in their own orange pill (the rule of
`GradeChip`).

## Approaches

Phone layouts considered (mockups shown to the user, 2026-11-15):

- A: one card per student, points on tap. Clear, but loses the table.
- B: name and grade only, no points on the phone. Simplest, loses the points.
- C: keep the table, grade next to the name, points scroll sideways. **Picked.**

Variants of C (realistic mockups with the app's stylesheet):

- C1: the name and the grade both stay on the left; the points scroll under
  them; the total is the last column. **Picked by the user.**
- C2: only the name stays; grade and total scroll away. Rejected: scrolling to
  the points hides the grade, which is the problem being fixed.
- C3: grade, check count and total inside the name's cell. Good, but the grade
  has no column of its own to scan.

## The design

### Every width

- Students' names in the results table: regular weight, the text colour, no
  underline; the underline and the link colour show under the pointer (as in
  the test page's Rezultate table, `table.uploads tbody th a`).
- Table heads (exercise ids, "Elev", "Total", "Nota"): weight 500, 0.8125rem,
  muted, as in `table.uploads thead th`. The "5p" under an exercise: regular.
- Points, totals, counts: regular weight (no `<b>`, no `font-weight: 700`).
- The grade: `GradeChip` (`src/admin/testPage/GradeChip.tsx`). An item to
  check: the `points-pill` "N de verificat" right after the chip (as in
  `UploadsTable`). The grade column is left-aligned so every chip lines up,
  with or without a pill. This replaces the bold orange grade and `tag-wait`.
- "Pe scurt" tiles: the values in weight 500 (not 700), the labels in 500.
  "Media testului" takes its grade colour (`points-N` from
  `pointsLevel(average, 10)`), as on the test page; the other values stay in
  the text colour.
- "Notele pe grupe": the bars of the test page's card: 0.5rem high, each group
  in its grade colour (red 1-4,99, yellow 5-6,99, green 7-8,99, dark green
  9-10, the `GROUP_LEVELS` of `ReportCard`, shared, not copied), the counts in
  regular weight.
- The same applies to the CES table and the "Pe exerciții" table (names and
  numbers regular).

### Phone (`max-width: 56.25rem`, the shell's phone width)

- Order of the parts: the tiles, then "Notele pe grupe", then "Rezultatele
  elevilor", "Pe exerciții", "Analiza clasei". The list of parts stays hidden.
  The "Corectate" tile spans both tile columns.
- The results table's columns: Elev, Nota, the exercises, Total.
- Elev is 8.25rem wide and the name wraps. Elev and Nota both stay on the left
  while the points scroll (sticky), with a soft edge shadow on the right of
  Nota so the scroll is visible.
- In the Nota cell the pill shows the count only ("2"), in the same orange;
  its accessible name still says "de verificat".
- A muted line under the card's head: "Glisează tabelul spre stânga pentru
  punctaje."
- Rows of students with no graded paper keep their one wide cell.

## Left to the builder

- How the phone column order is made: CSS cannot move a table column, so the
  table is rendered in the phone order when `useMediaQuery('(max-width:
  56.25rem)')` matches (the hook `Layout` uses). (Builder's call.)
- Exact sticky offsets and the shadow; dark theme through the existing tokens.
- Tests: the report page tests check the chip, the pill, the phone column
  order and the hint line; brand.css tests if they cover these rules.

Mockup (not committed): `.superpowers/mock/compare.html` served from the
worktree.
