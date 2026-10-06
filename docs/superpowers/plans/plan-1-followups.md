# Plan 1 follow-ups (input for Plan 2)

Plan 1 was built task by task with a review after each task and a final whole-branch review. The code in the repo is the source of truth. The code blocks in `2026-10-06-quickeval-plan-1-foundation.md` are the plan as written; they do not show the fixes below.

## Changes from the written plan (already in the code)

- `server/auth/access.ts`: `parseJwt` refuses a token whose header or payload is not an object, so a malformed token gets 403, not 500. Regression test in `access.test.ts`.
- `src/admin/api.ts`: a failed `fetch` becomes `ApiError(0, 'network', …)` and a broken JSON body becomes `ApiError(status, 'bad_response', …)`, both with Romanian text. `reloadForLogin(reload?, now?)` has injectable parameters and tests for the 10-second limit.
- `src/admin/ErrorMessage.tsx`: shows `error.message` only for `ApiError` and `LoginExpiredError`; any other error shows the generic Romanian text.
- `shared/students.ts`: `cleanStudentName` also removes a bare list number (`3.`, `4)`, `5`), so empty numbered rows of a pasted list are dropped. Side effect: `1.5 Pop Ana` becomes `5 Pop Ana` (unrealistic input).
- `migrations/0001_people.sql`: `teachers.email` has `CHECK (email = lower(email))`. Insert teachers with `lower('<email>')`.
- `server/db/classes.ts`: `listClassStudents(db, teacherId, classId)` is scoped by teacher. `setEnrollmentActive`'s follow-up select is scoped by teacher too.
- `.github/workflows/ci.yml`: `permissions: contents: read`.
- Local dev databases made before the CHECK constraint keep the old schema. Reset with: delete `.wrangler/state`, then `npm run db:local`.

## Do early in Plan 2

- Add cross-teacher tests for `POST /api/admin/classes/:id/students` and `PATCH /api/admin/classes/:id/students/:studentId` (both 404 tests use id 99999 today). Do it before a second teacher exists.
- `addStudentsToClass` (`server/db/students.ts`): the enrollment insert does not check class ownership itself; only the route's `getClass` guards it.
- `src/admin/pages/ClassPage.tsx`: give `ClassDetails` `key={classId}`. Without it, the add-students draft can carry over to another class once Plan 2 adds links between classes.
- `src/ui/brand.css`: `.card.is-muted { opacity: .7 }` makes the "Scoate din arhivă" button about 4.4:1 contrast; spec §16 asks for at least 4.5:1. Mute only the title and count.

## Hardening

- API responses get no `X-Content-Type-Options: nosniff` or `Cache-Control: no-store` (`public/_headers` does not apply to Functions). Add a small middleware in `server/app.ts`.
- Add a React error boundary with a Romanian message.
- Cloudflare Access covers only the main host. Optionally add `*.quickeval.pages.dev` with the same two paths. The API already refuses requests without a valid token there.
- `teacherAuth` answers 403 when the Access key download fails; 503 fits better. An expired key cache plus a failed download drops still-usable keys.
- `parseId` (`server/http.ts`) and the class page id accept `1e3`, `0x10`, ` 5 `; use `/^[1-9]\d*$/`.
- `updateClass` ignores `meta.changes` (matters once classes can be deleted).
- The `fetch` catch in `src/admin/api.ts` reports a deliberate abort as a network error (nothing aborts today).

## Tests to add

- Access verifier: the one-forced-download-per-30-seconds limit, future `nbf`, tokens that are not 3 parts or not base64, `aud` as a string, `127.0.0.1` as a dev host, and a valid token through to a 200.
- Test helper `server/test/testApi.ts`: dispose the platform when setup fails; lowercase header keys before merging; handle an empty (204) body.
- Direct tests for `readJson`, `parseId`, `sameOriginWrites`, `isUniqueViolation`, and the `onError` 500 path.
- Classes: empty PATCH body, `archived: false`. Students: prove the batch is a transaction (fail the second statement).
- Several API test files depend on test order (shared state across `it` blocks).
- `shared/students.test.ts`: an ordering pair that separates Romanian from root collation (`['Șa', 'Sz']`); boundaries for `isValidSchoolYear` (2020, 2100, 2101) and an 8-character class name.
- UI: "Scoate din arhivă" and "Revine în clasă" paths, the 60-name limit, number-only paste, failing add and rename, "Renunță", the empty-class hint, `ThemeButton`, `schoolYearOptions` (the year-switch test depends on the current date).

## UX and accessibility

- Class page: reset the draft and the error on "Renunță"; focus the input that appears; give the repeated "Redenumește" / "A plecat" buttons per-student context (`aria-describedby`); a failed background refresh should not replace the whole page.
- Classes page: every card's "Arhivează" button has the same accessible name; create and archive errors stay after the school-year switch; the theme icon goes stale when the system theme changes; a saved school year outside the offered range shows the wrong option.
- The class heading counts active students, while the list also shows students who left.

## Small

- `scripts/smoke.mjs`: the header comment says it exits on the first failure (it exits after the last check); `api()` parses JSON without a guard; header checks run only on `/admin/`.
- `robots.txt` `Disallow: /` hides the `X-Robots-Tag: noindex` header from crawlers that obey it.
- `AGENTS.md`: "Romanian number words" should be "Romanian count labels".
