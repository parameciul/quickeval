# Rezultate page design (C3)

The new look of the stage Rezultate on the test page, and of the papers table it shares with Corectare. Front end only: no API change, no migration.

Mockup (not in git): `docs/design-proposals/rezultate-designs.html`, design "C3 · Cele două căi", served by `npm run dev:web` at `/docs/design-proposals/rezultate-designs.html`.

## Why

- The sentence under "Rezultate" fills only half of the panel, and the panel says it a second time.
- The students table is hard to read: bold names, plain grades. The table of Corectare looks the same way. Both should look like the points table of Verificare.
- "Raportul clasei" is the important output of this stage, but it sits at the end, after the long students table. The CSV is rarely used but has the same weight.
- After publishing, the teacher must see clearly where the students find their results.

## Goals

- The Rezultate sentence uses the full width of the panel and says only what the students get.
- One table look for Rezultate and Corectare, taken from Verificare, with no bold text.
- Grades read at a glance, in the colours of the class report.
- "Raportul clasei" is at the top and is the main button. The CSV is a small link.
- A published test shows, in one green box, the two ways the students see their results.

## Non-goals

- No change to the class report page, the paper page, Verificare, or the student pages.
- No new data from the API.
- No change to what publishing does.

## Anti-goals

- No word for students about how the work is graded (`expectNoGradingWords()` still holds; this change touches only teacher pages).
- Orange stays the colour of what waits on the teacher. A grade's colour never replaces the "de verificat" pill.
- No extra D1 reads: the panel uses the data the test page already has (`TestInfo`, `UploadRow[]`).

## Approaches considered

All the approaches shared the same table fix and the same sentence fix. They differed in where the report and the publishing go.

- **A · Raportul sus:** a wide report box first, then one line for publishing and one for the link. Clear, but the table starts far down.
- **B · Cifrele clasei:** the number tiles of the report page, with a "Raportul clasei" tile. Many numbers, and the QR card moves under the table.
- **C · Coloana din dreapta:** the table on the left, a column on the right with the report first. Picked by the teacher.

Within C, three ways to show the publish message:

- **C1:** a wide green band above the table.
- **C2:** a green card in the right column.
- **C3 · Cele două căi:** a green box above the table that splits the message into its two ways. **Picked.**

The teacher also asked for:

- no colour legend,
- the grade chips of B,
- no arrow on "Deschide raportul",
- the new stage sentence,
- the publish message.

## The design

### 1. The stage sentence (`SENTENCES.Rezultate` in `StagePanel.tsx`)

- The new text: "După ce rezultatele sunt publicate, fiecare elev are acces la rezultatul lui: nota finală, punctele pe fiecare exercițiu, explicații detaliate pentru fiecare problemă rezolvată corect sau greșit și o sinteză finală cu ce merge bine și recomandări."
- The landing page keeps its own text. The comment over `SENTENCES` must say that Rezultate now differs from it.
- The sentence takes the full width of the panel: `.stage-head p` loses `max-width: 62ch`. *My call:* for all six stages, so the panels stay alike.
- `ResultsPanel` loses its own first paragraph, which repeated the sentence.

### 2. The panel layout, top to bottom

1. **The publish box**, the full width of the panel. It has three states.

   **Published** (students can read results: `test.resultsOpen`, or some results published one by one, `publishedCount > 0`, as the old card): a green box (`--ok-bg`, a green check).
   - Its heading: "Rezultatele sunt publicate. Elevii le văd în două feluri:" When only some results are published one by one: "Unele rezultate sunt publicate. Elevii le văd în două feluri:"
   - On the right of the heading: "Oprește accesul la rezultate" (quiet button) while all are published; "Publică toate rezultatele" (primary) while only some are, with the warning about the points still to check.
   - Under the heading, while all are published, today's hint about stopping: "Dacă oprești accesul, linkurile cu rezultate și pozele lor nu se mai deschid până publici din nou rezultatele."
   - Way 1, "Pe linkul lor": "Salvat pe telefon la încărcarea rezolvărilor. Nu trebuie să facă nimic."
   - Way 2, "Scanează din nou linkul testului pentru elevi": "Codul QR de pe test, de pe telefonul cu care au trimis." Then, when the test has its students' link (`uploadToken`): the small QR code, "Copiază linkul" (a refused copy shows the link in a field, selected), "Descarcă codul QR" and "Arată codul QR pe tot ecranul" (`QrOverlay`; closing it gives the focus back to the button).
   - The two ways are the message itself, numbered: no extra sentence repeats them.

   **Not published, something graded:** a grey box.
   - Its heading: "Rezultatele nu sunt publicate".
   - It keeps today's warning: "Mai ai N puncte de verificat. Dacă publici acum, elevii văd punctajul de acum." With no point to check: "Elevii nu văd încă rezultatele."
   - The button: "Publică toate rezultatele" (primary).

   **Nothing graded yet** (today's `NoResultsYet`): a grey box, "Rezultatele se publică după corectare", with "Mergi la Corectare".

2. **A grid**: the students table on the left, the widest part; the column "Raportul clasei" on the right, 18 rem wide. The panel's own width decides (a container query on the panel, 56 rem): in a narrower panel (a phone, a small laptop) the card goes above the table, full width. In the page's order the card comes first, so a keyboard and a screen reader reach it before the rows of the table.
3. **The card "Raportul clasei"** (the right column; replaces "Pentru tine" / `ResultFiles`):
   - the average (`test.averageGrade`), large, in its grade colour, with "media testului · N din M elevi corectați" (the active students, as the report's "Corectate" tile);
   - the grade groups (`GRADE_GROUPS`), one bar each, coloured red, yellow, green and dark green as the grade colours;
   - "Deschide raportul": a primary button, the full width of the card, with no arrow;
   - "CSV pentru catalog": a small text button with a download icon. It works as today's `CsvRow`.
   - Before the first grading: "Raportul clasei și CSV-ul apar după prima corectare."
   - The old line "PDF-ul cu rezultatul unui elev este pe pagina lucrării lui…" goes.
4. **The students table** (`ResultLinksTable`): over it, "Elevii" and today's count ("toate publicate", "1 publicat · 26 nepublicate"). Its columns are Elev, Nota, Punctaj, Linkul cu rezultatul and Stare. Nota comes before Punctaj, so the colour is read first.

### 3. The table look, in Rezultate and in Corectare (`table.uploads`, `table.uploads.result-links`)

- It matches the points table of Verificare (`table.items`):
  - The headers are 13 px, muted, on a `--raised` band, with a `--rule` line under them.
  - The rows have `--line` lines between them, a `--raised` background on hover, and padding of about 10 px × 12 px.
  - The table sits in a box with a border and `--radius-panel`.
- In both tables the grade comes right after the name, so its colour is read first. Rezultate: Elev, Nota, Punctaj, Linkul cu rezultatul, Stare. Corectare: Elev, Nota, Stare, Fișiere, Ora, De verificat, then the row's actions.
- **No bold** in either table. The student name has weight 500, in the text colour, and is underlined on hover. The headers have weight 500. The `<strong>` on the grade goes.
- **The grade** is a soft chip: the number in `--conf-N`, on the same colour at about 14 %.
  - The level is `pointsLevel(grade, 10)`: 9–10 is level 5, 7–8.99 is 4, 5–6.99 is 3, 2.5–4.99 is 2, and under 2.5 is 1.
  - This is the scale of the class report's points.
  - The chip shows only for a paper graded now. Otherwise the cell shows "—".
- **Points to check** stay a separate orange pill next to the grade, in Rezultate ("2 de verificat"). In Corectare the column "De verificat" keeps its own orange count.
- No colour legend.
- The rest of each row stays as today: "Nu a trimis lucrarea.", "Nu a participat", "Eșuat" with "Reîncearcă", the CES tag, "a plecat", "Publicat", "Publică" or "Oprește publicarea", "Vezi lucrarea" and ⋯, and the checkboxes of an open test.
- On a phone each row stays a card, as today: the name, then each cell under its caption, the grade ("Nota") first.

## What goes away

- `StudentAccessCard` in Rezultate: the big green card with the long help text. The publish box replaces it.
- In it, the teacher's multi-upload link with "Nu-l da elevilor". *My call:* it stays only in În clasă, where it is used.
- `ResultFiles` and its "Pentru tine" heading. The report card replaces them.

## Constraints

- All text is Romanian. Keep the existing texts where this doc does not give a new one.
- Times, the API, and D1 are not touched. The grade groups come from the `UploadRow[]` the page has. Count each graded row with a grade, whether the student is active or left, as the report does. This needs no report query.
- Light and dark mode: the colours come from the tokens in `brand.css` (both dark copies kept equal; `brand.test.ts` checks it).
- Tests: update `ResultsPanel.test.tsx` and the tests that read the papers table. Add cases for:
  - the three publish states,
  - the report card before and after grading,
  - the grade chip level classes,
  - no `<strong>` in either table.

## Left to the builder

- The exact CSS class names, and whether the publish box and the report card are new components.
- The heading levels inside the panel (the panel's own heading is `h2`).
- The focus order and the labels for screen readers, following the existing patterns (`aria-label` with the student's name on row buttons).
- The exact phone layout, close to the mockup's.

## Decisions made by Claude (check these)

1. The full-width sentence applies to all six stages, not only Rezultate.
2. The teacher's multi-upload link leaves Rezultate and stays in În clasă.
3. The grade groups come from the uploads, not from a report query, so the panel reads nothing more from D1.
4. A grade of 2.5–4.99 keeps its own orange-brown colour (`--conf-2`), even though it is close to the "de verificat" orange. The pill shape and its words keep them apart.
