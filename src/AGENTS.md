# src/AGENTS.md

The two browser apps. The root `AGENTS.md` holds the project-wide rules.

## Structure

- `ui/`: brand CSS (colours from the Laura Miron site), brand mark, theme switch, Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time).
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line and its "Pornește robotul" button (`StartRobotButton.tsx`), the uploads table, "Recorectează tot"). `submissionPage/` holds the parts of a student's result page (the pages, the graded result with its corrections). `pages/StudentPage.tsx` is a student's history. `pages/SettingsPage.tsx` is Setări. `pages/ReportPage.tsx` and `reportPage/` are the class report (`shared/stats.ts` makes its numbers). `pdf/` makes the PDFs and shares them: the definitions are pure functions (`studentPdf.ts`, `classPdf.ts`), `renderPdf.ts` loads pdfmake only when a PDF is asked for, `share.ts` shares or saves, and `PdfActions.tsx` holds the buttons.
- `upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone).
- `test/`: test setup, the fake APIs (`fakeApi.ts`, `fakeUploadApi.ts`), `renderAdmin()`, `expectNoGradingWords()`.

## Gotchas

- A PDF never carries what is for the teacher only: `studentPdfInput()` is the only way into the student's PDF, and its type has no confidence and no review reason. Keep it so, and keep no word about how the work was graded in it. CSV cells that hold text go through `csvText()` (`shared/csv.ts`), which guards against formulas.
- The class PDF and the report page have one column for each exercise (up to 60): the page table scrolls in its `.table-wrap` and uses `report-table`, not the `uploads` table that turns into cards on a phone.

- The class report's Model column and the model lines on Setări are for the teacher only: the global setting `show_model_column` (the `settings` table, off by default) turns the column on. Student PDFs, the CSV, the class PDF and student pages never carry the model or effort.
- The schedule input takes Romania's time (`ui/bucharestTime.ts`).
- The Vite dev proxy keeps the Host header (`changeOrigin: false`). Otherwise the API refuses every write as cross-site.
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer.
