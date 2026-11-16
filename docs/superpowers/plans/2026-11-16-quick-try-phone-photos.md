# Quick Try: Pages From The Phone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Quick Try on a laptop, the teacher chooses "Cu telefonul", and after "Trimite" a QR code opens a phone page that sends the student's pages to the try.

**Architecture:** No server change: the try's link already takes pages (`GET`/`PUT`/`DELETE /api/try/<token>/paper`). The student's upload screen is split into a shared uploader, which a new page of the try's app (`/try/<token>/telefon`) reuses. The landing form (no React) gets a phone choice and a second panel in its dialog with the code and a watched list of pages; the try's page gets the same code in `Prepare`.

**Tech Stack:** TypeScript, React 19 (try and student apps), plain DOM script (landing), Vitest + Testing Library, `qrcode.react` (try's page), `uqr` (landing page, new dependency, no dependencies of its own).

**Spec:** `docs/superpowers/specs/2026-11-16-quick-try-phone-photos-design.md`. Read it first, and the root `AGENTS.md` and `src/AGENTS.md`.

## Global Constraints

- All visitor text is Romanian; code, comments and docs are English. Comments name no ticket or issue.
- Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties.
- The landing page has no React, no inline script and no inline style (`src/landing/landing.test.ts`). SVG is built with DOM calls.
- No server file changes. If one seems needed, stop and report.
- The phone page's text passes `expectNoGradingWords()`.
- Styles are flat: no gradients; a shadow only on what floats. Buttons: `.btn` on the landing page; `.button` / `.button-quiet` with an `ActionIcon` in the React apps. Dark colours in `src/ui/brand.css` are written twice: keep both copies equal.
- Reading on a timer: every 3 s (`PHONE_REFRESH_MS`), only while the code shows and the tab is visible, stopping after 15 minutes with no new page (`PHONE_IDLE_MS`), then "Verifică din nou".
- "Cu telefonul" shows only at 768px or wider.
- Commits: explicit paths (never `git add -A`), no AI attribution lines.
- Before Task 1: the worktree has no `node_modules`. Run `npm ci`, then `npm approve-scripts workerd esbuild`.

## Review Focus

1. The grading starts on the laptop while the phone still sends: the refused page shows the server's message with no retry button, and the phone page turns read-only at its next read (Task 2).
2. The laptop and the phone together pass 20 files: the refused page shows "Poți trimite cel mult 20 de fișiere." and the pages after it are still tried (Task 1, existing queue rule; Task 2 test).
3. A read of the pages fails while the laptop watches: the list keeps the last pages it had and the next tick reads again; no error replaces the code (Task 5, Task 3).
4. The QR library cannot load: the window shows the phone page's address as text that wraps, so the pages can still be sent (Task 5).
5. The window closes or the tab hides: no read happens after that (Task 5).

## File Structure

- `src/upload/PagesUploader.tsx` (new): the queue, shrink, previews, list and last button, with no knowledge of students or tries.
- `src/upload/UploadScreen.tsx`: becomes a thin wrapper of `PagesUploader` for the student app.
- `src/upload/api.ts`: exports the XHR upload helper.
- `src/try/api.ts`: `uploadPage`, `pageBlob`.
- `src/try/PhonePage.tsx` (new), `src/try/PhoneCode.tsx` (new), `src/try/usePagesWatch.ts` (new).
- `shared/quickTry.ts`: `quickTryPhonePath`, `PHONE_REFRESH_MS`, `PHONE_IDLE_MS`.
- `src/landing/quickTry/qr.ts` (new), `watch.ts` (new), `phone.ts` (new: the QR window), and changes in `send.ts`, `api.ts`, `ui.ts`, `index.html`, `src/landing/landing.css`.

---

### Task 1: The shared pages uploader

**Files:**
- Create: `src/upload/PagesUploader.tsx`, `src/upload/PagesUploader.test.tsx`
- Modify: `src/upload/UploadScreen.tsx`, `src/upload/api.ts`, `src/try/api.ts`, `src/try/api.test.ts`, `src/test/fakeTryApi.tsx`

**Interfaces:**
- Produces, in `src/upload/PagesUploader.tsx`:

```ts
export interface PagesApi {
  uploadFile(file: Blob, name: string, onProgress: (sent: number) => void): Promise<SubmissionFile>;
  deleteFile(fileId: number): Promise<void>;
  fileBlob(fileId: number): Promise<Blob>;
}
export function PagesUploader(props: {
  pages: PagesApi;
  files: SubmissionFile[];          // already on the server when the screen opens
  heading: ReactNode;               // the student's <h2>, or the phone page's heading
  listTitle: string;                // "Paginile tale" | "Paginile"
  finishLabel: string;              // "Am trimis tot" | "Am terminat"
  onFinish: (fileCount: number) => Promise<void> | void;
  onLost?: (message: string) => void; // a 401 from any call
  shrink?: (file: File) => Promise<Blob>;
}): JSX.Element;
```

- Produces, in `src/upload/api.ts`: `export function putFile(request: UploadRequest, url: string, file: Blob, name: string, onProgress: (sent: number) => void, headers?: Record<string, string>): Promise<SubmissionFile>` (the body of today's inner `upload`, which then calls it).
- Produces, in `src/try/api.ts` on `TryApi`: `uploadPage(file: Blob, name: string, onProgress: (sent: number) => void): Promise<SubmissionFile>` (XHR `PUT {base}/paper` through `putFile`; `createTryClient` takes `newRequest?: () => UploadRequest` in its options) and `pageBlob(fileId: number): Promise<Blob>` (`GET {base}/paper/<id>`; a refusal throws its `ApiError`).

- [ ] **Step 1: Run the student screen's tests as the baseline.** Run: `npx vitest run src/upload/UploadScreen.test.tsx`. Expected: PASS. These tests must pass unchanged at the end of the task: they prove the split.

- [ ] **Step 2: Write the failing tests** in `src/upload/PagesUploader.test.tsx`, with a fake `PagesApi` (`vi.fn`):
  - `shows the heading, the list title with its count, and the finish label` (given `listTitle: 'Paginile'`, `finishLabel: 'Am terminat'`, two `files`: heading "Paginile (2)", a button "Am terminat" that is enabled).
  - `sends picked files one at a time in order and calls onFinish with the count` (pick two photos; `uploadFile` called twice in order; click the finish button; `onFinish` called with `2`).
  - `shows a refused page's message and still sends the next page` (first `uploadFile` rejects with `new ApiError(409, 'too_many_files', 'Poți trimite cel mult 20 de fișiere.')`; the message shows; the second file is sent).
  - `shows no retry button for a page the server refused for good` (a 409 answer: no "Încearcă din nou"; a status 0 network error: "Încearcă din nou" shows).
  - `calls onLost for a 401 and sends nothing after it`.
  - `shows what onFinish throws as a notice and enables the button again`.

- [ ] **Step 3: Run them.** Run: `npx vitest run src/upload/PagesUploader.test.tsx`. Expected: FAIL (the module does not exist).

- [ ] **Step 4: Move the screen's body into `PagesUploader`.** Everything of `UploadScreen` moves except the student-only parts. One behaviour change, for both apps: a page that fails with an `ApiError` whose status is 4xx other than 401 gets `canRetry: false` (today every failed send can be retried, which loops on a closed paper). `UploadScreen` keeps its props and becomes: a `PagesApi` built from `(api, token, session.secret)`, `heading={<h2>{session.studentName}</h2>}`, `listTitle="Paginile tale"`, `finishLabel="Am trimis tot"`, and an `onFinish` that asks `window.confirm('Ești sigur? După confirmare nu mai poți schimba nimic.')`, calls `api.confirm`, `forgetSecret`, then `onSent`.

- [ ] **Step 5: Add `putFile`, `uploadPage` and `pageBlob`**, their fakes in `createFakeTryApi` (`uploadPage` stores like `addPage` and calls `onProgress(1)`; `pageBlob` answers `new Blob(['jpg'], { type: 'image/jpeg' })`), and two tests in `src/try/api.test.ts`: `uploadPage puts the file to the try's paper with its name and reports progress`, `pageBlob throws the API's error for a missing page`.

- [ ] **Step 6: Run.** Run: `npx vitest run src/upload src/try/api.test.ts`. Expected: PASS, `UploadScreen.test.tsx` included with no edit other than, at most, the retry expectation for a 4xx failure.

- [ ] **Step 7: Commit.** `git add src/upload/PagesUploader.tsx src/upload/PagesUploader.test.tsx src/upload/UploadScreen.tsx src/upload/api.ts src/try/api.ts src/try/api.test.ts src/test/fakeTryApi.tsx` and commit "Split the student upload screen into a shared pages uploader".

---

### Task 2: The phone page of a try

**Files:**
- Create: `src/try/PhonePage.tsx`, `src/try/PhonePage.test.tsx`
- Modify: `shared/quickTry.ts`, `shared/quickTry.test.ts` (or the file that tests it), `src/try/TryApp.tsx`, `src/try/TryApp.test.tsx`, `src/try/try.css`

**Interfaces:**
- Consumes: `PagesUploader`, `PagesApi` (Task 1); `TryApi.uploadPage`, `pageBlob`, `deletePage`, `listPages`; `useApi().getTest(code)`; `phaseOf` of `src/try/phase.ts`.
- Produces, in `shared/quickTry.ts`: `export function quickTryPhonePath(token: string): string` returning `/try/<token>/telefon`; `export const PHONE_REFRESH_MS = 3000`; `export const PHONE_IDLE_MS = 15 * 60 * 1000`.
- Produces: `export function PhonePage({ info, tryApi }: { info: QuickTryInfo; tryApi: TryApi })`, mounted at `<Route path="/telefon" …>` in `TryLoader`.

- [ ] **Step 1: Write the failing tests** in `src/try/PhonePage.test.tsx` (render through `TryRoutes` at `/telefon` with `createFakeTryApi` and `tryAdminApi`, as `TryApp.test.tsx` does):
  - `shows the heading, the try's name and the two pick buttons`: an `h1` "Lucrarea elevului", the test's title, "Fă o poză", "Alege fișiere".
  - `lists the pages the try already has`: with two `pages`, "Paginile (2)".
  - `sends a photo and then shows the last screen after "Am terminat"`: heading "Paginile au ajuns", "1 pagină este pe calculator." (use `countLabel` for the plural: "3 pagini sunt pe calculator."), "Continuă acolo.", and a button "Mai adaugă pagini" that brings the uploader back.
  - `has no link to a result or to the try's page` on both screens: no element with role `link` inside `main`.
  - `is read only once the paper is sent`: with `tryTest({ status: 'evaluating' }, { status: 'submitted' })`: "Lucrarea a fost trimisă. Nu mai poți schimba paginile.", the pages listed, no "Fă o poză", no "Șterge".
  - `turns read only when a page is refused because the paper was sent`: `uploadPage` rejects with `new ApiError(409, 'paper_sent', 'Lucrarea a plecat deja la corectare.')`; the message shows on that page; the test query is invalidated and, with the fake test changed to submitted, the read-only line shows.
  - `says no word about how the work is checked`: `expectNoGradingWords()` on the uploader, the last screen and the read-only state.
  - In `src/try/TryApp.test.tsx`: `shows the expired notice at /telefon for an expired try`.
  - In the shared test: `quickTryPhonePath('abc')` is `/try/abc/telefon`.

- [ ] **Step 2: Run them.** Run: `npx vitest run src/try/PhonePage.test.tsx`. Expected: FAIL (no route: the page redirects to `/`).

- [ ] **Step 3: Build `PhonePage`.** It reads the test (`['test', info.code]`, the key the try's page uses) and the pages (`['try', 'pages']`). Open (`phaseOf(detail) === 'prepare'`): `PagesUploader` with `heading` = the `h1` and the try's name under it, `listTitle="Paginile"`, `finishLabel="Am terminat"`, a `PagesApi` over `tryApi` (`deleteFile` → `deletePage`), and `onFinish` that shows the last screen with the count. A page refused with code `paper_sent` invalidates `['test', info.code]`. Otherwise: the read-only list and line. The last screen's count comes from `onFinish`'s argument. No `window.confirm` anywhere.

- [ ] **Step 4: Style** in `src/try/try.css`: the page is one column, `max-width: 30rem`, centred, with the try page's side padding; the last screen is centred with its tick in a round `--ok-bg` block. Reuse the uploader's classes from `brand.css` as they are.

- [ ] **Step 5: Run.** Run: `npx vitest run src/try shared`. Expected: PASS.

- [ ] **Step 6: Commit.** Explicit paths; message "Add a try's phone page that sends the student's pages".

---

### Task 3: The code on the try's page

**Files:**
- Create: `src/try/PhoneCode.tsx`, `src/try/usePagesWatch.ts`, `src/try/usePagesWatch.test.ts`
- Modify: `src/try/Prepare.tsx`, `src/try/Prepare.test.tsx`, `src/try/TryHome.tsx` (passes `token`), `src/try/try.css`, `src/ui/ActionIcon.tsx` (a `phone` icon, if none exists)

**Interfaces:**
- Consumes: `quickTryPhonePath`, `PHONE_REFRESH_MS`, `PHONE_IDLE_MS`.
- Produces: `export function usePagesWatch(open: boolean, pageCount: number, now?: () => number): { interval: number | false; idle: boolean; again(): void }`: `interval` is `PHONE_REFRESH_MS` while `open` and not idle; `idle` turns true `PHONE_IDLE_MS` after the later of opening and the last change of `pageCount`; `again()` starts the clock anew. `Pages` passes `interval` as its query's `refetchInterval` (React Query already pauses it in a hidden tab).
- Produces: `export function PhoneCode({ token }: { token: string })`: a `QRCodeSVG` of `window.location.origin + quickTryPhonePath(token)` (level `M`, 150px, `title="Cod QR pentru telefon"`), with the two lines of spec §3.4.
- `Prepare` gets a new prop `token: string`.

- [ ] **Step 1: Write the failing tests.**
  - `usePagesWatch.test.ts` (fake clock through `now`): `reads every 3 s while open`, `is off while closed`, `goes idle 15 minutes after the last new page`, `a new page count pushes the idle time back`, `again() starts it anew`.
  - `Prepare.test.tsx`: `opens and closes the phone code` (button "Fă poze cu telefonul", `aria-expanded`; the code's title and "Scanează codul cu camera telefonului" show, then go); `shows a page that arrives while the code is open` (add to the fake's `pages`, advance time by 3 s, "Pagina 1: …" shows); `shows "Verifică din nou" once idle and reads again on it`; `reads nothing on a timer while the code is closed` (`listPages` call count stays after 10 s).

- [ ] **Step 2: Run them.** Run: `npx vitest run src/try/usePagesWatch.test.ts src/try/Prepare.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** the hook, `PhoneCode`, and the second quiet button beside "Adaugă pagini" in `Pages`. The opened block sits under the buttons: the code on the left (white ground also in the dark theme, so a phone reads it), the two lines on the right; below 40rem the code goes above the lines.

- [ ] **Step 4: Run.** Run: `npx vitest run src/try`. Expected: PASS.

- [ ] **Step 5: Commit.** Explicit paths; message "Show the phone page's QR code on a try's page".

---

### Task 4: The phone choice in the landing form

**Files:**
- Modify: `index.html`, `src/landing/landing.css`, `src/landing/quickTry/send.ts`, `src/landing/quickTry/send.test.ts`, `src/landing/quickTry/ui.ts`, `src/landing/quickTry/ui.test.ts`

**Interfaces:**
- Produces, in `send.ts`: `TryForm.byPhone: boolean`. `formProblem` asks for no pages when `byPhone`. `sendTry` with `byPhone` makes the try, sends the test, sends the barem or asks for the generated one, and returns: it sends no page and never calls `api.start`.
- Produces, in `index.html`: in the pages row, a real `<button type="button" class="btn btn-small" data-try-phone-pick>` "Cu telefonul" (a QR icon before the words) outside the `<label>`'s click path, and the row's chosen state driven by `ui.ts`: name "Faci pozele cu telefonul", hint "Codul QR apare după ce apeși Trimite", action "Schimbă" (`data-try-phone-undo`).
- Produces, in `ui.ts`: `formValues()` fills `byPhone`; after a `byPhone` send the dialog stays open and calls `openPhoneStep` (Task 5). Until Task 5 exists, this task ends the send as today (close the dialog and follow the card).

- [ ] **Step 1: Write the failing tests.**
  - `send.test.ts`: `needs no pages when the pages come from the phone`; `still needs the test and a barem choice with the phone`; `with the phone, sends the test and the barem, no page, and does not start`; `with the phone and no barem, asks for the generated barem and does not start`.
  - `ui.test.ts`: `"Cu telefonul" marks the row as chosen and "Schimbă" puts it back`; `picking files after choosing the phone leaves the phone choice` (the row shows "2 pagini"); `choosing the phone forgets picked files` (`addPage` is not called on send); `sends with the phone and keeps the try on the device`.
  - `landing.test.ts` already checks the page's policy: run it, it must stay green.

- [ ] **Step 2: Run them.** Run: `npx vitest run src/landing`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** The row keeps its `data-try-pick` label for the file input; the box holds both buttons (`.try-pick-acts`). Keyboard order: the file input, then "Cu telefonul". CSS: the hint may wrap to two lines in this row; `[data-try-phone-pick]` is `display: none` below 768px; the chosen state reuses `.is-chosen` with a phone icon.

- [ ] **Step 4: Run.** Run: `npx vitest run src/landing`. Expected: PASS.

- [ ] **Step 5: Commit.** Explicit paths; message "Let the Quick Try form take the pages from the phone".

---

### Task 5: The QR window on the landing page

**Files:**
- Create: `src/landing/quickTry/qr.ts`, `qr.test.ts`, `watch.ts`, `watch.test.ts`, `phone.ts`, `phone.test.ts`
- Modify: `package.json`, `package-lock.json` (`npm install uqr`), `index.html`, `src/landing/landing.css`, `src/landing/quickTry/api.ts`, `api.test.ts`, `ui.ts`, `ui.test.ts`

**Interfaces:**
- Consumes: `quickTryPhonePath`, `PHONE_REFRESH_MS`, `PHONE_IDLE_MS`; `TryForm.byPhone`.
- Produces, in `api.ts` on `LandingApi`: `listPages(token: string): Promise<SubmissionFile[]>` (`GET /api/try/<token>/paper`).
- Produces, in `qr.ts`: `export async function drawQr(svg: SVGSVGElement, text: string): Promise<void>`: loads `uqr` with a dynamic `import()`, encodes at level `M`, sets the `viewBox` with a 2-cell quiet zone and appends one white `<rect>` and one `<path>` of the dark cells (attributes only, no `style`). It rejects when the library cannot load. Read `node_modules/uqr/README.md` for the encoder's exact call and result before writing it.
- Produces, in `watch.ts`:

```ts
export interface PagesWatch { stop(): void; again(): void }
export function watchPages(options: {
  read: () => Promise<SubmissionFile[]>;
  onPages: (pages: SubmissionFile[]) => void;
  onIdle: () => void;
  isVisible: () => boolean;         // document.visibilityState === 'visible'
  refreshMs?: number;               // PHONE_REFRESH_MS
  idleMs?: number;                  // PHONE_IDLE_MS
  now?: () => number;
}): PagesWatch;
```

  It reads at once, then every `refreshMs`; a tick in a hidden tab reads nothing; a failed read is ignored and the next tick reads again; after `idleMs` with no change in the number of pages it calls `onIdle` and stops; `again()` restarts it; after `stop()` nothing runs and a read that returns late does not call `onPages`.
- Produces, in `phone.ts`: `export function openPhoneStep(root: ParentNode, deps: { api: LandingApi; origin: string; drawQr: typeof drawQr; refreshMs?: number }, stored: StoredTry, options: { robotBarem: boolean; onStarted(): void; onClosed(): void }): { close(): void }`.
- Produces, in `index.html`: a second block in the dialog, `data-try-phone`, hidden until used, with `h2#try-phone-title` "Fă pozele cu telefonul", the lede, `svg[data-try-qr]`, `[data-try-qr-link]` (the address as text, hidden unless the code failed), "Codul merge doar pentru această încercare.", the list `[data-try-phone-list]` with its count, the waiting line, `[data-try-phone-idle]` with "Verifică din nou", the hidden file input of "Alege fișiere de pe calculator", an error line (`role="alert"`), and the actions "Închide", "Pornește corectarea" and the link "Deschide încercarea".

- [ ] **Step 1: Install.** Run: `npm install uqr`. Expected: `package.json` gains `uqr`, the lock changes, no install script runs.

- [ ] **Step 2: Write the failing tests.**
  - `watch.test.ts` (fake timers): `reads at once and then every 3 s`; `skips a tick while the tab is hidden`; `keeps the last pages when a read fails and reads again at the next tick`; `calls onIdle after 15 minutes with no new page and stops`; `again() starts it anew`; `reads nothing after stop()`; `ignores a read that answers after stop()`.
  - `qr.test.ts`: `draws a white ground and one path of cells, with no style attribute`; `sets a square viewBox`; `rejects when the library cannot load` (mock the import to throw).
  - `api.test.ts`: `listPages reads the try's paper`.
  - `phone.test.ts` (the dialog's markup from `index.html`, a fake `LandingApi`, a fake `drawQr`):
    - `shows the code for the try's phone address`: `drawQr` called with `https://mqgrader.ro/try/<token>/telefon` for `origin: 'https://mqgrader.ro'`.
    - `shows "Se așteaptă pozele de pe telefon…" and keeps the start button off with no page`.
    - `lists the pages with their sizes and count as they arrive, and turns the start button on`.
    - `starts the grading, then calls onStarted` (`api.start(token)` once).
    - `shows a refused start with the link to the try`.
    - `with the robot's barem: no start button, the line about the barem, and "Deschide încercarea" as the main button`.
    - `sends files picked on the laptop into the list` and `refuses a wrong file type with its message, sending nothing`.
    - `shows the address as text when the code cannot be drawn`.
    - `stops reading when it closes`.
    - `shows "Verifică din nou" once idle and reads again on it`.
  - `ui.test.ts`: `after a send with the phone, the window stays open on the code`; `Esc closes the code window, and the card shows the try`; `after "Pornește corectarea" the window closes and the card follows the grading`.

- [ ] **Step 3: Run them.** Run: `npx vitest run src/landing`. Expected: the new tests FAIL.

- [ ] **Step 4: Implement** `watch.ts`, `qr.ts`, `phone.ts`, the markup and the wiring in `ui.ts` (the form block hides, the phone block shows, `aria-labelledby` moves to `try-phone-title`, the focus goes to the heading; closing puts the form block back for the next time and calls `follow(stored)`). Sizes go through `formatFileSize`, the count through the list's heading.

- [ ] **Step 5: Style** in `landing.css`, with the page's tokens: two columns (the code 204px, the list beside it), one column below 560px; the code on a white ground with a 1px `--border` in both themes; list rows as flat `--ground` blocks; the count as a `.try-chip is-ok`; "Alege fișiere de pe calculator" as a `.link` at the left of the actions. No gradient, no shadow.

- [ ] **Step 6: Run.** Run: `npx vitest run src/landing`. Expected: PASS, `landing.test.ts` included.

- [ ] **Step 7: Commit.** Explicit paths, `package.json` and `package-lock.json` included; message "Show a QR code after a Quick Try send so the phone sends the pages".

---

### Task 6: Docs and the whole check

**Files:**
- Modify: `AGENTS.md` (the Quick Try rule: the form may send with no pages; the phone page `/try/<token>/telefon`; the timer rule), `src/AGENTS.md` (`landing/quickTry/`: `qr.ts`, `watch.ts`, `phone.ts`, the phone choice; `try/`: `PhonePage`, `PhoneCode`, `usePagesWatch`, and the line "never shows the test's upload link; its only QR code is the one of its own phone page"; `upload/`: `PagesUploader`)

- [ ] **Step 1: Update the two files**, in their own style: what exists and the rule to keep, no history.
- [ ] **Step 2: Run everything.** Run: `npm test`, then `npm run build`. Expected: all tests pass; the build ends with no type error.
- [ ] **Step 3: Check in the browser.** `npm run db:local`, the `preview` server, then: the form at 1280px (the row, the chosen state), a send with the phone as an administrator (the local teacher skips Turnstile), the code window, the phone page at 390px (`/try/<token>/telefon`: send two photos, "Am terminat"), the pages arriving in the window, "Pornește corectarea", and the code on the try's page. Both themes. Read the console for errors.
- [ ] **Step 4: Commit.** `git add AGENTS.md src/AGENTS.md` and commit "Describe Quick Try's phone pages in the agent notes".
