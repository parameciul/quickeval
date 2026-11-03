# The generated barem: design

Date: 2026-11-03. Status: draft for the user's approval.

## 1. Intent

A teacher who has the test but no barem cannot start an evaluation today. With this change, she clicks **"Generează baremul"** on the test page. The robot reads the test, solves it, and writes a barem in the style of Laura's own barems. The barem arrives as a Word file (`.docx`): the teacher downloads it, changes it in Word if she wants, and uploads it again.

A generated barem is **not active** until the teacher says she checked it (**"Am verificat baremul"**). Until then no evaluation starts with it. A wrong barem would grade the whole class wrong, so this step is required.

The same change tidies the file rows: the file button sits on the same line as its action ("Încarcă testul", "Înlocuiește testul", "Încarcă baremul", "Înlocuiește baremul"), and replacing an existing barem asks first.

Sample barem (the style to copy): `D:\Projects\Website-Content\Clasa 11R1\Test - Permutari - barem.docx`, made for `Test - Permutari.docx` in the same folder.

## 2. Goals, non-goals, anti-goals

Goals:
- A button that makes a barem from the test file, on the robot, started at once like every other robot job.
- The result is a real `.docx` with Word equations, that opens in Word and can be edited.
- The barem looks like the sample: title, test name, class and time, "Precizări privind evaluarea", then each Subiect as a two-column table (solution step | points), points per step, "din oficiu".
- A generated barem blocks every evaluation start until the teacher confirms it.
- A confirm dialog before a barem is replaced, by hand or by generation.
- File rows: action and file button on one line; the file name moves to the next line on a narrow screen.

Non-goals:
- No toggle or "mode": generation is one button, used when needed.
- No barem editor in the page: the teacher edits in Word.
- No generation while the test is in evaluation or done (only draft and open).
- No change to how the robot grades: it reads the active barem as today.
- No PDF barem output.

Anti-goals (a failure even if it "works"):
- An evaluation that starts, now or at a scheduled time, with a barem the teacher did not confirm.
- Broken math in the Word file (a matrix that loses its rows, a missing symbol).
- A generated barem that silently replaces the teacher's own barem.
- Any of this shown to students. The student pages do not change.
- Laura's test content or the barem in the public robot logs.

## 3. What a quick check proved (2026-11-03)

`pandoc --sandbox -f markdown -t docx` (pandoc 3.11 on Windows) turns Markdown with `$…$` LaTeX into native Word equations (OMML), also inside pipe-table cells. A `pmatrix` with two rows gives two `<m:mr>` rows in `word/document.xml`. A cell that starts with `1.` turns into a list unless written `1\.`. The robot already installs pandoc (`evaluate.yml`, Ubuntu's package, an older 3.1.x): the plan checks the same output with that version.

## 4. How it works

### 4.1 The flow

1. The test has a test file. The teacher clicks **"Generează baremul"**.
2. If a barem exists, the browser asks: "Înlocuiești baremul existent cu unul generat? Baremul de acum rămâne până vine cel nou." (Renunță / OK).
3. The API marks the request and starts the robot (`startRobot`).
4. The row shows "Se generează baremul… Durează câteva minute." The page refreshes every 10 s while a request waits (as for the print PDF).
5. The robot reads the test file (and the barem comments), runs Claude in the new mode `barem`, and gets back a JSON barem (§4.4).
6. The robot turns the JSON into Markdown in plain code, then into `.docx` with pandoc, and uploads it.
7. The API saves it as the test's barem (the old barem file is deleted), marked **unchecked**.
8. The row shows the file, a warning "Barem generat automat. Verifică-l și corectează-l în Word dacă e nevoie.", and **"Am verificat baremul"**.
9. The teacher clicks it: the barem is active. Or she uploads her edited file: an uploaded barem is always active (*my call*: it is her file).

### 4.2 Data (migration 0020)

New columns on `tests`:
- `barem_request TEXT NOT NULL DEFAULT 'none' CHECK (barem_request IN ('none', 'requested', 'failed'))`
- `barem_request_attempts INTEGER NOT NULL DEFAULT 0`
- `barem_unchecked INTEGER NOT NULL DEFAULT 0` (1 while the current barem file was generated and not confirmed)

One SQL fragment, `BAREM_ACTIVE` = `t.barem_file_key IS NOT NULL AND t.barem_unchecked = 0 AND t.barem_request <> 'requested'`, replaces `t.barem_file_key IS NOT NULL` in every place that starts or schedules an evaluation: `READY`, `READY_SELECTED`, `OPEN_WITH_FILES`, `scheduleEvaluation`, and also `DUE` (the scheduled start in `promoteDue`, which today does not check the barem at all).

- **Request** (teacher): `barem_request = 'requested'`, attempts 0, `evaluation_at = NULL` (a scheduled evaluation is cancelled: the teacher schedules again after she checks the new barem). Only when status is draft or open and the test file exists, checked in the UPDATE.
- **Save** (robot): new barem file key, name, type; `barem_unchecked = 1`; `barem_request = 'none'`; `files_version + 1`; the exercise list cleared as for any new barem. The old barem object is deleted quietly.
- **Fail** (robot): attempts + 1; at 3, `barem_request = 'failed'`.
- **Teacher upload of a barem**: as today, plus `barem_unchecked = 0` and `barem_request = 'none'` (an upload cancels a waiting request; the robot's late answer is refused).
- **New test file**: a waiting request stays; the robot reads `files_version`, so an answer made from the old test is refused and the job runs again on the new file. When the barem is generated and still unchecked, the same UPDATE sets `barem_request = 'requested'` (attempts 0) and the robot starts: an unchecked barem always belongs to the current test, so "Am verificat baremul" can never confirm a barem of an old test file. The old generated barem stays until the new one arrives (*my call*). A checked barem or a teacher's own barem is not touched.
- **"Am verificat baremul"**: `barem_unchecked = 0`, only when `files_version` is the one the page showed (the page names what it showed, as other by-id writes do).

A barem job waits while `status IN ('draft', 'open') AND test_file_key IS NOT NULL AND barem_request = 'requested'` (`NEEDS_BAREM` in `server/db/runner.ts`, next to `NEEDS_PRINT`). It counts in `runCheck`, `listTasks`, and `testHasRobotWork`.

`TestInfo` gets `barem: { request: 'none' | 'requested' | 'failed', unchecked: boolean }` and the `filesVersion` the confirm call sends back.

Counting: a generation is not a grading. It does not count in `tests_evaluated` or `papers_graded`, and demo accounts may use it (*my call*).

### 4.3 Robot API (`/api/runner`)

Like the print job:
- `GET /tests/:id/barem-job` → `{ testId, filesVersion, createdAt, contentType, baremNotes }` (the title and class come from the test file itself), and `GET /tests/:id/barem-job/file` → the test file. Both 404 unless the test is a waiting barem job (`NEEDS_BAREM`), in their SQL.
- `PUT /tests/:id/barem` with the `.docx` as body, `runId`, `filesVersion`, `createdAt` in headers: saves only when the run holds the lease, the job still waits, and `files_version` matches; else 409 `not_needed`. Body checked as a Word file (`looksLike`, `DOCX_TYPE`), at most 25 MB. R2 write first, then the row; a refused row write deletes the new object.
- `POST /tests/:id/barem-failed` `{ runId, filesVersion, createdAt, error }`: one attempt more under the same conditions.

### 4.4 The robot side

- New `ClaudeMode` `'barem'` (`/evaluate-test barem`), with its time limit. The work folder holds the skill, the test (`test.pdf`, or `test.md` from pandoc as today), and the barem comments. No barem, no student pages.
- New zod schema `generatedBaremSchema` in `shared/schemas.ts`, given to Claude as JSON Schema (`claudeJsonSchema`). Shape (names are the builder's):
  - `title`, `subtitle` (class, program, time), `notes: string[]` (the "Precizări"), `fromOffice` (points din oficiu),
  - `sections[]`: `{ title, points, items[]: { label, steps[]: { text, points } } }`. `text` holds Romanian text with inline LaTeX between `$…$`.
  - A field `total` (the test's total, din oficiu included). No total is stored anywhere else, so Claude reads it from the test: when the test prints points ("Subiectul I (30 de puncte)", "6p" per exercise), the barem uses exactly those; when it prints none, Claude uses the Romanian default, 90 points + 10 din oficiu = 100 (*my call*).
  - A check `checkGeneratedBarem()`: the answer must agree with itself: step points add up to each item, items to their section, sections plus din oficiu to `total`; no empty section; a size limit. A failed check is an invalid output (one more try, then an attempt).
- `runner/baremDocx.ts`: JSON → Markdown in code (escaping `|`, a leading `1.`, Markdown specials outside math), then `pandoc --sandbox -f markdown -t docx --reference-doc runner/barem-reference.docx`. The reference doc sets A4, the font, and the table style. The answer goes through `askClaude` (size limit, `leaksSecret`, the check, one more try).
- `run.ts`: barem jobs come right after print jobs (the teacher is waiting). A failed barem job counts in "failures in a row" (it uses Claude).
- Logs: test id, end, seconds, page counts. Never the test text or Claude's answer.
- The skill (`.claude/skills/evaluate-test/`): a new section for the `barem` mode and a reference file with the style rules: copy the test's structure (Subiect, exercise numbers, letters a/b/c), give points per step, reward correct alternative methods, keep the totals of the test, Romanian math wording.
- The sample goes into the repo (the user's decision, 2026-11-03, knowing the repo is public): `Test - Permutari.docx` and `Test - Permutari - barem.docx`, converted with `pandoc -t markdown` into the skill's references as a worked example (test → barem). The two `.docx` files are also test fixtures (the real pandoc test, `npm run try:skill -- barem <folder>`).

### 4.5 The teacher's page (`TestFiles.tsx`)

Each file row, on one line where there is room:

```
Baremul: Test - Permutari - barem.docx
[Înlocuiește baremul]  [Generează baremul]  nume-ales.docx
```

- The native file input is hidden. Its `<label>` is styled as the button (`button-quiet`), so the label text stays the same and the tests that find it by label still work. The browser's own "Choose file / No file chosen" text (not Romanian) no longer shows.
- The chosen file name is a span in the same `flex-wrap` row; on a narrow screen it goes to the next line.
- The same input is used on the new-test page (`NewTestPage.tsx`).
- Replacing a barem by hand: after the pick, `window.confirm("Înlocuiești baremul existent cu <nume>?")`. Renunță leaves everything as it was. (No confirm for the test file: *my call*, the request was about the barem.)
- "Generează baremul": shown on the barem row while the test is draft or open. Disabled without a test file, with the hint "Încarcă întâi testul.". While a request waits: disabled, with the waiting line.
- Failed: "Nu am putut genera baremul." and **"Încearcă din nou"** (the same request call).
- Unchecked: the warning and **"Am verificat baremul"**.
- Evaluation controls: when the barem is unchecked or still generating, "Pornește evaluarea" and "Programează" are disabled and say why. The API answers 409 `barem_unchecked` "Verifică baremul generat înainte de evaluare." or `barem_generating` "Baremul se generează încă.".
- Generated file name: `<cod test> - barem generat.docx`.

## 5. Constraints

- Root `AGENTS.md`: teacher queries scoped by teacher id; checks inside the SQL of the write; `promoteDue` keeps running; R2 keys from rows; Functions ≤ 10 ms CPU and ≤ 15 D1 queries; Romanian UI text; no grading words for students.
- Migration 0020 runs on the live D1 before the code reaches `main` (`docs/deploy.md`).
- The repo and its Actions logs are public.
- The robot's Claude reads only its work folder and answers JSON only. It writes no files.
- `run.ts` loads only zod; pandoc is a program, not a package.

## 6. Testing

- API: `NEEDS_BAREM` for each status; the scoped robot reads (404 when not a job); save checks (lease, `files_version`, Word bytes, a teacher upload meanwhile); attempts to `failed`; retry; request cancels a schedule; every evaluation start and `DUE` refuse an unchecked or generating barem; confirm with a stale `filesVersion` is refused; a teacher upload clears `unchecked` and the request.
- Robot: the barem task with a scripted Claude (saved, invalid then retried, failed, dropped); the totals check; JSON → Markdown escaping; a real pandoc test (skipped without pandoc) that counts matrix rows in the `.docx`; no test text in the logs; `run.ts` still loads only zod.
- Skill: `skill.test.ts` checks the new mode's file names.
- Page: each barem row state; the replace confirm (OK and Renunță); the disabled evaluation buttons; the one-line layout at desktop width and the wrap at phone width (checked in the browser pane).
- Before go-live: one real run on GitHub with `Test - Permutari.docx`, compared by the user with the sample barem.

## 7. Left to the builder (the plan)

- Exact names of files, functions, schema fields, and Romanian strings beyond those above.
- The reference `.docx` (made with `pandoc --print-default-data-file reference.docx`, then styled).
- The time limit of the `barem` mode.
- How the sample is cut into the skill's reference file (whole, or the first Rând only).
- Spec updates (main design §7, §8, §11, §12, §13) as the plan's first task.
