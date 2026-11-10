# MQGrader: Quick Try, part B (the try's page) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **The last task (Check in the browser, push) must run in the main session, not in a subagent:** the push needs the user's explicit yes.

**Goal:** A Quick Try's own page at `/try/<token>`: the teacher sends what is missing (test, barem or the robot's barem, the student's pages), downloads and reads the robot's barem, presses "Pornește corectarea", follows the grading, and then sees the graded paper in the app's three views (the review with point changes, the teacher's result, the student's result), with "Distribuie" and the invitation to a free class test with an account.

**Architecture:** A new page entry (`try/index.html`, `src/try/`) that reuses the teacher app instead of copying it: `createApiClient({ base: '/api/try/<token>' })` sends the teacher app's calls and file links to the try's link (part A's allow-list), so the app's own `ReviewPage`, `GradedResult` and `PageFiles` run unchanged inside the try's router; the try's own calls (its info, the student's pages, the start, the student result) have their own small client. The student result comes from one new route, `GET /api/try/<token>/result`, the student app's view; `StudentResult` takes a `fileUrl` so both pages draw it. `phase.ts` says where the try stands from its test, the same failures as the server's give-back.

**Tech Stack:** Node 24, TypeScript, React 19, TanStack Query, React Router, Vite, Hono on Cloudflare Pages with D1 and R2, Vitest 5 with Testing Library. No new npm dependencies. No migration.

**Spec:** `docs/superpowers/specs/2026-11-09-quick-try-design.md` (§3.3 the try's page, §3.4 sharing, §6 constraints, §7 phases). Part A (the server, merged as PR #59) is `docs/superpowers/plans/2026-11-09-quick-try-a-server.md`; its rulings 7, 8 and 12 hold here. Root `AGENTS.md`, `src/AGENTS.md` and `server/AGENTS.md` hold the project rules.

## Global Constraints

- Node 24, npm 11. This plan adds no dependencies: never run `npm install`. No migration.
- One strict `tsconfig.json`. Relative imports name the `.ts` or `.tsx` file. `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. `noUnusedLocals` and `noUnusedParameters` are on.
- All user-facing text is Romanian, with diacritics (ă â î ș ț). Code, comments and docs are English. The API reports errors as `{ error, message }`; the page shows `message`.
- The try's page calls only what part A's allow-list serves (`ALLOWED` in `server/routes/quickTry.ts`) and the try's own routes. The page tests prove it: `tryAdminApi()` throws on any other call.
- The student's view inside the try says nothing about how the paper is graded: it is checked with `expectNoGradingWords()`.
- The page never shows the test's upload link (`uploadToken`) or a QR code (part A, ruling 12).
- The try's page is private like a student link: `noindex` and closed in `robots.txt`.
- Exact texts: the invitation is "Îți place? Creează un cont: corectezi gratuit un test pentru toată clasa." linking to `/teacher/#cont-nou` (spec §3.3); the button is "Pornește corectarea".
- Do not run Prettier or any formatter.
- Commits: no `Co-Authored-By`, no "Generated with", no AI attribution lines. Code comments: no ticket or issue numbers. Stage files by path, never `git add -A`.
- Development happens on Windows (the commands work in Git Bash and in PowerShell). CI runs on Linux, in UTC.
- Run every command from the repo root, on the branch `feature/quick-try-page` (made from `main` in "Before Task 1"). Run `npm test` alone, in the foreground: tests of `runner/run.test.ts`, `runner/api.test.ts` and `server/routes/auth.test.ts` time out (20 s) when the machine is busy. If only tests of those three files time out, run `npx vitest run server/routes/auth.test.ts runner/run.test.ts runner/api.test.ts` alone; the full run then counts as passed when its failed and passed tests add up to the expected passed number.

## How to read the steps

- **Create** `path`: the file is new; write exactly the content given.
- **Replace** `path`: the file exists; write exactly the content given in its place.
- **Edit** `path`: find the first block in the file (it occurs once) and put the second block in its place; change nothing else. A task's Edit steps for one file run in the order given.
- The expected test totals are exact. If a run shows other numbers or other errors, stop and report.
- The tested prototype of this plan is in the repo as `refs/protoqtb/b1` … `refs/protoqtb/b6`, one per task, on `refs/protoqtb/bbase` (the same files as `main` at `0c034f6`). After Task N, `git diff --stat refs/protoqtb/bN HEAD -- . ':!docs'` prints nothing.
- The totals below are for a PC with pandoc. The steady `1 skipped` file and `3 skipped` tests are the print container (`runner/print/container.test.ts`, run only with `QE_PRINT_IMAGE_TESTS=1`).

## Rulings made while planning

Settled while building the prototype on 2026-11-10.

1. **The page's hosting comes with the page, not with part C.** Spec §7 lists `_headers`, `robots.txt` and `_redirects` under part C, but a page live without `noindex` is indexable until C ships. So Task 3 adds `/try/* /try/ 200`, the `/try/*` noindex header and `Disallow: /try/` in every `robots.txt` group, with the Vite entry and its dev fallback.
2. **Its own entry, the teacher app's parts.** The page is `try/index.html` at `/try/<token>` (spec §8 left it open), not a route of the teacher app: no login, no shell. It reuses the teacher app's client with a `base` (`AdminApi.base`, also used by the file links of `ReviewPhoto` and `PageFiles`), so `ReviewPage`, `GradedResult` and `PageFiles` run unchanged. The review sits at `/teste/<code>/verificare` inside the try's router; its links to `/teste/<code>` (with `#verificare` or `#rezultate`) come back to the try's page, its "Deschide lucrarea" (`/teste/<code>/elevi/<id>`) opens the teacher's result, and any other address goes to `/`. (Found by opening the prototype in the browser: that link first fell back to the first view.)
3. **The page also sends what is missing.** The landing page's form (part C) sends the test, the barem and the pages first. The try's page shows the same three parts with what was sent, and takes what is missing or a replacement before the grading: part B then works and is tested before part C, a form that broke half-way is recovered, and "replace the barem before starting" (spec §3.3, state 2) needs it anyway.
4. **"Pornește corectarea" names the robot's barem.** With a robot barem that waits for its check, the page sends its `filesVersion` to `POST /api/try/<token>/start` (part A, ruling 7); the teacher app's "Am verificat baremul" is not on the allow-list and is not used. With her own barem it sends none.
5. **The file changes left show on the page:** "Mai poți încărca testul și baremul de N ori în total. Baremul făcut de robot se numără și el o dată." (part A's review: the robot's own barem uses one of the 6 changes). At 0 the file inputs are off.
6. **Failed is the server's give-back:** the barem request failed, the exercise list failed, or the paper failed (`GAVE_BACK` in `server/db/quickTry.ts`). The page says which, says the try does not count in today's limit, and offers a new try from the landing page; there is no retry button (spec §3.3, state 5).
7. **The barem's problem has its own small banner**, not the app's `ExerciseListBanner`: that one offers "Încearcă din nou" (not allowed) and a link to the Pregătire stage (not on this page). It keeps the app's words and "Folosește oricum", with a barem file input under it.
8. **The student result is a try route.** `GET /api/try/<token>/result` answers the student app's `StudentResultView` for the try's paper, always open (the link is the key; no publishing), from the same code as the student link (`findResultBySubmission` beside `findResultByToken`, both through `toStudentEvaluation`, which has no confidence and no review reason). `StudentResult` takes `fileUrl` instead of `resultToken`; its pages open through the try's `/paper/<id>`.
9. **The try's page is a teacher page**: its top bar has the lockup "MQGrader by Laura Miron" and the theme button. Only the "Rezultatul elevului" view is the student's page, and it is checked with `expectNoGradingWords()`.
10. **"Distribuie" sits at the top in every phase**: `navigator.share` where there is one, else the link is copied ("Linkul a fost copiat."), and if that fails the link is shown to copy. A line under it says anyone with the link can do everything (spec §3.4).
11. **No photo shrinking.** The student app makes phone photos smaller; the try's page sends each page as it is (25 MB per file, at most 20, the same check as the student app). A teacher on a slow phone waits longer.
12. **A 410 shows the expired page** whether it comes from the try's info or from its test; other refusals show the server's message where the action is.

## Review Focus

1. A call outside the allow-list (regrade, reset, results links, the class report, "Am verificat baremul"): the page never makes one. Every page test runs through `tryAdminApi()`, which throws on any other call.
2. A try whose 7 days end while the page is open: the next read of the test answers 410 and the page shows "Încercarea a expirat" (Task 4, "says an expired try expired when the test answers so").
3. The robot's barem replaced by her own before the start: the start then names no version (Task 4, "starts with her own barem without naming a version"), and the robot's barem is started with the version the page showed ("starts with the robot's barem the page showed").
4. The student's view says nothing of how the paper was graded and opens the pages through the try's link (Task 6, "shows the page the student would see, with no word on how it was graded").
5. The review's own links ("Înapoi la test", "Mergi la Rezultate", "Deschide lucrarea") and an unknown address of the teacher app stay inside the try (Task 3, "comes back to the try from an address of the teacher app that it does not have"; Task 6, the first test, "opens the teacher's result from the review's link to the results" and "… to the paper").

---

### Before Task 1: The branch

- [ ] **Step 1: Make the branch and check the prototype**

Run: `git switch -c feature/quick-try-page main` and `git log --oneline -1`
Expected: HEAD `0c034f6 Merge pull request #59 from parameciul/feature/quick-try` (or a later `main`; then the prototype comparisons below may also show the files `main` changed since).

Run: `git rev-parse --verify refs/protoqtb/b6`
Expected: a commit id. If the ref does not exist, stop and ask: the prototype's refs come with this plan.

- [ ] **Step 2: Bring this plan onto the branch**

Run: `git checkout claude/quick-try-b-plan -- docs/superpowers/plans/2026-11-10-quick-try-b-page.md`
Then: `git commit -m "Add the plan for the Quick Try page" -- docs/superpowers/plans/2026-11-10-quick-try-b-page.md`
Expected: one commit with the one file.

### Task 1: The teacher app's client at a try's link, and the try's own client

**Files:**
- Create: `src/try/api.ts`, `src/try/api.test.ts`
- Modify: `src/admin/api.ts`, `src/admin/api.test.ts`, `src/admin/reviewPage/ReviewPhoto.tsx`, `src/admin/submissionPage/PageFiles.tsx`, `src/test/fakeApi.ts`
- Test: `src/admin/api.test.ts`, `src/try/api.test.ts`

**Interfaces:**
- Consumes: part A's routes under `/api/try/<token>`: `GET ''` (`QuickTryInfo`), `GET`/`PUT /paper`, `DELETE /paper/:fileId`, `POST /start` (`quickTryStartBody`), and Task 2's `GET /result`.
- Produces: `ApiClientOptions.base?: string`, `AdminApi.base: string`, `ADMIN_BASE = '/api/admin'`, `testFileUrl(code, kind, variant?, base = ADMIN_BASE)`, `submissionFileUrl(submissionId, fileId, base = ADMIN_BASE)` in `src/admin/api.ts`; in `src/try/api.ts`: `TryApi { info(); listPages(); addPage(file: File); deletePage(fileId: number); start(filesVersion?: number); result() }`, `tryBase(token): string` (`/api/try/<token>`), `pageFileUrl(token, fileId): string` (`/api/try/<token>/paper/<id>`), `createTryClient(token, { fetchImpl? }): TryApi`.

- [ ] **Step 1: Edit `src/admin/api.test.ts`**

Find this block:

```ts

  it('opens and closes the student results and reads one result link', async () => {
```

Replace it with:

```ts

  it("sends a Quick Try's calls and file links to its own base, and the login calls to /api/auth", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, { test: {}, uploads: [], teacher: {} }));
    const api = createApiClient({ fetchImpl, base: '/api/try/abc' });
    expect(api.base).toBe('/api/try/abc');
    await api.getTest('PROBA-26T1');
    await api.getSubmission(7);
    await api.login('a@b.ro', 'parola123');
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init!.method} ${String(url)}`)).toEqual([
      'GET /api/try/abc/tests/PROBA-26T1',
      'GET /api/try/abc/submissions/7',
      'POST /api/auth/login',
    ]);
    expect(createApiClient({ fetchImpl }).base).toBe('/api/admin');
    expect(testFileUrl('PROBA-26T1', 'barem', undefined, '/api/try/abc')).toBe('/api/try/abc/tests/PROBA-26T1/files/barem');
    expect(submissionFileUrl(7, 12, '/api/try/abc')).toBe('/api/try/abc/submissions/7/files/12');
  });

  it('opens and closes the student results and reads one result link', async () => {
```

- [ ] **Step 2: Create `src/try/api.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createTryClient, pageFileUrl, tryBase } from './api.ts';

const TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('createTryClient', () => {
  it("calls the try's own routes under its link", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(200, { code: 'PROBA-26T1', files: [], status: 'evaluating', deleted: true, result: { testCode: 'PROBA-26T1' } }),
    );
    const api = createTryClient(TOKEN, { fetchImpl });
    await api.info();
    await api.listPages();
    await api.deletePage(4);
    await api.start(3);
    await api.start();
    await api.result();
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init!.method} ${String(url)}`)).toEqual([
      `GET /api/try/${TOKEN}`,
      `GET /api/try/${TOKEN}/paper`,
      `DELETE /api/try/${TOKEN}/paper/4`,
      `POST /api/try/${TOKEN}/start`,
      `POST /api/try/${TOKEN}/start`,
      `GET /api/try/${TOKEN}/result`,
    ]);
    expect(fetchImpl.mock.calls[3]![1]!.body).toBe(JSON.stringify({ filesVersion: 3 }));
    expect(fetchImpl.mock.calls[4]![1]!.body).toBe(JSON.stringify({}));
  });

  it('sends a page raw, with its type and its encoded name', async () => {
    const stored = { id: 9, name: 'Pagina ș.pdf', contentType: PDF_TYPE, size: 3, position: 1 };
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(201, { file: stored }));
    const file = new File(['%PDF'], 'Pagina ș.pdf', { type: PDF_TYPE });
    expect(await createTryClient(TOKEN, { fetchImpl }).addPage(file)).toEqual(stored);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/try/${TOKEN}/paper`);
    expect(init!.method).toBe('PUT');
    expect(init!.body).toBe(file);
    expect(init!.headers).toMatchObject({ 'Content-Type': PDF_TYPE, 'X-File-Name': 'Pagina%20%C8%99.pdf' });
  });

  it('turns a refusal into an ApiError with its code, and a dropped connection into a network error', async () => {
    const refused = createTryClient(TOKEN, { fetchImpl: async () => jsonResponse(410, { error: 'expired', message: 'Încercarea a expirat.' }) });
    await expect(refused.info()).rejects.toMatchObject({ status: 410, code: 'expired', message: 'Încercarea a expirat.' });
    const dropped = createTryClient(TOKEN, {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const error = await dropped.listPages().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('network');
  });

  it("builds the try's base and its page links", () => {
    expect(tryBase(TOKEN)).toBe(`/api/try/${TOKEN}`);
    expect(pageFileUrl(TOKEN, 12)).toBe(`/api/try/${TOKEN}/paper/12`);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/admin/api.test.ts src/try/api.test.ts`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  1 failed | 23 passed (24)`: `Failed to resolve import "./api.ts" from "src/try/api.test.ts"`, and the teacher app's client has no `base` (`expected undefined to be '/api/try/abc'`). The 23 tests that pass at RED are the client's other tests.

- [ ] **Step 4: Edit `src/admin/api.ts`**

Find this block:

```ts
export interface AdminApi {
  me(): Promise<Teacher>;
```

Replace it with:

```ts
export interface AdminApi {
  // The address the calls and the file links start with: /api/admin, or
  // /api/try/<token> for a Quick Try's link.
  base: string;
  me(): Promise<Teacher>;
```

- [ ] **Step 5: Edit `src/admin/api.ts`**

Find this block:

```ts

// Files open straight from the API: the browser sends the login cookie.
export function testFileUrl(code: string, kind: TestFileKind, variant?: TestVariant): string {
  return `/api/admin${variantPath(code, variant)}/files/${kind}`;
}
```

Replace it with:

```ts

export const ADMIN_BASE = '/api/admin';

// Files open straight from the API: the browser sends the login cookie (or
// the address carries a Quick Try's token, in `base`).
export function testFileUrl(code: string, kind: TestFileKind, variant?: TestVariant, base = ADMIN_BASE): string {
  return `${base}${variantPath(code, variant)}/files/${kind}`;
}
```

- [ ] **Step 6: Edit `src/admin/api.ts`**

Find this block:

```ts

export function submissionFileUrl(submissionId: number, fileId: number): string {
  return `/api/admin/submissions/${submissionId}/files/${fileId}`;
}
```

Replace it with:

```ts

export function submissionFileUrl(submissionId: number, fileId: number, base = ADMIN_BASE): string {
  return `${base}/submissions/${submissionId}/files/${fileId}`;
}
```

- [ ] **Step 7: Edit `src/admin/api.ts`**

Find this block:

```ts
  onLoginExpired?: () => void;
}
```

Replace it with:

```ts
  onLoginExpired?: () => void;
  // /api/admin by default; a Quick Try's page passes /api/try/<token>. The
  // login calls keep /api/auth.
  base?: string;
}
```

- [ ] **Step 8: Edit `src/admin/api.ts`**

Find this block:

```ts
  const onLoginExpired = options.onLoginExpired ?? reloadForLogin;

  // A JSON body, or a file sent raw with its type and URI-encoded name.
  // `base` is /api/admin, or /api/auth for the login page.
  async function request<T>(method: string, path: string, body?: unknown, file?: File, base = '/api/admin'): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
```

Replace it with:

```ts
  const onLoginExpired = options.onLoginExpired ?? reloadForLogin;
  const apiBase = options.base ?? ADMIN_BASE;

  // A JSON body, or a file sent raw with its type and URI-encoded name.
  // `base` is the client's base, or /api/auth for the login page.
  async function request<T>(method: string, path: string, body?: unknown, file?: File, base = apiBase): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
```

- [ ] **Step 9: Edit `src/admin/api.ts`**

Find this block:

```ts
  return {
    me: async () => (await request<{ teacher: Teacher }>('GET', '/me')).teacher,
```

Replace it with:

```ts
  return {
    base: apiBase,
    me: async () => (await request<{ teacher: Teacher }>('GET', '/me')).teacher,
```

- [ ] **Step 10: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
import { submissionFileUrl } from '../api.ts';

```

Replace it with:

```tsx
import { submissionFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';

```

- [ ] **Step 11: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
export function ReviewPhoto({ submission, page, onPage }: { submission: SubmissionDetail; page: number; onPage: (page: number) => void }) {
  const files = submission.files;
```

Replace it with:

```tsx
export function ReviewPhoto({ submission, page, onPage }: { submission: SubmissionDetail; page: number; onPage: (page: number) => void }) {
  const { base } = useApi();
  const files = submission.files;
```

- [ ] **Step 12: Edit `src/admin/reviewPage/ReviewPhoto.tsx`**

Find this block:

```tsx
  const file = files[index]!;
  const url = submissionFileUrl(submission.id, file.id);
  const caption = `${submission.studentName} · pagina ${index + 1} din ${files.length}`;
```

Replace it with:

```tsx
  const file = files[index]!;
  const url = submissionFileUrl(submission.id, file.id, base);
  const caption = `${submission.studentName} · pagina ${index + 1} din ${files.length}`;
```

- [ ] **Step 13: Edit `src/admin/submissionPage/PageFiles.tsx`**

Find this block:

```tsx
import { submissionFileUrl } from '../api.ts';

```

Replace it with:

```tsx
import { submissionFileUrl } from '../api.ts';
import { useApi } from '../ApiContext.tsx';

```

- [ ] **Step 14: Edit `src/admin/submissionPage/PageFiles.tsx`**

Find this block:

```tsx
function PageFile({ submissionId, file, number }: { submissionId: number; file: SubmissionFile; number: number }) {
  const url = submissionFileUrl(submissionId, file.id);
  const caption = `Pagina ${number}: ${file.name} · ${formatFileSize(file.size)}`;
```

Replace it with:

```tsx
function PageFile({ submissionId, file, number }: { submissionId: number; file: SubmissionFile; number: number }) {
  const url = submissionFileUrl(submissionId, file.id, useApi().base);
  const caption = `Pagina ${number}: ${file.name} · ${formatFileSize(file.size)}`;
```

- [ ] **Step 15: Edit `src/test/fakeApi.ts`**

Find this block:

```ts
  const api = {
    me: vi.fn(async () => structuredClone(me)),
```

Replace it with:

```ts
  const api = {
    base: '/api/admin',
    me: vi.fn(async () => structuredClone(me)),
```

- [ ] **Step 16: Create `src/try/api.ts`**

```ts
import type { EvaluationStart, QuickTryInfo, StudentResultView, SubmissionFile } from '../../shared/api.ts';
import { uploadTypeOf } from '../../shared/files.ts';
import { ApiError, NETWORK_MESSAGE, readAnswer } from '../ui/ApiError.ts';

// The calls of a Quick Try's page that are its own (the test, its files and
// the review go through the teacher app's client, at tryBase). The page gets
// it as a prop, so tests can pass a fake.
export interface TryApi {
  info(): Promise<QuickTryInfo>;
  // The student's pages, in upload order.
  listPages(): Promise<SubmissionFile[]>;
  addPage(file: File): Promise<SubmissionFile>;
  deletePage(fileId: number): Promise<void>;
  // "Pornește corectarea". `filesVersion`: the version of the robot's barem
  // the page showed, which then counts as checked.
  start(filesVersion?: number): Promise<EvaluationStart>;
  // The page the student would see.
  result(): Promise<StudentResultView>;
}

export function tryBase(token: string): string {
  return `/api/try/${token}`;
}

// A page of the student's paper opens straight from the API: the link is the key.
export function pageFileUrl(token: string, fileId: number): string {
  return `${tryBase(token)}/paper/${fileId}`;
}

export function createTryClient(token: string, options: { fetchImpl?: typeof fetch } = {}): TryApi {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const base = tryBase(token);

  async function request<T>(method: string, path: string, body?: unknown, file?: File): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let payload: BodyInit | undefined;
    if (file) {
      headers['Content-Type'] = uploadTypeOf(file) || 'application/octet-stream';
      headers['X-File-Name'] = encodeURIComponent(file.name);
      payload = file;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, { method, headers, credentials: 'same-origin', ...(payload === undefined ? {} : { body: payload }) });
    } catch {
      throw new ApiError(0, 'network', NETWORK_MESSAGE);
    }
    return readAnswer<T>(res);
  }

  return {
    info: () => request<QuickTryInfo>('GET', ''),
    listPages: async () => (await request<{ files: SubmissionFile[] }>('GET', '/paper')).files,
    addPage: async (file) => (await request<{ file: SubmissionFile }>('PUT', '/paper', undefined, file)).file,
    deletePage: async (fileId) => {
      await request('DELETE', `/paper/${fileId}`);
    },
    start: (filesVersion) => request<EvaluationStart>('POST', '/start', filesVersion === undefined ? {} : { filesVersion }),
    result: async () => (await request<{ result: StudentResultView }>('GET', '/result')).result,
  };
}
```

- [ ] **Step 17: Run the tests to see them pass**

Run: `npx vitest run src/admin/api.test.ts src/try/api.test.ts`
Expected: PASS, `Tests  28 passed (28)`.

- [ ] **Step 18: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  146 passed | 1 skipped (147)`, `Tests  2247 passed | 3 skipped (2250)`.

- [ ] **Step 19: Commit**

```bash
git add src/admin/api.ts src/admin/api.test.ts src/admin/reviewPage/ReviewPhoto.tsx src/admin/submissionPage/PageFiles.tsx src/test/fakeApi.ts src/try/api.ts src/try/api.test.ts
git commit -m "Let the teacher app's client and file links work at a Quick Try's link, and add the try's own client"
```

Check: `git diff --stat refs/protoqtb/b1 HEAD -- . ':!docs'` prints nothing.

### Task 2: The student result of a try

**Files:**
- Create: `server/routes/quickTryResult.test.ts`, `src/upload/StudentResult.test.tsx`
- Modify: `server/db/results.ts`, `server/routes/quickTry.ts`, `src/upload/StudentResult.tsx`, `src/upload/ResultApp.tsx`
- Test: `server/routes/quickTryResult.test.ts`, `src/upload/StudentResult.test.tsx`

**Interfaces:**
- Consumes: part A's `tryAccess` (410 for an expired try) and `c.var.quickTry.submissionId`; `toStudentEvaluation`, `listSubmissionFiles`, `getEvaluation` in `server/db/results.ts`.
- Produces: `findResultBySubmission(db, submissionId): Promise<StudentResultView | null>` in `server/db/results.ts`; `GET /api/try/<token>/result` → `{ result: StudentResultView }`; `StudentResult({ result, fileUrl: (fileId: number) => string })`.

- [ ] **Step 1: Create `server/routes/quickTryResult.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QUICK_TRY_STUDENT, QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import { addEvaluation } from '../test/fixtures.ts';
import { startTestApi, type TestApi } from '../test/testApi.ts';

// GET /api/try/<token>/result: the page the try's student would see, the same
// view as the student app's result page, open without publishing.

let api: TestApi;
let token: string;
let code: string;
let submissionId: number;

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeEach(async () => {
  api = await startTestApi({ app: { verifyTurnstile: async () => true } });
  ({ token, code } = (await api.request('POST', '/api/try', { turnstileToken: 'ok' })).body);
  submissionId = (await api.request('GET', `/api/try/${token}`)).body.submissionId;
});

afterEach(async () => {
  await api.dispose();
});

describe('the student result of a try', () => {
  it('has no grading before the paper is graded', async () => {
    const res = await api.request('GET', `/api/try/${token}/result`);
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ testCode: code, testTitle: QUICK_TRY_TITLE, studentName: QUICK_TRY_STUDENT, files: [], evaluation: null });
  });

  it("shows the graded paper and its pages, with nothing that is for the teacher only", async () => {
    await api.fetch(`/api/try/${token}/paper`, { method: 'PUT', body: jpeg(), headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': 'p1.jpg' } });
    await api.db.prepare("UPDATE submissions SET status = 'graded', graded_at = '2026-10-07T09:00:00.000Z' WHERE id = ?").bind(submissionId).run();
    await addEvaluation(api, submissionId, { grade: 8, items: [{ needsReview: true }] });
    const { result } = (await api.request('GET', `/api/try/${token}/result`)).body;
    expect(result.status).toBe('graded');
    expect(result.files).toHaveLength(1);
    expect(result.evaluation.grade).toBe(8);
    expect(Object.keys(result.evaluation.items[0]).sort()).toEqual(['comment', 'exerciseId', 'label', 'maxPoints', 'points', 'studentAnswer']);
    const page = await api.fetch(`/api/try/${token}/paper/${result.files[0].id}`);
    expect(page.status).toBe(200);
  });

  it('is refused for an expired try', async () => {
    await api.db.prepare("UPDATE quick_tries SET expires_at = '2020-01-01T00:00:00.000Z'").run();
    expect((await api.request('GET', `/api/try/${token}/result`)).status).toBe(410);
  });
});
```

- [ ] **Step 2: Create `src/upload/StudentResult.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { StudentResultView } from '../../shared/api.ts';
import { StudentResult } from './StudentResult.tsx';

const result: StudentResultView = {
  testCode: 'PROBA-26T1',
  testTitle: 'Încercare rapidă',
  className: 'PROBA',
  studentName: 'Elev',
  status: 'graded',
  files: [{ id: 21, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 1024, position: 1 }],
  evaluation: null,
};

describe('StudentResult', () => {
  it('opens the pages at the addresses its page gives', async () => {
    render(<StudentResult result={result} fileUrl={(fileId) => `/api/try/abc/paper/${fileId}`} />);
    await userEvent.click(screen.getByRole('button', { name: 'Arată fișierele' }));
    expect(screen.getByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', '/api/try/abc/paper/21');
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run server/routes/quickTryResult.test.ts src/upload/StudentResult.test.tsx`
Expected: FAIL. `Test Files  2 failed (2)`, `Tests  3 failed | 1 passed (4)`: the route does not exist (`expected 404 to be 200`, `Cannot read properties of undefined (reading 'status')`), and `StudentResult` does not use `fileUrl` (the image's `src` is not `/api/try/abc/paper/21`). The test that passes at RED is a guard: an expired try's result answers 410 (part A's `tryAccess`).

- [ ] **Step 4: Edit `server/db/results.ts`**

Find this block:

```ts
// unpublished link costs one query.
export async function findResultByToken(
```

Replace it with:

```ts
// unpublished link costs one query.
const RESULT_SELECT = `SELECT t.code, t.title, c.name AS class_name, t.results_open AS test_open, s.results_open AS submission_open,
    s.id AS submission_id, s.status, st.full_name AS student_name
  FROM submissions s
  JOIN tests t ON t.id = s.test_id
  JOIN classes c ON c.id = t.class_id
  JOIN students st ON st.id = s.student_id`;

export async function findResultByToken(
```

- [ ] **Step 5: Edit `server/db/results.ts`**

Find this block:

```ts
): Promise<{ result: StudentResultView; resultsOpen: boolean } | null> {
  const row = await db
    .prepare(
      `SELECT t.code, t.title, c.name AS class_name, t.results_open AS test_open, s.results_open AS submission_open,
          s.id AS submission_id, s.status, st.full_name AS student_name
        FROM submissions s
        JOIN tests t ON t.id = s.test_id
        JOIN classes c ON c.id = t.class_id
        JOIN students st ON st.id = s.student_id
        WHERE s.result_token = ?`,
    )
    .bind(resultToken)
    .first<ResultRow>();
  if (!row) return null;
```

Replace it with:

```ts
): Promise<{ result: StudentResultView; resultsOpen: boolean } | null> {
  const row = await db.prepare(`${RESULT_SELECT} WHERE s.result_token = ?`).bind(resultToken).first<ResultRow>();
  if (!row) return null;
```

- [ ] **Step 6: Edit `server/db/results.ts`**

Find this block:

```ts
  }
  const files = (await listSubmissionFiles(db, row.submission_id)).map(publicFile);
  const evaluation = await getEvaluation(db, row.submission_id);
  const result: StudentResultView = {
    testCode: row.code,
```

Replace it with:

```ts
  }
  return { result: await openResult(db, row), resultsOpen: open };
}

// A Quick Try's student result, by its one paper: the same page as above,
// always open (the try's link is its key).
export async function findResultBySubmission(db: D1Database, submissionId: number): Promise<StudentResultView | null> {
  const row = await db.prepare(`${RESULT_SELECT} WHERE s.id = ?`).bind(submissionId).first<ResultRow>();
  return row ? openResult(db, row) : null;
}

async function openResult(db: D1Database, row: ResultRow): Promise<StudentResultView> {
  const files = (await listSubmissionFiles(db, row.submission_id)).map(publicFile);
  const evaluation = await getEvaluation(db, row.submission_id);
  return {
    testCode: row.code,
```

- [ ] **Step 7: Edit `server/db/results.ts`**

Find this block:

```ts
  };
  return { result, resultsOpen: open };
}
```

Replace it with:

```ts
  };
}
```

- [ ] **Step 8: Edit `server/routes/quickTry.ts`**

Find this block:

```ts
import { createQuickTry, dailyLimitReached, findQuickTry, guestTeacher, listPaperFiles } from '../db/quickTry.ts';
import { confirmBarem, requireTest } from '../db/tests.ts';
```

Replace it with:

```ts
import { createQuickTry, dailyLimitReached, findQuickTry, guestTeacher, listPaperFiles } from '../db/quickTry.ts';
import { findResultBySubmission } from '../db/results.ts';
import { confirmBarem, requireTest } from '../db/tests.ts';
```

- [ ] **Step 9: Edit `server/routes/quickTry.ts`**

Find this block:

```ts

  // "Pornește corectarea": a barem the robot made counts as checked (she
```

Replace it with:

```ts

  // The page the try's student would see: the student app's result view,
  // open without publishing.
  routes.get('/:token/result', async (c) => {
    const result = await findResultBySubmission(c.env.DB, c.var.quickTry.submissionId);
    if (!result) throw unknownTry();
    return c.json({ result });
  });

  // "Pornește corectarea": a barem the robot made counts as checked (she
```

- [ ] **Step 10: Edit `src/upload/StudentResult.tsx`**

Find this block:

```tsx
import { MathText } from '../ui/MathText.tsx';
import { resultFileUrl } from './api.ts';

```

Replace it with:

```tsx
import { MathText } from '../ui/MathText.tsx';

```

- [ ] **Step 11: Edit `src/upload/StudentResult.tsx`**

Find this block:

```tsx
// and the final words. Read-only: the only button shows or hides the files.
// Nothing here tells how the work was graded.
export function StudentResult({ result, resultToken }: { result: StudentResultView; resultToken: string }) {
  const [filesOpen, setFilesOpen] = useState(false);
```

Replace it with:

```tsx
// and the final words. Read-only: the only button shows or hides the files.
// Nothing here tells how the work was graded. `fileUrl` gives the address of a
// page: the student app's result link, or a Quick Try's link.
export function StudentResult({ result, fileUrl }: { result: StudentResultView; fileUrl: (fileId: number) => string }) {
  const [filesOpen, setFilesOpen] = useState(false);
```

- [ ] **Step 12: Edit `src/upload/StudentResult.tsx`**

Find this block:

```tsx
      </div>
      {filesOpen && <ResultFiles result={result} resultToken={resultToken} />}
      {evaluation ? (
```

Replace it with:

```tsx
      </div>
      {filesOpen && <ResultFiles result={result} fileUrl={fileUrl} />}
      {evaluation ? (
```

- [ ] **Step 13: Edit `src/upload/StudentResult.tsx`**

Find this block:

```tsx

function ResultFiles({ result, resultToken }: { result: StudentResultView; resultToken: string }) {
  if (result.files.length === 0) return <p className="hint">Nu ai încă niciun fișier aici.</p>;
```

Replace it with:

```tsx

function ResultFiles({ result, fileUrl }: { result: StudentResultView; fileUrl: (fileId: number) => string }) {
  if (result.files.length === 0) return <p className="hint">Nu ai încă niciun fișier aici.</p>;
```

- [ ] **Step 14: Edit `src/upload/StudentResult.tsx`**

Find this block:

```tsx
      {result.files.map((file, index) => {
        const url = resultFileUrl(resultToken, file.id);
        const caption = `Pagina ${index + 1}: ${file.name} · ${formatFileSize(file.size)}`;
```

Replace it with:

```tsx
      {result.files.map((file, index) => {
        const url = fileUrl(file.id);
        const caption = `Pagina ${index + 1}: ${file.name} · ${formatFileSize(file.size)}`;
```

- [ ] **Step 15: Edit `src/upload/ResultApp.tsx`**

Find this block:

```tsx
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import type { UploadApi } from './api.ts';
import { forgetResultLinkByToken } from './resultLinks.ts';
```

Replace it with:

```tsx
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { resultFileUrl, type UploadApi } from './api.ts';
import { forgetResultLinkByToken } from './resultLinks.ts';
```

- [ ] **Step 16: Edit `src/upload/ResultApp.tsx`**

Find this block:

```tsx
              </p>
              <StudentResult result={phase.result} resultToken={resultToken!} />
            </>
```

Replace it with:

```tsx
              </p>
              <StudentResult result={phase.result} fileUrl={(fileId) => resultFileUrl(resultToken!, fileId)} />
            </>
```

- [ ] **Step 17: Run the tests to see them pass**

Run: `npx vitest run server/routes/quickTryResult.test.ts src/upload/StudentResult.test.tsx src/upload/ResultApp.test.tsx`
Expected: PASS, `Test Files  3 passed (3)`.

- [ ] **Step 18: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  148 passed | 1 skipped (149)`, `Tests  2251 passed | 3 skipped (2254)`.

- [ ] **Step 19: Commit**

```bash
git add server/routes/quickTryResult.test.ts src/upload/StudentResult.test.tsx server/db/results.ts server/routes/quickTry.ts src/upload/StudentResult.tsx src/upload/ResultApp.tsx
git commit -m "Serve a Quick Try's student result through its link, from the student page's own code"
```

Check: `git diff --stat refs/protoqtb/b2 HEAD -- . ':!docs'` prints nothing.

### Task 3: The page at /try/<token>, private like a student link

**Files:**
- Create: `try/index.html`, `src/try/main.tsx`, `src/try/TryApp.tsx`, `src/try/TryNotice.tsx`, `src/try/TryHome.tsx`, `src/try/try.css`, `src/try/TryApp.test.tsx`, `src/try/hosting.test.ts`, `src/test/fakeTryApi.tsx`
- Modify: `vite.config.ts`, `public/_redirects`, `public/_headers`, `public/robots.txt`, `src/landing/robots.test.ts`
- Test: `src/try/TryApp.test.tsx`, `src/try/hosting.test.ts`, `src/landing/robots.test.ts`

**Interfaces:**
- Consumes: Task 1's `createApiClient({ base })`, `TryApi`, `createTryClient`, `tryBase`; `isQuickTryToken`, `QUICK_TRY_*` (`shared/quickTry.ts`); the teacher app's `ReviewPage`, `ApiProvider`, `ErrorMessage`; `fakeTest`, `fakeUpload`, `createFakeApi` (`src/test/fakeApi.ts`).
- Produces: `TryRoutes({ token: string | null, api: AdminApi, tryApi: TryApi })` in `src/try/TryApp.tsx` (the top bar, and the routes `/`, `/teste/:code`, `/teste/:code/verificare`, `*`), `BadLink`, `Expired` in `src/try/TryNotice.tsx`; in `src/test/fakeTryApi.tsx`: `TRY_TOKEN`, `TRY_CODE = 'PROBA-26T1'`, `TRY_SUBMISSION = 501`, `TRY_ADMIN_CALLS`, `tryAdminApi(api: FakeApi): AdminApi`, `tryTest(testOverrides?, uploadOverrides?)`, `createFakeTryApi({ info?, pages?, result? })`, `FakeTryApi`, `renderTry(path, api, tryApi, extra?)`. `TryHome` is a stub that Task 4 replaces.

- [ ] **Step 1: Create `src/test/fakeTryApi.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import type { EvaluationStart, QuickTryInfo, StudentResultView, SubmissionFile } from '../../shared/api.ts';
import { QUICK_TRY_CLASS, QUICK_TRY_STUDENT, QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import type { AdminApi } from '../admin/api.ts';
import { ApiError } from '../ui/ApiError.ts';
import type { TryApi } from '../try/api.ts';
import { TryRoutes } from '../try/TryApp.tsx';
import { fakeTest, fakeUpload, type FakeApi } from './fakeApi.ts';

export const TRY_TOKEN = 'abcdefghijkmnopqrstuvwxyz2345672';
export const TRY_CODE = 'PROBA-26T1';
export const TRY_SUBMISSION = 501;

// The calls of the teacher app's client a try's link allows (the allow-list of
// server/routes/quickTry.ts). A page test that reaches any other call fails.
export const TRY_ADMIN_CALLS = ['getTest', 'uploadTestFile', 'generateBarem', 'acceptExerciseList', 'getSubmission', 'correctItem', 'reviewPages'] as const;

// The fake teacher app's client as a try's link sees it: base /api/try/<token>,
// and every call outside TRY_ADMIN_CALLS throws.
export function tryAdminApi(api: FakeApi): AdminApi {
  const allowed = new Set<string>(TRY_ADMIN_CALLS);
  return new Proxy(api, {
    get(target, key, receiver) {
      if (key === 'base') return `/api/try/${TRY_TOKEN}`;
      const value = Reflect.get(target, key, receiver) as unknown;
      if (typeof key === 'string' && typeof value === 'function' && !allowed.has(key)) {
        return () => {
          throw new Error(`A try's link does not allow ${key}()`);
        };
      }
      return value;
    },
  }) as AdminApi;
}

// The try's test, as GET /api/try/<token>/tests/<code> answers: an open test of
// class PROBA with one student and its one paper.
export function tryTest(overrides: Parameters<typeof fakeTest>[0] = {}, upload: Partial<Parameters<typeof fakeUpload>[0]> = {}) {
  return fakeTest({ code: TRY_CODE, title: QUICK_TRY_TITLE, className: QUICK_TRY_CLASS, status: 'open', ...overrides }, [
    fakeUpload({ studentId: 1, studentName: QUICK_TRY_STUDENT, submissionId: TRY_SUBMISSION, status: 'uploading', ...upload }),
  ]);
}

export interface FakeTryData {
  info?: Partial<QuickTryInfo>;
  pages?: SubmissionFile[];
  result?: StudentResultView;
}

// An in-memory TryApi. `start` answers like the server for a ready try.
export function createFakeTryApi(data: FakeTryData = {}) {
  let nextId = 900;
  const pages = (data.pages ??= []);
  const info: QuickTryInfo = { code: TRY_CODE, submissionId: TRY_SUBMISSION, expiresAt: '2026-11-17T10:00:00.000Z', expired: false, ...data.info };
  const api = {
    info: vi.fn(async () => structuredClone(info)),
    listPages: vi.fn(async () => structuredClone(pages)),
    addPage: vi.fn(async (file: File) => {
      const stored: SubmissionFile = { id: nextId++, name: file.name, contentType: file.type, size: file.size, position: pages.length + 1 };
      pages.push(stored);
      return structuredClone(stored);
    }),
    deletePage: vi.fn(async (fileId: number) => {
      const index = pages.findIndex((page) => page.id === fileId);
      if (index < 0) throw new ApiError(404, 'not_found', 'Nu am găsit fișierul.');
      pages.splice(index, 1);
    }),
    start: vi.fn(async (_filesVersion?: number): Promise<EvaluationStart> => ({ status: 'evaluating', evaluationAt: null, robot: 'dispatched' })),
    result: vi.fn(async () => {
      if (!data.result) throw new ApiError(404, 'unknown_try', 'Linkul nu este bun.');
      return structuredClone(data.result);
    }),
  } satisfies TryApi;
  return api;
}

export type FakeTryApi = ReturnType<typeof createFakeTryApi>;

// Renders a try's page at a path under /try/<token> (without that base), with
// the fake clients. `extra` is drawn inside the router.
export function renderTry(path: string, api: FakeApi, tryApi: FakeTryApi, extra?: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        {extra}
        <TryRoutes token={TRY_TOKEN} api={tryAdminApi(api)} tryApi={tryApi} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

- [ ] **Step 2: Create `src/try/TryApp.test.tsx`**

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeApi } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, TRY_CODE, tryTest } from '../test/fakeTryApi.tsx';

const fakes = (data: Parameters<typeof createFakeTryApi>[0] = {}) => {
  const api = createFakeApi({ classes: [], students: {}, tests: [tryTest()] });
  return { api, tryApi: createFakeTryApi(data) };
};

describe("a Quick Try's page", () => {
  it("opens on the try's page, under the teacher pages' lockup", async () => {
    const { api, tryApi } = fakes();
    renderTry('/', api, tryApi);
    expect(await screen.findByRole('heading', { name: 'Încercare rapidă', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'MQGrader by Laura Miron' })).toHaveAttribute('href', '/');
    expect(screen.getByText(TRY_CODE)).toBeInTheDocument();
  });

  it('says an expired try expired, and leads to a new one', async () => {
    const { api, tryApi } = fakes({ info: { expired: true } });
    renderTry('/', api, tryApi);
    expect(await screen.findByRole('heading', { name: 'Încercarea a expirat' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fă o încercare nouă' })).toHaveAttribute('href', '/');
  });

  it('says so when the link is not a try', async () => {
    const { api, tryApi } = fakes();
    tryApi.info.mockRejectedValue(new ApiError(404, 'unknown_try', 'Linkul nu este bun.'));
    renderTry('/', api, tryApi);
    expect(await screen.findByRole('heading', { name: 'Linkul nu este bun' })).toBeInTheDocument();
  });

  it('comes back to the try from an address of the teacher app that it does not have', async () => {
    const { api, tryApi } = fakes();
    renderTry('/teste/PROBA-26T1/raport', api, tryApi);
    expect(await screen.findByRole('heading', { name: 'Încercare rapidă', level: 1 })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Create `src/try/hosting.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import headers from '../../public/_headers?raw';
import redirects from '../../public/_redirects?raw';
import page from '../../try/index.html?raw';

// A Quick Try's page (/try/<token>) is private like a student link: never
// indexed, and every address under /try/ loads the same page.
describe("a Quick Try's page on Pages", () => {
  it('loads try/index.html for every /try/<token>, in the directory form', () => {
    expect(redirects.split('\n')).toContain('/try/* /try/ 200');
  });

  it('is never indexed', () => {
    expect(headers).toMatch(/^\/try\/\*\n {2}X-Robots-Tag: noindex, nofollow$/m);
    expect(page).toContain('<meta name="robots" content="noindex, nofollow" />');
  });

  it('runs its own script and says what it is', () => {
    expect(page).toContain('<script type="module" src="/src/try/main.tsx"></script>');
    expect(page).toContain('<title>MQGrader · Încercare rapidă</title>');
  });
});
```

- [ ] **Step 4: Edit `src/landing/robots.test.ts`**

Find this block:

```ts

  it('keeps student links and the API closed in every group', () => {
    const all = groups();
```

Replace it with:

```ts

  it('keeps student links, Quick Try links and the API closed in every group', () => {
    const all = groups();
```

- [ ] **Step 5: Edit `src/landing/robots.test.ts`**

Find this block:

```ts
      expect(group.rules, group.agents.join(',')).toContain('Disallow: /u/');
      expect(group.rules, group.agents.join(',')).toContain('Disallow: /api/');
```

Replace it with:

```ts
      expect(group.rules, group.agents.join(',')).toContain('Disallow: /u/');
      expect(group.rules, group.agents.join(',')).toContain('Disallow: /try/');
      expect(group.rules, group.agents.join(',')).toContain('Disallow: /api/');
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run src/try/TryApp.test.tsx src/try/hosting.test.ts src/landing/robots.test.ts`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  1 failed | 6 passed (7)`: `Failed to resolve import "../try/TryApp.tsx" from "src/test/fakeTryApi.tsx"`, `Failed to resolve import "../../try/index.html?raw"`, and `robots.txt` has no `Disallow: /try/`. The six tests that pass at RED are the other tests of `src/landing/robots.test.ts`.

- [ ] **Step 7: Create `try/index.html`**

```html
<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>MQGrader · Încercare rapidă</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <script src="/theme.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/try/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Edit `vite.config.ts`**

Find this block:

```ts

// The teacher app (/teacher/) and the student app (/u/) are single-page apps.
// In dev, every page request under them gets their index.html, the same as
// public/_redirects does on Pages.
const APPS = ['/teacher', '/u'];

```

Replace it with:

```ts

// The teacher app (/teacher/), the student app (/u/) and a Quick Try's page
// (/try/) are single-page apps. In dev, every page request under them gets
// their index.html, the same as public/_redirects does on Pages.
const APPS = ['/teacher', '/u', '/try'];

```

- [ ] **Step 9: Edit `vite.config.ts`**

Find this block:

```ts
        upload: page('./u/index.html'),
      },
```

Replace it with:

```ts
        upload: page('./u/index.html'),
        try: page('./try/index.html'),
      },
```

- [ ] **Step 10: Edit `public/_redirects`**

Find this block:

```text
# The teacher app and the student app are single-page apps: every /teacher page
# loads /teacher/ (teacher/index.html), every /u/<token> page loads /u/
# (u/index.html). Keep this directory form: wrangler refuses
# "/teacher/* /teacher/index.html 200" as a redirect loop.
```

Replace it with:

```text
# The teacher app, the student app and a Quick Try's page are single-page apps:
# every /teacher page loads /teacher/ (teacher/index.html), every /u/<token>
# page loads /u/ (u/index.html), every /try/<token> page loads /try/
# (try/index.html). Keep this directory form: wrangler refuses
# "/teacher/* /teacher/index.html 200" as a redirect loop.
```

- [ ] **Step 11: Edit `public/_redirects`**

Find this block:

```text
/u/* /u/ 200

```

Replace it with:

```text
/u/* /u/ 200
/try/* /try/ 200

```

- [ ] **Step 12: Edit `public/_headers`**

Find this block:

```text
/u/*
  X-Robots-Tag: noindex, nofollow
```

Replace it with:

```text
/u/*
  X-Robots-Tag: noindex, nofollow

/try/*
  X-Robots-Tag: noindex, nofollow
```

- [ ] **Step 13: Replace `public/robots.txt`**

```text
# Only the landing page is public. The teacher app (/teacher/) answers with noindex,
# so it must stay crawlable for that to be seen. Student links, Quick Try links and the API are closed.
User-agent: *
Allow: /
Disallow: /u/
Disallow: /try/
Disallow: /api/

# AI search and answer engines may read and cite the landing page.
User-agent: OAI-SearchBot
Allow: /
Disallow: /u/
Disallow: /try/
Disallow: /api/

User-agent: ChatGPT-User
Allow: /
Disallow: /u/
Disallow: /try/
Disallow: /api/

User-agent: GPTBot
Allow: /
Disallow: /u/
Disallow: /try/
Disallow: /api/

User-agent: PerplexityBot
Allow: /
Disallow: /u/
Disallow: /try/
Disallow: /api/

User-agent: ClaudeBot
Allow: /
Disallow: /u/
Disallow: /try/
Disallow: /api/

User-agent: Claude-SearchBot
Allow: /
Disallow: /u/
Disallow: /try/
Disallow: /api/

User-agent: Claude-User
Allow: /
Disallow: /u/
Disallow: /try/
Disallow: /api/

User-agent: Google-Extended
Allow: /
Disallow: /u/
Disallow: /try/
Disallow: /api/

User-agent: Applebot-Extended
Allow: /
Disallow: /u/
Disallow: /try/
Disallow: /api/

Sitemap: https://mqgrader.ro/sitemap.xml
```

- [ ] **Step 14: Create `src/try/TryNotice.tsx`**

```tsx
// The two ends of a try's link: a link that is not a try's, and a try whose
// 7 days are over (spec §3.3, state 6). Both lead to a new try from the
// landing page.
export function BadLink() {
  return (
    <section className="try-notice">
      <h1>Linkul nu este bun</h1>
      <p>Verifică dacă l-ai copiat întreg.</p>
      <a className="button" href="/">
        Mergi la pagina principală
      </a>
    </section>
  );
}

export function Expired() {
  return (
    <section className="try-notice">
      <h1>Încercarea a expirat</h1>
      <p>Linkul unei încercări rapide merge 7 zile. Poți face o încercare nouă de pe pagina principală.</p>
      <a className="button" href="/">
        Fă o încercare nouă
      </a>
    </section>
  );
}
```

- [ ] **Step 15: Create `src/try/TryHome.tsx`**

```tsx
import type { QuickTryInfo } from '../../shared/api.ts';
import type { TryApi } from './api.ts';

// The try's page: its states come in the next tasks.
export function TryHome({ info }: { info: QuickTryInfo; tryApi: TryApi }) {
  return (
    <section>
      <h1>Încercare rapidă</h1>
      <p className="hint">{info.code}</p>
    </section>
  );
}
```

- [ ] **Step 16: Create `src/try/TryApp.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router';
import type { AdminApi } from '../admin/api.ts';
import { ApiProvider } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { ReviewPage } from '../admin/pages/ReviewPage.tsx';
import { ApiError } from '../ui/ApiError.ts';
import { BrandMark } from '../ui/BrandMark.tsx';
import { ErrorBoundary } from '../ui/ErrorBoundary.tsx';
import { ThemeButton } from '../ui/ThemeButton.tsx';
import type { TryApi } from './api.ts';
import { TryHome } from './TryHome.tsx';
import { BadLink, Expired } from './TryNotice.tsx';

// An answer that says the try's 7 days are over (410 `expired`): every call
// of the link answers so once they are.
export function isExpired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'expired';
}

// A Quick Try's page at /try/<token>: the try's states, and the teacher app's
// own review at /teste/<code>/verificare (its links to /teste/<code> come back
// here). `token` is null for an address that is not a try's link.
export function TryRoutes({ token, api, tryApi }: { token: string | null; api: AdminApi; tryApi: TryApi }) {
  return (
    <ApiProvider api={api}>
      <header className="topbar try-topbar">
        <a className="brand" href="/" aria-label="MQGrader by Laura Miron">
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">MQGrader</span>
            <span className="brand-by">by Laura Miron</span>
          </span>
        </a>
        <div className="topbar-tools">
          <ThemeButton />
        </div>
      </header>
      <main className="try-page">
        <ErrorBoundary>{token === null ? <BadLink /> : <TryLoader tryApi={tryApi} />}</ErrorBoundary>
      </main>
    </ApiProvider>
  );
}

function TryLoader({ tryApi }: { tryApi: TryApi }) {
  const info = useQuery({ queryKey: ['try'], queryFn: () => tryApi.info() });
  if (info.isPending) return <p>Se încarcă…</p>;
  if (info.data === undefined) {
    if (isExpired(info.error)) return <Expired />;
    if (info.error instanceof ApiError && info.error.code === 'unknown_try') return <BadLink />;
    return <ErrorMessage error={info.error} />;
  }
  if (info.data.expired) return <Expired />;
  const home = <TryHome info={info.data} tryApi={tryApi} />;
  return (
    <Routes>
      <Route path="/" element={home} />
      <Route path="/teste/:code" element={home} />
      <Route path="/teste/:code/verificare" element={<ReviewPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
```

- [ ] **Step 17: Create `src/try/try.css`**

```css
/* A Quick Try's page: the teacher app's top bar and look, in one column. */
.try-topbar {
  position: static;
}

.try-page {
  max-width: 72rem;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
}

.try-notice {
  max-width: 36rem;
  margin: 3rem auto;
  text-align: center;
}
```

- [ ] **Step 18: Create `src/try/main.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { isQuickTryToken } from '../../shared/quickTry.ts';
import { createApiClient } from '../admin/api.ts';
import '../ui/brand.css';
import { createTryClient, tryBase } from './api.ts';
import './try.css';
import { TryRoutes } from './TryApp.tsx';

// /try/<token>: the token is the second part of the path.
const raw = window.location.pathname.split('/')[2] ?? '';
const token = isQuickTryToken(raw) ? raw : null;
const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={`/try/${raw}`}>
        <TryRoutes
          token={token}
          // A try has no login: an answer that is not the API's own is an error, never a reload.
          api={createApiClient({ base: tryBase(raw), onLoginExpired: () => undefined })}
          tryApi={createTryClient(raw)}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 19: Run the tests to see them pass**

Run: `npx vitest run src/try/TryApp.test.tsx src/try/hosting.test.ts src/landing/robots.test.ts`
Expected: PASS, `Tests  14 passed (14)`.

- [ ] **Step 20: Typecheck, build, and run all tests**

Run: `npm run build` (the typecheck, then the Vite build, which now also writes `dist/try/index.html`), then `npm test`
Expected: no type errors, `dist/try/index.html` exists; `Test Files  150 passed | 1 skipped (151)`, `Tests  2258 passed | 3 skipped (2261)`.

- [ ] **Step 21: Commit**

```bash
git add try/index.html src/try/main.tsx src/try/TryApp.tsx src/try/TryNotice.tsx src/try/TryHome.tsx src/try/try.css src/try/TryApp.test.tsx src/try/hosting.test.ts src/test/fakeTryApi.tsx vite.config.ts public/_redirects public/_headers public/robots.txt src/landing/robots.test.ts
git commit -m "Add a Quick Try's page at /try/<token>, private like a student link"
```

Check: `git diff --stat refs/protoqtb/b3 HEAD -- . ':!docs'` prints nothing.

### Task 4: Before the grading: the files, the robot's barem, the pages, the start

**Files:**
- Create: `src/try/phase.ts`, `src/try/phase.test.ts`, `src/try/Prepare.tsx`, `src/try/Prepare.test.tsx`
- Modify: `src/try/TryApp.tsx`, `src/try/TryNotice.tsx`, `src/try/TryHome.tsx`, `src/try/TryApp.test.tsx`, `src/try/try.css`
- Test: `src/try/phase.test.ts`, `src/try/Prepare.test.tsx`, `src/try/TryApp.test.tsx`

**Interfaces:**
- Consumes: Task 3's fakes and `TryRoutes`; the teacher app's `FileDrop`, `testFileUrl(…, api.base)`, `uploadTestFile`, `generateBarem`; `QUICK_TRY_FILE_CHANGES`; `fileProblem`, `STUDENT_FILE_TYPES`, `STUDENT_WRONG_TYPE`, `MAX_STUDENT_FILES` (`shared/files.ts`).
- Produces: in `src/try/phase.ts`: `TryPhase = 'prepare' | 'grading' | 'problem' | 'failed' | 'graded'`, `paperOf(detail): UploadRow | null`, `phaseOf(detail): TryPhase`, `refreshOf(detail | undefined): number | false` (10 000 while the robot works for the try), `fileChangesLeft(detail): number`; `Prepare({ detail, tryApi })` and the exported `TestFile({ code, kind, name, disabled })` (Task 5 exports it) in `src/try/Prepare.tsx`; `isExpired(error): boolean` moves to `src/try/TryNotice.tsx`. `TryHome` reads the test under the query key `['test', code]` (the review's key) and the pages under `['try', 'pages']`.

- [ ] **Step 1: Create `src/try/phase.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { tryTest } from '../test/fakeTryApi.tsx';
import { fileChangesLeft, phaseOf, refreshOf } from './phase.ts';

describe('phaseOf', () => {
  it('prepares while the paper was not sent', () => {
    expect(phaseOf(tryTest())).toBe('prepare');
    expect(phaseOf(tryTest({ barem: { request: 'requested', unchecked: false } }))).toBe('prepare');
    expect(phaseOf(tryTest({ barem: { request: 'none', unchecked: true } }))).toBe('prepare');
  });

  it('grades once the paper was sent, and asks when the barem has a problem', () => {
    expect(phaseOf(tryTest({ status: 'evaluating' }, { status: 'submitted' }))).toBe('grading');
    expect(phaseOf(tryTest({ status: 'evaluating' }, { status: 'grading' }))).toBe('grading');
    expect(phaseOf(tryTest({ status: 'evaluating', exerciseList: { status: 'problem', message: 'Totalul este 9.' } }, { status: 'submitted' }))).toBe(
      'problem',
    );
  });

  it('fails as the server gives the place back: barem, exercise list, or paper', () => {
    expect(phaseOf(tryTest({ barem: { request: 'failed', unchecked: false } }))).toBe('failed');
    expect(phaseOf(tryTest({ status: 'evaluating', exerciseList: { status: 'failed', message: null } }, { status: 'submitted' }))).toBe('failed');
    expect(phaseOf(tryTest({ status: 'evaluating' }, { status: 'failed' }))).toBe('failed');
  });

  it('is graded once the paper is', () => {
    expect(phaseOf(tryTest({ status: 'done' }, { status: 'graded' }))).toBe('graded');
  });
});

describe('refreshOf', () => {
  it('reads again every 10 s only while the robot works for the try', () => {
    expect(refreshOf(undefined)).toBe(false);
    expect(refreshOf(tryTest())).toBe(false);
    expect(refreshOf(tryTest({ barem: { request: 'requested', unchecked: false } }))).toBe(10_000);
    expect(refreshOf(tryTest({ status: 'evaluating' }, { status: 'submitted' }))).toBe(10_000);
    expect(refreshOf(tryTest({ status: 'done' }, { status: 'graded' }))).toBe(false);
  });
});

describe('fileChangesLeft', () => {
  it('counts down from 6 and stops at 0', () => {
    expect(fileChangesLeft(tryTest())).toBe(6);
    expect(fileChangesLeft(tryTest({ filesVersion: 2 }))).toBe(4);
    expect(fileChangesLeft(tryTest({ filesVersion: 7 }))).toBe(0);
  });
});
```

- [ ] **Step 2: Create `src/try/Prepare.test.tsx`**

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { ApiError } from '../ui/ApiError.ts';
import { createFakeApi } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, TRY_CODE, TRY_TOKEN, tryTest } from '../test/fakeTryApi.tsx';

const testFile = { name: 'test.pdf', type: PDF_TYPE };
const baremFile = { name: 'barem.pdf', type: PDF_TYPE };
const page = { id: 31, name: 'p1.jpg', contentType: 'image/jpeg', size: 2048, position: 1 };

function setup(overrides: Parameters<typeof tryTest>[0] = {}, pages = [page]) {
  const api = createFakeApi({ classes: [], students: {}, tests: [tryTest(overrides)] });
  const tryApi = createFakeTryApi({ pages: structuredClone(pages) });
  renderTry('/', api, tryApi);
  return { api, tryApi };
}

const startButton = () => screen.findByRole('button', { name: 'Pornește corectarea' });

describe("a try's files before the grading", () => {
  it('sends a missing test file and says what is still missing', async () => {
    const { api } = setup({}, []);
    expect(await startButton()).toBeDisabled();
    expect(screen.getByText('Lipsește: testul, baremul, paginile lucrării.')).toBeInTheDocument();
    const file = new File(['%PDF-1.7'], 'test.pdf', { type: PDF_TYPE });
    await userEvent.upload(screen.getByLabelText(/Fișierul testului/), file);
    await waitFor(() => expect(api.uploadTestFile).toHaveBeenCalledWith(TRY_CODE, 'test', file));
    expect(await screen.findByRole('link', { name: 'test.pdf' })).toHaveAttribute('href', `/api/try/${TRY_TOKEN}/tests/${TRY_CODE}/files/test`);
    expect(screen.getByText('Lipsește: baremul, paginile lucrării.')).toBeInTheDocument();
  });

  it('asks the robot for the barem only once the test is there, then waits for it', async () => {
    const { api } = setup({ files: { test: testFile, barem: null } });
    const generate = await screen.findByRole('button', { name: 'Fă baremul din test' });
    await userEvent.click(generate);
    expect(api.generateBarem).toHaveBeenCalledWith(TRY_CODE);
    expect(await screen.findByText(/Robotul face baremul din test/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pornește corectarea' })).toBeDisabled();
  });

  it('cannot ask for a barem without the test', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Fă baremul din test' })).toBeDisabled();
  });

  it("starts with the robot's barem the page showed, after she downloads it", async () => {
    const { tryApi } = setup({ files: { test: testFile, barem: baremFile }, barem: { request: 'none', unchecked: true }, filesVersion: 2 });
    expect(await screen.findByRole('link', { name: 'Descarcă baremul' })).toHaveAttribute('href', `/api/try/${TRY_TOKEN}/tests/${TRY_CODE}/files/barem`);
    expect(screen.getByText(/Corectarea pornește doar când apeși/)).toBeInTheDocument();
    await userEvent.click(await startButton());
    expect(tryApi.start).toHaveBeenCalledWith(2);
  });

  it('starts with her own barem without naming a version', async () => {
    const { tryApi } = setup({ files: { test: testFile, barem: baremFile } });
    await userEvent.click(await startButton());
    expect(tryApi.start).toHaveBeenCalledWith(undefined);
  });

  it('shows why the start was refused', async () => {
    const { tryApi } = setup({ files: { test: testFile, barem: baremFile } });
    tryApi.start.mockRejectedValue(new ApiError(409, 'missing_pages', 'Lucrarea nu are nicio pagină.'));
    await userEvent.click(await startButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Lucrarea nu are nicio pagină.');
  });

  it('sends the pages in order, refuses a wrong type, and takes one out', async () => {
    const { tryApi } = setup({}, []);
    await startButton();
    const first = new File(['a'], 'p1.jpg', { type: 'image/jpeg' });
    const second = new File(['b'], 'p2.pdf', { type: PDF_TYPE });
    await userEvent.upload(screen.getByLabelText('Adaugă pagini'), [first, second]);
    expect(await screen.findByText(/Pagina 2: p2.pdf/)).toBeInTheDocument();
    expect(tryApi.addPage.mock.calls.map(([file]) => file.name)).toEqual(['p1.jpg', 'p2.pdf']);
    await userEvent.upload(screen.getByLabelText('Adaugă pagini'), new File(['x'], 'nota.txt', { type: 'text/plain' }), { applyAccept: false });
    expect(screen.getByRole('alert')).toHaveTextContent('Trimite poze JPG sau PDF.');
    expect(tryApi.addPage).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Șterge pagina 1' }));
    await waitFor(() => expect(screen.queryByText(/p1.jpg/)).not.toBeInTheDocument());
    expect(within(screen.getByRole('list', { name: 'Paginile lucrării' })).getByText(/Pagina 1: p2.pdf/)).toBeInTheDocument();
  });

  it('counts the file changes left, and stops them at the limit', async () => {
    setup({ files: { test: testFile, barem: baremFile }, filesVersion: 4 });
    expect(await screen.findByText(/Mai poți încărca testul și baremul de 2 ori în total/)).toBeInTheDocument();
  });

  it('takes no new test or barem once the six changes are used', async () => {
    setup({ files: { test: testFile, barem: baremFile }, filesVersion: 6 });
    expect(await screen.findByText('Nu mai poți schimba testul sau baremul în această încercare.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Fișierul testului/)).toBeDisabled();
    expect(screen.getByLabelText(/Fișierul baremului/)).toBeDisabled();
  });

  it('never shows the students\' link or a QR code', async () => {
    setup({ files: { test: testFile, barem: baremFile } });
    await startButton();
    expect(document.body.textContent).not.toContain('abcdefghijkmnop2');
    expect(screen.queryByText(/QR/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Edit `src/try/TryApp.test.tsx`**

Find this block:

```tsx
import { createFakeApi } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, TRY_CODE, tryTest } from '../test/fakeTryApi.tsx';

```

Replace it with:

```tsx
import { createFakeApi } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, tryTest } from '../test/fakeTryApi.tsx';

```

- [ ] **Step 4: Edit `src/try/TryApp.test.tsx`**

Find this block:

```tsx
    expect(screen.getByRole('link', { name: 'MQGrader by Laura Miron' })).toHaveAttribute('href', '/');
    expect(screen.getByText(TRY_CODE)).toBeInTheDocument();
  });
```

Replace it with:

```tsx
    expect(screen.getByRole('link', { name: 'MQGrader by Laura Miron' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Corectezi o lucrare, fără cont. Linkul acestei pagini merge 7 zile.')).toBeInTheDocument();
  });
```

- [ ] **Step 5: Edit `src/try/TryApp.test.tsx`**

Find this block:

```tsx

  it('comes back to the try from an address of the teacher app that it does not have', async () => {
```

Replace it with:

```tsx

  it('says an expired try expired when the test answers so', async () => {
    const { api, tryApi } = fakes();
    api.getTest.mockRejectedValue(new ApiError(410, 'expired', 'Încercarea a expirat.'));
    renderTry('/', api, tryApi);
    expect(await screen.findByRole('heading', { name: 'Încercarea a expirat' })).toBeInTheDocument();
  });

  it('comes back to the try from an address of the teacher app that it does not have', async () => {
```

- [ ] **Step 6: Run the tests to see them fail**

Run: `npx vitest run src/try/phase.test.ts src/try/Prepare.test.tsx src/try/TryApp.test.tsx`
Expected: FAIL. `Test Files  3 failed (3)`, `Tests  12 failed | 3 passed (15)`: `Failed to resolve import "./phase.ts"`, the page has no parts yet (`Unable to find role="button" and name "Pornește corectarea"`, the same for "Fă baremul din test" and the link "Descarcă baremul"), and the stub neither reads the test nor shows the new line. The three tests of `src/try/TryApp.test.tsx` that pass at RED are guards: an expired try by its info, a link that is not a try, and an unknown address.

- [ ] **Step 7: Create `src/try/phase.ts`**

```ts
import type { TestDetail, UploadRow } from '../../shared/api.ts';
import { QUICK_TRY_FILE_CHANGES } from '../../shared/quickTry.ts';

// Where a try stands (spec §3.3), from its test:
// - prepare: the files are being sent, or the robot's barem is made or waits
//   for "Pornește corectarea" (states 1 and 2);
// - grading: the paper went to grading (state 3);
// - problem: the barem's points do not add up, and the teacher decides;
// - failed: the robot could not make the barem, read the test and the barem,
//   or grade the paper; the try gives its place back (state 5);
// - graded: the paper is graded (state 4).
export type TryPhase = 'prepare' | 'grading' | 'problem' | 'failed' | 'graded';

// The try's one paper.
export function paperOf(detail: TestDetail): UploadRow | null {
  return detail.uploads[0] ?? null;
}

export function phaseOf(detail: TestDetail): TryPhase {
  const { test } = detail;
  const status = paperOf(detail)?.status ?? 'none';
  // The same three failures as the server's give-back (server/db/quickTry.ts).
  if (test.barem.request === 'failed' || test.exerciseList.status === 'failed' || status === 'failed') return 'failed';
  if (status === 'graded') return 'graded';
  if (status === 'submitted' || status === 'grading') return test.exerciseList.status === 'problem' ? 'problem' : 'grading';
  return 'prepare';
}

// The page reads the test again every 10 s while the robot works for it: a
// barem it makes, or the grading.
export function refreshOf(detail: TestDetail | undefined): number | false {
  if (!detail) return false;
  const phase = phaseOf(detail);
  return phase === 'grading' || (phase === 'prepare' && detail.test.barem.request === 'requested') ? 10_000 : false;
}

// The changes of the test and barem files a try has left (the server's cap;
// the robot's own barem counts as one).
export function fileChangesLeft(detail: TestDetail): number {
  return Math.max(0, QUICK_TRY_FILE_CHANGES - detail.test.filesVersion);
}
```

- [ ] **Step 8: Edit `src/try/TryNotice.tsx`**

Find this block:

```tsx
// The two ends of a try's link: a link that is not a try's, and a try whose
```

Replace it with:

```tsx
import { ApiError } from '../ui/ApiError.ts';

// An answer that says the try's 7 days are over (410 `expired`): every call
// of the link answers so once they are.
export function isExpired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'expired';
}

// The two ends of a try's link: a link that is not a try's, and a try whose
```

- [ ] **Step 9: Edit `src/try/TryApp.tsx`**

Find this block:

```tsx
import { TryHome } from './TryHome.tsx';
import { BadLink, Expired } from './TryNotice.tsx';

// An answer that says the try's 7 days are over (410 `expired`): every call
// of the link answers so once they are.
export function isExpired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'expired';
}

```

Replace it with:

```tsx
import { TryHome } from './TryHome.tsx';
import { BadLink, Expired, isExpired } from './TryNotice.tsx';

```

- [ ] **Step 10: Create `src/try/Prepare.tsx`**

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';
import type { TestDetail } from '../../shared/api.ts';
import { fileProblem, MAX_STUDENT_FILES, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE, type TestFileKind } from '../../shared/files.ts';
import { testFileUrl } from '../admin/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { FileDrop } from '../admin/newTest/FileDrop.tsx';
import { formatFileSize } from '../ui/format.ts';
import type { TryApi } from './api.ts';
import { fileChangesLeft } from './phase.ts';

const PAGE_ACCEPT = [...STUDENT_FILE_TYPES, '.jpg', '.jpeg', '.png', '.webp', '.pdf'].join(',');

// Before the grading (spec §3.3, states 1 and 2): the test, the barem (her
// own, or the robot's, which she downloads and reads), and the student's
// pages, then "Pornește corectarea". The landing page's form sends these
// first; here she sends what is missing and may replace a file.
export function Prepare({ detail, tryApi }: { detail: TestDetail; tryApi: TryApi }) {
  const queryClient = useQueryClient();
  const { test } = detail;
  const pages = useQuery({ queryKey: ['try', 'pages'], queryFn: () => tryApi.listPages() });
  const pageCount = pages.data?.length ?? 0;
  const robotBarem = test.barem.unchecked && test.files.barem !== null;
  const baremBusy = test.barem.request === 'requested';
  const missing = [
    test.files.test === null && 'testul',
    (test.files.barem === null || baremBusy) && 'baremul',
    pageCount === 0 && 'paginile lucrării',
  ].filter((part) => part !== false);
  const start = useMutation({
    mutationFn: () => tryApi.start(robotBarem ? test.filesVersion : undefined),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
  });
  const left = fileChangesLeft(detail);

  return (
    <>
      <ol className="steps">
        <li className="step">
          <div>
            <h2>Testul</h2>
            <p>Testul așa cum l-ai tipărit, fără răspunsuri. PDF sau Word.</p>
            <TestFile code={test.code} kind="test" name={test.files.test?.name ?? null} disabled={left === 0} />
          </div>
        </li>
        <li className="step">
          <div>
            <h2>Baremul</h2>
            <Barem detail={detail} robotBarem={robotBarem} disabled={left === 0} />
          </div>
        </li>
        <li className="step">
          <div>
            <h2>Lucrarea elevului</h2>
            <p>Pozele sau PDF-ul lucrării unui elev, în ordinea paginilor. Cel mult {MAX_STUDENT_FILES} de fișiere.</p>
            <Pages tryApi={tryApi} />
          </div>
        </li>
      </ol>
      <p className="hint">
        {left === 0
          ? 'Nu mai poți schimba testul sau baremul în această încercare.'
          : `Mai poți încărca testul și baremul de ${left} ori în total. Baremul făcut de robot se numără și el o dată.`}
      </p>
      <div className="card-actions">
        <button type="button" className="button" disabled={missing.length > 0 || start.isPending} onClick={() => start.mutate()}>
          Pornește corectarea
        </button>
      </div>
      {missing.length > 0 && <p className="hint">Lipsește: {missing.join(', ')}.</p>}
      {start.error && <ErrorMessage error={start.error} />}
    </>
  );
}

function useUpload(code: string, kind: TestFileKind) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.uploadTestFile(code, kind, file),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', code] }),
  });
}

// A file of the test: its name opens it, and a new file replaces it.
function TestFile({ code, kind, name, disabled }: { code: string; kind: TestFileKind; name: string | null; disabled: boolean }) {
  const api = useApi();
  const upload = useUpload(code, kind);
  const label = kind === 'test' ? 'Fișierul testului' : 'Fișierul baremului';
  return (
    <>
      {name !== null && (
        <p>
          <a href={testFileUrl(code, kind, undefined, api.base)} target="_blank" rel="noopener">
            {name}
          </a>
        </p>
      )}
      <FileDrop id={`try-${kind}`} name={label} disabled={disabled || upload.isPending} onPick={(file) => file && upload.mutate(file)} />
      {upload.isPending && <p className="hint">Se trimite…</p>}
      {upload.error && <ErrorMessage error={upload.error} />}
    </>
  );
}

// The barem: the robot's while it is made, then to download and read; her
// own file; or the choice of one of the two.
function Barem({ detail, robotBarem, disabled }: { detail: TestDetail; robotBarem: boolean; disabled: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { test } = detail;
  const generate = useMutation({
    mutationFn: () => api.generateBarem(test.code),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
  });
  if (test.barem.request === 'requested') {
    return (
      <p role="status">Robotul face baremul din test. Durează câteva minute; pagina se actualizează singură.</p>
    );
  }
  if (robotBarem) {
    return (
      <>
        <p role="status">
          <strong>Baremul făcut de robot este gata.</strong> Descarcă-l și citește-l. Corectarea pornește doar când apeși „Pornește corectarea”.
        </p>
        <p>
          <a className="button-quiet" href={testFileUrl(test.code, 'barem', undefined, api.base)} target="_blank" rel="noopener">
            Descarcă baremul
          </a>
        </p>
        <p>Dacă vrei, îl înlocuiești cu baremul tău:</p>
        <TestFile code={test.code} kind="barem" name={null} disabled={disabled} />
      </>
    );
  }
  if (test.files.barem !== null) {
    return (
      <>
        <p>Baremul tău. PDF sau Word.</p>
        <TestFile code={test.code} kind="barem" name={test.files.barem.name} disabled={disabled} />
      </>
    );
  }
  return (
    <>
      <p>Baremul după care se dă punctajul. PDF sau Word.</p>
      <TestFile code={test.code} kind="barem" name={null} disabled={disabled} />
      <p>Nu ai barem? Robotul îl face din test, iar tu îl citești înainte să pornești corectarea.</p>
      <button
        type="button"
        className="button-quiet"
        disabled={test.files.test === null || disabled || generate.isPending}
        onClick={() => generate.mutate()}
      >
        Fă baremul din test
      </button>
      {generate.error && <ErrorMessage error={generate.error} />}
    </>
  );
}

// The student's pages: each one sent as it is picked, in order, and each one
// can be taken out again before the grading.
function Pages({ tryApi }: { tryApi: TryApi }) {
  const queryClient = useQueryClient();
  const pages = useQuery({ queryKey: ['try', 'pages'], queryFn: () => tryApi.listPages() });
  const [problem, setProblem] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['try', 'pages'] });
  const add = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) await tryApi.addPage(file);
    },
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: (fileId: number) => tryApi.deletePage(fileId), onSettled: refresh });
  const list = pages.data ?? [];
  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    const refused = picked.map((file) => fileProblem(file, STUDENT_FILE_TYPES, STUDENT_WRONG_TYPE)).find((found) => found !== null) ?? null;
    setProblem(refused);
    if (refused === null && picked.length > 0) add.mutate(picked);
  };

  return (
    <>
      {list.length > 0 && (
        <ol className="try-pages" aria-label="Paginile lucrării">
          {list.map((page, index) => (
            <li key={page.id}>
              <span>
                Pagina {index + 1}: {page.name} · {formatFileSize(page.size)}
              </span>
              <button
                type="button"
                className="button-quiet button-small"
                aria-label={`Șterge pagina ${index + 1}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(page.id)}
              >
                Șterge
              </button>
            </li>
          ))}
        </ol>
      )}
      <label className={list.length >= MAX_STUDENT_FILES || add.isPending ? 'button-quiet is-disabled' : 'button-quiet'}>
        Adaugă pagini
        <input
          type="file"
          className="sr-only"
          accept={PAGE_ACCEPT}
          multiple
          disabled={list.length >= MAX_STUDENT_FILES || add.isPending}
          onChange={onPick}
        />
      </label>
      {add.isPending && <p className="hint">Se trimit paginile…</p>}
      {problem && (
        <p className="alert" role="alert">
          {problem}
        </p>
      )}
      {pages.error && <ErrorMessage error={pages.error} />}
      {add.error && <ErrorMessage error={add.error} />}
      {remove.error && <ErrorMessage error={remove.error} />}
    </>
  );
}
```

- [ ] **Step 11: Replace `src/try/TryHome.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import type { QuickTryInfo } from '../../shared/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import type { TryApi } from './api.ts';
import { phaseOf, refreshOf } from './phase.ts';
import { Prepare } from './Prepare.tsx';
import { Expired, isExpired } from './TryNotice.tsx';

// The try's page: the test read through the teacher app's client (the cache
// key of the test page and the review), and the part of the phase it is in.
export function TryHome({ info, tryApi }: { info: QuickTryInfo; tryApi: TryApi }) {
  const api = useApi();
  const detail = useQuery({
    queryKey: ['test', info.code],
    queryFn: () => api.getTest(info.code),
    refetchInterval: (query) => refreshOf(query.state.data),
  });
  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.data === undefined) return isExpired(detail.error) ? <Expired /> : <ErrorMessage error={detail.error} />;
  const phase = phaseOf(detail.data);
  return (
    <section className="try-home">
      <h1>Încercare rapidă</h1>
      <p className="test-sub">Corectezi o lucrare, fără cont. Linkul acestei pagini merge 7 zile.</p>
      {phase === 'prepare' && <Prepare detail={detail.data} tryApi={tryApi} />}
    </section>
  );
}
```

- [ ] **Step 12: Edit `src/try/try.css`**

Find this block:

```css
  text-align: center;
}
```

Replace it with:

```css
  text-align: center;
}

.try-pages {
  display: grid;
  gap: 0.5rem;
  margin: 0 0 1rem;
  padding-left: 1.25rem;
}

.try-pages li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

label.button-quiet.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}
```

- [ ] **Step 13: Run the tests to see them pass**

Run: `npx vitest run src/try/phase.test.ts src/try/Prepare.test.tsx src/try/TryApp.test.tsx`
Expected: PASS, `Tests  21 passed (21)`.

- [ ] **Step 14: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  152 passed | 1 skipped (153)`, `Tests  2275 passed | 3 skipped (2278)`.

- [ ] **Step 15: Commit**

```bash
git add src/try/phase.ts src/try/phase.test.ts src/try/Prepare.tsx src/try/Prepare.test.tsx src/try/TryApp.tsx src/try/TryNotice.tsx src/try/TryHome.tsx src/try/TryApp.test.tsx src/try/try.css
git commit -m "Send a Quick Try's files and pages, read the robot's barem, and start the grading"
```

Check: `git diff --stat refs/protoqtb/b4 HEAD -- . ':!docs'` prints nothing.

### Task 5: While the robot works: the grading, the barem's problem, the failure

**Files:**
- Create: `src/try/Working.tsx`, `src/try/Working.test.tsx`
- Modify: `src/try/Prepare.tsx`, `src/try/TryHome.tsx`, `src/try/try.css`
- Test: `src/try/Working.test.tsx`

**Interfaces:**
- Consumes: Task 4's `phaseOf`, `fileChangesLeft`, `TestFile`; the teacher app's `acceptExerciseList`, `MathText`.
- Produces: `Grading()`, `BaremProblem({ detail })`, `Failed({ detail })` in `src/try/Working.tsx`.

- [ ] **Step 1: Create `src/try/Working.test.tsx`**

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PDF_TYPE } from '../../shared/files.ts';
import { createFakeApi } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, TRY_CODE, tryTest } from '../test/fakeTryApi.tsx';

const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };

function setup(...args: Parameters<typeof tryTest>) {
  const api = createFakeApi({ classes: [], students: {}, tests: [tryTest(...args)] });
  renderTry('/', api, createFakeTryApi());
  return api;
}

describe('a try while the robot works', () => {
  it('says the paper is being graded, with no start button', async () => {
    setup({ status: 'evaluating', files }, { status: 'submitted' });
    expect(await screen.findByRole('heading', { name: 'Lucrarea se corectează' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pornește corectarea' })).not.toBeInTheDocument();
  });

  it('lets her grade with a barem whose points do not add up, as the app does', async () => {
    const api = setup(
      { status: 'evaluating', files, exerciseList: { status: 'problem', message: 'Punctajele dau 9, nu 10.' } },
      { status: 'submitted' },
    );
    expect(await screen.findByText('Baremul are o problemă.')).toBeInTheDocument();
    expect(screen.getByText('Punctajele dau 9, nu 10.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Folosește oricum' }));
    expect(api.acceptExerciseList).toHaveBeenCalledWith(TRY_CODE);
  });

  it('takes another barem when the barem has a problem', async () => {
    const api = setup({ status: 'evaluating', files, exerciseList: { status: 'problem', message: 'Lipsește ex. 3.' } }, { status: 'submitted' });
    const file = new File(['%PDF-1.7'], 'barem2.pdf', { type: PDF_TYPE });
    await userEvent.upload(await screen.findByLabelText(/Fișierul baremului/), file);
    await waitFor(() => expect(api.uploadTestFile).toHaveBeenCalledWith(TRY_CODE, 'barem', file));
  });
});

describe('a try that failed', () => {
  it('says the robot could not make the barem, and gives no retry', async () => {
    setup({ files: { test: files.test, barem: null }, barem: { request: 'failed', unchecked: false } });
    expect(await screen.findByRole('heading', { name: 'Încercarea nu a reușit' })).toBeInTheDocument();
    expect(screen.getByText('Robotul nu a putut face baremul din test.')).toBeInTheDocument();
    expect(screen.getByText(/nu se numără în limita ta de azi/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fă o încercare nouă' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: /Încearcă din nou|Reîncearcă/ })).not.toBeInTheDocument();
  });

  it('says the robot could not read the test and the barem', async () => {
    setup({ status: 'evaluating', files, exerciseList: { status: 'failed', message: 'Fișierul nu se deschide.' } }, { status: 'submitted' });
    expect(await screen.findByText('Robotul nu a putut citi testul și baremul.')).toBeInTheDocument();
    expect(screen.getByText('Fișierul nu se deschide.')).toBeInTheDocument();
  });

  it('says the robot could not grade the paper', async () => {
    setup({ status: 'evaluating', files }, { status: 'failed' });
    expect(await screen.findByText('Robotul nu a putut corecta lucrarea.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run src/try/Working.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  6 failed (6)`: the page shows nothing after the start (`Unable to find role="heading" and name "Lucrarea se corectează"`, the same for "Încercarea nu a reușit", and the text `Baremul are o problemă.`).

- [ ] **Step 3: Edit `src/try/Prepare.tsx`**

Find this block:

```tsx
// A file of the test: its name opens it, and a new file replaces it.
function TestFile({ code, kind, name, disabled }: { code: string; kind: TestFileKind; name: string | null; disabled: boolean }) {
  const api = useApi();
```

Replace it with:

```tsx
// A file of the test: its name opens it, and a new file replaces it.
export function TestFile({ code, kind, name, disabled }: { code: string; kind: TestFileKind; name: string | null; disabled: boolean }) {
  const api = useApi();
```

- [ ] **Step 4: Create `src/try/Working.tsx`**

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TestDetail } from '../../shared/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { MathText } from '../ui/MathText.tsx';
import { fileChangesLeft } from './phase.ts';
import { TestFile } from './Prepare.tsx';

// The paper went to grading (spec §3.3, state 3).
export function Grading() {
  return (
    <div className="try-state" role="status">
      <h2>Lucrarea se corectează</h2>
      <p>Robotul pornește în cam un minut, apoi face lista exercițiilor și corectează lucrarea. Durează câteva minute; pagina se actualizează singură.</p>
    </div>
  );
}

// The barem's points do not add up (the exercise list's "problem"): the same
// choice as in the app, "Folosește oricum" or another barem.
export function BaremProblem({ detail }: { detail: TestDetail }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { test } = detail;
  const accept = useMutation({
    mutationFn: () => api.acceptExerciseList(test.code),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['test', test.code] }),
  });
  return (
    <div className="warning">
      <p>
        <strong>Baremul are o problemă.</strong> {test.exerciseList.message && <MathText text={test.exerciseList.message} />}
      </p>
      <p>Corectează cu baremul așa cum este, sau încarcă alt barem.</p>
      <div className="card-actions">
        <button type="button" className="button" disabled={accept.isPending} onClick={() => accept.mutate()}>
          Folosește oricum
        </button>
      </div>
      {accept.error && <ErrorMessage error={accept.error} />}
      <TestFile code={test.code} kind="barem" name={null} disabled={fileChangesLeft(detail) === 0} />
    </div>
  );
}

// The robot could not do the try's work, after its own retries (state 5). The
// try gives its place of the day back; there is no retry.
export function Failed({ detail }: { detail: TestDetail }) {
  const { test } = detail;
  const what =
    test.barem.request === 'failed'
      ? 'Robotul nu a putut face baremul din test.'
      : test.exerciseList.status === 'failed'
        ? 'Robotul nu a putut citi testul și baremul.'
        : 'Robotul nu a putut corecta lucrarea.';
  const detailText = test.exerciseList.status === 'failed' ? test.exerciseList.message : null;
  return (
    <div className="try-state">
      <h2>Încercarea nu a reușit</h2>
      <p>
        <strong>{what}</strong> {detailText && <MathText text={detailText} />}
      </p>
      <p>Încercarea aceasta nu se numără în limita ta de azi. Poți face o încercare nouă de pe pagina principală.</p>
      <a className="button" href="/">
        Fă o încercare nouă
      </a>
    </div>
  );
}
```

- [ ] **Step 5: Edit `src/try/TryHome.tsx`**

Find this block:

```tsx
import { Expired, isExpired } from './TryNotice.tsx';

```

Replace it with:

```tsx
import { Expired, isExpired } from './TryNotice.tsx';
import { BaremProblem, Failed, Grading } from './Working.tsx';

```

- [ ] **Step 6: Edit `src/try/TryHome.tsx`**

Find this block:

```tsx
      {phase === 'prepare' && <Prepare detail={detail.data} tryApi={tryApi} />}
    </section>
```

Replace it with:

```tsx
      {phase === 'prepare' && <Prepare detail={detail.data} tryApi={tryApi} />}
      {phase === 'grading' && <Grading />}
      {phase === 'problem' && <BaremProblem detail={detail.data} />}
      {phase === 'failed' && <Failed detail={detail.data} />}
    </section>
```

- [ ] **Step 7: Edit `src/try/try.css`**

Find this block:

```css
  pointer-events: none;
}
```

Replace it with:

```css
  pointer-events: none;
}

.try-state {
  margin: 1.5rem 0;
}
```

- [ ] **Step 8: Run the test to see it pass**

Run: `npx vitest run src/try/Working.test.tsx`
Expected: PASS, `Tests  6 passed (6)`.

- [ ] **Step 9: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  153 passed | 1 skipped (154)`, `Tests  2281 passed | 3 skipped (2284)`.

- [ ] **Step 10: Commit**

```bash
git add src/try/Working.tsx src/try/Working.test.tsx src/try/Prepare.tsx src/try/TryHome.tsx src/try/try.css
git commit -m "Show a Quick Try's grading, its barem's problem and its failure"
```

Check: `git diff --stat refs/protoqtb/b5 HEAD -- . ':!docs'` prints nothing.

### Task 6: The graded paper: the three views, "Distribuie", the invitation

**Files:**
- Create: `src/try/Graded.tsx`, `src/try/Share.tsx`, `src/try/Graded.test.tsx`
- Modify: `src/try/TryApp.tsx`, `src/try/TryHome.tsx`, `src/try/try.css`, `AGENTS.md`, `src/AGENTS.md`
- Test: `src/try/Graded.test.tsx`

**Interfaces:**
- Consumes: Tasks 1-5; the teacher app's `ReviewPage` (through Task 3's route), `reviewPath`, `GradedResult`, `PageFiles`, `onTabKeyDown`, `countLabel`; Task 2's `StudentResult` with `fileUrl` and `TryApi.result()`; `expectNoGradingWords`, `LocationProbe`.
- Produces: `Graded({ detail, token, tryApi })` in `src/try/Graded.tsx`, `ShareButton({ token })` in `src/try/Share.tsx`; `TryHome` and `TryLoader` take `token`.

- [ ] **Step 1: Create `src/try/Graded.test.tsx`**

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudentResultView } from '../../shared/api.ts';
import { PDF_TYPE } from '../../shared/files.ts';
import { QUICK_TRY_STUDENT, QUICK_TRY_TITLE } from '../../shared/quickTry.ts';
import { createFakeApi, fakeEvaluation, fakeItem, fakeSubmission, reviewPointsOf } from '../test/fakeApi.ts';
import { createFakeTryApi, renderTry, TRY_CODE, TRY_SUBMISSION, TRY_TOKEN, tryTest } from '../test/fakeTryApi.tsx';
import { expectNoGradingWords } from '../test/gradingWords.ts';
import { LocationProbe } from '../test/renderAdmin.tsx';

const files = { test: { name: 'test.pdf', type: PDF_TYPE }, barem: { name: 'barem.pdf', type: PDF_TYPE } };
const photo = { id: 61, name: 'p1.jpg', contentType: 'image/jpeg', size: 1000, position: 1 };

const studentResult: StudentResultView = {
  testCode: TRY_CODE,
  testTitle: QUICK_TRY_TITLE,
  className: 'PROBA',
  studentName: QUICK_TRY_STUDENT,
  status: 'graded',
  files: [photo],
  evaluation: {
    maxTotal: 10,
    officePoints: 1,
    total: 7,
    grade: 7,
    summary: 'Ai lucrat bine.',
    strengths: [],
    recommendations: [],
    items: [{ exerciseId: 'I.1', label: 'Subiectul I, ex. 1', maxPoints: 4.5, points: 3, studentAnswer: '3/4', comment: 'Aproape.' }],
  },
};

// A graded try: I.1 waits for a check unless `checked`.
function setup(path = '/', checked = false) {
  const evaluation = fakeEvaluation([
    fakeItem({ id: 71, exerciseId: 'I.1', label: 'Subiectul I, ex. 1', points: 3, needsReview: !checked, reviewReason: 'Scrisul se citește greu.', page: 1 }),
  ]);
  const paper = fakeSubmission({ id: TRY_SUBMISSION, testCode: TRY_CODE, testTitle: QUICK_TRY_TITLE, studentName: QUICK_TRY_STUDENT, files: [photo], evaluation });
  const test = tryTest(
    { status: 'done', files },
    {
      status: 'graded',
      fileCount: 1,
      grade: evaluation.grade,
      total: evaluation.total,
      maxTotal: 10,
      flagCount: evaluation.flagCount,
      reviewPoints: reviewPointsOf(evaluation),
    },
  );
  const api = createFakeApi({ classes: [], students: {}, tests: [test], submissions: [paper] });
  const tryApi = createFakeTryApi({ result: structuredClone(studentResult) });
  renderTry(path, api, tryApi, <LocationProbe />);
  return { api, tryApi };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a graded try', () => {
  it('opens on the points to check, and the review of the app checks them', async () => {
    const { api } = setup();
    expect(await screen.findByRole('tab', { name: 'Verificare' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('link', { name: 'Verifică 1 punct' }));
    expect(await screen.findByRole('heading', { name: 'Verificare', level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Pagina 1/ })).toHaveAttribute('src', `/api/try/${TRY_TOKEN}/submissions/${TRY_SUBMISSION}/files/61`);
    await userEvent.click(await screen.findByRole('button', { name: 'Accept 3p' }));
    await waitFor(() => expect(api.correctItem).toHaveBeenCalledWith(TRY_SUBMISSION, 71, expect.objectContaining({ reviewed: true })));
    await userEvent.click(screen.getByRole('link', { name: 'Înapoi la test' }));
    expect(await screen.findByRole('heading', { name: 'Încercare rapidă', level: 1 })).toBeInTheDocument();
  });

  it("says when nothing is left to check", async () => {
    setup('/', true);
    expect(await screen.findByText(/Toate punctele sunt verificate/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Verifică/ })).not.toBeInTheDocument();
  });

  it("shows the teacher's result with its pages", async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('tab', { name: 'Rezultatul profesorului' }));
    expect(await screen.findByText('Subiectul I, ex. 1')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', `/api/try/${TRY_TOKEN}/submissions/${TRY_SUBMISSION}/files/61`);
    expect(api.getSubmission).toHaveBeenCalledWith(TRY_SUBMISSION);
  });

  it("opens the teacher's result from the review's link to the results", async () => {
    setup('/teste/PROBA-26T1#rezultate');
    expect(await screen.findByRole('tab', { name: 'Rezultatul profesorului' })).toHaveAttribute('aria-selected', 'true');
  });

  it("opens the teacher's result from the review's link to the paper", async () => {
    setup(`/teste/PROBA-26T1/elevi/${TRY_SUBMISSION}`);
    expect(await screen.findByRole('tab', { name: 'Rezultatul profesorului' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the page the student would see, with no word on how it was graded', async () => {
    const { tryApi } = setup();
    await userEvent.click(await screen.findByRole('tab', { name: 'Rezultatul elevului' }));
    const view = await screen.findByTestId('student-view');
    expect(within(view).getByRole('heading', { name: QUICK_TRY_STUDENT })).toBeInTheDocument();
    expect(tryApi.result).toHaveBeenCalled();
    expectNoGradingWords(view.textContent ?? '');
    await userEvent.click(within(view).getByRole('button', { name: 'Arată fișierele' }));
    expect(within(view).getByRole('img', { name: 'Pagina 1' })).toHaveAttribute('src', `/api/try/${TRY_TOKEN}/paper/61`);
  });

  it('moves between the views with the arrow keys', async () => {
    setup();
    const first = await screen.findByRole('tab', { name: 'Verificare' });
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Rezultatul profesorului' })).toHaveAttribute('aria-selected', 'true');
  });

  it('invites her to a free class test with an account', async () => {
    setup();
    const invite = await screen.findByRole('link', { name: 'Creează un cont: corectezi gratuit un test pentru toată clasa.' });
    expect(invite).toHaveAttribute('href', '/teacher/#cont-nou');
    expect(screen.getByText(/Îți place\?/)).toBeInTheDocument();
  });
});

describe('Distribuie', () => {
  it("copies the try's link when the browser has no share sheet", async () => {
    setup();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    await userEvent.click(await screen.findByRole('button', { name: 'Distribuie' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/try/${TRY_TOKEN}`);
    expect(await screen.findByText('Linkul a fost copiat.')).toBeInTheDocument();
  });

  it("uses the browser's share sheet where there is one", async () => {
    setup();
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, share });
    await userEvent.click(await screen.findByRole('button', { name: 'Distribuie' }));
    expect(share).toHaveBeenCalledWith({ title: 'MQGrader · Încercare rapidă', url: `${window.location.origin}/try/${TRY_TOKEN}` });
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run src/try/Graded.test.tsx`
Expected: FAIL. `Test Files  1 failed (1)`, `Tests  10 failed (10)`: the graded paper has no views yet (`Unable to find role="tab" and name "Verificare"`), no "Distribuie" button and no invitation.

- [ ] **Step 3: Create `src/try/Graded.tsx`**

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { SubmissionDetail, TestDetail } from '../../shared/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import { reviewPath } from '../admin/reviewPage/points.ts';
import { GradedResult } from '../admin/submissionPage/GradedResult.tsx';
import { PageFiles } from '../admin/submissionPage/PageFiles.tsx';
import { StudentResult } from '../upload/StudentResult.tsx';
import { countLabel } from '../ui/format.ts';
import { onTabKeyDown } from '../ui/tabKeys.ts';
import { pageFileUrl, type TryApi } from './api.ts';
import { paperOf } from './phase.ts';

type View = 'verificare' | 'profesor' | 'elev';
const VIEWS: { id: View; label: string }[] = [
  { id: 'verificare', label: 'Verificare' },
  { id: 'profesor', label: 'Rezultatul profesorului' },
  { id: 'elev', label: 'Rezultatul elevului' },
];
const VIEW_IDS = VIEWS.map((view) => view.id);

// The review's own links back (#verificare, #rezultate) open the view they name.
function viewOfHash(hash: string): View {
  return hash === '#rezultate' ? 'profesor' : 'verificare';
}

// The graded paper (spec §3.3, state 4), in the app's three views: the points
// to check (the app's own review), the teacher's result with its corrections,
// and the page the student would see.
export function Graded({ detail, token, tryApi }: { detail: TestDetail; token: string; tryApi: TryApi }) {
  const [view, setView] = useState<View>(viewOfHash(useLocation().hash));
  const paper = paperOf(detail)!;
  return (
    <>
      <div className="class-tabs" role="tablist" aria-label="Lucrarea corectată" onKeyDown={(event) => onTabKeyDown(event, VIEW_IDS, view, setView, (id) => `try-tab-${id}`)}>
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`try-tab-${id}`}
            aria-selected={view === id}
            tabIndex={view === id ? 0 : -1}
            aria-controls={`try-panel-${id}`}
            className="class-tab"
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`try-panel-${view}`} aria-labelledby={`try-tab-${view}`}>
        {view === 'verificare' && <Checking code={detail.test.code} flagCount={paper.flagCount} />}
        {view === 'profesor' && <TeacherResult code={detail.test.code} submissionId={paper.submissionId!} />}
        {view === 'elev' && <StudentView token={token} tryApi={tryApi} />}
      </div>
    </>
  );
}

// The review opens on its first point (the app's review picks it).
function Checking({ code, flagCount }: { code: string; flagCount: number }) {
  if (flagCount === 0) {
    return <p className="review-done">Toate punctele sunt verificate. Rezultatul profesorului și cel al elevului sunt gata.</p>;
  }
  return (
    <div className="try-state">
      <p>
        Robotul nu a fost sigur de {countLabel(flagCount, 'punct', 'puncte')}. Le verifici una câte una, cu pagina lucrării alături, și schimbi punctajul
        dacă e nevoie.
      </p>
      <Link className="button" to={reviewPath(code)}>
        Verifică {countLabel(flagCount, 'punct', 'puncte')}
      </Link>
    </div>
  );
}

function TeacherResult({ code, submissionId }: { code: string; submissionId: number }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const paper = useQuery({ queryKey: ['submission', submissionId], queryFn: () => api.getSubmission(submissionId) });
  const saved = async (submission: SubmissionDetail) => {
    queryClient.setQueryData(['submission', submissionId], submission);
    await queryClient.invalidateQueries({ queryKey: ['test', code] });
  };
  if (paper.isPending) return <p>Se încarcă…</p>;
  if (paper.data === undefined) return <ErrorMessage error={paper.error} />;
  const submission = paper.data;
  if (!submission.evaluation) return null;
  return (
    <div className="try-result">
      <GradedResult submissionId={submissionId} evaluation={submission.evaluation} onSaved={saved} />
      <h2>Paginile lucrării</h2>
      <PageFiles submissionId={submissionId} files={submission.files} />
    </div>
  );
}

// Read again each time it opens: a correction of the teacher shows here too.
function StudentView({ token, tryApi }: { token: string; tryApi: TryApi }) {
  const result = useQuery({ queryKey: ['try', 'result'], queryFn: () => tryApi.result(), staleTime: 0, refetchOnMount: 'always' });
  if (result.isPending) return <p>Se încarcă…</p>;
  if (result.data === undefined) return <ErrorMessage error={result.error} />;
  return (
    <div className="try-student" data-testid="student-view">
      <p className="hint">Așa vede elevul rezultatul, pe linkul lui.</p>
      <StudentResult result={result.data} fileUrl={(fileId) => pageFileUrl(token, fileId)} />
    </div>
  );
}
```

- [ ] **Step 4: Create `src/try/Share.tsx`**

```tsx
import { useState } from 'react';

// "Distribuie" (spec §3.4): the try's own link, the only key, through the
// browser's share sheet where there is one, else copied.
export function ShareButton({ token }: { token: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const url = `${window.location.origin}/try/${token}`;
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'MQGrader · Încercare rapidă', url });
        return;
      } catch (err) {
        // She closed the share sheet: nothing to do.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="try-share">
      <button type="button" className="button-quiet" onClick={() => void share()}>
        Distribuie
      </button>
      {copied === true && <span role="status">Linkul a fost copiat.</span>}
      {copied === false && (
        <span role="status">
          Copiază linkul: <span className="try-share-url">{url}</span>
        </span>
      )}
      <p className="hint">Oricine are linkul vede încercarea și poate face tot ce faci tu.</p>
    </div>
  );
}
```

- [ ] **Step 5: Replace `src/try/TryHome.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import type { QuickTryInfo } from '../../shared/api.ts';
import { useApi } from '../admin/ApiContext.tsx';
import { ErrorMessage } from '../admin/ErrorMessage.tsx';
import type { TryApi } from './api.ts';
import { Graded } from './Graded.tsx';
import { phaseOf, refreshOf } from './phase.ts';
import { Prepare } from './Prepare.tsx';
import { ShareButton } from './Share.tsx';
import { Expired, isExpired } from './TryNotice.tsx';
import { BaremProblem, Failed, Grading } from './Working.tsx';

// The try's page: the test read through the teacher app's client (the cache
// key of the test page and the review), and the part of the phase it is in.
export function TryHome({ info, token, tryApi }: { info: QuickTryInfo; token: string; tryApi: TryApi }) {
  const api = useApi();
  const detail = useQuery({
    queryKey: ['test', info.code],
    queryFn: () => api.getTest(info.code),
    refetchInterval: (query) => refreshOf(query.state.data),
  });
  if (detail.isPending) return <p>Se încarcă…</p>;
  if (detail.data === undefined) return isExpired(detail.error) ? <Expired /> : <ErrorMessage error={detail.error} />;
  const phase = phaseOf(detail.data);
  return (
    <section className="try-home">
      <div className="try-head">
        <div>
          <h1>Încercare rapidă</h1>
          <p className="test-sub">Corectezi o lucrare, fără cont. Linkul acestei pagini merge 7 zile.</p>
        </div>
        <ShareButton token={token} />
      </div>
      {phase === 'prepare' && <Prepare detail={detail.data} tryApi={tryApi} />}
      {phase === 'grading' && <Grading />}
      {phase === 'problem' && <BaremProblem detail={detail.data} />}
      {phase === 'failed' && <Failed detail={detail.data} />}
      {phase === 'graded' && (
        <>
          <Graded detail={detail.data} token={token} tryApi={tryApi} />
          <p className="try-invite">
            Îți place? <a href="/teacher/#cont-nou">Creează un cont: corectezi gratuit un test pentru toată clasa.</a>
          </p>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Edit `src/try/TryApp.tsx`**

Find this block:

```tsx
// own review at /teste/<code>/verificare (its links to /teste/<code> come back
// here). `token` is null for an address that is not a try's link.
export function TryRoutes({ token, api, tryApi }: { token: string | null; api: AdminApi; tryApi: TryApi }) {
```

Replace it with:

```tsx
// own review at /teste/<code>/verificare (its links to /teste/<code> come back
// here, and its link to the paper opens the teacher's result). `token` is null
// for an address that is not a try's link.
export function TryRoutes({ token, api, tryApi }: { token: string | null; api: AdminApi; tryApi: TryApi }) {
```

- [ ] **Step 7: Edit `src/try/TryApp.tsx`**

Find this block:

```tsx
      <main className="try-page">
        <ErrorBoundary>{token === null ? <BadLink /> : <TryLoader tryApi={tryApi} />}</ErrorBoundary>
      </main>
```

Replace it with:

```tsx
      <main className="try-page">
        <ErrorBoundary>{token === null ? <BadLink /> : <TryLoader token={token} tryApi={tryApi} />}</ErrorBoundary>
      </main>
```

- [ ] **Step 8: Edit `src/try/TryApp.tsx`**

Find this block:

```tsx

function TryLoader({ tryApi }: { tryApi: TryApi }) {
  const info = useQuery({ queryKey: ['try'], queryFn: () => tryApi.info() });
```

Replace it with:

```tsx

function TryLoader({ token, tryApi }: { token: string; tryApi: TryApi }) {
  const info = useQuery({ queryKey: ['try'], queryFn: () => tryApi.info() });
```

- [ ] **Step 9: Edit `src/try/TryApp.tsx`**

Find this block:

```tsx
  if (info.data.expired) return <Expired />;
  const home = <TryHome info={info.data} tryApi={tryApi} />;
  return (
```

Replace it with:

```tsx
  if (info.data.expired) return <Expired />;
  const home = <TryHome info={info.data} token={token} tryApi={tryApi} />;
  return (
```

- [ ] **Step 10: Edit `src/try/TryApp.tsx`**

Find this block:

```tsx
      <Route path="/teste/:code/verificare" element={<ReviewPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
```

Replace it with:

```tsx
      <Route path="/teste/:code/verificare" element={<ReviewPage />} />
      <Route path="/teste/:code/elevi/:id" element={<Navigate replace to={{ pathname: '/', hash: '#rezultate' }} />} />
      <Route path="*" element={<Navigate replace to="/" />} />
```

- [ ] **Step 11: Edit `src/try/try.css`**

Find this block:

```css
  margin: 1.5rem 0;
}
```

Replace it with:

```css
  margin: 1.5rem 0;
}

.try-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.try-share {
  display: grid;
  justify-items: end;
  gap: 0.25rem;
  max-width: 22rem;
  text-align: right;
}

.try-share-url {
  word-break: break-all;
}

.try-invite {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--rule);
  font-weight: 600;
}
```

- [ ] **Step 12: Edit `AGENTS.md`**

Find this block:

```markdown

- `index.html` (landing page), `teacher/index.html` (teacher app, `/teacher/`), `u/index.html` (student app, `/u/<token>`).
- `src/`: the two React apps (`admin/`, `upload/`), the landing page's stylesheet and theme button (`landing/`, no React), shared UI (`ui/`), test helpers (`test/`).
```

Replace it with:

```markdown

- `index.html` (landing page), `teacher/index.html` (teacher app, `/teacher/`), `u/index.html` (student app, `/u/<token>`), `try/index.html` (a Quick Try's page, `/try/<token>`).
- `src/`: the two React apps (`admin/`, `upload/`), the landing page's stylesheet and theme button (`landing/`, no React), shared UI (`ui/`), test helpers (`test/`).
```

- [ ] **Step 13: Edit `AGENTS.md`**

Find this block:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`, migration 0026): one free grading without an account, at `/api/try`. Each try is a hidden guest teacher (`teachers.quick_try`, disabled, never an account) with its own class, student, test (`tests.quick_try`) and paper; its link `/api/try/<token>` serves the teacher API's own routes for that guest teacher behind an allow-list (`ALLOWED` in `server/routes/quickTry.ts`). A Quick Try test never gets a print job or a class analysis. The limits (`QUICK_TRY_IP_LIMIT` per IP and `QUICK_TRY_DAILY_LIMIT` in total per Bucharest day, `shared/quickTry.ts`) are checked in the SQL of the try's first INSERT (`createQuickTry`); a failed try gives its IP place back, not its daily place. An administrator skips Turnstile and the limits and is not counted. One try makes bounded robot work, checked in the writes' SQL: one barem generation, only with no barem (`requestBarem`), and at most `QUICK_TRY_FILE_CHANGES` changes of its test and barem files (`saveTestFile`).
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

Replace it with:

```markdown
- Every `/api/admin` and `/api/u` request first runs the `promoteDue` middleware. A router added under them keeps it.
- Quick Try (`docs/superpowers/specs/2026-11-09-quick-try-design.md`, migration 0026): one free grading without an account, at `/api/try`. Each try is a hidden guest teacher (`teachers.quick_try`, disabled, never an account) with its own class, student, test (`tests.quick_try`) and paper; its link `/api/try/<token>` serves the teacher API's own routes for that guest teacher behind an allow-list (`ALLOWED` in `server/routes/quickTry.ts`). A Quick Try test never gets a print job or a class analysis. The limits (`QUICK_TRY_IP_LIMIT` per IP and `QUICK_TRY_DAILY_LIMIT` in total per Bucharest day, `shared/quickTry.ts`) are checked in the SQL of the try's first INSERT (`createQuickTry`); a failed try gives its IP place back, not its daily place. An administrator skips Turnstile and the limits and is not counted. One try makes bounded robot work, checked in the writes' SQL: one barem generation, only with no barem (`requestBarem`), and at most `QUICK_TRY_FILE_CHANGES` changes of its test and barem files (`saveTestFile`). The try's page is `/try/<token>` (`src/try/`), private like a student link: `_headers` gives it noindex and `robots.txt` closes `/try/` in every group.
- R2 is private: every file goes through the API with an ownership check. R2 keys come from rows, never from listing R2.
```

- [ ] **Step 14: Edit `src/AGENTS.md`**

Find this block:

```markdown
- Light is the default theme on every page: `public/theme.js` and `currentTheme()` follow only a saved choice, never the system setting.
- `upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone).
- `test/`: test setup, the fake APIs (`fakeApi.ts`, `fakeUploadApi.ts`; `createFakeApi({ me, accounts })` sets the logged-in teacher, an administrator by default), `renderAdmin()`, `expectNoGradingWords()`.
```

Replace it with:

```markdown
- Light is the default theme on every page: `public/theme.js` and `currentTheme()` follow only a saved choice, never the system setting.
- `upload/`: the student app. `api.ts` (the only code that calls `/api/u`, with XMLHttpRequest for upload progress), `session.ts` (the phone's secret in localStorage), `shrink.ts` (photos made smaller on the phone). `StudentResult.tsx` takes `fileUrl`, so a Quick Try's page shows the same student result.
- `try/`: a Quick Try's page (`/try/<token>`, spec `docs/superpowers/specs/2026-11-09-quick-try-design.md` §3.3). It reuses the teacher app through `createApiClient({ base: '/api/try/<token>' })`: the calls and the file links (`AdminApi.base`) go to the try's link, and only the calls of the server's allow-list are used (`TRY_ADMIN_CALLS` in `test/fakeTryApi.tsx`, whose `tryAdminApi()` makes a page test fail on any other call). `api.ts` is the try's own client (`info`, the student's pages, `start`, the student `result`). `phase.ts` says where the try stands from its test (`prepare`, `grading`, `problem`, `failed` as the server's give-back, `graded`) and reads it again every 10 s while the robot works. `Prepare.tsx` holds the test, the barem (her own, or the robot's to download, then "Pornește corectarea" with its `filesVersion`), the student's pages and the file changes left; `Working.tsx` the grading, the barem's problem ("Folosește oricum" or another barem) and the failure (no retry); `Graded.tsx` the three views: "Verificare" (the teacher app's own `ReviewPage`, at `/teste/<code>/verificare` inside the try's router; its links to `/teste/<code>` come back to the try, `#rezultate` opens the teacher's result), "Rezultatul profesorului" (`GradedResult` and `PageFiles`) and "Rezultatul elevului" (`StudentResult`, checked with `expectNoGradingWords()`). "Distribuie" (`Share.tsx`) shares or copies the try's link. The page never shows the test's upload link or a QR code.
- `test/`: test setup, the fake APIs (`fakeApi.ts`, `fakeUploadApi.ts`; `createFakeApi({ me, accounts })` sets the logged-in teacher, an administrator by default), `renderAdmin()`, `expectNoGradingWords()`.
```

- [ ] **Step 15: Run the test to see it pass**

Run: `npx vitest run src/try`
Expected: PASS, `Tests  44 passed (44)`.

- [ ] **Step 16: Typecheck and run all tests**

Run: `npm run typecheck`, then `npm test`
Expected: no type errors; `Test Files  154 passed | 1 skipped (155)`, `Tests  2291 passed | 3 skipped (2294)`.

- [ ] **Step 17: Commit**

```bash
git add src/try/Graded.tsx src/try/Share.tsx src/try/Graded.test.tsx src/try/TryApp.tsx src/try/TryHome.tsx src/try/try.css AGENTS.md src/AGENTS.md
git commit -m "Show a graded Quick Try in the app's three views, with Distribuie and the invitation"
```

Check: `git diff --stat refs/protoqtb/b6 HEAD -- . ':!docs'` prints nothing.

### Task 7: Check in the browser, push

Runs in the main session. The push waits for the user's yes.

- [ ] **Step 1: Run everything once more, also in UTC**

Run: `npm run build`, `npm test`, then in Git Bash `TZ=UTC npm test` (PowerShell: `$env:TZ='UTC'; npm test; Remove-Item Env:TZ`)
Expected: no type errors; `Test Files  154 passed | 1 skipped (155)`, `Tests  2291 passed | 3 skipped (2294)`. both times.

- [ ] **Step 2: Look at the page in the browser**

Start the local servers (`npm run db:local` once, then the `api` and `web` preview servers of `.claude/launch.json`). As the local administrator (`DEV_TEACHER_EMAIL`, who skips Turnstile), make a try in the browser's console on http://localhost:5173: `await (await fetch('/api/try', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()`, and open `/try/<token>`.
Expected: the page "Încercare rapidă" with its three parts; a test PDF, a barem PDF and one photo are taken; "Pornește corectarea" turns on and starts the grading ("Lucrarea se corectează"). Look at it at 375 px wide too: no sideways scroll. Fix what is broken as its own commit, with a test where the fault is in code, and say so in the PR.

- [ ] **Step 3: Ask the user, then push and open the pull request**

Ask the user first. Then: `git push -u origin feature/quick-try-page` and open a pull request to `main` titled "Quick Try, part B: the try's page". The body says: no migration; the page is not linked from anywhere until part C (the landing page's button and form); the hosting files (`_redirects`, `_headers`, `robots.txt`) came into this part so the page is never live without noindex.
