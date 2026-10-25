# Printable test with a QR code: follow-ups

Left open after the build of feature/qr-print-test (2026-10-25). None blocks the merge.

## Small items

- Task 1: server/db/tests.ts:2 type import order
- Task 2: routes/tests.ts:495 nested ternary readability; db/tests.ts:79 comment wrap; retry 409 message covers not-open too; import order in src/admin/api.ts and fakeApi
- Task 2: routes/tests.ts:493 a robot print saved between the route's read and saveTestFile is orphaned in R2 (row key reset to NULL) — R2 orphan only
- Task 3: no test covers savePrint fail + printKeyIs true path
- Task 3: robot-key-vs-admin test pins the unconfigured 500; configured-Access 403 path would prove more
- Task 4: docx_to_pdf.py stale profile comment + dead Windows paths; no test for an image in the strip or the 90% boundary; stamp() mid-render failure exits 1 with traceback (Task 5 must not log stderr); readable_pages leaves doc open on None; dark full-page fill ignored as background
- Task 5: no unit test that dockerTools errors drop the command line; the 180 s Word conversion limit is unverified on a cold GitHub runner (check on the first real run)
- Task 6: TestPage tests use unscoped role=status, fixed by setting fixture print 'ready' (scope the queries instead); useMutation formatting in TestPage; import order
- Final: waitsForPrint and fake printWaits omit upload_token IS NOT NULL (an open test always has one)
- Final: RobotLine texts say "Corectarea…" also for a waiting print PDF

## Decisions taken during the build

- T5 may modify runner/test/robotWorld.ts to add openTestWithFile — the plan's tests name it — none if wrong.
- robotStarter in tests without dispatch options saves start_failed_at on Start test with a test file — accepted, same as other robot starts — an existing test asserting robot.startFailed false after a start may need updating.
- failPrint counts no attempt for usage_limit, like failExerciseList — consistency with the robot's error rule — a print that keeps hitting usage_limit never fails (the robot never sends usage_limit for a print anyway)
- pymupdf pinned to 1.28.2 not 2.x — 2.x pulls onnxruntime/layout deps not needed — a later security fix needs a manual bump
- keep fonts-stix out of the image — the spike's good TDF result used LibreOffice's bundled fonts (fonts.py showed no STIX), and Task 4 checked both real worksheets by eye with the shipped image — if wrong, a symbol renders in a fallback font; the strengthened OMML+font test guards it.
- park final #3 (non-root path on Linux) — Task 4 ran the image with --user 1000:1000 --network none; the host-side uid match is only exercised on GitHub, covered by the go-live run — if wrong, the first real print run fails and retries (now recoverable via #1).
- park final minor 2 (lease-takeover race in PUT print) and minor 5 (/Rotate PDFs) — need millisecond lease takeover / rare input — a ready print with no object needs a test-file re-upload.
- POST /:code/robot now accepts an open test and leaves the decision to testHasRobotWork — the page needs it for a stuck print job — an open test without a print job now answers no_work instead of not_evaluating
