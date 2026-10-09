# server/AGENTS.md

The API. The root `AGENTS.md` holds the project-wide rules.

## Structure

- `routes/`: HTTP. `admin.ts` and its parts, `upload.ts` for students, `runner.ts` for the robot.
- `db/`: D1 queries. `lifecycle.ts` starts, schedules, promotes, and ends evaluations; `links.ts` holds the student writes; `runner.ts` holds the robot's queries.
- `auth/`: Cloudflare Access login, and `robotAuth.ts` for the robot key.
- `http.ts` (JSON bodies, ids, codes, same-origin writes, the `promoteDue` middleware, which runs `promoteDueTests`), `errors.ts` (`ApiError`), `uploads.ts` (file bodies in and out of R2), `secrets.ts` (tokens, keys, and hashes), `dispatch.ts` ("Evaluate now": GitHub's repository_dispatch).
- `test/`: the API test helper (`testApi.ts`) and fixtures.

## Rules

- Student calls are scoped by the test of the link's token, and an upload by the hash of the phone's secret (`X-Upload-Session`) within that test. Only hashes of secrets are stored.
- Each student write checks its own rules inside its SQL statement (`db/links.ts`: the test is open and its scheduled time has not come, the upload is not sent yet, at most 20 files; confirm is one `db.batch()`). Never turn these into a check before the write: two requests at once would get past it. Starting an upload still checks the open test in its route (`routes/upload.ts`), before `createSubmission` inserts (see `docs/superpowers/plans/plan-3a-followups.md`).
- The same holds for the robot (`db/runner.ts`): a claim, an exercise list, and a result check the lease or the run inside their SQL. `/check` and `/lease` send uploads left in grading by a dead run back to the queue. An exercise list is saved only while the test's `files_version` is the one the robot read before the files. A run never claims again an upload that a reopen took from it (`reopenTest` keeps that run's id): the next run grades it.
- The database is the truth: R2 keys come from rows, never from listing R2.
- Functions do no heavy CPU work (10 ms of CPU per request on the free plan) and make at most 15 D1 queries per request. Adding students uses a fixed number of queries, whatever the number of names; the uploads table is one query.

## Gotchas

- Local login: `.dev.vars` sets `DEV_TEACHER_EMAIL`. The API accepts it only for requests to localhost or 127.0.0.1.
- API tests use wrangler's `getPlatformProxy` (`test/testApi.ts`). Do not add `miniflare` as a direct dependency: its newest version changed its options format.
- `getPlatformProxy`'s R2 refuses a request-body stream ("must have a known length"). The API reads an upload with `arrayBuffer()` (after checking `Content-Length` ≤ 25 MB) and stores the bytes; production works the same way.
- In an API test, a test set straight to `evaluating` with no upload `submitted` or `grading` turns `done` on the next request: every request ends the tests that have nothing left to grade. Add a waiting upload first.
- API tests may fake the clock with `vi.useFakeTimers({ toFake: ['Date'] })`: only Node's clock changes, and the local engine keeps working. `startTestApi({ app: { dispatchRobot } })` replaces the GitHub call; `setRobotKey()` and `robotRequest()` in `test/fixtures.ts` call the robot API.
