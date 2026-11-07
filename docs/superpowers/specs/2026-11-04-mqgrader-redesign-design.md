# MQGrader redesign: design

Date: 2026-11-04. Status: agreed with the user after six rounds of prototypes. Phases 1 to 5 (landing page and light theme, look and shell, Teste page, test page, Rezultate) are live; Phase 6 (the review of the points to check) is being built; the other phases are not.

## 0. Plain summary

The teacher app and the landing page get a new look and a new layout. The pages use the full width of a desktop screen. Light is the default theme; dark is one click away. A narrow bar on the left holds the menu. Every test goes through six stages, shown as a vertical list, and each page shows only what the current stage needs. The student pages keep their flow; they get the new look and show only the mark and the name.

The prototypes are static HTML in `docs/design-proposals/round-1` to `round-5` (git-ignored, on the developer's PC) and online as private pages: round 3 https://claude.ai/artifact/Qr3qcjNTTqk43rJqRBa6m5, round 4 https://claude.ai/artifact/WGhwJYiScewGpZpnXM3fGk, round 5 https://claude.ai/artifact/JfoJqXjZVryZCHebhG8QHw, round 6 (the phone menu) https://claude.ai/artifact/9L44SEwAxWb7Fxe1Hra4S9. This document holds every decision, so the build does not depend on them.

## 1. Decisions, in the order the user made them

1. Full width on desktop. Landing page first. Light and dark, light by default. Romanian only for now.
2. The look of prototype design 1 ("Pas cu pas"): one sans-serif face, cool grey ground, white panels, one blue for actions and data, orange only for what waits on the teacher.
3. The test workflow is a vertical list of six stages.
4. The review of doubtful points lists the papers on the left, so the teacher moves from one point to the next without going back to the test.
5. "Fișa testului": a card with the facts and files of a test.
6. Top bar: search on the left; school year, theme and the user's menu on the right. Setări at the bottom of the left menu.
7. The landing page carries the statement "Weekendul tău, fără teancul de lucrări.", the line "Elevii trimit pozele lucrărilor de pe telefon. Fiecare lucrare primește punctaj conform baremului.", Laura Miron's texts word for word, and the six stages.
8. The brand shows "MQGrader by Laura Miron". "Math & Quantitative" is wrong: never show a meaning of MQ.
9. The footer is one line, about as high as the header.
10. The left menu is a narrow bar of 80 px (design Z): Test nou, Teste, Clase, De făcut, Setări.
11. No "Ce ai de făcut" cards on the Teste page: the sentence "3 lucruri te așteaptă" opens the list in place (design Z2).
12. No average per student anywhere: a student has grades outside the tests, and not every test counts. The average of one test ("Media testului") is fine.
13. The class page shows a few tests without wide empty columns (design Z3).
14. No row of class tabs above a class: "Schimbă clasa" sits beside its name. "Clase" in the bar opens a panel of classes, the same kind of panel as "De făcut" (design Z3.1).
15. The landing page keeps the dark band behind Laura's text (round 3 version).
16. The app and the student pages take the mark "Trei subiecte" too, for now; the byline stays "by Laura Miron" (Phase 2).
17. On a phone, a bar at the bottom of the screen holds the four items of the 80 px bar, and ☰ holds the rest (round 6, design M2).
18. "De făcut" comes with the shell, in Phase 2, with all three of its cases; the tests list of the API says when a generated barem waits.
19. No search box until search is designed (§11).
20. The rows of the Teste page keep the results buttons of the old cards: "Publică rezultatele" publishes from the list, and "Oprește accesul" stays on a test whose results are open (Phase 3).
21. A finished test shows "media testului" on the Teste page, the same number as its class report (Phase 3).
22. The test page's Verificare lists the papers with points to check, each opening the paper's page. The list of each point with its reason comes with the review of Phase 6: the API gives only a count per paper (Phase 4).
23. The students' link and its QR code are always in "Fișa testului": the button "Arată linkurile" goes (Phase 4).
24. The student's PDF stays on the paper's page, one student at a time: the teacher gives it to a student who has no link. Rezultate has no download of every student's PDF (Phase 5).
25. "CSV pentru catalog" in Rezultate is the CSV of the class report: each exercise, the total, the grade and the notes (Phase 5).
26. "Publică toate rezultatele" opens the link of every student, and "Oprește accesul la rezultate" closes every link, also the ones published alone. While all are published, one result cannot be stopped alone (Phase 5).
27. The review has no marks on the photo: the robot does not say where an answer is on a page, nor on which page. The middle pane shows the student's pages with the page switch (Phase 6).
28. The review is a page of its own, `/admin/teste/:code/verificare`. "Începe verificarea" and "Decide" in the panel Verificare, "Verifică 3 puncte" on the Teste page, and the button of "Decide 3 puncte nesigure" in "De făcut" open it (Phase 6).

## 2. Look

### 2.1 Type

One face: Schibsted Grotesk (Google Fonts), weights 400, 500, 600, 700, 800. Tabular figures are not used: in this face they widen the comma (8 , 50). Caveat goes: it drew only the old menu.

### 2.2 Colours

Flat colours only: no gradients. Shadows only on what floats (menus, panels, dialogs). Surfaces are told apart by a step in tone and a 1 px border.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| ground | #f3f5f8 | #0e1116 | page background of the app |
| surface | #ffffff | #161a21 | panels, bars, the landing page |
| raised | #f7f9fb | #1b2028 | hover, quiet blocks |
| active | #e7ecf3 | #252b36 | current menu item, empty bar segments |
| border | #e0e5ec | #272d38 | panel edges |
| rule | #edf0f4 | #1f242d | lines between rows |
| control | #c5cedb | #3b4351 | input and button edges |
| text | #0c1524 | #eef1f5 | text |
| muted | #4a566a | #a9b2c0 | secondary text |
| blue | #1b5cc8 | #80b1ff | actions, links, done stages |
| blue-hover | #154ba6 | #a3c6ff | |
| on-blue | #ffffff | #0c1524 | text on blue |
| blue-tint | #e6eefb | #1a2740 | current stage, selected row |
| orange | #b9480a | #ff9a57 | text of what waits on the teacher |
| orange-mark | #e2590b | #ff8a3d | dots and bar segments that wait |
| orange-tint | #fdeee3 | #33200f | background of what waits |
| green | #1d7a4c | #5fd39a | "Publicat", correct |
| green-tint | #e1f3e9 | #13291e | |
| danger | #b42318 | #ff8b80 | delete |
| band | #0c1524 | #05070a | the dark band and footer of the landing page |
| on-band | #f3f5f8 | #eef1f5 | text on the band |

Dark values are written twice, in `[data-theme="dark"]` and in `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`, as `src/ui/brand.css` does today.

### 2.3 Theme

Light is the default on every page (landing, teacher app, student app), whatever the system setting says. The theme button switches to dark; the choice is kept in `localStorage` under `quickeval.theme`, as today. `public/theme.js` sets `data-theme` before the page paints.

### 2.4 Mark and lockup

The prototypes used the mark "Trei subiecte": three arcs of one ring, two blue and one orange, on a 64 grid:

```svg
<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke-width="7">
  <path d="M35.74 14.39A18 18 0 0 1 49.12 37.56" stroke="var(--mk-a)"/>
  <path d="M45.38 44.04A18 18 0 0 1 18.62 44.04" stroke="var(--mk-a)"/>
  <path d="M14.88 37.56A18 18 0 0 1 28.26 14.39" stroke="var(--mk-b)"/>
</g></svg>
```

`--mk-a` is blue and `--mk-b` is orange-mark; on the dark band they are #80b1ff and #ff8a3d. From Phase 2 it is also the mark of the teacher app and the student pages (`src/ui/BrandMark.tsx`) and the favicon (`public/favicon.svg`). It may still change (§12); those files and the landing page are the only places that draw it.

The lockup on teacher pages and the landing page is the mark, "MQGrader" (bold) and, under it, "by Laura Miron" (small, muted). Student pages show only the mark and "MQGrader": no byline, no other brand text, no link (rule of the root `AGENTS.md`).

### 2.5 Components

Buttons are 8 px rounded: outline by default, filled blue for the one main action of a screen. Pills (stage names, states) are small flat tinted blocks. Tables keep their lines. Icons are 1.5 px line drawings in the text colour, never in tinted squares.

## 3. Landing page (`/`, `index.html`)

A static page with its own stylesheet; it loads no React. The page's security policy (`public/_headers`) allows no inline script and no inline style.

1. Header: the lockup; links "Cum funcționează" (to the six stages) and "Cum te ajută"; the theme button; "Intră în cont" (outline, to `/admin/`).
2. Hero, in two columns. Left: the heading "Weekendul tău, fără teancul de lucrări.", the line "Elevii trimit pozele lucrărilor de pe telefon. Fiecare lucrare primește punctaj conform baremului.", the button "Intră în cont" (to `/admin/`) and the link "Cere un cont de profesor" (to `/admin/`, where the login form offers the new account). Right, on the ground tone: "Un test, în șase etape", a vertical list; each stage has an icon, its name, who does it ("Tu", "Elevii", "MQGrader") and one sentence:
   - Pregătire (Tu): Încarci testul și baremul. Nu ai barem? Primești o propunere pe care o verifici tu.
   - Tipărire (Tu): Tipărești testul. Fiecare pagină are un cod QR.
   - În clasă (Elevii): Elevii scanează codul și trimit pozele lucrării. Fără cont și fără aplicație.
   - Corectare (MQGrader): Fiecare lucrare primește punctaj conform baremului, pas cu pas, cu 10 puncte din oficiu.
   - Verificare (Tu): Punctele nesigure te așteaptă pe tine. Accepți sau schimbi punctajul.
   - Rezultate (Tu): **Fiecare elev primește un link cu rezultatul lui.** Raportul clasei, un PDF pentru fiecare elev și CSV pentru catalog.
3. Dark band: the heading "Gata cu orele pierdute noaptea târziu corectând teze și teste!" and two paragraphs, side by side: "Descoperă noua platformă care îți ia o mare greutate de pe umeri și îți oferă corectură riguroasă, exact după barem, în doar câteva minute." and "**Ce o face diferită?** Controlul rămâne 100% la tine. Știm că fiecare elev e unic și pot apărea situații nuanțate, așa că platforma îți permite să modifici oricând punctajele în cazurile discutabile sau creative."
4. "Cum te ajută platforma noastră?" with three points, word for word: "Acuratețe după barem" (Sistemul scanează și evaluează lucrările urmărind îndeaproape criteriile stabilite de tine, eliminând erorile de calcul sau oboseala acumulată după ore întregi de corectură.), "Control total în situații discutabile" (Știm că elevii surprind uneori prin exprimări creative sau abordări alternative. Platforma îți oferă libertatea de a ajusta rapid punctajele în orice moment, păstrând decizia finală strict în mâinile tale.), "Economie masivă de timp" (Treci de la ore întregi de corectură la doar câteva minute, timp pe care îl poți folosi pentru tine sau pentru a oferi feedback real elevilor.).
5. On the ground tone: "Pentru tine rămân trei lucruri." with the line "Când intri în cont, vezi doar ce te așteaptă azi, cu un singur buton pentru fiecare. Elevii trimit lucrările singuri, iar tu verifici doar punctele nesigure." and three example tasks, drawn as the app draws them (not buttons that act): Pregătire, "Verifici baremul"; Verificare, "Decizi punctele nesigure"; Rezultate, "Publici rezultatele" ("Fiecare elev primește un link cu rezultatul lui. Raportul clasei, un PDF pentru fiecare elev și CSV pentru catalog.").
6. Footer on the dark band, one line, about 72 px: the lockup on the left; "Corectarea testelor de matematică · Timișoara · 2026" on the right.

7. "Întrebări frecvente" (added for search and answer engines, after the first release): eight questions and answers, also given as `FAQPage` data in the page's JSON-LD; the two must match word for word (`landing.test.ts` checks it).

The landing page is indexed (SEO, GEO and AEO work: canonical, Open Graph, JSON-LD, `robots.txt`, `sitemap.xml`, `llms.txt`); the teacher app, the student app and the API keep `noindex`. Laura's texts appear without emoji and without the chat time stamp.

## 4. App shell (Phase 2)

- A bar of 80 px on the left (the menu "Meniu"), from top to bottom: "Test nou" (a blue square with +, the word under it; to `/teste/nou`), "Teste" (link; current on every `/teste` page), "Clase" (opens the panel "Clasele tale"; marked on every `/clase` page), "De făcut" (opens the panel "Ce ai de făcut"; a number shows how many things wait), and at the bottom "Setări" (only for an administrator, as `adminOnly` is today). Each item has its icon and a short word under it.
- A top bar over the page: the lockup (the mark sits at the top of the 80 px bar, "MQGrader" and "by Laura Miron" start the top bar), the school year, the theme button, and the user's initials, which open a small menu with the name and email, "Contul meu" and "Ieși din cont". No search box until search is designed (§11). The old footer goes.
- The panels open beside the bar, over the page, 384 px wide. Only one is open at a time; Esc and × close it, and so does opening a page. Small menus (the initials, Schimbă clasa, ⋯) close on a click outside them and on Esc.
- "Clasele tale": the classes of the chosen school year that are not archived, each with its number of students and its tests in work (draft, open, in evaluation, or done with a thing in "De făcut"); a test in "De făcut" is orange; the class of the page is marked. "+ Clasă nouă" and "Arhivate (n)" open the page Clase (`/clase`) until Phase 7 replaces it.
- "Ce ai de făcut": one card per thing in "De făcut" (§5): the stage as a pill, the test and its class, what to do, one sentence, and one button to the test (to the review for Verificare, §7); the first card's button is the filled one. Under them, how many other tests of the year are in work. With nothing: "Nimic nu te așteaptă acum."
- The demo line stays at the top of the page, under the top bar.
- On a phone (below 900 px; round 6, design M2): the top bar holds the lockup and ☰. The 80 px bar becomes a bar at the bottom of the screen with the same four items in the same order (Test nou, Teste, Clase, De făcut with its number); Setări leaves it. ☰ drops a menu from the top bar: Setări (administrators), the school year, "Temă întunecată" (a switch), the user's name and email, "Contul meu" and "Ieși din cont". The panels cover the screen between the two bars.

## 5. Teste page (`/admin/`, Phase 3)

- "Bună dimineața, Laura." and a line with the date and "**3 lucruri te așteaptă ˅** în 3 teste." The bold part is a button: it opens and closes the list "Ce ai de făcut" right under it (closed when the page opens). Each row: the stage as a pill, the task, the test and class, one button to the test (to the review for Verificare, §7; the first one filled).
  - The greeting follows Romania's time: "Bună dimineața" from 5:00, "Bună ziua" from 11:00, "Bună seara" from 18:00. The name is the first word of the teacher's name; without a name the greeting is "Bună ziua." alone.
  - The date is today in Romania's time, the weekday first, with a capital letter: "Miercuri, 4 noiembrie".
  - The count and the list are those of "De făcut" in the bar: every class of the year, whatever chip is chosen. One thing: "1 lucru te așteaptă în 1 test."; none: "Nimic nu te așteaptă acum.", with no button.
- The class filter as chips ("Toate clasele", one chip per class of the year), kept in the address as today (`?clasa=`). After them, the box "Arată și testele arhivate" (`?arhivate=1`), as today.
- "În lucru" and "Terminate": a table with the test (its name as a link; the class and the start, or "ciornă"), the stage, the papers (sent of students; "—" for a draft), and the next step.
  - "În lucru" holds the tests in work, as the panel "Clasele tale" counts them: not archived, and not done, or done with a thing in "De făcut". "Terminate" holds the other done tests, and the archived ones with `?arhivate=1`, marked "Arhivat". A group with no test is left out.
  - The stage: a bar of six segments, one per stage (blue done, orange waits on the teacher, pale in progress, grey later), then the current stage's name and its state. The bar is for the eye only; the words say the same.
  - The stages of a test (`src/admin/stages.ts`, for the test page of Phase 4 too). A segment is orange exactly when "De făcut" has the test, at that stage.
    - Pregătire: orange with the case of "De făcut". Done when the test file is there and the barem is active, and always once the test is in evaluation or done. Else in progress: "lipsește testul", "baremul se generează", "lipsește baremul".
    - Tipărire: done when the print PDF exists, and once the test has started. In progress while the print PDF is made ("se pregătește"), after it failed ("nu s-a putut pregăti"), or for a draft made before tests got their link when made ("fără cod QR": no print PDF is made until the teacher presses "Pregătește testul cu cod QR" on the test page). Later without a test file.
    - În clasă: later for a draft ("testul nu a început"), in progress while open ("elevii trimit lucrările"), done after.
    - Corectare: later before the evaluation, in progress during it ("15 din 22 corectate"), done when the test is done.
    - Verificare: orange while points wait ("3 puncte nesigure"), during the grading too. Done when a done test has none. In progress for an archived test that still has some. Later otherwise.
    - Rezultate: orange with the case of "De făcut" ("nepublicate", or "publicate pentru 2 elevi" after some results were published one by one; the panel "Clasele tale" says the same). Done when the test is done and its results are open, or every graded paper is published: "publicate · media testului 7,72", the average of the class report. Later otherwise; a done test with no graded paper says "nicio lucrare corectată".
    - The current stage is the first orange one, else the first in progress, else the first later one, else Rezultate.
  - The next step, from the current stage:
    - Pregătire: "Verifică baremul" or "Generează din nou baremul" when orange; "Încarcă testul" or "Încarcă baremul" in progress; nothing while the barem is generated.
    - Tipărire: nothing while the print PDF is made; "Deschide" after it failed, or for a draft without its link.
    - În clasă: "Începe testul" for a draft; "Pornește corectarea" while open, and nothing when a time is set for it.
    - Corectare: nothing.
    - Verificare: "Verifică 3 puncte".
    - Rezultate: "Publică rezultatele" when orange, or "Publică pentru toți" after some results were published one by one; it publishes on the row (§1, decision 20). When done: "Raportul clasei", if a paper is graded.
    - Nothing: "Nimic de făcut acum".
    - Every other step is a link to the test page; "Verifică 3 puncte" opens the review (§7). A test whose results are open also has "Oprește accesul" on its row. The button of the first thing in "De făcut" is filled; the others are outlines.
  - On a phone (below 768 px) each row becomes a block: the test, the stage, the papers and the next step, one under the other.
- "De făcut" counts exactly three cases, from the tests of the chosen school year that are not archived (`src/admin/shell/todo.ts`, Phase 2):
  - Pregătire, "Verifică baremul generat": a draft or open test whose generated barem waits for "Am verificat baremul" (`barem.unchecked`, no request running). The tests list carries `barem` from Phase 2. The same case says "Generează din nou baremul" when the new generation of an unchecked barem failed (`request` is `failed`): that barem can be neither confirmed nor used until the teacher asks for it again.
  - Verificare, "Decide N puncte nesigure": a test with points to check (`flagCount` above 0).
  - Rezultate, "Publică rezultatele": a done test with nothing to check, at least one graded paper, the results not open, and not every graded paper published one by one.

## 6. Test page (`/admin/teste/:code`, Phase 4)

- Above the title, the link "← Toate testele". Title: the test's name. Under it: the class (a link to its page), its students ("3 elevi") and the start ("început 6 oct. 2026, 10:15"), or "ciornă" for a draft. Under that, for every stage: the notice of the page before (a new test whose file did not upload), a failed refresh, and what the robot answered to the last button.
- Left column, 300 px: the six stages of `stagesOf()` (§5) as a vertical list and, under it, "Fișa testului". Each stage is a link: a dot (blue with a tick when done, orange when it waits on the teacher, pale blue when in progress, empty when later), the stage name and its note ("lipsește baremul"; "gata" or "urmează" when the stage has none). The words also say the state to a screen reader ("în lucru", "te așteaptă").
- Right: only the panel of the chosen stage: its name, the landing page's sentence for that stage (§3), and its controls.
  - The page opens on the current stage (§5). A click on a stage opens its panel. The address keeps it (`#pregatire`, `#tiparire`, `#in-clasa`, `#corectare`, `#verificare`, `#rezultate`) without a new step in the history, so a reload and Back come back to it. The Teste page opens a stage this way: "Pornește corectarea" opens `#corectare`.
  - The page never changes the panel by itself: after a refresh or a button, the same panel stays open, also when the current stage moved on. A panel may end with a link to the next stage ("Următoarea etapă: Corectare →").
- The panels. Phase 4 moves the controls that exist today; Phase 5 changes Rezultate, and Phase 6 Verificare.
  - Pregătire: the test file, the barem (uploaded, or generated and confirmed with "Am verificat baremul"), the comments to the barem; the robot line while a barem is generated. Done when the barem is active.
  - Tipărire: the test with the QR code (`PrintTest`), its failure and retry, "Pregătește testul cu cod QR"; the robot line while it is made. After the uploads closed, one line: the file stays in Fișa testului. Done when the print PDF exists.
  - În clasă: "Începe testul" and "Oprește testul" (`TestActions`), "Redeschide încărcarea", the link for many uploads (while open), and the papers table: who sent and who did not.
  - Corectare: before the start, one line. While open: start now for the chosen papers or at a time, or "Marchează ca terminat", and the papers table with its checkboxes (only in this panel). After: the state of the grading, a partial grading, a problem of the barem (with a link to Pregătire, where the barem is replaced), the robot line, "Recorectează tot", the line of the class analysis, and the papers table.
  - Verificare: "Începe verificarea", which opens the review (§7) at the first point, and "Puncte de verificat", a row per point: the student and the exercise ("Ioana Marin · Subiectul al II-lea, 3)"), the reason, "propus 1p din 1p", and "Decide", which opens the review at that point. The pages the robot could not read are one point: "Paginile necitite" and the pages. "Toate punctele sunt verificate." and "Vezi lucrările" (the review) when graded papers have none; one line before any paper is graded. Then the papers table.
  - Rezultate: the students' result links and "Pentru tine" (§8, Phase 5). The papers table of the other panels has no result link and no publish button: they are in Rezultate.
  - Every stage can be opened at any time. A panel whose stage has not come yet says so in one line, and still shows what can be read or changed.
- Fișa testului:
  - The facts: the class and its students, the code, the state, the start, the papers sent, the barem's state ("activ", "de verificat", "se generează", "lipsește"; not its points, which the API knows only after the grading starts), and "Media testului" once a paper is graded.
  - The files: the test, the barem, the test with the QR code.
  - While the test is a draft or open and has its link: the students' link, always shown: a small QR code, the address with "Copiază linkul", and "Arată codul QR pe tot ecranul".
  - "Redenumește testul"; "Arhivează testul" or "Scoate din arhivă" (a finished test); "Șterge testul".
- On a phone (below 900 px): one column; the stages, then the panel, then Fișa testului.

## 7. Verificarea punctelor (Phase 6)

The page `/admin/teste/:code/verificare` (decision 28): three panes in one panel.

- A point to check is an exercise the robot was not sure of, with its reason, or the pages the robot could not read: those pages are one point, as the papers' counts say. The points go in the order of the papers (by the student's name); in a paper, the pages first, then the exercises in the barem's order. The API lists them with each paper (`reviewPoints` in the uploads list), counted as `flagCount` counts.
- The address names the paper and the point (`?lucrare=12&punct=34`; `punct=pagini` for the pages) without a new step in the history, so a reload comes back to it. Without them, the page opens on the first point and writes it into the address, so a newly graded paper never moves it. An address of a paper that has no result now (it is graded again) shows that paper and says why ("Robotul corectează acum lucrarea. Când are rezultatul, apare aici."); its new result shows when the grading is done.
- The title row: "Verificare", under it the test, its class and "3 puncte în 2 lucrări"; "Înapoi la test" (to the panel Verificare) and "Următorul punct" (the filled button, while a point waits).
- Left: "Cu puncte de verificat": each paper with its grade and "2 puncte de verificat", and under it its points (the exercise and "1p din 1p", or "Paginile necitite"), the current point marked. Then "Celelalte lucrări": every other graded paper with its grade. A click on a point opens it; a click on a paper of "Celelalte lucrări" shows that paper, with no point.
- Middle: the paper's pages, one at a time: "Ioana Marin · pagina 2 din 3" and the page switch (1 · 2 · 3). A click on a photo opens it full size in a new tab; a PDF shows in a frame. No marks on the photo (decision 27). A point opens on page 1; the pages point opens on the first page the robot could not read.
- Right, for an exercise: its name and "5p în barem"; the points ("1p din 1p"), the student's answer, the robot's comment, and on orange "De verificat:" with the reason; "Accept 1p" (the filled button), a stepper for another value (− and + by 0,5, from 0 to the maximum; any value in steps of 0,05 can be typed) and "Salvează". Under them, the total ("Total: 75 din 100, cu 10 din oficiu"), what the grade becomes while the stepper shows another value ("Cu 0p aici, nota devine 8,40"), and the grade. Then the paper's exercises with their points, the ones to check marked; a click on one to check opens it.
- Right, for the pages point: "Robotul nu a putut citi: Pagina 2. Verifică pozele și punctajele exercițiilor de pe ele." and "Am verificat paginile".
- Right, for a paper with no point open: its total and grade, and its exercises. Under every view, "Deschide lucrarea": the paper's page, where the rest changes (the comments, "Recorectează", the student's PDF).
- After "Accept", "Salvează" or "Am verificat paginile", the next point opens, if the teacher is still at the point she decided (not after she opened another paper or left the review), and its heading takes the focus, without a scroll. While the answer is on its way, the buttons and the keys do nothing. When no point is left: "Toate punctele sunt verificate." and "Mergi la Rezultate".
- The keys: A accept, J and K the next or the previous point, 1–9 the page. A line under the decision names them (not on a phone). They do nothing while the cursor is in a field or in a panel or menu of the bars, or with Ctrl, Alt or Meta. A key held down acts once.
- A change names the grading it was made on: when the paper was graded again in the meantime, the change is refused and the page reads the paper again.
- On a phone (below 900 px): one column: the page, the decision, then the papers.

## 8. Rezultate (Phase 5)

The panel of the stage Rezultate (§6). A draft has one line: "Rezultatele se publică după corectare." Every other test:

- Under the stage's sentence, one line: "Linkul arată nota, punctajul pe fiecare exercițiu și comentariile. Elevul îl vede după ce îl publici."
- Publishing:
  - Before any paper is graded, while no result is published: "Rezultatele se publică după corectare.", and no button.
  - While the results are not published for all: "Publică toate rezultatele", the panel's filled button. While points wait in Verificare, a line before it: "Mai ai 3 puncte de verificat. Dacă publici acum, elevii văd punctajul de acum."
  - While they are: "Rezultatele sunt publicate. Elevii le văd pe linkurile lor.", "Oprește accesul la rezultate" (outline), and "Linkurile cu rezultate și pozele lor nu se mai deschid până publici din nou rezultatele." It closes every link, also the ones published alone (decision 26).
- "Linkurile elevilor", with the count of the links ("1 publicat · 26 nepublicate", or "toate publicate"), and a table with a row for each student of the class, and for a student who left the class after starting a paper, sorted by name:
  - "Elev": the name, a link to the paper's page (where the student's PDF is), and "a plecat" for a student who left.
  - "Punctaj": the total and its maximum, as in the class report ("72 / 100"); "Nota". A paper not graded yet has "—" for both.
  - "Linkul cu rezultatul": "Copiază linkul" ("Copiat!" after it). An older paper with no link yet first has "Fă linkul". When the browser refuses to copy, the link shows in a field, to copy by hand. A student who did not send a paper has no link: "Nu a trimis lucrarea."
  - "Stare": "Publicat" with "Oprește publicarea", or "Nepublicat" with "Publică". Only a graded paper has "Publică": a paper not graded yet is "Nepublicat" alone. While all results are published, "Publicat" alone.
  - On a phone each row is a card, like the papers table.
- "Pentru tine":
  - "Raportul clasei": "Media testului 7,18 · rezultatele pe exerciții · analiza clasei", and "Deschide raportul".
  - "CSV pentru catalog": "Fiecare elev cu punctele pe exerciții, totalul și nota.", and "Descarcă CSV" (decision 25).
  - The line "PDF-ul cu rezultatul unui elev este pe pagina lucrării lui: apasă pe numele lui în tabel." (decision 24).
  - Before the first graded paper, one line in their place: "Raportul clasei și CSV-ul apar după prima corectare."

## 9. Clase (Phase 7)

- No page with all classes. "Clase" in the bar opens the panel "Clasele tale": each class with its students and its tests in work (orange when one waits), the current class marked; "+ Clasă nouă" and "Arhivate (n)". `/admin/clase` opens the last class seen (else the first).
- The class page starts with one line: the name, "Schimbă clasa ˅" (a menu of the classes, a dot for a class that waits, "+ Clasă nouă"), the facts ("28 elevi · 3 teste · anul școlar 2026–2027"), "Test nou pentru această clasă", and ⋯ ("Redenumește clasa", "Arhivează clasa").
- Tab "Note și teste": the grades table, a row per student and a narrow column (about 156 px) per test, oldest on the left; a cell shows the grade, an orange dot when points wait, "—" when no paper was sent; the last row is "Media testului". There is no average per student. Beside it, "Testele clasei", newest first: name, date, sent, stage, next step, and "Arată și testele arhivate (n)".
- Tab "Elevi": on the left the students (search, an orange dot for points to check, "+ Adaugă elevi"); on the right one student: "Redenumește", "A plecat din clasă", "Șterge"; each test with date, points, grade ("1 punct de verificat" when one waits), the result ("Publicat" or "Nepublicat" with "Copiază linkul", "După verificare", "Nu a trimis lucrarea"), the paper; "Toate notele elevului, din toate clasele".
- "Clasă nouă" is a dialog with the name and the students (one per line) in one step. "Adaugă elevi" is a dialog with the names.

## 10. Student pages (with Phase 2)

The flow and the texts stay. They take the new type and colours, light by default. The header shows only the mark and "MQGrader". No word says how the work is graded.

## 11. Not designed yet

Search and its results (no box in the top bar until then); the "Test nou" form; Setări; login and sign-up; Contul meu; the first visit of a new teacher and the empty states; an archived class; the student's history page; the class report page; where the demo account line goes (Phase 2 keeps it at the top of the page).

## 12. Open questions

- The final mark: the user found the old ring-and-tick mark too common and liked "Score ring" and "Ring and tick" in the brand study; the prototypes use "Trei subiecte" (§2.4), which the user chose for Phase 2 "for now".
- Settled: the byline stays "by Laura Miron" (asked on 2026-11-04).
- "Use Z2 design for tests" was read as the Teste page of Z2 (§5), not the blocks per test inside a class.

## 13. Phases

Each phase is its own branch and pull request, with tests. From Phase 2 on, each plan is written from a tested prototype (the plan method of `docs/superpowers/plans/`).

1. Landing page and the light default theme. The app keeps its current look.
2. Look and shell: tokens, type, mark and lockup in `src/ui/brand.css`; the bar, the top bar, the two panels with "De făcut" and its three cases, the phone bar and menu; the student pages' new look.
3. Teste page, with the list "Ce ai de făcut" in place.
4. Test page: the stages and Fișa testului.
5. Rezultate.
6. Verificarea punctelor.
7. Clase.
8. The pages of §11.
