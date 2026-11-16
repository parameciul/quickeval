# The Test Link After the Results, and the Answer in a Correction: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The teacher can correct "Răspunsul elevului" of an exercise, and the test's link shows a published result's kept link, or says plainly where the result is.

**Architecture:** Task 1 adds one optional field to the correction that already exists (body, guarded UPDATE, edit row). Task 2 adds two facts to the answer of `GET /api/u/<token>` (`key`, `resultsOpen`), a token → test-key map in the phone's `localStorage`, and a closed page that uses both. No migration.

**Tech Stack:** TypeScript, Hono on Cloudflare Pages Functions, D1, React, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-16-result-link-and-answer-edit-design.md`

## Global Constraints

- All user-facing text is Romanian; code and comments are English; comments name no ticket.
- No student page says how the work is graded: every new student screen is checked with `expectNoGradingWords()`.
- A correction checks its rules inside its own SQL statement (`SHOWN` in `server/db/evaluations.ts`), never in a check before the write.
- At most 15 D1 queries per request; an open test's upload requests must read nothing more than today.
- Relative imports name the `.ts` or `.tsx` file. No enums, no namespaces.
- `TEXT_LIMITS.studentAnswer` is 500.

## Review Focus

- A correction with only `studentAnswer` (no points, no comment): saved, total and grade unchanged, item marked changed. (Task 1, API test.)
- An answer of 501 characters: refused with 400 and its own message; an empty answer: saved. (Task 1, API test.)
- A result link kept under the test's other link token, with no remembered key (a phone that sent before this change): found on the closed page after one extra request. (Task 2, page test.)
- A kept link of another test, or of a link the server no longer knows: never shown on this test's closed page, and the unknown link is not asked for twice. (Task 2, page test.)
- Blocked `localStorage`: the closed page still renders its text. (Task 2, unit test of `resultLinks.ts`.)

---

### Task 1: The student's answer in a correction

**Files:**
- Modify: `shared/api.ts` (`correctItemBody`)
- Modify: `server/db/evaluations.ts` (`correctItem`)
- Modify: `src/admin/submissionPage/GradedResult.tsx` (`ItemRow`)
- Modify: `src/test/fakeApi.ts` (`correctItem`)
- Test: `server/routes/corrections.test.ts`, `src/admin/pages/PaperPage.test.tsx`

**Interfaces:**
- Produces: `ItemChange.studentAnswer?: string` (trimmed, at most 500 characters).

- [ ] **Step 1: Write the failing API tests** in `corrections.test.ts`:
  - `changes the student's answer without changing the points`: `correct(items['I.1'], { studentAnswer: '  x = 121  ' })` → 200, the item `{ points: 4, studentAnswer: 'x = 121', comment: 'Comentariu.', changedByTeacher: true }`, evaluation `{ total: 7, grade: 7 }`, `updated_at` no longer `GRADED_AT`; then `{ studentAnswer: '' }` → 200 and `studentAnswer: ''`.
  - `refuses an answer that is too long`: 501 characters → 400, message `Răspunsul elevului are cel mult 500 de caractere.`, the row unchanged.
- [ ] **Step 2: Run** `npx vitest run --project server server/routes/corrections.test.ts`. Expected: the two new tests fail (the answer stays `'r'`, and `{ studentAnswer }` alone is refused as "Nu ai schimbat nimic.").
- [ ] **Step 3: Implement.** `correctItemBody` gets `studentAnswer` (trim, max `TEXT_LIMITS.studentAnswer`, the message above, optional) and counts it in the refine. `correctItem` adds `student_answer = COALESCE(?, student_answer)` to its UPDATE and counts a new answer in `changed`.
- [ ] **Step 4: Run the same command.** Expected: all pass.
- [ ] **Step 5: Write the failing page test** in `PaperPage.test.tsx`: `lets the teacher correct the student's answer`: open "Modifică Subiectul I, ex. 1", the field `Răspunsul elevului` has the item's answer; type `x = 121`, "Salvează" → `api.correctItem` called with `expect.objectContaining({ studentAnswer: 'x = 121' })` and without `points` or `comment`; the row then shows `x = 121` and no field.
- [ ] **Step 6: Run** `npx vitest run --project web src/admin/pages/PaperPage.test.tsx`. Expected: the new test fails (no field with that label).
- [ ] **Step 7: Implement.** `ItemRow` keeps an `answer` state, reset in `startEditing`; while editing, the answer cell is a `textarea.cell-area` with the sr-only label `Răspunsul elevului`, `maxLength={TEXT_LIMITS.studentAnswer}`, rows from `commentRows`; `saveEditing` sets `change.studentAnswer` when the trimmed text differs. The fake API saves it and marks the item changed.
- [ ] **Step 8: Run** `npm run test:web` and `npm run typecheck`. Expected: pass.

### Task 2: The test's link once the results are published

**Files:**
- Modify: `shared/api.ts` (`LinkInfo`)
- Modify: `server/db/results.ts` (new `resultsPublished`), `server/routes/upload.ts` (`GET /:token`)
- Modify: `src/upload/resultLinks.ts`, `src/upload/UploadApp.tsx`, `src/ui/brand.css`
- Modify: `src/admin/testPage/ResultsAccess.tsx`
- Modify: `src/test/fakeUploadApi.ts`, `src/AGENTS.md`
- Test: `server/routes/upload.test.ts`, `src/upload/resultLinks.test.ts`, `src/upload/UploadApp.test.tsx`, `src/admin/testPage/ResultsPanel.test.tsx`

**Interfaces:**
- Produces: `LinkInfo.test.key: string`, `LinkInfo.test.resultsOpen: boolean`.
- Produces in `resultLinks.ts`: `rememberTestKey(uploadToken: string, testKey: string): void`, `UNKNOWN_TEST_KEY` (remembered for a link the server does not know), `tokensToAsk(uploadToken: string): string[]` (other tokens with a kept result link and no remembered key, at most 5), `loadTestResultLinks(uploadToken: string, testKey: string): SavedResultLink[]` (this token's links and those of every token remembered with `testKey`, one per result token).
- Produces in `server/db/results.ts`: `resultsPublished(db: D1Database, testId: number): Promise<boolean>`.

- [ ] **Step 1: Write the failing API tests** in `upload.test.ts`: the three exact bodies of `GET /api/u/<token>` gain `key: expect.any(String)` and `resultsOpen: false`; new test `says when the results are published, and names the test the same on both links`: a done test → `resultsOpen: false`; after the teacher opens the results → `true`; after closing and publishing one upload alone → `true`; the default link and the link for many uploads give the same `key`, and another test gives another.
- [ ] **Step 2: Run** `npx vitest run --project server server/routes/upload.test.ts`. Expected: these fail (no `key`, no `resultsOpen`).
- [ ] **Step 3: Implement.** The key is `sha256Hex` of the test's id and `createdAt`. `resultsPublished` is one query, run only when the status is neither `draft` nor `open`.
- [ ] **Step 4: Run the same command.** Expected: all pass.
- [ ] **Step 5: Write the failing unit tests** in `resultLinks.test.ts` for `rememberTestKey`, `tokensToAsk` and `loadTestResultLinks`: links of two tokens with the same key come back together, once per result token; a token with another key or `UNKNOWN_TEST_KEY` is left out and not asked again; at most 5 tokens to ask; blocked storage gives `[]`.
- [ ] **Step 6: Write the failing page tests** in `UploadApp.test.tsx` (fake `linkInfo` gets `key: 'test-key-1'`, `resultsOpen: false`):
  - `says where the result is when the results are published and this phone kept no link`: no alert, "Rezultatele au fost publicate.", the line "Linkul cu rezultatul tău este salvat pe telefonul și în browserul cu care ai trimis lucrarea. Dacă nu îl găsești acolo, cere profesorului linkul tău.", no "Încărcarea s-a închis.".
  - `shows the kept link with no alert once the results are published`.
  - `finds a result link kept under the test's other link`: a link saved under another token; `getLink` answers that token with the same key → "Vezi rezultatul" shows; a second render asks the server only for the page's own token.
  - `does not show a link kept for another test`.
- [ ] **Step 7: Run** `npx vitest run --project web src/upload`. Expected: the new tests fail.
- [ ] **Step 8: Implement** `resultLinks.ts`, the `load` of `UploadApp` (remember the key; on a closed test resolve `tokensToAsk`, each failure skipped, a 404 remembered as unknown) and a `ClosedScreen` with the spec's three states; `.notice-ok` in `brand.css` for the calm line, in both dark blocks if it needs a dark colour.
- [ ] **Step 9: Rezultate.** Test first in `ResultsPanel.test.tsx`: the second way also says "Pe alt telefon sau în alt browser, linkul testului nu arată rezultatul: trimite-i elevului linkul lui, din tabelul „Elevii”." Then add it in `ResultsAccess.tsx`.
- [ ] **Step 10: Docs.** `src/AGENTS.md`, the `upload/` entry: the closed page's three states and the token → key map.
- [ ] **Step 11: Run** `npm test` and `npm run typecheck`. Expected: pass.

### Task 3: Check in the browser

- [ ] `npm run db:local`, the `api` and `web` servers of this worktree, then: correct an answer on a graded paper and read it on the student's result; open a closed test's link with and without a kept link, results published and not.
