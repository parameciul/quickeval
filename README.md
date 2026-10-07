# QuickEval

A test platform for Laura Miron's math classes: classes and students, tests, student uploads, grading, and reports. Runs on Cloudflare Pages (Functions, D1, R2).

- Design: `docs/superpowers/specs/2026-10-06-quickeval-design.md`
- Developer guide: `AGENTS.md`

## Quick start (Windows, Node 24)

1. `npm install`, then `npm approve-scripts workerd esbuild`
2. Copy `.dev.vars.example` to `.dev.vars`
3. `npm run db:local`
4. `npm run dev:api` in one terminal and `npm run dev:web` in another
5. Open http://localhost:5173/admin/
6. To try the student page: make a test, click **Începe testul**, and open its link (http://localhost:5173/u/&lt;token&gt;)
