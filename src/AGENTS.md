# src/AGENTS.md

The two browser apps. The root `AGENTS.md` holds the project-wide rules.

## Structure

- `ui/`: brand CSS (colours from the Laura Miron site), brand mark, theme switch, Romanian count labels and dates, the error boundary, `ApiError.ts` (the error type and JSON answer reader of both apps), `bucharestTime.ts` (the schedule input in Romania's time).
- `admin/`: the teacher app. `api.ts` is the only code that calls the API; pages get it from `useApi()`, so tests pass a fake. `testPage/` holds the parts of the test page (files, link, evaluation controls, the barem warning (`ExerciseListBanner.tsx`), the robot line, the uploads table). `pages/SettingsPage.tsx` is Setări.
- `upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone).
- `test/`: test setup, the fake APIs (`fakeApi.ts`, `fakeUploadApi.ts`), `renderAdmin()`, `expectNoGradingWords()`.

## Gotchas

- The schedule input takes Romania's time (`ui/bucharestTime.ts`).
- The Vite dev proxy keeps the Host header (`changeOrigin: false`). Otherwise the API refuses every write as cross-site.
- Page tests that check a navigation use `expectLocation()`: it waits, because the navigation follows the API answer.
