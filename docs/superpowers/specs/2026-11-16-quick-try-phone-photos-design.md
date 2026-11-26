# Quick Try: the student's pages from the phone

Date: 2026-11-16. Source: the owner's request, refined in a brainstorming session with mockups (three variants of the form, two of the QR window, two of the phone page). Decisions marked **(owner)** were made by the owner; decisions marked **(builder call, made in design)** were made while writing this design, for the owner to check; everything under "Left to the builder" is open.

It adds to `docs/superpowers/specs/2026-11-09-quick-try-design.md` and changes none of its rules.

## 1. Why

A teacher tries Quick Try on a laptop, where the test and the barem are. The student's paper is on the desk, on paper. Today the teacher photographs it with the phone, moves the photos to the laptop (email, cable, cloud), then picks them in the form. That is the slowest part of a try, and some give up there.

The app already solves this for students: a QR code opens a page on the phone that takes photos and sends them. Quick Try gets the same way in.

**Success:** on a laptop, the teacher picks "Cu telefonul", presses "Trimite", scans a code, photographs the pages, and starts the grading on the laptop. No file moves between the two devices by hand.

## 2. Goals, non-goals, anti-goals

Goals:

- In the form, the student's pages come from the laptop's files or from the phone, the teacher's choice **(owner)**.
- The phone page works like the student's upload page: "Fă o poză", "Alege fișiere", the list of pages, a last button **(owner)**.
- The phone page has no result link **(owner)**. The result stays on the laptop.
- The laptop sees the pages as they arrive and starts the grading.

Non-goals:

- A result page, a grade or any other part of the try on the phone page.
- Sending the test or the barem from the phone.
- A second, narrower link for the phone (see §6).
- Any change to the limits, to Turnstile, or to what one try may make the robot do.

Anti-goals (a failure even if it works):

- A try used up by a curious click: the try is made only at "Trimite", as today **(owner: the code shows after "Trimite")**.
- A teacher stuck with a try that has no pages because a window closed.
- A phone page that says how the paper is graded. It is the teacher's phone, but the page looks like a student page and may be shown to one.
- A page that reads the database on a timer for as long as it stays open (the D1 read limit, root `AGENTS.md`).

## 3. The flow

All visitor text is Romanian. The words below are the ones of the approved mockups; the builder may adjust a word, not the meaning.

### 3.1 The form: "Lucrarea elevului" (variant 1A, owner)

The row stays as it is and gets a second button:

```
Lucrarea elevului
┌──────────────────────────────────────────────────────────────┐
│ [▣] Alege paginile            [Alege fișierele] [▦ Cu telefonul] │
│     Poze sau PDF, cel mult 20 de fișiere                        │
└──────────────────────────────────────────────────────────────┘
```

- "Alege fișierele" works as today.
- "Cu telefonul" (a QR icon before the words) chooses the phone. The row then shows the chosen state, as a chosen file does (solid border, green icon, a phone in it):

```
│ [▯] Faci pozele cu telefonul                        [Schimbă] │
│     Codul QR apare după ce apeși Trimite                      │
```

- "Schimbă" puts the row back as it was, with both buttons. Picking files also leaves the phone choice.
- With the phone chosen, the form needs no pages: the test and the barem (or "Nu am barem") are still required and checked as today.
- "Cu telefonul" shows only on a screen 768px wide or more **(builder call, made in design)**: on a phone, "Alege fișierele" already offers the camera.
- **Changed after the build (owner, 2026-11-17):** a phone could only pick saved photos. On a phone (`PHONE_MEDIA`: a touch screen under 768px wide, or under 500px high when held sideways) the button is "Fă poze": after "Trimite" the form closes and the same tab opens `/try/<token>/phone?here=1`, the phone page with its camera. With `here=1` that page links to the try ("Deschide încercarea"), shown only while no page is on its way. The try's own page shows a "Fă poze" link there on a phone, in place of its code.

### 3.2 After "Trimite": the QR window (variant 2A, owner)

"Trimite" makes the try and sends the test and the barem (or asks for the generated one), with the same progress lines as today. It sends no page and does not start the grading. The try is kept on the device at once, as today. Then the same window changes its content; it does not close:

```
Fă pozele cu telefonul
Testul și baremul au ajuns. Scanează codul cu camera telefonului
și fotografiază lucrarea elevului.

┌──────────┐   Pagini primite (3)
│          │   ▯ Pagina 1                1,2 MB
│  QR code │   ▯ Pagina 2                1,4 MB
│          │   ▯ Pagina 3                0,9 MB
└──────────┘   • Paginile apar aici imediat ce le trimiți.
Codul merge doar pentru
această încercare.

Alege fișiere de pe calculator        [Închide] [Pornește corectarea]
```

- The code holds the address of the phone page (§3.3).
- The list shows each page the try has, in order, with its size, and its count. Before the first page: "Se așteaptă pozele de pe telefon…".
- "Pornește corectarea" is off until the try has a page. It starts the grading (the call the form makes today after the pages), closes the window, and the card of the try follows it, as after a normal send. A refusal shows in the window, with the link "Deschide încercarea".
- With "Nu am barem" there is no start button **(builder call, made in design)**: the robot's barem must be read first, and that happens on the try's page. The window says "Baremul se face acum din test. Îl citești pe pagina încercării, apoi pornești corectarea de acolo." and its main button is "Deschide încercarea". The code and the list are the same.
- "Alege fișiere de pe calculator" sends files from the laptop into the same list (the way out when the phone fails).
- "Închide" closes the window. Nothing is lost: the card of the try says the grading has not started, and the try's page has the code (§3.4). Esc closes it too, except while a send runs.
- The list has no delete on the laptop **(builder call, made in design)**: the phone page and the try's page delete.

### 3.3 The phone page (variant 3A, owner)

Address: `/try/<token>/phone` (first built as `/try/<token>/telefon`, which now redirects there), a page of the try's app. It has the header of the try's page (the lockup, the theme button) and one column:

```
Lucrarea elevului
<the try's name>

▸ Cum faci poze bune
[ 📷 Fă o poză     ]
[ ⬆ Alege fișiere ]
Poze JPG, PNG sau PDF, cel mult 20 de fișiere.

Paginile (3)
▯ pagina-1.jpg   Încărcat      [Șterge]
▯ pagina-2.jpg   Încărcat      [Șterge]
▯ pagina-3.jpg   Încărcat      [Șterge]

[ Am terminat ]
```

- It behaves like the student's upload screen: photos are made smaller on the phone, sent one at a time in the order picked, each with its progress, its preview, "Încearcă din nou" after a failure and "Șterge". The same file rules (`shared/files.ts`).
- The pages the try already has show when the page opens, also the ones sent from the laptop.
- "Am terminat" is on once every page is sent. It asks nothing and writes nothing on the server **(builder call, made in design)**: the laptop is in charge, and it already sees the pages. It shows the last screen:

```
        ✓
  Paginile au ajuns
3 pagini sunt pe calculator.
     Continuă acolo.
  [ Mai adaugă pagini ]
```

- No result link, no grade, no link to the try's page.
- Once the grading has started, the page takes no page and deletes none: it shows the pages and says "Lucrarea a fost trimisă. Nu mai poți schimba paginile." A page refused at that moment shows the server's message.
- An expired or unknown link shows the try app's own notices.
- The page's text passes `expectNoGradingWords()`.

### 3.4 The try's page (step 4, owner)

In "Lucrarea elevului" of `Prepare`, next to "Adaugă pagini", a second quiet button "Fă poze cu telefonul" (a phone icon). It opens, under the buttons, the same code with "Scanează codul cu camera telefonului" and "Paginile apar în lista de mai sus imediat ce le trimiți. Codul merge doar pentru această încercare." A second press closes it. While it is open, the list of pages above reads again as in §5.

`src/AGENTS.md` says the try's page never shows a QR code: that line changes to "never the test's upload link; the only code is the one of its own phone page".

## 4. Approaches

How the phone reaches the try:

1. **The code shows after "Trimite", and holds the try's own link (chosen, owner).** The try exists by then, and its link already takes pages (`PUT /api/try/<token>/paper`). No new table, no migration, no new server route. A try is used only by a real send.
2. The code shows in the form at once. The try would be made when "Cu telefonul" is pressed, so a curious click would use one of the day's tries. Refused by the owner.
3. A second token only for the phone, stored hashed, that opens only the pages' routes. Safer in theory, but it needs a migration and new routes, and the try's link is already its only key, shared on purpose (Quick Try spec §3.4). Not worth it for a demo that lives 7 days.

## 5. Constraints

- The server is unchanged if possible: the phone page and both lists use `GET`, `PUT` and `DELETE /api/try/<token>/paper` and the test read already on the allow-list. If the builder finds a needed change, it follows `server/AGENTS.md` (rules inside the write's SQL, at most 15 queries).
- Reading on a timer **(builder call, made in design)**: the QR window and the open code of §3.4 read the pages again every 3 seconds, only while they show and the tab is visible, and stop after 15 minutes with no new page; a button "Verifică din nou" then reads once and starts the timer again. Nothing else in this design reads on a timer.
- The landing page has no React and its security policy allows no inline script or style (`landing.test.ts`). The code there is drawn as SVG elements made by script.
- `/try/*` is already noindex and closed to crawlers, and `_redirects` already serves the try's app for `/try/<token>/phone`.
- No student-facing word about how the work is graded (§3.3).
- Tests for every new behaviour, happy path and edge cases; the whole suite before a push.

## 6. What the owner should know

- The code holds the try's full link. Whoever photographs the laptop's screen at that moment can open the try, as with a shared link. This is the rule Quick Try already has.
- The phone page is heavier to load than the student page if it ships with the try's app; see "Left to the builder".

## 7. Left to the builder

- **How the phone page reuses the student's upload screen.** `src/upload/UploadScreen.tsx` holds the queue, the shrink, the previews and the list. Preferred: one shared component used by both pages (the heading, the last button and the calls given by the page), so the two never drift; the student page's tests must stay green unchanged in meaning.
- **What the phone page reads when it opens:** the try (`GET /api/try/<token>`), its test for the name and for whether the grading has started (`phaseOf`), and its pages. All three calls exist.
- **Upload progress** on the phone needs `XMLHttpRequest` (`src/upload/api.ts` has it); the try's client uses `fetch`.
- **The QR drawing on the landing page.** `qrcode.react` is React only. A small QR library with no dependencies, or another way that keeps React off the landing page. Check the library's current documentation before choosing.
- **Loading.** Whether the phone page is split from the rest of the try's app so a phone loads less.
- **The form's markup.** The row is a `<label>` around the file input today; a second real button needs care with the label and the keyboard.
- Exact Romanian wording, and the icons (the project's `ActionIcon` verbs).
- The updates to the root `AGENTS.md` (Quick Try rule) and `src/AGENTS.md` (`landing/quickTry/`, `try/`).

## 8. Changed (2026-11-26): the test and the barem from the phone too

The owner asked that the test and the barem can come from the phone as well, and that one QR code takes every part the teacher marked for the phone. This reverses the non-goal "Sending the test or the barem from the phone" (§2). The owner picked design B of the mockups (`.superpowers/mock/quick-try-phone/`).

- **The form.** The test and the pages have a round segmented choice in their step's head: "Fișier" / "Telefon" ("Fă poze" on a phone) (native radios `testFrom`, `pagesFrom`). Under the head only the chosen way shows: the file tile, or a grey tile "Faci pozele cu telefonul, după ce apeși Trimite". The barem is made from the test (owner, 2026-11-26: most who try have no barem ready, and a quick try should ask for little): its step shows one grey tile, "Baremul se face din test · Îl găsești pe pagina încercării.", with the link "Am baremul meu". The link shows the barem's own "Fișier" / "Telefon" choice (`baremFrom`, whose hidden first radio `robot` is the default), and "Nu am barem: îl fac din test" goes back. "Am totul pe hârtie" (`aria-pressed`) puts the test and the pages on the phone; her own barem goes there too, the barem made from the test stays. A second press puts the test and the pages back on "Fișier" and a photographed barem back on the one made from the test. A file picked or dropped for a part takes that part to "Fișier". Choosing the phone forgets the file picked for that part. With one or two parts on the phone, a line above the send says "Un singur cod QR pentru …". A send puts every part back on its first choice.
- **The send.** It makes the try and sends only the parts that are files. It starts the grading only when nothing comes from the phone. With "Nu am barem" and the test from the phone, the barem is asked for after the test arrives (`asksBaremAfterTest` in `shared/quickTry.ts`): by the phone page, or by the QR window when the test is picked on the laptop there. A try with a test from the phone keeps the default name (`QUICK_TRY_TITLE`).
- **The address.** The phone page's address names the parts in English: `?parts=test,marking-scheme,pages` (`quickTryPhonePath`, `parsePhoneParts`). With the pages alone it keeps its old address. Without `parts` (the code of the try's page) the page takes what the try misses, and always the pages (`phonePartsOf`). The query string holds no secret, so the visit counter may see it.
- **The QR window.** When the test or the barem comes from the phone, the window has a row for each of them: from the laptop, waiting (with "Alege de pe calculator"), made from the test, or arrived. It reads the test only while a row waits. The start stays off until the test, the barem and a page are there.
- **The phone page.** With more than the pages it is a wizard, Testul → Baremul → Lucrarea, with a bar of the steps on top. The photos of the test or the barem stay on the phone, in the order taken (a phone's camera names them all alike), and "Trimite testul și continuă" sends them once as one PDF: each send is one of the try's file changes (`QUICK_TRY_FILE_CHANGES`). One PDF or Word file can be chosen instead. A part that arrived says so, with "Fă din nou pozele" while changes are left, and "Înapoi" goes to the step before. With the pages alone the page is as before.
- **The try's page.** While its phone code shows and the test or the barem is missing, it reads the test again too, so a part sent from the phone shows there.
- **No server change.** The phone page uses the test file and barem routes already on the try's allow-list.
