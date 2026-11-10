# MQGrader: zoom and answer areas on the Verificare page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The last task (Check, live database, push) must run in the main session, not in a subagent:** it looks at the app in a browser, and every outward step (the live migration, push) needs the user's explicit yes.

**Goal:** On the Verificare page (and the Quick Try review, the same page), a click zooms the student's photo inside the middle pane, and the answer to check opens zoomed on where the robot found it, with an orange dashed border, its parts one by one, and a switch to turn the border off.

**Architecture:** The robot's grading answer gets, per item, `areas` (`{ page, x0, y0, x1, y1 }`, fractions of the page); `checkGrading` keeps the drawable ones (`drawableAreas`). Migration 0027 adds `evaluation_items.areas` (JSON), written with the grading and read with the paper (`EvaluationItemInfo.areas`). The middle pane (`ReviewPhoto`) shows a photo through `ZoomPhoto`: a view is a scale and a centre as fractions of the page (`zoom.ts`), drawn as one CSS transform, so nothing needs pixels; the border (`AnswerFrame`) is placed in the pane's own fractions from the same view.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Hono on Cloudflare Pages with D1 and R2, zod 4, Vitest, Testing Library. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-10-review-zoom-and-answer-areas-design.md` (approved by the user on 2026-11-10, after two spikes on real papers). Root `AGENTS.md`, `server/AGENTS.md`, `src/AGENTS.md` and `runner/AGENTS.md` hold the project rules.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`.
- One strict `tsconfig.json`. Relative imports name the `.ts`/`.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English.
- One migration, `migrations/0027_item_areas.sql`. It runs on the live database **before** the code reaches `main` (`docs/deploy.md`): the last task asks the user first.
- No student page, student PDF, robot text for the student or CSV gets the areas. Student pages do not change.
- Photos only: a PDF page keeps its frame and its "Deschide PDF-ul" link, with no zoom and no border.
- Orange only for what waits on the teacher: the border is `--orange-mark`, its label `--orange` on `--sheet`.
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root (this worktree), on the branch `feature/review-zoom-and-answer-areas`. Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone; the full run then counts as passed when its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact for the branch alone. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protozoom/z1` … `refs/protozoom/z4`, one per task, on `refs/protozoom/zbase` (the same files as `699943e`, the approved spec). After Task N, `git diff --stat refs/protozoom/zN HEAD -- . ':!docs/superpowers/plans'` prints nothing.
- The totals below are for a PC with pandoc. The steady `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building the prototype on 2026-11-10.

1. **A bad area never throws away a grading.** The zod shape of an area is plain numbers; `drawableAreas` (`shared/schemas.ts`) drops an area whose page is not a whole number from 1, whose corners are outside 0–1 or out of order, keeps at most 6 (`MAX_AREAS`) and rounds to 4 decimals. `areas` has `.default([])`, which zod 4 still marks required in the JSON Schema that Claude gets (checked by a test).
2. **The page count is the review's check.** `checkGrading` does not know the paper's pages; `drawnAreas` (`src/admin/reviewPage/areas.ts`) skips an area on a page the paper does not have, or on a PDF page, and sorts by page. The spec says so (Task 1 edits it).
3. **A view is three fractions.** The pane takes the photo's shape (`--page-ratio`, read on load; 3/4 before) and fits the screen's height (`100vh - 12rem`), so a fraction of the page is a fraction of the pane, the transform is `translate(%) scale()`, and the border is placed in `%`: no measuring, and jsdom tests read exact styles. Zoom from 1 to 6 (`MAX_SCALE`); a click zooms to 2.5; the wheel by `exp(-0.0015 × pixels)`, so a trackpad zooms smoothly.
4. **Mouse rules.** Only the left button pans or zooms; a press that moves under 4 px is a click; a click zooms only the whole page. A right click always shows the whole page and never opens the browser menu over the photo. The wheel is taken (preventDefault) only while it zooms or the page is zoomed: at the whole page, wheeling down scrolls the page. Esc goes through `isReviewKey` (the review's own key rules, moved into `src/admin/reviewPage/keys.ts`), so Esc in a bar panel only closes the panel. The image is `draggable={false}`; the pane has no `will-change`, so a zoomed page is drawn sharp.
5. **Which view shows.** The zoom is kept per (answer, file). An answer that opens shows its current part zoomed (`viewOfBox`: the area fills 75 % of the pane, at most `MAX_SCALE`); a page the teacher picks herself opens whole; "Partea anterioară"/"Partea următoare" open the part's page zoomed on it. Keys are ids (paper, item, file), so the list read every 10 s never resets the zoom, and the next point on the same page moves to its own area.
6. **The switch** "Arată chenarul" shows only for an answer with a drawable area, is kept in `localStorage` (`quickeval:reviewFrames`, read and written in try/catch, on by default). Off: no border, no parts, and the answer opens on its `page`, whole, as before.
7. **The label** is the exercise id ("II.1"), with " · partea 1 din 2" when there are parts; it sits above the border, or below when the border's top is in the pane's top 8 %.

## Review Focus

1. A trackpad or a mouse wheel: the zoom follows the size of each wheel step, and at the whole page a wheel down scrolls the page (Task 3, "zooms with the wheel around the pointer, and lets the page scroll at the whole page"); check the feel by hand in Task 5.
2. Esc while a bar panel is open closes only the panel and keeps the zoom (Task 3, "closes only the panel of the bar with Esc while the page is zoomed").
3. The list read every 10 s while the robot grades must not reset a zoom: the zoom's keys are ids, never objects (Task 4, "moves to the next point's area after a decision, on the same page", checks the keys move with the point).
4. An area on a PDF page or on a page the paper does not have is never drawn, and its answer opens as before (Task 4, "opens as before an answer with no area it can draw").
5. A border on the wrong exercise is the teacher's worst case: only the picked answer's areas are drawn, never another item's (Task 4's tests draw one item's border at a time); the robot is told to leave out an area it is not sure of (Task 1, the skill text).

---

### Before Task 1: The branch

- [ ] **Step 1: Make the branch and check the prototype**

Run: `git status --short --branch` and `git log --oneline -1`
Expected: a clean tree; HEAD `699943e Make the Quick Try review zoom and draw the answer areas as the Verificare page does` (or a later commit that only adds this plan).

Run: `git switch -c feature/review-zoom-and-answer-areas`
Expected: `Switched to a new branch 'feature/review-zoom-and-answer-areas'`.

Run: `git rev-parse --verify refs/protozoom/z4`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

### Task 1: The robot says where each answer is

The grading answer gets `areas` per item, `checkGrading` keeps the drawable ones, and the skill tells Claude how to give them.

**Files:**
- Modify: `shared/schemas.ts`, `.claude/skills/evaluate-test/SKILL.md`, `docs/superpowers/specs/2026-11-10-review-zoom-and-answer-areas-design.md`
- Test: `shared/schemas.test.ts`, `runner/skill.test.ts`, and the grading fixtures of `runner/api.test.ts`, `runner/quickTry.test.ts`, `runner/run.test.ts`, `runner/tasks.test.ts`, `runner/trySkill.test.ts` (they type a `GradingResult`, which now has `areas`)

**Interfaces:**
- Produces: `answerAreaSchema` and `type AnswerArea = { page: number; x0: number; y0: number; x1: number; y1: number }`; `gradingResultSchema` items `areas: AnswerArea[]` (default `[]`); `MAX_AREAS = 6`; `drawableAreas(areas: readonly AnswerArea[]): AnswerArea[]`; `GradedItem.areas: AnswerArea[]` — all in `shared/schemas.ts`.

- [ ] **Step 1: Edit `shared/schemas.test.ts`**

Find this block:

```ts
  LOW_CONFIDENCE,
  OUT_OF_RANGE,
```

Replace it with:

```ts
  LOW_CONFIDENCE,
  MAX_AREAS,
  OUT_OF_RANGE,
```

- [ ] **Step 2: Edit `shared/schemas.test.ts`**

Find this block:

```ts

  it('flags the whole grading when a page could not be read', () => {
```

Replace it with:

```ts

  it('keeps the areas of each answer, rounded to 4 decimals, and none for a grading made before them', () => {
    const area = { page: 2, x0: 0.123456, y0: 0.2, x1: 0.9, y1: 0.45 };
    const checked = checkGrading(grading([item('I.1', 4, { areas: [area] }), item('I.2', 2), item('II.1', 2, { areas: [] })]), LIST);
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items.map((graded) => graded.areas)).toEqual([[{ page: 2, x0: 0.1235, y0: 0.2, x1: 0.9, y1: 0.45 }], [], []]);
  });

  it.each([
    ['page 0', { page: 0, x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 }],
    ['a page that is not whole', { page: 1.5, x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 }],
    ['a corner past the page', { page: 1, x0: 0.1, y0: 0.1, x1: 1.2, y1: 0.5 }],
    ['a corner before the page', { page: 1, x0: -0.1, y0: 0.1, x1: 0.5, y1: 0.5 }],
    ['corners in the wrong order', { page: 1, x0: 0.5, y0: 0.1, x1: 0.1, y1: 0.5 }],
    ['an empty area', { page: 1, x0: 0.1, y0: 0.5, x1: 0.5, y1: 0.5 }],
  ])('drops an area with %s and keeps the grading', (_name, bad) => {
    const good = { page: 1, x0: 0, y0: 0, x1: 1, y1: 1 };
    const checked = checkGrading(grading([item('I.1', 4, { areas: [bad, good] }), item('I.2', 2), item('II.1', 2)]), LIST);
    if (!checked.ok) throw new Error(checked.reason);
    expect(checked.value.items[0]!.areas).toEqual([good]);
  });

  it(`keeps at most ${MAX_AREAS} areas of an answer`, () => {
    const areas = Array.from({ length: MAX_AREAS + 2 }, (_, i) => ({ page: i + 1, x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 }));
    const checked = checkGrading(grading([item('I.1', 4, { areas }), item('I.2', 2), item('II.1', 2)]), LIST);
    expect(checked.ok && checked.value.items[0]!.areas.map((area) => area.page)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('flags the whole grading when a page could not be read', () => {
```

- [ ] **Step 3: Edit `shared/schemas.test.ts`**

Find this block:

```ts
    expect(json.required).toEqual(['items', 'unreadable', 'summary', 'strengths', 'recommendations']);
  });
```

Replace it with:

```ts
    expect(json.required).toEqual(['items', 'unreadable', 'summary', 'strengths', 'recommendations']);
  });

  it('asks for the areas of every answer, so Claude never leaves them out', () => {
    const json = claudeJsonSchema(gradingResultSchema) as { properties: { items: { items: { required: string[]; properties: Record<string, { items: { required: string[] } }> } } } };
    const answer = json.properties.items.items;
    expect(answer.required).toContain('areas');
    expect(answer.properties.areas!.items.required).toEqual(['page', 'x0', 'y0', 'x1', 'y1']);
  });
```

- [ ] **Step 4: Edit `runner/skill.test.ts`**

Find this block:

```ts
import { describe, expect, it } from 'vitest';
import { classAnalysisSchema, exerciseListSchema, generatedBaremSchema, gradingResultSchema } from '../shared/schemas.ts';
import { SKILL_DIR } from './workdir.ts';
```

Replace it with:

```ts
import { describe, expect, it } from 'vitest';
import { answerAreaSchema, classAnalysisSchema, exerciseListSchema, generatedBaremSchema, gradingResultSchema } from '../shared/schemas.ts';
import { SKILL_DIR } from './workdir.ts';
```

- [ ] **Step 5: Edit `runner/skill.test.ts`**

Find this block:

```ts
      ...Object.keys(gradingResultSchema.shape.items.element.shape),
      ...Object.keys(classAnalysisSchema.shape),
```

Replace it with:

```ts
      ...Object.keys(gradingResultSchema.shape.items.element.shape),
      ...Object.keys(answerAreaSchema.shape),
      ...Object.keys(classAnalysisSchema.shape),
```

- [ ] **Step 6: Edit `runner/api.test.ts`**

Find this block:

```ts
const GRADING: GradingResult = {
  items: [{ exerciseId: 'I.1', points: 7.5, studentAnswer: '3/4', comment: 'Bine.', confidence: 'high', needsReview: false, reviewReason: '', page: 1 }],
  unreadable: [],
```

Replace it with:

```ts
const GRADING: GradingResult = {
  items: [{ exerciseId: 'I.1', points: 7.5, studentAnswer: '3/4', comment: 'Bine.', confidence: 'high', needsReview: false, reviewReason: '', page: 1, areas: [] }],
  unreadable: [],
```

- [ ] **Step 7: Edit `runner/quickTry.test.ts`**

Find this block:

```ts
const GRADING: GradingResult = {
  items: [{ exerciseId: 'I.1', points: 8, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '', page: 1 }],
  unreadable: [],
```

Replace it with:

```ts
const GRADING: GradingResult = {
  items: [{ exerciseId: 'I.1', points: 8, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '', page: 1, areas: [] }],
  unreadable: [],
```

- [ ] **Step 8: Edit `runner/run.test.ts`**

Find this block:

```ts
const GRADING: GradingResult = {
  items: [{ exerciseId: 'I.1', points: 8, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: true, reviewReason: 'Verifică.', page: 1 }],
  unreadable: [],
```

Replace it with:

```ts
const GRADING: GradingResult = {
  items: [{ exerciseId: 'I.1', points: 8, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: true, reviewReason: 'Verifică.', page: 1, areas: [] }],
  unreadable: [],
```

- [ ] **Step 9: Edit `runner/tasks.test.ts`**

Find this block:

```ts
  items: [
    { exerciseId: 'I.1', points: 4.5, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '', page: 1 },
    { exerciseId: 'II.1', points: 2, studentAnswer: 'x = 3', comment: 'Verifică semnul.', confidence: 'medium', needsReview: false, reviewReason: '', page: 1 },
  ],
```

Replace it with:

```ts
  items: [
    { exerciseId: 'I.1', points: 4.5, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '', page: 1, areas: [] },
    { exerciseId: 'II.1', points: 2, studentAnswer: 'x = 3', comment: 'Verifică semnul.', confidence: 'medium', needsReview: false, reviewReason: '', page: 1, areas: [] },
  ],
```

- [ ] **Step 10: Edit `runner/trySkill.test.ts`**

Find this block:

```ts
  items: [
    { exerciseId: 'I.1', points: 4.5, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '', page: 1 },
    { exerciseId: 'II.1', points: 2, studentAnswer: 'x = 3', comment: 'Verifică semnul.', confidence: 'low', needsReview: true, reviewReason: 'Scris neclar.', page: 1 },
  ],
```

Replace it with:

```ts
  items: [
    { exerciseId: 'I.1', points: 4.5, studentAnswer: '3/4', comment: 'Corect.', confidence: 'high', needsReview: false, reviewReason: '', page: 1, areas: [] },
    { exerciseId: 'II.1', points: 2, studentAnswer: 'x = 3', comment: 'Verifică semnul.', confidence: 'low', needsReview: true, reviewReason: 'Scris neclar.', page: 1, areas: [] },
  ],
```

- [ ] **Step 11: Run the tests to see them fail**

Run: `npx vitest run shared/schemas.test.ts runner/skill.test.ts runner/api.test.ts runner/quickTry.test.ts runner/run.test.ts runner/tasks.test.ts runner/trySkill.test.ts`
Expected:

These tests fail:

```text
× explains every field of both answers 8ms
× keeps the areas of each answer, rounded to 4 decimals, and none for a grading made before them 15ms
× drops an area with page 0 and keeps the grading 2ms
× drops an area with a page that is not whole and keeps the grading 1ms
× drops an area with a corner past the page and keeps the grading 1ms
× drops an area with a corner before the page and keeps the grading 1ms
× drops an area with corners in the wrong order and keeps the grading 1ms
× drops an area with an empty area and keeps the grading 1ms
× keeps at most undefined areas of an answer 1ms
× asks for the areas of every answer, so Claude never leaves them out 3ms
Test Files  2 failed | 5 passed (7)
Tests  10 failed | 163 passed (173)
⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯
```

- [ ] **Step 12: Edit `shared/schemas.ts`**

Find this block:

```ts

export const gradingResultSchema = z.object({
```

Replace it with:

```ts

// One block of the student's work for an exercise: its page, counted from 1 as
// in `student/`, and its corners as fractions (0 to 1) of the page's width (x)
// and height (y), from the top left corner of the page as it is shown. The
// shape only: `checkGrading` drops an area that cannot be drawn, so a bad
// area never throws away a grading.
export const answerAreaSchema = z.object({
  page: z.number(),
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});

export type AnswerArea = z.infer<typeof answerAreaSchema>;

export const gradingResultSchema = z.object({
```

- [ ] **Step 13: Edit `shared/schemas.ts`**

Find this block:

```ts
      page: z.number().int().min(0).default(0),
    }),
```

Replace it with:

```ts
      page: z.number().int().min(0).default(0),
      // Where the answer is on the pages, so the review can frame it; [] when
      // the student did not answer or the robot is not sure. Gradings made
      // before this field existed have none.
      areas: z.array(answerAreaSchema).default([]),
    }),
```

- [ ] **Step 14: Edit `shared/schemas.ts`**

Find this block:

```ts
const MAX_ANALYSIS_ENTRIES = 8;

```

Replace it with:

```ts
const MAX_ANALYSIS_ENTRIES = 8;
// Areas kept per exercise: the real papers tried needed at most 3.
export const MAX_AREAS = 6;

```

- [ ] **Step 15: Edit `shared/schemas.ts`**

Find this block:

```ts
    .slice(0, entries);
}
```

Replace it with:

```ts
    .slice(0, entries);
}

const fraction = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
const round4 = (value: number) => Math.round(value * 10000) / 10000;

// The areas that can be drawn: a page from 1, corners inside the page and in
// order (top left, then bottom right), at most MAX_AREAS, rounded to 4 decimals.
// An area on a page the paper does not have is left to the review to skip.
export function drawableAreas(areas: readonly AnswerArea[]): AnswerArea[] {
  return areas
    .filter((area) => Number.isInteger(area.page) && area.page >= 1)
    .filter((area) => [area.x0, area.y0, area.x1, area.y1].every(fraction) && area.x0 < area.x1 && area.y0 < area.y1)
    .slice(0, MAX_AREAS)
    .map((area) => ({ page: area.page, x0: round4(area.x0), y0: round4(area.y0), x1: round4(area.x1), y1: round4(area.y1) }));
}
```

- [ ] **Step 16: Edit `shared/schemas.ts`**

Find this block:

```ts
  page: number;
}
```

Replace it with:

```ts
  page: number;
  // Where the answer is on the pages (drawableAreas); [] when unknown.
  areas: AnswerArea[];
}
```

- [ ] **Step 17: Edit `shared/schemas.ts`**

Find this block:

```ts
      page: item.page,
    };
```

Replace it with:

```ts
      page: item.page,
      areas: drawableAreas(item.areas),
    };
```

- [ ] **Step 18: Edit `.claude/skills/evaluate-test/SKILL.md`**

Find this block:

```markdown
  - `page`: the number of the page in `student/` where the student's answer to this exercise is, counted from 1 (`page-01` is 1). If the answer is on more than one page, the page where it starts. 0 if the student did not answer or you cannot tell. The teacher's review opens this page.
- `unreadable`: the names of the pages that you could not read, for example `["student/page-02.jpg"]`; `[]` if none.
```

Replace it with:

```markdown
  - `page`: the number of the page in `student/` where the student's answer to this exercise is, counted from 1 (`page-01` is 1). If the answer is on more than one page, the page where it starts. 0 if the student did not answer or you cannot tell. The teacher's review opens this page.
  - `areas`: where the student's work for this exercise is on the pages, so the teacher's review can frame it. One entry for each separate block of the student's work: the statement's line when the student wrote the answer there, a solution lower on the page, the rest of it on another page. Each entry: `page`, counted from 1 as above, and the corners `x0`, `y0` (top left) and `x1`, `y1` (bottom right), each a fraction of the page's width (x) or height (y) from 0 to 1, measured from the top left corner of the photo as you see it. Frame only the student's handwriting for this exercise, with a small margin; do not include other exercises' work. Give `[]` when the student did not answer, and leave out any block you are not sure belongs to this exercise: a missing frame is better than a frame around the wrong exercise.
- `unreadable`: the names of the pages that you could not read, for example `["student/page-02.jpg"]`; `[]` if none.
```

- [ ] **Step 19: Edit `docs/superpowers/specs/2026-11-10-review-zoom-and-answer-areas-design.md`**

Find this block:

```markdown
- The skill text (`.claude/skills/evaluate-test/SKILL.md`, mode "grade") gets the rule used in the spike: one area per separate block of the student's work for that exercise (the statement's line when the answer is written there, a solution lower on the page, the rest on another page); frame only that exercise's handwriting with a small margin; leave out any block not sure to belong to it, because a missing frame is better than a frame around the wrong exercise. `skill.test.ts` checks the field name.
- `checkGrading` keeps the areas: it drops an area whose page is outside the paper's pages, whose numbers are outside 0–1, or whose corners are not in order (x0 < x1, y0 < y1). It caps the number of areas per item (builder picks the cap; the spike never passed 3).
- The item's `page` stays as it is. When an item has areas, the review uses the page of its first area.
```

Replace it with:

```markdown
- The skill text (`.claude/skills/evaluate-test/SKILL.md`, mode "grade") gets the rule used in the spike: one area per separate block of the student's work for that exercise (the statement's line when the answer is written there, a solution lower on the page, the rest on another page); frame only that exercise's handwriting with a small margin; leave out any block not sure to belong to it, because a missing frame is better than a frame around the wrong exercise. `skill.test.ts` checks the field name.
- `checkGrading` keeps the areas (`drawableAreas`, `shared/schemas.ts`): it drops an area whose page is not a whole number from 1, whose numbers are outside 0–1, or whose corners are not in order (x0 < x1, y0 < y1), keeps at most 6 per item (`MAX_AREAS`; the spike never passed 3), and rounds the numbers to 4 decimals. A bad area never throws away the grading. `checkGrading` does not know how many pages the paper has: the review skips an area on a page the paper does not have.
- The item's `page` stays as it is. When an item has areas, the review uses the page of its first area.
```

- [ ] **Step 20: Type check and run the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit 0).

Run: `npm test`
Expected:

```text
Test Files  163 passed | 1 skipped (164)
Tests  2409 passed | 3 skipped (2412)
```

- [ ] **Step 21: Commit**

```bash
git add shared/schemas.ts shared/schemas.test.ts .claude/skills/evaluate-test/SKILL.md runner/skill.test.ts runner/api.test.ts runner/quickTry.test.ts runner/run.test.ts runner/tasks.test.ts runner/trySkill.test.ts docs/superpowers/specs/2026-11-10-review-zoom-and-answer-areas-design.md
git commit -m "Ask the robot where each answer is and keep the areas that can be drawn"
```

Then: `git diff --stat refs/protozoom/z1 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 2: Save the areas and give them to the teacher's review

Migration 0027, the grading write, the paper read, and `EvaluationItemInfo.areas`. The student's result keeps its own fields (`toStudentEvaluation`), so no student page gets them.

**Files:**
- Create: `migrations/0027_item_areas.sql`
- Modify: `server/db/runner.ts`, `server/db/evaluations.ts`, `shared/api.ts`, `src/test/fakeApi.ts`
- Test: `server/routes/runnerGrading.test.ts`, `server/routes/quickTryLink.test.ts`, `server/routes/submissions.test.ts`

**Interfaces:**
- Consumes: `AnswerArea`, `GradedItem.areas` (Task 1).
- Produces: `evaluation_items.areas TEXT NOT NULL DEFAULT '[]'`; `EvaluationItemInfo.areas: AnswerArea[]` (`shared/api.ts`); `fakeItem` gives `areas: []` unless told otherwise.

- [ ] **Step 1: Edit `server/routes/runnerGrading.test.ts`**

Find this block:

```ts
    expect(results.map((row) => [row.exercise_id, row.page])).toEqual([['I.1', 0], ['II.1', 2]]);
  });
```

Replace it with:

```ts
    expect(results.map((row) => [row.exercise_id, row.page])).toEqual([['I.1', 0], ['II.1', 2]]);
  });

  it('keeps the areas of each answer for the teacher, and [] when the robot gave none', async () => {
    const id = await upload(0, '2026-10-07T08:10:00.000Z', 2);
    await claim();
    const graded = result([4, 2]) as { items: Record<string, unknown>[] };
    const area = { page: 2, x0: 0.1, y0: 0.25, x1: 0.8, y1: 0.5 };
    graded.items[1]!.areas = [area, { page: 1, x0: 0.9, y0: 0.1, x1: 0.2, y1: 0.3 }];
    expect((await sendResult(id, { ok: true, result: graded, model: 'm' })).status).toBe(200);
    const read = await api.request('GET', `/api/admin/submissions/${id}`);
    expect(read.body.submission.evaluation.items.map((item: { exerciseId: string; areas: unknown }) => [item.exerciseId, item.areas])).toEqual([
      ['I.1', []],
      ['II.1', [area]],
    ]);
  });
```

- [ ] **Step 2: Edit `server/routes/quickTryLink.test.ts`**

Find this block:

```ts
    await addEvaluation(api, submissionId, { items: [{ needsReview: true }] });
    const read = await api.request('GET', `/api/try/${token}/submissions/${submissionId}`);
    expect(read.status).toBe(200);
    const itemId = read.body.submission.evaluation.items[0].id as number;
```

Replace it with:

```ts
    await addEvaluation(api, submissionId, { items: [{ needsReview: true }] });
    const area = { page: 1, x0: 0.1, y0: 0.2, x1: 0.6, y1: 0.4 };
    await api.db.prepare('UPDATE evaluation_items SET areas = ?').bind(JSON.stringify([area])).run();
    const read = await api.request('GET', `/api/try/${token}/submissions/${submissionId}`);
    expect(read.status).toBe(200);
    expect(read.body.submission.evaluation.items[0].areas).toEqual([area]);
    const itemId = read.body.submission.evaluation.items[0].id as number;
```

- [ ] **Step 3: Edit `server/routes/submissions.test.ts`**

Find this block:

```ts
      (await api.db.prepare('SELECT id FROM evaluation_items WHERE exercise_id = ?').bind(exerciseId).first<{ id: number }>())!.id;
    const item = { label: 'Exercițiu', maxPoints: 1, aiPoints: 1, points: 1, studentAnswer: 'r', comment: 'c', confidence: 'high', page: 0 };

```

Replace it with:

```ts
      (await api.db.prepare('SELECT id FROM evaluation_items WHERE exercise_id = ?').bind(exerciseId).first<{ id: number }>())!.id;
    const item = { label: 'Exercițiu', maxPoints: 1, aiPoints: 1, points: 1, studentAnswer: 'r', comment: 'c', confidence: 'high', page: 0, areas: [] };

```

- [ ] **Step 4: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
    page: 0,
    reviewed: false,
```

Replace it with:

```ts
    page: 0,
    areas: [],
    reviewed: false,
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run server/routes/runnerGrading.test.ts server/routes/quickTryLink.test.ts server/routes/submissions.test.ts`
Expected:

These tests fail:

```text
× reads the graded paper and takes a correction, without asking for a class analysis 257ms
× returns the graded result with its items in barem order 557ms
× keeps the areas of each answer for the teacher, and [] when the robot gave none 497ms
Test Files  3 failed (3)
Tests  3 failed | 56 passed (59)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
```

- [ ] **Step 6: Create `migrations/0027_item_areas.sql`**

```sql
-- Where the student's answer to an exercise is on the pages, as the robot saw
-- it: a JSON list of { page, x0, y0, x1, y1 } (shared/schemas.ts), so the
-- review frames the answer. '[]' when the robot gave none.

ALTER TABLE evaluation_items ADD COLUMN areas TEXT NOT NULL DEFAULT '[]';
```

- [ ] **Step 7: Edit `server/db/runner.ts`**

Find this block:

```ts
        `INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason, page)
         SELECT e.id, json_extract(j.value, '$.exerciseId'), json_extract(j.value, '$.position'), json_extract(j.value, '$.label'),
```

Replace it with:

```ts
        `INSERT INTO evaluation_items (evaluation_id, exercise_id, position, label, max_points, ai_points, points,
           student_answer, comment, confidence, needs_review, review_reason, page, areas)
         SELECT e.id, json_extract(j.value, '$.exerciseId'), json_extract(j.value, '$.position'), json_extract(j.value, '$.label'),
```

- [ ] **Step 8: Edit `server/db/runner.ts`**

Find this block:

```ts
           json_extract(j.value, '$.studentAnswer'), json_extract(j.value, '$.comment'), json_extract(j.value, '$.confidence'),
           json_extract(j.value, '$.needsReview'), json_extract(j.value, '$.reviewReason'), json_extract(j.value, '$.page')
         FROM json_each(?) j JOIN evaluations e ON e.submission_id = ?
```

Replace it with:

```ts
           json_extract(j.value, '$.studentAnswer'), json_extract(j.value, '$.comment'), json_extract(j.value, '$.confidence'),
           json_extract(j.value, '$.needsReview'), json_extract(j.value, '$.reviewReason'), json_extract(j.value, '$.page'),
           COALESCE(json_extract(j.value, '$.areas'), '[]')
         FROM json_each(?) j JOIN evaluations e ON e.submission_id = ?
```

- [ ] **Step 9: Edit `server/db/evaluations.ts`**

Find this block:

```ts
import type { EvaluationInfo, EvaluationItemInfo, ItemChange } from '../../shared/api.ts';
import type { Confidence } from '../../shared/schemas.ts';
import { round2 } from '../../shared/scoring.ts';
```

Replace it with:

```ts
import type { EvaluationInfo, EvaluationItemInfo, ItemChange } from '../../shared/api.ts';
import type { AnswerArea, Confidence } from '../../shared/schemas.ts';
import { round2 } from '../../shared/scoring.ts';
```

- [ ] **Step 10: Edit `server/db/evaluations.ts`**

Find this block:

```ts
  page: number;
  reviewed_at: string | null;
```

Replace it with:

```ts
  page: number;
  // JSON: AnswerArea[].
  areas: string;
  reviewed_at: string | null;
```

- [ ] **Step 11: Edit `server/db/evaluations.ts`**

Find this block:

```ts
    page: row.page,
    reviewed: row.reviewed_at !== null,
```

Replace it with:

```ts
    page: row.page,
    areas: JSON.parse(row.areas) as AnswerArea[],
    reviewed: row.reviewed_at !== null,
```

- [ ] **Step 12: Edit `server/db/evaluations.ts`**

Find this block:

```ts
        `SELECT i.id, i.exercise_id, i.label, i.max_points, i.ai_points, i.points, i.student_answer, i.comment, i.confidence,
           i.needs_review, i.review_reason, i.page, i.reviewed_at, i.changed_by_teacher
         FROM evaluation_items i JOIN evaluations ev ON ev.id = i.evaluation_id
```

Replace it with:

```ts
        `SELECT i.id, i.exercise_id, i.label, i.max_points, i.ai_points, i.points, i.student_answer, i.comment, i.confidence,
           i.needs_review, i.review_reason, i.page, i.areas, i.reviewed_at, i.changed_by_teacher
         FROM evaluation_items i JOIN evaluations ev ON ev.id = i.evaluation_id
```

- [ ] **Step 13: Edit `shared/api.ts`**

Find this block:

```ts
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
import { type ClassAnalysis, TEXT_LIMITS, type Confidence } from './schemas.ts';
import { isValidSchoolYear } from './schoolYear.ts';
```

Replace it with:

```ts
import { MAX_PARALLEL_AGENTS, type RunSummary } from './runner.ts';
import { type AnswerArea, type ClassAnalysis, TEXT_LIMITS, type Confidence } from './schemas.ts';
import { isValidSchoolYear } from './schoolYear.ts';
```

- [ ] **Step 14: Edit `shared/api.ts`**

Find this block:

```ts
  page: number;
  // The teacher marked the item as checked.
```

Replace it with:

```ts
  page: number;
  // Where the answer is on the pages, as the robot saw it; [] when it gave none.
  // Only the teacher's review reads it: no student page gets it.
  areas: AnswerArea[];
  // The teacher marked the item as checked.
```

- [ ] **Step 15: Type check and run the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit 0).

Run: `npm test`
Expected:

```text
Test Files  163 passed | 1 skipped (164)
Tests  2410 passed | 3 skipped (2413)
```

- [ ] **Step 16: Commit**

```bash
git add migrations/0027_item_areas.sql server/db/runner.ts server/db/evaluations.ts shared/api.ts src/test/fakeApi.ts server/routes/runnerGrading.test.ts server/routes/quickTryLink.test.ts server/routes/submissions.test.ts
git commit -m "Save where each answer is and give it to the teacher's review"
```

Then: `git diff --stat refs/protozoom/z2 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 3: Zoom the page inside the middle pane

`ZoomPhoto` replaces the link that opened the photo in a new tab: a left click zooms in on the point, the wheel zooms around the pointer, a drag moves the zoomed page, and a right click, Esc or "Toată pagina" shows the whole page. The review's key rules move to `keys.ts` so Esc follows them.

**Files:**
- Create: `src/admin/reviewPage/zoom.ts`, `src/admin/reviewPage/zoom.test.ts`, `src/admin/reviewPage/keys.ts`, `src/admin/reviewPage/ZoomPhoto.tsx`
- Modify: `src/admin/reviewPage/ReviewPhoto.tsx`, `src/admin/pages/ReviewPage.tsx`, `src/ui/brand.css`
- Test: `src/admin/reviewPage/zoom.test.ts`, `src/admin/pages/ReviewPage.test.tsx`

**Interfaces:**
- Produces: in `zoom.ts`: `interface ZoomView { scale: number; cx: number; cy: number }`, `WHOLE_PAGE`, `CLICK_SCALE = 2.5`, `MAX_SCALE = 6`, `clampView`, `isZoomed`, `zoomInAt(view, px, py)`, `zoomAround(view, scale, px, py)`, `wheelScale(scale, deltaPixels)`, `panBy(view, dx, dy)`, `layerTransform(view): string`. In `keys.ts`: `isTyping`, `BAR_BOXES`, `isReviewKey(event): boolean`. `ZoomPhoto({ src, alt, view, onView, children })` (the pane carries `data-testid="zoom-pane"`; its first child is the layer with the transform).

- [ ] **Step 1: Edit `src/admin/pages/ReviewPage.test.tsx`**

Find this block:

```tsx
  });
});
```

Replace it with:

```tsx
  });
});

// The page of the paper zooms inside the middle pane. jsdom lays nothing out:
// the pane is given a size of 400 × 400 px.
const pane = () => screen.getByTestId('zoom-pane');
const layer = () => pane().firstElementChild as HTMLElement;
function sizedPane(): HTMLElement {
  const element = pane();
  element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400, x: 0, y: 0, toJSON: () => ({}) });
  return element;
}
function clickAt(element: HTMLElement, clientX: number, clientY: number, button = 0) {
  fireEvent.pointerDown(element, { pointerId: 1, button, clientX, clientY });
  fireEvent.pointerUp(element, { pointerId: 1, button, clientX, clientY });
}
const WHOLE = 'translate(0%, 0%) scale(1)';

describe('the zoom of a page', () => {
  it('zooms in where the photo is clicked, moves with a drag, and shows the whole page with "Toată pagina"', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · pagina 1 din 1');
    const photo = sizedPane();
    expect(layer().style.transform).toBe(WHOLE);
    expect(screen.queryByRole('button', { name: 'Toată pagina' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Pagina 1 a lucrării/ })).not.toBeInTheDocument();

    clickAt(photo, 100, 150);
    expect(layer().style.transform).toBe('translate(-12.5%, -43.75%) scale(2.5)');
    // A click on the zoomed page does nothing.
    clickAt(photo, 300, 300);
    expect(layer().style.transform).toBe('translate(-12.5%, -43.75%) scale(2.5)');
    fireEvent.pointerDown(photo, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(photo, { pointerId: 1, button: 0, clientX: 240, clientY: 200 });
    fireEvent.pointerUp(photo, { pointerId: 1, button: 0, clientX: 240, clientY: 200 });
    expect(layer().style.transform).toBe('translate(-2.5%, -43.75%) scale(2.5)');

    await userEvent.click(screen.getByRole('button', { name: 'Toată pagina' }));
    expect(layer().style.transform).toBe(WHOLE);
    expect(screen.queryByRole('button', { name: 'Toată pagina' })).not.toBeInTheDocument();
  });

  it('shows the whole page again with a right click or Esc, and a right button never zooms', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · pagina 1 din 1');
    const photo = sizedPane();
    clickAt(photo, 200, 200, 2);
    expect(layer().style.transform).toBe(WHOLE);
    clickAt(photo, 200, 200);
    // The browser's menu does not open over the photo.
    expect(fireEvent.contextMenu(photo)).toBe(false);
    expect(layer().style.transform).toBe(WHOLE);
    clickAt(photo, 200, 200);
    await userEvent.keyboard('{Escape}');
    expect(layer().style.transform).toBe(WHOLE);
  });

  it('closes only the panel of the bar with Esc while the page is zoomed', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · pagina 1 din 1');
    clickAt(sizedPane(), 200, 200);
    await userEvent.click(await screen.findByRole('button', { name: /^De făcut/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Ce ai de făcut' })).not.toBeInTheDocument();
    expect(layer().style.transform).toBe('translate(-75%, -75%) scale(2.5)');
  });

  it('zooms with the wheel around the pointer, and lets the page scroll at the whole page', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=41`, apiWith());
    await screen.findByText('Ion Popa · pagina 1 din 1');
    const photo = sizedPane();
    expect(fireEvent.wheel(photo, { deltaY: 100, clientX: 200, clientY: 200 })).toBe(true);
    expect(layer().style.transform).toBe(WHOLE);
    expect(fireEvent.wheel(photo, { deltaY: -200, clientX: 200, clientY: 200 })).toBe(false);
    expect(layer().style.transform).toBe('translate(-17.493%, -17.493%) scale(1.35)');
  });

  it('opens another page whole, and a PDF page has no zoom', async () => {
    renderAdmin(`${PAGE}?lucrare=11&punct=pagini`, apiWith());
    await screen.findByText('Ana Pop · pagina 2 din 3');
    clickAt(sizedPane(), 200, 200);
    expect(layer().style.transform).not.toBe(WHOLE);
    await userEvent.keyboard('1');
    expect(screen.getByText('Ana Pop · pagina 1 din 3')).toBeInTheDocument();
    expect(layer().style.transform).toBe(WHOLE);
    await userEvent.keyboard('3');
    expect(screen.queryByTestId('zoom-pane')).not.toBeInTheDocument();
    expect(screen.getByTitle('Pagina 3 a lucrării')).toHaveAttribute('src', submissionFileUrl(11, 103));
    expect(screen.queryByRole('button', { name: 'Toată pagina' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Create `src/admin/reviewPage/zoom.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { CLICK_SCALE, clampView, layerTransform, MAX_SCALE, panBy, WHOLE_PAGE, wheelScale, zoomAround, zoomInAt } from './zoom.ts';

describe('the zoom of a page', () => {
  it('zooms in on the point clicked', () => {
    expect(zoomInAt(WHOLE_PAGE, 0.25, 0.375)).toEqual({ scale: CLICK_SCALE, cx: 0.25, cy: 0.375 });
  });

  it('keeps the page over the whole pane near its edges', () => {
    expect(zoomInAt(WHOLE_PAGE, 0, 1)).toEqual({ scale: CLICK_SCALE, cx: 0.2, cy: 0.8 });
    expect(clampView({ scale: 0.5, cx: 0.1, cy: 0.9 })).toEqual(WHOLE_PAGE);
    expect(clampView({ scale: 20, cx: 0.5, cy: 0.5 }).scale).toBe(MAX_SCALE);
  });

  it('keeps the point under the pointer where it is when the wheel zooms', () => {
    const view = zoomAround(WHOLE_PAGE, 2, 0.3, 0.6);
    expect(view.scale).toBe(2);
    expect(view.cx + (0.3 - 0.5) / view.scale).toBeCloseTo(0.3);
    expect(view.cy + (0.6 - 0.5) / view.scale).toBeCloseTo(0.6);
  });

  it('zooms in when the wheel turns up and out when it turns down, a little per pixel', () => {
    expect(wheelScale(2, -100)).toBeGreaterThan(2);
    expect(wheelScale(2, 100)).toBeLessThan(2);
    expect(wheelScale(2, -4)).toBeLessThan(2.02);
    expect(zoomAround(WHOLE_PAGE, wheelScale(1, 100), 0.5, 0.5)).toEqual(WHOLE_PAGE);
  });

  it('moves the zoomed page with the pointer', () => {
    expect(panBy({ scale: 2.5, cx: 0.5, cy: 0.5 }, 0.1, -0.05)).toEqual({ scale: 2.5, cx: 0.46, cy: 0.52 });
    expect(panBy({ scale: 2.5, cx: 0.5, cy: 0.5 }, -1, 0).cx).toBe(0.8);
  });

  it('turns a view into the transform of the page layer', () => {
    expect(layerTransform(WHOLE_PAGE)).toBe('translate(0%, 0%) scale(1)');
    expect(layerTransform({ scale: 2.5, cx: 0.25, cy: 0.375 })).toBe('translate(-12.5%, -43.75%) scale(2.5)');
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/admin/reviewPage/zoom.test.ts src/admin/pages/ReviewPage.test.tsx`
Expected:

These tests fail:

```text
× zooms in where the photo is clicked, moves with a drag, and shows the whole page with "Toată pagina" 70ms
× shows the whole page again with a right click or Esc, and a right button never zooms 59ms
× closes only the panel of the bar with Esc while the page is zoomed 64ms
× zooms with the wheel around the pointer, and lets the page scroll at the whole page 72ms
× opens another page whole, and a PDF page has no zoom 62ms
Test Files  2 failed (2)
Tests  5 failed | 28 passed (33)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
```

- [ ] **Step 4: Create `src/admin/reviewPage/zoom.ts`**

```ts
// The zoom of a page in the review's middle pane. A view is the zoom `scale`
// (1 shows the whole page) and the point of the page at the middle of the
// pane (`cx`, `cy`), as fractions (0 to 1) of the page's width and height.
// The pane has the page's own shape, so a fraction of the page is also a
// fraction of the pane at scale 1, and nothing here needs pixels.
export interface ZoomView {
  scale: number;
  cx: number;
  cy: number;
}

export const WHOLE_PAGE: ZoomView = { scale: 1, cx: 0.5, cy: 0.5 };
// A click zooms this much: enough to read handwriting on a phone photo.
export const CLICK_SCALE = 2.5;
export const MAX_SCALE = 6;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// The page always covers the pane: its middle stays far enough from the edges.
export function clampView(view: ZoomView): ZoomView {
  const scale = clamp(view.scale, 1, MAX_SCALE);
  const half = 0.5 / scale;
  return { scale, cx: clamp(view.cx, half, 1 - half), cy: clamp(view.cy, half, 1 - half) };
}

export const isZoomed = (view: ZoomView) => view.scale > 1;

// The point of the page under a point of the pane (fractions of the pane).
function pageAt(view: ZoomView, px: number, py: number): { x: number; y: number } {
  return { x: view.cx + (px - 0.5) / view.scale, y: view.cy + (py - 0.5) / view.scale };
}

// A click on the whole page: zoom in, centred on the point clicked.
export function zoomInAt(view: ZoomView, px: number, py: number): ZoomView {
  const { x, y } = pageAt(view, px, py);
  return clampView({ scale: CLICK_SCALE, cx: x, cy: y });
}

// The wheel: a new scale, and the point under the pointer stays under it.
export function zoomAround(view: ZoomView, scale: number, px: number, py: number): ZoomView {
  const { x, y } = pageAt(view, px, py);
  const next = clamp(scale, 1, MAX_SCALE);
  return clampView({ scale: next, cx: x - (px - 0.5) / next, cy: y - (py - 0.5) / next });
}

// The wheel's step: about 1.0015 per pixel scrolled (a mouse notch of 100 px
// zooms by about 1.16), so a trackpad's many small steps zoom smoothly too.
export function wheelScale(scale: number, deltaPixels: number): number {
  return scale * Math.exp(-deltaPixels * 0.0015);
}

// A drag: the page follows the pointer. `dx`, `dy` are fractions of the pane.
export function panBy(view: ZoomView, dx: number, dy: number): ZoomView {
  return clampView({ ...view, cx: view.cx - dx / view.scale, cy: view.cy - dy / view.scale });
}

// The CSS transform of the page's layer (origin at its top left corner): a
// translate in % of the layer, which has the pane's size.
export function layerTransform(view: ZoomView): string {
  const tx = (0.5 - view.cx * view.scale) * 100;
  const ty = (0.5 - view.cy * view.scale) * 100;
  return `translate(${round(tx)}%, ${round(ty)}%) scale(${round(view.scale)})`;
}

const round = (value: number) => Math.round(value * 1000) / 1000;
```

- [ ] **Step 5: Create `src/admin/reviewPage/keys.ts`**

```ts
// Keys on the review page act only when they are not typed into a field and
// not pressed in what opens over the page from the bars.

// A key typed in a field is text, not a command.
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

// What opens over the page from the bars (a panel, the phone menu, the account
// menu) and the button of one while it is open: a key there is not for the
// review. A closed panel's button, where the focus goes back, is.
export const BAR_BOXES = '.panel, .phone-menu, .user-menu, [aria-expanded="true"]';

// A key that the review may take: not typed, not in what opened from the bars.
export function isReviewKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || isTyping(event.target)) return false;
  return !(event.target instanceof Element && event.target.closest(BAR_BOXES));
}
```

- [ ] **Step 6: Create `src/admin/reviewPage/ZoomPhoto.tsx`**

```tsx
import { type CSSProperties, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { isReviewKey } from './keys.ts';
import { isZoomed, layerTransform, panBy, WHOLE_PAGE, wheelScale, zoomAround, zoomInAt, type ZoomView } from './zoom.ts';

// A page of the paper that zooms inside the middle pane: a left click zooms in
// on the point clicked, the wheel zooms around the pointer, a drag moves the
// zoomed page, and a right click or Esc shows the whole page again. The view
// belongs to the caller, who also shows "Toată pagina". `children` are drawn
// over the page (the border of an answer), in the pane's own coordinates.
export function ZoomPhoto({ src, alt, view, onView, children }: { src: string; alt: string; view: ZoomView; onView: (view: ZoomView) => void; children?: ReactNode }) {
  const pane = useRef<HTMLDivElement>(null);
  // Width / height of the photo: the pane takes its shape. A phone page until it loads.
  const [ratio, setRatio] = useState(3 / 4);
  const zoomed = isZoomed(view);
  // The drag under way: where it started, and whether it moved yet.
  const drag = useRef<{ id: number; x: number; y: number; view: ZoomView; moved: boolean } | null>(null);
  // The handlers below are set once; they read the current view here.
  const current = useRef({ view, onView });
  current.current = { view, onView };

  // The point of the pane under the pointer, as fractions of the pane.
  const at = (clientX: number, clientY: number) => {
    const rect = pane.current!.getBoundingClientRect();
    return { px: rect.width ? (clientX - rect.left) / rect.width : 0.5, py: rect.height ? (clientY - rect.top) / rect.height : 0.5, rect };
  };

  // The wheel zooms; the page scrolls only at the whole page, wheeling out.
  useEffect(() => {
    const element = pane.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const { view: now, onView: set } = current.current;
      const { px, py, rect } = at(event.clientX, event.clientY);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height || 800 : 1;
      const next = zoomAround(now, wheelScale(now.scale, event.deltaY * unit), px, py);
      if (!isZoomed(now) && !isZoomed(next)) return;
      event.preventDefault();
      set(next);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  // Esc shows the whole page, unless it was typed in a field or closes a panel.
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isReviewKey(event)) return;
      event.preventDefault();
      current.current.onView(WHOLE_PAGE);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // A few pixels of a shaking hand are still a click.
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    start.moved = true;
    if (!isZoomed(start.view)) return;
    const { rect } = at(event.clientX, event.clientY);
    if (rect.width && rect.height) onView(panBy(start.view, dx / rect.width, dy / rect.height));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    drag.current = null;
    // A click zooms in on the whole page; on a zoomed page it does nothing.
    if (!start.moved && !isZoomed(start.view)) {
      const { px, py } = at(event.clientX, event.clientY);
      onView(zoomInAt(start.view, px, py));
    }
  };

  const style = { '--page-ratio': ratio } as CSSProperties;
  return (
    <div
      ref={pane}
      className={zoomed ? 'zoom-pane is-zoomed' : 'zoom-pane'}
      style={style}
      title={zoomed ? undefined : 'Clic pentru mărire'}
      data-testid="zoom-pane"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (zoomed) onView(WHOLE_PAGE);
      }}
    >
      <div className="zoom-layer" style={{ transform: layerTransform(view) }}>
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
          }}
        />
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 7: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
import type { SubmissionDetail } from '../../../shared/api.ts';
```

Replace it with:

```tsx
import { useState } from 'react';
import type { SubmissionDetail } from '../../../shared/api.ts';
```

- [ ] **Step 8: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
import { useApi } from '../ApiContext.tsx';

// The middle pane of the review: one page of the paper at a time, with the
// page switch. No marks on the photo: the robot does not say where an answer
// is (redesign spec §7, decision 27). A photo opens full size on a click.
export function ReviewPhoto({ submission, page, onPage }: { submission: SubmissionDetail; page: number; onPage: (page: number) => void }) {
```

Replace it with:

```tsx
import { useApi } from '../ApiContext.tsx';
import { isZoomed, WHOLE_PAGE, type ZoomView } from './zoom.ts';
import { ZoomPhoto } from './ZoomPhoto.tsx';

// The middle pane of the review: one page of the paper at a time, with the
// page switch. A photo zooms inside the pane (ZoomPhoto); "Toată pagina", a
// right click or Esc shows the whole page again. A PDF shows in a frame.
export function ReviewPhoto({ submission, page, onPage }: { submission: SubmissionDetail; page: number; onPage: (page: number) => void }) {
```

- [ ] **Step 9: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
  const files = submission.files;
  if (files.length === 0) {
    return (
```

Replace it with:

```tsx
  const files = submission.files;
  const index = Math.min(Math.max(page, 0), Math.max(files.length - 1, 0));
  const file = files[index];
  // The zoom of the page shown: another page opens whole.
  const zoomKey = `${submission.id}:${file?.id ?? ''}`;
  const [zoom, setZoom] = useState<{ key: string; view: ZoomView } | null>(null);
  const view = zoom?.key === zoomKey ? zoom.view : WHOLE_PAGE;
  const setView = (next: ZoomView) => setZoom({ key: zoomKey, view: next });

  if (!file) {
    return (
```

- [ ] **Step 10: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
  }
  const index = Math.min(Math.max(page, 0), files.length - 1);
  const file = files[index]!;
  const url = submissionFileUrl(submission.id, file.id, base);
  const caption = `${submission.studentName} · pagina ${index + 1} din ${files.length}`;
  return (
```

Replace it with:

```tsx
  }
  const url = submissionFileUrl(submission.id, file.id, base);
  const caption = `${submission.studentName} · pagina ${index + 1} din ${files.length}`;
  const photo = file.contentType.startsWith('image/');
  return (
```

- [ ] **Step 11: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
        <figcaption>{caption}</figcaption>
        {files.length > 1 && (
```

Replace it with:

```tsx
        <figcaption>{caption}</figcaption>
        {photo && isZoomed(view) && (
          <button type="button" className="button-quiet button-small" onClick={() => setView(WHOLE_PAGE)}>
            Toată pagina
          </button>
        )}
        {files.length > 1 && (
```

- [ ] **Step 12: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
      </div>
      {file.contentType.startsWith('image/') ? (
        <a href={url} target="_blank" rel="noopener" title="Deschide poza mare">
          <img src={url} alt={`Pagina ${index + 1} a lucrării`} />
        </a>
      ) : (
```

Replace it with:

```tsx
      </div>
      {photo ? (
        <ZoomPhoto src={url} alt={`Pagina ${index + 1} a lucrării`} view={view} onView={setView} />
      ) : (
```

- [ ] **Step 13: Edit `src/admin/pages/ReviewPage.tsx`**

Find this block:

```tsx
import { ReviewQueue } from '../reviewPage/ReviewQueue.tsx';
import {
```

Replace it with:

```tsx
import { ReviewQueue } from '../reviewPage/ReviewQueue.tsx';
import { isReviewKey } from '../reviewPage/keys.ts';
import {
```

- [ ] **Step 14: Edit `src/admin/pages/ReviewPage.tsx`**

Find this block:

```tsx
}

// A key typed in a field is text, not a command.
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

// What opens over the page from the bars (a panel, the phone menu, the account
// menu) and the button of one while it is open: a key there is not for the
// review. A closed panel's button, where the focus goes back, is.
const BAR_BOXES = '.panel, .phone-menu, .user-menu, [aria-expanded="true"]';

```

Replace it with:

```tsx
}

```

- [ ] **Step 15: Edit `src/admin/pages/ReviewPage.tsx`**

Find this block:

```tsx
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || isTyping(event.target)) return;
      if (event.target instanceof Element && event.target.closest(BAR_BOXES)) return;
      // While a decision is on its way, no key acts: the next point opens after it.
```

Replace it with:

```tsx
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !isReviewKey(event)) return;
      // While a decision is on its way, no key acts: the next point opens after it.
```

- [ ] **Step 16: Edit `src/ui/brand.css`**

Find this block:

```css

.review-photo img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius);
}
```

Replace it with:

```css

/* A page of the paper zooms inside the pane: the pane has the photo's shape
   (--page-ratio, width / height) and fits the screen's height, so the whole
   page shows at once; the layer moves and grows inside it. */
.zoom-pane {
  position: relative;
  overflow: hidden;
  width: min(100%, calc((100vh - 12rem) * var(--page-ratio)));
  aspect-ratio: var(--page-ratio);
  margin-inline: auto;
  border-radius: var(--radius);
  cursor: zoom-in;
  user-select: none;
  -webkit-user-select: none;
}

.zoom-pane.is-zoomed {
  cursor: grab;
  touch-action: none;
}

.zoom-pane.is-zoomed:active {
  cursor: grabbing;
}

.zoom-layer {
  width: 100%;
  height: 100%;
  transform-origin: 0 0;
}

.zoom-layer img {
  display: block;
  width: 100%;
  height: 100%;
}
```

- [ ] **Step 17: Type check and run the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit 0).

Run: `npm test`
Expected:

```text
Test Files  164 passed | 1 skipped (165)
Tests  2421 passed | 3 skipped (2424)
```

- [ ] **Step 18: Commit**

```bash
git add src/admin/reviewPage/zoom.ts src/admin/reviewPage/zoom.test.ts src/admin/reviewPage/keys.ts src/admin/reviewPage/ZoomPhoto.tsx src/admin/reviewPage/ReviewPhoto.tsx src/admin/pages/ReviewPage.tsx src/admin/pages/ReviewPage.test.tsx src/ui/brand.css
git commit -m "Zoom the page of the paper inside the review's middle pane"
```

Then: `git diff --stat refs/protozoom/z3 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 4: Open the answer to check zoomed, with its border

The answer to check opens on its first area, zoomed, with an orange dashed border and its label outside it; "Partea 1 din 2" steps through its parts; "Arată chenarul" turns it off. The Quick Try review gets it too (the same page). The redesign spec's decision 27 points here.

**Files:**
- Create: `src/admin/reviewPage/areas.ts`, `src/admin/reviewPage/areas.test.ts`, `src/admin/reviewPage/AnswerFrame.tsx`
- Modify: `src/admin/reviewPage/zoom.ts`, `src/admin/reviewPage/ReviewPhoto.tsx`, `src/admin/pages/ReviewPage.tsx`, `src/ui/brand.css`, `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`
- Test: `src/admin/reviewPage/zoom.test.ts`, `src/admin/reviewPage/areas.test.ts`, `src/admin/pages/ReviewPage.test.tsx`, `src/try/Graded.test.tsx`

**Interfaces:**
- Consumes: `EvaluationItemInfo.areas` (Task 2); `ZoomPhoto`, `ZoomView`, `WHOLE_PAGE`, `isZoomed` (Task 3).
- Produces: in `zoom.ts`: `interface PageBox { x0; y0; x1; y1 }`, `viewOfBox(box): ZoomView`, `boxInPane(view, box): PageBox`. In `areas.ts`: `drawnAreas(areas, files): AnswerArea[]`, `savedFrames(): boolean`, `saveFrames(on): void`. `AnswerFrame({ view, box, label })` (`data-testid="answer-frame"`, label class `answer-frame-label`, plus `is-below`). `ReviewPhoto` takes `focus: ReviewFocus | null` (`{ key, label, areas }`), `frames`, `onFrames`.

- [ ] **Step 1: Edit `src/admin/reviewPage/zoom.test.ts`**

Find this block:

```ts
import { describe, expect, it } from 'vitest';
import { CLICK_SCALE, clampView, layerTransform, MAX_SCALE, panBy, WHOLE_PAGE, wheelScale, zoomAround, zoomInAt } from './zoom.ts';

```

Replace it with:

```ts
import { describe, expect, it } from 'vitest';
import { boxInPane, CLICK_SCALE, clampView, layerTransform, MAX_SCALE, panBy, viewOfBox, WHOLE_PAGE, wheelScale, zoomAround, zoomInAt } from './zoom.ts';

```

- [ ] **Step 2: Edit `src/admin/reviewPage/zoom.test.ts`**

Find this block:

```ts
  });
});
```

Replace it with:

```ts
  });
});

describe('the view of an answer', () => {
  it('shows a box in the middle of the pane, as big as fits', () => {
    const view = viewOfBox({ x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.4 });
    expect(view.scale).toBeCloseTo(1.875);
    expect(view.cx).toBeCloseTo(0.4);
    expect(view.cy).toBeCloseTo(0.35);
    // A big box shows the whole page; a tiny one stops at the biggest zoom.
    expect(viewOfBox({ x0: 0.1, y0: 0.5, x1: 0.9, y1: 0.8 })).toEqual(WHOLE_PAGE);
    expect(viewOfBox({ x0: 0.5, y0: 0.5, x1: 0.51, y1: 0.505 }).scale).toBe(MAX_SCALE);
  });

  it('puts a box of the page where it is in the pane', () => {
    const whole = boxInPane(WHOLE_PAGE, { x0: 0.1, y0: 0.5, x1: 0.9, y1: 0.8 });
    expect([whole.x0, whole.y0, whole.x1, whole.y1].map((value) => Math.round(value * 1000) / 1000)).toEqual([0.1, 0.5, 0.9, 0.8]);
    const box = boxInPane({ scale: 1.875, cx: 0.4, cy: 0.35 }, { x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.4 });
    expect(box.x0).toBeCloseTo(0.125);
    expect(box.y0).toBeCloseTo(0.40625);
    expect(box.x1).toBeCloseTo(0.875);
    expect(box.y1).toBeCloseTo(0.59375);
  });
});
```

- [ ] **Step 3: Create `src/admin/reviewPage/areas.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawnAreas, saveFrames, savedFrames } from './areas.ts';

const photo = (id: number) => ({ id, name: `${id}.jpg`, contentType: 'image/jpeg', size: 1000, position: id });
const pdf = (id: number) => ({ id, name: `${id}.pdf`, contentType: 'application/pdf', size: 1000, position: id });
const area = (page: number) => ({ page, x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 });

describe('the areas the review draws', () => {
  it('keeps the areas on the photo pages of the paper, in page order', () => {
    expect(drawnAreas([area(3), area(1), area(2), area(4)], [photo(1), pdf(2), photo(3)])).toEqual([area(1), area(3)]);
    expect(drawnAreas([area(2)], [photo(1)])).toEqual([]);
  });
});

describe('"Arată chenarul"', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is on until the teacher turns it off, and remembers her choice', () => {
    expect(savedFrames()).toBe(true);
    saveFrames(false);
    expect(savedFrames()).toBe(false);
    saveFrames(true);
    expect(savedFrames()).toBe(true);
  });

  it('stays on when the browser blocks its storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveFrames(false)).not.toThrow();
    expect(savedFrames()).toBe(true);
  });
});
```

- [ ] **Step 4: Edit `src/admin/pages/ReviewPage.test.tsx`**

Find this block:

```tsx
import type { SubmissionDetail, UploadRow } from '../../../shared/api.ts';
import { ApiError, submissionFileUrl } from '../api.ts';
```

Replace it with:

```tsx
import type { SubmissionDetail, UploadRow } from '../../../shared/api.ts';
import type { AnswerArea } from '../../../shared/schemas.ts';
import { ApiError, submissionFileUrl } from '../api.ts';
```

- [ ] **Step 5: Edit `src/admin/pages/ReviewPage.test.tsx`**

Find this block:

```tsx
    expect(screen.queryByRole('button', { name: 'Toată pagina' })).not.toBeInTheDocument();
  });
});
```

Replace it with:

```tsx
    expect(screen.queryByRole('button', { name: 'Toată pagina' })).not.toBeInTheDocument();
  });
});

// Ion's I.3 in two parts, given out of page order: the second page, then the
// first. II.4 waits too, on the first page. Ion has two photo pages here.
const TOP = { page: 1, x0: 0.2, y0: 0.3, x1: 0.6, y1: 0.4 };
const LOW = { page: 2, x0: 0.1, y0: 0.5, x1: 0.9, y1: 0.8 };
const OTHER = { page: 1, x0: 0.1, y0: 0.02, x1: 0.5, y1: 0.12 };
function framed(areas: AnswerArea[] = [LOW, TOP]): SubmissionDetail[] {
  const list = papers();
  const ion = list[1]!;
  ion.files = [photo(141, 'i1.jpg'), photo(142, 'i2.jpg')];
  ion.evaluation = fakeEvaluation([
    fakeItem({ id: 41, exerciseId: 'I.3', label: 'Subiectul I, ex. 3', points: 3, maxPoints: 5, needsReview: true, reviewReason: 'Răspunsul e tăiat.', areas }),
    fakeItem({ id: 42, exerciseId: 'II.4', label: 'Subiectul II, ex. 4', points: 1, maxPoints: 2, needsReview: true, reviewReason: 'Neclar.', areas: [OTHER] }),
  ]);
  return list;
}
const frame = () => screen.getByTestId('answer-frame');
const ION_I3 = `${PAGE}?lucrare=14&punct=41`;

describe('the border of the answer to check', () => {
  it('opens the answer on its first part, zoomed, with an orange border and its label outside it', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    expect(await screen.findByText('Ion Popa · pagina 1 din 2')).toBeInTheDocument();
    expect(layer().style.transform).toBe('translate(-25%, -15.625%) scale(1.875)');
    expect(frame().style).toMatchObject({ left: '12.5%', top: '40.625%', width: '75%', height: '18.75%' });
    expect(within(frame()).getByText('I.3 · partea 1 din 2')).not.toHaveClass('is-below');
    expect(screen.getByText('Partea 1 din 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partea anterioară' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Arată chenarul' })).toBeChecked();
  });

  it('steps to the next part on its page and back, zoomed on each', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · pagina 1 din 2');
    await userEvent.click(screen.getByRole('button', { name: 'Partea următoare' }));
    expect(screen.getByText('Ion Popa · pagina 2 din 2')).toBeInTheDocument();
    // A part this big shows on the whole page.
    expect(layer().style.transform).toBe(WHOLE);
    expect(frame().style).toMatchObject({ left: '10%', top: '50%', width: '80%', height: '30%' });
    expect(within(frame()).getByText('I.3 · partea 2 din 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partea următoare' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Partea anterioară' }));
    expect(screen.getByText('Ion Popa · pagina 1 din 2')).toBeInTheDocument();
    expect(layer().style.transform).toBe('translate(-25%, -15.625%) scale(1.875)');
  });

  it('draws the border on a page picked by hand, on the whole page', async () => {
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · pagina 1 din 2');
    await userEvent.click(screen.getByRole('button', { name: 'Pagina 2' }));
    expect(layer().style.transform).toBe(WHOLE);
    expect(within(frame()).getByText('I.3 · partea 2 din 2')).toBeInTheDocument();
  });

  it('puts the label below the border when there is no room above it', async () => {
    renderAdmin(`${PAGE}?lucrare=14&punct=42`, apiWith(framed()));
    await screen.findByText('Ion Popa · pagina 1 din 2');
    expect(within(frame()).getByText('II.4')).toHaveClass('is-below');
    expect(screen.queryByText(/Partea 1/)).not.toBeInTheDocument();
  });

  it("moves to the next point's area after a decision, on the same page", async () => {
    renderAdmin(ION_I3, apiWith(framed([TOP])));
    await screen.findByText('Ion Popa · pagina 1 din 2');
    clickAt(sizedPane(), 200, 200);
    await userEvent.click(within(decision()).getByRole('button', { name: 'Accept 3p' }));
    expect(await within(decision()).findByRole('heading', { name: 'Ion Popa · Subiectul II, ex. 4' })).toBeInTheDocument();
    expect(within(frame()).getByText('II.4')).toBeInTheDocument();
    expect(layer().style.transform).toBe('translate(-6.25%, 0%) scale(1.875)');
  });

  it('turns the border off and on, and remembers the choice in this browser', async () => {
    const first = renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · pagina 1 din 2');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Arată chenarul' }));
    expect(screen.queryByTestId('answer-frame')).not.toBeInTheDocument();
    expect(screen.queryByText('Partea 1 din 2')).not.toBeInTheDocument();
    expect(layer().style.transform).toBe(WHOLE);
    first.unmount();

    // Off: the answer opens on its page, whole, as before.
    renderAdmin(ION_I3, apiWith(framed()));
    await screen.findByText('Ion Popa · pagina 1 din 2');
    expect(screen.getByRole('checkbox', { name: 'Arată chenarul' })).not.toBeChecked();
    expect(screen.queryByTestId('answer-frame')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Arată chenarul' }));
    expect(within(frame()).getByText('I.3 · partea 1 din 2')).toBeInTheDocument();
    expect(layer().style.transform).toBe('translate(-25%, -15.625%) scale(1.875)');
  });

  it('opens as before an answer with no area it can draw: on a PDF page, or on a page the paper does not have', async () => {
    const list = papers();
    list[0]!.evaluation!.items[1]!.areas = [{ ...TOP, page: 3 }, { ...TOP, page: 9 }];
    renderAdmin(`${PAGE}?lucrare=11&punct=32`, apiWith(list));
    expect(await screen.findByText('Ana Pop · pagina 3 din 3')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Arată chenarul' })).not.toBeInTheDocument();
    await userEvent.keyboard('1');
    expect(layer().style.transform).toBe(WHOLE);
    expect(screen.queryByTestId('answer-frame')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Edit `src/try/Graded.test.tsx`**

Find this block:

```tsx
import { QUICK_TRY_STUDENT, QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import { formatPoints } from '../../shared/scoring.ts';
```

Replace it with:

```tsx
import { QUICK_TRY_STUDENT, QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import type { AnswerArea } from '../../shared/schemas.ts';
import { formatPoints } from '../../shared/scoring.ts';
```

- [ ] **Step 7: Edit `src/try/Graded.test.tsx`**

Find this block:

```tsx

// A graded try: I.1 waits for a check unless `checked`.
function setup(path = '/', checked = false, unreadable: string[] = []) {
  const evaluation = fakeEvaluation(
    [fakeItem({ id: 71, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 3, needsReview: !checked, reviewReason: 'Scrisul se citește greu.', page: 1 })],
    { unreadable },
```

Replace it with:

```tsx

// A graded try: I.1 waits for a check unless `checked`; `areas` say where its answer is.
function setup(path = '/', checked = false, unreadable: string[] = [], areas: AnswerArea[] = []) {
  const evaluation = fakeEvaluation(
    [fakeItem({ id: 71, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 3, needsReview: !checked, reviewReason: 'Scrisul se citește greu.', page: 1, areas })],
    { unreadable },
```

- [ ] **Step 8: Edit `src/try/Graded.test.tsx`**

Find this block:

```tsx
    expect(await screen.findByRole('heading', { name: 'Încercare rapidă', level: 1 })).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(await screen.findByRole('heading', { name: 'Încercare rapidă', level: 1 })).toBeInTheDocument();
  });

  it("opens the review zoomed on the answer, with the border the teacher's review draws", async () => {
    setup('/', false, [], [{ page: 1, x0: 0.1, y0: 0.3, x1: 0.7, y1: 0.5 }]);
    await userEvent.click(await screen.findByRole('link', { name: 'Verifică 1 punct' }));
    const frame = await screen.findByTestId('answer-frame');
    expect(within(frame).getByText('I.1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toată pagina' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Arată chenarul' })).toBeChecked();
  });
```

- [ ] **Step 9: Run the tests to see them fail**

Run: `npx vitest run src/admin/reviewPage/zoom.test.ts src/admin/reviewPage/areas.test.ts src/admin/pages/ReviewPage.test.tsx src/try/Graded.test.tsx`
Expected:

The test "opens as before an answer with no area it can draw: on a PDF page, or on a page the paper does not have" passes already: it guards the old behaviour.

These tests fail:

```text
× shows a box in the middle of the pane, as big as fits 3ms
× puts a box of the page where it is in the pane 1ms
× opens the review zoomed on the answer, with the border the teacher's review draws 3129ms
× opens the answer on its first part, zoomed, with an orange border and its label outside it 69ms
× steps to the next part on its page and back, zoomed on each 160ms
× draws the border on a page picked by hand, on the whole page 112ms
× puts the label below the border when there is no room above it 61ms
× moves to the next point's area after a decision, on the same page 112ms
× turns the border off and on, and remembers the choice in this browser 143ms
Test Files  4 failed (4)
Tests  9 failed | 55 passed (64)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 9 ⎯⎯⎯⎯⎯⎯⎯
```

- [ ] **Step 10: Edit `src/admin/reviewPage/zoom.ts`**

Find this block:

```ts

export const WHOLE_PAGE: ZoomView = { scale: 1, cx: 0.5, cy: 0.5 };
```

Replace it with:

```ts

// A box on the page, as fractions of its width and height (AnswerArea without
// its page).
export interface PageBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const WHOLE_PAGE: ZoomView = { scale: 1, cx: 0.5, cy: 0.5 };
```

- [ ] **Step 11: Edit `src/admin/reviewPage/zoom.ts`**

Find this block:

```ts
export const MAX_SCALE = 6;

```

Replace it with:

```ts
export const MAX_SCALE = 6;
// An area fills this share of the pane, so its border and label fit around it.
const AREA_FILL = 0.75;

```

- [ ] **Step 12: Edit `src/admin/reviewPage/zoom.ts`**

Find this block:

```ts

// The CSS transform of the page's layer (origin at its top left corner): a
```

Replace it with:

```ts

// The view that shows a box in the middle of the pane, as big as fits.
export function viewOfBox(box: PageBox): ZoomView {
  const size = Math.max(box.x1 - box.x0, box.y1 - box.y0, 0.01);
  return clampView({ scale: AREA_FILL / size, cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2 });
}

// Where a box of the page is in the pane, as fractions of the pane.
export function boxInPane(view: ZoomView, box: PageBox): PageBox {
  const at = (value: number, middle: number) => 0.5 + (value - middle) * view.scale;
  return { x0: at(box.x0, view.cx), y0: at(box.y0, view.cy), x1: at(box.x1, view.cx), y1: at(box.y1, view.cy) };
}

// The CSS transform of the page's layer (origin at its top left corner): a
```

- [ ] **Step 13: Create `src/admin/reviewPage/areas.ts`**

```ts
import type { SubmissionFile } from '../../../shared/api.ts';
import type { AnswerArea } from '../../../shared/schemas.ts';

// The areas of an answer that the review draws: on a photo page that the paper
// has (a PDF page has no zoom and no border), in page order. An answer left
// with none opens as one the robot gave no area for.
export function drawnAreas(areas: readonly AnswerArea[], files: readonly SubmissionFile[]): AnswerArea[] {
  return areas
    .filter((area) => area.page <= files.length && files[area.page - 1]!.contentType.startsWith('image/'))
    .sort((a, b) => a.page - b.page);
}

// "Arată chenarul": the teacher's choice, kept in this browser. On unless she
// turned it off; storage that is blocked keeps it on.
const FRAMES_KEY = 'quickeval:reviewFrames';

export function savedFrames(): boolean {
  try {
    return localStorage.getItem(FRAMES_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveFrames(on: boolean): void {
  try {
    localStorage.setItem(FRAMES_KEY, on ? 'on' : 'off');
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}
```

- [ ] **Step 14: Create `src/admin/reviewPage/AnswerFrame.tsx`**

```tsx
import { boxInPane, type PageBox, type ZoomView } from './zoom.ts';

// Room above a border, as a share of the pane, for its label to sit outside it.
const LABEL_ROOM = 0.08;

const percent = (value: number) => `${Math.round(value * 100000) / 1000}%`;

// The border of the answer to check, drawn over the page in the pane's own
// coordinates, so it moves and grows with the zoom: an orange dashed line
// that looks drawn by hand, with its label outside it, above (or below when
// there is no room above), never over the student's work.
export function AnswerFrame({ view, box, label }: { view: ZoomView; box: PageBox; label: string }) {
  const shown = boxInPane(view, box);
  const below = shown.y0 < LABEL_ROOM;
  return (
    <div
      className="answer-frame"
      data-testid="answer-frame"
      aria-hidden="true"
      style={{ left: percent(shown.x0), top: percent(shown.y0), width: percent(shown.x1 - shown.x0), height: percent(shown.y1 - shown.y0) }}
    >
      <span className={below ? 'answer-frame-label is-below' : 'answer-frame-label'}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 15: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
import type { SubmissionDetail } from '../../../shared/api.ts';
import { submissionFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { isZoomed, WHOLE_PAGE, type ZoomView } from './zoom.ts';
import { ZoomPhoto } from './ZoomPhoto.tsx';

```

Replace it with:

```tsx
import type { SubmissionDetail } from '../../../shared/api.ts';
import type { AnswerArea } from '../../../shared/schemas.ts';
import { submissionFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';
import { AnswerFrame } from './AnswerFrame.tsx';
import { isZoomed, viewOfBox, WHOLE_PAGE, type ZoomView } from './zoom.ts';
import { ZoomPhoto } from './ZoomPhoto.tsx';

// The answer to check: `key` names it (the paper and the item), `label` is the
// exercise ("II.1"), `areas` are the ones the review can draw (drawnAreas).
export interface ReviewFocus {
  key: string;
  label: string;
  areas: AnswerArea[];
}

```

- [ ] **Step 16: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
// right click or Esc shows the whole page again. A PDF shows in a frame.
export function ReviewPhoto({ submission, page, onPage }: { submission: SubmissionDetail; page: number; onPage: (page: number) => void }) {
  const { base } = useApi();
```

Replace it with:

```tsx
// right click or Esc shows the whole page again. A PDF shows in a frame.
// While "Arată chenarul" is on, the answer to check opens zoomed on its first
// area with an orange border; an answer in more parts steps through them.
export function ReviewPhoto({
  submission,
  page,
  onPage,
  focus,
  frames,
  onFrames,
}: {
  submission: SubmissionDetail;
  page: number;
  onPage: (page: number) => void;
  focus: ReviewFocus | null;
  frames: boolean;
  onFrames: (on: boolean) => void;
}) {
  const { base } = useApi();
```

- [ ] **Step 17: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
  const file = files[index];
  // The zoom of the page shown: another page opens whole.
  const zoomKey = `${submission.id}:${file?.id ?? ''}`;
  const [zoom, setZoom] = useState<{ key: string; view: ZoomView } | null>(null);
  const view = zoom?.key === zoomKey ? zoom.view : WHOLE_PAGE;
  const setView = (next: ZoomView) => setZoom({ key: zoomKey, view: next });

```

Replace it with:

```tsx
  const file = files[index];

  // The answer framed now: none while the switch is off or it has no area.
  const framed = frames && focus !== null && focus.areas.length > 0 ? focus : null;
  const focusKey = framed?.key ?? '';
  const [part, setPart] = useState<{ key: string; index: number } | null>(null);
  const partIndex = part !== null && part.key === focusKey ? Math.min(part.index, (framed?.areas.length ?? 1) - 1) : 0;
  const partArea = framed?.areas[partIndex];

  // The zoom of the page shown. An answer that opens shows its part zoomed;
  // a page the teacher picks herself opens whole.
  const fileKey = `${submission.id}:${file?.id ?? ''}`;
  const [zoom, setZoom] = useState<{ focusKey: string; fileKey: string; view: ZoomView } | null>(null);
  const view =
    zoom !== null && zoom.focusKey === focusKey
      ? zoom.fileKey === fileKey
        ? zoom.view
        : WHOLE_PAGE
      : partArea && partArea.page === index + 1
        ? viewOfBox(partArea)
        : WHOLE_PAGE;
  const setView = (next: ZoomView) => setZoom({ focusKey, fileKey, view: next });

  // The next or the previous part: its page, zoomed on it.
  const goPart = (next: number) => {
    const area = framed?.areas[next];
    const target = area && files[area.page - 1];
    if (!area || !target) return;
    setPart({ key: focusKey, index: next });
    setZoom({ focusKey, fileKey: `${submission.id}:${target.id}`, view: viewOfBox(area) });
    onPage(area.page - 1);
  };

```

- [ ] **Step 18: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
  const photo = file.contentType.startsWith('image/');
  return (
```

Replace it with:

```tsx
  const photo = file.contentType.startsWith('image/');
  const parts = framed?.areas.length ?? 0;
  const partLabel = (number: number) => (parts > 1 ? `${framed!.label} · partea ${number + 1} din ${parts}` : framed!.label);
  return (
```

- [ ] **Step 19: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
      </div>
      {photo ? (
        <ZoomPhoto src={url} alt={`Pagina ${index + 1} a lucrării`} view={view} onView={setView} />
      ) : (
```

Replace it with:

```tsx
      </div>
      {focus !== null && focus.areas.length > 0 && (
        <div className="review-photo-tools">
          {parts > 1 && (
            <span className="answer-parts" role="group" aria-label="Părțile răspunsului">
              <button type="button" className="button-quiet button-small" aria-label="Partea anterioară" disabled={partIndex === 0} onClick={() => goPart(partIndex - 1)}>
                ‹
              </button>
              <span>
                Partea {partIndex + 1} din {parts}
              </span>
              <button type="button" className="button-quiet button-small" aria-label="Partea următoare" disabled={partIndex === parts - 1} onClick={() => goPart(partIndex + 1)}>
                ›
              </button>
            </span>
          )}
          <label className="check-label">
            <input type="checkbox" checked={frames} onChange={(event) => onFrames(event.target.checked)} />
            Arată chenarul
          </label>
        </div>
      )}
      {photo ? (
        <ZoomPhoto src={url} alt={`Pagina ${index + 1} a lucrării`} view={view} onView={setView}>
          {framed?.areas.map((area, number) =>
            area.page === index + 1 ? <AnswerFrame key={number} view={view} box={area} label={partLabel(number)} /> : null,
          )}
        </ZoomPhoto>
      ) : (
```

- [ ] **Step 20: Edit `src/admin/pages/ReviewPage.tsx`**

Find this block:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';
import { ReviewDecision, type ReviewView } from '../reviewPage/ReviewDecision.tsx';
import { ReviewPhoto } from '../reviewPage/ReviewPhoto.tsx';
import { ReviewQueue } from '../reviewPage/ReviewQueue.tsx';
```

Replace it with:

```tsx
import { ErrorMessage } from '../ErrorMessage.tsx';
import { drawnAreas, saveFrames, savedFrames } from '../reviewPage/areas.ts';
import { ReviewDecision, type ReviewView } from '../reviewPage/ReviewDecision.tsx';
import { type ReviewFocus, ReviewPhoto } from '../reviewPage/ReviewPhoto.tsx';
import { ReviewQueue } from '../reviewPage/ReviewQueue.tsx';
```

- [ ] **Step 21: Edit `src/admin/pages/ReviewPage.tsx`**

Find this block:

```tsx

  // The page of the paper: the page of the answer to check, or the first page
  // the robot could not read, else page 1.
```

Replace it with:

```tsx

  // The answer to check, with the areas the review can draw ("Arată chenarul").
  const [frames, setFrames] = useState(savedFrames);
  const focus: ReviewFocus | null =
    view.kind === 'item' && submission
      ? { key: `${submission.id}:${view.item.id}`, label: view.item.exerciseId, areas: drawnAreas(view.item.areas, submission.files) }
      : null;
  const onFrames = (on: boolean) => {
    setFrames(on);
    saveFrames(on);
  };

  // The page of the paper: the page of the first area of the answer to check
  // (while its border shows), else the page of the answer, or the first page
  // the robot could not read, else page 1.
```

- [ ] **Step 22: Edit `src/admin/pages/ReviewPage.tsx`**

Find this block:

```tsx
  const pageCount = submission?.files.length ?? 0;
  const firstPage =
```

Replace it with:

```tsx
  const pageCount = submission?.files.length ?? 0;
  const firstArea = frames ? focus?.areas[0] : undefined;
  const firstPage =
```

- [ ] **Step 23: Edit `src/admin/pages/ReviewPage.tsx`**

Find this block:

```tsx
      ? (pageIndex(view.pages[0] ?? '') ?? 0)
      : view.kind === 'item' && view.item.page >= 1 && view.item.page <= pageCount
        ? view.item.page - 1
        : 0;
  const shownPage = pageChoice?.view === viewKey ? pageChoice.page : firstPage;
```

Replace it with:

```tsx
      ? (pageIndex(view.pages[0] ?? '') ?? 0)
      : firstArea
        ? firstArea.page - 1
        : view.kind === 'item' && view.item.page >= 1 && view.item.page <= pageCount
          ? view.item.page - 1
          : 0;
  const shownPage = pageChoice?.view === viewKey ? pageChoice.page : firstPage;
```

- [ ] **Step 24: Edit `src/admin/pages/ReviewPage.tsx`**

Find this block:

```tsx
              <>
                <ReviewPhoto submission={submission} page={shownPage} onPage={(index) => setPageChoice({ view: viewKey, page: index })} />
                <ReviewDecision
```

Replace it with:

```tsx
              <>
                <ReviewPhoto
                  submission={submission}
                  page={shownPage}
                  onPage={(index) => setPageChoice({ view: viewKey, page: index })}
                  focus={focus}
                  frames={frames}
                  onFrames={onFrames}
                />
                <ReviewDecision
```

- [ ] **Step 25: Edit `src/ui/brand.css`**

Find this block:

```css
  height: 100%;
}
```

Replace it with:

```css
  height: 100%;
}

/* The answer to check: an orange dashed border that looks drawn by hand (a
   little uneven, a little tilted), its label outside it. Clicks go through it
   to the page. */
.answer-frame {
  position: absolute;
  box-sizing: border-box;
  border: 2px dashed var(--orange-mark);
  border-radius: 5px 3px 6px 4px / 4px 6px 3px 5px;
  transform: rotate(-0.3deg);
  pointer-events: none;
}

.answer-frame-label {
  position: absolute;
  bottom: calc(100% + 4px);
  left: -2px;
  padding: 0.0625rem 0.375rem;
  border-radius: var(--radius);
  background: var(--orange);
  color: var(--sheet);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
}

.answer-frame-label.is-below {
  top: calc(100% + 4px);
  bottom: auto;
}

.review-photo-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.answer-parts {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 600;
}
```

- [ ] **Step 26: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
26. "Publică toate rezultatele" opens the link of every student, and "Oprește accesul la rezultate" closes every link, also the ones published alone. While all are published, one result cannot be stopped alone (Phase 5).
27. The review has no marks on the photo: the robot does not say where an answer is on a page, nor on which page. The middle pane shows the student's pages with the page switch (Phase 6).
28. The review is a page of its own, `/admin/teste/:code/verificare`. "Începe verificarea" and "Decide" in the panel Verificare, "Verifică 3 puncte" on the Teste page, and the button of "Decide 3 puncte nesigure" in "De făcut" open it (Phase 6).
```

Replace it with:

```markdown
26. "Publică toate rezultatele" opens the link of every student, and "Oprește accesul la rezultate" closes every link, also the ones published alone. While all are published, one result cannot be stopped alone (Phase 5).
27. The review has no marks on the photo: the robot does not say where an answer is on a page, nor on which page. The middle pane shows the student's pages with the page switch (Phase 6). Replaced on 2026-11-10: the robot now saves where each answer is, and the review zooms on the answer to check and draws its border (`2026-11-10-review-zoom-and-answer-areas-design.md`).
28. The review is a page of its own, `/admin/teste/:code/verificare`. "Începe verificarea" and "Decide" in the panel Verificare, "Verifică 3 puncte" on the Teste page, and the button of "Decide 3 puncte nesigure" in "De făcut" open it (Phase 6).
```

- [ ] **Step 27: Edit `docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md`**

Find this block:

```markdown
- Left: "Cu puncte de verificat": each paper with its grade and "2 puncte de verificat", and under it its points (the exercise and "1p din 1p", or "Paginile necitite"), the current point marked. Then "Celelalte lucrări": every other graded paper with its grade. A click on a point opens it; a click on a paper of "Celelalte lucrări" shows that paper, with no point.
- Middle: the paper's pages, one at a time: "Ioana Marin · pagina 2 din 3" and the page switch (1 · 2 · 3). A click on a photo opens it full size in a new tab; a PDF shows in a frame. No marks on the photo (decision 27). A point opens on page 1; the pages point opens on the first page the robot could not read.
- Right, for an exercise: its name and "5p în barem"; the points ("1p din 1p"), the student's answer, the robot's comment, and on orange "De verificat:" with the reason; "Accept 1p" (the filled button), a stepper for another value (− and + by 0,5, from 0 to the maximum; any value in steps of 0,05 can be typed) and "Salvează". Under them, the total ("Total: 75 din 100, cu 10 din oficiu"), what the grade becomes while the stepper shows another value ("Cu 0p aici, nota devine 8,40"), and the grade. Then the paper's exercises with their points, the ones to check marked; a click on one to check opens it.
```

Replace it with:

```markdown
- Left: "Cu puncte de verificat": each paper with its grade and "2 puncte de verificat", and under it its points (the exercise and "1p din 1p", or "Paginile necitite"), the current point marked. Then "Celelalte lucrări": every other graded paper with its grade. A click on a point opens it; a click on a paper of "Celelalte lucrări" shows that paper, with no point.
- Middle: the paper's pages, one at a time: "Ioana Marin · pagina 2 din 3" and the page switch (1 · 2 · 3). A click on a photo zooms in inside the pane, the wheel zooms, a drag moves it, and a right click, Esc or "Toată pagina" shows the whole page; a PDF shows in a frame. A point opens on the page of its answer, zoomed on it with an orange border while "Arată chenarul" is on (`2026-11-10-review-zoom-and-answer-areas-design.md`, which replaces decision 27); the pages point opens on the first page the robot could not read.
- Right, for an exercise: its name and "5p în barem"; the points ("1p din 1p"), the student's answer, the robot's comment, and on orange "De verificat:" with the reason; "Accept 1p" (the filled button), a stepper for another value (− and + by 0,5, from 0 to the maximum; any value in steps of 0,05 can be typed) and "Salvează". Under them, the total ("Total: 75 din 100, cu 10 din oficiu"), what the grade becomes while the stepper shows another value ("Cu 0p aici, nota devine 8,40"), and the grade. Then the paper's exercises with their points, the ones to check marked; a click on one to check opens it.
```

- [ ] **Step 28: Type check and run the whole suite**

Run: `npm run typecheck`
Expected: no output after the command line (exit 0).

Run: `npm test`
Expected:

```text
Test Files  165 passed | 1 skipped (166)
Tests  2434 passed | 3 skipped (2437)
```

- [ ] **Step 29: Commit**

```bash
git add src/admin/reviewPage/areas.ts src/admin/reviewPage/areas.test.ts src/admin/reviewPage/AnswerFrame.tsx src/admin/reviewPage/zoom.ts src/admin/reviewPage/zoom.test.ts src/admin/reviewPage/ReviewPhoto.tsx src/admin/pages/ReviewPage.tsx src/admin/pages/ReviewPage.test.tsx src/try/Graded.test.tsx src/ui/brand.css docs/superpowers/specs/2026-11-04-mqgrader-redesign-design.md
git commit -m "Open the answer to check zoomed, with its border, its parts and a switch"
```

Then: `git diff --stat refs/protozoom/z4 HEAD -- . ':!docs/superpowers/plans'` prints nothing.

### Task 5: Check, live database, push

Main session only. Every outward step needs the user's yes, asked in chat.

- [ ] **Step 1: Run the whole suite once more, also in UTC**

Run: `npm test`, then `TZ=UTC npm test` in Git Bash (`$env:TZ='UTC'; npm test` in PowerShell).
Expected: the totals of Task 4, both times.

- [ ] **Step 2: Look at the review in the browser**

Start the production build on a free port (check `netstat -ano | findstr :8788` first; a leftover `workerd.exe` answers with old code): `npm run db:local`, then `npm run build` and `npx wrangler pages dev dist --port 8789 --ip 127.0.0.1` in a Terminal tab (`CI=true`). Load a graded paper whose items have areas into the local database only (never commit sample rows or photos: real papers show students' names). Open `/teacher/teste/<code>/verificare` and check:
- a point opens zoomed on its border; the label sits outside the border; "Partea x din n" moves between pages;
- a left click zooms the whole page, a drag moves it, the wheel zooms (also with a trackpad), a right click and Esc show the whole page, and at the whole page the wheel scrolls the page;
- zoomed handwriting is sharp; "Arată chenarul" off and on, and after a reload;
- at 375 px wide (`resize_window` mobile) the page has no horizontal scroll (`document.documentElement.scrollWidth === innerWidth`).
Stop the server and close its tab after.

- [ ] **Step 3: Run migration 0027 on the live database (ask first)**

Ask the user: "Rulez migrarea 0027 pe baza de date live?" Only on a yes, run from this worktree: `npx wrangler d1 migrations apply quickeval --remote`.
Expected: `0027_item_areas.sql` applied. Then update the memory `quickeval-live-state.md` (live D1 has 0001–0027).

- [ ] **Step 4: Push and open the pull request (ask first)**

Ask the user before each: push the branch, then open the pull request into `main`.
