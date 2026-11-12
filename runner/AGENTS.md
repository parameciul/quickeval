# runner/AGENTS.md

The grading robot (spec §12), run by `.github/workflows/evaluate.yml`. The root `AGENTS.md` holds the project-wide rules; the robot's API side is in `server/AGENTS.md`.

## Structure

- `check.ts` (is there work?), `run.ts` (one run: lease, heartbeat, and in each round the print PDFs first, then the generated barems, then exercise lists, parallel gradings, and class analyses), `tasks.ts` (make an exercise list, grade one upload, write the class analysis), `claude.ts` (starts Claude Code and reads its answer), `workdir.ts` (a task's work folder; Word files through pandoc), `api.ts` (the only code that calls `/api/runner`), `log.ts`, `trySkill.ts` (`npm run try:skill`).
- `fixtures/`: real Claude outputs. `test/`: the API in-process, a scripted Claude.
- `baremTask.ts` writes a barem from the test file (Claude in mode `barem`, then `baremDocx.ts` and pandoc make the Word file). A pandoc failure or a file the API refuses counts a crash; a missing pandoc stops the run. A barem that ended other than `retry` is tried once per run, and a failed one counts in the failures in a row.
- The CES variant: the print, the barem, the exercise list and the grading take a `variant`; "ces" asks the API with `?variant=ces` and puts `ces.md` in the work folder (`CES_NOTE`), and the CES barem and list jobs also get `class/exercises.json` (and `class/barem.*` for a barem), so the CES list reuses the class exercise ids. A claim names the paper's variant. Each kind of CES work is tried by the same rules as the class work, after it, in the same round.
- The subject (`shared/subjects.ts`): the robot gets the test's `subject` with the test, a barem job and the class results, and writes it to `subject.md` in the work folder (`makeWorkFolder`). A grading and a class analysis of a test with none get `matematica`; an exercise list or a barem with none (or with `alta`) gets no `subject.md`, and Claude finds the subject. Claude answers those two modes with `subject` and `subjectName` (`exerciseListAnswerSchema`, `generatedBaremAnswerSchema`); the list sends them in its body, the barem in `X-Subject` and `X-Subject-Name` (`subjectOf`).
- `printTask.ts` makes the print PDF through the Docker image in `print/`. The image pins LibreOffice and installs only Liberation, Carlito, and Caladea fonts: other fonts (Noto, DejaVu) change "∖" into "∣" and move the layout. `QE_PRINT_IMAGE_TESTS=1` runs the container tests (`print/container.test.ts`, slow the first time). Never log the upload token or a script's output.
- `.claude/skills/evaluate-test/` (repo root): the grading skill (spec §13). The teacher may change its words; the robot copies it into every work folder. `skill.test.ts` checks the file and field names that the code needs. `SKILL.md` says how to find the subject; `references/subjects/<value>.md` holds what each subject changes (`matematica.md` changes nothing: the general rules, `barem-writing.md` and `barem-example.md` are the math ones, word for word). The other subjects' files are written from the public exam formats, with no real barem of the teacher yet; `romana.md` also has a real barem of the Evaluare Națională to copy in the mode `barem` (`references/barem-example-romana.md`); `engleza.md` asks for the texts of the student in English. In every subject but math, `checkGrading` also flags medium confidence.

- Each check (`check.ts`) sends `model` and `effort` from `claudeSettings()` with `POST /check`; the API keeps them for Setări (`robot_model`, `robot_effort`, `robot_settings_at`).
- The "Check for work" step of `evaluate.yml` carries `QE_MODEL` and `QE_EFFORT` like the Grade step, so Setări shows the real values; an empty variable falls back to the defaults.
- Every grading and the class analysis go back with the model and the effort used (`modelOf()`, `QE_EFFORT`); the test page shows them to the teacher.

## Try the skill

`npm run try:skill -- exercise-list <folder>`, then `npm run try:skill -- grade <folder>`: try the grading skill on this PC exactly as the robot runs it (spec §13). It needs `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) in the environment and never uses this PC's Claude login. The folder holds `test.pdf` or `test.docx`, `barem.pdf` or `barem.docx`, and the pages in `student/` (`1.jpg`, `2.jpg`, …); it gets `exercises.json` and `grading.json`. `npm run try:skill -- barem <folder>` needs only `test.pdf` or `test.docx` (and `notes.md` for the teacher's comments) and writes `barem.json` and `barem.docx`. Keep the folder outside the repo: it holds a student's pages.

## Compare the skills

`npm run compare:skills -- list`, then `npm run compare:skills -- run <folder> <code> <code> [--papers 2] [--parallel 2] [--ref origin/main]`: grades real math tests of the live site with the grading skill of `--ref` (default `origin/main`, what the live site runs; run `git fetch` first) (the old side, with the barem note it had, `OLD_BAREM_NOTES`, and no `subject.md`) and with this checkout's skill (the new side), exactly as the robot runs Claude, and writes `report.md` and `results.json` in the folder; it grades the first 2 graded class papers of each test unless `--papers` asks for more, to keep the Claude usage small (spec: any subject, "The math comparison"; `compareReport.ts` holds the rules of the verdict). It reads the live D1 and R2 through Wrangler with the user's own login, with SELECTs only, and needs `CLAUDE_CODE_OAUTH_TOKEN` like `try:skill`. The folder must be outside the repo: it gets the test, the barem and the students' pages (numbered, never named). Delete it after reading the report. Exit code 0: it passes; 2: it does not.

## Rules

- The robot's Claude reads only its work folder (`--tools "Read,Glob" --restricted`) and gets only the variables it needs to start (`claudeEnv` in `claude.ts`): never the robot key, never an API key. Student pages are untrusted input.
- `pandoc` reads a Word file that the teacher made, so it runs with `--sandbox` and only the variables it needs to start (`pandocEnv` in `workdir.ts`): never the robot key or the Claude token. `askClaude` (`tasks.ts`) refuses an answer that holds one of them, or a Claude token (`leaksSecret`), because the student sees Claude's text on the result page.
- `check.ts` runs before `npm ci`, and `run.ts` after `npm ci --omit=dev`: check.ts loads no package, and run.ts loads only zod. Import types from `shared/` with `import type`: an import with only `{ type X }` still loads its module. `check.test.ts` and `run.test.ts` prove both.
- The class analysis (`analyzeClass`) reads `GET /tests/:id/results` (students are "Elev 1" … "Elev n") and sends back the `version` of the grades it read, so an analysis made from grades that changed meanwhile is saved as out of date. Its work folder holds the skill and `class-results.json` only. A run tries an analysis once per test.
- Robot answers carry ids, counts, and file types, never names: a student's page goes out as `file-<id>`. The robot's logs are public: it logs through `log.ts` only ids, counts, durations, and error categories, never Claude's text or messages.

## Gotchas

- `claude --json-schema` refuses zod's default JSON Schema (draft 2020-12): give it `claudeJsonSchema()` from `shared/schemas.ts` (draft-07).
- Word files go through `pandoc -t markdown`, never `-t gfm`: GitHub's Markdown turns "a)" items into "1)", and the exercise names are lost.
- A Claude error prints JSON and exits with code 1; a refused login has `subtype: "success"` and `is_error: true`. `readOutcome` (`claude.ts`) reads them in that order; `fixtures/` holds real outputs. Claude Code writes files into `CLAUDE_CONFIG_DIR`: keep that folder next to the work folders, never inside one.
- Robot tests run the real API in-process (`test/robotWorld.ts`) and replace Claude with `scriptedClaude()` (`test/scriptedClaude.ts`). `workdir.test.ts` and `baremDocx.test.ts` also run the real pandoc when it is installed; CI installs the robot's pinned pandoc (`.github/scripts/install-pandoc.sh`), so they run there too.
- The robot's GitHub settings, its failures, and how to update the pinned Claude Code: `docs/deploy.md`.
