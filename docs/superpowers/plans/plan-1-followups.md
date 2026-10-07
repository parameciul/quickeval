# Plan 1 follow-ups

Plan 1 was built task by task with a review after each task and a final whole-branch review. The code in the repo is the source of truth. The code blocks in `2026-10-06-quickeval-plan-1-foundation.md` are the plan as written; they do not show the fixes below.

## Changes from the written plan (already in the code)

- `server/auth/access.ts`: `parseJwt` refuses a token whose header or payload is not an object, so a malformed token gets 403, not 500. Regression test in `access.test.ts`.
- `src/admin/api.ts`: a failed `fetch` becomes `ApiError(0, 'network', …)` and a broken JSON body becomes `ApiError(status, 'bad_response', …)` (since Plan 2 in `readAnswer`, `src/ui/ApiError.ts`, shared with the student app), both with Romanian text. `reloadForLogin(reload?, now?)` has injectable parameters and tests for the 10-second limit.
- `src/admin/ErrorMessage.tsx`: shows `error.message` only for `ApiError` and `LoginExpiredError`; any other error shows the generic Romanian text.
- `shared/students.ts`: `cleanStudentName` also removes a bare list number (`3.`, `4)`, `5`), so empty numbered rows of a pasted list are dropped. Side effect: `1.5 Pop Ana` becomes `5 Pop Ana` (unrealistic input).
- `migrations/0001_people.sql`: `teachers.email` has `CHECK (email = lower(email))`. Insert teachers with `lower('<email>')`.
- `server/db/classes.ts`: `listClassStudents(db, teacherId, classId)` is scoped by teacher. `setEnrollmentActive`'s follow-up select is scoped by teacher too.
- `.github/workflows/ci.yml`: `permissions: contents: read`.
- Local dev databases made before the CHECK constraint keep the old schema. Reset with: delete `.wrangler/state`, then `npm run db:local`.

## Live state after Plan 1

- Live at https://quickeval.pages.dev/ since 2026-10-07. The live database has two teachers: Laura's account (empty on purpose; she creates her own classes) and a test account. The test account has classes 6E2 and 11R1, with 30 made-up students in 6E2.

## Done in Plan 2

- Cross-teacher tests for adding students and for leaving a class; `addStudentsToClass` checks class ownership in both inserts.
- `ClassDetails` has `key={classId}`, and the error boundary resets on every page change.
- Archived cards mute only their title and count; their buttons keep full contrast.
- API responses get `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` (a route may set its own Cache-Control).
- A React error boundary with a Romanian message.
- `teacherAuth` answers 503 when the Access keys cannot be downloaded, and keys downloaded earlier stay in use when a later download fails.
- `parseId` and the class page accept only plain digits (`shared/ids.ts`).
- Test helper: disposes the platform when setup fails, merges header keys in any letter case, handles an empty body, and has `fetch()` for raw requests.
- Direct tests for `readJson`, `parseId`, `sameOriginWrites`, `isUniqueViolation`, and the `onError` 500 path.
- Access verifier tests: the one-forced-download-per-30-seconds limit, future `nbf`, malformed tokens, `aud` as a string, `127.0.0.1` as a dev host, and a valid token through to a 200.
- `scripts/smoke.mjs`: the header comment, a guarded JSON parse, header checks on `/u/` too.
- `AGENTS.md`: "Romanian count labels".

## Still open (for Plan 4, the polish plan, unless an earlier plan needs them)

- Cloudflare Access covers only the main host. Optionally add `*.quickeval.pages.dev` with the same two paths. The API already refuses requests without a valid token there.
- `updateClass` ignores `meta.changes` (matters once classes can be deleted).
- The `fetch` catch in `src/admin/api.ts` reports a deliberate abort as a network error (nothing aborts today).
- Classes: empty PATCH body, `archived: false`. Students: prove the batch is a transaction (fail the second statement).
- Some Plan 1 API test files depend on test order (shared state across `it` blocks). Plan 2 files start a fresh database per test.
- `shared/students.test.ts`: an ordering pair that separates Romanian from root collation (`['Șa', 'Sz']`); boundaries for `isValidSchoolYear` (2020, 2100, 2101) and an 8-character class name.
- UI: "Scoate din arhivă" and "Revine în clasă" paths, the 60-name limit, number-only paste, failing add and rename, "Renunță", the empty-class hint, `ThemeButton`, `schoolYearOptions` (the year-switch test depends on the current date).
- Class page: reset the draft and the error on "Renunță"; focus the input that appears; give the repeated "Redenumește" / "A plecat" buttons per-student context (`aria-describedby`); a failed background refresh should not replace the whole page (the test page already keeps its content).
- Classes page: every card's "Arhivează" button has the same accessible name; create and archive errors stay after the school-year switch; the theme icon goes stale when the system theme changes; a saved school year outside the offered range shows the wrong option.
- The class heading counts active students, while the list also shows students who left.
- `robots.txt` `Disallow: /` hides the `X-Robots-Tag: noindex` header from crawlers that obey it.
