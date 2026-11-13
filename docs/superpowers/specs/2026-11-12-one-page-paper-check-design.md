# One page to check a paper, and a clearer test page

Date: 2026-11-12. Status: draft for the teacher's approval.

This spec replaces, in `2026-11-04-mqgrader-redesign-design.md`: all of §7 (Verificarea punctelor), the line about the title row in §6 ("Above the title, the link …"), and the papers table of §6 where it differs from §3 below. It keeps the zoom and the answer borders of `2026-11-10-review-zoom-and-answer-areas-design.md` as they are; they move into the new page.

## 1. Why

The teacher checks a test's papers one student at a time. Today that work is split over two pages:

- The paper's page (`/teste/:code/elevi/:submissionId`, `SubmissionPage.tsx`) shows all the exercises of one student with the robot's points and comments. The photos of the paper are hidden behind "Arată fișierele" and then show as a long list of pages. Nothing goes from an exercise to the place of its answer on the paper.
- The review (`/teste/:code/verificare`, `ReviewPage.tsx`) shows the paper next to the points to check, zoomed with an orange border on the answer. It shows only the points the robot was not sure of.

How she works (her words, through the user): she first reads the whole paper of one student, all the exercises and the comments. Then, for some exercises, she wants to see what the student wrote. Those are mostly the ones the robot marked to check, but also others, mostly the ones without full points. After the first few papers, when she trusts how the robot grades this test, the list of only the points to check is useful. But she often goes back to all the exercises of the student she is on, to check one the robot did not mark.

She works on a laptop.

So the paper and the full list of exercises must be on one screen, and "only the points to check" must be a way of looking at that same screen, not a different page.

The test page has three smaller problems, from the teacher's own audit:

1. The class link under the title (a coloured tag) looks older than the rest of the app, and is the same on every stage.
2. The progress line "Încărcări · trimise 18 din 23 · corectate 18 · de verificat 47" and its bar are unclear: the 5 students who sent nothing could be late or absent, and "47" counts exercises while "18" and "23" count students.
3. On a wide screen the papers table does not fill its card: a large empty area stays on the right.

## 2. Decisions the user made

In the order they were made (2026-11-12, with mockups):

1. One page, three columns: the students, all the exercises of one student, the paper. A switch shows all the exercises or only the ones to check (shape "A"; the other shape kept two pages, each with a cut-out of the answer).
2. The teacher works on a laptop.
3. A student who did not send when uploads are closed did not take part (absent, or any other reason). The app needs no "absent" mark of its own.
4. Class link: a path at the top, "Teste › Clasa 7E2 › <test title>" (option 1A).
5. Progress: one bar that counts only students, "nu au participat" striped grey, and the points to check on a line of their own with a "Verifică" button (option 2A).
6. Empty space: the papers table takes the full width of its card; the model column moves into the row's "…" menu (option 3A).
7. After a preview of the page: a row to check must look calm, not intimidating, and points are never bold. Of three designs she chose "C: points as buttons" (§4.4). *(Changed after use, 2026-11-13: the calm row of C stays, but the points as buttons took too much room; the decision went back to "Accept", the stepper and "Salvează", in a box with a light orange border.)*

## 3. Goals, non-goals, anti-goals

Goals:

- On one screen: the list of students, all the exercises of one student, and the student's paper, always in view.
- A click on any exercise shows its answer on the paper (its page, with the orange border), not only for the exercises to check.
- "Doar de verificat" gives today's review flow (the points to check, one after another, across the students) on the same page.
- The test page's progress says, at a glance and without guessing, how many students took part, how many papers are graded, waiting or failed, and, apart, how many points wait to be checked.

Non-goals:

- No change to the API, the database or the robot. Everything the new page needs is already in `GET /tests/:code` (`uploads`, with `reviewPoints`) and `GET /submissions/:id` (the items with their `areas`, the files). No migration.
- No change to how the robot grades or how points and grades are counted.
- No change to the student pages, the PDFs or the CSV.
- No class summary panel on the test page (option 3B, not chosen): the class report and Rezultate already have it.

Anti-goals (a failure even if it works):

- The teacher loses her place: a refresh, a newly graded paper or a decision moves her to another student she did not ask for, while she reads "Toate exercițiile".
- A border around the wrong exercise (kept from the zoom spec).
- A paper state the old paper's page handled (uploading, sent, grading, failed) that the new page shows worse or not at all, or an action it had (Reîncearcă, Recorectează, Resetează, the result link, the PDF, the comments and the summary) that the new page drops.
- The bar is unclear again: a sent paper that waits (not chosen, past the demo limit, a CES paper waiting for its barem) counted as "se corectează" or as grey.

## 4. The paper page

### 4.1 Address and Back

- The page lives at `/teste/:code/elevi/:submissionId` (the address of today's paper's page, so every link to it keeps working: the class page, the student's history, the report, the search, the Rezultate table). An optional `?punct=<key>` names the exercise or the pages point that is open (`punct=pagini`, keys as `pointKey` today).
- `/teste/:code/verificare` keeps working: it opens the paper page in "Doar de verificat" with `replace`. With `?lucrare=12&punct=34` it opens that paper at that point; without, at the first point (`firstSpot`), as today.
- Moving inside the page (another student, another exercise, the next point) replaces the address, as the review does today: Back leaves the page, to where she came from. *(Builder's call, from the review's behaviour today; the user did not decide it.)*
- A reload comes back to the same student, the same exercise and the same switch.

### 4.2 Layout (laptop first)

Above the columns:

- The path: "Teste › Clasa 7E2 › <test title> › <student>", each but the last a link (§5.1).
- The student's head (from today's paper's page): the name, the grade and the total ("75 din 100, cu 10 din oficiu"), the state ("Corectat", "Se corectează", …), "Fără confirmare" when it applies, the start and send times. On the right: "Toate notele elevului", the student's PDF (graded only), and "Alte acțiuni" (Recorectează, Resetează), as today.
- The result link row ("Linkul cu rezultatul elevului", published or not, the link), as today, but on one line under the head.
- The switch: "Toate exercițiile" / "Doar de verificat (N)", N the points to check in the whole test. And "Elevul anterior" / "Elevul următor".

Three columns under them:

- Left, narrow (about 200 px): the students (§4.3). It folds to a thin strip with one button, so the exercises and the paper get the width on a small laptop; the choice is kept in the browser (like "Arată chenarul").
- Middle: the exercises of the student (§4.4).
- Right: the paper (§4.5). It stays in view while the middle column scrolls.

The middle and right columns share the rest of the width; the paper gets about as much as the exercises. *(Builder's call on the exact split; the 1366 px and 1920 px laptop widths must both work.)*

The exercises get three fifths of the width the students leave, the paper two fifths (it zooms), so the comments read on a 1366 px laptop. Below 1200 px the students go under the exercises. Below 900 px: one column: the exercises (with the open one's decision under its row), then the paper, then the students.

### 4.3 The students (left)

- Every upload of the test that has a paper id (every student who started an upload), in the order of the test's table (by name). Students with no upload are not listed (the test page shows them).
- Each row: the name (with the CES tag as today), then the grade, or in orange the count of points to check, or the state in grey ("se corectează", "eșuat", "încarcă", "trimis"). The open student is marked.
- In "Doar de verificat" the list shows only the students with points to check, then, under "Celelalte lucrări", the others (as the review today).
- The list is read again every 10 s while the robot works (as the review today). A paper that gets graded changes its row; it never moves the open student.

### 4.4 The exercises (middle)

For a graded paper, the rows of today's `GradedResult`: the exercise, the points, the student's answer, the robot's comment, the confidence bars, and the pencil to change the points and the comment. Points are never bold. A row to check is calm (decision 7): no orange row and no reason in it, only its points in a soft orange label ("0,75 din 1,5") and one orange-outlined "Verifică" button, which opens it.

- A click on a row (outside its buttons and fields) opens it: it is marked, the address gets its `punct`, and the paper shows its answer (§4.5). Any row can be opened, not only the rows to check.
- The open row, if it is to check, shows the decision in a light box with a light orange border under it: the robot's reason as a quote; then "Accept 0,75p" (the filled button, the robot's value), the stepper (− and + move by 0,5 on the 0,05 steps, between 0 and the maximum, and the field takes an exact value) and "Salvează"; with another value, what the grade becomes ("Cu 0,5p aici, nota devine 8,40."). Accepting the robot's value checks the point; saving another value corrects it. *(Changed after use, 2026-11-13: the points as buttons of design C took too much room; the user asked for the old, smaller controls.)* *(Builder's call: the pencil stays on every row to change the points and the comment.)*
- The pages the robot could not read are one calm line at the top, "Pagini necitite" with the pages and "Verifică"; open, the reason and "Am verificat paginile" show under it.
- Under the exercises, in "Toate exercițiile" only: the summary and the lists of the feedback (`FeedbackSections`), with their edit, as today.
- "Doar de verificat" hides the rows that are not to check (the open row stays, even when it was decided a moment ago, until she moves on), and the feedback sections.

After a decision ("Accept", "Salvează", "Am verificat paginile"):

- In "Doar de verificat": the next point opens, also on the next student, as the review does today (the same rules: only if she is still at the point she decided; its heading takes the focus without a scroll).
- In "Toate exercițiile": the next row to check of the same student opens; when the student has none left, the row stays open and "Elevul următor" takes the focus. The page never moves to another student by itself. *(Builder's call, from what she said about staying with one student; the user did not confirm it.)*

The keys, as today, while the cursor is not in a field: A presses "Accept" of the open row when it is to check (nothing otherwise); J and K open the next or the previous point to check (in "Toate exercițiile", of this student only; in "Doar de verificat", across the students); 1–9 show that page of the paper. While a decision shows, a line under the bar names them.

For a paper with no result, the middle column shows what today's paper's page shows in its place: the waiting text (`waitingText`), or "Corectarea a eșuat." with the reason and "Reîncearcă". The paper column still shows the pages.

### 4.5 The paper (right)

Today's `ReviewPhoto`, unchanged in behaviour: one page at a time, the page switch, zoom and drag, "Arată chenarul", the border with its parts, a PDF in a frame. Under the caption, the page's file name and size ("IMG_0001.jpg · 820 KB"), as the paper's page listed them.

- An open exercise shows the page of its first drawn area, whole, with the border (as the zoom spec says); with no area, the page of the item (`page`), with no border; else page 1.
- The pages row shows the first page the robot could not read.
- With no open row: page 1, or the page she last chose for this student.
- A paper still uploading or sent shows its pages the same way, with no border.

### 4.6 The switch

- "Toate exercițiile" or "Doar de verificat (N)". The choice is in the address (`vedere=verificare`; the place's own view is left out): it stays when she moves to another student and after a reload, and each link decides how the page opens ("Vezi lucrarea" with all the exercises, "Verifică" and the points' links with only the points to check). *(Builder's call, changed while building from "kept in the browser": a choice kept in the browser would make "Vezi lucrarea" open with only the points to check, against §5.3.)*
- "Verifică" and "Începe verificarea" on the test page, the "Decide" links of the Verificare panel and the old `/verificare` address open the page in "Doar de verificat".
- When no point is left in the test: "Toate punctele sunt verificate." and "Mergi la Rezultate", as the review today; the switch shows "Doar de verificat (0)".

### 4.7 Quick Try

Today the try's "Verificare" tab (`Checking`, `src/try/Graded.tsx`) is a list of the points, and each point and "Verifică N puncte" link to the try's own route `/try/<token>/teste/<code>/verificare`, which shows `ReviewPage` without the tabs (`src/try/TryApp.tsx`). The try keeps that shape *(builder's call: the smallest change)*: the tab and its list stay, and that route shows the new paper page in "Doar de verificat" instead of today's review, at that address, with no redirect (in the try, `/teste/:code/elevi/:id` goes to "Rezultatul profesorului" and stays so). The links of the new page that leave it (back to the test, "Mergi la Rezultate") go where today's review's links go in the try. The try has one paper, so:

- No students column, no "Elevul anterior/următor", no path, no "Toate notele elevului", no result link row, no PDF, no "Alte acțiuni", no "Reîncearcă": the try's allow-list (`ALLOWED`, `server/routes/quickTry.ts`) has none of their routes, and none is added.
- The rest works with the routes it already allows: `GET /tests/:code`, `GET /submissions/:id` and its files, `PATCH /submissions/:id/items/:id`, `PATCH /submissions/:id/evaluation`.
- The try's other tabs ("Rezultatul profesorului", "Rezultatul elevului") stay as they are.

## 5. The test page

### 5.1 The path (all stages)

- "← Toate testele" and the coloured class tag go. In their place, above the title: "Teste › Clasa 7E2 › <test title>"; "Teste" goes to the Teste page, the class to its page; the last part is plain text.
- Under the title: "23 de elevi · început 9 nov. 2026, 10:13" (or "ciornă"), as today without the class.
- The same path, with the student at the end, heads the paper page (§4.2).

### 5.2 The progress (În clasă, Corectare, Verificare)

One bar, of the students of the class (`studentCount`, at least the uploads). The counts come from `uploads` (`UploadRow.status`, `fileCount`) and `test.status`; no API change.

How the server keeps a paper that is not graded matters here. A paper held back from grading (not chosen in a start for some papers, or past the demo limit) goes back to `uploading`, keeps its files and loses `submitted_at` (`HOLD_BACK`, `server/db/lifecycle.ts`). When uploads close, every other `uploading` row with files is sent. So, after uploads closed, an `uploading` row with files is a held-back paper, and one with no files is a student who sent nothing (`PartialEvaluationNotice` in `StagePanel.tsx` reads it the same way). A CES paper waiting for its barem stays `submitted`, and its test stays in evaluation: the server ends a test only when no paper is `submitted` or `grading`. A sent paper is a CES paper when its variant is `ces`, or, before it first went to grading, when its student is marked CES and the test has a CES test file (`paperVariantSql`).

The segments:

- corectate (green): `graded`.
- se corectează (blue): `grading`, and `submitted` while the test is in evaluation, except a CES paper while the CES barem is not active.
- așteaptă (light blue): a paper with files not sent to the robot: `uploading` with `fileCount > 0` after uploads closed (held back), `submitted` while uploads are open, and a sent CES paper while the CES barem is not active (missing, generating or not checked). Its words say it waits for the teacher, not for the robot. The paper page says the same of a held-back paper: "Așteaptă corectarea" in its head and in "Elevii", and why in place of the result.
- eșuate (red): `failed`. In every state: a reopened test can have failed papers.
- încarcă acum (pale): `uploading` while uploads are open (a reopened test included: a held-back paper is again one the student can change).
- încă nu au trimis (grey, plain): `none` while uploads are open.
- nu au participat (hollow, a grey outline: the brand has no gradient): `none`, and `uploading` with no files, after uploads closed.

Uploads are open when `test.status === 'open'` (a reopened test included). The title says "Lucrări: 18 din 23 de elevi au trimis" while they are open, and "Lucrări: 18 din 23 de elevi au participat" after. While open, the 18 counts the papers sent (every segment but "încarcă acum" and grey); after, every paper with files (every segment but the grey ones).

- "✓ Corectat complet" when every paper that took part is graded, as today.

Under the bar, a legend with each segment that has at least one student, its colour and its count; empty segments are left out. A screen reader gets the same sentence.

Apart, under a thin line, only when there are points to check: "47 de puncte de verificat în 12 lucrări" (orange) and "Verifică" (opens the paper page in "Doar de verificat" at the first point).

The words for each status are the builder's, inside these meanings.

### 5.3 The papers table

- The table takes the full width of its card.
- The model ("claude-opus-5-5 · medium", shown only when `showModel`) leaves the table and goes into the row's "…" menu as one line.
- A student who sent nothing: "Nu a trimis" while uploads are open, "Nu a participat" after.
- "Vezi lucrarea" opens the paper page in "Toate exercițiile". *(Builder's call: the row's "De verificat" count may also link straight to the first point, in "Doar de verificat".)*

## 6. What is left to the builder

- The exact widths, spacing and colours, inside the design system of the redesign spec (§2 there).
- How the code is split: a likely shape is a new page component that takes the data loading and the decisions of `ReviewPage`, the head and the actions of `SubmissionPage`, the rows of `GradedResult` (with an "open" row) and `ReviewPhoto` as it is. `SubmissionPage` and `ReviewPage` then go, or become thin redirects.
- The Romanian words not given here.
- Tests: every upload state on the new page; the switch and its keeping; opening a non-flagged row moves the paper; the decision flow in both modes; the old `/verificare` addresses; Quick Try without the hidden parts and with no call outside its allow-list; the bar's segments for open and closed tests, with waiting and failed papers; `expectNoGradingWords` is not needed (teacher pages only).
