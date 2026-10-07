# Plan 2 follow-ups

Plan 2 was built task by task with a review after each task and a final whole-branch review. The code in the repo is the source of truth. The code blocks in `2026-10-07-quickeval-plan-2-tests-uploads.md` are the plan as written; they do not show the changes below. Write Plan 3 from the repo, not from the Plan 2 text.

## Changes from the written plan (already in the code)

- `server/db/links.ts`, `server/routes/upload.ts`: each student write checks its own rules in the same SQL statement. `addSubmissionFile` is an `INSERT … SELECT … WHERE` (the test is open, the upload is `uploading`, fewer than 20 files). `deleteSessionFile` has the same open check. `confirmSubmission` is one `db.batch()`: the guarded `UPDATE` (open test, at least one file) and the file count. When a write changes nothing, the route runs `openSession` again and answers with the existing codes (`closed`, `already_submitted`, `no_session`, then `too_many_files`, `not_found` or `no_files`). Tests: "the upload writes check the rules themselves" in `server/routes/upload.test.ts`.
- `src/admin/pages/TestPage.tsx`: a failed background refresh keeps the page (and an open full-screen QR code) and shows the error above it. Only a failed first load shows the error alone.
- `src/upload/shrink.ts`: the type comes from `uploadTypeOf` (the file name when the browser gives no type), an encoder error sends the photo as it is, and the canvas is freed after encoding.
- `src/upload/UploadScreen.tsx`: the send queue has an error barrier (a page that cannot be prepared can be tried again, and later pages still go) and stops when the screen goes away or the upload is lost (401). A PDF that the phone calls `application/octet-stream` is sent as `application/pdf`.
- `src/upload/UploadApp.tsx`: the upload screen shows "Nu ești <nume>? Alege alt nume" for a phone that students share (spec §10, step 3). On the automatic resume, a secret left from an upload that moved to another phone is forgotten without an alert.
- `src/upload/api.ts`: a stopped or timed-out upload, or an answer that a `Response` cannot hold, is a network error, so the queue never waits forever.
- `shared/files.ts`: `uploadTypeOf` treats `application/octet-stream` like no type.
- `src/admin/pages/SubmissionPage.tsx`: pages are numbered by their order in the list, so a deleted page leaves no gap.
- `src/test/gradingWords.ts`: also catches "IA", "A.I." and "I.A." (capitals only) and the text of `aria-label`, `alt`, `title` and `placeholder`. Every student screen test calls it.
- Spec: four edits (§8.3 `promoteDueTests` comes with Plan 3, §10.2 "Ești <name>?", §10.3 the shared-phone control, §10.5 PDFs as rows).

## For Plan 3

- `GET /api/u/<token>` must call `promoteDueTests` (spec §8.3).
- Resetting an upload has no status guard: the robot must treat a result for a deleted submission as 404.
- Until Plan 3, a started test cannot be closed: start works only from `draft`, reopen only from `evaluating` or `done`. The link keeps working until the test is deleted, and deleting the test deletes the uploads.
- `GET /api/admin/tests/:code` does not yet return the exercise-list and analysis status or the robot line (spec §11.1).

## Still open (for Plan 4, the polish plan, unless an earlier plan needs them)

Server:
- Deleting a test or resetting an upload reads the R2 keys and deletes the rows in separate queries. A student file inserted between the two leaves an R2 object that no row names. Fix: one `db.batch()` for the key read and the delete.
- `listUploads`, `listTestKeys` and `deleteSubmissionRow` take bare ids; their callers check the teacher first.
- `submittedCount` counts students who left the class, while `studentCount` counts only active students.
- In a narrow race a deleted test number can be used again (spec §7.3).
- Replacing a test or barem file checks `evaluating` before the write, not in it; two overlapping replaces can leave an R2 object behind.
- A body without `Content-Length` is read whole before the 25 MB check (Ruling 1). Large uploads use memory per isolate: watch the logs.
- `fileNameHeader` cuts names by UTF-16 units; an emoji at the cut can make that file unopenable.
- `deleteFiles` stops at the first failed group of 1000 keys.
- Access: the stale-key fallback has no negative cache and no maximum key age; an unknown `kid` during an outage gives 403, not 503.
- File answers carry no CSP. Test the browsers' PDF viewers before adding one.

Teacher app:
- Test page: the same file cannot be picked again after a failed test or barem upload; the QR overlay has no focus trap or focus return and can overflow on a landscape phone; "Copiat!" never clears; the creation notice lives in history state; a stale rename error shows again.
- New test page: only the first failed file is reported; it navigates even after the teacher left the page; the inputs stay enabled while creating; a refused file's name stays in the input.
- Submission page: after a reset the cached upload stays in memory; photos load at full size.
- Class page: a failed background refresh still replaces the whole page.
- `formatFileSize` shows "1024 KB" just under 1 MB and "1 KB" for an empty file.

Student app:
- Every non-401 error offers a retry, also when a retry can never succeed.
- A double tap on "Șterge" shows "Nu am găsit fișierul." and keeps the row; confirm answered `already_submitted` leaves the student on the screen.
- Refused files use up places of the 20-file limit.
- The too-many-files text is written twice (app and server); Ruling 10 wants it in `shared/files.ts`.
- Preview URLs are freed only when the screen closes.
- Photo viewer: its focus effect runs again on every refresh; no focus return; `100vh` instead of `100dvh` on iOS.
- After `closed`, `unknown_link` or `already_submitted` from a name pick, the old list stays on screen.
- `NamePicker` resets `busy` without `try/finally`; the wrong-link screen has no retry button.
- "Alege alt nume" while pages wait drops them without a word; a reload goes back to the first saved upload on the phone.

Tests and tooling:
- `fakeUploadApi` is looser than the server (confirm with no files, writes after sending, no 20-file limit, `startSession` ignores `closed`). `fakeApi`'s `fakeTest` keeps the upload rows it is given, so tests that share rows share state.
- Missing tests: the unmount stop of the upload queue, several client error paths, route-level empty, too-big and wrong-bytes uploads, replace in `open` or `done`.
- `scripts/smoke.mjs` leaves one class with one student in the local database each run, and stops with a raw stack trace when the server is not running.
