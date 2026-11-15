# Fișa testului, the test's actions and printing: design

Date: 2026-11-15. Front end only: no migration, no API change.

Mockups (the app's real CSS and page HTML, not in Git): `.superpowers/mock/fisa/`
(`index.html` through the `web` preview at `/.superpowers/mock/fisa/index.html`; pictures in `shots/`).
The chosen ones: the page with the "Acțiuni" menu (`a-done.html`), card V2 (`cards-variants.html`),
the card per state (`cards-states.html`, drawn with V1 tiles; V2 adds the bar and the grade colour),
Tipărire P1 (`print-1.html`), phone (`shots/6-phone-menu.png`).

## Why

Fișa testului (left column of the test page, under the six stages) has grown long:

- It repeats what the stages already hold: the test and barem files (Pregătire), the barem state,
  the test with the QR code (Tipărire).
- The actions that work in every stage (rename, change subject, archive, delete) sit at its bottom.
  The teacher scrolls a long way to find them.
- Its facts are bold and read as a dense list.
- To print, the teacher downloads the PDF with the QR code and opens it in another app.

## Goals

1. The test's actions sit at the top right of the page, in one menu, each with what it does.
2. Fișa testului shows only the facts of the test, short, with no bold values.
3. The test with the QR code lives in Tipărire, and the teacher prints it from the page.

Non-goals: no change to the stages, the stage panels' other content, the API or the student pages.

Anti-goals: a hidden action the teacher cannot find; a print button that silently does nothing
on some browser.

## Approaches (picked in the conversation)

- A: one "Acțiuni" menu at the top right holds all the actions; a short card stays in the left column. **Picked.**
- B: no card; the facts go in one line under the title. Most room, but the line wraps on narrow screens.
- C: "Redenumește" and "Schimbă materia" as visible buttons, archive and delete in a menu; a card with big numbers.

The user picked A with the card of C. Card variants: V1 grey tiles, **V2 grey tiles with a bar under
"Au trimis" and the average in its grade colour (picked)**, V3 numbers without tiles.
Print variants: **P1 a page picture with "Tipărește" and "Descarcă PDF" (picked)**, P2 the PDF shown in the panel.

## The design

### 1. "Acțiuni" in the test head

- The test head (`TestPage.tsx`, `.test-head`) becomes a row: title and sub-line on the left,
  a quiet button "Acțiuni ˅" on the right, like "Alte acțiuni" of the paper page
  (`PaperActionsMenu` in `paperPage/PaperHead.tsx`, `useSmallMenu`, `.paper-actions-menu`).
- Each item shows its name and, under it, what it does (its accessible description):
  - "Redenumește testul": "Schimbi titlul testului."
  - "Schimbă materia" ("Alege materia" while the test has none): "Lista de exerciții se face din nou,
    iar lucrările corectate se corectează din nou." With no subject yet: "Altfel, materia se stabilește
    la corectare, din test." Only when `SubjectChange` today offers a change; while the robot reads
    the test, the item is there but disabled, its description the line that says when the subject can change.
  - "Arhivează testul" (only a done test) or "Scoate din arhivă" (an archived test): the hint of today.
    Archive still asks first through `ArchiveDialog` when results are open.
  - "Șterge testul" (red): "Se șterg și toate lucrările încărcate de elevi." plus, when the print PDF
    is ready, "Codurile QR de pe testele tipărite nu mai funcționează." Choosing it still asks with
    `window.confirm`, as today.
- "Redenumește testul" opens a dialog (`Modal.tsx`) with the title field, "Salvează" and "Renunță",
  in place of today's in-card form.
- "Schimbă materia" opens a dialog with the subject choices of `SubjectForm.tsx` (the seven subjects
  and the line that the list is made again).
- On a phone (≤ 40rem) the menu hangs from the whole head, as wide as it (the paper page's rule).
- Errors of these actions show under the head.

### 2. Fișa testului (card V2)

- Head: "Fișa testului" on the left; on the right the state chip (`StatusChip`) and, for an archived
  test, the "Arhivat" tag.
- Two tiles (grey, `--raised`), a label and a value in 500 weight; the value's second part
  ("din 23") muted and small:

  | State | Tile 1 | Tile 2 |
  |---|---|---|
  | draft | Elevi: N | Baremul: activ / lipsește / se generează / de verificat (`baremState`) |
  | open | Au trimis: X din N, with a bar | Încarcă acum: the uploads with files still uploading |
  | evaluating, done | Au trimis: X din N, with a bar | Media testului (once there is one, in its grade colour, `.points-N` of `pointsLevel`); else "Corectate: G din X" |

- Under them, the plain rows (no bold): Clasa ("Clasa 7E2 · 23 de elevi"), Codul, Materia
  (`subjectLine`, with no button), Început (only once started).
- Gone from the card: Starea row (now the chip), Baremul row (now a tile only in the draft), the files,
  the test with the QR code, the students' link, the rename, archive and delete buttons.
- Place unchanged: under the stages on a wide screen, after the panel on a phone.

### 3. Tipărire (P1)

- The panel shows a card per variant: a small drawn picture of a page with a QR corner (not a render of
  the PDF), "Testul cu cod QR", "Codul QR apare în colțul fiecărei pagini.", and how many copies:
  "Tipărește 23 de copii, câte una pentru fiecare elev." (with a CES variant: "…, pentru elevii fără CES."
  on the class card and "…, pentru elevii cu CES." on the CES card; no line for a class with no student).
- Buttons: "Tipărește" (filled blue, the panel's main action) and "Descarcă PDF" (quiet).
  The CES card has the same two buttons, both quiet.
- "Tipărește" loads the print PDF (`printFileUrl`, served `inline`) in a hidden same-origin frame and
  calls its `print()`: the computer's print window opens on the page. Where that cannot work
  (iPhone, iPad, Safari, Firefox, or the frame fails to load or to print), it opens the PDF in a new tab instead,
  where the browser's own viewer prints it. While the PDF loads, the button says it is getting ready.
- The pages' security policy (`public/_headers`) must allow frames of the site's own files:
  `frame-src 'self' https://challenges.cloudflare.com` (it allowed only Turnstile). The API's files
  already allow only our own pages (`X-Frame-Options: SAMEORIGIN`). This also lets the review show
  a paper's PDF pages, which are in frames too.
- The hints of today stay as hints: "Poți tipări testul de acum…" for a draft (on the class card only),
  and the Word warning. An answer that is not a PDF prints nothing and says so under the button.
- The other states of `PrintTest` stay (no file, no link, being made, failed and retry).
- After the test was given (not draft, not open), Tipărire keeps the card with its two buttons under
  "Testul s-a dat în clasă." (today it sends the teacher to Fișa testului).

### 4. The students' link moves to În clasă

- The upload link (`UploadLink`, today in the card for a draft or open test) moves to the top of the
  În clasă panel, for a draft and an open test: the address with "Copiază linkul", one
  "Arată codul QR pe tot ecranul" button (no small QR picture), and today's hint under it.
- The empty state of an open test with no paper ("Nicio lucrare trimisă încă") loses its own
  full-screen button: the link's button does it, and it stays when the first paper arrives.

## Constraints

- Romanian UI text; flat styles; dark colours written twice in `brand.css`.
- Only `.button` filled blue for the one main action of a panel.
- Tests: the page tests that find the rename, archive, delete, subject and the students' link in the
  region "Fișa testului" move to the menu, the dialogs and the În clasă panel.

## Left to the builder

- Component split (a `TestActionsMenu` beside `PaperActionsMenu`, or one shared menu component).
- How the print frame is detected as failed, and the browser test for "cannot print in a frame".
- The exact count of "Încarcă acum" (uploads with status `uploading` and files).
