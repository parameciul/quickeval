# Student result access: the ticket and the short code

Date: 2026-11-17. Mockup: `.superpowers/mockups/result-access/index.html` (design A, "the ticket"; not committed).

## 1. Intent

A student gets a secret link to the result page after "Am trimis tot". Students aged 11 to 15 lose it: they keep it as a screenshot, and the long address cannot be typed back. Then they ask the teacher. The teacher should not be needed.

The student must have several easy ways to keep the link, and one way back when all of them failed.

## 2. Goals, non-goals, anti-goals

Goals:

- A plain screenshot of the "sent" screen is enough to open the result later (a QR code in the picture).
- One tap saves a clean picture with the QR code, the test's name, the student's name and a short code.
- One tap sends the link to the student's own chat or messages.
- A short code, typed on the test's own page, opens the result on any phone.
- The test's page tells a student with no link where to look, and has the code field.

Non-goals:

- A public page that takes a code with no test link (decided: the code works only on the test's page).
- Email or SMS, student accounts, an installed app.
- Quick Try: its page and its paper stay as they are.
- A change to the result link itself (`result_token`, 120 bits) or to who may read a result.

Anti-goals:

- A result opened by picking a name, or by a code that a classmate can guess in a few tries.
- Any word on a student page or on the picture that says how the work is graded (`expectNoGradingWords()` holds).
- A teacher page that reads the database more because students type codes.

## 3. Constraints

- A result is a child's private data. The code has about 887 million values, so the server must limit wrong tries.
- Student writes check their rules inside their SQL statement, never in a check before the write.
- At most 10 ms of CPU and 15 D1 queries per request.
- A new migration runs on the live database before the code reaches `main`.
- All student text is Romanian. Student pages keep the header lockup, "Despre" and the theme button.
- The pages' security policy allows no inline script or style.

## 4. Approaches

1. **A stored code, scoped to the test (chosen).** A new column `submissions.result_code`, unique inside one test. The student types it on the test's page (`/u/<token>`), so a stranger needs the test's link and the code. Wrong tries are counted per test in SQL.
2. **A stored code, global.** A page `mqgrader.ro/cod` takes the code alone. Easier for the student, but the whole internet can guess, so the code must be longer and the limit per IP (a school shares one IP). The user refused it.
3. **A code computed from the result token** (a keyed hash, cut short). No new column, but the lookup must hash every paper of the test on each try, old papers get codes nobody saw, and the tries still need a table. No gain.

For the picture: it is drawn in the browser on a canvas (the PDFs and the CSV are made in the browser too). A server-made image would cost CPU the Functions do not have.

For the screen: design A of the mockup, "the ticket" (the user's pick over B, "the big code", and C, "the three ways"). The screen is the card, so the screenshot and the saved picture look the same.

## 5. The code

- Six characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (31 characters: no 0, O, 1, I, L). Stored without a dash, shown as `K7M-92P`.
- `shared/tests.ts` holds the alphabet, `normalizeResultCode(raw)` (upper case; drops spaces and dashes; null unless six characters of the alphabet) and `formatResultCode(code)`.
- Migration `0034_result_codes.sql`:
  - `ALTER TABLE submissions ADD COLUMN result_code TEXT`.
  - A code for every paper that already has a `result_token` (not a Quick Try's), drawn again where two papers of one test drew the same, before the index.
  - A unique index on `(test_id, result_code)` where `result_code IS NOT NULL`.
  - Two triggers (after an INSERT, and after an UPDATE of `result_token`) give a paper its code whenever it gets its `result_token` and has no code, unless its test is a Quick Try. So every path that makes a link makes its code: the INSERT of `createSubmission`, and the lazy UPDATEs of `confirmResultToken` and `teacherResultToken`. A clash fails the statement on the unique index, and the caller tries again with a new token, as it does today (three tries).
  - A table `result_code_tries (test_id INTEGER PRIMARY KEY, tries INTEGER NOT NULL, since TEXT NOT NULL)`. It has no `teacher_versions` trigger: no teacher page shows it.
- The code comes from SQLite's `random()`, not from the crypto source: it is a short key used only with the test's own link, behind the limit of §6, not a secret on its own.
- A paper whose link is made again keeps its code. A reset deletes the paper, so its code goes with it.
- A Quick Try paper has no code (null).

## 6. The API

- `ConfirmAnswer` gains `resultCode: string | null`.
- `StudentResultView` gains `resultCode: string | null` (null for a Quick Try).
- The teacher's uploads rows gain `resultCode: string | null`, read in the query that already reads `result_token` (no new query).
- New: `POST /api/u/:token/cod`, body `{ code }` (a zod schema in `shared/api.ts`). It stays under the `promoteDue` middleware and the same-origin write check.
  - The test is the one of the link's token (either link of the test). A draft answers 409 `not_started`.
  - One statement takes a try: an upsert on `result_code_tries` that starts a new window when `since` is older than 10 minutes, and adds one only while `tries` is under 10 (`RESULT_CODE_TRIES` and `RESULT_CODE_WINDOW_MINUTES` in `shared/tests.ts`). No row changed: 429 `too_many_tries`, "Prea multe încercări. Încearcă din nou peste câteva minute."
  - Then the lookup: `WHERE test_id = ? AND result_code = ?`. Found: the try is given back (one UPDATE) and the answer is `{ resultToken, resultCode, studentId, studentName }`. Not found, or a code that does not normalise: 404 `unknown_code`, "Codul nu este bun. Verifică fiecare literă și încearcă din nou." A code that does not normalise costs a try too.
  - The route works whether the results are published or not: the result page already says when a result is not published.
- With 30 papers and 10 wrong tries per 10 minutes, a guesser who has the test's link finds some paper with a chance of about 1 in 20 000 per day. Accepted.

## 7. The student pages

### 7.1 The ticket (`src/upload/ResultTicket.tsx`)

One card, as in the mockup:

- A blue band: "Biletul tău pentru rezultat" and the test's title.
- The student's name; the class and the test's code.
- The QR code of the result address, at least 176 px wide, dark on white in both themes (`QRCodeSVG` of `qrcode.react`, level M).
- "Codul tău" and the code, large.
- One line: "Scanează codul QR cu camera. Sau deschide linkul testului și scrie codul."

Under the card:

- "Salvează biletul" (the screen's one filled button): saves the picture (§7.2).
- "Trimite-mi linkul": the phone's share sheet with the address, the title "<student> · <test>" and the text "Codul meu: K7M-92P"; without a share sheet it copies the link and says so; without a clipboard it shows the link. This is the logic of `ResultActions.sendLink`, moved to one shared function.
- "Arată linkul întreg": opens the whole address as text that wraps (`.result-link-url`) with "Copiază linkul". The address is never cut off.
- "Vezi rezultatul", a plain link to the result page.

The ticket replaces `ResultLinkBox` on the "sent" screen, the locked screen, the kept links above the name list and the closed screen. On the "sent" screen it also keeps the line "Rezultatul apare aici după ce profesorul publică rezultatele: …". The test's title comes from the page's link (`LinkInfo.test`), so the phone keeps only the code beside each link (`SavedResultLink.resultCode`). A link kept by an older version of the page has no code: its ticket shows without the code row, and learns the code the first time its result page opens (`rememberResultCode`). It cannot be read before: the result page answers 403 while the results are closed.

### 7.2 The saved picture (`src/upload/ticketImage.ts`)

- A PNG of 1080 × 1350, white in both themes, drawn on a canvas: the MQGrader mark and "MQGrader by Laura Miron", the test's title (two lines at most, then "…"), "<student> · Clasa <class> · <test code>", the QR code, "Codul tău", the code, and the line of §7.1. No grade, no points, no date.
- It waits for the page's font (`document.fonts`) and falls back to the system font.
- The file is named `bilet-<test code>-<student name folded to ASCII>.png`.
- The picture is made once, as soon as the ticket shows, so the tap saves it with no wait: an iPhone opens its share sheet only inside the tap, and refuses it after the waits of drawing. A tap before the picture is ready waits for it; a picture that failed is made again on the tap.
- Saving: on an iPhone or iPad (an iPad that says it is a Mac has a touch screen), the share sheet opens (it has "Save Image"), and the file downloads when the sheet is not possible; everywhere else the file downloads (`saveFile` of `src/admin/pdf/share.ts`). A failure says "Nu am putut salva biletul. Fă o poză ecranului."
- After a save, "Biletul a fost salvat. Îl găsești lângă pozele tale sau în descărcări." shows for a few seconds. A closed share sheet says nothing.

### 7.3 The result page

`ResultActions` gains "Salvează biletul" between "Trimite linkul" and "Descarcă PDF", also before the result is graded. It makes the same picture. A Quick Try's page does not use `ResultActions`, so it has no ticket.

### 7.4 The test's page after the uploads closed (`ClosedScreen`)

- With a kept link: the tickets, then a quiet link "Am alt cod", which opens the field.
- With no kept link: the field at once, in both states (results published or not):
  - "Scrie codul tău", one large field (`autocapitalize="characters"`, `autocomplete="off"`, no spell check; it shows the dash by itself after the third character), and "Vezi rezultatul".
  - A good code keeps the link on this phone (`saveResultLink`, under this link's token, marked `byCode`) and, once the results are published, opens the result page; before that, the page shows the ticket. A link opened with a code never locks the default link (`singleUploadLocked`): a borrowed phone must still send its own paper if the teacher opens the uploads again. A link this phone already keeps for that student stays as it is.
  - A refusal shows the API's message under the field, and the field keeps what was typed.
  - Under it, "Nu știi codul?": "Caută în poze biletul cu codul QR." / "Caută în mesaje linkul pe care ți l-ai trimis." / "Deschide testul pe telefonul cu care ai trimis lucrarea." / "Dacă nu găsești nimic, cere profesorului codul tău."
- The old hint ("Linkul cu rezultatul tău este salvat pe telefonul…") goes: the list says it.
- The field is not shown while the test is open or a draft.

## 8. The teacher pages

- `ResultLinksTable` shows each paper's code beside "Copiază linkul", so the teacher can read it out ("Codul" before it, for screen readers only).
- `ResultsAccess`: the second way's last line becomes "Pe alt telefon, elevul scrie codul de pe biletul lui. Codul fiecărui elev este și în tabelul „Elevii”."
- Nothing else changes. The CSV and the PDFs carry no code.

## 9. Tests

- Shared: the alphabet, `normalizeResultCode`, `formatResultCode`.
- Server: a code is made with the token and is unique in a test; the lazy fill; the code route (right code through each link of the test, wrong code, another test's code, a draft, the limit, the window that opens again, the try given back, the query count).
- Student app: the ticket on each screen, the three buttons with and without share and clipboard, the code field and its refusals, an older kept link, `expectNoGradingWords()` on every new screen, the picture's drawing calls on a fake canvas.
- Teacher app: the code in the links table.

## 10. Calls made by the writer (not asked of the user)

- The limit: 10 wrong tries per test per 10 minutes; a right code does not count. A classmate who types 10 wrong codes closes the field for the whole test for at most 10 minutes; the kept links, the QR codes and the teacher's links still work. Accepted.
- The lazy fill of an old paper's code is one more change of its `submissions` row, so the teacher's page reads once more. Accepted: it happens once per old paper.
- The button is "Salvează biletul", not "Salvează în poze": on Android the file goes to the downloads, which most galleries show as an album, but not all.
- The iPhone opens the share sheet for the picture; other phones download it. Both need a look on real phones before the merge, and so does a scan of a screenshot (light and dark) and of the saved picture.
- The code route works before the results are published.
- The teacher sees the code only in the links table.
- The picture carries the student's name (a shared phone holds several tickets).

## 11. Settled by the prototype

The prototype (2026-11-17) settled what this section once left to the builder: the SQL of the codes and of the try upsert (§5, §6), the ticket's CSS in both themes (a white edge of about four modules around the QR code, for a dark page), the hidden `QRCodeCanvas` the picture is drawn from, and the notes in `src/AGENTS.md` and `server/AGENTS.md`. It was checked in the browser at 375 px and on a desktop, light and dark, and the saved picture was looked at as a file.
