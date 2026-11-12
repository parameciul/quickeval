# The student's result page: header, layout, sharing (design)

Date: 2026-11-11. Status: approved in chat, waiting for the written review.

## 1. Why

A student opens the result page (`/u/rezultat/<token>`, `src/upload/ResultApp.tsx`) and often shows it to a parent. Today the page is a plain column that grows to 70rem on a desktop, with only the MQGrader mark and name in the header, no dark theme and no way to learn what MQGrader is.

The page now has two jobs:

1. Show the student's result clearly, on a phone and on a desktop, so a parent understands it at a glance and can keep it.
2. Let a parent find MQGrader: who makes it (Laura Miron) and the site, mqgrader.ro, so they can tell other teachers about it.

## 2. Goals

- The header of the full site (mqgrader.ro): the mark, "MQGrader" with "by Laura Miron" under it, a "Despre" link and the theme button.
- A dark theme, switched by the same button as on the site.
- A desktop layout that is not full width, with two columns.
- A way to send the result link and to download the result as a PDF.
- A clean printed page.
- The same header on the upload page (`/u/<token>`, `src/upload/UploadApp.tsx`).

## 3. Non-goals and anti-goals

- No explanation text, no invitation to teachers, no "try MQGrader" box on the student pages. The links are the only way to the site (the user's words: a link "without other explanations and texts").
- The student pages themselves still carry no word that says how the work is graded (`expectNoGradingWords()` stays on every screen). The user accepts that the linked site (mqgrader.ro, `/despre/`) explains it.
- No new data about grading on the page: no confidence, no review reasons, no model.
- No change to the teacher app, apart from moving shared code (see §7).

## 4. Rule change

The root `AGENTS.md` says: "Student pages show only the MQGrader mark and name in their header: no other brand text, no invitation to teachers, no link". The user changed this rule. The new rule, to write in `AGENTS.md` (and in `src/AGENTS.md` where it repeats it):

> Student pages show the site's header lockup ("MQGrader" with "by Laura Miron"), a "Despre" link to https://mqgrader.ro/despre/ and the theme button; the mark and name link to https://mqgrader.ro/. The result page's footer has one link, "mqgrader.ro". No other brand text, no invitation to teachers, and no word on the page that says how the work is graded.

## 5. What the user decided

### 5.1 Header (both student pages)

- Looks like the landing page's header (`index.html` `.site-top`, `src/landing/landing.css`): the mark, then "MQGrader" over "by Laura Miron" (stacked, `.words` style: 17px bold name, 11.5px muted line), then on the right a nav with "Despre" (muted grey, 15px, weight 500, like the site's nav links) and the theme button.
- A click on the mark or the name opens mqgrader.ro.
- "Despre" opens the site's `/despre/` page.
- There is no "mqgrader.ro" text link in the header.
- On a phone, "by Laura Miron" is hidden, as on the site (the site hides it under its narrow breakpoint).

### 5.2 Footer (result page)

- One link: "mqgrader.ro". No "Despre", no other text. (The user removed "Despre" from the footer.)

### 5.3 Desktop layout: layout B

- On a desktop the page takes the full width of the window, with 2rem side margins like the teacher pages, so the exercises table has room (first 64rem, then 96rem, then no cap: the table was still crowded). The right column is 18-24rem wide; the table takes the rest.
- Top: the class and test code line, the student's name, the test title.
- Then the grade first, in a big card: the grade large, with "N puncte din M" and the office points line as today.
- Then two columns: the exercises table on the left (wider, about 1.6 : 1), and on the right "Rezumat", "Ce ai lucrat bine" and "Recomandări", each in its own card.
- The files ("Fișiere (n)" with "Arată fișierele") move to the end of the page.
- On a phone (and any narrow screen) it is one column, in this order: grade, exercises (the existing phone card form of the table), summary, what went well, recommendations, files.

### 5.4 Dark theme

- The theme button of the site, on both student pages. It uses the app's existing theme code (`src/ui/ThemeButton.tsx`, `useTheme.ts`, `theme.ts`, and `/theme.js` that `u/index.html` already loads). The choice is shared with the rest of the site, as it is today between the landing page and the teacher app.

### 5.5 The extras the user accepted ("do all")

1. **"Trimite linkul"**: a button on the result page. On a phone it opens the share sheet (Web Share API, `navigator.share({ url, title })`); where that is not possible, it copies the link and says so ("Linkul a fost copiat."). The link is the page's own address.
2. **"Descarcă PDF"**: a button on the result page that makes the student's PDF in the browser, the same PDF the teacher gives (`src/admin/pdf/studentPdf.ts`), and saves it. It shows only when the result is graded.
3. **Print**: printing the page hides the header buttons, the share and PDF buttons, the files and the footer; the content prints in one column.
4. **Same header on the upload page**: `UploadApp.tsx` gets the header of §5.1. It gets no footer and no share or PDF button (it has no result).

## 6. Constraints

- All text is Romanian. Button labels: "Trimite linkul", "Descarcă PDF", "Despre", "mqgrader.ro". Theme button labels as `ThemeButton` has them.
- `expectNoGradingWords()` must still pass on every student screen, with the new header, footer and buttons. "MQGrader" passes it.
- The student's PDF stays made from `StudentPdfInput` only (no confidence, no review reason).
- Dark colours: any new colour goes in both dark blocks of `src/ui/brand.css` (`brand.test.ts` checks that they match). Flat styles: no gradients; a shadow only on what floats.
- Buttons are at least a finger's size on a phone (the existing `.upload-page .button-small` rule).
- The links are absolute (`https://mqgrader.ro/`, `https://mqgrader.ro/despre/`), because student links are also opened on the old host quickeval.pages.dev, whose pages are noindex.
- The links open in the same tab (the result link is kept in the browser's history and in the student's saved links).
- `StudentResult.tsx` is also used by the Quick Try page (`src/try/Graded.tsx`). The new layout must still look right there (it sits inside the teacher app's page), or the layout change must stay in the student page only.
- Tests: the existing tests of `ResultApp`, `StudentResult`, `UploadApp` and the try page keep passing; new tests cover the header links, the theme button, the footer, share (share sheet, copy fallback, cancel), the PDF button (shown only when graded, the input it builds) and the grading-words check on each screen.

## 7. Left to the builder

- The PDF's date: `StudentResultView` has no date. Builder's call (mine): add the upload's date (`submittedAt`) to `StudentResultView` in `shared/api.ts` and in the server's student result query, so the PDF shows the date as the teacher's does; if that costs a query, pass `date: null`.
- Pending items: `StudentResultView` has no "pending" flag, because the student sees only published results. Map every item with `pending: false`.
- Where the shared PDF code lives: the student app may import from `src/admin/pdf/` or the code may move to a shared folder (for example `src/ui/pdf/`). Builder's call; pdfmake must stay a lazy import so the student page stays small.
- How "Trimite linkul" reports the copy (a short status line or the button text for a moment).
- The exact breakpoint where the two columns become one, and where "by Laura Miron" hides (match the site's).
- Whether the result page's header becomes a shared component for both student pages (likely yes).
- The page `<title>` of the result page, if it should change from the upload page's.

Calls I made while checking this document as a builder (the user can change them):

- "Trimite linkul" and "Descarcă PDF" sit together under the student's name and test title (to the right of them on a desktop). "Trimite linkul" shows as soon as the page has loaded, even before the result is graded; "Descarcă PDF" only when it is graded.
- The two buttons belong to the result page (`ResultApp.tsx`), not to `StudentResult.tsx`, so the Quick Try page does not get them. The new layout (grade card, two columns, files at the end) is in `StudentResult.tsx` and so applies to the Quick Try page too.
- The page prints in the light colours, whatever theme is on.

## 8. Mockups

The chosen mockup is in `.superpowers/brainstorm/1127-1794349320/content/layout-v2.html` (local only, gitignored). The footer there still shows "Despre"; §5.2 wins.
