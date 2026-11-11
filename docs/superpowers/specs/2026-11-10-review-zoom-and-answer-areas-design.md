# Zoom and answer areas on the Verificare page

Date: 2026-11-10. Status: draft for the teacher's approval.

## Why

On the Verificare page (`/teacher/teste/:code/verificare`, `src/admin/pages/ReviewPage.tsx`, middle pane `src/admin/reviewPage/ReviewPhoto.tsx`) the teacher loses time in two places:

1. The handwriting is small. Today a click on the photo opens it full size in a new tab, which takes her away from the points on the right.
2. She scrolls the page to find where the picked exercise's answer is.

The fix: zoom inside the middle pane, and, when she picks an exercise, open its page already zoomed on the student's answer, with a border around it. The robot finds the answer while it grades and saves where it is.

This replaces decision 27 of the redesign spec ("no marks on the photo"). That decision was made because the robot did not say where an answer is. It now can (see "Spike" below).

## Spike (done 2026-11-10, thrown away)

The grading skill was run with `npm run try:skill` on two real papers (one student each: 3 photo pages and 6 photo pages), Opus with effort medium as on the live robot, twice without areas and twice with areas.

- Accuracy: of 29 areas in the first run, none was on the wrong exercise. Areas split well: an answer circled on page 1 with its work on page 3 got one area on each page; work in the margins got its own area. Some areas were loose or a little off, mostly the small ones for short answers written on a printed line. Some margin work got no area.
- Stability: the two runs agreed closely (most areas overlap 75–100 %). The second run left out some margin areas.
- Cost: 3-page paper $0.48 → $0.49 per grading (+3 %), time about the same. 6-page paper $0.57 → $0.63 (+12 %), 64 s → 90 s, output tokens +42 %. Two runs per paper only: rough numbers.
- The grades did not change because of the areas.

## Goals

- Zoom and pan inside the middle pane, for photo pages.
- Picking an exercise opens the page of its first area, zoomed on that area, with a border around it.
- An exercise with more than one area lets the teacher step through its parts.
- The robot saves the areas when it grades; the page draws them from the saved data.
- One switch turns the borders off.

## Non-goals

- PDF pages. A PDF page keeps its frame and its "Deschide PDF-ul" link, with no zoom and no border.
- The photo files. Nothing is drawn into a file; the border is drawn by the page, over the photo.
- Other pages: the paper's page (`src/admin/submissionPage/PageFiles.tsx`, also shown in the Quick Try tab "Rezultatul profesorului"), the student pages and the PDFs and CSV made in the browser stay as they are. (Builder's call to not include them: the teacher asked for the review.)
- Touch gestures beyond what pointer events give for free. The teacher has not used the review on a tablet or phone.
- Regrading old papers to get areas. Old gradings have none and behave as today.

## Anti-goals

- A border around the wrong exercise. The teacher named this as the worst outcome. A missing border is acceptable; a wrong one is not. The robot is told to leave out any area it is not sure of.
- Losing sight of the points on the right while zoomed.

## Quick Try

The teacher's choice: the Quick Try review behaves the same. It already is the same page: the try's "Verifică" links open the app's `ReviewPage` at `/try/<token>/teste/<code>/verificare` (`src/try/TryApp.tsx`), and its data comes from the teacher API's own routes behind the try's allow-list (`ALLOWED` in `server/routes/quickTry.ts`). So the zoom, the border, the parts and the switch work there with no code of their own, as long as the areas ride in the routes the allow-list already lets through (no new route). Tests prove it on the try's review too.

## The robot's part

- The grading output (`gradingResultSchema`, `shared/schemas.ts`) gets, per item, `areas`: a list of `{ page, x0, y0, x1, y1 }`.
  - `page`: 1-based, as the item's `page` (`page-01` is 1).
  - `x0, y0` top left and `x1, y1` bottom right, each a fraction from 0 to 1 of the page's width (x) or height (y), from the top left corner of the image as the robot sees it.
  - `[]` when the student did not answer or the robot is not sure.
- The field is required in the JSON Schema that Claude gets, so it is never left out silently. A grading made before the field existed has no areas (zod default `[]`).
- The skill text (`.claude/skills/evaluate-test/SKILL.md`, mode "grade") gets the rule used in the spike: one area per separate block of the student's work for that exercise (the statement's line when the answer is written there, a solution lower on the page, the rest on another page); frame only that exercise's handwriting with a small margin; leave out any block not sure to belong to it, because a missing frame is better than a frame around the wrong exercise. `skill.test.ts` checks the field name.
- `checkGrading` keeps the areas (`drawableAreas`, `shared/schemas.ts`): it drops an area whose page is not a whole number from 1, whose numbers are outside 0–1, or whose corners are not in order (x0 < x1, y0 < y1), keeps at most 6 per item (`MAX_AREAS`; the spike never passed 3), and rounds the numbers to 4 decimals. A bad area never throws away the grading. `checkGrading` does not know how many pages the paper has: the review skips an area on a page the paper does not have.
- The item's `page` stays as it is. When an item has areas, the review uses the page of its first area.

## Storage

- A new migration (0027) adds `areas TEXT NOT NULL DEFAULT '[]'` to `evaluation_items`: the item's areas as JSON, written by the robot's grading write next to `page` (`server/db/runner.ts`, `json_extract(j.value, '$.areas')`, with `'[]'` when missing).
- A regrade replaces the areas with the new grading's. The teacher's corrections never change them.
- The teacher API returns the areas with each item (`shared/api.ts`, `server/db/evaluations.ts`). No student page, student PDF or CSV gets them.
- Per AGENTS.md, the migration runs on the live database before the code reaches `main`.

## The middle pane

### Zoom (photo pages only)

- Whole page view: as today, the page fits the pane.
- A left click on the photo zooms in, centred on the click. (Zoom level: builder's call, enough to read handwriting.)
- The mouse wheel zooms in and out around the mouse pointer, between the whole page and a maximum the builder picks.
- While zoomed: hold the left button and drag to move the photo. A short click with no drag does nothing, so moving never zooms by mistake.
- Back to the whole page: a right click on the photo (the browser menu does not open there), the Esc key, or a button above the photo, "Toată pagina" (shown only while zoomed).
- The zoom stays inside the middle pane; the left list and the right panel stay where they are.
- The new tab link on the photo goes away ("Deschide poza mare" opened it).
- Changing the page goes back to the whole page view, unless the change comes from an area (below).
- The keyboard: Esc is enough for the teacher. Other keys (arrows to pan, +/- to zoom) are the builder's call; the zoom must not take keys that the page already uses.

### The picked exercise

- Picking an exercise in the left list (or with "Următorul punct") opens the page of its first area, in page order, zoomed so that the area fills the pane with a margin, centred on it.
- Only the picked exercise gets a border. Other exercises on the page get none.
- Which exercises (the teacher's answer): only the points to check, the ones the left list and "Următorul punct" already open. The page's views stay as they are; an exercise the robot was sure of, or a point already decided, is not opened. Opening every exercise may come later as its own step; the robot saves areas for every exercise, so nothing is lost.
- The border is drawn by the page over the photo: an orange dashed line (the teacher's choice: orange is the colour of what waits on her; the `orange-mark` token of the redesign spec, in both themes) that looks hand-drawn (slightly uneven). It is drawn in the photo's own coordinates, so it moves and grows with the zoom. The exact look is the builder's call, checked in light and dark themes.
- The border's label (the exercise, for example "II.3", and "Partea 1 din 2" when there are parts) sits outside the area, never over the student's work: above the area's top left corner, or below the area when there is no room above. (The teacher's choice.)
- The border stays when the teacher zooms out to the whole page or changes the zoom.
- An exercise with more than one area shows, beside the border's label on the photo (the label says "partea 1 din 2"), the buttons to the next part and back; on a phone, where the label may end near the pane's edge, they float in the pane's bottom corner with "1 din 2". The next part opens its page, zoomed on it. The page switch (1 · 2 · 3) still works and shows the borders of the picked exercise on any page that has one.
- A turned photo needs nothing special. The upload page normally re-encodes a photo upright, but it sends the original file when re-encoding fails or comes out bigger, and such a file may carry an EXIF orientation tag, which the browser applies. A second spike (2026-11-10) graded the same 3 pages stored sideways with orientation tag 6: the robot's areas matched the upright run (mean overlap 0.93) and not the stored frame (0.08). So the robot sees the photo turned as the browser shows it, and the areas are in the frame the teacher sees. Only tag 6 was tried; the other tags are turned by the same reader.
- An exercise with no areas (an old grading, no answer, or the robot not sure) opens as today: its `page`, whole page view, no border, no "Partea" label.
- "Paginile necitite" (the unreadable pages point) and a paper picked from "Celelalte lucrări" open as today, with no border.

### The switch

- A switch in the line above the photo, beside the page switch, "Arată chenarul" (builder may pick better Romanian words), turns the borders on and off. Off: no border, and picking an exercise opens its page at the whole page view, as today.
- The choice is remembered in this browser (`localStorage`, read and written in try/catch). On by default.

## Rules that stay

- Romanian text, no grading words on student pages (this work touches no student page).
- Photos come through the API with the ownership check as today; nothing new is stored in R2.
- The CPU and query limits of Functions: the areas ride in the existing item query.

## Left to the builder

- Zoom levels, the wheel step, the maximum zoom, and the margin around an area.
- How the photo is drawn and moved (CSS transform on the image and an SVG layer for the border, or another way), and the hand-drawn look.
- The cap on areas per item.
- The exact Romanian labels, within the meanings above.
- Tests: the schema and `checkGrading` (areas kept, bad areas dropped), the migration and the grading write, the API answer, and the review page (zoom in, pan, right click, Esc, the button, the picked exercise's border and parts, the switch, PDF and no-area cases). Then the whole suite and a check in the browser.

## The change to the redesign spec

Decision 27 of `2026-11-04-mqgrader-redesign-design.md` and the middle pane text of its review section are updated to point here: the review draws the picked exercise's border from the robot's saved areas, and a click zooms inside the pane instead of opening a new tab.
