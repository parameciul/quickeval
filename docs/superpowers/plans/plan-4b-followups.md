# Plan 4b follow-ups

Plan 4b built the class analysis (the robot's third task, its API, Regenerează), the class report with its statistics, the PDFs (student and class), the CSV, Trimite, the "Resetează" fix, and the operations notes. Older open points are in `plan-4a-followups.md` and `plan-3b-followups.md`.

## Still open

- The Trimite button makes the PDF first and then opens the share sheet. On some phones the sheet refuses a tap that is a few seconds old; the PDF is then downloaded and the page says so. Making the PDF when the page opens (and keeping it) would keep the tap fresh, at the cost of work the teacher may never use.
- The class PDF puts 12 exercises in a block. A very wide test makes many blocks, one below the other. A block size that follows the page width would use less paper.
- The analysis is asked for again each time a test enters evaluation. A test with no new upload that is evaluated again gets a new analysis that is probably the same.
- The student PDF names the date the student sent the upload, not the date of the test (the upload's page has no test date).
- An analysis is saved as out of date when a correction comes while the robot writes it. The teacher sees "Analiza poate fi depășită" and asks for a new one by hand.
- The class report shows the students that left the class only when they have a graded result.

## From the final review

- A teacher's edited comment (`changed_by_teacher = 1`) goes into `class-results.json` and could carry a name to the robot. Option: leave such comments out, or send the robot's original comment (`server/db/runner.ts` `findClassResults`).
- Regenerează takes a done test back to evaluating, which locks the test files while the analysis runs (the student result pages are not affected).
- There is no test for the 409 `not_needed` path (a regrade arrives during an analysis; `runner/run.ts` `analysesTried`).
- The stats `activeCount`: "Corectate X din Y elevi" can count graded students that are no longer active in the class (`shared/stats.ts`).
- The CSV formula guard misses the fullwidth characters ＝ ＋ － ＠ and a leading space before `=` (`shared/csv.ts`).
- Not verified: the CPU time of GET `/api/runner/tests/:id/results` and `/report` at 60 exercises and about 35 students; Trimite and Descarcă on iOS Safari; the 375 px layout of the rendered report.
