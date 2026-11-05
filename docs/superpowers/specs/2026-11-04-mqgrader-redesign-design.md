# MQGrader redesign: design

Date: 2026-11-04. Status: agreed with the user after six rounds of prototypes. Phase 1 (landing page and light theme) is live; Phase 2 (look and shell) is being built; the other phases are not.

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

The page keeps `noindex`. Laura's texts appear without emoji and without the chat time stamp.

## 4. App shell (Phase 2)

- A bar of 80 px on the left (the menu "Meniu"), from top to bottom: "Test nou" (a blue square with +, the word under it; to `/teste/nou`), "Teste" (link; current on every `/teste` page), "Clase" (opens the panel "Clasele tale"; marked on every `/clase` page), "De făcut" (opens the panel "Ce ai de făcut"; a number shows how many things wait), and at the bottom "Setări" (only for an administrator, as `adminOnly` is today). Each item has its icon and a short word under it.
- A top bar over the page: the lockup (the mark sits at the top of the 80 px bar, "MQGrader" and "by Laura Miron" start the top bar), the school year, the theme button, and the user's initials, which open a small menu with the name and email, "Contul meu" and "Ieși din cont". No search box until search is designed (§11). The old footer goes.
- The panels open beside the bar, over the page, 384 px wide. Only one is open at a time; Esc and × close it, and so does opening a page. Small menus (the initials, Schimbă clasa, ⋯) close on a click outside them and on Esc.
- "Clasele tale": the classes of the chosen school year that are not archived, each with its number of students and its tests in work (draft, open, in evaluation, or done with a thing in "De făcut"); a test in "De făcut" is orange; the class of the page is marked. "+ Clasă nouă" and "Arhivate (n)" open the page Clase (`/clase`) until Phase 7 replaces it.
- "Ce ai de făcut": one card per thing in "De făcut" (§5): the stage as a pill, the test and its class, what to do, one sentence, and one button to the test; the first card's button is the filled one. Under them, how many other tests of the year are in work. With nothing: "Nimic nu te așteaptă acum."
- The demo line stays at the top of the page, under the top bar.
- On a phone (below 900 px; round 6, design M2): the top bar holds the lockup and ☰. The 80 px bar becomes a bar at the bottom of the screen with the same four items in the same order (Test nou, Teste, Clase, De făcut with its number); Setări leaves it. ☰ drops a menu from the top bar: Setări (administrators), the school year, "Temă întunecată" (a switch), the user's name and email, "Contul meu" and "Ieși din cont". The panels cover the screen between the two bars.

## 5. Teste page (`/admin/`, Phase 3)

- "Bună dimineața, Laura." and a line with the date and "**3 lucruri te așteaptă ˅** în 3 teste." The bold part is a button: it opens and closes the list "Ce ai de făcut" right under it (closed when the page opens). Each row: the stage as a pill, the task, the test and class, one button.
- The class filter as chips ("Toate clasele", one chip per class), kept in the address as today (`?clasa=`).
- "În lucru" and "Terminate" (archived ones with `?arhivate=1`, as today): a table with the test (name, class, start), the stage (a bar of six segments: blue done, orange waits on the teacher, pale in progress, grey later; the stage name and its state), the papers (sent of students), and the next step (one button, or "Nimic de făcut acum").
- "De făcut" counts exactly three cases, from the tests of the chosen school year that are not archived (`src/admin/shell/todo.ts`, Phase 2):
  - Pregătire, "Verifică baremul generat": a draft or open test whose generated barem waits for "Am verificat baremul" (`barem.unchecked`, no request running). The tests list carries `barem` from Phase 2. The same case says "Generează din nou baremul" when the new generation of an unchecked barem failed (`request` is `failed`): that barem can be neither confirmed nor used until the teacher asks for it again.
  - Verificare, "Decide N puncte nesigure": a test with points to check (`flagCount` above 0).
  - Rezultate, "Publică rezultatele": a done test with nothing to check, at least one graded paper, the results not open, and not every graded paper published one by one.

## 6. Test page (`/admin/teste/:code`, Phase 4)

- Title: the test's name; under it the class, the students and the start.
- Left column, 300 px: the six stages as a vertical list (a dot per stage: blue with a tick when done, orange when it waits on the teacher, empty when later; the stage name and its state) and, under it, "Fișa testului".
- Right: only the panel of the chosen stage. The current stage opens first; every other stage can be opened at any time to read or change it.
- The stages and the controls that exist today:
  - Pregătire: the test file, the barem (uploaded, or generated and confirmed with "Am verificat baremul"), comments to the barem, "Încarcă-l în locul propunerii". Done when the barem is active.
  - Tipărire: the test with the QR code (`PrintTest`), its failure and retry. Done when the print PDF exists.
  - În clasă: "Începe testul" and "Oprește testul" (`TestActions`), the upload link and QR, who sent and who did not, "Redeschide încărcarea".
  - Corectare: start now or at a time, the choice of papers, the grading bar (`GradingProgress`), the robot line, "Recorectează tot".
  - Verificare: the doubtful points (student, exercise, reason, proposed points, "Decide") and "Începe verificarea"; the graded papers, the ones to check first.
  - Rezultate: §8.
- Fișa testului: class and students, code, start, sent, barem (points + 10 from office), the files (test, barem, test with QR code), the students' link with its QR code and "Copiază linkul", and "Redenumește", "Arhivează", "Șterge testul".

## 7. Verificarea punctelor (Phase 6)

Three panes in one panel:

- Left: "Cu puncte de verificat" (each paper with its grade and its points to check, the current one marked), then "Celelalte lucrări" (every other paper with its grade).
- Middle: the photo of the page with the marked zones (green checked, orange dashed to check) and the page switch (1 · 2 · 3).
- Right: the exercise of the barem, its items with points; the doubtful item on orange with its reason, "Accept Np", a stepper for another value and "Salvează"; the total, what the grade becomes with the other value, the grade; the keys: A accept, J/K next or previous point, 1–3 page.
- The title row: "Verificare", the test, "Înapoi la test", "Următorul punct".

## 8. Rezultate (Phase 5)

The stage panel starts with the student links: "Fiecare elev primește un link cu rezultatul lui: nota, punctajul pe fiecare exercițiu și comentariile." and "Publică toate rezultatele". A table: student, points, grade, "Copiază linkul", and the state ("Publicat" with "Oprește publicarea", or "Nepublicat" with "Publică"); a student without a paper has no link. Under it, "Pentru tine": the class report, a PDF for each student, the CSV for the catalog.

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
