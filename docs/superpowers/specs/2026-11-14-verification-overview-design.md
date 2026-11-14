# Verificare overview, paper page scroll and folded paper

Date: 2026-11-14. A small change in three parts, asked by the user after daily use.

## Why

- A paper opened from Rezultate (or any table) sometimes opens scrolled to the middle: the teacher app never scrolls to the top on a new page, so the browser keeps the old position.
- After a paper is checked, the teacher rarely needs its photo; it takes room from the exercises.
- The Verificare panel repeats what the paper page already does (a row per point, each with its reason) and what Corectare and Rezultate already show (the papers table). The teacher wants an overview there: how far the check is, who is left, and one button into the paper page.

## Goals

1. A new page always opens at the top.
2. A paper with nothing left to check opens with its photo hidden.
3. The Verificare panel is a short overview: progress, the students left, one orange button.

Non-goals: no change to the paper page's review flow, no new stage, no change to Corectare or Rezultate.

Anti-goals: the paper page must not jump while the teacher works (J, K, "‹ Elev ›", the move after a decision); no D1 cost that grows with how often the page is read.

## 1. Scroll to the top

In `src/admin/Layout.tsx`, when `location.pathname` changes and the navigation is not a replace (`useNavigationType() !== 'REPLACE'`), call `window.scrollTo(0, 0)`. The window scrolls (`main` has no overflow of its own).

- Links (PUSH) from the papers table, the links table, the Teste page, search and the bar scroll to the top.
- The paper page's own moves are replaces (`paths.ts`), so they never scroll.
- A stage change on the test page changes only the hash: no scroll.
- Not React Router's `<ScrollRestoration>`: it resets on every new location key, replaces included.

## 2. The paper's photo hidden after the check

On the paper page (`place === 'app'` only; a Quick Try keeps its one paper's photo), the photo starts hidden when the upload row is graded and `row.flagCount === 0`. The row is in the test detail already, so the choice is known before the paper loads (no flicker).

- `Paper` is keyed by the paper, so the rule applies when a paper opens. Deciding the last point does not hide the photo under the teacher.
- On such a paper, "Lucrarea" (and "Arată pe lucrare") show the photo for this paper without saving the choice: `quickeval:paperPhotoFolded` stays the teacher's choice for papers with points to check.
- A paper with points to check opens as today (the saved choice).

## 3. The Verificare panel (design B, layout C2)

The panel of the stage Verificare (`ReviewPanel` in `src/admin/testPage/StagePanel.tsx`) shows, under its head:

1. **The progress line**: "12 din 59 verificate", a progress bar (blue on the orange tint), "Mai sunt 47 puncte, la 15 elevi", and on the right one orange button: "Începe verificarea" while nothing is checked, "Continuă verificarea" after. No arrow on the button. It opens `reviewPath(code)` (the first point left).
2. **"De verificat"** (with "N elevi · clic pe un nume"): one rounded label per student with points left, "Bogdan Ionescu 1/4" (checked / to check), in the orange tint. A click opens that student's first point left (`reviewPath(code, { submissionId, key })`).
3. **"Gata"** (with "N elevi"): one grey label per student whose points are all checked, "✓ Ana Popescu". A click opens the paper with all its exercises (`paperPath(..., 'toate')`).

When every point is checked, the progress line becomes a green box: "Toate cele 59 de puncte sunt verificate." with the blue "Mergi la Rezultate"; the "Gata" labels stay. A test whose graded papers never had a point to check shows "Nimic de verificat." with "Mergi la Rezultate". Before any paper is graded, the panel keeps today's hint.

The list of points (`ReviewList.tsx`, a row per point with its reason and "Decide") and the papers table (`Papers`) leave this panel.

Mockup: the user approved the look in a clickable mockup (variant C2), with the app's colours.

### The orange button

A new button style for the main action of a screen whose work waits on the teacher, e.g. `.button-wait`: filled `--orange`, text `--on-ink`, a hover colour in both themes (a new token, written in both dark blocks of `brand.css`). It extends the brand rule "filled blue for the one main action": orange stays the colour of what waits on the teacher. `src/AGENTS.md` and the comment in `brand.css` say so.

### The server count

Today `UploadRow` has only the points left (`flagCount`, `reviewPoints`). The progress needs the points already checked: a new `UploadRow.checkedCount`, the items with `needs_review = 1 AND reviewed_at IS NOT NULL`, plus one when the unreadable pages were checked (`pages_reviewed_at IS NOT NULL` with a non-empty `unreadable_json`), counted in `listUploads` (`server/db/tests.ts`) next to `flag_count`. The total of a paper is `flagCount + checkedCount`. A paper graded again starts at 0 (new evaluation).

The fake API (`src/test/fakeApi.ts`, `reviewPointsOf()`) keeps `checkedCount` in step after every correction, and the cached test after a decision (`withoutPoint` in `reviewPage/points.ts`) adds one to it.

## Approaches considered

- **A, front end only**: the count of points left, per student and per exercise, from data the page has. No progress after a reload. Not chosen: the user wants to see progress.
- **B, with the checked count from the server** (chosen): real progress, one more count in the uploads query.
- Layouts for the students: a table (too tall), tiles (C1), labels (C2, chosen: the smallest), rings in columns (C3).

## Calls left to the builder (mine, for the user to check)

- The labels are in the class order (by name), not by progress: the teacher finds a name faster.
- Students whose paper never had a point to check are not listed; only the papers with points count.
- Papers still being graded are not counted; the counts grow as they are graded.
- The checked count is written to cost as few D1 rows as possible (one subquery per evaluation, or both counts in one, like `flagCountSql`); `server/db/testsCost.test.ts` keeps its ceiling.
- `src/AGENTS.md`: the papers table is in În clasă and Corectare only; the Verificare panel is the overview; the scroll rule; the photo rule.
- Tests: the scroll on PUSH and not on REPLACE; the photo folded on a checked paper and shown on one with points, and the saved choice untouched; the panel in its four states (nothing graded, nothing checked, part checked, all checked) and with no point at all; `checkedCount` in `listUploads` (items and pages, regrade resets it).
