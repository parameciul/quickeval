# runner/AGENTS.md

The grading robot (spec §12), run by `.github/workflows/evaluate.yml`. The root `AGENTS.md` holds the project-wide rules; the robot's API side is in `server/AGENTS.md`.

## Structure

- `check.ts` (is there work?), `run.ts` (one run: lease, heartbeat, exercise lists, parallel gradings), `tasks.ts` (make an exercise list, grade one upload), `claude.ts` (starts Claude Code and reads its answer), `workdir.ts` (a task's work folder; Word files through pandoc), `api.ts` (the only code that calls `/api/runner`), `log.ts`, `trySkill.ts` (`npm run try:skill`).
- `fixtures/`: real Claude outputs. `test/`: the API in-process, a scripted Claude.
- `.claude/skills/evaluate-test/` (repo root): the grading skill (spec §13). The teacher may change its words; the robot copies it into every work folder. `skill.test.ts` checks the file and field names that the code needs.

## Try the skill

`npm run try:skill -- exercise-list <folder>`, then `npm run try:skill -- grade <folder>`: try the grading skill on this PC exactly as the robot runs it (spec §13). It needs `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) in the environment and never uses this PC's Claude login. The folder holds `test.pdf` or `test.docx`, `barem.pdf` or `barem.docx`, and the pages in `student/` (`1.jpg`, `2.jpg`, …); it gets `exercises.json` and `grading.json`. Keep the folder outside the repo: it holds a student's pages.

## Rules

- The robot's Claude reads only its work folder (`--tools "Read,Glob" --restricted`) and gets only the variables it needs to start (`claudeEnv` in `claude.ts`): never the robot key, never an API key. Student pages are untrusted input.
- `check.ts` runs before `npm ci`, and `run.ts` after `npm ci --omit=dev`: check.ts loads no package, and run.ts loads only zod. Import types from `shared/` with `import type`: an import with only `{ type X }` still loads its module. `check.test.ts` and `run.test.ts` prove both.
- Robot answers carry ids, counts, and file types, never names: a student's page goes out as `file-<id>`. The robot's logs are public: it logs through `log.ts` only ids, counts, durations, and error categories, never Claude's text or messages.

## Gotchas

- `claude --json-schema` refuses zod's default JSON Schema (draft 2020-12): give it `claudeJsonSchema()` from `shared/schemas.ts` (draft-07).
- Word files go through `pandoc -t markdown`, never `-t gfm`: GitHub's Markdown turns "a)" items into "1)", and the exercise names are lost.
- A Claude error prints JSON and exits with code 1; a refused login has `subtype: "success"` and `is_error: true`. `readOutcome` (`claude.ts`) reads them in that order; `fixtures/` holds real outputs. Claude Code writes files into `CLAUDE_CONFIG_DIR`: keep that folder next to the work folders, never inside one.
- Robot tests run the real API in-process (`test/robotWorld.ts`) and replace Claude with `scriptedClaude()` (`test/scriptedClaude.ts`). `workdir.test.ts` also runs the real pandoc when it is installed.
- The robot's GitHub settings, its failures, and how to update the pinned Claude Code: `docs/deploy.md`.
